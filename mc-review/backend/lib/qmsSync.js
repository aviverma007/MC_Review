/**
 * QMS feed -> SQL Server mirror (dbo.MC_QmsNfa).
 *
 * Why this exists: the live feed
 *   https://smartworlddevelopersonline.com/SapPrNFATatReport.php?startdate=..&enddate=..
 * only supports a date range, and full history is ~80 MB / ~14k rows
 * (measured Sep-2026: 2025 alone is 24 MB and takes ~45 s). Pulling that on
 * demand is impossible, and even the old rolling 3-month window was 5 MB /
 * 13 s re-downloaded every 60 s — which is what made Pages 1/2 hang.
 *
 * So: the feed is mirrored into SQL Server once (month-sized chunks, in the
 * background, resumable), then a rolling window is refreshed every few
 * minutes to pick up new NFAs and amendments. Every lookup/search in the
 * app reads SQL, which answers in milliseconds for ANY date in history.
 *
 * Env:
 *   QMS_FEED_URL             feed base URL (default: the live one above)
 *   QMS_HISTORY_START        first date of the one-time full sync (default 2022-01-01)
 *   QMS_SYNC_INTERVAL_MIN    minutes between incremental refreshes (default 10)
 *   QMS_SYNC_LOOKBACK_DAYS   window each incremental refresh covers (default 45)
 *   QMS_FETCH_TIMEOUT_MS     per-request timeout (default 180000)
 *   QMS_SYNC_DISABLED=1      never sync on this instance (e.g. a 2nd read-only replica)
 */
const BASE_URL = process.env.QMS_FEED_URL || 'https://smartworlddevelopersonline.com/SapPrNFATatReport.php';
const HISTORY_START = process.env.QMS_HISTORY_START || '2022-01-01';
const INTERVAL_MIN = Number(process.env.QMS_SYNC_INTERVAL_MIN || 10);
const LOOKBACK_DAYS = Number(process.env.QMS_SYNC_LOOKBACK_DAYS || 45);
const FETCH_TIMEOUT_MS = Number(process.env.QMS_FETCH_TIMEOUT_MS || 180000);
const DISABLED = process.env.QMS_SYNC_DISABLED === '1';

// ---- date helpers (server clock, per I10/F9) --------------------------------
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayISO() { return iso(new Date()); }
function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); }
function endOfMonth(isoDate) { const [y, m] = isoDate.split('-').map(Number); return iso(new Date(y, m, 0)); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }

