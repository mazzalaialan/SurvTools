import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { ObjectUrls, chapterHtml } from './bookAssets';
import { useLibrary } from './store';

/**
 * Estilo del libro: el de la app (colores del tema, tamaño de letra). El
 * libro no trae estilos propios (ARQUITECTURA §11.2); el iframe es del mismo
 * origen pero sin scripts (sandbox), así que la app le agrega la hoja.
 */
function readerCss(fontPct: number): string {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return `
    :root { color-scheme: ${v('--bg', '#fff').startsWith('#f') ? 'light' : 'dark'}; }
    body { margin: 0 auto; padding: 12px 16px 48px; max-width: 46rem; font: ${fontPct}%/1.55 system-ui, sans-serif;
      background: ${v('--bg', '#fff')}; color: ${v('--text', '#111')}; overflow-wrap: anywhere; }
    h1, h2, h3 { line-height: 1.25; color: ${v('--text', '#111')}; }
    a { color: ${v('--accent', '#06c')}; }
    img { max-width: 100%; height: auto; background: #fff; border-radius: 6px; }
    figure { margin: 12px 0; }
    table { border-collapse: collapse; display: block; overflow-x: auto; }
    td, th { border: 1px solid ${v('--border', '#ccc')}; padding: 4px 6px; }
    nav { display: none; }
    pre { white-space: pre-wrap; }
    .reader-hit { background: ${v('--warn', '#d0a03c')}33; outline: 2px solid ${v('--warn', '#d0a03c')}; border-radius: 4px; }
  `;
}

/** Visor de un libro bajado, sin conexión. El capítulo se arma desde lo guardado en el dispositivo (`bookAssets.ts`) y se muestra con `srcdoc`. */
export function ReaderPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const book = useLibrary((s) => s.installed.get(id));
  const ready = useLibrary((s) => s.ready);
  const fontPct = useSettings((s) => s.settings.readerFontPct);
  const update = useSettings((s) => s.update);
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const fontRef = useRef(fontPct);
  fontRef.current = fontPct;
  const chapters = book?.chapters ?? [];
  const file = params.get('cap') ?? chapters[0]?.file ?? 'index.html';
  const idx = Math.max(0, chapters.findIndex((c) => c.file === file));

  // Cada capítulo se arma al abrirlo; las direcciones de sus imágenes se liberan al cambiar de capítulo o salir.
  const bookId = book?.id;
  useEffect(() => {
    if (!bookId) return;
    let alive = true;
    const urls = new ObjectUrls();
    setHtml(null);
    setMissing(false);
    void chapterHtml(bookId, file, readerCss(fontRef.current), urls).then((h) => {
      if (!alive) return;
      if (h === null) setMissing(true);
      else setHtml(h);
    });
    return () => {
      alive = false;
      urls.revokeAll();
    };
  }, [bookId, file]);

  function style() {
    const doc = frame.current?.contentDocument;
    if (!doc?.head) return;
    doc.getElementById('vikarg-reader')?.remove();
    const el = doc.createElement('style');
    el.id = 'vikarg-reader';
    el.textContent = readerCss(fontPct);
    doc.head.appendChild(el);
    // Desde una referencia (ej.: la ficha de un nudo): se resalta y se muestra lo buscado.
    const q = params.get('q');
    if (q) {
      const fold = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      const target = [...doc.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, figcaption, td')].find((n) => fold(n.textContent ?? '').includes(fold(q)));
      if (target && !target.classList.contains('reader-hit')) {
        target.classList.add('reader-hit');
        target.scrollIntoView({ block: 'center' });
      }
    }
    // Los enlaces del índice del libro abren el capítulo en el visor (y quedan en el historial de la app).
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href')!;
      if ((a as HTMLElement).dataset.vkLink) return;
      if (/^cap-\d+\.html|^index\.html/.test(href)) {
        (a as HTMLElement).dataset.vkLink = '1';
        a.addEventListener('click', (e) => {
          e.preventDefault();
          setParams({ cap: href.split('#')[0]! });
        });
      } else if (href.startsWith('#')) {
        // Notas y referencias dentro del capítulo: en un documento incrustado el «#» no siempre se queda en el marco.
        (a as HTMLElement).dataset.vkLink = '1';
        a.addEventListener('click', (e) => {
          e.preventDefault();
          let id = href.slice(1);
          try {
            id = decodeURIComponent(id);
          } catch {
            /* se usa tal cual */
          }
          (doc.getElementById(id) ?? doc.getElementsByName(id)[0])?.scrollIntoView();
        });
      }
    });
  }
  useEffect(style, [fontPct]);

  if (!ready) return null;
  if (!book) return <Navigate to="/library/books" replace />;
  const go = (n: number) => setParams({ cap: chapters[n]!.file });

  return (
    <div className="reader" data-testid="reader">
      <div className="reader-bar">
        {chapters.length > 1 ? (
          <select className="select" value={file} onChange={(e) => setParams({ cap: e.target.value })} aria-label={t('library.chapter')}>
            {chapters.map((c) => (
              <option key={c.file} value={c.file}>
                {c.title}
              </option>
            ))}
          </select>
        ) : (
          <strong className="reader-title">{book.title}</strong>
        )}
        <button className="icon-btn" type="button" onClick={() => void update({ readerFontPct: Math.max(70, fontPct - 10) })} aria-label={t('library.smaller')}>
          <AArrowDown size={20} />
        </button>
        <button className="icon-btn" type="button" onClick={() => void update({ readerFontPct: Math.min(200, fontPct + 10) })} aria-label={t('library.bigger')}>
          <AArrowUp size={20} />
        </button>
      </div>
      {html === null ? (
        <p className="hint reader-frame" role="status" data-testid={missing ? 'reader-missing' : 'reader-wait'}>
          {missing ? t('library.missingBook') : t('library.preparing')}
        </p>
      ) : (
        <iframe
          ref={frame}
          key={file}
          className="reader-frame"
          title={book.title}
          srcDoc={html}
          // Sin scripts: solo lectura. «allow-same-origin» deja aplicar el estilo y resaltar lo buscado desde la app.
          sandbox="allow-same-origin"
          onLoad={style}
          data-testid="reader-frame"
        />
      )}
      {chapters.length > 1 && (
        <div className="reader-nav">
          <button className="btn" type="button" disabled={idx === 0} onClick={() => go(idx - 1)}>
            <ChevronLeft size={18} /> {t('knots.prev')}
          </button>
          <span className="hint">{t('library.chapterOf', { n: idx + 1, total: chapters.length })}</span>
          <button className="btn" type="button" disabled={idx >= chapters.length - 1} onClick={() => go(idx + 1)}>
            {t('knots.next')} <ChevronRight size={18} />
          </button>
        </div>
      )}
      <button className="btn-link" type="button" onClick={() => navigate('/library/books')} style={{ alignSelf: 'flex-start' }}>
        {t('library.allBooks')}
      </button>
    </div>
  );
}
