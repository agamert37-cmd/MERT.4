// [AJAN-3 | claude/multi-db-sync-setup-3DmYn | 2026-04-11]
// PouchDB instance yöneticisi — tablo başına DB + CouchDB sync + gerçek zamanlı sync olayları
import PouchDB from 'pouchdb-browser';
import { DB_PREFIX, KV_DB_NAME, TABLE_NAMES, getCouchDbConfig, getPeerCouchDbUrl, setCouchDbConfig } from './db-config';

// ── Sync Durum Sistemi ─────────────────────────────────────────
export type SyncStatus = 'active' | 'paused' | 'error' | 'stopped';

export interface TableSyncState {
  tableName: string;
  status: SyncStatus;
  error?: string;
  lastChange?: number; // timestamp
  pending?: number;
}

// Module-level durum haritası
const syncStatuses = new Map<string, TableSyncState>();

/** Sync durumunu güncelle ve window event yayımla */
function updateSyncStatus(
  name: string,
  status: SyncStatus,
  error?: string,
  pending?: number
): void {
  const state: TableSyncState = {
    tableName: name,
    status,
    error,
    pending,
    lastChange: Date.now(),
  };
  syncStatuses.set(name, state);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pouchdb_sync_status', { detail: state }));
  }
}

/** Belirli tablo için sync durumunu getir */
export function getSyncStatus(tableName: string): TableSyncState | null {
  const name = tableName.startsWith(DB_PREFIX) ? tableName : DB_PREFIX + tableName;
  return syncStatuses.get(name) ?? null;
}

/** Tüm tabloların sync durumlarını getir */
export function getAllSyncStatuses(): TableSyncState[] {
  return Array.from(syncStatuses.values());
}

/** Aktif sync sayısını getir */
export function getActiveSyncCount(): number {
  return Array.from(syncStatuses.values()).filter(s => s.status === 'active').length;
}


// ── Instance cache ─────────────────────────────────────────────
const instances = new Map<string, PouchDB.Database>();
const syncs = new Map<string, PouchDB.Replication.Sync<{}>>();
const peerSyncs = new Map<string, PouchDB.Replication.Sync<{}>>();
const staggerTimers: ReturnType<typeof setTimeout>[] = [];

/** Tablo için PouchDB instance döndür (yoksa oluştur) */
export function getDb(tableName: string): PouchDB.Database {
  const name = tableName.startsWith(DB_PREFIX) ? tableName : DB_PREFIX + tableName;
  if (!instances.has(name)) {
    instances.set(name, new PouchDB(name));
  }
  return instances.get(name)!;
}

/** KV store DB'si */
export function getKvDb(): PouchDB.Database {
  return getDb(KV_DB_NAME);
}

// ── CouchDB Sync ──────────────────────────────────────────────

/** Authorization header ile güvenli fetch — mobil tarayıcılar URL'deki credentials'ı engeller */
function makeAuthFetch(user: string, password: string) {
  return (url: RequestInfo | URL, opts?: RequestInit) => {
    const headers = new Headers((opts as any)?.headers || {});
    if (user) {
      headers.set('Authorization', 'Basic ' + btoa(`${user}:${password}`));
    }
    return fetch(url, { ...(opts || {}), headers });
  };
}

/** Tek tablo için CouchDB ile continuous sync başlat */
export function startSync(tableName: string): PouchDB.Replication.Sync<{}> | null {
  const dbName = tableName.startsWith(DB_PREFIX) ? tableName : DB_PREFIX + tableName;
  if (syncs.has(dbName)) return syncs.get(dbName)!;

  const config = getCouchDbConfig();
  if (!config.url) return null;

  const remoteUrl = config.url.replace(/\/$/, '') + '/' + dbName;
  const localDb = getDb(dbName);
  const remoteDb = new PouchDB(remoteUrl, {
    fetch: makeAuthFetch(config.user, config.password),
  });

  const sync = localDb.sync(remoteDb, {
    live: true,
    retry: true,
  })
    .on('error', (err: any) => {
      console.error(`[PouchDB] Sync hatası — ${dbName}:`, err?.message || err);
      updateSyncStatus(dbName, 'error', err?.message ?? String(err));
    })
    .on('denied', (err: any) => {
      console.warn(`[PouchDB] Sync reddedildi — ${dbName}:`, err?.message || err);
      updateSyncStatus(dbName, 'error', `Erişim reddedildi: ${err?.message ?? String(err)}`);
    })
    .on('active', () => {
      console.info(`[PouchDB] Sync aktif — ${dbName}`);
      updateSyncStatus(dbName, 'active');
    })
    .on('paused', (err: any) => {
      if (err) {
        console.warn(`[PouchDB] Sync duraklatıldı (hata) — ${dbName}:`, err?.message || err);
        updateSyncStatus(dbName, 'paused', err?.message ?? String(err));
      } else {
        updateSyncStatus(dbName, 'paused');
      }
    })
    .on('change', (info: any) => {
      updateSyncStatus(dbName, 'active', undefined, info?.pending);
    });

  syncs.set(dbName, sync);
  return sync;
}

