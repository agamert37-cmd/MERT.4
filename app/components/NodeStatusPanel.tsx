// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
/**
 * NodeStatusPanel — Sunucu Durumu & Failover Paneli
 *
 * Kayıtlı tüm node'ları (masaüstü, laptop, cloud) listeler.
 * Hangisinin online olduğunu gösterir.
 * Aktif failover durumunu bildirir.
 * İki PC de açıksa her ikisine de yedek alır.
 * Bootstrap: Yeni node'a cloud verisi yükler.
 * WAL: Bekleyen offline yazma sayısını gösterir.
 * Auto-sync: Periyodik cloud→node yedekleme.
 * Node→Cloud: Failover sonrası yerel veriden cloud'u güncelle.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Monitor, Laptop, Cloud, Wifi, WifiOff, RefreshCcw,
  AlertTriangle, ArrowRightLeft, HardDrive,
  Activity, Zap, X, ChevronDown, ChevronUp, Shield,
  Download, Upload, Clock, ToggleLeft, ToggleRight, Database
} from 'lucide-react';
import { toast } from 'sonner';
import {
  discoverNodes, checkAllNodes, checkCloudHealth,
  getFailoverState, setFailoverState, backupToAllNodes,
  getLocalNodeId, type NodeInfo, type FailoverState
} from '../lib/node-registry';
import {
  bootstrapNode, syncNodeToCloud,
  setActiveLocalNode,
  getWALCount, walClear,
  getAutoSyncConfig, saveAutoSyncConfig, startAutoNodeSync,
} from '../lib/active-client';

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
  const [walCount, setWalCount] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      const [discovered, cloudOk] = await Promise.all([
        discoverNodes(),
        checkCloudHealth(),
      ]);
      setNodes(discovered);
      setCloudOnline(cloudOk);
      setFailover(getFailoverState());
      setWalCount(getWALCount());
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
        {walCount > 0 && (
          <span className="ml-1 px-1 rounded bg-orange-500/20 text-orange-300">{walCount} WAL</span>
        )}
      </div>
    );
  }

  if (!cloudOnline) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
        <WifiOff className="w-3 h-3" />
        <span>Cloud Offline</span>
        {walCount > 0 && (
          <span className="ml-1 px-1 rounded bg-red-500/20 text-red-300">{walCount} WAL</span>
        )}
      </div>
    );
  }

  if (walCount > 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-400">
        <Database className="w-3 h-3" />
        <span>{walCount} WAL</span>
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
  const [walCount, setWalCount] = useState(getWALCount());
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => getAutoSyncConfig().enabled);
  const [bootstrappingNodeId, setBootstrappingNodeId] = useState<string | null>(null);
  const [bootstrapProgress, setBootstrapProgress] = useState(0);
  const [syncingNodeId, setSyncingNodeId] = useState<string | null>(null);
  const localNodeId = getLocalNodeId();

  // WAL sayısını periyodik güncelle
  useEffect(() => {
    const tick = () => setWalCount(getWALCount());
    tick();
    const interval = setInterval(tick, 5_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync toggle
  const handleAutoSyncToggle = useCallback(() => {
    const cfg = getAutoSyncConfig();
    const newEnabled = !cfg.enabled;
    saveAutoSyncConfig({ ...cfg, enabled: newEnabled });
    setAutoSyncEnabled(newEnabled);
    if (newEnabled) {
      startAutoNodeSync(null as any);
      toast.success(`Otomatik senkron aktif — her ${cfg.intervalHours}s`);
    } else {
      toast.info('Otomatik senkron devre dışı');
    }
  }, []);

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
          // Dual-write aktif node'u güncelle
          setActiveLocalNode(bestNode);
          toast.warning(`⚡ Failover: ${bestNode.name} (${bestNode.platform}) aktif`, { duration: 5000 });
        }
      } else if (cloudOk && currentFailover) {
        // Cloud geri geldi — failover'ı kapat
        setFailoverState(null);
        setFailoverLocal(null);
        setActiveLocalNode(null);
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

  const handleBootstrapNode = async (node: NodeInfo) => {
    if (!node.localUrl || !node.anonKey) {
      toast.error('Node URL veya anonKey eksik');
      return;
    }
    setBootstrappingNodeId(node.id);
    setBootstrapProgress(0);
    toast.info(`${node.name} bootstrap başlıyor — ${REAL_TABLES.length} tablo yükleniyor...`);
    try {
      const result = await bootstrapNode(node, null as any, (pct, tableName) => {
        setBootstrapProgress(pct);
        if (pct % 20 === 0 && pct > 0) {
          console.log(`[Bootstrap] %${pct} — ${tableName}`);
        }
      });
      toast.success(
        `Bootstrap tamamlandı: ${result.ok}/${REAL_TABLES.length} tablo, ${result.totalRows} kayıt (${(result.durationMs / 1000).toFixed(1)}s)`
      );
    } catch (e: any) {
      toast.error(`Bootstrap hatası: ${e.message}`);
    } finally {
      setBootstrappingNodeId(null);
      setBootstrapProgress(0);
    }
  };

  const handleSyncNodeToCloud = async (node: NodeInfo) => {
    if (!node.localUrl || !node.anonKey) {
      toast.error('Node URL veya anonKey eksik');
      return;
    }
    setSyncingNodeId(node.id);
    toast.info(`${node.name} → Cloud senkronizasyon başlıyor...`);
    try {
      const result = await syncNodeToCloud(node, null as any, (pct) => {
        if (pct % 25 === 0) console.log(`[NodeToCloud] %${pct}`);
      });
      toast.success(`Node→Cloud tamamlandı: ${result.ok} tablo, ${result.totalRows} kayıt`);
    } catch (e: any) {
      toast.error(`Node→Cloud hatası: ${e.message}`);
    } finally {
      setSyncingNodeId(null);
    }
  };

  const handleClearFailover = () => {
    setFailoverState(null);
    setFailoverLocal(null);
    setActiveLocalNode(null);
    toast.info('Failover temizlendi — cloud bağlantısı deneniyor');
    refresh(true);
  };

  const handleClearWAL = () => {
    walClear();
    setWalCount(0);
    toast.info('WAL temizlendi');
  };

  const onlineCount = nodes.filter(n => n.online).length;
  const totalActive = (cloud.online ? 1 : 0) + onlineCount;
  const autoSyncCfg = getAutoSyncConfig();

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
              {walCount > 0 ? ` · ${walCount} WAL bekliyor` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {failover && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
              FAILOVER
            </span>
          )}
          {walCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              {walCount} WAL
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

              {/* WAL uyarısı */}
              {walCount > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <Database className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-yellow-300">
                      {walCount} bekleyen yazma (WAL)
                    </div>
                    <div className="text-xs text-yellow-400/70 mt-0.5">
                      Cloud bağlandığında otomatik gönderilecek
                    </div>
                  </div>
                  <button
                    onClick={handleClearWAL}
                    className="p-1 rounded-lg hover:bg-yellow-500/20 text-yellow-400 transition-colors"
                    title="WAL'ı temizle (yazmaları iptal et)"
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
                <div key={node.id} className="space-y-1.5">
                  <NodeRow
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

                  {/* Bootstrap ilerleme */}
                  {bootstrappingNodeId === node.id && (
                    <div className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-center justify-between text-xs text-blue-400 mb-1.5">
                        <span>Bootstrap: %{bootstrapProgress}</span>
                        <span className="text-blue-400/60">lütfen bekleyin...</span>
                      </div>
                      <div className="w-full bg-blue-500/20 rounded-full h-1.5">
                        <div
                          className="bg-blue-400 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${bootstrapProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Node aksiyonları */}
                  {node.localUrl && node.anonKey && (
                    <div className="flex gap-1.5 pl-1">
                      <button
                        onClick={() => handleBootstrapNode(node)}
                        disabled={bootstrappingNodeId === node.id || syncingNodeId === node.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-xs text-indigo-400 transition-all disabled:opacity-50"
                        title="Cloud → Node: Tüm veriyi bu node'a yükle"
                      >
                        <Download className="w-3 h-3" />
                        {bootstrappingNodeId === node.id ? 'Yükleniyor...' : 'Cloud → Buraya'}
                      </button>

                      <button
                        onClick={() => handleSyncNodeToCloud(node)}
                        disabled={syncingNodeId === node.id || bootstrappingNodeId === node.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-xs text-purple-400 transition-all disabled:opacity-50"
                        title="Node → Cloud: Yerel veriyi cloud'a geri yükle"
                      >
                        <Upload className="w-3 h-3" />
                        {syncingNodeId === node.id ? 'Senkronize ediliyor...' : 'Buradan → Cloud'}
                      </button>
                    </div>
                  )}
                </div>
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

              {/* Otomatik senkron ayarı */}
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 border border-border">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs font-medium">Otomatik Senkron</div>
                    <div className="text-[10px] text-muted-foreground">
                      {autoSyncEnabled
                        ? `Her ${autoSyncCfg.intervalHours}s cloud → node yedekler`
                        : 'Devre dışı'}
                      {autoSyncCfg.lastSync ? ` · Son: ${timeAgo(autoSyncCfg.lastSync)}` : ''}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleAutoSyncToggle}
                  className="text-muted-foreground hover:text-white transition-colors"
                  title={autoSyncEnabled ? 'Devre dışı bırak' : 'Aktif et'}
                >
                  {autoSyncEnabled
                    ? <ToggleRight className="w-6 h-6 text-green-400" />
                    : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>

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
