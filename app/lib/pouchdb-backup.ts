// [AJAN-3 | claude/multi-db-sync-setup-3DmYn | 2026-04-11]
// PouchDB Yedekleme Sistemi
// Tüm PouchDB tablolarını IndexedDB'den okur, JSON olarak dışa aktarır/içe aktarır.
// Yedek verisi IndexedDB'ye (mert_backups) kaydedilir — localStorage 5MB sınırına takılmaz.

import PouchDB from 'pouchdb-browser';
import { getDb, getAllDbStats } from './pouchdb';
import { TABLE_NAMES, KV_DB_NAME } from './db-config';

// ─── Tipler ───────────────────────────────────────────────────────────────────

export interface PouchBackupData {
  appName: string;
  version: string;
  format: 'pouchdb_full';
  createdAt: string;
  tables: Record<string, any[]>;        // tableName → docs dizisi (PouchDB internal alanlar temizlenmiş)
  kvEntries: Array<{ key: string; value: any }>; // KV store
  meta: {
    totalDocs: number;
    tableStats: Record<string, number>;
    sizeEstimateKB: number;
  };
}

export interface BackupResult {
  ok: boolean;
  backup?: PouchBackupData;
  error?: string;
  totalDocs: number;
  sizeKB: number;
}

export interface RestoreResult {
  ok: number;
  fail: number;
  tables: string[];
  errors: string[];
}

// ─── Yedek Verisi IndexedDB Depolama (mert_backups) ───────────────────────────

const BACKUP_DB_NAME = 'mert_backups';
let _backupDb: PouchDB.Database | null = null;

function getBackupDb(): PouchDB.Database {
  if (!_backupDb) {
    _backupDb = new PouchDB(BACKUP_DB_NAME);
  }
  return _backupDb;
}

/** Yedek verisini IndexedDB'ye kaydet */
export async function saveBackupData(id: string, backup: PouchBackupData): Promise<void> {
  const db = getBackupDb();
  try {
    const existing = await db.get(id).catch(() => null);
    if (existing) {
      await db.put({ _id: id, _rev: (existing as any)._rev, backup });
    } else {
      await db.put({ _id: id, backup });
    }
  } catch (e: any) {
    console.error('[saveBackupData]', e.message);
    throw e;
  }
}

/** Yedek verisini IndexedDB'den oku */
export async function getBackupData(id: string): Promise<PouchBackupData | null> {
  try {
    const db = getBackupDb();
    const doc = await db.get(id) as any;
    return doc.backup ?? null;
  } catch {
    return null;
  }
}

