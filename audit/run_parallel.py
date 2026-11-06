#!/usr/bin/env python3
"""Runs the sections of audit/run_all.sh several at a time, with each section's result and output saved as it finishes. The serial run_all.sh takes about 35 minutes; this takes
about 12 with 3 workers, and it reports EVERY failing section (the serial script stops at the first).

    python3 audit/run_parallel.py [--workers 3] [--out DIR] [--logs failed|all|none] [--script PATH]
    python3 audit/run_parallel.py --check      # prove this runner covers exactly what run_all.sh runs (no browser, no network)
    python3 audit/run_parallel.py --selftest   # prove it reports a failing section (exit status, name, output) and still runs the others

Every section is a block of run_all.sh starting at an  echo "== ...  line, run exactly as it is there: set -euo pipefail, from the repository root, with the same T and REF.
Exit status is non-zero if any section fails. --logs all prints every section's output (what the serial script prints); --logs failed (the default) prints the failing ones.

Two guards keep this runner from certifying less than run_all.sh would:
  * the lines of run_all.sh that this runner does not run itself (its preamble and its closing message) must be exactly the known ones; any other line there, or any command after the
    closing message, is an error rather than a test that is silently left out (--check does this without running anything, and the CI runs it first);
  * a run that is resumed (same --out) reuses a finished section only if the audit commands, the audit files, index.html, the reference build and the BK_* / browser environment are
    all unchanged; otherwise it starts fresh, so results from a different build can never be reported as this build's."""
import argparse, concurrent.futures as cf, hashlib, json, os, re, shutil, subprocess, sys, tempfile, time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
HEADER = 'echo "== '
# the preamble of run_all.sh, which this runner reproduces itself (set -euo pipefail, cd to the repository root, T, REF) and its closing message
SETUP = ['set -euo pipefail', 'cd "$(dirname "$0")/.."', "T=$(mktemp -d); trap 'rm -rf \"$T\"' EXIT", 'REF=${1:-$T/ref.html}',
         '[ -n "${1:-}" ] || git show HEAD~1:index.html > "$REF" 2>/dev/null || git show HEAD:index.html > "$REF"']
TRAILER = 'echo "ALL AUDITS PASSED"'


def exec_lines(path):
    return [l.rstrip() for l in open(path).read().split('\n') if l.strip() and not l.lstrip().startswith('#')]


def parse(path):
    """-> (preamble, sections, trailer). Raises ValueError for any executable line this runner would drop or could not reproduce."""
    pre, secs, trailer = [], [], []
    for l in exec_lines(path):
        if trailer: raise ValueError('%s: a command after the closing message (it would be dropped): %s' % (path, l[:100]))
        if l.startswith(HEADER): secs.append([l]); continue
        if not secs:
            if l in SETUP: pre.append(l); continue
            raise ValueError('%s: a line before the first section that this runner does not reproduce (it would be dropped): %s' % (path, l[:100]))
        if l == TRAILER: trailer.append(l); continue
        if l in SETUP: raise ValueError('%s: a setup line inside the sections (this runner sets up once, before them): %s' % (path, l[:100]))
        secs[-1].append(l)
    if not secs: raise ValueError('%s: no sections (no line starts with %s)' % (path, HEADER))
    return pre, secs, trailer


def check(path):
    pre, secs, trailer = parse(path)
    rebuilt = pre + [l for s in secs for l in s] + trailer
    if rebuilt != exec_lines(path): raise ValueError('%s: the sections do not add back up to the executable lines of the script' % path)
    n = sum(len(s) for s in secs)
    fp = hashlib.sha256('\n'.join(l for s in secs for l in s).encode()).hexdigest()[:12]
    print('ok: %d sections, %d command lines; every executable line of %s is either reproduced by this runner (%d preamble, %d closing) or in a section; section fingerprint %s'
          % (len(secs), n, os.path.relpath(path, REPO) if path.startswith(REPO) else path, len(pre), len(trailer), fp), flush=True)


def make_ref(dest):
    """the reference build for the sections that compare against the previous commit: HEAD~1's index.html, else HEAD's (exactly what run_all.sh does)"""
    for rev in ('HEAD~1', 'HEAD'):
        r = subprocess.run(['git', 'show', rev + ':index.html'], cwd=REPO, capture_output=True)
        if r.returncode == 0 and r.stdout: open(dest, 'wb').write(r.stdout); return
    raise SystemExit('cannot read index.html from git (HEAD~1 or HEAD): the reference build is needed')


