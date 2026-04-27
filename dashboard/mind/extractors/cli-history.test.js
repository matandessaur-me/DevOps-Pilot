'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { extractCliHistory } = require('./cli-history');

// Stub-out collectClaude/etc would require monkey-patching homedir. Instead,
// we exercise the manifest skip path with a hand-crafted manifest and a
// drop-in fake module path. Easier: use a minimal Manifest-shaped object.
function makeFakeManifest() {
  const map = new Map();
  return {
    get: (k) => map.get(k) || null,
    set: (k, v) => map.set(k, { ...v }),
    _peek: () => map,
  };
}

test('extractCliHistory: returns skippedUnchanged in the result shape', () => {
  // We can't easily collect real session files in CI. The contract we
  // test here is purely that the extractor accepts a manifest and surfaces
  // skippedUnchanged in its output, even when no sessions are found. The
  // ingestion path is exercised indirectly by the next test.
  const manifest = makeFakeManifest();
  const r = extractCliHistory({ activeRepoPath: '/no/such/path', manifest });
  assert.equal(typeof r.skippedUnchanged, 'number');
  assert.equal(r.skippedUnchanged, 0);
  assert.ok(Array.isArray(r.nodes));
  assert.ok(Array.isArray(r.edges));
});

test('manifest mtime gating: a synthesized session is processed once and skipped on rerun', () => {
  // Stand up a minimal Claude-Code-shaped projects dir under a temp HOME.
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-cli-hist-'));
  const projDir = path.join(tmpHome, '.claude', 'projects', 'fake-slug');
  fs.mkdirSync(projDir, { recursive: true });
  const sessionFile = path.join(projDir, 'session-abc.jsonl');
  fs.writeFileSync(sessionFile, JSON.stringify({
    type: 'user',
    message: { content: 'hello, this is the first user message' },
    timestamp: '2026-04-01T00:00:00Z',
    cwd: tmpHome, // matches our active repo path
  }) + '\n');

  const origHome = process.env.HOME;
  const origUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  // os.homedir is cached on first call in some Node builds; monkey-patch to be safe.
  const realHomedir = os.homedir;
  os.homedir = () => tmpHome;

  try {
    const manifest = makeFakeManifest();
    const r1 = extractCliHistory({ activeRepoPath: tmpHome, manifest, incremental: true });
    assert.ok(r1.scanned >= 1, `expected at least one scanned session, got ${r1.scanned}`);
    assert.equal(r1.skippedUnchanged, 0, 'first run should skip nothing');
    assert.ok(manifest._peek().size >= 1, 'manifest should have an entry after first run');

    const r2 = extractCliHistory({ activeRepoPath: tmpHome, manifest, incremental: true });
    assert.equal(r2.scanned, 0, 'second run with unchanged file should rescan nothing');
    assert.ok(r2.skippedUnchanged >= 1, `second run should skip the cached session, got ${r2.skippedUnchanged}`);

    // Full rebuild ignores the manifest (mtime gate is incremental-only).
    const r3 = extractCliHistory({ activeRepoPath: tmpHome, manifest, incremental: false });
    assert.ok(r3.scanned >= 1, 'full rebuild should re-scan even unchanged files');
    assert.equal(r3.skippedUnchanged, 0, 'full rebuild must NOT skip on mtime');
  } finally {
    process.env.HOME = origHome;
    process.env.USERPROFILE = origUserProfile;
    os.homedir = realHomedir;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});
