/**
 * SyncStatusBar - Her sayfada gosterilen Supabase sync durumu paneli
 * KV store bazli senkronizasyon durumunu gercek zamanli gosterir
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Wifi,
  WifiOff,
  Upload,
  ExternalLink,
  Loader2,
  Zap,
  HardDrive,
  Clock,
} from 'lucide-react';
import { useSyncContext } from '../contexts/SyncContext';
import { getSupabaseSQLEditorUrl, getSupabaseTableEditorUrl } from '../lib/auto-setup';
import { toast } from 'sonner';
import { SUPABASE_ANON_KEY, SERVER_BASE_URL } from '../lib/supabase-config';

interface SyncStatusBarProps {
  tableName?: string;
}

const KV_SERVER_URL = SERVER_BASE_URL;

// localStorage'daki tum verileri KV Store'a gonder
// Always use server endpoints to bypass RLS (anon key cannot write to kv_store_daadfb0c)
async function pushAllLocalToSupabase(
  tableName: string,
  onProgress?: (msg: string) => void
): Promise<{ ok: number; fail: number }> {
  const STORAGE_PREFIX = 'isleyen_et_';

  // tableName -> storageKey eslestirmesi
  const TABLE_STORAGE_MAP: Record<string, string> = {
    personeller:       'personel_data',
    cari_hesaplar:     'cari_data',
    urunler:           'stok_data',
    araclar:           'arac_data',
    arac_shifts:       'arac_shifts',
    bankalar:          'bank_data',
    fisler:            'fisler',
    kasa_islemleri:    'kasa_data',
    cekler:            'cekler_data',
    uretim_profilleri: 'uretim_profiles',
    uretim_kayitlari:  'uretim_data',
    faturalar:         'faturalar',
    fatura_stok:       'fatura_stok',
  };

  const storageKey = TABLE_STORAGE_MAP[tableName];
  if (!storageKey) return { ok: 0, fail: 0 };

  const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
  if (!raw) return { ok: 0, fail: 0 };

  let items: any[] = [];
  try { items = JSON.parse(raw); } catch { return { ok: 0, fail: 0 }; }
  if (!Array.isArray(items) || items.length === 0) return { ok: 0, fail: 0 };

  onProgress?.(`${items.length} kayit KV Store'a gonderiliyor...`);

  let ok = 0;
  let fail = 0;

  // Always use server endpoint for writes (bypasses RLS via service_role_key)
  const chunkSize = 100;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const validItems = chunk.filter((item: any) => item && item.id);
    
    if (validItems.length === 0) continue;

    const keys = validItems.map((item: any) => `${tableName}_${item.id}`);
    const values = validItems.map((item: any) => item);

    try {
      const res = await fetch(`${KV_SERVER_URL}/kv/mset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ keys, values }),
      });
      if (res.ok) {
        ok += validItems.length;
        onProgress?.(`${ok}/${items.length} kayit gonderildi...`);
      } else {
        const text = await res.text().catch(() => 'unknown');
        console.error(`[pushAllLocalToSupabase] Server mset failed (${res.status}): ${text}`);
        fail += validItems.length;
      }
    } catch (e: any) {
      console.error('[pushAllLocalToSupabase] Server mset error:', e);
      fail += validItems.length;
    }
  }

  return { ok, fail };
}

export function SyncStatusBar({ tableName }: SyncStatusBarProps) {
  const { setupStatus, isChecking, lastChecked, recheckTables, isSupabaseConfigured } = useSyncContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  // Aktif tablodaki lokal veriyi Supabase'e gonder
  const handleSyncNow = async () => {
    if (!tableName || !isSupabaseConfigured || isSyncing) return;

    setIsSyncing(true);
    setSyncProgress('Senkronizasyon baslatildi...');
    toast.loading('Supabase\'e senkronize ediliyor...', { id: 'sync-toast' });

    try {
      const { ok, fail } = await pushAllLocalToSupabase(tableName, setSyncProgress);
      
      if (ok > 0 && fail === 0) {
        toast.success(`${ok} kayit basariyla Supabase'e yazildi!`, { id: 'sync-toast' });
      } else if (ok > 0 && fail > 0) {
        toast.warning(`${ok} basarili, ${fail} hatali kayit`, { id: 'sync-toast' });
      } else if (fail > 0) {
        toast.error(`${fail} kayit gonderilemedi`, { id: 'sync-toast' });
      } else {
        toast.info('Gonderilecek kayit bulunamadi', { id: 'sync-toast' });
      }

      await recheckTables();
    } catch (e: any) {
      toast.error(`Senkronizasyon hatasi: ${e.message}`, { id: 'sync-toast' });
    } finally {
      setIsSyncing(false);
      setSyncProgress('');
    }
  };

  // Supabase bagli degilse minimal goster
  if (!isSupabaseConfigured) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/60 border border-border/50 rounded-lg text-xs text-muted-foreground">
        <WifiOff className="w-3 h-3" />
        <span>Supabase bagli degil - Yerel depo</span>
      </div>
    );
  }

  if (!setupStatus) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/60 border border-border/50 rounded-lg text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Veritabani kontrol ediliyor...</span>
      </div>
    );
  }

  const isConnected = setupStatus.isConnected;
  const tablesWithData = setupStatus.tables.filter(t => t.rowCount > 0);
  const totalRecords = setupStatus.tables.reduce((sum, t) => sum + t.rowCount, 0);

  // Aktif tablonun durumu
  const activeTable = tableName
    ? setupStatus.tables.find(t => t.table === tableName)
    : null;

  return (
    <>
      <div className="mb-4">
        {/* Ana durum satiri */}
        <div
          className={`flex items-center gap-3 px-4 py-2 rounded-xl border cursor-pointer transition-all ${
            isConnected
              ? 'bg-green-950/40 border-green-800/50 hover:bg-green-950/60'
              : 'bg-red-950/40 border-red-800/50 hover:bg-red-950/60'
          }`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Sol: Baglanti gostergesi */}
          <div className={`flex items-center gap-2 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isChecking ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isConnected ? (
              <Zap className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            <Database className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">
              {isConnected ? 'KV Store Bagli' : 'Baglanti Yok'}
            </span>
          </div>

          {/* Orta: Tablo gostergeleri (mini dots) */}
          <div className="flex items-center gap-1 flex-1">
            {setupStatus.tables.map(t => (
              <div
                key={t.table}
                title={`${t.displayName}: ${t.rowCount} kayit`}
                className={`w-2 h-2 rounded-full transition-colors ${
                  t.table === tableName
                    ? t.rowCount > 0
                      ? 'bg-green-400 ring-1 ring-green-400 ring-offset-1 ring-offset-background'
                      : 'bg-yellow-400 ring-1 ring-yellow-400 ring-offset-1 ring-offset-background'
                    : t.rowCount > 0
                    ? 'bg-green-600'
                    : 'bg-muted-foreground/40'
                }`}
              />
            ))}
          </div>

          {/* Sag: Bilgi + butonlar */}
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {/* Toplam kayit */}
            <span className="text-xs text-muted-foreground">
              <HardDrive className="w-3 h-3 inline mr-1" />
              {totalRecords} kayit
            </span>

            {/* Latency */}
            {setupStatus.latencyMs && (
              <span className="text-xs text-muted-foreground">
                <Clock className="w-3 h-3 inline mr-1" />
                {setupStatus.latencyMs}ms
              </span>
            )}

            {/* Senkronize Et Butonu */}
            {tableName && isConnected && (
              <button
                onClick={handleSyncNow}
                disabled={isSyncing}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isSyncing
                    ? 'bg-blue-800/50 text-blue-400 cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm hover:shadow-blue-500/30'
                }`}
                title="Lokal veriyi Supabase'e yaz"
              >
                <Upload className={`w-3 h-3 ${isSyncing ? 'animate-bounce' : ''}`} />
                {isSyncing ? (syncProgress || 'Senkronize...') : 'Senkronize Et'}
              </button>
            )}

            {lastChecked && (
              <span className="text-xs text-muted-foreground">
                {lastChecked.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); recheckTables(); }}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Tablolari yeniden kontrol et"
            >
              <RefreshCw className={`w-3 h-3 text-muted-foreground ${isChecking ? 'animate-spin' : ''}`} />
            </button>
            {isExpanded ? (
              <ChevronUp className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Genisletilmis panel */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-2 bg-card/90 border border-border/50 rounded-xl p-4">
                {/* Baglanti bilgisi */}
                {isConnected && (
                  <div className="flex items-center gap-4 mb-4 px-3 py-2 bg-green-900/20 border border-green-700/30 rounded-lg text-xs">
                    <div className="flex items-center gap-1.5 text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span className="font-medium">KV Store Aktif</span>
                    </div>
                    <span className="text-muted-foreground">
                      Toplam: {setupStatus.kvTotalKeys ?? '?'} key
                    </span>
                    {setupStatus.latencyMs && (
                      <span className="text-muted-foreground">
                        Gecikme: {setupStatus.latencyMs}ms
                      </span>
                    )}
                    <span className="text-green-600 font-medium">
                      Dogrudan okuma aktif
                    </span>
                  </div>
                )}

                {/* Tablo grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {setupStatus.tables.map(t => (
                    <div
                      key={t.table}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                        t.table === tableName
                          ? t.rowCount > 0
                            ? 'bg-green-900/40 border-green-700/50 ring-1 ring-green-600/30'
                            : 'bg-yellow-900/40 border-yellow-700/50 ring-1 ring-yellow-600/30'
                          : t.rowCount > 0
                          ? 'bg-secondary/50 border-border/30'
                          : 'bg-secondary/30 border-border/20 opacity-60'
                      }`}
                    >
                      <span>{t.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${t.rowCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {t.displayName}
                        </p>
                        <p className="text-muted-foreground">
                          {t.rowCount > 0 ? `${t.rowCount} kayit` : 'Bos'}
                        </p>
                      </div>
                      {t.rowCount > 0 ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                      ) : (
                        <span className="w-3 h-3 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Baglanti durumu */}
                {isConnected ? (
                  <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-green-500" />
                      <p className="text-green-400 text-xs font-medium">
                        KV Store aktif - Dogrudan Supabase okuma/yazma
                      </p>
                    </div>
                    <a
                      href={getSupabaseTableEditorUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-secondary hover:bg-accent text-foreground text-xs rounded-lg font-medium transition-colors flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Supabase Tablo Editoru
                    </a>
                  </div>
                ) : (
                  <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <p className="text-red-400 text-xs font-medium">
                      Supabase baglantisiniz yok. Veriler yerel olarak saklanmaya devam edecek.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/**
 * Kompakt versiyon - Sayfa basliginin yaninda kucuk badge olarak
 */
export function SyncBadge({ tableName }: { tableName: string }) {
  const { setupStatus, isChecking } = useSyncContext();

  if (!setupStatus) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary text-muted-foreground text-xs rounded-full">
        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
        Kontrol ediliyor
      </span>
    );
  }

  const table = setupStatus.tables.find(t => t.table === tableName);
  if (!table) return null;

  if (!setupStatus.isConnected) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-900/40 text-yellow-400 text-xs rounded-full border border-yellow-700/40">
        <AlertTriangle className="w-2.5 h-2.5" />
        Yerel Depo
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary text-muted-foreground text-xs rounded-full">
      <CheckCircle2 className="w-2.5 h-2.5" />
      {isChecking ? 'Senkron ediliyor' : `Senkron - ${table.rowCount} kayit`}
    </span>
  );
}