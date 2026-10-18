"""Builds app-ready deal inputs from the Yardi benchmark workbook (Property Summary + T-12 line items).
Rules (as instructed): NOI = the property's T-12 NOI; purchase price = T-12 NOI / market cap rate.
Expense lines come from the T-12 line items, grouped into the app's categories and scaled uniformly so the
Year-1 statement reproduces the T-12 NOI exactly. Everything the scan could not support is recorded in `flags`.
    python3 audit/real/build_real_deals.py <workbook.xlsm> audit/real/real_deals.json
"""
import json, re, sys, openpyxl

wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
summ = {r[0]: r for r in wb['Property Summary'].iter_rows(min_row=2, values_only=True) if r[0]}
RES = ['ShorePointe', 'Glenbrook Commons', 'Wall Street Manor', 'Elmcrest Manor', 'Rowayton Gardens', '71 Haviland']
SKIP = re.compile(r'^(total|net income|cash flow|mortgage|tuesday|rent roll|taxes - sales|security deposit|annual llc)', re.I)
GROUPS = [  # first match wins; order matters
    ('taxes',     r'property tax|real estate tax'),
    ('insurance', r'^insurance'),
    ('mgmt',      r'management fee|owner management'),
    ('utilities', r'electric|^gas$|water|sewer|trash|cable'),
    ('turnover',  r'turn ?over|make.?ready|painting|carpet|floor'),
    ('payroll',   r'in.?house|payroll|salary|super'),
    ('marketing', r'broker|referral|marketing|advert'),
    ('rm',        r'repair|maint|plumbing|appliance|hvac|pest|equipment|generator|irrigation|landscap|snow|lawn|elevator|cleaning|fire'),
]
out = []
for name in RES:
    S = summ[name]; units, sf, rent, noi, cap, vac = int(S[2]), int(S[3]), float(S[4]), float(S[6]), float(S[8]), float(S[9])
    price = round(noi / cap)
    rows = [r for r in wb[name].iter_rows(min_row=18, values_only=True) if r[0] and r[1] and isinstance(r[16], (int, float))]
    grp = {g: 0.0 for g, _ in GROUPS}; grp['ga'] = 0.0; flags = []
    for r in rows:
        if 'Expense' not in str(r[0]) and 'Office' not in str(r[0]): continue
        lab = str(r[1]).replace('‘', '').strip(); v = float(r[16])
        if SKIP.search(lab) or 'Debt' in str(r[0]): continue
        g = next((g for g, pat in GROUPS if re.search(pat, lab, re.I)), 'ga'); grp[g] += v
    egi = rent * (1 - vac)
    target_exp = egi - noi                                   # what the T-12 NOI implies
    mgmt = grp.pop('mgmt'); mgmt_pct = min(0.10, max(0.0, mgmt / egi)) if egi else 0
    taxes = grp.pop('taxes')
    fixed = taxes + mgmt_pct * egi
    scalable = {g: v for g, v in grp.items()}; base = sum(scalable.values())
    room = target_exp - fixed
    if taxes <= 0 or taxes > 0.6 * target_exp:
        flags.append(f'property tax line ${taxes:,.0f} not credible against ${target_exp:,.0f} total expenses; tax taken as 25% of expenses')
        taxes = 0.25 * target_exp; fixed = taxes + mgmt_pct * egi; room = target_exp - fixed
    k = room / base if base > 0 else 0
    line_total = fixed + base
    if base <= 0 or not (0.5 <= k <= 2.0):
        flags.append(f'expense lines scaled by x{k:.2f} to tie to T-12 NOI (outside 0.5-2.0: line items unreliable)')
    else:
        flags.append(f'expense lines scaled by x{k:.2f} to tie to T-12 NOI')
    # reconcile the workbook's own totals to its summary NOI
    tot = {str(r[1]).strip().upper(): r[16] for r in rows}
    ni = next((v for kk, v in tot.items() if kk.startswith('NET INCOME')), None)
    if ni is not None: flags.append(f"workbook line-item NET INCOME ${ni:,.0f} vs summary T-12 NOI ${noi:,.0f} ({(ni-noi)/noi:+.0%}): line items do not reconcile to the summary")
    deal = dict(dealId='REAL-' + str(len(out) + 1), name=name, dealType='Acquisition', propertyType='Multifamily', status='Pipeline', closing='1/1/2027',
        units=units, gsf=sf, commercialArea=0, purchasePrice=price, t12noi=round(noi, 2), avgRent=rent / units / 12, otherIncomePerUnit=0, vacancy=vac, badDebtPct=0,
        mgmtPct=round(mgmt_pct, 6), taxes=round(taxes, 2), insurance=round(scalable.get('insurance', 0) * k, 2), utilities=round(scalable['utilities'] * k, 2), rm=round(scalable['rm'] * k, 2),
        contract=0, payroll=round(scalable['payroll'] * k, 2), turnover=round(scalable['turnover'] * k, 2), marketing=round(scalable['marketing'] * k, 2), ga=0, reserves=0,
        exitCap=cap, holdYears=5, occupancy=1 - vac, rentGrowth=0.03, otherGrowth=0.02, opexGrowth=0.03, taxGrowth=0.02, commercialRentGrowth=0, closingCostsPct=0.02, saleCostPct=0.02, miscPerGSF=0)
    # put rounding / leftover into G&A so the statement ties to the dollar
    stmt_exp = sum(deal[k_] for k_ in ['taxes','insurance','utilities','rm','contract','payroll','turnover','marketing','ga']) + deal['mgmtPct'] * egi
    deal['ga'] = round(target_exp - stmt_exp, 2)   # G&A absorbs its own scaled share plus rounding
    stmt_exp = sum(deal[k_] for k_ in ['taxes','insurance','utilities','rm','contract','payroll','turnover','marketing','ga']) + deal['mgmtPct'] * egi
    out.append(dict(id=deal['dealId'], property=name, deal=deal, targets=dict(t12noi=noi, capRate=cap, impliedValue=price, annualRent=rent, expectedYear1NOI=egi - stmt_exp), flags=flags,
                    source=f"Yardi benchmark workbook: Property Summary row '{name}' and the '{name}' tab"))
json.dump(out, open(sys.argv[2], 'w'), indent=1)
for o in out: print(o['id'], o['property'], f"price ${o['deal']['purchasePrice']:,}", f"NOI ${o['targets']['t12noi']:,.0f}", f"stmt ${o['targets']['expectedYear1NOI']:,.0f}", '|', o['flags'][0])
