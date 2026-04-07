// [AJAN-2 | claude/debug-system-pages-M8P0c | 2026-04-07] Son düzenleyen: Claude Sonnet 4.6
/**
 * GlobalTableSyncContext — Uygulama Geneli Tablo Senkronizasyonu
 *
 * SORUN: DashboardPage ve diğer sayfalar yalnızca localStorage'dan okur.
 * Mobilde localStorage boş olduğundan hiçbir veri görünmez.
 *
 * ÇÖZÜM: Bu provider app seviyesinde monte edilir. useTableSync hook'unu
 * her CouchDB tablosu için çalıştırır. Böylece uygulama açıldığında
 * (hangi sayfa olursa olsun) tüm tablolar localStorage'a yüklenir ve
 * DashboardPage'in storage_update dinleyicisi tetiklenerek veriler görünür.
 *
 * Yeni tablo eklemek için yalnızca TABLE_SYNC_CONFIGS dizisine kayıt ekleyin —
 * başka hiçbir yere dokunmanız gerekmez.
 */

import React, { useEffect, useContext, createContext, useState, useCallback, useRef } from 'react';
import { useTableSync } from '../hooks/useTableSync';
import type { SyncState } from '../hooks/useTableSync';
import { cariFromDb, cariToDb } from '../pages/CariPage';
import { productFromDb, productToDb } from '../pages/StokPage';
import { StorageKey } from '../utils/storage';
import { startAllSync, stopAllSync, autoSeedIfEmpty } from '../lib/pouchdb';
import { toast } from 'sonner';

// ─── Per-tablo sync durumu context ────────────────────────────────────────────

export interface TableSyncStatus {
  name: string;
  syncState: SyncState;
  lastSyncAt: Date | null;
  docCount: number;
}

interface GlobalSyncTablesContextValue {
  tables: TableSyncStatus[];
  registerTable: (status: TableSyncStatus) => void;
  setTableData: (name: string, data: any[]) => void;
  tableDataRef: React.MutableRefObject<Map<string, any[]>>;
  tableVersions: Record<string, number>;
}

const GlobalSyncTablesContext = createContext<GlobalSyncTablesContextValue>({
  tables: [],
  registerTable: () => {},
  setTableData: () => {},
  tableDataRef: { current: new Map() },
  tableVersions: {},
});

export function useGlobalSyncTables() {
  return useContext(GlobalSyncTablesContext);
}

/**
 * useGlobalTableData — okuma-only sayfalar için tablo verisini doğrudan
 * GlobalTableSyncContext'ten al.
 *
 * Re-render mekanizması: tableVersions[tableName] değiştiğinde (veri güncellemesinde)
 * consumer re-render olur. Diğer tabloların güncellemeleri bu hook'u tetiklemez.
 */
export function useGlobalTableData<T = any>(tableName: string): T[] {
  const { tableDataRef, tableVersions } = useContext(GlobalSyncTablesContext);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _version = tableVersions[tableName] ?? 0;
  return (tableDataRef.current.get(tableName) as T[]) ?? [];
}

// ─── Tablo konfigürasyon tablosu ──────────────────────────────────────────────
// Yeni tablo eklemek için buraya bir satır ekleyin; başka hiçbir şeyi değiştirmenize gerek yok.

interface TableSyncConfig {
  tableName: string;
  storageKey: string;
  orderBy?: string;
  orderAsc?: boolean;
  fromDb?: (item: any) => any;
  toDb?: (item: any) => any;
}

