const express = require('express');
const { WORK_TYPES, INDEX_NAMES, ORDER_TYPES, RATE_VALIDATIONS, INITIATED_BY_OPTIONS } = require('../lib/reference');
const { listAll, lookupNfa, normalizeNfa } = require('../lib/qmsAdapter');
const qmsSync = require('../lib/qmsSync');
const { currentUser, audit } = require('../lib/auth');
const { rowToEntry } = require('../lib/fields');

module.exports = function miscRoutes(getPool) {
  const router = express.Router();

  // ---- Reference data for dropdowns/labels --------------------------------
  router.get('/reference', (req, res) => {
    res.json({ workTypes: WORK_TYPES, indexNames: INDEX_NAMES, orderTypes: ORDER_TYPES, rateValidations: RATE_VALIDATIONS, initiatedByOptions: INITIATED_BY_OPTIONS });
  });

  // ---- Browse / search the mirrored QMS feed (full history) ---------------
  // ?q=<text>&limit=100&offset=0&nfaOnly=1
  router.get('/qms/all-nfas', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 2000);
    const offset = Number(req.query.offset) || 0;
    try {
      const pool = await getPool();
      const { total, rows } = await listAll(pool, { q: req.query.q || '', limit, offset, nfaOnly: req.query.nfaOnly === '1' });
      res.json({ total, offset, limit, rows });
    } catch (e) {
      res.status(500).json({ error: `QMS mirror query failed: ${e.message}` });
    }
  });

  // ---- One QMS record (what Fetch would pull), no entry created ----------
  router.get('/qms/nfa/:nfa', async (req, res) => {
    try {
      const pool = await getPool();
      const rec = await lookupNfa(pool, req.params.nfa);
      if (!rec) return res.status(404).json({ error: 'NFA not found in QMS mirror' });
      res.json(rec);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- QMS mirror status + manual sync (admin) ----------------------------
  router.get('/qms/status', async (req, res) => {
    try { res.json(await qmsSync.status(await getPool())); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.post('/qms/sync', async (req, res) => {
    const { role, loginId } = currentUser(req);
    if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const mode = req.body?.mode === 'full' ? 'full' : 'incremental';
    try {
      const pool = await getPool();
      if (qmsSync.state.running) return res.status(409).json({ error: `A ${qmsSync.state.running} sync is already running` });
      await audit(pool, loginId, 'QMS sync requested', mode);
      if (mode === 'full') {
        // Long-running: kick off in the background, poll /qms/status.
        qmsSync.fullSync(pool, { force: !!req.body?.force }).catch(() => {});
        return res.json({ started: 'full' });
      }
      const r = await qmsSync.incrementalSync(pool, { kind: 'manual' });
      res.json({ done: 'incremental', ...r });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Audit trail (admin-viewable; §9.4) ---------------------------------
  router.get('/audit', async (req, res) => {
    try {
      const pool = await getPool();
      const r = await pool.request().query('SELECT TOP 500 * FROM dbo.MC_AuditLog ORDER BY Id DESC');
      res.json(r.recordset);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Per-NFA search & history (timeline across sittings + PDFs) --------
  // Accepts an NFA number in any padding ("14315" / "0000014315") or a
  // Mode-B interim reference (EM/09-26/001). Returns dashboard history AND
  // the QMS record from the full mirrored feed.
  router.get('/search/:nfa', async (req, res) => {
    const raw = String(req.params.nfa || '').trim();
    const nfa = /^\d+$/.test(raw) ? normalizeNfa(raw) : raw;
    try {
      const pool = await getPool();
      const entries = await pool.request().input('nfa', nfa)
        .query('SELECT * FROM dbo.MC_Entries WHERE NfaNo=@nfa ORDER BY Id DESC');
      const snapshots = await pool.request().input('nfa', nfa)
        .query(`SELECT sr.*, s.IndexName, CONVERT(VARCHAR(10), s.ReviewDate, 120) AS ReviewDate, s.PublishedRev, s.Version AS SheetVersion,
                       CASE WHEN p.Id IS NOT NULL THEN 1 ELSE 0 END AS HasPdf
                FROM dbo.MC_SnapshotRows sr
                JOIN dbo.MC_Sheets s ON s.Id = sr.SheetId
                LEFT JOIN dbo.MC_PublishedPdfs p ON p.SheetId = s.Id AND p.Revision = 1
                WHERE sr.NfaNo=@nfa ORDER BY sr.Id DESC`);
      const orders = await pool.request().input('nfa', nfa)
        .query(`SELECT * FROM dbo.MC_OrderRegister WHERE NfaNo=@nfa AND Status='active' ORDER BY Id`);
      let qms = null;
      if (/^\d+$/.test(nfa)) {
        try { qms = await lookupNfa(pool, nfa); } catch { qms = null; }
      }
      res.json({
        nfa,
        qms,
        entries: entries.recordset.map(rowToEntry),
        history: snapshots.recordset.map((h) => ({
          id: h.Id, index: h.IndexName, date: h.ReviewDate, version: h.Version, wt: h.WorkType,
          decision: h.Decision, mcComment: h.McComment, relocatedTo: h.RelocatedTo,
          published: h.PublishedRev > 0, hasPdf: !!h.HasPdf, isLatestVersion: h.Version === h.SheetVersion,
        })),
        orders: orders.recordset,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
