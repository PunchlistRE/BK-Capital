"""Contact sheets for the visual review: tiles the screenshots shoot.js saved so a person can look at every sheet.

  python3 audit/qa/contact.py <shots dir> <out dir> --deck acq --vw d [--cols 2 --rows 3 --scale 0.5] [--crop 900] [--sheets A,B]

Each tile is one sheet (its name printed above it), scaled by --scale and cut to --crop pixels of page height (the whole page if 0).
Sheets come in the order of measure.json, so a contact sheet follows the app's own sheet order. It reads images and writes images only.
"""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageFont

def arg(k, d=None):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d

src, out = sys.argv[1], sys.argv[2]
deck, vw = arg('--deck', 'acq'), arg('--vw', 'd')
cols, rows, scale, crop = int(arg('--cols', '2')), int(arg('--rows', '3')), float(arg('--scale', '0.5')), int(arg('--crop', '0'))
only = arg('--sheets', '').split(',') if arg('--sheets') else None
os.makedirs(out, exist_ok=True)
meas = json.load(open(os.path.join(src, 'measure.json')))
names = [m['sheet'] for m in meas if m['deck'] == deck and m['vw'] == vw and not m.get('err')]
if only: names = [n for n in names if n in only]
files = []
for n in names:
    f = os.path.join(src, '%s_%s_%s.png' % (deck, vw, re.sub(r'[^A-Za-z0-9]+', '_', n)))   # the file name shoot.js gives the sheet
    if os.path.exists(f): files.append((n, f))
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
except Exception: font = ImageFont.load_default()
per = cols * rows; written = []
for k in range(0, len(files), per):
    group = files[k:k + per]; tiles = []
    for n, f in group:
        im = Image.open(f).convert('RGB')
        if crop: im = im.crop((0, 0, im.width, min(im.height, crop)))
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
        tiles.append((n, im))
    tw = max(t[1].width for t in tiles); th = max(t[1].height for t in tiles) + 20
    sheet = Image.new('RGB', (cols * (tw + 8), rows * (th + 8)), (60, 60, 60))
    d = ImageDraw.Draw(sheet)
    for i, (n, im) in enumerate(tiles):
        x, y = (i % cols) * (tw + 8), (i // cols) * (th + 8)
        d.rectangle([x, y, x + tw, y + 19], fill=(20, 20, 20)); d.text((x + 4, y + 2), '%d. %s' % (k + i + 1, n), fill=(255, 220, 90), font=font)
        sheet.paste(im, (x, y + 20))
    name = os.path.join(out, '%s_%s_%02d.png' % (deck, vw, k // per + 1)); sheet.save(name, optimize=True); written.append(name)
print('%d sheets in %d contact sheets -> %s' % (len(files), len(written), out))
