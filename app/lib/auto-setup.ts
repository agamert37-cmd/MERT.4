/**
 * Auto Setup Service
 * Her Supabase tablosunu doğrudan SELECT COUNT ile kontrol eder.
 * KV store prefix yerine gerçek tablo satır sayıları kullanılır.
 */

import { supabase } from './supabase';
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
  latencyMs?: number;
}

// Sistemdeki tüm tablolar (gerçek Supabase tablo isimleri)
export const SYSTEM_TABLES: Omit<TableStatus, 'exists' | 'rowCount' | 'lastSync' | 'error'>[] = [
  { table: 'personeller',       displayName: 'Personeller',         icon: '👥' },
  { table: 'cari_hesaplar',     displayName: 'Cari Hesaplar',       icon: '🏢' },
  { table: 'urunler',           displayName: 'Ürünler / Stok',      icon: '📦' },
  { table: 'araclar',           displayName: 'Araçlar',             icon: '🚛' },
  { table: 'arac_shifts',       displayName: 'Araç Vardiyaları',    icon: '🛣️' },
  { table: 'bankalar',          displayName: 'Banka Hesapları',     icon: '🏦' },
  { table: 'fisler',            displayName: 'Fişler',              icon: '🧾' },
  { table: 'kasa_islemleri',    displayName: 'Kasa İşlemleri',      icon: '💰' },
  { table: 'cekler',            displayName: 'Çekler / Senetler',   icon: '📝' },
  { table: 'uretim_profilleri', displayName: 'Üretim Profilleri',   icon: '⚙️'  },
  { table: 'uretim_kayitlari',  displayName: 'Üretim Kayıtları',    icon: '🏭' },
  { table: 'faturalar',         displayName: 'Faturalar',           icon: '📋' },
  { table: 'fatura_stok',       displayName: 'Fatura Stok Kal.',    icon: '📄' },
];

/**
 * Tek bir Supabase tablosunun satır sayısını kontrol et
 */
async function checkTableCount(tableName: string): Promise<{ exists: boolean; rowCount: number; error: string | null }> {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('id', { count: 'exact', head: true });

    if (error) {
      // "relation does not exist" gibi hatalar → tablo yok
      const missing = error.message?.includes('does not exist') || error.code === '42P01';
      return {
        exists: !missing,
        rowCount: 0,
        error: missing ? 'Tablo bulunamadı' : error.message,
      };
    }

    return { exists: true, rowCount: count ?? 0, error: null };
  } catch (e: any) {
    const isNetwork =
      e instanceof TypeError ||
      e?.message?.includes('Failed to fetch') ||
      e?.message?.includes('NetworkError');
    return {
      exists: false,
      rowCount: 0,
      error: isNetwork ? 'Ağ bağlantısı yok' : e.message,
    };
  }
}

/**
 * Bağlantı testi: personeller tablosuna basit bir ping
 */
async function testConnection(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const { error } = await supabase
      .from('personeller')
      .select('id', { count: 'exact', head: true });

    const latencyMs = Math.round(performance.now() - start);
    if (error && (error.message?.includes('does not exist') || error.code === '42P01')) {
      // Tablo yok ama bağlantı var
      return { connected: true, latencyMs };
    }
    if (error) {
      return { connected: false, latencyMs, error: error.message };
    }
    return { connected: true, latencyMs };
  } catch (e: any) {
    return {
      connected: false,
      latencyMs: Math.round(performance.now() - start),
      error: e.message,
    };
  }
}

/**
 * Tüm tabloları kontrol et (doğrudan Supabase SELECT COUNT)
 */
export async function checkAllTables(): Promise<SetupStatus> {
  const isConfigured = !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 10;

  if (!isConfigured) {
    return {
      isConnected: false,
      tables: SYSTEM_TABLES.map(t => ({
        ...t, exists: false, rowCount: 0, lastSync: null, error: 'Supabase bağlı değil',
      })),
      allTablesExist: false,
      missingTables: SYSTEM_TABLES.map(t => t.table),
    };
  }

  // Bağlantı testi
  const conn = await testConnection();
  if (!conn.connected) {
    console.warn(`[AutoSetup] Bağlantı başarısız: ${conn.error}`);
    return {
      isConnected: false,
      tables: SYSTEM_TABLES.map(t => ({
        ...t, exists: false, rowCount: 0, lastSync: null, error: conn.error || 'Bağlantı hatası',
      })),
      allTablesExist: false,
      missingTables: SYSTEM_TABLES.map(t => t.table),
      latencyMs: conn.latencyMs,
    };
  }

  // Tüm tablolar için paralel COUNT sorgusu
  const results = await Promise.all(
    SYSTEM_TABLES.map(async (t) => {
      const status = await checkTableCount(t.table);
      return {
        ...t,
        exists: status.exists,
        rowCount: status.rowCount,
        lastSync: status.exists ? new Date() : null,
        error: status.error,
      };
    })
  );

  const missingTables = results.filter(t => !t.exists).map(t => t.table);

  return {
    isConnected: true,
    tables: results,
    allTablesExist: missingTables.length === 0,
    missingTables,
    latencyMs: conn.latencyMs,
  };
}

/**
 * Supabase SQL Editor URL'i oluştur
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
 * Supabase Table Editor URL'i oluştur (personeller tablosu)
 */
export function getSupabaseTableEditorUrl(): string {
  try {
    const url = new URL(SUPABASE_URL);
    const projectRef = url.hostname.split('.')[0];
    return `https://supabase.com/dashboard/project/${projectRef}/editor`;
  } catch {
    return 'https://supabase.com';
  }
}
