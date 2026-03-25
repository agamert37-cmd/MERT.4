/**
 * Node Registry — Stub version (Supabase removed)
 *
 * All Supabase-dependent functionality has been replaced with no-op stubs.
 * Types and localStorage-based functions are preserved for compatibility.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NodeInfo {
  id: string;
  name: string;
  platform: 'desktop' | 'laptop' | 'server' | 'other';
  localUrl: string;
  anonKey: string;
  lastSeen: string;
  appVersion: string;
  online?: boolean;
  latencyMs?: number;
}

export interface FailoverState {
  activeNodeId: string | null;
  reason: string;
  switchedAt: string;
}

// ─── Yerel cihaz kimliği ─────────────────────────────────────────────────────

const NODE_ID_KEY = 'isleyen_et_node_id';
const NODE_CONFIG_KEY = 'isleyen_et_node_config';

export function getLocalNodeId(): string {
  let id = localStorage.getItem(NODE_ID_KEY);
  if (!id) {
    id = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(NODE_ID_KEY, id);
  }
  return id;
}

export function getLocalNodeConfig(): Partial<NodeInfo> {
  try {
    const raw = localStorage.getItem(NODE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveLocalNodeConfig(config: Partial<NodeInfo>): void {
  localStorage.setItem(NODE_CONFIG_KEY, JSON.stringify(config));
}

// ─── Heartbeat (no-op) ──────────────────────────────────────────────────────

export function startNodeHeartbeat(): () => void {
  return () => {}; // no-op
}

// ─── Node Discovery (stub) ──────────────────────────────────────────────────

export async function discoverNodes(): Promise<NodeInfo[]> {
  return [];
}

export function isNodeOnline(_node: NodeInfo): boolean {
  return false;
}

// ─── Health Check (stub) ────────────────────────────────────────────────────

export async function pingNode(_url: string, _anonKey: string): Promise<{ online: boolean; latencyMs: number }> {
  return { online: false, latencyMs: 0 };
}

export async function checkAllNodes(nodes: NodeInfo[]): Promise<NodeInfo[]> {
  return nodes.map(n => ({ ...n, online: false, latencyMs: 0 }));
}

export function createNodeClient(_node: NodeInfo): any {
  return null;
}

// ─── Failover State ─────────────────────────────────────────────────────────

const FAILOVER_KEY = 'isleyen_et_failover_state';

export function getFailoverState(): FailoverState | null {
  try {
    const raw = localStorage.getItem(FAILOVER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setFailoverState(state: FailoverState | null): void {
  if (state) {
    localStorage.setItem(FAILOVER_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(FAILOVER_KEY);
  }
  window.dispatchEvent(new CustomEvent('failover_state_changed', { detail: state }));
}

export async function checkCloudHealth(): Promise<boolean> {
  return false; // no cloud to check
}

// ─── Backup (stub) ──────────────────────────────────────────────────────────

export async function backupToAllNodes(
  _nodes: NodeInfo[],
  _tables: string[]
): Promise<{ nodeId: string; ok: number; fail: number }[]> {
  return [];
}
