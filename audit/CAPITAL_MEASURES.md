# Capital measures: the modeling convention

BK Capital explains not only how much money a deal needs, but **when** it needs it, **who** supplies it and **how it affects investor returns**. Four different questions are asked about the money in a deal, and each has its own number. Two further amounts are disclosed beside them under their own names, so that none of the four is ever stretched to cover them. This convention keeps them apart. It is permanent: a new page, report, export or calculation that shows any of them follows it.

| Name (exactly) | The question it answers | Short form |
|---|---|---|
| **Closing equity** (a development deal: **Initial funding equity**) | How much equity is required at closing (a development: to fund the project through its funding schedule)? | Equity required at closing |
| **Total contributed equity** | How much GP and LP capital was actually put in? | All GP and LP capital actually contributed |
| **Operating cash requirement** | How much net interim cash does the deal need to fund operating shortfalls? | Net interim cash needed to fund operating shortfalls |
| **Total project capitalization** | What are all the sources of capital over the life of the investment? | All sources of capital over the investment lifecycle |

and the two disclosures:

| Name (exactly) | What it discloses | Short form |
|---|---|---|
| **Unfunded interim cash requirement** | Any additional peak or interim cash the partners must supply after closing that the modeled funding does not cover | Interim cash needed beyond the modeled funding |
| **Post-closing capital calls** | The capital called from the partners after closing (a separate acquisition measure; it is part of total contributed equity) | Capital called after closing |

The four measures are **reconciled** to the cash flows they are made of. They are **never forced to equal one another**: they are different measures, and an unlike pair that happens to differ is not an error. A reader should never have to ask which one a page means, and one name never stands for two numbers.

## 1. Definitions

All of them are computed once, in `bkFundingSummary().measures` (`src/184-bk-funding-summary.js`), from the engines' own output. Their names are defined once, in `window.BK_CAPITAL_TERMS` (same file); the development name of the closing equity is read with `bkCapName('closingEquity', true)`. No page, report or test recomputes them.

### 1.1 Closing equity (a development deal: Initial funding equity)

Equity required at closing.

