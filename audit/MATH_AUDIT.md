# Punchlist Capital CRE Model: Math Audit (sample test project)

**Date:** 2026-10-17. **Build audited:** V32.1 (`index.html`).

## Method

Two sample deals were loaded into the app through its own `bkCreateNewDeal()`. Every engine output was then rebuilt independently in Python (`audit.py`) and compared line by line.

| | Scenario A: base case | Scenario B: upside |
|---|---|---|
| Property | 120-unit garden multifamily, Charlotte NC | same property |
| Price | $24,000,000 | $21,000,000 |
| Rent | $1,650/unit/mo, 5% vacancy, 1% bad debt | same |
| Growth | 3% rent / 3% opex / 2% tax | **6%** rent |
| Exit | 5.75% cap, 5-yr hold, 2% sale cost | **5.00%** cap |
| Financing | Institutional Standard v1 template (65% LTV / 60% LTC / 1.25x DSCR, 6.75%, 30-yr) | same |
| JV | GP 50%, 7% pref, 10% / 15% hurdles | GP 10% (exercises every promote tier) |

To re-run the comparison:

```
node audit/dump.js index.html /tmp/out.json audit/dealB.js   # set PLAYWRIGHT_MODULE / CHROMIUM_PATH if needed
python3 audit/audit.py /tmp/out.json
```

## Result: the arithmetic is correct

All 25 checks matched in both scenarios, to the cent for dollar figures and to within 1e-6 for IRRs:

- **Year-1 operating statement:** GPR, EGI, management fee, total opex, NOI and going-in cap.
- **Debt:** acquisition basis, loan sizing as the minimum of LTV/LTC/DSCR rounded down to $1,000, the monthly payment, the loan balance at sale, and required equity.
- **Monthly cash flow:** all five annual NOI totals, forward-12-month exit NOI, gross and net sale.
- **Returns:** unlevered and levered XIRR, and both equity multiples.
- **Waterfall:** LP + GP distributions equal total equity distributions, and LP + GP contributions equal the equity requirement.
- **LP IRR:** recomputed from the LP's own cash flows.

| Scenario | Unlevered IRR | Levered IRR | LP IRR | GP IRR | Promote |
|---|---|---|---|---|---|
| A: base case | 6.64% | 5.63% | 5.63% | 5.63% | $0 (pref not met) |
| B: upside | 18.46% | 28.54% | 18.94% | 68.13% | $8,195,466 |

## Bugs found and fixed in this change

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | Sensitivity | Base rent growth was read from **commercial** rent growth, which is 0 on an apartment deal, so it fell back to 2.5%. Every rent-growth grid was centred on the wrong value, and the case table showed the wrong growth rate. | Uses residential growth whenever the deal has residential revenue. A real 0% is no longer treated as blank. |
| 2 | Home → Valuation Conclusion | A second, divergent calculator. It used NOI *before* reserves, a "Year 10" basis on a 5-year hold, a DCF dated from today rather than closing, and **no sale proceeds**, so it showed a DCF of $6.6M against $34.0M on Returns. | One shared `bkValuationConclusion()` now feeds both Home and Returns. |
| 3 | Returns | The meta strip and sidebar showed "Excel IRR 13.0% / MOIC 2.74x / Verified", plus a workbook tie-out card, on **every** deal. These were literals copied from a historical reference workbook. | Now shows the active deal's live levered IRR and MOIC. |
| 4 | Residual Land | "Workbook Stored Solve $5,288,519" was a literal from the reference workbook, shown on every deal. | Removed. |
| 5 | Depreciation | With cost segregation off (the default), the page said the full basis flows to the 27.5/39-yr class, but the engine allocated $0, reported **OUT OF BALANCE** and produced an all-zero schedule. | Full depreciable basis is allocated to the base life, so the page ties. After-Tax keeps its documented fallback until land or cost-seg is actually entered. |
| 6 | All % displays | `bkPct` rounded to one decimal and a later layer padded the result, so a 6.75% coupon displayed as **6.80%** (or 6.8%). | `bkPct` prints two decimals. |

## Methodology items: decisions for BK, not changed

The engine reproduces these as designed, but each one moves the returns materially. The figures are levered IRR on Scenario A / Scenario B.

1. **Growth starts in month 1.** Revenue and expenses compound at (1+g)^(m/12) from the first month, so Year-1 cash-flow rents are already above the underwritten Year-1 rent. Year-1 NOI on Property CF is **+2.9% (A) / +5.6% (B)** above the Operating Underwrite page. Starting growth in Year 2 would move levered IRR **5.63% → 4.70% (A)** and **28.54% → 26.53% (B)**.
2. **Controllable opex is scaled by (0.6 + 0.4 × occupancy)** in the cash flow but not on Operating Underwrite. This lowers cash-flow expenses about 2% at 95% occupancy, worth **~50 bps** of levered IRR on A. Together with item 1, Year-1 cash-flow NOI ($1.31M) exceeds the underwritten Year-1 NOI after reserves ($1.27M).
3. **The LTV test values the property at Year-1 NOI ÷ exit cap**, not purchase price, so the *exit* cap assumption sizes the *acquisition* loan. In B the implied value is $26.1M on a $21.0M purchase. LTC happened to bind there; on a deal where LTV binds, a lower exit cap would raise leverage.
4. **Bad debt** is charged on gross rent on Operating Underwrite but on post-vacancy rent in the monthly engine. The difference is small (~$1k/yr here), but the two pages disagree.
5. **Waterfall hurdles are deal-level.** Tier balances clear on total distributions, including the GP catch-up and the GP's promote share, not on the LP's own receipts. On B, LP IRR is **18.94%**; measuring the hurdles on LP dollars would give **19.45%**, about 50 bps more to the LP.
6. **Template defaults to review:** GP equity share is **50%** (5–10% is typical for an institutional JV), and DSCR sizing uses NOI *before* reserves.
