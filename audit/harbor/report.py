import json
R = json.load(open('audit/harbor/results.json')); F = json.load(open('audit/harbor/reference.json')); B = R['base']
m = lambda v: '—' if v is None else ('$%.2fM' % (v / 1e6) if abs(v) >= 1e6 else '$%s' % format(round(v), ','))
p = lambda v: '—' if v is None else '%.2f%%' % (v * 100)
x = lambda v: '—' if v is None else '%.2fx' % v
o = []; w = o.append
w('# Harbor Point Residences — full development test (BK Capital CRE)\n')
w('Inputs: the brief, `Harbor_Point_Development_Pro_Forma.xlsx` and the OM. Method: the deal was entered into BK Capital (`audit/harbor/deal.js`, run by `run2.js`), and separately rebuilt from the brief in `reference.py` without reading the engine. Where the two differ the difference is listed, not smoothed over. **Nothing here is validated: see section 4.**\n')
w('## 1. Inconsistencies found in the brief and workbook (not in BK Capital)\n')
for f in F['findings']: w('- ' + f)
w('- The workbook places predevelopment costs at months −3 to −1 and construction at months 1–24; the brief says months 0–2 / 3–26. The brief was followed.')
w('- “Hard-cost contingency” in the OM budget is $2.0M; the brief says contingency is separate from hard costs. Treated as separate.')
w('- 5% vacancy and 95% occupancy are one assumption; applying both would double-count. Treated as one.')
w('- The $750,000 debt-service/interest reserve and capitalised interest both pay for interest. Funding both is a double-count risk; the reference holds the reserve as cash and returns it at sale.')
w('- Waterfall: the brief does not say who earns the preferred return (LP only, per Tier 2) or what the 50% catch-up runs to. Both are assumptions in sections 3 and 4.\n')
w('## 2. Results side by side\n')
w('| Item | Independent reference | BK Capital | Note |\n|---|---:|---:|---|')
rows = [
 ('Hard costs', m(F['budget']['hard']), m(B['hardTotal']), 'BK: $24.95M of lines + $2.0M contingency inside the hard-cost ladder'),
 ('Soft costs', m(F['budget']['soft']), m(B['softTotal']), 'ties'),
 ('Budget before financing', m(F['budget']['total']), m(B['unlev']), 'BK has no initial-reserves line ($2.0M) — gap'),
 ('Stabilised NOI (before reserves)', m(F['noi']['noi']), m(B['stabNOI']), 'BK charges other income on all 120 units, not occupied ones (+$12,096)'),
 ('NOI target / variance', '$2,950,000 / %s' % m(F['noi']['variance']), '%s' % m(B['stabNOI'] - 2950000), 'target is a check, not an input; neither build reaches it'),
 ('Capitalised interest', m(F['debt']['capitalised_interest']), m(B['capInt']), 'BK stops capitalising at stabilisation (month 43), then pays current; reference capitalises to 48'),
 ('Peak loan', m(F['debt']['peak']), m(B['peakDebt']), 'BK commitment is sized by LTC on all-in cost, not set to $27.3M / $34M'),
 ('Origination + unused fees', m(F['debt']['origination_fee'] + F['debt']['unused_fees']), m(B['upfront']), 'BK has no unused-commitment fee'),
 ('Additional equity beyond plan', m(F['debt']['facility_shortfall']), m(B['overflowEquity']), 'BK loan commitment is too small for the draws'),
 ('Total equity', m(F['equity']['total_calls']), m(B['equityTotal']), 'brief: $14.973M initial + later calls'),
 ('Gross sale (month 48)', m(F['exit']['gross']), m(B['grossSale']), 'BK uses forward NOI; reference uses stabilised NOI'),
 ('Levered IRR / multiple', '%s / %s' % (p(F['returns']['levered_irr']), x(F['returns']['moic'])), '%s / %s' % (p(B['irr']), x(B['moic'])), 'not comparable until the funding differences above are closed'),
 ('LP IRR / multiple', 'not built', '%s / %s' % (p(B['lpIRR']), x(B['lpMOIC'])), 'see waterfall caveats'),
 ('GP IRR / multiple', 'not built', '%s / %s' % (p(B['gpIRR']), x(B['gpMOIC'])), 'GP IRR is driven by a $1.5M co-invest and a $7.28M promote'),
 ('Unlevered IRR / multiple', 'not built', 'not calculated', 'engine returns NaN / 0 for development deals — gap')]
