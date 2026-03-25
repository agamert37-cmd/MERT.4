// [AJAN-2 | claude/serene-gagarin | 2026-03-24] Son düzenleyen: Claude Sonnet 4.6
/**
 * SyncContext - Global senkronizasyon durumu yonetimi
 * KV store bazli tablo durumlarini takip eder
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { checkAllTables, type SetupStatus } from '../lib/auto-setup';
import { SUPABASE_ANON_KEY } from '../lib/supabase-config';
import { getSyncState } from '../utils/supabase-storage';

interface SyncContextValue {
  setupStatus: SetupStatus | null;
  isChecking: boolean;
  lastChecked: Date | null;
  recheckTables: () => Promise<void>;
  isSupabaseConfigured: boolean;
  // Reaktif sync durumu
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
  isSupabaseConfigured: false,
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
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [liveSyncState, setLiveSyncState] = useState(getSyncState());
  const isCheckingRef = useRef(false);

  // sync_state_change event'ini dinle
  useEffect(() => {
    const handler = (e: Event) => {
      setLiveSyncState((e as CustomEvent).detail);
    };
    window.addEventListener('sync_state_change', handler);
    return () => window.removeEventListener('sync_state_change', handler);
  }, []);

  const isSupabaseConfigured = useMemo(() => {
    return !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 10;
  }, [SUPABASE_ANON_KEY]);

  const recheckTables = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSetupStatus({
        isConnected: false,
        tables: [],
        allTablesExist: false,
        missingTables: [],
      });
      return;
    }

    // Eş zamanlı çalışmayı önle
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setIsChecking(true);
    try {
      const status = await checkAllTables();
      setSetupStatus(status);
      setLastChecked(new Date());
      if (status.isConnected) {
        setConsecutiveFailures(0);
      } else {
        setConsecutiveFailures(prev => prev + 1);
      }
    } catch (e) {
      console.warn('SyncContext check error:', e);
      setConsecutiveFailures(prev => prev + 1);
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [isSupabaseConfigured]);

  // Uygulama acildiginda otomatik kontrol et
  useEffect(() => {
    if (isSupabaseConfigured) {
      const timer = setTimeout(() => recheckTables(), 2000);
      return () => clearTimeout(timer);
    }
  }, [recheckTables, isSupabaseConfigured]);

  // Otomatik yenile — bağlantı hatasında interval'i artır (backoff)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Normal: 60s, failure'da: min(60s * 2^failures, 300s)
    const intervalMs = Math.min(60000 * Math.pow(2, consecutiveFailures), 300000);
    const interval = setInterval(() => recheckTables(), intervalMs);
    return () => clearInterval(interval);
  }, [recheckTables, isSupabaseConfigured, consecutiveFailures]);

  // BUG FIX [AJAN-2]: Ağ bağlantısı geri gelince hemen kontrol et.
  // Önceden sadece backoff interval'ı vardı — ağ geldikten sonra 5 dakikaya kadar beklenebiliyordu.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const onOnline = () => {
      setConsecutiveFailures(0); // Hata sayacını sıfırla
      recheckTables();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [recheckTables, isSupabaseConfigured]);

  return (
    <SyncContext.Provider value={{
      setupStatus,
      isChecking,
      lastChecked,
      recheckTables,
      isSupabaseConfigured,
      pendingCount: liveSyncState.pendingCount,
      isSyncing: liveSyncState.isSyncing,
      lastSyncAt: liveSyncState.lastSyncAt,
      isOnline: liveSyncState.isOnline,
      syncError: liveSyncState.lastError,
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  return useContext(SyncContext);
}