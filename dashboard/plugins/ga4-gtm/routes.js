/**
 * GA4 & GTM Analytics Plugin -- Server-side API Routes
 * Proxies Google Analytics 4 and Google Tag Manager APIs via OAuth2 user consent flow.
 * Credentials stored in config.json alongside this file.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const GTM_API = 'https://tagmanager.googleapis.com/tagmanager/v2';
const GA4_ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta';
const GA4_DATA_API = 'https://analyticsdata.googleapis.com/v1beta';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const REDIRECT_URI = 'http://127.0.0.1:3800/api/plugins/ga4-gtm/auth/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

const configPath = path.join(__dirname, 'config.json');

// -- Helpers ------------------------------------------------------------------

function getPluginConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (_) { return { clientId: '', clientSecret: '', ga4PropertyId: '', gtmAccountId: '', gtmContainerId: '', refreshToken: '' }; }
}

function savePluginConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
}

function isConfigured(cfg) {
  return !!(cfg.refreshToken && cfg.clientId && cfg.clientSecret && (cfg.ga4PropertyId || (cfg.gtmAccountId && cfg.gtmContainerId)));
}

function hasCredentials(cfg) {
  return !!(cfg.clientId && cfg.clientSecret);
}

// -- OAuth2 -------------------------------------------------------------------

var tokenCache = { token: null, expiresAt: 0 };

function getAuthUrl(clientId) {
  var params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent'
  });
  return GOOGLE_AUTH_URL + '?' + params.toString();
}

function exchangeCode(clientId, clientSecret, code) {
  return new Promise(function(resolve, reject) {
    var body = new URLSearchParams({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    }).toString();
    var url = new URL(GOOGLE_TOKEN_URL);
    var opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    };
    var req = https.request(opts, function(resp) {
      var data = '';
      resp.on('data', function(c) { data += c; });
      resp.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error_description || parsed.error || 'Token exchange failed'));
          }
        } catch (e) { reject(new Error('Token parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function refreshAccessToken(clientId, clientSecret, refreshToken) {
  return new Promise(function(resolve, reject) {
    var body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    }).toString();
    var url = new URL(GOOGLE_TOKEN_URL);
    var opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    };
    var req = https.request(opts, function(resp) {
      var data = '';
      resp.on('data', function(c) { data += c; });
      resp.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error_description || parsed.error || 'Token refresh failed'));
          }
        } catch (e) { reject(new Error('Token parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getAccessToken(cfg) {
  return new Promise(function(resolve, reject) {
    if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
      return resolve(tokenCache.token);
    }
    if (!cfg.refreshToken) {
      return reject(new Error('Not connected. Please sign in with Google first.'));
    }
    if (!cfg.clientId || !cfg.clientSecret) {
      return reject(new Error('OAuth Client ID and Secret are not configured.'));
    }
    refreshAccessToken(cfg.clientId, cfg.clientSecret, cfg.refreshToken).then(function(result) {
      tokenCache.token = result.access_token;
      tokenCache.expiresAt = Date.now() + ((result.expires_in || 3600) - 60) * 1000;
      resolve(result.access_token);
    }).catch(reject);
  });
}

function getUserEmail(accessToken) {
  return new Promise(function(resolve, reject) {
    var url = new URL(GOOGLE_USERINFO_URL);
    var opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + accessToken }
    };
    var req = https.request(opts, function(resp) {
      var data = '';
      resp.on('data', function(c) { data += c; });
      resp.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          resolve(parsed.email || null);
        } catch (_) { resolve(null); }
      });
    });
    req.on('error', function() { resolve(null); });
    req.end();
  });
}

// -- HTTP helpers -------------------------------------------------------------

function httpsJson(urlStr, options, body) {
  return new Promise(function(resolve, reject) {
    var url = new URL(urlStr);
    var opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    var req = https.request(opts, function(resp) {
      var data = '';
      resp.on('data', function(c) { data += c; });
      resp.on('end', function() {
        try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: resp.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function googleGet(token, urlStr) {
  return httpsJson(urlStr, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
}

function googlePost(token, urlStr, body) {
  return httpsJson(urlStr, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  }, body);
}

// -- GTM helpers --------------------------------------------------------------

function gtmBasePath(cfg) {
  return GTM_API + '/accounts/' + cfg.gtmAccountId + '/containers/' + cfg.gtmContainerId;
}

async function getDefaultWorkspace(token, cfg) {
  var r = await googleGet(token, gtmBasePath(cfg) + '/workspaces');
  if (r.status !== 200 || !r.data || !r.data.workspace) return null;
  var ws = r.data.workspace;
  // Prefer the default workspace, fall back to first
  for (var i = 0; i < ws.length; i++) {
    if (ws[i].name === 'Default Workspace') return ws[i];
  }
  return ws[0] || null;
}

async function getGtmTags(token, cfg) {
  var ws = await getDefaultWorkspace(token, cfg);
  if (!ws) return [];
  var r = await googleGet(token, GTM_API + '/' + ws.path + '/tags');
  return (r.status === 200 && r.data && r.data.tag) ? r.data.tag : [];
}

async function getGtmTriggers(token, cfg) {
  var ws = await getDefaultWorkspace(token, cfg);
  if (!ws) return [];
  var r = await googleGet(token, GTM_API + '/' + ws.path + '/triggers');
  return (r.status === 200 && r.data && r.data.trigger) ? r.data.trigger : [];
}

async function getGtmVariables(token, cfg) {
  var ws = await getDefaultWorkspace(token, cfg);
  if (!ws) return [];
  var r = await googleGet(token, GTM_API + '/' + ws.path + '/variables');
  return (r.status === 200 && r.data && r.data.variable) ? r.data.variable : [];
}

async function getContainerInfo(token, cfg) {
  var r = await googleGet(token, gtmBasePath(cfg));
  return (r.status === 200 && r.data) ? r.data : null;
}

// -- GA4 helpers --------------------------------------------------------------

function ga4PropPath(cfg) {
  var id = cfg.ga4PropertyId;
  if (id && id.indexOf('properties/') !== 0) id = 'properties/' + id;
  return id;
}

async function getGa4Property(token, cfg) {
  var r = await googleGet(token, GA4_ADMIN_API + '/' + ga4PropPath(cfg));
  return (r.status === 200 && r.data) ? r.data : null;
}

async function getGa4DataStreams(token, cfg) {
  var r = await googleGet(token, GA4_ADMIN_API + '/' + ga4PropPath(cfg) + '/dataStreams');
  return (r.status === 200 && r.data && r.data.dataStreams) ? r.data.dataStreams : [];
}

async function getGa4ConversionEvents(token, cfg) {
  var r = await googleGet(token, GA4_ADMIN_API + '/' + ga4PropPath(cfg) + '/conversionEvents');
  return (r.status === 200 && r.data && r.data.conversionEvents) ? r.data.conversionEvents : [];
}

async function runGa4Report(token, cfg, body) {
  var r = await googlePost(token, GA4_DATA_API + '/' + ga4PropPath(cfg) + ':runReport', body);
  return (r.status === 200 && r.data) ? r.data : null;
}

async function getEventCounts(token, cfg, days) {
  days = days || 7;
  var body = {
    dateRanges: [{ startDate: days + 'daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 100
  };
  var report = await runGa4Report(token, cfg, body);
  if (!report || !report.rows) return [];
  return report.rows.map(function(row) {
    return {
      name: row.dimensionValues[0].value,
      count: parseInt(row.metricValues[0].value, 10) || 0
    };
  });
}

async function getConversionCounts(token, cfg) {
  var body = {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'conversions' }],
    orderBys: [{ metric: { metricName: 'conversions' }, desc: true }],
    limit: 50
  };
  var report = await runGa4Report(token, cfg, body);
  if (!report || !report.rows) return [];
  return report.rows.filter(function(row) {
    return parseInt(row.metricValues[0].value, 10) > 0;
  }).map(function(row) {
    return {
      name: row.dimensionValues[0].value,
      count: parseInt(row.metricValues[0].value, 10) || 0
    };
  });
}

// -- Health score computation -------------------------------------------------

var RECOMMENDED_GA4_EVENTS = [
  'page_view', 'scroll', 'click', 'view_search_results', 'file_download',
  'form_start', 'form_submit', 'video_start', 'video_progress', 'video_complete',
  'purchase', 'add_to_cart', 'remove_from_cart', 'begin_checkout', 'add_payment_info',
  'add_shipping_info', 'view_item', 'view_item_list', 'select_item', 'select_promotion',
  'view_promotion', 'sign_up', 'login', 'generate_lead', 'search', 'share'
];

function computeHealth(tags, triggers, variables, events) {
  var findings = [];
  var score = 100;

  // Tags with no triggers (dormant)
  var dormant = tags.filter(function(t) {
    return !t.firingTriggerId || t.firingTriggerId.length === 0;
  });
  if (dormant.length > 0) {
    score -= Math.min(dormant.length * 5, 20);
    findings.push({
      severity: 'warning',
      title: dormant.length + ' tag(s) have no triggers',
      detail: 'These tags will never fire: ' + dormant.map(function(t) { return t.name; }).join(', ')
    });
  }

  // Paused tags
  var paused = tags.filter(function(t) { return t.paused; });
  if (paused.length > 0) {
    score -= Math.min(paused.length * 2, 10);
    findings.push({
      severity: 'info',
      title: paused.length + ' tag(s) are paused',
      detail: 'Paused: ' + paused.map(function(t) { return t.name; }).join(', ')
    });
  }

  // Unused variables -- check if any variable name appears in tag/trigger parameters
  var usedVarNames = new Set();
  tags.forEach(function(t) {
    var str = JSON.stringify(t);
    variables.forEach(function(v) {
      if (str.indexOf('{{' + v.name + '}}') !== -1) usedVarNames.add(v.name);
    });
  });
  triggers.forEach(function(tr) {
    var str = JSON.stringify(tr);
    variables.forEach(function(v) {
      if (str.indexOf('{{' + v.name + '}}') !== -1) usedVarNames.add(v.name);
    });
  });
  var unused = variables.filter(function(v) { return !usedVarNames.has(v.name); });
  if (unused.length > 0) {
    score -= Math.min(unused.length * 3, 15);
    findings.push({
      severity: 'warning',
      title: unused.length + ' variable(s) appear unused',
      detail: 'Unused: ' + unused.map(function(v) { return v.name; }).join(', ')
    });
  }

  // Duplicate tag names
  var nameCount = {};
  tags.forEach(function(t) { nameCount[t.name] = (nameCount[t.name] || 0) + 1; });
  var dupes = Object.keys(nameCount).filter(function(n) { return nameCount[n] > 1; });
  if (dupes.length > 0) {
    score -= dupes.length * 5;
    findings.push({
      severity: 'error',
      title: dupes.length + ' duplicate tag name(s)',
      detail: 'Duplicates: ' + dupes.join(', ')
    });
  }

  // Missing recommended GA4 events
  var trackedNames = events.map(function(e) { return e.name; });
  var missing = RECOMMENDED_GA4_EVENTS.filter(function(e) { return trackedNames.indexOf(e) === -1; });
  if (missing.length > 5) {
    score -= Math.min(missing.length, 15);
    findings.push({
      severity: 'info',
      title: missing.length + ' recommended GA4 events not tracked',
      detail: 'Missing: ' + missing.slice(0, 10).join(', ') + (missing.length > 10 ? '...' : '')
    });
  }

  // Container size estimate (rough: tags * 2KB avg)
  var estSizeKB = Math.round((tags.length * 2) + (triggers.length * 1) + (variables.length * 0.5));
  if (estSizeKB > 200) {
    score -= 10;
    findings.push({
      severity: 'warning',
      title: 'Container may be oversized (~' + estSizeKB + 'KB estimated)',
      detail: 'Consider removing unused tags and variables to reduce container size.'
    });
  } else {
    findings.push({
      severity: 'ok',
      title: 'Container size is reasonable (~' + estSizeKB + 'KB estimated)',
      detail: ''
    });
  }

  score = Math.max(0, Math.min(100, score));
  return { score: score, findings: findings, unusedVariables: unused, dormantTags: dormant, missingEvents: missing };
}

// -- OAuth callback HTML page -------------------------------------------------

function callbackHtml(success, message) {
  var color = success ? '#a6e3a1' : '#f38ba8';
  var title = success ? 'Connected Successfully' : 'Connection Failed';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title>'
    + '<style>'
    + 'body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; '
    + 'background: #1e1e2e; color: #cdd6f4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }'
    + '.card { text-align: center; padding: 48px; background: #313244; border-radius: 12px; '
    + 'border: 1px solid #45475a; max-width: 420px; }'
    + '.dot { width: 16px; height: 16px; border-radius: 50%; background: ' + color + '; '
    + 'margin: 0 auto 20px; }'
    + 'h1 { margin: 0 0 12px; font-size: 20px; font-weight: 600; color: ' + color + '; }'
    + 'p { margin: 0; color: #a6adc8; font-size: 14px; line-height: 1.5; }'
    + '</style></head><body>'
    + '<div class="card"><div class="dot"></div>'
    + '<h1>' + title + '</h1>'
    + '<p>' + message + '</p>'
    + '</div></body></html>';
}

// -- Route Registration -------------------------------------------------------

module.exports = function ({ addPrefixRoute, json, readBody }) {

  addPrefixRoute(async function(req, res, url, subpath) {
    var method = req.method;

    try {
      // -- Auth: Start OAuth flow -----------------------------------------------
      if (subpath === '/auth/start' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!cfg.clientId || !cfg.clientSecret) {
          return json(res, { error: 'OAuth Client ID and Secret are not configured. Go to Settings > Plugins to add them.' });
        }
        var authUrl = getAuthUrl(cfg.clientId);
        return json(res, { url: authUrl });
      }

      // -- Auth: OAuth callback -------------------------------------------------
      if (subpath === '/auth/callback' && method === 'GET') {
        var params = new URL(url, 'http://localhost').searchParams;
        var code = params.get('code');
        var error = params.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackHtml(false, 'Google returned an error: ' + error + '. Please try again.'));
          return true;
        }

        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackHtml(false, 'No authorization code received. Please try again.'));
          return true;
        }

        var cfg = getPluginConfig();
        try {
          var tokens = await exchangeCode(cfg.clientId, cfg.clientSecret, code);
          // Save refresh token
          if (tokens.refresh_token) {
            cfg.refreshToken = tokens.refresh_token;
            savePluginConfig(cfg);
          }
          // Cache the access token
          tokenCache.token = tokens.access_token;
          tokenCache.expiresAt = Date.now() + ((tokens.expires_in || 3600) - 60) * 1000;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackHtml(true, 'Your Google account has been connected. You can close this tab and return to DevOps Pilot.'));
          return true;
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackHtml(false, 'Failed to exchange authorization code: ' + e.message));
          return true;
        }
      }

      // -- Auth: Status ---------------------------------------------------------
      if (subpath === '/auth/status' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!cfg.refreshToken) {
          return json(res, { connected: false, email: null, hasCredentials: hasCredentials(cfg) });
        }
        try {
          var token = await getAccessToken(cfg);
          var email = await getUserEmail(token);
          return json(res, { connected: true, email: email, hasCredentials: true });
        } catch (e) {
          return json(res, { connected: false, email: null, error: e.message, hasCredentials: hasCredentials(cfg) });
        }
      }

      // -- Auth: Disconnect -----------------------------------------------------
      if (subpath === '/auth/disconnect' && method === 'POST') {
        var cfg = getPluginConfig();
        cfg.refreshToken = '';
        savePluginConfig(cfg);
        tokenCache = { token: null, expiresAt: 0 };
        return json(res, { ok: true });
      }

      // -- Config ---------------------------------------------------------------
      if (subpath === '/config' && method === 'GET') {
        var cfg = getPluginConfig();
        return json(res, {
          configured: isConfigured(cfg),
          hasCredentials: hasCredentials(cfg),
          connected: !!cfg.refreshToken,
          clientId: cfg.clientId || '',
          clientSecret: cfg.clientSecret || '',
          ga4PropertyId: cfg.ga4PropertyId || '',
          gtmAccountId: cfg.gtmAccountId || '',
          gtmContainerId: cfg.gtmContainerId || ''
        });
      }

      if (subpath === '/config' && method === 'POST') {
        var body = await readBody(req);
        var cfg = getPluginConfig();
        if (body.clientId !== undefined) cfg.clientId = body.clientId;
        if (body.clientSecret !== undefined) cfg.clientSecret = body.clientSecret;
        if (body.ga4PropertyId !== undefined) cfg.ga4PropertyId = body.ga4PropertyId;
        if (body.gtmAccountId !== undefined) cfg.gtmAccountId = body.gtmAccountId;
        if (body.gtmContainerId !== undefined) cfg.gtmContainerId = body.gtmContainerId;
        if (body.refreshToken !== undefined) cfg.refreshToken = body.refreshToken;
        savePluginConfig(cfg);
        tokenCache = { token: null, expiresAt: 0 };
        return json(res, { ok: true });
      }

      // -- Debug: raw GTM/GA4 API responses (for troubleshooting) ---------------
      if (subpath === '/debug/gtm-accounts' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        try {
          var token = await getAccessToken(cfg);
          var raw = await googleGet(token, GTM_API + '/accounts');
          return json(res, { status: raw.status, data: raw.data });
        } catch (e) { return json(res, { error: e.message }, 500); }
      }

      // -- Discover (auto-list properties and containers) ----------------------
      if (subpath === '/discover' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected. Sign in with Google first.' }, 401);
        try {
          var token = await getAccessToken(cfg);
          var result = { ga4Properties: [], gtmAccounts: [] };

          // List GA4 properties
          try {
            var ga4Resp = await googleGet(token, GA4_ADMIN_API + '/accountSummaries');
            if (ga4Resp.status === 200 && ga4Resp.data && ga4Resp.data.accountSummaries) {
              var summaries = ga4Resp.data.accountSummaries;
              for (var ai = 0; ai < summaries.length; ai++) {
                var acct = summaries[ai];
                var props = acct.propertySummaries || [];
                for (var pi = 0; pi < props.length; pi++) {
                  var p = props[pi];
                  var propId = (p.property || '').replace('properties/', '');
                  result.ga4Properties.push({
                    id: propId,
                    name: p.displayName || propId,
                    account: acct.displayName || acct.account
                  });
                }
              }
            }
          } catch (ga4Err) {
            result.ga4Error = ga4Err.message || 'Failed to list GA4 properties';
          }

          // List GTM accounts and containers
          try {
            var gtmResp = await googleGet(token, GTM_API + '/accounts');
            // GTM v2 returns { account: [...] } -- each has path "accounts/123" and name
            var gtmAccounts = [];
            if (gtmResp.status !== 200) {
              var errMsg = (gtmResp.data && gtmResp.data.error && gtmResp.data.error.message) || ('GTM API returned status ' + gtmResp.status);
              result.gtmError = errMsg;
            } else if (gtmResp.data) {
              gtmAccounts = gtmResp.data.account || gtmResp.data.accounts || [];
              if (!Array.isArray(gtmAccounts)) gtmAccounts = [];
            }
            for (var gi = 0; gi < gtmAccounts.length; gi++) {
              var ga = gtmAccounts[gi];
              // accountId can be in .accountId or extracted from .path ("accounts/12345")
              var accountId = ga.accountId || (ga.path ? ga.path.replace('accounts/', '') : '');
              if (!accountId) continue;
              var containers = [];
              try {
                var cResp = await googleGet(token, GTM_API + '/accounts/' + accountId + '/containers');
                var cList = [];
                if (cResp.status === 200 && cResp.data) {
                  cList = cResp.data.container || cResp.data.containers || [];
                  if (!Array.isArray(cList)) cList = [];
                }
                for (var ci = 0; ci < cList.length; ci++) {
                  var ctr = cList[ci];
                  var cId = ctr.containerId || (ctr.path ? ctr.path.split('/').pop() : '');
                  containers.push({
                    containerId: cId,
                    name: ctr.name || '',
                    publicId: ctr.publicId || ''
                  });
                }
              } catch (_) {}
              result.gtmAccounts.push({
                accountId: accountId,
                name: ga.name || ('Account ' + accountId),
                containers: containers
              });
            }
          } catch (gtmErr) {
            result.gtmError = gtmErr.message || 'Failed to list GTM accounts';
          }

          // Surface API-not-enabled errors clearly
          if (result.ga4Properties.length === 0 && !result.ga4Error) {
            result.ga4Error = 'No GA4 properties found. Make sure the Google Analytics Admin API is enabled in your Google Cloud project.';
          }
          if (result.gtmAccounts.length === 0 && !result.gtmError) {
            result.gtmError = 'No GTM accounts found. Make sure the Tag Manager API is enabled in your Google Cloud project.';
          }

          return json(res, result);
        } catch (e) {
          return json(res, { error: e.message }, 500);
        }
      }

      // -- Save selected property/container ------------------------------------
      if (subpath === '/select' && method === 'POST') {
        var body = await readBody(req);
        var cfg = getPluginConfig();
        if (body.ga4PropertyId !== undefined) cfg.ga4PropertyId = body.ga4PropertyId;
        if (body.gtmAccountId !== undefined) cfg.gtmAccountId = body.gtmAccountId;
        if (body.gtmContainerId !== undefined) cfg.gtmContainerId = body.gtmContainerId;
        savePluginConfig(cfg);
        return json(res, { ok: true });
      }

      // -- Test -----------------------------------------------------------------
      if (subpath === '/test' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { ok: false, error: 'Not configured' });
        try {
          var token = await getAccessToken(cfg);
          var results = { ok: true, gtm: false, ga4: false };
          if (cfg.gtmAccountId && cfg.gtmContainerId) {
            var container = await getContainerInfo(token, cfg);
            results.gtm = !!container;
            results.gtmName = container ? container.name : null;
            results.publicId = container ? container.publicId : null;
          }
          if (cfg.ga4PropertyId) {
            var prop = await getGa4Property(token, cfg);
            results.ga4 = !!prop;
            results.ga4Name = prop ? prop.displayName : null;
          }
          return json(res, results);
        } catch (e) {
          return json(res, { ok: false, error: e.message });
        }
      }

      // -- Summary (plain text) -------------------------------------------------
      if (subpath === '/summary' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('GA4 & GTM Analytics plugin is not configured.\nSign in with Google in the Analytics tab to connect your account.');
          return true;
        }
        try {
          var token = await getAccessToken(cfg);
          var lines = [];

          // GTM section
          if (cfg.gtmAccountId && cfg.gtmContainerId) {
            var container = await getContainerInfo(token, cfg);
            var tags = await getGtmTags(token, cfg);
            var triggers = await getGtmTriggers(token, cfg);
            var variables = await getGtmVariables(token, cfg);

            lines.push('GTM Container: ' + (container ? container.name : 'Unknown') + ' (' + (container ? container.publicId : 'N/A') + ')');
            lines.push('Total Tags: ' + tags.length + ' | Triggers: ' + triggers.length + ' | Variables: ' + variables.length);

            var activeTags = tags.filter(function(t) { return !t.paused; });
            var pausedTags = tags.filter(function(t) { return t.paused; });
            lines.push('Active Tags: ' + activeTags.length + ' | Paused: ' + pausedTags.length);

            // Get events for health computation
            var events = [];
            if (cfg.ga4PropertyId) {
              try { events = await getEventCounts(token, cfg, 7); } catch (_) {}
            }
            var health = computeHealth(tags, triggers, variables, events);
            lines.push('');
            lines.push('Tag Health Score: ' + health.score + '/100');
            health.findings.forEach(function(f) {
              if (f.severity === 'ok') lines.push('  [OK] ' + f.title);
              else if (f.severity === 'error') lines.push('  [ERROR] ' + f.title);
              else if (f.severity === 'warning') lines.push('  [WARN] ' + f.title);
              else lines.push('  [INFO] ' + f.title);
              if (f.detail) lines.push('    ' + f.detail);
            });

            lines.push('');
            lines.push('Tags:');
            tags.forEach(function(t) {
              var status = t.paused ? 'PAUSED' : 'ACTIVE';
              var trigCount = (t.firingTriggerId || []).length;
              lines.push('  - ' + t.name + ' [' + (t.type || 'unknown') + '] ' + status + ' (' + trigCount + ' trigger(s))');
            });
          }

          // GA4 section
          if (cfg.ga4PropertyId) {
            var prop = await getGa4Property(token, cfg);
            var streams = await getGa4DataStreams(token, cfg);
            var conversionEvents = [];
            try { conversionEvents = await getGa4ConversionEvents(token, cfg); } catch (_) {}
            var events = [];
            try { events = await getEventCounts(token, cfg, 7); } catch (_) {}

            lines.push('');
            lines.push('GA4 Property: ' + (prop ? prop.displayName : 'Unknown') + ' (' + ga4PropPath(cfg) + ')');
            lines.push('Data Streams: ' + streams.length);
            streams.forEach(function(s) {
              var type = s.webStreamData ? 'Web' : s.androidAppStreamData ? 'Android' : s.iosAppStreamData ? 'iOS' : 'Unknown';
              lines.push('  - ' + (s.displayName || 'Unnamed') + ' (' + type + ')');
            });
            lines.push('Conversion Events: ' + conversionEvents.length);
            conversionEvents.forEach(function(c) {
              lines.push('  - ' + c.eventName);
            });

            if (events.length > 0) {
              lines.push('');
              lines.push('Top Events (last 7 days):');
              events.slice(0, 20).forEach(function(e, i) {
                lines.push('  ' + (i + 1) + '. ' + e.name + ' -- ' + e.count.toLocaleString());
              });
            }
          }

          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(lines.join('\n'));
          return true;
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Error generating summary: ' + e.message);
          return true;
        }
      }

      // -- GTM: Tags ------------------------------------------------------------
      if (subpath === '/gtm/tags' && method === 'GET') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var tags = await getGtmTags(token, cfg);
        return json(res, tags);
      }

      // -- GTM: Tag detail ------------------------------------------------------
      if (subpath.match(/^\/gtm\/tags\/[^/]+$/) && method === 'GET') {
        var tagId = subpath.split('/')[3];
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var ws = await getDefaultWorkspace(token, cfg);
        if (!ws) return json(res, { error: 'No workspace found' });
        var r = await googleGet(token, GTM_API + '/' + ws.path + '/tags/' + tagId);
        if (r.status === 200 && r.data) return json(res, r.data);
        return json(res, { error: 'Tag not found', status: r.status });
      }

      // -- GTM: Triggers --------------------------------------------------------
      if (subpath === '/gtm/triggers' && method === 'GET') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var triggers = await getGtmTriggers(token, cfg);
        return json(res, triggers);
      }

      // -- GTM: Variables -------------------------------------------------------
      if (subpath === '/gtm/variables' && method === 'GET') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var variables = await getGtmVariables(token, cfg);
        return json(res, variables);
      }

      // -- GTM Write: Create tag ------------------------------------------------
      if (subpath === '/gtm/tags' && method === 'POST') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var ws = await getDefaultWorkspace(token, cfg);
        if (!ws) return json(res, { error: 'No workspace found' }, 400);
        var body = await readBody(req);
        var r = await googlePost(token, GTM_API + '/' + ws.path + '/tags', body);
        if (r.status === 200 || r.status === 201) return json(res, r.data);
        return json(res, { error: (r.data && r.data.error && r.data.error.message) || 'Failed to create tag', status: r.status }, r.status);
      }

      // -- GTM Write: Create trigger --------------------------------------------
      if (subpath === '/gtm/triggers' && method === 'POST') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var ws = await getDefaultWorkspace(token, cfg);
        if (!ws) return json(res, { error: 'No workspace found' }, 400);
        var body = await readBody(req);
        var r = await googlePost(token, GTM_API + '/' + ws.path + '/triggers', body);
        if (r.status === 200 || r.status === 201) return json(res, r.data);
        return json(res, { error: (r.data && r.data.error && r.data.error.message) || 'Failed to create trigger', status: r.status }, r.status);
      }

      // -- GTM Write: Create variable -------------------------------------------
      if (subpath === '/gtm/variables' && method === 'POST') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var ws = await getDefaultWorkspace(token, cfg);
        if (!ws) return json(res, { error: 'No workspace found' }, 400);
        var body = await readBody(req);
        var r = await googlePost(token, GTM_API + '/' + ws.path + '/variables', body);
        if (r.status === 200 || r.status === 201) return json(res, r.data);
        return json(res, { error: (r.data && r.data.error && r.data.error.message) || 'Failed to create variable', status: r.status }, r.status);
      }

      // -- GTM Write: Publish workspace -----------------------------------------
      if (subpath === '/gtm/publish' && method === 'POST') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var ws = await getDefaultWorkspace(token, cfg);
        if (!ws) return json(res, { error: 'No workspace found' }, 400);
        var r = await googlePost(token, GTM_API + '/' + ws.path + ':quick_publish', {});
        if (r.status === 200 || r.status === 201) return json(res, r.data);
        return json(res, { error: (r.data && r.data.error && r.data.error.message) || 'Failed to publish', status: r.status }, r.status);
      }

      // -- GTM Write: List workspaces -------------------------------------------
      if (subpath === '/gtm/workspaces' && method === 'GET') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var r = await googleGet(token, gtmBasePath(cfg) + '/workspaces');
        if (r.status === 200 && r.data && r.data.workspace) return json(res, r.data.workspace);
        return json(res, []);
      }

      // -- GA4: Property info ---------------------------------------------------
      if (subpath === '/ga4/properties' && method === 'GET') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var prop = await getGa4Property(token, cfg);
        var streams = await getGa4DataStreams(token, cfg);
        return json(res, { property: prop, dataStreams: streams });
      }

      // -- GA4: Events ----------------------------------------------------------
      if (subpath === '/ga4/events' && method === 'GET') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var params = new URL(url, 'http://localhost').searchParams;
        var days = parseInt(params.get('days')) || 7;
        var events = await getEventCounts(token, cfg, days);
        return json(res, events);
      }

      // -- GA4: Conversions -----------------------------------------------------
      if (subpath === '/ga4/conversions' && method === 'GET') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var conversionDefs = [];
        try { conversionDefs = await getGa4ConversionEvents(token, cfg); } catch (_) {}
        var conversionCounts = [];
        try { conversionCounts = await getConversionCounts(token, cfg); } catch (_) {}
        return json(res, { definitions: conversionDefs, counts: conversionCounts });
      }

      // -- Health score ---------------------------------------------------------
      if (subpath === '/health' && method === 'GET') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var tags = [], triggers = [], variables = [], events = [];
        if (cfg.gtmAccountId && cfg.gtmContainerId) {
          tags = await getGtmTags(token, cfg);
          triggers = await getGtmTriggers(token, cfg);
          variables = await getGtmVariables(token, cfg);
        }
        if (cfg.ga4PropertyId) {
          try { events = await getEventCounts(token, cfg, 7); } catch (_) {}
        }
        var health = computeHealth(tags, triggers, variables, events);
        return json(res, health);
      }

      // -- Audit (detailed) -----------------------------------------------------
      if (subpath === '/audit' && method === 'GET') {
        var cfg = getPluginConfig();
        var token = await getAccessToken(cfg);
        var tags = [], triggers = [], variables = [], events = [];
        var container = null;
        if (cfg.gtmAccountId && cfg.gtmContainerId) {
          container = await getContainerInfo(token, cfg);
          tags = await getGtmTags(token, cfg);
          triggers = await getGtmTriggers(token, cfg);
          variables = await getGtmVariables(token, cfg);
        }
        if (cfg.ga4PropertyId) {
          try { events = await getEventCounts(token, cfg, 7); } catch (_) {}
        }
        var health = computeHealth(tags, triggers, variables, events);
        var audit = {
          container: container ? { name: container.name, publicId: container.publicId } : null,
          health: health,
          tagCount: tags.length,
          triggerCount: triggers.length,
          variableCount: variables.length,
          eventCount: events.length,
          tags: tags.map(function(t) {
            return {
              name: t.name,
              type: t.type,
              paused: !!t.paused,
              firingTriggers: (t.firingTriggerId || []).length,
              blockingTriggers: (t.blockingTriggerId || []).length
            };
          }),
          triggers: triggers.map(function(tr) {
            return { name: tr.name, type: tr.type };
          }),
          unusedVariables: health.unusedVariables.map(function(v) { return v.name; }),
          dormantTags: health.dormantTags.map(function(t) { return t.name; }),
          missingEvents: health.missingEvents,
          topEvents: events.slice(0, 20)
        };
        return json(res, audit);
      }

      return false;
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  });
};
