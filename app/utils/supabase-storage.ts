/**
 * Supabase Storage Integration - DUAL WRITE
 * 
 * Her setInStorage cagrisinda veri hem localStorage'a hem de
 * Supabase KV store'a yazilir (debounced). Uygulama acildiginda
 * KV store'dan tum veriler cekilip localStorage ile merge edilir.
 * 
 * Bu sayede:
 * 1. Farkli cihazlarda veri senkronize olur
 * 2. Yedekleme otomatik olarak bulutta saklanir
 * 3. localStorage bozulursa buluttan geri yuklenir
 */

import { SERVER_BASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase-config';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import {
  getLocalRepoConfig,
  kvBatchWriteToPrimary,
  kvDeleteFromPrimary,
  kvReadFromPrimary,
  isLocalHealthy,
} from '../lib/dual-supabase';

const STORAGE_PREFIX = 'isleyen_et_';
const KV_SYNC_PREFIX = 'sync_'; // KV store'da her key bu prefix ile saklanir
const KV_TABLE = 'kv_store_daadfb0c';

// Storage Keys Enum
export enum StorageKey {
  USER = 'user',
  CURRENT_EMPLOYEE = 'current_employee',
  FISLER = 'fisler',
  CARI_DATA = 'cari_data',
  STOK_DATA = 'stok_data',
  PERSONEL_DATA = 'personel_data',
  KASA_DATA = 'kasa_data',
  ARAC_DATA = 'arac_data',
  SYSTEM_SETTINGS = 'system_settings',
  BACKUPS = 'backups',
  BANK_DATA = 'bank_data',
  POS_DATA = 'pos_data',
  DELETED_FISLER = 'deleted_fisler',
  DELETED_ACTIVITIES = 'deleted_activities',
  LOGIN_CONTENT = 'login_content',
  URETIM_DATA = 'uretim_data',
  URETIM_PROFILES = 'uretim_profiles',
  URETIM_DEFAULTS = 'uretim_defaults',
  PAZARLAMA_CONTENT = 'pazarlama_content',
  STOK_CATEGORIES = 'stok_categories',
  CEKLER_DATA = 'cekler_data',
  ARAC_SHIFTS = 'arac_shifts',
  ARAC_KM_LOGS = 'arac_km_logs',
  USER_ACTIVITY_LOG = 'user_activity_log',
  VITRIN_ANALYTICS = 'vitrin_analytics',
  FATURALAR = 'faturalar',
  FATURA_STOK = 'fatura_stok',
}

// Senkronize edilmesi gereken onemli storage key'leri
// (session/gecici veriler haric)
const SYNCABLE_KEYS = new Set<string>([
  StorageKey.FISLER,
  StorageKey.CARI_DATA,
  StorageKey.STOK_DATA,
  StorageKey.PERSONEL_DATA,
  StorageKey.KASA_DATA,
  StorageKey.ARAC_DATA,
  StorageKey.SYSTEM_SETTINGS,
  StorageKey.BANK_DATA,
  StorageKey.POS_DATA,
  StorageKey.DELETED_FISLER,
  StorageKey.URETIM_DATA,
  StorageKey.URETIM_PROFILES,
  StorageKey.URETIM_DEFAULTS,
  StorageKey.PAZARLAMA_CONTENT,
  StorageKey.STOK_CATEGORIES,
  StorageKey.CEKLER_DATA,
  StorageKey.ARAC_SHIFTS,
  StorageKey.ARAC_KM_LOGS,
  StorageKey.USER_ACTIVITY_LOG,
  StorageKey.VITRIN_ANALYTICS,
  StorageKey.FATURALAR,
  StorageKey.FATURA_STOK,
]);

// ═══════════════════════════════════════════════════════════════
// BAGLANTI KONTROLU
// ═══════════════════════════════════════════════════════════════

