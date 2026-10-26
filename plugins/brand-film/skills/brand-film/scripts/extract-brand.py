#!/usr/bin/env python3
"""Inventory a brand from its real sources: .pptx/.potx decks, a brand-standards
PDF, or a folder of either. Standard library only (no python-pptx, no PIL), so
it runs anywhere; run it with `python3 -I`.

    python3 -I extract-brand.py <deck.pptx | brand.pdf | folder> [...] --out <dir>

Writes to <dir>:
  inventory.json   theme colours and fonts, the colours, typefaces, sizes and
                   shapes the slides ACTUALLY use (counted), slide size, and
                   which media each slide shows
  source.txt       every slide's text and notes, in order (film.json `source`,
                   for the facts check), plus PDF text when pdftotext exists
  media/           every image in the decks, unchanged, named <deck>-<file>
  pdf-hits.txt     lines of a brand PDF that name a colour or typeface

It reports; it decides nothing. Read inventory.json beside the rendered slides
and the brand standards, then write brand-tokens.json by hand
(references/brand-system.md). The theme is often a template default: the
counted slide usage is the truth.
"""
import collections
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'


def deck(path, out, inv, text):
    name = os.path.splitext(os.path.basename(path))[0]
    z = zipfile.ZipFile(path)
    names = z.namelist()
    d = {'file': path, 'theme': {}, 'slideSizeEmu': None, 'colors': collections.Counter(),
         'typefaces': collections.Counter(), 'sizesPt': collections.Counter(), 'shapes': collections.Counter(),
         'slideMedia': {}}
    pres = z.read('ppt/presentation.xml').decode('utf8', 'replace') if 'ppt/presentation.xml' in names else ''
    tag = re.search(r'<p:sldSz\b[^>]*>', pres)
    cxm = tag and re.search(r'\bcx="(\d+)"', tag.group(0))
    cym = tag and re.search(r'\bcy="(\d+)"', tag.group(0))
    if cxm and cym:
        cx, cy = int(cxm.group(1)), int(cym.group(1))
        d['slideSizeEmu'] = [cx, cy]
        d['slideSizePx'] = [round(cx / 9525, 1), round(cy / 9525, 1)]
    for t in sorted(n for n in names if re.match(r'ppt/theme/theme\d+\.xml$', n)):
        x = z.read(t).decode('utf8', 'replace')
        cs = re.search(r'<a:clrScheme name="([^"]*)">(.*?)</a:clrScheme>', x, re.S)
        scheme = {}
        if cs:
            for slot, body in re.findall(r'<a:(dk1|lt1|dk2|lt2|accent\d|hlink|folHlink)>(.*?)</a:\1>', cs.group(2), re.S):
                v = re.search(r'(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"', body)
                scheme[slot] = '#' + v.group(1).lower() if v else body.strip()
        fonts = {k: (re.search(rf'<a:{k}>.*?<a:latin typeface="([^"]*)"', x, re.S) or [None, None])[1] for k in ('majorFont', 'minorFont')}
        d['theme'][os.path.basename(t)] = {'scheme': cs.group(1) if cs else None, 'colors': scheme, 'fonts': fonts}
    rels = {}
    for r in (n for n in names if re.match(r'ppt/slides/_rels/slide\d+\.xml\.rels$', n)):
        num = int(re.search(r'slide(\d+)', r).group(1))
        rels[num] = re.findall(r'Target="\.\./media/([^"]+)"', z.read(r).decode('utf8', 'replace'))
    d['slideMedia'] = {str(k): v for k, v in sorted(rels.items()) if v}
    parts = [n for n in names if re.match(r'ppt/(slides|slideLayouts|slideMasters)/[^/]+\.xml$', n)]
    for p in parts:
        x = z.read(p).decode('utf8', 'replace')
        d['colors'].update('#' + c.lower() for c in re.findall(r'srgbClr val="([0-9A-Fa-f]{6})"', x))
        d['typefaces'].update(re.findall(r'<a:(?:latin|ea|cs) typeface="([^"+][^"]*)"', x))
        d['sizesPt'].update(str(int(s) / 100) for s in re.findall(r' sz="(\d+)"', x))
        d['shapes'].update(re.findall(r'prstGeom prst="([^"]+)"', x))
    slides = sorted((n for n in names if re.match(r'ppt/slides/slide\d+\.xml$', n)), key=lambda n: int(re.search(r'(\d+)', n.split('/')[-1]).group(1)))
    text.append(f'# {os.path.basename(path)}\n')
    for s in slides:
        num = re.search(r'slide(\d+)', s).group(1)
        x = z.read(s).decode('utf8', 'replace')
        paras = [''.join(re.findall(r'<a:t>([^<]*)</a:t>', p)) for p in re.findall(r'<a:p>(.*?)</a:p>', x, re.S)]
        text.append(f'## Slide {num}\n' + '\n'.join(p for p in paras if p.strip()))
        note = f'ppt/notesSlides/notesSlide{num}.xml'
        rel = f'ppt/slides/_rels/slide{num}.xml.rels'
        if rel in names:
            nm = re.search(r'Target="\.\./notesSlides/(notesSlide\d+\.xml)"', z.read(rel).decode('utf8', 'replace'))
            note = f'ppt/notesSlides/{nm.group(1)}' if nm else None
        if note and note in names:
            nx = z.read(note).decode('utf8', 'replace')
            np_ = [''.join(re.findall(r'<a:t>([^<]*)</a:t>', p)) for p in re.findall(r'<a:p>(.*?)</a:p>', nx, re.S)]
            np_ = [p for p in np_ if p.strip() and not p.strip().isdigit()]
            if np_:
                text.append('Notes:\n' + '\n'.join(np_))
        text.append('')
    os.makedirs(os.path.join(out, 'media'), exist_ok=True)
    for n in names:
        if n.startswith('ppt/media/') and not n.endswith('/'):
            with z.open(n) as src, open(os.path.join(out, 'media', f'{name}-{os.path.basename(n)}'), 'wb') as dst:
                shutil.copyfileobj(src, dst)
    for k in ('colors', 'typefaces', 'sizesPt', 'shapes'):
        d[k] = d[k].most_common(40)
    inv['decks'].append(d)


