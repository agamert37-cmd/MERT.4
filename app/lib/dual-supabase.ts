/**
 * Dual Supabase Client Manager — Stub version (Supabase removed)
 *
 * All Supabase-dependent functionality replaced with no-op stubs.
 * Types, localStorage config functions, and backup functions preserved.
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface LocalRepoConfig {
  enabled: boolean;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  lastConnected: string | null;
  lastSyncToCloud: string | null;
  lastSyncFromCloud: string | null;
  autoSync: boolean;
  syncIntervalMin: number;
  autoBackup: boolean;
  backupIntervalHours: number;
  lastAutoBackup: string | null;
  conflictStrategy: 'local_wins' | 'cloud_wins' | 'newest_wins';
  maxSyncLogs: number;
}

export interface CloudConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  customized: boolean;
}

export interface ConnectionStatus {
  siteStorage: 'active';
  local: 'connected' | 'disconnected' | 'checking' | 'not_configured';
  cloud: 'connected' | 'disconnected' | 'checking';
  primary: 'local' | 'cloud';
  localLatencyMs?: number;
  cloudLatencyMs?: number;
  localKeyCount?: number;
  cloudKeyCount?: number;
  siteStorageKeyCount?: number;
  localDiskUsageKB?: number;
  cloudDiskUsageKB?: number;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  direction: 'local_to_cloud' | 'cloud_to_local' | 'bidirectional' | 'backup' | 'restore' | 'health_check';
  status: 'success' | 'partial' | 'failed';
  keysUploaded: number;
  keysDownloaded: number;
  conflictsResolved: number;
  errors: string[];
  durationMs: number;
}

export interface SyncResult {
  direction: 'local_to_cloud' | 'cloud_to_local' | 'bidirectional';
  keysUploaded: number;
  keysDownloaded: number;
  keysSkipped: number;
  conflictsResolved: number;
  errors: string[];
  durationMs: number;
}

export interface BackupSnapshot {
  id: string;
  timestamp: string;
  source: 'local' | 'cloud';
  keysCount: number;
  sizeKB: number;
  type: 'auto' | 'manual';
}

export interface DataDiffResult {
  onlyLocal: string[];
  onlyCloud: string[];
  bothSame: string[];
  bothDifferent: string[];
  totalLocal: number;
  totalCloud: number;
}

const LOCAL_CONFIG_KEY = 'isleyen_et_local_repo_config';
const CLOUD_CONFIG_KEY = 'isleyen_et_cloud_config';
const SYNC_LOG_KEY = 'isleyen_et_sync_logs';

// ═══════════════════════════════════════════════════════════════
// CONFIG MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: LocalRepoConfig = {
  enabled: false,
  url: 'http://127.0.0.1:54321',
  anonKey: '',
  serviceRoleKey: '',
  lastConnected: null,
  lastSyncToCloud: null,
  lastSyncFromCloud: null,
  autoSync: true,
  syncIntervalMin: 5,
  autoBackup: true,
  backupIntervalHours: 24,
  lastAutoBackup: null,
  conflictStrategy: 'newest_wins',
  maxSyncLogs: 100,
};

export function getLocalRepoConfig(): LocalRepoConfig {
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch { return DEFAULT_CONFIG; }
}

export function saveLocalRepoConfig(config: Partial<LocalRepoConfig>): LocalRepoConfig {
  const current = getLocalRepoConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

export function getCloudConfig(): CloudConfig {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { url: '', anonKey: '', serviceRoleKey: '', customized: false };
}

export function saveCloudConfig(config: Partial<CloudConfig>): CloudConfig {
  const current = getCloudConfig();
  const updated = { ...current, ...config, customized: true };
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

export function resetCloudConfig(): void {
  localStorage.removeItem(CLOUD_CONFIG_KEY);
}

export function getSiteStorageStats(): { keyCount: number; sizeKB: number } {
  let keyCount = 0;
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('isleyen_et_')) {
      keyCount++;
      totalBytes += (localStorage.getItem(key) || '').length * 2;
    }
  }
  return { keyCount, sizeKB: Math.round(totalBytes / 1024) };
}

// ═══════════════════════════════════════════════════════════════
// SYNC LOGS
// ═══════════════════════════════════════════════════════════════

export function getSyncLogs(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function clearSyncLogs(): void {
  localStorage.removeItem(SYNC_LOG_KEY);
}

// ═══════════════════════════════════════════════════════════════
// CHANGE TRACKING (stub)
// ═══════════════════════════════════════════════════════════════

export function trackKeyChange(_key: string): void {
  // no-op
}

// ═══════════════════════════════════════════════════════════════
// CLIENT ACCESS (stubs)
// ═══════════════════════════════════════════════════════════════

export function getCloudClient(): any { return null; }
export function getLocalClient(): any { return null; }

let _localHealthy = false;
let _cloudHealthy = false;

export function isLocalHealthy(): boolean { return _localHealthy; }
export function isCloudHealthy(): boolean { return _cloudHealthy; }

export function getPrimaryClient(): { client: any; isLocal: boolean } {
  return { client: null, isLocal: false };
}

// ═══════════════════════════════════════════════════════════════
// CONNECTION TESTING (stubs)
// ═══════════════════════════════════════════════════════════════

export async function testLocalConnection(): Promise<{
  ok: boolean; latencyMs: number; keyCount?: number; error?: string;
}> {
  return { ok: false, latencyMs: 0, error: 'Supabase removed — using CouchDB' };
}

export async function testCloudConnection(): Promise<{
  ok: boolean; latencyMs: number; keyCount?: number; error?: string;
}> {
  return { ok: false, latencyMs: 0, error: 'Supabase removed — using CouchDB' };
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const stats = getSiteStorageStats();
  return {
    siteStorage: 'active',
    local: 'not_configured',
    cloud: 'disconnected',
    primary: 'cloud',
    siteStorageKeyCount: stats.keyCount,
  };
}

// ═══════════════════════════════════════════════════════════════
// HEALTH HEARTBEAT (stubs)
// ═══════════════════════════════════════════════════════════════

export function startHealthHeartbeat(): void { /* no-op */ }
export function stopHealthHeartbeat(): void { /* no-op */ }

