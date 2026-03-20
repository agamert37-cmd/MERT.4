/**
 * Supabase KV Store - Frontend'den Dogrudan Okuma/Yazma
 * 
 * Bu modul, kv_store_daadfb0c tablosuna Supabase JS client uzerinden
 * dogrudan erisim saglar. Sunucu endpoint'lerine gerek kalmadan
 * okuma islemleri cok daha hizli yapilir.
 * 
 * Yazma islemleri icin hem dogrudan hem de sunucu uzerinden yazim desteklenir.
 * Realtime subscription ile canli veri degisiklikleri dinlenebilir.
 */

import { supabase } from './supabase';

const KV_TABLE = 'kv_store_daadfb0c';

// ─── Connection state tracking ───────────────────────────────────────────
let _lastConnectionFailure = 0;
const CONNECTION_COOLDOWN_MS = 10000; // 10s cooldown after a failure

function isConnectionCoolingDown(): boolean {
  return Date.now() - _lastConnectionFailure < CONNECTION_COOLDOWN_MS;
}

function markConnectionFailure() {
  _lastConnectionFailure = Date.now();
}

function clearConnectionFailure() {
  _lastConnectionFailure = 0;
}

function isNetworkError(err: any): boolean {
  const msg = typeof err === 'string' ? err : err?.message || '';
  return msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('TypeError') || msg.includes('ECONNREFUSED') || msg.includes('ERR_NAME');
}

// ═══════════════════════════════════════════════════════════════
// OKUMA ISLEMLERI (Dogrudan Supabase Client)
// ═══════════════════════════════════════════════════════════════

/**
 * Tek bir key'in degerini oku
 */
export async function kvGet<T = any>(key: string): Promise<T | null> {
  if (isConnectionCoolingDown()) return null;
  try {
    const { data, error } = await supabase
      .from(KV_TABLE)
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      if (isNetworkError(error)) { markConnectionFailure(); return null; }
      console.error(`[KV] get error for "${key}":`, error.message);
      throw new Error(`KV get failed: ${error.message}`);
    }
    clearConnectionFailure();
    return data?.value ?? null;
  } catch (e: any) {
    if (isNetworkError(e)) { markConnectionFailure(); return null; }
    throw e;
  }
}

/**
 * Birden fazla key'in degerlerini oku
 */
export async function kvMGet<T = any>(keys: string[]): Promise<T[]> {
  if (keys.length === 0) return [];
  if (isConnectionCoolingDown()) return keys.map(() => null as any);

  try {
    const { data, error } = await supabase
      .from(KV_TABLE)
      .select('key, value')
      .in('key', keys);

    if (error) {
      if (isNetworkError(error)) { markConnectionFailure(); return keys.map(() => null as any); }
      console.error(`[KV] mget error:`, error.message);
      throw new Error(`KV mget failed: ${error.message}`);
    }

    clearConnectionFailure();
    const map = new Map(data?.map(d => [d.key, d.value]) ?? []);
    return keys.map(k => map.get(k) ?? null);
  } catch (e: any) {
    if (isNetworkError(e)) { markConnectionFailure(); return keys.map(() => null as any); }
    throw e;
  }
}

/**
 * Prefix ile eslesen tum key-value ciftlerini oku
 */
export async function kvGetByPrefix<T = any>(prefix: string): Promise<T[]> {
  if (isConnectionCoolingDown()) throw new Error('KV connection cooling down');
  try {
    const { data, error } = await supabase
      .from(KV_TABLE)
      .select('value')
      .like('key', `${prefix}%`);

    if (error) {
      if (isNetworkError(error)) { markConnectionFailure(); }
      console.error(`[KV] getByPrefix error for "${prefix}":`, error.message);
      throw new Error(`KV getByPrefix failed: ${error.message}`);
    }

    clearConnectionFailure();
    return data?.map(d => d.value) ?? [];
  } catch (e: any) {
    if (isNetworkError(e)) { markConnectionFailure(); }
    throw e;
  }
}

/**
 * Prefix ile eslesen tum key-value ciftlerini key ile birlikte oku
 */
