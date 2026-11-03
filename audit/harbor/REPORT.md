# Harbor Point Residences — full development test (BK Capital CRE)

Inputs: the brief, `Harbor_Point_Development_Pro_Forma.xlsx` and the OM. Method: the deal was entered into BK Capital (`audit/harbor/deal.js`, run by `run2.js`), and separately rebuilt from the brief in `reference.py` without reading the engine. Where the two differ the difference is listed, not smoothed over. **Nothing here is validated: see section 4.**

## 1. Inconsistencies found in the brief and workbook (not in BK Capital)

- Hard-cost categories sum to $24,950,000, not the $25,000,000 stated (short $50,000). The $42M budget is therefore $41,950,000 by line items.
- The workbook soft-cost draw % column sums to 0.98625, so $68,750 of soft cost has no month.
- Weighted average rent from the unit mix is $3,310.00, not the $3,302 stated in the OM and workbook.
- Unit areas in the workbook add to 105,900 SF, not the 112,800 SF rentable area stated (-6.1%).
- Stabilised NOI from the rent roll and expense inputs is $3,582,781, $632,781 (+21.5%) above the $2,950,000 target. Not plugged. At 5.00% the difference is $12,655,616 of sale value.
- Capitalised interest to month 48 is $6,248,147; the loan reaches $33,498,147 against a $34,000,000 ceiling (under). Equity forced above the $14,700,000 threshold: $0. All-in cost incl. financing is higher than the $42M budget by $6,678,384.
- The workbook places predevelopment costs at months −3 to −1 and construction at months 1–24; the brief says months 0–2 / 3–26. The brief was followed.
- “Hard-cost contingency” in the OM budget is $2.0M; the brief says contingency is separate from hard costs. Treated as separate.
- 5% vacancy and 95% occupancy are one assumption; applying both would double-count. Treated as one.
- The $750,000 debt-service/interest reserve and capitalised interest both pay for interest. Funding both is a double-count risk; the reference holds the reserve as cash and returns it at sale.
- Waterfall: the brief does not say who earns the preferred return (LP only, per Tier 2) or what the 50% catch-up runs to. Both are assumptions in sections 3 and 4.

## 2. Results side by side

| Item | Independent reference | BK Capital | Note |
|---|---:|---:|---|
| Hard costs | $24.95M | $26.95M | BK: $24.95M of lines + $2.0M contingency inside the hard-cost ladder |
| Soft costs | $5.00M | $5.00M | ties |
| Budget before financing | $41.95M | $39.95M | BK has no initial-reserves line ($2.0M) — gap |
| Stabilised NOI (before reserves) | $3.58M | $3.59M | BK charges other income on all 120 units, not occupied ones (+$12,096) |
| NOI target / variance | $2,950,000 / $632,781 | $644,877 | target is a check, not an input; neither build reaches it |
| Capitalised interest | $6.25M | $3.19M | BK stops capitalising at stabilisation (month 43), then pays current; reference capitalises to 48 |
| Peak loan | $33.50M | $28.07M | BK commitment is sized by LTC on all-in cost, not set to $27.3M / $34M |
| Origination + unused fees | $430,237 | $280,670 | BK has no unused-commitment fee |
| Additional equity beyond plan | $0 | $1.46M | BK loan commitment is too small for the draws |
| Total equity | $15.13M | $16.57M | brief: $14.973M initial + later calls |
| Gross sale (month 48) | $71.66M | $72.25M | BK uses forward NOI; reference uses stabilised NOI |
| Levered IRR / multiple | 31.78% / 2.85x | 33.95% / 2.92x | not comparable until the funding differences above are closed |
| LP IRR / multiple | not built | 26.98% / 2.40x | see waterfall caveats |
| GP IRR / multiple | not built | 73.09% / 7.67x | GP IRR is driven by a $1.5M co-invest and a $7.28M promote |
| Unlevered IRR / multiple | not built | not calculated | engine returns NaN / 0 for development deals — gap |

