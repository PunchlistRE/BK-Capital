# Capital measures: the modeling convention

BK Capital explains not only how much money a deal needs, but **when** it needs it, **who** supplies it and **how it affects investor returns**. Four different questions are asked about the money in a deal, and each has its own number. This convention keeps them apart. It is permanent: a new page, report, export or calculation that shows any of them follows it.

| Name (exactly) | The question it answers | Short form |
|---|---|---|
| **Closing equity** | How much equity is required at closing? | Equity required at closing |
| **Total contributed equity** | How much GP and LP capital was actually put in? | All GP and LP capital actually contributed |
| **Operating cash requirement** | How much interim cash does the deal need to cover operating shortfalls, and who funds it? | Interim cash needed to cover operating shortfalls |
| **Total project capitalization** | What are all the sources of capital over the life of the investment? | All sources of capital over the investment lifecycle |

The four are **reconciled** to the cash flows they are made of. They are **never forced to equal one another**: they are different measures, and an unlike pair that happens to differ is not an error. A reader should never have to ask which one a page means, and one name never stands for two numbers.

## 1. Definitions

All four are computed once, in `bkFundingSummary().measures` (`src/184-bk-funding-summary.js`), from the engines' own output. Their names are defined once, in `window.BK_CAPITAL_TERMS` (same file). No page, report or test recomputes them.

### 1.1 Closing equity

Equity required at closing.

