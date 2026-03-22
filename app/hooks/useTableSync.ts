import { useState, useEffect, useCallback, useRef } from 'react';
import { SERVER_BASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase-config';
import {
  kvGetByPrefix,
  kvSubscribe,
  kvTestConnection,
} from '../lib/supabase-kv';

const SERVER_URL = SERVER_BASE_URL;
const STORAGE_PREFIX = 'isleyen_et_';

// ─── Retry utility
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || attempt === retries) return res;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return res;
    } catch (err) {
      if (attempt === retries) throw err;
    }
    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, delay));
    console.log(`[useTableSync] Retry attempt ${attempt + 1}/${retries}...`);
  }
  throw new Error('fetchWithRetry: exhausted retries');
}

// Supabase baglanti kontrolu - dogrudan kv_store tablosunu kontrol eder
let _kvConnectionChecked = false;
let _kvConnectionResult = false;

async function checkKVConnection(): Promise<boolean> {
  if (_kvConnectionChecked) return _kvConnectionResult;
  try {
    const result = await kvTestConnection();
    _kvConnectionResult = result.connected;
    _kvConnectionChecked = true;
    if (result.connected) {
      console.log(`%c[KV] Dogrudan baglanti basarili! ${result.totalKeys} key, ${result.latencyMs}ms`, 'color: #22c55e; font-weight: bold');
    } else {
      console.warn(`[KV] Baglanti basarisiz: ${result.error}`);
    }
    return result.connected;
  } catch {
    _kvConnectionChecked = true;
    _kvConnectionResult = false;
    return false;
  }
}

function isSupabaseConfigured(): boolean {
  return !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 10;
}

// ─── Version tracking for conflict detection ────────────────────────────────
const VERSION_SUFFIX = '__version';

function getLocalVersion(storageKey: string): number {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey + VERSION_SUFFIX);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

function bumpLocalVersion(storageKey: string): number {
  const next = Date.now();
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey + VERSION_SUFFIX, String(next));
  } catch {}
  return next;
}

// ─── localStorage helpers ───────────────────────────────────────────────────
function loadFromLS<T>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToLS<T>(storageKey: string, data: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(data));
    bumpLocalVersion(storageKey);
    setTimeout(() => window.dispatchEvent(new Event('storage_update')), 0);
  } catch {}
}

// ─── Silinmiş ID tombstone (cihazlar arası silinmiş kayıtları takip eder) ──
const DELETED_SUFFIX = '__deleted_ids';

function loadDeletedIds(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey + DELETED_SUFFIX);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set<string>(arr);
  } catch {
    return new Set<string>();
  }
}

function saveDeletedId(storageKey: string, id: string): void {
  try {
    const existing = loadDeletedIds(storageKey);
    existing.add(id);
    // Max 500 silinmiş ID sakla (eski olanları temizle)
    const arr = Array.from(existing).slice(-500);
    localStorage.setItem(STORAGE_PREFIX + storageKey + DELETED_SUFFIX, JSON.stringify(arr));
  } catch {}
}

// ─── Write queue for debounced writes ────────────────────────────────────
interface WriteOp {
  type: 'set' | 'del';
  key: string;
  value?: any;
}

class WriteQueue {
  private queue = new Map<string, WriteOp>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushFn: (ops: WriteOp[]) => Promise<void>;
  private debounceMs: number;

  constructor(flushFn: (ops: WriteOp[]) => Promise<void>, debounceMs = 300) {
    this.flushFn = flushFn;
    this.debounceMs = debounceMs;
  }

  push(op: WriteOp) {
    this.queue.set(op.key, op);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.queue.size === 0) return;

    const ops = Array.from(this.queue.values());
    this.queue.clear();

    try {
      await this.flushFn(ops);
    } catch (e) {
      console.error('[WriteQueue] flush error:', e);
      ops.forEach(op => this.queue.set(op.key, op));
      this.scheduleFlush();
    }
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.queue.clear();
  }
}

export type SyncState = 'idle' | 'loading' | 'synced' | 'error' | 'offline';

