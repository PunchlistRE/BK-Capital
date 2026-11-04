# Sheet-by-sheet visual review (acquisition deck, desktop)

Method: every sheet's baseline screenshot (`audit/qa/before/acq_d_*.png`, local only) was viewed in 2x2 montages, 22 montages covering all 86 sheets.
Zoomed to full resolution only where something looked off. Measurement results for all three decks and phone width are in MEASUREMENTS.md.

NOT visually reviewed by eye: development deck, blank deck, and phone-width screenshots (measured only, not looked at).

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
