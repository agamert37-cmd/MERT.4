// [AJAN-2 | claude/serene-gagarin | 2026-03-25]
// PouchDB instance yöneticisi — tablo başına DB + CouchDB sync
import PouchDB from 'pouchdb-browser';
import { DB_PREFIX, KV_DB_NAME, TABLE_NAMES, getCouchDbAuthUrl, getPeerCouchDbUrl } from './db-config';

// ── Instance cache ─────────────────────────────────────────────
const instances = new Map<string, PouchDB.Database>();
const syncs = new Map<string, PouchDB.Replication.Sync<{}>>();
const peerSyncs = new Map<string, PouchDB.Replication.Sync<{}>>();

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

/** Tüm tabloların CouchDB sync'ini başlat */
export function startAllSync(): void {
  for (const table of TABLE_NAMES) {
    startSync(table);
  }
  startSync(KV_DB_NAME);
}

/** Tüm sync'leri durdur */
export function stopAllSync(): void {
  for (const [, sync] of syncs) {
    sync.cancel();
  }
  syncs.clear();
  for (const [, sync] of peerSyncs) {
    sync.cancel();
  }
  peerSyncs.clear();
}

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

/** CouchDB bağlantı testi */
export async function testCouchDbConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
  const couchUrl = getCouchDbAuthUrl();
  if (!couchUrl) return { ok: false, error: 'CouchDB URL yapılandırılmamış' };

  try {
    const res = await fetch(couchUrl, { method: 'GET' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, version: data.version };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Bağlantı hatası' };
  }
}

/** Peer CouchDB bağlantı testi */
export async function testPeerConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
  const peerUrl = getPeerCouchDbUrl();
  if (!peerUrl) return { ok: false, error: 'Peer URL yapılandırılmamış' };

  try {
    const res = await fetch(peerUrl.replace(/\/\/.*@/, '//'), { method: 'GET' });
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
