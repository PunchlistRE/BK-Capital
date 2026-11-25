# Punchlist Capital: design audit and plan

**Status: audit and plan. Phase 0 (regression safeguards) is approved. Phases 1 to 4 each need their own approval.**
Measured on main at `ac7c6a0` (the acquisition test deck, 53 sheets, 163 tables, 6,155 table cells, at 1440, 1100 and 390 px, plus every Property Editor sub-tab at 1440 and 1100 px). I looked at screenshots for Revenues > Miscellaneous and Depreciation; I did not look at every page.

---

## 1. What I got wrong first

I treated "consistency" as "make everything look like the Cash Flow Report" and then as "invent a new token set." Both overrode decisions the product already had. The design-system.html I sent is not the product's design language. It is a different one. This audit starts from what the product already says about itself.

## 2. Design decisions that already exist (the product's own record)

These are written in the code, most with the owner's reasoning, and several are enforced by tests.

| # | Decision | Where it lives | Enforced by |
|---|---|---|---|
| D1 | **One design language: the Property Editor's look.** Square panels with a header bar and a letter badge; grids with full cell borders and graded header rows; boxed input cells; tab strips; the `--ae-*` tokens in light and Night. | `162a-bk-design-unify.css` (header comment) | `layout_test` |
| D2 | **Fill rule, three fills, three jobs.** HEADER blue-grey names things; KEY gold is the answer (headline metrics); SUB light tint is a subtotal. A row that carries a value is never header-coloured. | `162a` | `fillrule_test` |
| D3 | **Cell convention (the financial-modelling standard).** Input = blue text on pale yellow with a thin amber edge. Calculated = black, no fill. Linked = green. N/A = grey. Attention = red or amber outline. | `162a`, and the "Color key" button on each sheet | `fillrule_test`, `field_widths_test` |
| D4 | **Cell authority.** Every table cell is tagged once from what it contains (`label, text, num, chip, input-text, input-num, calc, empty`) and styled only from that tag. Text left, numbers right, pills left. 29 earlier layers were deleted, not overridden. | `110-bk-v31-cell-authority.css` | `layout_test` |
| D5 | **Emphasis tiers (owner, Nov 2026): rules, not fills, in tables.** KEY = navy rule above and below, navy bar on the label's left edge, bold. IMPORTANT = light-blue rules, bold. Plain subtotal = bold with one rule above. Headline tiles keep their fill. **This overrides D2 for table rows.** | `191-bk-emphasis-tiers.css` | none |
| D6 | Header second row as folder tabs under the navy section tabs (owner: "more depth, like the tabs above"). | `182-bk-palette.css` | |
| D7 | Phone: every top-bar control is at least 40 px to tap (owner). | `182` | |
| D8 | Charts and sections fill their card at every width (owner). | `121-bk-sensitivity-explorer-css.css` | `layout_test` |
| D9 | Tornado navy/steel; heat maps and grids red-neutral-green (owner, this project). | `121/122/147` | `sensitivity_grid_test` |
| D10 | Bottom figures bar: dark navy, 7% see-through (owner, 13 Nov). | `186` | |
| D11 | Vertical divider after the label column only on Cash Flow, Sources and Uses, Waterfall statements (owner, 13 Nov). | `186` | |

**Preserve all of D1 to D11.** Where two decisions conflict (D2 vs D5) the later owner decision (D5) is the rule and D2 should be corrected in the document.

## 3. How design-system.html deviates from the product

| Area | design-system.html | Product (what exists) | Verdict |
|---|---|---|---|
| Input cells | white, rounded, bordered | pale-yellow fill, blue text, amber edge (D3) | **ds is wrong. Product wins.** This is the regression you named. |
| Other cell states | none | calculated, linked, N/A, attention (D3) | ds incomplete. "Locked" is not defined anywhere in the product. It needs a decision. |
| Section header | blue text over a rule | header bar with a letter badge (D1) | ds is wrong |
| Table grid | hairline rows, band over year columns only | full cell borders, graded header row (D1) | ds is wrong for input grids; the hairline look is only right for the report statements |
| Total rows | accent-blue fill | navy rules plus a bar, no fill (D5) | ds is wrong |
| Panels and cards | rounded 8 to 12 px, shadow | square panels, no shadow (D1), pills 20 px high | ds is wrong |
| Accent colour | `#12609f` | `--ae-accent` family, `#3E9AE6` gold-500 token | ds invented a value |
| Type | Inter, six sizes | Schibsted Grotesk first, Inter fallback | ds is wrong |
| Missing entirely | | Deal Snapshot side panel, rail navigation, folder tabs, ribbon, Color key, status flow, footer bar | ds incomplete |
| Right | semantic positive/negative/caution, a spacing scale, a Night set | partially present (`--status-*`) | usable as additions |

