import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { openPdfInNewTab, downloadPdf } from '../utils/pdf';

// Open / Download buttons for a published PDF. Both go through the
// authenticated API (blob) — never a bare link, which would 401.
export default function PdfButtons({ index, date, rev, compact }) {
  const { push } = useToast();
  const [busy, setBusy] = useState(null);
  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === 'open') await openPdfInNewTab(index, date, { rev });
      else await downloadPdf(index, date, { rev });
    } catch (e) { push(e.message || 'PDF failed', 'error'); }
    finally { setBusy(null); }
  }
  return (
    <span className="pdfbtns">
      <button className={`btn sm ${compact ? 'ghost' : 'primary'}`} disabled={!!busy} onClick={() => run('open')}>{busy === 'open' ? 'Opening…' : 'Open PDF'}</button>
      <button className="btn sm ghost" disabled={!!busy} onClick={() => run('download')}>{busy === 'download' ? '…' : 'Download'}</button>
    </span>
  );
}
