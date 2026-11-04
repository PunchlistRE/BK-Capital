#!/usr/bin/env python3
"""Walks BK Capital's Harbor Point levered IRR to the brief's own conventions one change at a time, using the independent model (reference2.py) with switches. Writes walk.json."""
import json, subprocess, copy, os
H = os.path.dirname(os.path.abspath(__file__)); inp = json.load(open(H + '/inputs.json'))
def run(inputs, sw):
    json.dump(inputs, open(H + '/_in.json', 'w')); r = json.loads(subprocess.check_output(['python3', H + '/reference2.py', H + '/_in.json', json.dumps(sw)])); os.remove(H + '/_in.json'); return r
steps = [('BK Capital as modelled (independent model, no switches)', {}, {}),
         ('Other income paid by occupied units only, as the brief says (BK charges all 120 units)', {'otherIncomePerUnit': 1995}, {}),
         ('Exit value on stabilized NOI before reserves (the reference build\'s simplification; BK uses next-12-months NOI after reserves, with growth)', {}, {'exit_stab': 1}),
         ('Interest capitalized to the sale with no current-pay (BK stops capitalising at stabilization, then pays interest from cash flow)', {}, {'cap_to_exit': 1}),
         ('The workbook\'s lease-up occupancy ramp (BK derives a straight-line ramp from the lease-up months)', {}, {'wb_ramp': 1}),
         ('$2.0M initial reserves funded, lease-up shortfalls paid from them, balance released at sale (BK has no reserves)', {}, {'reserves': 1}),
         ('Fixed $27.3M facility, $34M ceiling, $14.7M equity first, $273k fee, 0.5% unused fee (BK sizes the loan by LTC on all-in cost)', {}, {'fixed_facility': 1})]
i2 = copy.deepcopy(inp); sw = {}; out = []
for n, ov, s in steps:
    i2.update(ov); sw.update(s); r = run(i2, sw); out.append(dict(step=n, irr=r['irr'], moic=r['moic'], uirr=r['uirr'], equity=r['equityTotal'], capInt=r['capInt']))
json.dump(out, open(H + '/walk.json', 'w'), indent=1)
for o in out: print(f"{o['irr']*100:6.2f}%  {o['step'][:100]}")