## 3. Where BK Capital cannot take the brief as written

- **Cost lines.** 13 hard trades and 16 soft lines, each a $/GSF or % rate, versus 16 hard and 19 soft dollar categories. Merged: enclosure accessories into envelope; mechanical, plumbing, electrical and fire into one MEP line; architecture, structural, MEP engineering and interior design into A&E; temporary utilities and miscellaneous into “Entitlement, Zoning & Community” (no “other” line). Each brief line cannot be independently escalated or reforecast.
- **Contingency tracking** (original / allocated / change orders / used / remaining / forecast / variance): not modelled; contingency is a % layer inside hard cost.
- **Initial reserves** ($2.0M, four buckets) and their release at sale: not modelled. The lease-up deficit is computed instead (zero here).
- **Facility.** The commitment is derived (LTC × all-in cost, grossed up for fees and interest) — a fixed $27.3M principal, $34M ceiling, “equity funds the first $14.7M” and an unused-commitment fee cannot be entered.
- **Waterfall.** Catch-up is “100% to the GP until it holds X% of profit” (set to 20%), not a 50% catch-up rate. The preferred return is earned by LP and GP pari passu, not LP only. The tiers use 80/20, 70/30, 60/40 as entered. Pref compounds monthly at the annual-equivalent rate.
- **Soft-cost timing** follows an internal 28/62/10 curve, not the workbook’s monthly percentages; hard cost uses an S-curve (steepness 7), not the workbook’s column.
- **Refinance “retained” case.** The app takes out the construction loan and still sells at the horizon; it does not hold the asset. Cash-out is reported, residual equity value is stabilised value less the new loan.

## 4. Validation status (brief §20)

| Check | Result |
|---|---|
| Sources = uses | FAIL across surfaces: PDF $43.42M; Sources & Uses sheet $44.64M (adds an acquisition-loan fee to the development total); budget $39.95M before financing. Each is internally explained but they are three different numbers. |
| Hard = $25M; soft = $5M; contingency = $2M; budget = $42M | Input fails: hard lines sum to $24.95M, budget to $41.95M. Soft, contingency and reserves tie. |
| LP + GP initial contributions = $14.973M | FAIL: the app reports $15.32M “contributed net of lease-up income” inside a $16.57M requirement. |
| Capitalised interest reconciles to monthly balance × rate | Not reconciled to the brief: interest stops at stabilisation; $1.23M is paid in cash beyond the commitment. |
| Sale proceeds = value − costs | PASS (gross $72.25M − 2% costs − loan payoff). |
| Waterfall tiers reconcile to distributions; GP promote isolated | PASS (conservation, tier order, promote = GP excess over pro-rata share). |
| IRR hurdles use dated LP cash flows | FAIL — the app’s own check: replayed IRRs are 8.08%, 12.11%, 18.17% against 8/12/18%. |
| Refinance proceeds not income; retained equity not cash | PASS in the refinance case (proceeds net of payoff and fee); see §3 on holding. |
| Sensitivities recalculate dependent metrics | PASS for the ones run; the PDF shows only exit cap × rent growth, and says cost-overrun stress is “not shown”. |
| No unexplained balancing items | Reference build: none. BK: the 1.23M cash interest and the 4.41M snapshot loan below are unexplained on-screen. |

## 5. Defects found in BK Capital’s outputs for development deals

