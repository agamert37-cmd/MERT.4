/**
 * Error Page - React Router Error Boundary için
 * Çoklu dil desteği (TR/EN/RU/UZ)
 */

import React from 'react';
import { useRouteError, Link } from 'react-router';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const errorTranslations: Record<string, Record<string, string>> = {
  tr: {
    title: 'Bir Hata Oluştu',
    fallbackMessage: 'Beklenmeyen bir hata oluştu.',
    techDetails: 'Teknik Detaylar',
    refresh: 'Sayfayı Yenile',
    home: 'Ana Sayfa',
  },
  en: {
    title: 'An Error Occurred',
    fallbackMessage: 'An unexpected error occurred.',
    techDetails: 'Technical Details',
    refresh: 'Refresh Page',
    home: 'Home',
  },
  ru: {
    title: 'Произошла ошибка',
    fallbackMessage: 'Произошла непредвиденная ошибка.',
    techDetails: 'Технические подробности',
    refresh: 'Обновить страницу',
    home: 'Главная',
  },
  uz: {
    title: 'Xatolik yuz berdi',
    fallbackMessage: 'Kutilmagan xatolik yuz berdi.',
    techDetails: 'Texnik tafsilotlar',
    refresh: 'Sahifani yangilash',
    home: 'Bosh sahifa',
  },
};

export function ErrorPage() {
  const error = useRouteError() as any;
  let lang = 'tr';
  try {
    const ctx = useLanguage();
    if (ctx?.lang) lang = ctx.lang;
  } catch {
    // LanguageContext may not be available in error boundary
    try {
      const saved = localStorage.getItem('isleyen_et_language');
      if (saved && ['tr', 'en', 'ru', 'uz'].includes(saved)) lang = saved;
    } catch {}
  }

  const txt = errorTranslations[lang] || errorTranslations.tr;

  console.error('Route Error:', error);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card rounded-2xl border border-border p-8 text-center">
        <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">{txt.title}</h1>
        <p className="text-muted-foreground mb-6">
          {error?.statusText || error?.message || txt.fallbackMessage}
        </p>

        {error?.stack && (
          <details className="mb-6 text-left">
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-white transition-colors">
              {txt.techDetails}
            </summary>
            <pre className="mt-2 text-xs text-red-400 bg-background p-3 rounded overflow-auto max-h-48">
              {error.stack}
            </pre>
          </details>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {txt.refresh}
          </button>
          <Link
            to="/"
            className="flex-1 px-4 py-2 bg-secondary hover:bg-accent text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            {txt.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
