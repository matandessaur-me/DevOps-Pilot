'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { BaseSourceAdapter, register, unregister, get, list, clear } = require('./base');

test('BaseSourceAdapter.ingest throws by default (subclass must override)', async () => {
  class Stub extends BaseSourceAdapter { static get name() { return 'stub'; } }
  const s = new Stub();
  await assert.rejects(async () => { for await (const _ of s.ingest({})) { /* drain */ } }, /must implement ingest/);
});

test('register / get / list / unregister round-trip', () => {
  clear();
  const a = { name: 'a', describeSchema: () => ({ fields: {}, version: '1' }), ingest: async function * () { yield { nodes: [], edges: [] }; } };
  register(a);
  assert.equal(get('a'), a);
  assert.deepEqual(list(), [a]);
  assert.equal(unregister('a'), true);
  assert.equal(get('a'), null);
  assert.equal(unregister('a'), false);
});

test('register rejects duplicates', () => {
  clear();
  const a = { name: 'dup', ingest: async function * () { yield { nodes: [], edges: [] }; } };
  register(a);
  assert.throws(() => register(a), /already registered/);
});

test('register requires ingest()', () => {
  clear();
  assert.throws(() => register({ name: 'no-ingest' }), /missing ingest/);
});

test('describeSchema default is well-formed', () => {
  class S extends BaseSourceAdapter {
    static get name() { return 's'; }
    static get adapterVersion() { return '1.2.3'; }
  }
  const s = new S();
  const schema = s.describeSchema();
  assert.deepEqual(schema, { fields: {}, version: '1.2.3' });
});

test('capabilities default is conservative', () => {
  class S extends BaseSourceAdapter { static get name() { return 's'; } }
  assert.equal(S.capabilities.supportsIncremental, false);
  assert.equal(S.capabilities.emitsTemporalEdges, false);
  assert.equal(S.capabilities.readsNetwork, false);
});
