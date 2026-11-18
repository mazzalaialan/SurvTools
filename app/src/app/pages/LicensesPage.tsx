import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Code, ExternalLink, Mail } from 'lucide-react';
import { CONTACT_EMAIL, REPO_URL } from '@/core/about';
import { OfficialWeatherNotice } from '@/ui/OfficialWeatherNotice';

interface ThirdParty {
  name: string;
  version: string;
  license: string;
  url: string;
  text: string;
}

const CREDITS = ['map', 'elevation', 'weather', 'parks', 'garden', 'knots', 'library'] as const;

/**
 * Licencias y créditos: la licencia de la app con el enlace al código (GPL-3.0-or-later),
 * las fuentes de datos con su licencia y cada dependencia que viaja en la app con su texto
 * (se genera con `node scripts/third-party-licenses.mjs`).
 */
export function LicensesPage() {
  const { t } = useTranslation();
  const [list, setList] = useState<ThirdParty[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    // Aparte del resto de la app: son unos 100 KB de texto que casi nadie abre.
    void import('@/core/third-party-licenses.json').then((m) => setList(m.default as ThirdParty[]));
  }, []);

  // Componentes con licencia MPL-2.0 (los plugins de ubicación y barómetro de la app nativa): la MPL exige avisar que su código fuente está
  // disponible y dónde. Su código también viaja en la versión web (como archivos que ahí no se usan), por eso el aviso se ve en las dos.
  const mpl = (list ?? []).filter((p) => /\bMPL\b/.test(p.license));

  return (
    <div className="stack" data-testid="licenses">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('licenses.title')}</h1>
      </div>

      <section className="card stack" aria-labelledby="lic-app">
        <h2 id="lic-app" className="section-title" style={{ margin: 0 }}>{t('licenses.appTitle')}</h2>
        <p style={{ margin: 0 }} data-testid="lic-app-license">{t('licenses.appText', { version: __APP_VERSION__ })}</p>
        <p className="hint" style={{ margin: 0 }}>{t('licenses.noWarranty')}</p>
        <p className="hint" style={{ margin: 0 }}>{t('licenses.commercial')}</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer" data-testid="lic-source">
            <Code size={18} aria-hidden /> {t('licenses.source')}
          </a>
          <a className="btn" href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
            <ExternalLink size={18} aria-hidden /> {t('licenses.fullText')}
          </a>
          {CONTACT_EMAIL && (
            <a className="btn" href={`mailto:${CONTACT_EMAIL}`}>
              <Mail size={18} aria-hidden /> {t('licenses.contact')}
            </a>
          )}
        </div>
      </section>

      <section className="card stack" aria-labelledby="lic-data">
        <h2 id="lic-data" className="section-title" style={{ margin: 0 }}>{t('licenses.dataTitle')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('licenses.dataIntro')}</p>
        <ul className="stack" style={{ margin: 0, paddingLeft: 18, gap: 8 }}>
          {CREDITS.map((k) => (
            <li key={k} data-testid={`credit-${k}`}>
              <strong>{t(`licenses.credit.${k}.name`)}</strong>: {t(`licenses.credit.${k}.text`)}
            </li>
          ))}
        </ul>
        <OfficialWeatherNotice />
      </section>

      {mpl.length > 0 && (
        <section className="card stack" aria-labelledby="lic-mpl" data-testid="lic-mpl">
          <h2 id="lic-mpl" className="section-title" style={{ margin: 0 }}>{t('licenses.mplTitle')}</h2>
          <p style={{ margin: 0 }}>{t('licenses.mplText')}</p>
          <ul className="stack" style={{ margin: 0, paddingLeft: 18, gap: 6 }}>
            {mpl.map((p) => (
              <li key={`${p.name}@${p.version}`}>
                <strong>{p.name}</strong> <span className="hint">{p.version} · {p.license}</span>
                {p.url && (
                  <>
                    {' · '}
                    <a href={p.url} target="_blank" rel="noreferrer">{t('licenses.mplSource')}</a>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="hint" style={{ margin: 0 }}>{t('licenses.mplModified', { repo: REPO_URL })}</p>
          <a className="btn" href="https://www.mozilla.org/MPL/2.0/" target="_blank" rel="noreferrer">
            <ExternalLink size={18} aria-hidden /> {t('licenses.mplFullText')}
          </a>
        </section>
      )}

      <section className="card stack" aria-labelledby="lic-deps">
        <h2 id="lic-deps" className="section-title" style={{ margin: 0 }}>{t('licenses.depsTitle')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('licenses.depsIntro', { count: list?.length ?? 0 })}</p>
        {!list && <p className="hint">{t('licenses.loading')}</p>}
        <ul className="list" data-testid="lic-deps">
          {list?.map((p) => {
            const id = `${p.name}@${p.version}`;
            const shown = open === id;
            return (
              <li key={id} className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span>
                    <strong>{p.name}</strong> <span className="hint">{p.version} · {p.license}</span>
                  </span>
                  <button className="btn-link" type="button" aria-expanded={shown} onClick={() => setOpen(shown ? null : id)}>
                    {t(shown ? 'licenses.hideText' : 'licenses.showText')}
                  </button>
                </div>
                {shown && (
                  <>
                    {p.url && (
                      <a className="hint" href={p.url} target="_blank" rel="noreferrer">
                        {p.url}
                      </a>
                    )}
                    <pre className="hint" style={{ whiteSpace: 'pre-wrap', margin: 0, overflowWrap: 'anywhere' }}>{p.text}</pre>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
