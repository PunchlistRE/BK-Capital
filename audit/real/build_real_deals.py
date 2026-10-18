"""Builds app-ready deal inputs from the Yardi benchmark workbook's T-12 LINE ITEMS (the source of truth).
Rules:
  NOI            = sum of income lines - sum of operating expense lines (Yardi as reported)
  purchase price = NOI / market cap rate (the Property Summary's cap rate)
Operating expenses exclude debt service (mortgage interest / principal), owner distributions and scan junk. A scanned line is corrected
(its months sum, a moved decimal point, a flipped sign) only if that makes its section foot to the section's own printed total.
The result is cross-checked against the statement's own totals (NET INCOME + mortgage interest) and every correction and
non-recurring item is listed in `flags`.
    python3 audit/real/build_real_deals.py <workbook.xlsm> audit/real/real_deals.json
"""
import json, math, re, sys, openpyxl

wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
summ = {r[0]: r for r in wb['Property Summary'].iter_rows(min_row=2, values_only=True) if r[0]}
RES = ['ShorePointe', 'Glenbrook Commons', 'Wall Street Manor', 'Elmcrest Manor', 'Rowayton Gardens', '71 Haviland']
clean = lambda x: str(x).replace('‘', '').replace('’', '').replace('|', '').strip()
NOT_OPEX = re.compile(r'^(total|net income|cash flow|mortgage|tuesday|distribution)', re.I)
GROUPS = [  # first match wins
    ('taxes',     r'^property tax|real estate tax|^sewer tax'),
    ('insurance', r'^(building )?insurance'),
    ('mgmt',      r'management fee|owner management|residential manag'),
    ('utilities', r'electric|^gas$|water|sewer|trash|cable'),
    ('turnover',  r'turn ?over|make.?ready|painting|carpet|floor'),
    ('payroll',   r'in.?house|payroll|salary'),
    ('marketing', r'broker|referral|marketing|advert'),
    ('rm',        r'repair|maint|plumbing|appliance|hvac|pest|equipment|generator|irrigation|landscap|snow|lawn|elevator|cleaning|fire|security equip|cell monitoring'),
]
NONRECURRING = re.compile(r'bank interest|insurance claim|broker fee|security deposit interest|estimated future tax|partnership return|sales tax|settlement|incentive', re.I)

SECTIONS = [  # (section prefix, printed-total label, is_expense)
    ('Residential Rent', 'TOTAL RESIDENTIAL RENT'), ('Other Property', 'TOTAL OTHER PROPERTY'),
    ('Property Exp', 'TOTAL PROPERTY EXP'), ('Office Exp', 'TOTAL OFFICE EXPENSES')]

def candidates(r):
    """Alternative readings of one scanned line: the sum of its own months, the printed figure with the decimal
    point moved, or its sign flipped. Only ever used if it closes the section's own printed total."""
    v = float(r[16]); ms = [m for m in r[2:16] if isinstance(m, (int, float))]; c = []
    if ms and sum(ms) != v: c.append(('months sum', sum(ms)))
    for k in (-3, -2, -1, 1, 2, 3): c.append((f'decimal point moved x10^{k}', v * 10 ** k))
    if v: c.append(('sign flipped', -v))
    return c

def reconcile_sections(rows, mortgage_interest, flags):
    """Returns {id(row): corrected value}. A line is corrected only when that makes its section foot to the section's
    printed total (to within 0.05%); otherwise the lines are kept and the mismatch is flagged."""
    fix = {}
    for sec, tot in SECTIONS:
        L = [r for r in rows if str(r[0]).startswith(sec) and not re.match(r'^(total|net income|tuesday|distribution)', clean(r[1]), re.I)]
        T = next((r[16] for r in rows if clean(r[1]).upper().startswith(tot)), None)
        if T is None or not L: continue
        if sec == 'Office Exp': T = T - mortgage_interest      # Yardi prints debt interest inside office expenses
        tol = max(25.0, 0.0005 * abs(T)); gap = sum(r[16] for r in L) - T
        if abs(gap) <= max(tol, 0.002 * abs(T)): continue
        best = None
        for r in L:
            for how, nv in candidates(r):
                ng = gap - r[16] + nv
                if abs(ng) <= tol and (best is None or abs(ng) < best[0]): best = (abs(ng), r, how, nv)
        if best:
            _, r, how, nv = best; fix[id(r)] = nv
            flags.append(f"scan error corrected: '{clean(r[1])}' printed ${r[16]:,.2f} -> ${nv:,.2f} ({how}); this makes the {sec} section foot to its printed total")
        else:
            flags.append(f"{sec} lines (${sum(r[16] for r in L):,.0f}) do not foot to the printed section total (${T:,.0f}, gap ${gap:,.0f}) and no single-line scan error explains it: lines kept as printed")
    return fix

