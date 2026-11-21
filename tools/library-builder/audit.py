#!/usr/bin/env python3
"""Auditoría de la biblioteca ya convertida (revisión de libros, ver docs/COLABORAR.md).

Lee ~/vikarg-library/books/*/book.json (o el directorio que se pase) y marca, por libro, lo que huele mal:
  - título que parece un nombre de archivo o un código (p. ej. «Fm3 05 70»), todo en minúsculas, con extensión, con [1]...
  - autor vacío o que es un código/«Unknown»
  - muy pocos capítulos para las páginas que tiene (conversión que no cortó bien)
  - capítulos casi vacíos (solo un título) o con títulos que son fragmentos (fechas, una letra suelta, números)
Salida: un JSON ordenado por gravedad (puntaje) y un resumen. No modifica nada.
Uso: python3 tools/library-builder/audit.py [carpeta_books] [--json salida.json] [--top 40]
"""
import json, re, sys, html, pathlib

def text_len(path):
    try:
        h = pathlib.Path(path).read_text(encoding='utf8', errors='ignore')
    except OSError:
        return -1
    h = re.sub(r'(?is)<(script|style).*?</\1>', '', h)
    h = re.sub(r'(?is)<h1.*?</h1>', '', h, count=1)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', h))
    return len(re.sub(r'\s+', ' ', t).strip())

def title_flags(title, author):
    f = []
    if re.search(r'\.(pdf|epub|doc|docx|txt)$', title, re.I): f.append('título con extensión')
    if re.search(r'\[\d+\]', title): f.append('título con [n]')
    if title == title.lower() and len(title) > 6: f.append('título todo en minúsculas')
    if re.fullmatch(r'[A-Za-z]{1,4}\d+( \d+)*', title) or re.fullmatch(r'[A-Za-z]{1,4} ?\d[\d ._-]*', title): f.append('título es un código')
    if re.search(r'\d{4,}', title) and len(re.sub(r'\D', '', title)) > len(title) / 2: f.append('título casi todo números')
    if re.search(r'[_]{1}', title): f.append('título con guion bajo')
    if len(title) < 4: f.append('título muy corto')
    if not author or author.strip().lower() in ('unknown', 'desconocido', 'anonymous', 'none', '') or re.fullmatch(r'[A-Za-z]{1,4}[ -]?[\d. -]+', author.strip()):
        f.append('autor vacío o código')
    return f

def chapter_flags(chs, bdir):
    f = []
    small = 0; frag = 0
    for c in chs:
        n = text_len(bdir / c['file'])
        if 0 <= n < 300: small += 1
        t = c['title'].strip()
        if re.fullmatch(r'(January|February|March|April|May|June|July|August|September|October|November|December|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)?\s*\d{0,4}', t, re.I) or len(t) <= 2 or re.search(r'\s[A-ZÇ]$', t) and len(t) < 40:
            frag += 1
    return small, frag

def main():
    argv = sys.argv[1:]
    out = None; top = 40; rest = []
    i = 0
    while i < len(argv):
        if argv[i] == '--json': out = argv[i + 1]; i += 2
        elif argv[i] == '--top': top = int(argv[i + 1]); i += 2
        else: rest.append(argv[i]); i += 1
    root = pathlib.Path(rest[0] if rest else pathlib.Path.home() / 'vikarg-library' / 'books')
    rows = []
    for bj in sorted(root.glob('*/book.json')):
        try:
            b = json.loads(bj.read_text(encoding='utf8'))
        except Exception as e:
            rows.append({'id': bj.parent.name, 'score': 99, 'flags': ['book.json ilegible']}); continue
        chs = b.get('chapters', []); pages = b.get('pages') or 0
        flags = title_flags(b.get('title', ''), b.get('author', ''))
        if pages > 200 and len(chs) <= max(2, pages // 120)  # hasta ~200 páginas un solo capítulo es por diseño (SPLIT_PAGES)
            and True: flags.append(f'pocos capítulos ({len(chs)}) para {pages} páginas')
        small, frag = chapter_flags(chs, bj.parent)
        if chs and small / len(chs) >= 0.3 and small >= 3: flags.append(f'{small} de {len(chs)} capítulos casi vacíos (<300 caracteres)')
        if chs and frag / len(chs) >= 0.25 and frag >= 2: flags.append(f'{frag} de {len(chs)} títulos de capítulo parecen fragmentos')
        score = len(flags) + (2 if any('pocos capítulos' in x or 'casi vacíos' in x or 'fragmentos' in x for x in flags) else 0)
        rows.append({'id': b['id'], 'title': b.get('title'), 'author': b.get('author'), 'category': b.get('category'), 'license': b.get('license'),
                     'pages': pages, 'chapters': len(chs), 'source': b.get('source'), 'score': score, 'flags': flags})
    rows.sort(key=lambda r: (-r['score'], r['id']))
    bad = [r for r in rows if r['flags']]
    if out: pathlib.Path(out).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf8')
    print(f'{len(rows)} libros auditados, {len(bad)} con alguna marca')
    from collections import Counter
    cnt = Counter(x.split(' (')[0].split(':')[0] if not x[0].isdigit() else re.sub(r'\d+', 'N', x) for r in rows for x in r['flags'])
    for k, v in cnt.most_common(): print(f'  {v:5d}  {k}')
    print(f'--- los {top} peores ---')
    for r in bad[:top]: print(f"{r['score']:2d} {r['id']} | {r['title']!r} | {r['pages']}p {r['chapters']}cap | " + '; '.join(r['flags']))

if __name__ == '__main__':
    main()
