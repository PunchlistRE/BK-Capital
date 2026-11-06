# Guide walkthrough review (November 2026)

The Guide (`src/158`) was walked from a blank app to the results:
- for an acquisition and for a development;
- on a desktop (1440 wide) and a phone (390 wide);
- with a dark-theme check on the phone.

Every step was captured empty, then filled from the audit fixtures (`audit/deal.js`, `audit/devdeal.js`). The walk then continued through the Review to Returns.

`audit/guide_walk_test.js` repeats the walk and checks every fix below. Each fix was removed in turn on a scratch copy of the build, and the test failed every time.

## Findings and what was done

| # | Where | What was wrong | Fix (display and helpfulness only) |
|---|---|---|---|
| 1 | every step, mostly on a phone | "Looks right, continue" left the page where it was. The next step opened mid-way down, 500 to 1,200 px on a phone, with its title and first fields off screen. The keyboard stayed on the page body. Cause: the shared re-render keeps the scroll position of the same sheet (`src/161`). | A new step or screen opens at its top, with the keyboard on its heading. `src/161` honours a one-shot `window.__bkFreshView` that the Guide sets only when the step changes. A suggestion's "Use this" re-draws the same step and keeps its place. |
| 2 | every step with fields | The step did not react to what was typed until it was confirmed. "Insurance is blank" and "There is no management fee" stayed up after both were entered. "Still needed" listed fields already filled. The result strip showed NOI equal to income. | The advice, the result strip and "Still needed" are re-read with the typed figures, through the engine's own override runner (`bkRunWith`), as the IRR line already was. A suggestion steps aside once its box holds the suggested figure. Nothing is saved before Confirm. |
| 3 | development, early steps | The IRR line read "Levered IRR 450.00% · multiple 0.00x" on a half-entered deal. | The IRR line shows only once the deal can run (`bkDealReadiness().canCalculate`). Until then it says what it is waiting for. |
| 4 | Sources and uses, before the hold and exit | The step showed an empty card above the table. It showed Total contributed equity $0 and Total project capitalization equal to the loan alone, with a red "Does not tie" alarm. Those measures come from the monthly returns, which cannot run before the hold and exit are entered. | No empty card. Until the deal can run, the table shows closing equity and a line saying the post-closing measures appear once the hold and exit are in. The "does not tie" message waits until then. |
| 5 | every amount and percentage box | The boxes showed raw numbers ("24000000") with no unit. | "$" beside every amount box, "%" beside every percentage box. Amounts take their separators once typed ("24,000,000"). |
| 6 | the progress chips | Four marks (✓ ● ! ⚑) with no key. On a new deal, four steps already show ● because they hold defaults. | A one-line key under the chips. |
| 7 | phone | The ten chips wrapped to six rows (about 250 px) before the first field of every step. "Where this deal stands" was a 14 px-tall link. | On a phone the progress is one row: the current step and an "All 10 steps" button that opens the rest. Links and chips are at least 36 px tall. |
| 8 | development | The result strip showed "Cap rate on price 67%", and the exit advice said "you sell at a 5.25% cap but buy at 40.60%". The price on a development is the land. | On a development the strip shows income and NOI only. The going-in comparison is left to the yield-on-cost spread advice that already exists. |
| 9 | start screen | It said "Two ways in" above four options. The acquisition card promised "about 15 questions", but the guide walks 9 steps with about 40 fields. | "Start from blank or from a document". Each card gives its real step count, from the same workflow the guide walks. |
| 10 | result strip | A negative amount read "$-894,000". | Parentheses, as on the reports: "($894,000)". |

No figure, formula, default or gate changed. `funding_scenarios_test` (180 scenarios) shows 0 differences.

## Seen and left as they are (decisions for the owner)

- **Closing costs default to 5.00% on a blank acquisition.** The guide's own check then flags it: "outside the usual range, 1.50% to 3.00%". Changing a default changes every new deal, so it is put to the owner. Recommended: 2.00%.
- **"Ask the guide" stays on every step.** It takes about 200 px at the top of a phone screen. Keep it, or fold it into a button while the Guide is on?
- **Guide gates.** "Continue" is blocked only by an error, never by a missing required figure; the step records "Still needed" and the Review lists it. This matches the earlier decision to never block, and is left open with the other Guide-gate questions.
