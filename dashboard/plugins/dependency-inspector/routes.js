/**
 * Dependency Inspector Plugin -- Server-side API Routes
 * Scans configured repos for npm/NuGet dependency health.
 * Reads package.json, package-lock.json, .csproj files from disk.
 * Queries npm registry for latest versions and license info.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const configPath = path.join(__dirname, 'config.json');

// ── In-memory scan cache ────────────────────────────────────────────────────

var scanCache = {};  // { repoName: { timestamp, data } }
var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Config helpers ──────────────────────────────────────────────────────────

function getPluginConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (_) { return { npmRegistryUrl: '', licenseWhitelist: 'MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD' }; }
}

function savePluginConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
}

function getRegistryUrl() {
  var cfg = getPluginConfig();
  return (cfg.npmRegistryUrl || '').trim() || 'https://registry.npmjs.org';
}

function getAllowedLicenses() {
  var cfg = getPluginConfig();
  var raw = cfg.licenseWhitelist || 'MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD';
  return raw.split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

function httpsGet(urlStr, timeout) {
  return new Promise(function(resolve, reject) {
    var url = new URL(urlStr);
    var opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'devops-pilot-dependency-inspector/1.0' },
      timeout: timeout || 10000
    };
    var req = https.request(opts, function(resp) {
      var data = '';
      resp.on('data', function(chunk) { data += chunk; });
      resp.on('end', function() {
        try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: resp.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

// ── Semver helpers ──────────────────────────────────────────────────────────

function parseSemver(v) {
  if (!v) return null;
  var cleaned = String(v).replace(/^[^0-9]*/, '');
  var m = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: parseInt(m[1]), minor: parseInt(m[2]), patch: parseInt(m[3]) };
}

function compareSemver(a, b) {
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function getUpdateType(installed, latest) {
  var a = parseSemver(installed);
  var b = parseSemver(latest);
  if (!a || !b) return 'unknown';
  if (compareSemver(a, b) >= 0) return 'up-to-date';
  if (b.major > a.major) return 'major';
  if (b.minor > a.minor) return 'minor';
  if (b.patch > a.patch) return 'patch';
  return 'up-to-date';
}

// ── File reading helpers ────────────────────────────────────────────────────

function readJsonFile(filePath) {
  try {
    var content = fs.readFileSync(filePath, 'utf8');
    // Strip BOM if present
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    return JSON.parse(content);
  } catch (_) {
    return null;
  }
}

function fileExists(filePath) {
  try { fs.accessSync(filePath); return true; }
  catch (_) { return false; }
}

function readPackageJson(repoPath) {
  return readJsonFile(path.join(repoPath, 'package.json'));
}

function readPackageLock(repoPath) {
  // Try package-lock.json first
  var lockPath = path.join(repoPath, 'package-lock.json');
  if (fileExists(lockPath)) {
    return readJsonFile(lockPath);
  }
  return null;
}

function getInstalledVersion(lockData, pkgName) {
  if (!lockData) return null;
  // lockfileVersion 2/3 format
  if (lockData.packages) {
    var key = 'node_modules/' + pkgName;
    if (lockData.packages[key]) return lockData.packages[key].version;
  }
  // lockfileVersion 1 format
  if (lockData.dependencies && lockData.dependencies[pkgName]) {
    return lockData.dependencies[pkgName].version;
  }
  return null;
}

function getLocalPackageLicense(repoPath, pkgName) {
  var pkgJson = readJsonFile(path.join(repoPath, 'node_modules', pkgName, 'package.json'));
  if (!pkgJson) return null;
  if (typeof pkgJson.license === 'string') return pkgJson.license;
  if (pkgJson.license && pkgJson.license.type) return pkgJson.license.type;
  if (Array.isArray(pkgJson.licenses) && pkgJson.licenses.length > 0) {
    return pkgJson.licenses.map(function(l) { return l.type || l; }).join(', ');
  }
  return null;
}

// ── NuGet / .csproj parsing ─────────────────────────────────────────────────

function findCsprojFiles(repoPath) {
  var results = [];
  try {
    var entries = fs.readdirSync(repoPath, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'bin' || entry.name === 'obj') continue;
      var fullPath = path.join(repoPath, entry.name);
      if (entry.isFile() && entry.name.endsWith('.csproj')) {
        results.push(fullPath);
      } else if (entry.isDirectory()) {
        results = results.concat(findCsprojFiles(fullPath));
      }
    }
  } catch (_) {}
  return results;
}