function isConfigured(): boolean {
  return !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 10;
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

// ═══════════════════════════════════════════════════════════════
// DEBOUNCED CLOUD WRITE QUEUE
// ═══════════════════════════════════════════════════════════════

const _pendingWrites = new Map<string, any>();
let _writeTimer: ReturnType<typeof setTimeout> | null = null;
const WRITE_DEBOUNCE_MS = 500; // Yari saniye bekle, sonra toplu yaz
let _isFlushing = false;

function scheduleFlush() {
  if (_writeTimer) clearTimeout(_writeTimer);
  _writeTimer = setTimeout(() => flushWrites(), WRITE_DEBOUNCE_MS);
}

async function flushWrites() {
  if (_isFlushing || _pendingWrites.size === 0 || !isConfigured()) return;
  _isFlushing = true;

  const entries = Array.from(_pendingWrites.entries());
  _pendingWrites.clear();

  try {
    const keys = entries.map(([k]) => `${KV_SYNC_PREFIX}${k}`);
    const values = entries.map(([, v]) => v);

    // Yerel depo aktifse VE saglikli ise, once oraya yaz (daha hizli)
    const localConfig = getLocalRepoConfig();
    const localReady = localConfig.enabled && localConfig.serviceRoleKey && isLocalHealthy();

    if (localReady) {
      try {
        await kvBatchWriteToPrimary(keys, values);
        const syncedKeys = entries.map(([k]) => k).join(', ');
        console.log(`%c[LocalSync] ${entries.length} key yerel depoya yazildi: ${syncedKeys}`, 'color: #8b5cf6');
        // Arka planda buluta da yaz (yedek)
        fetch(`${SERVER_BASE_URL}/kv/mset`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ keys, values }),
        }).catch(() => {}); // Bulut hatasi kritik degil, yerel zaten yazildi
      } catch (localErr: any) {
        console.warn('[LocalSync] Yerel yazma basarisiz, buluta fallback:', localErr.message);
        // Yerel basarisizsa buluta yaz
        const res = await fetch(`${SERVER_BASE_URL}/kv/mset`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ keys, values }),
        });
        if (!res.ok) throw new Error(`Cloud mset failed: ${res.status}`);
      }
    } else {
      // Yerel depo yok veya sagliksiz, dogrudan buluta yaz
      const res = await fetch(`${SERVER_BASE_URL}/kv/mset`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ keys, values }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'unknown');
        console.error(`[CloudSync] mset failed (${res.status}): ${text}`);
        entries.forEach(([k, v]) => _pendingWrites.set(k, v));
        scheduleFlush();
      } else {
        const syncedKeys = entries.map(([k]) => k).join(', ');
        console.log(`%c[CloudSync] ${entries.length} key senkronize edildi: ${syncedKeys}`, 'color: #22c55e');
      }
    }
  } catch (e: any) {
    console.error('[CloudSync] flush error:', e.message);
    entries.forEach(([k, v]) => _pendingWrites.set(k, v));
    setTimeout(() => scheduleFlush(), 3000);
  } finally {
    _isFlushing = false;
    if (_pendingWrites.size > 0) {
      scheduleFlush();
    }
  }
}

// Tab gizlendiginde veya sayfa kapanirken bekleyen yazmalari hemen gonder
if (typeof window !== 'undefined') {
  // Tab gizlendiginde flush; ön plana gelince yeniden sync (mobil kritik)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _pendingWrites.size > 0) {
      flushWrites();
    }
    if (document.visibilityState === 'visible') {
      // Arka plandan döndüğünde veriyi tazele (30s sınırı ile)
      syncIfStale();
    }
  });

  // Ağ bağlantısı geri gelince zorla sync (offline → online geçişi)
  window.addEventListener('online', () => {
    console.log('%c[CloudSync] Ağ bağlantısı geri geldi, yeniden senkronize ediliyor...', 'color: #22c55e');
    _initialSyncDone = false;
    _lastSyncTime = 0;
    syncFromCloud().then(result => {
      _lastSyncTime = Date.now();
      if (result.synced > 0) {
        toast.success('Veriler güncellendi', { id: 'sync-online', duration: 2500 });
      }
    }).catch(() => {});
    stopRealtimeSync();
    startRealtimeSync();
  });

  // Sayfa kapanirken keepalive fetch ile gonder
  window.addEventListener('beforeunload', () => {
    if (_pendingWrites.size > 0 && isConfigured()) {
      const entries = Array.from(_pendingWrites.entries());
      const keys = entries.map(([k]) => `${KV_SYNC_PREFIX}${k}`);
      const values = entries.map(([, v]) => v);
      _pendingWrites.clear();
      
      try {
        fetch(`${SERVER_BASE_URL}/kv/mset`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ keys, values }),
          keepalive: true,
        });
      } catch {}
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// TEMEL FONKSIYONLAR
// ═══════════════════════════════════════════════════════════════

/**
 * Get prefixed storage key
 */
const getPrefixedKey = (key: string): string => {
  return `${STORAGE_PREFIX}${key}`;
};

/**
 * Get item from localStorage
 */
