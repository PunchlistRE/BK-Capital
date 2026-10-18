# Audit suite

Run everything: `PLAYWRIGHT_MODULE=<path> CHROMIUM_PATH=<chrome> audit/run_all.sh` (CI runs it on every push).

| Script | What it proves |
|---|---|
| `suite_run.js` + `suite_test.py` | The deal book (`deals/index.js`: 7 acquisition, 6 real, 3 development deals) is re-computed independently (`model.py`, `dev_audit.py`); real deals tie to their T-12 NOI and market cap; every figure equals the stored golden result. |
| `macrs_tables_run.js` + `macrs_tables_test.py` | The app's and the independent MACRS percentages equal the IRS Pub. 946 tables (5/7/15-yr half-year, 5/7-yr mid-quarter Q1-Q4, 27.5/39-yr mid-month). |
| `macrs_ref.py` | Independent tax chain (schedule, mid-quarter test, bonus, calendar-year taxes, sale-tax character split, after-tax IRR) used by `suite_test.py` for the TAX-* and HARVARD deals, including tie-outs to `Cost_Segregation_Harvard.xlsx`. |
| `repeat_test.sh` | The same book gives byte-identical results in a different order, time zone, system date (incl. a leap day) and after save/reopen through the cloud mappers. |
| `conventions_run.js` + `conventions_test.py` | Every underwriting-convention setting against the independent model (748 checks). |
| `dev_scope_test.js` | Acquisition conventions never touch development deals. |
| `persistence_test.js`, `ui_test.js` | Saved values survive; the controls drive the engine. |

## Reproducing a result
Every deal is a complete input set in `deals/index.js` (or `real/real_deals.json`). `bkCreateNewDeal(deal)` then the engine
functions give the output; `suite_run.js` shows exactly which. Nothing depends on the clock, the time zone or run order.

## Golden results
`golden/suite_golden.json` holds the key figures of every deal. A change in the engine that moves any of them fails the
suite. If the change is intended (a fix or a deliberate methodology change), review the diff, then
`python3 audit/suite_test.py <suite.json> --update-golden` and commit the new file with the change that caused it.

## Real deals
`real/build_real_deals.py <workbook.xlsm> real/real_deals.json` builds app inputs from the Yardi T-12 **line items** (the source of truth):
**NOI = income lines - operating expense lines; price = NOI / the Property Summary's market cap rate.** Debt service and owner
distributions are not operating expenses. The Property Summary's own NOI is not used (it differs from the line items by 30-60%).

The workbook is OCR of scanned Yardi statements, so each section's lines are checked against that section's printed total. A line
is corrected (months sum, moved decimal point, flipped sign) **only if that closes the section's gap**; otherwise the lines are kept
and the mismatch is flagged. The result is then tied to the statement's own NET INCOME (+ mortgage interest): all six residential
properties agree within 0.1%. Items Yardi reports that are non-recurring or non-operating (bank interest, settlements, insurance
claims, partnership tax filings) are left in as reported and listed in each deal's `flags` for the underwriter to decide.
Financing, growth and JV terms are the app's standard assumptions (the workbook has none). Rent is collected rent, so vacancy and bad debt are zero.

## Cost segregation / tax-grade depreciation
Per deal, Inputs > Depreciation. New deals are stamped `depMethod: 'macrs'`; a saved deal without it keeps the simplified
straight-line schedule until someone switches it (banner + button). `real/harvard_assets.json` is the itemised 169-asset study
from `Cost_Segregation_Harvard.xlsx`; the HARVARD deal loads it with `bkDeprSeedHarvard()` and ties to the workbook (bonus
$1,207,058.89, tax savings $446,611.79 at 37%, 89.3:1 payback, $108,010.91 a year on the 39-year class). One deliberate
difference: the workbook shows no 39-year depreciation in 2025; the IRS mid-month rule gives half a month ($4,500) for a
December 11 in-service date, and the engine follows the IRS.
