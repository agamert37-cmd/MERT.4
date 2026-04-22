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
import { cariFromDb, cariToDb, productFromDb, productToDb } from '../lib/db-transforms';
import { StorageKey } from '../utils/storage';
import { startAllSync, startMobileSync, stopAllSync, startPeerSync, stopPeerSync, autoSeedIfEmpty, compactAllDbs, startCouchDbHealthMonitor, stopCouchDbHealthMonitor } from '../lib/pouchdb';
import { replayWAL, walLoad } from '../lib/active-client';
import { getCouchDbConfig } from '../lib/db-config';
import { startAutoBackupScheduler, stopAutoBackupScheduler, getAutoBackupConfig } from '../lib/pouchdb-backup';
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
  /** CouchDB sunucu bağlantı durumu: null=henüz bilinmiyor, true=bağlı, false=bağlantı yok */
  couchdbConnected: boolean | null;
  couchdbError: string | null;
}

const GlobalSyncTablesContext = createContext<GlobalSyncTablesContextValue>({
  tables: [],
  registerTable: () => {},
  setTableData: () => {},
  tableDataRef: { current: new Map() },
  tableVersions: {},
  couchdbConnected: null,
  couchdbError: null,
});

export function useGlobalSyncTables() {
  return useContext(GlobalSyncTablesContext);
}

