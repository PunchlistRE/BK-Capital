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
