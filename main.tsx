import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles/index.css';

// Service Worker kaydı — PWA offline desteği
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
      console.info('[SW] Kayıtlı:', reg.scope);

      // Arka plan sync kaydı — sayfa arka plandayken sync tetiklensin
      if ('SyncManager' in window) {
        reg.sync?.register('mert-db-sync').catch(() => {});
      }
    }).catch(err => console.warn('[SW] Kayıt başarısız:', err));

    // Service Worker'dan gelen "sync tetiklendi" mesajını dinle
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'BACKGROUND_SYNC_TRIGGERED') {
        import('./app/lib/pouchdb').then(({ restartAllSync }) => {
          restartAllSync();
        });
      }
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
