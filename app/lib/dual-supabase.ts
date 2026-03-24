/**
 * Dual Supabase Client Manager — v2.0
 * 
 * Yerel (Docker) ve Bulut Supabase instance'larini yonetir.
 * Yerel baglanti varsa primary olarak kullanilir, yoksa buluta fallback yapilir.
 * 
 * v2 Yenilikler:
 *  - Artimli senkronizasyon (incremental sync via change tracking)
 *  - Saglik kontrol heartbeat ile otomatik failover
 *  - Zamanlanmis otomatik yedekleme (gunluk/saatlik)
 *  - Cakisma cozumleme (timestamp bazli last-write-wins)
 *  - Sync log gecmisi
 *  - KV + TABLE_PREFIXES dual-prefix senkronizasyonu
 *  - Yeniden deneme (retry) mekanizmasi
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SERVER_BASE_URL } from './supabase-config';

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

/** Online Supabase bulut bağlantı ayarları (localStorage'dan okunur, değiştirilebilir) */
export interface CloudConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  /** Ayarlar kaydedildiğinde kilitli değil, kullanıcı değiştirebilir */
  customized: boolean;
}

export interface ConnectionStatus {
  siteStorage: 'active';          // Her zaman aktif — localStorage tabanlı
  local: 'connected' | 'disconnected' | 'checking' | 'not_configured';
  cloud: 'connected' | 'disconnected' | 'checking';
  /** Öncelik sırası: siteStorage → local → cloud */
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
const CHANGE_TRACKER_KEY = 'isleyen_et_change_tracker';
const KV_TABLE = 'kv_store_daadfb0c';

// Tum senkronize edilecek prefixler (sync_ + TABLE_PREFIXES)
const ALL_SYNC_PREFIXES = [
  'sync_',
  'personeller_', 'cari_hesaplar_', 'urunler_', 'araclar_',
  'bankalar_', 'fisler_', 'kasa_islemleri_',
  'uretim_kayitlari_', 'uretim_profilleri_',
  'cekler_', 'tahsilatlar_', 'stok_hareketleri_',
];

const MAX_RETRY = 3;
const RETRY_DELAY_MS = 1000;

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
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveLocalRepoConfig(config: Partial<LocalRepoConfig>): LocalRepoConfig {
  const current = getLocalRepoConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(updated));

  // Client'lari SADECE baglanti ayarlari degistiginde sifirla
  // (metadata degisikliklerinde — lastConnected, lastSyncToCloud vb. — sifirlamak
  //  heartbeat'in her 30 saniyede client'lari yok etmesine neden olur)
  const connectionChanged =
    config.url !== undefined ||
    config.anonKey !== undefined ||
    config.serviceRoleKey !== undefined ||
    config.enabled !== undefined;

  if (connectionChanged) {
    _localClient = null;
    _localAdminClient = null;
  }

  return updated;
}

// ═══════════════════════════════════════════════════════════════
// CLOUD CONFIG MANAGEMENT (Değiştirilebilir bulut ayarları)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  serviceRoleKey: '',
  customized: false,
};

/**
 * Online Supabase ayarlarını localStorage'dan okur.
 * Kullanıcı değiştirmediyse kodda sabit olan değerleri döndürür.
 */
export function getCloudConfig(): CloudConfig {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    if (!raw) return DEFAULT_CLOUD_CONFIG;
    const saved = JSON.parse(raw);
    return {
      url: saved.url || SUPABASE_URL,
      anonKey: saved.anonKey || SUPABASE_ANON_KEY,
      serviceRoleKey: saved.serviceRoleKey || '',
      customized: true,
    };
  } catch {
    return DEFAULT_CLOUD_CONFIG;
  }
}

/**
 * Online Supabase ayarlarını localStorage'a kaydeder.
 * Kaydedildiğinde cloud client sıfırlanır ve yeni ayarlar kullanılır.
 */
export function saveCloudConfig(config: Partial<CloudConfig>): CloudConfig {
  const current = getCloudConfig();
  const updated = { ...current, ...config, customized: true };
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(updated));
  // Client'ı sıfırla — yeni ayarlarla yeniden oluşturulsun
  _cloudClient = null;
  return updated;
}

/** Bulut ayarlarını sıfırlar, kodda sabit olan varsayılan değerlere döner */
export function resetCloudConfig(): void {
  localStorage.removeItem(CLOUD_CONFIG_KEY);
  _cloudClient = null;
}

