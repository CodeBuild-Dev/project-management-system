import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import de from './locales/de.json';

/**
 * i18n bootstrap. JSON catalogs are loaded eagerly — small enough to bundle.
 * `projectmgmt.locale` in localStorage is the persistence key (set by the
 * detector); the LanguageSwitcher writes to it via i18n.changeLanguage.
 *
 * Default + fallback = English. New keys land in en.json first; de.json
 * mirrors them via machine translation (DeepL/GPT) for the first pass.
 */
export const SUPPORTED_LANGUAGES = ['en', 'de'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES as readonly string[] as string[],
    interpolation: {
      escapeValue: false, // React handles XSS escaping.
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'projectmgmt.locale',
      caches: ['localStorage'],
    },
    returnNull: false,
  });

export default i18n;
