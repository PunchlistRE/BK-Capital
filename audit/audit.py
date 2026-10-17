"""Independent rebuild of the BK Capital engine for a sample deal, compared to the app's own output."""
import json, sys, math
from datetime import date, datetime, timedelta
import calendar

d = json.load(open(sys.argv[1])); s = d['s']; app_u = d['u']; app_x = d['x']; app_w = d['w']; app_d = d['d']
N = lambda k: float(s.get(k) or 0)
results = []
def chk(name, mine, app, tol=0.01):
    ok = abs(mine - app) <= tol * max(1, abs(app)) * (1 if tol >= 1 else 1) if tol < 1 else abs(mine-app) <= tol
    results.append((name, mine, app, abs(mine-app) <= max(tol, 1e-9*abs(app)) ))

# ---------- 1. Year-1 operating statement (textbook) ----------
gpr = N('avgRent')*N('units')*12
vac = -gpr*N('vacancy'); bad = -gpr*N('badDebtPct')
other = N('otherIncomePerUnit')*N('units')
egi = gpr+vac+bad+other
mgmt = egi*N('mgmtPct')
fixed = sum(N(k) for k in ['taxes','insurance','utilities','rm','contract','payroll','turnover','marketing','ga']) + N('gsf')*N('miscPerGSF')
opex = fixed+mgmt; noi = egi-opex
c = d['calc']
for k,v in [('gpr',gpr),('egi',egi),('mgmt',mgmt),('total',opex),('noi',noi)]: chk('Y1 '+k, v, c[k])
chk('Going-in cap (T12 NOI / price)', N('t12noi')/N('purchasePrice'), c['goingIn'], 1e-12)

# ---------- 2. Debt ----------
def pmt(r,n,pv): return pv*r/(1-(1+r)**-n) if r else pv/n
acqFee = d['acqFee']
basis = N('purchasePrice')*(1+N('closingCostsPct')+acqFee)
value_app_method = noi/N('exitCap')
r = N('acqRate')/12; n = int(N('acqAmort')*12)
byLTV = N('acqLTV')*value_app_method; byLTC = N('acqLTC')*basis
byDSCR = (noi/N('acqDSCR'))/(pmt(r,n,1)*12)
loan = math.floor(min(byLTV,byLTC,byDSCR)/1000)*1000
P = pmt(r,n,loan)
chk('Acq basis', basis, app_d['basis']); chk('Loan', loan, app_d['loan']); chk('Monthly payment', P, app_d['pmt'])
bal = loan
for m in range(1,int(N('holdYears')*12)+1):
    i = bal*r; bal -= (P-i)
chk('Loan balance at sale', bal, app_d['debtAtSale'])
equity = basis + loan*N('acqOrigFee') - loan
chk('Equity required', equity, app_d['equity'])

# ---------- 3. Monthly engine, re-derived from its documented formulas ----------
H = int(round(N('holdYears')))*12
resOcc = 1-N('vacancy')
k_ctrl = sum(N(k) for k in ['rm','payroll','turnover','utilities','contract','marketing','ga'])+N('gsf')*N('miscPerGSF')
def month(m):
    g = lambda k: (1+N(k))**(m/12)
    gprm = gpr/12*g('rentGrowth'); res = gprm*resOcc; badm = -res*N('badDebtPct')
    oth = other/12*g('otherGrowth'); e = res+badm+oth
    ctrl = k_ctrl/12*g('opexGrowth')*(0.6+0.4*resOcc)
    ins = N('insurance')/12*g('opexGrowth')
    tax = N('taxes')/12*(1+N('taxGrowth'))**(math.ceil(m/12)-1)
    nb = e-ctrl-ins-tax-e*N('mgmtPct')
    return e, nb - N('reserves')/12*g('opexGrowth')
months = [month(m) for m in range(1,H+1)]
for y in range(len(app_u['arr'])):
    chk(f'CF Y{y+1} NOI after reserves', sum(mm[1] for mm in months[y*12:y*12+12]), app_u['arr'][y]['after'])
fwd = sum(month(m)[1] for m in range(H+1,H+13))
gross = fwd/N('exitCap'); net = gross*(1-N('saleCostPct'))
chk('Gross sale', gross, app_u['grossSale']); chk('Net sale', net, app_u['netSale'])

