import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from 'sonner';
import { useEffect, useRef } from 'react';
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
import { DbSetupBanner } from './components/DbSetupBanner';
import { SERVER_BASE_URL, SUPABASE_ANON_KEY } from './lib/supabase-config';

// ─── Bulut Otomatik Yedekleme ─────────────────────────────────────────────────
// YedeklerPage'deki ayarları okur ve periyodik olarak bulut yedeği alır.
const CLOUD_AUTO_BACKUP_CONFIG_KEY = 'isleyen_et_auto_backup_config';

async function runCloudAutoBackup() {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/backup/create-full`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ type: 'auto' }),
    });
    if (res.ok) {
      const config = JSON.parse(localStorage.getItem(CLOUD_AUTO_BACKUP_CONFIG_KEY) || '{}');
      config.lastRun = new Date().toISOString();
      localStorage.setItem(CLOUD_AUTO_BACKUP_CONFIG_KEY, JSON.stringify(config));
      console.log('%c[CloudAutoBackup] Otomatik bulut yedeği alındı ✓', 'color: #22c55e');
    }
  } catch (e: any) {
    console.warn('[CloudAutoBackup] Yedek alınamadı:', e.message);
  }
}

function scheduleCloudAutoBackup(): (() => void) | null {
  try {
    const raw = localStorage.getItem(CLOUD_AUTO_BACKUP_CONFIG_KEY);
    const config = raw ? JSON.parse(raw) : {};
    if (!config.enabled) return null;

    const intervalMs = (config.intervalHours || 24) * 60 * 60 * 1000;
    const lastRun = config.lastRun ? new Date(config.lastRun).getTime() : 0;
    const nextRun = lastRun + intervalMs;
    const delay = Math.max(nextRun - Date.now(), 60_000); // en az 1 dakika bekle

    const timer = setTimeout(() => {
      runCloudAutoBackup();
      // İlk çalışmadan sonra periyodik tekrar başlat
      const periodic = setInterval(runCloudAutoBackup, intervalMs);
      // Cleanup fonksiyonu interval'ı temizlemez; component unmount'ta zaten duracak
      // (setInterval ref'i burada tutmak için dış scope'a ihtiyaç var, basit tutuyoruz)
      void periodic;
    }, delay);

    console.log(
      `%c[CloudAutoBackup] ${config.intervalHours || 24}s aralıklı otomatik yedek aktif (ilk çalışma: ${Math.round(delay / 60000)} dk sonra)`,
      'color: #a855f7'
    );

    return () => clearTimeout(timer);
  } catch {
    return null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // Portal bileşenleri (Dialog, Popover vb.) document.body'ye render edilir.
  // dark class'ını <html> elementine ekleyerek portal'ların da dark tema
  // CSS değişkenlerini miras almasını sağlıyoruz.
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  // Uygulama acildiginda tum senkronizasyon servislerini baslat
  const cloudBackupCleanupRef = useRef<(() => void) | null>(null);

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

    // 4. Bulut otomatik yedekleme zamanlayıcısı (YedeklerPage ayarlarına göre)
    cloudBackupCleanupRef.current = scheduleCloudAutoBackup();

    return () => {
      stopRealtimeSync();
      stopAutoSync();
      stopAutoBackup();
      stopHealthHeartbeat();
      cloudBackupCleanupRef.current?.();
    };
  }, []);

  return (
    <div className="dark min-h-screen bg-background">
      {/* Veritabanı otomatik kurulum banner'ı — tablolar eksikse otomatik oluşturur */}
      <DbSetupBanner />
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
