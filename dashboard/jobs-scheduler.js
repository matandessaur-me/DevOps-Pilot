// Recurring AI jobs.
//
// Jobs are plain JSON files under dashboard/jobs/<id>.json. Shape:
//   {
//     id, name, cli, prompt, schedule,
//     enabled: true, createdAt, updatedAt,
//     lastRun: { at, taskId, status } | null,
//     nextRun: <epoch ms>
//   }
//
// Supported schedule strings (human-friendly; we don't pull a full cron lib):
//   "every Nm"          every N minutes (N >= 1)
//   "every Nh"          every N hours
//   "hourly :MM"        at MM minutes past every hour (0-59)
//   "daily HH:MM"       every day at HH:MM (local time)
//   "weekly DOW HH:MM"  DOW = 0-6 (0=Sun) at HH:MM
//
// The scheduler ticks every 60s and fires any job whose nextRun is <= now,
// then recomputes nextRun. Firing a job calls orchestrator.spawnHeadless()
// directly so the run shows up in the Orchestrator tab like any other task.

const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
}

function readJobs(jobsDir) {
  ensureDir(jobsDir);
  return fs.readdirSync(jobsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(jobsDir, f), 'utf8')); }
      catch (_) { return null; }
    })
    .filter(Boolean);
}

function writeJob(jobsDir, job) {
  ensureDir(jobsDir);
  fs.writeFileSync(path.join(jobsDir, job.id + '.json'), JSON.stringify(job, null, 2));
}

function deleteJobFile(jobsDir, id) {
  const p = path.join(jobsDir, id + '.json');
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function parseSchedule(s) {
  if (!s || typeof s !== 'string') return { kind: 'invalid' };
  const raw = s.trim().toLowerCase();
  let m;
  if ((m = raw.match(/^every\s+(\d+)m$/))) return { kind: 'every-min', n: parseInt(m[1], 10) };
  if ((m = raw.match(/^every\s+(\d+)h$/))) return { kind: 'every-hour', n: parseInt(m[1], 10) };
  if ((m = raw.match(/^hourly\s*:?\s*(\d{1,2})$/))) return { kind: 'hourly', minute: parseInt(m[1], 10) };
  if ((m = raw.match(/^daily\s+(\d{1,2}):(\d{2})$/))) return { kind: 'daily', hour: +m[1], minute: +m[2] };
  if ((m = raw.match(/^weekly\s+(\d)\s+(\d{1,2}):(\d{2})$/))) return { kind: 'weekly', dow: +m[1], hour: +m[2], minute: +m[3] };
  return { kind: 'invalid' };
}

function computeNextRun(schedule, from) {
  const spec = parseSchedule(schedule);
  const now = from || Date.now();
  const d = new Date(now);
  switch (spec.kind) {
    case 'every-min':
      return now + Math.max(1, spec.n) * 60 * 1000;
    case 'every-hour':
      return now + Math.max(1, spec.n) * 60 * 60 * 1000;
    case 'hourly': {
      const next = new Date(d);
      next.setMinutes(spec.minute, 0, 0);
      if (next.getTime() <= now) next.setHours(next.getHours() + 1);
      return next.getTime();
    }
    case 'daily': {
      const next = new Date(d);
      next.setHours(spec.hour, spec.minute, 0, 0);
      if (next.getTime() <= now) next.setDate(next.getDate() + 1);
      return next.getTime();
    }
    case 'weekly': {
      const next = new Date(d);
      next.setHours(spec.hour, spec.minute, 0, 0);
      const delta = (spec.dow - next.getDay() + 7) % 7;
      next.setDate(next.getDate() + delta);
      if (next.getTime() <= now) next.setDate(next.getDate() + 7);
      return next.getTime();
    }
    default:
      return null;
  }
}

function mountJobs(addRoute, json, deps) {
  const { repoRoot, orchestrator, broadcast } = deps;
  const jobsDir = path.join(repoRoot, 'dashboard', 'jobs');
  ensureDir(jobsDir);

  function readBody(req) {
    return new Promise((resolve) => {
      let s = '';
      req.on('data', (c) => { s += c; });
      req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (_) { resolve({}); } });
    });
  }

  function saveJob(job) {
    writeJob(jobsDir, job);
    broadcast && broadcast({ type: 'jobs-changed' });
    return job;
  }

  async function runJob(job) {
    if (!orchestrator || typeof orchestrator.spawnHeadless !== 'function') {
      throw new Error('orchestrator.spawnHeadless unavailable');
    }
    const { id } = orchestrator.spawnHeadless({
      cli: job.cli || 'claude',
      prompt: job.prompt,
      from: 'job:' + job.id,
    });
    job.lastRun = { at: Date.now(), taskId: id, status: 'dispatched' };
    job.updatedAt = Date.now();
    if (job.enabled) job.nextRun = computeNextRun(job.schedule) || null;
    saveJob(job);
    return id;
  }

  // --- Routes ---
  addRoute('GET', '/api/jobs', (req, res) => {
    const list = readJobs(jobsDir).sort((a, b) => (a.nextRun || 0) - (b.nextRun || 0));
    json(res, list);
  });

  addRoute('POST', '/api/jobs', async (req, res) => {
    const body = await readBody(req);
    const existing = body.id ? readJobs(jobsDir).find(j => j.id === body.id) : null;
    const now = Date.now();
    const job = {
      id:       existing ? existing.id : 'job-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      name:     String(body.name || 'Untitled job').slice(0, 120),
      cli:      body.cli || 'claude',
      prompt:   String(body.prompt || '').slice(0, 12000),
      schedule: String(body.schedule || 'daily 09:00'),
      enabled:  body.enabled !== false,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      lastRun:   existing ? existing.lastRun : null,
      nextRun:   null,
    };
    const spec = parseSchedule(job.schedule);
    if (spec.kind === 'invalid') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid schedule. Try "daily 09:00", "every 30m", or "weekly 1 09:00".' }));
    }
    if (!job.prompt.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Prompt is required.' }));
    }
    job.nextRun = job.enabled ? computeNextRun(job.schedule) : null;
    saveJob(job);
    json(res, job);
  });

  addRoute('DELETE', '/api/jobs', async (req, res) => {
    const body = await readBody(req);
    const id = body.id;
    if (!id) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end('{"error":"id required"}'); }
    deleteJobFile(jobsDir, id);
    broadcast && broadcast({ type: 'jobs-changed' });
    json(res, { ok: true });
  });

  addRoute('POST', '/api/jobs/run', async (req, res) => {
    const body = await readBody(req);
    const job = readJobs(jobsDir).find(j => j.id === body.id);
    if (!job) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"not found"}'); }
    try {
      const taskId = await runJob(job);
      json(res, { ok: true, taskId });
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });

  // Tick loop: check every 60s.
  setInterval(async () => {
    const now = Date.now();
    const due = readJobs(jobsDir).filter(j => j.enabled && j.nextRun && j.nextRun <= now);
    for (const j of due) {
      try { await runJob(j); }
      catch (e) { console.warn('[jobs] run failed for', j.id, e.message); }
    }
  }, 60 * 1000);

  return { runJob, readJobs: () => readJobs(jobsDir) };
}

module.exports = { mountJobs, parseSchedule, computeNextRun };
