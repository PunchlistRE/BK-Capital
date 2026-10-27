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
echo "== property editor (7 tabs, 29 sub-tabs, writes and conversions)"; node audit/editor_test.js index.html | tail -2
echo "== reports (cash flow, valuation, tenant, audit; reconcile to the engine)"; node audit/reports_test.js index.html | tail -2
echo "== commercial lease model (rollover branches, recoveries, TI/LC, editor, reports)"; node audit/lease_test.js index.html | tail -2
echo "== lease model fixes (merged rollover, market defaults, general vacancy stress, bump anchor)"; node audit/lease_fix_test.js index.html "$REF" | tail -1
echo "== lease terms (CPI increases, expense stops, recovery caps, gross-up, stated recovery shares)"; node audit/lease_terms_test.js index.html | tail -1
echo "== Import OM, rent-roll layout (unit rent roll + expense list, two-building offerings)"; node audit/om_rentroll_test.js index.html | tail -1
echo "== Import OM, letter-spaced headings and period columns (Trailing 12 / Current / Pro Forma)"; node audit/om_columns_test.js index.html "$REF" | tail -1
echo "== Import OM, price and printed cap rate (asking vs sold vs assessed)"; node audit/om_price_test.js index.html "$REF" | tail -1
echo "== PDF summary (financial summary, annual cash flow reconciles to the engine, page fit)"; node audit/summary_test.js index.html | tail -1
echo "== deal documents sync (mocked storage endpoint)"; node audit/docsync_test.js index.html | tail -2
echo "== persistence";                        node audit/persistence_test.js index.html | tail -1
echo "== ui";                                 node audit/ui_test.js index.html | tail -1
echo "ALL AUDITS PASSED"
