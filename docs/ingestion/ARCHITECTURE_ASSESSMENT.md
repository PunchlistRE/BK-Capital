# Document intelligence and ingestion: audit, architecture and plan

Phase 1 deliverable, for review. **No application code was changed.** The only additions are this document and a benchmark harness with an answer key (`audit/ingest_bench/`). Facts below were checked in the repository or measured on the owner's real documents; anything estimated or unverified is marked.

## 1. Summary

- **BK Capital already has an ingestion layer, and it is the right base.** It decides what a file is from its content, verifies by arithmetic (income less expenses must equal the printed NOI), never writes to the model without a person pressing a button, grades each figure Verified / Check / Low / Assumed, and tracks the page a value came from. The plan is to extend it, not replace it.
- **It runs entirely in the browser.** There is no server tier, no AI model, and no durable record of what was extracted, from where, and what the user decided. Those three gaps, plus reading complex or scanned pages, drive most of the plan.
- **Measured baseline** (5 real OMs, 35 fields read by hand from the documents): **30 correct (86%)**. Financial fields 19 of 20 (95%); descriptive fields 11 of 15 (73%). All five failures are plausible-looking (a broker's zip code, a neighboring project's unit count, a competing square-footage figure). Two were flagged, weakly or wrongly; three were not graded at all. The existing benchmark counts a read as "clean" when NOI ties and nothing is Low, so Ferry Street, with its wrong zip, scores clean: it checks that a read is consistent, not that it is right.
- **Recommendation:** keep the browser tier as the private default; add an opt-in server tier (Supabase Edge Function, Postgres tables, a vision-capable model behind a provider-neutral interface) for pages the deterministic tier cannot read confidently; put every extracted value into one **fact record** with its source, method, confidence and decision; and map only through the existing analysis registry. Estimated model cost: **about $0.35 to $0.50 per deal** (unmeasured assumptions, section 6).
- **Nothing is certified.** The answer key is one reader's work on five documents. Certification needs a larger corpus, independent verification of the key, and the thresholds in section 7.

### Decisions needed from you (the plan stops here until these are made)

1. **Privacy.** Today nothing leaves the user's machine. The server tier sends page images or text to an external model provider. Approve that as an opt-in, per-upload action that shows what is sent? Tenant names in rent rolls are personal data: redact before sending, or keep rent rolls in the browser tier only?
2. **Credentials and account.** An Anthropic API account whose retention terms you accept (section 6 lists what I could not verify), with a spend limit. The key would live only in an Edge Function secret, never in the browser.
3. **The documents.** I could not find the **Selleck**, **Fife N Drum** or **"914 E Main"** PDFs on this machine (only page-text fixtures from them; the nearest "East Main" file is `439 East Main Street OM`). Please upload them, plus T-12s, rent rolls, appraisals, loan documents, tax and insurance bills, and a few poor scans.
4. **Ground truth.** Who verifies the answer key? I cannot certify my own reading. I suggest a second person re-reads every answer-key value against the document.
5. **Budget ceiling per deal.** I suggest a $0.50 target and a $2 hard stop that falls back to the browser tier.
6. **Hosting.** Supabase Edge Functions (recommended: same auth, storage and database) or Vercel functions.

## 2. What exists today

All paths are under `src/`. Line counts are from the repository.

| Part | Lines | What it does |
|---|---:|---|
| `183-bk-import-hub.js` | 434 | The Import tab. Classifies each file by content; routes rent rolls, statements and OMs to the dedicated reader; reads facts from anything else by label meaning (35 fields, many wordings each) and by table headings. Keeps disagreeing values side by side, marks them Low. Learns labels you assign. |
| `157-bk-v29310-om.js` | 1,067 | The OM reader. PDF.js 3.11.174 reads pages; Tesseract.js 5.1.1 reads image pages. Both load from the jsDelivr CDN on first use. Finds price candidates, the income and expense statement, rent-roll layouts, development OMs; records the page each fact came from; cross-checks against a rent roll. |
| `137-bk-v29200-import.js` | 310 | Yardi-format T-12 (xlsx, csv, or a PDF print). Has its own PDF text decoder. Foots every section to the printed total; NOI comes from the line items; price is derived (NOI / cap rate) and labeled Assumed. |
| `139-bk-v29210-import-rr.js` | 204 | Rent roll (xlsx, csv, text PDF): proposes a column map, shows every unit and warning, writes only on a button press. |
| `035`, `053`, `055`, `060`, `009` (source staging) | ~1,250 | The older Source Ingestion flow: a staged package of facts with eligibility, a decision log (accept / keep current), `_src` basis tags (seven labels such as YARDI T12, USER INPUT). `060` states the governing rule: *detection has zero automatic write authority.* |
| `057`, `058` | 358 | Master-data and portfolio import: creates property records only, never deals or assumptions. |
| `059` | 293 | Embedded xlsx reader (it replaced a CDN-loaded SheetJS 0.18.5). Reads **cached** formula results only; a workbook saved without cached values is reported as having no statement rather than guessed. |
| `136` | 50 | The shared confidence model (Verified / Check / Low / Assumed) and label learning. |
| `150`, `151`, `040` | 67 + 50 + 842 | Deal Documents: files in IndexedDB; optional copy to a private Supabase bucket `deal-documents` (45 MB per file, row-level policy by user folder); deal sync. |

