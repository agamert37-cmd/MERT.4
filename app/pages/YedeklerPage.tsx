import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Database, Download, RefreshCw, Settings, Lock, Wifi, Clock, Trash2,
  Shield, Activity, Server, BarChart3, Eye, EyeOff, LogOut, AlertTriangle, CheckCircle2,
  X, FileUp, UploadCloud,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import {
  startSync, stopSync, startAllSync, stopAllSync, testCouchDbConnection,
  getAllDbStats, restartAllSync, type TableSyncState, type DbStats,
} from '../lib/pouchdb';
import { getCouchDbConfig, setCouchDbConfig, TABLE_NAMES, type CouchDbConfig } from '../lib/db-config';
import {
  createPouchBackup, downloadBackup, restorePouchBackup, restoreSelectedTables,
  getBackupMetaList, saveBackupMeta, deleteBackupMeta, getAutoBackupConfig,
  saveAutoBackupConfig, startAutoBackupScheduler, stopAutoBackupScheduler,
  type BackupMeta, type AutoBackupConfig,
} from '../lib/pouchdb-backup';
import { runIntegrityCheck, getCachedIntegrityReport, type IntegrityReport } from '../lib/db-integrity';
import { getActiveSessions, forceLogoutSession, getDeviceHistory, getSecurityThreats,
  clearResolvedThreats, calculateSecurityScore, resolveSecurityThreat,
  type ActiveSession, type SecurityScore } from '../utils/security';
import { walClear, getWALCount } from '../lib/active-client';
import { CURRENT_VERSION } from '../utils/updateNotes';
import { StorageKey } from '../utils/storage';
import { SYSTEM_TABLES } from '../lib/auto-setup';

