/**
 * Published PDF builder — Workflow v2.5 §9.1, matched against the issued
 * reference sample (docs/reference-pdf-samples/…v3.pdf): landscape table,
 * full field set, Presented/Approved/Hold/Rejected/Undecided counter line,
 * Work-Type group bands, "(Initiated on …)" sub-line, verbatim footer copy.
 *
 * Returns a Buffer (never streams straight to the HTTP response) so the same
 * document can be written to PDF_DIR on the server, stored in the DB, and
 * served later — and so a generation error is a clean 500, not a half-sent
 * file.
 *
 * Fonts: the built-in Helvetica cannot draw "₹" (it comes out as "¹"). We
 * embed a Unicode TTF when one is available (PDF_FONT_PATH, then Windows
 * Arial, then DejaVu on Linux) and otherwise fall back to Helvetica with
 * "₹" written as "Rs.".
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { WORK_TYPES, INDEX_NAMES, revisedVal } = require('./reference');

const LOGO_PATH = path.join(__dirname, 'smartworld-logo.png');
const FONT_CANDIDATES = [
  process.env.PDF_FONT_PATH,
  'C:\\Windows\\Fonts\\arial.ttf',
  'C:\\Windows\\Fonts\\segoeui.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
].filter(Boolean);
const FONT_BOLD_CANDIDATES = [
  process.env.PDF_FONT_BOLD_PATH,
  'C:\\Windows\\Fonts\\arialbd.ttf',
  'C:\\Windows\\Fonts\\segoeuib.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
].filter(Boolean);

function firstExisting(list) { return list.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null; }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDMY(d) {
  if (!d) return '—';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return `${String(day).padStart(2, '0')}-${MONTHS[m - 1]}-${y}`;
  }
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return `${String(dt.getDate()).padStart(2, '0')}-${MONTHS[dt.getMonth()]}-${dt.getFullYear()}`;
}
function fmtTime(d) { const dt = d instanceof Date ? d : new Date(d); return isNaN(dt.getTime()) ? '' : dt.toTimeString().slice(0, 5); }

const DECISION_LABEL = { approved: 'APPROVED', hold: 'HOLD', rejected: 'REJECTED' };
const money = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));

/**
 * @param {object} p
 * @param {string} p.index        'MEP' | 'CIVIL'
 * @param {string} p.date         review date ISO
 * @param {object} p.pub          MC_PublishedPdfs row (Revision, PublishedAt, PublishedBy, UndecidedNos, LockedVersion)
 * @param {object[]} p.rows       MC_SnapshotRows for the published version
 * @param {number} [p.version]    locked snapshot version (fallback to pub.LockedVersion)
 * @returns {Promise<Buffer>}
 */
