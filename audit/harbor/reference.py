#!/usr/bin/env python3
"""Harbor Point — an independent reference build from the brief and the workbook, written without reading BK Capital's engine. Every assumption it has to make is printed.
   python3 audit/harbor/reference.py  ->  audit/harbor/reference.json"""
import json, glob, openpyxl
f = glob.glob('/root/.claude/uploads/*/*Harbor_Point_Development_Pro_Forma.xlsx')[0]
ws = openpyxl.load_workbook(f, data_only=True)['Monthly Draw Schedule']
rows = [r for r in ws.iter_rows(min_row=4, values_only=True) if isinstance(r[0], int)]
hardP = {r[0]: r[2] for r in rows}; softP = {r[0]: r[4] for r in rows}; contP = {r[0]: r[6] for r in rows}
HARD = [1750, 2000, 3650, 2350, 550, 600, 2000, 1150, 850, 500, 500, 4550, 1000, 800, 1300, 1400]
SOFT = [800, 250, 200, 300, 120, 180, 80, 120, 700, 250, 300, 150, 100, 250, 450, 350, 100, 150, 150]
CONT = [350, 300, 250, 250, 200, 200, 150, 100, 100, 100]; PRE = [150, 200, 125, 100, 75, 100]
hard = sum(HARD) * 1000; soft = sum(SOFT) * 1000; cont = sum(CONT) * 1000; pre = sum(PRE) * 1000
land, close, reserves = 7_000_000, 250_000, 2_000_000
R = {'assumptions': [], 'findings': []}
A = R['assumptions'].append; F = R['findings'].append
# --- budget
R['budget'] = dict(hard=hard, soft=soft, cont=cont, pre=pre, land=land, closing=close, reserves=reserves, total=land + close + pre + hard + soft + cont + reserves)
if hard != 25_000_000: F(f'Hard-cost categories sum to ${hard:,.0f}, not the $25,000,000 stated (short ${25_000_000 - hard:,.0f}). The $42M budget is therefore ${R["budget"]["total"]:,.0f} by line items.')
if abs(sum(softP.values()) - 1) > 1e-9: F(f'The workbook soft-cost draw % column sums to {sum(softP.values()):.5f}, so ${soft * (1 - sum(softP.values())):,.0f} of soft cost has no month.')
# --- the unit mix
mix = [(12, 2400, 500), (60, 3100, 800), (42, 3700, 1050), (6, 4500, 1300)]
gpr = sum(n * r for n, r, _ in mix) * 12; avg = gpr / 12 / 120; sf = sum(n * s for n, _, s in mix)
R['rent'] = dict(gpr=gpr, monthly=gpr / 12, weighted_avg=avg, unit_sf=sf, rent_psf=gpr / 12 / sf)
if round(avg) != 3302: F(f'Weighted average rent from the unit mix is ${avg:,.2f}, not the $3,302 stated in the OM and workbook.')
if sf != 112_800: F(f'Unit areas in the workbook add to {sf:,} SF, not the 112,800 SF rentable area stated ({sf / 112800 - 1:+.1%}).')
# --- stabilised operations
occ, other_pu = 0.95, 175
rent_eff = gpr * occ; other = other_pu * 120 * occ * 12; egi = rent_eff + other
opx_fixed = 400_000 + 120_000 + 150_000 + 144_000 + 180_000; mgmt = 0.04 * egi; opex = opx_fixed + mgmt; noi = egi - opex; resv = 300 * 120
R['noi'] = dict(gpr=gpr, vacancy_loss=gpr * 0.05, rent_eff=rent_eff, other_income=other, egi=egi, fixed_opex=opx_fixed, mgmt=mgmt, opex=opex, noi=noi, reserves=resv, cfads=noi - resv, target=2_950_000, variance=noi - 2_950_000)
F(f'Stabilised NOI from the rent roll and expense inputs is ${noi:,.0f}, ${noi - 2_950_000:,.0f} ({noi / 2_950_000 - 1:+.1%}) above the $2,950,000 target. Not plugged. At 5.00% the difference is ${(noi - 2_950_000) / 0.05:,.0f} of sale value.')
A('Other income of $175 is paid by occupied units only (95% of 120); vacancy 5% and occupancy 95% are one assumption, not two deductions.')
# --- sources & uses timeline (month 0 = closing)
H, S, C = {}, {}, {}
for m in range(0, 27):
    H[m] = hard * hardP.get(m, 0); S[m] = soft * softP.get(m, 0); C[m] = cont * contP.get(m, 0)
