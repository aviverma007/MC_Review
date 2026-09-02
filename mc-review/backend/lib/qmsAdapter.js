/**
 * QMS adapter — read-only, one-way QMS -> Dashboard (Workflow v2.5 §1.1).
 *
 * Reads come from the local SQL mirror (dbo.MC_QmsNfa, kept current by
 * lib/qmsSync.js). That gives millisecond lookups over the ENTIRE feed
 * history (not a 3-month window), and Fetch never blocks on the live feed.
 *
 * If an NFA isn't in the mirror yet (created minutes ago), lookupNfa()
 * triggers one quick refresh of the last 7 days and retries before
 * answering "not found" — so a brand-new NFA still fetches without waiting
 * for the next scheduled sync.
 *
 * Field mapping from the feed's SAP-style names to the dashboard's internal
 * shape is mapRecord() — still the only place to change if the feed changes.
 */
const sync = require('./qmsSync');

const { normalizeNfa, dmyToIso, combineVendors } = sync;

// "0000014315" -> "14315" for display.
function displayNfa(rawNfaNo) {
  const n = normalizeNfa(rawNfaNo);
  return /^\d+$/.test(n) ? n : (rawNfaNo || '');
}

// "0.80 Lacs" / "23.00 Lacs" -> "0.80" / "23.00"; leaves non-numeric as-is.
function lacsToNumberString(s) {
  if (!s) return '—';
  const m = String(s).match(/-?[\d,]+\.?\d*/);
  return m ? m[0].replace(/,/g, '') : String(s).trim();
}
// Rupees "2142250" -> lacs "21.42"
function rupeesToLacsString(s) {
  const n = parseFloat(String(s || '').replace(/[^0-9.\-]/g, ''));
  if (isNaN(n)) return null;
  return (Math.round(n / 1000) / 100).toFixed(2);
}

function mapRecord(rec) {
  const vendorCount = [rec.Vendor_One, rec.Vendor_Two, rec.Vendor_Three, rec.Vendor_Four, rec.Vendor_Five]
    .filter((v) => v && String(v).trim() && String(v).trim() !== '0').length;
  return {
    project: rec.Project_Name || rec.NFA_Location || '—',
    location: rec.NFA_Location || rec.PR_Location || '—',
    desc: rec.NFA_Title || rec.Scope || '—',
    duration: rec.Contract_Duration || '—',
    vendor: combineVendors(rec) || '—',
    // Original Order Value (incl. GST) = the NFA's recommended amount incl.
    // tax; the NFA budget is the fallback when the feed hasn't got it yet.
    val: lacsToNumberString(rec.Amount_Including_Tax || rec.NFA_Budget),
    lastAmd: 'NA', // not separately exposed by this feed; revisedVal() falls back to val
    variation: 'NA',
    reason: rec.Subject_Of_NFA || rec.Scope || '—',
    reasonability: rec.Rate_Recommendations || '—',
    rateVal: '',
    vendPQ: String(vendorCount || 1),
    pr: rec.EPR_No || '—',
    initDt: dmyToIso(rec.PRN_Date) || (rec.PR_Created_Date || '').slice(0, 10) || null,
    pendWith: rec.NFA_Pending_With || rec.PR_Pending_With || '—',
    initiator: rec.recomender_name || rec.cp_name || '—',
    // PR Budget = the PR's own budget (rupees in the feed -> lacs); falls back
    // to the NFA budget when the PR has none.
    prBudget: rupeesToLacsString(rec.PR_Budget) || lacsToNumberString(rec.NFA_Budget),
    nfaBudget: lacsToNumberString(rec.NFA_Budget),
    initBy: rec.PRH_Package || 'Site',
    qmsStatus: rec.NFA_Status_Desc || '',
    payTerms: rec.Payment_Terms || '',
    files: [], // real QMS file-store integration pending (I1/I2/I3)
  };
}

function rowToRecord(row) {
  let raw = {};
  try { raw = JSON.parse(row.RawJson || '{}'); } catch { /* keep {} */ }
  return {
    nfa: row.NfaNo || '',
    nfaRaw: row.NfaNoRaw || '',
    prNo: row.PrNo || '',
    qmsStatus: row.StatusDesc || '',
    syncedAt: row.SyncedAt,
    ...mapRecord(raw),
  };
}

/**
 * Look up an NFA by number. Returns null if not found (Mode A validation
 * #1 — "NFA not in QMS -> error + offer Mode B").
 */
async function lookupNfa(pool, nfaNo) {
  const key = normalizeNfa(nfaNo);
  if (!key) return null;
  const q = () => pool.request().input('n', key)
    .query('SELECT TOP 1 * FROM dbo.MC_QmsNfa WHERE NfaNo=@n ORDER BY NfaCreatedAt DESC');
  let r = await q();
  if (!r.recordset[0]) {
    // Not mirrored yet — maybe it was created minutes ago. One quick
    // refresh of the recent window, then look again.
    const refreshed = await sync.quickRefresh(pool);
    if (refreshed) r = await q();
  }
  return r.recordset[0] ? rowToRecord(r.recordset[0]) : null;
}

/**
 * Browse/search the whole mirrored feed. Server-side filter + paging so the
 * Page-1 "All NFAs" tab never has to pull thousands of rows to the browser.
 *   q        free text over NFA no / PR no / project / title / vendor / subject
 *   nfaOnly  true = hide PRs that have no NFA yet
 */
async function listAll(pool, { q = '', limit = 100, offset = 0, nfaOnly = false } = {}) {
  const sql = require('mssql');
  const where = [];
  const req = pool.request();
  const term = String(q || '').trim();
  if (term) {
    const norm = normalizeNfa(term);
    req.input('q', sql.NVarChar(200), `%${term}%`);
    req.input('qn', sql.NVarChar(20), norm || term);
    where.push(`(NfaNo=@qn OR PrNo=@qn OR NfaNo LIKE @q OR PrNo LIKE @q OR Project LIKE @q OR Title LIKE @q OR Vendor LIKE @q OR Subject LIKE @q OR Initiator LIKE @q)`);
  }
  if (nfaOnly) where.push('NfaNo IS NOT NULL');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  req.input('limit', sql.Int, Math.max(1, Math.min(Number(limit) || 100, 2000)));
  req.input('offset', sql.Int, Math.max(0, Number(offset) || 0));
  const r = await req.query(`
    SELECT COUNT(*) OVER() AS TotalCount, *
    FROM dbo.MC_QmsNfa ${whereSql}
    ORDER BY InitiatedOn DESC, NfaCreatedAt DESC, RecKey DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  const total = r.recordset[0]?.TotalCount ?? 0;
  return { total, rows: r.recordset.map(rowToRecord) };
}

module.exports = { lookupNfa, listAll, mapRecord, normalizeNfa, displayNfa, rowToRecord };