def fingerprint(secs, ref):
    h = hashlib.sha256(); h.update('\n'.join(l for s in secs for l in s).encode()); h.update(hashlib.sha256(open(ref, 'rb').read()).digest())
    files = subprocess.run(['git', 'ls-files', '-z', 'audit', 'index.html'], cwd=REPO, capture_output=True).stdout.split(b'\0')
    for f in sorted(x for x in files if x):
        p = os.path.join(REPO, f.decode())
        if os.path.isfile(p): h.update(f); h.update(hashlib.sha256(open(p, 'rb').read()).digest())
    h.update(json.dumps(sorted((k, v) for k, v in os.environ.items() if k.startswith('BK_') or k in ('PLAYWRIGHT_MODULE', 'CHROMIUM_PATH'))).encode())
    return h.hexdigest()


def title_of(sec):
    return sec[0].split('"')[1][3:90]


def run_audit(a):
    pre, secs, _ = parse(a.script)
    os.makedirs(a.out, exist_ok=True); gh = os.environ.get('GITHUB_ACTIONS') == 'true'
    ref = os.path.join(a.out, 'ref.html'); make_ref(ref)
    fp = fingerprint(secs, ref); metaf = os.path.join(a.out, 'meta.json'); old = json.load(open(metaf)).get('fingerprint') if os.path.exists(metaf) else None
    leftovers = [f for f in os.listdir(a.out) if re.match(r'^\d\d\.(exit|log)$', f)]
    if leftovers and old != fp:
        print('results in %s are from a different build, audit or environment: starting fresh' % a.out, flush=True)
        for f in leftovers: os.remove(os.path.join(a.out, f))
    json.dump({'fingerprint': fp}, open(metaf, 'w'))

    def run(i):
        ex = os.path.join(a.out, '%02d.exit' % i)
        if os.path.exists(ex): return i, open(ex).read()
        script = 'set -euo pipefail\ncd %s\nT=$(mktemp -d); trap \'rm -rf "$T"\' EXIT\nREF=%s\n%s\n' % (REPO, ref, '\n'.join(secs[i])); t0 = time.time()
        try: p = subprocess.run(['bash', '-c', script], capture_output=True, text=True, timeout=1500); out, rc = p.stdout + p.stderr, p.returncode
        except subprocess.TimeoutExpired: out, rc = 'timed out after 25 minutes', 124
        open(os.path.join(a.out, '%02d.log' % i), 'w').write(out); res = '%d %ds' % (rc, time.time() - t0); open(ex, 'w').write(res); return i, res

    idx = [i for i in range(len(secs)) if not a.only or re.search(a.only, title_of(secs[i]), re.I)]
    if a.only and not idx: raise ValueError('--only %r matches no section' % a.only)
    print(len(secs), 'sections' + (' (quick run: %d of them, chosen by --only)' % len(idx) if a.only else '') + ', %d at a time, results in %s' % (a.workers, a.out), flush=True); bad = []
    with cf.ThreadPoolExecutor(a.workers) as e:
        for i, res in e.map(run, idx):
            rc = int(res.split()[0]); title = title_of(secs[i]); print(('ok   ' if rc == 0 else 'FAIL ') + '%02d %s (%s)' % (i, title, res.split()[1]), flush=True)
            if rc: bad.append(i)
            if a.logs == 'all' or (a.logs == 'failed' and rc):
                lf = os.path.join(a.out, '%02d.log' % i); body = open(lf).read().rstrip() if os.path.exists(lf) else '(no output was saved for this section)'
                if gh: print('::group::%02d %s' % (i, title))
                if gh and rc: print('::error title=audit section %02d failed::%s' % (i, title))
                print(body, flush=True)
                if gh: print('::endgroup::', flush=True)
    print(('ALL SECTIONS PASSED' if not a.only else 'QUICK RUN PASSED (%d of %d sections; the full audit runs on main and nightly)' % (len(idx), len(secs))) if not bad else 'FAILED: ' + ', '.join('%02d' % i for i in bad) + ' (see the .log files)')
    for i in bad: print('  %02d %s' % (i, title_of(secs[i])))
    return 1 if bad else 0


