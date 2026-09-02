import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import api from '../api';
import { todayISO, fmtDMY } from '../utils/date';
import EndOfSheetMarker from '../components/EndOfSheetMarker';
import FileChips from '../components/FileChips';
import Modal from '../components/Modal';
import PdfButtons from '../components/PdfButtons';

// Exact column order from the reference prototype: S.No, PR No., Project,
// Location, Creator, NFA Initiated By, Description, Duration, Vendor Name,
// PR Budget, Orig. Value, Last Amend., This Variation, Revised Value,
// Reason, Validation of Rates, Vendors&PQ, NFA No., Pending With,
// resubmission remark, Downloadable Files, MC Comments, MC Approval/Status.
const COLS = 23;

export default function Page3() {
  const { isAdmin, reviewerIndex, reference } = useApp();
  const { push } = useToast();
  const today = todayISO();

  const [index, setIndex] = useState(reviewerIndex || 'MEP');
  const [date, setDate] = useState(today);
  const [sheet, setSheet] = useState(null);
  const [rows, setRows] = useState([]);
  const [pdf, setPdf] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [publishModal, setPublishModal] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const data = await api.getMeeting(index, date);
      if (seq !== loadSeq.current) return;
      setSheet(data.sheet);
      setRows(data.rows || []);
      setPdf(data.pdf || null);
    } catch (e) { push(e.response?.data?.error || 'Failed to load', 'error'); }
    finally { if (seq === loadSeq.current) setInitialLoading(false); }
  }, [index, date]);

  useEffect(() => { setInitialLoading(true); load(); }, [load]);

  const patchRow = (id, patch) => setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  async function setDecision(row, decision) {
    const prev = row.decision;
    patchRow(row.id, { decision }); // optimistic
    try {
      const res = await api.setDecision(index, date, row.id, decision);
      patchRow(row.id, { decision: res.data.decision });
    } catch (e) {
      patchRow(row.id, { decision: prev });
      push(e.response?.data?.error || 'Failed', 'error');
    }
  }

  async function setComment(row, comment) {
    if ((row.mcComment || '') === (comment || '')) return;
    patchRow(row.id, { mcComment: comment });
    try { await api.setMcComment(index, date, row.id, comment); }
    catch (e) { push(e.response?.data?.error || 'Comment not saved', 'error'); load(); }
  }

  const decidedCount = rows.filter((r) => r.decision).length;
  const undecided = rows.filter((r) => !r.decision);

  function openPublishModal() {
    setPublishModal({
      undecidedNos: undecided.map((r) => r.nfa),
      zeroDecided: decidedCount === 0,
    });
  }

  async function doPublish() {
    setPublishing(true);
    try {
      const res = await api.publish(index, date, true);
      const d = res.data;
      push(`Published — ${d.decidedCount} decided, ${d.undecidedCount} expired${d.pdf ? ` · ${d.pdf.fileName} saved` : ''}`);
      if (d.pdfError) push(`Published, but the PDF could not be generated: ${d.pdfError}. Use "Open PDF" to retry.`, 'error');
      setPublishModal(null);
      await load();
    } catch (e) {
      push(e.response?.data?.error || 'Publish failed', 'error');
    } finally { setPublishing(false); }
  }

  const grouped = {};
  rows.forEach((r) => { (grouped[r.wt] = grouped[r.wt] || []).push(r); });
  const workTypes = Object.keys(grouped).sort();
  const published = sheet?.publishedRev > 0;
  const publishDisabled = rows.length === 0 || published || publishing;

  const lockLabel = sheet
    ? `Locked snapshot v${sheet.version} · ${sheet.lockedAt ? new Date(sheet.lockedAt).toLocaleString() : ''}`
    : 'No locked snapshot yet — lock the sheet on Page 2 first';

  return (
    <div className="pagewrap">
      <div className="idxtabs">
        {['MEP', 'CIVIL'].map((i) => (
          <button key={i} className={`itab ${index === i ? 'active' : ''}`} onClick={() => setIndex(i)}>
            {reference?.indexNames?.[i] || i}
          </button>
        ))}
      </div>
      <div className="surface">
        <div className="sheethead">
          <div className="field">
            <label>Meeting date</label>
            <input type="date" className="inp" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <span className={`lockstate ${sheet ? 'locked' : ''}`}>{lockLabel}</span>
          <span className="chip">{decidedCount} / {rows.length} decided</span>
          {published && <span className="chip">Published Rev-{sheet.publishedRev}</span>}
          <div className="spacer" />
          {published && <PdfButtons index={index} date={date} />}
          {isAdmin && published && (
            <button className="btn ghost sm" onClick={async () => {
              try { const r = await api.regeneratePdf(index, date); push(`PDF regenerated → ${r.fileName}`); load(); }
              catch (e) { push(e.response?.data?.error || 'Regenerate failed', 'error'); }
            }}>Regenerate PDF</button>
          )}
          <button className="btn primary" disabled={publishDisabled} onClick={openPublishModal}>
            {publishing ? 'Publishing…' : `Publish ${index}`}
          </button>
        </div>

        {published && (
          <div className="pdfcard">
            <div>
              <b>Published document:</b> {pdf?.fileName || `MC-Review-${index}-${date}-Rev${sheet.publishedRev}.pdf`}
              {pdf?.size ? ` · ${Math.round(pdf.size / 1024)} KB` : ''}
              {pdf?.publishedBy ? ` · published by ${pdf.publishedBy} at ${new Date(pdf.publishedAt).toLocaleString()}` : ''}
              {pdf && !pdf.generatedAt && <span className="hold"> · PDF not yet generated — "Open PDF" will build it</span>}
            </div>
            <div className="sub">Stored on the server (PDF folder) and in the database. Decisions and comments are frozen. Also listed under Page 1 → Published PDFs.</div>
          </div>
        )}

        {initialLoading ? <div className="empty">Loading…</div> : rows.length === 0 ? (
          <div className="empty">No NFAs for review.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>S.No</th><th>PR No.</th><th>Project</th><th>Location</th><th>Creator</th><th>NFA Initiated By</th>
                  <th>Description of Work</th><th>Duration</th><th>Vendor Name</th><th>PR Budget Value ₹L</th>
                  <th>Orig. Value ₹L (incl. GST)</th><th>Last Amend. ₹L</th><th>This Variation ₹L</th><th>Revised Value ₹L</th>
                  <th>Reason for this New work/variation</th><th>Validation of Rates</th><th>Vendors &amp; PQ</th>
                  <th>NFA No.</th><th>Pending With</th><th>Remark from NFA Creator (resubmission)</th>
                  <th>Downloadable Files</th><th>MC Comments</th><th>MC Approval / Status</th>
                </tr>
              </thead>
              <tbody>
                {workTypes.map((wt) => (
                  <FragmentGroup key={wt} wt={wt} label={reference?.workTypes?.[wt]}>
                    {grouped[wt].map((r, i) => (
                      <Page3Row
                        key={r.id}
                        row={r}
                        sno={i + 1}
                        published={published}
                        onDecide={(d) => setDecision(r, d)}
                        onComment={(c) => setComment(r, c)}
                      />
                    ))}
                  </FragmentGroup>
                ))}
                <EndOfSheetMarker colSpan={COLS} />
              </tbody>
            </table>
          </div>
        )}
        <div className="legendline">
          Yellow = operator-entered (MC comments) / user overrides · type MC comments directly in the cell (Excel-style; saves when you leave the cell) ·
          decisions: 👍 approve · ⏸ hold · 👎 reject — comments optional on all three · undecided rows are excluded from
          the PDF and expire · this table is the locked snapshot: Page 2 changes appear only after re-lock ·
          Publish generates the PDF and saves it on the server
        </div>
      </div>

      {publishModal && (
        <Modal
          title={`Publish ${reference?.indexNames?.[index] || index} — ${fmtDMY(date)}`}
          onClose={() => setPublishModal(null)}
          actions={<>
            <button className="btn ghost" onClick={() => setPublishModal(null)} disabled={publishing}>Cancel</button>
            <button className="btn primary" onClick={doPublish} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish & generate PDF'}</button>
          </>}
        >
          <p><b>{decidedCount}</b> of <b>{rows.length}</b> presented NFAs have a decision.</p>
          {publishModal.zeroDecided && (
            <p className="rej"><b>No decisions recorded.</b> Publishing now closes the date with an empty document and expires every presented NFA.</p>
          )}
          {publishModal.undecidedNos.length > 0 ? (
            <p>
              <b>{publishModal.undecidedNos.length} undecided</b> will be excluded from the PDF and marked <b>expired</b>:<br />
              <span className="nfa">{publishModal.undecidedNos.join(', ')}</span>
            </p>
          ) : <p>No undecided NFAs — everything presented carries a decision.</p>}
          <p className="sub">This is final for the date: decisions and comments lock, the PDF is generated and stored on the server, and corrections are admin corrigendum (Rev-2) only.</p>
        </Modal>
      )}
    </div>
  );
}

