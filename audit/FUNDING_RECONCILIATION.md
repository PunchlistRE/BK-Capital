# Development funding reconciliation

Branch `claude/funding-reconciliation`, started from main `ee6d171`. Every figure in this report is produced by `audit/funding_scenarios_test.js` (final build), or by the one-off traces quoted where they are used. The "before" figures are the same suite run against main's `index.html`. Reproduce with:

```
node build.js && node audit/funding_scenarios_test.js index.html                 # the suite, about 75 seconds, exit 1 on any failure
node audit/funding_scenarios_test.js index.html --json after.json                # one headline record per scenario
git show ee6d171:index.html > before.html && node audit/funding_scenarios_test.js before.html --json before.json
```

## 1. Result

| | |
|---|---|
| Scenarios | 180 (71 Harbor Point, 71 audit development deal, 38 acquisition) |
| Checks | 5,608, all passing on this branch |
| On main (`ee6d171`) | 36 scenarios fail ALL INPUTS TIE: 34 valid configurations and 2 invalid ones. 18 have Sources different from Uses, 20 show equity different from the engine |
| On this branch | 0 valid scenarios fail. The 4 invalid holds (1 and 2 years on both development deals) fail by design |
| Engine figures | **No engine or returns figure moved.** Levered IRR, equity multiple, distributions, contributions and engine equity are identical on main and on this branch in all 180 scenarios |
| Model defects | 2 |
| Test / check defects | 6 |
| Legitimate financing behavior now asserted by tests | 8 |
| Invalid configuration newly reported | 1 (hold at or before completion) |

## 2. What was wrong, separated

### 2.1 Actual model defects (output a reader sees was wrong)

