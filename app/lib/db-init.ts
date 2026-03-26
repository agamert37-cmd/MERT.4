// [AJAN-2 | claude/serene-gagarin | 2026-03-26] Son düzenleyen: Claude Opus 4.6
/**
 * Veritabanı Başlatma — PouchDB + CouchDB
 *
 * PouchDB yerel veritabanları otomatik oluşur, CouchDB tarafı
 * couchdb-setup.sh ile oluşturulur. Bu dosya artık sadece
 * uyumluluk için tip/fonksiyon export eder.
 */

import { testCouchDbConnection } from './pouchdb';
import { getDb } from './pouchdb';
import { TABLE_NAMES } from './db-config';

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type DbInitStatus =
  | 'idle'
  | 'checking'
  | 'setup_needed'
  | 'setting_up'
  | 'ready'
  | 'error';

export interface DbTableStatus {
  name: string;
  ready: boolean;
}

export interface DbInitResult {
  status: DbInitStatus;
  message: string;
  tables?: Record<string, boolean>;
  allReady?: boolean;
  steps?: Array<{ name: string; ok: boolean; error?: string }>;
  error?: string;
}

// Uygulama açılışında yalnızca bir kez kontrol
let _initAttempted = false;
let _initResult: DbInitResult | null = null;

/**
 * PouchDB tablolarının durumunu kontrol et
 */
export async function checkDatabaseStatus(): Promise<DbInitResult> {
  try {
    const tables: Record<string, boolean> = {};
    for (const table of TABLE_NAMES) {
      try {
        const db = getDb(table);
        await db.info();
        tables[table] = true;
      } catch {
        tables[table] = false;
      }
    }

    const allReady = Object.values(tables).every(Boolean);
    return {
      status: allReady ? 'ready' : 'setup_needed',
      message: allReady ? 'Tüm tablolar hazır' : 'Bazı tablolar oluşturulamadı',
      tables,
      allReady,
    };
  } catch (e: any) {
    return { status: 'error', message: `Kontrol hatası: ${e.message}`, allReady: false };
  }
}

/**
 * PouchDB tabloları otomatik oluşur — bu fonksiyon CouchDB bağlantısını kontrol eder
 */
export async function setupDatabase(): Promise<DbInitResult> {
  const conn = await testCouchDbConnection();
  if (!conn.ok) {
    return {
      status: 'error',
      message: `CouchDB bağlantısı kurulamadı: ${conn.error}`,
      allReady: false,
    };
  }
  return { status: 'ready', message: 'PouchDB tabloları hazır, CouchDB bağlı', allReady: true };
}

/**
 * Veritabanını başlat
 */
export async function initializeDatabase(forceReinit = false): Promise<DbInitResult> {
  if (!forceReinit && _initAttempted && _initResult) return _initResult;

  _initAttempted = true;
  const checkResult = await checkDatabaseStatus();
  _initResult = checkResult;

  if (checkResult.status === 'ready') {
    console.log('%c[DB Init] PouchDB tabloları hazır', 'color: #22c55e; font-weight: bold');
  }

  return _initResult;
}

export function resetDbInitCache() {
  _initAttempted = false;
  _initResult = null;
}

export function getLastDbInitResult(): DbInitResult | null {
  return _initResult;
}
