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
import { toast } from 'sonner';
import { broadcastTableChange, onBroadcastMessage } from '../lib/broadcast-sync';
import { logChange } from '../lib/db-changelog';

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type SyncState = 'idle' | 'loading' | 'synced' | 'error' | 'offline';

export interface SyncHealthInfo {
  lastSuccessfulSync: Date | null;
  consecutiveFailures: number;
  avgLatencyMs: number;
  pendingWrites: number;
  isHealthy: boolean;
}

export interface ConflictInfo {
  id: string;
  tableName: string;
  localDoc: any;
  conflictRevs: string[];
  conflictDocs: any[];
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
  // Sayfalama
  hasMore: boolean;
  totalCount: number;
  loadMore: () => void;
  // Çakışma yönetimi
  conflicts: ConflictInfo[];
  resolveConflict: (id: string, winnerRev: string) => Promise<void>;
}

export interface TableSyncConfig<T> {
  tableName: string;
  storageKey: string;
  initialData?: T[];
  orderBy?: string;
  orderAsc?: boolean;
  toDb?: (item: T) => any;
  fromDb?: (row: any) => T;
  /** Mobil optimizasyon: sadece son N kaydı yükle (0 = hepsini yükle) */
  mobileLimit?: number;
  /** Tarih filtresi alanı — mobileLimit yerine son N gün yükle */
  dateField?: string;
  /** mobileLimit ile birlikte: sadece son kaç günü yükle */
  mobileDays?: number;
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
    mobileLimit = 0,
    dateField,
    mobileDays = 0,
  } = config;

  const [data, setDataState] = useState<T[]>(initialData);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);

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
  // Sayfalama — kaç limit-grubu yüklendi (1 = sadece ilk mobileLimit kayıt)
  const pageMultRef = useRef(1);
  // Tüm sıralanmış öğeleri saklar — loadMore sadece slice yapar, yeniden DB okumaz
  const allItemsRef = useRef<T[]>([]);

  // ─── Sıralama ──────────────────────────────────────────────────────────────
  const sortData = useCallback((items: T[]): T[] => {
    if (!orderBy) return items;
    return [...items].sort((a: any, b: any) => {
      const aVal = a[orderBy] ?? '';
      const bVal = b[orderBy] ?? '';
      if (aVal < bVal) return orderAsc ? -1 : 1;
      if (aVal > bVal) return orderAsc ? 1 : -1;
      return 0;
    });
  }, [orderBy, orderAsc]);

  const setData = useCallback((newData: T[]) => {
    setDataState(sortData(newData));
  }, [sortData]);

  // ─── localStorage write-through (DashboardPage vb. için) ─────────────────
  // Debounce: rapid changes collapse into a single write (100ms)
  // NOT: data.length === 0 kontrolü KALDIRILDI — silme işleminden sonra boş
  // array da yazılmalı, aksi hâlde silinen kayıtlar eski session'da görünür.
  const storageWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!storageKey || !initialLoadDone.current) return; // ilk fetch tamamlanmadan yazma
    if (storageWriteTimer.current) clearTimeout(storageWriteTimer.current);
    storageWriteTimer.current = setTimeout(() => {
      setInStorage(storageKey, data);
    }, 100);
    return () => {
      if (storageWriteTimer.current) clearTimeout(storageWriteTimer.current);
    };
  }, [data, storageKey]);

  // ─── Sayfalama uygula — allItemsRef.current'tan slice ────────────────────
  const applyPagination = useCallback((sorted: T[]) => {
    allItemsRef.current = sorted;
    setTotalCount(sorted.length);
    if (mobileLimit > 0) {
      const visible = sorted.slice(0, pageMultRef.current * mobileLimit);
      setDataState(visible);
      setHasMore(sorted.length > pageMultRef.current * mobileLimit);
    } else {
      setDataState(sorted);
      setHasMore(false);
    }
  }, [mobileLimit]);

  // ─── PouchDB'den tüm veriyi oku ───────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    // Arka plan yenileme (visibilitychange / foregrounded) için loading state gösterme
    if (!silent) setSyncState('loading');
    setError(null);

    const start = performance.now();
    try {
      const db = getDb(tableName);
      dbRef.current = db;

      // _conflicts varsa tespit etmek için conflicts=true ekle
      const result = await db.allDocs({ include_docs: true, conflicts: true });
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);

      const foundConflicts: ConflictInfo[] = [];

      let items = result.rows
        .filter((row: any) => !row.doc?._deleted)
        .map((row: any) => {
          // Çakışma tespiti
          if (row.doc?._conflicts?.length) {
            foundConflicts.push({
              id: row.id,
              tableName,
              localDoc: row.doc,
              conflictRevs: row.doc._conflicts,
              conflictDocs: [], // resolveConflict çağrısında doldurulur
            });
          }
          const cleaned = cleanDoc(row.doc);
          return fromDbRef.current ? fromDbRef.current(cleaned) : cleaned as T;
        });

      // Tarih filtresi — sadece son N gün
      if (dateField && mobileDays > 0) {
        const cutoff = Date.now() - mobileDays * 24 * 60 * 60 * 1000;
        items = items.filter((item: any) => {
          const val = item[dateField];
          if (!val) return true;
          const time = new Date(val).getTime();
          if (isNaN(time)) return true;
          return time >= cutoff;
        });
      }

      const sorted = sortData(items);

      if (!initialLoadDone.current) {
        console.log(
          `%c[useTableSync] ${tableName}: ${sorted.length} kayıt, ${elapsed}ms (PouchDB)`,
          'color: #22c55e; font-weight: bold'
        );
        initialLoadDone.current = true;
      }

      applyPagination(sorted);
      if (foundConflicts.length > 0) setConflicts(foundConflicts);
      setSyncState('synced');
      setLastSync(new Date());
      setConsecutiveFailures(0);
    } catch (e: any) {
      console.error(`[useTableSync] ${tableName} fetch hatası:`, e.message);
      setSyncState('error');
      setError(e.message || 'Veri okuma hatası');
      setConsecutiveFailures(prev => prev + 1);
    }
  }, [tableName, sortData, applyPagination, dateField, mobileDays]);

  // ─── İlk yükleme + PouchDB changes feed ──────────────────────────────────
  // Not: CouchDB sync GlobalTableSyncProvider tarafından başlatılır (startAllSync)
  useEffect(() => {
    fetchData();

    // Mobil ön plana geliş — CouchDB sync yeniden başladığında UI'ı güncelle.
    // pouchdb.ts 'pouchdb:app_foregrounded' yayınlar; silent=true → loading flash yok.
    const handleForegrounded = () => fetchData(true);
    window.addEventListener('pouchdb:app_foregrounded', handleForegrounded);

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

    // BroadcastChannel — diğer sekmelerden gelen değişiklikleri yansıt
    const unsubBroadcast = onBroadcastMessage((msg) => {
      if (msg.type === 'TABLE_CHANGED' && msg.tableName === tableName) {
        fetchData(true);
      }
    });

    return () => {
      changes.cancel();
      window.removeEventListener('pouchdb:app_foregrounded', handleForegrounded);
      unsubBroadcast();
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
        broadcastTableChange(tableName, 'add');
        logChange(tableName, item.id, 'create', 'system').catch(() => {});
        return item; // başarılı
      } catch (e: any) {
        if (e.status === 409 && attempt < MAX_RETRIES - 1) continue;
        if (e.status === 409) {
          toast.warning(`Kayıt çakışması (${tableName}) — son sürüm kullanıldı`, { duration: 3000 });
        } else {
          console.error(`[addItem] ${tableName}:`, e.message);
        }
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

    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const db = getDb(tableName);
        let existing: any;
        try {
          existing = await db.get(id);
        } catch {
          // Doc yok — oluştur (oldItem zorunlu değil, updates'ten oluştur)
          const merged = { ...(oldItem ?? {}), ...(updates as any), id };
          const dbRow = toDbRef.current ? toDbRef.current(merged as T) : merged;
          await db.put({ ...dbRow, _id: id });
          return;
        }

        const cleaned = cleanDoc(existing);
        const currentItem = fromDbRef.current ? fromDbRef.current(cleaned) : cleaned as T;
        const merged = { ...currentItem, ...updates };
        const dbRow = toDbRef.current ? toDbRef.current(merged) : merged;
        await db.put({ ...dbRow, _id: id, _rev: existing._rev });
        broadcastTableChange(tableName, 'update');
        const diffRecord: Record<string, { old: any; new: any }> = {};
        for (const key of Object.keys(updates as object)) {
          if ((oldItem as any)?.[key] !== (merged as any)[key]) {
            diffRecord[key] = { old: (oldItem as any)?.[key], new: (merged as any)[key] };
          }
        }
        logChange(tableName, id, 'update', 'system', undefined, Object.keys(diffRecord).length > 0 ? diffRecord : undefined).catch(() => {});
        return; // başarılı
      } catch (e: any) {
        if (e.status === 409 && attempt < MAX_RETRIES - 1) continue; // conflict retry
        console.error(`[updateItem] ${tableName}:`, e.message);
        // Rollback
        if (oldItem) {
          setDataState(prev =>
            prev.map(item => item.id === id ? oldItem : item)
          );
        }
        return;
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
      broadcastTableChange(tableName, 'delete');
      logChange(tableName, id, 'delete', 'system').catch(() => {});
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
        // _rev sadece mevcut doc varsa eklenir — yoksa insert olarak davranılır (conflict önleme)
        return {
          ...dbRow,
          _id: u.id,
          ...(row?.doc?._rev ? { _rev: row.doc._rev } : {}),
        };
      });

      if (docs.length > 0) {
        const results = await db.bulkDocs(docs);
        // Kısmi hataları kontrol et
        const errors = (results as any[]).filter((r: any) => r.error);
        if (errors.length > 0) {
          const nonConflicts = errors.filter((r: any) => r.status !== 409);
          if (nonConflicts.length > 0) {
            // Gerçek hata — rollback
            console.error(`[batchUpdate] ${tableName}: ${nonConflicts.length} kritik hata`, nonConflicts);
            setDataState(prev =>
              prev.map(item => oldItems.get(item.id) || item)
            );
          } else {
            // Sadece 409 conflict — normal çok-tab senaryosu
            const conflictCount = errors.filter((r: any) => r.status === 409).length;
            toast.warning(`${conflictCount} kayıtta çakışma tespit edildi (${tableName}) — en yeni sürüm korundu`, { duration: 4000 });
          }
        }
        broadcastTableChange(tableName, 'batch');
      }
    } catch (e: any) {
      console.error(`[batchUpdate] ${tableName}:`, e.message);
      // Rollback
      setDataState(prev =>
        prev.map(item => oldItems.get(item.id) || item)
      );
    }
  }, [tableName]);

  // ─── Sayfalama — daha fazla kayıt göster ─────────────────────────────────
  const loadMore = useCallback(() => {
    if (!hasMore || mobileLimit <= 0) return;
    pageMultRef.current += 1;
    const sorted = allItemsRef.current;
    const visible = sorted.slice(0, pageMultRef.current * mobileLimit);
    setDataState(visible);
    setHasMore(sorted.length > pageMultRef.current * mobileLimit);
  }, [hasMore, mobileLimit]);

  // ─── Çakışma çözümü ────────────────────────────────────────────────────
  const resolveConflict = useCallback(async (id: string, winnerRev: string) => {
    try {
      const db = getDb(tableName);
      const conflict = conflicts.find(c => c.id === id);
      if (!conflict) return;

      const allRevs = [conflict.localDoc._rev, ...conflict.conflictRevs];
      const loserRevs = allRevs.filter(r => r !== winnerRev);

      // Kazananı elde et (belki conflict rev'den)
      const winnerDoc = winnerRev === conflict.localDoc._rev
        ? conflict.localDoc
        : await db.get(id, { rev: winnerRev });

      // Tüm kaybedenler silinir (tombstone)
      for (const rev of loserRevs) {
        try { await db.remove(id, rev); } catch {}
      }

      // Kazananı winner _rev ile yeniden yaz (çakışmasız)
      const { _conflicts: _c, ...cleanWinner } = winnerDoc as any;
      await db.put({ ...cleanWinner, _id: id, _rev: winnerDoc._rev });

      setConflicts(prev => prev.filter(c => c.id !== id));
      broadcastTableChange(tableName, 'update');
    } catch (e: any) {
      console.error(`[resolveConflict] ${tableName}:`, e.message);
    }
  }, [tableName, conflicts]);

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
    hasMore,
    totalCount,
    loadMore,
    conflicts,
    resolveConflict,
  };
}