/** Site deposu (localStorage) istatistikleri */
export function getSiteStorageStats(): { keyCount: number; sizeKB: number } {
  try {
    let count = 0;
    let totalBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('isleyen_et_')) {
        count++;
        const val = localStorage.getItem(key) || '';
        totalBytes += key.length + val.length;
      }
    }
    return { keyCount: count, sizeKB: Math.round(totalBytes / 1024) };
  } catch {
    return { keyCount: 0, sizeKB: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════
// SYNC LOG
// ═══════════════════════════════════════════════════════════════

export function getSyncLogs(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addSyncLog(entry: Omit<SyncLogEntry, 'id' | 'timestamp'>): SyncLogEntry {
  const log: SyncLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  const logs = getSyncLogs();
  const { maxSyncLogs } = getLocalRepoConfig();
  logs.unshift(log);
  const trimmed = logs.slice(0, maxSyncLogs || 100);
  localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(trimmed));
  return log;
}

export function clearSyncLogs(): void {
  localStorage.removeItem(SYNC_LOG_KEY);
}

// ═══════════════════════════════════════════════════════════════
// CHANGE TRACKER (Incremental Sync)
// ═══════════════════════════════════════════════════════════════

interface ChangeTracker {
  changedKeys: Record<string, number>; // key → timestamp
  lastFullSync: number;
}

function getChangeTracker(): ChangeTracker {
  try {
    const raw = localStorage.getItem(CHANGE_TRACKER_KEY);
    return raw ? JSON.parse(raw) : { changedKeys: {}, lastFullSync: 0 };
  } catch {
    return { changedKeys: {}, lastFullSync: 0 };
  }
}

function saveChangeTracker(tracker: ChangeTracker): void {
  localStorage.setItem(CHANGE_TRACKER_KEY, JSON.stringify(tracker));
}

export function trackKeyChange(key: string): void {
  const tracker = getChangeTracker();
  tracker.changedKeys[key] = Date.now();
  saveChangeTracker(tracker);
}

function clearTrackedChanges(): void {
  const tracker = getChangeTracker();
  tracker.changedKeys = {};
  tracker.lastFullSync = Date.now();
  saveChangeTracker(tracker);
}

function getChangedKeysSinceLastSync(): string[] {
  const tracker = getChangeTracker();
  return Object.keys(tracker.changedKeys);
}

// ═══════════════════════════════════════════════════════════════
// SUPABASE CLIENTS
// ═══════════════════════════════════════════════════════════════

let _cloudClient: SupabaseClient | null = null;
let _localClient: SupabaseClient | null = null;
let _localAdminClient: SupabaseClient | null = null;

export function getCloudClient(): SupabaseClient {
  if (!_cloudClient) {
    // localStorage'daki yapılandırmayı kullan (kullanıcı değiştirdiyse)
    const cloudCfg = getCloudConfig();
    _cloudClient = createClient(cloudCfg.url, cloudCfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return _cloudClient;
}

export function getLocalClient(): SupabaseClient | null {
  const config = getLocalRepoConfig();
  if (!config.enabled || !config.url || !config.anonKey) return null;
  if (!_localClient) {
    _localClient = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return _localClient;
}

function getLocalAdminClient(): SupabaseClient | null {
  const config = getLocalRepoConfig();
  if (!config.enabled || !config.url || !config.serviceRoleKey) return null;
  if (!_localAdminClient) {
    _localAdminClient = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return _localAdminClient;
}

// ─── Health state ────────────────────────────────────────────
let _localHealthy = false;
let _cloudHealthy = false;

export function isLocalHealthy(): boolean { return _localHealthy; }
export function isCloudHealthy(): boolean { return _cloudHealthy; }

export function getPrimaryClient(): { client: SupabaseClient; isLocal: boolean } {
  const config = getLocalRepoConfig();
  if (config.enabled && _localHealthy) {
    const local = getLocalClient();
    if (local) return { client: local, isLocal: true };
  }
  return { client: getCloudClient(), isLocal: false };
}

// ═══════════════════════════════════════════════════════════════
// RETRY HELPER
// ═══════════════════════════════════════════════════════════════

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = MAX_RETRY): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (attempt === retries) throw e;
      const delay = RETRY_DELAY_MS * attempt;
      console.warn(`[DualSync] ${label} basarisiz (deneme ${attempt}/${retries}), ${delay}ms sonra tekrar...`, e.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`${label}: tum denemeler basarisiz`);
}

// ═══════════════════════════════════════════════════════════════
// CONNECTION TESTING & HEALTH
// ═══════════════════════════════════════════════════════════════

async function testKVConnection(client: SupabaseClient): Promise<{
  connected: boolean;
  latencyMs: number;
  keyCount: number;
  sizeKB: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const { count, error } = await client
      .from(KV_TABLE)
      .select('key', { count: 'exact', head: true });

    const latencyMs = Math.round(performance.now() - start);
    if (error) return { connected: false, latencyMs, keyCount: 0, sizeKB: 0, error: error.message };
    return { connected: true, latencyMs, keyCount: count ?? 0, sizeKB: 0 };
  } catch (e: any) {
    return { connected: false, latencyMs: Math.round(performance.now() - start), keyCount: 0, sizeKB: 0, error: e.message };
  }
}

export async function testLocalConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
  keyCount: number;
  error?: string;
  kvTableExists: boolean;
}> {
  const client = getLocalClient();
  if (!client) return { connected: false, latencyMs: 0, keyCount: 0, error: 'Yerel depo yapilandirilmamis', kvTableExists: false };

  const result = await testKVConnection(client);
  const kvTableExists = result.connected || (!result.error?.includes('does not exist') && !result.error?.includes('Could not find'));

  if (result.connected) {
    _localHealthy = true;
    saveLocalRepoConfig({ lastConnected: new Date().toISOString() });
  } else {
    _localHealthy = false;
  }

  return { ...result, kvTableExists };
}

export async function testCloudConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
  keyCount: number;
  error?: string;
}> {
  const result = await testKVConnection(getCloudClient());
  _cloudHealthy = result.connected;
  return result;
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const config = getLocalRepoConfig();
  const siteStats = getSiteStorageStats();

  const status: ConnectionStatus = {
    siteStorage: 'active',
    siteStorageKeyCount: siteStats.keyCount,
    local: config.enabled ? 'checking' : 'not_configured',
    cloud: 'checking',
    primary: 'cloud',
  };

  const [localResult, cloudResult] = await Promise.allSettled([
    config.enabled ? testLocalConnection() : Promise.resolve(null),
    testCloudConnection(),
  ]);

  if (localResult.status === 'fulfilled' && localResult.value) {
    const lr = localResult.value;
    status.local = lr.connected ? 'connected' : 'disconnected';
    status.localLatencyMs = lr.latencyMs;
    status.localKeyCount = lr.keyCount;
  }

  if (cloudResult.status === 'fulfilled') {
    const cr = cloudResult.value;
    status.cloud = cr.connected ? 'connected' : 'disconnected';
    status.cloudLatencyMs = cr.latencyMs;
    status.cloudKeyCount = cr.keyCount;
  }

  status.primary = (status.local === 'connected') ? 'local' : 'cloud';
  return status;
}

// ═══════════════════════════════════════════════════════════════
// HEALTH HEARTBEAT
// ═══════════════════════════════════════════════════════════════

let _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 saniye

export function startHealthHeartbeat(): void {
  stopHealthHeartbeat();
  const config = getLocalRepoConfig();
  if (!config.enabled) return;

  console.log('%c[DualSync] Saglik kontrol heartbeat baslatildi (30s)', 'color: #8b5cf6; font-weight: bold');

  const doCheck = async () => {
    const prevLocal = _localHealthy;

    const [lr, cr] = await Promise.allSettled([
      testLocalConnection().catch(() => ({ connected: false })),
      testCloudConnection().catch(() => ({ connected: false })),
    ]);

    const localConn = lr.status === 'fulfilled' ? (lr.value as any)?.connected : false;
    const cloudConn = cr.status === 'fulfilled' ? (cr.value as any)?.connected : false;

    _localHealthy = !!localConn;
    _cloudHealthy = !!cloudConn;

    // Failover log
    if (prevLocal && !_localHealthy) {
      console.warn('%c[DualSync] Yerel depo baglantisi kesildi! Buluta failover yapiliyor...', 'color: #ef4444; font-weight: bold');
      addSyncLog({ direction: 'health_check', status: 'failed', keysUploaded: 0, keysDownloaded: 0, conflictsResolved: 0, errors: ['Yerel depo baglantisi kesildi, failover: bulut'], durationMs: 0 });
    } else if (!prevLocal && _localHealthy) {
      console.log('%c[DualSync] Yerel depo baglantisi yeniden kuruldu!', 'color: #22c55e; font-weight: bold');
      addSyncLog({ direction: 'health_check', status: 'success', keysUploaded: 0, keysDownloaded: 0, conflictsResolved: 0, errors: [], durationMs: 0 });
    }
  };

  doCheck(); // Hemen bir kez calistir
  _heartbeatInterval = setInterval(doCheck, HEARTBEAT_INTERVAL_MS);
}

export function stopHealthHeartbeat(): void {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// KV OPERATIONS (PRIMARY CLIENT)
// ═══════════════════════════════════════════════════════════════

async function readAllKeysFromClient(client: SupabaseClient, prefixes: string[]): Promise<Array<{ key: string; value: any }>> {
  // Paralel prefix okumalari — sirayla yapmak yerine tum prefix'leri ayni anda oku
  const results = await Promise.allSettled(
    prefixes.map(prefix =>
      client
        .from(KV_TABLE)
        .select('key, value')
        .like('key', `${prefix}%`)
        .then(({ data, error }) => {
          if (error) {
            console.warn(`[DualSync] Prefix okuma hatasi (${prefix}):`, error.message);
            return [];
          }
          return data ?? [];
        })
    )
  );

  const allRows: Array<{ key: string; value: any }> = [];
  const seenKeys = new Set<string>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const row of result.value) {
        // Ayni key birden fazla prefix ile eslesebilir — dedup
        if (!seenKeys.has(row.key)) {
          seenKeys.add(row.key);
          allRows.push(row);
        }
      }
    }
  }

  return allRows;
}