def selftest():
    """a script of five sections run through this runner: the passing ones are reported ok, the failing ones (an exit status, and a failure inside a pipe) are reported by name with their output and the exit status
    is non-zero, a command on a continuation line runs, a section after a failure still runs, the closing message is not run as a section; and scripts this runner could not reproduce are refused."""
    d = tempfile.mkdtemp(prefix='bk-rp-selftest-'); mark = os.path.join(d, 'mark.txt'); script = os.path.join(d, 'run_all.sh'); n = 0
    try:
        def need(ok, what):
            nonlocal n; n += 1
            if not ok: raise SystemExit('selftest FAILED: ' + what)
        open(script, 'w').write('\n'.join(['#!/usr/bin/env bash', '# selftest'] + SETUP + [
            'echo "== one command"; echo one >> %s; echo "2 checks, 0 failures"' % mark,
            'echo "== two commands"; echo two-a >> %s' % mark, 'echo two-b >> %s' % mark,
            'echo "== exits non-zero"; echo "1 checks, 1 failures"; echo three >> %s; exit 3' % mark,
            'echo "== failure inside a pipe"; echo four >> %s; false | tail -1' % mark,
            'echo "== runs after the failures"; echo five >> %s' % mark, TRAILER, '']))
        check(script)
        r = subprocess.run([sys.executable, os.path.abspath(__file__), '--script', script, '--out', os.path.join(d, 'out'), '--workers', '2', '--logs', 'failed'], capture_output=True, text=True)
        o = r.stdout
        need(r.returncode == 1, 'exit status is %d, not 1, with two failing sections' % r.returncode)
        need('ok   00 one command' in o and 'ok   01 two commands' in o and 'ok   04 runs after the failures' in o, 'passing sections are not reported ok')
        need('FAIL 02 exits non-zero' in o and 'FAIL 03 failure inside a pipe' in o, 'a failing section is not reported by name')
        need('FAILED: 02, 03' in o, 'the summary does not list exactly the failing sections')
        need('1 checks, 1 failures' in o, "the failing section's own output is not printed")
        need(sorted(open(mark).read().split()) == sorted(['one', 'two-a', 'two-b', 'three', 'four', 'five']), 'a command did not run (continuation line, or a section after a failure)')
        need('ALL AUDITS PASSED' not in o and 'ALL SECTIONS PASSED' not in o, 'the closing message ran as a section or a failing run reported success')
        # a stale result from a different audit is not reused
        r2 = subprocess.run([sys.executable, os.path.abspath(__file__), '--script', script, '--out', os.path.join(d, 'out'), '--workers', '2'], capture_output=True, text=True)
        need('FAILED: 02, 03' in r2.stdout and 'starting fresh' not in r2.stdout, 'a resumed run with nothing changed did not reuse or did not repeat the failures')
        open(script, 'a').write('# touched\n'); lines = open(script).read().replace('echo five', 'echo FIVE'); open(script, 'w').write(lines)
        r3 = subprocess.run([sys.executable, os.path.abspath(__file__), '--script', script, '--out', os.path.join(d, 'out'), '--workers', '2'], capture_output=True, text=True)
        need('starting fresh' in r3.stdout, 'results from a changed audit were reused')
        for what, text in (('an unknown line before the first section', ['export FOO=1', 'echo "== x"; true']), ('a command after the closing message', ['echo "== x"; true', TRAILER, 'node audit/forgotten_test.js']),
                           ('no sections', ['true'])):
            bad = os.path.join(d, 'bad.sh'); open(bad, 'w').write('\n'.join(['#!/usr/bin/env bash'] + SETUP + text + ['']) if what != 'an unknown line before the first section' else '\n'.join(['#!/usr/bin/env bash'] + text[:1] + SETUP + text[1:] + ['']))
            try: check(bad); need(False, 'a script with %s was accepted' % what)
            except ValueError: need(True, '')
        print('selftest ok: %d assertions (failing sections reported by name with their output and a non-zero exit, nothing dropped, stale results not reused, unreproducible scripts refused)' % n)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description='Runs the sections of audit/run_all.sh several at a time.')
    ap.add_argument('--workers', type=int, default=3); ap.add_argument('--out', default=os.path.join(tempfile.gettempdir(), 'bk-full-run'))
    ap.add_argument('--script', default=os.path.join(REPO, 'audit', 'run_all.sh')); ap.add_argument('--logs', choices=['failed', 'all', 'none'], default='failed')
    ap.add_argument('--only', default='', help='a quick run: only the sections whose title matches this regular expression (the check and selftest guards still cover the whole script)'); ap.add_argument('--check', action='store_true'); ap.add_argument('--selftest', action='store_true'); a = ap.parse_args()
    try:
        if a.check: check(a.script); return 0
        if a.selftest: selftest(); return 0
        return run_audit(a)
    except ValueError as e:
        print('NOT RUN: ' + str(e), file=sys.stderr); return 1


if __name__ == '__main__':
    sys.exit(main())