function FragmentGroup({ wt, label, children }) {
  return (
    <>
      <tr className="band"><td colSpan={COLS}>{wt}. {(label || '').toUpperCase()}</td></tr>
      {children}
    </>
  );
}

function revisedValLocal(f) {
  if (!f) return 'NA';
  const num = (s) => parseFloat(String(s ?? '').replace(/[^0-9.-]/g, ''));
  const v = num(f.variation);
  if (isNaN(v)) return 'NA';
  const lastAmd = num(f.lastAmd);
  const base = isNaN(lastAmd) ? num(f.val) : lastAmd;
  if (isNaN(base)) return 'NA';
  return String(Math.round((base + v) * 100) / 100);
}

function CommentCell({ value, published, onSave }) {
  const server = value ?? '';
  const [val, setVal] = useState(server);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setVal(server); }, [server, editing]);
  if (published) return <td className="yellowcell">{server || '—'}</td>;
  return (
    <td className="yellowcell">
      <textarea className="cellinput" value={val} rows={1} placeholder="MC comment…"
        onFocus={() => setEditing(true)}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEditing(false); onSave(val); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }} />
    </td>
  );
}

function Page3Row({ row: r, sno, published, onDecide, onComment }) {
  return (
    <tr className={r.relocatedTo ? 'rowdim' : ''}>
      <td>{sno}</td>
      <td>{r.f?.pr || '—'}</td>
      <td>{r.f?.project}</td>
      <td>{r.f?.location}</td>
      <td>{r.f?.initiator}</td>
      <td>{r.f?.initBy || '—'}</td>
      <td>{r.f?.desc}</td>
      <td>{r.f?.duration || '—'}</td>
      <td>{r.f?.vendor}</td>
      <td>{r.f?.prBudget}</td>
      <td><b>{r.f?.val}</b></td>
      <td>{r.f?.lastAmd}</td>
      <td>{r.f?.variation}</td>
      <td><b>{revisedValLocal(r.f)}</b></td>
      <td>{r.f?.reason}</td>
      <td>{r.f?.rateVal || '—'}</td>
      <td>{r.f?.vendPQ}</td>
      <td className="nfa">
        {r.nfa}
        {r.f?.initDt && <div className="sub">(Initiated on {fmtDMY(r.f.initDt)})</div>}
        {r.relocatedTo && <div className="sub pmvchip">live entry relocated to {r.relocatedTo} — decisions record to NFA history only</div>}
      </td>
      <td>{r.f?.pendWith || '—'}</td>
      <td>{r.f?.resubComment || '—'}</td>
      <td><FileChips files={r.files} /></td>
      <CommentCell value={r.mcComment} published={published} onSave={onComment} />
      <td>
        {published ? (
          r.decision ? <span className={`st ${r.decision === 'approved' ? 'ok' : r.decision === 'hold' ? 'hold' : 'rej'}`}>{r.decision.toUpperCase()}</span> : <span className="st pend">EXPIRED</span>
        ) : (
          <>
            <button className={`decbtn g ${r.decision === 'approved' ? 'sel' : r.decision ? 'dim' : ''}`} title="Approve" onClick={() => onDecide('approved')}>👍</button>
            <button className={`decbtn y ${r.decision === 'hold' ? 'sel' : r.decision ? 'dim' : ''}`} title="Hold" onClick={() => onDecide('hold')}>⏸</button>
            <button className={`decbtn r ${r.decision === 'rejected' ? 'sel' : r.decision ? 'dim' : ''}`} title="Reject" onClick={() => onDecide('rejected')}>👎</button>
            <div className="sub">
              {r.decision ? <b className={r.decision === 'approved' ? 'ok' : r.decision === 'hold' ? 'hold' : 'rej'}>{r.decision.toUpperCase()}</b> : <span className="pend">pending — excluded from PDF if undecided</span>}
            </div>
          </>
        )}
      </td>
    </tr>
  );
}
