/**
 * Apps Recipes - per-app saved automation definitions.
 *
 * A recipe is a named, structured sequence of steps the user can re-run
 * against a specific app ("Open new file in Figma", "Export PNG", ...).
 * Storage is one JSON file per normalized app name, kept beside the app's
 * memory/instructions markdown so the two live together on disk.
 *
 * Step schema (Phase A - kept intentionally simple; the Phase B DSL engine
 * upgrades each verb to a deterministic driver call):
 *   { id, verb: 'CLICK'|'TYPE'|'PRESS'|'WAIT'|'FIND'|'VERIFY',
 *     target?: string, text?: string, notes?: string }
 *
 * Recipe schema:
 *   { id, name, description?, variables?: object, steps: Step[],
 *     createdAt, updatedAt }
 */

const fs = require('fs');
const path = require('path');

const { normalizeApp } = require('./apps-memory');

const DIR = path.join(__dirname, 'app-recipes');

function ensureDir() {
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (_) {}
}

function filePath(app) {
  return path.join(DIR, normalizeApp(app) + '.json');
}

function _load(app) {
  ensureDir();
  const p = filePath(app);
  if (!fs.existsSync(p)) return { app: normalizeApp(app), recipes: [] };
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw || '{}');
    data.app = normalizeApp(app);
    if (!Array.isArray(data.recipes)) data.recipes = [];
    return data;
  } catch (_) {
    return { app: normalizeApp(app), recipes: [] };
  }
}

function _write(app, data) {
  ensureDir();
  fs.writeFileSync(filePath(app), JSON.stringify(data, null, 2), 'utf8');
}

const ALLOWED_VERBS = new Set([
  'CLICK', 'TYPE', 'PRESS', 'WAIT', 'FIND', 'VERIFY',
  // Control flow (Phase E):
  'IF', 'ELSE', 'ENDIF',
  'REPEAT', 'ENDREPEAT',
]);

function _validateStep(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('step must be an object');
  const verb = String(raw.verb || '').trim().toUpperCase();
  if (!ALLOWED_VERBS.has(verb)) throw new Error(`unknown verb "${raw.verb}". Allowed: ${[...ALLOWED_VERBS].join(', ')}.`);
  const step = { id: String(raw.id || _stepId()), verb };
  if (raw.target != null) step.target = String(raw.target).slice(0, 500);
  if (raw.text != null) step.text = String(raw.text).slice(0, 2000);
  if (raw.notes != null) step.notes = String(raw.notes).slice(0, 500);
  return step;
}

function _stepId() {
  return 's_' + Math.random().toString(36).slice(2, 10);
}

function _recipeId() {
  return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function listRecipes(app) {
  return _load(app);
}

function getRecipe(app, id) {
  const data = _load(app);
  const r = data.recipes.find(x => x.id === id);
  return r || null;
}

function saveRecipe(app, recipe) {
  if (!recipe || !String(recipe.name || '').trim()) throw new Error('recipe name required');
  const steps = Array.isArray(recipe.steps) ? recipe.steps.map(_validateStep) : [];
  const now = new Date().toISOString();
  const data = _load(app);
  const id = recipe.id || _recipeId();
  const existing = data.recipes.find(x => x.id === id);
  const record = {
    id,
    name: String(recipe.name).trim().slice(0, 120),
    description: String(recipe.description || '').trim().slice(0, 1000) || undefined,
    variables: (recipe.variables && typeof recipe.variables === 'object') ? recipe.variables : undefined,
    steps,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  if (existing) {
    const idx = data.recipes.findIndex(x => x.id === id);
    data.recipes[idx] = record;
  } else {
    data.recipes.push(record);
  }
  _write(app, data);
  return { ok: true, recipe: record };
}

function deleteRecipe(app, id) {
  const data = _load(app);
  const idx = data.recipes.findIndex(x => x.id === id);
  if (idx < 0) return { ok: false, error: 'not found' };
  data.recipes.splice(idx, 1);
  _write(app, data);
  return { ok: true };
}

// Render a recipe into a plain-English goal string the agent can consume.
// Phase A implementation: the recipe becomes a hard subgoal plan injected
// as the user's initial goal, with an explicit "follow these steps in order,
// do not improvise" header. Phase B replaces this with a deterministic DSL
// runner; the JSON shape is forward-compatible.
function renderRecipeAsGoal(recipe) {
  if (!recipe) return '';
  const header = `Run the "${recipe.name}" automation. Follow these steps in order. Do NOT improvise or skip steps.`;
  const lines = recipe.steps.map((s, i) => {
    let line = `${i + 1}. ${s.verb}`;
    if (s.target) line += ` ${s.target}`;
    if (s.text) line += ` -> "${s.text}"`;
    if (s.notes) line += `   (${s.notes})`;
    return line;
  });
  const parts = [header];
  if (recipe.description) parts.push(`Context: ${recipe.description}`);
  parts.push('Steps:', ...lines);
  parts.push('', 'When every step is done, call finish with a one-sentence confirmation.');
  return parts.join('\n');
}

module.exports = {
  DIR,
  normalizeApp,
  listRecipes,
  getRecipe,
  saveRecipe,
  deleteRecipe,
  renderRecipeAsGoal,
};
