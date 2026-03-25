// [AJAN-2 | claude/serene-gagarin | 2026-03-24] Son düzenleyen: Claude Sonnet 4.6
/**
 * GlobalTableSyncContext — Uygulama Geneli Tablo Senkronizasyonu
 *
 * SORUN: DashboardPage ve diğer sayfalar yalnızca localStorage'dan okur.
 * Mobilde localStorage boş olduğundan hiçbir veri görünmez.
 *
 * ÇÖZÜM: Bu provider app seviyesinde monte edilir. useTableSync hook'unu
 * her kritik Supabase tablosu için çalıştırır. Böylece uygulama açıldığında
 * (hangi sayfa olursa olsun) tüm tablolar localStorage'a yüklenir ve
 * DashboardPage'in storage_update dinleyicisi tetiklenerek veriler görünür.
 *
 * Aktif tablolar:
 *   fisler, urunler, cari_hesaplar, kasa_islemleri, personeller,
 *   bankalar, cekler, araclar, arac_shifts, uretim_profilleri,
 *   uretim_kayitlari, faturalar, fatura_stok, tahsilatlar, arac_km_logs
 */

import React, { useEffect } from 'react';
import { useTableSync } from '../hooks/useTableSync';
import { cariFromDb, cariToDb } from '../pages/CariPage';
import { productFromDb, productToDb } from '../pages/StokPage';
import { StorageKey } from '../utils/storage';
import { startAllSync, stopAllSync } from '../lib/pouchdb';

// ─── Alt bileşenler (her biri bir tablo için useTableSync çalıştırır) ────────
// Not: Hook kuralları gereği her useTableSync ayrı bir bileşende olmalıdır,
// yoksa koşullu render durumlarında sorun çıkabilir.

function FislerSync() {
  useTableSync({ tableName: 'fisler', storageKey: StorageKey.FISLER, orderBy: 'tarih', orderAsc: false });
  return null;
}

function UrunlerSync() {
  useTableSync({
    tableName: 'urunler',
    storageKey: StorageKey.STOK_DATA,
    orderBy: 'ad',
    orderAsc: true,
    fromDb: productFromDb,
    toDb: productToDb,
  });
  return null;
}

function CariSync() {
  useTableSync({
    tableName: 'cari_hesaplar',
    storageKey: StorageKey.CARI_DATA,
    orderBy: 'ad',
    orderAsc: true,
    fromDb: cariFromDb,
    toDb: cariToDb,
  });
  return null;
}

function KasaSync() {
  useTableSync({ tableName: 'kasa_islemleri', storageKey: StorageKey.KASA_DATA, orderBy: 'tarih', orderAsc: false });
  return null;
}

function PersonelSync() {
  useTableSync({ tableName: 'personeller', storageKey: StorageKey.PERSONEL_DATA, orderBy: 'ad', orderAsc: true });
  return null;
}

function BankaSync() {
  useTableSync({ tableName: 'bankalar', storageKey: StorageKey.BANK_DATA, orderBy: 'ad', orderAsc: true });
  return null;
}

function CeklerSync() {
  useTableSync({ tableName: 'cekler', storageKey: StorageKey.CEKLER_DATA, orderBy: 'created_at', orderAsc: false });
  return null;
}

function AraclarSync() {
  useTableSync({ tableName: 'araclar', storageKey: StorageKey.ARAC_DATA, orderBy: 'plaka', orderAsc: true });
  return null;
}

function AracShiftsSync() {
  useTableSync({ tableName: 'arac_shifts', storageKey: StorageKey.ARAC_SHIFTS, orderBy: 'created_at', orderAsc: false });
  return null;
}

function AracKmLogsSync() {
  useTableSync({ tableName: 'arac_km_logs', storageKey: StorageKey.ARAC_KM_LOGS, orderBy: 'created_at', orderAsc: false });
  return null;
}

function UretimProfillerSync() {
  useTableSync({ tableName: 'uretim_profilleri', storageKey: StorageKey.URETIM_PROFILES, orderBy: 'ad', orderAsc: true });
  return null;
}

function UretimKayitlariSync() {
  useTableSync({ tableName: 'uretim_kayitlari', storageKey: StorageKey.URETIM_DATA, orderBy: 'created_at', orderAsc: false });
  return null;
}

function FaturalarSync() {
  useTableSync({ tableName: 'faturalar', storageKey: StorageKey.FATURALAR, orderBy: 'tarih', orderAsc: false });
  return null;
}

function FaturaStokSync() {
  useTableSync({ tableName: 'fatura_stok', storageKey: StorageKey.FATURA_STOK, orderBy: 'created_at', orderAsc: false });
  return null;
}

function TahsilatlarSync() {
  useTableSync({ tableName: 'tahsilatlar', storageKey: 'tahsilatlar_data', orderBy: 'tarih', orderAsc: false });
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
  // PouchDB ↔ CouchDB continuous sync başlat
  useEffect(() => {
    startAllSync();
    return () => stopAllSync();
  }, []);

  return (
    <>
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
    </>
  );
}
