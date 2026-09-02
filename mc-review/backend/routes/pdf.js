const express = require('express');
const { loadPublication, getPdf, generateAndStore, PDF_DIR } = require('../lib/pdfStore');
const { currentUser, audit } = require('../lib/auth');

/**
 * Published PDF output — Workflow v2.5 §9.1. The document is generated at
 * publish time (routes/meeting.js) and stored (lib/pdfStore.js); this route
 * only serves it. `?download=1` sends it as an attachment; `?rev=2` picks a
 * corrigendum revision.
 *
 * NOTE for the frontend: this route sits behind requireAuth, so it must be
 * fetched with the Bearer token (axios blob) — a plain <a href> in a new tab
 * sends no Authorization header and gets a 401. See frontend/src/utils/pdf.js.
 */
module.exports = function pdfRoutes(getPool) {
  const router = express.Router();

  // List all published PDFs (Page-1 "Published PDFs" tab + date-wise library).
  router.get('/', async (req, res) => {
    try {
      const pool = await getPool();
      const r = await pool.request().query(`
        SELECT Id, IndexName, CONVERT(VARCHAR(10), ReviewDate, 120) AS ReviewDate, Revision, PublishedBy, PublishedAt,
               DecidedCount, FileName, PdfSize, LockedVersion, PdfGeneratedAt,
               CASE WHEN FilePath IS NOT NULL OR PdfBytes IS NOT NULL THEN 1 ELSE 0 END AS Stored
        FROM dbo.MC_PublishedPdfs ORDER BY ReviewDate DESC, IndexName, Revision DESC`);
      res.json(r.recordset);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:index/:date', async (req, res) => {
    const { index, date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    try {
      const pool = await getPool();
      const pub = await loadPublication(pool, index, date, req.query.rev);
      if (!pub) return res.status(404).json({ error: 'No published PDF for this index/date' });
      const { buffer, fileName, source } = await getPdf(pool, pub);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('X-Pdf-Source', source);
      res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${fileName}"`);
      res.end(buffer);
    } catch (e) {
      console.error('[pdf] serve failed:', e);
      res.status(500).json({ error: `PDF could not be produced: ${e.message}` });
    }
  });

  // Admin: force regeneration from the snapshot (e.g. after a font/logo fix).
  router.post('/:index/:date/regenerate', async (req, res) => {
    const { role, loginId } = currentUser(req);
    if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { index, date } = req.params;
    try {
      const pool = await getPool();
      const pub = await loadPublication(pool, index, date, req.query.rev);
      if (!pub) return res.status(404).json({ error: 'No publication for this index/date' });
      const gen = await generateAndStore(pool, pub);
      await audit(pool, loginId, 'PDF regenerated', `${index}·${date} Rev-${pub.Revision} -> ${gen.fileName}`);
      res.json({ ok: true, fileName: gen.fileName, filePath: gen.filePath, size: gen.size, pdfDir: PDF_DIR });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
