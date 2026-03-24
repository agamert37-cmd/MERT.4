// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
/**
 * Active Client Manager — Dinamik Supabase İstemcisi
 *
 * Cloud down olduğunda tüm yazmaları yerel Docker node'a yönlendirir.
 * useTableSync ve doğrudan supabase.from() çağrıları bu modülü kullanır.
 *
 * Özellikler:
 *  - Çift yazma (dual-write): cloud + yerel node'a aynı anda
 *  - WAL (Write-Ahead Log): cloud yokken yazmaları sakla, geri gelince oyna
 *  - Otomatik senkron: belirli aralıkla yerel node'lara tam tablo yedeği
 *  - Node bootstrap: yeni node'a tüm cloud verisini bas
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NodeInfo } from './node-registry';

// ─── WAL (Write-Ahead Log) ────────────────────────────────────────────────────

const WAL_KEY = 'isleyen_et_wal';
const WAL_MAX_ENTRIES = 500;

export interface WALEntry {
  id: string;
  tableName: string;
  operation: 'upsert' | 'delete';
  row: any;
  rowId: string;
  ts: number;
}

export function walLoad(): WALEntry[] {
  try {
    const raw = localStorage.getItem(WAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function walAppend(entry: Omit<WALEntry, 'id' | 'ts'>): void {
  try {
    const entries = walLoad();
    // Aynı tablo + id için önceki yazmaları sil (son yazma kazanır)
    const deduped = entries.filter(e => !(e.tableName === entry.tableName && e.rowId === entry.rowId));
    const newEntry: WALEntry = { ...entry, id: `wal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ts: Date.now() };
    const updated = [...deduped, newEntry].slice(-WAL_MAX_ENTRIES);
    localStorage.setItem(WAL_KEY, JSON.stringify(updated));
  } catch {}
}

export function walRemove(ids: string[]): void {
  try {
    const entries = walLoad().filter(e => !ids.includes(e.id));
    localStorage.setItem(WAL_KEY, JSON.stringify(entries));
  } catch {}
}

export function walClear(): void {
  localStorage.removeItem(WAL_KEY);
}

// ─── Aktif Local Node İstemcisi ───────────────────────────────────────────────

const ACTIVE_NODE_KEY = 'isleyen_et_active_node';

let _localClient: SupabaseClient | null = null;
let _localClientNodeId: string | null = null;
let _replayingWAL = false;

export function getActiveLocalNode(): NodeInfo | null {
  try {
    const raw = localStorage.getItem(ACTIVE_NODE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setActiveLocalNode(node: NodeInfo | null): void {
  if (node) {
    localStorage.setItem(ACTIVE_NODE_KEY, JSON.stringify(node));
    // İstemciyi önceden oluştur
    if (_localClientNodeId !== node.id) {
      _localClient = createClient(node.localUrl, node.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      _localClientNodeId = node.id;
    }
  } else {
    localStorage.removeItem(ACTIVE_NODE_KEY);
    _localClient = null;
    _localClientNodeId = null;
  }
  window.dispatchEvent(new CustomEvent('active_node_changed', { detail: node }));
}

export function getLocalClient(): SupabaseClient | null {
  const node = getActiveLocalNode();
  if (!node) return null;
  if (_localClientNodeId !== node.id || !_localClient) {
    _localClient = createClient(node.localUrl, node.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    _localClientNodeId = node.id;
  }
  return _localClient;
}

// ─── Çift Yazma (Dual-Write) ─────────────────────────────────────────────────

/**
 * Yerel node'a veri yaz (best-effort, sessizce başarısız olur).
 * Cloud başarısız olduğunda WAL'a da yazar.
 */
export async function dualWrite(
  tableName: string,
  rows: any[],
  operation: 'upsert' | 'delete',
  cloudOk: boolean
): Promise<void> {
  // Cloud başarısız → WAL'a yaz
  if (!cloudOk) {
    for (const row of rows) {
      walAppend({ tableName, operation, row, rowId: row?.id || String(Date.now()) });
    }
  }

  // Yerel node varsa oraya da yaz
  const client = getLocalClient();
  if (!client) return;

  try {
    if (operation === 'upsert') {
      await client.from(tableName).upsert(rows, { onConflict: 'id' });
    } else {
      for (const row of rows) {
        await client.from(tableName).delete().eq('id', row?.id || row);
      }
    }
  } catch {
    // Yerel node yazma hatası — sessizce geç
  }
}

