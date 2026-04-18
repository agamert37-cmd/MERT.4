// [2026-03-26] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Database, Download, UploadCloud, Clock, HardDrive,
  AlertTriangle, CheckCircle, RefreshCw, Search, FileText,
  Table, FileUp, Trash2, FolderOpen, CloudDownload,
  Loader2, CheckCircle2, Cloud, ShieldCheck, Activity,
  Server, RotateCcw, X,
  Timer, Wifi, WifiOff, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import { generateDetailedExcelBackup, generatePDFBackup } from '../utils/exportGenerator';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import {
  createPouchBackup, downloadBackup, restorePouchBackup,
  restoreSelectedTables, getBackupMetaListAsync, saveBackupMeta,
  deleteBackupMeta, getBackupSystemStats, startAutoBackupScheduler,
  stopAutoBackupScheduler, getAutoBackupConfig, saveAutoBackupConfig,
  type BackupMeta, type PouchBackupData,
} from '../lib/pouchdb-backup';
import {
  initializeCouchDbDatabases, seedPouchDbFromLocalStorage,
  getCouchDbTableStatus, type CouchDbTableStatus,
} from '../lib/pouchdb';

const STORAGE_PREFIX = 'isleyen_et_';

type ActiveTab = 'cloud' | 'local' | 'schedule' | 'sync';

// ─── localStorage collector ────────────────────────────────────────────────
function collectLocalStorageData(): { data: Record<string, string>; totalSize: number; keysCount: number } {
  const backup: Record<string, string> = {};
  let totalSize = 0;
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(STORAGE_PREFIX)) {
      const cleanKey = key.replace(STORAGE_PREFIX, '');
      const value = localStorage.getItem(key) || '';
      backup[cleanKey] = value;
      totalSize += value.length + key.length;
    }
  });
  return { data: backup, totalSize, keysCount: Object.keys(backup).length };
}

