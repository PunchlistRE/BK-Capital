#!/usr/bin/env bash
# Repeatability: the deal book must produce byte-identical results however and whenever it is run -
# different order, different time zone, different system date (incl. a leap day), and after a
# save / reopen through the cloud mappers.
#   PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... audit/repeat_test.sh [index.html]
set -euo pipefail
cd "$(dirname "$0")/.."; F=${1:-index.html}; T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
node audit/suite_run.js "$F" "$T/base.json" --roundtrip | tail -1
node audit/suite_run.js "$F" "$T/rev_tokyo_2031.json"  --reverse --tz Pacific/Kiritimati --date 2031-06-30 | tail -1
node audit/suite_run.js "$F" "$T/la_leapday.json"      --tz America/Los_Angeles --date 2024-02-29 | tail -1
node audit/suite_run.js "$F" "$T/base2.json" | tail -1
python3 - "$T" <<'PY'
import json, sys, hashlib
T = sys.argv[1]; names = ['base', 'base2', 'rev_tokyo_2031', 'la_leapday']; docs = {}
for n in names:
    d = json.load(open(f'{T}/{n}.json'))
    if d['pageErrors']: sys.exit(f'{n}: page errors {d["pageErrors"]}')
    for x in d['deals']: x.pop('roundTripIdentical', None)
    docs[n] = json.dumps(d['deals'], sort_keys=True)
rt = json.load(open(f'{T}/base.json'))
bad = [x['id'] for x in rt['deals'] if not x.get('roundTripIdentical')]
if bad: sys.exit(f'save/reopen changed results for: {bad}')
ref = docs['base']; h = hashlib.sha256(ref.encode()).hexdigest()[:16]
for n in names[1:]:
    if docs[n] != ref:
        a, b = json.loads(ref), json.loads(docs[n])
        for x, y in zip(a, b):
            if x != y: sys.exit(f'{n}: results differ for {x["id"]}')
        sys.exit(f'{n}: differs')
print(f'REPEATABLE: {len(json.loads(ref))} deals x 4 runs (order, time zone, system date, save/reopen) byte-identical, sha256 {h}')
PY