/** CouchDB bağlantı durumunu izle */
export function useCouchDbStatus() {
  const { couchdbConnected, couchdbError } = useContext(GlobalSyncTablesContext);
  return { couchdbConnected, couchdbError };
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
  { tableName: 'urunler',          storageKey: StorageKey.STOK_DATA,     orderBy: 'name',       orderAsc: true,  fromDb: productFromDb, toDb: productToDb },
  { tableName: 'cari_hesaplar',    storageKey: StorageKey.CARI_DATA,     orderBy: 'companyName',orderAsc: true,  fromDb: cariFromDb,    toDb: cariToDb },
  { tableName: 'kasa_islemleri',   storageKey: StorageKey.KASA_DATA,     orderBy: 'tarih',      orderAsc: false },
  { tableName: 'personeller',      storageKey: StorageKey.PERSONEL_DATA, orderBy: 'name',       orderAsc: true  },
  { tableName: 'bankalar',         storageKey: StorageKey.BANK_DATA,     orderBy: 'name',       orderAsc: true  },
  { tableName: 'cekler',           storageKey: StorageKey.CEKLER_DATA,   orderBy: 'created_at', orderAsc: false },
  { tableName: 'araclar',          storageKey: StorageKey.ARAC_DATA,     orderBy: 'plaka',      orderAsc: true  },
  { tableName: 'arac_shifts',      storageKey: StorageKey.ARAC_SHIFTS,   orderBy: 'created_at', orderAsc: false },
  { tableName: 'arac_km_logs',     storageKey: StorageKey.ARAC_KM_LOGS,  orderBy: 'created_at', orderAsc: false },
  { tableName: 'uretim_profilleri',storageKey: StorageKey.URETIM_PROFILES,orderBy: 'name',      orderAsc: true  },
  { tableName: 'uretim_kayitlari', storageKey: StorageKey.URETIM_DATA,   orderBy: 'created_at', orderAsc: false },
  { tableName: 'faturalar',        storageKey: StorageKey.FATURALAR,     orderBy: 'tarih',      orderAsc: false },
  { tableName: 'fatura_stok',      storageKey: StorageKey.FATURA_STOK,   orderBy: 'created_at', orderAsc: false },
  { tableName: 'tahsilatlar',         storageKey: 'tahsilatlar_data',          orderBy: 'tarih',      orderAsc: false },
  { tableName: 'guncelleme_notlari',  storageKey: StorageKey.GUNCELLEME_NOTLARI, orderBy: 'date',     orderAsc: false },
  { tableName: 'stok_giris',          storageKey: StorageKey.STOK_GIRIS,         orderBy: 'date',     orderAsc: false },
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

  // ─── CouchDB bağlantı durumu ──────────────────────────────────────────────
  const [couchdbConnected, setCouchdbConnected] = useState<boolean | null>(null);
  const [couchdbError, setCouchdbError] = useState<string | null>(null);

  // Hata toast'u sadece bir kez göster (her hatalı sync olayında gösterme)
  const shownErrorToastRef = useRef(false);
  const shownConnectedToastRef = useRef(false);
  // Ref ile tutan — listener closure'ından güncel değeri okumak için
  const couchdbConnectedRef = useRef<boolean | null>(null);

  useEffect(() => {
    function handleSyncEvent(e: Event) {
      const state = (e as CustomEvent).detail as {
        tableName: string;
        status: 'active' | 'paused' | 'error' | 'stopped';
        error?: string;
      };

      if (state.status === 'error') {
        setCouchdbConnected(false);
        setCouchdbError(state.error || 'Bağlantı hatası');
        shownConnectedToastRef.current = false;
        if (!shownErrorToastRef.current) {
          shownErrorToastRef.current = true;
          toast.error(
            '⚠️ CouchDB sunucusuna bağlanılamıyor — veriler yalnızca bu cihazda kaydedilir.',
            {
              duration: 6000,
              description: state.error
                ? `Hata: ${state.error.substring(0, 80)}`
                : 'Sunucu sayfasından bağlantıyı kontrol edin.',
            }
          );
        }
      } else if (state.status === 'active' || state.status === 'paused') {
        const wasDisconnected = couchdbConnected === false;
        setCouchdbConnected(true);
        setCouchdbError(null);
        shownErrorToastRef.current = false;
        if (wasDisconnected && !shownConnectedToastRef.current) {
          shownConnectedToastRef.current = true;
          toast.success('✅ CouchDB bağlantısı yeniden kuruldu — senkronizasyon devam ediyor.', {
            duration: 4000,
          });
        }
      }
    }

    window.addEventListener('pouchdb:sync_status', handleSyncEvent);
    return () => window.removeEventListener('pouchdb:sync_status', handleSyncEvent);
  }, [couchdbConnected]);

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

  // PouchDB ↔ CouchDB continuous sync başlat + peer sync + otomatik seed
  useEffect(() => {
    // iOS/Android'in IndexedDB'yi hafıza baskısında silmesini önle
    if (navigator.storage?.persist) {
      navigator.storage.persist().then(granted => {
        if (!granted) console.warn('[Storage] Kalıcı depolama izni verilmedi — veri kaybolabilir');
        else console.info('[Storage] Kalıcı depolama aktif');
      });
    }

    // Mobilde kritik tablolar önce sync edilir
    const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) startMobileSync(); else startAllSync();
    startCouchDbHealthMonitor();
    const cfg = getCouchDbConfig();
    if (cfg.peerUrl) startPeerSync();

    // Otomatik yedek zamanlaması
    const autoCfg = getAutoBackupConfig();
    if (autoCfg.enabled) startAutoBackupScheduler();

    const seedTimer = setTimeout(() => {
      autoSeedIfEmpty(
        (totalSeeded) => {
          if (totalSeeded > 0) {
            toast.success(
              `${totalSeeded} kayıt PouchDB'ye aktarıldı — CouchDB'ye senkronize ediliyor…`,
              { duration: 5000 }
            );
          }
        },
        {
          urunler:       productToDb,
          cari_hesaplar: cariToDb,
        }
      );
    }, 1500);

    // WAL replay — çökme/çevrimdışı dönemde birikmiş yazmaları PouchDB'ye uygula
    const walTimer = setTimeout(async () => {
      try {
        const pending = walLoad().length;
        if (pending > 0) {
          const { replayed, failed } = await replayWAL();
          if (replayed > 0) {
            console.info(`[WAL] ${replayed} kayıt yeniden uygulandı${failed > 0 ? `, ${failed} başarısız` : ''}`);
          }
        }
      } catch (e: any) {
        console.error('[WAL] Replay hatası:', e?.message);
      }
    }, 5_000);

    // Haftalık DB sıkıştırma — eski revision ve tombstone'ları temizler
    const compactTimer = setTimeout(async () => {
      try {
        const result = await compactAllDbs();
        if (!result.skipped) {
          console.info(`[DB] Sıkıştırma tamamlandı — ${result.compacted} tablo`);
        }
      } catch (e: any) {
        console.error('[DB] Sıkıştırma hatası:', e?.message);
      }
    }, 30_000); // 30 saniye gecikme — sync yerleştikten sonra

    return () => {
      stopAllSync();
      stopCouchDbHealthMonitor();
      clearTimeout(seedTimer);
      clearTimeout(walTimer);
      clearTimeout(compactTimer);
      stopPeerSync();
      stopAutoBackupScheduler();
    };
  }, []);

  // Failover durumu bildirimi
  useEffect(() => {
    function handleFailover(e: Event) {
      const { active, targetUrl } = (e as CustomEvent).detail as {
        active: boolean; targetUrl: string;
      };
      if (active) {
        toast.warning(
          '⚠️ Birincil sunucu yanıt vermiyor — yedek sunucuya bağlanılıyor…',
          { duration: 8000, description: `Yedek: ${targetUrl}` }
        );
      } else {
        toast.success(
          '✅ Birincil sunucu geri döndü — otomatik olarak bağlanıldı.',
          { duration: 5000 }
        );
      }
    }
    window.addEventListener('pouchdb:failover_status', handleFailover);
    return () => window.removeEventListener('pouchdb:failover_status', handleFailover);
  }, []);

  return (
    <GlobalSyncTablesContext.Provider value={{
      tables, registerTable, setTableData, tableDataRef, tableVersions,
      couchdbConnected, couchdbError,
    }}>
      {TABLE_SYNC_CONFIGS.map(config => (
        <TableSyncNode key={config.tableName} {...config} />
      ))}
      {children}
    </GlobalSyncTablesContext.Provider>
  );
}