- **Deal Snapshot card** (sidebar, Model Checks): Loan $4.41M, Equity $2.98M, Going-in DSCR 10.47x, Yield on Cost 48.91% — acquisition-debt figures on a development deal. The PDF correctly shows 8.91%.
- **Sources & Uses sheet**: total uses $44.64M = development total + an acquisition-loan fee; sources use the acquisition loan.
- **PDF “Permanent takeout” panel** with no takeout: “The permanent loan of $0 takes out the construction loan”, “Debt at sale $0”, while the $28.07M loan is repaid from the sale.
- **Unlevered IRR / multiple**: blank for development deals everywhere.
- **Credit gate says APPROVE — no material exceptions** while the waterfall self-check fails and the PDF cannot show NOI variance against a target.
- **PDF omits** (found only on other sheets or nowhere): unlevered returns, DSCR, debt yield, LTV, peak debt, unused fees, break-even occupancy / rent / cap rate, payback, cost per SF, unit mix, lease-up schedule, refinance analysis, contingency and reserve tracking, and four of the five required sensitivity tables.
- **Model Checks** reports 0 errors / 0 warnings on a deal whose NOI is 21.5% above its target and whose budget is $50k off its stated total.

## 6. Refinance alternative (month 43, 65% LTV, 6.25%, 30-yr, 1% fee) — BK Capital

| Permanent loan | Construction payoff | Fee | Net cash-out | Annual debt service | DSCR | Debt yield | LTV | Residual value |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| $46.85M | $28.07M | $468,500 | $18.31M | $3.46M | 1.04x | 7.69% | 65.00% | $72.08M |

A 65% LTV loan on this NOI runs at about 1.04x DSCR; at a 1.25x DSCR test the loan would be smaller. The same is true on the $2.95M target NOI (65% × $59M at 6.25% ≈ 1.04x).

## 7. Sensitivities (BK Capital; each row reruns the model)

**Exit cap**

| Case | Gross sale | Profit | Levered IRR | LP IRR | GP IRR | LP multiple | Extra equity | Cap. interest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 4.50% | $80.27M | $37.33M | 39.84% | 31.60% | 84.22% | 2.74x | $1.46M | $3.19M |
| 4.75% | $76.05M | $33.21M | 36.83% | 29.23% | 78.61% | 2.56x | $1.46M | $3.19M |
| 5.00% | $72.25M | $29.50M | 33.95% | 26.98% | 73.09% | 2.40x | $1.46M | $3.19M |
| 5.25% | $68.80M | $26.14M | 31.19% | 24.85% | 67.64% | 2.25x | $1.46M | $3.19M |
| 5.50% | $65.68M | $23.09M | 28.52% | 22.83% | 62.20% | 2.12x | $1.46M | $3.19M |
| 5.75% | $62.82M | $20.31M | 25.95% | 20.89% | 56.75% | 2.00x | $1.46M | $3.19M |
| 6.00% | $60.20M | $17.76M | 23.45% | 19.03% | 51.23% | 1.89x | $1.46M | $3.19M |

**Average rent**

| Case | Gross sale | Profit | Levered IRR | LP IRR | GP IRR | LP multiple | Extra equity | Cap. interest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| $2800 | $58.65M | $15.47M | 20.97% | 17.21% | 45.54% | 1.79x | $1.46M | $3.19M |
| $3000 | $63.98M | $20.97M | 26.50% | 21.30% | 57.97% | 2.03x | $1.46M | $3.19M |
| $3310 | $72.25M | $29.50M | 33.95% | 26.98% | 73.09% | 2.40x | $1.46M | $3.19M |
| $3500 | $77.31M | $34.73M | 38.01% | 30.16% | 80.80% | 2.63x | $1.46M | $3.19M |
| $3700 | $82.64M | $40.23M | 41.96% | 33.29% | 88.02% | 2.87x | $1.46M | $3.19M |

**Construction cost**

| Case | Gross sale | Profit | Levered IRR | LP IRR | GP IRR | LP multiple | Extra equity | Cap. interest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| +0% | $72.25M | $29.50M | 33.95% | 26.98% | 73.09% | 2.40x | $1.46M | $3.19M |
| +5% | $72.25M | $27.91M | 32.01% | 25.48% | 69.38% | 2.29x | $1.51M | $3.30M |
| +10% | $72.25M | $26.32M | 30.09% | 24.01% | 65.61% | 2.18x | $1.55M | $3.41M |
| +15% | $72.25M | $24.73M | 28.20% | 22.57% | 61.77% | 2.08x | $1.60M | $3.52M |
| +20% | $72.25M | $23.14M | 26.33% | 21.16% | 57.86% | 1.99x | $1.65M | $3.63M |

