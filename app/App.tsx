import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { startInitialSync, startRealtimeSync, stopRealtimeSync } from './utils/storage';
import {
  getLocalRepoConfig,
  startAutoSync,
  stopAutoSync,
  startAutoBackup,
  stopAutoBackup,
  startHealthHeartbeat,
  stopHealthHeartbeat,
} from './lib/dual-supabase';

export default function App() {
  // Portal bileşenleri (Dialog, Popover vb.) document.body'ye render edilir.
  // dark class'ını <html> elementine ekleyerek portal'ların da dark tema
  // CSS değişkenlerini miras almasını sağlıyoruz.
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  // Uygulama acildiginda tum senkronizasyon servislerini baslat
  useEffect(() => {
    // 1. Buluttan/yerel depodan verileri cek ve localStorage ile merge et
    startInitialSync().then(() => {
      console.log('%c[App] Baslangic senkronizasyonu tamamlandi', 'color: #22c55e; font-weight: bold');
    });

    // 2. Realtime dinlemeyi baslat (baska cihazlardan gelen degisiklikleri yakala)
    startRealtimeSync();

    // 3. Yerel depo servisleri (eger aktifse)
    const localConfig = getLocalRepoConfig();
    if (localConfig.enabled) {
      // Saglik kontrol heartbeat (30s aralikla yerel/bulut durumunu izle)
      startHealthHeartbeat();

      // Artimli otomatik senkronizasyon (yerel → bulut)
      if (localConfig.autoSync) {
        startAutoSync();
      }

      // Zamanlanmis otomatik yedekleme (yerel depoda snapshot)
      if (localConfig.autoBackup) {
        startAutoBackup();
      }
    }

    return () => {
      stopRealtimeSync();
      stopAutoSync();
      stopAutoBackup();
      stopHealthHeartbeat();
    };
  }, []);

  return (
    <div className="dark min-h-screen bg-background">
      <RouterProvider router={router} />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(37, 99, 235, 0.1)',
            backdropFilter: 'blur(16px)',
            borderRadius: '0.75rem',
            fontFamily: "'Inter', system-ui, sans-serif",
          },
          className: 'font-medium',
          duration: 3000,
        }}
      />
    </div>
  );
}
