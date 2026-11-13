# Known baseline / tool instability: Rent Roll and Import screenshots

**Status:** recorded, NOT suppressed, NOT re-baselined. These pages are still compared on every run and still fail when the fault appears.

## What happens
`audit/visual_regression.js` intermittently reports a large difference (about 5% of the page, "worst area 100%") on the **Rent Roll** and **Import** pages. The page content is identical in the before and after images. The only difference is that the fixed bottom figures bar (`#bk-kpibar`) appears in the middle of the full-page capture on some runs and not on others (the bar is `position: fixed`, so where it lands in a stitched full-page capture depends on timing).

## It is not caused by Phase 1 item 1
The same pages fail on the **unchanged main build** (`fb2e89d`, saved as the "main_build" evidence) and on the Phase 1 branch, and WHICH page fails changes from run to run:

| Run | Rent Roll | Import |
|---|---|---|
| Full run, first (branch) | FAIL (5.04%) | pass |
| Subset on unchanged main | FAIL (5.03%) | not run |
| Full run, final (branch) | pass | FAIL (acq dark, 5.72%) |
| Subset on unchanged main | pass | FAIL (3 pages, about 5.7%) |
| Subset on this branch | pass | FAIL (2 pages) |
| Subset, both builds, later | FAIL on both (3 pages, about 5.0%) | pass on both |

## Evidence kept
- `main_build/` and `this_branch/`: before / after / diff images and run logs from the same run on BOTH builds (Rent Roll failing identically on both).
- `earlier_runs/`: the Import images and the two full-run logs from the earlier runs. Provenance: `acq-desktop-dark-import.png` was written by the run on the unchanged main build; `acq-desktop-light-import.png` and `dev-desktop-light-import.png` were last written by the run on the branch (both runs failed the same pages for the same reason).

## Not done (needs separate approval)
- Hiding the bottom bar during capture and regenerating baselines would very likely remove the instability, but it changes how every baseline is taken, so it is a tool change to be reviewed on its own.
- The pages were NOT added to the tool's `UNSTABLE` list, and no baseline was updated to hide the failure.
