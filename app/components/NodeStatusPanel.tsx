// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
/**
 * NodeStatusPanel — Sunucu Durumu & Failover Paneli
 *
 * Kayıtlı tüm node'ları (masaüstü, laptop, cloud) listeler.
 * Hangisinin online olduğunu gösterir.
 * Aktif failover durumunu bildirir.
 * İki PC de açıksa her ikisine de yedek alır.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Monitor, Laptop, Cloud, Wifi, WifiOff, RefreshCcw,
  CheckCircle2, AlertTriangle, ArrowRightLeft, HardDrive,
  Activity, Zap, X, ChevronDown, ChevronUp, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import {
  discoverNodes, checkAllNodes, checkCloudHealth,
  getFailoverState, setFailoverState, backupToAllNodes,
  getLocalNodeId, type NodeInfo, type FailoverState
} from '../lib/node-registry';

const REAL_TABLES = [
  'fisler', 'urunler', 'cari_hesaplar', 'kasa_islemleri', 'personeller',
  'bankalar', 'cekler', 'araclar', 'arac_shifts', 'arac_km_logs',
  'uretim_profilleri', 'uretim_kayitlari', 'faturalar', 'fatura_stok', 'tahsilatlar',
];

interface CloudStatus {
  online: boolean;
  latencyMs: number;
  checking: boolean;
}

const platformIcon = (platform: NodeInfo['platform']) => {
  switch (platform) {
    case 'laptop': return <Laptop className="w-4 h-4" />;
    case 'server': return <HardDrive className="w-4 h-4" />;
    default: return <Monitor className="w-4 h-4" />;
  }
};

const platformLabel = (platform: NodeInfo['platform']) => {
  switch (platform) {
    case 'laptop': return 'Laptop';
    case 'server': return 'Sunucu';
    default: return 'Masaüstü PC';
  }
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s önce`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}dk önce`;
  return `${Math.round(diff / 3600_000)}sa önce`;
}

// ─── Compact badge for header/statusbar ─────────────────────────────────────

export function NodeStatusBadge() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [cloudOnline, setCloudOnline] = useState(true);
  const [failover, setFailover] = useState<FailoverState | null>(getFailoverState());

  useEffect(() => {
    const refresh = async () => {
      const [discovered, cloudOk] = await Promise.all([
        discoverNodes(),
        checkCloudHealth(),
      ]);
      setNodes(discovered);
      setCloudOnline(cloudOk);
      setFailover(getFailoverState());
    };
    refresh();
    const interval = setInterval(refresh, 30_000);
    const onFailover = () => setFailover(getFailoverState());
    window.addEventListener('failover_state_changed', onFailover);
    return () => { clearInterval(interval); window.removeEventListener('failover_state_changed', onFailover); };
  }, []);

  const onlineNodes = nodes.filter(n => n.online);
  const totalNodes = nodes.length;

  if (failover?.activeNodeId) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs text-orange-400">
        <ArrowRightLeft className="w-3 h-3" />
        <span>Yerel Sunucu</span>
      </div>
    );
  }

  if (!cloudOnline) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
        <WifiOff className="w-3 h-3" />
        <span>Cloud Offline</span>
      </div>
    );
  }

  if (onlineNodes.length === 0 && totalNodes === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-400">
      <Activity className="w-3 h-3" />
      <span>{onlineNodes.length}/{totalNodes + 1} Aktif</span>
    </div>
  );
}

// ─── Ana Panel ────────────────────────────────────────────────────────────────

export function NodeStatusPanel() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [cloud, setCloud] = useState<CloudStatus>({ online: true, latencyMs: 0, checking: false });
  const [failover, setFailoverLocal] = useState<FailoverState | null>(getFailoverState());
  const [checking, setChecking] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [backupResults, setBackupResults] = useState<{ nodeId: string; ok: number; fail: number }[] | null>(null);
  const localNodeId = getLocalNodeId();

  const refresh = useCallback(async (deepCheck = false) => {
    setChecking(true);
    try {
      const discovered = await discoverNodes();
      let checked = discovered;
      if (deepCheck) {
        checked = await checkAllNodes(discovered);
      }
      setNodes(checked);

      // Cloud health
      const start = Date.now();
      const cloudOk = await checkCloudHealth();
      setCloud({ online: cloudOk, latencyMs: Date.now() - start, checking: false });

      // Otomatik failover: Cloud down ama yerel node var
      const currentFailover = getFailoverState();
      if (!cloudOk && !currentFailover) {
        const bestNode = checked.find(n => n.online);
        if (bestNode) {
          const fs: FailoverState = {
            activeNodeId: bestNode.id,
            reason: 'Cloud erişilemez — yerel sunucuya geçildi',
            switchedAt: new Date().toISOString(),
          };
          setFailoverState(fs);
          setFailoverLocal(fs);
          toast.warning(`⚡ Failover: ${bestNode.name} (${bestNode.platform}) aktif`, { duration: 5000 });
        }
      } else if (cloudOk && currentFailover) {
        // Cloud geri geldi
        setFailoverState(null);
        setFailoverLocal(null);
        toast.success('☁️ Cloud bağlantısı geri geldi', { duration: 3000 });
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh(false);
    const interval = setInterval(() => refresh(false), 60_000);
    const onFailover = () => setFailoverLocal(getFailoverState());
    window.addEventListener('failover_state_changed', onFailover);
    return () => { clearInterval(interval); window.removeEventListener('failover_state_changed', onFailover); };
  }, [refresh]);

  const handleDeepCheck = () => refresh(true);

  const handleBackupAll = async () => {
    const onlineNodes = nodes.filter(n => n.online && n.localUrl && n.anonKey);
    if (onlineNodes.length === 0) {
      toast.error('Online yerel node bulunamadı');
      return;
    }
    setBackingUp(true);
    setBackupResults(null);
    try {
      toast.info(`${onlineNodes.length} yerel sunucuya yedekleniyor...`);
      const results = await backupToAllNodes(onlineNodes, REAL_TABLES);
      setBackupResults(results);
      const totalOk = results.reduce((s, r) => s + r.ok, 0);
      const totalFail = results.reduce((s, r) => s + r.fail, 0);
      toast.success(`Yedekleme tamamlandı: ${totalOk} tablo başarılı, ${totalFail} hata`);
    } catch (e: any) {
      toast.error(`Yedekleme hatası: ${e.message}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleClearFailover = () => {
    setFailoverState(null);
    setFailoverLocal(null);
    toast.info('Failover temizlendi — cloud bağlantısı deneniyor');
    refresh(true);
  };

  const onlineCount = nodes.filter(n => n.online).length;
  const totalActive = (cloud.online ? 1 : 0) + onlineCount;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${totalActive > 1 ? 'bg-green-500/20' : cloud.online ? 'bg-blue-500/20' : 'bg-red-500/20'}`}>
            <Shield className={`w-4 h-4 ${totalActive > 1 ? 'text-green-400' : cloud.online ? 'text-blue-400' : 'text-red-400'}`} />
          </div>
          <div className="text-left">
            <div className="font-semibold text-sm">Sunucu Durumu & Failover</div>
            <div className="text-xs text-muted-foreground">
              {totalActive} aktif sunucu
              {failover ? ' — Yerel sunucu aktif' : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {failover && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
              FAILOVER
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Failover uyarısı */}
              {failover && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  <ArrowRightLeft className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-orange-300">Failover Aktif</div>
                    <div className="text-xs text-orange-400/70 mt-0.5">{failover.reason}</div>
                  </div>
                  <button
                    onClick={handleClearFailover}
                    className="p-1 rounded-lg hover:bg-orange-500/20 text-orange-400 transition-colors"
                    title="Failover'ı temizle"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Cloud durumu */}
              <NodeRow
                icon={<Cloud className="w-4 h-4" />}
                name="Supabase Cloud"
                subtitle="Birincil veritabanı"
                online={cloud.online}
                latencyMs={cloud.latencyMs}
                isActive={!failover}
                isCurrent={false}
                badge={cloud.online ? undefined : 'OFFLINE'}
              />

              {/* Yerel node'lar */}
              {nodes.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-xl">
                  Kayıtlı yerel sunucu yok — Ayarlar &gt; Sunucular'dan ekleyin
                </div>
              )}

              {nodes.map((node) => (
                <NodeRow
                  key={node.id}
                  icon={platformIcon(node.platform)}
                  name={node.name}
                  subtitle={`${platformLabel(node.platform)} — ${node.localUrl || 'URL yapılandırılmamış'}`}
                  online={!!node.online}
                  latencyMs={node.latencyMs}
                  isActive={failover?.activeNodeId === node.id}
                  isCurrent={node.id === localNodeId}
                  lastSeen={node.lastSeen}
                  badge={node.id === localNodeId ? 'BU CİHAZ' : undefined}
                />
              ))}

              {/* Yedekleme sonuçları */}
              {backupResults && (
                <div className="space-y-1">
                  {backupResults.map(r => {
                    const node = nodes.find(n => n.id === r.nodeId);
                    return (
                      <div key={r.nodeId} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-white/5">
                        <span className="text-muted-foreground">{node?.name || r.nodeId}</span>
                        <span className="text-green-400">{r.ok} tablo ✓ {r.fail > 0 && <span className="text-red-400 ml-1">{r.fail} hata</span>}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Eylemler */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleDeepCheck}
                  disabled={checking}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-border text-xs text-muted-foreground hover:text-white transition-all disabled:opacity-50"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                  Bağlantıyı Test Et
                </button>

                <button
                  onClick={handleBackupAll}
                  disabled={backingUp || nodes.filter(n => n.online).length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-xs text-blue-400 transition-all disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 ${backingUp ? 'animate-pulse' : ''}`} />
                  {backingUp ? 'Yedekleniyor...' : 'Tüm Sunuculara Yedekle'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Tek Node satırı ─────────────────────────────────────────────────────────

function NodeRow({
  icon, name, subtitle, online, latencyMs, isActive, isCurrent, lastSeen, badge,
}: {
  icon: React.ReactNode;
  name: string;
  subtitle?: string;
  online: boolean;
  latencyMs?: number;
  isActive: boolean;
  isCurrent: boolean;
  lastSeen?: string;
  badge?: string;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
      isActive
        ? 'bg-green-500/10 border-green-500/30'
        : online
        ? 'bg-white/5 border-border'
        : 'bg-red-500/5 border-red-500/20 opacity-60'
    }`}>
      {/* Status dot */}
      <div className="relative flex-shrink-0">
        <div className={`p-2 rounded-lg ${online ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {icon}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
          online ? 'bg-green-400' : 'bg-red-400'
        }`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{name}</span>
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex-shrink-0">
              {badge}
            </span>
          )}
          {isActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 flex-shrink-0">
              AKTİF
            </span>
          )}
        </div>
        {subtitle && <div className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</div>}
        {lastSeen && (
          <div className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(lastSeen)}</div>
        )}
      </div>

      {/* Latency */}
      <div className="flex-shrink-0 text-right">
        {online ? (
          <div className="flex items-center gap-1 text-xs text-green-400">
            <Wifi className="w-3 h-3" />
            {latencyMs !== undefined && latencyMs > 0 ? `${latencyMs}ms` : 'Çevrimiçi'}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-red-400">
            <WifiOff className="w-3 h-3" />
            Çevrimdışı
          </div>
        )}
      </div>
    </div>
  );
}
