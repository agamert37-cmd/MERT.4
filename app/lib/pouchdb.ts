// [AJAN-2 | claude/serene-gagarin | 2026-03-25]
// PouchDB instance yöneticisi — tablo başına DB + CouchDB sync
import PouchDB from 'pouchdb-browser';
import { DB_PREFIX, KV_DB_NAME, TABLE_NAMES, getCouchDbAuthUrl, getCouchDbConfig, getPeerCouchDbUrl } from './db-config';

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

/** Tek tablo için CouchDB ile continuous sync başlat */
export function startSync(tableName: string): PouchDB.Replication.Sync<{}> | null {
  const dbName = tableName.startsWith(DB_PREFIX) ? tableName : DB_PREFIX + tableName;
  if (syncs.has(dbName)) return syncs.get(dbName)!;

  const couchUrl = getCouchDbAuthUrl();
  if (!couchUrl) return null;

  const localDb = getDb(dbName);
  const remoteDb = new PouchDB(`${couchUrl}/${dbName}`);

  const sync = localDb.sync(remoteDb, {
    live: true,
    retry: true,
  })
    .on('error', (err: any) => {
      console.error(`[PouchDB] Sync hatası — ${dbName}:`, err?.message || err);
    })
    .on('denied', (err: any) => {
      console.warn(`[PouchDB] Sync reddedildi — ${dbName}:`, err?.message || err);
    })
    .on('active', () => {
      console.info(`[PouchDB] Sync yeniden aktif — ${dbName}`);
    })
    .on('paused', (err: any) => {
      if (err) {
        console.warn(`[PouchDB] Sync duraklatıldı (hata) — ${dbName}:`, err?.message || err);
      }
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
  }
}

/** Tüm tabloların CouchDB sync'ini kademeli olarak başlat (thundering herd önlemi) */
export function startAllSync(): void {
  const allTables = [...TABLE_NAMES, KV_DB_NAME];
  allTables.forEach((table, index) => {
    const timer = setTimeout(() => startSync(table), index * 200);
    staggerTimers.push(timer);
  });
}

/** Tüm sync'leri durdur */
export function stopAllSync(): void {
  // Henüz başlamamış bekleyen zamanlayıcıları iptal et
  staggerTimers.forEach(t => clearTimeout(t));
  staggerTimers.length = 0;
  for (const [, sync] of syncs) {
    sync.cancel();
  }
  syncs.clear();
  for (const [, sync] of peerSyncs) {
    sync.cancel();
  }
  peerSyncs.clear();
}

/**
 * Tüm CouchDB sync'lerini yeniden başlat (bağlantı kesildikten sonra geri gelince).
 * PouchDB'nin `retry: true` seçeneği genellikle bunu otomatik yapar; ancak bazı
 * ağ geçişlerinde (VPN, Wi-Fi değişimi) sync nesnesi tamamen ölür.
 * Bu fonksiyon mevcut sync'leri iptal edip yeniden oluşturur.
 */
export function restartAllSync(): void {
  // Mevcut CouchDB sync'lerini temizle (peer sync'lere dokunma)
  staggerTimers.forEach(t => clearTimeout(t));
  staggerTimers.length = 0;
  for (const [, sync] of syncs) {
    sync.cancel();
  }
  syncs.clear();
  // Kademeli yeniden başlat
  startAllSync();
}

// ── Ağ Kurtarma (online event) ────────────────────────────────
// Tarayıcı çevrimiçi durumuna geçtiğinde tüm sync'leri yeniden başlat.
// PouchDB'nin retry mekanizması çoğu durumda bunu kendisi yapar; bu, Wi-Fi/VPN
// değişimi gibi uç durumlara karşı ek bir güvence katmanıdır.

let _onlineListenerAttached = false;

function _attachOnlineListener(): void {
  if (_onlineListenerAttached || typeof window === 'undefined') return;
  _onlineListenerAttached = true;

  window.addEventListener('online', () => {
    console.info('[PouchDB] Ağ bağlantısı yeniden kuruldu — sync yeniden başlatılıyor…');
    // 1 saniyelik gecikme: ağ arayüzü stabilize olsun
    setTimeout(() => restartAllSync(), 1000);
  });
}

_attachOnlineListener();

// ── Peer (2. bilgisayar) Sync ──────────────────────────────────

/** Diğer bilgisayarla tüm tabloları senkronize et */
export function startPeerSync(): void {
  const peerUrl = getPeerCouchDbUrl();
  if (!peerUrl) return;

  const allDbs = [...TABLE_NAMES.map(t => DB_PREFIX + t), KV_DB_NAME];

  for (const dbName of allDbs) {
    if (peerSyncs.has(dbName)) continue;

    const localDb = getDb(dbName);
    const peerDb = new PouchDB(`${peerUrl}/${dbName}`);

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
  fatura_stok:      'isleyen_et_fatura_stok',
  tahsilatlar:      'isleyen_et_tahsilatlar_data',
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
  faturalar:        'Faturalar',
  fatura_stok:      'Fatura Stok',
  tahsilatlar:      'Tahsilatlar',
  mert_kv_store:    'KV Store',
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
 * Sadece PouchDB'si boş (doc_count === 0) olan tabloları localStorage'dan doldurur.
 * Zaten veri olan tablolara dokunmaz → idempotent & güvenli.
 * PouchDB dolunca çalışan startAllSync() bu verileri otomatik CouchDB'ye iter.
 */
export async function autoSeedIfEmpty(
  onDone?: (totalSeeded: number) => void
): Promise<void> {
  let totalSeeded = 0;

  for (const [tableName, storageKey] of Object.entries(TABLE_STORAGE_KEYS)) {
    try {
      const db = getDb(tableName);
      const info = await db.info();
      if (info.doc_count > 0) continue; // zaten veri var, atla

      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const items: any[] = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) continue;

      const toInsert = items
        .filter(item => item.id || item._id)
        .map(item => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _id, _rev, _deleted, ...rest } = item;
          return { ...rest, _id: item.id || _id };
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