/** Tek tablo sync'ini durdur */
export function stopSync(tableName: string): void {
  const dbName = tableName.startsWith(DB_PREFIX) ? tableName : DB_PREFIX + tableName;
  const sync = syncs.get(dbName);
  if (sync) {
    sync.cancel();
    syncs.delete(dbName);
    updateSyncStatus(dbName, 'stopped');
  }
}

/** Tüm tabloların CouchDB sync'ini kademeli olarak başlat (thundering herd önlemi) */
export function startAllSync(): void {
  const allTables = [...TABLE_NAMES, KV_DB_NAME];
  allTables.forEach((table, index) => {
    const timer = setTimeout(() => startSync(table), index * 200);
    staggerTimers.push(timer);
  });

  // peerUrl yapılandırılmışsa: birincil sync bittikten sonra peer sync de başlat
  // Bu şekilde veriler hem birincil hem yedek CouchDB'ye eş zamanlı gider
  const peerUrl = getPeerCouchDbUrl();
  if (peerUrl) {
    const peerDelay = (allTables.length + 1) * 200 + 1000;
    setTimeout(() => startPeerSync(), peerDelay);
  }
}

// Mobilde önce sync edilecek kritik tablolar (satış, stok, müşteri, kasa)
const MOBILE_PRIORITY_TABLES = [
  'fisler', 'urunler', 'cari_hesaplar', 'kasa_islemleri', 'personeller',
];

/**
 * Mobil optimizasyonlu sync: kritik tablolar hemen, geri kalanlar 2s sonra.
 * Bant genişliği ve pil tasarrufu sağlar.
 */
export function startMobileSync(): void {
  // Kritik tablolar — anında
  MOBILE_PRIORITY_TABLES.forEach((table, i) => {
    const timer = setTimeout(() => startSync(table), i * 150);
    staggerTimers.push(timer);
  });
  // Diğer tablolar — 2 saniye sonra
  const rest = [...TABLE_NAMES, KV_DB_NAME].filter(t => !MOBILE_PRIORITY_TABLES.includes(t));
  rest.forEach((table, i) => {
    const timer = setTimeout(() => startSync(table), 2000 + i * 300);
    staggerTimers.push(timer);
  });
}

/** Tüm sync'leri durdur */
export function stopAllSync(): void {
  // Henüz başlamamış bekleyen zamanlayıcıları iptal et
  staggerTimers.forEach(t => clearTimeout(t));
  staggerTimers.length = 0;
  for (const [dbName, sync] of syncs) {
    sync.cancel();
    updateSyncStatus(dbName, 'stopped');
  }
  syncs.clear();
  for (const [, sync] of peerSyncs) {
    sync.cancel();
  }
  peerSyncs.clear();
}

// ── DB Sıkıştırma ──────────────────────────────────────────────
const COMPACT_KEY = 'mert4_last_compact';
const COMPACT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

/**
 * Tüm PouchDB veritabanlarını sıkıştır.
 * Silinmiş belgeler ve eski revision'lar temizlenir, boyut küçülür.
 * Son sıkıştırmadan 7 gün geçmediyse çalışmaz.
 */
export async function compactAllDbs(force = false): Promise<{ compacted: number; skipped: boolean }> {
  if (!force) {
    const last = localStorage.getItem(COMPACT_KEY);
    if (last && Date.now() - Number(last) < COMPACT_INTERVAL_MS) {
      return { compacted: 0, skipped: true };
    }
  }
  const all = [...TABLE_NAMES, KV_DB_NAME];
  let compacted = 0;
  for (const t of all) {
    try {
      await getDb(t).compact();
      compacted++;
    } catch {}
  }
  localStorage.setItem(COMPACT_KEY, String(Date.now()));
  return { compacted, skipped: false };
}