export const getFromStorage = <T = any>(key: StorageKey | string): T | null => {
  try {
    const prefixedKey = getPrefixedKey(key);
    const item = localStorage.getItem(prefixedKey);
    if (item === null) return null;
    return JSON.parse(item) as T;
  } catch (error) {
    console.error('Error getting from storage:', error);
    return null;
  }
};

/**
 * Set item in localStorage + queue cloud sync
 */
export const setInStorage = <T = any>(key: StorageKey | string, value: T): boolean => {
  try {
    const prefixedKey = getPrefixedKey(key);
    localStorage.setItem(prefixedKey, JSON.stringify(value));
    
    // Cloud sync icin kuyruklama (sadece senkronize edilebilir key'ler icin)
    if (SYNCABLE_KEYS.has(key as string)) {
      _pendingWrites.set(key as string, value);
      scheduleFlush();
    }
    
    // Defer event dispatch
    setTimeout(() => window.dispatchEvent(new Event('storage_update')), 0);
    return true;
  } catch (error) {
    console.error('Error setting in storage:', error);
    return false;
  }
};

/**
 * Remove item from localStorage + cloud
 */
export const removeFromStorage = (key: StorageKey | string): boolean => {
  try {
    const prefixedKey = getPrefixedKey(key);
    localStorage.removeItem(prefixedKey);
    
    // Cloud'dan ve yerel depodan da sil (arka planda)
    if (SYNCABLE_KEYS.has(key as string) && isConfigured()) {
      const kvKey = `${KV_SYNC_PREFIX}${key}`;
      
      // Yerel depo aktifse ondan da sil
      const localConfig = getLocalRepoConfig();
      if (localConfig.enabled && localConfig.serviceRoleKey && isLocalHealthy()) {
        kvDeleteFromPrimary(kvKey).catch(e => console.warn('[LocalSync] delete failed:', e.message));
      }
      
      // Buluttan da sil
      fetch(`${SERVER_BASE_URL}/kv/del`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ key: kvKey }),
      }).catch(e => console.warn('[CloudSync] delete failed:', e.message));
    }
    
    return true;
  } catch (error) {
    console.error('Error removing from storage:', error);
    return false;
  }
};

// ═══════════════════════════════════════════════════════════════
// CLOUD SYNC: Baslangicta buluttan veri cekme
// ═══════════════════════════════════════════════════════════════

let _initialSyncDone = false;
let _initialSyncPromise: Promise<void> | null = null;
let _lastSyncTime = 0;
const MIN_RESYNC_INTERVAL_MS = 30_000; // 30s geçmediyse tekrar sync yapma

/** Belirli bir süre geçmişse buluttan yeniden veri çek (mobil arka plandan dönüş için) */
async function syncIfStale(): Promise<void> {
  const now = Date.now();
  if (now - _lastSyncTime < MIN_RESYNC_INTERVAL_MS) return;
  _initialSyncDone = false;
  try {
    await syncFromCloud();
    _lastSyncTime = Date.now();
  } catch {}
  // Realtime bağlantısı düşmüş olabilir, yeniden başlat
  if (!_realtimeUnsubscribe) startRealtimeSync();
}

/** Zorla tam senkronizasyon — mobil sync butonu ve hata durumları için */
export async function forceSync(): Promise<void> {
  _initialSyncDone = false;
  _lastSyncTime = 0;
  await flushWrites();
  await syncFromCloud();
  _lastSyncTime = Date.now();
  stopRealtimeSync();
  startRealtimeSync();
}

/**
 * Uygulama acildiginda buluttan tum senkronize edilebilir verileri cek
 * ve localStorage ile merge et.
 * 
 * Kural: Cloud'da veri varsa, localStorage'dakilerin ustune yazar
 * (en son cloud'a yazilan versiyon en guncel kabul edilir)
 */
