# MC Review Dashboard — IT Handover Package v1.4

**Date:** 07-Jul-2026  
**Prepared by:** Dhruv Sharma (dhruv.sharma@smartworlddevelopers.com)  
**Dashboard version:** v1.4 (157,721 bytes, patched through round-2 E2E audit)

---

## Folder Contents

| Folder | Contents |
|--------|----------|
| `01-Dashboard/` | Production-ready single-file HTML prototype (zero dependencies, embedded logo) |
| `02-Documentation/` | Workflow Definition v2.5, Readiness/UAT v1.7, Handover Manifest v2.0, P4 Order Number Syntax for IT, Build Changelogs (v1.3 + v1.4) |
| `03-Regression-Suite/` | 170-check Playwright regression suite, suite generator, manual adversarial verifier |
| `04-Patch-Scripts/` | Atomic patch lineage: v1.2→v1.3 (patch-v1-3/3b), v1.3→v1.4 (patch-v1-4/4b/4c/4d) |
| `05-PDF-Samples/` | Published PDF output format samples (v2 + v3) |
| `06-Screenshots/` | v1.4 screenshots: P1 editor/dropdowns, P2 format, P3 decisions, P4 orders |

## For IT Team — Quick Start

1. Open `01-Dashboard/mc-review-dashboard-prototype-v1-4.html` in any modern browser (Chrome/Edge recommended)
2. The prototype runs entirely client-side — no server, no database, no dependencies
3. Use the role switcher (top-right) to simulate different user roles: `user`, `revMEP`, `revCIV`, `admin`
4. Frozen demo date: `05-Jul-2026` — all QMS data is simulated in-memory

## Key Document for IT

**`02-Documentation/mc-portal-p4-order-number-syntax-for-IT-v1-0.md`** — Page 4 order number generation/override/delete contract, DB schema obligations, and 12 acceptance checks for on-prem adaptation.

## Running the Regression Suite

Requires Node.js 18+ and Playwright:
```
cd 03-Regression-Suite
node mc-proto-v1-4-regression-suite-qa.js
```

## Open Item

**O1:** Retired order numbers policy (retire-forever vs admin-releasable) — decision pending.
