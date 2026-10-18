"""Independent operating-business model (revenue build, P&L, break-even, discount rate, DCF with three cases, sensitivities,
10-year valuation) written from the formulas in Punchlist_Business_Model_with_Valuation.xlsx - not from the app's code.

    python3 audit/biz_ref.py          -> ties this implementation to the workbook's own outputs
    model(biz)                        -> every figure, for comparison with the app's bkBizModel()
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))

def tiers_econ(b):
    rows = []
    for t in b['tiers']:
        coord = t['avgValue'] * t['coordPct']
        rows.append(dict(name=t['name'], mix=t['mix'], coord=coord, revPerJob=coord + t['fee'], effFee=(coord + t['fee']) / t['avgValue']))
    return dict(rows=rows, wValue=sum(t['mix'] * t['avgValue'] for t in b['tiers']), wRevJob=sum(r['mix'] * r['revPerJob'] for r in rows))

def pnl(b):
    te = tiers_econ(b); g = b['growth']; opex = b['opex']
    run = sum(o['annual'] for o in opex if not o['cls'].startswith('CapEx'))      # operating run-rate excl. FF&E
    ffe = sum(o['annual'] for o in opex if o['cls'].startswith('CapEx'))
    h2_jobs = sum(b['relaunchJobs'])
    years = [dict(label='H2 2025', jobs=h2_jobs, value=te['wValue'], revJob=te['wRevJob'], opex=run / 2, ffe=ffe / 2)]
    jobs = h2_jobs * 2; value = te['wValue']; revjob = te['wRevJob']; ox = 1.0
    for k in range(5):
        jobs *= 1 + g['jobs'][k]; value *= 1 + g['value'][k]; revjob *= 1 + g['value'][k]; ox *= 1 + g['opex'][k]
        years.append(dict(label=str(2026 + k), jobs=jobs, value=value, revJob=revjob, opex=run * ox, ffe=ffe * ox))
    for y in years:
        y['gpv'] = y['jobs'] * y['value']; y['revenue'] = y['jobs'] * y['revJob']; y['ebitda'] = y['revenue'] - y['opex']
        y['margin'] = y['ebitda'] / y['revenue']; y['cashBT'] = y['ebitda'] - y['ffe']
    be_jobs = run / te['wRevJob']
    return dict(tiers=te, years=years, runRate=run, ffe=ffe, breakEven=dict(jobsYear=be_jobs, jobsMonth=be_jobs / 12, gpv=be_jobs * te['wValue']))

def cost_of_equity(r): return r['rf'] + r['erp'] + r['size'] + r['specific']
def wacc(r):
    dw = r.get('debtWeight') or 0.0
    return cost_of_equity(r) * (1 - dw) + (r.get('costDebt') or 0.0) * dw

def dcf(b, P, case=None, rate=None, g=None, mult=None, comp=None, tv=None, tv_discount='workbook', convention='mid'):
    d = b['dcf']; case = case or ['bear', 'base', 'bull'][d['case'] - 1]; c = d['cases'][case]
    base_rate = wacc(b['rate']) if case == 'base' else c['rate']
    rate = base_rate if rate is None else rate; g = c['g'] if g is None else g; mult = c['mult'] if mult is None else mult; comp0 = c['comp'] if comp is None else comp
    tv_method = d['tvMethod'] if tv is None else tv
    ann_prev = P['years'][0]['revenue'] * 2                        # 2025A annualised
    rows = []
    for k in range(5):
        y = P['years'][k + 1]; rev = y['revenue'] * c['rev'][k]; opex = y['opex']
        sde = rev - opex; owner = comp0 * (1 + d['ownerCompEsc']) ** k; ebitda = sde - owner
        capex = rev * c['capex'][k]; nwc = (rev - ann_prev) * c['nwc'][k]; fcf = ebitda - capex - nwc
        t = k + 0.5 if convention == 'mid' else k + 1.0
        rows.append(dict(revenue=rev, opex=opex, sde=sde, owner=owner, ebitda=ebitda, capex=capex, nwc=nwc, fcf=fcf, t=t, df=1 / (1 + rate) ** t))
        ann_prev = rev
    for r_ in rows: r_['pv'] = r_['fcf'] * r_['df']
    last = rows[-1]; term_fcf = last['fcf'] * (1 + g)
    tv_perp = term_fcf / (rate - g); tv_mult = last['ebitda'] * mult
    sel = tv_perp if tv_method == 1 else tv_mult if tv_method == 2 else (tv_perp + tv_mult) / 2
    df_n = last['df']                                              # workbook: the final mid-year factor, for every method
    df_end = 1 / (1 + rate) ** 5
    if tv_discount == 'workbook': pv_tv = sel * df_n
    else:                                                            # standard: perpetuity at the mid-year factor, exit multiple at the end of year 5
        pv_tv = (tv_perp * df_n if tv_method == 1 else tv_mult * df_end if tv_method == 2 else (tv_perp * df_n + tv_mult * df_end) / 2)
    sum_pv = sum(r_['pv'] for r_ in rows); ev = sum_pv + pv_tv; nd = d['netDebt']
    return dict(case=case, rate=rate, g=g, mult=mult, rows=rows, termFcf=term_fcf, tvPerp=tv_perp, tvMult=tv_mult, tvSel=sel, pvTV=pv_tv, sumPV=sum_pv, ev=ev, equity=ev - nd,
                eqPerp=sum_pv + tv_perp * df_n - nd, eqMult=sum_pv + tv_mult * df_n - nd, tvShare=pv_tv / ev, evEbitda2030=ev / last['ebitda'], evEbitda2026=ev / rows[0]['ebitda'])

def sensitivities(b, P):
    case = ['bear', 'base', 'bull'][b['dcf']['case'] - 1]; base = dcf(b, P)
    rates = [base['rate'] + d for d in (-0.04, -0.02, 0, 0.02, 0.04)]; gs = [base['g'] + d for d in (-0.01, -0.005, 0, 0.005, 0.01)]
    mults = [base['mult'] + d for d in (-2, -1, 0, 1, 2)]; comp0 = b['dcf']['cases'][case]['comp']; comps = [comp0 + d for d in (-20000, -10000, 0, 10000, 20000)]
    s1 = [[dcf(b, P, rate=r, g=g)['eqPerp'] for g in gs] for r in rates]
    s2 = [[dcf(b, P, rate=r, mult=m)['eqMult'] for m in mults] for r in rates]
    s3 = [[dcf(b, P, rate=r, comp=c)['eqPerp'] for r in rates] for c in comps]
    return dict(rates=rates, gs=gs, mults=mults, comps=comps, s1=s1, s2=s2, s3=s3)

def valuation(b, P):
    v = b['valuation']; ext = v['ext']; ys = P['years'][1:]
    rev = [y['revenue'] for y in ys]; marg = [y['margin'] for y in ys]
    for k in range(5): rev.append(rev[-1] * (1 + ext['growth'][k]))
    marg += ext['margin']; ebitda = [r * m for r, m in zip(rev, marg)]; ev = [e * x for e, x in zip(ebitda, ext['mult'])]
    return dict(rev=rev, margin=marg, ebitda=ebitda, ev=ev, scenarios=[dict(name=s['name'], ebitda=s['revenue'] * s['margin'], ev=s['revenue'] * s['margin'] * s['mult']) for s in v['scenarios']])

def place(b, s, y1noi, pl=None):
    """OpCo / PropCo: value the business with market rent in its costs, the property from Year-1 NOI (or an appraisal), and the four sale choices.
    s = the deal's inputs (exitCap, saleCostPct, purchasePrice); y1noi = Year-1 NOI after reserves from the independent deal model."""
    import copy
    pl = dict(pl if pl is not None else b.get('place', {})); g = lambda k, d=0.0: d if pl.get(k) in (None, '') else pl[k]
    idx = next((i for i, o in enumerate(b['opex']) if 'rent' in o['name'].lower()), -1)
    mr = g('marketRent'); paid = g('rentPaid', b['opex'][idx]['annual'] if idx >= 0 else 0.0)
    inc = g('rentIncludedInNOI'); broker = g('brokerPct', 0.10); bt = g('bizTaxRate', 0.20); pt = g('propTaxRate', 0.25)
    bb = g('bizBasis'); pb = g('propBasis', s['purchasePrice']); bundle = g('bundlePct'); pv = g('propertyValue')
    td = b['dcf'].get('tvDiscount', 'workbook')
    P = pnl(b); asis = dcf(b, P, tv_discount=td)
    nb = copy.deepcopy(b)
    if idx >= 0: nb['opex'][idx]['annual'] = mr
    elif mr > 0: nb['opex'].append(dict(name='Rent (market, normalised)', annual=mr, cls='Fixed'))
    Pn = pnl(nb); nd = dcf(nb, Pn, tv_discount=td)
    case = ['bear', 'base', 'bull'][b['dcf']['case'] - 1]; comp = b['dcf']['cases'][case]['comp']
    cap = s['exitCap']; uplift = mr - inc; base = pv if pv > 0 else (y1noi / cap if cap > 0 else 0)
    propv = base + (uplift / cap if cap > 0 else 0); sc_ = s.get('saleCostPct') or 0.02
    y1 = Pn['years'][1]; ebitdar = y1['revenue'] - (y1['opex'] - mr) - comp; cov = ebitdar / mr if mr > 0 else None
    ev = nd['ev']; bnet = ev * (1 - broker); btax = max(0, bnet - bb) * bt; pnet = propv * (1 - sc_); ptax = max(0, pnet - pb) * pt
    bB = ev * (1 + bundle) * (1 - broker); pB = propv * (1 + bundle) * (1 - sc_); both = max(0, bB - bb) * bt + max(0, pB - pb) * pt
    def sc(name, cash, tax, ret): return dict(name=name, cashPre=cash, tax=tax, totalAfterTax=cash - tax + ret)
    return dict(bizEV=ev, asIsEV=asis['ev'], rentNormalisation=ev - asis['ev'], propValue=propv, rentCoverage=cov, ebitdar=ebitdar,
        scenarios=[sc('Hold both', 0, 0, ev + propv), sc('Sell the business, keep the property', bnet, btax, propv), sc('Sell the property, keep the business', pnet, ptax, ev),
                   sc('Sell both', bB + pB, both, 0)])

