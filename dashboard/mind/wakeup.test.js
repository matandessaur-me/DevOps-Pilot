'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { composeWakeUp, renderL0, renderL1 } = require('./wakeup');

function fixtureGraph() {
  return {
    version: 1,
    nodes: [
      { id: 'g1', label: 'Browser Router', kind: 'doc', createdAt: '2026-04-01T00:00:00Z' },
      { id: 'c_old', label: 'tried Postgres tuning', kind: 'conversation', createdBy: 'claude', createdAt: '2026-03-01T00:00:00Z' },
      { id: 'c_new', label: 'switched to read-replicas', kind: 'conversation', createdBy: 'codex', createdAt: '2026-04-20T00:00:00Z' },
    ],
    edges: [],
    gods: [
      { id: 'g1', label: 'Browser Router', degree: 42 },
      { id: 'g2', label: 'Permission Modes', degree: 30 },
    ],
    surprises: [],
  };
}

test('renderL0 includes activeRepo and space', () => {
  const out = renderL0({ activeRepo: 'Symphonee', activeRepoPath: '/tmp/nope', space: 'global' });
  assert.match(out, /active_repo: Symphonee/);
  assert.match(out, /mind_space: global/);
});

test('renderL0 reads CLAUDE.md preamble when present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wakeup-l0-'));
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project Foo\n\nThis is the project preamble line.\n\nLater paragraph that should NOT show up.');
  try {
    const out = renderL0({ activeRepo: 'Foo', activeRepoPath: dir, space: 's' });
    assert.match(out, /Project Foo/);
    assert.match(out, /preamble line/);
    assert.doesNotMatch(out, /Later paragraph/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('renderL1 lists god nodes and recent conversations', () => {
  const out = renderL1(fixtureGraph(), { maxChars: 4000 });
  assert.match(out, /Browser Router/);
  assert.match(out, /Permission Modes/);
  assert.match(out, /switched to read-replicas/);
  // Recent conversations should be sorted newest-first
  const newerIdx = out.indexOf('switched to read-replicas');
  const olderIdx = out.indexOf('tried Postgres');
  assert.ok(newerIdx >= 0 && olderIdx >= 0);
  assert.ok(newerIdx < olderIdx, 'newer conversation must come first');
});

test('renderL1 with empty graph degrades gracefully', () => {
  const out = renderL1({ nodes: [], edges: [], gods: [] }, { maxChars: 400 });
  assert.match(out, /No memories yet/);
});

test('composeWakeUp respects budget approximately', () => {
  const r = composeWakeUp(fixtureGraph(), { activeRepo: 'r', space: 's', budgetTokens: 200 });
  assert.ok(r.estTokens <= 250, `est ${r.estTokens} should be near 200`);
  assert.match(r.text, /## L0 - IDENTITY/);
  assert.match(r.text, /## L1 - ESSENTIAL STORY/);
});

test('composeWakeUp emits L0 even when graph is empty', () => {
  const r = composeWakeUp({ nodes: [], edges: [], gods: [] }, { activeRepo: 'X', space: 's' });
  assert.match(r.text, /active_repo: X/);
  assert.match(r.text, /No memories yet/);
});

test('composeWakeUp query-aware mode: L1 reflects the task, not god nodes', () => {
  const g = {
    version: 1,
    nodes: [
      { id: 'a', label: 'browser router stagehand fallback', kind: 'doc', tags: ['browser'] },
      { id: 'b', label: 'cooking recipes',                   kind: 'note' },
      { id: 'c', label: 'permission modes',                  kind: 'concept' },
    ],
    edges: [
      { source: 'a', target: 'c', relation: 'references', confidence: 'EXTRACTED', confidenceScore: 1, weight: 1 },
    ],
    gods: [{ id: 'b', label: 'cooking recipes', degree: 99 }], // god is irrelevant to the question
    surprises: [],
  };
  const r = composeWakeUp(g, { activeRepo: 'r', space: 's', budgetTokens: 600, question: 'browser router stagehand' });
  assert.equal(r.queryAware, true);
  assert.match(r.text, /TASK CONTEXT/);
  assert.match(r.text, /browser router stagehand/);
  // The cooking-recipes god node should NOT crowd L1 when the task is unrelated.
  assert.doesNotMatch(r.text, /\[note\] cooking recipes/);
});

test('composeWakeUp query-aware: degrades to generic L1 when question matches nothing', () => {
  const g = {
    nodes: [{ id: 'a', label: 'real node', kind: 'doc' }],
    edges: [],
    gods: [{ id: 'a', label: 'real node', degree: 5 }],
    surprises: [],
  };
  const r = composeWakeUp(g, { activeRepo: 'r', space: 's', question: 'klingon spaceship blueprints' });
  // Falls back to generic L1 -- god node 'real node' should appear.
  assert.match(r.text, /ESSENTIAL STORY/);
});