// ═══════════════════════════════════════════════════════════════
// KV OPERATIONS (stubs)
// ═══════════════════════════════════════════════════════════════

export async function kvReadFromPrimary(_prefix: string): Promise<Array<{ key: string; value: any }>> {
  return [];
}

export async function kvWriteToPrimary(_key: string, _value: any): Promise<void> {}

export async function kvBatchWriteToPrimary(_keys: string[], _values: any[]): Promise<void> {}

export async function kvDeleteFromPrimary(_key: string): Promise<void> {}

// ═══════════════════════════════════════════════════════════════
// DATA DIFF (stub)
// ═══════════════════════════════════════════════════════════════

export async function computeDataDiff(): Promise<DataDiffResult> {
  return { onlyLocal: [], onlyCloud: [], bothSame: [], bothDifferent: [], totalLocal: 0, totalCloud: 0 };
}

// ═══════════════════════════════════════════════════════════════
// SYNC OPERATIONS (stubs)
// ═══════════════════════════════════════════════════════════════

export async function syncLocalToCloud(_incremental?: boolean): Promise<SyncResult> {
  return { direction: 'local_to_cloud', keysUploaded: 0, keysDownloaded: 0, keysSkipped: 0, conflictsResolved: 0, errors: ['Supabase removed'], durationMs: 0 };
}

export async function syncCloudToLocal(): Promise<SyncResult> {
  return { direction: 'cloud_to_local', keysUploaded: 0, keysDownloaded: 0, keysSkipped: 0, conflictsResolved: 0, errors: ['Supabase removed'], durationMs: 0 };
}

export async function syncBidirectional(): Promise<SyncResult> {
  return { direction: 'bidirectional', keysUploaded: 0, keysDownloaded: 0, keysSkipped: 0, conflictsResolved: 0, errors: ['Supabase removed'], durationMs: 0 };
}

// ═══════════════════════════════════════════════════════════════
// BACKUP OPERATIONS
// ═══════════════════════════════════════════════════════════════

const BACKUP_KEY = 'isleyen_et_local_backups';