/** Son sıkıştırma tarihini döndürür */
export function getLastCompactDate(): Date | null {
  const val = localStorage.getItem(COMPACT_KEY);
  return val ? new Date(Number(val)) : null;
}

/** Belirli tabloyu yeniden sync başlat */
export function restartSync(tableName: string): void {
  stopSync(tableName);
  startSync(tableName);
}

/** Tüm sync'leri yeniden başlat */
export function restartAllSync(): void {
  stopAllSync();
  startAllSync();
}

// ── Ağ & Görünürlük Kurtarma ──────────────────────────────────
// Tarayıcı çevrimiçi durumuna geçtiğinde veya sayfa arka plandan öne geldiğinde
// tüm sync'leri yeniden başlat + UI'ı taze veri ile güncelle.
//
// Neden gerekli?
// - PouchDB retry:true çoğu durumu halleder; ancak Wi-Fi/4G geçişinde veya
//   iOS/Android uygulama arka plana alındığında bağlantı nesnesi tamamen ölür.
// - visibilitychange: Mobil kullanıcı ekranı kapattıktan sonra geri gelince
//   sync yeniden başlar VE UI tüm tabloları yeniden fetch eder.
// - pouchdb:app_foregrounded: useTableSync bu olayı dinleyerek fetchData() çağırır,
//   böylece arka planda başka cihazdan gelen değişiklikler anında UI'a yansır.

let _recoveryListenersAttached = false;

/** Ön plana geliş olayını yayınla — useTableSync dinleyerek fetchData() çağırır */
function _dispatchForegrounded(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pouchdb:app_foregrounded'));
}

// Çok sık restart'ı önlemek için debounce
let _restartTimer: ReturnType<typeof setTimeout> | null = null;
function _debouncedRestart(delayMs: number): void {
  if (_restartTimer) clearTimeout(_restartTimer);
  _restartTimer = setTimeout(() => {
    _restartTimer = null;
    // Eğer stagger timer'lar zaten çalışıyorsa (startAllSync devam ediyor) dokunma
    if (staggerTimers.length > 0) {
      _dispatchForegrounded(); // yine de UI refresh yap
      return;
    }
    restartAllSync();
    // Restart tamamlandıktan kısa süre sonra UI'ı güncelle
    setTimeout(_dispatchForegrounded, 600);
  }, delayMs);
}

function _attachRecoveryListeners(): void {
  if (_recoveryListenersAttached || typeof window === 'undefined') return;
  _recoveryListenersAttached = true;

  // Ağ bağlantısı geri gelince — kısa bekleme (ağ adaptörü stabilize olsun)
  window.addEventListener('online', () => {
    console.info('[PouchDB] Ağ bağlantısı yeniden kuruldu — sync yeniden başlatılıyor…');
    _debouncedRestart(800);
  });

  // Mobil: ekran kilidi açıldığında / sekmeye geri dönüldüğünde
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    console.info('[PouchDB] Sayfa görünür oldu — sync + UI yenileniyor…');

    // Mobilde ağın hazır olması için biraz bekle
    _debouncedRestart(1000);
  });

  // Android: ağ tipi değişimi (Wi-Fi ↔ 5G geçişi)
  const conn = (navigator as any).connection;
  if (conn) {
    conn.addEventListener('change', () => {
      console.info('[PouchDB] Ağ tipi değişti — sync yeniden başlatılıyor…');
      _debouncedRestart(1200);
    });
  }
}

_attachRecoveryListeners();

// ── Peer (2. bilgisayar) Sync ──────────────────────────────────

