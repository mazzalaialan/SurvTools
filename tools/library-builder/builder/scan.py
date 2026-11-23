"""
Análisis de la colección: qué es cada archivo, si es un PDF escaneado, idioma,
título, licencia y duplicados. Deja `inventory.json` en la salida; la
conversión y el informe trabajan sobre él. Es rápido (solo mira las primeras
y últimas páginas) y se puede repetir: lo que no cambió sale de la caché.
"""
import hashlib
import json
import re
import os
import subprocess
import zipfile
from dataclasses import asdict, dataclass, field

import fitz  # PyMuPDF

from . import license as lic
from .meta import guess_lang, norm_key, pick_title, slug

PANDOC = {".epub", ".docx", ".docm", ".odt", ".rtf", ".txt", ".htm", ".html"}
OFFICE = {".doc", ".ppt", ".pptx", ".pps", ".pot"}
SHEET = {".xlsx", ".xls"}
SKIP = {".stl", ".skp", ".dxf", ".psd", ".opus", ".bak", ".jpg", ".jpeg", ".png"}
ARCHIVE = {".zip", ".z01"}

# Para elegir el mejor original del mismo libro.
QUALITY = {"epub": 5, "pandoc": 4, "mobi": 4, "office": 3, "pdf": 2, "pdf-ocr": 1}

# Menos de esto en las primeras páginas: el PDF es escaneado (hay que pasarle OCR).
SCANNED_CHARS = 200


@dataclass
class Entry:
    path: str
    category: str
    section: str | None
    ext: str
    kind: str
    bytes: int
    md5: str
    title: str = ""
    title_source: str = ""
    author: str = ""
    lang: str = "?"
    pages: int = 0
    scanned: bool = False
    license: str = "private"
    license_reason: str = ""
    duplicate_of: str | None = None
    # Huella del texto: el mismo libro guardado de nuevo tiene otro md5 pero el mismo texto.
    fingerprint: str = ""
    exclude_reason: str | None = None
    # Escaneado de letra manuscrita o muy fea: las páginas que el OCR no lee bien van como imagen (ver ocr.py).
    page_images: bool = False
    id: str = ""
    notes: list[str] = field(default_factory=list)


def md5_of(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def kind_of(ext: str) -> str:
    if ext == ".pdf":
        return "pdf"
    if ext == ".epub":
        return "epub"
    if ext in PANDOC:
        return "pandoc"
    if ext in OFFICE:
        return "office"
    if ext == ".mobi":
        return "mobi"
    if ext in SHEET:
        return "sheet"
    if ext == ".cbz":
        return "cbz"
    if ext in ARCHIVE:
        return "archive"
    return "skip"


def sample_pdf(path: str, e: Entry) -> str:
    try:
        doc = fitz.open(path)
    except Exception as err:  # PDF dañado o cifrado
        e.exclude_reason = f"No se puede abrir el PDF: {err}"[:200]
        return ""
    e.pages = doc.page_count
    meta = doc.metadata or {}
    e.title, e.title_source = pick_title(os.path.basename(path), meta.get("title"))
    e.author = (meta.get("author") or "").strip()[:120]
    first = "".join(doc[i].get_text() for i in range(min(6, doc.page_count)))
    last = "".join(doc[i].get_text() for i in range(max(6, doc.page_count - 2), doc.page_count))
    e.scanned = len(first.strip()) < SCANNED_CHARS
    if e.scanned:
        e.kind = "pdf-ocr"
    return first + "\n" + last


def sample_pandoc(path: str, e: Entry) -> str:
    e.title, e.title_source = pick_title(os.path.basename(path), None)
    try:
        out = subprocess.run(["pandoc", path, "-t", "plain", "--wrap=none"], capture_output=True, timeout=120)
        return out.stdout.decode("utf-8", "ignore")[:80000]
    except Exception:
        return ""


def sample_archive(path: str, e: Entry) -> None:
    e.title, e.title_source = pick_title(os.path.basename(path), None)
    if path.endswith(".z01"):
        e.notes.append("Segunda parte de un ZIP partido: se procesa junto con el .zip")
        return
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
        e.notes.append(f"{len(names)} archivos adentro: " + ", ".join(os.path.basename(n) for n in names[:8]) + ("…" if len(names) > 8 else ""))
    except Exception as err:
        e.notes.append(f"ZIP que no se puede leer solo (¿partido?): {err}"[:200])


def scan(src: str, out: str, overrides: dict) -> list[Entry]:
    cache_path = os.path.join(out, "scan-cache.json")
    cache: dict = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    entries: list[Entry] = []
    for root, _, files in os.walk(src):
        for name in sorted(files):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, src)
            parts = rel.split(os.sep)
            ext = os.path.splitext(name)[1].lower()
            stat = os.stat(full)
            key = f"{rel}|{stat.st_size}|{int(stat.st_mtime)}"
            if key in cache:
                entries.append(Entry(**cache[key]))
                continue
            e = Entry(
                path=rel,
                category=parts[0] if len(parts) > 1 else "Sin categoría",
                section=" / ".join(parts[1:-1]) or None,
                ext=ext,
                kind=kind_of(ext),
                bytes=stat.st_size,
                md5=md5_of(full),
            )
            text = ""
            if e.kind == "pdf":
                text = sample_pdf(full, e)
            elif e.kind in ("epub", "pandoc"):
                text = sample_pandoc(full, e)
            elif e.kind == "archive":
                sample_archive(full, e)
            else:
                e.title, e.title_source = pick_title(name, None)
            if e.kind == "skip":
                e.exclude_reason = f"No es un libro ({ext or 'sin extensión'})"
            if text:
                words = re.findall(r"[a-záéíóúñü]{3,}", text.lower())[:400]
                if len(words) >= 150:
                    e.fingerprint = hashlib.md5(" ".join(words).encode()).hexdigest()
                e.lang = guess_lang(text)
                e.license, e.license_reason = lic.classify(text)
            elif e.kind == "pdf-ocr":
                e.license_reason = "Escaneado: la licencia se revisa con el texto del OCR"
            elif not e.license_reason:
                e.license_reason = "Formato sin muestra de texto en el análisis: privado"
            cache[key] = asdict(e)
            entries.append(e)
    json.dump(cache, open(cache_path, "w"), ensure_ascii=False)

    apply_overrides(entries, overrides)
    mark_duplicates(entries)
    assign_ids(entries)
    return entries


