/**
 * Yerel Depo (Local Repository) Yonetim Paneli — v2.0
 * 
 * Saglik izleme, sync gecmisi, yedek yonetimi, veri diff,
 * cakisma cozumleme stratejisi, zamanlanmis yedekleme paneli.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive, Cloud, RefreshCw, CheckCircle,
  Loader2, Copy, ChevronDown, ChevronUp, WifiOff,
  ArrowUpDown, ArrowUp, ArrowDown, Clock, Terminal,
  Server, Database, Shield, Zap, Eye, EyeOff, Save,
  AlertTriangle, Info, History, Archive, Trash2, RotateCcw,
  Activity, GitCompare, Settings2, Monitor, RotateCw,
  Heart, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  getLocalRepoConfig,
  saveLocalRepoConfig,
  getCloudConfig,
  saveCloudConfig,
  resetCloudConfig,
  getSiteStorageStats,
  testLocalConnection,
  testCloudConnection,
  getConnectionStatus,
  syncLocalToCloud,
  syncCloudToLocal,
  syncBidirectional,
  startAutoSync,
  stopAutoSync,
  startAutoBackup,
  stopAutoBackup,
  startHealthHeartbeat,
  stopHealthHeartbeat,
  isLocalHealthy,
  isCloudHealthy,
  getSyncLogs,
  clearSyncLogs,
  computeDataDiff,
  createLocalBackup,
  deleteLocalBackup,
  restoreFromLocalBackup,
  getLocalBackupList,
  LOCAL_SETUP_SQL,
  getDockerSetupSteps,
  type LocalRepoConfig,
  type CloudConfig,
  type ConnectionStatus,
  type SyncResult,
  type SyncLogEntry,
  type BackupSnapshot,
  type DataDiffResult,
} from '../lib/dual-supabase';

type TabId = 'status' | 'config' | 'cloud' | 'sync' | 'backups' | 'diff' | 'setup';

// ─── TierCard — 3 katmanlı depo bileşeni ─────────────────────────────────────
interface TierCardProps {
  tier: 1 | 2 | 3;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  statusText: string;
  healthy: boolean;
  isPrimary?: boolean;
  latency?: number;
  keyCount?: number;
  color: 'emerald' | 'purple' | 'cyan';
}

const TIER_COLORS = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400', dot: 'bg-emerald-400', num: 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300' },
  purple:  { bg: 'bg-purple-500/10',  border: 'border-purple-500/25',  text: 'text-purple-400',  dot: 'bg-purple-400',  num: 'bg-purple-600/20  border-purple-500/30  text-purple-300'  },
  cyan:    { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25',    text: 'text-cyan-400',    dot: 'bg-cyan-400',    num: 'bg-cyan-600/20    border-cyan-500/30    text-cyan-300'    },
};

function TierCard({ tier, label, sublabel, icon, statusText, healthy, isPrimary, latency, keyCount, color }: TierCardProps) {
  const c = TIER_COLORS[color];
  return (
    <div className={`relative p-4 rounded-2xl border ${c.border} ${c.bg} transition-all`}>
      {isPrimary && (
        <span className={`absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-black rounded-full ${c.bg} ${c.text} border ${c.border} uppercase tracking-widest`}>
          Aktif
        </span>
      )}
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-6 h-6 rounded-lg border ${c.num} flex items-center justify-center shrink-0`}>
          <span className="text-[11px] font-black">{tier}</span>
        </div>
        {icon}
        <div className="min-w-0">
          <p className="text-sm font-bold text-white leading-none">{label}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">{sublabel}</p>
        </div>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Durum</span>
          <span className={`flex items-center gap-1.5 font-semibold ${healthy ? c.text : 'text-gray-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthy ? `${c.dot} animate-pulse` : 'bg-gray-600'}`} />
            {statusText}
          </span>
        </div>
        {latency !== undefined && latency > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Gecikme</span>
            <span className="text-white font-mono">{latency}ms</span>
          </div>
        )}
        {keyCount !== undefined && keyCount >= 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Kayıt</span>
            <span className="text-white font-mono">{keyCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ConnectionCard (eski — geriye uyumluluk) ────────────────────────────────
interface ConnectionCardProps {
  label: string;
  icon: React.ReactNode;
  status?: string;
  latency?: number;
  keyCount?: number;
  isPrimary?: boolean;
  color: string;
  healthy: boolean;
}

function ConnectionCard({ label, icon, status, latency, keyCount, isPrimary, color, healthy }: ConnectionCardProps) {
  const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', glow: 'shadow-purple-500/10' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', glow: 'shadow-cyan-500/10' },
  };
  const c = colorMap[color] || colorMap.cyan;

  return (
    <div className={`relative p-4 rounded-2xl border ${c.border} ${c.bg} backdrop-blur-sm transition-all`}>
      {isPrimary && (
        <span className={`absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded-full ${c.bg} ${c.text} border ${c.border}`}>
          PRIMARY
        </span>
      )}
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-sm font-bold text-white">{label}</span>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Durum</span>
          <span className={`flex items-center gap-1.5 font-semibold ${healthy ? 'text-emerald-400' : 'text-red-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {status || (healthy ? 'Bağlı' : 'Bağlantı yok')}
          </span>
        </div>
        {latency !== undefined && latency > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Gecikme</span>
            <span className="text-white font-mono">{latency}ms</span>
          </div>
        )}
        {keyCount !== undefined && keyCount >= 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Kayıt</span>
            <span className="text-white font-mono">{keyCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LocalRepoPanel() {
  const [config, setConfig] = useState<LocalRepoConfig>(getLocalRepoConfig());
  const [connStatus, setConnStatus] = useState<ConnectionStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showServiceKey, setShowServiceKey] = useState(false);
  const [showAnonKey, setShowAnonKey] = useState(false);
  const [editConfig, setEditConfig] = useState({ ...config });
  const [activeTab, setActiveTab] = useState<TabId>('status');

  // Bulut (Online Supabase) yapılandırma durumu
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>(getCloudConfig());
  const [editCloudConfig, setEditCloudConfig] = useState<CloudConfig>(getCloudConfig());
  const [showCloudAnonKey, setShowCloudAnonKey] = useState(false);
  const [showCloudServiceKey, setShowCloudServiceKey] = useState(false);
  const [testingCloud, setTestingCloud] = useState(false);

  // Sync Logs
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);

  // Backups
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);

  // Data Diff
  const [diffResult, setDiffResult] = useState<DataDiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // Setup
  const [showSQL, setShowSQL] = useState(false);

  const steps = getDockerSetupSteps();

  const refreshData = useCallback(() => {
    setSyncLogs(getSyncLogs());
    setBackups(getLocalBackupList());
    setConfig(getLocalRepoConfig());
    const cc = getCloudConfig();
    setCloudConfig(cc);
    setEditCloudConfig(cc);
  }, []);

  const checkConnections = useCallback(async () => {
    setChecking(true);
    try {
      const status = await getConnectionStatus();
      setConnStatus(status);
    } catch (e: any) {
      console.error('Connection check failed:', e);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
    if (config.enabled) {
      checkConnections();
    }
  }, [config.enabled, checkConnections, refreshData]);

  // Refresh logs when tab changes
  useEffect(() => {
    if (activeTab === 'sync') setSyncLogs(getSyncLogs());
    else if (activeTab === 'backups') setBackups(getLocalBackupList());
  }, [activeTab]);

  const handleSaveConfig = () => {
    const updated = saveLocalRepoConfig(editConfig);
    setConfig(updated);
    toast.success('Yerel depo ayarları kaydedildi!');

    // Tüm scheduler'ları güncelle
    stopAutoSync(); stopAutoBackup(); stopHealthHeartbeat();
    if (updated.enabled) {
      if (updated.autoSync) startAutoSync();
      if (updated.autoBackup) startAutoBackup();
      startHealthHeartbeat();
      setTimeout(checkConnections, 500);
    }
  };

  const handleSaveCloudConfig = () => {
    if (!editCloudConfig.url.startsWith('http')) {
      toast.error('Geçersiz URL — http:// veya https:// ile başlamalı');
      return;
    }
    if (!editCloudConfig.anonKey.trim()) {
      toast.error('Anon Key boş olamaz');
      return;
    }
    const updated = saveCloudConfig(editCloudConfig);
    setCloudConfig(updated);
    toast.success('Bulut (CouchDB) ayarları kaydedildi! Bağlantı yeniden kurulacak.');
    setTimeout(checkConnections, 500);
  };

  const handleResetCloudConfig = () => {
    if (!confirm('Bulut ayarlarını varsayılana sıfırlamak istediğinize emin misiniz?')) return;
    resetCloudConfig();
    const cc = getCloudConfig();
    setCloudConfig(cc);
    setEditCloudConfig(cc);
    toast.success('Bulut ayarları varsayılana sıfırlandı');
    setTimeout(checkConnections, 500);
  };

  const handleTestCloudOnly = async () => {
    setTestingCloud(true);
    try {
      const result = await testCloudConnection();
      if (result.ok) {
        toast.success(`Bulut bağlantısı başarılı! ${result.keyCount} kayıt, ${result.latencyMs}ms gecikme`);
      } else {
        toast.error(`Bulut bağlantısı başarısız: ${result.error || 'Bilinmeyen hata'}`);
      }
    } catch (e: any) {
      toast.error(`Test hatası: ${e.message}`);
    } finally {
      setTestingCloud(false);
    }
  };

  const handleToggleEnabled = () => {
    const newEnabled = !editConfig.enabled;
    setEditConfig(p => ({ ...p, enabled: newEnabled }));
    if (!newEnabled) {
      stopAutoSync(); stopAutoBackup(); stopHealthHeartbeat();
    }
  };

  const handleSync = async (direction: 'up' | 'down' | 'bi') => {
    setSyncing(true);
    setSyncResult(null);
    try {
      let result: SyncResult;
      if (direction === 'up') {
        result = await syncLocalToCloud(false);
        toast.success(`${result.keysUploaded} kayıt buluta yüklendi (${result.durationMs}ms)`);
      } else if (direction === 'down') {
        result = await syncCloudToLocal();
        toast.success(`${result.keysDownloaded} kayıt yerele indirildi (${result.durationMs}ms)`);
      } else {
        result = await syncBidirectional();
        toast.success(`Çift yönlü: ↓${result.keysDownloaded} ↑${result.keysUploaded} (${result.conflictsResolved} çakışma, ${result.durationMs}ms)`);
      }
      setSyncResult(result);
      refreshData();
      checkConnections();
    } catch (e: any) {
      toast.error(`Senkronizasyon hatası: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const snapshot = await createLocalBackup('manual');
      if (snapshot) {
        toast.success(`Yerel yedek oluşturuldu: ${snapshot.keysCount} kayıt (${snapshot.sizeKB} KB)`);
        setBackups(getLocalBackupList());
        refreshData();
      } else {
        toast.error('Yedek oluşturulamadı');
      }
    } catch (e: any) {
      toast.error(`Yedek hatası: ${e.message}`);
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (id: string) => {
    if (!confirm('Bu yedeği geri yüklemek istediğinize emin misiniz?\nMevcut veriler üzerine yazılacaktır!')) return;
    setRestoringBackup(id);
    try {
      const result = await restoreFromLocalBackup(id);
      if (result.error) {
        toast.error(`Geri yükleme hatası: ${result.error}`);
      } else {
        toast.success(`Geri yükleme tamamlandı: ${result.ok} başarılı, ${result.fail} başarısız. Sayfa yenileniyor...`);
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (e: any) {
      toast.error(`Geri yükleme hatası: ${e.message}`);
    } finally {
      setRestoringBackup(null);
    }
  };

  const handleDeleteBackup = async (id: string) => {
    if (!confirm('Bu yedeği silmek istediğinize emin misiniz?')) return;
    const ok = await deleteLocalBackup(id);
    if (ok) {
      toast.success('Yedek silindi');
      setBackups(getLocalBackupList());
    } else {
      toast.error('Yedek silinemedi');
    }
  };

  const handleComputeDiff = async () => {
    setDiffLoading(true);
    try {
      const result = await computeDataDiff();
      setDiffResult(result);
    } catch (e: any) {
      toast.error(`Diff hatası: ${e.message}`);
    } finally {
      setDiffLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('Panoya kopyalandı!');
    } catch {
      toast.error('Kopyalama başarısız');
    }
  };

  const inputCls = "w-full bg-black/40 text-white px-4 py-3 rounded-xl border border-white/10 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 text-sm transition-all placeholder-white/20 font-mono";
  const labelCls = "text-gray-400 text-xs font-bold uppercase tracking-widest mb-1.5 block ml-1";

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: 'Durum', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'config', label: 'Yerel Ayarlar', icon: <Settings2 className="w-3.5 h-3.5" /> },
    { id: 'cloud', label: 'Bulut Ayarları', icon: <Cloud className="w-3.5 h-3.5" /> },
    { id: 'sync', label: 'Sync Log', icon: <History className="w-3.5 h-3.5" /> },
    { id: 'backups', label: 'Yedekler', icon: <Archive className="w-3.5 h-3.5" /> },
    { id: 'diff', label: 'Veri Farkı', icon: <GitCompare className="w-3.5 h-3.5" /> },
    { id: 'setup', label: 'Kurulum', icon: <Terminal className="w-3.5 h-3.5" /> },
  ];

  // ═════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Ana Panel */}
      <div className="rounded-3xl bg-[#111] border border-white/5 overflow-hidden">
        {/* Header */}
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center border border-purple-500/20 relative">
              <HardDrive className="w-6 h-6 text-purple-400" />
              {config.enabled && (
                <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#111] ${isLocalHealthy() ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">Çok Katmanlı Veritabanı Yönetimi</h2>
              <p className="text-xs text-gray-500">Site Deposu · PouchDB (Yerel) · CouchDB (Bulut) · Senkronizasyon</p>
            </div>
          </div>

          <button
            onClick={handleToggleEnabled}
            className={`relative w-14 h-7 rounded-full transition-all ${editConfig.enabled ? 'bg-purple-600' : 'bg-white/10'}`}
          >
            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all shadow-lg ${editConfig.enabled ? 'left-7' : 'left-0.5'}`} />
          </button>
        </div>

        {editConfig.enabled && (
          <>
            {/* Tabs */}
            <div className="px-6 sm:px-8 border-t border-white/5">
              <div className="flex overflow-x-auto no-scrollbar -mb-px gap-1 pt-2">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold whitespace-nowrap rounded-t-xl transition-all border-b-2 ${
                      activeTab === tab.id
                        ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6 sm:p-8 border-t border-white/5">
              {/* ─── DURUM ─── */}
              {activeTab === 'status' && (
                <div className="space-y-5">
                  {/* 3 Katmanlı Öncelik Açıklaması */}
                  <div className="bg-black/30 rounded-2xl p-3 border border-white/5 flex items-start gap-2 text-xs text-gray-500">
                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      <span className="text-white font-bold">Öncelik sırası:</span>{' '}
                      <span className="text-emerald-400">1. Site Deposu</span> →{' '}
                      <span className="text-purple-400">2. PouchDB (Yerel)</span> →{' '}
                      <span className="text-cyan-400">3. CouchDB (Bulut)</span>
                      . Veriler önce site deposuna yazılır, arka planda senkronize edilir.
                    </span>
                  </div>

                  {/* 3 Katmanlı Bağlantı Kartları */}
                  <div className="grid grid-cols-1 gap-3">
                    <TierCard
                      tier={1}
                      label="Site Deposu"
                      sublabel="localStorage — Her zaman aktif"
                      icon={<Monitor className="w-4 h-4 text-emerald-400" />}
                      statusText="Aktif"
                      healthy={true}
                      isPrimary={true}
                      keyCount={connStatus?.siteStorageKeyCount ?? getSiteStorageStats().keyCount}
                      color="emerald"
                    />
                    <TierCard
                      tier={2}
                      label="PouchDB (Yerel)"
                      sublabel={config.enabled ? config.url : 'Devre dışı — Ayarlar sekmesinden etkinleştirin'}
                      icon={<HardDrive className="w-4 h-4 text-purple-400" />}
                      statusText={
                        !config.enabled ? 'Devre Dışı' :
                        connStatus?.local === 'connected' ? 'Bağlı' :
                        connStatus?.local === 'checking' ? 'Kontrol...' :
                        connStatus?.local === 'disconnected' ? 'Bağlanamadı' : 'Yapılandırılmamış'
                      }
                      healthy={config.enabled && isLocalHealthy()}
                      isPrimary={connStatus?.primary === 'local'}
                      latency={connStatus?.localLatencyMs}
                      keyCount={connStatus?.localKeyCount}
                      color="purple"
                    />
                    <TierCard
                      tier={3}
                      label="CouchDB (Bulut)"
                      sublabel={cloudConfig.customized ? `${cloudConfig.url} (özel)` : `${cloudConfig.url} (varsayılan)`}
                      icon={<Cloud className="w-4 h-4 text-cyan-400" />}
                      statusText={
                        connStatus?.cloud === 'connected' ? 'Bağlı' :
                        connStatus?.cloud === 'checking' ? 'Kontrol...' : 'Bağlanamadı'
                      }
                      healthy={isCloudHealthy()}
                      isPrimary={connStatus?.primary === 'cloud' && !isLocalHealthy()}
                      latency={connStatus?.cloudLatencyMs}
                      keyCount={connStatus?.cloudKeyCount}
                      color="cyan"
                    />
                  </div>

                  <button
                    onClick={checkConnections}
                    disabled={checking}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all border border-white/10 flex items-center justify-center gap-2 text-sm active:scale-[0.98]"
                  >
                    {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Bağlantıları Test Et
                  </button>

                  {/* Son Sync Bilgileri */}
                  <div className="bg-black/20 rounded-2xl p-4 space-y-2 text-xs border border-white/5">
                    <div className="flex items-center gap-2 text-gray-400 font-bold uppercase tracking-widest mb-2">
                      <Clock className="w-3 h-3" /> Son İşlemler
                    </div>
                    {config.lastConnected && (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Heart className="w-3 h-3 text-emerald-400" /> Son bağlantı: {new Date(config.lastConnected).toLocaleString('tr-TR')}
                      </div>
                    )}
                    {config.lastSyncToCloud && (
                      <div className="flex items-center gap-2 text-cyan-500/70">
                        <ArrowUp className="w-3 h-3" /> Son bulut yükleme: {new Date(config.lastSyncToCloud).toLocaleString('tr-TR')}
                      </div>
                    )}
                    {config.lastSyncFromCloud && (
                      <div className="flex items-center gap-2 text-purple-500/70">
                        <ArrowDown className="w-3 h-3" /> Son bulut indirme: {new Date(config.lastSyncFromCloud).toLocaleString('tr-TR')}
                      </div>
                    )}
                    {config.lastAutoBackup && (
                      <div className="flex items-center gap-2 text-amber-500/70">
                        <Archive className="w-3 h-3" /> Son otomatik yedek: {new Date(config.lastAutoBackup).toLocaleString('tr-TR')}
                      </div>
                    )}
                    {!config.lastConnected && !config.lastSyncToCloud && (
                      <p className="text-gray-600">Henüz işlem yapılmadı</p>
                    )}
                  </div>

                  {/* Sync Butonları */}
                  {connStatus?.local === 'connected' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button onClick={() => handleSync('up')} disabled={syncing} className="py-3 bg-cyan-600/15 hover:bg-cyan-600/25 border border-cyan-500/20 text-cyan-400 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                        Yerel → Bulut
                      </button>
                      <button onClick={() => handleSync('down')} disabled={syncing} className="py-3 bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/20 text-purple-400 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDown className="w-4 h-4" />}
                        Bulut → Yerel
                      </button>
                      <button onClick={() => handleSync('bi')} disabled={syncing} className="py-3 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/20 text-amber-400 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]">
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpDown className="w-4 h-4" />}
                        Çift Yönlü
                      </button>
                    </div>
                  )}

                  {/* Sync Sonucu */}
                  <AnimatePresence>
                    {syncResult && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`p-4 rounded-2xl border text-sm ${
                          syncResult.errors.length === 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-orange-500/10 border-orange-500/20'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold mb-1">
                          {syncResult.errors.length === 0 ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-orange-400" />}
                          <span className={syncResult.errors.length === 0 ? 'text-emerald-400' : 'text-orange-400'}>
                            Sync tamamlandı ({syncResult.durationMs}ms)
                          </span>
                        </div>
                        <div className="text-gray-400 space-y-0.5 text-xs">
                          {syncResult.keysUploaded > 0 && <p>↑ Yüklenen: {syncResult.keysUploaded}</p>}
                          {syncResult.keysDownloaded > 0 && <p>↓ İndirilen: {syncResult.keysDownloaded}</p>}
                          {syncResult.conflictsResolved > 0 && <p>⚡ Çakışma çözülen: {syncResult.conflictsResolved}</p>}
                          {syncResult.errors.map((err, i) => <p key={i} className="text-red-400">Hata: {err}</p>)}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ─── AYARLAR ─── */}
              {activeTab === 'config' && (
                <div className="space-y-5">
                  <div>
                    <label className={labelCls}>PouchDB URL</label>
                    <input type="text" value={editConfig.url} onChange={e => setEditConfig(p => ({ ...p, url: e.target.value }))} placeholder="http://127.0.0.1:54321" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Anon Key (Okuma)</label>
                    <div className="relative">
                      <input type={showAnonKey ? 'text' : 'password'} value={editConfig.anonKey} onChange={e => setEditConfig(p => ({ ...p, anonKey: e.target.value }))} placeholder="eyJhbGciOiJ..." className={`${inputCls} pr-10`} />
                      <button onClick={() => setShowAnonKey(!showAnonKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                        {showAnonKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Service Role Key (Yazma)</label>
                    <div className="relative">
                      <input type={showServiceKey ? 'text' : 'password'} value={editConfig.serviceRoleKey} onChange={e => setEditConfig(p => ({ ...p, serviceRoleKey: e.target.value }))} placeholder="eyJhbGciOiJ..." className={`${inputCls} pr-10`} />
                      <button onClick={() => setShowServiceKey(!showServiceKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                        {showServiceKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={labelCls}>Otomatik Sync</label>
                      <ToggleButton active={editConfig.autoSync} onToggle={() => setEditConfig(p => ({ ...p, autoSync: !p.autoSync }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Sync Aralığı (dk)</label>
                      <input type="number" min={1} max={60} value={editConfig.syncIntervalMin} onChange={e => setEditConfig(p => ({ ...p, syncIntervalMin: parseInt(e.target.value) || 5 }))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Oto. Yedekleme</label>
                      <ToggleButton active={editConfig.autoBackup} onToggle={() => setEditConfig(p => ({ ...p, autoBackup: !p.autoBackup }))} />
                    </div>
                    <div>
                      <label className={labelCls}>Yedek Aralığı (sa)</label>
                      <input type="number" min={1} max={168} value={editConfig.backupIntervalHours} onChange={e => setEditConfig(p => ({ ...p, backupIntervalHours: parseInt(e.target.value) || 24 }))} className={inputCls} />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Çakışma Stratejisi</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'newest_wins' as const, label: 'En Yeni Kazanır', desc: 'Timestamp bazlı' },
                        { id: 'local_wins' as const, label: 'Yerel Kazanır', desc: 'Her zaman yerel' },
                        { id: 'cloud_wins' as const, label: 'Bulut Kazanır', desc: 'Her zaman bulut' },
                      ].map(s => (
                        <button
                          key={s.id}
                          onClick={() => setEditConfig(p => ({ ...p, conflictStrategy: s.id }))}
                          className={`p-3 rounded-xl text-center transition-all border ${
                            editConfig.conflictStrategy === s.id
                              ? 'bg-purple-600/20 border-purple-500/30 text-purple-400'
                              : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          <div className="text-xs font-bold">{s.label}</div>
                          <div className="text-[10px] mt-0.5 opacity-60">{s.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleSaveConfig} className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 active:scale-[0.98]">
                    <Save className="w-5 h-5" /> Yapılandırmayı Kaydet
                  </button>
                </div>
              )}

              {/* ─── BULUT AYARLARI ─── */}
              {activeTab === 'cloud' && (
                <div className="space-y-5">
                  {/* Bilgi kutusu */}
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 flex items-start gap-3">
                    <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-cyan-200/80 space-y-1">
                      <p className="font-bold text-cyan-300">CouchDB Ayarları (3. Öncelik)</p>
                      <p>Bu ayarlar kod dosyasına değil <strong>tarayıcı belleğine</strong> kaydedilir. İstediğiniz zaman değiştirebilirsiniz.</p>
                      {cloudConfig.customized && (
                        <p className="text-amber-300">⚡ Şu an özel ayar kullanılıyor (varsayılan koddan farklı)</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>CouchDB URL</label>
                    <input
                      type="text"
                      value={editCloudConfig.url}
                      onChange={e => setEditCloudConfig(p => ({ ...p, url: e.target.value }))}
                      placeholder="http://localhost:5984"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Anon Key (Herkese açık)</label>
                    <div className="relative">
                      <input
                        type={showCloudAnonKey ? 'text' : 'password'}
                        value={editCloudConfig.anonKey}
                        onChange={e => setEditCloudConfig(p => ({ ...p, anonKey: e.target.value }))}
                        placeholder="eyJhbGciOiJ..."
                        className={`${inputCls} pr-10`}
                      />
                      <button onClick={() => setShowCloudAnonKey(!showCloudAnonKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                        {showCloudAnonKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Service Role Key (İsteğe bağlı — sadece sunucu tarafında)</label>
                    <div className="relative">
                      <input
                        type={showCloudServiceKey ? 'text' : 'password'}
                        value={editCloudConfig.serviceRoleKey}
                        onChange={e => setEditCloudConfig(p => ({ ...p, serviceRoleKey: e.target.value }))}
                        placeholder="eyJhbGciOiJ..."
                        className={`${inputCls} pr-10`}
                      />
                      <button onClick={() => setShowCloudServiceKey(!showCloudServiceKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                        {showCloudServiceKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleTestCloudOnly}
                      disabled={testingCloud}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {testingCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      Bağlantıyı Test Et
                    </button>
                    <button
                      onClick={handleSaveCloudConfig}
                      className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <Save className="w-4 h-4" /> Kaydet
                    </button>
                  </div>

                  {cloudConfig.customized && (
                    <button
                      onClick={handleResetCloudConfig}
                      className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                    >
                      <RotateCw className="w-4 h-4" /> Varsayılan Ayarlara Sıfırla
                    </button>
                  )}

                  {/* Mevcut aktif ayarlar özeti */}
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5 space-y-2 text-xs">
                    <p className="text-gray-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Database className="w-3 h-3" /> Aktif Bulut Yapılandırması
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">URL</span>
                      <span className="text-cyan-400 font-mono truncate max-w-[60%]">{cloudConfig.url}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Anon Key</span>
                      <span className="text-gray-400 font-mono">{cloudConfig.anonKey ? `${cloudConfig.anonKey.slice(0, 12)}...` : 'Girilmedi'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Kaynak</span>
                      <span className={cloudConfig.customized ? 'text-amber-400 font-bold' : 'text-gray-500'}>
                        {cloudConfig.customized ? 'Özel (kullanıcı tarafından ayarlandı)' : 'Varsayılan (kod)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── SYNC LOG ─── */}
              {activeTab === 'sync' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <History className="w-4 h-4" /> Senkronizasyon Geçmişi ({syncLogs.length})
                    </h3>
                    {syncLogs.length > 0 && (
                      <button onClick={() => { clearSyncLogs(); setSyncLogs([]); toast.success('Loglar temizlendi'); }} className="text-xs text-red-400 hover:text-red-300 font-bold">
                        Temizle
                      </button>
                    )}
                  </div>

                  {syncLogs.length === 0 ? (
                    <div className="text-center py-12 text-gray-600">
                      <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="font-bold">Henüz log yok</p>
                      <p className="text-xs mt-1">Senkronizasyon yaptığınızda burada görünecek</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {syncLogs.map(log => (
                        <div key={log.id} className={`p-3 rounded-xl border text-xs ${
                          log.status === 'success' ? 'bg-emerald-500/5 border-emerald-500/15' :
                          log.status === 'partial' ? 'bg-amber-500/5 border-amber-500/15' :
                          'bg-red-500/5 border-red-500/15'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <SyncDirectionBadge direction={log.direction} />
                              <StatusBadge status={log.status} />
                            </div>
                            <span className="text-gray-600 font-mono">{new Date(log.timestamp).toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-gray-500 mt-1">
                            {log.keysUploaded > 0 && <span>↑{log.keysUploaded}</span>}
                            {log.keysDownloaded > 0 && <span>↓{log.keysDownloaded}</span>}
                            {log.conflictsResolved > 0 && <span>⚡{log.conflictsResolved}</span>}
                            {log.durationMs > 0 && <span>{log.durationMs}ms</span>}
                          </div>
                          {log.errors.length > 0 && (
                            <div className="mt-1 text-red-400">
                              {log.errors.map((e, i) => <p key={i}>{e}</p>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─── YEDEKLER ─── */}
              {activeTab === 'backups' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-sm text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Archive className="w-4 h-4" /> Yerel Yedekler ({backups.length})
                    </h3>
                    <button
                      onClick={handleCreateBackup}
                      disabled={creatingBackup}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                    >
                      {creatingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                      {creatingBackup ? 'Oluşturuluyor...' : 'Yeni Yedek Al'}
                    </button>
                  </div>

                  <div className="bg-black/20 rounded-2xl border border-white/5 p-4 flex items-start gap-3">
                    <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-500">
                      Yedekler yerel PouchDB / Docker'da <code className="text-purple-400">backup_*</code> key'leri altında saklanır.
                      Hem yerel hem bulut verileri tek bir snapshot'a birleştirilir. Otomatik yedekleme 
                      {config.autoBackup ? ` ${config.backupIntervalHours} saat arayla aktif.` : ' kapalı.'}
                    </p>
                  </div>

                  {backups.length === 0 ? (
                    <div className="text-center py-12 text-gray-600">
                      <Archive className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="font-bold">Henüz yedek yok</p>
                      <p className="text-xs mt-1">"Yeni Yedek Al" ile ilk yedeğinizi oluşturun</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {backups.map(b => (
                        <div key={b.id} className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                b.type === 'auto' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }`}>
                                {b.type === 'auto' ? 'OTOMATİK' : 'MANUEL'}
                              </span>
                              <span className="text-gray-500 text-xs font-mono">{new Date(b.timestamp).toLocaleString('tr-TR')}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-600">
                              <span><Database className="w-3 h-3 inline" /> {b.keysCount} kayıt</span>
                              <span><HardDrive className="w-3 h-3 inline" /> {b.sizeKB} KB</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRestoreBackup(b.id)}
                              disabled={restoringBackup === b.id}
                              className="px-3 py-1.5 bg-purple-600/20 border border-purple-500/20 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-600/30 transition-all disabled:opacity-50"
                            >
                              {restoringBackup === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3 inline mr-1" />}
                              Geri Yükle
                            </button>
                            <button
                              onClick={() => handleDeleteBackup(b.id)}
                              className="p-1.5 bg-red-600/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-600/20 transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─── VERİ FARKI ─── */}
              {activeTab === 'diff' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-sm text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <GitCompare className="w-4 h-4" /> Yerel ↔ Bulut Veri Karşılaştırma
                    </h3>
                    <button
                      onClick={handleComputeDiff}
                      disabled={diffLoading}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {diffLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                      Analiz Et
                    </button>
                  </div>

                  {diffResult ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <DiffStatCard label="Sadece Yerel" count={diffResult.onlyLocal.length} color="purple" />
                        <DiffStatCard label="Sadece Bulut" count={diffResult.onlyCloud.length} color="cyan" />
                        <DiffStatCard label="Aynı" count={diffResult.bothSame.length} color="emerald" />
                        <DiffStatCard label="Farklı" count={diffResult.bothDifferent.length} color="amber" />
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-purple-500/5 border border-purple-500/15 rounded-xl p-3">
                          <p className="font-bold text-purple-400 mb-1">Yerel ({diffResult.totalLocal})</p>
                          <p className="text-gray-500">{diffResult.onlyLocal.length} benzersiz key</p>
                        </div>
                        <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-xl p-3">
                          <p className="font-bold text-cyan-400 mb-1">Bulut ({diffResult.totalCloud})</p>
                          <p className="text-gray-500">{diffResult.onlyCloud.length} benzersiz key</p>
                        </div>
                      </div>

                      {diffResult.bothDifferent.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3">
                          <p className="font-bold text-amber-400 text-xs mb-2">Çakışan Kayıtlar ({diffResult.bothDifferent.length})</p>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {diffResult.bothDifferent.slice(0, 20).map(key => (
                              <p key={key} className="text-[10px] text-gray-500 font-mono truncate">{key}</p>
                            ))}
                            {diffResult.bothDifferent.length > 20 && (
                              <p className="text-[10px] text-amber-400 font-bold">...ve {diffResult.bothDifferent.length - 20} tane daha</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-600">
                      <GitCompare className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="font-bold">Karşılaştırma yapılmadı</p>
                      <p className="text-xs mt-1">"Analiz Et" ile yerel ve bulut verilerini karşılaştırın</p>
                    </div>
                  )}
                </div>
              )}

              {/* ─── KURULUM ─── */}
              {activeTab === 'setup' && (
                <div className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
                    <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-200">
                      <p className="font-bold mb-1">Docker Desktop yüklü olmalıdır!</p>
                      <p className="text-amber-300/70">
                        <a href="https://docker.com/products/docker-desktop" target="_blank" rel="noopener noreferrer" className="underline">docker.com</a> adresinden indirin.
                      </p>
                    </div>
                  </div>

                  {steps.map(step => (
                    <div key={step.step} className="bg-black/20 rounded-2xl p-4 border border-white/5">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                          <span className="text-purple-400 font-black text-sm">{step.step}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-white text-sm">{step.title}</h3>
                          <p className="text-gray-500 text-xs mt-0.5">{step.description}</p>
                          {step.command && (
                            <div className="mt-2 relative group">
                              <code className="block bg-black/60 text-green-400 text-xs p-3 rounded-xl font-mono border border-white/5 overflow-x-auto">{step.command}</code>
                              <button onClick={() => copyToClipboard(step.command!)} className="absolute top-2 right-2 p-1.5 bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20">
                                <Copy className="w-3 h-3 text-gray-400" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* SQL */}
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <button onClick={() => setShowSQL(!showSQL)} className="w-full flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                          <Database className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-bold text-white text-sm">KV Store Tablo SQL'i</h3>
                          <p className="text-gray-500 text-xs">Yerel Studio SQL Editor'de çalıştırılacak</p>
                        </div>
                      </div>
                      {showSQL ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </button>
                    {showSQL && (
                      <div className="mt-3 relative group">
                        <pre className="bg-black/60 text-green-400 text-xs p-4 rounded-xl font-mono border border-white/5 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">{LOCAL_SETUP_SQL}</pre>
                        <button onClick={() => copyToClipboard(LOCAL_SETUP_SQL)} className="absolute top-2 right-2 px-3 py-1.5 bg-emerald-600/80 rounded-lg text-white text-xs font-bold hover:bg-emerald-500 transition-all flex items-center gap-1">
                          <Copy className="w-3 h-3" /> Kopyala
                        </button>
                      </div>
                    )}
                  </div>

                  {/* docker status örneği */}
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <Server className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-bold text-purple-300 mb-2">docker status çıktısı örneği:</p>
                        <code className="block bg-black/40 text-gray-300 text-xs p-3 rounded-xl font-mono space-y-1 border border-white/5">
                          <div><span className="text-gray-500">API URL:</span> <span className="text-cyan-400">http://127.0.0.1:54321</span></div>
                          <div><span className="text-gray-500">anon key:</span> <span className="text-green-400">eyJhbGci...</span></div>
                          <div><span className="text-gray-500">service_role key:</span> <span className="text-amber-400">eyJhbGci...</span></div>
                          <div><span className="text-gray-500">Studio URL:</span> <span className="text-pink-400">http://127.0.0.1:54323</span></div>
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Devre Dışı Durumu */}
        {!editConfig.enabled && (
          <div className="p-6 sm:p-8 border-t border-white/5 space-y-4">
            {/* Site deposu her zaman aktif */}
            <div className="bg-emerald-500/5 rounded-2xl border border-emerald-500/15 p-4 flex items-start gap-3">
              <Monitor className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-300 text-sm">1. Öncelik: Site Deposu Aktif</p>
                <p className="text-gray-500 text-xs mt-0.5">Tüm veriler tarayıcı belleğine (localStorage) kaydedilmeye devam ediyor.</p>
              </div>
            </div>
            <div className="bg-black/20 rounded-2xl border border-white/5 p-5 text-center">
              <HardDrive className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-bold mb-1">2. Öncelik: PouchDB (Yerel) — Devre Dışı</p>
              <p className="text-gray-600 text-sm max-w-md mx-auto">
                Yukarıdaki anahtarı açarak Docker'da çalışan kendi PouchDB/CouchDB'nizi ikincil depo olarak kullanabilirsiniz.
              </p>
            </div>
            <div className="bg-cyan-500/5 rounded-2xl border border-cyan-500/15 p-4 flex items-start gap-3">
              <Cloud className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-cyan-300 text-sm">3. Öncelik: CouchDB (Bulut)</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {cloudConfig.customized ? 'Özel URL kullanılıyor.' : 'Varsayılan URL kullanılıyor.'}{' '}
                  <button onClick={() => { setEditConfig(p => ({ ...p, enabled: true })); }} className="text-cyan-400 underline">
                    Bulut Ayarları
                  </button> sekmesinden değiştirebilirsiniz.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Sub Components
// ═════════════════════════════════════════════════════════════

function ToggleButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-12 h-6 rounded-full transition-all ${active ? 'bg-purple-600' : 'bg-white/10'}`}
    >
      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-md ${active ? 'left-6' : 'left-0.5'}`} />
    </button>
  );
}

function SyncDirectionBadge({ direction }: { direction: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    local_to_cloud: { label: '↑ Yerel→Bulut', cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
    cloud_to_local: { label: '↓ Bulut→Yerel', cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    bidirectional: { label: '↕ Çift Yönlü', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    backup: { label: '📦 Yedek', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    restore: { label: '♻ Geri Yükleme', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    health_check: { label: '💓 Sağlık', cls: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  };
  const entry = map[direction] || { label: direction, cls: 'bg-white/5 text-gray-400 border-white/10' };
  return (
    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    success: { label: 'Başarılı', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    partial: { label: 'Kısmi', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    failed: { label: 'Başarısız', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  };
  const entry = map[status] || { label: status, cls: 'bg-white/5 text-gray-400 border-white/10' };
  return (
    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

function DiffStatCard({ label, count, color }: { label: string; count: number; color: string }) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  };
  const c = colorMap[color] || colorMap.purple;
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-3 text-center`}>
      <p className={`text-2xl font-black ${c.text}`}>{count}</p>
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  );
}