export async function syncFromCloud(): Promise<{ synced: number; errors: string[] }> {
  if (!isConfigured()) return { synced: 0, errors: ['Supabase yapilandirilmamis'] };
  if (_initialSyncDone) return { synced: 0, errors: [] };

  const errors: string[] = [];
  let synced = 0;

  try {
    // Yerel depo aktifse VE saglikliysa oncelikle oradan oku
    const localConfig = getLocalRepoConfig();
    const useLocal = localConfig.enabled && localConfig.anonKey && isLocalHealthy();

    if (useLocal) {
      console.log('%c[LocalSync] Yerel depodan veri cekiliyor...', 'color: #8b5cf6; font-weight: bold');
    } else {
      console.log('%c[CloudSync] Buluttan veri cekiliyor...', 'color: #3b82f6; font-weight: bold');
    }

    let rows: Array<{ key: string; value: any }> = [];

    if (useLocal) {
      try {
        rows = await kvReadFromPrimary(KV_SYNC_PREFIX);
        console.log(`%c[LocalSync] Yerel depodan ${rows.length} kayit okundu`, 'color: #8b5cf6');
      } catch (localErr: any) {
        console.warn('[LocalSync] Yerel okuma basarisiz, buluta fallback:', localErr.message);
        errors.push(`Yerel okuma hatasi: ${localErr.message}`);
        // Buluta fallback
        const { data, error } = await supabase
          .from(KV_TABLE)
          .select('key, value')
          .like('key', `${KV_SYNC_PREFIX}%`);
        if (!error && data) rows = data;
        else errors.push(`Bulut okuma hatasi: ${error?.message}`);
      }
    } else {
      // Dogrudan Supabase client ile oku
      const { data, error } = await supabase
        .from(KV_TABLE)
        .select('key, value')
        .like('key', `${KV_SYNC_PREFIX}%`);

      if (error) {
        console.warn('[CloudSync] Dogrudan okuma basarisiz, sunucuya fallback:', error.message);
        errors.push(`Dogrudan KV okuma hatasi: ${error.message}`);
        try {
          const res = await fetch(`${SERVER_BASE_URL}/kv/prefix/${KV_SYNC_PREFIX}`, { headers: getHeaders() });
          if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
              rows = json.data;
              console.log(`%c[CloudSync] Server fallback ile ${rows.length} kayit okundu`, 'color: #f59e0b');
            }
          }
        } catch (serverErr: any) {
          errors.push(`Server fallback hatasi: ${serverErr.message}`);
        }
      } else {
        rows = data || [];
      }
    }

    if (rows.length > 0) {
      for (const row of rows) {
        try {
          const storageKey = row.key.replace(KV_SYNC_PREFIX, '');
          const prefixedKey = getPrefixedKey(storageKey);

          if (row.value !== null && row.value !== undefined) {
            localStorage.setItem(prefixedKey, JSON.stringify(row.value));
            synced++;
          }
        } catch (e: any) {
          errors.push(`Key parse hatasi: ${e.message}`);
        }
      }

      if (synced > 0) {
        const source = useLocal ? 'yerel depodan' : 'buluttan';
        console.log(
          `%c[Sync] ${synced} koleksiyon ${source} senkronize edildi!`,
          'color: #22c55e; font-weight: bold'
        );
        // React bileşenlerinin yeniden yüklemesi için biraz bekle
        setTimeout(() => window.dispatchEvent(new Event('storage_update')), 50);
        setTimeout(() => window.dispatchEvent(new Event('storage_update')), 500);
      }
    } else if (errors.length === 0) {
      // Hata yoksa ve bulut boşsa: ilk kurulum, lokalden buluta yükle
      console.log('%c[Sync] Depoda henuz veri yok, ilk senkronizasyon yapiliyor...', 'color: #f59e0b');
      await pushAllToCloud();
    } else {
      // Hata varsa bulut verisini KORUMAK için pushAllToCloud ÇAĞIRMA
      // (ağ hatası/bağlantı sorunu durumunda lokal boş veriyle bulut üzerine yazma)
      console.warn('%c[Sync] Bulut okuma hatalari var, yerel veriler buluta yazilmiyor (veri koruma)', 'color: #f59e0b; font-weight: bold');
    }
  } catch (e: any) {
    console.error('[Sync] sync error:', e);
    errors.push(e.message);
  }

  _initialSyncDone = true;
  _lastSyncTime = Date.now();
  return { synced, errors };
}

/**
 * localStorage'daki TUM senkronize edilebilir verileri buluta yukle
 */
