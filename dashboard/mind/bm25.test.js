'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { bm25Scores, tokenize, minMaxNormalize } = require('./bm25');

test('tokenize lowercases and drops sub-2-char tokens', () => {
  assert.deepEqual(tokenize('A BM25 implementation, very-fast.'), ['bm25', 'implementation', 'very', 'fast']);
});

test('tokenize handles unicode letters', () => {
  assert.deepEqual(tokenize('café déjà-vu'), ['café', 'déjà', 'vu']);
});

test('bm25Scores: a doc that contains all query terms beats a doc with none', () => {
  const docs = [
    'browser router stagehand fallback',
    'unrelated content about cooking',
    'browser only',
  ];
  const s = bm25Scores('browser router stagehand', docs);
  assert.equal(s.length, 3);
  assert.ok(s[0] > s[2], 'full match must outrank partial match');
  assert.ok(s[2] > s[1], 'partial match must outrank no match');
  assert.equal(s[1], 0, 'no overlap = zero score');
});

test('bm25Scores: rare terms outweigh common ones', () => {
  // "the" appears in every doc -> low IDF; "stagehand" appears in one -> high IDF
  const docs = [
    'the quick the brown the fox',
    'the lazy the dog stagehand',
    'the cat the mat the rug',
  ];
  const s = bm25Scores('the stagehand', docs);
  assert.ok(s[1] > s[0], 'stagehand-bearing doc should win on IDF');
  assert.ok(s[1] > s[2]);
});

test('bm25Scores returns zeros for empty query or empty corpus', () => {
  assert.deepEqual(bm25Scores('', ['anything']), [0]);
  assert.deepEqual(bm25Scores('something', []), []);
});

test('bm25Scores tolerates an empty doc among populated ones', () => {
  const s = bm25Scores('foo bar', ['foo bar', '', 'foo']);
  assert.equal(s[1], 0);
  assert.ok(s[0] > s[2]);
});

test('minMaxNormalize maps max to 1, all-zero to all-zero', () => {
  assert.deepEqual(minMaxNormalize([2, 1, 0]), [1, 0.5, 0]);
  assert.deepEqual(minMaxNormalize([0, 0, 0]), [0, 0, 0]);
});
