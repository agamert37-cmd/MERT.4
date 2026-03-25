// [AJAN-2 | claude/serene-gagarin | 2026-03-25]
// PouchDB KV Store — supabase-kv.ts drop-in replacement
// Aynı API imzaları korunuyor, Supabase yerine PouchDB kullanılıyor

import { getKvDb } from './pouchdb';

// ═══════════════════════════════════════════════════════════════
// OKUMA İŞLEMLERİ
// ═══════════════════════════════════════════════════════════════

/** Tek bir key'in değerini oku */
export async function kvGet<T = any>(key: string): Promise<T | null> {
  try {
    const doc = await getKvDb().get(key);
    return (doc as any).value ?? null;
  } catch (e: any) {
    if (e.status === 404) return null;
    console.error(`[KV] get error for "${key}":`, e.message);
    return null;
  }
}

/** Birden fazla key'in değerlerini oku */
export async function kvMGet<T = any>(keys: string[]): Promise<T[]> {
  try {
    const result = await getKvDb().allDocs({ keys, include_docs: true });
    return result.rows
      .filter((r: any) => !r.error && r.doc)
      .map((r: any) => r.doc.value as T);
  } catch {
    return [];
  }
}

/** Prefix ile eşleşen tüm değerleri getir */
export async function kvGetByPrefix<T = any>(prefix: string): Promise<T[]> {
  try {
    const result = await getKvDb().allDocs({
      startkey: prefix,
      endkey: prefix + '\ufff0',
      include_docs: true,
    });
    return result.rows
      .filter((r: any) => r.doc)
      .map((r: any) => r.doc.value as T);
  } catch {
    return [];
  }
}

/** Prefix ile eşleşen key-value çiftlerini getir */
export async function kvGetByPrefixWithKeys<T = any>(prefix: string): Promise<Array<{ key: string; value: T }>> {
  try {
    const result = await getKvDb().allDocs({
      startkey: prefix,
      endkey: prefix + '\ufff0',
      include_docs: true,
    });
    return result.rows
      .filter((r: any) => r.doc)
      .map((r: any) => ({ key: r.id, value: r.doc.value as T }));
  } catch {
    return [];
  }
}

/** Prefix ile eşleşen kayıt sayısı */
export async function kvCountByPrefix(prefix: string): Promise<number> {
  try {
    const result = await getKvDb().allDocs({
      startkey: prefix,
      endkey: prefix + '\ufff0',
    });
    return result.rows.length;
  } catch {
    return 0;
  }
}

