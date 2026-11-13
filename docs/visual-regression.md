# Visual and PDF regression safeguards

Presentation only. These tools read the app. They never change it, a calculation or any deal data.

| Tool | What it protects |
|---|---|
| `node audit/visual_regression.js index.html` | A canonical screenshot of every sheet (acquisition deck at desktop 1440 and phone 390, Light and Night; Property Editor sub-tabs at desktop and phone; development deck at desktop) against the baselines in `audit/visual_baseline/`. |
| `node audit/pdf_regression.js index.html` | Real PDFs of the investor summary (acquisition, development), the waterfall summary and the key sheet prints: page count, US Letter size, a hash of every word, margin ink, and a small picture of each page, against `audit/pdf_baseline/`. |
| `node audit/cell_state_test.js index.html` | The cell-state convention (input blue on yellow; calculated plain; linked green; N/A grey) in Light and Night. Lists the recorded known deviations. |

## Approving an intentional visual change

1. Make the change. Run the tools. Any page that moved beyond the tolerance FAILS and a before / after / diff image is written to `audit/visual_report/` (or `--report <dir>`).
2. Look at those images. If every difference is intended, approve exactly those pages: `node audit/visual_regression.js index.html --update --only <sheet name>` (and `node audit/pdf_regression.js index.html --update --only <name>`).
3. Commit the updated baseline files in the same pull request as the change that caused them. The pull request then shows, file by file, which pages changed.
4. An unintended difference is a regression: fix the code, do not update the baseline.

## Limits (read these)

- Baselines depend on the renderer's fonts. Regenerate with `--update` on the machine or CI image that will run the check; do not mix machines. The tools are not wired into CI yet for this reason.
- Screenshots are stored small (about a third of the width, WebP). They catch layout, fill, line, colour and clipping changes, not single-letter text edits (the PDF word hash covers text in the PDFs).
- Tolerance: a page fails above 0.5% changed 6 x 6 blocks or if any 16 x 16 area changed over 60% (`--tolerance` overrides).
- The clock is frozen, animations are off and the network is blocked so captures are repeatable.

## Known instabilities (recorded, not suppressed)

- **Deal Vectors (M)** (development deck): the table layout (the Date column wraps on some loads) differs from one load to the next. It is on the tool's `UNSTABLE` list: reported every run, never a failure.
- **Rent Roll and Import** (all decks): the fixed bottom figures bar lands at a different height in the stitched full-page capture on some runs, so these pages intermittently show a difference of about 5% with identical content. They are NOT on the `UNSTABLE` list (they still fail when it happens) and no baseline was changed to hide it. Evidence from the unchanged main build and from the Phase 1 branch is in `audit/known_instability_evidence/` (see its README). Proposed fix, awaiting approval: hide the bar during capture and regenerate the baselines.