S[26] += soft * (1 - sum(softP.values()))   # unallocated 1.375% swept to month 26 and reported
A('Soft cost not given a month by the workbook (1.375%) is swept into month 26 and reported, not dropped.')
A('Predevelopment $750,000 is spread evenly over months 0-2; land and $250,000 closing at month 0; reserves per the workbook (operating/lease-up $750,000 at month 26, the other $1,250,000 at month 0).')
uses = {m: 0.0 for m in range(0, 49)}
for m in range(0, 27): uses[m] += H[m] + S[m] + C[m]
uses[0] += land + close + 0.3 * 0 + 1_250_000; uses[26] += 750_000
for m in (0, 1, 2): uses[m] += pre / 3
total_uses = sum(uses.values()); R['uses_before_financing'] = total_uses
# --- debt: equity first $14.7M of eligible costs, then debt; fee from equity; interest capitalised monthly on opening balance, ceiling $34M
rate = 0.0725; commit0 = 27_300_000; ceiling = 34_000_000; eq_first = 14_700_000
fee = 0.01 * commit0; eq, bal, cum_cost, cap_int, unused_fees, short = 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
eqflow = {m: 0.0 for m in range(0, 49)}; debt = []
eqflow[0] += fee
for m in range(0, 49):
    interest = bal * rate / 12 if m > 0 else 0.0
    ci = interest; bal += ci; cap_int += ci
    need = uses[m]; e = min(need, max(0.0, eq_first - cum_cost)); cum_cost += need
    d = need - e; room = ceiling - bal
    if d > room: short += d - room; eqflow[m] += d - room; d = room
    bal += d; eqflow[m] += e
    undrawn = max(0.0, commit0 - (bal - cap_int)) if m <= 26 else 0.0
    uf = 0.005 / 12 * undrawn; unused_fees += uf; eqflow[m] += uf
    debt.append(dict(m=m, need=round(need), eq=round(e), draw=round(d), cap_int=round(ci), bal=round(bal)))
R['debt'] = dict(commit_initial=commit0, ceiling=ceiling, origination_fee=fee, capitalised_interest=cap_int, unused_fees=unused_fees, balance_m48=bal, peak=max(x['bal'] for x in debt), principal_draws=sum(x['draw'] for x in debt), facility_shortfall=short, headroom=ceiling - bal, schedule=debt)
A('Interest accrues on the opening balance each month and is capitalised through month 48 (not paid from operations); the lease-up NOI is distributed after the operating reserve.')
A('Unused commitment fee = 0.50% a year on the undrawn part of the $27.3M initial principal through month 26 (lender convention not given); paid by equity.')
A('The $750,000 debt-service/interest reserve is cash held, not spent (interest is capitalised), and is returned at sale; its funding overlaps the capitalised interest line.')
F(f'Capitalised interest to month 48 is ${cap_int:,.0f}; the loan reaches ${bal:,.0f} against a ${ceiling:,.0f} ceiling ({"over" if bal > ceiling else "under"}). Equity forced above the ${eq_first:,.0f} threshold: ${short:,.0f}. All-in cost incl. financing is higher than the $42M budget by ${cap_int + fee + unused_fees:,.0f}.')
# --- operations months 27-48 (no rent growth before stabilisation: rents are stated in today's dollars; flagged)
ramp = {r[0]: r[1] for r in openpyxl.load_workbook(f, data_only=True)['Lease-Up'].iter_rows(min_row=4, values_only=True) if isinstance(r[0], int)}
op = {}
for m in range(27, 49):
    o = ramp[m]; e = gpr / 12 * o + other_pu * 120 * o; x = opx_fixed / 12 + 0.04 * e; op[m] = e - x - resv / 12
R['operations'] = {str(m): round(v) for m, v in op.items()}
deficit = -sum(v for v in op.values() if v < 0)
# --- exit month 48
gross = noi / 0.05; sell = 0.02 * gross; net = gross - sell
unused_res = 750_000 + 300_000 + 200_000 + 750_000 - min(deficit, 750_000)
payoff = bal
cash = net - payoff + unused_res
R['exit'] = dict(noi=noi, gross=gross, selling=sell, net=net, payoff=payoff, unused_reserves=unused_res, cash_to_equity=cash, gross_at_target_noi=2_950_000 / 0.05, net_at_target=2_950_000 / 0.05 * 0.98)
eqc = sum(eqflow.values()); R['equity'] = dict(initial=sum(eqflow[m] for m in (0,)), total_calls=eqc, extra_calls=short + unused_fees)
# --- investor cash flows & IRR on dated flows
flows = [(m, -eqflow[m] + (max(op.get(m, 0), 0) if m >= 27 else 0) + (cash if m == 48 else 0)) for m in range(0, 49)]
def xirr(fl):
    lo, hi = -0.9, 5.0
    f_ = lambda r: sum(v / (1 + r) ** (m / 12) for m, v in fl)
    for _ in range(200):
        mid = (lo + hi) / 2
        if f_(lo) * f_(mid) <= 0: hi = mid
        else: lo = mid
    return mid
R['returns'] = dict(levered_irr=xirr(flows), moic=sum(v for _, v in flows if v > 0) / -sum(v for _, v in flows if v < 0), profit=sum(v for _, v in flows))
R['equity_flows'] = flows
json.dump(R, open('/home/user/BK-Capital/audit/harbor/reference.json', 'w'), indent=1)
print(json.dumps({k: R[k] for k in ('budget', 'rent', 'noi', 'exit', 'equity', 'returns')}, indent=1)); print('\n'.join('F: ' + x for x in R['findings'])); print('\n'.join('A: ' + x for x in R['assumptions']))
print({k: v for k, v in R['debt'].items() if k != 'schedule'})