/** Yedek verisini IndexedDB'den sil */
export async function deleteBackupData(id: string): Promise<void> {
  try {
    const db = getBackupDb();
    const doc = await db.get(id);
    await db.remove(doc);
  } catch {
    // Yoksa sessizce geç
  }
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function cleanDoc(doc: any): any {
  if (!doc) return doc;
  const { _rev, _conflicts, _attachments, ...rest } = doc;
  return rest; // _id koru (restore için gerekli)
}

// ─── Yedek Oluştur ────────────────────────────────────────────────────────────

/**
 * Tüm PouchDB tablolarını ve KV store'u oku, JSON yedek oluştur.
 * @param onProgress Her tablo okunduktan sonra çağrılır (tableName, processed, total)
 */
export async function createPouchBackup(
  onProgress?: (tableName: string, processed: number, total: number) => void
): Promise<BackupResult> {
  try {
    const tables: Record<string, any[]> = {};
    const tableStats: Record<string, number> = {};
    let totalDocs = 0;
    const total = TABLE_NAMES.length;

    // Her tabloyu oku
    for (let i = 0; i < TABLE_NAMES.length; i++) {
      const tableName = TABLE_NAMES[i];
      try {
        const db = getDb(tableName);
        const result = await db.allDocs({ include_docs: true });
        const docs = result.rows
          .filter((r: any) => r.doc && !r.doc._deleted)
          .map((r: any) => cleanDoc(r.doc));
        tables[tableName] = docs;
        tableStats[tableName] = docs.length;
        totalDocs += docs.length;
      } catch {
        tables[tableName] = [];
        tableStats[tableName] = 0;
      }
      onProgress?.(tableName, i + 1, total);
    }

    // KV store'u oku
    const kvEntries: Array<{ key: string; value: any }> = [];
    try {
      const kvDb = getDb(KV_DB_NAME);
      const kvResult = await kvDb.allDocs({ include_docs: true });
      kvResult.rows
        .filter((r: any) => r.doc && !r.doc._deleted)
        .forEach((r: any) => {
          kvEntries.push({ key: r.id, value: r.doc.value });
        });
    } catch { /* KV store boşsa devam */ }

    // Boyut tahmini (JSON string uzunluğu)
    const jsonStr = JSON.stringify({ tables, kvEntries });
    const sizeKB = Math.round(jsonStr.length / 1024);

    const backup: PouchBackupData = {
      appName: 'ISLEYEN ET ERP',
      version: '5.0',
      format: 'pouchdb_full',
      createdAt: new Date().toISOString(),
      tables,
      kvEntries,
      meta: { totalDocs, tableStats, sizeEstimateKB: sizeKB },
    };

    return { ok: true, backup, totalDocs, sizeKB };
  } catch (e: any) {
    return { ok: false, error: e.message, totalDocs: 0, sizeKB: 0 };
  }
}

/**
 * Yedek dosyasını tarayıcıya JSON olarak indir.
 */
export function downloadBackup(backup: PouchBackupData, filename?: string): void {
  const dateStr = new Date(backup.createdAt).toLocaleDateString('tr-TR').replace(/\./g, '-');
  const timeStr = new Date(backup.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
  const name = filename || `IsleyenET_PouchBackup_${dateStr}_${timeStr}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Yedekten Geri Yükle ─────────────────────────────────────────────────────

/**
 * PouchDB yedeğinden tüm tabloları geri yükle.
 * Mevcut belgelerle conflict'i önlemek için upsert mantığı kullanır.
 */
export async function restorePouchBackup(backup: PouchBackupData): Promise<RestoreResult> {
  // Format doğrulaması
  if (!backup.format || backup.format !== 'pouchdb_full') {
    return { ok: 0, fail: 0, tables: [], errors: ['Geçersiz yedek formatı'] };
  }

  let totalOk = 0;
  let totalFail = 0;
  const restoredTables: string[] = [];
  const errors: string[] = [];

  // Tabloları geri yükle
  for (const [tableName, docs] of Object.entries(backup.tables)) {
    if (!docs || docs.length === 0) continue;

    try {
      const db = getDb(tableName);

      // Mevcut _rev değerlerini al (conflict önleme)
      const ids = docs.map((d: any) => d._id).filter(Boolean);
      const existing = ids.length > 0
        ? await db.allDocs({ keys: ids }).catch(() => ({ rows: [] as any[] }))
        : { rows: [] as any[] };

      const revMap = new Map<string, string>();
      existing.rows.forEach((r: any) => {
        if (r.value?.rev) revMap.set(r.id, r.value.rev);
      });

      // Toplu yazma
      const bulkDocs = docs.map((doc: any) => {
        const d = { ...doc };
        if (!d._id && d.id) d._id = d.id;
        const rev = revMap.get(d._id);
        if (rev) d._rev = rev; // upsert
        else delete d._rev;    // insert
        return d;
      }).filter((d: any) => d._id);

      if (bulkDocs.length === 0) continue;

      const results = await db.bulkDocs(bulkDocs);
      let tableOk = 0;
      let tableFail = 0;
      results.forEach((r: any) => {
        if (r.ok) tableOk++;
        else tableFail++;
      });

      totalOk += tableOk;
      totalFail += tableFail;
      if (tableOk > 0) restoredTables.push(tableName);
    } catch (e: any) {
      errors.push(`${tableName}: ${e.message}`);
      totalFail += docs.length;
    }
  }

  // KV store geri yükle
  if (backup.kvEntries && backup.kvEntries.length > 0) {
    try {
      const { kvSet } = await import('./pouchdb-kv');
      for (const { key, value } of backup.kvEntries) {
        await kvSet(key, value);
        totalOk++;
      }
    } catch (e: any) {
      errors.push(`kv_store: ${e.message}`);
    }
  }

  return { ok: totalOk, fail: totalFail, tables: restoredTables, errors };
}

/**
 * Belirli tabloları seçici olarak geri yükle.
 * @param onProgress Her tablo geri yüklendikten sonra çağrılır
 */
export async function restoreSelectedTables(
  backup: PouchBackupData,
  tableNames: string[],
  onProgress?: (tableName: string, i: number, total: number) => void
): Promise<RestoreResult> {
  // Format doğrulaması
  if (!backup.format || backup.format !== 'pouchdb_full') {
    return { ok: 0, fail: 0, tables: [], errors: ['Geçersiz yedek formatı'] };
  }

  let totalOk = 0;
  let totalFail = 0;
  const restoredTables: string[] = [];
  const errors: string[] = [];

  const filteredEntries = Object.entries(backup.tables).filter(([name]) => tableNames.includes(name));
  const total = filteredEntries.length + (tableNames.includes('kv_store') ? 1 : 0);
  let processed = 0;

  for (const [tableName, docs] of filteredEntries) {
    if (!docs || docs.length === 0) {
      processed++;
      onProgress?.(tableName, processed, total);
      continue;
    }

    try {
      const db = getDb(tableName);
      const ids = docs.map((d: any) => d._id).filter(Boolean);
      const existing = ids.length > 0
        ? await db.allDocs({ keys: ids }).catch(() => ({ rows: [] as any[] }))
        : { rows: [] as any[] };

      const revMap = new Map<string, string>();
      existing.rows.forEach((r: any) => {
        if (r.value?.rev) revMap.set(r.id, r.value.rev);
      });

      const bulkDocs = docs.map((doc: any) => {
        const d = { ...doc };
        if (!d._id && d.id) d._id = d.id;
        const rev = revMap.get(d._id);
        if (rev) d._rev = rev;
        else delete d._rev;
        return d;
      }).filter((d: any) => d._id);

      if (bulkDocs.length > 0) {
        const results = await db.bulkDocs(bulkDocs);
        let tableOk = 0;
        let tableFail = 0;
        results.forEach((r: any) => {
          if (r.ok) tableOk++;
          else tableFail++;
        });
        totalOk += tableOk;
        totalFail += tableFail;
        if (tableOk > 0) restoredTables.push(tableName);
      }
    } catch (e: any) {
      errors.push(`${tableName}: ${e.message}`);
      totalFail += docs.length;
    }

    processed++;
    onProgress?.(tableName, processed, total);
  }

  // KV store geri yükle
  if (tableNames.includes('kv_store') && backup.kvEntries && backup.kvEntries.length > 0) {
    try {
      const { kvSet } = await import('./pouchdb-kv');
      for (const { key, value } of backup.kvEntries) {
        await kvSet(key, value);
        totalOk++;
      }
      processed++;
      onProgress?.('kv_store', processed, total);
    } catch (e: any) {
      errors.push(`kv_store: ${e.message}`);
    }
  }

  return { ok: totalOk, fail: totalFail, tables: restoredTables, errors };
}

// ─── Yedek Metadata Yönetimi ─────────────────────────────────────────────────

export interface BackupMeta {
  id: string;
  timestamp: string;
  type: 'manual' | 'auto';
  totalDocs: number;
  sizeKB: number;
  tableStats: Record<string, number>;
  checksum?: string;
}

const BACKUP_META_KEY = 'isleyen_et_pouchdb_backup_meta';

export function getBackupMetaList(): BackupMeta[] {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_META_KEY) || '[]');
  } catch { return []; }
}

export function saveBackupMeta(meta: BackupMeta): void {
  const list = getBackupMetaList();
  const updated = [meta, ...list.filter(m => m.id !== meta.id)].slice(0, 30);
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify(updated));
}

export function deleteBackupMeta(id: string): void {
  const list = getBackupMetaList().filter(m => m.id !== id);
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify(list));
}

// ─── Otomatik Yedekleme ────────────────────────────────────────────────────────

const AUTO_BACKUP_CONFIG_KEY = 'isleyen_et_auto_backup_config';
let _autoBackupTimer: ReturnType<typeof setInterval> | null = null;

export interface AutoBackupConfig {
  enabled: boolean;
  intervalHours: number;
  lastRun: string | null;
}

export function getAutoBackupConfig(): AutoBackupConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTO_BACKUP_CONFIG_KEY) || '{}');
    return {
      enabled: stored.enabled ?? false,
      intervalHours: stored.intervalHours ?? 24,
      lastRun: stored.lastRun ?? null,
    };
  } catch { return { enabled: false, intervalHours: 24, lastRun: null }; }
}

export function saveAutoBackupConfig(config: AutoBackupConfig): void {
  localStorage.setItem(AUTO_BACKUP_CONFIG_KEY, JSON.stringify(config));
}

export function startAutoBackupScheduler(onBackup?: (meta: BackupMeta) => void): void {
  stopAutoBackupScheduler();
  const config = getAutoBackupConfig();
  if (!config.enabled) return;

  const intervalMs = (config.intervalHours || 24) * 60 * 60 * 1000;

  const runBackup = async () => {
    const result = await createPouchBackup();
    if (result.ok && result.backup) {
      const meta: BackupMeta = {
        id: `auto_${Date.now()}`,
        timestamp: result.backup.createdAt,
        type: 'auto',
        totalDocs: result.totalDocs,
        sizeKB: result.sizeKB,
        tableStats: result.backup.meta.tableStats,
      };
      // Veriyi IndexedDB'ye kaydet
      await saveBackupData(meta.id, result.backup).catch(console.error);
      saveBackupMeta(meta);
      const cfg = getAutoBackupConfig();
      saveAutoBackupConfig({ ...cfg, lastRun: new Date().toISOString() });
      console.log(`[AutoBackup] Tamamlandı: ${result.totalDocs} kayıt`);
      onBackup?.(meta);
    }
  };

  // İlk çalışma: son çalışma süresi geçmişse hemen çalıştır
  const cfg = getAutoBackupConfig();
  if (cfg.lastRun) {
    const elapsed = Date.now() - new Date(cfg.lastRun).getTime();
    if (elapsed >= intervalMs) runBackup();
  } else {
    runBackup();
  }

  _autoBackupTimer = setInterval(runBackup, intervalMs);
}

export function stopAutoBackupScheduler(): void {
  if (_autoBackupTimer) {
    clearInterval(_autoBackupTimer);
    _autoBackupTimer = null;
  }
}

// ─── İstatistikler ────────────────────────────────────────────────────────────

export async function getBackupSystemStats(): Promise<{
  totalLocalBackups: number;
  lastBackupAt: string | null;
  totalDocsInPouchDB: number;
  tableStats: Record<string, number>;
}> {
  const metas = getBackupMetaList();
  const dbStats = await getAllDbStats();
  const tableStats: Record<string, number> = {};
  let total = 0;
  dbStats.forEach(s => { tableStats[s.tableName] = s.docCount; total += s.docCount; });

  return {
    totalLocalBackups: metas.length,
    lastBackupAt: metas[0]?.timestamp || null,
    totalDocsInPouchDB: total,
    tableStats,
  };
}
