"""Independent check of the Probability-Weighted Returns sheet (audit/risk_run.js output):
  1. the random draws: the seeded generator and the driver shifts, reproduced here from the documented algorithm
  2. each draw's levered IRR / multiple / profit, re-run through the independent deal model (model.py) with the same input overrides
  3. every aggregate (mean, percentiles, probabilities) recomputed from the draws' own results
  4. the scenario weighting: expected profit, expected multiple, the IRR of the probability-weighted cash flow, the odds
    python3 audit/risk_ref.py risk.json        Exit 1 on any failure."""
import json, math, sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from model import model, xirr
M = 0xFFFFFFFF
def imul(a, b): return (a * b) & M
def mulberry(seed):
    a = [seed & M]
    def nxt():
        a[0] = (a[0] + 0x6D2B79F5) & M; t = a[0]
        t = imul(t ^ (t >> 15), t | 1); t = (t ^ ((t + imul(t ^ (t >> 7), t | 61)) & M)) & M
        return ((t ^ (t >> 14)) & M) / 4294967296
    return nxt
def normals(r, n):
    out = []
    while len(out) < n:
        u = max(1e-12, r()); v = r(); m = math.sqrt(-2 * math.log(u)); out += [m * math.cos(2 * math.pi * v), m * math.sin(2 * math.pi * v)]
    return out[:n]
ORDER = ['exitCap', 'rentGrowth', 'rentLevel', 'vacancy', 'opexLevel', 'opexGrowth', 'rate']
EXP = ['taxes', 'insurance', 'payroll', 'rm', 'turnover', 'utilities', 'contract', 'marketing', 'ga', 'miscPerGSF']
def overrides(s, id_, d):
    N = lambda k: float(s.get(k) or 0)
    if id_ == 'exitCap': return {'exitCap': max(0.0025, N('exitCap') + d)}
    if id_ == 'rentGrowth': return {'rentGrowth': N('rentGrowth') + d, 'commercialRentGrowth': N('commercialRentGrowth') + d}
    if id_ == 'rentLevel': return {'avgRent': N('avgRent') * (1 + d), 'commercialRent': N('commercialRent') * (1 + d)}
    if id_ == 'vacancy': return {'vacancy': min(0.95, max(0, N('vacancy') + d)), 'commercialVacancy': min(0.95, max(0, N('commercialVacancy') + d))}
    if id_ == 'opexLevel': return {k: N(k) * (1 + d) for k in EXP}
    if id_ == 'opexGrowth': return {'opexGrowth': N('opexGrowth') + d}
    if id_ == 'rate':
        k = 'debtIndexRate' if str(s.get('debtRateType') or 'Fixed') == 'Floating' else 'acqRate'; return {k: max(0, N(k) + d)}
def draws(s, R, count):
    r = mulberry(int(R['seed'])); out = []
    for _ in range(count):
        z = normals(r, 7); zs = {'exitCap': z[0], 'rentGrowth': R['corr'] * z[0] + math.sqrt(max(0, 1 - R['corr'] ** 2)) * z[1]}
        for i, id_ in enumerate(['rentLevel', 'vacancy', 'opexLevel', 'opexGrowth', 'rate']): zs[id_] = z[2 + i]
        ov, shifts = {}, {}
        for id_ in ORDER:
            sh = max(-2.5, min(2.5, zs[id_])) * R['sd'][id_]; shifts[id_] = sh; ov.update(overrides(s, id_, sh))
        out.append((ov, shifts))
    return out
def run(s, ov):
    m = model(dict(s, **ov)); v = [-m['equityAtClose']] + m['levCF']
    return dict(irr=m['levIRR'], moic=m['levMOIC'], profit=sum(v), v=v, dates=m['levDates'])
def pct(a, p):
    a = sorted(a); i = (len(a) - 1) * p; lo, hi = math.floor(i), math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo)
fails, checks = [], 0
def close(name, a, b, tol):
    global checks; checks += 1
    if isinstance(a, str) or isinstance(b, str):
        if a != b: fails.append(f'{name}: {a} vs {b}')
    elif a is None or b is None or not (abs(a - b) <= tol): fails.append(f'{name}: app {a} vs independent {b}')