/** Diğer bilgisayarla tüm tabloları senkronize et */
export function startPeerSync(): void {
  const config = getCouchDbConfig();
  if (!config.peerUrl) return;

  const baseUrl = config.peerUrl.replace(/\/$/, '');
  const allDbs = [...TABLE_NAMES.map(t => DB_PREFIX + t), KV_DB_NAME];

  for (const dbName of allDbs) {
    if (peerSyncs.has(dbName)) continue;

    const localDb = getDb(dbName);
    const peerDb = new PouchDB(`${baseUrl}/${dbName}`, {
      fetch: makeAuthFetch(config.user, config.password),
    });

    const sync = localDb.sync(peerDb, {
      live: true,
      retry: true,
    })
      .on('error', (err: any) => {
        console.error(`[PouchDB] Peer sync hatası — ${dbName}:`, err?.message || err);
      })
      .on('denied', (err: any) => {
        console.warn(`[PouchDB] Peer sync reddedildi — ${dbName}:`, err?.message || err);
      })
      .on('active', () => {
        console.info(`[PouchDB] Peer sync yeniden aktif — ${dbName}`);
      })
      .on('paused', (err: any) => {
        if (err) {
          console.warn(`[PouchDB] Peer sync duraklatıldı (hata) — ${dbName}:`, err?.message || err);
        }
      });

    peerSyncs.set(dbName, sync);
  }
}

/** Peer sync durdur */
export function stopPeerSync(): void {
  for (const [, sync] of peerSyncs) {
    sync.cancel();
  }
  peerSyncs.clear();
}

// ── CouchDB Sağlık Monitörü & Otomatik Failover ──────────────
//
// peerUrl yapılandırılmışsa:
//   - Her 45 saniyede bir birincil CouchDB'yi kontrol eder
//   - 3 ardışık başarısız kontrol → peer URL'ye otomatik geçiş
//   - Birincil geri gelince otomatik dönüş (opsiyonel)
//
// Bu uygulama tarafı güvencedir; sunucu tarafı failover için
// failover/watchdog.py (Python) kullanılır.

let _healthTimer:          ReturnType<typeof setInterval> | null = null;
let _failoverActive        = false;
let _savedPrimaryUrl       = '';        // failover öncesi asıl birincil URL
let _healthConsecFails     = 0;
const HEALTH_INTERVAL_MS   = 45_000;   // 45 saniye
const HEALTH_FAIL_THRESHOLD = 3;       // 3 ardışık hata → geçiş

function _dispatchFailoverEvent(active: boolean, targetUrl: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pouchdb:failover_status', {
    detail: { active, targetUrl },
  }));
}

async function _pingUrl(url: string, user: string, password: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (user) headers['Authorization'] = 'Basic ' + btoa(`${user}:${password}`);
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function _activateFailover(peerUrl: string, config: ReturnType<typeof getCouchDbConfig>): void {
  if (_failoverActive) return;
  _failoverActive    = true;
  _savedPrimaryUrl   = config.url;
  _healthConsecFails = 0;

  console.warn('[PouchDB] Failover: birincil CouchDB yanıt vermiyor → peer URL devreye alınıyor…');

  // Mevcut birincil sync'leri durdur, peer URL'yi birincil olarak ayarla
  stopAllSync();
  setCouchDbConfig({ url: peerUrl, peerUrl: config.url });

  // Küçük gecikme sonra yeni URL ile başlat
  setTimeout(() => startAllSync(), 800);
  _dispatchFailoverEvent(true, peerUrl);
}

function _deactivateFailover(): void {
  if (!_failoverActive || !_savedPrimaryUrl) return;
  _failoverActive    = false;
  _healthConsecFails = 0;

  console.info('[PouchDB] Failover sona erdi: birincil CouchDB geri döndü.');

  const currentConfig = getCouchDbConfig();
  // URL'leri orijinal haline getir
  setCouchDbConfig({ url: _savedPrimaryUrl, peerUrl: currentConfig.url });
  _savedPrimaryUrl = '';

  stopAllSync();
  setTimeout(() => startAllSync(), 800);
  _dispatchFailoverEvent(false, _savedPrimaryUrl);
}

/**
 * CouchDB sağlık monitörünü başlat.
 * peerUrl boşsa işlem yapmaz.
 * Genellikle startAllSync() ile birlikte çağrılır — GlobalTableSyncContext bunu yapar.
 */
export function startCouchDbHealthMonitor(): void {
  if (_healthTimer || typeof window === 'undefined') return;
  const config = getCouchDbConfig();
  if (!config.peerUrl) return;   // peer URL yoksa monitör gerekmiyor

  _healthTimer = setInterval(async () => {
    const cfg = getCouchDbConfig();

    if (_failoverActive) {
      // Peer'dayken birincili izle — geri döndüyse orijinale dön
      if (!_savedPrimaryUrl) return;
      const primaryBack = await _pingUrl(_savedPrimaryUrl, cfg.user, cfg.password);
      if (primaryBack) _deactivateFailover();
      return;
    }

    // Birincil URL sağlığını kontrol et
    if (!cfg.url) return;
    const ok = await _pingUrl(cfg.url, cfg.user, cfg.password);

    if (ok) {
      _healthConsecFails = 0;
    } else {
      _healthConsecFails++;
      console.warn(`[PouchDB] Sağlık kontrolü başarısız (${_healthConsecFails}/${HEALTH_FAIL_THRESHOLD})…`);

      if (_healthConsecFails >= HEALTH_FAIL_THRESHOLD && cfg.peerUrl) {
        // Peer erişilebilir mi?
        const peerOk = await _pingUrl(cfg.peerUrl, cfg.user, cfg.password);
        if (peerOk) _activateFailover(cfg.peerUrl, cfg);
      }
    }
  }, HEALTH_INTERVAL_MS);
}

export function stopCouchDbHealthMonitor(): void {
  if (_healthTimer) {
    clearInterval(_healthTimer);
    _healthTimer = null;
  }
}

// ── Bağlantı Testi ─────────────────────────────────────────────

/** CouchDB bağlantı testi — Authorization header kullanır (URL'de credential göndermez) */
export async function testCouchDbConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
  const config = getCouchDbConfig();
  if (!config.url) return { ok: false, error: 'CouchDB URL yapılandırılmamış' };

  try {
    const headers: Record<string, string> = {};
    if (config.user) {
      headers['Authorization'] = 'Basic ' + btoa(`${config.user}:${config.password}`);
    }
    const res = await fetch(config.url, { method: 'GET', headers });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, version: data.version };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Bağlantı hatası' };
  }
}

