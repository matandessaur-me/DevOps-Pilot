const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const configPath = path.join(__dirname, 'config.json');

function getCfg() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (_) { return {}; }
}

function saveCfg(d) {
  fs.writeFileSync(configPath, JSON.stringify(d, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// ADO REST helper
// ---------------------------------------------------------------------------
function adoRequest(method, apiPath, config, body) {
  var org = config.AzureDevOpsOrg;
  var project = config.AzureDevOpsProject;
  var pat = config.AzureDevOpsPAT;
  var auth = Buffer.from(':' + pat).toString('base64');

  return new Promise(function (resolve, reject) {
    var url = new URL('https://dev.azure.com/' + org + '/' + project + '/_apis/' + apiPath);
    if (!url.searchParams.has('api-version')) url.searchParams.set('api-version', '7.1');
    var opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json'
      }
    };
    var req = https.request(opts, function (resp) {
      var data = '';
      resp.on('data', function (c) { data += c; });
      resp.on('end', function () {
        try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: resp.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// DevOps Pilot internal API helper
// ---------------------------------------------------------------------------
function localApi(apiPath) {
  return new Promise(function (resolve, reject) {
    http.get('http://127.0.0.1:3800' + apiPath, function (resp) {
      var data = '';
      resp.on('data', function (c) { data += c; });
      resp.on('end', function () {
        try { resolve(JSON.parse(data)); }
        catch (_) { resolve(data); }
      });
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function formatDuration(ms) {
  if (!ms || ms <= 0) return '--';
  var seconds = Math.floor(ms / 1000);
  var m = Math.floor(seconds / 60);
  var s = seconds % 60;
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

function timeAgo(dateStr) {
  if (!dateStr) return '--';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function runDuration(run) {
  if (!run.startTime || !run.finishedDate) {
    if (!run.createdDate) return 0;
    return 0;
  }
  return new Date(run.finishedDate).getTime() - new Date(run.startTime).getTime();
}

function mapBuildStatus(result) {
  if (!result) return 'running';
  switch (result.toLowerCase()) {
    case 'succeeded': return 'succeeded';
    case 'partiallysucceeded': return 'partial';
    case 'failed': return 'failed';
    case 'canceled': case 'cancelled': return 'canceled';
    default: return result.toLowerCase();
  }
}

function parseConventionalCommit(message) {
  if (!message) return { type: 'other', subject: '' };
  var match = message.match(/^(\w+)(?:\(.+?\))?:\s*(.*)$/);
  if (match) return { type: match[1].toLowerCase(), subject: match[2] };
  return { type: 'other', subject: message.split('\n')[0] };
}

function groupWorkItemsByType(items) {
  var groups = {};
  for (var i = 0; i < items.length; i++) {
    var wi = items[i];
    var type = wi.type || wi.fields && wi.fields['System.WorkItemType'] || 'Other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(wi);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
module.exports = function (ctx) {
  var addPrefixRoute = ctx.addPrefixRoute;
  var json = ctx.json;
  var readBody = ctx.readBody;
  var getConfig = ctx.getConfig;

  addPrefixRoute(async function (req, res, url, subpath) {
    var method = req.method;
    var appCfg = getConfig();

    // -----------------------------------------------------------------------
    // GET /config -- return plugin config
    // -----------------------------------------------------------------------
    if (subpath === '/config' && method === 'GET') {
      return json(res, getCfg());
    }

    // -----------------------------------------------------------------------
    // POST /config -- save plugin config
    // -----------------------------------------------------------------------
    if (subpath === '/config' && method === 'POST') {
      var body = await readBody(req);
      var cfg = getCfg();
      if (body.defaultPipelineId !== undefined) cfg.defaultPipelineId = body.defaultPipelineId;
      if (body.conventionalCommits !== undefined) cfg.conventionalCommits = body.conventionalCommits;
      saveCfg(cfg);
      return json(res, { ok: true });
    }

    // -----------------------------------------------------------------------
    // GET /test -- validate ADO connection
    // -----------------------------------------------------------------------
    if (subpath === '/test' && method === 'GET') {
      if (!appCfg.AzureDevOpsPAT || !appCfg.AzureDevOpsOrg || !appCfg.AzureDevOpsProject) {
        return json(res, { ok: false, error: 'Azure DevOps is not configured in DevOps Pilot settings.' });
      }
      try {
        var r = await adoRequest('GET', 'pipelines?$top=1', appCfg);
        if (r.status === 200) return json(res, { ok: true, message: 'Connected to Azure DevOps.' });
        return json(res, { ok: false, error: 'ADO returned status ' + r.status });
      } catch (err) {
        return json(res, { ok: false, error: err.message });
      }
    }

    // -----------------------------------------------------------------------
    // GET /summary -- plain text summary
    // -----------------------------------------------------------------------
    if (subpath === '/summary' && method === 'GET') {
      if (!appCfg.AzureDevOpsPAT) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Release Manager -- not configured. Set Azure DevOps PAT in DevOps Pilot settings.');
        return true;
      }
      try {
        var defsResp = await adoRequest('GET', 'build/definitions?$top=50', appCfg);
        var defs = (defsResp.data && defsResp.data.value) || [];
        var lines = ['Release Manager -- ADO Pipelines', '==================================', ''];

        for (var di = 0; di < defs.length; di++) {
          var def = defs[di];
          var buildsResp = await adoRequest('GET', 'build/builds?definitions=' + def.id + '&$top=1', appCfg);
          var builds = (buildsResp.data && buildsResp.data.value) || [];
          var latest = builds[0];

          lines.push('Pipeline: ' + def.name + ' (ID: ' + def.id + ')');
          if (latest) {
            var status = mapBuildStatus(latest.result || (latest.status === 'inProgress' ? 'running' : latest.status));
            var dur = formatDuration(runDuration(latest));
            var branch = latest.sourceBranch ? latest.sourceBranch.replace('refs/heads/', '') : '--';
            var ago = timeAgo(latest.finishTime || latest.startTime || latest.queueTime);
            lines.push('  Last Run: #' + latest.buildNumber + ' ' + status + ' (' + dur + ') on ' + branch + ' -- ' + ago);
          } else {
            lines.push('  Last Run: none');
          }

          // Success rate from last 30 builds
          var recentResp = await adoRequest('GET', 'build/builds?definitions=' + def.id + '&$top=30', appCfg);
          var recent = (recentResp.data && recentResp.data.value) || [];
          var completed = recent.filter(function (b) { return b.result; });
          var succeeded = completed.filter(function (b) { return b.result === 'succeeded'; });
          if (completed.length > 0) {
            var rate = Math.round((succeeded.length / completed.length) * 100);
            lines.push('  Success Rate (recent): ' + rate + '% (' + succeeded.length + '/' + completed.length + ')');
          }

          var durations = completed.map(runDuration).filter(function (d) { return d > 0; });
          if (durations.length > 0) {
            var avg = durations.reduce(function (a, b) { return a + b; }, 0) / durations.length;
            lines.push('  Avg Duration: ' + formatDuration(avg));
          }

          lines.push('');
        }

        // Unreleased work items
        try {
          var wiData = await localApi('/api/workitems?state=Resolved');
          var wiList = (wiData && wiData.value) || (Array.isArray(wiData) ? wiData : []);
          if (wiList.length > 0) {
            lines.push('Unreleased Work Items (Resolved):');
            for (var wi = 0; wi < Math.min(wiList.length, 20); wi++) {
              var item = wiList[wi];
              var wiType = item.type || (item.fields && item.fields['System.WorkItemType']) || 'Item';
              var wiTitle = item.title || (item.fields && item.fields['System.Title']) || 'Untitled';
              var wiId = item.id || '';
              lines.push('  [' + wiType + '] AB#' + wiId + ' -- ' + wiTitle);
            }
            lines.push('');
          }
        } catch (_) {
          // work items fetch is best-effort
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(lines.join('\n'));
        return true;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error generating summary: ' + err.message);
        return true;
      }
    }

    // -----------------------------------------------------------------------
    // GET /pipelines -- list all pipelines with latest run status
    // -----------------------------------------------------------------------
    if (subpath === '/pipelines' && method === 'GET') {
      try {
        var defsResp = await adoRequest('GET', 'build/definitions?$top=100', appCfg);
        var defs = (defsResp.data && defsResp.data.value) || [];
        var pipelines = [];

        for (var i = 0; i < defs.length; i++) {
          var def = defs[i];
          var buildsResp = await adoRequest('GET', 'build/builds?definitions=' + def.id + '&$top=1', appCfg);
          var builds = (buildsResp.data && buildsResp.data.value) || [];
          var latest = builds[0] || null;

          var entry = {
            id: def.id,
            name: def.name,
            path: def.path,
            type: def.type,
            queueStatus: def.queueStatus,
            latestRun: null
          };

          if (latest) {
            entry.latestRun = {
              id: latest.id,
              buildNumber: latest.buildNumber,
              status: latest.status,
              result: mapBuildStatus(latest.result || (latest.status === 'inProgress' ? 'running' : latest.status)),
              branch: latest.sourceBranch ? latest.sourceBranch.replace('refs/heads/', '') : null,
              commit: latest.sourceVersion ? latest.sourceVersion.substring(0, 8) : null,
              duration: runDuration(latest),
              durationFormatted: formatDuration(runDuration(latest)),
              queueTime: latest.queueTime,
              startTime: latest.startTime,
              finishTime: latest.finishTime,
              timeAgo: timeAgo(latest.finishTime || latest.startTime || latest.queueTime),
              reason: latest.reason
            };
          }

          pipelines.push(entry);
        }

        return json(res, pipelines);
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // -----------------------------------------------------------------------
    // GET /pipelines/:id/runs -- list runs for a pipeline
    // -----------------------------------------------------------------------
    var runsMatch = subpath.match(/^\/pipelines\/(\d+)\/runs$/);
    if (runsMatch && method === 'GET') {
      var defId = runsMatch[1];
      var top = (url.searchParams && url.searchParams.get('$top')) || '30';
      try {
        var resp = await adoRequest('GET', 'build/builds?definitions=' + defId + '&$top=' + top, appCfg);
        var builds = (resp.data && resp.data.value) || [];
        var runs = builds.map(function (b) {
          return {
            id: b.id,
            buildNumber: b.buildNumber,
            status: b.status,
            result: mapBuildStatus(b.result || (b.status === 'inProgress' ? 'running' : b.status)),
            branch: b.sourceBranch ? b.sourceBranch.replace('refs/heads/', '') : null,
            commit: b.sourceVersion ? b.sourceVersion.substring(0, 8) : null,
            duration: runDuration(b),
            durationFormatted: formatDuration(runDuration(b)),
            queueTime: b.queueTime,
            startTime: b.startTime,
            finishTime: b.finishTime,
            timeAgo: timeAgo(b.finishTime || b.startTime || b.queueTime),
            reason: b.reason,
            requestedBy: b.requestedBy ? b.requestedBy.displayName : null
          };
        });
        return json(res, runs);
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // -----------------------------------------------------------------------
    // GET /pipelines/:id/runs/:runId -- run detail with timeline
    // -----------------------------------------------------------------------
    var runDetailMatch = subpath.match(/^\/pipelines\/(\d+)\/runs\/(\d+)$/);
    if (runDetailMatch && method === 'GET') {
      var buildId = runDetailMatch[2];
      try {
        var buildResp = await adoRequest('GET', 'build/builds/' + buildId, appCfg);
        var timelineResp = await adoRequest('GET', 'build/builds/' + buildId + '/timeline', appCfg);
        var changesResp = await adoRequest('GET', 'build/builds/' + buildId + '/changes', appCfg);
        var wiResp = await adoRequest('GET', 'build/builds/' + buildId + '/workitems', appCfg);

        var build = buildResp.data || {};
        var timeline = (timelineResp.data && timelineResp.data.records) || [];
        var changes = (changesResp.data && changesResp.data.value) || [];
        var workItems = (wiResp.data && wiResp.data.value) || [];

        // Parse timeline into stages
        var stages = timeline
          .filter(function (r) { return r.type === 'Stage'; })
          .map(function (r) {
            return {
              name: r.name,
              state: r.state,
              result: r.result,
              order: r.order,
              startTime: r.startTime,
              finishTime: r.finishTime,
              duration: (r.startTime && r.finishTime)
                ? formatDuration(new Date(r.finishTime).getTime() - new Date(r.startTime).getTime())
                : '--'
            };
          })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

        // Fetch work item details
        var wiDetails = [];
        for (var wi = 0; wi < workItems.length; wi++) {
          var wiId = workItems[wi].id;
          if (wiId) {
            try {
              var wiDetailResp = await adoRequest('GET', 'wit/workitems/' + wiId + '?$expand=none', appCfg);
              if (wiDetailResp.data && wiDetailResp.data.fields) {
                wiDetails.push({
                  id: wiDetailResp.data.id,
                  type: wiDetailResp.data.fields['System.WorkItemType'],
                  title: wiDetailResp.data.fields['System.Title'],
                  state: wiDetailResp.data.fields['System.State']
                });
              }
            } catch (_) {}
          }
        }

        var detail = {
          id: build.id,
          buildNumber: build.buildNumber,
          status: build.status,
          result: mapBuildStatus(build.result || (build.status === 'inProgress' ? 'running' : build.status)),
          branch: build.sourceBranch ? build.sourceBranch.replace('refs/heads/', '') : null,
          commit: build.sourceVersion || null,
          duration: runDuration(build),
          durationFormatted: formatDuration(runDuration(build)),
          reason: build.reason,
          requestedBy: build.requestedBy ? build.requestedBy.displayName : null,
          queueTime: build.queueTime,
          startTime: build.startTime,
          finishTime: build.finishTime,
          stages: stages,
          changes: changes.map(function (c) {
            return {
              id: c.id || null,
              message: c.message,
              author: c.author ? c.author.displayName : null,
              timestamp: c.timestamp,
              location: c.location
            };
          }),
          workItems: wiDetails
        };

        return json(res, detail);
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // -----------------------------------------------------------------------
    // GET /pipelines/:id/health -- success rate, avg duration, trends
    // -----------------------------------------------------------------------
    var healthMatch = subpath.match(/^\/pipelines\/(\d+)\/health$/);
    if (healthMatch && method === 'GET') {
      var defId = healthMatch[1];
      try {
        var resp = await adoRequest('GET', 'build/builds?definitions=' + defId + '&$top=50', appCfg);
        var builds = (resp.data && resp.data.value) || [];
        var completed = builds.filter(function (b) { return b.result; });
        var succeeded = completed.filter(function (b) { return b.result === 'succeeded'; });
        var failed = completed.filter(function (b) { return b.result === 'failed'; });
        var partial = completed.filter(function (b) { return b.result === 'partiallySucceeded'; });

        var durations = completed.map(runDuration).filter(function (d) { return d > 0; });
        var avgDuration = durations.length > 0
          ? durations.reduce(function (a, b) { return a + b; }, 0) / durations.length
          : 0;

        // Last 10 runs for trend
        var last10 = completed.slice(0, 10).map(function (b) {
          return {
            buildNumber: b.buildNumber,
            result: mapBuildStatus(b.result),
            duration: runDuration(b),
            finishTime: b.finishTime
          };
        });

        return json(res, {
          totalRuns: builds.length,
          completedRuns: completed.length,
          succeeded: succeeded.length,
          failed: failed.length,
          partial: partial.length,
          successRate: completed.length > 0 ? Math.round((succeeded.length / completed.length) * 100) : 0,
          avgDuration: avgDuration,
          avgDurationFormatted: formatDuration(avgDuration),
          last10: last10
        });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // -----------------------------------------------------------------------
    // GET /builds/:buildId/changes -- associated changes
    // -----------------------------------------------------------------------
    var changesMatch = subpath.match(/^\/builds\/(\d+)\/changes$/);
    if (changesMatch && method === 'GET') {
      var buildId = changesMatch[1];
      try {
        var resp = await adoRequest('GET', 'build/builds/' + buildId + '/changes', appCfg);
        var changes = (resp.data && resp.data.value) || [];
        var cfg = getCfg();
        var useConventional = cfg.conventionalCommits !== 'false';

        var result = changes.map(function (c) {
          var entry = {
            id: c.id || null,
            message: c.message,
            author: c.author ? c.author.displayName : null,
            timestamp: c.timestamp
          };
          if (useConventional) {
            var parsed = parseConventionalCommit(c.message);
            entry.conventionalType = parsed.type;
            entry.conventionalSubject = parsed.subject;
          }
          return entry;
        });

        return json(res, result);
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // -----------------------------------------------------------------------
    // GET /builds/:buildId/workitems -- associated work items
    // -----------------------------------------------------------------------
    var wiMatch = subpath.match(/^\/builds\/(\d+)\/workitems$/);
    if (wiMatch && method === 'GET') {
      var buildId = wiMatch[1];
      try {
        var resp = await adoRequest('GET', 'build/builds/' + buildId + '/workitems', appCfg);
        var items = (resp.data && resp.data.value) || [];
        var details = [];

        for (var i = 0; i < items.length; i++) {
          var wiId = items[i].id;
          if (wiId) {
            try {
              var wiResp = await adoRequest('GET', 'wit/workitems/' + wiId + '?$expand=none', appCfg);
              if (wiResp.data && wiResp.data.fields) {
                details.push({
                  id: wiResp.data.id,
                  type: wiResp.data.fields['System.WorkItemType'],
                  title: wiResp.data.fields['System.Title'],
                  state: wiResp.data.fields['System.State'],
                  assignedTo: wiResp.data.fields['System.AssignedTo']
                    ? wiResp.data.fields['System.AssignedTo'].displayName
                    : null
                });
              }
            } catch (_) {}
          }
        }

        return json(res, details);
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // -----------------------------------------------------------------------
    // POST /generate-notes -- generate release notes between two runs
    // -----------------------------------------------------------------------
    if (subpath === '/generate-notes' && method === 'POST') {
      var body = await readBody(req);
      var pipelineId = body.pipelineId;
      var fromRunId = body.fromRunId;
      var toRunId = body.toRunId;

      if (!pipelineId || !fromRunId || !toRunId) {
        return json(res, { error: 'pipelineId, fromRunId, and toRunId are required.' }, 400);
      }

      try {
        // Fetch both builds for context
        var fromResp = await adoRequest('GET', 'build/builds/' + fromRunId, appCfg);
        var toResp = await adoRequest('GET', 'build/builds/' + toRunId, appCfg);
        var fromBuild = fromResp.data || {};
        var toBuild = toResp.data || {};

        // Get all builds between from and to
        var allBuildsResp = await adoRequest('GET', 'build/builds?definitions=' + pipelineId + '&$top=200', appCfg);
        var allBuilds = (allBuildsResp.data && allBuildsResp.data.value) || [];

        // Filter builds between fromRunId and toRunId (by finish time)
        var fromTime = new Date(fromBuild.finishTime || fromBuild.startTime || fromBuild.queueTime).getTime();
        var toTime = new Date(toBuild.finishTime || toBuild.startTime || toBuild.queueTime).getTime();

        var relevantBuilds = allBuilds.filter(function (b) {
          var t = new Date(b.finishTime || b.startTime || b.queueTime).getTime();
          return t > fromTime && t <= toTime;
        });

        // Collect all changes and work items across relevant builds
        var allChanges = [];
        var allWorkItemIds = new Set();

        for (var i = 0; i < relevantBuilds.length; i++) {
          var bid = relevantBuilds[i].id;
          try {
            var cResp = await adoRequest('GET', 'build/builds/' + bid + '/changes', appCfg);
            var changes = (cResp.data && cResp.data.value) || [];
            allChanges = allChanges.concat(changes);
          } catch (_) {}
          try {
            var wResp = await adoRequest('GET', 'build/builds/' + bid + '/workitems', appCfg);
            var wis = (wResp.data && wResp.data.value) || [];
            wis.forEach(function (w) { if (w.id) allWorkItemIds.add(String(w.id)); });
          } catch (_) {}
        }

        // Fetch work item details
        var workItems = [];
        var wiIdArray = Array.from(allWorkItemIds);
        for (var j = 0; j < wiIdArray.length; j++) {
          try {
            var wiResp = await adoRequest('GET', 'wit/workitems/' + wiIdArray[j] + '?$expand=none', appCfg);
            if (wiResp.data && wiResp.data.fields) {
              workItems.push({
                id: wiResp.data.id,
                type: wiResp.data.fields['System.WorkItemType'],
                title: wiResp.data.fields['System.Title'],
                state: wiResp.data.fields['System.State']
              });
            }
          } catch (_) {}
        }

        // Group work items by type
        var grouped = groupWorkItemsByType(workItems);

        // Build markdown
        var md = [];
        md.push('# Release Notes');
        md.push('');
        md.push('**Pipeline:** ' + (fromBuild.definition ? fromBuild.definition.name : 'Pipeline ' + pipelineId));
        md.push('**From:** Run #' + (fromBuild.buildNumber || fromRunId) + ' (' + (fromBuild.finishTime ? new Date(fromBuild.finishTime).toISOString().split('T')[0] : '--') + ')');
        md.push('**To:** Run #' + (toBuild.buildNumber || toRunId) + ' (' + (toBuild.finishTime ? new Date(toBuild.finishTime).toISOString().split('T')[0] : '--') + ')');
        md.push('**Builds included:** ' + relevantBuilds.length);
        md.push('');

        if (workItems.length > 0) {
          md.push('## Work Items');
          md.push('');

          var typeOrder = ['Feature', 'User Story', 'Bug', 'Task', 'Epic'];
          var sortedTypes = Object.keys(grouped).sort(function (a, b) {
            var ai = typeOrder.indexOf(a);
            var bi = typeOrder.indexOf(b);
            if (ai === -1) ai = 99;
            if (bi === -1) bi = 99;
            return ai - bi;
          });

          for (var t = 0; t < sortedTypes.length; t++) {
            var typeName = sortedTypes[t];
            var items = grouped[typeName];
            md.push('### ' + typeName + 's');
            md.push('');
            for (var k = 0; k < items.length; k++) {
              md.push('- AB#' + items[k].id + ' -- ' + items[k].title);
            }
            md.push('');
          }
        } else {
          md.push('_No work items found between these runs._');
          md.push('');
        }

        if (allChanges.length > 0) {
          md.push('## Commits');
          md.push('');

          var cfg = getCfg();
          var useConventional = cfg.conventionalCommits !== 'false';

          if (useConventional) {
            var commitGroups = {};
            allChanges.forEach(function (c) {
              var parsed = parseConventionalCommit(c.message);
              if (!commitGroups[parsed.type]) commitGroups[parsed.type] = [];
              commitGroups[parsed.type].push({
                id: c.id ? c.id.substring(0, 8) : '--------',
                subject: parsed.subject || c.message,
                author: c.author ? c.author.displayName : 'unknown'
              });
            });

            var ctypes = Object.keys(commitGroups).sort();
            for (var ct = 0; ct < ctypes.length; ct++) {
              md.push('#### ' + ctypes[ct]);
              var entries = commitGroups[ctypes[ct]];
              for (var e = 0; e < entries.length; e++) {
                md.push('- `' + entries[e].id + '` ' + entries[e].subject + ' (' + entries[e].author + ')');
              }
              md.push('');
            }
          } else {
            for (var c = 0; c < allChanges.length; c++) {
              var ch = allChanges[c];
              var cid = ch.id ? ch.id.substring(0, 8) : '--------';
              var msg = ch.message ? ch.message.split('\n')[0] : '';
              var author = ch.author ? ch.author.displayName : 'unknown';
              md.push('- `' + cid + '` ' + msg + ' (' + author + ')');
            }
            md.push('');
          }
        }

        var markdown = md.join('\n');

        return json(res, {
          markdown: markdown,
          stats: {
            builds: relevantBuilds.length,
            commits: allChanges.length,
            workItems: workItems.length
          }
        });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // -----------------------------------------------------------------------
    // GET /unreleased -- work items resolved since last successful run
    // -----------------------------------------------------------------------
    if (subpath === '/unreleased' && method === 'GET') {
      var pipelineId = (url.searchParams && url.searchParams.get('pipelineId')) || getCfg().defaultPipelineId;

      try {
        var lastSuccessDate = null;

        if (pipelineId) {
          var buildsResp = await adoRequest('GET', 'build/builds?definitions=' + pipelineId + '&resultFilter=succeeded&$top=1', appCfg);
          var builds = (buildsResp.data && buildsResp.data.value) || [];
          if (builds.length > 0 && builds[0].finishTime) {
            lastSuccessDate = builds[0].finishTime;
          }
        }

        // Use DevOps Pilot API to fetch resolved work items
        var wiData = await localApi('/api/workitems?state=Resolved');
        var wiList = (wiData && wiData.value) || (Array.isArray(wiData) ? wiData : []);

        // If we have a last success date, filter to items changed after that
        var unreleased = wiList;
        if (lastSuccessDate) {
          var cutoff = new Date(lastSuccessDate).getTime();
          unreleased = wiList.filter(function (wi) {
            var changed = wi.changedDate || (wi.fields && wi.fields['System.ChangedDate']);
            if (!changed) return true; // include if no date info
            return new Date(changed).getTime() > cutoff;
          });
        }

        return json(res, {
          lastSuccessfulRun: lastSuccessDate,
          pipelineId: pipelineId || null,
          items: unreleased.map(function (wi) {
            return {
              id: wi.id,
              type: wi.type || (wi.fields && wi.fields['System.WorkItemType']) || 'Item',
              title: wi.title || (wi.fields && wi.fields['System.Title']) || 'Untitled',
              state: wi.state || (wi.fields && wi.fields['System.State']) || 'Resolved',
              assignedTo: wi.assignedTo || (wi.fields && wi.fields['System.AssignedTo'] && wi.fields['System.AssignedTo'].displayName) || null
            };
          })
        });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    // -----------------------------------------------------------------------
    // POST /changelog -- generate changelog from work items
    // -----------------------------------------------------------------------
    if (subpath === '/changelog' && method === 'POST') {
      var body = await readBody(req);
      var iterationPath = body.iterationPath;
      var fromDate = body.fromDate;
      var toDate = body.toDate;

      try {
        var wiList = [];

        if (iterationPath) {
          var wiData = await localApi('/api/workitems?iteration=' + encodeURIComponent(iterationPath));
          wiList = (wiData && wiData.value) || (Array.isArray(wiData) ? wiData : []);
        } else {
          var wiData = await localApi('/api/workitems');
          wiList = (wiData && wiData.value) || (Array.isArray(wiData) ? wiData : []);
        }

        // Filter to resolved/closed
        wiList = wiList.filter(function (wi) {
          var state = wi.state || (wi.fields && wi.fields['System.State']) || '';
          return state === 'Resolved' || state === 'Closed';
        });

        // Filter by date range if provided
        if (fromDate || toDate) {
          var from = fromDate ? new Date(fromDate).getTime() : 0;
          var to = toDate ? new Date(toDate).getTime() : Infinity;
          wiList = wiList.filter(function (wi) {
            var changed = wi.changedDate || (wi.fields && wi.fields['System.ChangedDate']);
            if (!changed) return true;
            var t = new Date(changed).getTime();
            return t >= from && t <= to;
          });
        }

        // Group by type
        var items = wiList.map(function (wi) {
          return {
            id: wi.id,
            type: wi.type || (wi.fields && wi.fields['System.WorkItemType']) || 'Item',
            title: wi.title || (wi.fields && wi.fields['System.Title']) || 'Untitled',
            state: wi.state || (wi.fields && wi.fields['System.State']) || ''
          };
        });

        var grouped = groupWorkItemsByType(items);

        // Build markdown
        var md = [];
        md.push('# Changelog');
        md.push('');
        if (iterationPath) md.push('**Iteration:** ' + iterationPath);
        if (fromDate) md.push('**From:** ' + fromDate);
        if (toDate) md.push('**To:** ' + toDate);
        md.push('**Total items:** ' + items.length);
        md.push('');

        var typeOrder = ['Feature', 'User Story', 'Bug', 'Task', 'Epic'];
        var sortedTypes = Object.keys(grouped).sort(function (a, b) {
          var ai = typeOrder.indexOf(a);
          var bi = typeOrder.indexOf(b);
          if (ai === -1) ai = 99;
          if (bi === -1) bi = 99;
          return ai - bi;
        });

        for (var t = 0; t < sortedTypes.length; t++) {
          var typeName = sortedTypes[t];
          var typeItems = grouped[typeName];
          md.push('### ' + typeName + 's');
          md.push('');
          for (var k = 0; k < typeItems.length; k++) {
            md.push('- AB#' + typeItems[k].id + ' -- ' + typeItems[k].title);
          }
          md.push('');
        }

        if (items.length === 0) {
          md.push('_No resolved or closed work items found for the given criteria._');
          md.push('');
        }

        return json(res, { markdown: md.join('\n'), totalItems: items.length });
      } catch (err) {
        return json(res, { error: err.message }, 500);
      }
    }

    return false;
  });
};
