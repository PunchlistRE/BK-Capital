"""Regression test for the underwriting conventions (CV-2026.10).

Compares every scenario produced by conventions_run.js against the independent model in model.py,
checks that the waterfall reconciles to total deal cash, and prints the before/after table.
Exit code 1 on any failure.
    python3 audit/conventions_test.py /tmp/cv.json
"""
import json, math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from model import model

data = json.load(open(sys.argv[1]))
fails = []
checks = 0


def close(name, app, ref, tol):
    global checks
    checks += 1
    if (isinstance(app, float) and math.isnan(app)) and math.isnan(ref):
        return
    if not abs(app - ref) <= tol:
        fails.append(f'{name}: app {app} vs independent {ref}')


for sc in data['scenarios']:
    tag = f"{sc['deal']} / {sc['name']}"
    m = model(sc['s'])
    sc['ref'] = m
    for k, tol in [('y1NOI', 0.01), ('loan', 0.5), ('equity', 0.5), ('ltvValue', 0.5), ('grossSale', 0.05),
                   ('levIRR', 1e-6), ('levMOIC', 1e-9), ('unlevIRR', 1e-6), ('unlevMOIC', 1e-9),
                   ('lpIRR', 1e-6), ('gpIRR', 1e-6), ('lpDist', 0.05), ('gpDist', 0.05)]:
        close(f'{tag} {k}', sc[k], m[k], tol)
    rc = sc['recon']
    # waterfall reconciles to total deal cash, every month and in total
    close(f'{tag} recon: worst month |LP+GP-dist|', rc['maxMonthGap'], 0.0, 1e-6)
    close(f'{tag} recon: LP+GP distributions = deal distributions', rc['lpgpDist'], rc['distSum'], 0.01)
    close(f'{tag} recon: deal distributions = positive equity cash flow', rc['distSum'], rc['posCF'], 0.01)
    close(f'{tag} recon: LP+GP contributions = equity called', rc['lpgpCon'], rc['conSum'], 0.01)
    close(f'{tag} recon: contributions >= equity at close', min(0.0, rc['conSum'] - rc['equity']), 0.0, 0.01)
    close(f'{tag} recon: monthly LP/GP split follows each tier\'s terms', rc['splitErr'], 0.0, 1e-6)
    tr = rc['tiers']
    close(f'{tag} recon: tiers sum to deal distributions', sum(tr.values()), rc['distSum'], 0.01)
    if sc['conv']['cvHurdleBasis'] == 'lp':
        # a tier only pays once the LP's own IRR has cleared the hurdle below it (1 bp tolerance for monthly compounding vs XIRR)
        for tier, hurdle in (('t3', 'hurdle2'), ('t4', 'hurdle3')):
            if tr[tier] > 1:
                checks += 1
                if not sc['lpIRR'] >= float(sc['s'][hurdle]) - 1e-4:
                    fails.append(f"{tag}: tier {tier} paid but LP IRR {sc['lpIRR']:.4%} < {hurdle} {float(sc['s'][hurdle]):.2%}")
    # LP-measured hurdles: a promote tier can only pay once the LP has cleared the preferred return
    if sc['conv']['cvHurdleBasis'] == 'lp' and m['promoteTiersPaid'] > 1:
        checks += 1
        if not sc['lpIRR'] >= float(sc['s']['pref']) - 1e-4:
            fails.append(f"{tag}: promote tiers paid while LP IRR {sc['lpIRR']:.4%} < pref")

pct = lambda v: f'{v*100:6.2f}%' if isinstance(v, (int, float)) and not math.isnan(v) else '   n/a'
money = lambda v: f'${v/1e6:6.2f}M'
print(f"{'Deal / scenario':40} {'Y1 NOI':>11} {'Loan':>9} {'Lev IRR':>8} {'Lev MOIC':>8} {'Unlev':>8} {'LP IRR':>8} {'GP IRR':>8} {'LP dist':>9} {'GP dist':>9}")
for sc in data['scenarios']:
    print(f"{sc['deal'] + ' / ' + sc['name']:40} {sc['y1NOI']:>11,.0f} {money(sc['loan'])} {pct(sc['levIRR'])} {sc['levMOIC']:7.2f}x {pct(sc['unlevIRR'])} "
          f"{pct(sc['lpIRR'])} {pct(sc['gpIRR'])} {money(sc['lpDist'])} {money(sc['gpDist'])}")
print('\nWaterfall tiers paid (LP-measured scenarios):')
for sc in data['scenarios']:
    if sc['conv']['cvHurdleBasis'] == 'lp' and sum(sc['recon']['tiers'].values()) > 0:
        tr = sc['recon']['tiers']
        print(f"  {sc['deal'] + ' / ' + sc['name']:38} T1 {money(tr['t1'])}  catch-up {money(tr['catchup'])}  T2 {money(tr['t2'])}  T3 {money(tr['t3'])}  T4 {money(tr['t4'])}  promote {money(sc['promote'])}")
print(f"\n{checks} checks, {len(fails)} failures, {len(data['pageErrors'])} page errors")
for f in fails: print('FAIL', f)
sys.exit(1 if fails or data['pageErrors'] else 0)
