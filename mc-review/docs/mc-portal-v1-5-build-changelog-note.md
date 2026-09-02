# MC Portal — v1.5 build changelog & ops note

**Date:** 02-Sep-2026 · **Scope:** fixes for the four production issues
reported after v1.4 (PDF not generating, NFA search limited to 3 months,
Page-1 edits not saved, Page 1/2 freezing) plus the deployment model change
that removes the Vite dev server from production.

---

## 1. Published PDF output (Page 3) — REBUILT

Previously the PDF was streamed on demand and never saved; the frontend
opened the route as a bare link (no auth header) and got a 401.

Now, on **Publish**:

1. Statuses, sheet close, and the publication row commit in **one SQL
   transaction**.
2. The PDF is generated from the frozen snapshot and written to
   **`PDF_DIR`** (env; default `<backend>/published-pdfs`) as
   `MC-Review-<INDEX>-<YYYY-MM-DD>-Rev<N>.pdf`, **and** the bytes are stored
   on `dbo.MC_PublishedPdfs.PdfBytes` so the document survives a disk or
   server move.
3. `GET /api/pdf/:index/:date` serves **disk → DB → regenerate** (the
   `X-Pdf-Source` response header says which). `?download=1` forces
   attachment; `?rev=2` selects a corrigendum. Admins can
   `POST /api/pdf/:index/:date/regenerate` (e.g. after a font/logo fix).
4. A PDF generation failure does **not** un-publish — the date stays closed
   and the next "Open PDF" click regenerates.

Rendering: per-row height measurement (no more overlapping rows), header
repeated per page, page numbers, Work-Type bands, counters line, verbatim
footer. A Unicode TTF is embedded for `₹` (auto-detects `C:\Windows\Fonts\
arial.ttf`; override with `PDF_FONT_PATH`); if no TTF is found it falls back
to Helvetica and prints `Rs.`.

The frontend fetches the PDF as an **authenticated blob**
(`src/utils/pdf.js`) — never as a bare `<a href>`.

## 2. QMS mirror — full history search (dbo.MC_QmsNfa)

The live feed only supports a date range, and full history is ~80 MB /
~14k rows. It is now mirrored into SQL Server by `lib/qmsSync.js`:

- **First boot:** full history from `QMS_HISTORY_START` (default
  2022-01-01) in month chunks, in the background, **resumable** after a
  restart (`MC_Config.qmsFullSyncCursor`). A failing chunk is split down to
  3-day windows so one bad month never blocks the rest.
- **Steady state:** a rolling `QMS_SYNC_LOOKBACK_DAYS` (45) window
  refreshes every `QMS_SYNC_INTERVAL_MIN` (10) minutes.
- **Fetch miss:** if an NFA created minutes ago isn't mirrored yet, one
  quick 7-day refresh runs before answering "not found".
- Feed rows repeat per amendment; the **latest version wins**
  (`NFA_Created_Date`, then `ENFA_Version`). PR-only rows (no NFA yet) are
  kept with `RecKey='PR:<EPR_No>'` and shown in the browser as Mode-B
  candidates.
- Ops visibility: `GET /api/qms/status`, `dbo.MC_QmsSyncLog`, and the
  status line on Page 1 → All NFAs. Admin buttons: *Sync recent now* /
  *Re-sync full history*.

**Field mapping change:** *Original Order Value* now maps to the feed's
`Amount_Including_Tax` and *PR Budget* to `PR_Budget` (rupees → lacs), each
falling back to `NFA_Budget` (which previously fed both columns).

## 3. Field resolution — one source of truth (lib/fields.js)

Page-1 hybrid overrides (`HybridJson`), reviewer touch-ups (`TouchJson`)
and QMS values (`FieldsJson`) are resolved by **one** shared helper used by
every route, the lock snapshot and the PDF. Consequences:

- A Page-1 edit shows identically on Page 2, in the locked snapshot, and in
  the published PDF.
- A Page-2 touch-up also updates the Page-1 card (and vice versa).
- **Re-pull keeps human input:** `initBy`, `rateVal`, `resubComment`,
  `remarks`, touched cells, and hybrid overrides survive a QMS refresh.
- Lock now respects the Page-2 **Present to MC** tick (`PresentToMC`); the
  Page-1 checkbox (`Selected`) is submission intent only.

## 4. Performance / freezing

- Page 1/2/3 tables no longer unmount on refresh; mutations return the
  updated entry and patch the row in place; checkboxes are optimistic.
- `contentEditable` cells replaced with controlled textareas that save on
  blur only when the text changed.
- 12 covering indexes added (entries, snapshot rows, pending moves, order
  register, published PDFs, audit, QMS mirror).
- One cached connection-pool promise (no connect/migrate race); JSON error
  handler; JSON 404 for `/api/*`.
- **Slow-request log:** any request over `SLOW_MS` (2000 ms) prints
  `[slow …ms] METHOD url -> status` — check this first when "the page is
  slow".

## 5. Production serving model — no Vite in prod

`server.js` serves `frontend/dist` as an SPA when present (`SERVE_FRONTEND`
!= 0). Deploy = build once, run one Node process:

```powershell
cd D:\smartdesk_live\MC_Review\mc-review\backend
npm install
cd ..\frontend
npm install
npm run build          # must end with "✓ built"
cd ..\backend
copy .env.example .env # then edit .env (see below)
node server.js         # or restart the NSSM service
```

App URL: `http://<server>:5094/` (frontend + API on one port). Do **not**
run `npm run dev` in production.

### .env (production values)

See `backend/.env.example`. Key entries: `DB_SERVER=2023-DT1`,
`DB_DATABASE=MCReviewDB`, `DB_USER=mcreview_user`, a real `JWT_SECRET`, and
`PDF_DIR` pointing at a folder the service account can write (it is created
on boot if missing).

### First boot

- All new tables/columns/indexes auto-migrate — no manual SQL.
- The QMS full-history sync starts in the background (~5–10 min for
  2022→today at measured feed speeds). The app is usable immediately;
  recent NFAs are searchable within seconds, older ones as their chunks
  land. Progress: Page 1 → All NFAs status line or `GET /api/qms/status`.

### SQL Server Express note

`MC_QmsNfa` stores the raw feed JSON per record (~80 MB total at today's
volume) and `MC_PublishedPdfs` stores PDF bytes (~50 KB per publish). Both
are far below the 10 GB Express cap and grow slowly; the mirror **upserts**
(no history tables), so there is no runaway-growth mode like the QMS_SAP_PR
incident.
