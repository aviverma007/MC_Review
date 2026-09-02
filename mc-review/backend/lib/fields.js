/**
 * ONE place that decides "what value does this entry show for field X".
 *
 * An entry carries three JSON blobs (see db/migrate.js):
 *   FieldsJson  — QMS-sourced values (+ reviewer touch-ups written in place)
 *   HybridJson  — the Page-1 "Pick from NFA" cards: {field:{pfn, qms, user}}
 *   TouchJson   — which cells a person edited, by whom, when
 *
 * Before this helper existed, Page 1/2 read HybridJson while Page 3, the lock
 * snapshot and the PDF read only FieldsJson — so a user's PR Budget / Reason
 * edit on Page 1 silently vanished at lock, and a reviewer touch-up on Page 2
 * wrote FieldsJson but Page 2 kept displaying HybridJson. Every route now
 * goes through resolveFields() / rowToEntry(), so an edit made anywhere is
 * what every page — and the published PDF — shows.
 */
const HYBRID_FIELDS = ['prBudget', 'reason', 'vendPQ', 'remarks'];
// Fields a person owns once they've set them; a QMS re-pull must not clobber
// these (Workflow v2.5 §14 D9).
const USER_OWNED_FIELDS = ['initBy', 'rateVal', 'resubComment', 'remarks'];

function parse(json, fallback) {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

/** Merge FieldsJson + HybridJson into the values that should be displayed. */
function resolveFields(row) {
  const f = { ...parse(row.FieldsJson, {}) };
  const hyb = parse(row.HybridJson, {});
  for (const k of Object.keys(hyb)) {
    const h = hyb[k] || {};
    if (h.pfn === false && h.user != null) f[k] = h.user;
    else if (h.pfn !== false && h.qms != null && (f[k] == null || f[k] === '' || HYBRID_FIELDS.includes(k))) f[k] = h.qms;
  }
  return f;
}

function isoDate(d) { return d ? new Date(d).toISOString().slice(0, 10) : null; }

/** Canonical API shape for an MC_Entries row (used by entries + sheets routes). */
function rowToEntry(row) {
  const hyb = parse(row.HybridJson, {});
  return {
    id: row.Id,
    nfa: row.NfaNo,
    mode: row.Mode,
    index: row.IndexName,
    wt: row.WorkType,
    date: isoDate(row.ReviewDate),
    f: resolveFields(row),
    fRaw: parse(row.FieldsJson, {}),
    hyb,
    // which hybrid fields are currently user-overridden (for yellow cells)
    userEdited: Object.fromEntries(Object.keys(hyb).map((k) => [k, hyb[k]?.pfn === false])),
    touch: parse(row.TouchJson, {}),
    files: parse(row.FilesJson, []),
    initiator: row.InitiatedBy,
    isProxy: !!row.IsProxy,
    initDt: isoDate(row.InitiatedOn),
    enteredBy: row.EnteredBy,
    interimRef: row.InterimRef,
    status: row.Status,
    sel: !!row.Selected,
    mc: !!row.PresentToMC,
    resubReq: !!row.ResubRequired,
    resubComment: row.ResubComment,
    isOpen: !!row.IsOpen,
    updatedAt: row.UpdatedAt,
  };
}

/**
 * Apply a fresh QMS record to an existing entry WITHOUT losing anything a
 * person typed: QMS values overwrite QMS values; user-owned fields, touched
 * cells and hybrid overrides survive. Returns { fields, hyb } to store.
 */
function mergeRepull(row, qmsRec, hybridInit) {
  const cur = parse(row.FieldsJson, {});
  const touch = parse(row.TouchJson, {});
  const hyb = parse(row.HybridJson, {});
  const fields = { ...cur, ...qmsRec };
  for (const k of USER_OWNED_FIELDS) {
    if (cur[k] !== undefined && cur[k] !== null && cur[k] !== '') fields[k] = cur[k];
  }
  for (const k of Object.keys(touch)) {
    if (touch[k] && touch[k].value !== undefined) fields[k] = touch[k].value;
  }
  const fresh = hybridInit(qmsRec);
  for (const k of Object.keys(fresh)) {
    if (!hyb[k]) hyb[k] = fresh[k];
    else hyb[k] = { ...hyb[k], qms: fresh[k].qms };
  }
  return { fields, hyb };
}

module.exports = { HYBRID_FIELDS, USER_OWNED_FIELDS, resolveFields, rowToEntry, mergeRepull, parse, isoDate };
