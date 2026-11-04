# Visual QA measurements (baseline, current main before this pass)

Source: `audit/qa/shoot.js` over every sheet, three decks (populated acquisition, populated development, blank), desktop 1440 and phone 390.

- renders: 516
- clipped cells: 2
- NaN/undefined text: 2

Header-vs-body alignment (all sheets, acquisition and development decks): one real mismatch found and fixed (Expenses line grid: Amount, Annual Total, $/Unit, $/GSF, % of EGI headings were left-aligned over right-aligned figures). The other flags are measurement artefacts (rows with a column span; the Gantt's second header row).

Intentional, left as is: period / month index columns are left-aligned like row labels; heat-map grids are centred.

Not done in this pass: a sheet-by-sheet visual review of all 86 sheets (measurements ran on all; visual review on a sample), the status chip that reads OK on a blank text field, the printable schedule PDF's chart style.
