import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import api from '../api';
import { fmtDMY } from '../utils/date';

const PAGE = 100;

// Page-1 "All NFAs (QMS)" tab: browses the full mirrored feed with
// server-side search + paging, and shows the mirror's sync state.
export default function QmsBrowser({ onUse }) {
  const { isAdmin } = useApp();
  const { push } = useToast();
  const [q, setQ] = useState('');
  const [nfaOnly, setNfaOnly] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const seq = useRef(0);

  async function load({ q: qq = q, offset: off = 0, append = false } = {}) {
    const my = ++seq.current;
    setLoading(true); setError(null);
    try {
      const data = await api.allNfas({ q: qq, limit: PAGE, offset: off, nfaOnly });
      if (my !== seq.current) return;
      setRows((cur) => (append ? [...cur, ...data.rows] : data.rows));
      setTotal(data.total);
      setOffset(off);
    } catch (e) {
      if (my === seq.current) setError(e.response?.data?.error || 'Failed to load NFAs');
    } finally { if (my === seq.current) setLoading(false); }
  }

  async function loadStatus() { try { setStatus(await api.qmsStatus()); } catch { /* ignore */ } }

  useEffect(() => { loadStatus(); }, []);
  // Debounced search — the server filters, so we never ship thousands of rows.
  useEffect(() => {
    const t = setTimeout(() => load({ q, offset: 0 }), 350);
    return () => clearTimeout(t);
  }, [q, nfaOnly]);
  // Poll status while a sync is running.
  useEffect(() => {
    if (!status?.running) return undefined;
    const t = setInterval(loadStatus, 4000);
    return () => clearInterval(t);
  }, [status?.running]);

  async function syncNow(mode) {
    try {
      const r = await api.qmsSync(mode);
      push(mode === 'full' ? 'Full history re-sync started in the background' : `Refreshed — ${r.rowsUpserted ?? 0} record(s) updated`);
      await loadStatus();
      if (mode !== 'full') load({ q, offset: 0 });
    } catch (e) { push(e.response?.data?.error || 'Sync failed', 'error'); }
  }

  const statusLine = status ? (
    <span className="filterlbl">
      Mirror: <b>{status.total?.toLocaleString()}</b> records ({status.withNfa?.toLocaleString()} NFAs · {status.prOnly?.toLocaleString()} PRs without NFA)
      {status.earliest && <> · from <b>{fmtDMY(String(status.earliest).slice(0, 10))}</b> to <b>{fmtDMY(String(status.latest).slice(0, 10))}</b></>}
      {status.running ? <> · <span className="hold">syncing ({status.running}{status.progress ? ` ${status.progress.done}/${status.progress.total} months` : ''})…</span></>
        : status.fullSyncDone ? <> · full history ✓</> : <> · <span className="hold">full history not yet complete</span></>}
      {status.lastIncrementalAt && <> · refreshed {new Date(status.lastIncrementalAt).toLocaleTimeString()}</>}
      {status.lastError && <> · <span className="rej">last error: {status.lastError}</span></>}
    </span>
  ) : null;

  return (
    <div className="surface">
      <div className="toolbar">
        <input className="inp" style={{ width: 320 }} placeholder="Search NFA no. / PR no. / project / vendor / title… (all history)"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="filterlbl" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" className="cbx" checked={nfaOnly} onChange={(e) => setNfaOnly(e.target.checked)} /> NFAs only
        </label>
        <span className="filterlbl">{loading ? 'Searching…' : `${rows.length.toLocaleString()} of ${total.toLocaleString()} shown`}</span>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => { load({ q, offset: 0 }); loadStatus(); }}>Refresh</button>
        {isAdmin && <button className="btn ghost sm" disabled={!!status?.running} onClick={() => syncNow('incremental')}>Sync recent now</button>}
        {isAdmin && <button className="btn ghost sm" disabled={!!status?.running} onClick={() => { if (window.confirm('Re-sync the entire QMS history from scratch? Runs in the background; the app stays usable.')) syncNow('full'); }}>Re-sync full history</button>}
      </div>
      <div className="toolbar" style={{ marginTop: -4 }}>{statusLine}</div>

      {error ? <div className="empty">{error}</div> : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>NFA No.</th><th>PR No.</th><th>Project</th><th>Location</th><th>Title / Description</th>
                <th>Vendor(s)</th><th>Value ₹L</th><th>PR Budget ₹L</th><th>Initiated On</th>
                <th>Initiator</th><th>QMS Status</th><th>Pending With</th><th>Package</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.nfa || `PR:${n.prNo}`}>
                  <td className="nfa">{n.nfa || <span className="st grey">— (PR only)</span>}</td>
                  <td>{n.prNo || '—'}</td>
                  <td>{n.project}</td>
                  <td>{n.location}</td>
                  <td>{n.desc}</td>
                  <td>{n.vendor}</td>
                  <td>{n.val}</td>
                  <td>{n.prBudget}</td>
                  <td>{n.initDt ? fmtDMY(n.initDt) : '—'}</td>
                  <td>{n.initiator}</td>
                  <td>{n.qmsStatus || '—'}</td>
                  <td>{n.pendWith}</td>
                  <td>{n.initBy}</td>
                  <td>
                    {n.nfa ? <button className="btn sm" onClick={() => onUse(n.nfa)}>Use in Fetch</button> : <span className="sub">use Mode B</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={14} className="empty">{q ? 'No QMS records match that search.' : 'The mirror is empty — the first sync runs at server start; check the status line above.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!error && rows.length < total && (
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button className="btn" disabled={loading} onClick={() => load({ q, offset: offset + PAGE, append: true })}>
            Load {Math.min(PAGE, total - rows.length)} more
          </button>
          <span className="filterlbl">{(total - rows.length).toLocaleString()} more match{total - rows.length === 1 ? '' : 'es'}</span>
        </div>
      )}

      <div className="legendline">
        Every PR/NFA the QMS feed has ever returned, mirrored into the dashboard database and refreshed every few minutes —
        search covers the full history, not just recent months. Click "Use in Fetch" to pre-fill the NFA number on My Entries,
        then pick Index / Work Type / Review Date and Fetch as usual. PR-only rows have no NFA yet — enter those via Mode B.
      </div>
    </div>
  );
}
