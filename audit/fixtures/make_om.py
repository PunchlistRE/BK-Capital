"""Synthetic offering memorandum (page images only, no text layer) for the Import OM test. Invented property and numbers; layout follows a typical broker OM.
   python3 audit/fixtures/make_om.py  ->  audit/fixtures/sample_om.pdf and sample_om_expected.json"""
import json, os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
F = lambda n, b=False: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if b else ''), n)
W, H = 1600, 1236
FOOT = 'FOR SALE - Maple Court Apartments - 120 Maple Street - Fairview, OH - 44100'
def page(draw_fn, n):
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im); draw_fn(d)
    d.text((60, H - 70), FOOT, font=F(18), fill=(80, 80, 80)); d.text((W - 120, H - 70), 'NPCG %02d' % n, font=F(18), fill=(80, 80, 80)); return im
def cover(d):
    d.rectangle((0, 0, W, 800), fill=(120, 160, 200)); d.text((80, 880), 'OFFERING MEMORANDUM', font=F(22), fill=(90, 90, 90))
    d.text((80, 930), 'Maple Court Apartments', font=F(64, True), fill=(20, 40, 70)); d.text((80, 1030), '120 Maple Street - Fairview, OH 44100', font=F(30), fill=(60, 60, 60))
    d.text((80, 1100), 'MULTIFAMILY - 20 UNITS - 12,400 SF', font=F(24), fill=(60, 60, 60))
def toc(d):
    d.text((80, 100), 'Table of Contents', font=F(44, True), fill=(20, 40, 70))
    for i, (t, p) in enumerate([('Executive Summary', 3), ('Property Summary', 4), ('Unit Mix', 5), ('Income & Expense', 6)]):
        d.text((100, 220 + i * 70), t + ' ' + '.' * 40 + '  ' + str(p), font=F(30), fill=(40, 40, 40))
def exe(d):
    d.text((80, 100), 'Executive Summary', font=F(44, True), fill=(20, 40, 70))
    d.text((900, 220), 'KEY METRICS', font=F(20, True), fill=(90, 90, 90)); d.text((900, 280), 'Offering Price   $2,950,000', font=F(30, True), fill=(20, 20, 20))
    d.text((900, 360), 'CURRENT   PRO FORMA', font=F(24), fill=(90, 90, 90)); d.text((900, 420), 'NOI   $193,540   $231,730', font=F(30), fill=(20, 20, 20)); d.text((900, 480), 'Cap Rate   6.56%   7.86%', font=F(30), fill=(20, 20, 20))
    d.text((80, 220), 'A twenty (20) unit multifamily property in Fairview, Ohio.', font=F(26), fill=(40, 40, 40))
def prop(d):
    d.text((80, 100), 'Property Summary', font=F(44, True), fill=(20, 40, 70))
    for i, (k, v) in enumerate([('ADDRESS', '120 Maple Street, Fairview, OH'), ('PROPERTY TYPE', 'Multifamily'), ('UNITS', '20'), ('RENTABLE / LIVING AREA', '12,400 SF'), ('LOT SIZE', '0.80 Acres'), ('YEAR BUILT', '1975'), ('STORIES', '2'), ('ZONING', 'R3'), ('PARKING', '30 Spaces')]):
        d.text((80, 240 + i * 62), k, font=F(24), fill=(110, 110, 110)); d.text((760, 240 + i * 62), v, font=F(28), fill=(20, 20, 20))
def mix(d):
    d.text((80, 100), 'Unit Mix', font=F(44, True), fill=(20, 40, 70))
    d.text((80, 220), 'UNIT TYPE      UNITS    % OF UNITS    AVG CURRENT / SCHEDULED RENT    HIGHEST ACHIEVED RENT    AVG MARKET / PRO FORMA RENT', font=F(15, True), fill=(90, 90, 90))
    d.text((80, 290), '1 BR       10       50.0%       $1,100       $1,250       $1,250', font=F(30), fill=(20, 20, 20)); d.text((80, 360), '2 BR       10       50.0%       $1,300       $1,450       $1,450', font=F(30), fill=(20, 20, 20))
    d.text((80, 450), 'TOTAL / PROPERTY       20       100.0%       $1,200       $1,350', font=F(30, True), fill=(20, 20, 20))
