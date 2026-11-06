# Intake compatibility matrix

What the importers have actually been proven on. Exactly four statuses: **Validated** (read correctly on real documents, by a check against the document's own figures), **Partial** (gaps named, or only synthetic files, or files not in the repository), **Failed** (a known case it cannot read) and **Untested**. The same table is in the app (Import) from `src/193-bk-intake-matrix.js`. A status is only raised by adding the real document and its check.

| Source | Status | Evidence |
|---|---|---|
| LoopNet listing, printed or saved page (PDF) | Validated | Two real listings: 52 Hoyt St, Stamford (priced, unit mix, financial summary) and 743-751 Arctic St, Bridgeport (priced, no rents, no financials). audit/loopnet_import_test.js, audit/intake_test.js |
| LoopNet favorites list | Validated | One real list: 12 rows equal the 12 the list states; price, size and printed cap equal each property's own listing page. audit/intake_test.js |
| Facts-only flyer (no income) | Validated | One real flyer: facts read, nothing invented, address from its heading. audit/intake_test.js |
| Offering memorandum, text PDF | Partial | Five real OMs: 30 of 35 fields correct (86%); financial 19 of 20, descriptive 11 of 15. audit/ingest_bench (baseline 2026-11-05) |
| Owner worksheet (spreadsheet), statement found by its arithmetic | Partial | One real workbook read correctly (NOI and six expense lines tie); other layouts are synthetic. audit/intake_test.js, audit/sheet_ingest_test.js |
| Yardi T-12 (workbook and PDF print) | Partial | Compared with an independent build on the owner's files, which are not in the repository, so the audit cannot re-run it. audit/import_test.js |
| Rent roll (CSV, XLSX, PDF) | Partial | Synthetic Yardi-style rolls, every unit and the apply / replace / add behavior checked; no real rent roll yet. audit/import_rr_test.js, audit/nnn_import_test.js |
| Development pro forma and development OM | Partial | Layouts that differ from each other, synthetic. audit/import_hub_test.js |
| Offering memorandum, scanned (image-only) PDF | Untested | Reads through OCR when the OCR libraries load; not part of the audit. |
| LoopNet listing, live (URL) | Untested | The reader takes a saved or printed page; a live listing has not been fetched. |
| LoopNet multi-building listing, land listing, cover photo | Untested | No real example yet. |
| PDF with no readable text and no OCR | Failed | Reads nothing and says so ("This PDF has no readable text"); use the spreadsheet or CSV export. |

Still needed from the owner to raise the Untested rows: a live LoopNet listing, a cover photo, a real rent roll, and multi-building and land listings.