/** Peer CouchDB bağlantı testi */
export async function testPeerConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
  const config = getCouchDbConfig();
  if (!config.peerUrl) return { ok: false, error: 'Peer URL yapılandırılmamış' };

  try {
    const headers: Record<string, string> = {};
    if (config.user) {
      headers['Authorization'] = 'Basic ' + btoa(`${config.user}:${config.password}`);
    }
    const res = await fetch(config.peerUrl, { method: 'GET', headers });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, version: data.version };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Bağlantı hatası' };
  }
}

// ── Veritabanı İstatistikleri ───────────────────────────────────

export interface DbStats {
  tableName: string;
  docCount: number;
}

// ── localStorage → PouchDB tablo eşlemesi ─────────────────────
const TABLE_STORAGE_KEYS: Record<string, string> = {
  fisler:           'isleyen_et_fisler_data',
  urunler:          'isleyen_et_stok_data',
  cari_hesaplar:    'isleyen_et_cari_data',
  kasa_islemleri:   'isleyen_et_kasa_data',
  personeller:      'isleyen_et_personel_data',
  bankalar:         'isleyen_et_bank_data',
  cekler:           'isleyen_et_cekler_data',
  araclar:          'isleyen_et_arac_data',
  arac_shifts:      'isleyen_et_arac_shifts',
  arac_km_logs:     'isleyen_et_arac_km_logs',
  uretim_profilleri:'isleyen_et_uretim_profiles',
  uretim_kayitlari: 'isleyen_et_uretim_data',
  faturalar:        'isleyen_et_faturalar',
  fatura_stok:           'isleyen_et_fatura_stok',
  tahsilatlar:           'isleyen_et_tahsilatlar_data',
  guncelleme_notlari:    '', // localStorage'da yok — DB'ye doğrudan seed edilir
  stok_giris:            'isleyen_et_stok_giris_data',
};

