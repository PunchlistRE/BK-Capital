# Sheet-by-sheet visual review (acquisition deck, desktop)

Method: every sheet's baseline screenshot (`audit/qa/before/acq_d_*.png`, local only) was viewed in 2x2 montages, 22 montages covering all 86 sheets.
Zoomed to full resolution only where something looked off. Measurement results for all three decks and phone width are in MEASUREMENTS.md.

Second pass (after approval): development deck, all 86 sheets, viewed in full-size 2x2 montages. Blank deck: 8 of 86 sheets viewed in full-size montages (After-Tax ... Deal Vectors) plus the sheets shared with the other decks; the remaining blank-deck sheets were measured only. Phone width: 18 of 86 sheets viewed (6-up strips) covering reports, inputs, editors, wide tables and the navigation; the rest were measured only. Nothing here claims every phone sheet was looked at.

## Consistent across the sheets reviewed
Header and meta strip, section-card title bars, table header/zebra/total-row fills, Deal Snapshot rail, tab strip, case switcher, input-cell yellow fill with blue text, status chips.

## Fixed in this pass (CSS/markup only)
- Expenses grid: column headings now sit over their figures (before/after in evidence/).

## Findings left open (need a decision, not changed)
1. Chrome mismatch: Sensitivity, Financing Lab, Financing Compare, Guide, Version History, Source Ingestion and the chart cards on Operating Underwrite, Property CF and Returns use plain cards without the lettered title bar used elsewhere. Unifying them is a redesign choice.
2. Valuation Report, Tenant Report, Lease Schedule use report-style tables (no lettered title bar, no rail). Looks intentional for Reports.
3. Wide monthly tables (Waterfall M, Ledger M, Source Data) scroll sideways; the last column is clipped until scrolled. A "scroll sideways" hint exists on some but not all.
4. Blank-state cells show "-", "$0" or "N/A" inconsistently (Reverse Solve vs Portfolio vs Dev Draws).
5. Development decks show an N/A-only Underwriting Conventions table; blank deals show empty meta-strip cells.
6. Tab label "Tax &" is clipped in the scrollable strip.
7. Status chip reads OK on blank text fields (status logic, not styling).
No formulas or financial logic were touched.

## Second pass: approved fixes (display only, no formulas or financial logic)
- Card chrome: Sensitivity, Financing Lab/Compare and Version History cards now use the lettered title bar. The Guide keeps its step layout, KPI tiles keep theirs (intentional hierarchy).
- Wide tables: any table wider than its card, on any screen size, gets a pinned "Scroll sideways" line and a shaded edge on the side that still has columns. Report tables (Valuation Report etc.) were previously clipped with no cue on phones.
- Empty states: dash = nothing entered / nothing in that period; Unavailable = cannot be calculated yet (amber italic); N/A = does not apply (small caps); zero is always a number. Added to the Colour key. Text is unchanged, only styling, so tests that read the text are unaffected.
- Tab strip: "Show as tabs" no longer overlays the last tab; all seven labels fit at desktop, and on phone the strip scrolls with an edge shade.
Not changed: status chip on blank text fields (logic), Guide wizard layout, report-style sheets.
Measured defect counts are unchanged (100 before and after) because the harness does not measure these items.

## Third pass: merged main (8c44e0b, PRs #112-#115), desktop and phone, November 2026

Before reviewing, main was confirmed complete: every merged PR head is an ancestor; the capital-measures files are byte-identical to #112's head (a9f56cf) and #113/#114/#115's files to their heads; `node build.js --check` passes (204 parts after this pass, 203 before); all 75 audit sections pass on 8c44e0b; the 180 funding scenarios give results identical to #112's head (IRR, multiple, contributions, distributions, equity and the four capital measures).