function buildPublishedPdf({ index, date, pub, rows, version }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 24, size: 'A4', layout: 'landscape', bufferPages: true, info: {
      Title: `MC Review — ${INDEX_NAMES[index] || index} — ${fmtDMY(date)}`,
      Author: 'Smart World Developers — Contracts & Procurement',
    } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ---- fonts ----
    const regular = firstExisting(FONT_CANDIDATES);
    const bold = firstExisting(FONT_BOLD_CANDIDATES);
    let F = 'Helvetica', FB = 'Helvetica-Bold', unicode = false;
    try {
      if (regular) { doc.registerFont('Body', regular); F = 'Body'; unicode = true; }
      if (bold) { doc.registerFont('BodyBold', bold); FB = 'BodyBold'; } else if (regular) { FB = 'Body'; }
    } catch { F = 'Helvetica'; FB = 'Helvetica-Bold'; unicode = false; }
    const T = (s) => (unicode ? String(s ?? '') : String(s ?? '').replace(/₹/g, 'Rs.'));

    const left = doc.page.margins.left;
    const pageW = doc.page.width - left - doc.page.margins.right;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

    const decided = rows.filter((r) => r.Decision);
    const undecidedNos = (() => { try { return JSON.parse(pub.UndecidedNos || '[]'); } catch { return []; } })();
    const counters = {
      presented: rows.length,
      approved: decided.filter((r) => r.Decision === 'approved').length,
      hold: decided.filter((r) => r.Decision === 'hold').length,
      rejected: decided.filter((r) => r.Decision === 'rejected').length,
      undecided: rows.length - decided.length,
    };
    const lockedV = version || pub.LockedVersion || '—';

    // ---- header (drawn on every page) ----
    function drawHeader(first) {
      try { doc.image(LOGO_PATH, doc.page.width - doc.page.margins.right - 110, doc.page.margins.top - 4, { width: 110 }); } catch { /* logo optional */ }
      doc.fillColor('#000').font(FB).fontSize(first ? 15 : 12)
        .text(T(`MC REVIEW — ${(INDEX_NAMES[index] || index).toUpperCase()} — ${fmtDMY(date)}`), left, doc.page.margins.top, { width: pageW - 120, align: 'center' });
      if (first) {
        doc.font(F).fontSize(7).fillColor('#444')
          .text('S M A R T   W O R L D   D E V E L O P E R S   ·   C O N T R A C T S   &   P R O C U R E M E N T   ·   M A N A G E M E N T   C O M M I T T E E   R E V I E W', left, doc.y, { width: pageW - 120, align: 'center' });
        doc.fillColor('#000').moveDown(0.6);
        doc.fontSize(8).font(F).text(
          T(`Meeting date: ${fmtDMY(date)}    Index: ${INDEX_NAMES[index] || index}    Locked snapshot: v${lockedV}    ` +
            `Published: ${fmtDMY(pub.PublishedAt)} ${fmtTime(pub.PublishedAt)} by ${pub.PublishedBy}    Document: Rev-${pub.Revision} (${pub.Revision > 1 ? 'corrigendum' : 'original'})`),
          left, doc.y, { width: pageW },
        );
        doc.moveDown(0.3);
        doc.font(FB).text(
          `Presented: ${counters.presented}    Approved: ${counters.approved}    Hold: ${counters.hold}    Rejected: ${counters.rejected}    Undecided (excluded, expired): ${counters.undecided}`,
          left, doc.y, { width: pageW },
        );
        doc.font(F).moveDown(0.5);
      } else {
        doc.font(F).fontSize(7).fillColor('#444').text(`(continued) · Rev-${pub.Revision} · Locked snapshot v${lockedV}`, left, doc.y, { width: pageW - 120, align: 'center' });
        doc.fillColor('#000').moveDown(0.6);
      }
    }

    // ---- table ----
    const cols = [
      { key: 'sno', label: 'S.No', w: 18 },
      { key: 'project', label: 'Project', w: 55 },
      { key: 'loc', label: 'Loc.', w: 30 },
      { key: 'desc', label: 'Description of Work', w: 88 },
      { key: 'vendor', label: 'Vendor Name', w: 80 },
      { key: 'prBudget', label: T('PR Budget ₹L'), w: 36 },
      { key: 'val', label: T('Orig. Value ₹L (incl. GST)'), w: 42 },
      { key: 'lastAmd', label: T('Last Amend. ₹L'), w: 34 },
      { key: 'variation', label: T('This Variation ₹L'), w: 34 },
      { key: 'revised', label: T('Revised Value ₹L'), w: 36 },
      { key: 'reason', label: 'Reason', w: 76 },
      { key: 'rateVal', label: 'Validation of Rates', w: 52 },
      { key: 'vendPQ', label: 'Vend. & PQ', w: 26 },
      { key: 'pr', label: 'PR No.', w: 38 },
      { key: 'nfa', label: 'NFA No.', w: 56 },
      { key: 'resub', label: 'Remark from NFA Creator (resubmission)', w: 58 },
      { key: 'creator', label: 'Creator', w: 40 },
      { key: 'mcComment', label: 'MC Comments', w: 55 },
      { key: 'status', label: 'MC Approval / Status', w: 48 },
    ];
    const scale = pageW / cols.reduce((s, c) => s + c.w, 0);
    cols.forEach((c) => { c.w *= scale; });
    const PAD = 2.2;
    const BODY_SIZE = 6.3;
    const HEAD_SIZE = 6;

    function drawTableHeader() {
      const y = doc.y;
      doc.font(FB).fontSize(HEAD_SIZE);
      let h = 0;
      cols.forEach((c) => { h = Math.max(h, doc.heightOfString(c.label, { width: c.w - 2 * PAD })); });
      h += 2 * PAD;
      doc.rect(left, y, pageW, h).fill('#E9EBEE').fillColor('#000');
      let x = left;
      cols.forEach((c) => {
        doc.text(c.label, x + PAD, y + PAD, { width: c.w - 2 * PAD });
        doc.moveTo(x, y).lineTo(x, y + h).strokeColor('#AEB4BC').lineWidth(0.4).stroke();
        x += c.w;
      });
      doc.moveTo(left, y + h).lineTo(left + pageW, y + h).strokeColor('#AEB4BC').lineWidth(0.6).stroke();
      doc.y = y + h;
      doc.font(F);
    }

    function newPage() {
      doc.addPage({ margin: 24, size: 'A4', layout: 'landscape' });
      drawHeader(false);
      drawTableHeader();
    }
    function ensureSpace(h) {
      if (doc.y + h > bottomLimit() - 8) newPage();
    }

    drawHeader(true);
    drawTableHeader();

    const grouped = {};
    decided.forEach((r) => { (grouped[r.WorkType] = grouped[r.WorkType] || []).push(r); });

    Object.keys(grouped).sort().forEach((wt) => {
      ensureSpace(16 + 30);
      const by = doc.y;
      doc.rect(left, by, pageW, 12).fill('#F0F1F4').fillColor('#000');
      doc.font(FB).fontSize(7.5).text(`${wt}. ${(WORK_TYPES[wt] || '').toUpperCase()}`, left + 4, by + 2.5, { width: pageW - 8 });
      doc.y = by + 12;
      doc.font(F);

      grouped[wt].forEach((r, i) => {
        let f = {};
        try { f = JSON.parse(r.FieldsJson || '{}'); } catch { /* keep {} */ }
        const cells = {
          sno: String(i + 1),
          project: f.project || '',
          loc: f.location || '',
          desc: f.desc || '',
          vendor: f.vendor || '',
          prBudget: money(f.prBudget),
          val: money(f.val),
          lastAmd: money(f.lastAmd),
          variation: money(f.variation),
          revised: revisedVal(f),
          reason: f.reason || '—',
          rateVal: f.rateVal || '—',
          vendPQ: money(f.vendPQ),
          pr: money(f.pr),
          nfa: r.NfaNo + (f.initDt ? `\n(Initiated on ${fmtDMY(f.initDt)})` : ''),
          resub: f.resubComment || '—',
          creator: f.initiator || '',
          mcComment: r.McComment || '—',
          status: DECISION_LABEL[r.Decision] || '',
        };
        if (r.RelocatedTo) cells.nfa += `\n(live entry relocated to ${r.RelocatedTo} — history only)`;

        // measure the row: tallest cell wins (this is what the old code missed)
        doc.fontSize(BODY_SIZE);
        let rowH = 0;
        cols.forEach((c) => {
          doc.font(c.key === 'nfa' || c.key === 'status' ? FB : F);
          rowH = Math.max(rowH, doc.heightOfString(T(cells[c.key]), { width: c.w - 2 * PAD }));
        });
        rowH += 2 * PAD;
        ensureSpace(rowH);

        const y = doc.y;
        let x = left;
        cols.forEach((c) => {
          const isBold = c.key === 'nfa' || c.key === 'status';
          if (c.key === 'status') {
            const col = r.Decision === 'approved' ? '#0B6B3A' : r.Decision === 'hold' ? '#9A6700' : '#B3261E';
            doc.fillColor(col);
          } else doc.fillColor('#000');
          doc.font(isBold ? FB : F).fontSize(BODY_SIZE).text(T(cells[c.key]), x + PAD, y + PAD, { width: c.w - 2 * PAD });
          doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor('#D5D9DF').lineWidth(0.3).stroke();
          x += c.w;
        });
        doc.fillColor('#000');
        doc.moveTo(left, y + rowH).lineTo(left + pageW, y + rowH).strokeColor('#D5D9DF').lineWidth(0.3).stroke();
        doc.y = y + rowH;
      });
    });

    if (decided.length === 0) {
      doc.moveDown(1).font(F).fontSize(8).fillColor('#444')
        .text('No decided entries — all presented entries were undecided and have expired with this publish.', left, doc.y, { width: pageW, align: 'center' });
      doc.fillColor('#000');
    }

    // ---- footer ----
    ensureSpace(60);
    doc.moveDown(0.8);
    doc.font(F).fontSize(7).fillColor('#000')
      .text(`Undecided & excluded from this document: ${undecidedNos.length ? undecidedNos.join(', ') : '—'}.`, left, doc.y, { width: pageW });
    doc.text('Held/Rejected NFAs re-presentations require a fresh entry with mandatory resubmission comment.', left, doc.y, { width: pageW });
    doc.moveDown(0.4);
    doc.fontSize(6.5).fillColor('#555')
      .text(
        'System-generated on Publish · locked & immutable · corrections by admin corrigendum (Rev-2) only          ' +
        'Confidential — For internal circulation within Smartworld Developers and associated entities only. Unauthorized sharing, ' +
        'reproduction, or distribution of this document, in whole or in part, is strictly prohibited without prior written approval.',
        left, doc.y, { width: pageW },
      );
    doc.fillColor('#000');

    // page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font(F).fontSize(6.5).fillColor('#666')
        .text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - doc.page.margins.bottom + 4, { width: pageW, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

function pdfFileName(index, dateISO, revision) {
  return `MC-Review-${index}-${dateISO}-Rev${revision}.pdf`;
}

module.exports = { buildPublishedPdf, pdfFileName, fmtDMY };
