// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Opus 4.6
/**
 * SyncContext - Global senkronizasyon durumu yönetimi
 * PouchDB + CouchDB bağlantı durumunu takip eder
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { testCouchDbConnection } from '../lib/pouchdb';

interface TableStatus {
  table: string;
  displayName: string;
  rowCount: number;
  icon: string;
}

interface SyncContextValue {
  setupStatus: {
    isConnected: boolean;
    tables?: TableStatus[];
    latencyMs?: number;
    kvTotalKeys?: number;
  } | null;
  isChecking: boolean;
  lastChecked: Date | null;
  recheckTables: () => Promise<void>;
  isSupabaseConfigured: boolean; // eski uyumluluk — artık her zaman true (PouchDB yerel)
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
  const [setupStatus, setSetupStatus] = useState<{ isConnected: boolean } | null>(null);
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
      const result = await testCouchDbConnection();
      setSetupStatus({ isConnected: result.ok });
      setSyncError(result.ok ? null : result.error || 'CouchDB bağlantı hatası');
      setLastChecked(new Date());
    } catch (e: any) {
      setSetupStatus({ isConnected: false });
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
      isSupabaseConfigured: true, // PouchDB her zaman hazır (yerel)
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
