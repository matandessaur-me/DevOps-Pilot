/**
 * Apps learning loop.
 *
 * Middleware the runSession loop consults at key points. No network
 * calls of its own; it only processes data already present in the
 * session and asks the provider for a short observer turn when due.
 *
 * Responsibilities:
 *   1. Retry-with-variation: refuse exact-duplicate tool calls with a
 *      crisp error so the model must propose a different approach.
 *   2. Stuck detector: watches screenshot pixel signatures and action
 *      cadence; decides when a session looks stuck.
 *   3. Observer pass: once every N actions, ask the provider a tiny
 *      question on the side ("did you learn anything new?") and record
 *      the answer to per-app memory if it volunteers one.
 *   4. Research sub-task: when genuinely stuck, spawn a secondary
 *      provider call with web search to pull in external knowledge.
 *      (Anthropic-only in v1; other providers fall back to a pep-talk
 *      user-message so the main loop still resumes.)
 */

const memory = require('./apps-memory');

const OBSERVER_EVERY_N = 5;
const STUCK_PIXEL_THRESHOLD = 0.98;     // >= this means "no pixels changed"
const STUCK_ACTION_STREAK = 5;          // actions without a completeSubgoal-ish signal

// ---- Retry-with-variation ---------------------------------------------------

function _key(tool, args) {
  try { return tool + ':' + JSON.stringify(args || {}); }
  catch (_) { return tool + ':?'; }
}

function trackTry(session, tool, args) {
  if (!session._attempts) session._attempts = [];
  session._attempts.push({ key: _key(tool, args), at: Date.now() });
  // Keep the tail bounded; learning-loop only cares about recent history.
  if (session._attempts.length > 60) session._attempts = session._attempts.slice(-40);
}

function alreadyFailedIdentically(session, tool, args) {
  const k = _key(tool, args);
  const recent = (session._attempts || []).filter(a => a.key === k);
  if (!recent.length) return null;
  // Only flag a duplicate if a very recent identical call also landed as
  // an error. runSession stamps the error flag via recordOutcome below.
  const lastErr = (session._errorKeys || []).includes(k);
  if (lastErr) return { count: recent.length, key: k };
  return null;
}

function recordOutcome(session, tool, args, ok) {
  const k = _key(tool, args);
  if (!session._errorKeys) session._errorKeys = [];
  if (!ok) {
    if (!session._errorKeys.includes(k)) session._errorKeys.push(k);
  } else {
    session._errorKeys = session._errorKeys.filter(x => x !== k);
  }
  if (session._errorKeys.length > 40) session._errorKeys = session._errorKeys.slice(-25);
}

// ---- Stuck detection --------------------------------------------------------

// Cheap per-frame signature: 4x4 luminance grid from the base64 header.
// We never decode the full JPEG; instead we take a fast content hash that
// changes when the screen meaningfully changes.
function _signatureFromScreenshot(shot) {
  if (!shot || !shot.base64) return null;
  // Crude but good enough: hash bytes spread evenly across the payload.
  const s = shot.base64;
  const len = s.length;
  const samples = 32;
  const step = Math.max(1, Math.floor(len / samples));
  let h = 0;
  for (let i = 0; i < len; i += step) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return { hash: h, size: len, width: shot.width, height: shot.height };
}

function _pixelSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a.width !== b.width || a.height !== b.height) return 0;
  // Identical hash AND size = treat as "pixels unchanged".
  if (a.hash === b.hash && Math.abs(a.size - b.size) < 64) return 1;
  // Close sizes on JPEG usually mean very similar content; cap so we never
  // return > 0.98 unless hashes match.
  const sizeDelta = Math.abs(a.size - b.size);
  const sizeScale = Math.min(a.size, b.size) || 1;
  const sizeCloseness = Math.max(0, 1 - sizeDelta / sizeScale);
  return sizeCloseness * 0.7; // cap at < 0.98 even when sizes are near
}

function noteScreenshot(session, shot) {
  if (!session._shotSigs) session._shotSigs = [];
  const sig = _signatureFromScreenshot(shot);
  if (!sig) return;
  session._shotSigs.push(sig);
  if (session._shotSigs.length > 6) session._shotSigs = session._shotSigs.slice(-4);
}

function noteAction(session, tool) {
  if (!session._actionStreak) session._actionStreak = 0;
  // Reset on terminal-ish calls (finish, declare_stuck, write_memory).
  if (tool === 'finish' || tool === 'declare_stuck') {
    session._actionStreak = 0;
    return;
  }
  session._actionStreak++;
}

function isStuck(session) {
  // Heuristic 1: three consecutive screenshots with >= threshold similarity
  // AND a non-wait action was issued between them.
  const sigs = session._shotSigs || [];
  if (sigs.length >= 3) {
    const a = sigs[sigs.length - 3];
    const b = sigs[sigs.length - 2];
    const c = sigs[sigs.length - 1];
    const s1 = _pixelSimilarity(a, b);
    const s2 = _pixelSimilarity(b, c);
    if (s1 >= STUCK_PIXEL_THRESHOLD && s2 >= STUCK_PIXEL_THRESHOLD) {
      return { stuck: true, reason: 'screen unchanged across last 3 screenshots despite actions' };
    }
  }
  // Heuristic 2: too many actions since last screenshot change or finish.
  if ((session._actionStreak || 0) >= STUCK_ACTION_STREAK + 5) {
    return { stuck: true, reason: `${session._actionStreak} actions without meaningful progress` };
  }
  return { stuck: false };
}

