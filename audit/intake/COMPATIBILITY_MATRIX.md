# Intake compatibility matrix (real source materials only)

Method: each file was uploaded through the live Import OM file input (PDF.js reader, text recognition where the page is a picture) by `audit/intake/probe.js`, which only observes: it records the message, the fields the importer returned, the confidence summary and the time. The table is what the importer returned; **a field-by-field comparison against each source is done only where stated** (Hoyt, Arctic, the favourites list, the State workbook). Entries marked "not audited" were not compared with the document by hand.

**Direct URL access: not tested, and not available.** The sandbox's proxy refuses LoopNet (HTTP 403 on both listing URLs), and the app has no URL fetch: it processes uploaded files in the browser. Nothing here is live platform integration. No access restriction was bypassed.

Synthetic inputs are labelled SYNTHETIC in `audit/intake_test.js` and are not counted below.

| # | Source / platform | Property type | Format | URL | Upload | Read correctly | Manual entry | Confirm | Unsupported / not read | Deal created | Calculation and PDF |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | LoopNet listing, 52 Hoyt St Stamford CT | Multifamily, 7 units | saved listing PDF (text) | not possible | tested | address, price, units, SF, lot, year, stories, zoning, 7-row unit mix, gross rent, tax, one expense line, NOI, printed cap rate, main photo | parking, expense breakdown, management fee, unit-level rent roll | vacancy and other income (stated absences) | APN, parking ratio kept but not mapped | yes, opens and edits | NOI $81,003 ties; investor PDF checked; 54 checks with the real file |
| 2 | LoopNet listing, 743-751 Arctic St Bridgeport CT | mixed use, 11 units | saved listing PDF (text) | not possible | tested | address, price, units, unit counts, SF, lot, year, zoning, main photo | all rents, income, expenses, NOI, commercial area | none | printed 9.34% cap rate kept, **no NOI derived** | yes, facts only | engine NOI $0; PDF marked Draft, credit gate "Not assessed" |
| 3 | LoopNet favourites folder (search list) | 12 properties | saved page PDF (text) | not possible | tested | 12 of 12 rows (name, city, price, size or range, printed cap, type); the Hoyt and Arctic rows equal those listings' own pages | units, rents, expenses, NOI for any row | size labelled "Size" vs "Bldg. Size" is the list's | rows with "Price Upon Request" cannot start a deal | yes, per row (facts only) | facts-only deal, draft PDF |
| 4 | Broker flyer, 115 W 183rd St Bronx NY (Princeton Realty Group) | vacant mixed-use SRO | PDF (text) | not tested | tested | price $2,650,000, 8,000 SF, address from heading | units (the text says 10 legal SRO units plus other space; not read), income, expenses | | no income stated in the flyer | yes, facts only after units are entered | draft PDF; **flyer not audited field by field beyond price, area, address** |
| 5 | Owner/broker workbook, 1435 and 1455 State St New Haven (rent roll tab + two underwriting tabs) | multifamily, about 38 units | Excel | not tested | tested | price $9.8M, printed cap 3.53%, gross income, vacancy total, EGI, six expense lines, total expenses, NOI $346,211.48 (ties) | **units**, rent roll (the Import Rent Roll tool does not recognise this tab's column names: "Unit Number", "Rent Amt", unnamed tenant column) | | proforma tab, rent roll tab | built from the statement, units pending | NOI recomputes to the printed NOI; PDF not generated |
| 6 | CoStar report, 1 Selleck St | commercial / mixed | image-only PDF (text recognition) | not tested | tested | **not audited**: returned 60,000 SF, built 1988, NOI $52,174, 15 expense lines | price and units not found | NOI does not tie to the page (2 check, 14 low) | | not completed | not run |
| 7 | Broker OM, Fife N Drum | not audited | PDF (text + 3 picture pages) | not tested | tested | **not audited**: NOI $131,543, 16 expense lines returned; no price; units 1; year 1800 | price, units, year | does not tie (12 check, 3 low) | | not completed | not run; the importer's flags say the result is not reliable |
| 8 | Broker brochure, 914 E Main St Stamford | not audited | PDF (20 pages; **text layer is damaged: letters missing**) | not tested | tested | **wrong**: units 280 and NOI 2025 (a year) were returned | everything | all low | damaged text layer: needs text recognition of those pages, not built | not completed | not run |
| 9 | Broker OMs from earlier work: 32 Ferry St, 45-47 Spring St, 6 E Sidney Ave, 3190/3174 Riverdale Ave | multifamily / mixed use | PDF (text and mixed) | not tested | tested (this run, real upload) | price, units, area, income and expenses; NOI ties (verified 11 to 13 fields each) | commercial area, management, reserves | | | yes | tied to the OM's own NOI |
| 10 | Development OM and workbooks (439 East Main St; Harbor Point) | development | PDF + Excel | not tested | tested | recognised as development sites | developer pro forma needed | | | dev path | existing tests |

## Not tested: no real material was supplied
Zillow, StreetEasy, MLS exports; CSV rent rolls; screenshots and photographs of listings; auction and foreclosure listings; appraisals; lease abstracts and tenant schedules; capital expenditure schedules; property tax and insurance documents; hospitality, self-storage, industrial, office, retail and single-family sources; multi-document packages; portfolio add-in with provenance. These are **unknown, not supported**.

## What the generic readers added (not file-specific)
- One reader for every format: a spreadsheet or CSV is turned into text pages and goes through the same reader as a PDF.
- A statement with no recognisable heading is found by its own arithmetic: Net Operating Income and Total Expenses lines are located, and the expense lines are accepted only if they add up to the total. An amount is a cell that is a number and nothing else.
- Any document that states facts but no income becomes a facts-only deal; the user supplies missing price or units; nothing is derived from a printed cap rate.
- A list of properties is read as rows, checked against the list's own count, and each row can start a facts-only deal.
- A LoopNet listing's main photo is extracted as the cover picture.
- A heading that carries the whole address on one line is read as the address.

## Known gaps found (not yet fixed)
1. A damaged text layer (914 E Main St) is trusted as text; it needs a quality check and text recognition as a second opinion. Until then such a file produces confident-looking wrong figures that the confidence flags mark Low.
2. Picture-only documents (Selleck) and mixed OMs (Fife) read partially; accuracy not audited, and neither ties.
3. The Import Rent Roll tool does not recognise common alternative column names (Unit Number, Rent Amt) or an unlabelled tenant column.
4. Unit count is not recovered from rent-roll tabs or from phrases such as "10 legal SRO units".
5. The importers are still separate screens (Import OM, Import Deal, Import Rent Roll); a single intake that routes a file by content, and combines several files for one property, is not built.
6. Live URL access, image/screenshot input and CSV are not built or not tested.