**Destination.** A deal is ~213 plain state keys (133 are input rows on Deal Underwrite) plus private keys (`_src`, `_template`, `_conventions`, `_depr`, `_provenance`, which is only a storage stamp). The **analysis registry** (99 fields, `139b-bk-reg-fields.js`) is the only catalogue that knows, per analysis, what is required, optional or not applicable. Importers write through `bkSave` / `bkEdSet`; the engines are not touched.

**Tests.** Twelve ingestion test files in CI (`import_*`, `om_*`, `loopnet_import`, `nnn_import`, `sheet_ingest`, `docsync`) plus sections of `ui_test`. They are good at the parsing layer: page text from real OMs (Selleck, Fife N Drum, Seabreeze, Spring Street, East Main) is saved as fixtures; the T-12 reader is compared with an independent Python build on six real properties; every expected figure in `om_columns_test` was read by hand. **What they do not cover:** the CI browser blocks the CDN, so **PDF.js and OCR do not run in CI**. They run only through the manual `real_import_bench.js`, whose "clean" means *income less expenses equals the printed NOI*, not *the values are correct*.

## 3. Problems found (verified)

1. **No durable provenance.** `_src` is one label per field. The OM reader's `sources` holds only a page number and lives in memory; the hub's facts (file, sheet, row) are lost on reload. There is no value-in-context, bounding box, method, confidence score or decision history that survives.
2. **Competing values are not kept in the OM reader.** Candidates are retained only for price (the confidence panel handles price thoroughly: sold, assessed and loan figures, typos, a cap-rate cross-check). For every other field the reader keeps the winner. The hub keeps disagreeing values side by side across files, but only in memory. (Baseline case: 613 Main prints Building SF 8,203 on p6 and a rent-roll total of 8,762 SF on p23; the reader took 8,762, showed "OM page 23", and graded it Check with "974 SF per unit is plausible".)
3. **Confidence grades only some fields.** It grades price, units, building area, rents, vacancy and the expense lines. It does not grade year built, zip or state, so an error there is silent.
4. **Four numeric parsers** (`toNum` in 137, `num` in 139, `rrNum` in 157, `parseVal` in 183) and **two expense categorizers with different category sets** (137 has `turnover`, 157 has `contract`; their patterns differ). The same line can be classified differently depending on which importer reads the file.
5. **Three private field catalogues** (hub `F`: 35 fields; rent-roll `FIELDS`; OM `buildDeal`) beside the registry's 99. **None of the four importers references the registry** (0 references in 137, 139, 157, 183). This is the duplicate-schema risk the brief names.
6. **The reading layer is untested in CI** (section 2) and has no accuracy measure.
7. **Unsupported inputs:** Word documents; standalone images; loan documents, appraisals, tax and insurance bills, partnership agreements, inspection reports (no reader, and no destination fields for most of them).
8. **Baseline failures** (section 4).
9. **Known failures named in the brief:** Ferry Street (fixed in #96). Selleck, Fife N Drum and 914 E Main: only page-text fixtures exist; I cannot reproduce them without the PDFs.

## 4. Baseline benchmark (current reader, main at 61b71ef)

Method: for each real OM, the answer key (`audit/ingest_bench/answer_key.json`) was read **by hand from the document** (text layer, or the rendered page for scanned pages) with the page recorded. The reader's output is scored field by field: right, wrong, missing, or **false positive** (a value where the document states none). Money must match to the dollar.

| Document | Kind | Pages | Text layer | Read time* | Correct |
|---|---|---:|---|---:|---:|
| 32 Ferry Street | stabilized mixed-use | 27 | native + images | 3 s | 10 of 11 |
| 613 Main Street | multifamily, affordable set-aside | 34 | none (all images) | 99 s (OCR) | 8 of 11 |
| Norell Apartments | multifamily | 18 | one page only | 26 s (OCR) | 9 of 9 |
| 439 East Main Street | entitled development site | 18 | native + images | 46 s | 2 of 2 |
| Great Pond Village | land listing, no price | 4 | native + images | 3 s | 1 of 2 |
| **All** | | | | | **30 of 35 (86%)** |

\* run while a 73-section test suite was using the machine: upper bounds.

| Field class | Correct |
|---|---|
| Financial (price, NOI, EGI, expenses, taxes, insurance) | **19 of 20 (95%)** |
| Descriptive (units, SF, year built, zip, state) | **11 of 15 (73%)** |

The five misses, each one plausible:

| Document | Field | Truth | Reader returned | Why | What the user was told |
|---|---|---|---|---|---|
| 32 Ferry Street | zip | blank (never printed) | 06095 | the broker's Windsor, CT office (p26). Wrong entity | nothing: zip is not graded (the panel read 13 Verified, 0 Check, 0 Low) |
| 613 Main Street | asking price | $3,600,000 (p4) | blank | large "hero tile" number missed by OCR | **Low: "The OM states no price. Enter one above."** The flag is right, the reason is false: p4 states it |
| 613 Main Street | building SF | 8,203 (p6) | 8,762 | rent-roll total (p23) beats the overview figure; conflict not recorded | Check: "974 SF per unit is plausible". The 8,203 is never mentioned |
| 613 Main Street | year built | c. 1900, renovated 2012 (p6) | blank | "c. 1900 · Renovated 2012" not parsed | nothing: not graded |
| Great Pond Village | units | blank | 230 | a neighboring completed project's size, in narrative (p2) | not shown on screen (the land-listing path asks for a pro forma); the reader holds 230 |

Where the reader did the right thing: it flagged the missing price instead of inventing one, matched Norell's every figure through OCR, and showed the page each figure came from. Other things the key surfaced, each a requirement for the new design: the **OM's own arithmetic is off by $1** on 613 Main's pro forma NOI and Norell's (tie checks need a tolerance and must say why); Ferry prints **insurance equal to management ($8,123)**; Norell is **26 units, 25 with certificates of occupancy**; Ferry is **12 units plus 1 suite**; East Main says **74 units** while its pro forma workbook says **75** (it adds the commercial suite) and both agree on 70 one-bedrooms and a $1,480,000 land price. That last pair is the cross-document reconciliation the brief describes, in real data. Not yet measured: T-12 and rent-roll accuracy beyond the existing tests, scanned-quality extremes, and the remaining documents above.

## 5. Recommended architecture

**Principles.** Extend the hub rather than build beside it. Deterministic first; a model only where deterministic reading is not confident. Every value carries its source. Nothing reaches the model of a deal without an explicit approval. The engines stay authoritative; ingestion never calculates a result. Unfinished work stays behind a flag, off by default.

### Pipeline (each stage a separate, testable module)

| # | Stage | Input → output | Runs where | Tested by |
|---|---|---|---|---|
| 1 | **Intake** | files → document records (sha-256, type sniff, duplicate check, private storage, audit event) | browser; server if signed in | duplicate and corrupt-file cases |
| 2 | **Classify** | document → type, reporting period, property identity | rules first (the hub's classifier); model only for unknowns | classification accuracy on the corpus |
| 3 | **Read** | document → pages (text, tables, quality score). Per **page**, not per document (Norell has one text page among 17 image pages) | text layer → table regions; spreadsheet cells with formulas; browser OCR for image pages; model vision for complex pages | table-extraction accuracy |
| 4 | **Extract** | pages → fact records (below), deterministic extractors first; model extraction constrained to a schema built from the registry, each fact quoting its source | both tiers | field accuracy vs the answer key |
| 5 | **Normalize** | facts → one unit, sign and period convention (annualize, per-unit vs total, Current vs Pro Forma vs T-12) | browser | unit tests |
| 6 | **Validate** | facts → checks: sections foot, EGI − expenses = NOI (± tolerance), rent roll × 12 vs scheduled rent, unit counts agree, value ranges, duplicate-value flag, **quote must exist in the page** | browser | seeded-error tests |
| 7 | **Reconcile** | facts from several documents → agreements, conflicts with an explanation class (timing, definition, period, error) and a recommendation | browser | seeded conflicts |
| 8 | **Map and approve** | accepted facts → registry fields; **never overwrites** a user entry without approval; writes through `bkSave` with `_src`; ingestion summary | browser | regression on engine outputs |

### The fact record (one schema for every importer)

`{ field, raw, value, unit, period, source{documentId, page|sheet+cell, table, quote, bbox}, method(text|ocr|sheet|vision), extractor+version, model?, confidence, status(verified|check|low|assumed|missing|conflict), checks[], decision{proposed|accepted|rejected|edited, by, at, editedValue} }`. The four existing confidence levels stay as the user-facing language; `missing` and `conflict` are added. Alternates are kept: a conflict is two records, never one winner.

### Storage

Local-first (IndexedDB) so the browser tier works offline and signed out. When signed in, mirror to new Supabase tables with row-level policies by user, following the existing `deal-documents` pattern: `ingest_documents`, `ingest_facts`, `ingest_conflicts`, `ingest_events` (the audit history), `ingest_jobs` (status, failure, retry, cost). Files stay in the existing private bucket. Duplicate detection is by hash.

### Mapping

The registry becomes the single destination catalogue. Add what importers need (aliases, units, expected document types) to its fields, have the importers read it, and retire the private catalogues one importer at a time, each with a regression test. Fields the registry does not have (loan maturity extensions, recourse, appraisal values, tax bills) are added to it first, as optional, rather than invented in the importers. Extra facts a document states that fit nowhere are kept as listed facts, as the hub already does.

### Server tier

One Edge Function per stage that needs a model, each doing one bounded unit of work (a window of pages) and recording status, so long documents are chunked and resumable. The model sits behind `ExtractionProvider { classify(), extract(pages, schema) → facts + usage }`; Anthropic is the first adapter, a fake provider drives the tests, another provider is a new adapter, not a rewrite. Prompts are versioned and every run stores model, prompt version, tokens and cost.

### Reconciliation rules (from the brief), each with a tolerance and the explanations to test

OM vs rent-roll occupancy (as-of dates, vacant vs down units) · OM NOI vs T-12 NOI (period, reserves, management fee basis) · scheduled rent vs collected (vacancy, concessions, loss to lease) · asking vs purchase price · OM taxes vs bills (assessment year, mill rate change) · unit counts across documents (suites, commercial units, units with or without CO) · loan terms across term sheet and existing debt · SF across overview, rent roll and appraisal (gross vs rentable).

### Review experience

Extend the Import tab: one list of proposed values grouped by deal section, each row showing value, source (document, page, the quoted line, a link that opens the page), confidence and status; accept all verified; accept, edit or reject one; conflicts shown as two rows with an explanation and a recommendation; missing fields listed; low confidence sorted to the top; a final ingestion summary. Existing styling and responsive behavior are kept.

## 6. Technology, APIs and expected cost

| Need | Recommendation | Notes |
|---|---|---|
| Text-layer PDF, spreadsheets, CSV | Keep the existing readers; vendor PDF.js and Tesseract **locally** (today a CDN) | removes a runtime dependency and makes the reading layer testable in CI |
| Scanned pages | Browser Tesseract first (free, private); model vision for pages it reads poorly (tables, hero numbers, charts) | baseline shows OCR reads tables well but misses large-type values |
| Complex layouts, charts, scans | Anthropic Claude with native PDF input (page images plus text) | per the API reference: 32 MB per request, 600 pages on 1M-context models; Files API to upload once |
| Structured extraction | Tool use with `strict: true` and a JSON schema from the registry | forced tool choice is rejected on the 5.5 models; steer with instructions plus strict schemas |
| Source attribution | The model returns page and a verbatim quote per fact; the app **verifies the quote exists** on that page | PDF citations return page numbers, but are **incompatible with structured-output mode**, so quotes are verified in our code instead |
| Batch work | Message Batches (half price) for backfills and re-runs | not for interactive uploads |
| Word documents | Convert in the browser (docx → text and tables) before the same pipeline | not built today |
| Alternative OCR services | Optional later adapters (cloud document-AI services) if cost or accuracy justifies | not priced here; verify if wanted |

**Models and list prices** (Claude API reference, cached 2026-10-06; **re-verify at build time**): Haiku 5.5 $0.10 in / $0.50 out per million tokens; Sonnet 5.5 $2 / $10; Opus 5.5 $4 / $20; Fable 5.1 $10 / $50. Batch is 50% off; cache reads $0.20 per million on Sonnet and Opus 5.5.

**Cost model.** A typical packet is ~70 pages (OM 35, rent roll 10, T-12 15, tax, insurance and term sheet 10). **Tokens per page are an assumption (1,500 to 3,000 for a text-plus-image PDF page) that has not been measured**; the first task after approval is `count_tokens` on the real corpus.

| Shape | Per deal |
|---|---:|
| One full read, Sonnet 5.5 | $0.36 – $0.57 |
| One full read, Opus 5.5 | $0.72 – $1.14 |
| **Recommended:** Haiku classifies every page, Sonnet extracts from the ~40% of pages that carry facts, a second Sonnet pass re-reads only the financial pages as independent verification | **$0.35 – $0.48** |
| Same, as an async batch | about half |

At 100 deals a month that is roughly $35 to $50 before retries and occasional escalation to Opus; budget twice that. The browser tier costs nothing and stays the default, so the model is used for the pages that need it.

**Unverified, to confirm before building:** zero-data-retention and retention terms for Sonnet 5.5 and Opus 5.5 (the reference states only that Fable 5.1 requires 30-day retention); rate limits for our tier; the real token cost per scanned page; Edge Function time and memory limits for large PDFs (hence the page-window design).

## 7. Acceptance thresholds and certification

A field is correct only if it equals a human-verified answer. Valid JSON counts for nothing. Proposed thresholds (for your approval):

| Class | Measure | Threshold |
|---|---|---|
| Financial fields (price, income, expenses, NOI, debt terms) | exact match to the dollar or basis point | ≥ 99% **and** every miss carries a Low or Conflict status (zero silent wrong financial values) |
| Descriptive fields (units, SF, year built, address) | match as written | ≥ 95% |
| Blank fields | a value where the document states none (false positive) | ≤ 1% of blank fields |
| Low-confidence fields | share of true errors that were flagged (recall); share of flags that were real (precision) | recall ≥ 95%; precision ≥ 60% |
| Classification and period | correct type and reporting period | ≥ 98% |
| Attribution | populated fields with a document and a page or cell that actually contain the value | 100% |
| Table extraction | rows and cells exact | ≥ 98% |
| Conflict detection | seeded conflicts found / flags that were real | recall ≥ 95%; precision ≥ 90% |
| Mapping | accepted facts landing in the right field, no user value overwritten | 100% |
| Performance and cost | p95 per deal; cost per deal | set after measurement; $2 hard stop |

**Corpus.** Start from the seven real documents and fixtures here; grow to at least 30 documents per class (native OM, scanned OM, rent roll, T-12, loan, appraisal, tax bill) with a held-out third that is never used while tuning. Every answer-key value is double-read. Results are stored per run, so a regression is visible. Poor scans, rotated pages, mixed periods and conflicting sources are explicit cases.

## 8. Known limitations and risks

- The baseline is five documents read by one person; it shows failure modes, not a rate. Expect different numbers on a larger corpus.
- A model can state a plausible value that is not on the page. Mitigations: quotes must verify, arithmetic must foot, two independent passes on financial pages, low-confidence routing to the user. None makes errors impossible.
- Scanned pages and poor scans bound accuracy at the page image. Very large PDFs (the Norell OM is 20 MB) need page windows.
- Confidential documents and tenant data leave the machine on the server tier. That is a decision (section 1), not a default.
- Costs are estimates until tokens per page are measured.
- Replacing four private catalogues with the registry touches working importers; each step needs the existing 12 test files to stay green, and engine outputs must be compared with main after each.

## 9. Phased plan

Each phase ends with its tests green, engine outputs unchanged against main, and your review before anything merges. Nothing is merged without your approval.

| Phase | Scope | Exit criteria |
|---|---|---|
| **1** (this) | Audit, architecture, inventory, baseline | Your answers to section 1; answer key independently verified; more documents supplied |
| **2** | Fact record, provenance store (local + Supabase), job and status model, intake, duplicate detection, audit log, classification, provider interface with a fake provider, vendored PDF.js and OCR; all behind a flag | Classification accuracy met; every stage unit-tested; reading layer now tested in CI |
| **3** | Rent roll and T-12 on the fact record and the registry; model tier for scanned or complex pages; footing and tolerance checks | Rent-roll and T-12 thresholds met on the corpus |
| **4** | OM and acquisition documents: competing-value handling (the 613 SF case), neighboring-project guards (the Great Pond case), hero-tile and "c. 1900" patterns, period handling (Current / Pro Forma) | OM thresholds met; the five baseline misses fixed and kept as regression cases |
| **5** | Reconciliation engine and the review interface | Conflict thresholds met; screenshots reviewed by you |
| **6** | Development, valuation, financing and portfolio documents (loan terms, appraisals, budgets, partnership terms); new registry fields first | Thresholds met per class |
| **7** | Performance, cost optimization, full regression and certification report | Every threshold met on the held-out set; cost per deal measured |

The provenance data model is pulled forward into Phase 2 (the brief had it in Phase 5), because every later phase writes to it.
