#!/usr/bin/env python3
"""SYNTHETIC spreadsheet fixtures for audit/sheet_ingest_test.js. They prove rules (formulas vs displayed values, merged cells, subtotals, column names, multi-sheet, CSV, property lists); they are NOT real-world platform validation.
Regenerate: python3 audit/fixtures/make_sheets.py"""
import os, csv, xlsxwriter, openpyxl
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sheets'); os.makedirs(D, exist_ok=True)

# 1. statement with formulas that carry their displayed (cached) values, on the second sheet of a workbook whose first sheet is a cover
wb = xlsxwriter.Workbook(os.path.join(D, 'syn_statement_formulas.xlsx')); cover = wb.add_worksheet('Cover'); cover.write('A1', 'Owner package, prepared for lender'); cover.write('A3', 'See Statement tab')
ws = wb.add_worksheet('Statement'); m = wb.add_format({'num_format': '$#,##0'})
ws.merge_range('A1:C1', 'Operating statement - Year 1', wb.add_format({'bold': True}))
ws.write('A3', 'Sales Price'); ws.write('C3', 4000000, m)
ws.write('A5', 'Gross Income'); ws.write('C5', 400000, m)
ws.write('A6', 'Effective gross Income'); ws.write_formula('C6', '=C5-C7', m, 380000)
ws.write('A7', 'Vacancy (5%)'); ws.write_formula('C7', '=C5*0.05', m, 20000)
ws.write('A9', 'Expenses')
for i, (n, v) in enumerate([('R/E Taxes', 60000), ('Insurance', 20000), ('Repairs and Maintenance', 30000), ('Payroll', 40000)]): ws.write(9 + i, 0, n); ws.write(9 + i, 2, v, m)
ws.write('A14', 'Total Expenses'); ws.write_formula('C14', '=SUM(C10:C13)', m, 150000)
ws.write('A16', 'Net Operating Income (NOI)'); ws.write_formula('C16', '=C6-C14', m, 230000)
wb.close()

# 2. the same statement written by a tool that stores formulas WITHOUT cached values (openpyxl): the displayed figures are not in the file
w2 = openpyxl.Workbook(); s2 = w2.active; s2.title = 'Statement'
s2['A3'] = 'Sales Price'; s2['C3'] = 4000000; s2['A5'] = 'Gross Income'; s2['C5'] = 400000; s2['A6'] = 'Effective gross Income'; s2['C6'] = '=C5-C7'; s2['A7'] = 'Vacancy (5%)'; s2['C7'] = '=C5*0.05'
s2['A9'] = 'Expenses'
for i, (n, v) in enumerate([('R/E Taxes', 60000), ('Insurance', 20000), ('Repairs and Maintenance', 30000), ('Payroll', 40000)]): s2.cell(10 + i, 1, n); s2.cell(10 + i, 3, v)
s2['A14'] = 'Total Expenses'; s2['C14'] = '=SUM(C10:C13)'; s2['A16'] = 'Net Operating Income (NOI)'; s2['C16'] = '=C6-C14'
w2.save(os.path.join(D, 'syn_statement_formulas_uncached.xlsx'))

# 3. rent rolls with different column names and layouts. Units: 6, rents sum to 9,300 a month
def rr_xlsx(name, header, rows, title=None, subtotals=False, extra=None):
    wb = xlsxwriter.Workbook(os.path.join(D, name)); ws = wb.add_worksheet('Roll'); r0 = 0
    if title: ws.merge_range(0, 0, 0, len(header) - 1, title, wb.add_format({'bold': True})); r0 = 2
    for c, h in enumerate(header): ws.write(r0, c, h)
    r = r0 + 1
    for row in rows:
        for c, v in enumerate(row): ws.write(r, c, v)
        r += 1
    if extra: extra(ws, r)
    wb.close()