function normalizeNfa(nfa) { return String(nfa || '').trim().replace(/^0+/, '') || ''; }
function dmyToIso(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function sqlDateTime(s) {
  // "2026-09-01 09:49:35" -> Date; "0000-00-00 00:00:00"/null -> null
  if (!s || /^0000/.test(s)) return null;
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}
function lacsNumeric(s) {
  const m = String(s || '').match(/-?[\d,]+\.?\d*/);
  return m ? parseFloat(m[0].replace(/,/g, '')) : null;
}
function combineVendors(rec) {
  const names = [rec.Vendor_One, rec.Vendor_Two, rec.Vendor_Three, rec.Vendor_Four, rec.Vendor_Five]
    .map((v) => (v || '').trim()).filter((v) => v && v !== '0');
  if (names.length === 0) return rec.Vendor_Name || '';
  if (names.length === 1) return names[0];
  return names.map((n, i) => `${i + 1}. ${n}`).join(' · ');
}
const cut = (s, n) => (s == null ? null : String(s).slice(0, n));

// ---- fetch one window from the live feed ----------------------------------
async function fetchRange(startDate, endDate) {
  const url = `${BASE_URL}?startdate=${startDate}&enddate=${endDate}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`QMS feed HTTP ${res.status} for ${startDate}..${endDate}`);
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`QMS feed timed out after ${FETCH_TIMEOUT_MS / 1000}s for ${startDate}..${endDate}`);
    throw e;
  } finally { clearTimeout(timer); }
}

// ---- pick the row that should represent each key ----------------------------
// The feed repeats an NFA once per amendment/version row. Keep the one with
// the newest NFA_Created_Date, then highest ENFA_Version, then last in feed.
function dedupe(rows) {
  const byKey = new Map();
  rows.forEach((rec, i) => {
    const nfa = normalizeNfa(rec.NFA_No);
    const pr = String(rec.EPR_No || '').trim();
    const key = nfa ? nfa : (pr ? `PR:${pr}` : null);
    if (!key) return;
    const cand = { rec, i, created: sqlDateTime(rec.NFA_Created_Date)?.getTime() || 0, ver: Number(rec.ENFA_Version) || 0 };
    const cur = byKey.get(key);
    if (!cur || cand.created > cur.created || (cand.created === cur.created && (cand.ver > cur.ver || (cand.ver === cur.ver && cand.i > cur.i)))) {
      byKey.set(key, cand);
    }
  });
  return byKey;
}

const MERGE_SQL = `
MERGE dbo.MC_QmsNfa AS t
USING (SELECT @key AS RecKey) AS s ON t.RecKey = s.RecKey
WHEN MATCHED THEN UPDATE SET
  NfaNo=@nfaNo, NfaNoRaw=@nfaRaw, PrNo=@prNo, Version=@ver, Project=@project, Location=@location,
  Title=@title, Subject=@subject, Vendor=@vendor, BudgetLacs=@budgetLacs, BudgetNumeric=@budgetNum,
  Initiator=@initiator, PendingWith=@pendingWith, StatusDesc=@statusDesc, Package=@package,
  InitiatedOn=@initiatedOn, NfaCreatedAt=@createdAt, RawJson=@raw, SyncedAt=GETDATE()
WHEN NOT MATCHED THEN INSERT
  (RecKey, NfaNo, NfaNoRaw, PrNo, Version, Project, Location, Title, Subject, Vendor, BudgetLacs, BudgetNumeric,
   Initiator, PendingWith, StatusDesc, Package, InitiatedOn, NfaCreatedAt, RawJson, SyncedAt)
  VALUES (@key, @nfaNo, @nfaRaw, @prNo, @ver, @project, @location, @title, @subject, @vendor, @budgetLacs, @budgetNum,
   @initiator, @pendingWith, @statusDesc, @package, @initiatedOn, @createdAt, @raw, GETDATE());`;

async function upsertRows(pool, rows) {
  const sql = require('mssql');
  const byKey = dedupe(rows);
  let n = 0;
  for (const [key, { rec }] of byKey) {
    const nfa = normalizeNfa(rec.NFA_No);
    await pool.request()
      .input('key', sql.NVarChar(40), key)
      .input('nfaNo', sql.NVarChar(20), nfa || null)
      .input('nfaRaw', sql.NVarChar(20), cut(rec.NFA_No, 20) || null)
      .input('prNo', sql.NVarChar(20), cut(rec.EPR_No, 20) || null)
      .input('ver', sql.NVarChar(4), cut(rec.ENFA_Version, 4) || null)
      .input('project', sql.NVarChar(200), cut(rec.Project_Name, 200))
      .input('location', sql.NVarChar(200), cut(rec.NFA_Location || rec.PR_Location, 200))
      .input('title', sql.NVarChar(600), cut(rec.NFA_Title || rec.Scope, 600))
      .input('subject', sql.NVarChar(sql.MAX), rec.Subject_Of_NFA || rec.Scope || null)
      .input('vendor', sql.NVarChar(1000), cut(combineVendors(rec), 1000))
      .input('budgetLacs', sql.NVarChar(30), cut(rec.NFA_Budget, 30))
      .input('budgetNum', sql.Decimal(18, 2), lacsNumeric(rec.Budget_Numeric) ?? (lacsNumeric(rec.NFA_Budget) != null ? lacsNumeric(rec.NFA_Budget) * 100000 : null))
      .input('initiator', sql.NVarChar(120), cut(rec.recomender_name || rec.cp_name, 120))
      .input('pendingWith', sql.NVarChar(200), cut(rec.NFA_Pending_With || rec.PR_Pending_With, 200))
      .input('statusDesc', sql.NVarChar(80), cut(rec.NFA_Status_Desc, 80))
      .input('package', sql.NVarChar(120), cut(rec.PRH_Package, 120))
      .input('initiatedOn', sql.Date, dmyToIso(rec.PRN_Date) || (sqlDateTime(rec.PR_Created_Date) ? iso(sqlDateTime(rec.PR_Created_Date)) : null))
      .input('createdAt', sql.DateTime, sqlDateTime(rec.NFA_Created_Date) || sqlDateTime(rec.PR_Created_Date))
      .input('raw', sql.NVarChar(sql.MAX), JSON.stringify(rec))
      .query(MERGE_SQL);
    n++;
  }
  return n;
}

// ---- sync state (single process) -------------------------------------------
const state = {
  running: null,          // null | 'incremental' | 'full' | 'manual'
  progress: null,         // { done, total, current } during a full sync
  lastIncrementalAt: null,
  lastError: null,
  lastResult: null,
};

async function logSync(pool, entry) {
  try {
    await pool.request()
      .input('kind', entry.kind).input('s', entry.startDate).input('e', entry.endDate)
      .input('rf', entry.rowsFetched ?? null).input('ru', entry.rowsUpserted ?? null)
      .input('ok', entry.ok ? 1 : 0).input('err', entry.error ? String(entry.error).slice(0, 1000) : null)
      .input('st', entry.startedAt)
      .query(`INSERT INTO dbo.MC_QmsSyncLog(Kind, StartDate, EndDate, RowsFetched, RowsUpserted, Ok, Error, StartedAt, FinishedAt)
              VALUES (@kind, @s, @e, @rf, @ru, @ok, @err, @st, GETDATE())`);
  } catch (e) { console.error('[qms-sync] log write failed:', e.message); }
}

async function syncRange(pool, startDate, endDate, kind) {
  const startedAt = new Date();
  try {
    const rows = await fetchRange(startDate, endDate);
    const upserted = await upsertRows(pool, rows);
    await logSync(pool, { kind, startDate, endDate, rowsFetched: rows.length, rowsUpserted: upserted, ok: true, startedAt });
    console.log(`[qms-sync] ${kind} ${startDate}..${endDate}: ${rows.length} rows, ${upserted} upserted (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
    return { rowsFetched: rows.length, rowsUpserted: upserted };
  } catch (e) {
    await logSync(pool, { kind, startDate, endDate, ok: false, error: e.message, startedAt });
    throw e;
  }
}

// A chunk that fails (timeout / HTTP error) is split in half and retried,
// down to a 3-day window, so one bad month never blocks the whole history.
async function syncRangeResilient(pool, startDate, endDate, kind) {
  try {
    return await syncRange(pool, startDate, endDate, kind);
  } catch (e) {
    const span = daysBetween(startDate, endDate);
    if (span <= 3) throw e;
    const mid = addDays(startDate, Math.floor(span / 2));
    console.warn(`[qms-sync] ${startDate}..${endDate} failed (${e.message}); splitting`);
    const a = await syncRangeResilient(pool, startDate, mid, kind);
    const b = await syncRangeResilient(pool, addDays(mid, 1), endDate, kind);
    return { rowsFetched: a.rowsFetched + b.rowsFetched, rowsUpserted: a.rowsUpserted + b.rowsUpserted };
  }
}

async function getConfig(pool, key) {
  const r = await pool.request().input('k', key).query('SELECT [Value] FROM dbo.MC_Config WHERE [Key]=@k');
  return r.recordset[0]?.Value ?? null;
}
async function setConfig(pool, key, value) {
  await pool.request().input('k', key).input('v', String(value)).query(`
    MERGE dbo.MC_Config AS t USING (SELECT @k AS K) AS s ON t.[Key]=s.K
    WHEN MATCHED THEN UPDATE SET [Value]=@v
    WHEN NOT MATCHED THEN INSERT([Key],[Value]) VALUES(@k,@v);`);
}

/** Refresh the rolling recent window. Cheap; safe to call often. */
async function incrementalSync(pool, { lookbackDays = LOOKBACK_DAYS, kind = 'incremental' } = {}) {
  if (state.running) return { skipped: true, reason: `${state.running} sync already running` };
  state.running = kind;
  try {
    const today = todayISO();
    const res = await syncRangeResilient(pool, addDays(today, -lookbackDays), today, kind);
    state.lastIncrementalAt = new Date();
    state.lastError = null;
    state.lastResult = res;
    await setConfig(pool, 'qmsLastSync', state.lastIncrementalAt.toISOString());
    return res;
  } catch (e) {
    state.lastError = e.message;
    throw e;
  } finally { state.running = null; }
}

/**
 * One-time full history sync in month chunks from QMS_HISTORY_START.
 * Resumable: progress is kept in MC_Config.qmsFullSyncCursor so a restart
 * mid-way continues from the last completed month instead of starting over.
 */
async function fullSync(pool, { force = false } = {}) {
  if (state.running) return { skipped: true, reason: `${state.running} sync already running` };
  state.running = 'full';
  try {
    const today = todayISO();
    let cursor = force ? null : await getConfig(pool, 'qmsFullSyncCursor');
    let start = cursor && cursor > HISTORY_START ? addDays(cursor, 1) : HISTORY_START;
    const months = [];
    for (let s = start; s <= today; s = addDays(endOfMonth(s), 1)) {
      months.push([s, endOfMonth(s) < today ? endOfMonth(s) : today]);
    }
    state.progress = { done: 0, total: months.length, current: null };
    let totalRows = 0;
    for (const [s, e] of months) {
      state.progress.current = `${s}..${e}`;
      const r = await syncRangeResilient(pool, s, e, 'full-chunk');
      totalRows += r.rowsFetched;
      await setConfig(pool, 'qmsFullSyncCursor', e);
      state.progress.done++;
    }
    await setConfig(pool, 'qmsFullSyncDone', '1');
    await setConfig(pool, 'qmsFullSyncAt', new Date().toISOString());
    state.lastError = null;
    console.log(`[qms-sync] FULL history sync complete — ${totalRows} rows over ${months.length} chunk(s)`);
    return { chunks: months.length, rowsFetched: totalRows };
  } catch (e) {
    state.lastError = e.message;
    console.error('[qms-sync] full sync stopped:', e.message, '— will resume from the last completed month on next boot');
    throw e;
  } finally { state.running = null; state.progress = null; }
}

/** Quick "did something new land?" refresh used on a cache miss during Fetch. */
async function quickRefresh(pool) {
  // Don't hammer the feed: at most one quick refresh per 2 minutes.
  const last = state.lastIncrementalAt ? Date.now() - state.lastIncrementalAt.getTime() : Infinity;
  if (last < 2 * 60 * 1000 || state.running) return false;
  try { await incrementalSync(pool, { lookbackDays: 7, kind: 'on-demand' }); return true; }
  catch (e) { console.warn('[qms-sync] on-demand refresh failed:', e.message); return false; }
}

async function status(pool) {
  const counts = await pool.request().query(`
    SELECT COUNT(*) AS total, SUM(CASE WHEN NfaNo IS NOT NULL THEN 1 ELSE 0 END) AS withNfa,
           MIN(InitiatedOn) AS earliest, MAX(InitiatedOn) AS latest, MAX(SyncedAt) AS lastRowSyncedAt
    FROM dbo.MC_QmsNfa`);
  const c = counts.recordset[0];
  const lastLog = await pool.request().query('SELECT TOP 5 * FROM dbo.MC_QmsSyncLog ORDER BY Id DESC');
  return {
    disabled: DISABLED,
    running: state.running,
    progress: state.progress,
    lastError: state.lastError,
    lastIncrementalAt: state.lastIncrementalAt,
    fullSyncDone: (await getConfig(pool, 'qmsFullSyncDone')) === '1',
    fullSyncCursor: await getConfig(pool, 'qmsFullSyncCursor'),
    fullSyncAt: await getConfig(pool, 'qmsFullSyncAt'),
    historyStart: HISTORY_START,
    intervalMin: INTERVAL_MIN,
    lookbackDays: LOOKBACK_DAYS,
    total: c.total, withNfa: c.withNfa, prOnly: c.total - c.withNfa,
    earliest: c.earliest, latest: c.latest, lastRowSyncedAt: c.lastRowSyncedAt,
    recentLog: lastLog.recordset,
  };
}

/**
 * Boot sequence (called once from server.js after the pool is up):
 *   1. incremental refresh right away — recent NFAs are usable within seconds
 *   2. if the full history was never completed, run it in the background
 *   3. every INTERVAL_MIN minutes: incremental refresh
 * Nothing here blocks a request; every step is fire-and-forget with logging.
 */
function startScheduler(getPool) {
  if (DISABLED) { console.log('[qms-sync] disabled by QMS_SYNC_DISABLED=1'); return; }
  (async () => {
    try {
      const pool = await getPool();
      try { await incrementalSync(pool); } catch (e) { console.error('[qms-sync] initial refresh failed:', e.message); }
      const done = (await getConfig(pool, 'qmsFullSyncDone')) === '1';
      if (!done) fullSync(pool).catch(() => {});
    } catch (e) { console.error('[qms-sync] scheduler could not start:', e.message); }
  })();
  const timer = setInterval(async () => {
    try {
      const pool = await getPool();
      await incrementalSync(pool);
      // If a full sync was interrupted earlier (server restart mid-way), resume it.
      if ((await getConfig(pool, 'qmsFullSyncDone')) !== '1' && !state.running) fullSync(pool).catch(() => {});
    } catch (e) { console.error('[qms-sync] scheduled refresh failed:', e.message); }
  }, INTERVAL_MIN * 60 * 1000);
  timer.unref();
}

module.exports = {
  fetchRange, upsertRows, incrementalSync, fullSync, quickRefresh, status, startScheduler,
  normalizeNfa, dmyToIso, combineVendors, lacsNumeric, sqlDateTime, todayISO, state,
};