The document is a fair starting point for *vocabulary* (a spacing scale, semantic colours). It is not a canonical spec of the product.

## 4. Findings against your six problem areas

**1. Input cell styling.**
- On screen the states still exist on main: 157 yellow input cells at 1440 px, calculated cells unfilled, linked green. Not lost on screen.
- **Lost in PDF summaries.** The report pack forces every input cell transparent (`.pg-body td:has(>input)…background:transparent !important` in `195`). The distinction D3 exists to make disappears in the PDF. (Whether that was ever a deliberate choice I could not find a record of.)
- **32% of table cells (1,998 of 6,155) have no kind tag.** They sit outside the cell-authority system (D4). The Waterfall, Cash Flow, Sources and Uses, Audit and Valuation reports are entirely untagged: they use the separate `rp-tbl` system. So the state rules cannot be guaranteed on a third of the cells.
- "Locked" has no defined style.

**2. Text wrapping.**
- Real, on main: Depreciation settings shows "Suspended until income or sale (passi" cut off inside its dropdown, and the TAX-GRADE chip is clipped at its cell edge.
- In print: the Depreciation "Property" value runs into the next column; with 10-digit figures the Cash Flow columns run into each other.
- There is no wrapping rule. Wrapping behaviour today is a stack of unrelated `nowrap`, `overflow-wrap` and `word-break` rules in at least six files.
- **Not reproduced:** the headers "Value" and "Status" wrapping onto two lines. At 1100 and 1440 px on main they sit on one line. My automatic detector also flagged many headers that are intentionally two-line (a year plus its date), so I do not trust that count.

**3. Column sizing.**
- 3 of 163 tables use under 70% of their container, all on the Waterfall Report, where they are three side-by-side boxes by design.
- **Not reproduced:** the Miscellaneous Income table at about 40% width. On main it fills its card. The table directly below it (Year 1 Revenue Build) is a two-column table with a wide blank note column, so the two adjacent tables on that page do have different structures. If your screenshots show 40%, they came from a state I cannot see (a different viewport, a different build, or Vercel Production not matching main). I need the viewport or URL.
- There is no column-role system. Only inputs have width rules (`field_widths_test`). Label, number, text, chip and note columns have no allocation rule, so each table is sized by browser auto-layout or by its own fixed percentages.

**4. Lines and borders.** Measured at 1440 px:
- Ten different row-rule styles (width and colour) across 736 + 150 + 89 + 64 + 51 + 31 + … rows. At least four of them are near-duplicates of the same blue-grey.
- Four header fills, three of them near-identical blue-greys (`#edf1f6`, `#e3e9f1`, `#e8ecf0`).
- One caption style, which is good.
- Vertical dividers: three statements (D11) on screen; the investor PDF has its own; the sheet PDFs have none. The rule by function is not written down.

**5. Summaries.** There is no summary component. The same kind of content is laid out five different ways: the Deal Snapshot side panel, the Home review checklist and tiles, the IC Memo three-column grid, the pack "PDF summary" pages and the investor PDF dashboard. I have not yet compared them page by page; that needs your list of which summaries matter.

**6. Responsive and print.**
- Desktop, phone and PDF already share tokens loosely, but PDF has **four separate style systems** (`145` investor PDF, `167` browser print, `195` report pack, `177` development schedule). Table rules are duplicated across them.
- Phone stacking exists (`bk-m-stack`, the 760 px rules). Wide tables get a scroll hint. That behaviour is deliberate and works; the weak spot is long-figure statements in print.

## 5. Rules still needed (function-based, not look-alike)

1. **Cell-state rules for all table systems** (input, calculated, linked, N/A, attention, locked) applied to `rp-tbl` as well as `table.fin`, and carried into print and PDF.
2. **Line rules by function:** header rule, row hairline, subtotal, KEY total, IMPORTANT total, section separator, vertical label divider, card frame. One definition each.
3. **Column roles:** label, figure, text, chip, input, note. Each has a width and wrap rule. Wide statements get an explicit overflow behaviour per medium (scroll on screen, split pieces in print).
4. **Wrapping rule:** labels and descriptions wrap on word boundaries; figures never split; chips never exceed their cell; a control that cannot fit its text shows it in a tooltip, never cut with no hint.
5. **Summary component** with a hierarchy (headline, supporting figures, detail), once.
6. **Medium rules:** what is shared (tokens, states, line functions) and what may differ (layout, density, pagination).