Method: `audit/qa/shoot.js --full` (new option: whole page, not the first screen) rendered 89 sheets x 3 decks x 2 widths (534 renders) and measured them; `audit/qa/contact.py` tiled the screenshots in the app's sheet order.
- Viewed by eye: acquisition deck, all 89 sheets at desktop (1440); development deck, 66 of 89 at desktop (the rest are the SYS_ pages, Property Editor and reports, laid out as on the acquisition deck); acquisition deck at phone (390), 72 of 89 (sheets 1-40 and 49-80); development deck at phone, 8 (Returns, Equity Waterfall, Sponsor CF, Development, Dev Schedule, Dev Draws, Residual Land, QA). Everything else was measured only. Zoomed to full size wherever something looked off.
- New measures in shoot.js: visible elements pushed past the right edge outside a scrolling box, text cut off by its box, a button or chip label spilling over its border, type under 10px, tap targets under 24px on a phone. A card-overflow probe (anything sticking out past its own card) ran on every sheet at both widths.

### Fixed (display only: CSS in `src/186-bk-review-polish.css`, a class on one card, the scroll-cue classifier)
| Defect | Where | Before | After |
|---|---|---|---|
| Save status cut off ("Local only - sign in to s") and Undo / Redo scrolled off the right edge | every page, phone | 268 renders with cut text | 2 (Gantt task names, intentional) |
| Chart 11-12px wider than its card (the card gives children 12px side margins; the chart set width:100% inline) | Operating Underwrite, Property CF, Returns, desktop and phone | 7 chart overflows | 0 |
| Long file name runs out of its sidebar card | Source Data, 186px desktop, 79px phone | 1 | 0 |
| Chart wider than the phone scrolls with no cue, so half of it looks missing | Sensitivity tornado and spider; the same cue now on the inline sideways-scrolling boxes (Financing Lab / Compare, Pre-Offer Bid, Deal Remedies, Gantt, waterfall checks, editor) | no cue | "Scroll sideways for the whole chart" and the edge shade the wide tables have |
| Action button wider than its 55px cell in a stacked row ("ACKNOWLEDGE" over its border); "GP + LP = 100.00%" chip the same | Model Checks, Deal Underwrite, phone | 4 spills | 0 |
| Photo explanation squeezed into a one-word-wide column | Deal Documents, phone | | photo and text stacked |
| Section page links wrap into 5-10 rows before the content | Debt & Returns, Portfolio & Data, phone | 8 rows (Portfolio & Data) | 7 shorter rows (28px tap height kept) |

Evidence: `audit/qa/evidence/review_2026-11_*.png` (before on main 8c44e0b, after on this branch). `audit/layout_test.js` gained five guards (charts and sidebar values inside their cards at desktop and phone; save status in full and undo on screen; stacked action buttons whole; Sensitivity charts announce sideways scrolling); they pass here and all five fail on main.

### Found, not changed (need a decision or are not display)
1. Development deals read the acquisition loan in four places. The acquisition loan here is the one sized off the land price, $3,399,000 on the audit development deal, which a development deal does not have.
   - **Covenant Monitor:** the header shows Loan $3,399,000, and DSCR and debt yield are tested against that loan (DSCR 8.05x).
   - **Debt Schedule:** the sidebar's Schedule Metrics show Initial Balance $3,399,000 and Debt at Sale $3,140,117.
   - **Deal Vectors (M):** the interest, principal and loan balance columns amortize that loan.
   - **Ledger (M):** operating lines (Revenue (EGI) $305,646 and the matching expenses) are booked from month 1, during construction. This was already disclosed in #112.

   The equity flows on these pages are the development ones. Fixing these means choosing what a development covenant test applies to (the permanent loan after takeout), so they are reported, not changed.
2. **QA sheet, blank deal:** the "Floating Debt QA" self-test shows "ERROR Cannot read properties of undefined (reading 'annualRate')". On a deal with no debt structure it should read not applicable.
3. **Long-standing measurements, kept as is:**
   - 96 renders with numeric columns not right-aligned. On a phone these are the stacked tables, where a figure sits under its label by design; elsewhere they are period index columns.
   - Type under 10px on most pages: the 9-9.5px small-caps labels of the meta strip and chips.
   - Tap targets under 24px on phones: inline input steppers and links on Market Benchmarks, Sensitivity, Pre-Offer Bid and IC Memo.
4. **Gantt task names** are cut with an ellipsis in a fixed-width column on Dev Schedule. This is intentional.
