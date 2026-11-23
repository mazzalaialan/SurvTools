"""
PDF escaneado → texto con Tesseract (español e inglés) y solo los dibujos y
fotos de cada página (ARQUITECTURA §11.2: nunca la página entera). Lento: se
usan los dos núcleos, una página por núcleo.
"""
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from statistics import median

import fitz
from PIL import Image

from .images import ImageStore
from .pdftext import Block, Extracted, _join_lines, merge_paragraphs
from .regions import LOW_DPI, photo_regions

OCR_DPI = 300
CROP_DPI = 150
LANGS = "spa+eng"
WORKERS = 2
# Menos confianza que esto en una palabra (0–100): se descarta (manchas, bordes).
MIN_CONF = 30
# Con `page_images` (opt-in por libro en books.yaml): una página con texto que el OCR lee mal (letra manuscrita,
# tipografía rara) se guarda como imagen en vez de texto con basura; las que se leen bien siguen como texto.
# Medido: manuscritos 48–86 de confianza mediana (casi todas ≤78) y ≤0,74 de palabras ≥70; imprenta limpia 90–96 y ≥0,73.
PAGE_IMG_MIN_WORDS = 5
PAGE_IMG_MEDIAN = 88
PAGE_IMG_GOOD_SHARE = 0.65
PAGE_IMG_DPI = 170
PAGE_IMG_WIDTH = 1600
# Tiempo máximo por página; si se pasa, la página se saltea y el libro sigue.
PAGE_TIMEOUT = 300
SKIPPED_PAGES: list[int] = []


class _Hocr(HTMLParser):
    """Párrafos y líneas del hOCR de Tesseract, con su caja y el alto de letra."""

    def __init__(self):
        super().__init__()
        self.pars: list[dict] = []
        self._par = None
        self._line = None
        self._word = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "")
        title = a.get("title", "")
        bbox = re.search(r"bbox (\d+) (\d+) (\d+) (\d+)", title)
        box = tuple(int(x) for x in bbox.groups()) if bbox else None
        if cls == "ocr_par":
            self._par = {"bbox": box, "lines": []}
            self.pars.append(self._par)
        elif cls in ("ocr_line", "ocr_header", "ocr_caption", "ocr_textfloat") and self._par is not None:
            size = re.search(r"x_size ([\d.]+)", title)
            self._line = {"bbox": box, "size": float(size.group(1)) if size else 0.0, "words": []}
            self._par["lines"].append(self._line)
        elif cls == "ocrx_word" and self._line is not None:
            conf = re.search(r"x_wconf (\d+)", title)
            self._word = {"bbox": box, "conf": int(conf.group(1)) if conf else 100, "text": ""}
            self._line["words"].append(self._word)

    def handle_endtag(self, tag):
        if tag == "span" and self._word is not None:
            self._word = None

    def handle_data(self, data):
        if self._word is not None:
            self._word["text"] += data


def _ocr_page(path: str, pno: int, work: str) -> tuple[int, list[dict], tuple[int, int]]:
    doc = fitz.open(path)
    page = doc[pno]
    pix = page.get_pixmap(dpi=OCR_DPI, colorspace=fitz.csGRAY)
    img = os.path.join(work, f"p{pno}.png")
    pix.save(img)
    base = os.path.join(work, f"p{pno}")
    env = {**os.environ, "OMP_THREAD_LIMIT": "1"}
    try:
        subprocess.run(["tesseract", img, base, "-l", LANGS, "--psm", "1", "hocr"], capture_output=True, timeout=PAGE_TIMEOUT, env=env)
    except subprocess.TimeoutExpired:
        # Una página que se cuelga no corta el libro: se saltea (queda sin texto, con sus imágenes).
        SKIPPED_PAGES.append(pno + 1)
    pars: list[dict] = []
    try:
        parser = _Hocr()
        parser.feed(open(base + ".hocr", encoding="utf-8").read())
        pars = parser.pars
    except FileNotFoundError:
        pass
    for f in (img, base + ".hocr"):
        try:
            os.remove(f)
        except OSError:
            pass
    return pno, pars, (pix.width, pix.height)


def _unreadable(words: list[dict]) -> bool:
    """¿El OCR leyó mal esta página? Pocas palabras (portadas, dibujos) no cuentan: siguen el camino normal."""
    c = [wd["conf"] for wd in words if wd["text"].strip()]
    if len(c) < PAGE_IMG_MIN_WORDS:
        return False
    return median(c) < PAGE_IMG_MEDIAN or sum(1 for x in c if x >= 70) / len(c) < PAGE_IMG_GOOD_SHARE


