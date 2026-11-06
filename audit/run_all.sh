#!/usr/bin/env bash
# Runs every audit against index.html. Exit code is non-zero if any check fails.
#   PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome audit/run_all.sh [reference.html]
# reference.html is a build to compare development deals against (default: previous commit's index.html).
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
REF=${1:-$T/ref.html}
[ -n "${1:-}" ] || git show HEAD~1:index.html > "$REF" 2>/dev/null || git show HEAD:index.html > "$REF"
echo "== conventions vs independent model";  node audit/conventions_run.js index.html "$T/cv.json" >/dev/null; python3 audit/conventions_test.py "$T/cv.json" | tail -1
python3 audit/conventions_test.py "$T/cv.json" >/dev/null
echo "== development scope";                  node audit/dev_scope_test.js "$REF" index.html | tail -1
echo "== development vs independent checks"; node audit/dev_run.js index.html "$T/dev.json" >/dev/null; python3 audit/dev_audit.py "$T/dev.json" | grep -E "checks|NOTE"
echo "== MACRS tables vs IRS Pub. 946"; node audit/macrs_tables_run.js index.html "$T/mt.json" >/dev/null; python3 audit/macrs_tables_test.py "$T/mt.json" | tail -1; python3 audit/macrs_tables_test.py "$T/mt.json" >/dev/null
echo "== conflicting-input rules"; node audit/conflicts_test.js index.html | tail -1
echo "== deal book vs independent models, T-12 tie-outs, golden results"; node audit/suite_run.js index.html "$T/suite.json" >/dev/null; python3 audit/suite_test.py "$T/suite.json" | tail -1; python3 audit/suite_test.py "$T/suite.json" >/dev/null
echo "== repeatability"; audit/repeat_test.sh index.html | tail -1
echo "== input flow (scroll, focus, arrow keys)"; node audit/input_flow_test.js index.html | grep -E "^FAIL|checks"
echo "== import (Yardi workbook / PDF extraction; needs BK_YARDI_XLSM, BK_SHOREPOINTE_PDF for the source-file checks)"; node audit/import_test.js index.html | tail -2
echo "== probability-weighted returns vs independent model"; node audit/risk_run.js index.html "$T/risk.json" >/dev/null; python3 audit/risk_ref.py "$T/risk.json" | tail -3
echo "== import rent roll (CSV / XLSX / PDF, synthetic fixtures)"; node audit/import_rr_test.js index.html | tail -2
echo "== tie-out to the owner's V7.2 master workbook (10 stored deals)"; node audit/gold_tieout.js index.html --check | tail -1
echo "== editor engine support (growth curves, miscellaneous income, capital items)"; node audit/editor_engine_test.js index.html | tail -2
echo "== property editor (7 tabs, 31 sub-tabs, writes and conversions)"; node audit/editor_test.js index.html | tail -2
echo "== Field widths (one width per kind of value box on every Property Editor page: percents as percents, dollars as dollars, text, choices; grids as wide as their boxes; typing keeps a box's width)"; node audit/field_widths_test.js index.html | grep -v '^PASS'
echo "== Inflation by year (entered and inherited years look different, an Average column, taxes from year 2; a development deal offers only what its engine reads, proved by moving the rates)"; node audit/inflation_test.js index.html | grep -v '^PASS'
echo "== Header second row (the section's pages as tabs: the shape of the section tabs, lighter; the open page marked; readable in both themes; nothing cut off on a phone)"; node audit/subtabs_test.js index.html | grep -v '^PASS'
echo "== reports (cash flow, valuation, tenant, audit; reconcile to the engine)"; node audit/reports_test.js index.html | tail -2
echo "== sources and uses report (Argus sources and uses by year: totals tie every year on every deck, lines are the engine's, cash on cash, IRR)"; node audit/sources_uses_test.js index.html | grep -v '^PASS'
echo "== Development reports (Sources and Uses by year and the Valuation and Return Summary for a development: sources equal uses every year, every line the engine's, the equity rows add to the capital measures, the takeout in its year; 11 variants)"; node audit/dev_reports_test.js index.html | tail -1
echo "== present value report (Argus present value, unleveraged and leveraged, and a value matrix: XNPV by year, equals the valuation report, IRR, matrix vs engine re-runs)"; node audit/present_value_test.js index.html | grep -v '^PASS'
echo "== lease audit report (Argus lease audit and supplemental: tenant by tenant from the lease engine's series, rollover terms, ties to the cash flow report and to the engine's retail revenue)"; node audit/lease_audit_test.js index.html | grep -v '^PASS'
echo "== development cash flow (Cash Flow Report on a development deal: funding = costs every year, lines are the engine's, equity cash flow, takeout and sale, 8 decks)"; node audit/dev_cashflow_test.js index.html | grep -v '^PASS'
echo "== Mixed-use properties (residential and commercial units with the total, the commercial area, commercial market rent beside residential; no engine figure moves)"; node audit/units_test.js index.html | grep -v '^PASS'
echo "== commercial lease model (rollover branches, recoveries, TI/LC, editor, reports)"; node audit/lease_test.js index.html | tail -2
echo "== lease model fixes (merged rollover, market defaults, general vacancy stress, bump anchor)"; node audit/lease_fix_test.js index.html "$REF" | tail -1
echo "== lease terms (CPI increases, expense stops, recovery caps, gross-up, stated recovery shares)"; node audit/lease_terms_test.js index.html | tail -1
echo "== Import OM, rent-roll layout (unit rent roll + expense list, two-building offerings)"; node audit/om_rentroll_test.js index.html | tail -1
echo "== Import OM, letter-spaced headings and period columns (Trailing 12 / Current / Pro Forma)"; node audit/om_columns_test.js index.html "$REF" | tail -1
echo "== Import OM, price and printed cap rate (asking vs sold vs assessed)"; node audit/om_price_test.js index.html "$REF" | tail -1
echo "== Import OM, 32 Ferry / 45-47 Spring Street layouts (price tile, sub-\$1M prices, dash column, unit mix by heading, stated commercial area)"; node audit/om_ferry_test.js index.html | tail -1
echo "== Financing Compare (complete dated financing economics, reconciled to the engine)"; node audit/fincompare_test.js index.html | tail -1
echo "== Pre-Offer Bid (maximum supportable price, verified against the engine)"; node audit/prebid_test.js index.html | tail -1
echo "== Deal Remedies (resize debt, maximum price, rent and occupancy required, through the credit gate)"; node audit/remedies_test.js index.html | tail -1
echo "== Print / Save PDF for any section"; node audit/print_test.js index.html | tail -1
echo "== Print fits any number of years (Cash Flow Report: 3 to 25 year holds, real PDFs, nothing clipped)"; node audit/print_years_test.js index.html | tail -1
echo "== Section guide (Guide on: what, how to read, checks on this deal, next)"; node audit/sectionguide_test.js index.html | tail -1
echo "== Layout guards (income-bar key, report text, print button, phone layout)"; node audit/layout_test.js index.html | tail -1
echo "== Sponsor CF (one sponsor all-in return, dated like the summary)"; node audit/sponsor_test.js index.html | tail -1
echo "== Residual land solve, draw curves, sources and uses (development)"; node audit/residual_curve_test.js index.html | tail -1
echo "== Development lease-up by unit type (schedule, income, shortfall, funding, backward compatibility)"; node audit/devunits_test.js index.html "$REF" | tail -1
echo "== Development Gantt (task schedule, critical path, drives the engine)"; node audit/devgantt_test.js index.html "$REF" | tail -1
echo "== Gantt chart and its printable schedule summary (calendar chart, milestones, arrows, 5-page PDF cover/Gantt/tasks/funding/delay, engine tie-outs, real PDF)"; node audit/devschedule_report_test.js index.html | tail -1
echo "== Panel tabs (long sections open as tabs; nothing removed; print carries all)"; node audit/paneltabs_test.js index.html | tail -1
echo "== NNN terms from a rent roll (structure, base year, stop, share kept in the lease)"; node audit/nnn_import_test.js index.html "$REF" | tail -1
echo "== Tenant-level commercial leases in a development deal (lease clock after completion, retail replaces the growth-path retail, TI/LC capital)"; node audit/devleases_test.js index.html "$REF" | tail -1
echo "== Ask the guide (plain-words questions: every topic lands on a real page, tab, panel and field; quoted figures are the engine's; nothing written)"; node audit/guideask_test.js index.html | tail -1
echo "== Guide walkthrough (blank to Returns, acquisition and development, desktop and phone: each step opens at its top on its heading, the step reads what is typed, the IRR waits until the deal can run, no early tie alarm, units in the boxes, a key to the marks, one-row progress on a phone)"; node audit/guide_walk_test.js index.html | tail -1
echo "== Day / night toggle (round header button, follows the device until chosen, whole app turns dark or light, sign-in card readable, fits a phone)"; node audit/theme_test.js index.html | tail -1
echo "== Base / Upside / Downside (control, directions, non-destructive, every output page shows the selected case, Base-only pages say so)"; node audit/cases_test.js index.html | tail -1
echo "== Readable in both themes (no text under 3:1 contrast on the sections that used to fail, day and night, desktop and phone)"; node audit/contrast_test.js index.html | tail -1
echo "== Fill rule (header fill vs key-metric fill, every sheet)"; node audit/fillrule_test.js index.html | tail -1
echo "== Waterfall verification (per-hurdle IRR error checks, tier order, conservation, promote)"; node audit/wfcheck_test.js index.html | tail -1
echo "== PDF summary (financial summary, annual cash flow reconciles to the engine, page fit)"; node audit/summary_test.js index.html | tail -1
echo "== Sensitivity grid (investor summary: one blue scale from the lowest IRR to the highest, so an all-above-hurdle grid still varies; hurdle markers only when the grid straddles it; base case outlined; acquisition and development)"; node audit/sensitivity_grid_test.js index.html | tail -1
echo "== deal documents sync (mocked storage endpoint)"; node audit/docsync_test.js index.html | tail -2
echo "== persistence";                        node audit/persistence_test.js index.html | tail -1
echo "== Required marker and Status chip agree (one source, N/A on non-applicable tables)"; node audit/required_status_test.js index.html | tail -1
echo "== Undo / Redo for every function (all stores, exact, labelled, drastic-change confirmation)"; node audit/undo_test.js index.html | tail -1
echo "== Harbor Point stage A (development Snapshot, Sources = Uses in sheet and PDF, takeout wording, unlevered returns)"; node audit/harbor_stageA_test.js index.html | tail -1
echo "== Harbor Point stage B (hurdle replay, gross contributions, integrity checks fail visibly, credit gate, independent second model)"; node audit/harbor_stageB_test.js index.html | tail -1
echo "== Harbor Point variants (interest-reserve accounting; tight ceiling, no reserves, LTC, fixed facility, waterfall variants, each against the independent model)"; node audit/harbor_variants_test.js index.html | tail -1
echo "== Harbor Point investor PDF, Development budget page (budget, contingency, reserves reconciled to the engine; facility text)"; node audit/harbor_budget_test.js index.html | tail -1
echo "== Import OM, LoopNet listings (52 Hoyt St with financials, 743-751 Arctic St without; draft PDF for a deal with no income)"; node audit/loopnet_import_test.js index.html | tail -1
echo "== Harbor Point PDF fixture labels (base vs deal brief on the cover, footer and title; display only)"; node audit/harbor_fixture_label_test.js index.html | tail -1
echo "== Intake readers (property list, spreadsheet statement found by its arithmetic, facts-only flyer; REAL and SYNTHETIC inputs labelled)"; node audit/intake_test.js index.html | tail -1
echo "== Blank start (a new deal is all cash with one investor; debt sections appear with financing; clear inputs; empty development schedule)"; node audit/blank_start_test.js index.html | tail -1
echo "== QA self-tests on a deal with no debt (Floating Debt QA reads N/A with its reason, never ERROR; the deal is untouched; a deal with debt keeps its 8 checks)"; node audit/qa_na_test.js index.html | grep -v '^PASS'
echo "== Owner decisions (new acquisitions close at 2%; Source Ingestion QA N/A until a source is read; phone charts at real text size with no overlapping labels; 40px header controls; the product name whole)"; node audit/owner_decisions_test.js index.html | tail -1
echo "== NOI basis (every DSCR and debt yield on the deal's lender NOI, as the loan sizing, named on every page, the guide and the PDF; the exit on the next 12 months' NOI with its own basis named; both lender settings, DSCR- and LTV-bound deals)"; node audit/noi_basis_test.js index.html | tail -1
echo "== Saved deals and audit fixtures keep their financing and waterfall terms (vs the reference build)"; node audit/saved_terms_test.js index.html "$REF" | tail -1
echo "== Spreadsheet ingestion (formulas vs displayed values, merged cells, subtotals, rent-roll layouts, CSV, multi-sheet, property lists; SYNTHETIC files + the REAL workbook when supplied)"; node audit/sheet_ingest_test.js index.html | tail -1
echo "== Harbor Point stage C (investor summary pages, summary of investment, portfolio impact, cover photo, Model Checks)"; node audit/harbor_stageC_test.js index.html | tail -1
echo "== Harbor Point stage E (fixed facility, equity first, unused fee, initial reserves, contingency register, LP-only pref, catch-up rate, independent model)"; node audit/harbor_stageE_test.js index.html | tail -1
echo "== Portfolio IRR on the combined dated cash flow (independent XIRR, reconciliation, no averaged IRR)"; node audit/portfolio_irr_test.js index.html | tail -1
echo "== Analysis registry and the setup page (consistency, guide steps from the registry, saved-deal compatibility, summaries, dialog, themes)"; node audit/registry_test.js index.html | tail -1
echo "== Analysis registry part 2 (step bar stages, readiness workflow, Overview tiles and integrity checks read the analysis)"; node audit/registry2_test.js index.html | tail -1
echo "== Refinancing Analysis (sizing, payoff and proceeds vs an independent model; alternatives; readiness, stages, tiles and the report from the registry)"; node audit/refinance_test.js index.html | tail -1
echo "== Property Valuation (in-place, normalized and stabilized value vs an independent model; comparables, sensitivity; readiness, stages, tiles and the report from the registry)"; node audit/valuation_test.js index.html | tail -1
echo "== Loan sizing (one rule shared by Refi / Recap and the Refinancing Analysis: against an independent model, each test binding, ties, interest-only, requested amount, invalid inputs; both tools exactly as before the rule was extracted)"; node audit/loan_sizing_test.js index.html | grep -v '^PASS'
echo "== Stage D (Deal Underwrite tab bar; input / calculated / linked / N/A / attention cell convention on every input sheet)"; node audit/stageD_test.js index.html | tail -1
echo "== Import tab (one tab; content-driven reader on unseen layouts, development pro forma + OM, teaching, old readers inside the tab)"; node audit/import_hub_test.js index.html | tail -1
echo "== Development budget (line items and $ per SF feed one hard / soft total, the draws, the Gantt and Sources & Uses; import reads the budget table)"; node audit/budget_test.js index.html
echo "== Work breakdown (summary tasks roll up dates, months, cost and % complete and move no number; group by cost class; fold, outline numbers, progress shading; task table, Budget panel, printable summary)"; node audit/wbs_test.js index.html
echo "== Funding ties (Sources & Uses, guide, Debt, Funding, Returns share one calculation; ALL INPUTS TIE; Harbor + audit development deal + acquisition deal)"; node audit/tie_test.js index.html
echo "== Funding scenarios (180 development and acquisition configurations: Sources & Uses, funding ledger, contributed equity, the four capital measures, waterfall and returns each checked from the raw monthly output; facility ceilings, interest reserves, takeout, holds; mutation checks)"; node audit/funding_scenarios_test.js index.html
echo "== Development debt pages (Covenant Monitor, Debt Schedule sidebar, Deal Vectors (M), Ledger (M) read the construction facility and the permanent loan after takeout, never the acquisition loan; covenants N/A before the takeout; the ledger adds up to the net equity cash flow; 8 decks)"; node audit/dev_debt_pages_test.js index.html | grep -v '^PASS'
echo "== Capital measures (closing equity, total contributed equity, operating cash requirement, total project capitalization: one name for one number on every sheet, the investor PDF and the schedule report; ambiguous equity labels refused)"; node audit/capital_measures_test.js index.html
echo "== Import tab routing (an OM with a rent roll page stays an OM; a plain rent roll stays a rent roll)"; node audit/import_route_test.js index.html | tail -1
echo "== Document ingestion foundation (fact record and validation, quote verification, number parser, hashing, both stores, intake, pipeline failure / retry / resume, provider guard, classification measured on labeled fixtures)"; node audit/ingest_core_test.js index.html | tail -1
echo "== Visual polish (phone and web: no sheet scrolls sideways as a page, every sideways scroller says so, a stacked key row is one band with no fill, a select stays inside its cell, the capital tables fit their card, the Gantt task names are whole, the Home equity tile names its measure)"; node audit/visual_polish_test.js index.html | tail -1
echo "== ui";                                 node audit/ui_test.js index.html | tail -1
echo "ALL AUDITS PASSED"