for r in rows: w('| ' + ' | '.join(r) + ' |')
w('')
w('## 3. Where BK Capital cannot take the brief as written\n')
for t in [
 '**Cost lines.** 13 hard trades and 16 soft lines, each a $/GSF or % rate, versus 16 hard and 19 soft dollar categories. Merged: enclosure accessories into envelope; mechanical, plumbing, electrical and fire into one MEP line; architecture, structural, MEP engineering and interior design into A&E; temporary utilities and miscellaneous into “Entitlement, Zoning & Community” (no “other” line). Each brief line cannot be independently escalated or reforecast.',
 '**Contingency tracking** (original / allocated / change orders / used / remaining / forecast / variance): not modelled; contingency is a % layer inside hard cost.',
 '**Initial reserves** ($2.0M, four buckets) and their release at sale: not modelled. The lease-up deficit is computed instead (zero here).',
 '**Facility.** The commitment is derived (LTC × all-in cost, grossed up for fees and interest) — a fixed $27.3M principal, $34M ceiling, “equity funds the first $14.7M” and an unused-commitment fee cannot be entered.',
 '**Waterfall.** Catch-up is “100% to the GP until it holds X% of profit” (set to 20%), not a 50% catch-up rate. The preferred return is earned by LP and GP pari passu, not LP only. The tiers use 80/20, 70/30, 60/40 as entered. Pref compounds monthly at the annual-equivalent rate.',
 '**Soft-cost timing** follows an internal 28/62/10 curve, not the workbook’s monthly percentages; hard cost uses an S-curve (steepness 7), not the workbook’s column.',
 '**Refinance “retained” case.** The app takes out the construction loan and still sells at the horizon; it does not hold the asset. Cash-out is reported, residual equity value is stabilised value less the new loan.']: w('- ' + t)
w('')
w('## 4. Validation status (brief §20)\n')
w('| Check | Result |\n|---|---|')
for k, v in [
 ('Sources = uses', 'FAIL across surfaces: PDF $43.42M; Sources & Uses sheet $44.64M (adds an acquisition-loan fee to the development total); budget $39.95M before financing. Each is internally explained but they are three different numbers.'),
 ('Hard = $25M; soft = $5M; contingency = $2M; budget = $42M', 'Input fails: hard lines sum to $24.95M, budget to $41.95M. Soft, contingency and reserves tie.'),
 ('LP + GP initial contributions = $14.973M', 'FAIL: the app reports $15.32M “contributed net of lease-up income” inside a $16.57M requirement.'),
 ('Capitalised interest reconciles to monthly balance × rate', 'Not reconciled to the brief: interest stops at stabilisation; $1.23M is paid in cash beyond the commitment.'),
 ('Sale proceeds = value − costs', 'PASS (gross $72.25M − 2% costs − loan payoff).'),
 ('Waterfall tiers reconcile to distributions; GP promote isolated', 'PASS (conservation, tier order, promote = GP excess over pro-rata share).'),
 ('IRR hurdles use dated LP cash flows', 'FAIL — the app’s own check: replayed IRRs are 8.08%, 12.11%, 18.17% against 8/12/18%.'),
 ('Refinance proceeds not income; retained equity not cash', 'PASS in the refinance case (proceeds net of payoff and fee); see §3 on holding.'),
 ('Sensitivities recalculate dependent metrics', 'PASS for the ones run; the PDF shows only exit cap × rent growth, and says cost-overrun stress is “not shown”.'),
 ('No unexplained balancing items', 'Reference build: none. BK: the 1.23M cash interest and the 4.41M snapshot loan below are unexplained on-screen.')]: w('| %s | %s |' % (k, v))