def extract(path: str, images: ImageStore, work: str, page_images: bool = False) -> Extracted:
    out = Extracted()
    doc = fitz.open(path)
    SKIPPED_PAGES.clear()
    with ThreadPoolExecutor(WORKERS) as ex:
        results = list(ex.map(lambda n: _ocr_page(path, n, work), range(doc.page_count)))

    # Alto de letra del cuerpo, para reconocer títulos.
    sizes = [ln["size"] for _, pars, _ in results for p in pars for ln in p["lines"] if ln["size"]]
    body = median(sizes) if sizes else 30.0
    low_conf_pages = 0
    as_image: list[int] = []

    for pno, pars, (w, h) in results:
        page = doc[pno]
        if page_images and _unreadable([wd for p in pars for ln in p["lines"] for wd in ln["words"]]):
            src = images.from_pixmap(page.get_pixmap(dpi=PAGE_IMG_DPI), PAGE_IMG_WIDTH)
            if src:
                out.blocks.append(Block("img", src=src, page=pno + 1))
                as_image.append(pno + 1)
                continue
        scale_pt = 72 / OCR_DPI  # píxeles del OCR → puntos de la página
        items: list[tuple[float, Block]] = []
        word_boxes = []
        confs = []
        for p in pars:
            lines_text, line_sizes = [], []
            for ln in p["lines"]:
                words = [wd for wd in ln["words"] if wd["conf"] >= MIN_CONF and wd["text"].strip()]
                confs += [wd["conf"] for wd in ln["words"] if wd["text"].strip()]
                for wd in words:
                    x0, y0, x1, y1 = wd["bbox"]
                    word_boxes.append((x0 * scale_pt, y0 * scale_pt, x1 * scale_pt, y1 * scale_pt))
                t = " ".join(wd["text"].strip() for wd in words)
                if t:
                    lines_text.append(t)
                    line_sizes.append(ln["size"])
            if not lines_text:
                continue
            # Encabezados y pies: una línea corta pegada al borde, o solo un número.
            y0 = p["bbox"][1] if p["bbox"] else 0
            y1 = p["bbox"][3] if p["bbox"] else 0
            text = _join_lines(lines_text)
            if re.fullmatch(r"[\divxlcdm\s.\-–]{1,8}", text, re.I):
                continue
            if (y1 < h * 0.06 or y0 > h * 0.94) and len(text) < 80:
                continue
            size = max(line_sizes) if line_sizes else body
            short = len(text) < 120 and len(lines_text) <= 2
            kind = "h1" if short and size >= body * 1.7 else "h2" if short and size >= body * 1.3 else "p"
            items.append((y0 * scale_pt, Block(kind, text, page=pno + 1)))
        if confs and median(confs) < 60:
            low_conf_pages += 1
        # Fotos y dibujos: lo que tiene contraste y no es texto.
        low = page.get_pixmap(dpi=LOW_DPI, colorspace=fitz.csGRAY)
        gray = Image.frombytes("L", (low.width, low.height), low.samples)
        scale_low = LOW_DPI / 72
        for x0, y0, x1, y1 in photo_regions(gray, word_boxes, scale_low):
            clip = fitz.Rect(x0 / scale_low, y0 / scale_low, x1 / scale_low, y1 / scale_low) & page.rect
            src = images.from_pixmap(page.get_pixmap(clip=clip, dpi=CROP_DPI))
            if src:
                items.append((clip.y0, Block("img", src=src, page=pno + 1)))
        items.sort(key=lambda x: x[0])
        out.blocks.extend(b for _, b in items)

    out.blocks = merge_paragraphs(out.blocks)
    if as_image:
        out.warnings.append(f"OCR: {len(as_image)} páginas se guardaron como imagen por no leerse bien: {as_image}")
    if SKIPPED_PAGES:
        out.warnings.append(f"OCR: páginas salteadas por tiempo: {sorted(SKIPPED_PAGES)}")
    if low_conf_pages > doc.page_count * 0.3:
        out.warnings.append(f"OCR de baja confianza en {low_conf_pages} de {doc.page_count} páginas: revisar")
    return out


def sample_text(blocks: list[Block], chars: int = 20000) -> str:
    """Texto del principio y del final, para revisar la licencia después del OCR."""
    text = "\n".join(b.text for b in blocks if b.text)
    return text[:chars] + "\n" + text[-chars // 4 :]