# ---------- 4. XIRR (independent bisection) ----------
def xirr(vals, dts):
    t0 = dts[0]; f = lambda rr: sum(v/(1+rr)**((t-t0).days/365) for v,t in zip(vals,dts))
    lo, hi = -0.99, 10
    for _ in range(300):
        mid=(lo+hi)/2
        if f(lo)*f(mid) <= 0: hi=mid
        else: lo=mid
    return (lo+hi)/2
close = date(2027,1,1)
def month_end(m):
    y = close.year + (close.month-1+m-1)//12; mo = (close.month-1+m-1)%12+1
    return date(y, mo, calendar.monthrange(y,mo)[1])
dts = [close]+[month_end(m) for m in range(1,H+1)]
uvals = [-basis]+[mm[1] for mm in months]; uvals[-1] += net
chk('Unlevered IRR', xirr(uvals,dts), app_u['irr'], 1e-6)
chk('Unlevered multiple', sum(v for v in uvals if v>0)/basis, app_u['moic'], 1e-9)

# levered: NOI(after reserves) - DS - asset mgmt fee; sale - payoff - disposition fee
lev = [-equity]
for m,(e,nn) in enumerate(months, start=1):
    cf = nn - P - e*N('assetMgmtPct')
    if m == H: cf += net - bal - gross*N('dispositionFeePct')
    lev.append(cf)
chk('Levered IRR', xirr(lev,dts), app_x['irr'], 1e-6)
chk('Levered multiple', sum(v for v in lev[1:] if v>0)/equity, app_x['moic'], 1e-6)

# ---------- 5. Waterfall checks ----------
w = app_w; tot_dist = sum(v for v in lev[1:] if v>0)
chk('Waterfall: LP+GP distributions = total equity distributions', w['lp']['dist']+w['gp']['dist'], tot_dist)
chk('Waterfall: LP+GP contributions = equity', w['lp']['contrib']+w['gp']['contrib'], equity)
gs = N('gpShare')
lpvals = [-equity*(1-gs)] + [r_['lpDist'] for r_ in w['rows']]
chk('LP IRR (recomputed from LP flows)', xirr(lpvals,dts), w['lpIRR'], 1e-6)
# independent LP-level waterfall: hurdles measured on LP's OWN cash, monthly-compounded IRR accounts
def lp_waterfall():
    mr = lambda a:(1+a)**(1/12)-1
    hs = [N('pref'),N('hurdle2'),N('hurdle3')]; splits=[1-gs, N('t2LP'), N('t3LP'), N('t4LP')]
    bals=[equity*(1-gs)]*3; lpd=[]
    for i in range(1,H+1):
        bals=[b*(1+mr(h)) for b,h in zip(bals,hs)]
        avail = max(0, lev[i]); lp=0
        for t in range(4):
            if avail<=0: break
            if t<3:
                need = bals[t]  # LP dollars needed to clear tier t
                take = min(avail, need/splits[t]) if splits[t]>0 else 0
            else: take = avail
            lp_got = take*splits[t]; lp += lp_got; avail -= take
            bals = [max(0,b-lp_got) for b in bals]
        lpd.append(lp)
    return xirr([-equity*(1-gs)]+lpd, dts), sum(lpd)
lp_irr_std, lp_dist_std = lp_waterfall()

print(f"{'Check':58} {'Independent':>16} {'App':>16}  Result")
for name,a,b,ok in results:
    fmt = (lambda v:f'{v:16.4%}') if abs(b)<5 and 'IRR' in name or 'cap' in name else (lambda v:f'{v:16,.2f}')
    print(f"{name:58} {fmt(a)} {fmt(b)}  {'PASS' if ok else 'FAIL'}")
print('\n--- reference figures ---')
print(f"Value used for LTV test (Y1 NOI / exit cap): {value_app_method:,.0f}  vs purchase price {N('purchasePrice'):,.0f}")
print(f"Y1 NOI per Operating Underwrite {noi:,.0f}  vs Year-1 NOI in Property CF {app_u['arr'][0]['noi']:,.0f}  ({app_u['arr'][0]['noi']/noi-1:+.2%})")
print(f"LP IRR: app (deal-level hurdles) {w['lpIRR']:.2%}  | LP-level hurdles {lp_irr_std:.2%}   GP IRR app {w['gpIRR']:.2%}")