LINES = [('OPERATING INCOME', None), ('CURRENT      %      PRO FORMA      %', None), ('Gross Potential Rent  $324,000  $324,000', 0), ('Loss to Lease / Below Market Rent  ($36,000)  12.5%  $0  0.0%', 0),
 ('Gross Scheduled Rent  $288,000  $324,000', 0), ('Vacancy  ($14,400)  5.0%  ($16,200)  5.0%', 0), ('Effective Rental Income  $273,600  $307,800', 0), ('ADDITIONAL INCOME      $ / UNIT      $ / UNIT', None),
 ('Laundry Income  $3,600  $180  $3,600  $180', 0), ('Parking  $0  $0  $6,000  $300', 0), ('Total Additional Income  $3,600  $180  $9,600  $480', 0), ('EFFECTIVE GROSS INCOME  $277,200  $317,400', 0),
 ('OPERATING EXPENSES', None), ('CURRENT      $ / UNIT      PRO FORMA      $ / UNIT', None), ('Management Fee  $13,860  $693  $15,870  $794', 0), ('Real Estate Taxes  $31,000  $1,550  $31,000  $1,550', 0),
 ('Insurance  $9,400  $470  $9,400  $470', 0), ('Electric  $4,200  $210  $4,200  $210', 0), ('Water & Sewer  $9,800  $490  $9,800  $490', 0), ('Repairs & Maintenance  $12,000  $600  $12,000  $600', 0),
 ('Landscaping  $3,400  $170  $3,400  $170', 0), ('Total Operating Expenses  $83,660  $4,183  $85,670  $4,284', 0), ('NET OPERATING INCOME  $193,540  $231,730', 0)]
def ie(d):
    d.text((80, 80), 'Income & Expense Analysis', font=F(40, True), fill=(20, 40, 70))
    for i, (t, _) in enumerate(LINES): d.text((80, 150 + i * 38), t, font=F(24, bool(t.isupper() or t.startswith('EFFECTIVE') or t.startswith('NET'))), fill=(20, 20, 20))
pages = [page(cover, 1), page(toc, 2), page(exe, 3), page(prop, 4), page(mix, 5), page(ie, 6)]
pages[0].save(os.path.join(HERE, 'sample_om.pdf'), save_all=True, append_images=pages[1:], resolution=150)
json.dump({'name': 'Maple Court Apartments', 'city': 'Fairview', 'state': 'OH', 'price': 2950000, 'units': 20, 'sf': 12400, 'curNOI': 193540, 'pfNOI': 231730, 'yearBuilt': 1975, 'parking': 30}, open(os.path.join(HERE, 'sample_om_expected.json'), 'w'), indent=1)
print('ok')

# ---- second synthetic OM: two pages (rent roll, income and expense), no price, hyphenated street number, additional income without its own heading
FOOT2 = 'For Sale - Elm Street Apartments - 40-42 Elm Street, Brookfield, CT 06804'
def page2(draw_fn, n):
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im); draw_fn(d)
    d.text((60, H - 70), FOOT2, font=F(18), fill=(80, 80, 80)); d.text((W - 80, H - 70), str(22 + n), font=F(18), fill=(80, 80, 80)); return im
def rr(d):
    d.text((80, 80), 'Unit Mix & Rent Roll', font=F(40, True), fill=(20, 40, 70))
    d.text((80, 170), 'UNIT   TYPE   SF   DESIGNATION   IN-PLACE   MARKET   PRO FORMA', font=F(16, True), fill=(90, 90, 90))
    rows = [('A-1', '2/1', '900', 'Market', '$2,400', '$2,400', '$2,500'), ('A-2', '2/1', '900', 'Market', '$2,350', '$2,400', '$2,500'), ('B-1', '2/1.5', '1,100', 'Affordable', '$1,500', '$1,500', '$1,550'), ('B-2', '2/1.5', '1,100', 'Market', '$2,600', '$2,600', '$2,700')]
    for i, r in enumerate(rows): d.text((80, 230 + i * 56), '   '.join(r), font=F(26), fill=(20, 20, 20))
    d.text((80, 500), 'Total 4 Units 4,000 SF', font=F(28, True), fill=(20, 20, 20))
L2 = ['OPERATING INCOME', 'Gross Potential Rent $118,800 - $122,400 -', 'Below Market Rent -$1,200 - $0 -', 'Gross Scheduled Rent $117,600 - $122,400 -', 'Vacancy & Collections Loss -$2,352 - -$2,448 -', 'Effective Rental Income $115,248 - $119,952 -',
      'Utility Bill Back $3,600 $900 $3,600 $900', 'Total Additional Income $3,600 $900 $3,600 $900', 'OPERATING EXPENSES', 'Real Estate Tax $14,400 $3,600 $14,400 $3,600', 'Property Insurance $3,200 $800 $3,200 $800', 'Water $1,000 $250 $1,000 $250', 'Snow Removal $4,000 $1,000 $4,000 $1,000', 'Total Expense $22,600 $5,650 $22,600 $5,650', 'Net Operating Income $96,248 - $100,952 -']
def ie2(d):
    d.text((80, 80), 'Income & Expense Analysis', font=F(40, True), fill=(20, 40, 70))
    for i, t in enumerate(L2): d.text((80, 170 + i * 44), t, font=F(26, bool(t.isupper())), fill=(20, 20, 20))
p2 = [page2(rr, 1), page2(ie2, 2)]
p2[0].save(os.path.join(HERE, 'sample_om_b.pdf'), save_all=True, append_images=p2[1:], resolution=150)
json.dump({'name': 'Elm Street Apartments', 'city': 'Brookfield', 'state': 'CT', 'units': 4, 'sf': 4000, 'curNOI': 96248, 'pfNOI': 100952, 'price': None}, open(os.path.join(HERE, 'sample_om_b_expected.json'), 'w'), indent=1)
