# LoopNet listing import: field-by-field extraction audit

Sources: the two saved LoopNet listing PDFs supplied for testing (`52 Hoyt St, Stamford CT 06905` and `743-751 Arctic St, Bridgeport CT 06608`). The live LoopNet pages were not fetched; the saved PDFs were uploaded through the real Import OM workflow (file input, PDF.js reader, review page, "Create deal"). Page text is in `audit/fixtures/loopnet_*_pages`; checks are in `audit/loopnet_import_test.js` (51 checks with the real PDFs, 30 from the fixtures); rendered output is in `audit/loopnet/` (`Hoyt_*`, `Arctic_*`: review-page screenshot and investor summary PDF).

## Before and after

| | Before (current `main`) | After |
|---|---|---|
| Hoyt | no price, **100 units** (the "100% Average Occupancy" read as a unit count), no unit mix, "could not find an income and expense table", no deal | price, 7 units, 7-row unit mix, financial summary, NOI $81,003 ties; deal created |
| Arctic | no price, **9 units** (listing says 11), no unit mix, same error, no deal | price, 11 units, unit counts, facts; deal created with income and expenses left blank and flagged |

## 52 Hoyt St, Stamford CT

| Field | Listing says | Loaded as | Source page | Status |
|---|---|---|---|---|
| Address | 52 Hoyt St, Stamford, CT 06905 | name `52 Hoyt St`, location `Stamford, CT` (ZIP kept in the import) | 1 | Correct |
| Property type | Multifamily for Sale | Multifamily | 1 | Correct |
| Units | 7 Units | 7 | 1 | Correct, verified (unit mix has 7 rows) |
| Asking price | $1,995,000 ($285,000/unit) | $1,995,000 | 1 | Correct, verified (7 x $285,000) |
| Building size | 7,599 SF | 7,599 SF | 2 | Correct |
| Lot | 11,761 SF | 0.27 acres | 2 | Correct (converted) |
| Year built, stories, zoning | 1916, 3, RMF | kept on the import record | 2 | Correct (no deal field for them) |
| Unit mix | 7 rows: studio $1,450; 1-bed $2,100; five 2-bed $1,700 to $1,950; SF 700 to 1,200 | average rent $1,778.57 (= $12,450 / 7). Unit rows are not turned into a unit-level rent roll | 3 | Correct; **unit-level rent roll not created** (use Import Rent Roll or enter it) |
| Gross rental income | $149,400 | $149,400 (unit-mix rents x 12 tie to it) | 3 | Correct, verified |
| Other income | `--` | $0 | 3 | **Confirm**: "not stated", not a measured zero |
| Vacancy loss / occupancy | `--` / 100% average occupancy | 0% | 1, 3 | **Confirm**: the seller's statement; set your own |
| Property tax | $25,719 | $25,719 | 3 | Correct, verified |
| Operating expenses | $42,678 (one lump line) | $42,678 entered as other / general and admin | 3 | **Manual**: insurance, utilities, repairs, payroll not separated; they load as $0 and are flagged Low |
| Management fee | not shown | 0% | | **Manual** (flagged; underwriting normally carries 3% to 5%) |
| Net operating income | $81,003 | engine NOI $81,002.88 (average rent rounded to cents) | 4 | Correct (within $0.12) |
| Printed cap rate | 4.05% | not used; calculated 4.06% from NOI / price | 1 | Consistent (within 0.06 point) |
| Parking | ratio 1.18 per 1,000 SF | not entered (a ratio, not a count of spaces) | 2 | **Manual** |
| APN | STAM-000001-000000-000150 | kept on the import record | 2 | Not mapped |
| Exit cap, reserves, financing, growth, hold, closing date | not in the listing | app defaults (exit cap = going-in 4.06%) | | **Confirm**: assumptions, marked "assumed" |

Statements shown on the review page as cautions: the description says "48-52 Hoyt St." but the listing address is 52 Hoyt St; six of seven tenants are month-to-month; the property is an estate and the information is "to the best of executor knowledge"; the unit mix lists a studio although the description says 1- and 2-bedroom; the financials are labelled "Actual - 2025" and show only tax and one expense line.

Confidence on the review page: price, units, building area, rent and taxes **verified** (each reconciles to another number on the page); vacancy and other income **check**; insurance, repairs and the lump expense detail **low**; management, exit cap, reserves **assumed**.

## 743-751 Arctic St, Bridgeport CT

| Field | Listing says | Loaded as | Source page | Status |
|---|---|---|---|---|
| Address | 743-751 Arctic St, Bridgeport, CT 06608 | name `743-751 Arctic St`, `Bridgeport, CT` | 1 | Correct |
| Property type | Multifamily for Sale; description: "mixed-use investment property" with 3 commercial units | Mixed-Use | 1, 2 | Correct (from the description); subtype "Apartment" kept on the import record |
| Units | 11 Units | 11 | 1 | Correct, verified (3 + 4 + 4 in the description) |
| Unit counts | 3 commercial, 4 two-bedroom / one-bath, 4 one-bedroom / one-bath | kept with the listing; no rents | 2 | Correct (counts only) |
| Asking price | $1,800,000 ($163,636/unit) | $1,800,000 | 1 | Correct, verified (11 x $163,636) |
| Building size | 13,392 SF gross; 9,642 SF living area | 13,392 SF (gross) | 2 | Correct, verified (facts and description agree); the 9,642 SF living area is recorded, not used |
| Lot | 5,227 SF (0.12 acres) | 0.12 acres | 2 | Correct |
| Year built, stories, zoning, class | 1904, 3, MXN, C | kept on the import record | 2 | Correct |
| Printed cap rate | 9.34% | kept as printed; **no NOI is derived or loaded** (price x cap rate would be about $168,120, shown on the review page as arithmetic, not as the listing's NOI) | 1 | Not used |
| Rents, income, expenses, NOI, occupancy, taxes, insurance | **not in the listing** | blank; flagged Low on the deal | | **Manual entry** |
| Commercial area (SF) and commercial rent | not stated | blank | | **Manual entry** |
| Parking | "on-street parking" | not entered | 2 | Manual |

The deal opens and calculates (NOI $0). Its investor PDF is marked **Draft: inputs missing (Revenue Basis, average rent, Exit Capitalisation Rate)** and does not assess the credit gate; before this change the same page showed a CONDITIONAL credit gate and "NaN points below the hurdle".

## What was changed

- `src/157-bk-v29310-om.js`: a LoopNet listing reader (`parseLoopNet`), used only when a page carries "Listing ID: n" and "Property Facts"; a listing-only path for a listing with no financial summary (`bkOMCreateListing`, review page, confidence); source pages on every figure; the listing's own qualifiers as review notes.
- `src/145-bk-v29270-report.js`: the summary no longer prints "NaN points below the hurdle" when returns cannot be calculated; a deal whose core inputs are missing is marked Draft on the dashboard and the cover and its credit gate reads "Not assessed".

## Limits

- Only these two listing layouts were tested. A listing with a different section order, several buildings, or a rent roll attachment may not read; it would fall through to the other OM readers as before.
- The listing's unit table is not turned into a unit-level rent roll, and a single "Operating Expenses" line is not broken out.
- Cover-photo extraction from a listing PDF was not tested.