/** Prefix ile eşleşen key'leri getir */
export async function kvKeysByPrefix(prefix: string): Promise<string[]> {
  try {
    const result = await getKvDb().allDocs({
      startkey: prefix,
      endkey: prefix + '\ufff0',
    });
    return result.rows.map((r: any) => r.id);
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// YAZMA İŞLEMLERİ
// ═══════════════════════════════════════════════════════════════

/** Tek key-value yaz (upsert) */
export async function kvSet(key: string, value: any): Promise<void> {
  const db = getKvDb();
  try {
    const existing = await db.get(key).catch(() => null);
    if (existing) {
      await db.put({ _id: key, _rev: (existing as any)._rev, value, updated_at: new Date().toISOString() });
    } else {
      await db.put({ _id: key, value, updated_at: new Date().toISOString() });
    }
  } catch (e: any) {
    // Conflict durumunda tekrar dene
    if (e.status === 409) {
      const doc = await db.get(key);
      await db.put({ _id: key, _rev: (doc as any)._rev, value, updated_at: new Date().toISOString() });
    } else {
      console.error(`[KV] set error for "${key}":`, e.message);
    }
  }
}

/** Birden fazla key-value yaz */
export async function kvMSet(keys: string[], values: any[]): Promise<void> {
  const db = getKvDb();
  const existing = await db.allDocs({ keys, include_docs: true }).catch(() => ({ rows: [] as any[] }));

  const docs = keys.map((key, i) => {
    const row = existing.rows.find((r: any) => r.id === key && !r.error);
    return {
      _id: key,
      _rev: row?.doc?._rev,
      value: values[i],
      updated_at: new Date().toISOString(),
    };
  });

  await db.bulkDocs(docs);
}

/** Tek key sil */
export async function kvDel(key: string): Promise<void> {
  const db = getKvDb();
  try {
    const doc = await db.get(key);
    await db.remove(doc);
  } catch (e: any) {
    if (e.status !== 404) console.error(`[KV] del error for "${key}":`, e.message);
  }
}

/** Birden fazla key sil */
export async function kvMDel(keys: string[]): Promise<void> {
  const db = getKvDb();
  const result = await db.allDocs({ keys, include_docs: true }).catch(() => ({ rows: [] as any[] }));
  const docs = result.rows
    .filter((r: any) => r.doc && !r.error)
    .map((r: any) => ({ ...r.doc, _deleted: true }));
  if (docs.length > 0) await db.bulkDocs(docs);
}

// ═══════════════════════════════════════════════════════════════
// ARAMA & FİLTRELEME
// ═══════════════════════════════════════════════════════════════

/** Value içinde arama yap */
export async function kvSearchInValues<T = any>(
  prefix: string,
  searchField: string,
  searchValue: any
): Promise<Array<{ key: string; value: T }>> {
  const items = await kvGetByPrefixWithKeys<T>(prefix);
  return items.filter((item) => {
    const v = item.value as any;
    return v && v[searchField] === searchValue;
  });
}

// ═══════════════════════════════════════════════════════════════
// REALTIME (PouchDB changes feed)
// ═══════════════════════════════════════════════════════════════

interface KvChangeEvent {
  key: string;
  value: any;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
}

/** Belirli bir prefix için değişiklikleri dinle */
export function kvSubscribe(
  prefix: string,
  _channelName: string,
  onEvent: (event: KvChangeEvent) => void
): { unsubscribe: () => void } {
  const changes = getKvDb().changes({
    since: 'now',
    live: true,
    include_docs: true,
  });

  changes.on('change', (change: any) => {
    // Prefix filtresi
    if (!change.id.startsWith(prefix)) return;

    if (change.deleted) {
      onEvent({ key: change.id, value: null, type: 'DELETE' });
    } else {
      const isNew = change.changes?.length === 1 && change.changes[0].rev?.startsWith('1-');
      onEvent({
        key: change.id,
        value: change.doc?.value,
        type: isNew ? 'INSERT' : 'UPDATE',
      });
    }
  });

  return {
    unsubscribe: () => changes.cancel(),
  };
}

// ═══════════════════════════════════════════════════════════════
// BAĞLANTI TESTİ & İSTATİSTİKLER
// ═══════════════════════════════════════════════════════════════

/** KV store bağlantı testi */
export async function kvTestConnection(): Promise<{
  ok: boolean;
  latency_ms: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await getKvDb().info();
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e: any) {
    return { ok: false, latency_ms: Date.now() - start, error: e.message };
  }
}

/** Prefix bazlı istatistikler */
export async function kvGetStats(prefixes: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const prefix of prefixes) {
    result[prefix] = await kvCountByPrefix(prefix);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// TABLO BAZLI YARDIMCILAR (Eski uyumluluk)
// ═══════════════════════════════════════════════════════════════

type TableName = 'personeller' | 'urunler' | 'cari_hesaplar' | 'fisler' | 'kasalar' | 'bankalar' | string;

const TABLE_PREFIXES: Record<string, string> = {
  personeller: 'tbl:personeller:',
  urunler: 'tbl:urunler:',
  cari_hesaplar: 'tbl:cari_hesaplar:',
  fisler: 'tbl:fisler:',
  kasalar: 'tbl:kasalar:',
  bankalar: 'tbl:bankalar:',
};

function tablePrefix(tableName: TableName): string {
  return TABLE_PREFIXES[tableName] || `tbl:${tableName}:`;
}

export async function kvGetTable<T = any>(tableName: TableName): Promise<T[]> {
  return kvGetByPrefix<T>(tablePrefix(tableName));
}

export async function kvCountTable(tableName: TableName): Promise<number> {
  return kvCountByPrefix(tablePrefix(tableName));
}

export async function kvGetById<T = any>(tableName: TableName, id: string): Promise<T | null> {
  return kvGet<T>(`${tablePrefix(tableName)}${id}`);
}

export async function kvSetById<T extends { id: string }>(tableName: TableName, item: T): Promise<void> {
  await kvSet(`${tablePrefix(tableName)}${item.id}`, item);
}

export async function kvDeleteById(tableName: TableName, id: string): Promise<void> {
  await kvDel(`${tablePrefix(tableName)}${id}`);
}
