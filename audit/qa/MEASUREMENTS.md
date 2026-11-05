# Visual QA measurements (baseline, current main before this pass)

Source: `audit/qa/shoot.js` over every sheet, three decks (populated acquisition, populated development, blank), desktop 1440 and phone 390.

- renders: 516
- clipped cells: 2
- NaN/undefined text: 2

Header-vs-body alignment (all sheets, acquisition and development decks): one real mismatch found and fixed (Expenses line grid: Amount, Annual Total, $/Unit, $/GSF, % of EGI headings were left-aligned over right-aligned figures). The other flags are measurement artefacts (rows with a column span; the Gantt's second header row).

Intentional, left as is: period / month index columns are left-aligned like row labels; heat-map grids are centred.

Not done in this pass: a sheet-by-sheet visual review of all 86 sheets (measurements ran on all; visual review on a sample), the status chip that reads OK on a blank text field, the printable schedule PDF's chart style.

## November 2026 (merged main 8c44e0b, then this pass)
`node audit/qa/shoot.js <dir> --full` on both builds, 534 renders each (89 sheets x acquisition / development / blank x 1440 / 390), counting renders with a finding:

| Measure | main 8c44e0b | after |
|---|---:|---:|
| page error / sideways page scroll / element past the right edge | 0 / 0 / 0 | 0 / 0 / 0 |
| text cut off by its box | 268 | 2 (Gantt task names, intentional) |
| button or chip label spilling over its border | 4 | 0 |
| table cells clipped | 2 | 2 (same Gantt names) |
| NaN / undefined text | 2 | 2 (blank deal, QA self-test error, reported) |
| numeric column not right-aligned | 96 | 96 (stacked phone tables and index columns, by design) |

Card overflow probe (anything sticking out past its own card), every sheet: on main 8 items on the acquisition deck at 390 and 8 at 1440, 1 on the development deck at 390; after, 0 on both decks at both widths.
