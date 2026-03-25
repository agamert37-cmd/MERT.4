// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
/**
 * Node Registry — Çok Sunuculu Yüksek Erişilebilirlik Sistemi
 *
 * Her cihaz (masaüstü, laptop) kendi kimliğini ve yerel Docker Supabase
 * URL'ini cloud KV store'a 30 saniyede bir yazar (heartbeat).
 *
 * Uygulama:
 *  - Tüm kayıtlı node'ları keşfeder
 *  - Hangisinin online olduğunu gösterir
 *  - Cloud down olunca en güncel yerel node'a failover yapar
 *  - İki PC de açıksa her ikisine de yedek alır
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

const KV_TABLE = 'kv_store_daadfb0c';
const HEARTBEAT_PREFIX = 'node_hb_';
const HEARTBEAT_INTERVAL_MS = 30_000;        // 30 saniye
const NODE_OFFLINE_THRESHOLD_MS = 90_000;    // 3 kaçırılmış heartbeat → offline
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NodeInfo {
  id: string;          // Kalıcı cihaz kimliği (localStorage'da saklanır)
  name: string;        // Kullanıcı dostu ad: "Masaüstü PC", "Laptop" vb.
  platform: 'desktop' | 'laptop' | 'server' | 'other';
  localUrl: string;    // Yerel Docker Supabase URL (örn. http://192.168.1.5:54321)
  anonKey: string;     // Yerel Supabase anon key
  lastSeen: string;    // ISO timestamp — son heartbeat
  appVersion: string;
  /** Hesaplanmış alan — gerçek zamanlı durum */
  online?: boolean;
  latencyMs?: number;
}

export interface FailoverState {
  activeNodeId: string | null;   // null → cloud kullanılıyor
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

// ─── Heartbeat ───────────────────────────────────────────────────────────────

let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _stopHeartbeat: (() => void) | null = null;

/** Bu cihazın heartbeat'ini cloud KV'ye yaz */
async function writeHeartbeat(): Promise<void> {
  const config = getLocalNodeConfig();
  if (!config.localUrl) return; // Yerel URL yapılandırılmamışsa heartbeat yazma

  const nodeInfo: NodeInfo = {
    id: getLocalNodeId(),
    name: config.name || 'Bilinmeyen Cihaz',
    platform: config.platform || 'desktop',
    localUrl: config.localUrl || '',
    anonKey: config.anonKey || '',
    lastSeen: new Date().toISOString(),
    appVersion: '3.5',
  };

  try {
    await supabase
      .from(KV_TABLE)
      .upsert({ key: HEARTBEAT_PREFIX + nodeInfo.id, value: nodeInfo }, { onConflict: 'key' });
  } catch {
    // Cloud erişilemez — heartbeat atlanar, sessizce devam et
  }
}

/** Heartbeat zamanlayıcısını başlat (App.tsx'ten çağrılır) */
export function startNodeHeartbeat(): () => void {
  writeHeartbeat(); // Anında ilk heartbeat
  _heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

  _stopHeartbeat = () => {
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  };
  return _stopHeartbeat;
}

// ─── Node Keşfi ──────────────────────────────────────────────────────────────

/** Cloud KV'den tüm kayıtlı node'ları oku */
export async function discoverNodes(): Promise<NodeInfo[]> {
  try {
    const { data, error } = await supabase
      .from(KV_TABLE)
      .select('key, value')
      .like('key', HEARTBEAT_PREFIX + '%');

    if (error) return [];

    return (data || [])
      .map(row => {
        const info = row.value as NodeInfo;
        return {
          ...info,
          online: isNodeOnline(info),
        };
      })
      .filter(n => n.localUrl); // URL'siz node'ları filtrele
  } catch {
    return [];
  }
}

/** Node'un online olup olmadığını lastSeen'e göre belirle */
export function isNodeOnline(node: NodeInfo): boolean {
  if (!node.lastSeen) return false;
  return Date.now() - new Date(node.lastSeen).getTime() < NODE_OFFLINE_THRESHOLD_MS;
}

// ─── Sağlık Kontrolü & Failover ─────────────────────────────────────────────

/** Belirli bir Supabase URL'ine ping at */
export async function pingNode(url: string, anonKey: string): Promise<{ online: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const result = await Promise.race<any>([
      client.from(KV_TABLE).select('key', { count: 'exact', head: true }),
      new Promise<{ error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), HEALTH_CHECK_TIMEOUT_MS)
      ),
    ]);
    const latencyMs = Date.now() - start;
    return { online: !result?.error, latencyMs };
  } catch {
    return { online: false, latencyMs: Date.now() - start };
  }
}

/** Tüm node'ların gerçek ağ erişilebilirliğini kontrol et */
export async function checkAllNodes(nodes: NodeInfo[]): Promise<NodeInfo[]> {
  const results = await Promise.all(
    nodes.map(async (node) => {
      if (!node.localUrl || !node.anonKey) {
        return { ...node, online: false, latencyMs: 0 };
      }
      const { online, latencyMs } = await pingNode(node.localUrl, node.anonKey);
      return { ...node, online, latencyMs };
    })
  );
  return results;
}

/** Online olan node'lardan birine Supabase client oluştur (failover için) */
export function createNodeClient(node: NodeInfo): SupabaseClient {
  return createClient(node.localUrl, node.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

// ─── Failover State ───────────────────────────────────────────────────────────

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

/** Cloud'un erişilebilir olup olmadığını hızlıca test et */
export async function checkCloudHealth(): Promise<boolean> {
  try {
    const { error } = await Promise.race<any>([
      supabase.from(KV_TABLE).select('key', { count: 'exact', head: true }),
      new Promise<{ error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 5000)
      ),
    ]);
    return !error;
  } catch {
    return false;
  }
}

// ─── Çoklu Node Yedekleme ────────────────────────────────────────────────────

/**
 * Tüm online yerel node'lara tam tablo yedeği al.
 * Cloud down olsa bile yerel node'lar varsa çalışır.
 */
export async function backupToAllNodes(
  nodes: NodeInfo[],
  tables: string[]
): Promise<{ nodeId: string; ok: number; fail: number }[]> {
  const onlineNodes = nodes.filter(n => n.online && n.localUrl && n.anonKey);
  if (onlineNodes.length === 0) return [];

  const results = await Promise.all(
    onlineNodes.map(async (node) => {
      const client = createNodeClient(node);
      let ok = 0;
      let fail = 0;

      for (const tableName of tables) {
        try {
          // Cloud'dan oku
          const { data, error: readErr } = await supabase.from(tableName).select('*');
          if (readErr || !data) { fail++; continue; }

          // Yerel node'a yaz (100'lük batch)
          for (let i = 0; i < data.length; i += 100) {
            const batch = data.slice(i, i + 100);
            const { error: writeErr } = await client
              .from(tableName)
              .upsert(batch, { onConflict: 'id' });
            if (writeErr) { fail++; break; }
          }
          ok++;
        } catch {
          fail++;
        }
      }

      return { nodeId: node.id, ok, fail };
    })
  );

  return results;
}
