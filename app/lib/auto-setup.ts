/**
 * Auto Setup Service
 * KV store uzerinden tablo durumlarini kontrol eder
 * Artik ayri PostgreSQL tablolari yerine kv_store_daadfb0c tablosundaki
 * prefix bazli kayitlar kontrol ediliyor.
 */

import { kvCountByPrefix, kvTestConnection } from './supabase-kv';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config';

export interface TableStatus {
  table: string;
  displayName: string;
  icon: string;
  exists: boolean;
  rowCount: number;
  lastSync: Date | null;
  error: string | null;
}

export interface SetupStatus {
  isConnected: boolean;
  tables: TableStatus[];
  allTablesExist: boolean;
  missingTables: string[];
  kvTotalKeys?: number;
  latencyMs?: number;
}

// Sistemdeki tum tablolar (KV prefix bazli)
export const SYSTEM_TABLES: Omit<TableStatus, 'exists' | 'rowCount' | 'lastSync' | 'error'>[] = [
  { table: 'personeller',       displayName: 'Personeller',        icon: '\u{1F465}' },
  { table: 'cari_hesaplar',     displayName: 'Cari Hesaplar',      icon: '\u{1F3E2}' },
  { table: 'urunler',           displayName: 'Urunler / Stok',     icon: '\u{1F4E6}' },
  { table: 'araclar',           displayName: 'Araclar',            icon: '\u{1F69B}' },
  { table: 'arac_shifts',       displayName: 'Arac Vardiyalari',   icon: '\u{1F6E3}' },
  { table: 'bankalar',          displayName: 'Banka Hesaplari',    icon: '\u{1F3E6}' },
  { table: 'fisler',            displayName: 'Fisler',             icon: '\u{1F9FE}' },
  { table: 'kasa_islemleri',    displayName: 'Kasa Islemleri',     icon: '\u{1F4B0}' },
  { table: 'cekler',            displayName: 'Cekler / Senetler',  icon: '\u{1F4DD}' },
  { table: 'uretim_profilleri', displayName: 'Uretim Profilleri',  icon: '\u{2699}\u{FE0F}'  },
  { table: 'uretim_kayitlari',  displayName: 'Uretim Kayitlari',   icon: '\u{1F3ED}' },
  { table: 'faturalar',         displayName: 'Faturalar',          icon: '\u{1F4CB}' },
  { table: 'fatura_stok',       displayName: 'Fatura Stok Kal.',   icon: '\u{1F4C4}' },
];

/**
 * Tek bir "tablo" (KV prefix) icin kayit sayisini kontrol et
 */
async function checkKVPrefix(tableName: string): Promise<{ exists: boolean; rowCount: number; error: string | null }> {
  try {
    const prefix = `${tableName}_`;
    const count = await kvCountByPrefix(prefix);
    return { exists: count > 0, rowCount: count, error: null };
  } catch (e: any) {
    const isNetworkError =
      e instanceof TypeError ||
      e?.message?.includes('Failed to fetch') ||
      e?.message?.includes('NetworkError');

    return {
      exists: false,
      rowCount: 0,
      error: isNetworkError ? 'Ag baglantisi yok' : e.message,
    };
  }
}

/**
 * Tum tablolari kontrol et (KV bazli)
 */
export async function checkAllTables(): Promise<SetupStatus> {
  // Supabase yapilandirilmis mi?
  const isConfigured = !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 10;

  if (!isConfigured) {
    return {
      isConnected: false,
      tables: SYSTEM_TABLES.map(t => ({ ...t, exists: false, rowCount: 0, lastSync: null, error: 'Supabase bagli degil' })),
      allTablesExist: false,
      missingTables: SYSTEM_TABLES.map(t => t.table),
    };
  }

  // Once KV baglantisini test et
  let kvConnection: { connected: boolean; totalKeys: number; latencyMs: number; error?: string };
  try {
    kvConnection = await kvTestConnection();
  } catch {
    kvConnection = { connected: false, totalKeys: 0, latencyMs: 0, error: 'Baglanti testi basarisiz' };
  }

  if (!kvConnection.connected) {
    console.warn(`[AutoSetup] KV bağlantısı başarısız: ${kvConnection.error || 'Bilinmeyen hata'}. Prefix sorguları atlanıyor.`);
    return {
      isConnected: false,
      tables: SYSTEM_TABLES.map(t => ({
        ...t,
        exists: false,
        rowCount: 0,
        lastSync: null,
        error: kvConnection.error || 'KV store baglantisi basarisiz',
      })),
      allTablesExist: false,
      missingTables: SYSTEM_TABLES.map(t => t.table),
      kvTotalKeys: 0,
      latencyMs: kvConnection.latencyMs,
    };
  }

  // Her prefix icin kayit sayisini paralel olarak kontrol et
  const results = await Promise.all(
    SYSTEM_TABLES.map(async (t) => {
      const status = await checkKVPrefix(t.table);
      return {
        ...t,
        exists: status.rowCount > 0,
        rowCount: status.rowCount,
        lastSync: status.rowCount > 0 ? new Date() : null,
        error: status.error,
      };
    })
  );

  // "missingTables" artik veri olmayan (kayit 0) tablolari gosterir
  // Ama bunlar gercekten "eksik" degil — sadece bos. allTablesExist icin
  // baglantinin calismasi yeterli.
  
  return {
    isConnected: true,
    tables: results,
    allTablesExist: true, // KV store baglantiyi oldugundan tum "tablolar" hazir
    missingTables: [], // KV bazli yapida eksik tablo kavram yok
    kvTotalKeys: kvConnection.totalKeys,
    latencyMs: kvConnection.latencyMs,
  };
}

/**
 * Supabase SQL Editor URL'i olustur
 */
export function getSupabaseSQLEditorUrl(): string {
  try {
    const url = new URL(SUPABASE_URL);
    const projectRef = url.hostname.split('.')[0];
    return `https://supabase.com/dashboard/project/${projectRef}/sql/new`;
  } catch {
    return 'https://supabase.com';
  }
}

/**
 * Supabase Table Editor URL'i olustur (KV store tablosu)
 */
export function getSupabaseTableEditorUrl(): string {
  try {
    const url = new URL(SUPABASE_URL);
    const projectRef = url.hostname.split('.')[0];
    return `https://supabase.com/dashboard/project/${projectRef}/editor/kv_store_daadfb0c`;
  } catch {
    return 'https://supabase.com';
  }
}