export async function kvGetByPrefixWithKeys<T = any>(prefix: string): Promise<Array<{ key: string; value: T }>> {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select('key, value')
    .like('key', `${prefix}%`);

  if (error) {
    console.error(`[KV] getByPrefixWithKeys error for "${prefix}":`, error.message);
    throw new Error(`KV getByPrefixWithKeys failed: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Prefix ile eslesen key sayisini doner
 */
export async function kvCountByPrefix(prefix: string): Promise<number> {
  if (isConnectionCoolingDown()) return 0;
  try {
    const { count, error } = await supabase
      .from(KV_TABLE)
      .select('key', { count: 'exact', head: true })
      .like('key', `${prefix}%`);

    if (error) {
      if (isNetworkError(error)) {
        markConnectionFailure();
      } else {
        console.warn(`[KV] countByPrefix error for "${prefix}":`, error.message);
      }
      return 0;
    }

    clearConnectionFailure();
    return count ?? 0;
  } catch (e: any) {
    if (isNetworkError(e)) {
      markConnectionFailure();
    } else {
      console.warn(`[KV] countByPrefix exception for "${prefix}":`, e.message);
    }
    return 0;
  }
}

/**
 * Prefix ile eslesen key listesini doner (value olmadan, hafif)
 */
export async function kvKeysByPrefix(prefix: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select('key')
    .like('key', `${prefix}%`);

  if (error) {
    console.error(`[KV] keysByPrefix error for "${prefix}":`, error.message);
    throw new Error(`KV keysByPrefix failed: ${error.message}`);
  }

  return data?.map(d => d.key) ?? [];
}

// ═══════════════════════════════════════════════════════════════
// YAZMA ISLEMLERI (Dogrudan Supabase Client)
// ═══════════════════════════════════════════════════════════════

/**
 * Tek bir key-value cifti yaz (upsert)
 */
export async function kvSet(key: string, value: any): Promise<void> {
  const { error } = await supabase
    .from(KV_TABLE)
    .upsert({ key, value });

  if (error) {
    console.error(`[KV] set error for "${key}":`, error.message);
    throw new Error(`KV set failed: ${error.message}`);
  }
}

/**
 * Birden fazla key-value cifti yaz (batch upsert)
 */
export async function kvMSet(keys: string[], values: any[]): Promise<void> {
  if (keys.length === 0) return;
  if (keys.length !== values.length) {
    throw new Error('KV mset: keys and values must have equal length');
  }

  const rows = keys.map((k, i) => ({ key: k, value: values[i] }));
  
  // Supabase 1000 row limit - chunk if needed
  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from(KV_TABLE)
      .upsert(chunk);

    if (error) {
      console.error(`[KV] mset error (chunk ${i}):`, error.message);
      throw new Error(`KV mset failed: ${error.message}`);
    }
  }
}

/**
 * Tek bir key sil
 */
export async function kvDel(key: string): Promise<void> {
  const { error } = await supabase
    .from(KV_TABLE)
    .delete()
    .eq('key', key);

  if (error) {
    console.error(`[KV] del error for "${key}":`, error.message);
    throw new Error(`KV del failed: ${error.message}`);
  }
}

/**
 * Birden fazla key sil
 */
export async function kvMDel(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const { error } = await supabase
    .from(KV_TABLE)
    .delete()
    .in('key', keys);

  if (error) {
    console.error(`[KV] mdel error:`, error.message);
    throw new Error(`KV mdel failed: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// ARAMA VE FILTRELEME
// ═══════════════════════════════════════════════════════════════

/**
 * Value icinde bir alana gore arama yap (JSONB ilike)
 * Ornek: kvSearchInValues('urunler_', 'name', 'dana')
 */
export async function kvSearchInValues<T = any>(
  prefix: string,
  field: string,
  searchTerm: string
): Promise<T[]> {
  // textSearch destegi: value->field ilike '%term%'
  const { data, error } = await supabase
    .from(KV_TABLE)
    .select('value')
    .like('key', `${prefix}%`)
    .ilike(`value->${field}`, `%${searchTerm}%`);

  if (error) {
    // ilike on jsonb might not work on all setups, fallback to client filter
    console.warn(`[KV] searchInValues JSONB ilike not supported, using client filter:`, error.message);
    const all = await kvGetByPrefix<T>(prefix);
    return all.filter((item: any) => {
      const val = item?.[field];
      return typeof val === 'string' && val.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }

  return data?.map(d => d.value) ?? [];
}

// ═══════════════════════════════════════════════════════════════
// REALTIME SUBSCRIPTION
// ══════════════════════���════════════════════════════════════════

export interface KVRealtimeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  key: string;
  value: any;
  oldKey?: string;
}

/**
 * Belirli bir prefix icin realtime degisiklikleri dinle
 * Dondurulen fonksiyonu cagirarak unsubscribe edin
 */
export function kvSubscribe(
  prefix: string,
  channelName: string,
  onEvent: (event: KVRealtimeEvent) => void
): () => void {
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: KV_TABLE },
      (payload) => {
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        const key = newRow?.key || oldRow?.key || '';

        // Sadece ilgili prefix'i dinle
        if (!key.startsWith(prefix)) return;

        onEvent({
          eventType: payload.eventType as any,
          key,
          value: newRow?.value,
          oldKey: oldRow?.key,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ═══════════════════════════════════════════════════════════════
// BAGLANTI TESTI
// ═══════════════════════════════════════════════════════════════

/**
 * KV store baglantisinini test et (kv_store_daadfb0c tablosuna erisim kontrol)
 */
export async function kvTestConnection(): Promise<{
  connected: boolean;
  totalKeys: number;
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const { count, error } = await supabase
      .from(KV_TABLE)
      .select('key', { count: 'exact', head: true });

    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      if (isNetworkError(error)) { markConnectionFailure(); }
      return { connected: false, totalKeys: 0, latencyMs, error: error.message };
    }

    clearConnectionFailure();
    return { connected: true, totalKeys: count ?? 0, latencyMs };
  } catch (e: any) {
    const latencyMs = Math.round(performance.now() - start);
    if (isNetworkError(e)) { markConnectionFailure(); }
    return { connected: false, totalKeys: 0, latencyMs, error: e.message };
  }
}

/**
 * Tum prefix'lerin istatistiklerini getir (dashboard icin)
 */
export async function kvGetStats(prefixes: string[]): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};

  await Promise.all(
    prefixes.map(async (prefix) => {
      stats[prefix] = await kvCountByPrefix(prefix);
    })
  );

  return stats;
}

// ═══════════════════════════════════════════════════════════════
// UTILITY: Tablo Bazli Yardimcilar
// ═══════════════════════════════════════════════════════════════

/** Tum tablo prefix'leri */
export const TABLE_PREFIXES = {
  personeller: 'personeller_',
  cari_hesaplar: 'cari_hesaplar_',
  urunler: 'urunler_',
  araclar: 'araclar_',
  bankalar: 'bankalar_',
  fisler: 'fisler_',
  kasa_islemleri: 'kasa_islemleri_',
  uretim_kayitlari: 'uretim_kayitlari_',
  uretim_profilleri: 'uretim_profilleri_',
  cekler: 'cekler_',
  tahsilatlar: 'tahsilatlar_',
  stok_hareketleri: 'stok_hareketleri_',
} as const;

export type TableName = keyof typeof TABLE_PREFIXES;

/**
 * Belirli bir "tablo" (prefix) icin tum kayitlari getir
 */
export async function kvGetTable<T = any>(tableName: TableName): Promise<T[]> {
  const prefix = TABLE_PREFIXES[tableName];
  return kvGetByPrefix<T>(prefix);
}

/**
 * Belirli bir "tablo" (prefix) icin kayit sayisini getir
 */
export async function kvCountTable(tableName: TableName): Promise<number> {
  const prefix = TABLE_PREFIXES[tableName];
  return kvCountByPrefix(prefix);
}

/**
 * Belirli bir "tablo" icin tek bir kayit getir (id ile)
 */
export async function kvGetById<T = any>(tableName: TableName, id: string): Promise<T | null> {
  const prefix = TABLE_PREFIXES[tableName];
  return kvGet<T>(`${prefix}${id}`);
}

/**
 * Belirli bir "tablo" icin kayit ekle/guncelle
 */
export async function kvSetById<T extends { id: string }>(tableName: TableName, item: T): Promise<void> {
  const prefix = TABLE_PREFIXES[tableName];
  return kvSet(`${prefix}${item.id}`, item);
}

/**
 * Belirli bir "tablo" icin kayit sil
 */
export async function kvDeleteById(tableName: TableName, id: string): Promise<void> {
  const prefix = TABLE_PREFIXES[tableName];
  return kvDel(`${prefix}${id}`);
}