export interface UseTableSyncResult<T> {
  data: T[];
  syncState: SyncState;
  rowCount: number;
  lastSync: Date | null;
  error: string | null;
  isSupabase: boolean;
  addItem: (item: T) => Promise<T>;
  updateItem: (id: string, updates: Partial<T>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  batchUpdate: (updates: Array<{ id: string; changes: Partial<T> }>) => Promise<void>;
  refresh: () => Promise<void>;
  setData: (data: T[]) => void;
  syncToSupabase: () => Promise<{ ok: number; fail: number }>;
  syncHealth: SyncHealthInfo;
  forceResync: () => Promise<void>;
}

export interface SyncHealthInfo {
  lastSuccessfulSync: Date | null;
  consecutiveFailures: number;
  avgLatencyMs: number;
  pendingWrites: number;
  isHealthy: boolean;
}

export interface TableSyncConfig<T> {
  tableName: string;
  storageKey: string;
  initialData?: T[];
  orderBy?: string;
  orderAsc?: boolean;
  toDb?: (item: T) => any;
  fromDb?: (row: any) => T;
}

export function useTableSync<T extends { id: string }>(
  config: TableSyncConfig<T>
): UseTableSyncResult<T> {
  const { tableName, storageKey, initialData = [], orderBy = 'created_at', orderAsc = false, toDb, fromDb } = config;

  const [data, setDataState] = useState<T[]>(() => {
    const raw = loadFromLS<T[]>(storageKey) || initialData;
    if (fromDb && raw.length > 0) {
      try { return raw.map(item => fromDb(item as any)); } catch { return raw; }
    }
    return raw;
  });
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  const toDbRef = useRef(toDb);
  toDbRef.current = toDb;
  const fromDbRef = useRef(fromDb);
  fromDbRef.current = fromDb;
  const dataRef = useRef(data);
  dataRef.current = data;
  const initialFetchDone = useRef(false);
  const pendingWriteIds = useRef(new Set<string>());
  // Track whether direct KV READ access works (anon key can SELECT but NOT INSERT/UPDATE/DELETE due to RLS)
  // Writes MUST always go through the server which uses service_role_key to bypass RLS.
  const useDirectKVRead = useRef<boolean | null>(null);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
  });

  // ─── Server-side write helpers (bypass RLS via service_role_key) ───────────
  async function serverSet(key: string, value: any): Promise<void> {
    const res = await fetchWithRetry(`${SERVER_URL}/kv/set`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ key, value })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown');
      throw new Error(`server set failed (${res.status}): ${text}`);
    }
  }

  async function serverMSet(keys: string[], values: any[]): Promise<void> {
    const res = await fetchWithRetry(`${SERVER_URL}/kv/mset`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ keys, values })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown');
      throw new Error(`server mset failed (${res.status}): ${text}`);
    }
  }

  async function serverDel(key: string): Promise<void> {
    const res = await fetchWithRetry(`${SERVER_URL}/kv/del`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ key })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown');
      throw new Error(`server del failed (${res.status}): ${text}`);
    }
  }

  // ─── Write queue ─────────────────────────────────────────────────────────
  const writeQueueRef = useRef<WriteQueue | null>(null);

  if (!writeQueueRef.current && configured) {
    writeQueueRef.current = new WriteQueue(async (ops) => {
      const setOps = ops.filter(o => o.type === 'set');
      const delOps = ops.filter(o => o.type === 'del');

      // Batch set — always via server to bypass RLS
      if (setOps.length > 0) {
        const keys = setOps.map(o => o.key);
        const values = setOps.map(o => o.value);
        try {
          await serverMSet(keys, values);
          keys.forEach(k => {
            const id = k.replace(`${tableName}_`, '');
            pendingWriteIds.current.delete(id);
          });
        } catch (e) {
          console.error(`[WriteQueue] mset error for ${tableName}:`, e);
          throw e;
        }
      }

      // Batch delete — always via server to bypass RLS
      if (delOps.length > 0) {
        for (const op of delOps) {
          try {
            await serverDel(op.key);
            const id = op.key.replace(`${tableName}_`, '');
            pendingWriteIds.current.delete(id);
          } catch (e) {
            console.error(`[WriteQueue] del error for ${op.key}:`, e);
          }
        }
      }
    }, 300);
  }

  // Cleanup write queue on unmount
  useEffect(() => {
    return () => {
      if (writeQueueRef.current) {
        writeQueueRef.current.flush();
      }
    };
  }, []);

  const sortData = useCallback((items: T[]): T[] => {
    if (!orderBy) return items;
    return [...items].sort((a: any, b: any) => {
      if (a[orderBy] < b[orderBy]) return orderAsc ? -1 : 1;
      if (a[orderBy] > b[orderBy]) return orderAsc ? 1 : -1;
      return 0;
    });
  }, [orderBy, orderAsc]);

  const setData = useCallback((newData: T[]) => {
    setDataState(newData);
    saveToLS(storageKey, newData);
  }, [storageKey]);

  // ─── Smart merge: KV data + LS pending/unsynced changes ────────────────────
  const smartMerge = useCallback((kvItems: T[], lsItems: T[]): T[] => {
    const kvMap = new Map(kvItems.map(i => [i.id, i]));
    const merged = new Map<string, T>();

    // KV store is authoritative — start with KV data
    kvItems.forEach(item => merged.set(item.id, item));

    // Load tombstone of explicitly deleted IDs (persisted across sessions)
    const deletedIds = loadDeletedIds(storageKey);

    lsItems.forEach(item => {
      // Pending write from THIS session → local version takes priority
      if (pendingWriteIds.current.has(item.id)) {
        merged.set(item.id, item);
        return;
      }
      // Item in KV → KV is authoritative, already set above
      if (kvMap.has(item.id)) return;
      // Item NOT in KV and was explicitly deleted (tombstone) → skip (keeps it gone)
      if (deletedIds.has(item.id)) return;
      // Item NOT in KV and NOT deleted → it was added locally but not yet synced → keep it
      merged.set(item.id, item);
    });

    return Array.from(merged.values());
  }, [storageKey]);

  // Sync state between tabs/windows locally
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_PREFIX + storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setDataState(parsed);
        } catch {}
      }
    };
    const handleCustomEvent = () => {
      const fresh = loadFromLS<T[]>(storageKey);
      if (fresh) setDataState(fresh);
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('storage_update', handleCustomEvent);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('storage_update', handleCustomEvent);
    };
  }, [storageKey]);

  // ─── FETCH: Dogrudan Supabase veya Server uzerinden ───────────────────────
  const fetchData = useCallback(async () => {
    if (!configured) {
      setSyncState('offline');
      return;
    }

    setSyncState('loading');
    setError(null);

    try {
      // Oncelikle dogrudan Supabase client ile dene (daha hizli)
      let rows: any[] = [];
      let directWorked = false;

      try {
        const start = performance.now();
        rows = await kvGetByPrefix(`${tableName}_`);
        const elapsed = Math.round(performance.now() - start);
        directWorked = true;
        useDirectKVRead.current = true;
        
        if (!initialFetchDone.current) {
          console.log(
            `%c[useTableSync] ${tableName}: Dogrudan KV okuma basarili (${rows.length} kayit, ${elapsed}ms)`,
            'color: #22c55e'
          );
        }
      } catch (directErr: any) {
        // Dogrudan okuma basarisiz — sunucu endpoint'ine fallback
        console.warn(`[useTableSync] ${tableName}: Dogrudan KV basarisiz, sunucuya fallback:`, directErr.message);
        useDirectKVRead.current = false;
        
        try {
          const res = await fetchWithRetry(`${SERVER_URL}/kv/prefix/${tableName}_`, { headers: getHeaders() });
          if (!res.ok) throw new Error(`Server KV fetch failed (${res.status})`);
          const json = await res.json();
          if (!json.success) throw new Error(json.error || 'Unknown KV error');
          rows = json.data || [];
        } catch (serverErr: any) {
          throw new Error(`Hem dogrudan hem sunucu okuma basarisiz: ${serverErr.message}`);
        }
      }

      const mapped = fromDbRef.current
        ? rows.map((row: any) => fromDbRef.current!(row))
        : (rows as T[]);

      const currentLS = loadFromLS<T[]>(storageKey) || [];
      const merged = smartMerge(mapped, currentLS);
      const sorted = sortData(merged);

      setData(sorted);
      setSyncState('synced');
      setLastSync(new Date());
      initialFetchDone.current = true;
    } catch (e: any) {
      console.error(`[useTableSync] ${tableName} fetch error:`, e);
      setSyncState('offline');
      setError(e.message || 'Ag baglantisi yok veya sunucu hatasi');
    }
  }, [tableName, storageKey, configured, sortData, setData, smartMerge]);

  // ─── Realtime Subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!configured) return;

    const prefix = `${tableName}_`;
    const channelName = `kv_${tableName}_changes_${Date.now()}`;

    const unsubscribe = kvSubscribe(prefix, channelName, (event) => {
      const id = event.key.replace(prefix, '');

      // Kendi yazdiklarimizan echo'yu atla
      if (pendingWriteIds.current.has(id)) return;

      if (event.eventType === 'INSERT' || event.eventType === 'UPDATE') {
        const item = fromDbRef.current ? fromDbRef.current(event.value) : event.value;
        setDataState(prev => {
          const existingIndex = prev.findIndex(i => i.id === id);
          let updated;
          if (existingIndex !== -1) {
            updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], ...item };
          } else {
            updated = [item, ...prev];
          }
          const sorted = sortData(updated);
          saveToLS(storageKey, sorted);
          return sorted;
        });
      } else if (event.eventType === 'DELETE') {
        setDataState(prev => {
          const updated = prev.filter(item => item.id !== id);
          saveToLS(storageKey, updated);
          return updated;
        });
      }
      setLastSync(new Date());
    });

    return () => {
      unsubscribe();
    };
  }, [tableName, storageKey, configured, sortData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Periodic background resync (every 2 minutes) ─────────────────────────
  useEffect(() => {
    if (!configured) return;
    const RESYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && pendingWriteIds.current.size === 0) {
        fetchData().catch(() => {});
      }
    }, RESYNC_INTERVAL_MS);
    
    // Also resync when tab becomes visible after being hidden
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [configured, fetchData]);

  // ─── CRUD operations with optimistic updates + rollback ───────────────────

  const addItem = useCallback(async (item: T): Promise<T> => {
    setDataState(prev => {
      const updated = sortData([item, ...prev]);
      saveToLS(storageKey, updated);
      return updated;
    });

    if (!configured) return item;

    try {
      const dbItem = toDbRef.current ? toDbRef.current(item) : item;
      const key = `${tableName}_${item.id}`;
      pendingWriteIds.current.add(item.id);

      if (writeQueueRef.current) {
        writeQueueRef.current.push({ type: 'set', key, value: dbItem });
      } else {
        // Always write via server to bypass RLS
        await serverSet(key, dbItem);
        pendingWriteIds.current.delete(item.id);
      }
      return item;
    } catch (e: any) {
      console.error(`[addItem] ${tableName} exception:`, e);
      setDataState(prev => {
        const rolledBack = prev.filter(i => i.id !== item.id);
        saveToLS(storageKey, rolledBack);
        return rolledBack;
      });
      return item; // Return original item even on sync failure (optimistic)
    }
  }, [tableName, storageKey, configured, sortData]);

  const updateItem = useCallback(async (id: string, updates: Partial<T>): Promise<void> => {
    const oldItem = dataRef.current.find(i => i.id === id);

    setDataState(prev => {
      const updated = prev.map(item => item.id === id ? { ...item, ...updates } : item);
      saveToLS(storageKey, updated);
      return updated;
    });

    if (!configured) return;

    try {
      const existingAppItem = oldItem;
      if (!existingAppItem) return;

      const mergedAppItem = { ...existingAppItem, ...updates };
      const dbItem = toDbRef.current ? toDbRef.current(mergedAppItem) : mergedAppItem;
      const key = `${tableName}_${id}`;
      pendingWriteIds.current.add(id);

      if (writeQueueRef.current) {
        writeQueueRef.current.push({ type: 'set', key, value: dbItem });
      } else {
        // Always write via server to bypass RLS
        await serverSet(key, dbItem);
        pendingWriteIds.current.delete(id);
      }
    } catch (e: any) {
      console.error(`[updateItem] ${tableName} exception:`, e);
      if (oldItem) {
        setDataState(prev => {
          const rolledBack = prev.map(item => item.id === id ? oldItem : item);
          saveToLS(storageKey, rolledBack);
          return rolledBack;
        });
      }
      pendingWriteIds.current.delete(id);
    }
  }, [tableName, storageKey, configured]);

  const deleteItem = useCallback(async (id: string): Promise<void> => {
    const deletedItem = dataRef.current.find(i => i.id === id);

    // Tombstone: silinmiş ID'yi kaydet (smartMerge'de geri gelmemesi için)
    saveDeletedId(storageKey, id);

    setDataState(prev => {
      const updated = prev.filter(item => item.id !== id);
      saveToLS(storageKey, updated);
      return updated;
    });

    if (!configured) return;

    try {
      const key = `${tableName}_${id}`;
      pendingWriteIds.current.add(id);

      if (writeQueueRef.current) {
        writeQueueRef.current.push({ type: 'del', key });
      } else {
        // Always write via server to bypass RLS
        await serverDel(key);
      }
      pendingWriteIds.current.delete(id);
    } catch (e: any) {
      console.error(`[deleteItem] ${tableName} exception:`, e);
      if (deletedItem) {
        setDataState(prev => {
          const restored = sortData([deletedItem, ...prev]);
          saveToLS(storageKey, restored);
          return restored;
        });
      }
      pendingWriteIds.current.delete(id);
    }
  }, [tableName, storageKey, configured, sortData]);

  const batchUpdate = useCallback(async (updates: Array<{ id: string; changes: Partial<T> }>): Promise<void> => {
    if (updates.length === 0) return;

    const oldItems = new Map<string, T>();
    updates.forEach(u => {
      const item = dataRef.current.find(i => i.id === u.id);
      if (item) oldItems.set(u.id, item);
    });

    const updateMap = new Map(updates.map(u => [u.id, u.changes]));
    setDataState(prev => {
      const updated = prev.map(item => {
        const changes = updateMap.get(item.id);
        return changes ? { ...item, ...changes } : item;
      });
      saveToLS(storageKey, updated);
      return updated;
    });

    if (!configured) return;

    try {
      const keys: string[] = [];
      const values: any[] = [];

      updates.forEach(u => {
        const oldItem = oldItems.get(u.id);
        if (!oldItem) return;
        const merged = { ...oldItem, ...u.changes };
        const dbItem = toDbRef.current ? toDbRef.current(merged) : merged;
        keys.push(`${tableName}_${u.id}`);
        values.push(dbItem);
        pendingWriteIds.current.add(u.id);
      });

      if (keys.length > 0) {
        // Always write via server to bypass RLS
        await serverMSet(keys, values);
        keys.forEach(k => {
          const id = k.replace(`${tableName}_`, '');
          pendingWriteIds.current.delete(id);
        });
      }
    } catch (e: any) {
      console.error(`[batchUpdate] ${tableName} exception:`, e);
      setDataState(prev => {
        const rolledBack = prev.map(item => {
          const old = oldItems.get(item.id);
          return old || item;
        });
        saveToLS(storageKey, rolledBack);
        return rolledBack;
      });
      updates.forEach(u => pendingWriteIds.current.delete(u.id));
    }
  }, [tableName, storageKey, configured]);

  const syncToSupabase = useCallback(async (): Promise<{ ok: number; fail: number }> => {
    if (!configured) return { ok: 0, fail: 0 };
    
    const current = loadFromLS<T[]>(storageKey) || [];
    if (current.length === 0) return { ok: 0, fail: 0 };

    setSyncState('loading');
    
    try {
      const keys = current.map(item => `${tableName}_${item.id}`);
      const values = current.map(item => toDbRef.current ? toDbRef.current(item) : item);
      
      // Always write via server to bypass RLS
      await serverMSet(keys, values);
      
      await fetchData();
      return { ok: current.length, fail: 0 };
    } catch (e) {
      console.error('Sync failed', e);
      setSyncState('error');
      return { ok: 0, fail: current.length };
    }
  }, [tableName, storageKey, configured, fetchData]);

  const syncHealth = useRef<SyncHealthInfo>({
    lastSuccessfulSync: null,
    consecutiveFailures: 0,
    avgLatencyMs: 0,
    pendingWrites: 0,
    isHealthy: true,
  });

  const forceResync = useCallback(async (): Promise<void> => {
    await fetchData();
  }, [fetchData]);

  return {
    data,
    syncState,
    rowCount: data.length,
    lastSync,
    error,
    isSupabase: configured && syncState === 'synced',
    addItem,
    updateItem,
    deleteItem,
    batchUpdate,
    refresh: fetchData,
    setData,
    syncToSupabase,
    syncHealth: syncHealth.current,
    forceResync,
  };
}