// ─── WAL Tekrarlama (Replay) ─────────────────────────────────────────────────

/**
 * Cloud geri geldiğinde WAL'daki yazmaları cloud'a gönder.
 * Her WAL girişini cloud'a upsert/delete eder, başarılıysa siler.
 */
export async function replayWAL(cloudClient: SupabaseClient): Promise<{ replayed: number; failed: number }> {
  if (_replayingWAL) return { replayed: 0, failed: 0 };
  _replayingWAL = true;

  const entries = walLoad();
  if (entries.length === 0) { _replayingWAL = false; return { replayed: 0, failed: 0 }; }

  console.log(`[WAL] ${entries.length} yazma tekrarlanıyor...`);
  let replayed = 0;
  let failed = 0;
  const succeededIds: string[] = [];

  // Tablo bazında grupla
  const byTable: Record<string, WALEntry[]> = {};
  for (const e of entries) {
    (byTable[e.tableName] ||= []).push(e);
  }

  for (const [tableName, tableEntries] of Object.entries(byTable)) {
    const upserts = tableEntries.filter(e => e.operation === 'upsert');
    const deletes = tableEntries.filter(e => e.operation === 'delete');

    if (upserts.length > 0) {
      try {
        const { error } = await cloudClient
          .from(tableName)
          .upsert(upserts.map(e => e.row), { onConflict: 'id' });
        if (!error) {
          succeededIds.push(...upserts.map(e => e.id));
          replayed += upserts.length;
        } else {
          failed += upserts.length;
        }
      } catch {
        failed += upserts.length;
      }
    }

    for (const del of deletes) {
      try {
        const { error } = await cloudClient
          .from(tableName)
          .delete()
          .eq('id', del.rowId);
        if (!error) { succeededIds.push(del.id); replayed++; }
        else failed++;
      } catch { failed++; }
    }
  }

  walRemove(succeededIds);
  _replayingWAL = false;
  console.log(`[WAL] Tamamlandı: ${replayed} başarılı, ${failed} başarısız`);
  return { replayed, failed };
}

// ─── Otomatik Senkron Zamanlayıcı ─────────────────────────────────────────────

const AUTO_SYNC_CONFIG_KEY = 'isleyen_et_auto_node_sync';
const REAL_TABLES = [
  'fisler', 'urunler', 'cari_hesaplar', 'kasa_islemleri', 'personeller',
  'bankalar', 'cekler', 'araclar', 'arac_shifts', 'arac_km_logs',
  'uretim_profilleri', 'uretim_kayitlari', 'faturalar', 'fatura_stok', 'tahsilatlar',
];

let _autoSyncTimer: ReturnType<typeof setInterval> | null = null;
let _lastAutoSync: string | null = null;

export interface AutoSyncConfig {
  enabled: boolean;
  intervalHours: number;
  lastSync: string | null;
}

export function getAutoSyncConfig(): AutoSyncConfig {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { enabled: false, intervalHours: 6, lastSync: null };
  } catch { return { enabled: false, intervalHours: 6, lastSync: null }; }
}

export function saveAutoSyncConfig(config: AutoSyncConfig): void {
  localStorage.setItem(AUTO_SYNC_CONFIG_KEY, JSON.stringify(config));
}

export async function runAutoSync(cloudClient: SupabaseClient): Promise<{ ok: number; fail: number; nodeCount: number }> {
  const client = getLocalClient();
  if (!client) return { ok: 0, fail: 0, nodeCount: 0 };

  let ok = 0, fail = 0;

  for (const tableName of REAL_TABLES) {
    try {
      const { data } = await cloudClient.from(tableName).select('*');
      if (!data?.length) { ok++; continue; }

      for (let i = 0; i < data.length; i += 100) {
        const { error } = await client
          .from(tableName)
          .upsert(data.slice(i, i + 100), { onConflict: 'id' });
        if (error) throw error;
      }
      ok++;
    } catch { fail++; }
  }

  _lastAutoSync = new Date().toISOString();
  const cfg = getAutoSyncConfig();
  saveAutoSyncConfig({ ...cfg, lastSync: _lastAutoSync });
  window.dispatchEvent(new CustomEvent('auto_sync_completed', { detail: { ok, fail } }));

  return { ok, fail, nodeCount: 1 };
}