const TABLE_SYNC_CONFIGS: TableSyncConfig[] = [
  { tableName: 'fisler',           storageKey: StorageKey.FISLER,        orderBy: 'tarih',      orderAsc: false },
  { tableName: 'urunler',          storageKey: StorageKey.STOK_DATA,     orderBy: 'ad',         orderAsc: true,  fromDb: productFromDb, toDb: productToDb },
  { tableName: 'cari_hesaplar',    storageKey: StorageKey.CARI_DATA,     orderBy: 'ad',         orderAsc: true,  fromDb: cariFromDb,    toDb: cariToDb },
  { tableName: 'kasa_islemleri',   storageKey: StorageKey.KASA_DATA,     orderBy: 'tarih',      orderAsc: false },
  { tableName: 'personeller',      storageKey: StorageKey.PERSONEL_DATA, orderBy: 'ad',         orderAsc: true  },
  { tableName: 'bankalar',         storageKey: StorageKey.BANK_DATA,     orderBy: 'ad',         orderAsc: true  },
  { tableName: 'cekler',           storageKey: StorageKey.CEKLER_DATA,   orderBy: 'created_at', orderAsc: false },
  { tableName: 'araclar',          storageKey: StorageKey.ARAC_DATA,     orderBy: 'plaka',      orderAsc: true  },
  { tableName: 'arac_shifts',      storageKey: StorageKey.ARAC_SHIFTS,   orderBy: 'created_at', orderAsc: false },
  { tableName: 'arac_km_logs',     storageKey: StorageKey.ARAC_KM_LOGS,  orderBy: 'created_at', orderAsc: false },
  { tableName: 'uretim_profilleri',storageKey: StorageKey.URETIM_PROFILES,orderBy: 'ad',        orderAsc: true  },
  { tableName: 'uretim_kayitlari', storageKey: StorageKey.URETIM_DATA,   orderBy: 'created_at', orderAsc: false },
  { tableName: 'faturalar',        storageKey: StorageKey.FATURALAR,     orderBy: 'tarih',      orderAsc: false },
  { tableName: 'fatura_stok',      storageKey: StorageKey.FATURA_STOK,   orderBy: 'created_at', orderAsc: false },
  { tableName: 'tahsilatlar',      storageKey: 'tahsilatlar_data',       orderBy: 'tarih',      orderAsc: false },
];

// ─── Genel tablo senkronizasyon bileşeni ──────────────────────────────────────
// Her config için ayrı bir React bileşeni instance'ı oluşturulur.
// Hook kurallarına uygun: her instance useTableSync'i tam olarak bir kez çağırır.

function TableSyncNode({ tableName, storageKey, orderBy, orderAsc, fromDb, toDb }: TableSyncConfig) {
  const { registerTable, setTableData } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({
    tableName,
    storageKey,
    orderBy,
    orderAsc,
    fromDb,
    toDb,
  });

  useEffect(() => {
    registerTable({ name: tableName, syncState, lastSyncAt: lastSync, docCount: data.length });
  }, [syncState, lastSync, data.length, registerTable, tableName]);

  useEffect(() => {
    setTableData(tableName, data);
  }, [data, setTableData, tableName]);

  return null;
}

// ─── Ana Provider ─────────────────────────────────────────────────────────────

interface GlobalTableSyncProviderProps {
  children: React.ReactNode;
}

/**
 * GlobalTableSyncProvider
 *
 * App.tsx'e sarılır. TABLE_SYNC_CONFIGS'deki tüm tabloları PouchDB ↔ CouchDB
 * ile sürekli senkronize eder. Hangi sayfada olunursa olsun veriler hazır olur.
 *
 * Yeni tablo eklemek: TABLE_SYNC_CONFIGS dizisine tek satır.
 */
export function GlobalTableSyncProvider({ children }: GlobalTableSyncProviderProps) {
  const [tables, setTables] = useState<TableSyncStatus[]>([]);
  const tableDataRef = useRef<Map<string, any[]>>(new Map());
  const [tableVersions, setTableVersions] = useState<Record<string, number>>({});

  const registerTable = useCallback((status: TableSyncStatus) => {
    setTables(prev => {
      const idx = prev.findIndex(t => t.name === status.name);
      if (idx === -1) return [...prev, status];
      const next = [...prev];
      next[idx] = status;
      return next;
    });
  }, []);

  const setTableData = useCallback((name: string, data: any[]) => {
    tableDataRef.current.set(name, data);
    setTableVersions(prev => ({ ...prev, [name]: (prev[name] ?? 0) + 1 }));
  }, []);

  // PouchDB ↔ CouchDB continuous sync başlat (kademeli — 200ms aralık)
  // Ağ kurtarma: pouchdb.ts'deki online event listener otomatik restartAllSync() çağırır.
  // Ardından: PouchDB boşsa localStorage'dan otomatik doldur → sync CouchDB'ye iter.
  useEffect(() => {
    startAllSync();

    const seedTimer = setTimeout(() => {
      autoSeedIfEmpty((totalSeeded) => {
        if (totalSeeded > 0) {
          toast.success(
            `${totalSeeded} kayıt PouchDB'ye aktarıldı — CouchDB'ye senkronize ediliyor…`,
            { duration: 5000 }
          );
        }
      });
    }, 1500);

    return () => {
      stopAllSync();
      clearTimeout(seedTimer);
    };
  }, []);

  return (
    <GlobalSyncTablesContext.Provider value={{ tables, registerTable, setTableData, tableDataRef, tableVersions }}>
      {TABLE_SYNC_CONFIGS.map(config => (
        <TableSyncNode key={config.tableName} {...config} />
      ))}
      {children}
    </GlobalSyncTablesContext.Provider>
  );
}
