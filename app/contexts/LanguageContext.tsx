import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { type Language, t as translate, LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, type LanguageMeta } from '../utils/i18n';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, defaultText?: string) => string;
  languages: LanguageMeta[];
  currentLanguage: LanguageMeta;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: DEFAULT_LANGUAGE,
  setLang: () => {},
  t: (key, defaultText) => defaultText || key,
  languages: LANGUAGES,
  currentLanguage: LANGUAGES[0],
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved && ['tr', 'en', 'ru', 'uz'].includes(saved)) return saved as Language;
    } catch {}
    return DEFAULT_LANGUAGE;
  });

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
    } catch {}
  }, []);

  const t = useCallback((key: string, defaultText?: string) => {
    const res = translate(lang, key);
    return res === key ? (defaultText || key) : res;
  }, [lang]);

  const currentLanguage = useMemo(
    () => LANGUAGES.find(l => l.code === lang) || LANGUAGES[0],
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, languages: LANGUAGES, currentLanguage }),
    [lang, setLang, t, currentLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
