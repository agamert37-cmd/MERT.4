// [AJAN-3 | claude/multi-db-sync-setup-3DmYn | 2026-03-27]
/**
 * SyncContext - Global senkronizasyon durumu yönetimi
 * PouchDB + CouchDB bağlantı durumunu takip eder.
 * setupStatus.tables SyncStatusBar'ın beklediği formatla uyumludur.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { testCouchDbConnection, getAllDbStats } from '../lib/pouchdb';

// Tablo görüntü adları ve ikonları
const TABLE_META: Record<string, { displayName: string; icon: string }> = {
  fisler:            { displayName: 'Fişler',       icon: '🧾' },
  urunler:           { displayName: 'Ürünler',      icon: '📦' },
  cari_hesaplar:     { displayName: 'Cari',         icon: '👥' },
  kasa_islemleri:    { displayName: 'Kasa',         icon: '💰' },
  personeller:       { displayName: 'Personel',     icon: '👤' },
  bankalar:          { displayName: 'Bankalar',     icon: '🏦' },
  cekler:            { displayName: 'Çekler',       icon: '📄' },
  araclar:           { displayName: 'Araçlar',      icon: '🚚' },
  arac_shifts:       { displayName: 'Vardiyalar',   icon: '🔄' },
  arac_km_logs:      { displayName: 'KM Logları',   icon: '📍' },
  uretim_profilleri: { displayName: 'Ürt. Profil',  icon: '🏭' },
  uretim_kayitlari:  { displayName: 'Üretim',       icon: '⚙️' },
  faturalar:         { displayName: 'Faturalar',    icon: '🧾' },
  fatura_stok:       { displayName: 'Fatst.',       icon: '📋' },
  tahsilatlar:       { displayName: 'Tahsilat',     icon: '💳' },
};

export interface TableSetupStatus {
  table: string;
  displayName: string;
  icon: string;
  rowCount: number;
}

export interface SetupStatus {
  isConnected: boolean;
  tables: TableSetupStatus[];
  latencyMs?: number;
  kvTotalKeys?: number;
}

interface TableStatus {
  table: string;
  displayName: string;
  rowCount: number;
  icon: string;
}

interface SyncContextValue {
  setupStatus: SetupStatus | null;
  setupStatus: {
    isConnected: boolean;
    tables?: TableStatus[];
    latencyMs?: number;
    kvTotalKeys?: number;
  } | null;
  isChecking: boolean;
  lastChecked: Date | null;
  recheckTables: () => Promise<void>;
  isSupabaseConfigured: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: number;
  isOnline: boolean;
  syncError: string | null;
}

const SyncContext = createContext<SyncContextValue>({
  setupStatus: null,
  isChecking: false,
  lastChecked: null,
  recheckTables: async () => {},
  isSupabaseConfigured: true,
  pendingCount: 0,
  isSyncing: false,
  lastSyncAt: 0,
  isOnline: true,
  syncError: null,
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncError, setSyncError] = useState<string | null>(null);
  const isCheckingRef = useRef(false);

  const recheckTables = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setIsChecking(true);
    try {
      const t0 = performance.now();
      const [couchResult, dbStats] = await Promise.all([
        testCouchDbConnection(),
        getAllDbStats().catch(() => []),
      ]);
      const latencyMs = Math.round(performance.now() - t0);

      const tables: TableSetupStatus[] = dbStats.map(s => ({
        table: s.tableName,
        displayName: TABLE_META[s.tableName]?.displayName ?? s.tableName,
        icon: TABLE_META[s.tableName]?.icon ?? '📁',
        rowCount: s.docCount,
      }));

      setSetupStatus({
        isConnected: couchResult.ok,
        tables,
        latencyMs,
        kvTotalKeys: undefined,
      });
      setSyncError(couchResult.ok ? null : couchResult.error || 'CouchDB bağlantı hatası');
      setLastChecked(new Date());
    } catch (e: any) {
      setSetupStatus({ isConnected: false, tables: [] });
      setSyncError(e.message);
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, []);

  // İlk kontrol
  useEffect(() => {
    const timer = setTimeout(() => recheckTables(), 2000);
    return () => clearTimeout(timer);
  }, [recheckTables]);

  // Periyodik kontrol (60s)
  useEffect(() => {
    const interval = setInterval(() => recheckTables(), 60000);
    return () => clearInterval(interval);
  }, [recheckTables]);

  // Online/offline takibi — debounce ile hızlı ağ değişimlerinde çoklu recheck'i önle
  useEffect(() => {
    let recheckTimer: ReturnType<typeof setTimeout> | null = null;
    const onOnline = () => {
      setIsOnline(true);
      if (recheckTimer) clearTimeout(recheckTimer);
      recheckTimer = setTimeout(() => recheckTables(), 1000);
    };
    const onOffline = () => {
      if (recheckTimer) clearTimeout(recheckTimer);
      setIsOnline(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      if (recheckTimer) clearTimeout(recheckTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [recheckTables]);

  return (
    <SyncContext.Provider value={{
      setupStatus,
      isChecking,
      lastChecked,
      recheckTables,
      isSupabaseConfigured: true,
      pendingCount: 0,
      isSyncing: false,
      lastSyncAt: lastChecked?.getTime() || 0,
      isOnline,
      syncError,
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  return useContext(SyncContext);
}
