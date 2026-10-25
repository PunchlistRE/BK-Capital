"""Heavier synthetic OM for timing: 32 image-only pages at 3200 px wide, the useful pages buried among marketing pages.
   python3 audit/fixtures/make_om_big.py -> sample_om_big.pdf (same figures as sample_om_expected.json)"""
import os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_om as M
from PIL import Image, ImageDraw
HERE = M.HERE; S = 2; W, H = M.W * S, M.H * S
random.seed(7)
def big(im): return im.resize((W, H), Image.LANCZOS)
def toc(d):
    d.text((80, 100), 'Table of Contents', font=M.F(44, True), fill=(20, 40, 70))
    for i, (t, p) in enumerate([('Executive Summary', 5), ('Property Summary', 6), ('Unit Mix', 7), ('Income & Expense', 8), ('Market Overview', 12), ('Sales Comparables', 20)]):
        d.text((100, 220 + i * 70), t + ' ' + '.' * 40 + '  ' + str(p), font=M.F(30), fill=(40, 40, 40))
def filler(n):
    im = Image.new('RGB', (M.W, M.H), 'white'); d = ImageDraw.Draw(im)
    if n % 3 == 0:
        for y in range(0, 800, 4): d.rectangle((0, y, M.W, y + 4), fill=(60 + y // 8, 110 + random.randint(0, 40), 150 - y // 12))
        d.text((80, 880), 'Neighborhood and amenities', font=M.F(40, True), fill=(20, 40, 70))
    else:
        d.text((80, 80), 'Market and demographic overview %d' % n, font=M.F(40, True), fill=(20, 40, 70))
        for i in range(34): d.text((80, 160 + i * 30), 'Submarket row %d   median income $%d   vacancy %.1f%%   rent growth %.1f%%   absorption %d units   permits %d' % (i, 50000 + random.randint(0, 40000), random.random() * 8, random.random() * 5, random.randint(10, 400), random.randint(0, 90)), font=M.F(17), fill=(40, 40, 40))
    d.text((60, M.H - 70), M.FOOT, font=M.F(18), fill=(80, 80, 80)); return im
base = M.pages
seq = [base[0], M.page(toc, 2), filler(3), filler(4), base[2], base[3], base[4], base[5]] + [filler(i) for i in range(9, 33)]
big_pages = [big(p) for p in seq]
big_pages[0].save(os.path.join(HERE, 'sample_om_big.pdf'), save_all=True, append_images=big_pages[1:], resolution=300, quality=80)
print('pages', len(big_pages))