type ActiveTab = 'overview' | 'sync' | 'backup' | 'security' | 'system';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}s`;
  return `${Math.floor(h / 24)}g`;
}

export function YedeklerPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [dbStats, setDbStats] = useState<DbStats[]>([]);
  const [syncStatuses, setSyncStatuses] = useState<Map<string, TableSyncState>>(new Map());
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(getCachedIntegrityReport());
  const [couchConfig, setCouchConfig] = useState<CouchDbConfig>(getCouchDbConfig());
  const [autoBackupCfg, setAutoBackupCfg] = useState<AutoBackupConfig>(getAutoBackupConfig());
  const [backupList, setBackupList] = useState<BackupMeta[]>(getBackupMetaList());
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [threats, setThreats] = useState<any[]>([]);
  const [securityScore, setSecurityScore] = useState<SecurityScore | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreFileContent, setRestoreFileContent] = useState<any>(null);

  useEffect(() => {
    refreshStats();
    const handleSync = (e: Event) => {
      const state = (e as CustomEvent).detail as TableSyncState;
      setSyncStatuses(prev => new Map(prev).set(state.tableName, state));
    };
    window.addEventListener('pouchdb_sync_status', handleSync);
    return () => window.removeEventListener('pouchdb_sync_status', handleSync);
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const stats = await getAllDbStats();
      setDbStats(stats);
      setSessions(getActiveSessions());
      setThreats(getSecurityThreats());
      setSecurityScore(calculateSecurityScore());
      setBackupList(getBackupMetaList());
    } catch (e) { console.error('[YedeklerPage] Refresh:', e); }
  }, []);

  const handleRestoreFromFile = useCallback(async () => {
    if (!restoreFileContent) return;
    setLoading(true);
    try {
      await restorePouchBackup(restoreFileContent);
      toast.success('Geri yükleme tamamlandı', { duration: 3000 });
      setIsFileModalOpen(false);
      await refreshStats();
    } catch (e: any) {
      toast.error(`Hata: ${e.message}`, { duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [restoreFileContent, refreshStats]);

  const handleIntegrityCheck = useCallback(async () => {
    setLoading(true);
    try {
      const report = await runIntegrityCheck();
      setIntegrityReport(report);
      toast.success(`İntegrallık: ${report.score}%`, { duration: 3000 });
    } catch (e: any) {
      toast.error(`Hata: ${e.message}`, { duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, []);

  const TabOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <Database className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">CouchDB</h3>
          </div>
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const result = await testCouchDbConnection();
                toast.success(result.ok ? `CouchDB ${result.version} bağlı` : `Hata: ${result.error}`, { duration: 3000 });
              } finally { setLoading(false); }
            }}
            disabled={loading}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold rounded-lg"
          >
            Test Et
          </button>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-white">İntegrallık</h3>
          </div>
          <button onClick={handleIntegrityCheck} disabled={loading} className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-bold rounded-lg">
            Kontrol Et
          </button>
          {integrityReport && <p className="text-xs text-gray-400 mt-2">Skor: {integrityReport.score}%</p>}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-4">Tablo Durumu</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SYSTEM_TABLES.map(t => {
            const stat = dbStats.find(s => s.tableName === t.table);
            return (
              <div key={t.table} className="bg-white/[0.03] border border-white/5 rounded-lg p-2">
                <p className="text-xs font-semibold text-white truncate">{t.icon} {t.displayName}</p>
                <p className="text-xs text-gray-500">{stat?.docCount ?? 0}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => { restartAllSync(); toast.info('Başlatıldı', { duration: 2000 }); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg">
          <RefreshCw className="w-4 h-4" /> Sync Başlat
        </button>
      </div>
    </div>
  );

  const TabSync = () => (
    <div className="space-y-6">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-4">CouchDB Yapılandırması</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-400">URL</label>
            <input type="text" value={couchConfig.url} onChange={e => setCouchConfig(prev => ({ ...prev, url: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-400">Kullanıcı</label>
              <input type="text" value={couchConfig.user} onChange={e => setCouchConfig(prev => ({ ...prev, user: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400">Şifre</label>
              <div className="relative mt-1">
                <input type={showPassword ? 'text' : 'password'} value={couchConfig.password} onChange={e => setCouchConfig(prev => ({ ...prev, password: e.target.value }))} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <button onClick={() => { setCouchDbConfig(couchConfig); toast.success('Kaydedildi', { duration: 2000 }); restartAllSync(); }} className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg">
            Kaydet & Bağlan
          </button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-4">Tablo Senkronizasyonu</h3>
        <div className="space-y-2">
          {TABLE_NAMES.slice(0, 8).map(t => {
            const state = syncStatuses.get(t);
            const isRunning = state?.status === 'active';
            return (
              <div key={t} className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                <span className="text-sm text-gray-300">{t}</span>
                <button onClick={() => isRunning ? stopSync(t) : startSync(t)} className={`px-3 py-1 text-xs font-bold rounded-md ${isRunning ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {isRunning ? '✓' : '●'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Çevrimdışı Kuyruk
        </h3>
        <p className="text-sm text-gray-400 mb-3">{getWALCount()} bekleyen</p>
        <button onClick={() => { walClear(); toast.info('Temizlendi', { duration: 2000 }); }} className="w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold rounded-lg">
          Temizle
        </button>
      </div>
    </div>
  );

  const TabBackup = () => (
    <div className="space-y-6">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-4">Yedek Oluştur</h3>
        <button onClick={async () => { setLoading(true); try { const result = await createPouchBackup(); if (result.ok && result.backup) downloadBackup(result.backup, `mert_${new Date().toISOString().split('T')[0]}.json`); toast.success('Yedeklendi', { duration: 3000 }); } finally { setLoading(false); } }} disabled={loading} className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-lg flex items-center justify-center gap-2">
          <Download className="w-4 h-4" /> Yedek Al
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-4">Kaydedilmiş Yedekler</h3>
        {backupList.length === 0 ? (
          <p className="text-sm text-gray-500">Henüz yedek yok</p>
        ) : (
          <div className="space-y-2">
            {backupList.map(meta => (
              <div key={meta.id} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{new Date(meta.timestamp).toLocaleDateString('tr-TR')}</p>
                  <p className="text-xs text-gray-500">{Object.keys(meta.tableStats).length} tablo</p>
                </div>
                <button onClick={() => { deleteBackupMeta(meta.id); setBackupList(getBackupMetaList()); toast.success('Silindi', { duration: 2000 }); }} className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-4">Otomatik Yedek</h3>
        <label className="flex items-center gap-3 cursor-pointer mb-3">
          <input type="checkbox" checked={autoBackupCfg.enabled} onChange={e => { const cfg = { ...autoBackupCfg, enabled: e.target.checked }; setAutoBackupCfg(cfg); saveAutoBackupConfig(cfg); if (e.target.checked) startAutoBackupScheduler(); else stopAutoBackupScheduler(); }} className="w-4 h-4" />
          <span className="text-sm text-white">Otomatik yedekleri etkinleştir</span>
        </label>
        {autoBackupCfg.enabled && (
          <div>
            <label className="text-xs font-semibold text-gray-400">Interval</label>
            <select value={autoBackupCfg.intervalHours} onChange={e => { const cfg = { ...autoBackupCfg, intervalHours: parseInt(e.target.value) }; setAutoBackupCfg(cfg); saveAutoBackupConfig(cfg); }} className="w-full mt-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm">
              <option value={1}>1 saat</option>
              <option value={6}>6 saat</option>
              <option value={24}>24 saat</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );

  const TabSecurity = () => (
    <div className="space-y-6">
      {securityScore && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
          <h3 className="font-semibold text-white mb-4">Güvenlik Puanı</h3>
          <div className="text-4xl font-bold text-blue-400 mb-2">{securityScore.overall}</div>
          <p className="text-sm text-gray-400">Grade: {securityScore.grade}</p>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-4">Aktif Oturumlar</h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500">Oturum yok</p>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{s.userName}</p>
                  <p className="text-xs text-gray-500">{timeAgo(s.loginTime)} önce</p>
                </div>
                {!s.isCurrentSession && (
                  <button onClick={() => { forceLogoutSession(s.id); setSessions(prev => prev.filter(x => x.id !== s.id)); }} className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg">
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {threats.filter(t => !t.resolved).length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Tehditler
          </h3>
          <div className="space-y-2">
            {threats.filter(t => !t.resolved).map(t => (
              <div key={t.id} className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm font-semibold text-red-400 mb-1">{t.title}</p>
                <p className="text-xs text-gray-400">{t.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const TabSystem = () => {
    const [storageUsage] = useState(() => {
      const usage: Record<string, number> = {};
      Object.values(StorageKey).forEach(k => {
        usage[k] = (localStorage.getItem(k) || '').length;
      });
      return usage;
    });
    const totalStorage = Object.values(storageUsage).reduce((a, b) => a + b, 0);

    return (
      <div className="space-y-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="font-semibold text-white mb-4">Sistem Bilgisi</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Versiyon:</span> <span className="text-white font-semibold">{CURRENT_VERSION}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">WAL:</span> <span className="text-white font-semibold">{getWALCount()}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Toplam Kayıt:</span> <span className="text-white font-semibold">{dbStats.reduce((s, d) => s + d.docCount, 0)}</span></div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="font-semibold text-white mb-4">localStorage</h3>
          <div className="mb-4 h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${Math.min((totalStorage / 10485760) * 100, 100)}%` }} />
          </div>
          <p className="text-xs text-gray-500">{formatBytes(totalStorage)} / ~10MB</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="font-semibold text-white mb-4">Temizlik</h3>
          <div className="space-y-2">
            <button onClick={() => { walClear(); toast.success('WAL temizlendi', { duration: 2000 }); }} className="w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold rounded-lg text-sm">
              WAL Temizle
            </button>
            <button onClick={() => { clearResolvedThreats(); toast.success('Temizlendi', { duration: 2000 }); }} className="w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold rounded-lg text-sm">
              Tehditleri Temizle
            </button>
          </div>
        </div>
      </div>
    );
  };

  const tabs = [
    { key: 'overview' as const, label: '📊 Genel' },
    { key: 'sync' as const, label: '🔄 Sync' },
    { key: 'backup' as const, label: '💾 Yedek' },
    { key: 'security' as const, label: '🔐 Güvenlik' },
    { key: 'system' as const, label: '⚙️ Sistem' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">💾 Yedekler & Senkronizasyon</h1>
          <p className="text-gray-400">PouchDB + CouchDB veri yönetimi</p>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'overview' && <TabOverview />}
            {activeTab === 'sync' && <TabSync />}
            {activeTab === 'backup' && <TabBackup />}
            {activeTab === 'security' && <TabSecurity />}
            {activeTab === 'system' && <TabSystem />}
          </motion.div>
        </AnimatePresence>
      </div>
      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODAL: Dosyadan Geri Yükle                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Dialog.Root open={isFileModalOpen} onOpenChange={setIsFileModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-lg z-50 card-premium rounded-2xl p-4 sm:p-5 border border-border/30 overflow-y-auto overscroll-contain" style={{maxHeight:'calc(100dvh - 1rem)'}} aria-describedby={undefined}>
            <Dialog.Title className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <FileUp className="w-5 h-5 text-amber-400" /> Dosyadan Geri Yükle
            </Dialog.Title>
            <div className="space-y-3">
              <div className="bg-secondary/30 rounded-xl p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground/60">Dosya:</span><span className="text-white font-medium">{restoreFileName}</span></div>
                {restoreFileContent && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground/60">Uygulama:</span><span className="text-white">{restoreFileContent.appName || 'Bilinmiyor'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground/60">Tarih:</span><span className="text-white">{restoreFileContent.createdAt ? new Date(restoreFileContent.createdAt).toLocaleString('tr-TR') : '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground/60">Kayıt:</span><span className="text-white">{restoreFileContent.meta?.totalDocs ?? Object.values(restoreFileContent.tables || {}).reduce((s: number, a: any) => s + (a?.length ?? 0), 0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground/60">Kayıt:</span><span className="text-white">{restoreFileContent.meta?.totalDocs ?? Object.keys(restoreFileContent.tables || {}).length}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground/60">Kayıt:</span><span className="text-white">{restoreFileContent.meta?.totalDocs || Object.keys(restoreFileContent.tables || {}).length}</span></div>
                  </>
                )}
              </div>
              <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-red-400/80">Mevcut veriler üzerine yazılacak. Bu işlem geri alınamaz!</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsFileModalOpen(false)} className="flex-1 py-3 bg-secondary/50 hover:bg-secondary/70 text-muted-foreground font-medium rounded-xl text-sm transition-all">İptal</button>
                <button onClick={handleRestoreFromFile} className="flex-1 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                  <UploadCloud className="w-4 h-4" /> Geri Yükle
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