def pdf(path, out, inv, text):
    if not shutil.which('pdftotext'):
        inv['notes'].append(f'{path}: pdftotext not installed; read the PDF directly')
        return
    t = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout
    text.append(f'# {os.path.basename(path)}\n{t}\n')
    pat = re.compile(r'typeface|font|pms|pantone|cmyk|rgb|hex|#[0-9a-f]{6}\b|clear ?space|minimum size', re.I)
    hits = [f'{os.path.basename(path)}:{i + 1}: {l.strip()}' for i, l in enumerate(t.splitlines()) if pat.search(l)]
    with open(os.path.join(out, 'pdf-hits.txt'), 'a') as f:
        f.write('\n'.join(hits) + '\n')
    inv['pdfs'].append({'file': path, 'hits': len(hits),
                        'hexes': sorted(set(h.lower() for h in re.findall(r'#[0-9A-Fa-f]{6}\b', t))),
                        'rgb': sorted(set(re.findall(r'R\s*:?\s*(\d{1,3})\s*G\s*:?\s*(\d{1,3})\s*B\s*:?\s*(\d{1,3})', t)))})


def main(argv):
    if '--out' not in argv or len(argv) < 3:
        print(__doc__)
        return 2
    out = argv[argv.index('--out') + 1]
    srcs = [a for i, a in enumerate(argv) if a != '--out' and (i == 0 or argv[i - 1] != '--out')]
    os.makedirs(out, exist_ok=True)
    files = []
    for s in srcs:
        if os.path.isdir(s):
            files += [os.path.join(s, f) for f in sorted(os.listdir(s)) if f.lower().endswith(('.pptx', '.potx', '.pdf'))]
        else:
            files.append(s)
    inv, text = {'decks': [], 'pdfs': [], 'notes': []}, []
    for f in files:
        if f.lower().endswith(('.pptx', '.potx')):
            deck(f, out, inv, text)
        elif f.lower().endswith('.pdf'):
            pdf(f, out, inv, text)
        else:
            inv['notes'].append(f'{f}: not a deck or a PDF, skipped')
    with open(os.path.join(out, 'inventory.json'), 'w') as f:
        json.dump(inv, f, indent=2)
    with open(os.path.join(out, 'source.txt'), 'w') as f:
        f.write('\n'.join(text))
    for d in inv['decks']:
        print(f"{d['file']}: {d.get('slideSizePx')} px; top colours {[c for c, _ in d['colors'][:8]]}; typefaces {[t for t, _ in d['typefaces'][:4]]}")
    for p in inv['pdfs']:
        print(f"{p['file']}: {p['hits']} brand lines, hexes {p['hexes'][:10]}")
    for n in inv['notes']:
        print(n)
    print(f'wrote {out}/inventory.json, source.txt, media/')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
