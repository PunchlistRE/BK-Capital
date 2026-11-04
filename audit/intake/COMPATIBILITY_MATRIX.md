# Intake compatibility matrix

**Statuses (exactly four).** **Validated**: imported and reconciled against the source (a figure the document itself contradicts would not pass). **Partial**: imported, but needs manual correction or confirmation. **Failed**: could not reliably extract or map the information. **Untested**: no actual test was performed.

**Two separate questions, never merged.** *Live URL access* (BK Capital fetching a platform page) and *uploaded-document processing* (a saved PDF, workbook or CSV read in the browser). A successful upload is not live platform integration. BK Capital has no URL fetch; the sandbox's proxy refused LoopNet (HTTP 403 on both listing URLs) and no restriction was bypassed. **Live URL access is Untested for every source below.**

How each row was established: the file was uploaded through the live importer (`audit/intake/probe.js`, `audit/loopnet_import_test.js`, `audit/intake_test.js`, `audit/sheet_ingest_test.js`). "Reconciled" means checked against a figure in the same document (NOI against income less expenses, units against the unit mix, a list against its own count, a rent roll against its printed subtotals). Synthetic inputs are labelled SYNTHETIC in the tests and are **not** counted here.

| # | Source | Property type | Format | Live URL | Upload | What was reconciled | Manual / confirm | Known problem (kept open) |
|---|---|---|---|---|---|---|---|---|
| 1 | LoopNet listing: 52 Hoyt St, Stamford CT | multifamily, 7 units | saved listing PDF | Untested | **Validated** | price = 7 x $285,000; units = 7-row unit mix; unit-mix rents x 12 = gross rent; expenses add up; EGI less expenses = NOI $81,003; printed 4.05% cap vs 4.06% | vacancy and other income ("--" in the listing), expense breakdown, management fee, parking | one "Operating Expenses" line is not broken out; cover photo extracted |
| 2 | LoopNet listing: 743-751 Arctic St, Bridgeport CT | mixed use, 11 units | saved listing PDF | Untested | **Partial** | price = 11 x $163,636; units = 3 + 4 + 4; building area stated twice | all rents, income, expenses, NOI, commercial area (the listing has none) | facts-only deal by design; printed 9.34% cap rate is not turned into an NOI; PDF marked Draft |
| 3 | LoopNet favourites folder (12 properties) | list of assets | saved page PDF | Untested | **Validated** | 12 rows = the 12 the list says; the Hoyt and Arctic rows equal those listings' own pages | units, rents, expenses for any row | rows with "Price Upon Request" cannot start a deal |
| 4 | Broker flyer: 115 W 183rd St, Bronx NY | vacant mixed-use SRO | PDF (text) | Untested | **Partial** | price and area read; address from the heading | units (text says 10 legal SRO units plus other space; not read), all income and expenses | flyer not compared field by field beyond price, area and address |
| 5 | Owner/broker workbook: 1435 and 1455 State St, New Haven (Excel: rent roll + two underwriting tabs) | multifamily, 38 units | Excel | Untested | **Partial** | statement: NOI $346,211.48 = EGI less 6 expense lines that add to the total; rent roll: 38 units (the sheet prints 38), subtotals tie | unit count from the rent roll (confirm); **the rent roll ($651,420 a year) and the statement's gross income ($670,020) disagree by $18,600** | discrepancy reported, neither figure adjusted; proforma tab not read |
| 6 | CoStar report: 1 Selleck St | commercial | image-only PDF (text recognition) | Untested | **Failed** | does not reconcile (NOI $52,174 returned, most figures Low) | price, units | financial figures do not reconcile; kept open |
| 7 | Broker OM: Fife N Drum | not assessed | PDF (text + 3 picture pages) | Untested | **Failed** | does not reconcile (NOI $131,543 returned with 16 lines; no price; units 1; year 1800) | price, units, year | financial figures do not reconcile; kept open |
| 8 | Broker brochure: 914 E Main St, Stamford | not assessed | PDF (**damaged text layer**) | Untested | **Failed** | wrong values returned (units 280, NOI 2025: a year), all Low | everything | damaged text layer: needs text recognition as a second opinion; kept open |
| 9 | Broker OMs: 32 Ferry St; 45-47 Spring St; 6 E Sidney Ave; 3190/3174 Riverdale Ave | multifamily / mixed use | PDF (text and mixed) | Untested | **Validated** | NOI recomputed in the engine ties to each OM's own NOI; 11 to 13 fields verified each | commercial area, management, reserves | tested in earlier work and re-run through the upload |
| 10 | Development OMs and workbooks: 439 East Main St; Harbor Point | development | PDF + Excel | Untested | **Untested** in this program | covered by the earlier development tests, not re-run here | | |

## Spreadsheet and CSV behaviour (SYNTHETIC inputs, rules only)
16 checks (`sheet_ingest_test.js`): displayed (cached) formula values are read; formulas saved without cached values are not invented; merged title rows; rent rolls with different column names and layouts; unit numbers repeated across buildings; printed subtotals checked (a mismatch is reported, not adjusted); annual vs monthly rent; CSV with a byte-order mark and quoted commas; a multi-sheet package whose rent roll is set beside its statement; a spreadsheet list of several properties. These prove rules. They are **not** platform validation and are not rows above.

## Untested: no real material supplied
Zillow, StreetEasy, MLS exports; CSV rent rolls from a real system; screenshots and photographs of listings; auction and foreclosure listings; appraisals; lease abstracts and tenant schedules; capital expenditure schedules; property tax and insurance documents; hospitality, self-storage, industrial, office, retail and single-family sources; multi-document packages for one property; portfolio add-in with provenance. **Status: Untested.**

## Open problems (explicitly not fixed, not normalised)
1. 914 E Main: damaged text layer is trusted as text.
2. Fife and Selleck: financial figures do not reconcile.
3. Rent-roll column names: mapping improved (Apt #, Building, Bed/Bath count, unlabelled tenant column, a unit + rent column is enough) but still heuristic; any other naming needs the mapping table.
4. Unit counts are not recovered from prose ("10 legal SRO units").
5. The importers are still separate screens; one intake that routes a file by content and combines several files for one property is not built.