export async function pushAllToCloud(): Promise<{ pushed: number; errors: string[] }> {
  if (!isConfigured()) return { pushed: 0, errors: ['Supabase yapilandirilmamis'] };

  const errors: string[] = [];
  const keys: string[] = [];
  const values: any[] = [];

  for (const sk of SYNCABLE_KEYS) {
    try {
      const data = getFromStorage(sk);
      if (data !== null && data !== undefined) {
        keys.push(`${KV_SYNC_PREFIX}${sk}`);
        values.push(data);
      }
    } catch {}
  }

  if (keys.length === 0) return { pushed: 0, errors: [] };

  try {
    // Yerel depo aktifse once oraya yaz
    const localConfig = getLocalRepoConfig();
    if (localConfig.enabled && localConfig.serviceRoleKey && isLocalHealthy()) {
      try {
        await kvBatchWriteToPrimary(keys, values);
        console.log(`%c[LocalSync] pushAll: ${keys.length} koleksiyon yerel depoya yuklendi`, 'color: #8b5cf6; font-weight: bold');
      } catch (localErr: any) {
        errors.push(`Yerel depoya yukleme hatasi: ${localErr.message}`);
      }
    }

    // Buluta da yaz (her zaman)
    const CHUNK = 50;
    for (let i = 0; i < keys.length; i += CHUNK) {
      const chunkKeys = keys.slice(i, i + CHUNK);
      const chunkValues = values.slice(i, i + CHUNK);

      const res = await fetch(`${SERVER_BASE_URL}/kv/mset`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ keys: chunkKeys, values: chunkValues }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'unknown');
        errors.push(`mset chunk ${i} failed: ${text}`);
      }
    }

    console.log(
      `%c[CloudSync] ${keys.length} koleksiyon buluta yuklendi`,
      'color: #22c55e; font-weight: bold'
    );
  } catch (e: any) {
    errors.push(e.message);
  }

  return { pushed: keys.length, errors };
}

/**
 * Belirli bir storage key'ini hemen buluta senkronize et (debounce olmadan)
 */
