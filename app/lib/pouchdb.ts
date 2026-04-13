// [AJAN-3 | claude/multi-db-sync-setup-3DmYn | 2026-04-11]
// PouchDB instance yöneticisi — tablo başına DB + CouchDB sync + gerçek zamanlı sync olayları
import PouchDB from 'pouchdb-browser';
import { DB_PREFIX, KV_DB_NAME, TABLE_NAMES, getCouchDbConfig } from './db-config';

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

  // Gerçek zamanlı sync durum olayları
  sync
    .on('active', () => updateSyncStatus(dbName, 'active'))
    .on('paused', (err: any) => updateSyncStatus(dbName, 'paused', err?.message))
    .on('error', (err: any) => updateSyncStatus(dbName, 'error', err?.message ?? 'Sync hatası'))
    .on('change', (info: any) => updateSyncStatus(dbName, 'active', undefined, info?.pending));

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
