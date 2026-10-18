# Audit suite

Run everything: `PLAYWRIGHT_MODULE=<path> CHROMIUM_PATH=<chrome> audit/run_all.sh` (CI runs it on every push).

| Script | What it proves |
|---|---|
| `suite_run.js` + `suite_test.py` | The deal book (`deals/index.js`: 7 acquisition, 6 real, 3 development deals) is re-computed independently (`model.py`, `dev_audit.py`); real deals tie to their T-12 NOI and market cap; every figure equals the stored golden result. |
| `macrs_tables_run.js` + `macrs_tables_test.py` | The app's and the independent MACRS percentages equal the IRS Pub. 946 tables (5/7/15-yr half-year, 5/7-yr mid-quarter Q1-Q4, 27.5/39-yr mid-month). |
| `macrs_ref.py` | Independent tax chain (schedule, mid-quarter test, bonus, calendar-year taxes, sale-tax character split, after-tax IRR) used by `suite_test.py` for the TAX-* and HARVARD deals, including tie-outs to `Cost_Segregation_Harvard.xlsx`. |
| `credit_ref.py` | Independent credit layer (debt capacity by constraint, stressed DSCR, break-even occupancy / rent / exit cap, upside-downside IRR, the weighted IC gate and verdict) built from the Capital Markets model's formulas; `suite_test.py` compares it with `bkDealGate()` for every acquisition deal. CRD-1 exercises policy edits, risk register, conditions and the override through save and reopen. |
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

## Credit & IC (from the Capital Markets model)
Rail group **Credit & IC**: `Credit Policy` (per-deal house limits, gate weights and severities; CMM defaults), `Debt Capacity`
(largest supportable senior loan under LTV, LTC, DSCR at the coupon and at a stressed coupon, interest-only DSCR and debt yield,
the binding constraint, headroom, overage vs the loan in force, leverage ladder, highest coupon holding the minimum DSCR) and
`IC Memo` (policy test table, weighted score, hard/soft exceptions, verdict, break-even occupancy / NOI tolerance / break-even rent /
exit-cap cushion / upside-downside IRR, risk register, conditions precedent, credit override that needs YES + reason + approver).
It tests the deal the engines produced and never changes a return or a loan. Development deals are gated on the tests that apply
to them. Break-evens are bisections against the live engine (`bkRunWith`). Not ported: lender eligibility, capital-stack
structures, refinance timing, fund / portfolio impact (the app has no equivalent engine to hang them on yet).

## Conflicting-input checks (Model Checks)
`bkConflicts()` runs ~45 cross-field rules (tax / depreciation, statement-vs-cash-flow reconciliation, debt, waterfall, development,
credit policy). Each returns a plain-English message with the deal's own numbers and a *why it matters* note on the accounting, tax
or credit consequence. ERROR (inputs contradict, results wrong) feeds `bkModelControls` as FAIL and blocks decision-grade; WARN is
listed; INFO states an assumption. WARN / INFO can be acknowledged per deal. When an edit CREATES a new ERROR / WARN a card
explains it at once (off under automation unless `window.BK_CONFLICT_TOASTS === true`). `conflicts_test.js`: every rule has a
scenario that fires it, clears it when fixed, and checks the explanation; plus readiness integration, acknowledgement and the
pop-up lifecycle. `suite_test.py` checks the reconciliation gap against the independent model and pins each deal's rule IDs.

## Refi / Recap (from the Capital Markets model)
`Debt > Refi / Recap`: for the chosen year and for every possible year, the new loan (lowest of LTV, DSCR, debt yield), net cash-out
after costs and prepayment, post-refinance coverage, and the equity cash flow rebuilt monthly with the new debt service and payoff
(IRR, multiple, profit, cash returned before exit vs. holding the original loan), a verdict, and a reconciliation (closed-form existing
balance, profit bridge). `refi_ref.py` re-derives all of it from `model.py`'s monthly cash flow; REF-1 uses custom inputs.
