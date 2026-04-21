/**
 * Symphonee -- Hybrid Search (v1: BM25)
 *
 * Indexes Notes + Learnings into an in-memory inverted index with BM25
 * scoring. Persists the document set to disk so reindex on boot is fast.
 *
 * v1 is BM25 only (no vector embeddings). The architecture is set up so
 * v2 can add a local embedding model and combine scores. For now BM25
 * over a few hundred notes/learnings beats substring search by a wide
 * margin and ships with zero native dependencies.
 *
 * Always on. Initialized at server boot.
 */

const fs = require('fs');
const path = require('path');

const STOP = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','he','in','is','it','its',
  'of','on','or','that','the','to','was','were','will','with','this','these','those','i','you',
  'we','they','do','does','did','but','if','then','else','so','not','no','yes','can','could',
  'should','would','your','my','our','their','about','into','than','also','any','some','all',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOP.has(t));
}

class HybridSearchEngine {
  constructor({ repoRoot }) {
    this.repoRoot = repoRoot;
    this.indexDir = path.join(repoRoot, '.symphonee', 'search');
    this.indexPath = path.join(this.indexDir, 'index.json');
    this.docs = new Map(); // id -> { id, kind, title, body, path, tokens, ts }
    this.invertedIndex = new Map(); // term -> Set(doc id)
    this.docFreq = new Map(); // term -> df (# docs containing term)
    this.avgDocLength = 0;
    this.totalDocs = 0;
  }

  async initialize({ notesDir, learnings }) {
    this.notesDir = notesDir;
    this._learnings = learnings;
    fs.mkdirSync(this.indexDir, { recursive: true });
    // Always rebuild from source on boot (fast for sub-thousand docs).
    await this.reindex();
  }