data = json.load(open(sys.argv[1]))
for di, d in enumerate(data['deals']):
    s, R, tag = d['s'], d['risk'], f'RISK-{di + 1}'
    dr = draws(s, R, len(d['draws']))
    for k, ((ov, sh), (aov, ash)) in enumerate(zip(dr, [(x['ov'], x['shifts']) for x in d['draws']])):
        for id_ in ORDER: close(f'{tag} draw {k} shift {id_}', ash[id_], sh[id_], 1e-12)
        for key in ov: close(f'{tag} draw {k} override {key}', aov[key], ov[key], 1e-12)
    for k in range(min(40, len(dr))):
        ref = run(s, dr[k][0]); a = d['runs'][k]
        close(f'{tag} draw {k} levered IRR', a['irr'], ref['irr'], 1e-6); close(f'{tag} draw {k} equity multiple', a['moic'], ref['moic'], 1e-9); close(f'{tag} draw {k} equity profit', a['profit'], ref['profit'], 0.05)
    irr = [x['irr'] for x in d['runs']]; fin = [v for v in irr if v is not None and not (isinstance(v, str))]
    S = d['summary']; n = len(d['runs']); close(f'{tag} draw count', S['n'], n, 0)
    close(f'{tag} IRR mean', S['irr']['mean'], sum(fin) / len(fin), 1e-12)
    mean = sum(fin) / len(fin); close(f'{tag} IRR std dev', S['irr']['sd'], math.sqrt(sum((v - mean) ** 2 for v in fin) / max(1, len(fin) - 1)), 1e-12)
    for key, p in (('p5', .05), ('p10', .10), ('p25', .25), ('p50', .5), ('p75', .75), ('p90', .9), ('p95', .95)): close(f'{tag} IRR {key}', S['irr'][key], pct(fin, p), 1e-12)
    close(f'{tag} IRR min', S['irr']['min'], min(fin), 0); close(f'{tag} IRR max', S['irr']['max'], max(fin), 0)
    for key, p in (('p10', .1), ('p50', .5), ('p90', .9)):
        close(f'{tag} MOIC {key}', S['moic'][key], pct([x['moic'] for x in d['runs']], p), 1e-12); close(f'{tag} profit {key}', S['profit'][key], pct([x['profit'] for x in d['runs']], p), 1e-6)
    hurdle, mind = d['policy']['targetIRR'], d['policy']['minDSCR']
    close(f'{tag} P(loss)', S['pLoss'], sum(1 for x in d['runs'] if x['profit'] < 0) / n, 1e-12)
    close(f'{tag} P(miss hurdle)', S['pMiss'], sum(1 for x in d['runs'] if not (x['irr'] is not None and x['irr'] >= hurdle)) / n, 1e-12)
    close(f'{tag} P(DSCR below policy)', S['pDscr'], sum(1 for x in d['runs'] if x['dscr'] is not None and x['dscr'] < mind) / n, 1e-12)
    # scenario weighting
    sc = d['scenarios']; refs = []
    for c in sc['cases']:
        ref = run(s, c['ov']); refs.append(ref)
        close(f"{tag} {c['name']} IRR", c['irr'], ref['irr'], 1e-6); close(f"{tag} {c['name']} multiple", c['moic'], ref['moic'], 1e-9); close(f"{tag} {c['name']} profit", c['profit'], ref['profit'], 0.05)
    tot = sum(c['p'] for c in sc['cases']); W = lambda vals: sum(c['p'] * v for c, v in zip(sc['cases'], vals)) / tot
    close(f'{tag} probabilities used are the inputs', sc['cases'][0]['p'], R['p']['Downside'], 0)
    close(f'{tag} expected profit', sc['expProfit'], W([r['profit'] for r in refs]), 0.05); close(f'{tag} expected multiple', sc['expMoic'], W([r['moic'] for r in refs]), 1e-9)
    close(f'{tag} average of IRRs', sc['avgIRR'], W([r['irr'] for r in refs]), 1e-6)
    wcf = [W([r['v'][i] for r in refs]) for i in range(len(refs[0]['v']))]; close(f'{tag} IRR of the expected cash flow', sc['irrOfExpectedCF'], xirr(wcf, refs[0]['dates']), 1e-6)
    close(f'{tag} P(loss), scenarios', sc['pLoss'], sum(c['p'] for c, r in zip(sc['cases'], refs) if r['profit'] < 0) / tot, 1e-12)
    close(f'{tag} P(miss hurdle), scenarios', sc['pMiss'], sum(c['p'] for c, r in zip(sc['cases'], refs) if not r['irr'] >= hurdle) / tot, 1e-12)
close('page errors', len(data['pageErrors']), 0, 0)
print(f'{checks} checks, {len(fails)} failures')
for f in fails[:25]: print('FAIL', f)
sys.exit(1 if fails else 0)
