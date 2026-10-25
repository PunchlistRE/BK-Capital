"""Synthetic development-site OM (text PDF) and developer pro forma workbook for the Import OM development test. Invented property and numbers.
   python3 audit/fixtures/make_dev.py  ->  dev_om.pdf, dev_proforma.xlsx, dev_expected.json   (needs openpyxl and Playwright for Node)"""
import json, os, subprocess, tempfile
import openpyxl
HERE = os.path.dirname(os.path.abspath(__file__))
units = [('Studio', 12, 480, 1500), ('One Bedroom', 6, 650, 1800), ('Two Bedroom', 2, 900, 2300)]
rent = [(t, n, sf, round(r / sf, 4), r, n * r * 12) for t, n, sf, r in units]
com = ('Commercial', 1, 600, 1.5, 900, 900 * 12)
gross_rent = sum(x[5] for x in rent) + com[5]
other = [('Tenant Utility Bill Back', 500, 10000), ('Other Income', 300, 6000)]
other_total = sum(x[2] for x in other)
gross = gross_rent + other_total; vac = 0.05; vac_amt = gross * vac; egi = gross - vac_amt
nu = 20
exp = [('Repairs and Maintenance', 400, 8000), ('Payroll', 1000, 20000), ('Insurance', 600, 12000), ('Utilities', 700, 14000)]
mg = ('Management Fee', 0.03, round(egi * 0.03 / nu, 3), round(egi * 0.03, 2)); tax = ('Property Taxes', 1500, 30000)
tot_exp = sum(x[2] for x in exp) + mg[3] + tax[2]; noi = egi - tot_exp
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Completed Project Pro Forma'
ws.append(['Construction Costs', 4000000]); ws.append(['Land Cost/Unit', 'Land Cost', 'Total Project']); ws.append([30000, 600000, 4600000]); ws.append(['GROSS BUILDING SIZE', 19000]); ws.append(['NET RENTABLE', 15000]); ws.append([])
ws.append(['RENTAL INCOME', 'RENTAL INCOME']); ws.append(['UNIT TYPE', 'UNITS', 'AVG. SF', 'RENT/SF/MO', 'RENT/UNIT/MO', 'TOTAL RENT/YR', 'UNIT TYPE', 'Year 1'])
for r in rent + [com]: ws.append(list(r) + [r[0], r[5]])
ws.append(['GROSS RENT', sum(x[1] for x in rent) + 1, '', '', '', gross_rent, 'GROSS RENT', gross_rent]); ws.append([])
ws.append(['OTHER INCOME', 'UNIT/Year', 'AMOUNT/YR', 'OTHER INCOME', 'Year 1'])
for o in other: ws.append([o[0], o[1], o[2], o[0], o[2]])
ws.append(['TOTAL OTHER INCOME', 800, other_total, 'TOTAL OTHER INCOME', other_total]); ws.append(['GROSS INCOME', gross, 'GROSS INCOME', gross]); ws.append(['Vacancy', vac, vac_amt, 'Vacancy', vac_amt]); ws.append(['EFFECTIVE GROSS INCOME', egi, 'EFFECTIVE GROSS INCOME', egi]); ws.append([])
ws.append(['OPERATING EXPENSES', 'UNIT/YR', 'AMOUNT/YR', 'OPERATING EXPENSES', 'Year 1'])
for e in exp: ws.append([e[0], e[1], e[2], e[0], e[2]])
ws.append([mg[0], mg[1], mg[2], mg[3], mg[0], mg[3]]); ws.append([tax[0], tax[1], tax[2], tax[0], tax[2]])
ws.append(['TOTAL OPERATING EXPENSES', tot_exp / nu, tot_exp, 'TOTAL OPERATING EXPENSES', tot_exp]); ws.append(['NET OPERATING INCOME', noi, 'NET OPERATING INCOME', noi]); ws.append(['Valuation Range', 'Cap Rate', 'PPU', 'Value'])
for c in (0.06, 0.065, 0.07): ws.append([c, noi / c / nu, noi / c])
wb.save(os.path.join(HERE, 'dev_proforma.xlsx'))
html = '''<html><body style="font:16px Arial;margin:50px"><h1>OFFERING MEMORANDUM</h1><h2>12 Harbor Street</h2><h3>Development Site</h3><p>Fairview, OH</p><p>APPROVED 20-UNIT MARKET-RATE MULTIFAMILY DEVELOPMENT SITE</p><div style="page-break-after:always"></div>
<h2>Executive Summary</h2><p>A zoning approved, shovel-ready, 20-unit multifamily development site in Fairview, Ohio. The site can be built to a year one yield of 9.10%.</p><div style="page-break-after:always"></div>
<h2>PROPERTY SUMMARY</h2><table cellpadding="6"><tr><td>Price</td><td>$600,000</td></tr><tr><td>Address</td><td>12 Harbor Street, Fairview, OH</td></tr><tr><td>Approved Units</td><td>20</td></tr><tr><td>Zoning</td><td>MX2</td></tr><tr><td>Acres</td><td>0.4</td></tr><tr><td>Number of Stories</td><td>4</td></tr><tr><td>Commercial Suites</td><td>1</td></tr></table></body></html>'''
pdf = os.path.join(HERE, 'dev_om.pdf'); hp = tempfile.mktemp(suffix='.html'); open(hp, 'w').write(html)
js = "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('file://%s');await p.pdf({path:'%s',format:'Letter'});await b.close()})()" % (hp, pdf)
subprocess.run(['node', '-e', js], check=True, cwd=os.path.join(HERE, '..', '..'))
json.dump({'price': 600000, 'units': 20, 'noi': round(noi, 2), 'construction': 4000000, 'city': 'Fairview', 'state': 'OH', 'zoning': 'MX2'}, open(os.path.join(HERE, 'dev_expected.json'), 'w'), indent=1)
print('ok', round(noi, 2))