function downloadJSON(data: any, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Component ─────────────────────────────────────────────────────────────
export function YedeklerPage() {
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { t } = useLanguage();
  const { emit } = useModuleBus();
  const { canManage: canBackup } = getPagePermissions(user, currentEmployee, 'yedekler');

  const [activeTab, setActiveTab] = useState<ActiveTab>('local');
  const [localBackups, setLocalBackups] = useState<BackupMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreProgress, setRestoreProgress] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [backupStats, setBackupStats] = useState<{ totalLocalBackups: number; lastBackupAt: string | null; totalDocsInPouchDB: number; tableStats: Record<string, number> } | null>(null);

  // Selective restore modal
  const [selectiveModal, setSelectiveModal] = useState<{ backupId: string; tableStats: Record<string, number> } | null>(null);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [selectiveRestoring, setSelectiveRestoring] = useState(false);

  // File restore
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [restoreFileContent, setRestoreFileContent] = useState<PouchBackupData | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-backup schedule state
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => getAutoBackupConfig().enabled || false);
  const [autoBackupInterval, setAutoBackupInterval] = useState(() => getAutoBackupConfig().intervalHours || 24);
  const [lastAutoBackup, setLastAutoBackup] = useState(() => getAutoBackupConfig().lastRun || null);

  // ─── Cloud backup stubs (CouchDB sync otomatik — manuel bulut yedek henüz yok) ──────
  const [cloudBackups] = useState<BackupMeta[]>([]);
  const [filteredCloudBackups] = useState<BackupMeta[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResult] = useState<{ ok: boolean; message: string; id?: string; verified?: boolean } | null>(null);
  const fetchCloudBackups = useCallback(() => { toast.info('Bulut yedekleme henüz yapılandırılmadı (CouchDB gerekli)'); }, []);
  const handleCreateCloudBackup = useCallback(() => { toast.info('Bulut yedekleme için CouchDB yapılandırın'); }, []);
  const handleVerifyBackup = useCallback((_id: string) => { toast.info('Doğrulama için CouchDB gerekli'); }, []);
  const handleDownloadCloudBackup = useCallback((_id: string) => { toast.info('İndirme için CouchDB gerekli'); }, []);
  const handleDeleteCloudBackup = useCallback((_id: string) => { toast.info('Silme için CouchDB gerekli'); }, []);
  // ─── Sync health stubs ───────────────────────────────────────────────────────
  const [syncHealth, setSyncHealth] = useState<any>(null);
  const [syncHealthLoading, setSyncHealthLoading] = useState(false);
  const fetchSyncHealth = useCallback(async () => {
    setSyncHealthLoading(true);
    try {
      const { getDb, testCouchDbConnection } = await import('../lib/pouchdb');
      const { TABLE_NAMES } = await import('../lib/db-config');
      const t0 = performance.now();
      const tableStats: Record<string, { ok: boolean; count: number }> = {};
      for (const t of TABLE_NAMES) {
        try {
          const db = getDb(t);
          const info = await db.info();
          tableStats[t] = { ok: true, count: info.doc_count };
        } catch { tableStats[t] = { ok: false, count: 0 }; }
      }
      const latencyMs = Math.round(performance.now() - t0);
      const couchResult = await testCouchDbConnection();
      const totalKeys = Object.values(tableStats).reduce((s, v) => s + v.count, 0);
      setSyncHealth({
        healthy: couchResult.ok,
        couchDb: couchResult,
        latencyMs,
        totalKeys,
        timestamp: new Date().toISOString(),
        tables: tableStats,
      });
    } catch { setSyncHealth(null); }
    setSyncHealthLoading(false);
  }, []);
  // ─── Local repo config stubs ──────────────────────────────────────────────
  const getLocalRepoConfig = useCallback(() => ({ enabled: false }), []);
  const isLocalHealthy = useCallback(() => false, []);

  // ─── CouchDB kurulum state ────────────────────────────────────────────────
  const [couchTableStatus, setCouchTableStatus] = useState<CouchDbTableStatus[]>([]);
  const [couchStatusLoading, setCouchStatusLoading] = useState(false);
  const [couchInitializing, setCouchInitializing] = useState(false);
  const [couchSeeding, setCouchSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState('');
  const [initResult, setInitResult] = useState<{ ok: number; fail: number; alreadyExisted: number } | null>(null);
  const [seedResult, setSeedResult] = useState<Record<string, { seeded: number; existed: number; errors: number }> | null>(null);

  const fetchCouchTableStatus = useCallback(async () => {
    setCouchStatusLoading(true);
    try {
      const statuses = await getCouchDbTableStatus();
      setCouchTableStatus(statuses);
    } catch {
      toast.error('CouchDB durumu alınamadı');
    }
    setCouchStatusLoading(false);
  }, []);

  const handleInitializeDatabases = useCallback(async () => {
    setCouchInitializing(true);
    setInitResult(null);
    try {
      const result = await initializeCouchDbDatabases();
      setInitResult({
        ok: result.ok.length,
        fail: result.fail.length,
        alreadyExisted: result.alreadyExisted.length,
      });
      if (result.fail.length === 0) {
        toast.success(`${result.ok.length} veritabanı başarıyla oluşturuldu`);
      } else {
        toast.warning(`${result.ok.length} başarılı, ${result.fail.length} hatalı: ${result.fail.join(', ')}`);
      }
      await fetchCouchTableStatus();
    } catch (e: any) {
      toast.error('Veritabanı oluşturma hatası: ' + e.message);
    }
    setCouchInitializing(false);
  }, [fetchCouchTableStatus]);

  const handleSeedFromLocalStorage = useCallback(async () => {
    setCouchSeeding(true);
    setSeedProgress('Başlatılıyor...');
    setSeedResult(null);
    try {
      const result = await seedPouchDbFromLocalStorage((tableName, count) => {
        setSeedProgress(`${tableName}: ${count} kayıt aktarıldı`);
      });
      setSeedResult(result);
      const total = Object.values(result).reduce((s, v) => s + v.seeded, 0);
      toast.success(`${total} kayıt PouchDB'ye aktarıldı (CouchDB'ye otomatik sync edilecek)`);
      await fetchCouchTableStatus();
    } catch (e: any) {
      toast.error('Veri aktarma hatası: ' + e.message);
    }
    setCouchSeeding(false);
    setSeedProgress('');
  }, [fetchCouchTableStatus]);
  // ─── Legacy / table restore stubs ──────────────────────────────────────────
  const handleLegacyBackup = useCallback(() => {
    const { data } = collectLocalStorageData();
    downloadJSON({ type: 'localStorage', timestamp: new Date().toISOString(), data }, `localStorage_backup_${Date.now()}.json`);
    toast.success('localStorage yedeği indirildi');
  }, []);
  const handleRestoreTableBackup = useCallback(async (backupId: string) => {
    if (!canBackup) { toast.error('Geri yükleme yetkiniz yok.'); return; }
    if (!window.confirm('Bu yedekten geri yüklenecek. Mevcut veriler üzerine yazılacak. Devam edilsin mi?')) return;
    setRestoringId(backupId);
    setRestoreProgress('Yedek verisi okunuyor...');
    try {
      const raw = localStorage.getItem(`pouchdb_backup_data_${backupId}`);
      if (!raw) { toast.error('Yedek verisi bulunamadı. Lütfen dosyadan geri yükleyin.'); return; }
      const backup: PouchBackupData = JSON.parse(raw);
      setRestoreProgress('PouchDB tablolarına yazılıyor...');
      const result = await restoreSelectedTables(backup, Object.keys(backup.tables || {}));
      if (result.ok > 0) {
        toast.success(`Geri yükleme tamamlandı: ${result.ok} kayıt, ${result.tables.length} tablo`, { duration: 5000 });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast.error('Geri yükleme başarısız: ' + (result.errors?.join(', ') || 'Veri yok'));
      }
    } catch (e: any) { toast.error('Geri yükleme hatası: ' + e.message); }
    finally { setRestoringId(null); setRestoreProgress(''); }
  }, [canBackup]);

  const fetchLocalBackups = useCallback(async () => {
    const list = await getBackupMetaListAsync();
    setLocalBackups(list);
  }, []);

  const fetchBackupStats = useCallback(async () => {
    try {
      const stats = await getBackupSystemStats();
      setBackupStats(stats);
    } catch {}
  }, []);

  useEffect(() => {
    fetchLocalBackups();
    fetchBackupStats();
    // Auto-backup zamanlayıcısını başlat
    startAutoBackupScheduler((meta) => {
      fetchLocalBackups();
      setLastAutoBackup(meta.timestamp);
    });
    return () => stopAutoBackupScheduler();
  }, [fetchLocalBackups, fetchBackupStats]);

  // ─── Yedek Oluştur (PouchDB) ─────────────────────────────────────────────
  const handleCreateBackup = async () => {
    if (!canBackup) { toast.error('Yedekleme yetkiniz bulunmamaktadır.'); return; }
    setCreating(true);
    setCreateProgress('PouchDB veritabanları okunuyor...');
    try {
      const result = await createPouchBackup();
      if (!result.ok || !result.backup) {
        toast.error('Yedek oluşturulamadı: ' + (result.error || 'Bilinmeyen hata'));
        return;
      }

      setCreateProgress('Yedek dosyası oluşturuluyor...');
      const meta: BackupMeta = {
        id: `backup_${Date.now()}`,
        timestamp: result.backup.createdAt,
        type: 'manual',
        totalDocs: result.totalDocs,
        sizeKB: result.sizeKB,
        tableStats: result.backup.meta.tableStats,
      };
      await saveBackupMeta(meta);

      // Yedek verisini localStorage'a kaydet (geri yükleme için)
      try {
        localStorage.setItem(`pouchdb_backup_data_${meta.id}`, JSON.stringify(result.backup));
      } catch { toast.warning('Yedek localStorage\'a kaydedilemedi (kota dolmuş olabilir). Dosya indirme devam ediyor.'); }

      setCreateProgress('İndirme başlatılıyor...');
      downloadBackup(result.backup);

      toast.success(`Yedek oluşturuldu! ${result.totalDocs} kayıt, ${result.sizeKB} KB`, { duration: 5000 });
      logActivity('backup_create', 'PouchDB yedeği oluşturuldu', {
        employeeName: user?.name, page: 'Yedekler',
        description: `${result.totalDocs} kayıt, ${result.sizeKB} KB`,
      });
      fetchLocalBackups();
      fetchBackupStats();
    } catch (e: any) {
      toast.error('Yedekleme hatası: ' + (e.message || 'Bilinmeyen hata'));
    } finally {
      setCreating(false);
      setCreateProgress('');
    }
  };

  // ─── Yerel yedek sil ─────────────────────────────────────────────────────
  const handleDeleteLocalBackup = async (id: string) => {
    if (!window.confirm('Bu yedeği kalıcı olarak silmek istediğinize emin misiniz?')) return;
    await deleteBackupMeta(id);
    try { localStorage.removeItem(`pouchdb_backup_data_${id}`); } catch {}
    fetchLocalBackups();
    fetchBackupStats();
    toast.success('Yedek silindi');
  };

  // ─── Yerel yedekten geri yükle ───────────────────────────────────────────
  const handleRestoreLocalBackup = async (backupId: string) => {
    if (!canBackup) { toast.error('Geri yükleme yetkiniz yok.'); return; }
    if (!window.confirm('Bu yedekten geri yüklenecek. Mevcut veriler üzerine yazılacak. Devam edilsin mi?')) return;
    setRestoringId(backupId);
    setRestoreProgress('Yedek verisi okunuyor...');
    try {
      const raw = localStorage.getItem(`pouchdb_backup_data_${backupId}`);
      if (!raw) {
        toast.error('Yedek verisi bulunamadı. Lütfen dosyadan geri yükleyin.');
        return;
      }
      const backup: PouchBackupData = JSON.parse(raw);
      setRestoreProgress('PouchDB tablolarına yazılıyor...');
      const result = await restorePouchBackup(backup);
      if (result.ok > 0) {
        toast.success(`Geri yükleme tamamlandı: ${result.ok} kayıt, ${result.tables.length} tablo`, { duration: 5000 });
        logActivity('backup_restore', 'Yerel yedekten geri yüklendi', { employeeName: user?.name, page: 'Yedekler', description: `${result.ok} kayıt` });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast.error('Geri yükleme başarısız. Dosyadan geri yüklemeyi deneyin.');
      }
    } catch (e: any) {
      toast.error('Geri yükleme hatası: ' + e.message);
    } finally {
      setRestoringId(null);
      setRestoreProgress('');
    }
  };

  // ─── Seçici geri yükleme ─────────────────────────────────────────────────
  const openSelectiveRestore = (backup: BackupMeta) => {
    setSelectiveModal({ backupId: backup.id, tableStats: backup.tableStats || {} });
    setSelectedTables(new Set(Object.keys(backup.tableStats || {})));
  };

  const handleSelectiveRestore = async () => {
    if (!selectiveModal || selectedTables.size === 0) return;
    if (!window.confirm(`${selectedTables.size} tablo geri yüklenecek. Devam edilsin mi?`)) return;
    setSelectiveRestoring(true);
    try {
      const raw = localStorage.getItem(`pouchdb_backup_data_${selectiveModal.backupId}`);
      if (!raw) { toast.error('Yedek verisi bulunamadı'); return; }
      const backup: PouchBackupData = JSON.parse(raw);
      const result = await restoreSelectedTables(backup, Array.from(selectedTables));
      toast.success(`${result.ok} kayıt geri yüklendi (${result.tables.length} tablo)`, { duration: 5000 });
      logActivity('backup_restore', 'Seçici geri yükleme', { employeeName: user?.name, description: `${result.ok} kayıt, ${result.tables.join(', ')}` });
      setTimeout(() => window.location.reload(), 2000);
    } catch { toast.error('Geri yükleme hatası'); }
    finally { setSelectiveRestoring(false); setSelectiveModal(null); }
  };

  // ─── Dosyadan geri yükleme ───────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) { toast.error('Sadece .json kabul edilir'); return; }
    setRestoreFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        // pouchdb_full formatını kabul et (eski supabase_tables formatıyla da uyumlu)
        if (!parsed.tables) { toast.error('Geçersiz yedek dosyası — "tables" alanı bulunamadı'); return; }
        setRestoreFileContent(parsed);
        setIsFileModalOpen(true);
      } catch { toast.error('JSON formatı bozuk'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRestoreFromFile = async () => {
    if (!canBackup) { toast.error('Yetkiniz yok'); return; }
    if (!restoreFileContent) return;
    if (!window.confirm('Dosyadan geri yükleme: Mevcut PouchDB verileri üzerine yazılacak!')) return;
    setIsFileModalOpen(false);
    setRestoringId('file');
    setRestoreProgress('PouchDB tablolarına yazılıyor...');
    try {
      const result = await restorePouchBackup(restoreFileContent);
      setRestoreProgress(`${result.ok} kayıt yüklendi. Sayfa yenileniyor...`);
      toast.success(`Geri yükleme tamamlandı! ${result.ok} kayıt, ${result.tables.length} tablo`, { duration: 3000 });
      logActivity('backup_restore', 'Dosyadan geri yüklendi', { employeeName: user?.name, description: `${result.ok} kayıt` });
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) { toast.error('Geri yükleme hatası: ' + e.message); }
    finally { setRestoringId(null); setRestoreProgress(''); }
  };

  // ─── Auto-backup schedule save ───────────────────────────────────────────
  const saveAutoBackupConfigHandler = () => {
    const config = { enabled: autoBackupEnabled, intervalHours: autoBackupInterval, lastRun: lastAutoBackup };
    saveAutoBackupConfig(config);
    stopAutoBackupScheduler();
    if (config.enabled) startAutoBackupScheduler((meta) => { fetchLocalBackups(); setLastAutoBackup(meta.timestamp); });
    toast.success('Otomatik yedekleme ayarları kaydedildi');
  };

  // ─── Export helpers ──────────────────────────────────────────────────────
  const handleExcelExport = () => {
    try { if (generateDetailedExcelBackup()) toast.success('Excel indirildi!'); else toast.error('Excel hatası'); } catch { toast.error('Excel hatası'); }
  };
  const handlePDFExport = () => {
    try { if (generatePDFBackup()) toast.success('PDF indirildi!'); else toast.error('PDF hatası'); } catch { toast.error('PDF hatası'); }
  };

  // ─── Computed ────────────────────────────────────────────────────────────
  const storageSizeKB = (() => {
    let total = 0;
    Object.keys(localStorage).forEach(k => { if (k.startsWith(STORAGE_PREFIX)) total += (localStorage.getItem(k) || '').length + k.length; });
    return (total / 1024).toFixed(1);
  })();

  const filteredLocalBackups = localBackups.filter(b => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const dateStr = new Date(b.timestamp).toLocaleDateString('tr-TR');
    return dateStr.includes(q) || b.type.includes(q);
  });

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { key: 'local', label: 'Yerel Yedekler', icon: <HardDrive className="w-4 h-4" /> },
    { key: 'schedule', label: 'Zamanlanmış', icon: <Timer className="w-4 h-4" /> },
    { key: 'sync', label: 'Senkronizasyon', icon: <Activity className="w-4 h-4" /> },
  ];

  const inputClass = "w-full px-3 py-2.5 bg-secondary/50 border border-border/30 rounded-xl text-white text-sm placeholder-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all";

  return (
    <div className="p-3 sm:p-5 lg:p-6 max-w-[1400px] mx-auto space-y-4 sm:space-y-5 pb-4 sm:pb-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            Yedekleme Merkezi
          </h1>
          <p className="text-xs text-muted-foreground/60 mt-1 ml-[46px]">
            SHA-256 doğrulamalı sunucu tarafı yedekleme, seçici geri yükleme ve zamanlanmış otomatik yedek
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handlePDFExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-secondary/50 hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border/30 transition-all active:scale-[0.97]">
            <FileText className="w-3.5 h-3.5 text-red-400" /> PDF
          </button>
          <button onClick={handleExcelExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-secondary/50 hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border/30 transition-all active:scale-[0.97]">
            <Table className="w-3.5 h-3.5 text-emerald-400" /> Excel
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all active:scale-[0.97]">
            <FileUp className="w-3.5 h-3.5" /> Dosyadan Yükle
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
          <button onClick={handleCreateBackup} disabled={creating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-600/20 transition-all active:scale-[0.97] disabled:opacity-50">
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {creating ? 'Oluşturuluyor...' : 'Yedek Al'}
          </button>
        </div>
      </div>

      {/* ── Progress Banners ──────────────────────────────────── */}
      <AnimatePresence>
        {creating && createProgress && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="card-premium rounded-xl p-4 flex items-center gap-3 border-l-4 border-l-blue-500">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
            <div><p className="text-sm font-medium text-blue-400">Sunucu Tarafı Yedekleme</p><p className="text-xs text-blue-400/60 mt-0.5">{createProgress}</p></div>
          </motion.div>
        )}
        {restoringId && restoreProgress && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="card-premium rounded-xl p-4 flex items-center gap-3 border-l-4 border-l-amber-500">
            <Loader2 className="w-5 h-5 text-amber-400 animate-spin flex-shrink-0" />
            <div><p className="text-sm font-medium text-amber-400">Geri Yükleme</p><p className="text-xs text-amber-400/60 mt-0.5">{restoreProgress}</p></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stats Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Yerel Yedekler', value: backupStats?.totalLocalBackups ?? localBackups.length, icon: HardDrive, color: 'blue' },
          { label: 'PouchDB Kayıtları', value: backupStats?.totalDocsInPouchDB ?? '...', icon: Server, color: 'emerald' },
          { label: 'localStorage', value: `${storageSizeKB} KB`, icon: Database, color: 'purple' },
          { label: 'Son Yedek', value: backupStats?.lastBackupAt ? new Date(backupStats.lastBackupAt).toLocaleDateString('tr-TR') : localBackups[0] ? new Date(localBackups[0].timestamp).toLocaleDateString('tr-TR') : 'Yok', icon: Clock, color: 'cyan' },
        ].map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="card-premium rounded-xl p-4 relative overflow-hidden group">
            <div className={`absolute inset-0 bg-gradient-to-br from-${stat.color}-500/[0.04] to-transparent pointer-events-none`} />
            <div className="flex items-center gap-3 relative z-10">
              <div className={`w-10 h-10 rounded-xl bg-${stat.color}-500/10 border border-${stat.color}-500/15 flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 text-${stat.color}-400`} />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">{stat.label}</p>
                <p className="text-lg font-bold text-white tech-number">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Tab Navigation ────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/30 border border-border/20 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20' : 'text-muted-foreground/60 hover:text-foreground/70 hover:bg-secondary/40 border border-transparent'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: BULUT YEDEKLERİ                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'cloud' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Search */}
          <div className="card-premium rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Yedek ara (tarih, etiket)..."
                className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border/20 rounded-lg text-white text-xs placeholder-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-blue-500/30" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchCloudBackups} className="p-2 rounded-lg bg-secondary/40 hover:bg-secondary/60 text-muted-foreground transition-all active:scale-95">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <span className="text-[10px] text-muted-foreground/50">{filteredCloudBackups.length} yedek</span>
            </div>
          </div>

          {/* Backup List */}
          {loading ? (
            <div className="card-premium rounded-xl p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">Bulut yedekleri yükleniyor...</p>
            </div>
          ) : filteredCloudBackups.length === 0 ? (
            <div className="card-premium rounded-xl p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/15 mx-auto mb-4 flex items-center justify-center">
                <Cloud className="w-8 h-8 text-blue-400/50" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Henüz bulut yedeği yok</h3>
              <p className="text-xs text-muted-foreground/60 mb-4">Sunucu tarafında SHA-256 doğrulamalı tam yedek oluşturun</p>
              <button onClick={handleCreateCloudBackup} disabled={creating}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-600 text-white transition-all">
                <CloudDownload className="w-3.5 h-3.5 inline mr-1.5" />İlk Yedeği Oluştur
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCloudBackups.map((backup, idx) => {
                const dateObj = new Date(backup.timestamp);
                const isVerifying = verifyingId === backup.id;
                const vr = verifyResult ? verifyResult : null;

                return (
                  <motion.div key={backup.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                    className="card-premium rounded-xl p-4 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/[0.02] via-transparent to-cyan-500/[0.02] pointer-events-none" />
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 relative z-10">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                          <span className="text-sm font-semibold text-white">{dateObj.toLocaleDateString('tr-TR')}</span>
                          <span className="text-xs text-muted-foreground/50">{dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${backup.type === 'auto' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                            {backup.type === 'auto' ? 'Oto' : 'Manuel'}
                          </span>
                          {vr && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${vr.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                              {vr.ok ? '✓ Doğrulandı' : '✗ Bozuk'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
                          <span className="tech-number">{backup.totalDocs} kayıt</span>
                          <span>•</span>
                          <span className="tech-number">{backup.sizeKB.toFixed(0)} KB</span>
                          <span>•</span>
                          <span className="font-mono text-[9px] text-muted-foreground/40 truncate max-w-[120px]" title={backup.id}>
                            ID: {backup.id.substring(0, 12)}...
                          </span>
                        </div>
                        {/* Table breakdown */}
                        {backup.tableStats && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(backup.tableStats).slice(0, 6).map(([table, count]) => (
                              <span key={table} className="px-1.5 py-0.5 rounded bg-secondary/40 text-[9px] text-muted-foreground/50">{table}: {count as number}</span>
                            ))}
                            {Object.keys(backup.tableStats).length > 6 && (
                              <span className="px-1.5 py-0.5 rounded bg-secondary/40 text-[9px] text-muted-foreground/40">+{Object.keys(backup.tableStats).length - 6} tablo</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => handleVerifyBackup(backup.id)} disabled={isVerifying} title="Bütünlük Doğrula"
                          className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-all active:scale-95 disabled:opacity-50">
                          {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleDownloadCloudBackup(backup.id)} title="İndir"
                          className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-all active:scale-95">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openSelectiveRestore(backup)} title="Seçici Geri Yükle"
                          className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-all active:scale-95">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteCloudBackup(backup.id)} title="Sil"
                          className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all active:scale-95">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: YEREL YEDEKLER                                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'local' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="card-premium rounded-xl p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Yerel Yedekler (localStorage)</h3>
              <p className="text-[10px] text-muted-foreground/50">Tarayıcı belleğindeki metadata kayıtları</p>
            </div>
            <button onClick={handleLegacyBackup} disabled={creating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 border border-purple-500/20 transition-all active:scale-95 disabled:opacity-50">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Yerel Yedek İndir
            </button>
          </div>

          {localBackups.length === 0 ? (
            <div className="card-premium rounded-xl p-10 text-center">
              <FolderOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">Yerel yedek kaydı yok</p>
            </div>
          ) : (
            <div className="space-y-2">
              {localBackups.map((b) => {
                const isTableBackup = b.id.startsWith('tbl_') || b.id.startsWith('cloud_');
                return (
                  <div key={b.id} className="card-premium rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground/40" />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {new Date(b.timestamp).toLocaleDateString('tr-TR')} {new Date(b.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          {isTableBackup && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Tablo Yedeği</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50">{b.totalDocs} kayıt • {b.sizeKB ? `${b.sizeKB} KB` : '-'} • {b.type}</p>
                        <p className="text-[10px] text-muted-foreground/50">{b.totalDocs} satır • {b.sizeKB ? `${b.sizeKB.toFixed(0)} KB` : '-'} • {b.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isTableBackup && (
                        <button
                          onClick={() => handleRestoreTableBackup(b.id)}
                          disabled={!!restoringId}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/20 transition-all active:scale-95 disabled:opacity-50">
                          {restoringId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          Geri Yükle
                        </button>
                      )}
                      <button onClick={() => handleDeleteLocalBackup(b.id)}
                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all active:scale-95">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: ZAMANLANMIŞ                                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'schedule' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="card-premium rounded-xl p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.03] to-orange-500/[0.02] pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                  <Timer className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Otomatik Yedekleme Zamanlaması</h3>
                  <p className="text-[10px] text-muted-foreground/60">Sunucu tarafında periyodik tam yedek oluşturma</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground/80 mb-1.5">Durum</label>
                  <button onClick={() => setAutoBackupEnabled(!autoBackupEnabled)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${autoBackupEnabled ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-secondary/40 border-border/30 text-muted-foreground/60'}`}>
                    <span className="text-sm font-medium">{autoBackupEnabled ? 'Aktif' : 'Devre Dışı'}</span>
                    <div className={`w-10 h-6 rounded-full transition-all ${autoBackupEnabled ? 'bg-emerald-500' : 'bg-secondary/60'} relative`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${autoBackupEnabled ? 'left-5' : 'left-1'}`} />
                    </div>
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground/80 mb-1.5">Yedekleme Aralığı</label>
                  <select value={autoBackupInterval} onChange={e => setAutoBackupInterval(Number(e.target.value))}
                    className={`${inputClass} appearance-none`}>
                    <option value={6}>Her 6 Saat</option>
                    <option value={12}>Her 12 Saat</option>
                    <option value={24}>Günlük (24 Saat)</option>
                    <option value={48}>Her 2 Gün</option>
                    <option value={168}>Haftalık</option>
                  </select>
                </div>
              </div>

              {lastAutoBackup && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400/60" />
                  Son otomatik yedek: {new Date(lastAutoBackup).toLocaleString('tr-TR')}
                </div>
              )}

              <button onClick={saveAutoBackupConfigHandler}
                className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-600/80 to-orange-600/80 hover:from-amber-500 hover:to-orange-500 text-white transition-all active:scale-[0.98]">
                Ayarları Kaydet
              </button>
            </div>
          </div>

          {/* Info note */}
          <div className="card-premium rounded-xl p-4 border-l-4 border-l-blue-500">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground/60 space-y-1">
                <p className="text-blue-400 font-medium">Otomatik Yedekleme Bilgisi</p>
                <p>Uygulama açıkken belirtilen aralıklarda SHA-256 doğrulamalı tam yedek oluşturulur. Yedekler PouchDB/CouchDB üzerinde kalıcı olarak saklanır.</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB: SENKRONİZASYON                                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'sync' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Senkronizasyon Sağlığı</h3>
            <button onClick={fetchSyncHealth} disabled={syncHealthLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary/40 hover:bg-secondary/60 text-muted-foreground transition-all active:scale-95">
              <RefreshCw className={`w-3 h-3 ${syncHealthLoading ? 'animate-spin' : ''}`} /> Yenile
            </button>
          </div>

          {syncHealth ? (
            <>
              <div className="card-premium rounded-xl p-4 relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-r ${syncHealth.healthy ? 'from-emerald-500/[0.04] to-transparent' : 'from-red-500/[0.04] to-transparent'} pointer-events-none`} />
                <div className="flex items-center gap-4 relative z-10">
                  <div className={`w-12 h-12 rounded-xl ${syncHealth.healthy ? 'bg-emerald-500/15 border-emerald-500/20' : 'bg-red-500/15 border-red-500/20'} border flex items-center justify-center`}>
                    {syncHealth.healthy ? <Wifi className="w-6 h-6 text-emerald-400" /> : <WifiOff className="w-6 h-6 text-red-400" />}
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${syncHealth.healthy ? 'text-emerald-400' : 'text-red-400'}`}>
                      {syncHealth.healthy ? 'CouchDB Bağlantısı Sağlıklı' : 'CouchDB Bağlantı Sorunu'}
                      {syncHealth.couchDb?.version && <span className="ml-2 text-[10px] font-normal text-muted-foreground/50">v{syncHealth.couchDb.version}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground/50">
                      Gecikme: {syncHealth.latencyMs}ms • Toplam: {syncHealth.totalKeys} kayıt • {new Date(syncHealth.timestamp).toLocaleTimeString('tr-TR')}
                      {!syncHealth.healthy && syncHealth.couchDb?.error && <span className="ml-1 text-red-400/70">— {syncHealth.couchDb.error}</span>}
                    </p>
                  </div>
                </div>
              </div>

              {/* Table breakdown */}
              <div className="card-premium rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border/15 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  <h4 className="text-xs font-bold text-white">Tablo Bazlı Durum</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-border/10">
                  {syncHealth.tables && Object.entries(syncHealth.tables).map(([table, info]: [string, any]) => (
                    <div key={table} className="p-3 bg-card/80">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className={`w-2 h-2 rounded-full ${info.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="text-[10px] font-medium text-muted-foreground/70 truncate">{table}</span>
                      </div>
                      <p className="text-sm font-bold text-white tech-number">{info.count}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="card-premium rounded-xl p-10 text-center">
              <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">Senkronizasyon durumu yükleniyor...</p>
            </div>
          )}

          {/* ── CouchDB Kurulum Paneli ── */}
          <div className="card-premium rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-cyan-400" />
                <h4 className="text-sm font-bold text-white">CouchDB Veritabanı Kurulumu</h4>
              </div>
              <button
                onClick={fetchCouchTableStatus}
                disabled={couchStatusLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary/40 hover:bg-secondary/60 text-muted-foreground transition-all"
              >
                <RefreshCw className={`w-3 h-3 ${couchStatusLoading ? 'animate-spin' : ''}`} /> Kontrol Et
              </button>
            </div>

            {/* Adım 1 — Veritabanlarını oluştur */}
            <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
              <p className="text-xs font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-black">1</span>
                CouchDB Veritabanlarını Oluştur
              </p>
              <p className="text-xs text-muted-foreground/60">15 tablo + KV store CouchDB'de yoksa oluşturulur. Zaten varsa atlanır.</p>
              <button
                onClick={handleInitializeDatabases}
                disabled={couchInitializing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {couchInitializing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                {couchInitializing ? 'Oluşturuluyor...' : 'Tüm Veritabanlarını Oluştur'}
              </button>
              {initResult && (
                <div className="text-xs flex gap-3 mt-1">
                  <span className="text-emerald-400">✓ {initResult.ok} başarılı</span>
                  {initResult.alreadyExisted > 0 && <span className="text-blue-400">{initResult.alreadyExisted} zaten vardı</span>}
                  {initResult.fail > 0 && <span className="text-red-400">✗ {initResult.fail} hatalı</span>}
                </div>
              )}
            </div>

            {/* Adım 2 — Yerel verileri aktar */}
            <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
              <p className="text-xs font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center font-black">2</span>
                Yerel Verileri CouchDB'ye Aktar
              </p>
              <p className="text-xs text-muted-foreground/60">localStorage'daki tüm veriler PouchDB'ye yazılır. PouchDB otomatik olarak CouchDB'ye senkronize eder.</p>
              <button
                onClick={handleSeedFromLocalStorage}
                disabled={couchSeeding}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {couchSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                {couchSeeding ? (seedProgress || 'Aktarılıyor...') : 'Verileri CouchDB\'ye Aktar'}
              </button>
              {seedResult && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {Object.entries(seedResult).filter(([, v]) => v.seeded > 0 || v.errors > 0).map(([table, v]) => (
                    <div key={table} className="text-[10px] flex justify-between px-2 py-1 rounded bg-white/[0.03]">
                      <span className="text-muted-foreground/60 truncate">{table}</span>
                      <span className={v.errors > 0 ? 'text-red-400' : 'text-emerald-400'}>
                        +{v.seeded} {v.errors > 0 && `(${v.errors} hata)`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tablo durumu */}
            {couchTableStatus.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tablo Durumları</p>
                <div className="grid grid-cols-1 gap-1">
                  {couchTableStatus.map(t => (
                    <div key={t.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.exists ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className="text-xs text-white/80 truncate">{t.displayName}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] flex-shrink-0 ml-2">
                        <span className="text-muted-foreground/50">LS: <span className="text-white/60">{t.localStorageCount}</span></span>
                        <span className="text-muted-foreground/50">PDB: <span className="text-white/60">{t.localDocCount}</span></span>
                        <span className={t.exists ? 'text-emerald-400' : 'text-red-400'}>CDB: {t.couchDocCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/40">LS = localStorage | PDB = PouchDB (yerel) | CDB = CouchDB (sunucu)</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MODAL: Seçici Geri Yükleme                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectiveModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={() => !selectiveRestoring && setSelectiveModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 240, damping: 26 }}
              className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-lg overflow-y-auto z-50 card-premium rounded-2xl p-4 sm:p-5 border border-border/30" style={{maxHeight:'calc(100dvh - 1rem)'}}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-amber-400" /> Seçici Geri Yükleme
                </h3>
                <button onClick={() => !selectiveRestoring && setSelectiveModal(null)} className="p-1 rounded-lg hover:bg-secondary/60 text-muted-foreground transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground/60 mb-3">Geri yüklemek istediğiniz tabloları seçin:</p>

              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setSelectedTables(new Set(Object.keys(selectiveModal.tableStats)))}
                  className="text-[10px] text-blue-400 hover:text-blue-300">Tümünü Seç</button>
                <span className="text-muted-foreground/30">|</span>
                <button onClick={() => setSelectedTables(new Set())}
                  className="text-[10px] text-muted-foreground/50 hover:text-foreground/70">Hiçbirini Seçme</button>
                <span className="text-[10px] text-muted-foreground/40 ml-auto">{selectedTables.size}/{Object.keys(selectiveModal.tableStats).length} seçili</span>
              </div>

              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {Object.entries(selectiveModal.tableStats).map(([table, count]) => (
                  <label key={table} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${selectedTables.has(table) ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'}`}>
                    <input type="checkbox" checked={selectedTables.has(table)}
                      onChange={() => {
                        const next = new Set(selectedTables);
                        next.has(table) ? next.delete(table) : next.add(table);
                        setSelectedTables(next);
                      }}
                      className="w-4 h-4 rounded border-border accent-blue-500" />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-white">{table}</span>
                      <span className="text-[10px] text-muted-foreground/50 tech-number">{count as number} kayıt</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 mt-4 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-red-400/80">Seçilen tabloların mevcut verileri bu yedeğin verileriyle değiştirilecektir.</p>
              </div>

              <div className="flex gap-2 mt-4">
                <button onClick={() => setSelectiveModal(null)} disabled={selectiveRestoring}
                  className="flex-1 py-3 rounded-xl bg-secondary/50 hover:bg-secondary/70 text-muted-foreground text-sm font-medium transition-all">İptal</button>
                <button onClick={handleSelectiveRestore} disabled={selectiveRestoring || selectedTables.size === 0}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {selectiveRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  {selectedTables.size} Tablo Geri Yükle
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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