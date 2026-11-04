# BK Capital — roadmap to 10/10

Goal: a development underwriting platform that takes raw deal documents, builds a financial model independently, tests assumptions, identifies risks, compares opportunities and produces investor reporting that withstands scrutiny.
Overarching rule: **a deal must never look better than the quality of its information.** The platform should say what the broker claims, what the documents say, what the model calculates, what is missing, what failed, and what would have to change to make the deal work. It fails visibly instead of producing a misleading approval or return.

## Areas (✓ = done and tested)

1. **Financial engine integrity** *(critical)* — sources = uses ✓ (sheet, PDF, returns equity); unlevered IRR/multiple for development ✓; equity pays interest beyond the commitment ✓; remaining: capitalised-interest validation, budget-to-category tie, equity vs capital requirement, DSCR / debt yield / LTV validation, rounding rules, second-model verification (Harbor Point reference build is the first).
2. **Development budget and cost management** *(critical)* — configurable and custom hard/soft categories, contingency and reserves tracking, developer fees, budget vs actual, committed vs uncommitted, change orders.
3. **Financing engine** *(critical)* — fixed commitment and maximum facility, LTC/LTV/DSCR/debt-yield sizing, tranches, floating/fixed, SOFR floors/caps, unused fees, interest reserves, extensions, maturity, prepayment, permanent and construction-to-perm, multiple facilities.
4. **Operating and lease-up engine** — unit-level rents, growth by type, concessions, bad debt, expense categories, reassessment, monthly and annual operating cash flow, NOI reconciliation (derived, never forced).
5. **Partnership waterfall and equity structures** *(critical)* — contribution timing, classes, LP-only vs shared pref, compounding choice, catch-up rate vs profit allocation, IRR and multiple hurdles, refinance and sale distributions, self-reconciliation.
6. **Exit, refinance and hold** — a refinance-and-hold must remain a hold; per-unit/per-SF pricing, exit fees, phased dispositions.
7. **Sensitivity and risk** — what breaks a deal: break-even rent/occupancy/cap/cost, minimum DSCR and debt yield, maximum land price and budget, minimum equity, combined downside.
8. **Document ingestion and source intelligence** — OM, workbook, rent roll, T-12, budget, term sheet, appraisal; page/cell citations; confidence; conflict detection; broker-vs-document-vs-model discrepancy report; audited overrides.
9. **Investor reporting and comparison** — PDF is a faithful rendering of the engine; development snapshot ✓; Sources & Uses ✓; financing, timeline, lease-up, waterfall, exit, refinance, sensitivities, exceptions, source appendix, side-by-side comparison.
10. **Testing, controls, reliability** *(non-negotiable)* — tests on every PR, independent reference models, a regression test for every defect, gates for sources/uses, waterfall and credit exceptions, audit trail, versioned assumptions, role-based access.

## Sequence

1. **Trust the numbers** — engine, development snapshot, Sources & Uses, unlevered returns, waterfall, validation (in progress: stages A–C below).
2. Model real development deals — budget flexibility, financing, draws, operations, lease-up.
3. Sophisticated capital structures — waterfalls, refinancing, hold scenarios, multiple facilities.
4. Investment decision platform — sensitivities, downside, break-evens, comparison.
5. Ingestion advantage — extraction, attribution, discrepancy detection, confidence.
6. Institutional outputs — reporting, audit trail, security, production reliability.

## Acceptance standards

| Standard | Target |
|---|---|
| Financial accuracy | independent reconciliation of all material outputs |
| Deal coverage | ≥ 3 independently validated development structures, plus acquisition and refinance cases |
| Source traceability | every material imported assumption linked to its source |
| Validation | no silent failures or false approvals |
| Reporting | PDF and engine reconcile |
| Regression | all critical calculations under automated test |
| Flexibility | custom costs, debt structures, waterfalls and hold periods |

## Harbor Point stages (phase 1)

| Stage | Work | Status |
|---|---|---|
| A | Snapshot, Sources & Uses, takeout wording, unlevered returns, equity pays interest beyond commitment | built and tested; awaiting review |
| B | Waterfall hurdle replay, contribution tie, capitalised-interest validation, credit gate, independent reconciliation | next |
| C | Investor PDF: DSCR/debt yield/LTV, break-evens, unit mix, lease-up, financing and refinance, sensitivities | after B |
| D | Input-cell styling | awaiting photo approval |

Limits stay visible: until built, the product states that fixed loan sizing, reserves, contingency tracking, a 50% catch-up rate, LP-only preferred return and refinance-and-hold are not supported, rather than approximating them.