async function writeToLocal(rows: Array<{ key: string; value: any }>): Promise<{ ok: number; fail: number }> {
  const admin = getLocalAdminClient();
  if (!admin) return { ok: 0, fail: rows.length };

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from(KV_TABLE).upsert(chunk);
    if (error) {
      fail += chunk.length;
      console.warn(`[DualSync] Yerel yazma hatasi (chunk ${i}):`, error.message);
    } else {
      ok += chunk.length;
    }
  }

  return { ok, fail };
}

async function writeToCloud(rows: Array<{ key: string; value: any }>): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    try {
      const res = await fetch(`${SERVER_BASE_URL}/kv/mset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          keys: chunk.map(r => r.key),
          values: chunk.map(r => r.value),
        }),
      });
      if (res.ok) ok += chunk.length;
      else fail += chunk.length;
    } catch {
      fail += chunk.length;
    }
  }

  return { ok, fail };
}

export async function kvReadFromPrimary(prefix: string): Promise<Array<{ key: string; value: any }>> {
  const { client } = getPrimaryClient();
  const { data, error } = await client
    .from(KV_TABLE)
    .select('key, value')
    .like('key', `${prefix}%`);
  if (error) throw new Error(`KV read failed: ${error.message}`);
  return data ?? [];
}

export async function kvWriteToPrimary(key: string, value: any): Promise<void> {
  const config = getLocalRepoConfig();
  if (config.enabled && _localHealthy && config.serviceRoleKey) {
    const admin = getLocalAdminClient();
    if (admin) {
      const { error } = await admin.from(KV_TABLE).upsert({ key, value });
      if (error) throw new Error(`Local KV write failed: ${error.message}`);
      trackKeyChange(key);
      return;
    }
  }
  // Cloud fallback
  const res = await fetch(`${SERVER_BASE_URL}/kv/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`Cloud KV write failed: ${res.status}`);
  trackKeyChange(key);
}

