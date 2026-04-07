import React, { useState, useEffect, useCallback } from 'react';
import {
  Database, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2,
  Eye, EyeOff, Save, Server, Zap, Cloud, CloudOff,
  HardDrive, Activity, ArrowUpDown, Play, Download, Shield,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  testCouchDbConnection,
  getCouchDbTableStatus,
  initializeCouchDbDatabases,
  seedPouchDbFromLocalStorage,
  type CouchDbTableStatus,
  TABLE_DISPLAY_NAMES,
} from '../lib/pouchdb';
import { getCouchDbConfig, setCouchDbConfig } from '../lib/db-config';
import { useGlobalSyncTables } from '../contexts/GlobalTableSyncContext';
import { logActivity } from '../utils/activityLogger';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { getPagePermissions } from '../utils/permissions';

// ─── Helper ───────────────────────────────────────────────────────────────────

const inputClass =
  'w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all';

function SyncDot({ state }: { state: string }) {
  const color =
    state === 'synced'  ? 'bg-emerald-400' :
    state === 'error'   ? 'bg-red-400' :
    state === 'loading' ? 'bg-blue-400 animate-pulse' :
    state === 'offline' ? 'bg-gray-500' :
                          'bg-yellow-400';
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

function syncLabel(state: string) {
  return state === 'synced'  ? 'Senkron'     :
         state === 'error'   ? 'Hata'         :
         state === 'loading' ? 'Yükleniyor'   :
         state === 'offline' ? 'Çevrimdışı'   : 'Bekliyor';
}

function syncColor(state: string) {
  return state === 'synced'  ? 'text-emerald-400' :
         state === 'error'   ? 'text-red-400'      :
         state === 'loading' ? 'text-blue-400'     :
         state === 'offline' ? 'text-gray-500'     : 'text-yellow-400';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SunucuPage() {
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { canEdit } = getPagePermissions(user, currentEmployee, 'ayarlar');
  const { tables: syncTables } = useGlobalSyncTables();

  // ── CouchDB config state ──
  const [cfg, setCfg] = useState(() => getCouchDbConfig());
  const [showPass, setShowPass] = useState(false);

  // ── Connection test ──
  const [connStatus, setConnStatus] = useState<{ ok: boolean; version?: string; error?: string; latencyMs?: number } | null>(null);
  const [connTesting, setConnTesting] = useState(false);

  // ── Table status ──
  const [tableStatus, setTableStatus] = useState<CouchDbTableStatus[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // ── Actions ──
  const [initializing, setInitializing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState('');

  // ── Auto-refresh every 30s ──
  const [autoRefresh, setAutoRefresh] = useState(true);

  const handleTestConnection = useCallback(async () => {
    setConnTesting(true);
    const t0 = performance.now();
    const result = await testCouchDbConnection();
    const latencyMs = Math.round(performance.now() - t0);
    setConnStatus({ ...result, latencyMs });
    setConnTesting(false);
    if (result.ok) {
      toast.success(`CouchDB bağlantısı başarılı — v${result.version} (${latencyMs}ms)`);
    } else {
      toast.error(`Bağlantı başarısız: ${result.error}`);
    }
  }, []);

  const handleSaveConfig = useCallback(() => {
    if (!canEdit) { toast.error('Yapılandırmayı değiştirme yetkiniz yok.'); return; }
    setCouchDbConfig(cfg);
    logActivity('settings_change', 'CouchDB yapılandırması güncellendi', { employeeName: user?.name });
    toast.success('CouchDB yapılandırması kaydedildi. Sayfa yenilenecek…');
    setTimeout(() => window.location.reload(), 1200);
  }, [cfg, canEdit, user?.name]);

  const loadTableStatus = useCallback(async () => {
    setStatsLoading(true);
    try {
      const statuses = await getCouchDbTableStatus();
      setTableStatus(statuses);
      setLastRefreshed(new Date());
    } catch (e: any) {
      toast.error('Tablo istatistikleri alınamadı: ' + e.message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const handleInitialize = useCallback(async () => {
    if (!canEdit) { toast.error('Bu işlem için yetkiniz yok.'); return; }
    if (!confirm('CouchDB\'de tüm veritabanları oluşturulsun mu? Mevcut veriler etkilenmez.')) return;
    setInitializing(true);
    try {
      const result = await initializeCouchDbDatabases(msg => toast.info(msg, { duration: 1500 }));
      toast.success(`${result.ok.length} veritabanı oluşturuldu, ${result.alreadyExisted.length} zaten vardı.`);
      await loadTableStatus();
    } catch (e: any) {
      toast.error('Başlatma hatası: ' + e.message);
    } finally {
      setInitializing(false);
    }
  }, [canEdit, loadTableStatus]);

  const handleSeed = useCallback(async () => {
    if (!canEdit) { toast.error('Bu işlem için yetkiniz yok.'); return; }
    if (!confirm('localStorage\'daki tüm veriler PouchDB\'ye aktarılsın mı? (PouchDB → CouchDB sync otomatik devam eder)')) return;
    setSeeding(true);
    setSeedProgress('Başlıyor…');
    try {
      const result = await seedPouchDbFromLocalStorage((tableName, count) => {
        setSeedProgress(`${tableName}: ${count} kayıt aktarıldı`);
      });
      const total = Object.values(result).reduce((s, r) => s + r.seeded, 0);
      const errors = Object.values(result).reduce((s, r) => s + r.errors, 0);
      toast.success(`Toplam ${total} kayıt PouchDB'ye aktarıldı${errors > 0 ? `, ${errors} hata` : ''}.`);
      setSeedProgress('');
      await loadTableStatus();
    } catch (e: any) {
      toast.error('Aktarım hatası: ' + e.message);
      setSeedProgress('');
    } finally {
      setSeeding(false);
    }
  }, [canEdit, loadTableStatus]);

  // Initial load
  useEffect(() => {
    handleTestConnection();
    loadTableStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(loadTableStatus, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, loadTableStatus]);

  // ── Summary stats ──
  const totalLocalDocs = tableStatus.reduce((s, t) => s + t.localDocCount, 0);
  const totalCouchDocs = tableStatus.reduce((s, t) => s + t.couchDocCount, 0);
  const syncedTables  = tableStatus.filter(t => t.exists && t.couchDocCount >= t.localDocCount).length;
  const errorTables   = tableStatus.filter(t => !t.exists || !!t.error).length;
  const liveSynced    = syncTables.filter(t => t.syncState === 'synced').length;
  const liveError     = syncTables.filter(t => t.syncState === 'error').length;

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-6 min-h-screen bg-background text-white pb-28 sm:pb-10">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600/30 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center">
              <Server className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Sunucu & Veritabanı</h1>
              <p className="text-xs text-gray-500">CouchDB senkronizasyon durumu ve yapılandırması</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              autoRefresh
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                : 'bg-white/5 text-gray-500 border-white/10'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            {autoRefresh ? 'Otomatik: Açık' : 'Otomatik: Kapalı'}
          </button>
          <button
            onClick={() => { loadTableStatus(); handleTestConnection(); }}
            disabled={statsLoading || connTesting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            {(statsLoading || connTesting) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Yenile
          </button>
        </div>
      </div>

      {/* ── Connection Banner ───────────────────────────── */}
      <div className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
        connStatus === null
          ? 'border-white/10 bg-white/3'
          : connStatus.ok
            ? 'border-emerald-500/30 bg-emerald-950/20'
            : 'border-red-500/30 bg-red-950/20'
      }`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {connTesting ? (
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin flex-shrink-0" />
          ) : connStatus?.ok ? (
            <CheckCircle className="w-8 h-8 text-emerald-400 flex-shrink-0" />
          ) : connStatus ? (
            <XCircle className="w-8 h-8 text-red-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-8 h-8 text-gray-500 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-bold ${
              connStatus?.ok ? 'text-emerald-400' : connStatus ? 'text-red-400' : 'text-gray-400'
            }`}>
              {connTesting ? 'Bağlantı test ediliyor…'
                : connStatus?.ok  ? `CouchDB bağlantısı aktif — v${connStatus.version}`
                : connStatus      ? `Bağlantı başarısız: ${connStatus.error}`
                :                   'Bağlantı durumu bilinmiyor'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {cfg.url || 'URL yapılandırılmamış'}{connStatus?.latencyMs ? ` · ${connStatus.latencyMs}ms` : ''}
            </p>
          </div>
        </div>
        {lastRefreshed && (
          <p className="text-[10px] text-gray-600 flex-shrink-0">
            Son kontrol: {lastRefreshed.toLocaleTimeString('tr-TR')}
          </p>
        )}
      </div>

      {/* ── Summary Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'PouchDB (Yerel)', value: totalLocalDocs.toLocaleString('tr-TR'), icon: <HardDrive className="w-4 h-4 text-purple-400" />, color: 'border-purple-500/20 bg-purple-950/10' },
          { label: 'CouchDB (Sunucu)', value: tableStatus.length ? totalCouchDocs.toLocaleString('tr-TR') : '—', icon: <Cloud className="w-4 h-4 text-blue-400" />, color: 'border-blue-500/20 bg-blue-950/10' },
          { label: 'Senkronize Tablo', value: tableStatus.length ? `${syncedTables}/${tableStatus.length}` : `${liveSynced}/${syncTables.length}`, icon: <ArrowUpDown className="w-4 h-4 text-emerald-400" />, color: 'border-emerald-500/20 bg-emerald-950/10' },
          { label: 'Hata / Sorun', value: tableStatus.length ? errorTables : liveError, icon: <AlertCircle className="w-4 h-4 text-red-400" />, color: errorTables > 0 || liveError > 0 ? 'border-red-500/30 bg-red-950/15' : 'border-white/10 bg-white/3' },
        ].map(card => (
          <div key={card.label} className={`rounded-2xl border p-4 flex flex-col gap-2 ${card.color}`}>
            <div className="flex items-center gap-2">{card.icon}<span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">{card.label}</span></div>
            <span className="text-2xl font-extrabold">{card.value}</span>
          </div>
        ))}
      </div>

      {/* ── Table Status Grid ───────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/2 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white">Tablo Durumu</h2>
            {statsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />}
          </div>
          <p className="text-[10px] text-gray-600">Yerel / PouchDB / CouchDB / Canlı Sync</p>
        </div>

        <div className="divide-y divide-white/5">
          {/* Header row */}
          <div className="grid grid-cols-6 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-600">
            <span className="col-span-2">Tablo</span>
            <span className="text-center">Yerel</span>
            <span className="text-center">PouchDB</span>
            <span className="text-center">CouchDB</span>
            <span className="text-center">Durum</span>
          </div>

          {/* Live data from GlobalTableSyncContext (always visible) */}
          {syncTables.map(gt => {
            const ts = tableStatus.find(s => s.name === gt.name || s.name === `mert_${gt.name}`);
            const displayName = TABLE_DISPLAY_NAMES[gt.name] || gt.name;
            const isOk = ts ? (ts.exists && ts.couchDocCount >= ts.localDocCount) : gt.syncState === 'synced';
            const hasError = ts ? (!ts.exists || !!ts.error) : gt.syncState === 'error';

            return (
              <div
                key={gt.name}
                className={`grid grid-cols-6 px-5 py-3 items-center hover:bg-white/3 transition-colors ${hasError ? 'bg-red-950/10' : ''}`}
              >
                <div className="col-span-2 flex items-center gap-2 min-w-0">
                  <SyncDot state={gt.syncState} />
                  <span className="text-xs text-white truncate">{displayName}</span>
                </div>
                <span className="text-xs font-mono text-center text-blue-300">
                  {ts ? ts.localStorageCount : '—'}
                </span>
                <span className="text-xs font-mono text-center text-purple-300">
                  {ts ? ts.localDocCount : gt.docCount}
                </span>
                <div className="flex items-center justify-center gap-1">
                  {ts ? (
                    ts.error ? (
                      <span className="text-[10px] text-red-400" title={ts.error}>hata</span>
                    ) : (
                      <>
                        <span className={`text-xs font-mono ${ts.couchDocCount > 0 ? (isOk ? 'text-emerald-300' : 'text-yellow-300') : 'text-gray-600'}`}>
                          {ts.exists ? ts.couchDocCount : '—'}
                        </span>
                        {isOk && ts.couchDocCount > 0 && <Cloud className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                        {!ts.exists && <CloudOff className="w-3 h-3 text-red-400 flex-shrink-0" />}
                      </>
                    )
                  ) : (
                    <span className="text-gray-600 text-xs">—</span>
                  )}
                </div>
                <span className={`text-[10px] text-center font-semibold ${syncColor(gt.syncState)}`}>
                  {syncLabel(gt.syncState)}
                </span>
              </div>
            );
          })}

          {syncTables.length === 0 && (
            <div className="px-5 py-8 text-center text-xs text-gray-600">
              Sync tabloları yükleniyor…
            </div>
          )}
        </div>
      </div>

      {/* ── Actions ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/2 p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white">Hızlı İşlemler</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleInitialize}
            disabled={initializing || !canEdit}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600/80 hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            {initializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Veritabanlarını Başlat
          </button>
          <button
            onClick={handleSeed}
            disabled={seeding || !canEdit}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            LocalStorage → PouchDB Aktar
          </button>
          <button
            onClick={loadTableStatus}
            disabled={statsLoading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/8 hover:bg-white/12 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            {statsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Tabloları Yenile
          </button>
        </div>
        {seeding && seedProgress && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 mt-1">
            <Play className="w-3 h-3" /> {seedProgress}
          </div>
        )}
        <p className="text-[11px] text-gray-600">
          <strong className="text-gray-500">Veritabanlarını Başlat:</strong> CouchDB'de mevcut olmayan tabloları oluşturur. Mevcut veriler silinmez.
          {' '}<strong className="text-gray-500">LocalStorage → PouchDB Aktar:</strong> Tarayıcıdaki tüm verileri PouchDB'ye kopyalar; ardından PouchDB → CouchDB sync otomatik devam eder.
        </p>
      </div>

      {/* ── CouchDB Config ──────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-white/2 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-400" />
          <h2 className="text-sm font-bold text-white">CouchDB Yapılandırması</h2>
          {!canEdit && <span className="text-[10px] text-gray-500 ml-2">Salt okunur — yetki gerekiyor</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Sunucu URL</label>
            <input
              value={cfg.url}
              onChange={e => setCfg(c => ({ ...c, url: e.target.value }))}
              placeholder="http://localhost:5984"
              className={inputClass}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Kullanıcı Adı</label>
            <input
              value={cfg.user}
              onChange={e => setCfg(c => ({ ...c, user: e.target.value }))}
              placeholder="admin"
              className={inputClass}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Şifre</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={cfg.password}
                onChange={e => setCfg(c => ({ ...c, password: e.target.value }))}
                placeholder="••••••••"
                className={inputClass}
                disabled={!canEdit}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTestConnection}
            disabled={connTesting}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            {connTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Bağlantıyı Test Et
          </button>
          {canEdit && (
            <button
              onClick={handleSaveConfig}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors"
            >
              <Save className="w-4 h-4" /> Kaydet & Yenile
            </button>
          )}
          {connStatus && (
            <span className={`text-xs font-bold flex items-center gap-1 ${connStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {connStatus.ok
                ? <><CheckCircle className="w-3.5 h-3.5" /> Bağlantı başarılı{connStatus.latencyMs ? ` (${connStatus.latencyMs}ms)` : ''}</>
                : <><XCircle className="w-3.5 h-3.5" /> {connStatus.error}</>
              }
            </span>
          )}
        </div>
      </div>

    </div>
  );
}