**Interest rate**

| Case | Gross sale | Profit | Levered IRR | LP IRR | GP IRR | LP multiple | Extra equity | Cap. interest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| +0 bps | $72.25M | $29.50M | 33.95% | 26.98% | 73.09% | 2.40x | $1.46M | $3.19M |
| +100 bps | $72.25M | $28.93M | 33.30% | 26.48% | 71.87% | 2.36x | $1.64M | $3.63M |
| +200 bps | $72.25M | $28.34M | 32.65% | 25.97% | 70.61% | 2.32x | $1.82M | $4.08M |
| +300 bps | $72.25M | $27.75M | 31.97% | 25.45% | 69.32% | 2.28x | $1.99M | $4.54M |

**Construction delay**

| Case | Gross sale | Profit | Levered IRR | LP IRR | GP IRR | LP multiple | Extra equity | Cap. interest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 months | $72.25M | $29.50M | 33.95% | 26.98% | 73.09% | 2.40x | $1.46M | $3.19M |
| 3 months | $72.25M | $29.27M | 31.48% | 25.20% | 66.82% | 2.39x | $1.46M | $3.41M |
| 6 months | $72.25M | $29.05M | 29.30% | 23.61% | 61.34% | 2.38x | $1.46M | $3.63M |
| 12 months | $72.25M | $28.58M | 25.64% | 20.95% | 52.23% | 2.37x | $1.46M | $4.08M |

**Lease-up delay**

| Case | Gross sale | Profit | Levered IRR | LP IRR | GP IRR | LP multiple | Extra equity | Cap. interest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 months | $72.25M | $29.50M | 33.95% | 26.98% | 73.09% | 2.40x | $1.46M | $3.19M |
| 3 months | $72.25M | $29.59M | 31.59% | 25.29% | 66.91% | 2.40x | $1.74M | $3.40M |
| 6 months | $72.25M | $29.66M | 29.48% | 23.77% | 61.49% | 2.41x | $2.03M | $3.63M |
| 12 months | $72.25M | $29.82M | 25.99% | 21.26% | 52.61% | 2.42x | $2.60M | $4.08M |

**Combined**

| Case | Gross sale | Profit | Levered IRR | LP IRR | GP IRR | LP multiple | Extra equity | Cap. interest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1. Cost +10%, rent -5%, cap +50 bps | $61.67M | $15.75M | 20.40% | 16.79% | 44.22% | 1.75x | $1.55M | $3.41M |
| 2. Cost +15%, rate +200 bps, 6-mo construction delay | $72.25M | $22.79M | 22.95% | 18.77% | 48.60% | 2.00x | $1.97M | $5.14M |
| 3. Rent -10%, lease-up +6 mo, cap +100 bps | $52.85M | $10.14M | 13.03% | 10.99% | 27.49% | 1.53x | $2.03M | $3.63M |
| 4. Cost +20%, rate +300 bps, rent -10%, cap +100 bps | $52.85M | $1.72M | 2.60% | 2.60% | 2.60% | 1.09x | $2.25M | $5.18M |

Delays extend the hold by the same number of months. Cost overrun is applied to hard cost including contingency. Per-case DSCR, break-even valuation and unlevered IRR are not tabulated: the engine returns no unlevered IRR for development deals, and trailing DSCR is distorted by capitalised interest.

## 8. Conclusion

Do not rely on the headline 33.95% / 2.92x. The two builds disagree on funding, and the brief itself contains four errors (hard-cost total, weighted rent, rentable area, NOI target). The direction is robust: the deal clears its hurdles through every single-variable sensitivity, and falls to a 2.6% IRR only in combined downside 4. What the model cannot yet show an investment committee is a reconciled budget, a facility that follows the brief, and unlevered returns.