/** Tablo adının Türkçe görüntü adı */
export const TABLE_DISPLAY_NAMES: Record<string, string> = {
  fisler:           'Fişler (Satışlar)',
  urunler:          'Ürünler (Stok)',
  cari_hesaplar:    'Cari Hesaplar',
  kasa_islemleri:   'Kasa İşlemleri',
  personeller:      'Personel',
  bankalar:         'Bankalar',
  cekler:           'Çekler',
  araclar:          'Araçlar',
  arac_shifts:      'Araç Vardiyaları',
  arac_km_logs:     'Araç KM Logları',
  uretim_profilleri:'Üretim Profilleri',
  uretim_kayitlari: 'Üretim Kayıtları',
  faturalar:            'Faturalar',
  fatura_stok:          'Fatura Stok',
  tahsilatlar:          'Tahsilatlar',
  guncelleme_notlari:   'Güncelleme Notları',
  stok_giris:           'Manuel Stok Girişleri',
  mert_kv_store:        'KV Store',
};

/** CouchDB'de tüm veritabanlarını oluştur (PUT /{db}) */
export async function initializeCouchDbDatabases(
  onProgress?: (msg: string) => void
): Promise<{ ok: string[]; fail: string[]; alreadyExisted: string[] }> {
  const config = getCouchDbConfig();
  if (!config.url) return { ok: [], fail: ['CouchDB URL yapılandırılmamış'], alreadyExisted: [] };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.user) {
    headers['Authorization'] = 'Basic ' + btoa(`${config.user}:${config.password}`);
  }

  const allDbs = [...TABLE_NAMES.map(t => DB_PREFIX + t), KV_DB_NAME];
  const ok: string[] = [];
  const fail: string[] = [];
  const alreadyExisted: string[] = [];

  for (const dbName of allDbs) {
    onProgress?.(`Oluşturuluyor: ${dbName}...`);
    try {
      const res = await fetch(`${config.url}/${dbName}`, { method: 'PUT', headers });
      if (res.status === 412) {
        // Zaten var
        alreadyExisted.push(dbName);
        ok.push(dbName);
      } else if (res.ok) {
        ok.push(dbName);
      } else {
        const body = await res.json().catch(() => ({}));
        fail.push(`${dbName}: ${body.error || res.status}`);
      }
    } catch (e: any) {
      fail.push(`${dbName}: ${e.message}`);
    }
  }

  return { ok, fail, alreadyExisted };
}

/** localStorage'daki tüm verileri PouchDB'ye yükle (PouchDB → CouchDB sync otomatik devam eder) */
export async function seedPouchDbFromLocalStorage(
  onProgress?: (tableName: string, count: number) => void
): Promise<Record<string, { seeded: number; existed: number; errors: number }>> {
  const result: Record<string, { seeded: number; existed: number; errors: number }> = {};

  for (const [tableName, storageKey] of Object.entries(TABLE_STORAGE_KEYS)) {
    result[tableName] = { seeded: 0, existed: 0, errors: 0 };

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;

      const items: any[] = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) continue;

      const db = getDb(tableName);

      // Mevcut doc ID'lerini bir kez çek
      const existing = await db.allDocs({ include_docs: false });
      const existingIds = new Set(existing.rows.map((r: any) => r.id));

      // Sadece yokolanları batch olarak ekle
      const toInsert = items
        .filter(item => {
          const id = item.id || item._id;
          return id && !existingIds.has(id);
        })
        .map(item => {
          const { _id, _rev, _deleted, ...rest } = item;
          const docId = item.id || _id;
          return { ...rest, _id: docId };
        });

      if (toInsert.length > 0) {
        const bulkResult = await db.bulkDocs(toInsert);
        for (const r of bulkResult as any[]) {
          if ((r as any).error) result[tableName].errors++;
          else result[tableName].seeded++;
        }
      }

      result[tableName].existed = existingIds.size;
      onProgress?.(tableName, result[tableName].seeded);
    } catch (e: any) {
      console.error(`[seedPouchDb] ${tableName} hatası:`, e?.message);
    }
  }

  return result;
}

/**
 * Uygulama başlangıcında otomatik çağrılır.
 * localStorage'daki her kaydı kontrol eder; PouchDB'de olmayan kayıtları ekler.
 * Kısmi dolu tablolara da dokunur (diff tabanlı) — idempotent & güvenli.
 * PouchDB dolunca çalışan startAllSync() bu verileri otomatik CouchDB'ye iter.
 */
