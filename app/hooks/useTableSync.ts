// [AJAN-2 | claude/serene-gagarin | 2026-03-24] Son düzenleyen: Claude Sonnet 4.6
/**
 * useTableSync — Doğrudan Supabase Tablo Senkronizasyonu
 *
 * Her tableName, Supabase'deki gerçek bir tabloya karşılık gelir.
 * KV store yerine doğrudan tablo operasyonları kullanılır:
 *   - Okuma  : supabase.from(table).select('*')
 *   - Yazma  : supabase.from(table).upsert(row, { onConflict: 'id' })
 *   - Silme  : supabase.from(table).delete().eq('id', id)
 *   - Gerçek zamanlı: postgres_changes subscription
 *
 * Veri kaybı önleme:
 *   - localStorage önbellek (anlık yükleme + çevrimdışı destek)
 *   - Optimistik güncelleme + hata durumunda rollback
 *   - Silinmiş ID tombstone (birden fazla cihaz arası silme çakışması önleme)
 *   - Bekleyen yazma takibi (kendi değişikliklerimizin realtime echo'sunu atlama)
 *   - Adaptif yazma kuyruğu (batch, debounce, backoff)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { SUPABASE_ANON_KEY, SERVER_BASE_URL } from '../lib/supabase-config';

const SERVER_URL = SERVER_BASE_URL;
const STORAGE_PREFIX = 'isleyen_et_';

// ─── localStorage yardımcıları ───────────────────────────────────────────────

function loadFromLS<T>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveToLS<T>(storageKey: string, data: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(data));
    setTimeout(() => window.dispatchEvent(new Event('storage_update')), 0);
  } catch {}
}

// ─── Silinmiş ID tombstone (çakışma önleme) ──────────────────────────────────
const DELETED_SUFFIX = '__deleted_ids';

function loadDeletedIds(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey + DELETED_SUFFIX);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch { return new Set<string>(); }
}

function saveDeletedId(storageKey: string, id: string): void {
  try {
    const existing = loadDeletedIds(storageKey);
    existing.add(id);
    const arr = Array.from(existing).slice(-500); // Maksimum 500 tombstone
    localStorage.setItem(STORAGE_PREFIX + storageKey + DELETED_SUFFIX, JSON.stringify(arr));
  } catch {}
}

// ─── Bağlantı hata yönetimi ─────────────────────────────────────────────────
let _lastConnectionFailure = 0;
const CONNECTION_COOLDOWN_MS = 15_000; // 15 saniye bekleme sonrası tekrar dene

function isConnectionCoolingDown(): boolean {
  return Date.now() - _lastConnectionFailure < CONNECTION_COOLDOWN_MS;
}

function markConnectionFailure() { _lastConnectionFailure = Date.now(); }
function clearConnectionCooldown() { _lastConnectionFailure = 0; }

// ─── Supabase doğrudan tablo operasyonları ────────────────────────────────────

/** Tablodan tüm satırları sıraya göre oku */
async function tableSelect<T>(tableName: string, orderBy: string, orderAsc: boolean): Promise<T[]> {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .order(orderBy, { ascending: orderAsc });

  if (error) throw new Error(`[tableSelect] ${tableName}: ${error.message} (code: ${error.code})`);
  return (data ?? []) as T[];
}

/** Tek veya çoklu satır upsert (id çakışmasında güncelle) */
async function tableUpsert(tableName: string, rows: any[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from(tableName)
    .upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`[tableUpsert] ${tableName}: ${error.message}`);
}

/** Satır sil */
async function tableDelete(tableName: string, id: string): Promise<void> {
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', id);
  if (error) throw new Error(`[tableDelete] ${tableName}: ${error.message}`);
}

// ─── Server endpoint fallback (RLS sorunlarında yedek) ─────────────────────
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

async function serverUpsertFallback(tableName: string, rows: any[]): Promise<void> {
  if (rows.length === 0) return;
  const keys = rows.map(r => `${tableName}_${r.id}`);
  const res = await fetch(`${SERVER_URL}/kv/mset`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ keys, values: rows }),
  });
  if (!res.ok) throw new Error(`serverUpsert fallback failed (${res.status})`);
}