function parseCsprojPackages(filePath) {
  var packages = [];
  try {
    var content = fs.readFileSync(filePath, 'utf8');
    var regex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/gi;
    var match;
    while ((match = regex.exec(content)) !== null) {
      packages.push({ name: match[1], version: match[2], source: 'nuget' });
    }
  } catch (_) {}
  return packages;
}

// ── npm registry queries ────────────────────────────────────────────────────

var registryCache = {}; // { pkgName: { timestamp, data } }
var REG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function queryRegistry(pkgName) {
  var now = Date.now();
  if (registryCache[pkgName] && (now - registryCache[pkgName].timestamp) < REG_CACHE_TTL) {
    return registryCache[pkgName].data;
  }
  var baseUrl = getRegistryUrl();
  try {
    // Use abbreviated metadata endpoint for speed
    var result = await httpsGet(baseUrl + '/' + encodeURIComponent(pkgName).replace('%40', '@'));
    if (result.status === 200 && result.data) {
      var entry = {
        latest: null,
        license: null,
        deprecated: false,
        description: ''
      };
      if (result.data['dist-tags'] && result.data['dist-tags'].latest) {
        entry.latest = result.data['dist-tags'].latest;
      }
      if (result.data.license) {
        entry.license = typeof result.data.license === 'string' ? result.data.license : (result.data.license.type || null);
      }
      entry.description = result.data.description || '';
      // Check if latest version is deprecated
      if (entry.latest && result.data.versions && result.data.versions[entry.latest]) {
        var latestMeta = result.data.versions[entry.latest];
        if (latestMeta.deprecated) entry.deprecated = true;
        if (!entry.license && latestMeta.license) {
          entry.license = typeof latestMeta.license === 'string' ? latestMeta.license : (latestMeta.license.type || null);
        }
      }
      registryCache[pkgName] = { timestamp: now, data: entry };
      return entry;
    }
  } catch (_) {}
  return { latest: null, license: null, deprecated: false, description: '' };
}

// ── NuGet registry queries ──────────────────────────────────────────────────

var nugetCache = {};
var NUGET_CACHE_TTL = 10 * 60 * 1000;

async function queryNuget(pkgName) {
  var now = Date.now();
  if (nugetCache[pkgName] && (now - nugetCache[pkgName].timestamp) < NUGET_CACHE_TTL) {
    return nugetCache[pkgName].data;
  }
  try {
    var result = await httpsGet(
      'https://api.nuget.org/v3-flatcontainer/' + pkgName.toLowerCase() + '/index.json'
    );
    if (result.status === 200 && result.data && result.data.versions) {
      var versions = result.data.versions;
      // Filter out prerelease
      var stable = versions.filter(function(v) { return !v.includes('-'); });
      var latest = stable.length > 0 ? stable[stable.length - 1] : versions[versions.length - 1];
      var entry = { latest: latest, license: null };
      nugetCache[pkgName] = { timestamp: now, data: entry };
      return entry;
    }
  } catch (_) {}
  return { latest: null, license: null };
}

// ── Vulnerability checking via npm audit bulk advisory API ──────────────────

