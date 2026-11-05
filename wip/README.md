# Parked work (not part of the build)

Files in this folder are **not** built into `index.html`, are **not** in `src/manifest.json`, and are outside what `node build.js --lint`
and the audit cover. Nothing in the shipped application references them.

## `183b-bk-valuation.js` - Property Valuation (income approach)

Status: an unfinished engine, sheet and report, from branch `claude/property-valuation` (commit `1a696ca`, "not wired to the registry yet").
It was moved out of `src/` so that the build lint (every file in `src/` must be in the manifest) passes without registering it. The file here is
byte-identical to the one on that branch.

To ship it, finish all of the following and do them in the same change that moves the file back to `src/` and adds it to `src/manifest.json`:

- **Inputs:** the valuation fields (`valCapRate`, `valComps`, `valDate`, `valAdjustments`, `valStabilizedNoi`, ...) are in the field registry (several are still
  `planned` in `src/139b`) and have an editor panel.
- **Outputs:** the Property Valuation sheet and the Property Valuation Report are registered as a live analysis (`live:false` today in `src/139c`) with their
  report sections, readiness rules and integrity checks.
- **Tests:** an audit test, listed in `audit/run_all.sh`, that checks the figures against an independent calculation; the existing suites still pass.
- **Integration:** navigation groups, empty state, print / PDF and the Base / Upside / Downside case view.