w('')
w('## 5. Defects found in BK Capital’s outputs for development deals\n')
for t in [
 '**Deal Snapshot card** (sidebar, Model Checks): Loan $4.41M, Equity $2.98M, Going-in DSCR 10.47x, Yield on Cost 48.91% — acquisition-debt figures on a development deal. The PDF correctly shows 8.91%.',
 '**Sources & Uses sheet**: total uses $44.64M = development total + an acquisition-loan fee; sources use the acquisition loan.',
 '**PDF “Permanent takeout” panel** with no takeout: “The permanent loan of $0 takes out the construction loan”, “Debt at sale $0”, while the $28.07M loan is repaid from the sale.',
 '**Unlevered IRR / multiple**: blank for development deals everywhere.',
 '**Credit gate says APPROVE — no material exceptions** while the waterfall self-check fails and the PDF cannot show NOI variance against a target.',
 '**PDF omits** (found only on other sheets or nowhere): unlevered returns, DSCR, debt yield, LTV, peak debt, unused fees, break-even occupancy / rent / cap rate, payback, cost per SF, unit mix, lease-up schedule, refinance analysis, contingency and reserve tracking, and four of the five required sensitivity tables.',
 '**Model Checks** reports 0 errors / 0 warnings on a deal whose NOI is 21.5% above its target and whose budget is $50k off its stated total.']: w('- ' + t)
w('')
w('## 6. Refinance alternative (month 43, 65% LTV, 6.25%, 30-yr, 1% fee) — BK Capital\n')
r = R['refi']
w('| Permanent loan | Construction payoff | Fee | Net cash-out | Annual debt service | DSCR | Debt yield | LTV | Residual value |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
w('| %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (m(r['permLoan']), m(r['conPayoff']), m(r['permFee']), m(r['refiProceeds']), m(r['annualDS']), x(r['dscrAtRefi']), p(r['debtYield']), p(r['ltv']), m(r['residualValue'])))
w('\nA 65% LTV loan on this NOI runs at about 1.04x DSCR; at a 1.25x DSCR test the loan would be smaller. The same is true on the $2.95M target NOI (65% × $59M at 6.25% ≈ 1.04x).\n')
w('## 7. Sensitivities (BK Capital; each row reruns the model)\n')
for name, rs in R['sens'].items():
    w('**%s**\n\n| Case | Gross sale | Profit | Levered IRR | LP IRR | GP IRR | LP multiple | Extra equity | Cap. interest |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|' % name)
    for q in rs: w('| %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (q['label'], m(q['grossSale']), m(q['profit']), p(q['irr']), p(q['lpIRR']), p(q['gpIRR']), x(q['lpMOIC']), m(q['overflowEquity']), m(q['capInt'])))
    w('')
w('Delays extend the hold by the same number of months. Cost overrun is applied to hard cost including contingency. Per-case DSCR, break-even valuation and unlevered IRR are not tabulated: the engine returns no unlevered IRR for development deals, and trailing DSCR is distorted by capitalised interest.\n')
w('## 8. Conclusion\n')
w('Do not rely on the headline 33.95% / 2.92x. The two builds disagree on funding, and the brief itself contains four errors (hard-cost total, weighted rent, rentable area, NOI target). The direction is robust: the deal clears its hurdles through every single-variable sensitivity, and falls to a 2.6% IRR only in combined downside 4. What the model cannot yet show an investment committee is a reconciled budget, a facility that follows the brief, and unlevered returns.')
open('audit/harbor/REPORT.md', 'w').write('\n'.join(o)); print(len(o))