| # | Defect | Where | Effect | Fix |
|---|---|---|---|---|
| M1 | **An interest reserve was counted twice in the funding summary.** The reserve pays part of the interest that falls beyond the facility limit. The summary showed that interest in full as an *equity* source, showed the reserve draw again as its own source, and took equity as "total sources less the facility", so the draw was also inside equity. A reserve draw of any kind was also folded into equity. | `src/184-bk-funding-summary.js`, read by the Sources & Uses page and the guide | Harbor + $1,000,000 interest reserve: sources $46,784,810 against uses $45,784,810 (+$1,000,000); equity shown $18,717,810 against $16,717,810 in the funding ledger, the returns and the investor PDF (+$2,000,000). With an operating reserve that is drawn, uses and sources tied but equity was overstated by the draw ($200,000 in the audit-deal case). The page had the same lists before the shared calculation (#103) was introduced, so this is not a regression of that change. | The equity interest line is the interest *net* of the reserve draw; reserve draws are their own source lines (lease-up and interest separately); equity is the sum of its own lines. No plug. |
| M2 | **The investor PDF "Uses" table left out the lease-up operating deficit** when the deficit is funded in the ledger, so the listed uses did not add to "Total project cost" (short by $270,684 on the audit deal at 30% vacancy). The total itself was right. | `src/145-bk-v29270-report.js` | A reader adding the column got a different number from the printed total | The line is added (it appears only when the deficit is above zero) |

The funding ledger, the monthly returns, the integrity `su` check and the investor PDF totals were already right in the reserve case. The defect was in the shared summary that the Sources & Uses page and the guide read.

### 2.2 Test and check defects (the model was right; a check said otherwise, or could not fail)

| # | Defect | Where | Effect | Fix |
|---|---|---|---|---|
| T1 | The `commit` tie compared *principal plus capitalized interest* with the *commitment*. Those are different limits: the commitment caps the principal that can be drawn, the ceiling caps the balance, and interest capitalizes into the balance up to the ceiling. | `src/184`; the same wording on the Sources & Uses page | 12 scenarios failed ALL INPUTS TIE for a legitimate structure (the 8 facility / ceiling variants and 4 more of the same kind). The integrity checks `facility` and `fixed` already compared against the right limits. | Two ties: principal against the committed amount, balance against the permitted ceiling. The page reads the shared ties instead of recomputing its own |
| T2 | Integrity `eqret` expected the takeout shortfall in the returns even when the sale falls before stabilization and the takeout never happens. | `src/178-bk-integrity.js` | Audit deal with a 3-year hold: `eqret` failed (hard) for a valid configuration. The "second capital call" warning and the Debt page also described a call that never happens. | The takeout engine now reports `takeoutInHold`; the check, the Debt page wording and the warning follow it |
| T3 | The waterfall promote check applied the LP-only preferred return even on a deal-level hurdle basis, where the engine (and the partner breakdown) ignore it. | `src/169-bk-wfchecks.js` | Audit deal with the LP-only preference switched on: `wf_promote` failed (hard). Found by the new suite | Gated on the LP hurdle basis, as the engine and the breakdown are |
| T4 | The `eqReturns` tie accepted a difference equal to the interest beyond the commitment. | `src/184` | A difference of that size would have been reported as "explained" | Strict to the dollar |
| T5 | The Debt page reconciliation rows could not fail: "Sources = Uses at the project level" and "Facility drawn never exceeds the commitment" both carried a tolerance of a billion dollars (the first also clamped one side to the other). | `src/084-bk-wave3a-construction.js` | Green rows that proved nothing | Rows read the shared funding calculation; the facility row is split into principal against the commitment and balance against the ceiling. A page-level mutation in the suite proves they now fail |
| T6 | Contributions in the returns were reconciled to the funding ledger by a *derived remainder* (`contributed - drawn - takeout`), which can never fail. | `src/184` | $426,569 on the audit deal was visible only inside one lump "after funding" figure | Contributions are reconciled to three named parts, each from its own engine, with ties (section 6) |

### 2.3 Legitimate financing behavior (correct; now asserted so nobody "fixes" it)

1. A facility balance above the committed amount when a ceiling is set: interest capitalizes up to the ceiling, principal never exceeds the commitment (section 4).
2. A fixed facility with a ceiling, equity-first funding and an unused-commitment fee.
3. Interest beyond the facility limit is paid currently, by the interest reserve first and then by equity. It is one *use*; the reserve draw and the equity are its two *sources*.
4. A reserve funded in month 1 is paid by the first equity, so it counts toward the equity-first amount and the loan starts drawing earlier. That is why capitalized interest falls and interest beyond the limit rises when a $1,000,000 reserve is added (Harbor: capitalized interest $3,185,837 to $2,349,711, principal draws $24,881,163 to $25,717,289, both always adding to the $28,067,000 commitment).
5. An operating reserve is drawn against the lease-up deficit in the ledger when there is one, and against the operating shortfall in the returns otherwise; what is left, and any held reserve, is released with the sale.
6. Takeout equity (section 6.1): the DSCR-sized permanent loan ($21,762,000) is $8,000 below the facility balance ($21,770,000) and its own 1.00% fee ($217,620) is also paid from the proceeds, so $225,620 is called from equity at takeout.
7. The lease-up operating shortfall (section 6.2): the partners fund the early negative months when they fall.
8. A sale between completion and stabilization (section 5), and, on the acquisition Sources & Uses page, capital called after closing shown as an explicit use and source.

### 2.4 Invalid configuration (now a failed check, not a result)

A hold that ends at or before the certificate of occupancy (section 5).

## 3. A. The $1,000,000 interest reserve, traced

Harbor Point with a $1,000,000 interest reserve funded at close.

* **Funded**: month 1, as the use "Initial Reserves Funded" ($1,000,000), paid by the month-1 equity ($9,700,000) like any other cost.
* **Capitalized**: never. The reserve is not part of the facility balance. The balance reaches its $28,067,000 limit in month 30, and from month 31 the interest can no longer capitalize.
* **Drawn**: months 31 to 36, $169,571 a month for five months and $152,143 in the sixth, $1,000,000 in all, against interest of $169,571 a month that has to be paid currently.
* **Double-counted**: only in the shared funding summary (section 2.1, M1).

| Surface | Before | After |
|---|---|---|
| Funding ledger (monthly engine) | equity $16,717,810 = equity-first $15,114,213 + overflow $399,167 + interest beyond the limit $2,204,429 - reserve draw $1,000,000 | unchanged |
| Monthly returns | equity drawn $16,717,810 | unchanged |
| Integrity `su` | passes | passes |
| Investor PDF | total project cost $45,784,810 = total sources $45,784,810 | unchanged (the line is relabelled "Interest beyond the loan limit (paid currently)") |
| Sources & Uses page, guide | uses $45,784,810, sources **$46,784,810**, equity **$18,717,810** | uses = sources = $45,784,810; equity $16,717,810 |
| Debt page | not affected; reconciliation rows could not fail | rows are real |
| ALL INPUTS TIE | fails: sources = uses, equity = engine, equity = returns | passes |

The same reserve sized smaller ($250,000, used up), larger ($5,000,000, the rest released at sale), funded at completion or in month 12, combined with a ceiling, as an operating or a held reserve, and several reserves at once are all in the suite. All pass.

## 4. B. Committed amount against permitted ceiling

* **Committed amount** (`commit`): the most principal that can be drawn. Sized from loan to cost or loan to value, or the fixed amount.
* **Permitted ceiling** (`balCap` = the larger of the commitment and the Facility Ceiling input): the most the balance, principal plus capitalized interest, may reach.
* With no ceiling input the two are the same figure. With one, the balance may legitimately exceed the commitment.

| Deal | Scenario | Committed amount | Permitted ceiling | Principal drawn | Capitalized interest | Peak balance | Balance above the commitment | Interest beyond the limit (paid currently) |
|---|---|---|---|---|---|---|---|---|
| Harbor | base | $28,067,000 | $28,067,000 | $24,881,163 | $3,185,837 | $28,067,000 | none | $1,224,583 |
| Harbor | conCeiling tight | $28,067,000 | $30,000,000 | $25,116,457 | $4,438,808 | $29,555,264 | $1,488,264 | $0 |
| Harbor | conCeiling loose | $28,067,000 | $1,000,000,000 | $25,116,457 | $4,438,808 | $29,555,264 | $1,488,264 | $0 |
| Harbor | fixed facility | $27,000,000 | $36,000,000 | $24,161,625 | $4,238,997 | $28,400,622 | $1,400,622 | $0 |
| Harbor | combo: fixed facility + equity first + refi + lease-up 24 | $27,000,000 | $36,000,000 | $27,000,000 | $6,394,133 | $33,394,133 | $6,394,133 | $0 |
| Audit dev | base | $21,770,000 | $21,770,000 | $19,751,107 | $2,018,893 | $21,770,000 | none | $664,786 |
| Audit dev | conCeiling tight | $21,770,000 | $25,000,000 | $19,936,830 | $2,694,180 | $22,631,010 | $861,010 | $0 |
| Audit dev | conCeiling loose | $21,770,000 | $1,000,000,000 | $19,936,830 | $2,694,180 | $22,631,010 | $861,010 | $0 |
| Audit dev | fixed facility | $22,500,000 | $30,000,000 | $20,606,605 | $2,802,209 | $23,408,815 | $908,815 | $0 |
| Audit dev | combo: fixed facility + equity first + refi + lease-up 24 | $22,500,000 | $30,000,000 | $22,500,000 | $4,896,534 | $27,396,534 | $4,896,534 | $0 |

The eight previously failing variants are the group B rows of the table in section 7. Each failed only the mis-specified `commit` tie (test defect T1); each now passes every tie and every independent check.

## 5. C. The shortened hold

Two different things were behind the "shortened hold" failure.

| Region | Treatment | Why |
|---|---|---|
| **Hold ends at or before completion** (month of the certificate of occupancy) | **Invalid configuration.** Integrity check `hold_co` fails (hard), ERROR conflict `dev.hold-before-completion`, so ALL INPUTS TIE fails and the deal is not decision-grade | The sale is priced on the next twelve months of income of a building that is not finished. The audit deal sold at month 24 is worth $3.2 million against $20.9 million of debt: the partners put in $29.7 million and get nothing back, the IRR is undefined and the multiple is 0.00x (sold at month 12, the "value" is negative). On main, a 2-year hold *passed* ALL INPUTS TIE while showing exactly that |
| **Hold between completion and stabilization** | **Valid.** The sale repays the construction loan and no takeout happens. Stays a disclosed warning (`w_sale`) | The engine is built for it. What failed was a *check* (T2): it expected a takeout equity call that cannot happen |
| **Hold after stabilization** | Normal | Unchanged |

Before and after, where they differ:

| Deal | Hold | Region | Before | After |
|---|---|---|---|---|
| Audit dev | 1 year (month 12) | ends at or before completion (month 24) | ALL INPUTS TIE FAILS; IRR undefined, 0.00x; failed checks: unlev_irr; conflict: none | ALL INPUTS TIE FAILS; IRR undefined, 0.00x; failed checks: hold_co, unlev_irr; conflict: dev.hold-before-completion |
| Audit dev | 2 years (month 24) | ends at or before completion (month 24) | ALL INPUTS TIE reads OK; IRR undefined, 0.00x; failed checks: none; conflict: none | ALL INPUTS TIE FAILS; IRR undefined, 0.00x; failed checks: hold_co; conflict: dev.hold-before-completion |
| Audit dev | 3 years (month 36) | completion to stabilization (month 38) | ALL INPUTS TIE FAILS; IRR 11.07%, 1.29x; failed checks: eqret; conflict: dev.takeout-shortfall | ALL INPUTS TIE reads OK; IRR 11.07%, 1.29x; failed checks: none; conflict: none |
| Harbor | 1 year (month 12) | ends at or before completion (month 26) | ALL INPUTS TIE FAILS; IRR undefined, 0.00x; failed checks: unlev_irr; conflict: none | ALL INPUTS TIE FAILS; IRR undefined, 0.00x; failed checks: hold_co, unlev_irr; conflict: dev.hold-before-completion |
| Harbor | 2 years (month 24) | ends at or before completion (month 26) | ALL INPUTS TIE reads OK; IRR undefined, 0.00x; failed checks: none; conflict: none | ALL INPUTS TIE FAILS; IRR undefined, 0.00x; failed checks: hold_co; conflict: dev.hold-before-completion |
| Harbor | 3 years (month 36) | completion to stabilization (month 43) | ALL INPUTS TIE reads OK; IRR 32.68%, 2.11x; failed checks: none; conflict: none | ALL INPUTS TIE reads OK; IRR 32.68%, 2.11x; failed checks: none; conflict: none |

After, every hold from 1 to 10 years on both development deals:

**Audit development deal**

| Hold | Month | Region | Levered IRR | Multiple | ALL INPUTS TIE | Failed integrity checks | Warnings | Conflict raised |
|---|---|---|---|---|---|---|---|---|
| 1 | 12 | ends at or before completion (month 24) | undefined | 0.00x | FAILS | hold_co, unlev_irr | w_sale, irr, wf_lpirr | dev.hold-before-completion |
| 2 | 24 | ends at or before completion (month 24) | undefined | 0.00x | FAILS | hold_co | w_sale, irr, wf_lpirr | dev.hold-before-completion |
| 3 | 36 | completion to stabilization (month 38) | 11.07% | 1.29x | ties | none | w_interest, w_overflow, w_sale | none |
| 4 | 48 | after stabilization | 11.24% | 1.43x | ties | none | w_interest, w_overflow | dev.takeout-shortfall |
| 5 | 60 | after stabilization | 11.03% | 1.56x | ties | none | w_interest, w_overflow | dev.takeout-shortfall |
| 6 | 72 | after stabilization | 10.87% | 1.71x | ties | none | w_interest, w_overflow | dev.takeout-shortfall |
| 7 | 84 | after stabilization | 10.75% | 1.87x | ties | none | w_interest, w_overflow | dev.takeout-shortfall |
| 8 | 96 | after stabilization | 10.64% | 2.03x | ties | none | w_interest, w_overflow | dev.takeout-shortfall |
| 9 | 108 | after stabilization | 10.55% | 2.20x | ties | none | w_interest, w_overflow | dev.takeout-shortfall |
| 10 | 120 | after stabilization | 10.47% | 2.39x | ties | none | w_interest, w_overflow | dev.takeout-shortfall |

**Harbor Point**

| Hold | Month | Region | Levered IRR | Multiple | ALL INPUTS TIE | Failed integrity checks | Warnings | Conflict raised |
|---|---|---|---|---|---|---|---|---|
| 1 | 12 | ends at or before completion (month 26) | undefined | 0.00x | FAILS | hold_co, unlev_irr | w_overflow, w_sale, irr, wf_lpirr | dev.hold-before-completion |
| 2 | 24 | ends at or before completion (month 26) | undefined | 0.00x | FAILS | hold_co | w_overflow, w_sale, irr, wf_lpirr | dev.hold-before-completion |
| 3 | 36 | completion to stabilization (month 43) | 32.68% | 2.11x | ties | none | w_interest, w_overflow, w_sale | none |
| 4 | 48 | after stabilization | 33.09% | 2.71x | ties | none | w_interest, w_overflow | none |
| 5 | 60 | after stabilization | 27.75% | 2.93x | ties | none | w_interest, w_overflow | none |
| 6 | 72 | after stabilization | 24.43% | 3.16x | ties | none | w_interest, w_overflow | none |
| 7 | 84 | after stabilization | 22.19% | 3.40x | ties | none | w_interest, w_overflow | none |
| 8 | 96 | after stabilization | 20.58% | 3.65x | ties | none | w_interest, w_overflow | none |
| 9 | 108 | after stabilization | 19.36% | 3.92x | ties | none | w_interest, w_overflow | none |
| 10 | 120 | after stabilization | 18.41% | 4.19x | ties | none | w_interest, w_overflow | none |

Levered IRR and multiple are identical before and after for every hold. Only the verdicts and warnings changed.

## 6. D. Equity reconciliation

Contributions in the returns reconcile to three named parts, each from its own engine, and the suite checks the bridge in all 142 development scenarios.

| Audit development deal | |
|---|---|
| Equity at funding (funding ledger, Sources & Uses) | $12,611,378 |
| + Takeout equity (month 38) | $225,620 |
| + Lease-up operating shortfall (months 24 to 29) | $426,569 |
| = Contributed in the returns | **$13,263,567** |
| Waterfall: LP $11,937,210 + GP $1,326,357 (GP 10.00%, the Partnership share) | $13,263,567 |

| Harbor Point | |
|---|---|
| Equity at funding | $16,574,091 |
| + Takeout equity (none: the construction loan is held to sale) | $0 |
| + Lease-up operating shortfall (months 26 to 29) | $208,366 |
| = Contributed in the returns | **$16,782,457** |
| Waterfall: LP $15,104,211 + GP $1,678,246 | $16,782,457 |

### 6.1 The $225,620 takeout equity: legitimate and correct

Sized again from the inputs, independently of the takeout engine (the permanent loan terms are the deal's defaults: 65% loan to value, 1.25x debt service coverage, 6.75%, 30-year amortization, 1.00% fee, no debt-yield test; growth 3%, exit cap 5.25%):

| Step | Engine | Independent |
|---|---|---|
| Forward 12-month NOI, months 39 to 50 | $2,117,279 | $2,117,279 |
| Loan to value limit (value $40,329,124 at 5.25%) | $26,213,930 | $26,213,930 |
| Debt service coverage limit | $21,762,619 | $21,762,619 |
| Permanent loan = the lowest (DSCR binds), floored to $1,000 | $21,762,000 | $21,762,000 |
| Permanent fee 1.00% | $217,620 | $217,620 |
| Construction balance at stabilization (the full commitment) | $21,770,000 | $21,770,000 |
| Shortfall = $21,770,000 + $217,620 - $21,762,000 | **$225,620** | **$225,620** |

It is called in month 38, the stabilization month, together with that month's $37,145 equity draw ($262,765 contributed). Its status: legitimate and correctly calculated. The Debt page and the second-capital-call warning already showed it, but the funding views carried it inside one lump "after funding" figure; it now has its own line, its own tie (to the loan sizing) and its own row on the Sources & Uses page. With a sale before stabilization it is correctly not called.

### 6.2 The $426,569 operating shortfall: legitimate cash, previously missing from the funding views

| Month | Operating shortfall | Negative NOI | Asset-management fee |
|---|---|---|---|
| 24 | $123,333 | $123,333 | $0 |
| 25 | $102,438 | $102,220 | $218 |
| 26 | $81,542 | $81,107 | $435 |
| 27 | $60,647 | $59,994 | $653 |
| 28 | $39,752 | $38,881 | $871 |
| 29 | $18,856 | $17,768 | $1,088 |
| **Total** | **$426,569** | **$423,304** | **$3,265** |

* It is real cash. The building is completed in month 24 and loses money until month 30; the partners fund each month as it falls and receive the later surplus. The returns show contributions and distributions gross, never netted.
* It is not in the funding ledger because the ledger funds the *net cumulative* lease-up deficit: the 14 lease-up months lose $423,304 and then earn $617,928, a net **+$194,624**, so the ledger deficit is $0. The same pattern on Harbor: $208,366 lost in months 26 to 29, net +$1,600,085 over 17 months, ledger deficit $0.
* Status: **legitimate and correctly calculated, but missing from Sources & Uses**. It is now an explicit part (`opShort` on each returns row), tied to the contributions and shown with its months and basis in the "Capital Called After Funding" table. The ledger convention itself is left as it is (section 9, decision 1).

## 7. E. Scenario suite

`audit/funding_scenarios_test.js` is registered as audit section 72 in `audit/run_all.sh` (the parallel runner's coverage guard counts 72 sections, 73 command lines). Each scenario is evaluated with `bkRunWith`, so no saved state is touched, and then checked from the engines' raw monthly output with the test's own arithmetic.

**Coverage**: construction sizing (LTC, loan to stabilized value, rate, fees, utilisation), schedule (construction, lease-up, pre-development), facility structure (ceiling above or at the commitment, fixed amount, equity-first, unused-commitment fee, no loan), initial reserves (interest, operating, held; smaller and larger than the need; at close, completion or a month; several at once), takeout (none, shortfall, cash-out, debt-yield bound, interest-only), budget modes, GP share and waterfall terms, a hold sweep of 1 to 10 years, and the acquisition modes (LTV, LTC, DSCR, rate, interest-only, amortization, fees, rate cap, no debt, refinance at maturity, balloon), plus combinations. A coverage guard fails the suite if a case it claims to exercise is never reached (for example, an operating reserve drawn in the ledger, a ceiling that lets the balance pass the commitment, a takeout shortfall that is never called).

**Independent checks per development scenario**: cost and fees from the months against the budget; each month's need equals equity + draw + overflow + operating reserve; interest rolled forward month by month (opening balance x rate / 12, capitalized only up to the ceiling) with the balance rolling forward; principal against the committed amount; balance against the ceiling; the committed amount sized again from the inputs; the equity-first rule (no loan draw before the equity target); reserve conservation (funded = drawn + released, never drawn before funded); Sources = Uses built from the months and compared with the page lines, the guide and the investor PDF tables; equity four ways (the Sources lines, the engine, the returns draws, and uses less facility less reserve draws); contributions = equity + takeout + operating shortfall with the permanent loan and its shortfall sized again from the inputs; the monthly cash flow rebuilt from its parts; sale and debt repaid; the waterfall's contributions and distributions against the returns and the GP share; an independent XIRR and multiple. Acquisition scenarios check the loan, fee, Sources & Uses, month-1 equity, capital after closing, the waterfall and the returns.

**Mutations the suite must catch** (all caught): a reserve draw doubled; $5,000 of extra equity in the returns; the operating shortfall dropped from the rows; a takeout shortfall misstated by $10,000; a committed amount the inputs do not size; interest capitalized $500,000 past the ceiling; and, on the Debt page, a tampered facility (the reconciliation rows must show VARIANCE and OVER CEILING). A harness check proves no state carries from one scenario to the next.

### Before and after for every scenario that failed on main

Group A is the interest reserve, B the facility and ceiling variants, C the hold period (the 13 scenarios that failed in the original sweep are A: 4, B: 8, C: 1; Harbor's 3-year hold passed then and still does). "Extra" rows are scenarios this suite added that also failed on main. Positive "sources - uses" is the amount by which the Sources & Uses page's sources exceeded its uses.

| Group | Deal | Scenario | Before: failing | Before: sources - uses | Before: equity shown - engine | After | After: sources - uses | After: equity shown - engine |
|---|---|---|---|---|---|---|---|---|
| A | Audit dev | combo: LTC 0.75 + rate 0.10 + construction 30 + reserves + gp 0.25 | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| A | Audit dev | initial reserves 1M funded at close (interest) | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 44/44 suite checks | $0 | $0 |
| A | Harbor | combo: LTC 0.75 + rate 0.10 + construction 30 + reserves + gp 0.25 | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 35/35 suite checks | $0 | $0 |
| A | Harbor | initial reserves 1M funded at close (interest) | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 43/43 suite checks | $0 | $0 |
| B | Audit dev | combo: fixed facility + equity first + refi + lease-up 24 | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| B | Audit dev | conCeiling loose | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 33/33 suite checks | $0 | $0 |
| B | Audit dev | conCeiling tight | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 43/43 suite checks | $0 | $0 |
| B | Audit dev | fixed facility | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 44/44 suite checks | $0 | $0 |
| B | Harbor | combo: fixed facility + equity first + refi + lease-up 24 | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 35/35 suite checks | $0 | $0 |
| B | Harbor | conCeiling loose | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 33/33 suite checks | $0 | $0 |
| B | Harbor | conCeiling tight | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 42/42 suite checks | $0 | $0 |
| B | Harbor | fixed facility | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 43/43 suite checks | $0 | $0 |
| C | Audit dev | holdYears 3 | equity in returns = ledger (integrity eqret) | $0 | $0 | all ties pass; no failed check; 45/45 suite checks | $0 | $0 |
| C | Harbor | holdYears 3 | nothing: ALL INPUTS TIE read OK | $0 | $0 | all ties pass; no failed check; 44/44 suite checks | $0 | $0 |
| extra | Audit dev | combo: interest reserve + ceiling at the commitment + refi + gp 0.2 | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Audit dev | combo: operating + interest reserves + fixed facility + takeout | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Audit dev | conCeiling 5% above the committed amount | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 33/33 suite checks | $0 | $0 |
| extra | Audit dev | holdYears 1 (invalid configuration) | unlevered IRR calculated | $0 | $0 | FAILS by design: hold runs past completion; unlevered IRR calculated | $0 | $0 |
| extra | Audit dev | interest + operating + held reserves | sources = uses; equity shown = engine equity; equity shown = returns draws | $750,000 | $1,500,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Audit dev | interest reserve 1M + ceiling at the committed amount | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 44/44 suite checks | $0 | $0 |
| extra | Audit dev | interest reserve 1M funded at completion | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Audit dev | interest reserve 1M funded in month 12 | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Audit dev | interest reserve 250k (smaller than the interest: used up) | sources = uses; equity shown = engine equity; equity shown = returns draws | $250,000 | $500,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Audit dev | interest reserve 5M (larger than the interest: the rest is released at sale) | sources = uses; equity shown = engine equity; equity shown = returns draws | $2,585,188 | $5,170,375 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Audit dev | lease-up 3 months + operating reserve 50k | equity shown = engine equity; equity shown = returns draws | $0 | $50,000 | all ties pass; no failed check; 33/33 suite checks | $0 | $0 |
| extra | Audit dev | LP-only preferred return | promote check (integrity wf_promote) | $0 | $0 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Audit dev | operating reserve 200k with 30% vacancy (lease-up deficit funded, reserve drawn) | equity shown = engine equity; equity shown = returns draws | $0 | $200,000 | all ties pass; no failed check; 44/44 suite checks | $0 | $0 |
| extra | Harbor | combo: interest reserve + ceiling at the commitment + refi + gp 0.2 | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Harbor | combo: operating + interest reserves + fixed facility + takeout | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Harbor | conCeiling 5% above the committed amount | tie "facility drawn + capitalized interest within the commitment" (wrong limit) | $0 | $0 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Harbor | holdYears 1 (invalid configuration) | unlevered IRR calculated | $0 | $0 | FAILS by design: hold runs past completion; unlevered IRR calculated | $0 | $0 |
| extra | Harbor | interest + operating + held reserves | sources = uses; equity shown = engine equity; equity shown = returns draws | $750,000 | $1,500,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Harbor | interest reserve 1M + ceiling at the committed amount | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 43/43 suite checks | $0 | $0 |
| extra | Harbor | interest reserve 1M funded at completion | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Harbor | interest reserve 1M funded in month 12 | sources = uses; equity shown = engine equity; equity shown = returns draws | $1,000,000 | $2,000,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Harbor | interest reserve 250k (smaller than the interest: used up) | sources = uses; equity shown = engine equity; equity shown = returns draws | $250,000 | $500,000 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |
| extra | Harbor | interest reserve 5M (larger than the interest: the rest is released at sale) | sources = uses; equity shown = engine equity; equity shown = returns draws | $4,053,403 | $8,106,805 | all ties pass; no failed check; 34/34 suite checks | $0 | $0 |

Failing items in the "before" column are the funding ties and integrity checks that read FAIL on main. On main a 2-year hold is not in this table because nothing failed: it read OK with an undefined IRR.

## 8. How S&U, funding, contributed equity, the waterfall and the returns are verified independently

| Area | Independent evidence | Not independent (stated plainly) |
|---|---|---|
| Sources & Uses | Built from the monthly rows by the test and compared with the shared summary, the page, the guide and the PDF tables, line group by line group | The cost lines are the engine's budget |
| Funding | Identities and invariants every month; the commitment and equity-first target re-derived from the inputs | The allocation of a month's need between equity, draw and overflow is checked by invariants, not re-implemented from scratch |
| Contributed equity | Three-part bridge; permanent loan and shortfall re-derived from forward NOI; cash flow rebuilt from components | The forward-NOI convention (months stab + 1 to stab + 12, stepping by operating year) is the model's own and is copied into the test |
| Waterfall | LP + GP contributions and distributions against the returns; GP share; the integrity layer's hurdle replay and LP IRR | The tier mechanics are covered by `wfcheck_test.js` |
| Returns | Own XIRR (calendar days / 365, closing-day split, bisection) and multiple; sale = gross x (1 - selling cost); debt repaid = outstanding balance | |

Scope limits: three decks (Harbor Point, the audit development deal, the acquisition deal), one closing date, no unit-level lease-up variant, no deal built from an imported OM.

## 9. Decisions taken (after review of this report)

1. **Lease-up funding convention: the peak is not funded.** Net funding treatment is kept; the unfunded interim cash requirement is disclosed, not hidden. The distinction matters: the *net* deficit is the cumulative shortfall after positive operating cash flow offsets it; the *peak* deficit is the most cash outstanding before later operating cash flow arrives. Funding the peak in the schedule would change the timing and amount of contributed capital, and with it the returns and the waterfall, and must not be done merely to make Sources & Uses match another figure. The $426,569 (audit deal; $208,366 for Harbor) is therefore a separate **operating cash requirement**, visible on Sources & Uses with its funding source identified (the partners, LP and GP), tied (`capOperating`) and counted in total contributed equity. Implemented in the capital-measures branch (`CAPITAL_MEASURES.md` section 1.3).
2. **Acquisition Sources & Uses: the post-closing capital call stays a separate row.** The two totals are not forced to match. *Closing Sources & Uses* is the capital and debt required at closing (`TOTAL USES AT CLOSING`, `TOTAL SOURCES AT CLOSING`). *Total project capitalization* is the closing funding plus the capital called after closing, shown beside it with each call as its own row. Both are legitimate and the page says which is which (`CAPITAL_MEASURES.md` section 1.4).
3. **A permanent modeling convention** distinguishes four measures throughout BK Capital: closing equity, total contributed equity, operating cash requirement and total project capitalization (`CAPITAL_MEASURES.md`). They reconcile to the underlying cash flows and are never forced to equal one another.

Still open (unchanged by these decisions): the audit time added by the scenario section (about 75 seconds of one parallel worker; the capital-measures section adds about the same).

## 10. Files

`src/184-bk-funding-summary.js` (reserve lines, equity from its own lines, commit and ceiling ties, contribution parts, takeout tie), `src/019-bk-functional-v12.js` (`opShort` on the returns rows), `src/018-bk-functional-v09.js` (`takeoutInHold`), `src/178-bk-integrity.js` (`eqret`, `hold_co`), `src/129-bk-v29140-conflicts.js` (`dev.hold-before-completion`, takeout warning), `src/118-bk-cr-v325.js` (Sources & Uses page), `src/158-bk-v29330-guide.js` (guide), `src/084-bk-wave3a-construction.js` (Debt page), `src/145-bk-v29270-report.js` (investor PDF), `src/169-bk-wfchecks.js` (promote check), `audit/funding_scenarios_test.js` (new), `audit/tie_test.js` and `audit/conflicts_test.js` (checks added, none removed or weakened), `audit/run_all.sh`, `audit/README.md`.
