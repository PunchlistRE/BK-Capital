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
echo "== deal book vs independent models, T-12 tie-outs, golden results"; node audit/suite_run.js index.html "$T/suite.json" >/dev/null; python3 audit/suite_test.py "$T/suite.json" | tail -1; python3 audit/suite_test.py "$T/suite.json" >/dev/null
echo "== repeatability"; audit/repeat_test.sh index.html | tail -1
echo "== persistence";                        node audit/persistence_test.js index.html | tail -1
echo "== ui";                                 node audit/ui_test.js index.html | tail -1
echo "ALL AUDITS PASSED"
