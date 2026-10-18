"""Independent re-implementation of the tax-grade depreciation and after-tax chain, written from IRS Pub. 946 / the
rules in the module header, not from the app's code. Inputs are the deal's depreciation settings and components and the
app's PRE-TAX monthly stream (verified separately); everything tax-related is recomputed here.

    rates(life, method, conv, q, m)   recovery fractions by recovery year
    schedule(settings, components, default_placed, sale_date)  -> {tax_year: {'total', 'reg', 'bonus', 'cls': {life: amt}}}
    after_tax(...)                    -> calendar-year taxes, sale tax, after-tax IRR / MOIC
"""
import math
from datetime import date

def rates(life, method, conv, q=1, m=1):
    """Pub. 946 GDS percentages by direct recursion on the unrecovered basis. Straight line is taken whenever it
    recovers at least as much as declining balance (the 'switch'); the last year takes whatever remains."""
    first = {'HY': 0.5, 'MQ': (4 - q + 0.5) / 4, 'MM': (12 - m + 0.5) / 12}[conv]
    k = {'200DB': 2.0, '150DB': 1.5, 'SL': 1.0}[method]
    left, out, year = 1.0, [], 1
    while left > 1e-12:
        if year == 1:
            take = k / life * first
        else:
            years_left = life - first - (year - 2)              # recovery period still ahead of this year
            sl = left / years_left if years_left > 0 else left
            db = left * k / life if method != 'SL' else 0.0
            take = max(sl, db)
        take = min(take, left); out.append(take); left -= take; year += 1
    return out

def bonus_rate(placed):
    if placed >= date(2025, 1, 20): return 1.0
    y = placed.year
    return 0.5 if y <= 2017 else 1.0 if y <= 2022 else {2023: .8, 2024: .6, 2025: .4, 2026: .2}.get(y, 0.0)

def parse(s):
    s = str(s)
    if '-' in s[:5]: y, m, d = s[:10].split('-'); return date(int(y), int(m), int(d))
    m, d, y = s.split('/')[:3]; return date(int(y), int(m), int(d))

def conv_of(text, life):
    if life >= 27.5: return 'MM'
    t = (text or '').lower()
    if 'quarter' in t or t == 'mq': return 'MQ'
    if 'half' in t or t == 'hy': return 'HY'
    return 'AUTO'

def meth_of(text, life):
    if life >= 27.5: return 'SL'
    t = (text or '')
    if '200' in t: return '200DB'
    if '150' in t: return '150DB'
    if t.lower() in ('sl',) or 'straight' in t.lower(): return 'SL'
    return '200DB' if life <= 10 else '150DB'

def build_lines(settings, comps, dep_basis, base_life):
    """The depreciable lines the deal implies (from the Depreciation sheet's documented rules):
    no cost seg -> one line, the whole basis, over the base life; cost seg detailed -> one line per component;
    cost seg buckets -> one line per class, the base-life class carrying the residual."""
    if not settings.get('costSeg'):
        return [dict(basis=dep_basis, life=base_life, bonus=False, convention='MM', method='SL', placed=None)] if dep_basis > 0 else []
    if settings.get('detailMode', 'detailed') == 'detailed':
        return [dict(basis=float(c['basis']), life=float(c['recovery']), bonus=bool(c.get('bonus')) and float(c['recovery']) <= 20,
                     convention=c.get('convention'), method=c.get('method'), placed=c.get('placed') or None) for c in comps]
    b = {5.0: 0.0, 7.0: 0.0, 15.0: 0.0, 27.5: 0.0, 39.0: 0.0}
    for c in comps: b[float(c['recovery'])] = b.get(float(c['recovery']), 0.0) + float(c['basis'])
    b[float(base_life)] = max(0.0, dep_basis - sum(v for k, v in b.items() if k != float(base_life)))
    return [dict(basis=v, life=k, bonus=k <= 20, convention='Underwriting', method='Class default', placed=None) for k, v in b.items() if v > 0]

