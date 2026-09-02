import api from '../api';

function fileNameFrom(res, fallback) {
  const cd = res.headers?.['content-disposition'] || '';
  const m = cd.match(/filename="?([^";]+)"?/);
  return m ? m[1] : fallback;
}

/**
 * Open a published PDF in a new tab. The window is opened synchronously
 * (inside the click handler, so pop-up blockers allow it) and pointed at the
 * blob once the authenticated download completes.
 */
export async function openPdfInNewTab(index, date, opts = {}) {
  const win = window.open('', '_blank');
  if (win) {
    win.document.title = `MC Review ${index} ${date}`;
    win.document.body.innerHTML = '<p style="font-family:Segoe UI,Arial;padding:24px;color:#444">Preparing PDF…</p>';
  }
  try {
    const res = await api.pdfBlob(index, date, opts);
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (win) win.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch (e) {
    if (win) win.close();
    throw new Error(await errorMessage(e));
  }
}

/** Download a published PDF with its server file name. */
export async function downloadPdf(index, date, opts = {}) {
  try {
    const res = await api.pdfBlob(index, date, opts);
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameFrom(res, `MC-Review-${index}-${date}.pdf`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch (e) {
    throw new Error(await errorMessage(e));
  }
}

async function errorMessage(e) {
  // Error bodies come back as a blob when responseType is 'blob'.
  const data = e.response?.data;
  if (data instanceof Blob) {
    try { const j = JSON.parse(await data.text()); return j.error || 'PDF request failed'; } catch { /* fall through */ }
  }
  return data?.error || e.message || 'PDF request failed';
}
