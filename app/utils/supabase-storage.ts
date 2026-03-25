// [AJAN-2 | claude/serene-gagarin | 2026-03-24] Son düzenleyen: Claude Sonnet 4.6
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

// ═══════════════════════════════════════════════════════════════
// CIHAZ KİMLİĞİ & ZAMAN DAMGASI SARMALAYICI
// ═══════════════════════════════════════════════════════════════

const DEVICE_ID_KEY = `${STORAGE_PREFIX}_device_id`;
const QUEUE_PERSIST_KEY = `${STORAGE_PREFIX}_pending_queue`;
const VERSIONS_KEY = `${STORAGE_PREFIX}_sync_versions`;

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch { return 'unknown'; }
}

// Timestamp sarmalayıcı — her sync_ değeri bu yapıyla saklanır
interface SyncEnvelope { _v: 1; _updatedAt: number; _deviceId: string; _data: any; }

function wrapEnvelope(data: any): SyncEnvelope {
  return { _v: 1, _updatedAt: Date.now(), _deviceId: getDeviceId(), _data: data };
}

function unwrapEnvelope(val: any): { data: any; updatedAt: number } {
  if (val && val._v === 1 && '_data' in val) {
    return { data: val._data, updatedAt: val._updatedAt ?? 0 };
  }
  // Eski format (sarmalanmamış) — timestamp yok, en eski kabul et
  return { data: val, updatedAt: 0 };
}

// ── Yerel sürüm takibi (key başına son yerel yazma zamanı) ────

function getLocalVersions(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(VERSIONS_KEY) || '{}'); } catch { return {}; }
}

function setLocalVersion(key: string, ts: number): void {
  try {
    const v = getLocalVersions();
    v[key] = ts;
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(v));
  } catch {}
}

// ── Kalıcı yazma kuyruğu (sayfa kapanmasında veri kaybını önler) ──

function loadPersistedQueue(): Map<string, any> {
  try {
    const raw = localStorage.getItem(QUEUE_PERSIST_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw)));
  } catch { return new Map(); }
}

function saveQueueToStorage(): void {
  try {
    if (_pendingWrites.size === 0) {
      localStorage.removeItem(QUEUE_PERSIST_KEY);
    } else {
      const obj: Record<string, any> = {};
      _pendingWrites.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(QUEUE_PERSIST_KEY, JSON.stringify(obj));
    }
  } catch {}
}

// ── Echo filtresi (kendi yazdığımız veriyi realtime'dan alma) ──

const _echoKeys = new Map<string, number>(); // key → expiry ms

function markAsEcho(key: string): void {
  _echoKeys.set(key, Date.now() + 3000); // 3 saniyelik pencere
}

function isEcho(key: string): boolean {
  const exp = _echoKeys.get(key);
  if (!exp) return false;
  if (Date.now() > exp) { _echoKeys.delete(key); return false; }
  return true;
}

// ── Reaktif sync durumu ───────────────────────────────────────

interface SyncState {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: number;     // unix ms
  lastError: string | null;
  isOnline: boolean;
}

const _syncState: SyncState = {
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: 0,
  lastError: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
};

export function getSyncState(): Readonly<SyncState> {
  return { ..._syncState };
}

function notifySyncStateChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sync_state_change', { detail: getSyncState() }));
  }
}

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

// Kalıcı kuyruktan geri yükle (sayfa çökmesinden kurtarma)
const _pendingWrites: Map<string, any> = loadPersistedQueue();
let _writeTimer: ReturnType<typeof setTimeout> | null = null;
const WRITE_DEBOUNCE_MS = 500;
let _isFlushing = false;

// GÜÇLENDİRME [AJAN-2]: Uygulama açıldığında önceki çalışmadan kalan
// kuyruğu 3 saniye sonra otomatik flush et (çökme/kapanma kurtarma).
if (_pendingWrites.size > 0 && typeof window !== 'undefined') {
  setTimeout(() => {
    if (isConfigured() && !_isFlushing) {
      console.log(`%c[CloudSync] Önceki oturumdan ${_pendingWrites.size} bekleyen yazma kurtarılıyor...`, 'color: #f59e0b; font-weight: bold');
      flushWrites().catch(() => {});
    }
  }, 3000);
}

function scheduleFlush() {
  if (_writeTimer) clearTimeout(_writeTimer);
  _writeTimer = setTimeout(() => flushWrites(), WRITE_DEBOUNCE_MS);
}

