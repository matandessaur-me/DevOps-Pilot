'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { extractCliDrawers } = require('./cli-drawers');

function makeFakeManifest() {
  const map = new Map();
  return { get: (k) => map.get(k) || null, set: (k, v) => map.set(k, { ...v }), _peek: () => map };
}

test('extractCliDrawers returns the right shape with no sessions on disk', () => {
  const manifest = makeFakeManifest();
  const r = extractCliDrawers({ activeRepoPath: '/no/such', manifest });
  assert.equal(typeof r.drawersEmitted, 'number');
  assert.equal(typeof r.skippedUnchanged, 'number');
  assert.ok(Array.isArray(r.nodes));
  assert.ok(Array.isArray(r.edges));
});

test('drawer extraction: synthesized session yields one drawer per message, deterministic ID, idempotent skip on second run', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-drawers-'));
  const projDir = path.join(tmpHome, '.claude', 'projects', 'test-slug');
  fs.mkdirSync(projDir, { recursive: true });
  const sessionFile = path.join(projDir, 'sess-xyz.jsonl');
  // 3 user messages + 2 assistant messages = 5 drawers expected
  const lines = [
    { type: 'user',      message: { content: 'first user prompt' },                       timestamp: '2026-04-01T00:00:00Z', cwd: tmpHome },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'first reply' }] },   timestamp: '2026-04-01T00:00:01Z' },
    { type: 'user',      message: { content: 'second user prompt' },                      timestamp: '2026-04-01T00:00:02Z' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'second reply' }, { type: 'tool_use', name: 'Read' }] }, timestamp: '2026-04-01T00:00:03Z' },
    { type: 'user',      message: { content: 'third prompt' },                            timestamp: '2026-04-01T00:00:04Z' },
  ];
  fs.writeFileSync(sessionFile, lines.map(l => JSON.stringify(l)).join('\n') + '\n');

  const realHomedir = os.homedir;
  os.homedir = () => tmpHome;
  try {
    const manifest = makeFakeManifest();
    const r1 = extractCliDrawers({ activeRepoPath: tmpHome, manifest, incremental: true });
    assert.equal(r1.scanned, 1);
    assert.equal(r1.drawersEmitted, 5);
    assert.equal(r1.nodes.length, 5);
    assert.equal(r1.edges.length, 5);
    // Each drawer's ID must be deterministic and follow the spec
    for (const n of r1.nodes) {
      assert.match(n.id, /^drawer_claude_sess_xyz_\d+$/);
      assert.equal(n.kind, 'drawer');
      assert.ok(typeof n.content === 'string' && n.content.length > 0);
      assert.ok(['user', 'assistant'].includes(n.role));
    }
    // Edges link drawers to the session node
    for (const e of r1.edges) {
      assert.match(e.target, /^clisess_claude_sess_xyz/);
      assert.equal(e.relation, 'derived_from');
    }
    // Tool-use blocks are kept as bracketed pointers (verbatim of structure)
    const toolDrawer = r1.nodes.find(n => n.content && n.content.includes('[tool_use: Read]'));
    assert.ok(toolDrawer, 'tool_use should be preserved in drawer content');

    // Second incremental run -- mtime unchanged -- skips entirely
    const r2 = extractCliDrawers({ activeRepoPath: tmpHome, manifest, incremental: true });
    assert.equal(r2.scanned, 0);
    assert.equal(r2.drawersEmitted, 0);
    assert.ok(r2.skippedUnchanged >= 1);
    // Full rebuild does NOT skip
    const r3 = extractCliDrawers({ activeRepoPath: tmpHome, manifest, incremental: false });
    assert.equal(r3.scanned, 1);
    assert.equal(r3.drawersEmitted, 5);
  } finally {
    os.homedir = realHomedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('drawer cap: messages beyond maxMsgsPerSession are dropped (newest kept)', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-drawers-cap-'));
  const projDir = path.join(tmpHome, '.claude', 'projects', 'cap-slug');
  fs.mkdirSync(projDir, { recursive: true });
  const sessionFile = path.join(projDir, 'cap.jsonl');
  const lines = [];
  for (let i = 0; i < 10; i++) {
    lines.push({ type: 'user', message: { content: `msg ${i}` }, timestamp: `2026-04-01T00:00:0${i}Z`, cwd: tmpHome });
  }
  fs.writeFileSync(sessionFile, lines.map(l => JSON.stringify(l)).join('\n') + '\n');

  const realHomedir = os.homedir;
  os.homedir = () => tmpHome;
  try {
    const r = extractCliDrawers({ activeRepoPath: tmpHome, maxMsgsPerSession: 3 });
    assert.equal(r.drawersEmitted, 3);
    // Newest 3 messages: idx 7, 8, 9
    const ids = r.nodes.map(n => n.id).sort();
    assert.deepEqual(ids, [
      'drawer_claude_cap_7',
      'drawer_claude_cap_8',
      'drawer_claude_cap_9',
    ]);
  } finally {
    os.homedir = realHomedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('drawer extraction includes Copilot session-state events', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-drawers-copilot-'));
  const sessionDir = path.join(tmpHome, '.copilot', 'session-state', 'copilot-session-1');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionFile = path.join(sessionDir, 'events.jsonl');
  const lines = [
    { data: { context: { cwd: tmpHome }, prompt: 'copilot user prompt' }, timestamp: '2026-04-01T00:00:00Z' },
    { data: { message: { role: 'assistant', content: 'copilot assistant reply' } }, timestamp: '2026-04-01T00:00:01Z' },
  ];
  fs.writeFileSync(sessionFile, lines.map(l => JSON.stringify(l)).join('\n') + '\n');

  const realHomedir = os.homedir;
  os.homedir = () => tmpHome;
  try {
    const r = extractCliDrawers({ activeRepoPath: tmpHome });
    assert.equal(r.scanned, 1);
    assert.equal(r.drawersEmitted, 2);
    assert.ok(r.nodes.some(n => n.id === 'drawer_copilot_copilot_session_1_0'));
    assert.ok(r.nodes.some(n => n.id === 'drawer_copilot_copilot_session_1_1'));
    assert.ok(r.nodes.some(n => n.content === 'copilot user prompt' && n.role === 'user'));
    assert.ok(r.nodes.some(n => n.content === 'copilot assistant reply' && n.role === 'assistant'));
    for (const e of r.edges) {
      assert.equal(e.target, 'clisess_copilot_copilot_session_1');
    }
  } finally {
    os.homedir = realHomedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});