## 6. Implementation plan (nothing starts until you authorize it)

**Phase 0: lock down what exists (no visual change).** Add visual-regression snapshots of every sheet (light, Night, 390 px) and the PDFs as the baseline. Extend `fillrule_test` to cover input, calculated, linked, N/A states in PDF output. This is the safeguard against "a small change broke something elsewhere."

**Phase 1: fix verified defects only.** Depreciation select/chip clipping; the print overlap on Depreciation and 10-digit Cash Flow; any of your screenshot cases once I can reproduce them. Each fix is small, scoped to one component, and ships with a before/after for that page and a snapshot diff proving other pages are unchanged.

**Phase 2: write the specification.** Correct D2/D5, add the missing states and the line/column/wrap rules from section 5, rebuild design-system.html from the product's real language (yellow inputs, header bars with badges, rules-not-fills), and get your sign-off on that document.

**Phase 3: one component at a time.** In order: table cell states, line functions, column roles, wrapping, summaries, print. One component per change; no change touches an unrelated component; the snapshot diff is the proof.

**Phase 4: print and PDF consolidation.** Collapse the four PDF style systems into one only after Phases 0 to 3 pass.

I will not run any phase until you say which one.

## 7. What I need from you

- The viewport width or the URL for the Miscellaneous Income (40%) and Depreciation ("Value"/"Status" wrapping) screenshots, so I can reproduce them.
- Which summaries matter most.
- A decision on "locked" cells: does that state exist, and what should it look like?
- Confirmation that D5 (rules, not fills) is still your decision for table totals.

---

## 8. Decisions recorded (owner, 13 Nov 2026)

- **Preserve D1, D3, D4, D5, D6, D7, D8, D10, D11.** Cell authority decides styling; an input looks like an input everywhere (app, reports, PDFs).
- **D5 confirmed.** KEY totals: navy rules above and below, navy bar on the label's left edge, bold. IMPORTANT totals: lighter blue rules, bold. Plain subtotals: bold with one rule above. No blanket coloured total-row fills.
- **Locked inputs (new, to be designed in Phase 2).** Three distinct states: *calculated* (dark text, no fill), *linked* (green text), *locked input* (keeps the input's identity but is visibly non-editable: a subtle grey treatment, a disabled control and a lock indicator). No additional prominent fill colour.
- **Misc Income at 40% width and Depreciation "Value"/"Status" wrapping:** do not change until reproduced. Fix only what is reproducible.
- **One design language does not mean one renderer.** Investor PDF, report pack, browser print and development schedule share typography, colour conventions, cell-state semantics, border definitions and financial hierarchy. They need not share layout or pagination logic. Do not consolidate them prematurely.
- **Summaries:** a common summary *framework* (headline metrics; supporting metrics; characteristics; risks and exceptions; supporting detail) with reusable pieces, implemented differently per context. Not one layout for Deal Snapshot, IC Memo, Home review, investor dashboard and PDF summaries.
- **Constraint on every phase: presentation only.** No change to underwriting calculations, financial-model outputs, deal data or engine behaviour. No migrations, no schema changes.

## 9. Authorization

| Phase | Scope | Authorization |
|---|---|---|
| 0 | Regression baselines and tests (`audit/visual_regression.js`, `audit/pdf_regression.js`, `audit/cell_state_test.js`) | **Approved** |
| 1 | Verified clipping and print defects | Approve each defect individually |
| 2 | Written design specification (incl. locked-input state) | Approve |
| 3 | Component-by-component implementation | Separate approval |
| 4 | PDF consolidation (shared definitions, not necessarily one renderer) | Separate approval |

### Known deviations recorded by the Phase 0 tests (not fixed; each needs Phase 1 approval)

1. Reserve Accounts: the amount input boxes have no input fill (src/199).
2. The report pack (PDF summaries) paints every input cell transparent, so input vs calculated does not carry into the PDF (src/195).
3. About a third of table cells (the report tables) carry no `data-bk-kind` tag.
4. Depreciation: a dropdown value is cut off ("…(passi") and the TAX-GRADE chip is clipped at its cell edge.
5. Print: text overlaps on Depreciation; 10-digit Cash Flow figures run together (Phase 1 candidates).
