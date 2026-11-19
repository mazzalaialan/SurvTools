import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from '@/locales/es.json';
import type { Language } from '@/core/settings/settings';

/** El español viene siempre (es el respaldo); el inglés y el portugués se cargan recién si se eligen (unos 125 KB menos al arrancar). */
async function loadLanguage(language: 'en' | 'pt'): Promise<void> {
  if (i18n.hasResourceBundle(language, 'translation')) return;
  const bundle = language === 'en' ? (await import('@/locales/en.json')).default : (await import('@/locales/pt.json')).default;
  i18n.addResourceBundle(language, 'translation', bundle);
}

export async function initI18n(language: Language): Promise<unknown> {
  const done = i18n.use(initReactI18next).init({
    resources: { es: { translation: es } },
    lng: 'es',
    fallbackLng: 'es',
    interpolation: { escapeValue: false }, // React ya escapa
  });
  await done;
  if (language !== 'es') {
    await loadLanguage(language);
    await i18n.changeLanguage(language);
  }
  return done;
}

export function setLanguage(language: Language): void {
  // El portugués de la app es el de Brasil (pt-BR).
  document.documentElement.lang = language === 'pt' ? 'pt-BR' : language;
  if (language !== 'es') void loadLanguage(language).then(() => i18n.changeLanguage(language));
  else void i18n.changeLanguage(language);
}

export { i18n };