export async function autoSeedIfEmpty(
  onDone?: (totalSeeded: number) => void,
  /** Tablo adı → toDb dönüşüm fonksiyonu (ör. productToDb, cariToDb) */
  transforms?: Record<string, (item: any) => any>
): Promise<void> {
  let totalSeeded = 0;

  for (const [tableName, storageKey] of Object.entries(TABLE_STORAGE_KEYS)) {
    try {
      if (!storageKey) continue; // localStorage'da karşılığı olmayan tablo (ör. guncelleme_notlari)

      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const items: any[] = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) continue;

      const db = getDb(tableName);

      // Mevcut doc ID'lerini çek — sadece eksik olanları ekle (diff tabanlı)
      const existing = await db.allDocs({ include_docs: false });
      const existingIds = new Set(existing.rows.map((r: any) => r.id));

      const toDb = transforms?.[tableName];

      const toInsert = items
        .filter(item => {
          const id = item.id || item._id;
          return id && !existingIds.has(id); // sadece PouchDB'de olmayan kayıtlar
        })
        .map(item => {
          // toDb dönüşümü varsa uygula (camelCase → snake_case), yoksa ham veriyi kullan
          const dbRow = toDb ? toDb(item) : (() => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { _id, _rev, _deleted, ...rest } = item;
            return rest;
          })();
          return { ...dbRow, _id: item.id || item._id };
        });
      if (toInsert.length === 0) continue;

      const results = await db.bulkDocs(toInsert);
      const seeded = (results as any[]).filter((r: any) => !r.error).length;
      totalSeeded += seeded;
    } catch {
      // sessizce geç — başlatma sırasında hata kritik değil
    }
  }

  onDone?.(totalSeeded);
}

export interface CouchDbTableStatus {
  name: string;
  displayName: string;
  exists: boolean;
  couchDocCount: number;
  localDocCount: number;
  localStorageCount: number;
  error?: string;
}

/** CouchDB'deki tüm veritabanlarının detaylı durumunu getir */
export async function getCouchDbTableStatus(): Promise<CouchDbTableStatus[]> {
  const config = getCouchDbConfig();
  if (!config.url) return [];

  const headers: Record<string, string> = {};
  if (config.user) {
    headers['Authorization'] = 'Basic ' + btoa(`${config.user}:${config.password}`);
  }

  const allDbs = [...TABLE_NAMES.map(t => DB_PREFIX + t), KV_DB_NAME];
  const statuses: CouchDbTableStatus[] = [];

  for (const dbName of allDbs) {
    const shortName = dbName.replace(DB_PREFIX, '');
    const localStorageKey = TABLE_STORAGE_KEYS[shortName];

    // LocalStorage sayısı
    let localStorageCount = 0;
    try {
      const raw = localStorageKey ? localStorage.getItem(localStorageKey) : null;
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) localStorageCount = arr.length;
      }
    } catch {}

    // PouchDB (yerel IndexedDB) sayısı
    let localDocCount = 0;
    try {
      const db = getDb(dbName);
      const info = await db.info();
      localDocCount = info.doc_count;
    } catch {}

    // CouchDB sayısı
    try {
      const res = await fetch(`${config.url}/${dbName}`, { method: 'GET', headers });
      if (res.ok) {
        const data = await res.json();
        statuses.push({
          name: dbName,
          displayName: TABLE_DISPLAY_NAMES[shortName] || TABLE_DISPLAY_NAMES[dbName] || shortName,
          exists: true,
          couchDocCount: data.doc_count || 0,
          localDocCount,
          localStorageCount,
        });
      } else {
        statuses.push({
          name: dbName,
          displayName: TABLE_DISPLAY_NAMES[shortName] || shortName,
          exists: false,
          couchDocCount: 0,
          localDocCount,
          localStorageCount,
          error: `HTTP ${res.status}`,
        });
      }
    } catch (e: any) {
      statuses.push({
        name: dbName,
        displayName: TABLE_DISPLAY_NAMES[shortName] || shortName,
        exists: false,
        couchDocCount: 0,
        localDocCount,
        localStorageCount,
        error: e.message,
      });
    }
  }

  return statuses;
}

/** Tüm tabloların kayıt sayılarını getir */
export async function getAllDbStats(): Promise<DbStats[]> {
  const stats: DbStats[] = [];
  for (const table of TABLE_NAMES) {
    try {
      const db = getDb(table);
      const info = await db.info();
      stats.push({ tableName: table, docCount: info.doc_count });
    } catch {
      stats.push({ tableName: table, docCount: 0 });
    }
  }
  return stats;
}
