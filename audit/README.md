# Audit suite

Run everything: `PLAYWRIGHT_MODULE=<path> CHROMIUM_PATH=<chrome> audit/run_all.sh` (CI runs it on every push).

| Script | What it proves |
|---|---|
| `suite_run.js` + `suite_test.py` | The deal book (`deals/index.js`: 7 acquisition, 6 real, 3 development deals) is re-computed independently (`model.py`, `dev_audit.py`); real deals tie to their T-12 NOI and market cap; every figure equals the stored golden result. |
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
`real/build_real_deals.py <workbook.xlsm> real/real_deals.json` builds app inputs from the Yardi benchmark workbook:
**price = T-12 NOI / market cap rate; Year-1 statement NOI = T-12 NOI.** Expense lines come from the T-12 line items, grouped into
the app's categories and scaled uniformly so the statement ties; every scaling and mismatch is listed in `flags`.
Rent is the summary's annual rent, other income is zero, bad debt zero; financing, growth and JV terms are the app's standard
assumptions (the workbook has none). The workbook's own line-item NET INCOME is 31-43% above its summary T-12 NOI for every
residential property, so the line items cannot be used as an NOI source without reconciliation.
