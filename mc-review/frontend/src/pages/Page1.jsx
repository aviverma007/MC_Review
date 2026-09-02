import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import api from '../api';
import { todayISO, fmtDMY } from '../utils/date';
import Modal from '../components/Modal';
import FileChips from '../components/FileChips';
import PdfButtons from '../components/PdfButtons';
import QmsBrowser from '../components/QmsBrowser';

// Exact column order from the reference prototype (checkbox, S.No, NFA No.,
// Index, Work Type, Project, Description of Work, Vendor Name, Original
// Order Value, PR Budget Value, Creator, NFA Initiated By, Review Date,
// Downloadable Files, Status), plus an Action column for delete.
const COLS = 16;

export default function Page1() {
  const { reference } = useApp();
  const { push } = useToast();
  const today = todayISO();

  const [subTab, setSubTab] = useState('entries');
  // B3/F14: "Entry Date View" — today (= today + every future date) or one
  // specific future date. Two pieces of state so switching to "Choose date…"
  // never sends a non-date to the API (the old single-state version sent the
  // literal string "custom" and every load failed).
  const [viewMode, setViewMode] = useState('today');
  const [viewDate, setViewDate] = useState(today);
  const dateView = viewMode === 'today' ? 'today' : viewDate;

  const [entries, setEntries] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterQ, setFilterQ] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [qeNfa, setQeNfa] = useState('');
  const [qeIndex, setQeIndex] = useState('');
  const [qeWt, setQeWt] = useState('');
  const [qeDate, setQeDate] = useState(today);
  const [fetching, setFetching] = useState(false);
  const [showModeB, setShowModeB] = useState(false);

  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [resubComment, setResubComment] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [publishedPdfs, setPublishedPdfs] = useState([]);
  const [stagedFiles, setStagedFiles] = useState([]);
  const loadSeq = useRef(0);

  // ---- entries list: never unmounts the table while refreshing -------------
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setRefreshing(true);
    try {
      const data = await api.listEntries(dateView);
      if (seq === loadSeq.current) setEntries(data);
    } catch (e) {
      push(e.response?.data?.error || 'Failed to load entries', 'error');
    } finally {
      if (seq === loadSeq.current) { setRefreshing(false); setInitialLoading(false); }
    }
  }, [dateView]);

  // Replace one entry in place (responses now return the updated entry) so
  // an edit shows immediately without a full round-trip + re-render.
  const patchEntry = useCallback((entry) => {
    if (!entry) return;
    setEntries((cur) => cur.map((e) => (e.id === entry.id ? { ...e, ...entry, pmv: entry.pmv ?? e.pmv } : e)));
  }, []);

  useEffect(() => { setInitialLoading(true); load(); }, [load]);
  useEffect(() => { api.getStagedFiles().then((d) => setStagedFiles(d.staged || [])).catch(() => {}); }, []);
  useEffect(() => { if (subTab === 'pdfs') api.publishedPdfs().then(setPublishedPdfs).catch(() => {}); }, [subTab]);

  async function onPickStagedFiles(fileList) {
    if (!fileList || !fileList.length) return;
    try {
      const res = await api.stageFiles(fileList);
      setStagedFiles(res.data.staged || []);
      push(`${fileList.length} file(s) staged for the next entry`);
    } catch { push('Upload failed', 'error'); }
  }

  async function doFetch() {
    if (!qeNfa.trim() || !qeIndex || !qeWt) return push('NFA number, Index, and Work Type are required', 'error');
    setFetching(true);
    try {
      const res = await api.fetchNfa({ nfa: qeNfa.trim(), index: qeIndex, wt: qeWt, date: qeDate });
      const d = res.data;
      if (d.created) push(`NFA ${d.entry.nfa} fetched — draft created for ${fmtDMY(qeDate)}`);
      else if (d.repull) push(`Re-pulled ${d.entry.nfa} — QMS fields refreshed, your edits kept${d.autoDeselected ? ' (locked sheet: auto-deselected)' : ''}`);
      else if (d.draftRetargeted) push(`Draft retargeted to ${qeIndex}/${qeWt}/${fmtDMY(qeDate)}`);
      else if (d.pendingMoveStaged) push(d.chip, 'warn');
      setQeNfa('');
      setStagedFiles([]);
      await load();
    } catch (e) {
      const data = e.response?.data;
      if (data?.offerModeB) {
        push('NFA not found in QMS — you can enter it via Mode B', 'error');
        setShowModeB(true);
      } else {
        push(data?.error || 'Fetch failed', 'error');
      }
    } finally { setFetching(false); }
  }

  async function toggleSelect(entry) {
    const next = !entry.sel;
    patchEntry({ ...entry, sel: next }); // optimistic
    try { await api.selectEntry(entry.id, next); }
    catch (e) { patchEntry({ ...entry, sel: !next }); push(e.response?.data?.error || 'Failed', 'error'); }
  }

  async function doSubmit(entry, comment) {
    try {
      const res = await api.submitEntry(entry.id, comment);
      const d = res.data;
      if (d.submitted) push(`${entry.nfa} submitted — review date ${fmtDMY(entry.date)}${d.autoDeselected ? ' (locked sheet: landed deselected)' : ''}`);
      else if (d.withdrawn) push(`${entry.nfa} withdrawn`);
      else if (d.relocated) push(`${entry.nfa} relocated`);
      else if (d.convertedToFreshEntry) push(`${entry.nfa} — old date published; converted to a fresh entry`, 'warn');
      setPendingConfirm(null);
      setResubComment('');
      return true;
    } catch (e) {
      const data = e.response?.data;
      if (data?.requiresComment) setPendingConfirm({ entry, requiresComment: true });
      else push(data?.error || 'Submit failed', 'error');
      return false;
    }
  }

  async function submitChecked() {
    const checked = entries.filter((e) => e.sel && (e.status === 'draft' || e.status === 'submitted' || e.pmv));
    if (checked.length === 0) return push('Nothing checked to submit', 'error');
    for (const e of checked) {
      // eslint-disable-next-line no-await-in-loop
      await doSubmit(e);
    }
    load();
  }

  async function doDelete(entry) {
    try {
      await api.deleteEntry(entry.id);
      push(`${entry.nfa} deleted`);
      setDeleteTarget(null);
      setEntries((cur) => cur.filter((e) => e.id !== entry.id));
    } catch (e) { push(e.response?.data?.error || 'Delete failed', 'error'); }
  }

  const filterLower = filterQ.toLowerCase();
  const filteredEntries = entries.filter((e) => {
    if (!filterLower) return true;
    const hay = `${e.nfa} ${e.f?.desc || ''} ${e.f?.vendor || ''} ${e.f?.project || ''} ${e.initiator || ''}`.toLowerCase();
    return hay.includes(filterLower);
  });
  const checkedCount = filteredEntries.filter((e) => e.sel && (e.status === 'draft' || e.status === 'submitted' || e.pmv)).length;

  return (
    <div className="pagewrap">
      <div className="subtabs">
        {['entries', 'allnfas', 'pdfs', 'search'].map((t) => (
          <button key={t} className={`stab ${subTab === t ? 'active' : ''}`} onClick={() => setSubTab(t)}>
            {t === 'entries' ? 'My Entries' : t === 'allnfas' ? 'All NFAs (QMS)' : t === 'pdfs' ? 'Published PDFs' : 'NFA Search & History'}
          </button>
        ))}
        <div className="spacer" />
        {subTab === 'entries' && (
          <div className="p1datebox">
            <span>Entry Date View:</span>
            <select className="inp" value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
              <option value="today">Today (+ all future)</option>
              <option value="date">Choose date…</option>
            </select>
            {viewMode === 'date' && (
              <input type="date" className="inp" min={today} value={viewDate} onChange={(e) => e.target.value && setViewDate(e.target.value)} />
            )}
            {refreshing && !initialLoading && <span className="refreshing">refreshing…</span>}
          </div>
        )}
      </div>

      {subTab === 'entries' && (
        <div className="surface">
          <div className="qentry">
            <div className="field">
              <label>NFA Number <span className="req">*</span></label>
              <input className="inp" style={{ width: 132 }} value={qeNfa} onChange={(e) => setQeNfa(e.target.value)} placeholder="e.g. 14315"
                onKeyDown={(e) => { if (e.key === 'Enter') doFetch(); }} />
            </div>
            <div className="field">
              <label>Index <span className="req">*</span></label>
              <select className="inp" value={qeIndex} onChange={(e) => setQeIndex(e.target.value)}>
                <option value="">Select…</option>
                {reference && Object.keys(reference.indexNames).map((k) => (
                  <option key={k} value={k}>{reference.indexNames[k]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Work Type <span className="req">*</span></label>
              <select className="inp" value={qeWt} onChange={(e) => setQeWt(e.target.value)}>
                <option value="">Select…</option>
                {reference && Object.keys(reference.workTypes).map((k) => (
                  <option key={k} value={k}>{k} · {reference.workTypes[k]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Review Date <span className="req">*</span></label>
              <input type="date" className="inp" value={qeDate} min={today} onChange={(e) => e.target.value && setQeDate(e.target.value)} />
            </div>
            <button className="btn primary" onClick={doFetch} disabled={fetching}>{fetching ? 'Fetching…' : 'Fetch from QMS'}</button>
            <label className="btn ghost" style={{ cursor: 'pointer', marginBottom: 0 }}>
              Upload files
              <input type="file" multiple style={{ display: 'none' }} onChange={(e) => { onPickStagedFiles(e.target.files); e.target.value = ''; }} />
            </label>
            <button className="modeb" onClick={() => setShowModeB(true)}>No NFA in QMS yet? Manual entry (Mode B)</button>
          </div>
          {stagedFiles.length > 0 && (
            <div className="staged">
              Staged for next entry: <FileChips files={stagedFiles} />
            </div>
          )}

          <div className="toolbar">
            <input className="inp" style={{ width: 250 }} placeholder="Filter this date's list… (NFA / vendor / project)" value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
            <span className="filterlbl">Showing: <b>{viewMode === 'today' ? `${fmtDMY(today)} · today view — all open entries incl. future dates` : fmtDMY(viewDate)}</b></span>
            <div className="spacer" />
            <button className="btn primary" onClick={submitChecked} disabled={checkedCount === 0}>Submit {checkedCount} checked → Page 2</button>
          </div>

          {initialLoading ? <div className="empty">Loading…</div> : filteredEntries.length === 0 ? (
            <div className="empty">No entries for this view — fetch an NFA above, use Mode B, or pick another review date.</div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th></th><th>S.No</th><th>NFA No.</th><th>Index</th><th>Work Type</th><th>Project</th>
                    <th>Description of Work</th><th>Vendor Name</th><th>Original Order Value ₹L (incl. GST)</th>
                    <th>PR Budget Value ₹L</th><th>Creator</th><th>NFA Initiated By</th><th>Review Date</th>
                    <th>Downloadable Files (QMS + uploads)</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((e, i) => (
                    <PageOneRow
                      key={e.id}
                      entry={e}
                      sno={i + 1}
                      expanded={expandedId === e.id}
                      onExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                      onToggleSelect={() => toggleSelect(e)}
                      onSubmit={async (comment) => { if (await doSubmit(e, comment)) load(); }}
                      onPatch={patchEntry}
                      onRefresh={load}
                      onDeleteRequest={() => setDeleteTarget(e)}
                      reference={reference}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="legendline">
            Yellow = user-edited / manual · unmarked cells are QMS-sourced · <b>*</b> on NFA Initiator = proxy entry ·
            files: click to open/download, × to deselect · re-fetch an existing NFA to re-pull QMS fields (your edits are kept) &amp; restore its attachments ·
            today's view lists all open entries (today + every future review date); pick a future date to filter to that date only —
            history lives in Published PDFs &amp; NFA Search
          </div>
        </div>
      )}

      {subTab === 'allnfas' && (
        <QmsBrowser onUse={(nfa) => { setQeNfa(nfa); setSubTab('entries'); }} />
      )}

      {subTab === 'pdfs' && (
        <div className="surface">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Index</th><th>Review Date</th><th>Revision</th><th>Snapshot</th><th>Published By</th><th>Published At</th><th>Decided</th><th>File</th><th></th></tr></thead>
              <tbody>
                {publishedPdfs.map((p) => (
                  <tr key={p.Id || `${p.IndexName}-${p.ReviewDate}-${p.Revision}`}>
                    <td>{p.IndexName}</td>
                    <td>{fmtDMY(String(p.ReviewDate).slice(0, 10))}</td>
                    <td>Rev-{p.Revision}</td>
                    <td>{p.LockedVersion ? `v${p.LockedVersion}` : '—'}</td>
                    <td>{p.PublishedBy}</td>
                    <td>{new Date(p.PublishedAt).toLocaleString()}</td>
                    <td>{p.DecidedCount}</td>
                    <td className="sub">{p.FileName || '—'}{p.PdfSize ? ` · ${Math.round(p.PdfSize / 1024)} KB` : ''}</td>
                    <td><PdfButtons index={p.IndexName} date={String(p.ReviewDate).slice(0, 10)} rev={p.Revision} /></td>
                  </tr>
                ))}
                {publishedPdfs.length === 0 && <tr><td colSpan={9} className="empty">No published PDFs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'search' && <NfaHistorySearch reference={reference} />}

      {showModeB && (
        <ModeBForm
          reference={reference}
          today={today}
          onClose={() => setShowModeB(false)}
          onCreated={() => { setShowModeB(false); load(); }}
        />
      )}

      {pendingConfirm?.requiresComment && (
        <Modal
          title="Mandatory resubmission comment"
          onClose={() => setPendingConfirm(null)}
          actions={<>
            <button className="btn ghost" onClick={() => setPendingConfirm(null)}>Cancel</button>
            <button className="btn primary" disabled={!resubComment.trim()} onClick={async () => { if (await doSubmit(pendingConfirm.entry, resubComment)) load(); }}>Submit</button>
          </>}
        >
          <p>The old review date has published while this move was pending. This converts to a fresh entry — a resubmission comment is required.</p>
          <textarea className="inp" style={{ width: '100%', minHeight: 70 }} value={resubComment} onChange={(e) => setResubComment(e.target.value)} />
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete this entry?"
          onClose={() => setDeleteTarget(null)}
          actions={<>
            <button className="btn ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn danger" onClick={() => doDelete(deleteTarget)}>Delete</button>
          </>}
        >
          <p>
            NFA <b>{deleteTarget.nfa}</b> ({deleteTarget.f?.desc}) will be permanently removed from this list. This can't
            be undone — if you need it again later, fetch it fresh from QMS.
          </p>
        </Modal>
      )}
    </div>
  );
}

function statusCell(e) {
  if (e.status === 'draft') return <span className="st grey">Draft{e.mode === 'B' ? ' · Mode B' : ''}</span>;
  if (e.status === 'submitted') return <span className="st grey">Submitted → Page 2</span>;
  if (e.status === 'presented') return <span className="st grey">Locked for MC · {fmtDMY(e.date)}</span>;
  if (e.status === 'expired') return <span className="st pend">Expired (undecided {fmtDMY(e.date)})</span>;
  const cls = e.status === 'approved' ? 'ok' : e.status === 'hold' ? 'hold' : 'rej';
  return <span className={`st ${cls}`}>{e.status.toUpperCase()} · {fmtDMY(e.date)}</span>;
}

function PageOneRow({ entry: e, sno, expanded, onExpand, onToggleSelect, onSubmit, onPatch, onRefresh, onDeleteRequest, reference }) {
  const { push } = useToast();
  const editable = e.status === 'draft' || e.status === 'submitted';
  const locked = ['approved', 'hold', 'rejected', 'expired', 'presented'].includes(e.status);
  const dIndex = e.pmv ? e.pmv.index : e.index;
  const dWt = e.pmv ? e.pmv.wt : e.wt;
  const dDate = e.pmv ? e.pmv.date : e.date;
  const prBudgetIsUser = !!e.userEdited?.prBudget;

  async function removeFile(i) {
    try { const r = await api.removeFile(e.id, i); onPatch(r.data.entry); } catch { push('Failed to remove file', 'error'); }
  }

  return (
    <>
      <tr className={locked && e.status !== 'presented' ? 'rowlocked' : ''}>
        <td>
          {(editable || e.pmv) ? (
            <input type="checkbox" className="cbx" checked={e.sel} onChange={onToggleSelect} />
          ) : <input type="checkbox" className="cbx" disabled />}
        </td>
        <td>{sno}</td>
        <td className="nfa" style={{ cursor: 'pointer' }} onClick={onExpand} title="Click to open the entry editor">
          {e.nfa} <span className="expando">{expanded ? '▴' : '▾'}</span>
          {e.initDt && <div className="sub">(Initiated on {fmtDMY(e.initDt)})</div>}
          {e.mode === 'B' && <div className="sub">Manual · Mode B · interim reference (cite it in QMS at NFA initiation)</div>}
          {e.resubReq && <div className="sub" style={{ color: '#9A6700', fontWeight: 700 }}>Resubmit flagged</div>}
          {e.pmv && (
            <div className="pmvchip">
              Pending move from {e.pmv.fromIndex}·{fmtDMY(e.pmv.fromDate)} — submit to apply · previous entry still on Page 2
            </div>
          )}
        </td>
        <td>{dIndex}</td>
        <td><b>{dWt}</b> · {reference?.workTypes?.[dWt]}</td>
        <td>{e.f?.project}</td>
        <td>{e.f?.desc}</td>
        <td>{e.f?.vendor}</td>
        <td><b>{e.f?.val}</b></td>
        <td className={prBudgetIsUser ? 'edit' : ''}>{e.f?.prBudget ?? '—'}</td>
        <td>{e.initiator}{e.isProxy && <b className="redstar" title={`Proxy entry — entered by ${e.enteredBy}`}>*</b>}</td>
        <td>{e.f?.initBy || '—'}</td>
        <td>{fmtDMY(dDate)}</td>
        <td><FileChips files={e.files} removable={editable} onRemove={removeFile} /></td>
        <td>{statusCell(e)}</td>
        <td>
          {editable && (
            <button className="btn sm danger" onClick={onDeleteRequest} title="Delete this entry">Delete</button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="editor-row">
          <td colSpan={COLS}>
            <EntryEditor entry={e} editable={editable} onSubmit={onSubmit} onPatch={onPatch} onRefresh={onRefresh} reference={reference} />
          </td>
        </tr>
      )}
    </>
  );
}

// One "Pick from NFA" card. Saves on blur (or Ctrl/⌘+Enter) only when the
// text actually changed, patches the row in place, and shows a saved tick —
// the previous version reloaded the whole page, which unmounted the editor
// mid-edit and made saves look lost.
function HybridCard({ entry, field, label, editable, onPatch }) {
  const { push } = useToast();
  const h = entry.hyb?.[field] || { pfn: true, qms: '', user: null };
  const serverVal = h.pfn === false ? (h.user ?? h.qms ?? '') : (h.qms ?? '');
  const [localVal, setLocalVal] = useState(serverVal);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setLocalVal(serverVal); }, [serverVal, h.pfn]);

  async function togglePfn(checked) {
    try {
      const r = await api.updateField(entry.id, { field, pfn: checked, ...(checked ? {} : (h.user == null ? { userValue: h.qms || '' } : {})) });
      onPatch(r.data.entry);
    } catch { push('Failed to update', 'error'); }
  }
  async function saveUserVal() {
    if (h.pfn !== false || localVal === serverVal) return;
    setSaving(true);
    try {
      const r = await api.updateField(entry.id, { field, userValue: localVal });
      onPatch(r.data.entry);
      setSaved(true); setTimeout(() => setSaved(false), 1800);
    } catch { push('Failed to save', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fcard">
      <h5>{label}
        <label className="pfn">
          <input type="checkbox" className="cbx" style={{ width: 12, height: 12 }} checked={h.pfn !== false} disabled={!editable} onChange={(e) => togglePfn(e.target.checked)} />
          Pick from NFA
        </label>
      </h5>
      {h.pfn !== false ? (
        <textarea className="fval" readOnly value={h.qms || '—'} />
      ) : (
        <>
          <textarea className="fval userv" readOnly={!editable} value={localVal ?? ''}
            onChange={(e) => setLocalVal(e.target.value)} onBlur={saveUserVal}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') e.currentTarget.blur(); }} />
          <div className="sub">
            {saving ? 'Saving…' : saved ? <span className="ok">Saved ✓</span> : localVal !== serverVal ? 'Unsaved — click outside the box (or Ctrl+Enter) to save' : 'Your text supersedes QMS.'}
          </div>
        </>
      )}
    </div>
  );
}

function EntryEditor({ entry: e, editable, onSubmit, onPatch, onRefresh, reference }) {
  const { push } = useToast();
  const [resub, setResub] = useState(e.resubComment || '');
  const [resubSaved, setResubSaved] = useState(false);
  useEffect(() => { setResub(e.resubComment || ''); }, [e.resubComment]);

  async function setPlainField(field, value) {
    try { const r = await api.updatePlainField(e.id, field, value); onPatch(r.data.entry); push(`${field === 'initBy' ? 'NFA Initiated By' : 'Validation of Rates'} saved`); }
    catch { push('Failed to update', 'error'); }
  }
  async function saveResub() {
    if (resub === (e.resubComment || '')) return;
    try { const r = await api.setResubComment(e.id, resub); onPatch(r.data.entry); setResubSaved(true); setTimeout(() => setResubSaved(false), 1800); }
    catch { push('Failed to save', 'error'); }
  }
  async function refreshQms() {
    try {
      const r = await api.fetchNfa({ nfa: e.nfa, index: e.index, wt: e.wt, date: e.date });
      onPatch(r.data.entry);
      push('Refreshed from QMS — your edits were kept');
      if (r.data.autoDeselected) onRefresh();
    } catch (err) { push(err.response?.data?.error || 'Refresh failed', 'error'); }
  }
  async function uploadToEntry(fileList) {
    if (!fileList || !fileList.length) return;
    try {
      const res = await api.uploadFilesToEntry(e.id, fileList);
      push(`${res.data.added.length} file(s) attached`);
      onPatch(res.data.entry);
    } catch { push('Upload failed', 'error'); }
  }
  async function removeEntryFile(i) {
    try { const r = await api.removeFile(e.id, i); onPatch(r.data.entry); } catch { push('Failed to remove file', 'error'); }
  }

  return (
    <div className="editor-inner">
      <div className="ed-head">
        <b>{e.nfa} — entry editor</b>
        <span style={{ fontSize: 10, color: '#444' }}>
          {e.mode === 'A' ? 'QMS pulled at entry creation — re-fetch anytime to re-pull (your edits are kept)' : 'Manual entry — no QMS link yet'}
        </span>
      </div>
      <div className="fieldsrow">
        <HybridCard entry={e} field="prBudget" label="PR Budget Value ₹L" editable={editable} onPatch={onPatch} />
        <HybridCard entry={e} field="reason" label="Reason for this New Work/Variation" editable={editable} onPatch={onPatch} />
        <HybridCard entry={e} field="vendPQ" label="No's of Considered Vendors & PQ" editable={editable} onPatch={onPatch} />
        <HybridCard entry={e} field="remarks" label="Remarks / Status" editable={editable} onPatch={onPatch} />
      </div>
      <div className="fieldsrow" style={{ marginTop: 10 }}>
        <div className="fcard">
          <h5>NFA Initiated By <span className="pfn">dropdown</span></h5>
          <select className="inp" style={{ width: '100%' }} disabled={!editable} value={e.f?.initBy || ''} onChange={(ev) => setPlainField('initBy', ev.target.value)}>
            <option value="">—</option>
            {reference?.initiatedByOptions?.map((o) => <option key={o} value={o}>{o}</option>)}
            {e.f?.initBy && !reference?.initiatedByOptions?.includes(e.f.initBy) && <option value={e.f.initBy}>{e.f.initBy} (from QMS)</option>}
          </select>
        </div>
        <div className="fcard">
          <h5>Validation of Rates <span className="pfn">dropdown</span></h5>
          <select className="inp" style={{ width: '100%' }} disabled={!editable} value={e.f?.rateVal || ''} onChange={(ev) => setPlainField('rateVal', ev.target.value)}>
            <option value="">—</option>
            {reference?.rateValidations?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      {e.resubReq && (
        <div className="resub-card">
          <h5>Resubmission comment <em>* mandatory — NFA previously presented</em></h5>
          <textarea className="fval" style={{ minHeight: 36 }} readOnly={!editable} value={resub} onChange={(ev) => setResub(ev.target.value)} onBlur={saveResub} />
          <div className="sub">{resubSaved ? <span className="ok">Saved ✓</span> : resub !== (e.resubComment || '') ? 'Unsaved — click outside to save' : ''}</div>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <h5 style={{ fontSize: 9.5, textTransform: 'uppercase', color: '#000', marginBottom: 5 }}>Attached files</h5>
        <FileChips files={e.files} removable={editable} onRemove={removeEntryFile} />
        {editable && (
          <label className="btn sm ghost" style={{ marginTop: 5, cursor: 'pointer', display: 'inline-block' }}>
            + Upload file
            <input type="file" multiple style={{ display: 'none' }} onChange={(ev) => { uploadToEntry(ev.target.files); ev.target.value = ''; }} />
          </label>
        )}
      </div>
      <div className="ed-actions">
        {editable ? (
          <>
            {e.mode === 'A' && <button className="btn ghost" onClick={refreshQms}>Refresh from QMS</button>}
            <button className="btn ghost" onClick={() => onSubmit()}>{e.sel ? 'Submit' : 'Withdraw'}</button>
          </>
        ) : (
          <span className="st grey">
            Read-only — {e.status === 'presented' ? 'locked with reviewer for MC · Fetch from QMS to update (the update lands on Page 2 deselected)' : 'entry closed'}
          </span>
        )}
        <span className="audit-note">Every change is versioned &amp; audit-logged.</span>
      </div>
    </div>
  );
}

function NfaHistorySearch({ reference }) {
  const { push } = useToast();
  const [searchNfa, setSearchNfa] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function doSearch() {
    if (!searchNfa.trim()) return;
    setBusy(true);
    try { setResult(await api.searchNfa(searchNfa.trim())); }
    catch (e) { push(e.response?.data?.error || 'Search failed', 'error'); }
    finally { setBusy(false); }
  }

  const st = (s) => <span className={`st ${s === 'approved' ? 'ok' : s === 'hold' ? 'hold' : s === 'rejected' ? 'rej' : 'grey'}`}>{(s || 'undecided').toUpperCase()}</span>;

  return (
    <div className="surface">
      <div className="toolbar">
        <input className="inp" placeholder="NFA number (e.g. 14315) or interim ref (EM/09-26/001)" style={{ width: 300 }} value={searchNfa}
          onChange={(e) => setSearchNfa(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }} />
        <button className="btn primary" onClick={doSearch} disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
        <span className="filterlbl">Searches the dashboard history <b>and</b> the full QMS feed (all dates, not just recent months).</span>
      </div>
      {result && (
        <div>
          <h4 style={{ marginBottom: 8 }}>QMS record — {result.nfa}</h4>
          {result.qms ? (
            <div className="qmscard">
              <div><b>Project:</b> {result.qms.project} · <b>Location:</b> {result.qms.location}</div>
              <div><b>Title:</b> {result.qms.desc}</div>
              <div><b>Vendor(s):</b> {result.qms.vendor}</div>
              <div><b>Value ₹L:</b> {result.qms.val} · <b>PR Budget ₹L:</b> {result.qms.prBudget} · <b>NFA Budget ₹L:</b> {result.qms.nfaBudget} · <b>PR No.:</b> {result.qms.pr}</div>
              <div><b>Initiated:</b> {result.qms.initDt ? fmtDMY(result.qms.initDt) : '—'} by {result.qms.initiator} · <b>QMS status:</b> {result.qms.qmsStatus || '—'} · <b>Pending with:</b> {result.qms.pendWith}</div>
            </div>
          ) : <div className="empty" style={{ padding: 12 }}>Not found in the QMS feed{/^\d+$/.test(result.nfa) ? '' : ' (Mode-B references have no QMS record)'}.</div>}

          <h4 style={{ margin: '14px 0 8px' }}>Dashboard entries</h4>
          <div className="tablewrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Index</th><th>WT</th><th>Review Date</th><th>Status</th><th>Entered By</th><th>PR Budget ₹L</th><th>Last updated</th></tr></thead>
              <tbody>
                {result.entries.map((e) => (
                  <tr key={e.id}><td>{e.index}</td><td>{e.wt} · {reference?.workTypes?.[e.wt]}</td><td>{fmtDMY(e.date)}</td><td>{statusCell(e)}</td><td>{e.enteredBy}</td><td>{e.f?.prBudget}</td><td>{e.updatedAt ? new Date(e.updatedAt).toLocaleString() : ''}</td></tr>
                ))}
                {result.entries.length === 0 && <tr><td colSpan={7} className="empty">No entries yet for this NFA.</td></tr>}
              </tbody>
            </table>
          </div>
          <h4 style={{ marginBottom: 8 }}>Sitting history</h4>
          <div className="tablewrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Index</th><th>Meeting date</th><th>Snapshot</th><th>Work Type</th><th>Decision</th><th>MC Comment</th><th>Relocated?</th><th>Published</th><th>PDF</th></tr></thead>
              <tbody>
                {result.history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.index}</td><td>{fmtDMY(h.date)}</td><td>v{h.version}{h.isLatestVersion ? '' : ' (superseded)'}</td><td>{h.wt}</td><td>{st(h.decision)}</td><td>{h.mcComment || '—'}</td><td>{h.relocatedTo || '—'}</td>
                    <td>{h.published ? 'Yes' : 'No'}</td>
                    <td>{h.hasPdf ? <PdfButtons index={h.index} date={h.date} compact /> : '—'}</td>
                  </tr>
                ))}
                {result.history.length === 0 && <tr><td colSpan={9} className="empty">Never presented to MC.</td></tr>}
              </tbody>
            </table>
          </div>
          <h4 style={{ marginBottom: 8 }}>Orders</h4>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Order No.</th><th>Type</th><th>Vendor</th><th>Generated by</th></tr></thead>
              <tbody>
                {result.orders.map((o) => (
                  <tr key={o.Id}><td className="nfa">{o.OrderNo}</td><td>{o.OrderType}</td><td>{o.Vendor}</td><td>{o.GeneratedBy}</td></tr>
                ))}
                {result.orders.length === 0 && <tr><td colSpan={4} className="empty">No order numbers generated.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeBForm({ reference, today, onClose, onCreated }) {
  const { push } = useToast();
  const [index, setIndex] = useState('MEP');
  const [wt, setWt] = useState('A');
  const [date, setDate] = useState(today);
  const [initiator, setInitiator] = useState('');
  const [fields, setFields] = useState({ project: '', location: '', desc: '', vendor: '', val: '', reason: '', vendPQ: '', prBudget: '', initBy: '', rateVal: '' });

  async function submit() {
    try {
      await api.createModeB({ index, wt, date, initiator, fields });
      push('Mode B entry created');
      onCreated();
    } catch (e) { push(e.response?.data?.error || 'Failed to create', 'error'); }
  }

  return (
    <Modal
      title="Mode B — Manual NFA Entry"
      onClose={onClose}
      actions={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={submit}>Create</button>
      </>}
    >
      <p style={{ color: '#666' }}>An interim reference (e.g. EM/07-26/001) is auto-issued and should be cited in QMS at NFA initiation. Manual linking is via the Remarks breadcrumb.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="field"><label>Index</label>
          <select className="inp" value={index} onChange={(e) => setIndex(e.target.value)}>
            {reference && Object.keys(reference.indexNames).map((k) => <option key={k} value={k}>{reference.indexNames[k]}</option>)}
          </select>
        </div>
        <div className="field"><label>Work Type</label>
          <select className="inp" value={wt} onChange={(e) => setWt(e.target.value)}>
            {reference && Object.keys(reference.workTypes).map((k) => <option key={k} value={k}>{k} — {reference.workTypes[k]}</option>)}
          </select>
        </div>
        <div className="field"><label>Review Date</label><input type="date" className="inp" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        <div className="field"><label>Initiator (free text)</label><input className="inp" value={initiator} onChange={(e) => setInitiator(e.target.value)} /></div>
        <div className="field"><label>Project</label><input className="inp" value={fields.project} onChange={(e) => setFields({ ...fields, project: e.target.value })} /></div>
        <div className="field"><label>Location</label><input className="inp" value={fields.location} onChange={(e) => setFields({ ...fields, location: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Description</label><input className="inp" style={{ width: '100%' }} value={fields.desc} onChange={(e) => setFields({ ...fields, desc: e.target.value })} /></div>
        <div className="field"><label>Vendor</label><input className="inp" value={fields.vendor} onChange={(e) => setFields({ ...fields, vendor: e.target.value })} /></div>
        <div className="field"><label>Value (₹L)</label><input className="inp" value={fields.val} onChange={(e) => setFields({ ...fields, val: e.target.value })} /></div>
        <div className="field"><label>PR Budget Value</label><input className="inp" value={fields.prBudget} onChange={(e) => setFields({ ...fields, prBudget: e.target.value })} /></div>
        <div className="field"><label>No. of Considered Vendors &amp; PQ</label><input className="inp" value={fields.vendPQ} onChange={(e) => setFields({ ...fields, vendPQ: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Reason for this New Work/Variation</label><input className="inp" style={{ width: '100%' }} value={fields.reason} onChange={(e) => setFields({ ...fields, reason: e.target.value })} /></div>
        <div className="field"><label>NFA Initiated By</label>
          <select className="inp" value={fields.initBy} onChange={(e) => setFields({ ...fields, initBy: e.target.value })}>
            <option value="">—</option>
            {reference && reference.initiatedByOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="field"><label>Validation of Rates</label>
          <select className="inp" value={fields.rateVal} onChange={(e) => setFields({ ...fields, rateVal: e.target.value })}>
            <option value="">—</option>
            {reference && reference.rateValidations.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  );
}