def apply_overrides(entries: list[Entry], overrides: dict) -> None:
    for e in entries:
        o = overrides.get(e.path)
        if not o:
            continue
        for k in ("title", "author", "lang", "category", "section", "license"):
            if k in o:
                setattr(e, k, o[k])
        if "title" in o:
            e.title_source = "books.yaml"
        if "license" in o:
            e.license_reason = o.get("license_note", "Elegido a mano en books.yaml")
        if o.get("mode") == "ocr" and e.kind == "pdf":
            e.kind = "pdf-ocr"
        if o.get("mode") == "text" and e.kind == "pdf-ocr":
            e.kind = "pdf"
        if o.get("page_images"):
            e.page_images = True
        if o.get("exclude"):
            e.exclude_reason = "Excluido en books.yaml"


def mark_duplicates(entries: list[Entry]) -> None:
    books = [e for e in entries if not e.exclude_reason and e.kind not in ("archive", "sheet")]
    by_md5: dict[str, Entry] = {}
    for e in books:
        first = by_md5.get(e.md5)
        if first:
            e.duplicate_of = first.path
            e.notes.append("Copia idéntica")
        else:
            by_md5[e.md5] = e
    # El mismo texto guardado de nuevo (otro md5): se queda uno.
    by_fp: dict[str, Entry] = {}
    for e in books:
        if e.duplicate_of or not e.fingerprint:
            continue
        first = by_fp.get(e.fingerprint)
        if first:
            e.duplicate_of = first.path
            e.notes.append("Mismo texto que otro archivo")
        else:
            by_fp[e.fingerprint] = e
    # El mismo libro en otro formato o con otro nombre: queda el de mejor calidad.
    groups: dict[str, list[Entry]] = {}
    for e in books:
        if e.duplicate_of:
            continue
        k = norm_key(e.title)
        if len(k) >= 8:
            groups.setdefault(k, []).append(e)
    for group in groups.values():
        if len(group) < 2:
            continue
        best = max(group, key=lambda x: (QUALITY.get(x.kind, 0), x.pages, x.bytes))
        for e in group:
            if e is not best:
                e.duplicate_of = best.path
                e.notes.append(f"Mismo libro que «{best.path}» ({best.kind}), que se usa en su lugar")


def assign_ids(entries: list[Entry]) -> None:
    used: set[str] = set()
    for e in sorted(entries, key=lambda x: x.path):
        base = f"{slug(e.category, 20)}-{slug(e.title, 50)}"
        i, cand = 2, base
        while cand in used:
            cand, i = f"{base}-{i}", i + 1
        used.add(cand)
        e.id = cand
