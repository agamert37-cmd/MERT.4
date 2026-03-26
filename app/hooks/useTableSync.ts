// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Opus 4.6
/**
 * useTableSync — PouchDB + CouchDB Tablo Senkronizasyonu
 *
 * Her tableName, ayrı bir PouchDB veritabanına karşılık gelir (mert_{tableName}).
 * CouchDB ile continuous sync otomatik yapılır.
 *
 * Önceki Supabase versiyonunun aynı API'si korunmuştur:
 *   - data, syncState, addItem, updateItem, deleteItem, batchUpdate, refresh, setData
 *   - toDb/fromDb dönüşümleri
 *   - Optimistik güncelleme + hata durumunda rollback
 *
 * Kaldırılan karmaşıklıklar:
 *   - WriteQueue (PouchDB yerel yazıyor, sync otomatik)
 *   - WAL / dual-write (PouchDB/CouchDB replication ile gereksiz)
 *   - Connection cooldown (PouchDB retry ile hallediliyor)
 *   - Server fallback endpoints (artık yok)
 *   - Tombstone tracking (PouchDB _deleted ile yapıyor)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDb } from '../lib/pouchdb';
import { setInStorage } from '../utils/storage';

// ─── Tipler ───────────────────────────────────────────────────────────────────

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
  isSupabase: boolean; // eski uyumluluk — artık her zaman false
  addItem: (item: T) => Promise<T>;
  updateItem: (id: string, updates: Partial<T>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  batchUpdate: (updates: Array<{ id: string; changes: Partial<T> }>) => Promise<void>;
  refresh: () => Promise<void>;
  setData: (data: T[]) => void;
  syncToSupabase: () => Promise<{ ok: number; fail: number }>; // eski uyumluluk — artık no-op
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

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

/** PouchDB doc'dan _id, _rev gibi dahili alanları temizle */
function cleanDoc(doc: any): any {
  if (!doc) return doc;
  const { _id, _rev, _deleted, _conflicts, _attachments, ...rest } = doc;
  // _id'yi id'ye map et (eğer id yoksa)
  if (!rest.id && _id) rest.id = _id;
  return rest;
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

  const [data, setDataState] = useState<T[]>(initialData);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);

  // Stabil ref'ler
  const toDbRef = useRef(toDb);
  toDbRef.current = toDb;
  const fromDbRef = useRef(fromDb);
  fromDbRef.current = fromDb;
  const dataRef = useRef(data);
  dataRef.current = data;
  const dbRef = useRef<PouchDB.Database | null>(null);
  const changesRef = useRef<PouchDB.Core.Changes<{}> | null>(null);
  const initialLoadDone = useRef(false);

  // ─── Sıralama ──────────────────────────────────────────────────────────────
  const sortData = useCallback((items: T[]): T[] => {
    if (!orderBy) return items;
    return [...items].sort((a: any, b: any) => {
      if (a[orderBy] < b[orderBy]) return orderAsc ? -1 : 1;
      if (a[orderBy] > b[orderBy]) return orderAsc ? 1 : -1;
      return 0;
    });
  }, [orderBy, orderAsc]);

  const setData = useCallback((newData: T[]) => {
    setDataState(sortData(newData));
  }, [sortData]);

  // ─── localStorage write-through (DashboardPage vb. için) ─────────────────
  useEffect(() => {
    if (storageKey && data.length > 0) {
      setInStorage(storageKey, data);
    }
  }, [data, storageKey]);

  // ─── PouchDB'den tüm veriyi oku ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setSyncState('loading');
    setError(null);

    const start = performance.now();
    try {
      const db = getDb(tableName);
      dbRef.current = db;

      const result = await db.allDocs({ include_docs: true });
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);

      const items = result.rows
        .filter((row: any) => !row.doc?._deleted)
        .map((row: any) => {
          const cleaned = cleanDoc(row.doc);
          return fromDbRef.current ? fromDbRef.current(cleaned) : cleaned as T;
        });

      const sorted = sortData(items);

      if (!initialLoadDone.current) {
        console.log(
          `%c[useTableSync] ${tableName}: ${sorted.length} kayıt, ${elapsed}ms (PouchDB)`,
          'color: #22c55e; font-weight: bold'
        );
        initialLoadDone.current = true;
      }

      setDataState(sorted);
      setSyncState('synced');
      setLastSync(new Date());
      setConsecutiveFailures(0);
    } catch (e: any) {
      console.error(`[useTableSync] ${tableName} fetch hatası:`, e.message);
      setSyncState('error');
      setError(e.message || 'Veri okuma hatası');
      setConsecutiveFailures(prev => prev + 1);
    }
  }, [tableName, sortData]);

  // ─── İlk yükleme + PouchDB changes feed ──────────────────────────────────
  // Not: CouchDB sync GlobalTableSyncProvider tarafından başlatılır (startAllSync)
  useEffect(() => {
    fetchData();

    // PouchDB changes feed — realtime güncellemeler (yerel + CouchDB'den gelen)
    const db = getDb(tableName);
    const changes = db.changes({
      since: 'now',
      live: true,
      include_docs: true,
    });

    changes.on('change', (change: any) => {
      if (change.deleted) {
        setDataState(prev => {
          const updated = prev.filter(i => i.id !== change.id);
          return updated;
        });
      } else if (change.doc) {
        const cleaned = cleanDoc(change.doc);
        const item = fromDbRef.current ? fromDbRef.current(cleaned) : cleaned as T;

        setDataState(prev => {
          const idx = prev.findIndex(i => i.id === change.id);
          let updated: T[];
          if (idx !== -1) {
            updated = [...prev];
            updated[idx] = item;
          } else {
            updated = [item, ...prev];
          }
          return sortData(updated);
        });
      }
      setLastSync(new Date());
    });

    changes.on('error', (err: any) => {
      console.error(`[useTableSync] ${tableName} changes error:`, err);
    });

    changesRef.current = changes;

    return () => {
      changes.cancel();
    };
  }, [tableName, fetchData, sortData]);

  // ─── CRUD — Optimistik güncelleme ──────────────────────────────────────────

  const addItem = useCallback(async (item: T): Promise<T> => {
    // Optimistik ekleme
    setDataState(prev => sortData([item, ...prev]));

    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const db = getDb(tableName);
        const dbRow = toDbRef.current ? toDbRef.current(item) : item;
        if (attempt === 0) {
          await db.put({ ...dbRow, _id: item.id });
        } else {
          // Conflict retry — son _rev ile
          const existing = await db.get(item.id);
          await db.put({ ...dbRow, _id: item.id, _rev: (existing as any)._rev });
        }
        return item; // başarılı
      } catch (e: any) {
        if (e.status === 409 && attempt < MAX_RETRIES - 1) continue;
        console.error(`[addItem] ${tableName}:`, e.message);
        // Rollback — DB'ye yazılamadı
        setDataState(prev => prev.filter(i => i.id !== item.id));
        return item;
      }
    }
    return item;
  }, [tableName, sortData]);

  const updateItem = useCallback(async (id: string, updates: Partial<T>): Promise<void> => {
    const oldItem = dataRef.current.find(i => i.id === id);

    // Optimistik güncelleme
    setDataState(prev =>
      prev.map(item => item.id === id ? { ...item, ...updates } : item)
    );

    try {
      const db = getDb(tableName);
      let existing: any;
      try {
        existing = await db.get(id);
      } catch {
        // Doc yok — oluştur
        if (!oldItem) return;
        const merged = { ...oldItem, ...updates };
        const dbRow = toDbRef.current ? toDbRef.current(merged) : merged;
        await db.put({ ...dbRow, _id: id });
        return;
      }

      const cleaned = cleanDoc(existing);
      const currentItem = fromDbRef.current ? fromDbRef.current(cleaned) : cleaned as T;
      const merged = { ...currentItem, ...updates };
      const dbRow = toDbRef.current ? toDbRef.current(merged) : merged;
      await db.put({ ...dbRow, _id: id, _rev: existing._rev });
    } catch (e: any) {
      console.error(`[updateItem] ${tableName}:`, e.message);
      // Rollback
      if (oldItem) {
        setDataState(prev =>
          prev.map(item => item.id === id ? oldItem : item)
        );
      }
    }
  }, [tableName]);

  const deleteItem = useCallback(async (id: string): Promise<void> => {
    const deletedItem = dataRef.current.find(i => i.id === id);

    // Optimistik silme
    setDataState(prev => prev.filter(item => item.id !== id));

    try {
      const db = getDb(tableName);
      const doc = await db.get(id);
      await db.remove(doc);
    } catch (e: any) {
      if (e.status !== 404) {
        console.error(`[deleteItem] ${tableName}:`, e.message);
        // Rollback
        if (deletedItem) {
          setDataState(prev => sortData([deletedItem, ...prev]));
        }
      }
    }
  }, [tableName, sortData]);

  const batchUpdate = useCallback(async (
    updates: Array<{ id: string; changes: Partial<T> }>
  ): Promise<void> => {
    if (updates.length === 0) return;

    const oldItems = new Map<string, T>();
    updates.forEach(u => {
      const item = dataRef.current.find(i => i.id === u.id);
      if (item) oldItems.set(u.id, item);
    });

    // Optimistik güncelleme
    const updateMap = new Map(updates.map(u => [u.id, u.changes]));
    setDataState(prev =>
      prev.map(item => {
        const changes = updateMap.get(item.id);
        return changes ? { ...item, ...changes } : item;
      })
    );

    try {
      const db = getDb(tableName);
      const ids = updates.map(u => u.id);
      const existing = await db.allDocs({ keys: ids, include_docs: true });

      const docs = updates.map(u => {
        const row = existing.rows.find((r: any) => r.id === u.id && !r.error) as any;
        const old = oldItems.get(u.id) || {} as any;
        const merged = { ...old, ...u.changes };
        const dbRow = toDbRef.current ? toDbRef.current(merged) : merged;
        return {
          ...dbRow,
          _id: u.id,
          _rev: row?.doc ? (row.doc as any)._rev : undefined,
        };
      });

      if (docs.length > 0) {
        await db.bulkDocs(docs);
      }
    } catch (e: any) {
      console.error(`[batchUpdate] ${tableName}:`, e.message);
      // Rollback
      setDataState(prev =>
        prev.map(item => oldItems.get(item.id) || item)
      );
    }
  }, [tableName]);

  // ─── Eski uyumluluk fonksiyonları ──────────────────────────────────────────

  /** Eski syncToSupabase — artık no-op, PouchDB otomatik senkronize eder */
  const syncToSupabase = useCallback(async (): Promise<{ ok: number; fail: number }> => {
    // PouchDB ↔ CouchDB sync otomatik, manuel sync gerekmez
    await fetchData();
    return { ok: data.length, fail: 0 };
  }, [fetchData, data.length]);

  const refresh = useCallback(async () => { await fetchData(); }, [fetchData]);

  const forceResync = useCallback(async () => {
    initialLoadDone.current = false;
    await fetchData();
  }, [fetchData]);

  const syncHealth: SyncHealthInfo = {
    lastSuccessfulSync: lastSync,
    consecutiveFailures,
    avgLatencyMs: latencyMs,
    pendingWrites: 0, // PouchDB'de bekleyen yazma yok — hepsi anında yerel
    isHealthy: consecutiveFailures < 3,
  };

  return {
    data,
    syncState,
    rowCount: data.length,
    lastSync,
    error,
    isSupabase: false, // Artık PouchDB kullanıyoruz
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
