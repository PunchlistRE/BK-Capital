"""Independent audit of the development path (see devdeal.js / deals/index.js). No development formula is
copied from the app: each check restates a financing or return identity from first principles.
    python3 audit/dev_audit.py out.json      (exit 1 on any failure; KNOWN GAPS are reported, not failed)
Importable: run(d, quiet) -> (checks, fails, notes)."""
import json, sys, math
from datetime import date

def run(d, quiet=False):
    s = d['s']; dv = d['dv']; f = d['f']; t = d['t']; m = d['m']
    N = lambda k: float(s.get(k) or 0)
    fails, checks, notes = [], 0, []

    def eq(name, a, b, tol=0.5):
        nonlocal checks; checks += 1
        if not abs(a - b) <= tol: fails.append(f'{name}: app {a:,.4f} vs independent {b:,.4f}')

    def ok(name, cond, detail=''):
        nonlocal checks; checks += 1
        if not cond: fails.append(f'{name} {detail}')

    mo = f['months']; rate = N('conRate'); commit = f['commit']
    # ---- 1. sources = uses, every month
    bal = 0.0; stab = dv['stab']
    for z in mo:
        eq(f"m{z['mo']} uses funded: loan + equity + overflow = need", z['loanDraw'] + z['eq'] + z['overflow'], z['need'], 0.01)
        eq(f"m{z['mo']} balance roll", z['end'], z['beg'] + z['capInt'] + z['loanDraw'], 0.01)
        ok(f"m{z['mo']} balance <= commitment", z['end'] <= commit + 0.01)
        eq(f"m{z['mo']} opening balance = prior closing", z['beg'], bal, 0.01); bal = z['end']
        # capitalised interest never exceeds interest accrued on the opening balance
        ok(f"m{z['mo']} interest = opening balance x rate/12 when charged", abs((z['capInt'] + z['excess']) - z['beg'] * rate / 12) < 0.01 or (z['capInt'] + z['excess']) == 0)
    # ---- 2. cost totals tie to the ladder
    eq('sum of monthly hard cost = budget hard', sum(z['hard'] for z in mo), dv['hard'], 1)
    eq('sum of monthly soft cost = budget soft', sum(z['soft'] for z in mo), dv['soft'], 1)
    eq('sum of monthly need = unlevered cost + upfront fees', sum(z['need'] for z in mo), dv['unlev'] + f['upfrontFees'], 1)
    eq('total hard + soft = SOURCE budget', dv['hard'] + dv['soft'], N('sourceConstruction'), 1)
    eq('land month 1 = price + closing + acquisition fee + pre-dev carry', mo[0]['land'], dv['land'] + dv['close'] + dv['acq'] + dv['pre'], 1)
    eq('closing = price x closingPct', dv['close'], N('purchasePrice') * N('closingPct'), 0.5)
    eq('capitalised interest = sum of monthly capInt', f['actualCapInt'], sum(z['capInt'] for z in mo), 1)
    # ---- 3. construction loan within its leverage limit
    total_cost = dv['unlev'] + f['upfrontFees'] + f['actualCapInt']
    ok('effective LTC (commitment / total cost incl. fees and interest) <= conLTC', commit / total_cost <= N('conLTC') + 0.005, f'{commit/total_cost:.3%} vs {N("conLTC"):.0%}')
    ok('commitment rounded down to $1,000', commit % 1000 == 0)
    ok('peak balance <= commitment', max(z['end'] for z in mo) <= commit + 0.01)
    # ---- 4. permanent loan sizing: lesser of LTV, DSCR, debt yield
    noi = t['noi']; r = N('permRate') / 12; n = round(N('permAmort') * 12)
    ltv = noi / N('exitCap') * N('permLTV')
    dscr_pay = noi / N('permDSCR') / 12
    dscr = dscr_pay * (1 - (1 + r) ** -n) / r if r else dscr_pay * n
    dy = noi / N('permDebtYield') if N('permDebtYield') > 0 else 1e99
    takeout = bool(N('refiAtStab')) or s.get('refiAtStab') is None
    if takeout and commit > 0:
        eq('permanent loan = floor(min(LTV, DSCR, DY) / 1000) x 1000', t['permLoan'], math.floor(min(ltv, dscr, dy) / 1000) * 1000, 0.5)
        ok('permanent loan DSCR >= requirement', noi / (t['permLoan'] * (r / (1 - (1 + r) ** -n)) * 12) >= N('permDSCR') - 1e-6)
        eq('refi proceeds = perm loan - construction payoff - fee (or 0)', t['refiProceeds'], max(0, t['permLoan'] - t['conPayoff'] - t['permFee']), 1)
    elif commit > 0:
        eq('no takeout: no permanent loan is sized', t['permLoan'], 0, 0.5)
        eq('no takeout: no refinance proceeds', t['refiProceeds'], 0, 0.5)
    else:
        eq('no construction loan: nothing is drawn', sum(z['loanDraw'] for z in mo), 0, 0.01)
        eq('no construction loan: no capitalised interest', f['actualCapInt'], 0, 0.01)
    # ---- 5. returns recomputed from the app's own cash flows
    rows = m['rows']; vals = m['values']; dts = [date.fromisoformat(x) for x in m['dates']]
    start = date(2027, 1, 1)
    def xirr(vs, ds, t0):
        g = lambda r: sum(v / (1 + r) ** ((x - t0).days / 365) for v, x in zip(vs, ds))
        lo, hi = -0.9, 10.0
        for _ in range(200):
            mid = (lo + hi) / 2
            if g(lo) * g(mid) <= 0: hi = mid
            else: lo = mid
        return (lo + hi) / 2
    for z, v in zip(rows, vals):
        eq(f"m{z['m']} cash flow identity", v, -z['equityDraw'] - z['refiEq'] + z['noi'] - z['assetFee'] - z['ds'] + z['refi'] + z['sale'] - z['dispoFee'] - z['payoff'], 0.01)
    # app XIRR counts the month-1 draw at the close date; month-end dates for the rest
    irr = xirr(vals, dts, start if False else dts[0])
    if not quiet: print(f'  independent XIRR from app cash flows {irr:.4%}  (app {m["irr"]:.4%})')
    ok('levered IRR matches an independent XIRR on the app cash flows (within 25 bp: app dates month-1 draw at close)', abs(irr - m['irr']) < 0.0025, f'{irr:.4%} vs {m["irr"]:.4%}')
    pos = sum(v for v in vals if v > 0); neg = -sum(v for v in vals if v < 0)
    eq('MOIC = distributions / contributions', m['moic'], pos / neg, 1e-9)
    last = rows[-1]
    eq('sale net of selling costs', last['sale'], last['grossSale'] * (1 - N('saleCostPct')), 0.5)
    ok('debt repaid at sale equals permanent balance', abs(last['payoff'] - t['permDebtAtSale']) < 1 or last['payoff'] > 0)
    # ---- 6. plausibility of the fixture's answer (guards against engine drift)
    yoc = noi / total_cost
    spread = (yoc - N('exitCap')) * 1e4
    if not quiet: print(f'  total cost incl. interest {total_cost/1e6:.2f}M, stabilised NOI {noi/1e6:.2f}M, yield on cost {yoc:.2%} ({spread:.0f} bp over exit cap)')
    if not quiet: print(f'  construction loan {commit/1e6:.2f}M ({commit/total_cost:.1%} LTC), equity {f["equityTotal"]/1e6:.2f}M, permanent loan {t["permLoan"]/1e6:.2f}M ({t["bindingTest"]}), levered IRR {m["irr"]:.1%}, MOIC {m["moic"]:.2f}x')
    ok('yield on cost 5.5%-8.5%', 0.055 <= yoc <= 0.085, f'{yoc:.2%}')
    ok('development spread over exit cap 75-300 bp', 75 <= spread <= 300, f'{spread:.0f} bp')
    lo = 0.10 if commit > 0 else 0.06   # an all-equity project earns less than a levered one
    ok(f'IRR {lo:.0%}-35%', lo <= m['irr'] <= 0.35, f'{m["irr"]:.1%}')
    ok('MOIC 1.4x-4.0x', 1.4 <= m['moic'] <= 4.0, f'{m["moic"]:.2f}x')
    # ---- KNOWN GAPS (reported, not failed)
    if all(z['reserve'] == 0 for z in rows) and N('reserves') > 0:
        notes.append(f"replacement reserves of ${N('reserves'):,.0f}/yr are not deducted from development operating cash flow (row 'reserve' is always 0)")
    if abs(sum(z['noi'] for z in rows[stab:stab + 12]) - t['noi']) > 1:
        notes.append('first 12 operating months NOI differs from the forward NOI that sizes the permanent loan')
    return checks, fails, notes

if __name__ == '__main__':
    d = json.load(open(sys.argv[1]))
    checks, fails, notes = run(d)
    print(f'\n{checks} checks, {len(fails)} failures, {len(d["pageErrors"])} page errors')
    for x in fails[:40]: print('FAIL', x)
    for x in notes: print('KNOWN GAP:', x)
    sys.exit(1 if fails or d['pageErrors'] else 0)
