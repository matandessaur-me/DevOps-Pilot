/**
 * Notes extractor: walk Symphonee's per-space notes directory and emit a
 * graph fragment. Uses the generic markdown extractor under the hood so
 * wikilinks resolve correctly across notes regardless of casing.
 */

const fs = require('fs');
const path = require('path');
const { extractMarkdown } = require('./markdown');
const { makeIdFromLabel } = require('../ids');
const { BaseSourceAdapter } = require('./base');

function _resolveNotesNs(notesRoot, ns) {
  return path.join(notesRoot, (ns || '_global').replace(/[^A-Za-z0-9_-]+/g, '_'));
}

function extractNotes({ repoRoot, notesNamespace, notesRoot, createdBy = 'mind/notes', manifest = null, incremental = false }) {
  const baseRoot = notesRoot || path.join(repoRoot, 'notes');
  const dir = _resolveNotesNs(baseRoot, notesNamespace);
  const fragments = [];
  if (!fs.existsSync(dir)) return { nodes: [], edges: [], scanned: 0, skippedUnchanged: 0, dir };

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  let skippedUnchanged = 0;
  for (const f of files) {
    const full = path.join(dir, f);
    let mtimeMs = 0;
    try { mtimeMs = fs.statSync(full).mtimeMs; } catch (_) { /* missing - treat as new */ }
    const key = `notes:${full}`;
    if (incremental && manifest) {
      const prev = manifest.get(key);
      if (prev && prev.mtimeMs === mtimeMs) { skippedUnchanged++; continue; }
    }
    let body;
    try { body = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }
    const stem = f.replace(/\.md$/i, '');
    const id = makeIdFromLabel(stem, 'note');
    fragments.push(extractMarkdown({
      id,
      label: stem,
      kind: 'note',
      source: { type: 'note', ref: stem, file: full },
      body,
      createdBy,
      tagPrefix: 'note',
    }));
    if (manifest) manifest.set(key, { sha256: '', lastExtractedAt: Date.now(), contributors: [], mtimeMs });
  }

  // Flatten
  const nodes = []; const edges = [];
  for (const fr of fragments) { nodes.push(...fr.nodes); edges.push(...fr.edges); }
  return { nodes, edges, scanned: files.length - skippedUnchanged, skippedUnchanged, dir };
}

/**
 * BaseSourceAdapter wrapper around the same extractor.
 *
 * This is the reference implementation third-party plugins should follow
 * when registering their own source adapters. Two things to notice:
 *
 *   1. The legacy `extractNotes` export is unchanged — engine.js still
 *      calls it directly. The adapter is an additional surface for
 *      callers that prefer the contract.
 *   2. `supportsIncremental` is true and `isCurrent()` consults the
 *      manifest the same way the legacy function does. So a registered
 *      NotesAdapter and the legacy path produce identical fragments
 *      bit-for-bit; the choice is entirely about which interface the
 *      caller speaks.
 */
class NotesAdapter extends BaseSourceAdapter {
  static get name()           { return 'notes'; }
  static get adapterVersion() { return '1.0.0'; }
  static get capabilities() {
    return { supportsIncremental: true, emitsTemporalEdges: false, readsDisk: true, readsNetwork: false };
  }
  describeSchema() {
    return {
      version: '1.0.0',
      fields: {
        ref:  { type: 'string', required: true,  description: 'Filename stem of the .md note', indexed: true },
        file: { type: 'string', required: true,  description: 'Absolute path on disk', indexed: false },
      },
    };
  }
  async * ingest({ repoRoot, manifest, ui, ctx }) {
    const namespace = (ui && ui.notesNamespace) || (ctx && ctx.notesNamespace) || null;
    const fragment = extractNotes({
      repoRoot,
      notesNamespace: namespace,
      manifest,
      incremental: true,
    });
    yield fragment;
  }
  isCurrent({ filePath, mtimeMs, manifest }) {
    if (!manifest) return false;
    const prev = manifest.get(`notes:${filePath}`);
    return !!(prev && prev.mtimeMs === mtimeMs);
  }
}

module.exports = { extractNotes, NotesAdapter };