def model(b, **opts):
    P = pnl(b)
    return dict(pnl=P, ke=cost_of_equity(b['rate']), wacc=wacc(b['rate']), dcf=dcf(b, P, **opts), cases={c: dcf(b, P, case=c, **opts) for c in ('bear', 'base', 'bull')}, sens=sensitivities(b, P), valuation=valuation(b, P))

if __name__ == '__main__':
    b = json.load(open(os.path.join(HERE, 'real', 'punchlist_inputs.json'))); e = json.load(open(os.path.join(HERE, 'real', 'punchlist_expected.json')))
    m = model(b); P = m['pnl']; D = m['dcf']; fails = []; n = 0
    def eq(name, a, x, tol=1e-6):
        global n; n += 1
        if not abs(a - x) <= tol * max(1.0, abs(x)): fails.append(f'{name}: {a} vs workbook {x}')
    eq('weighted avg project value', P['tiers']['wValue'], e['wValue']); eq('weighted revenue per job', P['tiers']['wRevJob'], e['wRevJob']); eq('break-even jobs / yr', P['breakEven']['jobsYear'], e['beJobs'])
    for k, y in enumerate(P['years']):
        eq(f"P&L revenue {y['label']}", y['revenue'], e['rev'][k]); eq(f"P&L opex {y['label']}", y['opex'], e['opex'][k]); eq(f"P&L EBITDA {y['label']}", y['ebitda'], e['ebitda'][k])
    eq('cost of equity', m['ke'], e['coe']); eq('WACC', m['wacc'], e['wacc'])
    for k, r in enumerate(D['rows']): eq(f'UFCF {2026 + k}', r['fcf'], e['ufcf'][k]); eq(f'PV of FCF {2026 + k}', r['pv'], e['pv'][k])
    for nm, a, x in (('TV perpetuity', D['tvPerp'], e['tvPerp']), ('TV exit multiple', D['tvMult'], e['tvMult']), ('TV selected', D['tvSel'], e['tvSel']), ('PV of TV', D['pvTV'], e['pvTV']),
                     ('sum PV FCF', D['sumPV'], e['sumPV']), ('enterprise value', D['ev'], e['ev']), ('equity value', D['equity'], e['eq']), ('equity, perpetuity only', D['eqPerp'], e['eqPerp']), ('equity, exit multiple only', D['eqMult'], e['eqMult'])):
        eq(nm, a, x)
    S = m['sens']
    for i in range(5):
        for j in range(5):
            eq(f'sensitivity 1 [{i}][{j}]', S['s1'][i][j], e['sens1'][i][j + 1]); eq(f'sensitivity 2 [{i}][{j}]', S['s2'][i][j], e['sens2'][i][j + 1]); eq(f'sensitivity 3 [{i}][{j}]', S['s3'][i][j], e['sens3'][i][j + 1])
    V = m['valuation']
    for k in range(10): eq(f'10-year revenue {2026 + k}', V['rev'][k], e['ext']['rev'][k]); eq(f'10-year EBITDA {2026 + k}', V['ebitda'][k], e['ext']['ebitda'][k]); eq(f'10-year EV {2026 + k}', V['ev'][k], e['ext']['ev'][k])
    for k, s in enumerate(V['scenarios']): eq(f"scenario EV {s['name']}", s['ev'], e['scen'][k])
    print(f'{n} checks against the workbook, {len(fails)} failures')
    for f in fails[:20]: print('FAIL', f)
    sys.exit(1 if fails else 0)
