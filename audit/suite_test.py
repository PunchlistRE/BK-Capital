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
import dev_audit, macrs_ref as MR, credit_ref as CR, re
from datetime import date

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
        if tag.startswith('REAL-'):
            t = json.load(open(os.path.join(HERE, 'real', 'real_deals.json')))
            rd = next(x for x in t if x['id'] == tag); tg = rd['targets']
            close(f'{tag} tie-out: Year-1 statement NOI = T-12 NOI', r['stmtNOI'], tg['t12noi'], 1.0)
            close(f'{tag} tie-out: price = T-12 NOI / market cap', r['s']['purchasePrice'], tg['t12noi'] / tg['capRate'], 1.0)
            close(f'{tag} tie-out: gross rent = Yardi residential rent lines', r['s']['avgRent'] * r['s']['units'] * 12, tg['annualRent'], 0.5)
            close(f'{tag} tie-out: other income = Yardi other income lines', r['s']['otherIncomePerUnit'] * r['s']['units'], tg['otherIncome'], 0.5)
            stmt = tg['statementNetIncome'] + tg['mortgageInterest']
            close(f"{tag} tie-out: line-item NOI within 0.5% of the Yardi statement's NET INCOME + mortgage interest", abs(r['stmtNOI'] - stmt) / stmt, 0.0, 0.005)
        if r.get('credit'):
            cr = r['credit']; inp = cr['input']; gcfg = (inp['policy'] or {}).get('gates') or {}
            ref = CR.check(r['s'], inp['policy'], inp['ic'], gcfg)
            cp = cr['capacity']; cu = cr['cushions']
            for row in cp['rows']: close(f"{tag} capacity: {row['name']}", row['max'], ref['caps'][row['name']], 0.5)
            close(f'{tag} capacity: binding constraint', cp['binding'], ref['binding'], 0); close(f'{tag} capacity: maximum supportable debt', cp['capacity'], ref['capacity'], 0.5)
            close(f'{tag} capacity: overage vs request', cp['overage'], ref['overage'], 0.5); close(f'{tag} capacity: headroom to next constraint', cp['headroom'], ref['headroom'], 0.5)
            close(f'{tag} capacity: highest coupon holding min DSCR', cp['maxCoupon'], ref['maxCoupon'], 1e-9)
            for k, kk in (('dscr', 'dscr'), ('debtYield', 'debtYield'), ('ltv', 'ltv'), ('ltc', 'ltc'), ('stressedDscr', 'stressedDscr')): close(f'{tag} credit box: {k}', cp['box'][k], ref[kk], 1e-9)
            close(f'{tag} cushion: exit cap cushion (bps)', cu['exitCapCushionBps'] if cu['exitCapCushionBps'] != 'NaN' else float('nan'), ref['exitCapCushion'] if ref['exitCapCushion'] is not None else float('nan'), 1e-4)
            close(f'{tag} cushion: downside IRR', cu['irrDownside'], ref['irrDown'], 1e-6); close(f'{tag} cushion: upside IRR', cu['irrUpside'], ref['irrUp'], 1e-6)
            close(f'{tag} cushion: break-even occupancy', cu['breakEvenOccupancy'], ref['beOcc'], 1e-7)
            close(f'{tag} cushion: NOI tolerance Y1', cu['noiTolerance1'], ref['noiTol1'], 1e-7); close(f'{tag} cushion: NOI tolerance stabilised', cu['noiTolerance3'], ref['noiTol3'], 1e-7)
            close(f'{tag} cushion: break-even rent', cu['breakEvenRent'], ref['beRent'], 1e-3); close(f'{tag} cushion: rent cushion', cu['rentCushion'], ref['rentCush'], 1e-7)
            for row in cr['rows']:
                if row['id'] in ref['gate']: close(f"{tag} gate {row['id']}: result", row['result'], ref['gate'][row['id']], 0)
            close(f'{tag} gate: weighted score', cr['score'], ref['score'], 1e-9); close(f'{tag} gate: hard exceptions', cr['hard'], ref['hard'], 0)
            close(f'{tag} gate: soft exceptions', cr['soft'], ref['soft'], 0); close(f'{tag} gate: verdict', cr['verdict'], ref['verdict'], 0)
            for row in cr['rows']:
                if row['id'] in ref['gateValues'] and ref['gateValues'][row['id']] is not None and row['value'] != 'NaN' and row['value'] is not None:
                    close(f"{tag} gate {row['id']}: underwritten value", row['value'], ref['gateValues'][row['id']], 1e-6 if row['id'] not in ('capacity','exitCush') else 0.5)
            golden[tag + ':credit'] = dict(verdict=cr['verdict'], score=cr['score'], hard=cr['hard'], soft=cr['soft'], capacity=cp['capacity'], binding=cp['binding'], overage=cp['overage'],
                                           exitCushion=cu['exitCapCushionBps'], beOcc=cu['breakEvenOccupancy'], noiTol3=cu['noiTolerance3'], rentCushion=cu['rentCushion'], irrDown=cu['irrDownside'], irrUp=cu['irrUpside'])
        if r.get('tax') and r['tax']['src'] == 'macrs-tax-grade':
            tx = r['tax']; i = tx['input']; st = i['settings']
            land = (i['price'] * float(st.get('landPct') or 0)) if st.get('landMethod', 'percent') == 'percent' else float(st.get('landDollar') or 0)
            dep_basis = max(0.0, i['price'] - land + float(st.get('capex') or 0))
            base_life = float(st['baseLife']) if st.get('baseLife') else (27.5 if re.search('resident|multifamily|apartment', i['ptype'] or '', re.I) else 39.0)
            placed = MR.parse(st.get('placedInService') or st.get('closeDate') or i['close'])
            specs = MR.build_lines(st, i['components'], dep_basis, base_life)
            kw = dict(months=[dict(date=MR.parse(m['date']), noi=m['noi'], interest=m['interest'], cf=m['cf']) for m in i['months']], close_date=MR.parse(i['closeDt']),
                      eq0=i['eq0'], net_sale=i['netSale'], total_basis=i['totalBasis'], tax_rate=float(i['taxRate']), cg_rate=float(i['capGainsRate']), recap_rate=float(i['depRecaptureRate']))
            ref = MR.after_tax(st, specs, placed, fee=i['fee'], **kw)
            for a_, b_ in zip(tx['rows'], ref['rows']):
                close(f"{tag} tax {a_['taxYear']} depreciation", a_['depr'], b_['depr'], 0.01); close(f"{tag} tax {a_['taxYear']} taxable income", a_['taxable'], b_['taxable'], 0.01)
                close(f"{tag} tax {a_['taxYear']} tax due", a_['tax'], b_['tax'], 0.01)
            close(f'{tag} tax: years', len(tx['rows']), len(ref['rows']), 0)
            close(f'{tag} tax: sale tax', tx['saleTax'], ref['sale_tax'], 0.01); close(f'{tag} tax: ordinary (Sec.1245) recapture base', tx['ordBase'], ref['ord'], 0.01)
            close(f'{tag} tax: unrecaptured Sec.1250 base', tx['unrecBase'], ref['unrec'], 0.01); close(f'{tag} tax: capital gain base', tx['capBase'], ref['cap'], 0.01)
            close(f'{tag} tax: accumulated depreciation', tx['accumDepr'], ref['accum'], 0.01)
            close(f'{tag} tax: after-tax IRR', tx['atIRR'], ref['irr'], 1e-7); close(f'{tag} tax: after-tax MOIC', tx['atMOIC'], ref['moic'], 1e-9)
            if st.get('costSeg') and tx.get('benefit'):
                bn = tx['benefit']; wo = MR.after_tax(st, [dict(basis=dep_basis, life=base_life, bonus=False, convention='MM', method='SL', placed=None)], placed, fee=0.0, **kw)
                close(f'{tag} benefit: baseline Year-1 depreciation', bn['base1'], wo['rows'][0]['depr'], 0.01); close(f'{tag} benefit: Year-1 depreciation', bn['y1'], ref['rows'][0]['depr'], 0.01)
                close(f'{tag} benefit: without-cost-seg after-tax IRR', bn['irrWithout'], wo['irr'], 1e-7)
                close(f'{tag} benefit: extra sale tax', bn['extraSale'], ref['sale_tax'] - wo['sale_tax'], 0.01)
                close(f'{tag} benefit: Year-1 tax savings', bn['y1save'], (ref['rows'][0]['depr'] - wo['rows'][0]['depr']) * float(i['taxRate']), 0.01)
                accel = sum(s_['basis'] for s_ in specs if s_['life'] < 27.5)
                close(f'{tag} benefit: workbook-style savings (accelerated basis x rate)', bn['wbSavings'], accel * float(i['taxRate']), 0.01)
            golden[tag + ':tax'] = {k_: tx[k_] for k_ in ['atIRR', 'atMOIC', 'saleTax', 'accumDepr', 'ordBase', 'unrecBase', 'capBase']}
            if tag == 'HARVARD':
                # tie to Cost_Segregation_Harvard.xlsx
                close('HARVARD workbook: 2025 bonus + regular (5/15-yr classes) = Year-1 accelerated deduction', tx['benefit']['accel'], 601581.5105427032 + 605477.3796771151, 0.01)
                close('HARVARD workbook: 2025 tax savings (accelerated basis x 37%)', tx['benefit']['wbSavings'], 446611.7893813329, 0.01)
                close('HARVARD workbook: payback ratio (savings / $5,000 fee)', tx['benefit']['wbPayback'], 446611.7893813329 / 5000, 1e-6)
                close('HARVARD workbook: 39-yr straight-line per full year', tx['rows'][1]['depr'], 108010.91054052017, 0.01)
                close('HARVARD workbook: depreciable basis', tx['accumDepr'] > 0 and sum(s_['basis'] for s_ in specs), 5419484.4013, 0.01)
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