async function checkVulnerabilities(packages) {
  // Build the advisory request body: { "package-name": ["version"] }
  var body = {};
  for (var i = 0; i < packages.length; i++) {
    var pkg = packages[i];
    if (pkg.source === 'nuget') continue; // Only check npm packages
    if (pkg.installedVersion) {
      body[pkg.name] = [pkg.installedVersion];
    }
  }
  if (Object.keys(body).length === 0) return {};

  try {
    var result = await new Promise(function(resolve, reject) {
      var postData = JSON.stringify(body);
      var opts = {
        hostname: 'registry.npmjs.org',
        path: '/-/npm/v1/security/advisories/bulk',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'devops-pilot-dependency-inspector/1.0'
        },
        timeout: 15000
      };
      var req = https.request(opts, function(resp) {
        var data = '';
        resp.on('data', function(chunk) { data += chunk; });
        resp.on('end', function() {
          try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
          catch (_) { resolve({ status: resp.statusCode, data: {} }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
      req.write(postData);
      req.end();
    });

    if (result.status === 200 && typeof result.data === 'object') {
      return result.data;
    }
  } catch (_) {}
  return {};
}

// ── Core scanning logic ─────────────────────────────────────────────────────

async function scanRepo(repoName, repoPath) {
  var result = {
    repoName: repoName,
    repoPath: repoPath,
    scannedAt: new Date().toISOString(),
    hasPackageJson: false,
    hasCsproj: false,
    packages: [],
    vulnerabilities: [],
    health: 100,
    error: null
  };

  if (!fileExists(repoPath)) {
    result.error = 'Repository path not found: ' + repoPath;
    result.health = 0;
    return result;
  }

  var allPackages = [];

  // ── npm packages ──────────────────────────────────────────────────────
  var pkgJson = readPackageJson(repoPath);
  if (pkgJson) {
    result.hasPackageJson = true;
    var lockData = readPackageLock(repoPath);
    var deps = pkgJson.dependencies || {};
    var devDeps = pkgJson.devDependencies || {};

    var depNames = Object.keys(deps);
    var devDepNames = Object.keys(devDeps);

    // Process all npm deps
    var allNpmDeps = [];
    for (var i = 0; i < depNames.length; i++) {
      allNpmDeps.push({ name: depNames[i], specifier: deps[depNames[i]], isDev: false });
    }
    for (var j = 0; j < devDepNames.length; j++) {
      allNpmDeps.push({ name: devDepNames[j], specifier: devDeps[devDepNames[j]], isDev: true });
    }

    // Query registry in batches of 10 to avoid overwhelming
    var BATCH_SIZE = 10;
    for (var b = 0; b < allNpmDeps.length; b += BATCH_SIZE) {
      var batch = allNpmDeps.slice(b, b + BATCH_SIZE);
      var promises = batch.map(function(dep) {
        return queryRegistry(dep.name).then(function(regInfo) {
          var installedVersion = getInstalledVersion(lockData, dep.name);
          if (!installedVersion) {
            // Try to extract version from specifier
            var sv = parseSemver(dep.specifier);
            installedVersion = sv ? sv.major + '.' + sv.minor + '.' + sv.patch : dep.specifier;
          }
          var localLicense = getLocalPackageLicense(repoPath, dep.name);
          var license = localLicense || regInfo.license || 'Unknown';
          var updateType = getUpdateType(installedVersion, regInfo.latest);

          return {
            name: dep.name,
            specifier: dep.specifier,
            installedVersion: installedVersion,
            latestVersion: regInfo.latest || 'unknown',
            license: license,
            isDev: dep.isDev,
            source: 'npm',
            updateType: updateType,
            deprecated: regInfo.deprecated
          };
        }).catch(function() {
          return {
            name: dep.name,
            specifier: dep.specifier,
            installedVersion: dep.specifier,
            latestVersion: 'unknown',
            license: 'Unknown',
            isDev: dep.isDev,
            source: 'npm',
            updateType: 'unknown',
            deprecated: false
          };
        });
      });
      var batchResults = await Promise.all(promises);
      allPackages = allPackages.concat(batchResults);
    }

    // Check vulnerabilities
    var vulnData = await checkVulnerabilities(allPackages);
    // vulnData is keyed by advisory ID, each has module_name, severity, title, url, etc.
    if (vulnData && typeof vulnData === 'object') {
      var advisoryKeys = Object.keys(vulnData);
      for (var k = 0; k < advisoryKeys.length; k++) {
        var adv = vulnData[advisoryKeys[k]];
        result.vulnerabilities.push({
          id: adv.id || advisoryKeys[k],
          module: adv.module_name || 'unknown',
          severity: adv.severity || 'unknown',
          title: adv.title || 'Unknown vulnerability',
          url: adv.url || '',
          range: adv.vulnerable_versions || '*',
          recommendation: adv.patched_versions || 'No fix available'
        });
      }
    }
  }

  // ── NuGet packages ────────────────────────────────────────────────────
  var csprojFiles = findCsprojFiles(repoPath);
  if (csprojFiles.length > 0) {
    result.hasCsproj = true;
    for (var c = 0; c < csprojFiles.length; c++) {
      var nugetPkgs = parseCsprojPackages(csprojFiles[c]);
      for (var n = 0; n < nugetPkgs.length; n++) {
        var npkg = nugetPkgs[n];
        try {
          var nugetInfo = await queryNuget(npkg.name);
          var nugetUpdate = getUpdateType(npkg.version, nugetInfo.latest);
          allPackages.push({
            name: npkg.name,
            specifier: npkg.version,
            installedVersion: npkg.version,
            latestVersion: nugetInfo.latest || 'unknown',
            license: nugetInfo.license || 'Unknown',
            isDev: false,
            source: 'nuget',
            updateType: nugetUpdate,
            deprecated: false
          });
        } catch (_) {
          allPackages.push({
            name: npkg.name,
            specifier: npkg.version,
            installedVersion: npkg.version,
            latestVersion: 'unknown',
            license: 'Unknown',
            isDev: false,
            source: 'nuget',
            updateType: 'unknown',
            deprecated: false
          });
        }
      }
    }
  }

  result.packages = allPackages;

  // ── Compute health score ──────────────────────────────────────────────
  result.health = computeHealth(result);

  return result;
}

function computeHealth(scanResult) {
  var packages = scanResult.packages;
  var vulns = scanResult.vulnerabilities;
  if (packages.length === 0) return 100;

  var score = 100;
  var totalPkgs = packages.length;

  // Vulnerability penalties
  var critCount = 0, highCount = 0, modCount = 0, lowCount = 0;
  for (var i = 0; i < vulns.length; i++) {
    var sev = (vulns[i].severity || '').toLowerCase();
    if (sev === 'critical') critCount++;
    else if (sev === 'high') highCount++;
    else if (sev === 'moderate') modCount++;
    else lowCount++;
  }
  score -= critCount * 15;
  score -= highCount * 10;
  score -= modCount * 5;
  score -= lowCount * 2;

  // Outdated penalties
  var majorOutdated = 0, minorOutdated = 0;
  for (var j = 0; j < packages.length; j++) {
    if (packages[j].updateType === 'major') majorOutdated++;
    else if (packages[j].updateType === 'minor') minorOutdated++;
  }
  var outdatedPct = (majorOutdated + minorOutdated) / totalPkgs;
  score -= Math.round(outdatedPct * 20);
  score -= majorOutdated * 2;

  // License penalties
  var allowed = getAllowedLicenses();
  var licenseIssues = 0;
  for (var k = 0; k < packages.length; k++) {
    var lic = (packages[k].license || 'Unknown').toLowerCase();
    if (lic === 'unknown' || (!allowed.includes(lic) && lic !== 'unknown')) {
      licenseIssues++;
    }
  }
  score -= licenseIssues * 3;

  // Deprecated penalties
  for (var d = 0; d < packages.length; d++) {
    if (packages[d].deprecated) score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

// ── Get repos from main app config ──────────────────────────────────────────

function getRepos(getConfig) {
  try {
    var appConfig = getConfig();
    var repos = appConfig.Repos || {};
    var result = [];
    var repoNames = Object.keys(repos);
    for (var i = 0; i < repoNames.length; i++) {
      result.push({ name: repoNames[i], path: repos[repoNames[i]] });
    }
    return result;
  } catch (_) {
    return [];
  }
}

// ── Route Registration ──────────────────────────────────────────────────────

module.exports = function ({ addPrefixRoute, json, readBody, getConfig }) {

  addPrefixRoute(async (req, res, url, subpath) => {
    var method = req.method;

    try {
      // ── Config ──────────────────────────────────────────────────────────
      if (subpath === '/config' && method === 'GET') {
        return json(res, getPluginConfig());
      }

      if (subpath === '/config' && method === 'POST') {
        var body = await readBody(req);
        var cfg = getPluginConfig();
        if (body.npmRegistryUrl !== undefined) cfg.npmRegistryUrl = body.npmRegistryUrl;
        if (body.licenseWhitelist !== undefined) cfg.licenseWhitelist = body.licenseWhitelist;
        savePluginConfig(cfg);
        return json(res, { ok: true });
      }

      // ── List repos ──────────────────────────────────────────────────────
      if (subpath === '/repos' && method === 'GET') {
        var repos = getRepos(getConfig);
        var repoList = [];
        for (var i = 0; i < repos.length; i++) {
          var r = repos[i];
          var cached = scanCache[r.name];
          var hasScan = cached && cached.data;
          repoList.push({
            name: r.name,
            path: r.path,
            scanned: hasScan ? true : false,
            scannedAt: hasScan ? cached.data.scannedAt : null,
            health: hasScan ? cached.data.health : null,
            packageCount: hasScan ? cached.data.packages.length : null,
            vulnCount: hasScan ? cached.data.vulnerabilities.length : null,
            outdatedCount: hasScan ? cached.data.packages.filter(function(p) {
              return p.updateType === 'major' || p.updateType === 'minor' || p.updateType === 'patch';
            }).length : null
          });
        }
        return json(res, repoList);
      }

      // ── Scan all repos ────────────────────────────────────────────────
      if (subpath === '/scan-all' && method === 'POST') {
        var repos2 = getRepos(getConfig);
        var results = [];
        for (var i2 = 0; i2 < repos2.length; i2++) {
          var r2 = repos2[i2];
          var scanResult = await scanRepo(r2.name, r2.path);
          scanCache[r2.name] = { timestamp: Date.now(), data: scanResult };
          results.push({
            name: r2.name,
            health: scanResult.health,
            packageCount: scanResult.packages.length,
            vulnCount: scanResult.vulnerabilities.length,
            error: scanResult.error
          });
        }
        return json(res, { ok: true, repos: results });
      }

      // ── Per-repo scan ─────────────────────────────────────────────────
      var scanMatch = subpath.match(/^\/repos\/([^/]+)\/scan$/);
      if (scanMatch && method === 'POST') {
        var repoName = decodeURIComponent(scanMatch[1]);
        var repos3 = getRepos(getConfig);
        var repo = repos3.find(function(r) { return r.name === repoName; });
        if (!repo) return json(res, { error: 'Repo not found: ' + repoName }, 404);

        var scanResult2 = await scanRepo(repo.name, repo.path);
        scanCache[repo.name] = { timestamp: Date.now(), data: scanResult2 };
        return json(res, scanResult2);
      }

      // ── Per-repo packages ─────────────────────────────────────────────
      var pkgsMatch = subpath.match(/^\/repos\/([^/]+)\/packages$/);
      if (pkgsMatch && method === 'GET') {
        var repoName2 = decodeURIComponent(pkgsMatch[1]);
        var cached2 = scanCache[repoName2];
        if (!cached2 || !cached2.data) {
          return json(res, { error: 'Repo not scanned yet. POST to /repos/' + encodeURIComponent(repoName2) + '/scan first.' }, 404);
        }
        return json(res, cached2.data.packages);
      }

      // ── Per-repo outdated ─────────────────────────────────────────────
      var outdatedMatch = subpath.match(/^\/repos\/([^/]+)\/outdated$/);
      if (outdatedMatch && method === 'GET') {
        var repoName3 = decodeURIComponent(outdatedMatch[1]);
        var cached3 = scanCache[repoName3];
        if (!cached3 || !cached3.data) {
          return json(res, { error: 'Repo not scanned yet.' }, 404);
        }
        var outdated = cached3.data.packages.filter(function(p) {
          return p.updateType === 'major' || p.updateType === 'minor' || p.updateType === 'patch';
        });
        return json(res, outdated);
      }

      // ── Per-repo vulnerabilities ──────────────────────────────────────
      var vulnMatch = subpath.match(/^\/repos\/([^/]+)\/vulnerabilities$/);
      if (vulnMatch && method === 'GET') {
        var repoName4 = decodeURIComponent(vulnMatch[1]);
        var cached4 = scanCache[repoName4];
        if (!cached4 || !cached4.data) {
          return json(res, { error: 'Repo not scanned yet.' }, 404);
        }
        return json(res, cached4.data.vulnerabilities);
      }

      // ── Per-repo licenses ─────────────────────────────────────────────
      var licMatch = subpath.match(/^\/repos\/([^/]+)\/licenses$/);
      if (licMatch && method === 'GET') {
        var repoName5 = decodeURIComponent(licMatch[1]);
        var cached5 = scanCache[repoName5];
        if (!cached5 || !cached5.data) {
          return json(res, { error: 'Repo not scanned yet.' }, 404);
        }
        var allowed2 = getAllowedLicenses();
        var licenseData = cached5.data.packages.map(function(p) {
          var lic = (p.license || 'Unknown').toLowerCase();
          var isAllowed = allowed2.includes(lic);
          return {
            name: p.name,
            license: p.license,
            allowed: isAllowed,
            source: p.source
          };
        });
        return json(res, licenseData);
      }

      // ── Per-repo health ───────────────────────────────────────────────
      var healthMatch = subpath.match(/^\/repos\/([^/]+)\/health$/);
      if (healthMatch && method === 'GET') {
        var repoName6 = decodeURIComponent(healthMatch[1]);
        var cached6 = scanCache[repoName6];
        if (!cached6 || !cached6.data) {
          return json(res, { error: 'Repo not scanned yet.' }, 404);
        }
        var d = cached6.data;
        var pkgs = d.packages;
        var prodCount = pkgs.filter(function(p) { return !p.isDev; }).length;
        var devCount = pkgs.filter(function(p) { return p.isDev; }).length;
        var majorOut = pkgs.filter(function(p) { return p.updateType === 'major'; }).length;
        var minorOut = pkgs.filter(function(p) { return p.updateType === 'minor'; }).length;
        var patchOut = pkgs.filter(function(p) { return p.updateType === 'patch'; }).length;
        var allowed3 = getAllowedLicenses();
        var licIssues = pkgs.filter(function(p) {
          var l = (p.license || 'Unknown').toLowerCase();
          return l === 'unknown' || !allowed3.includes(l);
        }).length;

        return json(res, {
          health: d.health,
          totalPackages: pkgs.length,
          prodPackages: prodCount,
          devPackages: devCount,
          vulnerabilities: {
            total: d.vulnerabilities.length,
            critical: d.vulnerabilities.filter(function(v) { return v.severity === 'critical'; }).length,
            high: d.vulnerabilities.filter(function(v) { return v.severity === 'high'; }).length,
            moderate: d.vulnerabilities.filter(function(v) { return v.severity === 'moderate'; }).length,
            low: d.vulnerabilities.filter(function(v) { return v.severity === 'low'; }).length
          },
          outdated: { major: majorOut, minor: minorOut, patch: patchOut },
          licenseIssues: licIssues,
          scannedAt: d.scannedAt
        });
      }

      // ── Cross-repo duplicates ─────────────────────────────────────────
      if (subpath === '/duplicates' && method === 'GET') {
        var pkgMap = {}; // { pkgName: [ { repo, version } ] }
        var cacheKeys = Object.keys(scanCache);
        for (var ci = 0; ci < cacheKeys.length; ci++) {
          var repoData = scanCache[cacheKeys[ci]];
          if (!repoData || !repoData.data) continue;
          for (var pi = 0; pi < repoData.data.packages.length; pi++) {
            var pkg2 = repoData.data.packages[pi];
            if (!pkgMap[pkg2.name]) pkgMap[pkg2.name] = [];
            pkgMap[pkg2.name].push({
              repo: cacheKeys[ci],
              version: pkg2.installedVersion
            });
          }
        }
        // Filter to packages with different versions across repos
        var duplicates = [];
        var pkgNames = Object.keys(pkgMap);
        for (var di = 0; di < pkgNames.length; di++) {
          var entries = pkgMap[pkgNames[di]];
          if (entries.length < 2) continue;
          var versions = new Set(entries.map(function(e) { return e.version; }));
          if (versions.size > 1) {
            duplicates.push({ name: pkgNames[di], instances: entries });
          }
        }
        duplicates.sort(function(a, b) { return b.instances.length - a.instances.length; });
        return json(res, duplicates);
      }

      // ── Update a package in a repo ─────────────────────────────────────
      var updateMatch = subpath.match(/^\/repos\/([^/]+)\/update$/);
      if (updateMatch && method === 'POST') {
        var repoName = decodeURIComponent(updateMatch[1]);
        var repos6 = getRepos(getConfig);
        var repo = repos6.find(function(r) { return r.name === repoName; });
        if (!repo) return json(res, { error: 'Repo not found' }, 404);

        var body = await readBody(req);
        var pkgName = body.package;
        var version = body.version || 'latest';
        if (!pkgName) return json(res, { error: 'package name required' }, 400);

        try {
          var { execSync } = require('child_process');
          // Detect package manager
          var useYarn = fs.existsSync(path.join(repo.path, 'yarn.lock'));
          var cmd = useYarn
            ? 'yarn add ' + pkgName + '@' + version
            : 'npm install ' + pkgName + '@' + version;

          // Check if it's a devDependency
          try {
            var pkgJson = JSON.parse(fs.readFileSync(path.join(repo.path, 'package.json'), 'utf8'));
            if (pkgJson.devDependencies && pkgJson.devDependencies[pkgName] && !(pkgJson.dependencies && pkgJson.dependencies[pkgName])) {
              cmd = useYarn
                ? 'yarn add --dev ' + pkgName + '@' + version
                : 'npm install --save-dev ' + pkgName + '@' + version;
            }
          } catch (_) {}

          execSync(cmd, { cwd: repo.path, encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });

          // Clear scan cache so next scan picks up the new version
          delete scanCache[repoName];

          return json(res, { ok: true, package: pkgName, version: version, command: cmd });
        } catch (e) {
          return json(res, { error: 'Install failed: ' + (e.stderr || e.message).substring(0, 500) }, 500);
        }
      }

      // ── Summary (plain text) ──────────────────────────────────────────
      if (subpath === '/summary' && method === 'GET') {
        var repos4 = getRepos(getConfig);
        var lines = ['Dependency Inspector -- All Repos', '=================================', ''];

        var anyScanned = false;
        for (var s = 0; s < repos4.length; s++) {
          var rName = repos4[s].name;
          var rPath = repos4[s].path;
          var cd = scanCache[rName];

          if (!cd || !cd.data) {
            lines.push(rName + ' (' + rPath + ')');
            lines.push('  Status: Not scanned yet');
            lines.push('');
            continue;
          }

          anyScanned = true;
          var sd = cd.data;
          var pkgs2 = sd.packages;
          var prodC = pkgs2.filter(function(p) { return !p.isDev; }).length;
          var devC = pkgs2.filter(function(p) { return p.isDev; }).length;
          var majO = pkgs2.filter(function(p) { return p.updateType === 'major'; }).length;
          var minO = pkgs2.filter(function(p) { return p.updateType === 'minor'; }).length;
          var patO = pkgs2.filter(function(p) { return p.updateType === 'patch'; }).length;
          var critV = sd.vulnerabilities.filter(function(v) { return v.severity === 'critical'; }).length;
          var highV = sd.vulnerabilities.filter(function(v) { return v.severity === 'high'; }).length;
          var modV = sd.vulnerabilities.filter(function(v) { return v.severity === 'moderate'; }).length;
          var lowV = sd.vulnerabilities.filter(function(v) { return v.severity === 'low'; }).length;
          var allowed4 = getAllowedLicenses();
          var licIss = pkgs2.filter(function(p) {
            var l = (p.license || 'Unknown').toLowerCase();
            return l === 'unknown' || !allowed4.includes(l);
          }).length;

          lines.push(rName + ' (' + rPath + ')');
          lines.push('  Health: ' + sd.health + '/100');
          lines.push('  Packages: ' + pkgs2.length + ' (' + prodC + ' prod, ' + devC + ' dev)');

          var vulnParts = [];
          if (critV) vulnParts.push(critV + ' critical');
          if (highV) vulnParts.push(highV + ' high');
          if (modV) vulnParts.push(modV + ' moderate');
          if (lowV) vulnParts.push(lowV + ' low');
          lines.push('  Vulnerabilities: ' + (vulnParts.length > 0 ? vulnParts.join(', ') : '0'));

          var outdatedTotal = majO + minO + patO;
          var outParts = [];
          if (majO) outParts.push(majO + ' major');
          if (minO) outParts.push(minO + ' minor');
          if (patO) outParts.push(patO + ' patch');
          lines.push('  Outdated: ' + outdatedTotal + ' packages' + (outParts.length > 0 ? ' (' + outParts.join(', ') + ')' : ''));
          lines.push('  License issues: ' + licIss + (licIss > 0 ? ' (non-whitelisted)' : ''));
          lines.push('');
        }

        // Cross-repo duplicates summary
        if (anyScanned) {
          var pkgMap2 = {};
          var ck2 = Object.keys(scanCache);
          for (var ci2 = 0; ci2 < ck2.length; ci2++) {
            var rd2 = scanCache[ck2[ci2]];
            if (!rd2 || !rd2.data) continue;
            for (var pi2 = 0; pi2 < rd2.data.packages.length; pi2++) {
              var pk = rd2.data.packages[pi2];
              if (!pkgMap2[pk.name]) pkgMap2[pk.name] = [];
              pkgMap2[pk.name].push({ repo: ck2[ci2], version: pk.installedVersion });
            }
          }
          var dupCount = 0;
          var topDup = null;
          var pn2 = Object.keys(pkgMap2);
          for (var di2 = 0; di2 < pn2.length; di2++) {
            var ents = pkgMap2[pn2[di2]];
            if (ents.length < 2) continue;
            var vs = new Set(ents.map(function(e) { return e.version; }));
            if (vs.size > 1) {
              dupCount++;
              if (!topDup) topDup = { name: pn2[di2], instances: ents };
            }
          }
          if (dupCount > 0) {
            lines.push('Cross-repo duplicates: ' + dupCount + ' packages at different versions');
            if (topDup) {
              var verList = topDup.instances.map(function(e) { return e.version + ' in ' + e.repo; }).join(', ');
              lines.push('Top concern: ' + topDup.name + ' (' + verList + ')');
            }
          }
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(lines.join('\n'));
      }

      // Unknown route
      return false;

    } catch (e) {
      return json(res, { error: e.message || String(e) }, 500);
    }
  });
};