export async function syncKeyToCloud(key: StorageKey | string): Promise<boolean> {
  if (!isConfigured() || !SYNCABLE_KEYS.has(key as string)) return false;

  try {
    const data = getFromStorage(key);
    if (data === null) return false;

    const res = await fetch(`${SERVER_BASE_URL}/kv/set`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ key: `${KV_SYNC_PREFIX}${key}`, value: data }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Baslangic senkronizasyonunu baslatir (bir kez cagirilir)
 */
export function startInitialSync(): Promise<void> {
  if (_initialSyncPromise) return _initialSyncPromise;

  _initialSyncPromise = syncFromCloud().then(result => {
    if (result.errors.length > 0) {
      console.warn('[CloudSync] Baslangic senkronizasyonunda hatalar:', result.errors);
    }
    // Senkronizasyon tamamlandıktan sonra tüm bileşenleri güncelle
    if (result.synced > 0) {
      window.dispatchEvent(new Event('storage_update'));
    }
  });

  return _initialSyncPromise;
}

// ═══════════════════════════════════════════════════════════════
// REALTIME SUBSCRIPTION - Cloud degisikliklerini dinle
// ═══════════════════════════════════════════════════════════════

let _realtimeUnsubscribe: (() => void) | null = null;

export function startRealtimeSync() {
  if (!isConfigured() || _realtimeUnsubscribe) return;

  const channel = supabase
    .channel('cloud_sync_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: KV_TABLE },
      (payload) => {
        const newRow = payload.new as any;
        const key = newRow?.key || '';

        // Sadece sync_ prefix'li key'leri dinle
        if (!key.startsWith(KV_SYNC_PREFIX)) return;

        const storageKey = key.replace(KV_SYNC_PREFIX, '');

        // Kendi yazdigimiz veriyi echo olarak aldigimizda atla
        if (_pendingWrites.has(storageKey)) return;

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (newRow?.value !== undefined) {
            const prefixedKey = getPrefixedKey(storageKey);
            try {
              localStorage.setItem(prefixedKey, JSON.stringify(newRow.value));
              console.log(`%c[CloudSync RT] ${storageKey} guncellendi (baska cihazdan)`, 'color: #a855f7');
              setTimeout(() => window.dispatchEvent(new Event('storage_update')), 0);
            } catch {}
          }
        } else if (payload.eventType === 'DELETE') {
          const prefixedKey = getPrefixedKey(storageKey);
          localStorage.removeItem(prefixedKey);
          setTimeout(() => window.dispatchEvent(new Event('storage_update')), 0);
        }
      }
    )
    .subscribe();

  _realtimeUnsubscribe = () => {
    supabase.removeChannel(channel);
  };

  console.log('%c[CloudSync] Realtime dinleme baslatildi', 'color: #a855f7; font-weight: bold');
}

export function stopRealtimeSync() {
  if (_realtimeUnsubscribe) {
    _realtimeUnsubscribe();
    _realtimeUnsubscribe = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// YEDEKLEME
// ═══════════════════════════════════════════════════════════════

/**
 * Create system backup (localStorage + cloud)
 */
export const createSystemBackup = async (): Promise<void> => {
  try {
    // Once bekleyen yazmalari gonder
    await flushWrites();

    const backup: Record<string, any> = {};
    const keys = Object.keys(localStorage);
    
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        const cleanKey = key.replace(STORAGE_PREFIX, '');
        try {
          backup[cleanKey] = JSON.parse(localStorage.getItem(key) || 'null');
        } catch {
          backup[cleanKey] = localStorage.getItem(key);
        }
      }
    });
    
    const backupData = {
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      type: 'manual',
      data: backup,
    };
    
    // 1. Cloud'a kaydet
    if (isConfigured()) {
      try {
        const res = await fetch(`${SERVER_BASE_URL}/kv/set`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            key: `backup:${backupData.date}:manual_${Date.now()}`,
            value: JSON.stringify(backupData),
          }),
        });
        if (res.ok) {
          console.log('%c[Backup] Bulut yedegi olusturuldu', 'color: #22c55e');
        }
      } catch (e: any) {
        console.warn('[Backup] Bulut yedegi olusturulamadi:', e.message);
      }
    }
    
    // 2. localStorage'a da kaydet
    const existingBackups = getFromStorage<any[]>(StorageKey.BACKUPS) || [];
    existingBackups.unshift(backupData);
    const trimmedBackups = existingBackups.slice(0, 10);
    // Sadece localStorage'a yaz (sonsuz dongu onleme - BACKUPS syncable degil)
    const prefixedKey = getPrefixedKey(StorageKey.BACKUPS);
    localStorage.setItem(prefixedKey, JSON.stringify(trimmedBackups));
    
    // 3. Dosya olarak indir
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `isleyen-et-backup-${backupData.date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Sistem yedegi olusturuldu ve buluta yuklendi!');
  } catch (error) {
    console.error('Error creating backup:', error);
    toast.error('Yedek olusturulurken hata olustu');
  }
};

/**
 * Get system backups
 */
export const getSystemBackups = (): any[] => {
  return getFromStorage<any[]>(StorageKey.BACKUPS) || [];
};

/**
 * Restore system backup
 */
export const restoreSystemBackup = (backup: any): boolean => {
  try {
    const data = backup.data;
    
    Object.keys(data).forEach(key => {
      const prefixedKey = getPrefixedKey(key);
      const value = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
      localStorage.setItem(prefixedKey, value);
    });
    
    // Geri yuklenen veriyi buluta da gonder
    if (isConfigured()) {
      pushAllToCloud().catch(e => console.warn('[Restore] Cloud push failed:', e));
    }
    
    toast.success('Yedek geri yuklendi! Sayfa yenileniyor...');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
    
    return true;
  } catch (error) {
    console.error('Error restoring backup:', error);
    toast.error('Yedek geri yuklenirken hata olustu');
    return false;
  }
};

// ═══════════════════════════════════════════════════════════════
// ESKI API UYUMLULUGU (re-export)
// ═══════════════════════════════════════════════════════════════

export const fetchFromSupabase = async <T = any>(
  tableName: string,
  orderBy?: string,
  ascending: boolean = false
): Promise<T[] | null> => {
  try {
    let query = supabase.from(tableName).select('*');
    if (orderBy) query = query.order(orderBy, { ascending });
    const { data, error } = await query;
    if (error) return null;
    return data as T[];
  } catch { return null; }
};

export const saveToSupabase = async <T = any>(tableName: string, data: T[]): Promise<boolean> => {
  try {
    const { error } = await supabase.from(tableName).upsert(data, { onConflict: 'id' });
    return !error;
  } catch { return false; }
};

export const insertToSupabase = async <T = any>(tableName: string, item: T): Promise<T | null> => {
  try {
    const { data, error } = await supabase.from(tableName).insert([item]).select().single();
    return error ? null : data as T;
  } catch { return null; }
};

export const updateInSupabase = async <T = any>(tableName: string, id: string, updates: Partial<T>): Promise<T | null> => {
  try {
    const { data, error } = await supabase.from(tableName).update(updates).eq('id', id).select().single();
    return error ? null : data as T;
  } catch { return null; }
};

export const deleteFromSupabase = async (tableName: string, id: string): Promise<boolean> => {
  try {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    return !error;
  } catch { return false; }
};

export const subscribeToTable = (tableName: string, callback: (payload: any) => void) => {
  try {
    const subscription = supabase
      .channel(`${tableName}_changes`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, callback)
      .subscribe();
    return () => { subscription.unsubscribe(); };
  } catch { return () => {}; }
};