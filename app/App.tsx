// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
import { RouterProvider } from 'react-router';
import { GlobalTableSyncProvider } from './contexts/GlobalTableSyncContext';
import { router } from './routes';
import { Toaster } from 'sonner';
import { useEffect, useRef } from 'react';
import { startInitialSync, startRealtimeSync, stopRealtimeSync, forceSync } from './utils/storage';
import {
  getLocalRepoConfig,
  startAutoSync,
  stopAutoSync,
  startAutoBackup,
  stopAutoBackup,
  startHealthHeartbeat,
  stopHealthHeartbeat,
  // GÜÇLENDİRME [AJAN-2]: Edge Function olmadan doğrudan buluta yedek
  startCloudDirectBackupScheduler,
  stopCloudDirectBackupScheduler,
} from './lib/dual-supabase';
import { DbSetupBanner } from './components/DbSetupBanner';
import { SERVER_BASE_URL, SUPABASE_ANON_KEY } from './lib/supabase-config';
import { startNodeHeartbeat } from './lib/node-registry';
import { startAutoNodeSync, replayWAL } from './lib/active-client';
import { supabase as cloudSupabase } from './lib/supabase';

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

function scheduleCloudAutoBackup(): () => void {
  try {
    const raw = localStorage.getItem(CLOUD_AUTO_BACKUP_CONFIG_KEY);
    const config = raw ? JSON.parse(raw) : {};
    if (!config.enabled) return () => {};

    const intervalMs = (config.intervalHours || 24) * 60 * 60 * 1000;
    const lastRun = config.lastRun ? new Date(config.lastRun).getTime() : 0;
    const nextRun = lastRun + intervalMs;
    const delay = Math.max(nextRun - Date.now(), 60_000); // en az 1 dakika bekle

    // Her iki ID'yi de dışarıda tut ki cleanup fonksiyonu temizleyebilsin
    let periodicId: ReturnType<typeof setInterval> | null = null;

    const timerId = setTimeout(() => {
      runCloudAutoBackup();
      periodicId = setInterval(runCloudAutoBackup, intervalMs);
    }, delay);

    console.log(
      `%c[CloudAutoBackup] ${config.intervalHours || 24}s aralıklı otomatik yedek aktif (ilk çalışma: ${Math.round(delay / 60000)} dk sonra)`,
      'color: #a855f7'
    );

    // Hem timeout hem de interval temizlenir
    return () => {
      clearTimeout(timerId);
      if (periodicId !== null) clearInterval(periodicId);
    };
  } catch {
    return () => {};
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
  const cloudBackupCleanupRef = useRef<() => void>(() => {});

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

    // 4b. Edge Function gerektirmeyen doğrudan bulut yedekleme (her zaman aktif)
    // Kullanıcı YedeklerPage'de yapılandırma yapmasa bile 24s aralıklı yedek alır
    startCloudDirectBackupScheduler(24);

    // 4c. Çok sunuculu HA: Bu cihazı cloud KV'ye kaydet (heartbeat)
    // Sadece URL yapılandırılmışsa heartbeat yazar (getLocalNodeConfig().localUrl boşsa sessiz)
    const stopHeartbeatFn = startNodeHeartbeat();

    // 4d. Otomatik node senkronu (ayarlanmışsa)
    const stopAutoNodeSync = startAutoNodeSync(cloudSupabase);

    // 4e. Başlangıçta WAL'ı replay et (önceki oturumdan kalan yazmalar)
    replayWAL(cloudSupabase).catch(() => {});

    // 5. Uygulama arka plandan döndüğünde zorla yeniden sync
    //    BUG FIX [AJAN-2]: startRealtimeSync, _realtimeUnsubscribe set ise erken çıkıyordu.
    //    Önce stopRealtimeSync ile ölü kanalı temizliyoruz, sonra yeniden başlatıyoruz.
    const handleFocus = () => {
      stopRealtimeSync();   // Ölü WebSocket kanalını temizle
      startRealtimeSync();  // Temiz başlat
    };

    // Mobil için: tab gizlenip geri gelince de yeniden bağlan (focus tetiklenmeyebilir)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        stopRealtimeSync();
        startRealtimeSync();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopRealtimeSync();
      stopAutoSync();
      stopAutoBackup();
      stopHealthHeartbeat();
      stopCloudDirectBackupScheduler();
      stopHeartbeatFn();
      stopAutoNodeSync();
      cloudBackupCleanupRef.current();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div className="dark min-h-screen bg-background">
      {/* Veritabanı otomatik kurulum banner'ı — tablolar eksikse otomatik oluşturur */}
      <DbSetupBanner />
      {/* Tüm Supabase tablolarını app seviyesinde senkronize et (mobil-PC senkronu) */}
      <GlobalTableSyncProvider>
        <RouterProvider router={router} />
      </GlobalTableSyncProvider>
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
