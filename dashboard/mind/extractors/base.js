/**
 * Source-adapter contract for Mind extractors.
 *
 * Every extractor that ships knowledge into Mind - first-party (notes, learnings,
 * cli-history, ...) or third-party (a Symphonee plugin pushing its own
 * data) - speaks one shape:
 *
 *   {
 *     name:               stable string used for registration and
 *                         attribution on every node it produces.
 *     adapterVersion:     semver-ish version of THIS adapter, recorded on
 *                         every node so re-extract workflows can target
 *                         buggy adapter versions.
 *     describeSchema():   declares the structured metadata shape this
 *                         adapter attaches to the nodes it emits.
 *     ingest({ ctx, manifest, signal }):
 *                         async generator yielding fragments
 *                         { nodes, edges, scanned, skippedUnchanged, ... }.
 *                         May yield multiple fragments for streaming progress;
 *                         the engine merges them.
 *     isCurrent({ filePath, mtimeMs, manifest }):
 *                         optional fast-path. Return true and the engine
 *                         skips the file. Adapters that don't track
 *                         per-file freshness can omit this.
 *   }
 *
 * Existing first-party extractors in dashboard/mind/extractors/*.js predate
 * this contract and remain in their current shape (a single function, no
 * class). They can be migrated incrementally; nothing forces them to.
 *
 * For third-party adapters (Symphonee plugins pushing into Mind), this is
 * the recommended surface. The registry below lets a plugin call
 * `mindExtractors.register(adapter)` and have its data show up in the
 * graph on every build.
 *
 * Inspired by mempalace's RFC-002 BaseSourceAdapter (see mempalace/sources/
 * base.py). Two simplifications vs mempalace:
 *
 *   1. No PalaceContext / SourceRef wrappers. Mind's engine already passes
 *      a `ctx` object with everything an adapter needs (repoRoot, space,
 *      ui context). Adding a wrapper layer for forward compatibility is
 *      premature.
 *   2. Capabilities are flags on the adapter object, not a separate
 *      frozenset class hierarchy. Cheaper, equivalent expressivity for
 *      the small set of capabilities Mind cares about today.
 */

class BaseSourceAdapter {
  // Subclasses MUST override `name`. Used as the registry key and on every
  // node's `createdBy`/`source.adapter` field.
  static get name() { throw new Error('BaseSourceAdapter: subclass must define static name'); }

  // Subclasses SHOULD override. The engine surfaces this in build summaries
  // so an operator looking at a node can tell which adapter version produced
  // it.
  static get adapterVersion() { return '0.0.0'; }

  // Capability flags the engine inspects. Defaults are conservative.
  static get capabilities() {
    return {
      supportsIncremental: false, // if true, isCurrent() is honored
      emitsTemporalEdges: false,  // if true, may emit validFrom/validTo on edges
      readsDisk: true,
      readsNetwork: false,
    };
  }

  /**
   * Declare the structured metadata fields this adapter attaches.
   * Returned shape: { fields: { fieldName: FieldSpec, ... }, version: '...' }.
   * Each FieldSpec: { type, required, description, indexed? }.
   * Engine uses this to validate adapter output and to surface schemas in
   * the UI when an operator inspects a node.
   */
  describeSchema() {
    return { fields: {}, version: this.constructor.adapterVersion };
  }

  /**
   * Async generator yielding fragments. A fragment looks like:
   *   { nodes: [...], edges: [...], scanned: 0, skippedUnchanged: 0, ...adapterStats }
   *
   * Yielding multiple fragments lets the engine show progress mid-extract.
   * Adapters that ingest fast can yield once at the end.
   */
  async * ingest(ctx) { // eslint-disable-line require-yield
    throw new Error(`Adapter ${this.constructor.name} must implement ingest()`);
  }

  /**
   * Optional. Override only if `capabilities.supportsIncremental` is true.
   * Return true to tell the engine the file is up to date and ingest can
   * skip it.
   */
  isCurrent(_args) { return false; }
}

// ── Registry ──────────────────────────────────────────────────────────────

const _registry = new Map();

function register(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new Error('register: adapter must be an object');
  const name = adapter.name || (adapter.constructor && adapter.constructor.name);
  if (!name) throw new Error('register: adapter has no name');
  if (_registry.has(name)) throw new Error(`register: adapter "${name}" already registered`);
  if (typeof adapter.ingest !== 'function') throw new Error(`register: adapter "${name}" missing ingest()`);
  _registry.set(name, adapter);
  return adapter;
}

function unregister(name) { return _registry.delete(name); }
function get(name)        { return _registry.get(name) || null; }
function list()           { return Array.from(_registry.values()); }
function clear()          { _registry.clear(); }

module.exports = { BaseSourceAdapter, register, unregister, get, list, clear };
