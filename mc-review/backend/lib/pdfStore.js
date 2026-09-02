/**
 * Where published PDFs live on the server + how to get one back.
 *
 * PDF_DIR (env) — default <backend>/published-pdfs. Created on demand.
 * Each publish writes <PDF_DIR>/MC-Review-<INDEX>-<YYYY-MM-DD>-Rev<N>.pdf
 * and also stores the bytes on the MC_PublishedPdfs row, so:
 *   1. the file is browsable on the server (backup/archive/IT audits),
 *   2. the DB copy survives a disk or server move,
 *   3. if BOTH are missing (old rows published before this existed), the
 *      document is regenerated from the frozen snapshot and stored again.
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { buildPublishedPdf, pdfFileName } = require('./pdfBuilder');

const PDF_DIR = process.env.PDF_DIR ? path.resolve(process.env.PDF_DIR) : path.join(__dirname, '..', 'published-pdfs');

function ensureDir() {
  if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
  return PDF_DIR;
}

async function loadPublication(pool, index, dateISO, revision) {
  const req = pool.request().input('idx', index).input('d', dateISO);
  let q = 'SELECT TOP 1 * FROM dbo.MC_PublishedPdfs WHERE IndexName=@idx AND ReviewDate=@d';
  if (revision) { req.input('rev', Number(revision)); q += ' AND Revision=@rev'; }
  q += ' ORDER BY Revision DESC';
  const r = await req.query(q);
  return r.recordset[0] || null;
}

async function snapshotRowsFor(pool, pub) {
  const version = pub.LockedVersion
    || (await pool.request().input('id', pub.SheetId).query('SELECT Version FROM dbo.MC_Sheets WHERE Id=@id')).recordset[0]?.Version;
  const r = await pool.request().input('sheetId', pub.SheetId).input('v', version)
    .query('SELECT * FROM dbo.MC_SnapshotRows WHERE SheetId=@sheetId AND Version=@v ORDER BY WorkType, RowOrder');
  return { rows: r.recordset, version };
}

/**
 * Generate the PDF for a publication row, write it to disk and DB.
 * Returns { buffer, fileName, filePath }.
 */
async function generateAndStore(pool, pub) {
  const dateISO = pub.ReviewDate instanceof Date ? pub.ReviewDate.toISOString().slice(0, 10) : String(pub.ReviewDate).slice(0, 10);
  const { rows, version } = await snapshotRowsFor(pool, pub);
  const buffer = await buildPublishedPdf({ index: pub.IndexName, date: dateISO, pub, rows, version });
  const fileName = pdfFileName(pub.IndexName, dateISO, pub.Revision);
  const filePath = path.join(ensureDir(), fileName);
  let diskOk = true;
  try { fs.writeFileSync(filePath, buffer); }
  catch (e) { diskOk = false; console.error(`[pdf] could not write ${filePath}: ${e.message} — DB copy still stored`); }
  await pool.request()
    .input('id', pub.Id).input('fn', fileName).input('fp', diskOk ? filePath : null)
    .input('bytes', sql.VarBinary(sql.MAX), buffer).input('size', buffer.length).input('v', version || null)
    .query(`UPDATE dbo.MC_PublishedPdfs SET FileName=@fn, FilePath=@fp, PdfBytes=@bytes, PdfSize=@size,
              LockedVersion=ISNULL(LockedVersion, @v), PdfGeneratedAt=GETDATE() WHERE Id=@id`);
  return { buffer, fileName, filePath: diskOk ? filePath : null, size: buffer.length };
}

/**
 * Get the PDF bytes for a publication: disk -> DB -> regenerate.
 */
async function getPdf(pool, pub) {
  if (pub.FilePath && fs.existsSync(pub.FilePath)) {
    return { buffer: fs.readFileSync(pub.FilePath), fileName: pub.FileName, source: 'disk' };
  }
  if (pub.PdfBytes && pub.PdfBytes.length > 0) {
    // Restore the disk copy opportunistically.
    try { if (pub.FileName) fs.writeFileSync(path.join(ensureDir(), pub.FileName), pub.PdfBytes); } catch { /* best effort */ }
    return { buffer: pub.PdfBytes, fileName: pub.FileName, source: 'db' };
  }
  const gen = await generateAndStore(pool, pub);
  return { buffer: gen.buffer, fileName: gen.fileName, source: 'regenerated' };
}

module.exports = { PDF_DIR, ensureDir, loadPublication, generateAndStore, getPdf };
