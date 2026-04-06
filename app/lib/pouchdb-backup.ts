// [2026-03-26] PouchDB Yedekleme Sistemi
// Tüm PouchDB tablolarını IndexedDB'den okur, JSON olarak dışa aktarır/içe aktarır.

import { getDb, getAllDbStats } from './pouchdb';
import { TABLE_NAMES, KV_DB_NAME } from './db-config';
import { kvGet, kvSet, kvDel } from './pouchdb-kv';

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

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function cleanDoc(doc: any): any {
  if (!doc) return doc;
  const { _rev, _conflicts, _attachments, ...rest } = doc;
  return rest; // _id koru (restore için gerekli)
}

// ─── Yedek Oluştur ────────────────────────────────────────────────────────────

/**
 * Tüm PouchDB tablolarını ve KV store'u oku, JSON yedek oluştur.
 */
export async function createPouchBackup(): Promise<BackupResult> {
  try {
    const tables: Record<string, any[]> = {};
    const tableStats: Record<string, number> = {};
    let totalDocs = 0;

    // Her tabloyu oku
    for (const tableName of TABLE_NAMES) {
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
 */
export async function restoreSelectedTables(backup: PouchBackupData, tableNames: string[]): Promise<RestoreResult> {
  const filtered: PouchBackupData = {
    ...backup,
    tables: Object.fromEntries(
      Object.entries(backup.tables).filter(([name]) => tableNames.includes(name))
    ),
    kvEntries: tableNames.includes('kv_store') ? backup.kvEntries : [],
  };
  return restorePouchBackup(filtered);
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
  // LOCAL ONLY fallback — KV store async versiyonu için getBackupMetaListAsync kullan
  try {
    return JSON.parse(localStorage.getItem(BACKUP_META_KEY) || '[]');
  } catch { return []; }
}

export async function getBackupMetaListAsync(): Promise<BackupMeta[]> {
  try {
    const kvList = await kvGet<BackupMeta[]>('pouchdb_backup_meta');
    if (kvList && kvList.length > 0) return kvList;
  } catch {}
  return getBackupMetaList();
}

export async function saveBackupMeta(meta: BackupMeta): Promise<void> {
  const list = await getBackupMetaListAsync();
  const updated = [meta, ...list.filter(m => m.id !== meta.id)].slice(0, 30);
  // KV store'a yaz (CouchDB'ye senkronize)
  await kvSet('pouchdb_backup_meta', updated).catch(() => {});
  // localStorage fallback
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify(updated));
}

export async function deleteBackupMeta(id: string): Promise<void> {
  const list = (await getBackupMetaListAsync()).filter(m => m.id !== id);
  await kvSet('pouchdb_backup_meta', list).catch(() => {});
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
    return JSON.parse(localStorage.getItem(AUTO_BACKUP_CONFIG_KEY) || '{}');
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
      // Auto-backup: sadece metadata kaydet, indirme yok
      const meta: BackupMeta = {
        id: `auto_${Date.now()}`,
        timestamp: result.backup.createdAt,
        type: 'auto',
        totalDocs: result.totalDocs,
        sizeKB: result.sizeKB,
        tableStats: result.backup.meta.tableStats,
      };
      await saveBackupMeta(meta);
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
  const metas = await getBackupMetaListAsync();
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
