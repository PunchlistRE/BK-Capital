#!/usr/bin/env python3
"""Runs the same sections as run_all.sh, several at a time, with each section's result saved as it finishes. The serial run_all.sh takes about 30 minutes; this takes about 11
with 3 workers. If the machine restarts part-way, run it again with the same --out folder and it carries on from the sections that had not finished.
    python3 audit/run_parallel.py [--workers 3] [--out DIR]
Exit status is non-zero if any section fails. Every section is a block of run_all.sh starting at an  echo "== ...  line, run exactly as it is there."""
import argparse, concurrent.futures as cf, os, subprocess, sys, tempfile, time
ap = argparse.ArgumentParser(); ap.add_argument('--workers', type=int, default=3); ap.add_argument('--out', default=os.path.join(tempfile.gettempdir(), 'bk-full-run')); a = ap.parse_args()
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')); os.makedirs(a.out, exist_ok=True)
skip = lambda l: not l.strip() or l.startswith('#') or l.startswith('set -') or l.startswith('cd "$(dirname') or l.startswith('T=$(mktemp') or l.startswith('REF=') or l.startswith('[ -n "${1:-}"') or 'ALL AUDITS PASSED' in l
secs = []
for l in open(os.path.join(REPO, 'audit', 'run_all.sh')).read().split('\n'):
    if skip(l): continue
    if l.startswith('echo "== '): secs.append([l])
    elif secs: secs[-1].append(l)
ref = os.path.join(a.out, 'ref.html')
if not os.path.exists(ref): open(ref, 'wb').write(subprocess.run(['git', 'show', 'HEAD~1:index.html'], cwd=REPO, capture_output=True).stdout)
def run(i):
    ex = os.path.join(a.out, '%02d.exit' % i)
    if os.path.exists(ex): return i, open(ex).read()
    script = 'set -euo pipefail\ncd %s\nT=$(mktemp -d); trap \'rm -rf "$T"\' EXIT\nREF=%s\n%s\n' % (REPO, ref, '\n'.join(secs[i])); t0 = time.time()
    try: p = subprocess.run(['bash', '-c', script], capture_output=True, text=True, timeout=1500); out, rc = p.stdout + p.stderr, p.returncode
    except subprocess.TimeoutExpired: out, rc = 'timed out after 25 minutes', 124
    open(os.path.join(a.out, '%02d.log' % i), 'w').write(out); res = '%d %ds' % (rc, time.time() - t0); open(ex, 'w').write(res); return i, res
print(len(secs), 'sections, %d at a time, results in %s' % (a.workers, a.out), flush=True); bad = []
with cf.ThreadPoolExecutor(a.workers) as e:
    for i, res in e.map(run, range(len(secs))):
        rc = int(res.split()[0]); title = secs[i][0].split('"')[1][3:90]; print(('ok   ' if rc == 0 else 'FAIL ') + '%02d %s (%s)' % (i, title, res.split()[1]), flush=True)
        if rc: bad.append(i)
print('ALL SECTIONS PASSED' if not bad else 'FAILED: ' + ', '.join('%02d' % i for i in bad) + ' (see the .log files)'); sys.exit(1 if bad else 0)
