"""Generates the synthetic rent-roll fixtures used by audit/import_rr_test.js: a Yardi-style report as CSV and XLSX, plus the truth
the importer must reproduce (expected.json). No real tenant data. Run: python3 audit/fixtures/make_rent_roll.py"""
import csv, json, os, datetime, random
import openpyxl
HERE = os.path.dirname(os.path.abspath(__file__)); random.seed(7)
units = []
for i in range(1, 25):
    typ = random.choice(['1BR', '2BR', '2BR', 'Studio'] ); sf = {'Studio': 480, '1BR': 650, '2BR': 900}[typ] + random.choice([0, 10, 25])
    mkt = {'Studio': 1500, '1BR': 1850, '2BR': 2400}[typ] + random.choice([0, 50, 100])
    vacant = i in (5, 11, 19)
    rent = 0 if vacant else mkt - random.choice([0, 40, 75, 120, 200])
    start = datetime.date(2024, 1, 1) + datetime.timedelta(days=random.randint(0, 600)); end = start + datetime.timedelta(days=365)
    units.append(dict(unit=f'{100 + i}', type=typ, sf=sf, tenant='' if vacant else f'Resident {i}', market=mkt, rent=rent, start=None if vacant else start, end=None if vacant else end, status='Vacant' if vacant else 'Current'))
units.append(dict(unit='Retail A', type='Retail', sf=2400, tenant='Corner Cafe LLC', market=7200, rent=6800, start=datetime.date(2023, 3, 1), end=datetime.date(2028, 2, 28), status='Current'))
units.append(dict(unit='Retail B', type='Retail', sf=1800, tenant='', market=5400, rent=0, start=None, end=None, status='Vacant'))
H = ['Unit', 'Unit Type', 'Unit Sq Ft', 'Resident', 'Market Rent', 'Lease Rent', 'Lease From', 'Lease To', 'Status']
tot = dict(sf=sum(u['sf'] for u in units), market=sum(u['market'] for u in units), rent=sum(u['rent'] for u in units))
def row(u, dates): return [u['unit'], u['type'], u['sf'], u['tenant'], u['market'], u['rent'], dates(u['start']), dates(u['end']), u['status']]
with open(os.path.join(HERE, 'rent_roll_yardi.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['RENT ROLL - TESTVILLE APARTMENTS (synthetic)']); w.writerow(['As of 06/30/2026']); w.writerow([]); w.writerow(H)
    for u in units: w.writerow(row(u, lambda d: d.strftime('%m/%d/%Y') if d else ''))
    w.writerow(['Total', '', tot['sf'], '', tot['market'], tot['rent'], '', '', ''])
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Rent Roll'
ws.append(['RENT ROLL - TESTVILLE APARTMENTS (synthetic)']); ws.append(['As of 06/30/2026']); ws.append([]); ws.append(H)
for u in units: ws.append(row(u, lambda d: d))
ws.append(['Total', None, tot['sf'], None, tot['market'], tot['rent'], None, None, None]); wb.save(os.path.join(HERE, 'rent_roll_yardi.xlsx'))
exp = dict(units=[dict(unitId=u['unit'], sf=u['sf'], tenantType='Commercial' if u['type'] == 'Retail' else 'Residential', status='Vacant' if u['status'] == 'Vacant' else 'Occupied',
    inPlaceRent=u['rent'], marketRent=u['market'], leaseStart=u['start'].isoformat() if u['start'] else '', leaseEnd=u['end'].isoformat() if u['end'] else '') for u in units], totals=tot)
res = [u for u in exp['units'] if u['tenantType'] == 'Residential']; com = [u for u in exp['units'] if u['tenantType'] == 'Commercial']
occ = lambda L, k: sum(u[k] for u in L if u['status'] == 'Occupied'); vac = lambda L, k: sum(u[k] for u in L if u['status'] != 'Occupied')
exp['stats'] = dict(resUnits=len(res), commSuites=len(com), resSF=sum(u['sf'] for u in res), resInPlace=occ(res, 'inPlaceRent') + vac(res, 'marketRent'), resMarket=sum(u['marketRent'] for u in res),
    commInPlace=occ(com, 'inPlaceRent') + vac(com, 'marketRent'), commMarket=sum(u['marketRent'] for u in com))
json.dump(exp, open(os.path.join(HERE, 'rent_roll_expected.json'), 'w'), indent=1)
print(len(units), 'units;', exp['stats'])
