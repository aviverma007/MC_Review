/**
 * MC Review Dashboard — backend server.
 *
 * Four-page workflow: NFA Entry -> Pre-meeting Review -> MC Meeting ->
 * Order Numbering. See ../docs/ for the full Workflow Definition v2.5 and
 * the P4 Order-Number Syntax v1.0 that this server implements.
 *
 * Auth model: real login (bcrypt password + JWT). See lib/auth.js and
 * routes/auth.js. Every route below except /api/auth/login and
 * /api/health requires a valid Bearer token.
 *
 * Also serves the built frontend (frontend/dist) at "/" when it exists, so a
 * single process on PORT can host the whole app in production — no Vite dev
 * server needed. Set SERVE_FRONTEND=0 to turn that off.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');

const { migrate } = require('./db/migrate');
const { requireAuth } = require('./lib/auth');
const qmsSync = require('./lib/qmsSync');
const { PDF_DIR, ensureDir } = require('./lib/pdfStore');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role', 'x-user-id'], exposedHeaders: ['Content-Disposition', 'X-Pdf-Source'] }));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Slow-request log: anything over SLOW_MS (default 2000 ms) is printed so
// infra can see exactly which call is dragging, instead of "the page freezes".
const SLOW_MS = Number(process.env.SLOW_MS || 2000);
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    if (ms >= SLOW_MS) console.warn(`[slow ${ms}ms] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
  });
  next();
});

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'SmartDeskApp',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: { trustServerCertificate: true, enableArithAbort: true, encrypt: false },
  pool: { max: Number(process.env.DB_POOL_MAX || 20), min: 2, idleTimeoutMillis: 30000 },
  connectionTimeout: 30000,
  requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT_MS || 60000),
};

// One shared pool. The promise is cached so concurrent first requests share
// a single connect+migrate instead of racing; a failed connect is retried on
// the next request rather than poisoning the process.
let poolPromise = null;
function getPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const p = await new sql.ConnectionPool(dbConfig).connect();
      p.on('error', (err) => console.error('[db] pool error:', err.message));
      await migrate(p);
      console.log(`[db] connected to ${dbConfig.server}:${dbConfig.port}/${dbConfig.database} — schema up to date`);
      return p;
    })().catch((e) => { poolPromise = null; throw e; });
  }
  return poolPromise;
}

app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    let qms = null;
    try { const s = await qmsSync.status(pool); qms = { total: s.total, running: s.running, fullSyncDone: s.fullSyncDone, lastIncrementalAt: s.lastIncrementalAt, lastError: s.lastError }; } catch { /* ignore */ }
    res.json({ ok: true, service: 'mc-review-backend', time: new Date().toISOString(), pdfDir: PDF_DIR, qms });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Login is the only route reachable without a token.
app.use('/api/auth', require('./routes/auth')(getPool));

// Everything else requires a valid Bearer token.
app.use('/api/users', requireAuth, require('./routes/users')(getPool));
app.use('/api/entries', requireAuth, require('./routes/entries')(getPool));
app.use('/api/sheets', requireAuth, require('./routes/sheets')(getPool));
app.use('/api/meeting', requireAuth, require('./routes/meeting')(getPool));
app.use('/api/orders', requireAuth, require('./routes/orders')(getPool));
app.use('/api/pdf', requireAuth, require('./routes/pdf')(getPool));
app.use('/api', requireAuth, require('./routes/misc')(getPool));

// JSON 404 for unknown API paths (instead of an HTML page from the SPA fallback).
app.use('/api', (req, res) => res.status(404).json({ error: `No such API route: ${req.method} ${req.originalUrl}` }));

// Serve the production build of the frontend, if present.
const DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (process.env.SERVE_FRONTEND !== '0' && fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, { index: 'index.html', maxAge: '1h' }));
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
  console.log(`[web] serving frontend build from ${DIST}`);
}

// Last-resort error handler: always JSON, never a hung request.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

const PORT = process.env.PORT || 5094;
app.listen(PORT, () => {
  console.log(`MC Review backend listening on :${PORT}`);
  try { ensureDir(); console.log(`[pdf] published PDFs are written to ${PDF_DIR}`); }
  catch (e) { console.error(`[pdf] cannot create ${PDF_DIR}: ${e.message} — PDFs will be stored in the DB only`); }
  // Warm the DB connection and start the QMS mirror scheduler in the background.
  getPool().then(() => qmsSync.startScheduler(getPool)).catch((e) => console.error('[db] initial connect failed:', e.message));
});
