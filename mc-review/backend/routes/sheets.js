const express = require('express');
const sql = require('mssql');
const { currentUser, audit } = require('../lib/auth');
const { todayISO, addDaysISO } = require('../lib/reference');
const { rowToEntry, resolveFields, parse, isoDate } = require('../lib/fields');

/**
 * Page 2 — Pre-meeting Review & Check. Workflow v2.5 §5.
 * Reviewer: select/deselect for MC, in-cell touch-ups, Lock -> Page 3 (B1
 * end-of-sheet marker rendered client-side once rows.length > 0). Users:
 * view-only (§14 D12, closed).
 *
 * Every entry returned here goes through lib/fields.rowToEntry(), so the
 * values displayed are the same ones Page 1 edits, the lock snapshots, and
 * the PDF prints.
 */
module.exports = function sheetsRoutes(getPool) {
  const router = express.Router();

  async function getOrCreateSheet(pool, indexName, dateISO) {
    let r = await pool.request().input('idx', indexName).input('d', dateISO)
      .query('SELECT * FROM dbo.MC_Sheets WHERE IndexName=@idx AND ReviewDate=@d');
    if (r.recordset[0]) return r.recordset[0];
    await pool.request().input('idx', indexName).input('d', dateISO)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.MC_Sheets WHERE IndexName=@idx AND ReviewDate=@d)
                INSERT INTO dbo.MC_Sheets(IndexName, ReviewDate) VALUES (@idx, @d)`);
    r = await pool.request().input('idx', indexName).input('d', dateISO)
      .query('SELECT * FROM dbo.MC_Sheets WHERE IndexName=@idx AND ReviewDate=@d');
    return r.recordset[0];
  }

  function reviewerGate(req, res, next) {
    const { role } = currentUser(req);
    const map = { MEP: 'revMEP', CIVIL: 'revCIV' };
    if (role === 'admin' || role === map[req.params.index]) return next();
    return res.status(403).json({ error: 'Forbidden — requires reviewer of ' + req.params.index });
  }

  function validateParams(req, res, next) {
    if (!['MEP', 'CIVIL'].includes(req.params.index)) return res.status(400).json({ error: 'index must be MEP or CIVIL' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    next();
  }
  router.use('/:index/:date', validateParams);

  async function getEntryRow(pool, id) {
    const r = await pool.request().input('id', id).query('SELECT * FROM dbo.MC_Entries WHERE Id=@id');
    return r.recordset[0] || null;
  }

  // ---- Get the sheet: entries + lock state --------------------------------
  router.get('/:index/:date', async (req, res) => {
    const { index, date } = req.params;
    try {
      const pool = await getPool();
      const sheet = await getOrCreateSheet(pool, index, date);
      const r = await pool.request().input('idx', index).input('d', date)
        .query(`SELECT * FROM dbo.MC_Entries
                WHERE IndexName=@idx AND ReviewDate=@d AND Status IN ('submitted','presented')
                ORDER BY WorkType, Id`);
      res.json({
        sheet: { locked: !!sheet.Locked, version: sheet.Version, publishedRev: sheet.PublishedRev, lockedAt: sheet.LockedAt },
        entries: r.recordset.map(rowToEntry),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Reviewer: select/deselect for MC (any change unlocks) --------------
  router.post('/:index/:date/entries/:id/mc', reviewerGate, async (req, res) => {
    const { loginId } = currentUser(req);
    const { index, date, id } = req.params;
    const { mc } = req.body;
    try {
      const pool = await getPool();
      const sheet = await getOrCreateSheet(pool, index, date);
      if (sheet.PublishedRev > 0) return res.status(409).json({ error: 'published; the date is closed' });
      await pool.request().input('id', id).input('mc', mc ? 1 : 0)
        .query('UPDATE dbo.MC_Entries SET PresentToMC=@mc, UpdatedAt=GETDATE() WHERE Id=@id');
      if (sheet.Locked) {
        await pool.request().input('id', sheet.Id).query('UPDATE dbo.MC_Sheets SET Locked=0 WHERE Id=@id');
        await audit(pool, loginId, 'Sheet unlocked by curation', `${index}·${date}`);
      }
      res.json({ ok: true, mc: !!mc, unlocked: !!sheet.Locked });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Reviewer: in-cell touch-up (Rate / Reason / Resubmission etc.) -----
  router.post('/:index/:date/entries/:id/touch', reviewerGate, async (req, res) => {
    const { loginId } = currentUser(req);
    const { field, value } = req.body;
    const id = Number(req.params.id);
    if (!field) return res.status(400).json({ error: 'field is required' });
    try {
      const pool = await getPool();
      const row = await getEntryRow(pool, id);
      if (!row) return res.status(404).json({ error: 'Entry not found' });
      const sheet = await getOrCreateSheet(pool, req.params.index, req.params.date);
      if (sheet.PublishedRev > 0) return res.status(409).json({ error: 'published; the date is closed' });

      const touch = parse(row.TouchJson, {});
      const fields = parse(row.FieldsJson, {});
      const hyb = parse(row.HybridJson, {});
      const val = value == null ? '' : String(value);
      touch[field] = { value: val, by: loginId, at: new Date().toISOString() };
      fields[field] = val;
      // Keep the Page-1 hybrid card in step, otherwise Page 1 would keep
      // showing the QMS text while Page 2 shows the touch-up.
      if (hyb[field]) hyb[field] = { ...hyb[field], pfn: false, user: val };
      const updates = ['TouchJson=@touch', 'FieldsJson=@fields', 'HybridJson=@hyb', 'UpdatedAt=GETDATE()'];
      const request = pool.request().input('id', id)
        .input('touch', JSON.stringify(touch)).input('fields', JSON.stringify(fields)).input('hyb', JSON.stringify(hyb));
      if (field === 'resubComment') { updates.push('ResubComment=@resub'); request.input('resub', val); }
      await request.query(`UPDATE dbo.MC_Entries SET ${updates.join(', ')} WHERE Id=@id`);
      await audit(pool, loginId, 'Cell touch-up', `${row.NfaNo} — ${field} -> ${val.slice(0, 200)}`);
      const updated = await getEntryRow(pool, id);
      res.json({ ok: true, entry: rowToEntry(updated) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Lock sheet -> Page 3 snapshot vN (zero-selection lock is valid) ----
  router.post('/:index/:date/lock', reviewerGate, async (req, res) => {
    const { loginId } = currentUser(req);
    const { index, date } = req.params;
    try {
      const pool = await getPool();
      const sheet = await getOrCreateSheet(pool, index, date);
      if (sheet.PublishedRev > 0) return res.status(409).json({ error: 'published; the date is closed' });
      const newVersion = sheet.Version + 1;

      const r = await pool.request().input('idx', index).input('d', date)
        .query(`SELECT * FROM dbo.MC_Entries WHERE IndexName=@idx AND ReviewDate=@d AND Status IN ('submitted','presented') ORDER BY WorkType, Id`);

      const priorDec = await pool.request().input('sheetId', sheet.Id)
        .query(`SELECT EntryId, Decision, McComment FROM dbo.MC_SnapshotRows
                WHERE SheetId=@sheetId AND Version=(SELECT MAX(Version) FROM dbo.MC_SnapshotRows WHERE SheetId=@sheetId)`);
      const priorMap = new Map(priorDec.recordset.map((row) => [row.EntryId, row]));

      const tx = new sql.Transaction(pool);
      await tx.begin();
      let presented = 0;
      try {
        let order = 0;
        for (const row of r.recordset) {
          if (!row.PresentToMC) continue; // held rows never enter the snapshot
          const prior = priorMap.get(row.Id);
          // The frozen row carries the RESOLVED values (QMS + user overrides +
          // reviewer touch-ups) plus initDt / initiator / resub remark, so the
          // PDF — which reads only this blob — prints what Page 2 showed.
          const fields = resolveFields(row);
          fields.initDt = fields.initDt || isoDate(row.InitiatedOn);
          fields.initiator = fields.initiator || row.InitiatedBy;
          if (row.ResubRequired && row.ResubComment) fields.resubComment = row.ResubComment;
          await new sql.Request(tx)
            .input('sheetId', sheet.Id).input('version', newVersion).input('entryId', row.Id)
            .input('nfa', row.NfaNo).input('wt', row.WorkType).input('fields', JSON.stringify(fields))
            .input('files', row.FilesJson || '[]')
            .input('decision', prior ? prior.Decision : null).input('mcComment', prior ? prior.McComment : null)
            .input('rowOrder', order++)
            .query(`INSERT INTO dbo.MC_SnapshotRows(SheetId, Version, EntryId, NfaNo, WorkType, FieldsJson, FilesJson, Decision, McComment, RowOrder)
                    VALUES (@sheetId, @version, @entryId, @nfa, @wt, @fields, @files, @decision, @mcComment, @rowOrder)`);
          await new sql.Request(tx).input('id', row.Id).query(`UPDATE dbo.MC_Entries SET Status='presented', UpdatedAt=GETDATE() WHERE Id=@id`);
          presented++;
        }
        await new sql.Request(tx).input('id', sheet.Id).input('v', newVersion)
          .query('UPDATE dbo.MC_Sheets SET Locked=1, Version=@v, LockedAt=GETDATE() WHERE Id=@id');
        await tx.commit();
      } catch (e) { await tx.rollback(); throw e; }

      await audit(pool, loginId, 'Sheet locked', `${index}·${date} v${newVersion} (${presented} presented)`);
      res.json({ locked: true, version: newVersion, presented });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Migrate sheet (today <-> today+window, either direction) -----------
  router.post('/:index/:date/migrate', reviewerGate, async (req, res) => {
    const { loginId } = currentUser(req);
    const { index, date } = req.params;
    const { toDate } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(toDate || ''))) return res.status(400).json({ error: 'toDate must be YYYY-MM-DD' });
    try {
      const pool = await getPool();
      const cfgR = await pool.request().query(`SELECT [Value] FROM dbo.MC_Config WHERE [Key]='migrateWindowDays'`);
      const windowDays = Number(cfgR.recordset[0]?.Value || 10);
      const today = todayISO();
      const maxDate = addDaysISO(today, windowDays);
      if (toDate < today || toDate > maxDate) {
        return res.status(400).json({ error: `Migrate window is ${today} to ${maxDate}` });
      }
      if (toDate === date) return res.status(400).json({ error: 'Target date must differ from the source date' });

      const sourceSheet = await getOrCreateSheet(pool, index, date);
      if (sourceSheet.PublishedRev > 0) return res.status(409).json({ error: 'Cannot migrate a published sheet' });

      const targetSheet = await getOrCreateSheet(pool, index, toDate);
      if (targetSheet.PublishedRev > 0) return res.status(409).json({ error: 'Target date is published; migrate refused' });

      const r = await pool.request().input('idx', index).input('d', date)
        .query(`SELECT * FROM dbo.MC_Entries WHERE IndexName=@idx AND ReviewDate=@d AND Status IN ('submitted','presented')`);

      const arrivesDeselected = targetSheet.Locked;
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        for (const row of r.recordset) {
          await new sql.Request(tx).input('id', row.Id).input('d', toDate)
            .input('sel', arrivesDeselected ? 0 : row.Selected).input('mc', arrivesDeselected ? 0 : row.PresentToMC)
            .query(`UPDATE dbo.MC_Entries SET ReviewDate=@d, Status='submitted', Selected=@sel, PresentToMC=@mc, UpdatedAt=GETDATE() WHERE Id=@id`);
        }
        // Source sheet: unlocked, snapshot kept for history.
        await new sql.Request(tx).input('id', sourceSheet.Id).query('UPDATE dbo.MC_Sheets SET Locked=0 WHERE Id=@id');
        await tx.commit();
      } catch (e) { await tx.rollback(); throw e; }

      await audit(pool, loginId, 'Sheet migrated', `${index}·${date} -> ${index}·${toDate} (${r.recordset.length} entries)${arrivesDeselected ? ' — target locked, arrivals deselected' : ''}`);
      res.json({ migrated: true, count: r.recordset.length, arrivedDeselected: !!arrivesDeselected });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