def schedule(settings, specs, default_placed, sale_date=None):
    lines = []
    for c in specs:
        life = float(c['life']); b = float(c['basis'])
        if b <= 0 or life <= 0: continue
        lines.append(dict(basis=b, life=life, bonus=bool(c['bonus']) and life <= 20, conv=conv_of(c.get('convention'), life),
                          meth=meth_of(c.get('method'), life), placed=parse(c['placed']) if c.get('placed') else default_placed))
    tot, q4 = {}, {}
    for l in lines:
        if l['life'] < 27.5:
            tot[l['placed'].year] = tot.get(l['placed'].year, 0) + l['basis']
            if l['placed'].month >= 10: q4[l['placed'].year] = q4.get(l['placed'].year, 0) + l['basis']
    midq = {y: q4.get(y, 0) / t > 0.40 for y, t in tot.items() if t > 0}
    rows = {}
    def add(y, kind, life, amt):
        if amt <= 0: return
        r = rows.setdefault(y, dict(total=0.0, reg=0.0, bonus=0.0, cls={})); r['total'] += amt; r[kind] += amt; r['cls'][life] = r['cls'].get(life, 0) + amt
    for l in lines:
        p = l['placed']; conv = l['conv'] if l['conv'] != 'AUTO' else ('MQ' if midq.get(p.year) else 'HY')
        br = (float(settings.get('bonusPct') or 0) if settings.get('bonusMode') == 'elect' else bonus_rate(p)) if l['bonus'] else 0.0
        bonus = l['basis'] * br; reg = l['basis'] - bonus
        q = (p.month - 1) // 3 + 1
        add(p.year, 'bonus', l['life'], bonus)
        for i, f in enumerate(rates(l['life'], l['meth'], conv, q, p.month)):
            y = p.year + i; amt = reg * f
            if sale_date:
                if y > sale_date.year: break
                if y == sale_date.year:
                    sq = (sale_date.month - 1) // 3 + 1
                    amt *= {'HY': 0.5, 'MQ': (sq - 0.5) / 4, 'MM': (sale_date.month - 0.5) / 12}[conv]
            add(y, 'reg', l['life'], amt)
    return rows, lines

def xirr(vals, dts):
    t0 = dts[0]
    f = lambda r: sum(v / (1 + r) ** ((d - t0).days / 365) for v, d in zip(vals, dts))
    lo, hi = -0.99, 10.0
    for _ in range(300):
        mid = (lo + hi) / 2
        if f(lo) * f(mid) <= 0: hi = mid
        else: lo = mid
    return (lo + hi) / 2

def after_tax(settings, specs, default_placed, months, close_date, eq0, net_sale, total_basis, tax_rate, cg_rate, recap_rate, fee=0.0):
    """months: list of dict(date, noi_after_reserves, interest, cf). Returns calendar-year rows and sale tax."""
    sale_date = months[-1]['date']
    rows, lines = schedule(settings, specs, default_placed, sale_date)
    years = []
    for m in months:
        if not years or years[-1] != m['date'].year: years.append(m['date'].year)
    carry, out, accum_p, accum_r = 0.0, [], 0.0, 0.0
    taxes = {}
    for k, y in enumerate(years):
        noi = sum(m['noi'] for m in months if m['date'].year == y); intr = sum(m['interest'] for m in months if m['date'].year == y)
        r = rows.get(y, dict(total=0.0, cls={}))
        dp = sum(v for c, v in r['cls'].items() if c < 27.5); dr = sum(v for c, v in r['cls'].items() if c >= 27.5)
        accum_p += dp; accum_r += dr
        ti = noi - intr - r['total'] - (fee if k == 0 else 0.0); due = 0.0
        if settings.get('lossMode') == 'usable': due = ti * tax_rate          # loss saves tax immediately
        elif ti > 0:
            use = min(carry, ti); carry -= use; ti -= use; due = ti * tax_rate
        else: carry += -ti; ti = 0.0
        taxes[y] = due; out.append(dict(year=y, noi=noi, interest=intr, depr=r['total'], taxable=ti, tax=due, loss=carry))
    Bp = sum(l['basis'] for l in lines if l['life'] < 27.5); Br = sum(l['basis'] for l in lines if l['life'] >= 27.5)
    Bo = max(0.0, total_basis - Bp - Br); W = Bp + Br + Bo
    gp = net_sale * Bp / W - (Bp - accum_p); gr = net_sale * Br / W - (Br - accum_r); go = net_sale * Bo / W - Bo
    ordg = max(0.0, min(gp, accum_p)); unrec = max(0.0, min(gr, accum_r)); cap = (gp - ordg) + (gr - unrec) + go
    if cap < 0: a = min(unrec, -cap); unrec -= a; cap += a
    if cap < 0: a = min(ordg, -cap); ordg -= a; cap += a
    cap = max(0.0, cap)
    rel = min(carry, ordg + unrec + cap)
    for name in ('ord', 'unrec', 'cap'):
        pass
    take = min(rel, ordg); ordg -= take; rel -= take
    take = min(rel, unrec); unrec -= take; rel -= take
    take = min(rel, cap); cap -= take; rel -= take
    sale_tax = ordg * tax_rate + unrec * min(recap_rate, tax_rate) + cap * cg_rate
    vals = [m['cf'] for m in months]
    vals[0] -= fee
    last = {}
    for i, m in enumerate(months): last[m['date'].year] = i
    for y, i in last.items(): vals[i] -= taxes[y]
    vals[-1] -= sale_tax
    dts = [m['date'] for m in months]
    close_amt = -eq0
    irr = xirr([close_amt, vals[0] - close_amt] + vals[1:], [close_date, dts[0]] + dts[1:])
    inflow = sum(max(0, v) for v in vals); outflow = sum(max(0, -v) for v in vals)
    return dict(rows=out, sale_tax=sale_tax, ord=ordg, unrec=unrec, cap=cap, irr=irr, moic=inflow / outflow if outflow else 0.0, accum=accum_p + accum_r, accum_p=accum_p)
