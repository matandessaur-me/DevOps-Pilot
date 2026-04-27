'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { extractNotes, NotesAdapter } = require('./notes');

function makeFakeManifest() {
  const map = new Map();
  return { get: (k) => map.get(k) || null, set: (k, v) => map.set(k, { ...v }) };
}

function setupFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-notes-'));
  const ns = 'test_ns';
  const dir = path.join(root, 'notes', ns);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'one.md'), '# One\n\nFirst note body.');
  fs.writeFileSync(path.join(dir, 'two.md'), '# Two\n\nSecond note body.');
  return { root, ns };
}

test('extractNotes legacy path: incremental skip after first run', () => {
  const { root, ns } = setupFixture();
  try {
    const manifest = makeFakeManifest();
    const r1 = extractNotes({ repoRoot: root, notesNamespace: ns, manifest, incremental: true });
    assert.equal(r1.skippedUnchanged, 0);
    assert.ok(r1.nodes.length >= 2);

    const r2 = extractNotes({ repoRoot: root, notesNamespace: ns, manifest, incremental: true });
    assert.equal(r2.skippedUnchanged, 2);
    assert.equal(r2.scanned, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('extractNotes full rebuild ignores manifest', () => {
  const { root, ns } = setupFixture();
  try {
    const manifest = makeFakeManifest();
    extractNotes({ repoRoot: root, notesNamespace: ns, manifest, incremental: true });
    const r2 = extractNotes({ repoRoot: root, notesNamespace: ns, manifest, incremental: false });
    assert.equal(r2.skippedUnchanged, 0, 'full rebuild must not skip');
    assert.ok(r2.nodes.length >= 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('NotesAdapter conforms to the BaseSourceAdapter contract', async () => {
  const { root, ns } = setupFixture();
  try {
    const a = new NotesAdapter();
    assert.equal(NotesAdapter.name, 'notes');
    assert.equal(NotesAdapter.adapterVersion, '1.0.0');
    assert.equal(NotesAdapter.capabilities.supportsIncremental, true);
    const schema = a.describeSchema();
    assert.equal(schema.version, '1.0.0');
    assert.ok(schema.fields.ref);
    assert.ok(schema.fields.file);

    const manifest = makeFakeManifest();
    const fragments = [];
    for await (const f of a.ingest({ repoRoot: root, manifest, ui: { notesNamespace: ns } })) {
      fragments.push(f);
    }
    assert.equal(fragments.length, 1);
    assert.ok(fragments[0].nodes.length >= 2);
    // Adapter went through manifest, so isCurrent reports up-to-date now
    const oneMtime = fs.statSync(path.join(root, 'notes', ns, 'one.md')).mtimeMs;
    assert.equal(a.isCurrent({ filePath: path.join(root, 'notes', ns, 'one.md'), mtimeMs: oneMtime, manifest }), true);
    assert.equal(a.isCurrent({ filePath: path.join(root, 'notes', ns, 'one.md'), mtimeMs: oneMtime + 1, manifest }), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