out = []
for name in RES:
    S = summ[name]; units, sf, cap = int(S[2]), int(S[3]), float(S[8])
    rows = [r for r in wb[name].iter_rows(min_row=18, values_only=True) if r[0] and r[1] and isinstance(r[16], (int, float))]
    flags = []; inc = {'rent': 0.0, 'other': 0.0}; grp = {g: 0.0 for g, _ in GROUPS}; grp['ga'] = 0.0; nonrec = []
    reported = {clean(r[1]).upper(): r[16] for r in rows}
    mi0 = reported.get('MORTGAGE INTEREST', 0.0)
    fix = reconcile_sections(rows, mi0, flags)
    for r in rows:
        sec, lab = str(r[0]), clean(r[1])
        if re.match(r'^(total|net income)', lab, re.I): continue
        v = fix.get(id(r), float(r[16]))
        if sec.startswith('Residential Rent'): inc['rent'] += v
        elif sec.startswith(('Other Property', 'Commercial')): inc['other'] += v
        elif sec.startswith(('Property Exp', 'Office Exp')) and not NOT_OPEX.match(lab):
            g = next((g for g, pat in GROUPS if re.search(pat, lab, re.I)), 'ga'); grp[g] += v
        if NONRECURRING.search(lab) and abs(v) > 0: nonrec.append(f'{lab} ${v:,.0f}')
    egi = inc['rent'] + inc['other']; opex = sum(grp.values()); noi = egi - opex
    rep_ni = next((v for k, v in reported.items() if k.startswith('NET INCOME')), None); mi = reported.get('MORTGAGE INTEREST', 0.0)
    gap = noi - (rep_ni + mi) if rep_ni is not None else None
    flags.append(f"cross-check: income ${egi:,.0f} - operating expenses ${opex:,.0f} = NOI ${noi:,.0f}; statement NET INCOME ${rep_ni:,.0f} + mortgage interest ${mi:,.0f} = ${rep_ni + mi:,.0f} (difference ${gap:,.0f}, {gap / (rep_ni + mi):+.1%})")
    flags.append(f"summary sheet T-12 NOI ${float(S[6]):,.0f} is NOT used (it differs from the line items by {(float(S[6]) - noi) / noi:+.0%})")
    if nonrec: flags.append('left in NOI as reported by Yardi, but non-recurring / non-operating in nature: ' + '; '.join(nonrec))
    price = round(noi / cap)
    mgmt_pct = grp['mgmt'] / egi
    deal = dict(dealId='REAL-' + str(len(out) + 1), name=name, dealType='Acquisition', propertyType='Multifamily', status='Pipeline', closing='1/1/2027',
        units=units, gsf=sf, commercialArea=0, purchasePrice=price, t12noi=round(noi, 2), avgRent=inc['rent'] / units / 12, otherIncomePerUnit=inc['other'] / units,
        vacancy=0, badDebtPct=0, mgmtPct=mgmt_pct, taxes=round(grp['taxes'], 2), insurance=round(grp['insurance'], 2), utilities=round(grp['utilities'], 2), rm=round(grp['rm'], 2),
        contract=0, payroll=round(grp['payroll'], 2), turnover=round(grp['turnover'], 2), marketing=round(grp['marketing'], 2), ga=round(grp['ga'], 2), reserves=0,
        exitCap=cap, holdYears=5, occupancy=1, rentGrowth=0.03, otherGrowth=0.02, opexGrowth=0.03, taxGrowth=0.02, commercialRentGrowth=0, closingCostsPct=0.02, saleCostPct=0.02, miscPerGSF=0)
    stmt_exp = sum(deal[k] for k in ['taxes', 'insurance', 'utilities', 'rm', 'contract', 'payroll', 'turnover', 'marketing', 'ga']) + mgmt_pct * egi
    deal['ga'] = round(deal['ga'] + (opex - stmt_exp), 2)     # cents of rounding only
    stmt_exp = sum(deal[k] for k in ['taxes', 'insurance', 'utilities', 'rm', 'contract', 'payroll', 'turnover', 'marketing', 'ga']) + mgmt_pct * egi
    out.append(dict(id=deal['dealId'], property=name, deal=deal, flags=flags,
                    targets=dict(t12noi=noi, capRate=cap, impliedValue=price, annualRent=inc['rent'], otherIncome=inc['other'], operatingExpenses=opex, expectedYear1NOI=egi - stmt_exp,
                                 statementNetIncome=rep_ni, mortgageInterest=mi, gapToStatement=gap, summarySheetNOI=float(S[6])),
                    source=f"Yardi T-12 line items on the '{name}' tab; cap rate from the Property Summary"))
json.dump(out, open(sys.argv[2], 'w'), indent=1)
for o in out:
    t = o['targets']; print(f"{o['id']} {o['property']:18} NOI ${t['t12noi']:>9,.0f}  cap {t['capRate']:.2%}  price ${t['impliedValue']:>10,}  vs statement {t['gapToStatement']:>+8,.0f} ({t['gapToStatement']/(t['statementNetIncome']+t['mortgageInterest']):+.1%})  [summary NOI was {t['summarySheetNOI']:,.0f}]")
    for f in o['flags']:
        if f.startswith('scan error'): print('      ', f)
