// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Opus 4.6
/**
 * Storage utility — localStorage yardımcıları
 * PouchDB geçişi sonrası: Supabase dual-write kaldırıldı.
 * Artık sadece localStorage işlemleri — sync PouchDB/CouchDB ile yapılıyor.
 */

const STORAGE_PREFIX = 'isleyen_et_';

// ─── StorageKey enum ─────────────────────────────────────────────────────────

export const StorageKey = {
  USER: 'user',
  FISLER: 'fisler_data',
  STOK_DATA: 'stok_data',
  CARI_DATA: 'cari_data',
  KASA_DATA: 'kasa_data',
  PERSONEL_DATA: 'personel_data',
  BANK_DATA: 'bank_data',
  CEKLER_DATA: 'cekler_data',
  ARAC_DATA: 'arac_data',
  ARAC_SHIFTS: 'arac_shifts',
  ARAC_KM_LOGS: 'arac_km_logs',
  URETIM_DATA: 'uretim_data',
  URETIM_PROFILES: 'uretim_profiles',
  FATURALAR: 'faturalar',
  FATURA_STOK: 'fatura_stok',
  CATEGORIES: 'categories',
  POS_DEVICES: 'pos_devices',
  CURRENT_EMPLOYEE: 'current_employee',
  SETTINGS: 'settings',
  DELETED_FISLER: 'deleted_fisler',
} as const;

// ─── Okuma/Yazma ─────────────────────────────────────────────────────────────

export function getFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setInStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    // storage_update event yayınla (DashboardPage vb. dinleyiciler için)
    setTimeout(() => window.dispatchEvent(new Event('storage_update')), 0);
  } catch (e) {
    console.error('Storage write error:', e);
  }
}

export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {}
}

// ─── Eski uyumluluk (artık no-op) ────────────────────────────────────────────

export async function forceSync(): Promise<void> { /* PouchDB otomatik senkronize eder */ }
export async function startInitialSync(): Promise<void> { /* PouchDB otomatik */ }
export function startRealtimeSync(): void { /* PouchDB changes feed */ }
export function stopRealtimeSync(): void { /* no-op */ }
export function getSyncState() {
  return { pendingCount: 0, isSyncing: false, lastSyncAt: Date.now(), isOnline: navigator.onLine, lastError: null };
}

// Eski re-export'lar — bazı sayfalar bunları kullanıyor olabilir
export async function fetchFromSupabase(): Promise<any> { return null; }
export async function saveToSupabase(): Promise<void> {}
export async function insertToSupabase(): Promise<void> {}
export async function updateInSupabase(): Promise<void> {}
export async function deleteFromSupabase(): Promise<void> {}
export function subscribeToTable(): any { return { unsubscribe: () => {} }; }
export async function createSystemBackup(): Promise<any> { return null; }
export async function getSystemBackups(): Promise<any[]> { return []; }
export async function restoreSystemBackup(): Promise<boolean> { return false; }
export async function syncFromCloud(): Promise<void> {}
export async function pushAllToCloud(): Promise<void> {}
export async function syncKeyToCloud(): Promise<void> {}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

export const clearAllStorage = (): boolean => {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
    return true;
  } catch { return false; }
};

export const isStorageAvailable = (): boolean => {
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    return true;
  } catch { return false; }
};

export const getStorageSize = (): number => {
  let total = 0;
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) total += localStorage[key].length + key.length;
  }
  return total;
};

export const getAppStorageSize = (): number => {
  let total = 0;
  Object.keys(localStorage)
    .filter(k => k.startsWith(STORAGE_PREFIX))
    .forEach(k => { total += localStorage[k].length + k.length; });
  return total;
};

export const backupStorage = (): string | null => {
  try {
    const data: Record<string, any> = {};
    Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .forEach(k => { data[k] = localStorage[k]; });
    return JSON.stringify(data);
  } catch { return null; }
};

export const restoreStorage = (backup: string): boolean => {
  try {
    const data = JSON.parse(backup);
    Object.keys(data).forEach(k => localStorage.setItem(k, data[k]));
    return true;
  } catch { return false; }
};
