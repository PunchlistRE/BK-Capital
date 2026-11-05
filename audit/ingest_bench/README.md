# Ingestion benchmark

Measures whether document extraction is **correct**, not whether it ran. A field counts as correct only if it equals a value a person read from the document. Valid output with a wrong value is a failure.

- `answer_key.json`: the hand-read truth for each document (value, PDF page, class financial or descriptive, notes). `null` means the document does not state the field, so blank is right. A key must be read again by a second person before it is used to certify anything.
- `om_baseline.js`: runs the Import OM reader over a folder of documents and scores every field: right, wrong, missing, or **false positive** (a value where the document states none).
- `results/`: one file per run, named by date and build.

```
BK_TESSERACT_DIR=/path/to/node_modules node audit/ingest_bench/om_baseline.js /path/to/documents --out audit/ingest_bench/results/<date>_<build>.json
```

`BK_TESSERACT_DIR` must hold `tesseract.js@5.1.1`, `tesseract.js-core@5.1.1`, `@tesseract.js-data/eng@1.0.0` and `pdfjs-dist@3.11.174` (the versions the app loads from a CDN). The documents are the owner's and are **not** kept in this repository.

Not part of `run_all.sh`: it needs the real documents. `real_import_bench.js` is the older, separate tool; it reports whether a read "ties" (income less expenses equals the printed NOI), which a wrong but consistent read also does.

Baseline of the reader on main at 61b71ef (5 real OMs, 35 fields): 30 correct (86%); financial 19 of 20; descriptive 11 of 15. See `docs/ingestion/ARCHITECTURE_ASSESSMENT.md`.
