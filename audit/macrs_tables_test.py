"""The generated MACRS percentages must equal the published IRS Pub. 946 Appendix A tables (to their 2-decimal rounding),
for BOTH the app's JS generator (via macrs_tables.json from macrs_tables_run.js) and the independent Python one."""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import macrs_ref as M
# NOTE: the IRS 39-year month-1 figure (2.461) is its own rounding of 0.107 + 11 x 0.214; the exact mid-month value is 2.457,
# hence the 0.005-point tolerance on real property.
# Published percentages (IRS Pub. 946, Appendix A). HY = Table A-1, MQ = Tables A-2..A-5, MM = Tables A-6 / A-7a.
PUB = {
 ('5', '200DB', 'HY', 1, 1): [20.00, 32.00, 19.20, 11.52, 11.52, 5.76],
 ('7', '200DB', 'HY', 1, 1): [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46],
 ('15', '150DB', 'HY', 1, 1): [5.00, 9.50, 8.55, 7.70, 6.93, 6.23, 5.90, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 2.95],
 ('5', '200DB', 'MQ', 1, 1): [35.00, 26.00, 15.60, 11.01, 11.01, 1.38],
 ('5', '200DB', 'MQ', 2, 4): [25.00, 30.00, 18.00, 11.37, 11.37, 4.26],
 ('5', '200DB', 'MQ', 3, 7): [15.00, 34.00, 20.40, 12.24, 11.30, 7.06],
 ('5', '200DB', 'MQ', 4, 10): [5.00, 38.00, 22.80, 13.68, 10.94, 9.58],
 ('7', '200DB', 'MQ', 4, 10): [3.57, 27.55, 19.68, 14.06, 10.04, 8.73, 8.73, 7.64],
 ('27.5', 'SL', 'MM', 1, 1): [3.485, 3.636],
 ('27.5', 'SL', 'MM', 1, 12): [0.152, 3.636],
 ('39', 'SL', 'MM', 1, 1): [2.461, 2.564],
 ('39', 'SL', 'MM', 1, 12): [0.107, 2.564],
}
js = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else None
fails, checks = [], 0
for (life, meth, conv, q, m), pub in PUB.items():
    life_f = float(life)
    py = [x * 100 for x in M.rates(life_f, meth, conv, q, m)]
    srcs = [('python', py)]
    if js is not None: srcs.append(('app', [x * 100 for x in js['|'.join(map(str, (life, meth, conv, q, m)))]]))
    for name, got in srcs:
        for i, p in enumerate(pub):
            checks += 1
            if abs(got[i] - p) > (0.0105 if life_f < 27.5 else 0.005): fails.append(f'{name} {life}-yr {meth} {conv} q{q} m{m} year {i+1}: {got[i]:.4f} vs Pub.946 {p}')
        checks += 1
        if abs(sum(got) - 100) > 1e-9: fails.append(f'{name} {life} {meth} {conv} sums to {sum(got)}')
        checks += 1
        if life_f < 27.5 and len(got) != len(pub): fails.append(f'{name} {life} {meth} {conv} q{q}: {len(got)} years vs {len(pub)}')
    # app and python must agree with each other to floating point
    if js is not None:
        checks += 1
        a = js['|'.join(map(str, (life, meth, conv, q, m)))]
        if max(abs(x - y) for x, y in zip(a, M.rates(life_f, meth, conv, q, m))) > 1e-12: fails.append(f'{life} {meth} {conv}: app vs independent generator differ')
print(f'{checks} checks, {len(fails)} failures')
for f in fails: print('FAIL', f)
sys.exit(1 if fails else 0)
