# Parked work (not part of the build)

Files in this folder are **not** built into `index.html`, are **not** in `src/manifest.json`, and are outside what `node build.js --lint`
and the audit cover. Nothing in the shipped application references them.

Nothing is parked at the moment. The Property Valuation engine (`183b-bk-valuation.js`) that was parked here is back in `src/` on branch `claude/valuation-wiring-on-main`, with its registry wiring and its test (`audit/valuation_test.js`).