async function flushWrites() {
  if (_isFlushing || _pendingWrites.size === 0 || !isConfigured()) return;
  _isFlushing = true;
  _syncState.isSyncing = true;
  notifySyncStateChange();

  const entries = Array.from(_pendingWrites.entries());
  _pendingWrites.clear();
  saveQueueToStorage(); // Kuyruk temizlendi → kalıcı depoyu güncelle

  try {
    // entries[k] zaten wrapEnvelope() ile sarmalanmış değer içeriyor
    const keys = entries.map(([k]) => `${KV_SYNC_PREFIX}${k}`);
    const values = entries.map(([, v]) => v);

    const localConfig = getLocalRepoConfig();
    const localReady = localConfig.enabled && localConfig.serviceRoleKey && isLocalHealthy();

    if (localReady) {
      try {
        await kvBatchWriteToPrimary(keys, values);
        console.log(`%c[LocalSync] ${entries.length} key yerel depoya yazıldı`, 'color: #8b5cf6');
        // Arka planda buluta da yaz (yedek)
        fetch(`${SERVER_BASE_URL}/kv/mset`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ keys, values }),
        }).catch(() => {});
      } catch (localErr: any) {
        console.warn('[LocalSync] Yerel yazma başarısız, buluta fallback:', localErr.message);
        const res = await fetch(`${SERVER_BASE_URL}/kv/mset`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ keys, values }),
        });
        if (!res.ok) throw new Error(`Cloud mset failed: ${res.status}`);
      }
    } else {
      const res = await fetch(`${SERVER_BASE_URL}/kv/mset`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ keys, values }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'unknown');
        throw new Error(`Cloud mset ${res.status}: ${text}`);
      }
      console.log(`%c[CloudSync] ${entries.length} key senkronize edildi`, 'color: #22c55e');
    }

    // Başarılı → realtime echo filtresi ve durum güncelle
    entries.forEach(([k]) => markAsEcho(k));
    _syncState.lastSyncAt = Date.now();
    _syncState.lastError = null;
  } catch (e: any) {
    console.error('[CloudSync] flush error:', e.message);
    _syncState.lastError = e.message;
    // Hata → kuyruğa geri ekle, kalıcı depoya kaydet
    entries.forEach(([k, v]) => _pendingWrites.set(k, v));
    saveQueueToStorage();
    setTimeout(() => scheduleFlush(), 3000);
  } finally {
    _isFlushing = false;
    _syncState.isSyncing = _pendingWrites.size > 0;
    _syncState.pendingCount = _pendingWrites.size;
    notifySyncStateChange();
    if (_pendingWrites.size > 0) scheduleFlush();
  }
}

