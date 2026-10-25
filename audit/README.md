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

## Input flow (`input_flow_test.js`)
Leaving a cell re-renders the sheet so the value commits and derived rows refresh. A final `showSheet` wrapper keeps the page's scroll
position, hands focus back to the cell you were heading for (including dropdowns), and coalesces a re-render requested from inside a
blur (which used to throw). Arrow Down / Up commit the current input and move to the next / previous one; entering a new section
brings it to the top of the view and focuses its first input. Selects keep their own arrow keys; Enter and Escape are unchanged.

## Operating Business (from the Punchlist model)
- `biz_ref.py` is an independent implementation of Punchlist_Business_Model_with_Valuation.xlsx (revenue build, P&L, break-even, build-up discount rate, three-case DCF, sensitivities, 10-year valuation). Run alone it ties to the workbook's own outputs (`real/punchlist_inputs.json`, `real/punchlist_expected.json`).
- It also implements the OpCo / PropCo comparison (`place()`): business value with market rent normalised, property value from the independent deal model's Year-1 NOI, and the four sale choices after tax.
- Deals `BIZ-1` (workbook discounting) and `BIZ-2` (bear case, exit multiple discounted at end of year 5, appraised property) are in the deal book and are compared with the app figure by figure; golden results under `:biz`.
- `conflicts_test.js` has a scenario for each `biz.*` rule.

## Market Benchmarks
`ui_test.js` checks the sheet reads the deal's own figures, that ranges are editable and reset, and that development deals are told it does not apply. The ranges themselves are published figures (sources and dates are on the sheet), not audited numbers, and nothing on the sheet feeds the engine.

## Navigation
`ui_test.js` checks the top bar: six tabs, no second row, the active tab names the current sheet, one dropdown open at a time, and every sheet in the navigation is reachable.

## Visual audit
`visual_audit.js` opens every sheet on an acquisition, development or business-model sample deal at desktop and phone width, flags render errors, sideways scrolling, clipped text and placeholder values (undefined, NaN, [object), and saves a screenshot of each sheet for review. It is a manual tool and is not part of `run_all.sh`.

## Import Deal (`import_test.js`)
The Import Deal sheet extracts a Yardi T-12 from a workbook, CSV or a PDF print of one, foots each section to the statement's printed total, and builds a multifamily deal (NOI from the line items; price = NOI / cap rate). The test compares all six residential properties in the Yardi workbook with the independent build (`real/build_real_deals.py` -> `real/real_deals.json`): NOI, price, every expense group, per-unit income and the number of extraction notes; it also runs the ShorePointe PDF through the same extractor and checks it reaches the same NOI. The source files are the user's own data and are not in the repo: set `BK_YARDI_XLSM` and `BK_SHOREPOINTE_PDF` to run those checks, otherwise only the synthetic CSV checks run.
PDF reading is limited to PDFs whose text is stored as ordinary text; a scanned PDF, or one whose fonts use a custom encoding, is refused with a message rather than guessed at.

## Probability-Weighted Returns (`risk_run.js`, `risk_ref.py`)
Two views from the live engine, each on scratch copies of the deal: a scenario-weighted view (Downside / Base / Upside with your probabilities) and a seeded Monte Carlo over exit cap, rent growth, rent level, vacancy, opex level, opex growth and the debt coupon (rent growth correlated with exit cap; draws limited to +/-2.5 standard deviations). `risk_ref.py` re-implements the random generator and driver shifts from the documented algorithm, re-runs draws and all three scenarios through the independent deal model (`model.py`), and recomputes every statistic (mean, standard deviation, percentiles, probabilities, expected profit, the IRR of the probability-weighted cash flow) from the draws' own results. Two deals with non-default probabilities, standard deviations, correlation, seed and draw count: 5,515 checks.
## Import Rent Roll (`import_rr_test.js`)
Reads a unit-level rent roll from CSV, XLSX or a PDF with a text layer, proposes the column mapping, and applies it to the deal's Rent Roll (replace or add). The fixtures are synthetic (no tenant data): `fixtures/make_rent_roll.py` writes a Yardi-style rent roll as CSV and XLSX plus `rent_roll_expected.json`, the truth every unit and total must match; the PDF is printed from the same data at test time. The test checks every field of every unit for all three formats, the summary figures, that the file's own Total row ties, that the operating statement's gross potential rent equals imported in-place rent x 12, and the replace / add behaviour.
The PDF reader decodes embedded fonts through their ToUnicode maps and uses the fonts' own glyph widths to tell one cell from the next; columns are assigned by x-position under the header, so a blank cell does not shift a row.

## Home and navigation (ui_test.js)
The Home sheet is a front door with no deal (ways in) and a dashboard with one (KPI tiles, a rule-driven next step, a review checklist that opens each sheet). Ctrl/Cmd+K opens a palette over every sheet and action; the left rail keeps only the working group open. All are presentation over the existing engine and checks; the UI test covers each.

## Pro-forma / returns presentation (`bk-v29260-proforma`)
Property CF, Operating Underwrite and Returns now open with a headline strip, plain-English insights, SVG charts (coverage, cash flow, profit bridge, income split, hurdle gauge), a 5-year statement and a Print / Save as PDF button; the original detail tables remain below. All figures come from the existing engine (no new maths); `ui_test.js` section 15 checks the charts render and the statement's Year-1 NOI ties to `bkAnnualCF()`.

## Create PDF summary (`bk-v29270-report`)
Home has a **Create PDF summary** button for the active acquisition deal. It opens a five-page Letter preview (cover, dashboard, financial summary, performance and sensitivity, credit and market) and **Save as PDF** prints it. Everything is read from the live model: `bkProFormaKit.build()`, `bkDealGate()`, `bkRiskScenarios()`, `bkMarketCompare()`; the sensitivity grid reruns `bkMonthlyReturns()` under `bkRunWith`. `ui_test.js` section 16 checks the pages render, the IRR and multiple match the model, and sources equal uses. Development deals get their own five pages (cover, dashboard, budget and funding with timeline and takeout, annual cash flow with sensitivity, credit decision with delay and exit stress tests); `ui_test.js` section 17 checks them.

## Version history (`bk-v29280-history`)
QA > **Version History** records every input change on the active deal (field, old value, new value, time; repeat edits to one field within five minutes coalesce) and keeps named versions with the returns at the time. Compare shows exactly which inputs differ; Restore first saves a safety version. Creating a PDF summary saves a version automatically. The record lives in the deal (`_history`), is capped (400 changes, 30 versions), and scratch runs (`bkRunWith`) write nothing. `ui_test.js` section 18 checks logging, coalescing, diff, restore and the sheet.

## Financing Lab (`bk-v29290-finlab`)
Debt > **Financing Lab** prices the active acquisition at a market cap rate (Year-1 NOI / cap) and reruns the full engine on a scratch copy for a grid of loan-to-value by interest rate (IRR, DSCR, cash-on-cash or multiple), plus a loan-structure comparison (amortisation, interest-only) and the rate at which debt stops adding to the return. Debt is sized by LTV alone in the grid and coverage below policy is flagged. `ui_test.js` section 19 checks the grid against a direct engine rerun and that the deal is untouched.