export async function kvBatchWriteToPrimary(keys: string[], values: any[]): Promise<void> {
  const config = getLocalRepoConfig();
  if (config.enabled && _localHealthy && config.serviceRoleKey) {
    const admin = getLocalAdminClient();
    if (admin) {
      const rows = keys.map((k, i) => ({ key: k, value: values[i] }));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await admin.from(KV_TABLE).upsert(chunk);
        if (error) throw new Error(`Local KV batch write failed: ${error.message}`);
      }
      keys.forEach(k => trackKeyChange(k));
      return;
    }
  }
  // Cloud fallback
  const res = await fetch(`${SERVER_BASE_URL}/kv/mset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ keys, values }),
  });
  if (!res.ok) throw new Error(`Cloud KV batch write failed: ${res.status}`);
  keys.forEach(k => trackKeyChange(k));
}

export async function kvDeleteFromPrimary(key: string): Promise<void> {
  const config = getLocalRepoConfig();
  if (config.enabled && _localHealthy && config.serviceRoleKey) {
    const admin = getLocalAdminClient();
    if (admin) {
      const { error } = await admin.from(KV_TABLE).delete().eq('key', key);
      if (error) throw new Error(`Local KV delete failed: ${error.message}`);
      trackKeyChange(key);
      return;
    }
  }
  const res = await fetch(`${SERVER_BASE_URL}/kv/del`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error(`Cloud KV delete failed: ${res.status}`);
}

// ═══════════════════════════════════════════════════════════════
// DATA DIFF — Yerel ve Bulut arasindaki farklari tespit et
// ═══════════════════════════════════════════════════════════════

export async function computeDataDiff(): Promise<DataDiffResult> {
  const config = getLocalRepoConfig();
  if (!config.enabled || !config.anonKey) {
    return { onlyLocal: [], onlyCloud: [], bothSame: [], bothDifferent: [], totalLocal: 0, totalCloud: 0 };
  }

  const local = getLocalClient();
  const cloud = getCloudClient();
  if (!local) return { onlyLocal: [], onlyCloud: [], bothSame: [], bothDifferent: [], totalLocal: 0, totalCloud: 0 };

  const [localRows, cloudRows] = await Promise.all([
    readAllKeysFromClient(local, ALL_SYNC_PREFIXES),
    readAllKeysFromClient(cloud, ALL_SYNC_PREFIXES),
  ]);

  const localMap = new Map(localRows.map(r => [r.key, JSON.stringify(r.value)]));
  const cloudMap = new Map(cloudRows.map(r => [r.key, JSON.stringify(r.value)]));

  const onlyLocal: string[] = [];
  const onlyCloud: string[] = [];
  const bothSame: string[] = [];
  const bothDifferent: string[] = [];

  for (const [key, val] of localMap) {
    if (!cloudMap.has(key)) onlyLocal.push(key);
    else if (cloudMap.get(key) === val) bothSame.push(key);
    else bothDifferent.push(key);
  }

  for (const key of cloudMap.keys()) {
    if (!localMap.has(key)) onlyCloud.push(key);
  }

  return {
    onlyLocal,
    onlyCloud,
    bothSame,
    bothDifferent,
    totalLocal: localRows.length,
    totalCloud: cloudRows.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// BIDIRECTIONAL SYNC — v2 (with conflict resolution)
// ═══════════════════════════════════════════════════════════════

export async function syncLocalToCloud(incremental = false): Promise<SyncResult> {
  const start = performance.now();
  const result: SyncResult = { direction: 'local_to_cloud', keysUploaded: 0, keysDownloaded: 0, keysSkipped: 0, conflictsResolved: 0, errors: [], durationMs: 0 };

  const config = getLocalRepoConfig();
  if (!config.enabled || !config.serviceRoleKey) {
    result.errors.push('Yerel depo aktif degil veya service role key eksik');
    result.durationMs = Math.round(performance.now() - start);
    addSyncLog({ direction: 'local_to_cloud', status: 'failed', keysUploaded: 0, keysDownloaded: 0, conflictsResolved: 0, errors: result.errors, durationMs: result.durationMs });
    return result;
  }

  try {
    const local = getLocalClient();
    if (!local) throw new Error('Yerel client olusturulamadi');

    let localRows: Array<{ key: string; value: any }>;

    if (incremental) {
      // Sadece degisen key'leri sync et
      const changedKeys = getChangedKeysSinceLastSync();
      if (changedKeys.length === 0) {
        result.durationMs = Math.round(performance.now() - start);
        return result;
      }
      // Degisen key'leri yerelden oku
      const { data, error } = await local.from(KV_TABLE).select('key, value').in('key', changedKeys);
      if (error) throw new Error(`Incremental read hatasi: ${error.message}`);
      localRows = data ?? [];
    } else {
      // Tam senkronizasyon
      localRows = await withRetry(
        () => readAllKeysFromClient(local, ALL_SYNC_PREFIXES),
        'Yerel veri okuma'
      );
    }

    if (localRows.length === 0) {
      result.durationMs = Math.round(performance.now() - start);
      return result;
    }

    const cloudResult = await withRetry(
      () => writeToCloud(localRows),
      'Bulut yazma'
    );

    result.keysUploaded = cloudResult.ok;
    if (cloudResult.fail > 0) {
      result.errors.push(`${cloudResult.fail} key buluta yazilamadi`);
    }

    if (incremental) clearTrackedChanges();
    saveLocalRepoConfig({ lastSyncToCloud: new Date().toISOString() });

    addSyncLog({
      direction: 'local_to_cloud',
      status: cloudResult.fail === 0 ? 'success' : 'partial',
      keysUploaded: result.keysUploaded,
      keysDownloaded: 0,
      conflictsResolved: 0,
      errors: result.errors,
      durationMs: Math.round(performance.now() - start),
    });
  } catch (e: any) {
    result.errors.push(e.message);
    addSyncLog({
      direction: 'local_to_cloud',
      status: 'failed',
      keysUploaded: result.keysUploaded,
      keysDownloaded: 0,
      conflictsResolved: 0,
      errors: result.errors,
      durationMs: Math.round(performance.now() - start),
    });
  }

  result.durationMs = Math.round(performance.now() - start);
  return result;
}

export async function syncCloudToLocal(): Promise<SyncResult> {
  const start = performance.now();
  const result: SyncResult = { direction: 'cloud_to_local', keysUploaded: 0, keysDownloaded: 0, keysSkipped: 0, conflictsResolved: 0, errors: [], durationMs: 0 };

  const config = getLocalRepoConfig();
  if (!config.enabled || !config.serviceRoleKey) {
    result.errors.push('Yerel depo aktif degil veya service role key eksik');
    result.durationMs = Math.round(performance.now() - start);
    addSyncLog({ direction: 'cloud_to_local', status: 'failed', keysUploaded: 0, keysDownloaded: 0, conflictsResolved: 0, errors: result.errors, durationMs: result.durationMs });
    return result;
  }

  try {
    const cloud = getCloudClient();
    const cloudRows = await withRetry(
      () => readAllKeysFromClient(cloud, ALL_SYNC_PREFIXES),
      'Bulut veri okuma'
    );

    if (cloudRows.length === 0) {
      result.durationMs = Math.round(performance.now() - start);
      return result;
    }

    const localResult = await withRetry(
      () => writeToLocal(cloudRows),
      'Yerel yazma'
    );

    result.keysDownloaded = localResult.ok;
    if (localResult.fail > 0) {
      result.errors.push(`${localResult.fail} key yerel'e yazilamadi`);
    }

    saveLocalRepoConfig({ lastSyncFromCloud: new Date().toISOString() });

    addSyncLog({
      direction: 'cloud_to_local',
      status: localResult.fail === 0 ? 'success' : 'partial',
      keysUploaded: 0,
      keysDownloaded: result.keysDownloaded,
      conflictsResolved: 0,
      errors: result.errors,
      durationMs: Math.round(performance.now() - start),
    });
  } catch (e: any) {
    result.errors.push(e.message);
    addSyncLog({
      direction: 'cloud_to_local',
      status: 'failed',
      keysUploaded: 0,
      keysDownloaded: result.keysDownloaded,
      conflictsResolved: 0,
      errors: result.errors,
      durationMs: Math.round(performance.now() - start),
    });
  }

  result.durationMs = Math.round(performance.now() - start);
  return result;
}