// Tab gizlendiginde veya sayfa kapanirken bekleyen yazmalari hemen gonder
if (typeof window !== 'undefined') {
  // Tab gizlendiginde flush; ön plana gelince yeniden sync (mobil kritik)
  // BUG FIX [AJAN-2]: Visible olunca realtime kanalını da yeniden başlat.
  // Mobil arka plan → WebSocket düşer → geri gelince sadece syncIfStale çağrılıyordu
  // ama _realtimeUnsubscribe hala set olduğu için startRealtimeSync erken çıkıyordu.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _pendingWrites.size > 0) {
      flushWrites();
    }
    if (document.visibilityState === 'visible') {
      // Realtime bağlantısını zorla yenile (ölü WebSocket kanalını temizle)
      if (isConfigured()) {
        stopRealtimeSync();   // Eski/ölü kanalı temizle
        startRealtimeSync();  // Temiz yeniden bağlan
      }
      // Arka plandan döndüğünde veriyi tazele (30s sınırı ile)
      syncIfStale();
    }
  });

  // Ağ bağlantısı kesilince sync durumunu güncelle
  window.addEventListener('offline', () => {
    _syncState.isOnline = false;
    _syncState.lastError = 'Ağ bağlantısı kesildi';
    notifySyncStateChange();
    console.warn('%c[CloudSync] Ağ bağlantısı kesildi', 'color: #ef4444');
  });

  // Ağ bağlantısı geri gelince zorla sync (offline → online geçişi)
  // GÜÇLENDİRME [AJAN-2]: Önce bekleyen yazmaları flush et, sonra cloud'dan çek
  window.addEventListener('online', () => {
    _syncState.isOnline = true;
    if (_syncState.lastError === 'Ağ bağlantısı kesildi') _syncState.lastError = null;
    notifySyncStateChange();
    console.log('%c[CloudSync] Ağ bağlantısı geri geldi, yeniden senkronize ediliyor...', 'color: #22c55e');

    // Adım 1: Çevrimdışıyken biriken yazmaları hemen gönder
    flushWrites().catch(() => {}).finally(() => {
      // Adım 2: Cloud'dan güncel veriyi çek
      _initialSyncDone = false;
      _lastSyncTime = 0;
      syncFromCloud().then(result => {
        _lastSyncTime = Date.now();
        if (result.synced > 0) {
          toast.success('Veriler güncellendi', { id: 'sync-online', duration: 2500 });
        }
      }).catch(() => {});
    });

    // Adım 3: Realtime bağlantısını yenile
    stopRealtimeSync();
    startRealtimeSync();
  });

  // Sayfa kapanirken keepalive fetch ile gonder
  window.addEventListener('beforeunload', () => {
    if (_pendingWrites.size > 0 && isConfigured()) {
      const entries = Array.from(_pendingWrites.entries());
      const keys = entries.map(([k]) => `${KV_SYNC_PREFIX}${k}`);
      const values = entries.map(([, v]) => v); // already wrapped
      _pendingWrites.clear();
      saveQueueToStorage(); // Kalıcı kuyruğu temizle (keepalive başarılı olursa gereksiz)

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
 * Set item in localStorage + queue cloud sync (timestamp sarmalı ile)
 */
export const setInStorage = <T = any>(key: StorageKey | string, value: T): boolean => {
  try {
    const prefixedKey = getPrefixedKey(key);
    localStorage.setItem(prefixedKey, JSON.stringify(value));

    if (SYNCABLE_KEYS.has(key as string)) {
      const now = Date.now();
      setLocalVersion(key as string, now);                     // Sürüm takibi
      _pendingWrites.set(key as string, wrapEnvelope(value));  // Zaman damgalı sarmalayıcı
      saveQueueToStorage();                                     // Kalıcı kuyruk güncelle
      scheduleFlush();
      _syncState.pendingCount = _pendingWrites.size;
      notifySyncStateChange();
    }

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
    
    // Sürüm takibinden kaldır ve cloud/yerel depodan sil
    if (SYNCABLE_KEYS.has(key as string)) {
      // Yerel sürüm kaydını temizle
      try {
        const versions = getLocalVersions();
        delete versions[key as string];
        localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
      } catch {}

      // Bekleyen yazma kuyruğundan kaldır
      if (_pendingWrites.has(key as string)) {
        _pendingWrites.delete(key as string);
        saveQueueToStorage();
        _syncState.pendingCount = _pendingWrites.size;
        notifySyncStateChange();
      }

      if (isConfigured()) {
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
// GÜÇLENDİRME [AJAN-2]: 30s → 15s — daha hızlı veri tazeliği, mobil için kritik
const MIN_RESYNC_INTERVAL_MS = 15_000;

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
      const localVersions = getLocalVersions();
      let skipped = 0;

      for (const row of rows) {
        try {
          const storageKey = row.key.replace(KV_SYNC_PREFIX, '');
          const { data: cloudData, updatedAt: cloudTs } = unwrapEnvelope(row.value);
          const localTs = localVersions[storageKey] ?? 0;

          if (cloudData === null || cloudData === undefined) continue;

          // En yeni veri kazanır: bulut yerel'den daha yeni veya yerel hiç yazılmamışsa uygula
          if (cloudTs >= localTs) {
            const prefixedKey = getPrefixedKey(storageKey);
            localStorage.setItem(prefixedKey, JSON.stringify(cloudData));
            if (cloudTs > 0) setLocalVersion(storageKey, cloudTs); // eski format için sıfır yazmayız
            synced++;
          } else {
            skipped++;
            console.log(`%c[Sync] ${storageKey}: yerel (${new Date(localTs).toLocaleTimeString()}) daha yeni, bulut atlandı`, 'color: #f59e0b');
          }
        } catch (e: any) {
          errors.push(`Key parse hatası: ${e.message}`);
        }
      }

      if (synced > 0) {
        const source = useLocal ? 'yerel depodan' : 'buluttan';
        console.log(
          `%c[Sync] ${synced} koleksiyon ${source} senkronize edildi${skipped > 0 ? ` (${skipped} yerel daha yeni, atlandı)` : ''}`,
          'color: #22c55e; font-weight: bold'
        );
        setTimeout(() => window.dispatchEvent(new Event('storage_update')), 50);
        setTimeout(() => window.dispatchEvent(new Event('storage_update')), 500);
      }
    } else if (errors.length === 0) {
      // Bulut boş: ancak yerel'de gerçekten veri varsa güvenli şekilde yükle
      const hasLocalData = Array.from(SYNCABLE_KEYS).some(k => {
        const v = getFromStorage(k);
        if (v === null) return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v as any).length > 0;
        return true;
      });
      if (hasLocalData) {
        console.log('%c[Sync] Bulut boş, yerel veriler ilk kez yükleniyor...', 'color: #f59e0b');
        await pushAllToCloud();
      } else {
        console.log('%c[Sync] İlk kurulum: hem bulut hem yerel boş.', 'color: #f59e0b');
      }
    } else {
      console.warn('%c[Sync] Bulut okuma hataları var, yerel veriler korunuyor (veri güvenliği)', 'color: #f59e0b; font-weight: bold');
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

  const now = Date.now();
  for (const sk of SYNCABLE_KEYS) {
    try {
      const data = getFromStorage(sk);
      if (data !== null && data !== undefined) {
        keys.push(`${KV_SYNC_PREFIX}${sk}`);
        values.push(wrapEnvelope(data)); // Zaman damgalı sarmalayıcı
        setLocalVersion(sk, now);        // Sürüm takibini güncelle
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

    const now = Date.now();
    setLocalVersion(key as string, now);
    const wrapped = wrapEnvelope(data);

    const res = await fetch(`${SERVER_BASE_URL}/kv/set`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ key: `${KV_SYNC_PREFIX}${key}`, value: wrapped }),
    });

    if (res.ok) markAsEcho(key as string);
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

        // Kendi yazdığımız verinin echo'sunu atla (zaman damgalı filtre)
        if (isEcho(storageKey)) {
          console.log(`%c[CloudSync RT] echo atlandı: ${storageKey}`, 'color: #666; font-size: 10px');
          return;
        }

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (newRow?.value !== undefined) {
            const { data: cloudData, updatedAt: cloudTs } = unwrapEnvelope(newRow.value);
            const localTs = getLocalVersions()[storageKey] ?? 0;

            // Çakışma kontrolü: gelen değer gerçekten daha yeni mi?
            if (cloudTs >= localTs && cloudData !== null && cloudData !== undefined) {
              const prefixedKey = getPrefixedKey(storageKey);
              try {
                localStorage.setItem(prefixedKey, JSON.stringify(cloudData));
                if (cloudTs > 0) setLocalVersion(storageKey, cloudTs);
                console.log(`%c[CloudSync RT] ${storageKey} güncellendi (başka cihazdan, ${new Date(cloudTs).toLocaleTimeString()})`, 'color: #a855f7');
                setTimeout(() => window.dispatchEvent(new Event('storage_update')), 0);
              } catch {}
            } else if (cloudTs < localTs) {
              console.log(`%c[CloudSync RT] ${storageKey} atlandı — yerel daha yeni (${new Date(localTs).toLocaleTimeString()} > ${new Date(cloudTs).toLocaleTimeString()})`, 'color: #f59e0b; font-size: 10px');
            }
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

  console.log('%c[CloudSync] Realtime dinleme başlatıldı', 'color: #a855f7; font-weight: bold');
  startHeartbeat();
}

export function stopRealtimeSync() {
  if (_realtimeUnsubscribe) {
    _realtimeUnsubscribe();
    _realtimeUnsubscribe = null;
  }
  stopHeartbeat();
}

// ── Periyodik heartbeat (realtime koptuğunda emniyet ağı) ─────

let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
// GÜÇLENDİRME [AJAN-2]: 5 dakika → 2 dakika — realtime kopuşları daha hızlı algıla
const HEARTBEAT_INTERVAL_MS = 2 * 60_000;

function startHeartbeat(): void {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      syncIfStale();
    }
    // Realtime bağlantısı düşmüşse yeniden başlat
    if (!_realtimeUnsubscribe && isConfigured()) {
      console.log('%c[CloudSync] Realtime bağlantısı yok, yeniden başlatılıyor...', 'color: #f59e0b');
      startRealtimeSync();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
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