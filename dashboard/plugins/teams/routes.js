/**
 * Teams Bridge Plugin -- Server-side API Routes
 * Proxies Microsoft Graph API for Teams messaging via OAuth2 delegated flow.
 * Credentials stored in config.json alongside this file.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const REDIRECT_URI = 'http://127.0.0.1:3800/api/plugins/teams/auth/callback';
const SCOPES = 'offline_access User.Read Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send Chat.ReadWrite ChatMessage.Send';

const configPath = path.join(__dirname, 'config.json');

// -- Helpers ------------------------------------------------------------------

function getCfg() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (_) { return { clientId: '', clientSecret: '', refreshToken: '', tenantId: 'common' }; }
}

function saveCfg(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
}

function hasCredentials(cfg) {
  return !!(cfg.clientId && cfg.clientSecret);
}

// -- OAuth2 -------------------------------------------------------------------

var tokenCache = { token: null, expiresAt: 0 };

function getAuthUrl(clientId, tenantId) {
  var tenant = tenantId || 'common';
  var authBase = 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/authorize';
  var params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    response_mode: 'query',
    prompt: 'consent'
  });
  return authBase + '?' + params.toString();
}

function exchangeCode(clientId, clientSecret, code, tenantId) {
  return new Promise(function(resolve, reject) {
    var tenant = tenantId || 'common';
    var tokenUrl = 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token';
    var body = new URLSearchParams({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: SCOPES
    }).toString();
    var url = new URL(tokenUrl);
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

function refreshAccessToken(clientId, clientSecret, refreshToken, tenantId) {
  return new Promise(function(resolve, reject) {
    var tenant = tenantId || 'common';
    var tokenUrl = 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token';
    var body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      scope: SCOPES
    }).toString();
    var url = new URL(tokenUrl);
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
            // Microsoft may rotate refresh tokens -- save new one if provided
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
      return reject(new Error('Not connected. Please sign in with Microsoft first.'));
    }
    if (!cfg.clientId || !cfg.clientSecret) {
      return reject(new Error('OAuth Client ID and Secret are not configured.'));
    }
    refreshAccessToken(cfg.clientId, cfg.clientSecret, cfg.refreshToken, cfg.tenantId).then(function(result) {
      tokenCache.token = result.access_token;
      tokenCache.expiresAt = Date.now() + ((result.expires_in || 3600) - 60) * 1000;
      // Save rotated refresh token if provided
      if (result.refresh_token && result.refresh_token !== cfg.refreshToken) {
        cfg.refreshToken = result.refresh_token;
        saveCfg(cfg);
      }
      resolve(result.access_token);
    }).catch(reject);
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
    if (body) {
      var bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
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

function graphGet(token, apiPath) {
  return httpsJson(GRAPH_API + apiPath, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
}

function graphPost(token, apiPath, body) {
  return httpsJson(GRAPH_API + apiPath, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  }, body);
}

// -- Message processing -------------------------------------------------------

function stripHtml(html) {
  if (!html) return '';
  // Replace <br> and <p> with newlines
  var text = html.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<at[^>]*>(.*?)<\/at>/gi, '@$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  var now = Date.now();
  var then = new Date(dateStr).getTime();
  var diff = now - then;
  if (diff < 0) return 'just now';
  var seconds = Math.floor(diff / 1000);
  if (seconds < 60) return seconds + 's ago';
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  var days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

function processMessage(msg) {
  if (!msg) return null;
  var from = (msg.from && msg.from.user) ? msg.from.user : {};
  var bodyContent = (msg.body && msg.body.content) ? msg.body.content : '';
  return {
    id: msg.id,
    text: stripHtml(bodyContent),
    html: bodyContent,
    from: {
      id: from.id || '',
      displayName: from.displayName || 'Unknown',
    },
    createdAt: msg.createdDateTime || '',
    relativeTime: relativeTime(msg.createdDateTime),
    replyCount: (msg.replies && msg.replies.length) || 0,
    importance: msg.importance || 'normal',
    messageType: msg.messageType || 'message',
    hasAttachments: !!(msg.attachments && msg.attachments.length),
  };
}

function processMessages(messages) {
  if (!messages || !Array.isArray(messages)) return [];
  return messages
    .filter(function(m) { return m.messageType === 'message'; })
    .map(processMessage)
    .filter(Boolean);
}

// -- User cache ---------------------------------------------------------------

var userCache = { users: null, expiresAt: 0 };

async function getTeamMembers(token) {
  if (userCache.users && Date.now() < userCache.expiresAt) {
    return userCache.users;
  }
  var r = await graphGet(token, '/me/joinedTeams');
  if (r.status !== 200 || !r.data || !r.data.value) return [];
  var teams = r.data.value;
  var usersMap = {};
  // Get members from first 3 teams to avoid too many calls
  var limit = Math.min(teams.length, 3);
  for (var i = 0; i < limit; i++) {
    try {
      var mr = await graphGet(token, '/teams/' + teams[i].id + '/members');
      if (mr.status === 200 && mr.data && mr.data.value) {
        mr.data.value.forEach(function(m) {
          if (m.userId && !usersMap[m.userId]) {
            usersMap[m.userId] = {
              id: m.userId,
              displayName: m.displayName || 'Unknown',
              email: m.email || ''
            };
          }
        });
      }
    } catch (_) {}
  }
  var users = Object.values(usersMap);
  userCache.users = users;
  userCache.expiresAt = Date.now() + 300000; // 5 min cache
  return users;
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

// -- Summary ------------------------------------------------------------------

async function buildSummary(token) {
  var lines = [];
  lines.push('=== Teams Bridge Summary ===');
  lines.push('Date: ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  lines.push('');

  // Get user info
  var me = await graphGet(token, '/me');
  if (me.status === 200 && me.data) {
    lines.push('Signed in as: ' + (me.data.displayName || 'Unknown') + ' (' + (me.data.mail || me.data.userPrincipalName || '') + ')');
  }
  lines.push('');

  // Get teams
  var tr = await graphGet(token, '/me/joinedTeams');
  var teams = (tr.status === 200 && tr.data && tr.data.value) ? tr.data.value : [];
  lines.push('Teams: ' + teams.length);
  lines.push('');

  for (var i = 0; i < teams.length; i++) {
    var t = teams[i];
    lines.push('  ' + t.displayName + (t.description ? ' -- ' + t.description : ''));
    // Get channels
    var cr = await graphGet(token, '/teams/' + t.id + '/channels');
    var channels = (cr.status === 200 && cr.data && cr.data.value) ? cr.data.value : [];
    for (var j = 0; j < channels.length; j++) {
      var ch = channels[j];
      var memberType = ch.membershipType === 'standard' ? '' : ' (' + ch.membershipType + ')';
      lines.push('    # ' + ch.displayName + memberType);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// -- Route Registration -------------------------------------------------------

module.exports = function ({ addPrefixRoute, json, readBody }) {

  addPrefixRoute(async function(req, res, url, subpath) {
    var method = req.method;

    try {
      // -- Auth: Start OAuth flow -----------------------------------------------
      if (subpath === '/auth/start' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.clientId || !cfg.clientSecret) {
          return json(res, { error: 'OAuth Client ID and Secret are not configured. Go to Settings > Plugins to add them.' });
        }
        var authUrl = getAuthUrl(cfg.clientId, cfg.tenantId);
        return json(res, { url: authUrl });
      }

      // -- Auth: OAuth callback -------------------------------------------------
      if (subpath === '/auth/callback' && method === 'GET') {
        var params = url.searchParams || new URL(url, 'http://localhost').searchParams;
        var code = params.get('code');
        var error = params.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackHtml(false, 'Microsoft returned an error: ' + error + '. Please try again.'));
          return true;
        }

        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackHtml(false, 'No authorization code received. Please try again.'));
          return true;
        }

        var cfg = getCfg();
        try {
          var tokens = await exchangeCode(cfg.clientId, cfg.clientSecret, code, cfg.tenantId);
          if (tokens.refresh_token) {
            cfg.refreshToken = tokens.refresh_token;
            saveCfg(cfg);
          }
          // Cache the access token
          tokenCache.token = tokens.access_token;
          tokenCache.expiresAt = Date.now() + ((tokens.expires_in || 3600) - 60) * 1000;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackHtml(true, 'Your Microsoft account has been connected. You can close this tab and return to DevOps Pilot.'));
          return true;
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(callbackHtml(false, 'Failed to exchange authorization code: ' + e.message));
          return true;
        }
      }

      // -- Auth: Status ---------------------------------------------------------
      if (subpath === '/auth/status' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.refreshToken) {
          return json(res, { connected: false, displayName: null, email: null, hasCredentials: hasCredentials(cfg) });
        }
        try {
          var token = await getAccessToken(cfg);
          var me = await graphGet(token, '/me');
          var displayName = (me.data && me.data.displayName) ? me.data.displayName : null;
          var email = (me.data && (me.data.mail || me.data.userPrincipalName)) ? (me.data.mail || me.data.userPrincipalName) : null;
          return json(res, { connected: true, displayName: displayName, email: email, hasCredentials: true });
        } catch (e) {
          return json(res, { connected: false, displayName: null, email: null, error: e.message, hasCredentials: hasCredentials(cfg) });
        }
      }

      // -- Auth: Disconnect -----------------------------------------------------
      if (subpath === '/auth/disconnect' && method === 'POST') {
        var cfg = getCfg();
        cfg.refreshToken = '';
        saveCfg(cfg);
        tokenCache = { token: null, expiresAt: 0 };
        userCache = { users: null, expiresAt: 0 };
        return json(res, { ok: true });
      }

      // -- Config ---------------------------------------------------------------
      if (subpath === '/config' && method === 'GET') {
        var cfg = getCfg();
        return json(res, {
          configured: !!(cfg.refreshToken && cfg.clientId && cfg.clientSecret),
          hasCredentials: hasCredentials(cfg),
          clientId: cfg.clientId || '',
          clientIdSet: !!cfg.clientId,
          clientSecretSet: !!cfg.clientSecret,
          refreshTokenSet: !!cfg.refreshToken,
          tenantId: cfg.tenantId || 'common'
        });
      }
      if (subpath === '/config' && method === 'POST') {
        var body = await readBody(req);
        var cfg = getCfg();
        if (body.clientId !== undefined) cfg.clientId = body.clientId;
        if (body.clientSecret !== undefined) cfg.clientSecret = body.clientSecret;
        if (body.tenantId !== undefined) cfg.tenantId = body.tenantId;
        saveCfg(cfg);
        return json(res, { ok: true });
      }

      // -- Test connection ------------------------------------------------------
      if (subpath === '/test' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { ok: false, error: 'Not connected' });
        try {
          var token = await getAccessToken(cfg);
          var me = await graphGet(token, '/me');
          if (me.status === 200 && me.data && me.data.displayName) {
            return json(res, { ok: true, user: { displayName: me.data.displayName, email: me.data.mail || me.data.userPrincipalName } });
          }
          return json(res, { ok: false, error: 'Auth failed (status ' + me.status + ')' });
        } catch (e) { return json(res, { ok: false, error: e.message }); }
      }

      // -- Summary (plain text) -------------------------------------------------
      if (subpath === '/summary' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.refreshToken) {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Teams Bridge not connected. Please sign in with Microsoft first.');
          return true;
        }
        try {
          var token = await getAccessToken(cfg);
          var summary = await buildSummary(token);
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(summary);
          return true;
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Error: ' + e.message);
          return true;
        }
      }

      // -- Teams ----------------------------------------------------------------
      if (subpath === '/teams' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        var token = await getAccessToken(cfg);
        var r = await graphGet(token, '/me/joinedTeams');
        if (r.status !== 200) return json(res, { error: 'Failed to fetch teams', details: r.data }, r.status);
        var teams = (r.data && r.data.value) ? r.data.value : [];
        return json(res, teams.map(function(t) {
          return { id: t.id, displayName: t.displayName, description: t.description || '' };
        }));
      }

      // -- Channels for a team --------------------------------------------------
      var channelsMatch = subpath.match(/^\/teams\/([^/]+)\/channels$/);
      if (channelsMatch && method === 'GET') {
        var teamId = channelsMatch[1];
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        var token = await getAccessToken(cfg);
        var r = await graphGet(token, '/teams/' + teamId + '/channels');
        if (r.status !== 200) return json(res, { error: 'Failed to fetch channels', details: r.data }, r.status);
        var channels = (r.data && r.data.value) ? r.data.value : [];
        return json(res, channels.map(function(ch) {
          return { id: ch.id, displayName: ch.displayName, description: ch.description || '', membershipType: ch.membershipType || 'standard' };
        }));
      }

      // -- Channel messages -----------------------------------------------------
      var msgMatch = subpath.match(/^\/channels\/([^/]+)\/([^/]+)\/messages$/);
      if (msgMatch && method === 'GET') {
        var teamId = msgMatch[1];
        var channelId = msgMatch[2];
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        var token = await getAccessToken(cfg);
        var top = url.searchParams ? url.searchParams.get('top') : null;
        if (!top) top = '30';
        var r = await graphGet(token, '/teams/' + teamId + '/channels/' + channelId + '/messages?$top=' + top);
        if (r.status !== 200) return json(res, { error: 'Failed to fetch messages', details: r.data }, r.status);
        var messages = (r.data && r.data.value) ? r.data.value : [];
        return json(res, processMessages(messages));
      }

      // -- Thread replies -------------------------------------------------------
      var replyMatch = subpath.match(/^\/channels\/([^/]+)\/([^/]+)\/messages\/([^/]+)\/replies$/);
      if (replyMatch && method === 'GET') {
        var teamId = replyMatch[1];
        var channelId = replyMatch[2];
        var messageId = replyMatch[3];
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        var token = await getAccessToken(cfg);
        var r = await graphGet(token, '/teams/' + teamId + '/channels/' + channelId + '/messages/' + messageId + '/replies');
        if (r.status !== 200) return json(res, { error: 'Failed to fetch replies', details: r.data }, r.status);
        var replies = (r.data && r.data.value) ? r.data.value : [];
        return json(res, processMessages(replies));
      }

      // -- Send message / reply -------------------------------------------------
      if (subpath === '/messages/send' && method === 'POST') {
        var body = await readBody(req);
        if (!body.teamId || !body.channelId || !body.text) {
          return json(res, { error: 'Missing required fields: teamId, channelId, text' }, 400);
        }
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        var token = await getAccessToken(cfg);
        var msgBody = { body: { contentType: 'html', content: body.text.replace(/\n/g, '<br>') } };
        var apiPath;
        if (body.messageId) {
          // Reply to thread
          apiPath = '/teams/' + body.teamId + '/channels/' + body.channelId + '/messages/' + body.messageId + '/replies';
        } else {
          // New message
          apiPath = '/teams/' + body.teamId + '/channels/' + body.channelId + '/messages';
        }
        var r = await graphPost(token, apiPath, msgBody);
        if (r.status === 201 || r.status === 200) {
          return json(res, { ok: true, message: processMessage(r.data) });
        }
        return json(res, { error: 'Failed to send message', details: r.data }, r.status);
      }

      // -- Chats (1:1 and group) ------------------------------------------------
      if (subpath === '/chats' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        var token = await getAccessToken(cfg);
        var r = await graphGet(token, '/me/chats?$expand=members&$top=30&$orderby=lastMessagePreview/createdDateTime desc');
        if (r.status !== 200) return json(res, { error: 'Failed to fetch chats', details: r.data }, r.status);
        var chats = (r.data && r.data.value) ? r.data.value : [];
        return json(res, chats.map(function(c) {
          var members = (c.members || []).map(function(m) {
            return { id: m.userId || '', displayName: m.displayName || 'Unknown', email: m.email || '' };
          });
          var topic = c.topic || '';
          if (!topic && members.length > 0) {
            // Build name from members (exclude self approximation -- just list all)
            topic = members.map(function(m) { return m.displayName; }).join(', ');
          }
          return {
            id: c.id,
            topic: topic,
            chatType: c.chatType || 'oneOnOne',
            members: members,
            lastActivity: (c.lastMessagePreview && c.lastMessagePreview.createdDateTime) ? c.lastMessagePreview.createdDateTime : '',
            lastPreview: (c.lastMessagePreview && c.lastMessagePreview.body && c.lastMessagePreview.body.content) ? stripHtml(c.lastMessagePreview.body.content).substring(0, 80) : ''
          };
        }));
      }

      // -- Chat messages --------------------------------------------------------
      var chatMsgMatch = subpath.match(/^\/chats\/([^/]+)\/messages$/);
      if (chatMsgMatch && method === 'GET') {
        var chatId = chatMsgMatch[1];
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        var token = await getAccessToken(cfg);
        var top = url.searchParams ? url.searchParams.get('top') : null;
        if (!top) top = '30';
        var r = await graphGet(token, '/chats/' + chatId + '/messages?$top=' + top);
        if (r.status !== 200) return json(res, { error: 'Failed to fetch chat messages', details: r.data }, r.status);
        var messages = (r.data && r.data.value) ? r.data.value : [];
        return json(res, processMessages(messages));
      }

      // -- Send chat message ----------------------------------------------------
      var chatSendMatch = subpath.match(/^\/chats\/([^/]+)\/send$/);
      if (chatSendMatch && method === 'POST') {
        var chatId = chatSendMatch[1];
        var body = await readBody(req);
        if (!body.text) return json(res, { error: 'Missing required field: text' }, 400);
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        var token = await getAccessToken(cfg);
        var msgBody = { body: { contentType: 'html', content: body.text.replace(/\n/g, '<br>') } };
        var r = await graphPost(token, '/chats/' + chatId + '/messages', msgBody);
        if (r.status === 201 || r.status === 200) {
          return json(res, { ok: true, message: processMessage(r.data) });
        }
        return json(res, { error: 'Failed to send message', details: r.data }, r.status);
      }

      // -- Users (cached team members) ------------------------------------------
      if (subpath === '/users' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.refreshToken) return json(res, { error: 'Not connected' }, 401);
        var token = await getAccessToken(cfg);
        var users = await getTeamMembers(token);
        return json(res, users);
      }

      // -- Not found ------------------------------------------------------------
      return json(res, { error: 'Unknown endpoint: ' + method + ' ' + subpath }, 404);

    } catch (e) {
      return json(res, { error: e.message || 'Internal server error' }, 500);
    }
  });
};
