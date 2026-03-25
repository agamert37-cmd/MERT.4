// [AJAN-2 | claude/serene-gagarin | 2026-03-26] Son düzenleyen: Claude Opus 4.6
/**
 * Auto Setup Service — PouchDB + CouchDB
 * Her PouchDB tablosunun kayıt sayısını kontrol eder.
 * CouchDB bağlantı durumunu test eder.
 */

import { getDb } from './pouchdb';
import { testCouchDbConnection } from './pouchdb';
import { TABLE_NAMES } from './db-config';

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

// Sistemdeki tüm tablolar
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
  { table: 'tahsilatlar',       displayName: 'Tahsilatlar',         icon: '💳' },
  { table: 'arac_km_logs',      displayName: 'Araç KM Logları',     icon: '📍' },
];

/**
 * Tek bir PouchDB tablosunun kayıt sayısını kontrol et
 */
async function checkTableCount(tableName: string): Promise<{ exists: boolean; rowCount: number; error: string | null }> {
  try {
    const db = getDb(tableName);
    const info = await db.info();
    return { exists: true, rowCount: info.doc_count, error: null };
  } catch (e: any) {
    return { exists: false, rowCount: 0, error: e.message || 'Veritabanı hatası' };
  }
}

/**
 * CouchDB bağlantı testi
 */
async function testConnection(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const result = await testCouchDbConnection();
    const latencyMs = Math.round(performance.now() - start);
    return { connected: result.ok, latencyMs, error: result.error };
  } catch (e: any) {
    return { connected: false, latencyMs: Math.round(performance.now() - start), error: e.message };
  }
}

/**
 * Tüm tabloları kontrol et (PouchDB doc_count)
 */
export async function checkAllTables(): Promise<SetupStatus> {
  // Bağlantı testi
  const conn = await testConnection();

  // PouchDB her zaman yerel — bağlantı kesik olsa bile tablolar mevcut
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
    isConnected: conn.connected,
    tables: results,
    allTablesExist: missingTables.length === 0,
    missingTables,
    latencyMs: conn.latencyMs,
  };
}
