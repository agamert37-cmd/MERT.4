/**
 * Active Client Manager — Stub version (Supabase removed)
 *
 * WAL and localStorage-based functions preserved for compatibility.
 * All Supabase client operations are no-ops.
 */

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

// ─── Aktif Local Node ───────────────────────────────────────────────────────

const ACTIVE_NODE_KEY = 'isleyen_et_active_node';

export function getActiveLocalNode(): NodeInfo | null {
  try {
    const raw = localStorage.getItem(ACTIVE_NODE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setActiveLocalNode(node: NodeInfo | null): void {
  if (node) {
    localStorage.setItem(ACTIVE_NODE_KEY, JSON.stringify(node));
  } else {
    localStorage.removeItem(ACTIVE_NODE_KEY);
  }
  window.dispatchEvent(new CustomEvent('active_node_changed', { detail: node }));
}

export function getLocalClient(): any {
  return null; // no Supabase client
}

// ─── Dual Write (no-op) ─────────────────────────────────────────────────────

export async function dualWrite(
  _tableName: string,
  _rows: any[],
  _operation: 'upsert' | 'delete',
  _cloudOk: boolean
): Promise<void> {
  // no-op
}

// ─── WAL Replay (no-op) ─────────────────────────────────────────────────────

export async function replayWAL(_cloudClient: any): Promise<{ replayed: number; failed: number }> {
  return { replayed: 0, failed: 0 };
}

// ─── Auto Sync ──────────────────────────────────────────────────────────────

const AUTO_SYNC_CONFIG_KEY = 'isleyen_et_auto_node_sync';

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

export async function runAutoSync(_cloudClient: any): Promise<{ ok: number; fail: number; nodeCount: number }> {
  return { ok: 0, fail: 0, nodeCount: 0 };
}

export function startAutoNodeSync(_cloudClient: any): () => void {
  return () => {};
}

// ─── Bootstrap & Sync (stubs) ───────────────────────────────────────────────

export interface BootstrapResult {
  ok: number;
  fail: number;
  totalRows: number;
  tables: string[];
  durationMs: number;
}

export async function bootstrapNode(
  _node: NodeInfo,
  _cloudClient: any,
  _onProgress?: (pct: number, tableName: string) => void
): Promise<BootstrapResult> {
  return { ok: 0, fail: 0, totalRows: 0, tables: [], durationMs: 0 };
}

export async function syncNodeToCloud(
  _node: NodeInfo,
  _cloudClient: any,
  _onProgress?: (pct: number) => void
): Promise<{ ok: number; fail: number; totalRows: number }> {
  return { ok: 0, fail: 0, totalRows: 0 };
}

export function getLastAutoSync(): string | null { return _lastAutoSync; }
export function getWALCount(): number { return walLoad().length; }
