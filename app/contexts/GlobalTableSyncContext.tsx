// [AJAN-2 | claude/serene-gagarin | 2026-03-24] Son düzenleyen: Claude Sonnet 4.6
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
 * Aktif tablolar:
 *   fisler, urunler, cari_hesaplar, kasa_islemleri, personeller,
 *   bankalar, cekler, araclar, arac_shifts, uretim_profilleri,
 *   uretim_kayitlari, faturalar, fatura_stok, tahsilatlar, arac_km_logs
 */

import React, { useEffect, useContext, createContext, useState, useCallback } from 'react';
import { useTableSync } from '../hooks/useTableSync';
import type { SyncState } from '../hooks/useTableSync';
import { cariFromDb, cariToDb } from '../pages/CariPage';
import { productFromDb, productToDb } from '../pages/StokPage';
import { StorageKey } from '../utils/storage';
import { startAllSync, stopAllSync } from '../lib/pouchdb';

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
}

const GlobalSyncTablesContext = createContext<GlobalSyncTablesContextValue>({
  tables: [],
  registerTable: () => {},
});

export function useGlobalSyncTables() {
  return useContext(GlobalSyncTablesContext);
}

// ─── Alt bileşenler (her biri bir tablo için useTableSync çalıştırır) ────────
// Not: Hook kuralları gereği her useTableSync ayrı bir bileşende olmalıdır,
// yoksa koşullu render durumlarında sorun çıkabilir.

function FislerSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'fisler', storageKey: StorageKey.FISLER, orderBy: 'tarih', orderAsc: false });
  useEffect(() => { registerTable({ name: 'fisler', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function UrunlerSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({
    tableName: 'urunler',
    storageKey: StorageKey.STOK_DATA,
    orderBy: 'ad',
    orderAsc: true,
    fromDb: productFromDb,
    toDb: productToDb,
  });
  useEffect(() => { registerTable({ name: 'urunler', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function CariSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({
    tableName: 'cari_hesaplar',
    storageKey: StorageKey.CARI_DATA,
    orderBy: 'ad',
    orderAsc: true,
    fromDb: cariFromDb,
    toDb: cariToDb,
  });
  useEffect(() => { registerTable({ name: 'cari_hesaplar', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function KasaSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'kasa_islemleri', storageKey: StorageKey.KASA_DATA, orderBy: 'tarih', orderAsc: false });
  useEffect(() => { registerTable({ name: 'kasa_islemleri', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function PersonelSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'personeller', storageKey: StorageKey.PERSONEL_DATA, orderBy: 'ad', orderAsc: true });
  useEffect(() => { registerTable({ name: 'personeller', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function BankaSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'bankalar', storageKey: StorageKey.BANK_DATA, orderBy: 'ad', orderAsc: true });
  useEffect(() => { registerTable({ name: 'bankalar', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function CeklerSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'cekler', storageKey: StorageKey.CEKLER_DATA, orderBy: 'created_at', orderAsc: false });
  useEffect(() => { registerTable({ name: 'cekler', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function AraclarSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'araclar', storageKey: StorageKey.ARAC_DATA, orderBy: 'plaka', orderAsc: true });
  useEffect(() => { registerTable({ name: 'araclar', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function AracShiftsSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'arac_shifts', storageKey: StorageKey.ARAC_SHIFTS, orderBy: 'created_at', orderAsc: false });
  useEffect(() => { registerTable({ name: 'arac_shifts', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function AracKmLogsSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'arac_km_logs', storageKey: StorageKey.ARAC_KM_LOGS, orderBy: 'created_at', orderAsc: false });
  useEffect(() => { registerTable({ name: 'arac_km_logs', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function UretimProfillerSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'uretim_profilleri', storageKey: StorageKey.URETIM_PROFILES, orderBy: 'ad', orderAsc: true });
  useEffect(() => { registerTable({ name: 'uretim_profilleri', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function UretimKayitlariSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'uretim_kayitlari', storageKey: StorageKey.URETIM_DATA, orderBy: 'created_at', orderAsc: false });
  useEffect(() => { registerTable({ name: 'uretim_kayitlari', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function FaturalarSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'faturalar', storageKey: StorageKey.FATURALAR, orderBy: 'tarih', orderAsc: false });
  useEffect(() => { registerTable({ name: 'faturalar', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function FaturaStokSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'fatura_stok', storageKey: StorageKey.FATURA_STOK, orderBy: 'created_at', orderAsc: false });
  useEffect(() => { registerTable({ name: 'fatura_stok', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

function TahsilatlarSync() {
  const { registerTable } = useGlobalSyncTables();
  const { data, syncState, lastSync } = useTableSync({ tableName: 'tahsilatlar', storageKey: 'tahsilatlar_data', orderBy: 'tarih', orderAsc: false });
  useEffect(() => { registerTable({ name: 'tahsilatlar', syncState, lastSyncAt: lastSync, docCount: data.length }); }, [syncState, lastSync, data.length, registerTable]);
  return null;
}

// ─── Ana Provider ─────────────────────────────────────────────────────────────

interface GlobalTableSyncProviderProps {
  children: React.ReactNode;
}

/**
 * GlobalTableSyncProvider
 *
 * App.tsx'e sarılır. Tüm Supabase tablolarını localStorage ile senkronize
 * eder. Hangi sayfada olunursa olsun (Dashboard dahil) veriler doğrudan
 * Supabase tablolarından okunur ve storage_update eventi yayınlanır.
 */
export function GlobalTableSyncProvider({ children }: GlobalTableSyncProviderProps) {
  const [tables, setTables] = useState<TableSyncStatus[]>([]);

  const registerTable = useCallback((status: TableSyncStatus) => {
    setTables(prev => {
      const idx = prev.findIndex(t => t.name === status.name);
      if (idx === -1) return [...prev, status];
      const next = [...prev];
      next[idx] = status;
      return next;
    });
  }, []);

  // PouchDB ↔ CouchDB continuous sync başlat (kademeli — 200ms aralık)
  useEffect(() => {
    startAllSync();
    return () => stopAllSync();
  }, []);

  return (
    <GlobalSyncTablesContext.Provider value={{ tables, registerTable }}>
      {/* Her tablo için ayrı senkronizasyon bileşeni */}
      <FislerSync />
      <UrunlerSync />
      <CariSync />
      <KasaSync />
      <PersonelSync />
      <BankaSync />
      <CeklerSync />
      <AraclarSync />
      <AracShiftsSync />
      <AracKmLogsSync />
      <UretimProfillerSync />
      <UretimKayitlariSync />
      <FaturalarSync />
      <FaturaStokSync />
      <TahsilatlarSync />
      {children}
    </GlobalSyncTablesContext.Provider>
  );
}
