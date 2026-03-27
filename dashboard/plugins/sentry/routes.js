/**
 * Sentry Error Tracker Plugin -- Server-side API Routes
 * Proxies the Sentry API for issue tracking, error trends, and stack traces.
 * Can create Azure DevOps work items from Sentry issues via the DevOps Pilot API.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SENTRY_API = 'https://sentry.io/api/0';
const DEVOPS_PILOT_API = 'http://127.0.0.1:3800';

const configPath = path.join(__dirname, 'config.json');

// -- Helpers ------------------------------------------------------------------

function getPluginConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (_) { return { authToken: '', organization: '', defaultProject: '' }; }
}

function savePluginConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
}

function isConfigured(cfg) {
  return !!(cfg.authToken && cfg.organization);
}

// -- HTTP helpers -------------------------------------------------------------

function sentryGet(token, urlPath) {
  return new Promise(function(resolve, reject) {
    var url = new URL(SENTRY_API + urlPath);
    var opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
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
    req.end();
  });
}

function sentryPut(token, urlPath, body) {
  return new Promise(function(resolve, reject) {
    var url = new URL(SENTRY_API + urlPath);
    var bodyStr = JSON.stringify(body);
    var opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
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
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function localPost(urlPath, body) {
  return new Promise(function(resolve, reject) {
    var url = new URL(DEVOPS_PILOT_API + urlPath);
    var bodyStr = JSON.stringify(body);
    var opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    var req = http.request(opts, function(resp) {
      var data = '';
      resp.on('data', function(c) { data += c; });
      resp.on('end', function() {
        try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: resp.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// -- Formatters ---------------------------------------------------------------

function timeAgo(dateStr) {
  if (!dateStr) return 'unknown';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  var days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return Math.floor(days / 30) + 'mo ago';
}

function formatStackTrace(exception) {
  if (!exception || !exception.values) return '';
  var lines = [];
  for (var i = 0; i < exception.values.length; i++) {
    var exc = exception.values[i];
    lines.push((exc.type || 'Error') + ': ' + (exc.value || ''));
    if (exc.stacktrace && exc.stacktrace.frames) {
      var frames = exc.stacktrace.frames.slice().reverse();
      for (var j = 0; j < frames.length; j++) {
        var f = frames[j];
        var loc = (f.filename || f.absPath || '?') + ':' + (f.lineNo || '?');
        var fn = f.function || '<anonymous>';
        lines.push('  at ' + fn + ' (' + loc + ')');
        if (f.context && f.context.length > 0) {
          for (var k = 0; k < f.context.length; k++) {
            var ctx = f.context[k];
            lines.push('    ' + (ctx[0] || '') + ' | ' + (ctx[1] || ''));
          }
        }
      }
    }
  }
  return lines.join('\n');
}

function formatStackTraceHtml(exception) {
  if (!exception || !exception.values) return '<p>No stack trace available.</p>';
  var html = '';
  for (var i = 0; i < exception.values.length; i++) {
    var exc = exception.values[i];
    html += '<div class="exc-type">' + escHtml(exc.type || 'Error') + ': ' + escHtml(exc.value || '') + '</div>';
    if (exc.stacktrace && exc.stacktrace.frames) {
      var frames = exc.stacktrace.frames.slice().reverse();
      for (var j = 0; j < frames.length; j++) {
        var f = frames[j];
        var loc = (f.filename || f.absPath || '?') + ':' + (f.lineNo || '?');
        var fn = f.function || '<anonymous>';
        html += '<div class="st-frame' + (f.inApp ? ' in-app' : '') + '">';
        html += '<span class="st-fn">' + escHtml(fn) + '</span>';
        html += ' <span class="st-loc">' + escHtml(loc) + '</span>';
        if (f.contextLine) {
          html += '<div class="st-ctx">';
          if (f.preContext) {
            for (var k = 0; k < f.preContext.length; k++) {
              var ln = (f.lineNo || 0) - f.preContext.length + k;
              html += '<div class="ctx-line"><span class="ln">' + ln + '</span>' + escHtml(f.preContext[k]) + '</div>';
            }
          }
          html += '<div class="ctx-line hl"><span class="ln">' + (f.lineNo || '') + '</span>' + escHtml(f.contextLine) + '</div>';
          if (f.postContext) {
            for (var k = 0; k < f.postContext.length; k++) {
              var ln = (f.lineNo || 0) + 1 + k;
              html += '<div class="ctx-line"><span class="ln">' + ln + '</span>' + escHtml(f.postContext[k]) + '</div>';
            }
          }
          html += '</div>';
        }
        html += '</div>';
      }
    }
  }
  return html;
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -- Route Registration -------------------------------------------------------

module.exports = function ({ addPrefixRoute, json, readBody }) {

  addPrefixRoute(async function(req, res, url, subpath) {
    var method = req.method;

    try {
      // -- Config ---------------------------------------------------------------
      if (subpath === '/config' && method === 'GET') {
        var cfg = getPluginConfig();
        return json(res, {
          configured: isConfigured(cfg),
          authTokenSet: !!cfg.authToken,
          organization: cfg.organization || '',
          defaultProject: cfg.defaultProject || ''
        });
      }

      if (subpath === '/config' && method === 'POST') {
        var body = await readBody(req);
        var cfg = getPluginConfig();
        if (body.authToken !== undefined) cfg.authToken = body.authToken;
        if (body.organization !== undefined) cfg.organization = body.organization;
        if (body.defaultProject !== undefined) cfg.defaultProject = body.defaultProject;
        savePluginConfig(cfg);
        return json(res, { ok: true });
      }

      // -- Test -----------------------------------------------------------------
      if (subpath === '/test' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { ok: false, error: 'Not configured' });
        try {
          var r = await sentryGet(cfg.authToken, '/organizations/' + cfg.organization + '/');
          if (r.status === 200 && r.data && r.data.slug) {
            return json(res, { ok: true, organization: r.data.name, slug: r.data.slug });
          }
          return json(res, { ok: false, error: 'Auth failed (status ' + r.status + ')' });
        } catch (e) {
          return json(res, { ok: false, error: e.message });
        }
      }

      // -- Projects -------------------------------------------------------------
      if (subpath === '/projects' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 400);
        var r = await sentryGet(cfg.authToken, '/organizations/' + cfg.organization + '/projects/');
        if (r.status === 200) return json(res, r.data);
        return json(res, { error: 'Failed to fetch projects', status: r.status }, r.status);
      }

      // -- Issues list ----------------------------------------------------------
      if (subpath === '/issues' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 400);
        var params = new URL(url, 'http://localhost').searchParams;
        var project = params.get('project') || cfg.defaultProject;
        var query = params.get('query') || 'is:unresolved';
        var sort = params.get('sort') || 'freq';
        var cursor = params.get('cursor') || '';

        var apiPath = '/projects/' + cfg.organization + '/' + project + '/issues/?query=' + encodeURIComponent(query) + '&sort=' + sort;
        if (cursor) apiPath += '&cursor=' + encodeURIComponent(cursor);
        var r = await sentryGet(cfg.authToken, apiPath);
        if (r.status === 200) return json(res, r.data);
        return json(res, { error: 'Failed to fetch issues', status: r.status, detail: r.data }, r.status);
      }

      // -- Issue detail ---------------------------------------------------------
      var issueDetailMatch = subpath.match(/^\/issues\/([^/]+)$/);
      if (issueDetailMatch && method === 'GET') {
        var issueId = issueDetailMatch[1];
        // Skip non-numeric IDs that match other routes
        if (issueId === 'stats') return false;
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 400);

        // Fetch issue detail and latest event in parallel
        var issuePromise = sentryGet(cfg.authToken, '/issues/' + issueId + '/');
        var eventPromise = sentryGet(cfg.authToken, '/issues/' + issueId + '/events/latest/');
        var results = await Promise.all([issuePromise, eventPromise]);

        var issue = results[0].status === 200 ? results[0].data : null;
        var latestEvent = results[1].status === 200 ? results[1].data : null;

        if (!issue) return json(res, { error: 'Issue not found', status: results[0].status }, 404);

        var stackTraceText = '';
        var stackTraceHtml = '';
        if (latestEvent && latestEvent.entries) {
          for (var i = 0; i < latestEvent.entries.length; i++) {
            if (latestEvent.entries[i].type === 'exception') {
              stackTraceText = formatStackTrace(latestEvent.entries[i].data);
              stackTraceHtml = formatStackTraceHtml(latestEvent.entries[i].data);
              break;
            }
          }
        }

        var tags = [];
        if (latestEvent && latestEvent.tags) {
          tags = latestEvent.tags.map(function(t) { return { key: t.key, value: t.value }; });
        }

        return json(res, {
          id: issue.id,
          title: issue.title,
          culprit: issue.culprit,
          type: issue.type,
          metadata: issue.metadata,
          status: issue.status,
          level: issue.level,
          count: issue.count,
          userCount: issue.userCount,
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen,
          permalink: issue.permalink,
          shortId: issue.shortId,
          project: issue.project,
          stackTraceText: stackTraceText,
          stackTraceHtml: stackTraceHtml,
          tags: tags,
          latestEvent: latestEvent ? {
            eventID: latestEvent.eventID,
            dateCreated: latestEvent.dateCreated,
            tags: latestEvent.tags,
            contexts: latestEvent.contexts
          } : null
        });
      }

      // -- Issue events ---------------------------------------------------------
      var issueEventsMatch = subpath.match(/^\/issues\/([^/]+)\/events$/);
      if (issueEventsMatch && method === 'GET') {
        var issueId = issueEventsMatch[1];
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 400);
        var r = await sentryGet(cfg.authToken, '/issues/' + issueId + '/events/');
        if (r.status === 200) return json(res, r.data);
        return json(res, { error: 'Failed to fetch events', status: r.status }, r.status);
      }

      // -- Resolve issue --------------------------------------------------------
      var resolveMatch = subpath.match(/^\/issues\/([^/]+)\/resolve$/);
      if (resolveMatch && method === 'POST') {
        var issueId = resolveMatch[1];
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 400);
        var r = await sentryPut(cfg.authToken, '/issues/' + issueId + '/', { status: 'resolved' });
        if (r.status === 200) return json(res, { ok: true, status: 'resolved' });
        return json(res, { error: 'Failed to resolve', status: r.status, detail: r.data }, r.status);
      }

      // -- Ignore issue ---------------------------------------------------------
      var ignoreMatch = subpath.match(/^\/issues\/([^/]+)\/ignore$/);
      if (ignoreMatch && method === 'POST') {
        var issueId = ignoreMatch[1];
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 400);
        var r = await sentryPut(cfg.authToken, '/issues/' + issueId + '/', { status: 'ignored' });
        if (r.status === 200) return json(res, { ok: true, status: 'ignored' });
        return json(res, { error: 'Failed to ignore', status: r.status, detail: r.data }, r.status);
      }

      // -- Create work item from issue ------------------------------------------
      var createWiMatch = subpath.match(/^\/issues\/([^/]+)\/create-workitem$/);
      if (createWiMatch && method === 'POST') {
        var issueId = createWiMatch[1];
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 400);

        // Fetch issue detail + latest event
        var issueR = await sentryGet(cfg.authToken, '/issues/' + issueId + '/');
        if (issueR.status !== 200) return json(res, { error: 'Issue not found' }, 404);
        var issue = issueR.data;

        var eventR = await sentryGet(cfg.authToken, '/issues/' + issueId + '/events/latest/');
        var latestEvent = eventR.status === 200 ? eventR.data : null;

        var stackTrace = '';
        if (latestEvent && latestEvent.entries) {
          for (var i = 0; i < latestEvent.entries.length; i++) {
            if (latestEvent.entries[i].type === 'exception') {
              stackTrace = formatStackTrace(latestEvent.entries[i].data);
              break;
            }
          }
        }

        // Read optional body overrides
        var body = {};
        try { body = await readBody(req); } catch (_) {}

        var title = body.title || '[Sentry] ' + (issue.title || 'Unknown Error');
        var description = '<h3>Sentry Issue: ' + escHtml(issue.shortId || issue.id) + '</h3>\n';
        description += '<p><strong>Error:</strong> ' + escHtml(issue.title) + '</p>\n';
        description += '<p><strong>Culprit:</strong> ' + escHtml(issue.culprit || 'N/A') + '</p>\n';
        description += '<p><strong>Events:</strong> ' + (issue.count || 0) + ' | <strong>Users Affected:</strong> ' + (issue.userCount || 0) + '</p>\n';
        description += '<p><strong>First Seen:</strong> ' + (issue.firstSeen || 'N/A') + ' | <strong>Last Seen:</strong> ' + (issue.lastSeen || 'N/A') + '</p>\n';
        description += '<p><strong>Level:</strong> ' + (issue.level || 'error') + '</p>\n';
        if (issue.permalink) {
          description += '<p><a href="' + escHtml(issue.permalink) + '">View in Sentry</a></p>\n';
        }
        if (stackTrace) {
          description += '<h4>Stack Trace</h4>\n<pre>' + escHtml(stackTrace) + '</pre>\n';
        }

        var wiBody = {
          type: 'Bug',
          title: title,
          description: description,
          priority: body.priority || 2,
          tags: 'sentry'
        };

        var wiR = await localPost('/api/workitems/create', wiBody);
        if (wiR.status === 200 || wiR.status === 201) {
          return json(res, { ok: true, workItem: wiR.data });
        }
        return json(res, { error: 'Failed to create work item', status: wiR.status, detail: wiR.data }, 500);
      }

      // -- Stats ----------------------------------------------------------------
      if (subpath === '/stats' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) return json(res, { error: 'Not configured' }, 400);
        var params = new URL(url, 'http://localhost').searchParams;
        var project = params.get('project') || cfg.defaultProject;
        var stat = params.get('stat') || 'received';
        var resolution = params.get('resolution') || '1h';
        var range = params.get('range') || '24h';

        // Calculate since timestamp
        var now = Date.now();
        var rangeMs = 24 * 3600 * 1000;
        if (range === '7d') rangeMs = 7 * 24 * 3600 * 1000;
        else if (range === '30d') rangeMs = 30 * 24 * 3600 * 1000;
        var since = Math.floor((now - rangeMs) / 1000);

        var apiPath = '/projects/' + cfg.organization + '/' + project + '/stats/?stat=' + stat + '&resolution=' + resolution + '&since=' + since;
        var r = await sentryGet(cfg.authToken, apiPath);
        if (r.status === 200) return json(res, r.data);
        return json(res, { error: 'Failed to fetch stats', status: r.status, detail: r.data }, r.status);
      }

      // -- Summary (plain text) -------------------------------------------------
      if (subpath === '/summary' && method === 'GET') {
        var cfg = getPluginConfig();
        if (!isConfigured(cfg)) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Sentry Error Tracker plugin is not configured.\nGo to Settings > Plugins to add your Sentry auth token and organization.');
          return true;
        }
        try {
          var lines = [];
          lines.push('Sentry Error Tracker -- ' + cfg.organization);
          lines.push('================================');
          lines.push('');

          // Fetch projects
          var projR = await sentryGet(cfg.authToken, '/organizations/' + cfg.organization + '/projects/');
          var projects = (projR.status === 200 && Array.isArray(projR.data)) ? projR.data : [];

          if (projects.length === 0) {
            lines.push('No projects found.');
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(lines.join('\n'));
            return true;
          }

          lines.push('Projects:');

          // For each project, get unresolved count
          var projectSummaries = [];
          for (var i = 0; i < Math.min(projects.length, 10); i++) {
            var p = projects[i];
            var slug = p.slug;
            var issueR = await sentryGet(cfg.authToken, '/projects/' + cfg.organization + '/' + slug + '/issues/?query=is%3Aunresolved&sort=freq');
            var unresolvedCount = (issueR.status === 200 && Array.isArray(issueR.data)) ? issueR.data.length : 0;
            lines.push('  ' + p.name + ' (slug: ' + slug + ', Unresolved: ' + unresolvedCount + ')');
            if (unresolvedCount > 0) {
              projectSummaries.push({ name: p.name, slug: slug, issues: issueR.data || [] });
            }
          }

          // Show top issues for the first project with issues (or default project)
          var targetProject = null;
          if (cfg.defaultProject) {
            targetProject = projectSummaries.find(function(ps) { return ps.slug === cfg.defaultProject; });
          }
          if (!targetProject && projectSummaries.length > 0) {
            targetProject = projectSummaries[0];
          }

          if (targetProject && targetProject.issues.length > 0) {
            lines.push('');
            lines.push('Top Unresolved Issues (' + targetProject.name + '):');
            var top = targetProject.issues.slice(0, 5);
            for (var j = 0; j < top.length; j++) {
              var iss = top[j];
              lines.push('  ' + (j + 1) + '. ' + iss.title + ' -- ' + (iss.count || 0) + ' events, ' + (iss.userCount || 0) + ' users');
            }
          }

          // Error trend for default project
          if (cfg.defaultProject) {
            var now = Date.now();
            var since24h = Math.floor((now - 24 * 3600 * 1000) / 1000);
            var since48h = Math.floor((now - 48 * 3600 * 1000) / 1000);
            var todayR = await sentryGet(cfg.authToken, '/projects/' + cfg.organization + '/' + cfg.defaultProject + '/stats/?stat=received&resolution=1d&since=' + since24h);
            var yesterdayR = await sentryGet(cfg.authToken, '/projects/' + cfg.organization + '/' + cfg.defaultProject + '/stats/?stat=received&resolution=1d&since=' + since48h);

            var todayCount = 0;
            var yesterdayCount = 0;
            if (todayR.status === 200 && Array.isArray(todayR.data)) {
              todayR.data.forEach(function(d) { todayCount += d[1]; });
            }
            if (yesterdayR.status === 200 && Array.isArray(yesterdayR.data)) {
              // The first bucket is yesterday
              if (yesterdayR.data.length > 0) yesterdayCount = yesterdayR.data[0][1];
            }

            if (yesterdayCount > 0) {
              var pctChange = Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);
              var direction = pctChange >= 0 ? '+' : '';
              lines.push('');
              lines.push('Error Trend: ' + direction + pctChange + '% over last 24h (' + todayCount + ' today vs ' + yesterdayCount + ' yesterday)');
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

      return false;
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  });
};