* **Development:** the equity lines of Sources & Uses: equity-first funding, cost overflow beyond the commitment, and interest beyond the facility limit after any interest reserve. It is called through the funding schedule (month 1 to the last month with an equity draw), not necessarily all in month 1, which is why a development deal calls it **Initial funding equity**. It is the same number as before; only the name differs, on every development page, report and export.
* **Acquisition:** total uses at closing (purchase price, closing costs, acquisition fee, loan origination fee and any rate cap premium) less the acquisition loan. All of it is paid in month 1. The name stays **Closing equity**.
* Where one table mixes both kinds of deal (the portfolio pages), the header is "Closing / initial funding equity".
* Reconciled by `eqEngine` (equals the funding engine's equity total) and `eqReturns` (equals the equity drawn in the returns cash flow) for development; by `su` for an acquisition.

### 1.2 Total contributed equity

All GP and LP capital actually contributed over the hold: the sum of the contributions in the monthly returns cash flow, which is what the levered IRR, the equity multiple and the equity waterfall are measured on. It is gross: contributions are never netted against distributions.

* **Total contributed equity = Closing equity (a development: Initial funding equity) + Post-closing capital calls.**
* The post-closing capital calls are, for a development deal, the **takeout equity** (the permanent loan is short of the construction payoff and fee) plus the **unfunded interim cash requirement called from the partners**; for an acquisition, the **refinance shortfall**, the **balloon equity** at loan maturity and the operating shortfalls.
* Split into LP and GP by the waterfall (`measures.totalContributedEquity.lp / .gp`). The GP share is the partnership's GP equity share; it is separate from the GP's share of the profit (preferred return, catch-up and promote tiers).
* Reconciled by `capContrib` (closing equity + calls), `contrib` (development: the returns equal funding equity + takeout equity + operating shortfall) and `wfReturns` (the waterfall's LP + GP equal the returns).
* This is the equity the bottom band of every page shows ("Total contributed equity"), not the closing equity.

### 1.3 Operating cash requirement (net)

**Net** interim cash needed to fund operating shortfalls.

* **Development:** the net lease-up funding the schedule carries. The lease-up deficit in the funding ledger is the *net* cumulative lease-up result: later income offsets the early losses. It is a use in Sources & Uses ("Lease-Up Operating Deficit") and is funded there. That net amount, and only that, is the operating cash requirement (`measures.operatingCashRequirement.amount = .inFunding`). It is reconciled to the funding ledger's lease-up column by the tie `opFunding`. **Gross operating shortfalls are not added to it**, to avoid counting the same dollars twice.
* **Acquisition:** an acquisition has no funding schedule, so nothing is funded in Sources & Uses. The operating cash requirement is the part of the capital called after closing that is not a refinance shortfall or balloon equity.
* The existing net lease-up funding methodology is unchanged. The number the audit development deck used to show here ($426,569) was the net amount plus the gross interim months; the gross interim amount is now disclosed under its own name (1.4), and the net amount alone is the operating cash requirement ($0 on that deck, because the lease-up result is net positive over the 14 months).

### 1.4 Unfunded interim cash requirement (a disclosure)

Any additional peak or interim cash requirement not covered by the modeled funding.

* Outside the funding schedule, the month's operating cash before the operating reserve and before any call (NOI less fees and debt service, plus takeout, sale and payoff cash, less leasing capital). The months with a shortfall add up to the unfunded interim requirement; the **peak cumulative deficit** (`peakCumulative`) is the most cash outstanding at any month before later operating cash flow repays it.
* **Who funds it.** The partners (a call, which adds to total contributed equity and the waterfall), the operating reserve (its net use), and, when the funding schedule and the returns both draw on the same operating reserve, a reserve draw repaid out of a month with surplus cash (the partners receive that much less; it is not a call). `partners + operating reserve + netted against distributions = the unfunded interim requirement`, tie `capOperating`.
* **It is disclosed beside the operating cash requirement and never added to it.** The two are not summed anywhere in the app.
* **It is not funded in Sources & Uses.** Net funding treatment is kept. Funding the peak deficit in the schedule would change the timing and amount of contributed capital, and with it the returns and the waterfall; it must not be done merely to make Sources & Uses match another figure. It stays visible as its own measure, with its funding source named.
* An acquisition's value is $0 (no funding schedule: its operating shortfalls are in the operating cash requirement and the post-closing calls).

### 1.5 Post-closing capital calls

The capital called from the partners after closing. A separate measure, kept for both kinds of deal, and part of total contributed equity.

* A development's calls: the takeout equity and the unfunded interim cash requirement called from the partners. An acquisition's: the refinance shortfall, balloon equity and operating shortfalls.
* `measures.postClosingCapitalCalls.amount`, with the list of calls (`calls`) by kind and month. Reconciled by `capContrib`; the closing-view and lifecycle-view totals differ by exactly this amount (`capTotal`).

### 1.6 Total project capitalization

All sources of capital over the investment life.

* **Total project capitalization = facility (or loan) + reserve draws + total contributed equity**, and equally **= the closing sources + the post-closing capital calls**.
* The **closing** view is Sources & Uses: capital and debt required at acquisition or development closing. The **lifecycle** view adds the later capital calls. Both are legitimate and both are shown, on the same page, so the distinction is unmistakable. They differ by exactly the post-closing capital calls (tie `capTotal`); when nothing is called after closing, they are the same number.
* Sources & Uses totals keep their own labels (`TOTAL USES`, `TOTAL SOURCES`; for an acquisition `TOTAL USES AT CLOSING`, `TOTAL SOURCES AT CLOSING`). Total project capitalization is never given those labels.

### 1.7 The acquisition rule for post-closing capital calls

An acquisition has no funding schedule, so a call is a month's contribution above the closing draw. When a month's call coincides with a refinance shortfall or balloon equity, the call is attributed to those events first (pro rata between them); what is left is the operating cash requirement. The rule is applied in `bkFundingSummary` and again, independently, in `funding_scenarios_test.js`.

## 2. How they relate

```
Closing equity (a development: Initial funding equity)  ┐
+ takeout equity                                         │  post-closing capital calls
+ unfunded interim cash called from the partners         ┘  (acquisition: refinance shortfall, balloon equity, operating)
= Total contributed equity                      (the returns and the waterfall)

Closing sources (Sources & Uses total)
+ post-closing capital calls
= Total project capitalization
= facility + reserve draws + Total contributed equity

Operating cash requirement (net)
= the net lease-up funding in Sources & Uses            (development)
= the operating calls after closing                     (acquisition)

Unfunded interim cash requirement                       (disclosed beside it, never added to it)
= partners' calls + operating reserve (net) + reserve repaid from surplus cash
partners' calls ⊂ post-closing capital calls ⊂ Total contributed equity
```

Not required, and not true in general: Closing equity = Total contributed equity; Sources & Uses total = Total project capitalization; Operating cash requirement = any equity figure; Operating cash requirement + Unfunded interim cash requirement = anything (they are not summed).

## 3. Worked figures (from the audit decks; the relationships behind every row are asserted by the tests in every scenario)

| | Audit development deal | Harbor Point | Acquisition deal | Acquisition, refinance shortfall + $150k rate cap |
|---|---:|---:|---:|---:|
| Closing equity (development: Initial funding equity) | $12,611,378 | $16,574,091 | $11,427,270 | $11,577,270 |
| Takeout equity / refinance shortfall | $225,620 | none | none | $4,576,257 |
| **Operating cash requirement** (net) | **$0** | **$0** | none | none |
| **Unfunded interim cash requirement** | **$426,569** (months 24 to 29) | **$208,366** (months 26 to 29) | none | none |
| Post-closing capital calls | $652,189 | $208,366 | none | $4,576,257 |
| **Total contributed equity** | **$13,263,567** (LP $11,937,210, GP $1,326,357) | **$16,782,457** | **$11,427,270** | **$16,153,527** |
| Closing sources (Sources & Uses total) | $34,381,378 | $44,641,091 | $24,854,270 | $25,004,270 |
| **Total project capitalization** | **$35,033,567** | **$44,849,457** | **$24,854,270** | **$29,580,527** |
| Unfunded interim cash requirement (peak cumulative) | $426,569 | $208,366 | none | none |

The audit development deal: $34,381,378 closing sources + $652,189 post-closing capital calls = $35,033,567 = $21,770,000 construction facility + $13,263,567 total contributed equity. The net lease-up deficit carried in Sources & Uses is $0 (the 14 lease-up months lose $423,304 and then earn $617,928), so the operating cash requirement is $0; the unfunded interim cash requirement is $426,569 and the partners supply it.

An edge case, lease-up 3 months with a $50,000 operating reserve: the funding schedule carries a $74,417 lease-up deficit, the reserve being drawn there. That net $74,417 is the operating cash requirement. After closing the unfunded interim cash requirement is $3,047, funded $2,658 by a partner call and $389 by a reserve draw repaid out of the following month's surplus cash. The two are shown separately; $74,417 + $3,047 is not a measure.

## 4. Naming rules

1. **Use exactly these names** for these quantities. Read them from `BK_CAPITAL_TERMS`; do not retype them in a page that has the registry. A development deal's closing equity is read with `bkCapName('closingEquity', true)` ("Initial funding equity").
2. **A name always means one number.** A row, tile, sidebar line or report line named by one of them shows that measure. `capital_measures_test.js` checks this on every sheet, the investor PDF and the schedule report.
3. **Do not use a generic equity name for a measure.** Refused on every page and report: `Equity Required`, `Equity Requirement`, `Peak Equity`, `Peak / Initial Equity`, `Total Equity` (also `Total Equity Called / Invested / Contributions`), `Equity at funding`, `Equity called`, `Equity contributed`, `Equity invested`, `Total LP/GP Equity`. A legacy name from the source workbook is shown qualified, for example `Closing equity (workbook: Peak / Initial Equity)`. The bottom band and the Deal Snapshot do not show a bare "Equity": they show **Total contributed equity**.
4. **A development deal never shows "Closing equity"** (the page, report and export labels all say **Initial funding equity**); an acquisition never shows "Initial funding equity".
5. **Phrases that describe an event are fine**, because they say which event: `equity required at takeout`, `Refinance shortfall`, `Balloon equity at loan maturity`, `Takeout equity`, and, for the closing equity under an alternative structure, `Required / Least / Maximum equity at closing` (Financing Compare, Pre-Offer Bid). Per-period cash-flow rows are `Equity contributions`; their total is the Total contributed equity.
6. **Other measures keep their own names and are not these**: `Peak net equity outstanding` and `Net capital calls` (Liquidity: net of distributions, month by month), `Equity multiple`, `Equity left in the deal` (value of the retained property less the permanent loan, after a takeout).
7. **A measure is read, never recomputed.** If a page needs a number that is one of these, it reads `bkFundingSummary().measures`. If it needs a new one, extend `bkFundingSummary` and its ties.
8. **The operating cash requirement and the unfunded interim cash requirement are never summed or shown as one number.**

## 5. Where each surface reads them

* **Sources & Uses** (`src/118-bk-cr-v325.js`, `capTables`): "Capital Measures" (the four plus the two disclosures, the question each answers, what it reconciles to, status), "Capitalization Over the Life of the Deal" (each source of capital, when, LP and GP, who supplies it, closing sources and total project capitalization separately) and, for development, "Operating cash requirement" (the net view in the funding schedule, the unfunded interim cash requirement, who funds it, peak). The acquisition page's tables are labelled "at closing".
* **Step-by-step guide** (`src/158`), **Home** and the **Deal Snapshot** tie indicator, the **bottom band**, **Returns** (Key Economics at Exit), **Liquidity**, **Debt** (development: a Development Debt Summary sidebar), **Dev Draws**, **Model Checks**, **Capital Calls** (portfolio), the pro forma, the editor summaries, the registry's comparison column, Financing Compare and Pre-Offer Bid.
* **Investor PDF** (`src/145`), the **development schedule report** (`src/177`) and the **development report extra** (`src/179`).
* **Integrity** (`src/178`, `bkIntegrity`) and **ALL INPUTS TIE** (`bkAllInputsTie`) carry the ties `capContrib`, `capTotal`, `capOperating` and `opFunding`, so a figure that stops reconciling shows on Home.

## 6. How it is enforced

* `audit/capital_measures_test.js`: the registry; the shared calculation names and reconciles the measures; every sheet of the Harbor Point, audit development and acquisition decks, key sheets of four variants, the investor PDF and the development schedule report are rendered and scanned for ambiguous labels, for rows named by a measure that carry a different number, for "Closing equity" on a development page, and for a bare "Equity" tile in the bottom band or the sidebar; no reconciliation chip reads VARIANCE; the Sources & Uses pages keep the closing totals apart from the post-closing capital calls and total project capitalization.
* `audit/funding_scenarios_test.js`: in each of 180 scenarios, the measures are re-derived from the monthly output with the test's own arithmetic and required to equal the summary's, with their spans (the months), their LP and GP split and the call attribution: the operating cash requirement is the net lease-up funding only, the unfunded interim cash requirement is rebuilt from the months, and the post-closing calls are rebuilt by kind; the pages and the PDF show them under their names; eight mutations on the measures (a measure that leaves out the later calls, that includes the takeout, that omits the interim cash, that replaces the net view, a reserve repayment left out, a capitalization without the reserves, a renamed measure, an acquisition refinance call dropped) must each be caught.
* `audit/tie_test.js`, `audit/conflicts_test.js` and the Harbor stage tests read the same ties and the same page text.

## 7. Adding a page, report or export

1. Read `bkFundingSummary().measures` (and `.calls` for the calls by kind). Do not recompute.
2. Use the names from `BK_CAPITAL_TERMS` (`bkCapName` for a development deal's closing equity); if a row shows a figure that is one of them, name it that.
3. If you show two of them side by side, say why they differ (the sentence on the Sources & Uses page is the model).
4. Run `node audit/capital_measures_test.js index.html --list`; it renders the new page or report and names anything ambiguous.

## 8. Behavior to know

* **Operating reserve drawn twice for the same dollars.** When an operating reserve is large enough to be used by the funding schedule's lease-up deficit and a returns month before the schedule's last draw, the returns engine draws it in one month and repays it (a negative draw) in the months the schedule draws the rest. Net over the hold the reserve is conserved and no dollar is lost; the timing of up to the reserve amount of the partners' cash differs by a month or two. The measure reports it as "netted against later distributions" under the unfunded interim cash requirement. It was left as the engine has it: changing it moves contributions in the returns. It is asserted (scenario "lease-up 3 months + operating reserve 50k") so a change to it cannot go unnoticed.
* **Acquisitions have no operating reserve and no funding schedule**, so their operating cash requirement is what is called after closing that is not a refinance shortfall or balloon equity, their unfunded interim cash requirement is $0, and their peak cumulative deficit is not computed (shown as nothing).
* **Data exports keep their per-month column headers** (`Equity Draw`, `Refi Equity Shortfall`, `Equity` in the draw export): they are monthly series, not the measures, and carry no total under a measure's name.
* **The portfolio "Capital Calls" page** shows each deal's closing / initial funding equity, the post-closing capital calls and the total contributed equity; the later calls are not dated there.
* **The engine is unchanged by the naming decision.** The investor's return figures, Sources & Uses totals, closing equity, total contributed equity and total project capitalization are the same numbers as before; the only figure that moved is the development deck's operating cash requirement, which is now the net amount alone, with the gross interim amount disclosed as the unfunded interim cash requirement. On a development deck the bottom band now shows total contributed equity where it showed the closing equity.