U = [('101', 'Alvarez', 800, 1500, 'Occupied'), ('102', 'Brown', 650, 1400, 'Occupied'), ('103', 'VACANT', 700, 0, 'Vacant'), ('201', 'Chen', 900, 1800, 'Occupied'), ('202', 'Diaz', 900, 1750, 'Occupied'), ('203', 'Evans', 850, 2850, 'Occupied')]
# 3a. "Apt #", "Resident", "Sq. Ft.", "Monthly Rent", merged title row above the header
rr_xlsx('syn_rr_a.xlsx', ['Apt #', 'Resident', 'Sq. Ft.', 'Monthly Rent'], [(u[0], u[1], u[2], u[3]) for u in U], title='Rent Roll as of 1/1/2027')
# 3b. building column, unit numbers repeat across buildings, "Occupant", "Contract Rent", subtotal rows with no label
rows_b = [('North', '1', 'Alvarez', 1500), ('North', '2', 'Brown', 1400), ('North', '3', 'VACANT', 0), (None, None, None, 2900), ('South', '1', 'Chen', 1800), ('South', '2', 'Diaz', 1750), ('South', '3', 'Evans', 2850), (None, None, None, 6400)]
rr_xlsx('syn_rr_b.xlsx', ['Building', 'Unit', 'Occupant', 'Contract Rent'], rows_b)
# 3c. same as b but one printed subtotal is wrong (south says 6,000)
rows_c = [r if r[3] != 6400 else (None, None, None, 6000) for r in rows_b]
rr_xlsx('syn_rr_c.xlsx', ['Building', 'Unit', 'Occupant', 'Contract Rent'], rows_c)
# 3d. "Suite", "Tenant", "RSF", "Annual Rent" (annual basis, commercial)
rr_xlsx('syn_rr_d.xlsx', ['Suite', 'Tenant', 'RSF', 'Annual Rent'], [('A', 'Cafe', 1200, 36000), ('B', 'Dental', 1500, 54000), ('C', 'Vacant', 900, 0)])
# 3e. CSV with a BOM, quoted commas and a trailing total row
with open(os.path.join(D, 'syn_rr_e.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f); w.writerow(['Unit', 'Tenant Name', 'Sq Ft', 'Rent']); w.writerow(['1A', 'Smith, John', 700, '1,450']); w.writerow(['1B', 'Lee, Ann', 700, '1,500']); w.writerow(['2A', 'VACANT', 700, 0]); w.writerow(['Total', '', 2100, '2,950'])

# 4. a multi-sheet workbook: summary sheet, then the rent roll on the third sheet with the statement on the second
wb = xlsxwriter.Workbook(os.path.join(D, 'syn_package.xlsx')); s0 = wb.add_worksheet('Summary'); s0.write('A1', 'Package'); st = wb.add_worksheet('Underwriting'); rr = wb.add_worksheet('RentRoll')
st.write('A1', 'Sales Price'); st.write('B1', 1000000); st.write('A3', 'Gross Income'); st.write('B3', 111600); st.write('A4', 'Effective gross Income'); st.write('B4', 111600); st.write('A6', 'Expenses')
st.write('A7', 'R/E Taxes'); st.write('B7', 20000); st.write('A8', 'Insurance'); st.write('B8', 8000); st.write('A9', 'Total Expenses'); st.write('B9', 28000); st.write('A11', 'Net Operating Income (NOI)'); st.write('B11', 83600)
for c, h in enumerate(['Unit', 'Tenant', 'Rent']): rr.write(0, c, h)
for i, (u, t, r) in enumerate([('1', 'A', 1500), ('2', 'B', 1500), ('3', 'C', 1600), ('4', 'D', 1700), ('5', 'E', 1500), ('6', 'F', 1500)]): rr.write(i + 1, 0, u); rr.write(i + 1, 1, t); rr.write(i + 1, 2, r)
wb.close()   # rent roll: 6 units, $9,300 a month = $111,600 a year = the statement's gross income

# 5. a property list with several assets and a total row
wb = xlsxwriter.Workbook(os.path.join(D, 'syn_property_list.xlsx')); ws = wb.add_worksheet('Pipeline')
for c, h in enumerate(['Property', 'City', 'State', 'Asking Price', 'SF', 'Units', 'Cap Rate', 'Type']): ws.write(0, c, h)
for i, row in enumerate([('10 Main St', 'Stamford', 'CT', 1500000, 6000, 8, 0.065, 'Multifamily'), ('22 Oak Ave', 'Norwalk', 'CT', 'Call for price', 4000, 4, 0.07, 'Multifamily'), ('5 Pine Rd', 'Bridgeport', 'CT', 900000, 3000, 3, 0.08, 'Mixed Use'), ('TOTAL', None, None, 2400000, 13000, 15, None, None)]):
    for c, v in enumerate(row):
        if v is not None: ws.write(i + 1, c, v)
wb.close()
print('written', sorted(os.listdir(D)))
