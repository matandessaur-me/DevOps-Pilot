/**
 * Okapi-BM25 over a small in-memory candidate set.
 *
 * IDF is computed over the *provided corpus* using the Lucene/BM25+ smoothed
 * formula log((N - df + 0.5) / (df + 0.5) + 1), which is always non-negative.
 * That is exactly what's wanted when re-ranking a candidate set: IDF reflects
 * how discriminative each query term is *within the candidates* themselves.
 *
 * Lifted in spirit from MemPalace's searcher.py _bm25_scores (Apache 2.0).
 * See docs/HYBRID_SEED_SELECTION.md or follow up: when the graph grows large
 * enough that scoring every node per query becomes hot, swap to a posting-
 * list pre-filter. For now O(N * tokens) is fine for graphs under ~50k nodes.
 */

const TOKEN_RE = /[\p{L}\p{N}]{2,}/gu;

function tokenize(text) {
  if (!text) return [];
  return (text.toLowerCase().match(TOKEN_RE) || []);
}

function bm25Scores(query, documents, { k1 = 1.5, b = 0.75 } = {}) {
  const n = documents.length;
  const queryTerms = new Set(tokenize(query));
  if (!queryTerms.size || !n) return new Array(n).fill(0);

  const tokenized = documents.map(tokenize);
  const docLens = tokenized.map(t => t.length);
  if (!docLens.some(l => l > 0)) return new Array(n).fill(0);
  const avgdl = docLens.reduce((a, x) => a + x, 0) / n || 1;

  const df = new Map();
  for (const term of queryTerms) df.set(term, 0);
  for (const toks of tokenized) {
    const seen = new Set();
    for (const t of toks) if (queryTerms.has(t) && !seen.has(t)) { seen.add(t); df.set(t, df.get(t) + 1); }
  }

  const idf = new Map();
  for (const term of queryTerms) {
    const f = df.get(term) || 0;
    idf.set(term, Math.log((n - f + 0.5) / (f + 0.5) + 1));
  }

  const scores = new Array(n);
  for (let i = 0; i < n; i++) {
    const toks = tokenized[i];
    const dl = docLens[i];
    if (dl === 0) { scores[i] = 0; continue; }
    const tf = new Map();
    for (const t of toks) if (queryTerms.has(t)) tf.set(t, (tf.get(t) || 0) + 1);
    let s = 0;
    for (const [term, freq] of tf) {
      const num = freq * (k1 + 1);
      const den = freq + k1 * (1 - b + b * dl / avgdl);
      s += idf.get(term) * num / den;
    }
    scores[i] = s;
  }
  return scores;
}

function minMaxNormalize(scores) {
  const max = Math.max(...scores, 0);
  if (max <= 0) return scores.map(() => 0);
  return scores.map(s => s / max);
}

module.exports = { bm25Scores, minMaxNormalize, tokenize };
