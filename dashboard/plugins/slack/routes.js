/**
 * Slack Bridge Plugin -- Server-side API Routes
 * Proxies Slack Web API for channel reading, message posting, and search.
 * Credentials stored in config.json alongside this file.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SLACK_API = 'https://slack.com/api';
const configPath = path.join(__dirname, 'config.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCfg() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (_) { return { botToken: '' }; }
}

function saveCfg(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
}

function slackApi(method, token, params) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify(params || {});
    var url = new URL(SLACK_API + '/' + method);
    var opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    var req = https.request(opts, function (resp) {
      var data = '';
      resp.on('data', function (c) { data += c; });
      resp.on('end', function () {
        try { resolve(JSON.parse(data)); }
        catch (_) { resolve({ ok: false, error: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Caches ───────────────────────────────────────────────────────────────────

var channelCache = { data: null, ts: 0 };
var userCache = { data: null, ts: 0 };
var CHANNEL_TTL = 60 * 1000;   // 60 seconds
var USER_TTL = 5 * 60 * 1000;  // 5 minutes

async function getChannelsCached(token) {
  if (channelCache.data && (Date.now() - channelCache.ts) < CHANNEL_TTL) {
    return channelCache.data;
  }
  var allChannels = [];
  var cursor = '';
  do {
    var params = { types: 'public_channel,private_channel,mpim,im', limit: 200, exclude_archived: true };
    if (cursor) params.cursor = cursor;
    var r = await slackApi('conversations.list', token, params);
    if (!r.ok) throw new Error(r.error || 'conversations.list failed');
    allChannels = allChannels.concat(r.channels || []);
    cursor = (r.response_metadata && r.response_metadata.next_cursor) || '';
  } while (cursor);
  channelCache.data = allChannels;
  channelCache.ts = Date.now();
  return allChannels;
}

async function getUsersCached(token) {
  if (userCache.data && (Date.now() - userCache.ts) < USER_TTL) {
    return userCache.data;
  }
  var allUsers = [];
  var cursor = '';
  do {
    var params = { limit: 200 };
    if (cursor) params.cursor = cursor;
    var r = await slackApi('users.list', token, params);
    if (!r.ok) throw new Error(r.error || 'users.list failed');
    allUsers = allUsers.concat(r.members || []);
    cursor = (r.response_metadata && r.response_metadata.next_cursor) || '';
  } while (cursor);
  userCache.data = allUsers;
  userCache.ts = Date.now();
  return allUsers;
}

function buildUserMap(users) {
  var map = {};
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    map[u.id] = u.profile && u.profile.display_name ? u.profile.display_name : (u.real_name || u.name || u.id);
  }
  return map;
}

function resolveUserMentions(text, userMap) {
  if (!text) return text;
  return text.replace(/<@(U[A-Z0-9]+)>/g, function (match, uid) {
    return '@' + (userMap[uid] || uid);
  });
}

function formatMessage(msg, userMap) {
  return {
    ts: msg.ts,
    threadTs: msg.thread_ts || null,
    replyCount: msg.reply_count || 0,
    user: msg.user || (msg.bot_id ? 'bot:' + msg.bot_id : 'unknown'),
    userName: userMap[msg.user] || (msg.username || (msg.bot_profile && msg.bot_profile.name) || msg.user || 'Unknown'),
    text: resolveUserMentions(msg.text || '', userMap),
    reactions: (msg.reactions || []).map(function (r) { return { name: r.name, count: r.count }; }),
    files: (msg.files || []).map(function (f) { return { name: f.name, url: f.url_private, mimetype: f.mimetype }; }),
    edited: !!(msg.edited),
    botId: msg.bot_id || null,
    subtype: msg.subtype || null
  };
}

// ── Route Registration ───────────────────────────────────────────────────────

module.exports = function (ctx) {
  var addPrefixRoute = ctx.addPrefixRoute;
  var json = ctx.json;
  var readBody = ctx.readBody;

  addPrefixRoute(async function (req, res, url, subpath) {
    var method = req.method;

    try {
      // ── Config ─────────────────────────────────────────────────────────
      if (subpath === '/config' && method === 'GET') {
        var cfg = getCfg();
        return json(res, {
          configured: !!cfg.botToken,
          botToken: cfg.botToken || '',
          botTokenSet: !!cfg.botToken
        });
      }

      if (subpath === '/config' && method === 'POST') {
        var body = await readBody(req);
        var cfg = getCfg();
        if (body.botToken !== undefined) cfg.botToken = body.botToken;
        saveCfg(cfg);
        // Invalidate caches on config change
        channelCache.data = null;
        userCache.data = null;
        return json(res, { ok: true });
      }

      // ── Test ───────────────────────────────────────────────────────────
      if (subpath === '/test' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { ok: false, error: 'Not configured' });
        try {
          var r = await slackApi('auth.test', cfg.botToken, {});
          if (r.ok) return json(res, { ok: true, team: r.team, user: r.user, teamId: r.team_id });
          return json(res, { ok: false, error: r.error || 'Auth failed' });
        } catch (e) {
          return json(res, { ok: false, error: e.message });
        }
      }

      // ── Summary (plain text) ───────────────────────────────────────────
      if (subpath === '/summary' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var authR = await slackApi('auth.test', cfg.botToken, {});
        if (!authR.ok) return json(res, { error: 'Auth failed: ' + authR.error }, 401);

        var channels = await getChannelsCached(cfg.botToken);
        var publicCount = 0, privateCount = 0, imCount = 0, mpimCount = 0;
        for (var i = 0; i < channels.length; i++) {
          if (channels[i].is_im) imCount++;
          else if (channels[i].is_mpim) mpimCount++;
          else if (channels[i].is_private) privateCount++;
          else publicCount++;
        }

        var lines = [
          'Slack Workspace Summary',
          '=======================',
          '',
          'Workspace: ' + (authR.team || 'Unknown'),
          'Bot User: ' + (authR.user || 'Unknown'),
          '',
          'Channels: ' + channels.length + ' total',
          '  Public: ' + publicCount,
          '  Private: ' + privateCount,
          '  Direct Messages: ' + imCount,
          '  Group DMs: ' + mpimCount,
          ''
        ];

        // Show top 10 channels by name
        var named = channels.filter(function (c) { return !c.is_im && !c.is_mpim; })
          .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
        if (named.length > 0) {
          lines.push('Channels:');
          for (var j = 0; j < Math.min(named.length, 20); j++) {
            var ch = named[j];
            var prefix = ch.is_private ? '(private)' : '#';
            var members = ch.num_members !== undefined ? ' (' + ch.num_members + ' members)' : '';
            lines.push('  ' + prefix + ' ' + ch.name + members);
          }
          if (named.length > 20) lines.push('  ... +' + (named.length - 20) + ' more');
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(lines.join('\n'));
      }

      // ── Channels ───────────────────────────────────────────────────────
      if (subpath === '/channels' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var channels = await getChannelsCached(cfg.botToken);
        var users = await getUsersCached(cfg.botToken);
        var userMap = buildUserMap(users);

        var result = channels.map(function (ch) {
          var name = ch.name || '';
          // For IMs, resolve the user name
          if (ch.is_im && ch.user) {
            name = userMap[ch.user] || ch.user;
          }
          return {
            id: ch.id,
            name: name,
            isPrivate: !!ch.is_private,
            isIm: !!ch.is_im,
            isMpim: !!ch.is_mpim,
            numMembers: ch.num_members || 0,
            topic: ch.topic ? ch.topic.value : '',
            purpose: ch.purpose ? ch.purpose.value : '',
            updated: ch.updated || 0
          };
        });

        return json(res, result);
      }

      // ── Channel Messages ───────────────────────────────────────────────
      var msgMatch = subpath.match(/^\/channels\/([^/]+)\/messages$/);
      if (msgMatch && method === 'GET') {
        var channelId = msgMatch[1];
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var limit = parseInt(url.searchParams.get('limit') || '30', 10);
        if (limit < 1) limit = 1;
        if (limit > 100) limit = 100;

        var r = await slackApi('conversations.history', cfg.botToken, { channel: channelId, limit: limit });
        if (!r.ok) return json(res, { error: r.error || 'Failed to fetch messages' }, 400);

        var users = await getUsersCached(cfg.botToken);
        var userMap = buildUserMap(users);

        var messages = (r.messages || []).map(function (m) { return formatMessage(m, userMap); });
        return json(res, messages);
      }

      // ── Thread Replies ─────────────────────────────────────────────────
      var threadMatch = subpath.match(/^\/channels\/([^/]+)\/thread\/([0-9.]+)$/);
      if (threadMatch && method === 'GET') {
        var channelId = threadMatch[1];
        var threadTs = threadMatch[2];
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var r = await slackApi('conversations.replies', cfg.botToken, { channel: channelId, ts: threadTs, limit: 100 });
        if (!r.ok) return json(res, { error: r.error || 'Failed to fetch thread' }, 400);

        var users = await getUsersCached(cfg.botToken);
        var userMap = buildUserMap(users);

        var messages = (r.messages || []).map(function (m) { return formatMessage(m, userMap); });
        return json(res, messages);
      }

      // ── Send Message ───────────────────────────────────────────────────
      if (subpath === '/messages/send' && method === 'POST') {
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var body = await readBody(req);
        if (!body.channel || !body.text) return json(res, { error: 'channel and text are required' }, 400);

        var params = { channel: body.channel, text: body.text };
        if (body.threadTs) params.thread_ts = body.threadTs;

        var r = await slackApi('chat.postMessage', cfg.botToken, params);
        if (!r.ok) return json(res, { error: r.error || 'Failed to send message' }, 400);

        return json(res, { ok: true, ts: r.ts, channel: r.channel });
      }

      // ── React to Message ───────────────────────────────────────────────
      if (subpath === '/messages/react' && method === 'POST') {
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var body = await readBody(req);
        if (!body.channel || !body.timestamp || !body.name) {
          return json(res, { error: 'channel, timestamp, and name are required' }, 400);
        }

        var r = await slackApi('reactions.add', cfg.botToken, {
          channel: body.channel, timestamp: body.timestamp, name: body.name
        });
        if (!r.ok) return json(res, { error: r.error || 'Failed to add reaction' }, 400);

        return json(res, { ok: true });
      }

      // ── Search Messages ────────────────────────────────────────────────
      if (subpath === '/messages/search' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var query = url.searchParams.get('query');
        if (!query) return json(res, { error: 'query parameter is required' }, 400);

        // search.messages requires a user token (xoxp-), bot tokens may not work
        // We attempt it and return a helpful error if it fails
        var r = await slackApi('search.messages', cfg.botToken, { query: query, count: 20, sort: 'timestamp' });
        if (!r.ok) {
          if (r.error === 'not_allowed_token_type' || r.error === 'missing_scope') {
            return json(res, { error: 'Search requires a user token (xoxp-) with search:read scope. Bot tokens cannot search.' }, 403);
          }
          return json(res, { error: r.error || 'Search failed' }, 400);
        }

        var users = await getUsersCached(cfg.botToken);
        var userMap = buildUserMap(users);

        var matches = ((r.messages && r.messages.matches) || []).map(function (m) {
          return {
            ts: m.ts,
            channel: m.channel ? m.channel.id : null,
            channelName: m.channel ? m.channel.name : 'unknown',
            user: m.user || m.username || 'unknown',
            userName: userMap[m.user] || m.username || m.user || 'Unknown',
            text: resolveUserMentions(m.text || '', userMap),
            permalink: m.permalink || null
          };
        });

        return json(res, { total: (r.messages && r.messages.total) || 0, matches: matches });
      }

      // ── Users ──────────────────────────────────────────────────────────
      if (subpath === '/users' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var users = await getUsersCached(cfg.botToken);
        var result = users.filter(function (u) { return !u.deleted && !u.is_bot && u.id !== 'USLACKBOT'; }).map(function (u) {
          return {
            id: u.id,
            name: u.name,
            realName: u.real_name || u.name,
            displayName: (u.profile && u.profile.display_name) || u.real_name || u.name,
            email: u.profile ? u.profile.email : null,
            avatar: u.profile ? u.profile.image_48 : null,
            isAdmin: !!u.is_admin,
            isOwner: !!u.is_owner,
            tz: u.tz || null
          };
        });

        return json(res, result);
      }

      // ── User Detail ────────────────────────────────────────────────────
      var userMatch = subpath.match(/^\/users\/([^/]+)$/);
      if (userMatch && method === 'GET') {
        var userId = userMatch[1];
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var r = await slackApi('users.info', cfg.botToken, { user: userId });
        if (!r.ok) return json(res, { error: r.error || 'Failed to fetch user' }, 400);

        var u = r.user;
        return json(res, {
          id: u.id,
          name: u.name,
          realName: u.real_name || u.name,
          displayName: (u.profile && u.profile.display_name) || u.real_name || u.name,
          email: u.profile ? u.profile.email : null,
          avatar: u.profile ? u.profile.image_72 : null,
          isAdmin: !!u.is_admin,
          isOwner: !!u.is_owner,
          title: u.profile ? u.profile.title : '',
          tz: u.tz || null,
          status: u.profile ? (u.profile.status_text || '') : ''
        });
      }

      // ── Channel Info ───────────────────────────────────────────────────
      var chanInfoMatch = subpath.match(/^\/channels\/([^/]+)$/);
      if (chanInfoMatch && method === 'GET') {
        var channelId = chanInfoMatch[1];
        var cfg = getCfg();
        if (!cfg.botToken) return json(res, { error: 'Not configured' }, 401);

        var r = await slackApi('conversations.info', cfg.botToken, { channel: channelId });
        if (!r.ok) return json(res, { error: r.error || 'Failed to fetch channel info' }, 400);

        var ch = r.channel;
        return json(res, {
          id: ch.id,
          name: ch.name || '',
          isPrivate: !!ch.is_private,
          isIm: !!ch.is_im,
          topic: ch.topic ? ch.topic.value : '',
          purpose: ch.purpose ? ch.purpose.value : '',
          numMembers: ch.num_members || 0,
          created: ch.created || 0,
          creator: ch.creator || ''
        });
      }

      // Unknown route
      return false;

    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  });
};
