"""Imágenes del libro: WebP liviano, cada una una sola vez (ARQUITECTURA §11.2)."""
import hashlib
import io
import os

import fitz
from PIL import Image

MAX_WIDTH = 1200
QUALITY = 70
# Más chicas que esto son viñetas, íconos o restos.
MIN_SIDE = 48
MIN_AREA = 120 * 120


class ImageStore:
    def __init__(self, folder: str):
        self.folder = folder
        self.count = 0
        self.bytes = 0
        self._by_hash: dict[str, str] = {}
        self._by_xref: dict[int, str | None] = {}
        os.makedirs(folder, exist_ok=True)

    def _save(self, img: Image.Image, max_width: int = MAX_WIDTH) -> str | None:
        if img.width < MIN_SIDE or img.height < MIN_SIDE or img.width * img.height < MIN_AREA:
            return None
        # Imágenes casi de un solo color (fondos, separadores): no aportan.
        small = img.convert("L").resize((16, 16))
        lo, hi = small.getextrema()
        if hi - lo < 12:
            return None
        if img.mode not in ("RGB", "L"):
            bg = Image.new("RGB", img.size, "white")
            rgba = img.convert("RGBA")
            bg.paste(rgba, mask=rgba.split()[3])
            img = bg
        if img.width > max_width:
            img = img.resize((max_width, round(img.height * max_width / img.width)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=QUALITY, method=6)
        data = buf.getvalue()
        h = hashlib.sha1(data).hexdigest()[:12]
        if h in self._by_hash:
            return self._by_hash[h]
        name = f"img/{h}.webp"
        with open(os.path.join(self.folder, f"{h}.webp"), "wb") as f:
            f.write(data)
        self._by_hash[h] = name
        self.count += 1
        self.bytes += len(data)
        return name

    def from_bytes(self, data: bytes) -> str | None:
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
        except Exception:
            return None
        return self._save(img)

    def from_pdf(self, doc: fitz.Document, xref: int) -> str | None:
        if xref in self._by_xref:
            return self._by_xref[xref]
        src = None
        try:
            pix = fitz.Pixmap(doc, xref)
            if pix.n - pix.alpha >= 4:  # CMYK
                pix = fitz.Pixmap(fitz.csRGB, pix)
            src = self.from_pixmap(pix)
        except Exception:
            try:
                src = self.from_bytes(doc.extract_image(xref)["image"])
            except Exception:
                src = None
        self._by_xref[xref] = src
        return src

    def from_pixmap(self, pix: fitz.Pixmap, max_width: int = MAX_WIDTH) -> str | None:
        try:
            mode = "RGBA" if pix.alpha else ("L" if pix.n == 1 else "RGB")
            img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
        except Exception:
            return None
        return self._save(img, max_width)

    def from_file(self, path: str) -> str | None:
        try:
            return self._save(Image.open(path))
        except Exception:
            return None