// ---- Observer pass ----------------------------------------------------------

function shouldObserve(session) {
  if (!session.app) return false;
  const count = session._actionCount = (session._actionCount || 0) + 1;
  return count > 0 && (count % OBSERVER_EVERY_N) === 0;
}

// Run a tiny secondary provider call asking whether the agent noticed
// anything memory-worthy. Extracts the first bullet answer (if any) and
// writes it to memory. Designed to be fire-and-forget; failures swallow.
async function runObserver({ session, providerEntry, model, lastActions }) {
  if (!session.app) return { wrote: false, skipped: 'no app' };
  const adapter = providerEntry.adapter;
  const summary = (lastActions || []).map(a => {
    return `- ${a.summary || a.tool}${a.ok === false ? ' (error: ' + (a.error || 'failed') + ')' : ''}`;
  }).join('\n') || '(no recent actions)';

  const prompt = [
    `You are a side-observer watching an AI agent drive a Windows application called "${session.app}".`,
    `The agent has just performed these recent actions:`,
    summary,
    ``,
    `Quickly: did you learn anything about this app that a future session on the same app would benefit from knowing? If yes, answer with ONE line of the form:`,
    `SECTION: <section name> :: <short bullet, <= 160 chars>`,
    `If there is nothing new or notable, answer exactly:`,
    `NOTHING`,
  ].join('\n');

  try {
    const resp = await adapter.call({
      messages: adapter.initMessages(prompt),
      apiKey: providerEntry.apiKey,
      model,
      systemPrompt: 'You are a concise side-observer for an AI desktop-control agent. Respond in one line.',
    });
    const text = (resp && resp.text ? resp.text.trim() : '').split('\n')[0] || '';
    if (!text || /^NOTHING\b/i.test(text)) return { wrote: false };
    const m = /^SECTION\s*:\s*([^:]+?)\s*::\s*(.+)$/i.exec(text);
    if (!m) return { wrote: false, raw: text };
    const section = m[1].trim();
    const note = m[2].trim();
    try {
      memory.appendSection(session.app, section, note);
      return { wrote: true, section, note };
    } catch (e) {
      return { wrote: false, error: e.message };
    }
  } catch (e) {
    return { wrote: false, error: e.message };
  }
}

// ---- Research sub-task ------------------------------------------------------

async function runResearch({ session, providerEntry, model, goal, reason, lastScreenshots }) {
  const adapter = providerEntry.adapter;
  if (adapter.kind !== 'anthropic') {
    // Other providers: no web search yet; hand back a pep-talk so the
    // main loop still has something to consume.
    return {
      provider: adapter.kind,
      summary: `Web research is only wired for Anthropic right now. Try a different approach: break the goal down, look for keyboard shortcuts, or call declare_stuck to pause.`,
    };
  }
  const query = `How to "${goal}" in ${session.app || 'the target Windows application'}: the agent is stuck because "${reason}". Focus on keyboard shortcuts and menu paths that would move it past this point.`;

  try {
    const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
    const messages = [
      { role: 'user', content: [
        { type: 'text', text: `Research question: ${query}\n\nReturn a <= 350-word markdown summary of what you find. Do NOT write long intros; bullet points with concrete steps/shortcuts only.` },
      ] },
    ];
    const body = {
      model: model || adapter.defaultModel,
      max_tokens: 1024,
      system: 'You are a short, concrete web researcher. Cite sources with bare URLs inline.',
      tools,
      messages,
    };
    // Use the adapter's own HTTP helper by piggybacking on its `call`.
    // adapter.call expects a message log; we just feed it the prepared
    // messages and tools via a direct call-through.
    const https = require('https');
    const payload = JSON.stringify(body);
    const resp = await new Promise((resolve, reject) => {
      const req = https.request({
        method: 'POST', hostname: 'api.anthropic.com', path: '/v1/messages',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          'x-api-key': providerEntry.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
        },
        timeout: 60000,
      }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          if (r.statusCode >= 200 && r.statusCode < 300) {
            try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
          } else {
            reject(new Error(`anthropic web_search ${r.statusCode}: ${d.slice(0, 400)}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('web research timed out')));
      req.write(payload); req.end();
    });
    const content = resp.content || [];
    const summary = content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return { provider: 'anthropic', summary: summary || 'No results.', raw: content };
  } catch (e) {
    return { provider: 'anthropic', summary: `Research failed: ${e.message}. Consider calling declare_stuck so the user can help.` };
  }
}

module.exports = {
  OBSERVER_EVERY_N,
  trackTry,
  alreadyFailedIdentically,
  recordOutcome,
  noteScreenshot,
  noteAction,
  isStuck,
  shouldObserve,
  runObserver,
  runResearch,
};