export async function syncBidirectional(): Promise<SyncResult> {
  const start = performance.now();
  const result: SyncResult = { direction: 'bidirectional', keysUploaded: 0, keysDownloaded: 0, keysSkipped: 0, conflictsResolved: 0, errors: [], durationMs: 0 };

  const config = getLocalRepoConfig();
  if (!config.enabled || !config.serviceRoleKey) {
    result.errors.push('Yerel depo aktif degil veya service role key eksik');
    result.durationMs = Math.round(performance.now() - start);
    return result;
  }

  try {
    const local = getLocalClient();
    const cloud = getCloudClient();
    if (!local) throw new Error('Yerel client olusturulamadi');

    // Her iki taraftan tum verileri paralel oku
    const [localRows, cloudRows] = await Promise.all([
      readAllKeysFromClient(local, ALL_SYNC_PREFIXES),
      readAllKeysFromClient(cloud, ALL_SYNC_PREFIXES),
    ]);

    const localMap = new Map(localRows.map(r => [r.key, r.value]));
    const cloudMap = new Map(cloudRows.map(r => [r.key, r.value]));

    const toWriteLocal: Array<{ key: string; value: any }> = [];
    const toWriteCloud: Array<{ key: string; value: any }> = [];

    // Sadece bulutta olan → yerel'e
    for (const [key, value] of cloudMap) {
      if (!localMap.has(key)) {
        toWriteLocal.push({ key, value });
      }
    }

    // Sadece yerel'de olan → buluta
    for (const [key, value] of localMap) {
      if (!cloudMap.has(key)) {
        toWriteCloud.push({ key, value });
      }
    }

    // Her ikisinde olan ama farkli → conflict resolution
    for (const [key, localValue] of localMap) {
      if (!cloudMap.has(key)) continue;
      const cloudValue = cloudMap.get(key);
      if (JSON.stringify(localValue) !== JSON.stringify(cloudValue)) {
        const strategy = config.conflictStrategy;
        if (strategy === 'local_wins') {
          toWriteCloud.push({ key, value: localValue });
        } else if (strategy === 'cloud_wins') {
          toWriteLocal.push({ key, value: cloudValue });
        } else {
          // newest_wins: updated_at karsilastirmasi (yoksa local_wins)
          const localTs = localValue?.updated_at || localValue?.updatedAt || 0;
          const cloudTs = cloudValue?.updated_at || cloudValue?.updatedAt || 0;
          if (localTs >= cloudTs) {
            toWriteCloud.push({ key, value: localValue });
          } else {
            toWriteLocal.push({ key, value: cloudValue });
          }
        }
        result.conflictsResolved++;
      }
    }

    // Paralel yazma
    const [localWriteResult, cloudWriteResult] = await Promise.all([
      toWriteLocal.length > 0 ? writeToLocal(toWriteLocal) : { ok: 0, fail: 0 },
      toWriteCloud.length > 0 ? writeToCloud(toWriteCloud) : { ok: 0, fail: 0 },
    ]);

    result.keysDownloaded = localWriteResult.ok;
    result.keysUploaded = cloudWriteResult.ok;

    if (localWriteResult.fail > 0) result.errors.push(`${localWriteResult.fail} key yerel'e yazilamadi`);
    if (cloudWriteResult.fail > 0) result.errors.push(`${cloudWriteResult.fail} key buluta yazilamadi`);

    clearTrackedChanges();
    const now = new Date().toISOString();
    saveLocalRepoConfig({ lastSyncToCloud: now, lastSyncFromCloud: now });

    addSyncLog({
      direction: 'bidirectional',
      status: result.errors.length === 0 ? 'success' : 'partial',
      keysUploaded: result.keysUploaded,
      keysDownloaded: result.keysDownloaded,
      conflictsResolved: result.conflictsResolved,
      errors: result.errors,
      durationMs: Math.round(performance.now() - start),
    });
  } catch (e: any) {
    result.errors.push(e.message);
    addSyncLog({
      direction: 'bidirectional',
      status: 'failed',
      keysUploaded: result.keysUploaded,
      keysDownloaded: result.keysDownloaded,
      conflictsResolved: result.conflictsResolved,
      errors: result.errors,
      durationMs: Math.round(performance.now() - start),
    });
  }

  result.durationMs = Math.round(performance.now() - start);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// LOCAL BACKUP SNAPSHOTS
// ═══════════════════════════════════════════════════════════════

const BACKUP_LIST_KEY = 'isleyen_et_local_backup_list';

export function getLocalBackupList(): BackupSnapshot[] {
  try {
    const raw = localStorage.getItem(BACKUP_LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBackupList(list: BackupSnapshot[]): void {
  localStorage.setItem(BACKUP_LIST_KEY, JSON.stringify(list.slice(0, 50)));
}

/**
 * Yerel depo uzerine tam yedek al (snapshot)
 * Buluttaki + yerel'deki TUM verileri okuyup yerel'e backup_ prefix ile yazar
 */
export async function createLocalBackup(type: 'manual' | 'auto' = 'manual'): Promise<BackupSnapshot | null> {
  const config = getLocalRepoConfig();
  if (!config.enabled || !config.serviceRoleKey) return null;

  const admin = getLocalAdminClient();
  if (!admin) return null;

  try {
    // Tum verileri topla (hem yerelden hem buluttan)
    const local = getLocalClient();
    const cloud = getCloudClient();

    const [localRows, cloudRows] = await Promise.all([
      local ? readAllKeysFromClient(local, ALL_SYNC_PREFIXES).catch(() => []) : [],
      readAllKeysFromClient(cloud, ALL_SYNC_PREFIXES).catch(() => []),
    ]);

    // Merge (yerel oncelikli)
    const merged = new Map<string, any>();
    for (const r of cloudRows) merged.set(r.key, r.value);
    for (const r of localRows) merged.set(r.key, r.value); // yerel üzerine yazar

    const timestamp = new Date().toISOString();
    const backupId = `bkp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const backupKey = `backup_${backupId}`;

    // Tek bir buyuk JSON olarak yerel'e yaz
    const backupData = {
      id: backupId,
      timestamp,
      type,
      keysCount: merged.size,
      data: Object.fromEntries(merged),
    };

    const backupJson = JSON.stringify(backupData);
    const sizeKB = Math.round(backupJson.length / 1024);

    const { error } = await admin.from(KV_TABLE).upsert({
      key: backupKey,
      value: backupData,
    });

    if (error) throw new Error(`Backup yazma hatasi: ${error.message}`);

    const snapshot: BackupSnapshot = {
      id: backupId,
      timestamp,
      source: 'local',
      keysCount: merged.size,
      sizeKB,
      type,
    };

    const list = getLocalBackupList();
    list.unshift(snapshot);
    saveBackupList(list);

    saveLocalRepoConfig({ lastAutoBackup: timestamp });

    addSyncLog({
      direction: 'backup',
      status: 'success',
      keysUploaded: 0,
      keysDownloaded: 0,
      conflictsResolved: 0,
      errors: [],
      durationMs: 0,
    });

    console.log(`%c[DualSync] Yerel yedek olusturuldu: ${merged.size} key, ${sizeKB} KB`, 'color: #22c55e; font-weight: bold');
    return snapshot;
  } catch (e: any) {
    console.error('[DualSync] Backup hatasi:', e.message);
    addSyncLog({
      direction: 'backup',
      status: 'failed',
      keysUploaded: 0,
      keysDownloaded: 0,
      conflictsResolved: 0,
      errors: [e.message],
      durationMs: 0,
    });
    return null;
  }
}

/**
 * Yerel yedekten geri yukle
 */
export async function restoreFromLocalBackup(backupId: string): Promise<{ ok: number; fail: number; error?: string }> {
  const config = getLocalRepoConfig();
  if (!config.enabled || !config.anonKey) return { ok: 0, fail: 0, error: 'Yerel depo aktif degil' };

  const local = getLocalClient();
  if (!local) return { ok: 0, fail: 0, error: 'Yerel client yok' };

  try {
    const { data, error } = await local
      .from(KV_TABLE)
      .select('value')
      .eq('key', `backup_${backupId}`)
      .maybeSingle();

    if (error || !data?.value) return { ok: 0, fail: 0, error: 'Yedek bulunamadi' };

    const backupData = data.value;
    if (!backupData.data || typeof backupData.data !== 'object') {
      return { ok: 0, fail: 0, error: 'Yedek verisi bozuk' };
    }

    const rows = Object.entries(backupData.data).map(([key, value]) => ({ key, value }));

    // Hem yerel'e hem buluta yaz
    const [localResult, cloudResult] = await Promise.all([
      writeToLocal(rows),
      writeToCloud(rows),
    ]);

    // localStorage'i da guncelle
    const STORAGE_PREFIX = 'isleyen_et_';
    for (const [key, value] of Object.entries(backupData.data)) {
      if (key.startsWith('sync_')) {
        const storageKey = key.replace('sync_', '');
        localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, JSON.stringify(value));
      }
    }

    addSyncLog({
      direction: 'restore',
      status: 'success',
      keysUploaded: cloudResult.ok,
      keysDownloaded: localResult.ok,
      conflictsResolved: 0,
      errors: [],
      durationMs: 0,
    });

    return { ok: localResult.ok + cloudResult.ok, fail: localResult.fail + cloudResult.fail };
  } catch (e: any) {
    return { ok: 0, fail: 0, error: e.message };
  }
}

/**
 * Yerel yedegi sil
 */
export async function deleteLocalBackup(backupId: string): Promise<boolean> {
  const admin = getLocalAdminClient();
  if (!admin) return false;

  try {
    const { error } = await admin.from(KV_TABLE).delete().eq('key', `backup_${backupId}`);
    if (error) return false;

    const list = getLocalBackupList().filter(b => b.id !== backupId);
    saveBackupList(list);
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTO SYNC + AUTO BACKUP SCHEDULER
// ═══════════════════════════════════════════════════════════════

let _syncInterval: ReturnType<typeof setInterval> | null = null;
let _backupInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync() {
  stopAutoSync();
  const config = getLocalRepoConfig();
  if (!config.enabled || !config.autoSync) return;

  const intervalMs = (config.syncIntervalMin || 5) * 60 * 1000;
  console.log(`%c[DualSync] Otomatik sync baslatildi (${config.syncIntervalMin} dk aralikla)`, 'color: #8b5cf6; font-weight: bold');

  _syncInterval = setInterval(async () => {
    try {
      // Artimli sync (sadece degisen key'ler)
      const result = await syncLocalToCloud(true);
      if (result.keysUploaded > 0) {
        console.log(`%c[DualSync] Otomatik sync: ${result.keysUploaded} key yuklendi (${result.durationMs}ms)`, 'color: #22c55e');
      }
    } catch (e: any) {
      console.warn('[DualSync] Otomatik sync hatasi:', e.message);
    }
  }, intervalMs);
}

export function stopAutoSync() {
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
}

export function startAutoBackup() {
  stopAutoBackup();
  const config = getLocalRepoConfig();
  if (!config.enabled || !config.autoBackup) return;

  const intervalMs = (config.backupIntervalHours || 24) * 60 * 60 * 1000;
  console.log(`%c[DualSync] Otomatik yedekleme baslatildi (${config.backupIntervalHours} saat aralikla)`, 'color: #f59e0b; font-weight: bold');

  // Ilk calistirmada, son backup'tan bu yana yeterli sure gectiyse hemen al
  if (config.lastAutoBackup) {
    const elapsed = Date.now() - new Date(config.lastAutoBackup).getTime();
    if (elapsed >= intervalMs) {
      createLocalBackup('auto').catch(() => {});
    }
  }

  _backupInterval = setInterval(async () => {
    try {
      const snapshot = await createLocalBackup('auto');
      if (snapshot) {
        console.log(`%c[DualSync] Otomatik yedek: ${snapshot.keysCount} key, ${snapshot.sizeKB} KB`, 'color: #f59e0b');
      }
    } catch (e: any) {
      console.warn('[DualSync] Otomatik yedek hatasi:', e.message);
    }
  }, intervalMs);
}

export function stopAutoBackup() {
  if (_backupInterval) {
    clearInterval(_backupInterval);
    _backupInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// CLOUD DIRECT BACKUP — Edge Function gerektirmez
// GÜÇLENDİRME [AJAN-2]: Yerel Docker Supabase olmayan kullanıcılar için
// doğrudan Supabase JS client ile buluta yedek alır.
// ═══════════════════════════════════════════════════════════════

const LAST_CLOUD_DIRECT_BACKUP_KEY = 'isleyen_et_last_cloud_direct_backup';

/**
 * Doğrudan bulut Supabase kv_store_daadfb0c tablosuna yedek yazar.
 * Edge Function gerektirmez — anon client ile çalışır.
 */
export async function createCloudDirectBackup(type: 'manual' | 'auto' = 'auto'): Promise<BackupSnapshot | null> {
  const cloud = getCloudClient();

  try {
    // Tüm sync_ key'lerini buluttan oku
    const { data, error } = await cloud
      .from(KV_TABLE)
      .select('key, value')
      .like('key', 'sync_%');

    if (error) throw new Error(`Bulut okuma hatası: ${error.message}`);

    const rows = data ?? [];
    const timestamp = new Date().toISOString();
    const backupId = `cloud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const backupKey = `backup_${backupId}`;

    const backupData = {
      id: backupId,
      timestamp,
      type,
      keysCount: rows.length,
      data: Object.fromEntries(rows.map(r => [r.key, r.value])),
    };

    const sizeKB = Math.round(JSON.stringify(backupData).length / 1024);

    // Buluta backup_ prefix ile yaz
    const { error: writeError } = await cloud
      .from(KV_TABLE)
      .upsert({ key: backupKey, value: backupData });

    if (writeError) throw new Error(`Backup yazma hatası: ${writeError.message}`);

    const snapshot: BackupSnapshot = {
      id: backupId,
      timestamp,
      source: 'cloud',
      keysCount: rows.length,
      sizeKB,
      type,
    };

    const list = getLocalBackupList();
    list.unshift(snapshot);
    saveBackupList(list);

    localStorage.setItem(LAST_CLOUD_DIRECT_BACKUP_KEY, timestamp);

    addSyncLog({
      direction: 'backup',
      status: 'success',
      keysUploaded: rows.length,
      keysDownloaded: 0,
      conflictsResolved: 0,
      errors: [],
      durationMs: 0,
    });

    console.log(`%c[DualSync] Doğrudan bulut yedeği oluşturuldu: ${rows.length} key, ${sizeKB} KB`, 'color: #22c55e; font-weight: bold');
    return snapshot;
  } catch (e: any) {
    console.error('[DualSync] Doğrudan bulut yedek hatası:', e.message);
    addSyncLog({
      direction: 'backup',
      status: 'failed',
      keysUploaded: 0,
      keysDownloaded: 0,
      conflictsResolved: 0,
      errors: [e.message],
      durationMs: 0,
    });
    return null;
  }
}

let _cloudDirectBackupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Cloud-only otomatik yedekleme zamanlayıcısı.
 * Yerel Supabase aktif olmasa bile 24 saatte bir buluta yedek alır.
 */
export function startCloudDirectBackupScheduler(intervalHours = 24): void {
  if (_cloudDirectBackupInterval) return;

  const intervalMs = intervalHours * 60 * 60 * 1000;

  const runBackup = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    createCloudDirectBackup('auto').catch(() => {});
  };

  // İlk çalıştırmada yeterli süre geçmişse hemen al
  const lastRaw = localStorage.getItem(LAST_CLOUD_DIRECT_BACKUP_KEY);
  const lastTs = lastRaw ? new Date(lastRaw).getTime() : 0;
  if (Date.now() - lastTs >= intervalMs) {
    setTimeout(runBackup, 8000); // Uygulama açılışından 8s sonra
  }

  _cloudDirectBackupInterval = setInterval(runBackup, intervalMs);
  console.log(`%c[DualSync] Bulut otomatik yedek zamanlayıcısı aktif (${intervalHours}s)`, 'color: #a855f7');
}

export function stopCloudDirectBackupScheduler(): void {
  if (_cloudDirectBackupInterval) {
    clearInterval(_cloudDirectBackupInterval);
    _cloudDirectBackupInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// DOCKER SETUP
// ═══════════════════════════════════════════════════════════════

export const LOCAL_SETUP_SQL = `-- Isleyen ET Yerel Depo Kurulumu
-- Bu SQL'i yerel Supabase SQL Editor'de calistirin
-- (http://127.0.0.1:54323 → SQL Editor)

-- 1. KV Store tablosunu olustur
CREATE TABLE IF NOT EXISTS kv_store_daadfb0c (
  key TEXT PRIMARY KEY,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS'yi kapat (yerel ortam icin guvenli)
ALTER TABLE kv_store_daadfb0c DISABLE ROW LEVEL SECURITY;

-- 3. Otomatik updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_kv_store_updated_at ON kv_store_daadfb0c;
CREATE TRIGGER update_kv_store_updated_at
  BEFORE UPDATE ON kv_store_daadfb0c
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. Realtime yayin etkinlestir
ALTER PUBLICATION supabase_realtime ADD TABLE kv_store_daadfb0c;

-- Tamamlandi!
SELECT 'kv_store_daadfb0c tablosu basariyla olusturuldu!' AS sonuc;`;

export function getDockerSetupSteps(): Array<{ step: number; title: string; description: string; command?: string }> {
  return [
    { step: 1, title: 'Supabase CLI Kur', description: 'Windows PowerShell veya CMD\'de Supabase CLI\'yi kurun', command: 'npm install -g supabase' },
    { step: 2, title: 'Proje Klasoru Olustur', description: 'Yerel veritabani dosyalari icin bir klasor olusturun', command: 'mkdir C:\\IsleyenET && cd C:\\IsleyenET' },
    { step: 3, title: 'Supabase Projesini Baslat', description: 'Yerel Supabase projesini baslatma komutu', command: 'supabase init && supabase start' },
    { step: 4, title: 'Bilgileri Kopyala', description: 'Terminal ciktisindaki API URL, anon key ve service_role key\'i asagidaki alanlara yapistin', command: 'supabase status' },
    { step: 5, title: 'KV Tablosunu Olustur', description: 'Tarayicida http://127.0.0.1:54323 adresine gidin → SQL Editor → asagidaki SQL\'i calistirin' },
    { step: 6, title: 'Baglantiyi Test Et', description: 'Asagidaki formu doldurun ve "Baglanti Test Et" butonuna basin' },
  ];
}