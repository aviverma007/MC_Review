const express = require('express');
const sql = require('mssql');
const { currentUser, audit } = require('../lib/auth');
const { generateAndStore, loadPublication } = require('../lib/pdfStore');
const { parse } = require('../lib/fields');

/**
 * Page 3 — MC Meeting Review. Workflow v2.5 §6.
 * Decisions save versioned through the session; publish gates on the
 * confirmation modal (B4 zero-decided warning / disabled-on-empty), closes
 * the date, and writes the F8 publish guard (a live entry that departed
 * via a permitted relocation is left untouched — its ghost row's outcome
 * is history-only).
 */
module.exports = function meetingRoutes(getPool) {
  const router = express.Router();

  function reviewerGate(req, res, next) {
    const { role } = currentUser(req);
    const map = { MEP: 'revMEP', CIVIL: 'revCIV' };
    if (role === 'admin' || role === map[req.params.index]) return next();
    return res.status(403).json({ error: 'Forbidden — requires reviewer of ' + req.params.index });
  }

  // ---- Get the last locked snapshot ---------------------------------------
  router.get('/:index/:date', async (req, res) => {
    const { index, date } = req.params;
    try {
      const pool = await getPool();
      const sheetR = await pool.request().input('idx', index).input('d', date)
        .query('SELECT * FROM dbo.MC_Sheets WHERE IndexName=@idx AND ReviewDate=@d');
      const sheet = sheetR.recordset[0];
      if (!sheet || sheet.Version === 0) return res.json({ sheet: null, rows: [] });

      const rowsR = await pool.request().input('sheetId', sheet.Id).input('v', sheet.Version)
        .query(`SELECT * FROM dbo.MC_SnapshotRows WHERE SheetId=@sheetId AND Version=@v ORDER BY WorkType, RowOrder`);
      const rows = rowsR.recordset.map((r) => ({
        id: r.Id, entryId: r.EntryId, nfa: r.NfaNo, wt: r.WorkType,
        f: parse(r.FieldsJson, {}), files: parse(r.FilesJson, []),
        decision: r.Decision, mcComment: r.McComment,
        relocatedTo: r.RelocatedTo, relocatedAt: r.RelocatedAt,
      }));
      let pdf = null;
      if (sheet.PublishedRev > 0) {
        const pub = await loadPublication(pool, index, date);
        if (pub) pdf = { fileName: pub.FileName, size: pub.PdfSize, generatedAt: pub.PdfGeneratedAt, revision: pub.Revision, publishedBy: pub.PublishedBy, publishedAt: pub.PublishedAt };
      }
      res.json({
        sheet: { version: sheet.Version, publishedRev: sheet.PublishedRev, lockedAt: sheet.LockedAt, publishedAt: sheet.PublishedAt },
        rows,
        decidedCount: rows.filter((r) => r.decision).length,
        pdf,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Decision buttons: thumbs-up / pause / thumbs-down (same-click clears)
  router.post('/:index/:date/rows/:rowId/decision', reviewerGate, async (req, res) => {
    const { loginId } = currentUser(req);
    const { decision } = req.body; // 'approved' | 'hold' | 'rejected' | null (clear)
    const rowId = Number(req.params.rowId);
    try {
      const pool = await getPool();
      const r = await pool.request().input('id', rowId).query(`
        SELECT sr.*, s.PublishedRev FROM dbo.MC_SnapshotRows sr JOIN dbo.MC_Sheets s ON s.Id=sr.SheetId WHERE sr.Id=@id`);
      const row = r.recordset[0];
      if (!row) return res.status(404).json({ error: 'Snapshot row not found' });
      if (row.PublishedRev > 0) return res.status(409).json({ error: 'published; decisions are locked' });

      const next = row.Decision === decision ? null : decision; // same-button toggle clears
      await pool.request().input('id', rowId).input('dec', next)
        .query('UPDATE dbo.MC_SnapshotRows SET Decision=@dec, DecidedAt=GETDATE() WHERE Id=@id');
      await audit(pool, loginId, 'MC decision', `${row.NfaNo} -> ${next || 'cleared'}`);
      res.json({ ok: true, decision: next });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:index/:date/rows/:rowId/comment', reviewerGate, async (req, res) => {
    const { loginId } = currentUser(req);
    const { comment } = req.body;
    const rowId = Number(req.params.rowId);
    try {
      const pool = await getPool();
      const chk = await pool.request().input('id', rowId).query(`
        SELECT sr.NfaNo, s.PublishedRev FROM dbo.MC_SnapshotRows sr JOIN dbo.MC_Sheets s ON s.Id=sr.SheetId WHERE sr.Id=@id`);
      if (!chk.recordset[0]) return res.status(404).json({ error: 'Snapshot row not found' });
      if (chk.recordset[0].PublishedRev > 0) return res.status(409).json({ error: 'published; comments are locked' });
      await pool.request().input('id', rowId).input('c', comment == null ? null : String(comment))
        .query('UPDATE dbo.MC_SnapshotRows SET McComment=@c WHERE Id=@id');
      await audit(pool, loginId, 'MC comment', `${chk.recordset[0].NfaNo} -> ${String(comment || '').slice(0, 200)}`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Publish per index (B4: zero-decided warning / disabled-on-empty) ---
  router.post('/:index/:date/publish', reviewerGate, async (req, res) => {
    const { loginId } = currentUser(req);
    const { index, date } = req.params;
    const { confirmed } = req.body;
    try {
      const pool = await getPool();
      const sheetR = await pool.request().input('idx', index).input('d', date)
        .query('SELECT * FROM dbo.MC_Sheets WHERE IndexName=@idx AND ReviewDate=@d');
      const sheet = sheetR.recordset[0];
      if (!sheet || sheet.Version === 0) return res.status(400).json({ error: 'No locked snapshot to publish' });
      if (sheet.PublishedRev > 0) return res.status(409).json({ error: 'One publish per index per date — already published' });

      const rowsR = await pool.request().input('sheetId', sheet.Id).input('v', sheet.Version)
        .query(`SELECT * FROM dbo.MC_SnapshotRows WHERE SheetId=@sheetId AND Version=@v`);
      const rows = rowsR.recordset;

      if (rows.length === 0) {
        return res.status(400).json({ error: 'Publish is disabled on an empty snapshot (zero presented).' });
      }

      const decided = rows.filter((r) => r.Decision);
      if (decided.length === 0 && !confirmed) {
        return res.status(409).json({
          requiresConfirm: true,
          warning: `0 decided — publishing will expire all ${rows.length} presented entries.`,
        });
      }

      const undecided = rows.filter((r) => !r.Decision);
      const statusMap = { approved: 'approved', hold: 'hold', rejected: 'rejected' };

      // 1) Close the date atomically: statuses, sheet flag, publication row.
      const tx = new sql.Transaction(pool);
      await tx.begin();
      let pubId;
      try {
        for (const row of decided) {
          // F8 publish guard: only touch the live entry's status if it still
          // resides on the publishing index+date. A relocated ghost row
          // (RelocatedTo set) records to NFA history only — its live entry,
          // which departed via a permitted relocation, is left untouched.
          if (row.RelocatedTo) continue;
          await new sql.Request(tx).input('id', row.EntryId).input('status', statusMap[row.Decision])
            .input('isOpen', row.Decision === 'hold' ? 1 : 0)
            .query('UPDATE dbo.MC_Entries SET Status=@status, IsOpen=@isOpen, UpdatedAt=GETDATE() WHERE Id=@id');
        }
        for (const row of undecided) {
          if (row.RelocatedTo) continue; // ghost row — nothing to expire on a departed live entry
          await new sql.Request(tx).input('id', row.EntryId)
            .query(`UPDATE dbo.MC_Entries SET Status='expired', IsOpen=0, UpdatedAt=GETDATE() WHERE Id=@id`);
        }
        await new sql.Request(tx).input('id', sheet.Id).query('UPDATE dbo.MC_Sheets SET PublishedRev=1, PublishedAt=GETDATE() WHERE Id=@id');
        const undecidedNos = JSON.stringify(undecided.map((r) => r.NfaNo));
        const ins = await new sql.Request(tx)
          .input('idx', index).input('d', date).input('sheetId', sheet.Id).input('by', loginId)
          .input('decidedCount', decided.length).input('undecidedNos', undecidedNos).input('v', sheet.Version)
          .query(`INSERT INTO dbo.MC_PublishedPdfs(IndexName, ReviewDate, SheetId, Revision, PublishedBy, DecidedCount, UndecidedNos, LockedVersion)
                  OUTPUT INSERTED.Id
                  VALUES (@idx, @d, @sheetId, 1, @by, @decidedCount, @undecidedNos, @v)`);
        pubId = ins.recordset[0].Id;
        await tx.commit();
      } catch (e) { await tx.rollback(); throw e; }

      await audit(pool, loginId, 'Sheet published', `${index}·${date} v${sheet.Version} — ${decided.length} decided, ${undecided.length} expired`);

      // 2) Generate the PDF and store it (disk + DB). A failure here does NOT
      //    un-publish — the date is closed; GET /api/pdf regenerates on demand.
      let pdf = null, pdfError = null;
      try {
        const pubR = await pool.request().input('id', pubId).query('SELECT * FROM dbo.MC_PublishedPdfs WHERE Id=@id');
        const gen = await generateAndStore(pool, pubR.recordset[0]);
        pdf = { fileName: gen.fileName, filePath: gen.filePath, size: gen.size };
        await audit(pool, loginId, 'PDF generated', `${gen.fileName} (${gen.size} bytes)${gen.filePath ? ` -> ${gen.filePath}` : ' (DB only)'}`);
      } catch (e) {
        pdfError = e.message;
        console.error('[publish] PDF generation failed:', e);
        await audit(pool, loginId, 'PDF generation FAILED', `${index}·${date}: ${e.message}`.slice(0, 900));
      }

      res.json({ published: true, decidedCount: decided.length, undecidedCount: undecided.length, pdf, pdfError });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
