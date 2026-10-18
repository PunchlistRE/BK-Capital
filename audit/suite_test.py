"""Checks the whole deal book (suite_run.js output):
  1. every acquisition / real deal against the independent model (model.py), plus waterfall reconciliation
  2. every development deal against the independent development audit (dev_audit.py)
  3. real deals: Year-1 statement NOI ties to the T-12 NOI, price = T-12 NOI / market cap
  4. golden results: every key figure equals the stored value (audit/golden/suite_golden.json)
    python3 audit/suite_test.py suite.json [--update-golden]
Exit 1 on any failure."""
import json, math, sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from model import model
import dev_audit

data = json.load(open(sys.argv[1])); update = '--update-golden' in sys.argv
GOLD = os.path.join(HERE, 'golden', 'suite_golden.json')
fails, checks = [], 0

def close(name, a, b, tol):
    global checks; checks += 1
    if isinstance(a, str) or isinstance(b, str):
        if a != b: fails.append(f'{name}: {a} vs {b}')
    elif not (math.isnan(a) and math.isnan(b)) and not abs(a - b) <= tol: fails.append(f'{name}: app {a} vs independent {b}')

ACQ_KEYS = [('y1NOI', 0.01), ('loan', 0.5), ('equity', 0.5), ('ltvValue', 0.5), ('grossSale', 0.05), ('levIRR', 1e-6), ('levMOIC', 1e-9),
            ('unlevIRR', 1e-6), ('unlevMOIC', 1e-9), ('lpIRR', 1e-6), ('gpIRR', 1e-6), ('lpDist', 0.05), ('gpDist', 0.05)]
golden = {}
nan = lambda v: float('nan') if v == 'NaN' else v
for d in data['deals']:
    r = d['res']; tag = d['id']
    if d['kind'] == 'acq':
        m = model(r['s'])
        for k, tol in ACQ_KEYS: close(f'{tag} {k}', nan(r[k]), nan(m[k]), tol)
        rc = r['recon']
        close(f'{tag} waterfall: worst month |LP+GP-dist|', rc['maxMonthGap'], 0.0, 1e-6)
        close(f'{tag} waterfall: LP+GP distributions = deal distributions', rc['lpgpDist'], rc['distSum'], 0.01)
        close(f'{tag} waterfall: deal distributions = positive equity cash flow', rc['distSum'], rc['posCF'], 0.01)
        close(f'{tag} waterfall: LP+GP contributions = equity called', rc['lpgpCon'], rc['conSum'], 0.01)
        close(f'{tag} waterfall: each tier splits on its own terms', rc['splitErr'], 0.0, 1e-6)
        close(f'{tag} waterfall: tiers sum to distributions', sum(rc['tiers'].values()), rc['distSum'], 0.01)
        if r['conv']['cvBadDebtBasis'] != 'legacy' and r['conv']['cvRentGrowthStart'] == 'year2' and r['conv']['cvOpexVariablePct'] == 0:
            close(f'{tag} reconcile: statement NOI = monthly Year-1 NOI', r['stmtNOI'], r['y1NOI'], 0.01)
        if 'real' in (d.get('purpose', '').lower() or '') or tag.startswith('REAL'):
            t = json.load(open(os.path.join(HERE, 'real', 'real_deals.json')))
            rd = next(x for x in t if x['id'] == tag); tg = rd['targets']
            close(f'{tag} tie-out: Year-1 statement NOI = T-12 NOI', r['stmtNOI'], tg['t12noi'], 1.0)
            close(f'{tag} tie-out: price = T-12 NOI / market cap', r['s']['purchasePrice'], tg['t12noi'] / tg['capRate'], 1.0)
            close(f'{tag} tie-out: gross rent = Yardi residential rent lines', r['s']['avgRent'] * r['s']['units'] * 12, tg['annualRent'], 0.5)
            close(f'{tag} tie-out: other income = Yardi other income lines', r['s']['otherIncomePerUnit'] * r['s']['units'], tg['otherIncome'], 0.5)
            stmt = tg['statementNetIncome'] + tg['mortgageInterest']
            close(f"{tag} tie-out: line-item NOI within 0.5% of the Yardi statement's NET INCOME + mortgage interest", abs(r['stmtNOI'] - stmt) / stmt, 0.0, 0.005)
        golden[tag] = {k: (nan(r[k]) if isinstance(r[k], str) and r[k] == 'NaN' else r[k]) for k in ['y1NOI', 'stmtNOI', 'loan', 'equity', 'ltvValue', 'binding', 'grossSale', 'levIRR', 'levMOIC', 'unlevIRR', 'unlevMOIC', 'lpIRR', 'gpIRR', 'lpDist', 'gpDist', 'promote']}
    else:
        c, f, notes = dev_audit.run(r, quiet=True); checks += c; fails += [f'{tag} {x}' for x in f]
        golden[tag] = dict(r['f'] and {k: r['f'][k] for k in ['commit', 'upfrontFees', 'actualCapInt', 'equityTotal']}, **{k: r['t'][k] for k in ['permLoan', 'bindingTest', 'noi']},
                           hard=r['dv']['hard'], soft=r['dv']['soft'], unlev=r['dv']['unlev'], irr=r['m']['irr'], moic=r['m']['moic'])

# ---- golden master
def norm(v):
    if isinstance(v, str): return v
    if isinstance(v, float) and math.isnan(v): return 'NaN'
    return round(v, 2) if abs(v) >= 100 else round(v, 9)
gnorm = {t: {k: norm(v) for k, v in g.items()} for t, g in golden.items()}
if update:
    json.dump(gnorm, open(GOLD, 'w'), indent=1, sort_keys=True); print('golden results written:', GOLD)
else:
    old = json.load(open(GOLD))
    for t in sorted(set(old) | set(gnorm)):
        if t not in gnorm: fails.append(f'golden: deal {t} missing from this run'); continue
        if t not in old: fails.append(f'golden: deal {t} has no stored result (run with --update-golden)'); continue
        for k in sorted(set(old[t]) | set(gnorm[t])):
            checks += 1
            if old[t].get(k) != gnorm[t].get(k): fails.append(f'golden {t}.{k}: stored {old[t].get(k)} vs now {gnorm[t].get(k)}')

print(f"{'deal':8} {'kind':5} {'Y1 NOI':>11} {'loan/commit':>12} {'equity':>12} {'lev IRR':>8} {'MOIC':>6}")
for d in data['deals']:
    r = d['res']; g = golden[d['id']]
    if d['kind'] == 'acq': print(f"{d['id']:8} acq  {r['y1NOI']:>11,.0f} {r['loan']:>12,.0f} {r['equity']:>12,.0f} {r['levIRR']*100:>7.2f}% {r['levMOIC']:>5.2f}x")
    else: print(f"{d['id']:8} dev  {r['t']['noi']:>11,.0f} {r['f']['commit']:>12,.0f} {r['f']['equityTotal']:>12,.0f} {r['m']['irr']*100:>7.2f}% {r['m']['moic']:>5.2f}x")
print(f"\n{checks} checks, {len(fails)} failures, {len(data['pageErrors'])} page errors")
for x in fails[:60]: print('FAIL', x)
sys.exit(1 if fails or data['pageErrors'] else 0)