  async reindex() {
    this.docs.clear();
    this.invertedIndex.clear();
    this.docFreq.clear();
    let totalLen = 0;

    // Index notes -- walk the root and every namespace subdir (notes/<ns>/*.md).
    if (this.notesDir && fs.existsSync(this.notesDir)) {
      const addFile = (p, ns) => {
        const f = path.basename(p);
        let raw = '';
        try { raw = fs.readFileSync(p, 'utf8'); } catch (_) { return; }
        const base = f.replace(/\.md$/i, '');
        // Prefix the id with ns so same-named notes in different spaces don't
        // collide in the inverted index.
        const id = 'note:' + (ns ? ns + '/' : '') + base;
        const title = base.replace(/-/g, ' ');
        const tokens = tokenize(title + ' ' + raw);
        this.docs.set(id, { id, kind: 'note', ns: ns || '', title, body: raw, path: p, tokens, ts: 0 });
        totalLen += tokens.length;
      };
      try {
        for (const entry of fs.readdirSync(this.notesDir, { withFileTypes: true })) {
          const full = path.join(this.notesDir, entry.name);
          if (entry.isFile() && entry.name.endsWith('.md')) {
            addFile(full, '');
          } else if (entry.isDirectory()) {
            const ns = entry.name;
            try {
              for (const f of fs.readdirSync(full)) {
                if (f.endsWith('.md')) addFile(path.join(full, f), ns);
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    // Index learnings
    if (this._learnings && typeof this._learnings.list === 'function') {
      try {
        for (const l of this._learnings.list()) {
          const id = 'learning:' + l.id;
          const title = (l.summary || '').slice(0, 80);
          const body = (l.summary || '') + '\n\n' + (l.detail || '');
          const tokens = tokenize(title + ' ' + body + ' ' + (l.category || '') + ' ' + (l.cli || ''));
          this.docs.set(id, { id, kind: 'learning', title, body, category: l.category, cli: l.cli, tokens, ts: 0 });
          totalLen += tokens.length;
        }
      } catch (_) {}
    }

    this.totalDocs = this.docs.size;
    this.avgDocLength = this.totalDocs ? totalLen / this.totalDocs : 1;

    // Build inverted index + document frequencies
    for (const doc of this.docs.values()) {
      const seen = new Set();
      for (const t of doc.tokens) {
        if (!this.invertedIndex.has(t)) this.invertedIndex.set(t, new Set());
        this.invertedIndex.get(t).add(doc.id);
        if (!seen.has(t)) {
          seen.add(t);
          this.docFreq.set(t, (this.docFreq.get(t) || 0) + 1);
        }
      }
    }
    this._persistMeta();
    return { docs: this.totalDocs, terms: this.invertedIndex.size };
  }

  _persistMeta() {
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify({
        docs: this.totalDocs,
        terms: this.invertedIndex.size,
        avgDocLength: this.avgDocLength,
        rebuiltAt: Date.now(),
      }, null, 2), 'utf8');
    } catch (_) {}
  }

  // Standard BM25 scoring (k1=1.5, b=0.75)
  search(query, { kinds, ns, limit = 20 } = {}) {
    const qTokens = tokenize(query);
    if (!qTokens.length) return [];
    const scores = new Map();
    const k1 = 1.5;
    const b = 0.75;
    const N = Math.max(this.totalDocs, 1);

    for (const t of qTokens) {
      const docIds = this.invertedIndex.get(t);
      if (!docIds) continue;
      const df = this.docFreq.get(t) || 1;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      for (const docId of docIds) {
        const doc = this.docs.get(docId);
        if (!doc) continue;
        if (kinds && !kinds.includes(doc.kind)) continue;
        // Optional namespace filter (applies only to note docs; other kinds
        // like learnings have no ns and are unaffected).
        if (ns && doc.kind === 'note' && (doc.ns || '') !== ns) continue;
        const tf = doc.tokens.filter(x => x === t).length;
        const dl = doc.tokens.length || 1;
        const norm = (1 - b) + b * (dl / this.avgDocLength);
        const score = idf * (tf * (k1 + 1)) / (tf + k1 * norm);
        scores.set(docId, (scores.get(docId) || 0) + score);
      }
    }

    const ranked = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => {
        const d = this.docs.get(id);
        // Count occurrences across body AND title (and category/cli for
        // learnings) so the UI count matches what BM25 actually scored.
        // Also report where the matches live so the UI can decide whether
        // to open the body view at all.
        const bodyText = String(d.body || '').toLowerCase();
        const titleText = String(d.title || '').toLowerCase();
        const extraText = ((d.category || '') + ' ' + (d.cli || '')).toLowerCase();
        let bodyMatches = 0, titleMatches = 0, otherMatches = 0;
        for (const t of qTokens) {
          let i;
          i = 0; while ((i = bodyText.indexOf(t, i))   !== -1) { bodyMatches++;  i += t.length; }
          i = 0; while ((i = titleText.indexOf(t, i))  !== -1) { titleMatches++; i += t.length; }
          i = 0; while ((i = extraText.indexOf(t, i))  !== -1) { otherMatches++; i += t.length; }
        }
        return {
          id: d.id, kind: d.kind, title: d.title,
          ns: d.ns || '',
          score: Math.round(score * 100) / 100,
          matches: bodyMatches + titleMatches + otherMatches,
          bodyMatches, titleMatches, otherMatches,
          terms: qTokens,
          snippet: makeSnippet(d.body, qTokens),
          category: d.category, cli: d.cli,
          path: d.path,
        };
      });
    return ranked;
  }

  // Single-doc reindex (called when a note is saved or learning added)
  async indexNote(filePath) { return this.reindex(); }
  async indexLearning() { return this.reindex(); }
  // Future: incremental add/remove instead of full rebuild
}

function makeSnippet(body, qTokens, ctx = 80) {
  const text = String(body || '').replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  let bestPos = -1;
  for (const t of qTokens) {
    const p = lower.indexOf(t);
    if (p >= 0 && (bestPos < 0 || p < bestPos)) bestPos = p;
  }
  if (bestPos < 0) return text.slice(0, 200);
  const start = Math.max(0, bestPos - ctx);
  const end = Math.min(text.length, bestPos + ctx + 80);
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
}

module.exports = { HybridSearchEngine, tokenize, makeSnippet };