export function startAutoNodeSync(cloudClient: SupabaseClient): () => void {
  const cfg = getAutoSyncConfig();
  if (!cfg.enabled) return () => {};

  const intervalMs = cfg.intervalHours * 3600_000;

  // İlk çalışma: son syncten bu yana interval geçmişse hemen çalıştır
  const lastSync = cfg.lastSync ? new Date(cfg.lastSync).getTime() : 0;
  const sinceLastSync = Date.now() - lastSync;
  if (sinceLastSync >= intervalMs) {
    setTimeout(() => runAutoSync(cloudClient).catch(() => {}), 5000);
  }

  _autoSyncTimer = setInterval(() => runAutoSync(cloudClient).catch(() => {}), intervalMs);
  return () => { if (_autoSyncTimer) { clearInterval(_autoSyncTimer); _autoSyncTimer = null; } };
}

// ─── Node Bootstrap ───────────────────────────────────────────────────────────

export interface BootstrapResult {
  ok: number;
  fail: number;
  totalRows: number;
  tables: string[];
  durationMs: number;
}

/**
 * Yeni bir node'a cloud'dan tüm veriyi bas.
 * onProgress(0-100) ile ilerleme takibi yapılabilir.
 */
export async function bootstrapNode(
  node: NodeInfo,
  cloudClient: SupabaseClient,
  onProgress?: (pct: number, tableName: string) => void
): Promise<BootstrapResult> {
  const targetClient = createClient(node.localUrl, node.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const start = Date.now();
  let ok = 0, fail = 0, totalRows = 0;
  const succeededTables: string[] = [];

  for (let i = 0; i < REAL_TABLES.length; i++) {
    const tableName = REAL_TABLES[i];
    onProgress?.(Math.round((i / REAL_TABLES.length) * 100), tableName);

    try {
      const { data, error } = await cloudClient.from(tableName).select('*');
      if (error) { fail++; continue; }
      if (!data?.length) { ok++; succeededTables.push(tableName); continue; }

      totalRows += data.length;

      // 100'lük batch
      for (let j = 0; j < data.length; j += 100) {
        const { error: writeErr } = await targetClient
          .from(tableName)
          .upsert(data.slice(j, j + 100), { onConflict: 'id' });
        if (writeErr) throw writeErr;
      }

      ok++;
      succeededTables.push(tableName);
    } catch (e: any) {
      console.error(`[Bootstrap] ${tableName}:`, e.message);
      fail++;
    }
  }

  onProgress?.(100, 'Tamamlandı');
  return { ok, fail, totalRows, tables: succeededTables, durationMs: Date.now() - start };
}

// ─── Node'dan Cloud'a Ters Senkron ───────────────────────────────────────────

/**
 * Yerel node'daki veriyi cloud'a geri yükle.
 * Failover bittiğinde veya yönetici manual olarak çalıştırdığında kullanılır.
 */
export async function syncNodeToCloud(
  node: NodeInfo,
  cloudClient: SupabaseClient,
  onProgress?: (pct: number) => void
): Promise<{ ok: number; fail: number; totalRows: number }> {
  const sourceClient = createClient(node.localUrl, node.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let ok = 0, fail = 0, totalRows = 0;

  for (let i = 0; i < REAL_TABLES.length; i++) {
    onProgress?.(Math.round((i / REAL_TABLES.length) * 100));
    const tableName = REAL_TABLES[i];

    try {
      const { data, error } = await sourceClient.from(tableName).select('*');
      if (error || !data?.length) { ok++; continue; }

      totalRows += data.length;

      for (let j = 0; j < data.length; j += 100) {
        const { error: writeErr } = await cloudClient
          .from(tableName)
          .upsert(data.slice(j, j + 100), { onConflict: 'id' });
        if (writeErr) throw writeErr;
      }
      ok++;
    } catch { fail++; }
  }

  onProgress?.(100);
  return { ok, fail, totalRows };
}

export function getLastAutoSync(): string | null { return _lastAutoSync; }
export function getWALCount(): number { return walLoad().length; }
