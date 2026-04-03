/**
 * SyncStatusBar — Gelişmiş senkronizasyon durumu paneli
 * Framer Motion spring animasyonları, dinamik açılma/kapanma,
 * nabız efekti ve premium koyu tema tasarımı.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wifi,
  WifiOff,
  Upload,
  Loader2,
  Zap,
  HardDrive,
  Clock,
  ChevronDown,
  Activity,
} from 'lucide-react';
import { useSyncContext } from '../contexts/SyncContext';
import { useGlobalSyncTables } from '../contexts/GlobalTableSyncContext';
import { toast } from 'sonner';

interface SyncStatusBarProps {
  tableName?: string;
}

// [AJAN-2] BUG FIX: localStorage verisini Supabase'e göndermeden önce toDb dönüşümü uygula
// Eski kod ham camelCase veri gönderiyordu → Supabase sütun adı uyuşmazlığı → gönderilemedi hatası
import { productToDb } from '../pages/StokPage';
import { cariToDb } from '../pages/CariPage';

// Tablo→localStorage key + toDb dönüşüm haritası
const TABLE_CONFIG: Record<string, { storageKey: string; toDb?: (item: any) => any }> = {
  personeller:       { storageKey: 'personel_data', toDb: (p: any) => ({
    id: p.id, name: p.name, username: p.username, position: p.position, role: p.role, status: p.status,
    phone: p.phone, email: p.email, last_login: p.lastLogin || p.last_login, join_date: p.joinDate || p.join_date,
    department: p.department, salary: p.salary, active: p.active, pin_code: p.pinCode || p.pin_code,
    password: p.password, permissions: typeof p.permissions === 'string' ? p.permissions : JSON.stringify(p.permissions || []),
  }) },
  cari_hesaplar:     { storageKey: 'cari_data', toDb: cariToDb },
  urunler:           { storageKey: 'stok_data', toDb: productToDb },
  araclar:           { storageKey: 'arac_data', toDb: (v: any) => ({
    id: v.id, plate: v.plate, model: v.model, driver: v.driver, km: v.km,
    last_maintenance: v.lastMaintenance || v.last_maintenance, next_inspection: v.nextInspection || v.next_inspection,
    insurance: v.insurance, status: v.status,
  }) },
  arac_shifts:       { storageKey: 'arac_shifts' },
  arac_km_logs:      { storageKey: 'arac_km_logs' },
  bankalar:          { storageKey: 'bank_data' },
  fisler:            { storageKey: 'fisler' },
  kasa_islemleri:    { storageKey: 'kasa_data' },
  cekler:            { storageKey: 'cekler_data' },
  uretim_profilleri: { storageKey: 'uretim_profiles' },
  uretim_kayitlari:  { storageKey: 'uretim_data' },
  faturalar:         { storageKey: 'faturalar' },
  fatura_stok:       { storageKey: 'fatura_stok' },
  tahsilatlar:       { storageKey: 'tahsilatlar' },
};

async function pushAllLocalToSupabase(
  _tableName: string,
  _onProgress?: (msg: string) => void
): Promise<{ ok: number; fail: number }> {
  // no-op: sync handled by PouchDB/useTableSync
  return { ok: 0, fail: 0 };
}

export function SyncStatusBar({ tableName }: SyncStatusBarProps) {
  const {
    setupStatus, isChecking, lastChecked, recheckTables, isSupabaseConfigured,
    pendingCount, isSyncing: isCloudSyncing, lastSyncAt, isOnline: cloudOnline, syncError,
  } = useSyncContext();
  const { tables: globalTables } = useGlobalSyncTables();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  const handleSyncNow = async () => {
    if (!tableName || !isSupabaseConfigured || isSyncing) return;

    setIsSyncing(true);
    setSyncProgress('Başlatılıyor...');
    toast.loading('CouchDB\'ye senkronize ediliyor...', { id: 'sync-toast' });

    try {
      const { ok, fail } = await pushAllLocalToSupabase(tableName, setSyncProgress);

      if (ok > 0 && fail === 0) {
        toast.success(`${ok} kayıt başarıyla yazıldı!`, { id: 'sync-toast' });
      } else if (ok > 0 && fail > 0) {
        toast.warning(`${ok} başarılı, ${fail} hatalı`, { id: 'sync-toast' });
      } else if (fail > 0) {
        toast.error(`${fail} kayıt gönderilemedi`, { id: 'sync-toast' });
      } else {
        toast.info('Gönderilecek kayıt bulunamadı', { id: 'sync-toast' });
      }

      await recheckTables();
    } catch (e: any) {
      toast.error(`Hata: ${e.message}`, { id: 'sync-toast' });
    } finally {
      setIsSyncing(false);
      setSyncProgress('');
    }
  };

  // Supabase bağlı değilse minimal göster
  if (!isSupabaseConfigured) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border border-white/8 rounded-xl text-xs text-white/30 mb-4"
      >
        <WifiOff className="w-3 h-3" />
        <span>Yerel depo — bulut bağlantısı yok</span>
      </motion.div>
    );
  }

  if (!setupStatus) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border border-white/8 rounded-xl text-xs text-white/40 mb-4"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Veritabanı kontrol ediliyor...</span>
      </motion.div>
    );
  }

  const isConnected = setupStatus.isConnected;
  const extStatus = setupStatus as any;
  const latencyMs: number | undefined = extStatus.latencyMs;
  const kvTotalKeys: number | undefined = extStatus.kvTotalKeys;

  // Tablo görüntüleme adları ve ikonları
  const TABLE_DISPLAY: Record<string, { displayName: string; icon: string }> = {
    fisler: { displayName: 'Fişler', icon: '🧾' },
    urunler: { displayName: 'Ürünler', icon: '🥩' },
    cari_hesaplar: { displayName: 'Cari', icon: '👥' },
    kasa_islemleri: { displayName: 'Kasa', icon: '💰' },
    personeller: { displayName: 'Personel', icon: '👤' },
    bankalar: { displayName: 'Bankalar', icon: '🏦' },
    cekler: { displayName: 'Çekler', icon: '📋' },
    araclar: { displayName: 'Araçlar', icon: '🚛' },
    arac_shifts: { displayName: 'Araç Vardiya', icon: '🔄' },
    arac_km_logs: { displayName: 'KM Logs', icon: '📍' },
    uretim_profilleri: { displayName: 'Üretim Profil', icon: '⚙️' },
    uretim_kayitlari: { displayName: 'Üretim', icon: '🏭' },
    faturalar: { displayName: 'Faturalar', icon: '📄' },
    fatura_stok: { displayName: 'Fatura Stok', icon: '📦' },
    tahsilatlar: { displayName: 'Tahsilatlar', icon: '💳' },
  };

  // GlobalTableSyncContext verisini JSX'in beklediği formata dönüştür
  const tables = globalTables.map(t => ({
    table: t.name,
    displayName: TABLE_DISPLAY[t.name]?.displayName ?? t.name,
    rowCount: t.docCount,
    icon: TABLE_DISPLAY[t.name]?.icon ?? '📊',
    syncState: t.syncState,
    lastSyncAt: t.lastSyncAt,
  }));

  // Gerçek per-tablo verisi GlobalTableSyncContext'ten
  const totalRecords = globalTables.reduce((sum, t) => sum + t.docCount, 0);
  const tablesWithData = globalTables.filter(t => t.docCount > 0).length;

  return (
    <div className="mb-4">
      {/* ── Ana bar ───────────────────────────────────────────── */}
      <motion.div
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={() => setIsExpanded(v => !v)}
        className={`
          relative flex items-center gap-3 px-4 py-2.5 rounded-2xl border cursor-pointer
          overflow-hidden select-none transition-colors duration-300
          ${isConnected
            ? 'bg-emerald-950/30 border-emerald-800/30 hover:border-emerald-700/50 hover:bg-emerald-950/40'
            : 'bg-red-950/30 border-red-800/30 hover:border-red-700/50 hover:bg-red-950/40'
          }
        `}
      >
        {/* Arka plan ışıltısı */}
        <div
          className={`absolute inset-0 opacity-[0.04] pointer-events-none ${
            isConnected
              ? 'bg-gradient-to-r from-emerald-500 via-transparent to-transparent'
              : 'bg-gradient-to-r from-red-500 via-transparent to-transparent'
          }`}
        />

        {/* Bağlantı göstergesi */}
        <div className="relative flex items-center gap-2 flex-shrink-0">
          {/* Nabız animasyonu */}
          {isConnected && !isChecking && (
            <span className="absolute -inset-1.5">
              <motion.span
                className="block w-full h-full rounded-full bg-emerald-500/20"
                animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </span>
          )}
          <div className={`relative w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isConnected ? 'bg-emerald-500/15' : 'bg-red-500/15'
          }`}>
            {isChecking ? (
              <RefreshCw className="w-3.5 h-3.5 text-white/50 animate-spin" />
            ) : isConnected ? (
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            )}
          </div>
        </div>

        {/* Durum metni */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${isConnected ? 'text-emerald-300' : 'text-red-300'}`}>
              {isChecking ? 'Kontrol ediliyor...' : isConnected ? 'Bulut Bağlı' : 'Bağlantı Yok'}
            </span>
            {isConnected && (
              <motion.span
                key={totalRecords}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-[10px] text-white/30 font-mono"
              >
                {totalRecords} kayıt · {tablesWithData}/{tables.length} tablo
              </motion.span>
            )}
            {latencyMs && isConnected && (
              <span className="text-[10px] text-white/20 font-mono hidden sm:inline">
                {latencyMs}ms
              </span>
            )}
            {/* Canlı sync durumu */}
            {(isCloudSyncing || pendingCount > 0) && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 text-[10px] font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full"
              >
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                {pendingCount > 0 ? `${pendingCount} bekliyor` : 'Gönderiliyor'}
              </motion.span>
            )}
            {!isCloudSyncing && pendingCount === 0 && lastSyncAt > 0 && (
              <span className="text-[10px] text-white/20 font-mono hidden sm:inline">
                son sync {new Date(lastSyncAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {syncError && !isCloudSyncing && (
              <span className="text-[10px] text-red-400/70 hidden sm:inline truncate max-w-[120px]" title={syncError}>
                ⚠ {syncError}
              </span>
            )}
            {!cloudOnline && (
              <span className="text-[10px] text-amber-400/80 font-semibold">
                Çevrimdışı
              </span>
            )}
          </div>
        </div>

        {/* Tablo dots */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {tables.map((t, i) => (
            <motion.div
              key={t.table}
              title={`${t.displayName}: ${t.rowCount} kayıt`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.03, type: 'spring', stiffness: 500, damping: 25 }}
              className={`rounded-full transition-all duration-300 ${
                t.table === tableName
                  ? t.rowCount > 0
                    ? 'w-2.5 h-2.5 bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                    : 'w-2.5 h-2.5 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                  : t.rowCount > 0
                  ? 'w-1.5 h-1.5 bg-emerald-600/80'
                  : 'w-1.5 h-1.5 bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* Sağ: butonlar */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {/* Senkronize Et butonu */}
          {tableName && isConnected && (
            <motion.button
              onClick={handleSyncNow}
              disabled={isSyncing}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isSyncing
                  ? 'bg-blue-800/40 text-blue-400 cursor-wait'
                  : 'bg-blue-600/80 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20'
              }`}
            >
              <Upload className={`w-3 h-3 ${isSyncing ? 'animate-bounce' : ''}`} />
              <span className="hidden sm:inline">
                {isSyncing ? (syncProgress || 'Senkronize...') : 'Senkronize Et'}
              </span>
            </motion.button>
          )}

          {/* Yenile */}
          <motion.button
            onClick={() => recheckTables()}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-1.5 hover:bg-white/8 rounded-lg transition-colors"
            title="Yenile"
          >
            <RefreshCw className={`w-3 h-3 text-white/30 ${isChecking ? 'animate-spin' : ''}`} />
          </motion.button>

          {/* Son kontrol zamanı */}
          {lastChecked && (
            <span className="text-[10px] text-white/20 font-mono hidden md:inline">
              {lastChecked.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {/* Expand chevron */}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <ChevronDown className="w-3.5 h-3.5 text-white/25" />
          </motion.div>
        </div>
      </motion.div>

      {/* ── Genişletilmiş panel ────────────────────────────────── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0, y: -4 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-2xl border border-white/8 bg-[#0d1117] overflow-hidden">
              {/* Başlık şeridi */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-xs font-semibold text-white/60">Veritabanı Durumu</span>
                  {isConnected && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"
                    >
                      <CheckCircle2 className="w-2.5 h-2.5" /> Aktif
                    </motion.span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/25 font-mono">
                  {latencyMs && <span>{latencyMs}ms gecikme</span>}
                  {kvTotalKeys != null && <span>{kvTotalKeys} KV key</span>}
                </div>
              </div>

              {/* Tablo grid */}
              <div className="p-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {tables.map((t, i) => (
                    <motion.div
                      key={t.table}
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 28 }}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-all
                        ${t.table === tableName
                          ? t.rowCount > 0
                            ? 'bg-emerald-950/40 border-emerald-700/40 shadow-[inset_0_0_12px_rgba(52,211,153,0.06)]'
                            : 'bg-amber-950/40 border-amber-700/40'
                          : t.rowCount > 0
                          ? 'bg-white/[0.03] border-white/8'
                          : 'bg-transparent border-white/5 opacity-50'
                        }
                      `}
                    >
                      <span className="text-sm leading-none">{t.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate text-[11px] ${
                          t.rowCount > 0 ? 'text-white/80' : 'text-white/30'
                        }`}>
                          {t.displayName}
                        </p>
                        <p className="text-white/25 text-[9px]">
                          {t.rowCount > 0 ? `${t.rowCount} kayıt` : 'Boş'}
                        </p>
                      </div>
                      {t.rowCount > 0
                        ? <CheckCircle2 className="w-3 h-3 text-emerald-500/70 flex-shrink-0" />
                        : <span className="w-2.5 h-2.5 rounded-full bg-white/8 flex-shrink-0" />
                      }
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Alt bilgi şeridi */}
              <div className={`
                flex items-center justify-between px-4 py-3 border-t border-white/5
                ${isConnected ? 'bg-emerald-950/20' : 'bg-red-950/20'}
              `}>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <Zap className="w-3.5 h-3.5 text-emerald-500" />
                      <p className="text-[11px] text-emerald-400/80 font-medium">
                        KV Store aktif — Supabase okuma/yazma çalışıyor
                      </p>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                      <p className="text-[11px] text-red-400/80 font-medium">
                        Bağlantı yok — veriler yalnızca yerel olarak saklanıyor
                      </p>
                    </>
                  )}
                </div>
                {/* Table editor link removed — using CouchDB */}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Kompakt versiyon — sayfa başlığının yanında küçük badge
 */
export function SyncBadge({ tableName }: { tableName: string }) {
  const { setupStatus, isChecking } = useSyncContext();
  const { tables: globalTables } = useGlobalSyncTables();

  if (!setupStatus) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 text-white/30 text-xs rounded-full border border-white/8">
        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
        Kontrol ediliyor
      </span>
    );
  }

  const table = globalTables.find(t => t.name === tableName);
  if (!table) return null;

  if (!setupStatus.isConnected) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-950/40 text-amber-400 text-xs rounded-full border border-amber-700/30">
        <AlertTriangle className="w-2.5 h-2.5" />
        Yerel
      </span>
    );
  }

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-950/40 text-emerald-400 text-xs rounded-full border border-emerald-700/30"
    >
      <CheckCircle2 className="w-2.5 h-2.5" />
      {isChecking ? 'Senkron ediliyor' : `${table.docCount} kayıt`}
    </motion.span>
  );
}