export function getLocalBackupList(): BackupSnapshot[] {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function createLocalBackup(type: 'manual' | 'auto' = 'manual'): Promise<BackupSnapshot | null> {
  const stats = getSiteStorageStats();
  const snapshot: BackupSnapshot = {
    id: `backup_${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: 'local',
    keysCount: stats.keyCount,
    sizeKB: stats.sizeKB,
    type,
  };
  const list = getLocalBackupList();
  list.unshift(snapshot);
  localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, 20)));
  return snapshot;
}

export async function restoreFromLocalBackup(_backupId: string): Promise<{ ok: number; fail: number; error?: string }> {
  return { ok: 0, fail: 0, error: 'Not implemented (Supabase removed)' };
}

export async function deleteLocalBackup(backupId: string): Promise<boolean> {
  const list = getLocalBackupList().filter(b => b.id !== backupId);
  localStorage.setItem(BACKUP_KEY, JSON.stringify(list));
  return true;
}

// ═══════════════════════════════════════════════════════════════
// AUTO SYNC/BACKUP (stubs)
// ═══════════════════════════════════════════════════════════════

export function startAutoSync(): void { /* no-op */ }
export function stopAutoSync(): void { /* no-op */ }
export function startAutoBackup(): void { /* no-op */ }
export function stopAutoBackup(): void { /* no-op */ }

// ═══════════════════════════════════════════════════════════════
// CLOUD DIRECT BACKUP (stubs)
// ═══════════════════════════════════════════════════════════════

export async function createCloudDirectBackup(_type?: 'manual' | 'auto'): Promise<BackupSnapshot | null> {
  return null;
}

export function startCloudDirectBackupScheduler(_intervalHours?: number): void { /* no-op */ }
export function stopCloudDirectBackupScheduler(): void { /* no-op */ }

// ═══════════════════════════════════════════════════════════════
// FULL TABLE BACKUP — PouchDB tabanlı gerçek implementasyon
// ═══════════════════════════════════════════════════════════════

export async function createFullTableBackup(type: 'manual' | 'auto' = 'manual'): Promise<BackupSnapshot | null> {
  const { createPouchBackup, saveBackupMeta, downloadBackup } = await import('./pouchdb-backup');
  const result = await createPouchBackup();
  if (!result.ok || !result.backup) return null;

  const meta = {
    id: `backup_${Date.now()}`,
    timestamp: result.backup.createdAt,
    type,
    totalDocs: result.totalDocs,
    sizeKB: result.sizeKB,
    tableStats: result.backup.meta.tableStats,
  };
  await saveBackupMeta(meta);

  // Manuel yedekte dosyayı indir
  if (type === 'manual') {
    // Backup verisi localStorage'a da kaydet (geri yükleme için)
    try {
      localStorage.setItem(`pouchdb_backup_data_${meta.id}`, JSON.stringify(result.backup));
    } catch { /* Büyük veri localStorage'a sığmayabilir — sadece download yap */ }
    downloadBackup(result.backup);
  }

  const snapshot: BackupSnapshot = {
    id: meta.id,
    timestamp: meta.timestamp,
    source: 'local',
    keysCount: result.totalDocs,
    sizeKB: result.sizeKB,
    type,
  };
  return snapshot;
}

export async function restoreFromTableBackup(backupId: string): Promise<{ ok: number; fail: number; tables: string[] }> {
  const { restorePouchBackup } = await import('./pouchdb-backup');

  // Önce localStorage'dan yedek verisini al
  try {
    const raw = localStorage.getItem(`pouchdb_backup_data_${backupId}`);
    if (!raw) return { ok: 0, fail: 1, tables: [] };
    const backup = JSON.parse(raw);
    const result = await restorePouchBackup(backup);
    return { ok: result.ok, fail: result.fail, tables: result.tables };
  } catch (e: any) {
    return { ok: 0, fail: 1, tables: [] };
  }
}

// ═══════════════════════════════════════════════════════════════
// SETUP HELPERS
// ═══════════════════════════════════════════════════════════════

export const LOCAL_SETUP_SQL = `-- Isleyen ET Yerel Depo Kurulumu (stub)
-- Supabase removed — using CouchDB
`;

export function getDockerSetupSteps(): Array<{ step: number; title: string; description: string; command?: string }> {
  return [
    { step: 1, title: 'CouchDB Docker', description: 'docker run -d -p 5984:5984 couchdb', command: 'docker run -d -p 5984:5984 couchdb' },
  ];
}