* **Development:** the equity lines of Sources & Uses: equity-first funding, cost overflow beyond the commitment, and interest beyond the facility limit after any interest reserve. It is called through the funding schedule (month 1 to the last month with an equity draw), not necessarily all in month 1.
* **Acquisition:** total uses at closing (purchase price, closing costs, acquisition fee, loan origination fee and any rate cap premium) less the acquisition loan. All of it is paid in month 1.
* Reconciled by `eqEngine` (equals the funding engine's equity total) and `eqReturns` (equals the equity drawn in the returns cash flow) for development; by `su` for an acquisition.

### 1.2 Total contributed equity

All GP and LP capital actually contributed over the hold: the sum of the contributions in the monthly returns cash flow, which is what the levered IRR, the equity multiple and the equity waterfall are measured on. It is gross: contributions are never netted against distributions.

* **Total contributed equity = Closing equity + capital called after closing.**
* Capital called after closing is, for a development deal, the **takeout equity** (the permanent loan is short of the construction payoff and fee) plus the **operating cash requirement called from the partners**; for an acquisition, the **refinance shortfall**, the **balloon equity** at loan maturity and the operating shortfalls.
* Split into LP and GP by the waterfall (`measures.totalContributedEquity.lp / .gp`). The GP share is the partnership's GP equity share; it is separate from the GP's share of the profit (preferred return, catch-up and promote tiers).
* Reconciled by `capContrib` (closing equity + calls), `contrib` (development: the returns equal funding equity + takeout equity + operating shortfall) and `wfReturns` (the waterfall's LP + GP equal the returns).

### 1.3 Operating cash requirement

Interim cash needed to cover operating shortfalls, with its funding source identified. It has two views, and both are shown (Sources & Uses, "Operating cash requirement" table):

* **What the funding schedule carries (the net view).** The lease-up deficit in the funding ledger is the *net* cumulative lease-up result: later income offsets the early losses. It is a use in Sources & Uses ("Lease-Up Operating Deficit") and is funded there.
* **What is needed after closing (the interim view).** Outside the funding schedule, the month's operating cash before the operating reserve and before any call (NOI less fees and debt service, plus takeout, sale and payoff cash, less leasing capital). The months with a shortfall add up to the interim requirement; the **peak cumulative deficit** is the most cash outstanding at any month before later operating cash flow repays it.
* **Who funds it.** The partners (a call, which adds to total contributed equity and the waterfall), the operating reserve (its net use), and, when the funding schedule and the returns both draw on the same operating reserve, a reserve draw repaid out of a month with surplus cash (the partners receive that much less; it is not a call). `partners + operating reserve + netted against distributions = the interim requirement`, tie `capOperating`.
* **Operating cash requirement = in Sources & Uses + needed after closing.** For an acquisition nothing is funded in Sources & Uses; it is the part of the capital called after closing that is not a refinance shortfall or balloon equity.

**The peak is not funded in Sources & Uses.** Net funding treatment is kept. Funding the peak deficit in the schedule would change the timing and amount of contributed capital, and with it the returns and the waterfall; it must not be done merely to make Sources & Uses match another figure. The interim requirement stays visible as its own measure, with its funding source named.

### 1.4 Total project capitalization

All sources of capital over the investment life.

* **Total project capitalization = facility (or loan) + reserve draws + total contributed equity**, and equally **= the closing sources + the capital called after closing**.
* The **closing** view is Sources & Uses: capital and debt required at acquisition or development closing. The **lifecycle** view adds the later capital calls. Both are legitimate and both are shown, on the same page, so the distinction is unmistakable. They differ by exactly the capital called after closing (tie `capTotal`); when nothing is called after closing, they are the same number.
* Sources & Uses totals keep their own labels (`TOTAL USES`, `TOTAL SOURCES`; for an acquisition `TOTAL USES AT CLOSING`, `TOTAL SOURCES AT CLOSING`). Total project capitalization is never given those labels.

### 1.5 The acquisition rule for capital called after closing

An acquisition has no funding schedule, so a call is a month's contribution above the closing draw. When a month's call coincides with a refinance shortfall or balloon equity, the call is attributed to those events first (pro rata between them); what is left is the operating cash requirement. The rule is applied in `bkFundingSummary` and again, independently, in `funding_scenarios_test.js`.

## 2. How the four relate

```
Closing equity            ┐
+ takeout equity          │  capital called after closing
+ operating cash called   ┘  (acquisition: refinance shortfall, balloon equity, operating)
= Total contributed equity                      (the returns and the waterfall)

Closing sources (Sources & Uses total)
+ capital called after closing
= Total project capitalization
= facility + reserve draws + Total contributed equity

Operating cash requirement
= in Sources & Uses (net lease-up deficit) + needed after closing
needed after closing = partners' calls + operating reserve (net) + reserve repaid from surplus cash
partners' calls ⊂ capital called after closing ⊂ Total contributed equity
```

Not required, and not true in general: Closing equity = Total contributed equity; Sources & Uses total = Total project capitalization; Operating cash requirement = any equity figure.

## 3. Worked figures (from the audit decks; the relationships behind every row are asserted by the tests in every scenario)

| | Audit development deal | Harbor Point | Acquisition deal | Acquisition, refinance shortfall + $150k rate cap |
|---|---:|---:|---:|---:|
| Closing equity | $12,611,378 | $16,574,091 | $11,427,270 | $11,577,270 |
| Takeout equity / refinance shortfall | $225,620 | none | none | $4,576,257 |
| Operating cash requirement called from the partners | $426,569 (months 24 to 29) | $208,366 (months 26 to 29) | none | none |
| Capital called after closing | $652,189 | $208,366 | none | $4,576,257 |
| **Total contributed equity** | **$13,263,567** (LP $11,937,210, GP $1,326,357) | **$16,782,457** | **$11,427,270** | **$16,153,527** |
| Closing sources (Sources & Uses total) | $34,381,378 | $44,641,091 | $24,854,270 | $25,004,270 |
| **Total project capitalization** | **$35,033,567** | **$44,849,457** | **$24,854,270** | **$29,580,527** |
| Operating cash requirement (peak cumulative) | $426,569 | $208,366 | none | none |

The audit development deal: $34,381,378 closing sources + $652,189 called after closing = $35,033,567 = $21,770,000 construction facility + $13,263,567 total contributed equity. The net lease-up deficit carried in Sources & Uses is $0 (the 14 lease-up months lose $423,304 and then earn $617,928); the interim requirement is $426,569 and the partners supply it.

An edge case, lease-up 3 months with a $50,000 operating reserve: the funding schedule carries a $74,417 lease-up deficit, the reserve being drawn there; after closing the requirement is $3,047, funded $2,658 by a partner call and $389 by a reserve draw repaid out of the following month's surplus cash. The sum (`$74,417 + $3,047 = $77,464`) is the operating cash requirement.

## 4. Naming rules

1. **Use exactly these four names** for these four quantities. Read them from `BK_CAPITAL_TERMS`; do not retype them in a page that has the registry.
2. **A name always means one number.** A row, tile, sidebar line or report line named by one of the four shows that measure. `capital_measures_test.js` checks this on every sheet, the investor PDF and the schedule report.
3. **Do not use a generic equity name for a measure.** Refused on every page and report: `Equity Required`, `Equity Requirement`, `Peak Equity`, `Peak / Initial Equity`, `Total Equity` (also `Total Equity Called / Invested / Contributions`), `Equity at funding`, `Equity called`, `Equity contributed`, `Equity invested`, `Total LP/GP Equity`. A legacy name from the source workbook is shown qualified, for example `Closing equity (workbook: Peak / Initial Equity)`.
4. **Phrases that describe an event are fine**, because they say which event: `equity required at takeout`, `Refinance shortfall`, `Balloon equity at loan maturity`, `Takeout equity`, and, for the closing equity under an alternative structure, `Required / Least / Maximum equity at closing` (Financing Compare, Pre-Offer Bid). Per-period cash-flow rows are `Equity contributions`; their total is the Total contributed equity.
5. **Other measures keep their own names and are not the four**: `Peak net equity outstanding` and `Net capital calls` (Liquidity: net of distributions, month by month), `Equity multiple`, `Equity left in the deal` (value of the retained property less the permanent loan, after a takeout).
6. **A measure is read, never recomputed.** If a page needs a number that is one of the four, it reads `bkFundingSummary().measures`. If it needs a new one, extend `bkFundingSummary` and its ties.

## 5. Where each surface reads them

* **Sources & Uses** (`src/118-bk-cr-v325.js`, `capTables`): "Capital Measures" (the four, the question each answers, what it reconciles to, status), "Capitalization Over the Life of the Deal" (each source of capital, when, LP and GP, who supplies it, closing sources and total project capitalization separately) and, for development, "Operating cash requirement" (net view, interim view, who funds it, peak). The acquisition page's tables are labelled "at closing".
* **Step-by-step guide** (`src/158`), **Home** and the **Deal Snapshot** tie indicator, **Returns** (Key Economics at Exit), **Liquidity**, **Debt** (development: a Development Debt Summary sidebar), **Dev Draws**, **Model Checks**, **Capital Calls** (portfolio), the pro forma, the editor summaries, the registry's comparison column, Financing Compare and Pre-Offer Bid.
* **Investor PDF** (`src/145`), the **development schedule report** (`src/177`) and the **development report extra** (`src/179`).
* **Integrity** (`src/178`, `bkIntegrity`) and **ALL INPUTS TIE** (`bkAllInputsTie`) carry the ties `capContrib`, `capTotal` and `capOperating`, so a figure that stops reconciling shows on Home.

## 6. How it is enforced

* `audit/capital_measures_test.js`: the registry; the shared calculation names and reconciles the four; every sheet of the Harbor Point, audit development and acquisition decks, key sheets of four variants, the investor PDF and the development schedule report are rendered and scanned for ambiguous labels and for rows named by a measure that carry a different number; no reconciliation chip reads VARIANCE; the Sources & Uses pages keep the closing totals apart from the capital called after closing and total project capitalization.
* `audit/funding_scenarios_test.js`: in each of 180 scenarios, the four measures are re-derived from the monthly output with the test's own arithmetic and required to equal the summary's, with their spans (the months), their LP and GP split and the call attribution; the pages and the PDF show them; eight mutations (a measure that leaves out the later calls, that includes the takeout, that omits the interim cash, that is replaced by the net view, a reserve repayment left out, a capitalization without the reserves, a renamed measure, an acquisition refinance call dropped) must each be caught.
* `audit/tie_test.js`, `audit/conflicts_test.js` and the Harbor stage tests read the same ties and the same page text.

## 7. Adding a page, report or export

1. Read `bkFundingSummary().measures` (and `.calls` for the calls by kind). Do not recompute.
2. Use the four names from `BK_CAPITAL_TERMS`; if a row shows a figure that is one of them, name it that.
3. If you show two of them side by side, say why they differ (the sentence on the Sources & Uses page is the model).
4. Run `node audit/capital_measures_test.js index.html --list`; it renders the new page or report and names anything ambiguous.

## 8. Behavior to know

* **Operating reserve drawn twice for the same dollars.** When an operating reserve is large enough to be used by the funding schedule's lease-up deficit and a returns month before the schedule's last draw, the returns engine draws it in one month and repays it (a negative draw) in the months the schedule draws the rest. Net over the hold the reserve is conserved and no dollar is lost; the timing of up to the reserve amount of the partners' cash differs by a month or two. The measure reports it as "netted against later distributions". It was left as the engine has it: changing it moves contributions in the returns. It is asserted (scenario "lease-up 3 months + operating reserve 50k") so a change to it cannot go unnoticed.
* **Acquisitions have no operating reserve and no funding schedule**, so their operating cash requirement is what is called after closing that is not a refinance shortfall or balloon equity, and their peak cumulative deficit is not computed (shown as nothing).
* **Data exports keep their per-month column headers** (`Equity Draw`, `Refi Equity Shortfall`, `Equity` in the draw export): they are monthly series, not the four measures, and carry no total under a measure's name.
* **The portfolio "Capital Calls" page** shows each deal's closing equity, the capital called after closing and the total contributed equity; the later calls are not dated there.