async function serverDeleteFallback(tableName: string, id: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/kv/del`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ key: `${tableName}_${id}` }),
  });
  if (!res.ok) throw new Error(`serverDelete fallback failed (${res.status})`);
}

// ─── Adaptif yazma kuyruğu ────────────────────────────────────────────────────
const PRIORITY_TABLES = new Set(['fisler', 'kasa_islemleri', 'bankalar', 'cekler']);

interface WriteOp {
  type: 'upsert' | 'delete';
  id: string;
  row?: any; // upsert için
}

class WriteQueue {
  private queue = new Map<string, WriteOp>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushFnRef: React.MutableRefObject<(ops: WriteOp[]) => Promise<void>>;
  private readonly minDebounceMs: number;
  private readonly maxDebounceMs: number;
  totalWrites = 0;
  failedWrites = 0;
  private retryCount = 0;

  constructor(
    flushFnRef: React.MutableRefObject<(ops: WriteOp[]) => Promise<void>>,
    debounceMs = 300,
    tableName = '',
  ) {
    this.flushFnRef = flushFnRef;
    this.minDebounceMs = PRIORITY_TABLES.has(tableName) ? 60 : debounceMs;
    this.maxDebounceMs = debounceMs * 3;
  }

  push(op: WriteOp) {
    // Aynı id için önceki işlemi ezeriz (son işlem kazanır)
    this.queue.set(op.id, op);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.timer) clearTimeout(this.timer);
    const size = this.queue.size;
    let delay: number;
    if (size >= 20)       delay = 0;
    else if (size >= 10)  delay = this.minDebounceMs;
    else {
      const t = Math.min((size - 1) / 9, 1);
      delay = Math.round(this.maxDebounceMs + t * (this.minDebounceMs - this.maxDebounceMs));
    }
    if (delay === 0) {
      Promise.resolve().then(() => this.flush());
    } else {
      this.timer = setTimeout(() => this.flush(), delay);
    }
  }

  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.queue.size === 0) return;

    const ops = Array.from(this.queue.values());
    this.queue.clear();
    this.totalWrites += ops.length;

    try {
      await this.flushFnRef.current(ops);
      this.retryCount = 0;
    } catch (e) {
      console.error(`[WriteQueue] flush error (${ops.length} ops):`, e);
      this.failedWrites += ops.length;
      // Başarısız işlemleri kuyruğa geri al
      ops.forEach(op => this.queue.set(op.id, op));
      // Üstel geri çekilme (max 30 saniye)
      this.retryCount = Math.min(this.retryCount + 1, 5);
      const backoff = Math.min(1000 * Math.pow(2, this.retryCount), 30_000);
      this.timer = setTimeout(() => this.flush(), backoff);
    }
  }

  get pendingCount(): number { return this.queue.size; }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.queue.clear();
  }
}

// ─── Tipler ────────────────────────────────────────────────────────────────────
export type SyncState = 'idle' | 'loading' | 'synced' | 'error' | 'offline';

export interface SyncHealthInfo {
  lastSuccessfulSync: Date | null;
  consecutiveFailures: number;
  avgLatencyMs: number;
  pendingWrites: number;
  isHealthy: boolean;
}

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

export interface TableSyncConfig<T> {
  tableName: string;
  storageKey: string;
  initialData?: T[];
  orderBy?: string;
  orderAsc?: boolean;
  toDb?: (item: T) => any;
  fromDb?: (row: any) => T;
}

function isSupabaseConfigured(): boolean {
  return !!SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 10;
}

// ─── Ana Hook ─────────────────────────────────────────────────────────────────
export function useTableSync<T extends { id: string }>(
  config: TableSyncConfig<T>
): UseTableSyncResult<T> {
  const {
    tableName,
    storageKey,
    initialData = [],
    orderBy = 'created_at',
    orderAsc = false,
    toDb,
    fromDb,
  } = config;

  // localStorage'dan anlık yükleme (sayfa açılışında görüntülenecek ilk veri)
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
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);

  const configured = isSupabaseConfigured();

  // Stabil ref'ler (useCallback bağımlılıklarını minimize eder)
  const toDbRef = useRef(toDb);
  toDbRef.current = toDb;
  const fromDbRef = useRef(fromDb);
  fromDbRef.current = fromDb;
  const dataRef = useRef(data);
  dataRef.current = data;
  const initialFetchDone = useRef(false);
  // Kendi yazmalarımızın realtime echo'sunu atlamak için
  const pendingWriteIds = useRef(new Set<string>());

  // ─── WriteQueue flush fonksiyonu (her render'da güncellenir) ──────────────
  const flushFnRef = useRef<(ops: WriteOp[]) => Promise<void>>(async () => {});
  flushFnRef.current = async (ops: WriteOp[]) => {
    const upsertOps = ops.filter(o => o.type === 'upsert');
    const deleteOps = ops.filter(o => o.type === 'delete');

    // ── Upsert işlemleri ─────────────────────────────────────────────────────
    if (upsertOps.length > 0) {
      const rows = upsertOps.map(o => o.row);
      try {
        await tableUpsert(tableName, rows);
      } catch (directErr: any) {
        // Doğrudan yazma başarısız → server KV fallback
        console.warn(`[WriteQueue:${tableName}] Doğrudan upsert başarısız, server fallback:`, directErr.message);
        await serverUpsertFallback(tableName, rows);
      }
      upsertOps.forEach(op => pendingWriteIds.current.delete(op.id));
    }

    // ── Delete işlemleri ─────────────────────────────────────────────────────
    for (const op of deleteOps) {
      try {
        await tableDelete(tableName, op.id);
      } catch (directErr: any) {
        console.warn(`[WriteQueue:${tableName}] Doğrudan delete başarısız, server fallback:`, directErr.message);
        await serverDeleteFallback(tableName, op.id);
      }
      pendingWriteIds.current.delete(op.id);
    }
  };

  // ─── WriteQueue (ilk render'da bir kez oluşturulur) ──────────────────────
  const writeQueueRef = useRef<WriteQueue | null>(null);
  if (!writeQueueRef.current && configured) {
    writeQueueRef.current = new WriteQueue(flushFnRef, 300, tableName);
  }

  // Unmount'ta bekleyen yazmaları flush et
  useEffect(() => {
    return () => {
      if (writeQueueRef.current) {
        writeQueueRef.current.flush().catch(() => {});
      }
    };
  }, []);

  // ─── Veriyi sırala ───────────────────────────────────────────────────────
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

  // ─── Sekmeler arası senkronizasyon ────────────────────────────────────────
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_PREFIX + storageKey && e.newValue) {
        try { setDataState(JSON.parse(e.newValue)); } catch {}
      }
    };
    const handleCustom = () => {
      const fresh = loadFromLS<T[]>(storageKey);
      if (fresh) setDataState(fresh);
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('storage_update', handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('storage_update', handleCustom);
    };
  }, [storageKey]);

  // ─── Veri getir: Doğrudan Supabase tablo okuma ─────────────────────────────
  const fetchData = useCallback(async () => {
    if (!configured) { setSyncState('offline'); return; }
    if (isConnectionCoolingDown()) return;

    setSyncState('loading');
    setError(null);

    const start = performance.now();
    try {
      const rows = await tableSelect<any>(tableName, orderBy, orderAsc);
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);

      if (!initialFetchDone.current) {
        console.log(
          `%c[useTableSync] ${tableName}: ${rows.length} kayıt, ${elapsed}ms`,
          'color: #22c55e; font-weight: bold'
        );
      }

      // fromDb dönüşümü uygula
      const mapped = fromDbRef.current
        ? rows.map(row => fromDbRef.current!(row))
        : (rows as T[]);

      // Çakışma çözümü: Supabase yetkili kaynak, ama bekleyen yerel yazmaları koru
      const deletedIds = loadDeletedIds(storageKey);
      const remoteMap = new Map(mapped.map(i => [i.id, i]));
      const localData = loadFromLS<T[]>(storageKey) || [];
      const merged = new Map<string, T>(remoteMap);

      localData.forEach(item => {
        // Bekleyen yazma → yerel versiyon öncelikli
        if (pendingWriteIds.current.has(item.id)) {
          merged.set(item.id, item);
        } else if (!remoteMap.has(item.id) && !deletedIds.has(item.id)) {
          // Supabase'de yok + tombstone yok → henüz senkronize olmamış yerel kayıt → sakla
          merged.set(item.id, item);
        }
      });

      const sorted = sortData(Array.from(merged.values()));
      setData(sorted);
      setSyncState('synced');
      setLastSync(new Date());
      setConsecutiveFailures(0);
      clearConnectionCooldown();
      initialFetchDone.current = true;
    } catch (e: any) {
      console.error(`[useTableSync] ${tableName} fetch hatası:`, e.message);
      markConnectionFailure();
      setSyncState('offline');
      setError(e.message || 'Bağlantı hatası');
      setConsecutiveFailures(prev => prev + 1);
    }
  }, [tableName, storageKey, configured, orderBy, orderAsc, sortData, setData]);

  // ─── Gerçek zamanlı abonelik (her tablo için postgres_changes) ─────────────
  useEffect(() => {
    if (!configured) return;

    const channelName = `rt_${tableName}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: tableName },
        (payload: any) => {
          const eventType: string = payload.eventType;
          const record = payload.new as any;
          const oldRecord = payload.old as any;
          const id: string | undefined = record?.id ?? oldRecord?.id;
          if (!id) return;

          // Kendi yazdıklarımızın echo'sunu atla
          if (pendingWriteIds.current.has(id)) return;

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const item = fromDbRef.current ? fromDbRef.current(record) : record as T;
            setDataState(prev => {
              const idx = prev.findIndex(i => i.id === id);
              let updated: T[];
              if (idx !== -1) {
                updated = [...prev];
                updated[idx] = { ...updated[idx], ...item };
              } else {
                updated = [item, ...prev];
              }
              const sorted = sortData(updated);
              saveToLS(storageKey, sorted);
              return sorted;
            });
          } else if (eventType === 'DELETE') {
            setDataState(prev => {
              const updated = prev.filter(i => i.id !== id);
              saveToLS(storageKey, updated);
              return updated;
            });
          }
          setLastSync(new Date());
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log(`%c[RT] ${tableName} gerçek zamanlı aktif`, 'color: #a78bfa');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName, storageKey, configured, sortData]);

  // ─── İlk yükleme ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── 2 dakikada bir arka plan yenileme ────────────────────────────────────
  useEffect(() => {
    if (!configured) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && pendingWriteIds.current.size === 0) {
        fetchData().catch(() => {});
      }
    }, 2 * 60 * 1000);

    // BUG FIX [AJAN-2]: Mobil arka plandan dönerken:
    //   1. Module-level bağlantı cooldown'ı temizle (diğer tablonun hatası bizi engelliyor olabilir)
    //   2. Yeni veri çek
    //   3. Bekleyen yazmaları gönder
    // Gizlenince bekleyen yazmaları hemen flush et (sayfa kapanmadan önce gönder)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        clearConnectionCooldown(); // Eski cooldown'ı temizle — mobil için kritik
        fetchData().catch(() => {});
        writeQueueRef.current?.flush().catch(() => {});
      } else if (document.visibilityState === 'hidden') {
        // Arka plana geçerken bekleyen yazmaları zorla gönder
        writeQueueRef.current?.flush().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [configured, fetchData]);

  // ─── CRUD — Optimistik güncelleme + hata durumunda rollback ──────────────

  const addItem = useCallback(async (item: T): Promise<T> => {
    // Optimistik ekleme
    setDataState(prev => {
      const updated = sortData([item, ...prev]);
      saveToLS(storageKey, updated);
      return updated;
    });

    if (!configured) return item;

    try {
      const dbRow = toDbRef.current ? toDbRef.current(item) : item;
      pendingWriteIds.current.add(item.id);

      if (writeQueueRef.current) {
        writeQueueRef.current.push({ type: 'upsert', id: item.id, row: dbRow });
      } else {
        await tableUpsert(tableName, [dbRow]);
        pendingWriteIds.current.delete(item.id);
      }
      return item;
    } catch (e: any) {
      console.error(`[addItem] ${tableName}:`, e);
      pendingWriteIds.current.delete(item.id);
      // Optimistik ekle localStorage'da kalır (veri kaybı yok)
      return item;
    }
  }, [tableName, storageKey, configured, sortData]);

  const updateItem = useCallback(async (id: string, updates: Partial<T>): Promise<void> => {
    const oldItem = dataRef.current.find(i => i.id === id);

    // Optimistik güncelleme
    setDataState(prev => {
      const updated = prev.map(item => item.id === id ? { ...item, ...updates } : item);
      saveToLS(storageKey, updated);
      return updated;
    });

    if (!configured) return;

    try {
      if (!oldItem) return;
      const merged = { ...oldItem, ...updates };
      const dbRow = toDbRef.current ? toDbRef.current(merged) : merged;
      pendingWriteIds.current.add(id);

      if (writeQueueRef.current) {
        writeQueueRef.current.push({ type: 'upsert', id, row: dbRow });
      } else {
        await tableUpsert(tableName, [dbRow]);
        pendingWriteIds.current.delete(id);
      }
    } catch (e: any) {
      console.error(`[updateItem] ${tableName}:`, e);
      if (oldItem) {
        setDataState(prev => {
          const rb = prev.map(item => item.id === id ? oldItem : item);
          saveToLS(storageKey, rb);
          return rb;
        });
      }
      pendingWriteIds.current.delete(id);
    }
  }, [tableName, storageKey, configured]);

  const deleteItem = useCallback(async (id: string): Promise<void> => {
    const deletedItem = dataRef.current.find(i => i.id === id);
    saveDeletedId(storageKey, id);

    // Optimistik silme
    setDataState(prev => {
      const updated = prev.filter(item => item.id !== id);
      saveToLS(storageKey, updated);
      return updated;
    });

    if (!configured) return;

    try {
      pendingWriteIds.current.add(id);
      if (writeQueueRef.current) {
        writeQueueRef.current.push({ type: 'delete', id });
      } else {
        await tableDelete(tableName, id);
        pendingWriteIds.current.delete(id);
      }
    } catch (e: any) {
      console.error(`[deleteItem] ${tableName}:`, e);
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

  const batchUpdate = useCallback(async (
    updates: Array<{ id: string; changes: Partial<T> }>
  ): Promise<void> => {
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
      const rows: any[] = [];
      updates.forEach(u => {
        const old = oldItems.get(u.id);
        if (!old) return;
        const merged = { ...old, ...u.changes };
        const dbRow = toDbRef.current ? toDbRef.current(merged) : merged;
        rows.push(dbRow);
        pendingWriteIds.current.add(u.id);
      });

      if (rows.length > 0) {
        await tableUpsert(tableName, rows);
        updates.forEach(u => pendingWriteIds.current.delete(u.id));
      }
    } catch (e: any) {
      console.error(`[batchUpdate] ${tableName}:`, e);
      setDataState(prev => {
        const rb = prev.map(item => oldItems.get(item.id) || item);
        saveToLS(storageKey, rb);
        return rb;
      });
      updates.forEach(u => pendingWriteIds.current.delete(u.id));
    }
  }, [tableName, storageKey, configured]);

  // ─── Manuel senkronizasyon (localStorage → Supabase) ──────────────────────
  const syncToSupabase = useCallback(async (): Promise<{ ok: number; fail: number }> => {
    if (!configured) return { ok: 0, fail: 0 };
    const current = loadFromLS<T[]>(storageKey) || [];
    if (current.length === 0) return { ok: 0, fail: 0 };

    setSyncState('loading');
    let ok = 0; let fail = 0;
    const CHUNK = 100;

    for (let i = 0; i < current.length; i += CHUNK) {
      const chunk = current.slice(i, i + CHUNK);
      try {
        const rows = chunk.map(item => toDbRef.current ? toDbRef.current(item) : item);
        await tableUpsert(tableName, rows);
        ok += chunk.length;
      } catch {
        fail += chunk.length;
      }
    }

    setSyncState(fail === 0 ? 'synced' : 'error');
    if (fail === 0) setLastSync(new Date());
    return { ok, fail };
  }, [tableName, storageKey, configured]);

  const refresh = useCallback(async () => { await fetchData(); }, [fetchData]);

  const forceResync = useCallback(async () => {
    initialFetchDone.current = false;
    clearConnectionCooldown();
    await fetchData();
  }, [fetchData]);

  const syncHealth: SyncHealthInfo = {
    lastSuccessfulSync: lastSync,
    consecutiveFailures,
    avgLatencyMs: latencyMs,
    pendingWrites: writeQueueRef.current?.pendingCount ?? 0,
    isHealthy: consecutiveFailures < 3 && (writeQueueRef.current?.failedWrites ?? 0) < 5,
  };

  return {
    data,
    syncState,
    rowCount: data.length,
    lastSync,
    error,
    isSupabase: configured && syncState !== 'offline',
    addItem,
    updateItem,
    deleteItem,
    batchUpdate,
    refresh,
    setData,
    syncToSupabase,
    syncHealth,
    forceResync,
  };
}
