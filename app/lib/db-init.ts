/**
 * Veritabanı Otomatik Kurulum ve Başlatma
 *
 * Uygulama ilk açıldığında Supabase'deki gerekli tabloların varlığını
 * kontrol eder. Eksik tablolar varsa otomatik olarak oluşturur.
 *
 * Tablolar:
 *   - kv_store_daadfb0c  : Ana KV depo (tüm uygulama verisi)
 *   - personeller        : Personel kayıtları
 *   - cari_hesaplar      : Müşteri / toptancı hesapları
 *   - araclar            : Araç kayıtları
 *   - kasa_islemleri     : Kasa işlemleri
 *   - fisler             : Satış / gider fişleri
 *   - urunler            : Ürün / stok kayıtları
 *   - bankalar           : Banka hesapları
 */

import { SERVER_BASE_URL, SUPABASE_ANON_KEY } from './supabase-config';

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type DbInitStatus =
  | 'idle'
  | 'checking'
  | 'setup_needed'
  | 'setting_up'
  | 'ready'
  | 'error';

export interface DbTableStatus {
  name: string;
  ready: boolean;
}

export interface DbInitResult {
  status: DbInitStatus;
  message: string;
  tables?: Record<string, boolean>;
  allReady?: boolean;
  steps?: Array<{ name: string; ok: boolean; error?: string }>;
  error?: string;
}

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

// Uygulama açılışında yalnızca bir kez kurulum denensin
let _initAttempted = false;
let _initResult: DbInitResult | null = null;

// ─── Tablo Kontrol ────────────────────────────────────────────────────────────

/**
 * Supabase'deki gerekli tabloların var olup olmadığını kontrol eder.
 */
export async function checkDatabaseStatus(): Promise<DbInitResult> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/check-tables`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      return {
        status: 'error',
        message: `Sunucu yanıt vermedi (HTTP ${res.status})`,
        allReady: false,
      };
    }

    const data = await res.json();

    if (data.allReady) {
      return {
        status: 'ready',
        message: 'Tüm tablolar hazır',
        tables: data.tables,
        allReady: true,
      };
    }

    return {
      status: 'setup_needed',
      message: 'Eksik tablolar var, kurulum gerekli',
      tables: data.tables,
      allReady: false,
    };
  } catch (e: any) {
    return {
      status: 'error',
      message: `Bağlantı hatası: ${e.message}`,
      allReady: false,
    };
  }
}

// ─── Tablo Kurulumu ───────────────────────────────────────────────────────────

/**
 * Eksik tabloları Supabase'de oluşturur (edge function üzerinden).
 */
export async function setupDatabase(): Promise<DbInitResult> {
  try {
    const res = await fetch(`${SERVER_BASE_URL}/setup-db`, {
      method: 'POST',
      headers: getHeaders(),
    });

    if (!res.ok) {
      return {
        status: 'error',
        message: `Kurulum isteği başarısız (HTTP ${res.status})`,
        allReady: false,
      };
    }

    const data = await res.json();

    if (data.success) {
      return {
        status: 'ready',
        message: data.message || 'Tablolar başarıyla oluşturuldu',
        steps: data.steps,
        allReady: true,
      };
    }

    // Kısmi başarı — bazı tablolar oluşmuş olabilir
    return {
      status: 'error',
      message: data.error || data.message || 'Kurulum tamamlanamadı',
      steps: data.steps,
      allReady: false,
    };
  } catch (e: any) {
    return {
      status: 'error',
      message: `Kurulum bağlantı hatası: ${e.message}`,
      allReady: false,
    };
  }
}

// ─── Otomatik Başlatma ────────────────────────────────────────────────────────

/**
 * Veritabanını başlatır:
 *   1. Tabloları kontrol eder
 *   2. Eksik tablolar varsa otomatik olarak oluşturur
 *
 * Yalnızca ilk çağrıda gerçek işlem yapar; sonraki çağrılar önbellekten döner.
 */
export async function initializeDatabase(forceReinit = false): Promise<DbInitResult> {
  if (!forceReinit && _initAttempted && _initResult) {
    return _initResult;
  }

  _initAttempted = true;

  // 1. Mevcut durumu kontrol et
  const checkResult = await checkDatabaseStatus();

  if (checkResult.status === 'ready') {
    _initResult = checkResult;
    console.log('%c[DB Init] Tüm tablolar hazır ✓', 'color: #22c55e; font-weight: bold');
    return _initResult;
  }

  if (checkResult.status === 'error') {
    _initResult = checkResult;
    console.warn('[DB Init] Kontrol başarısız:', checkResult.message);
    return _initResult;
  }

  // 2. Eksik tablolar varsa kur
  console.log('%c[DB Init] Tablolar eksik, otomatik kurulum başlıyor...', 'color: #f59e0b; font-weight: bold');
  const setupResult = await setupDatabase();
  // Cache'e yaz (setup sonucu 'ready' veya 'error' olur)
  _initResult = { ...setupResult, status: setupResult.status };

  if (setupResult.status === 'ready') {
    console.log('%c[DB Init] Kurulum tamamlandı ✓', 'color: #22c55e; font-weight: bold');
  } else {
    console.error('[DB Init] Kurulum başarısız:', setupResult.message);
  }

  return _initResult;
}

/**
 * Önbelleği temizler (test veya zorla yeniden kurulum için).
 */
export function resetDbInitCache() {
  _initAttempted = false;
  _initResult = null;
}

/**
 * Son kurulum sonucunu döner (yoksa null).
 */
export function getLastDbInitResult(): DbInitResult | null {
  return _initResult;
}
