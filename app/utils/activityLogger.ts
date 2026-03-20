/**
 * Kullanici Hareket Izleme (Activity Logger)
 * Tum kullanici islemlerini merkezi olarak loglar
 */

import { getFromStorage, setInStorage, StorageKey } from './storage';

export type ActivityType =
  | 'login' | 'logout'
  | 'page_visit'
  | 'sale_create' | 'sale_delete'
  | 'stock_add' | 'stock_update' | 'stock_delete'
  | 'customer_add' | 'customer_update' | 'customer_delete'
  | 'cash_income' | 'cash_expense'
  | 'vehicle_shift_start' | 'vehicle_shift_end' | 'vehicle_change'
  | 'employee_add' | 'employee_update'
  | 'receipt_create' | 'receipt_delete'
  | 'backup_create' | 'backup_restore'
  | 'settings_change'
  | 'report_export'
  | 'production_start' | 'production_end'
  | 'check_add' | 'check_update'
  | 'collection_add'
  | 'day_end'
  | 'security_alert'
  | 'custom';

export type ActivityCategory = 'auth' | 'sales' | 'stock' | 'customer' | 'cash' | 'vehicle' | 'personnel' | 'system' | 'production' | 'finance' | 'security';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: ActivityType;
  category: ActivityCategory;
  title: string;
  description?: string;
  employeeId?: string;
  employeeName?: string;
  metadata?: Record<string, any>;
  /** Islemin yapildigi sayfa */
  page?: string;
  /** IP veya session bilgisi */
  sessionId?: string;
}

const MAX_LOGS = 500;

// Session ID olustur
let _sessionId: string | null = null;
function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }
  return _sessionId;
}

/**
 * Kategori otomatik belirleme
 */
function resolveCategory(type: ActivityType): ActivityCategory {
  if (type.startsWith('login') || type.startsWith('logout')) return 'auth';
  if (type.startsWith('sale') || type.startsWith('receipt')) return 'sales';
  if (type.startsWith('stock')) return 'stock';
  if (type.startsWith('customer')) return 'customer';
  if (type.startsWith('cash')) return 'cash';
  if (type.startsWith('vehicle')) return 'vehicle';
  if (type.startsWith('employee')) return 'personnel';
  if (type.startsWith('production')) return 'production';
  if (type.startsWith('check') || type.startsWith('collection')) return 'finance';
  if (type.startsWith('security')) return 'security';
  return 'system';
}

/**
 * Yeni bir kullanici hareketi logla
 */
export function logActivity(
  type: ActivityType,
  title: string,
  options?: {
    description?: string;
    employeeId?: string;
    employeeName?: string;
    metadata?: Record<string, any>;
    page?: string;
    category?: ActivityCategory;
    level?: 'info' | 'medium' | 'high';
  }
): void {
  try {
    const logs = getFromStorage<ActivityLogEntry[]>(StorageKey.USER_ACTIVITY_LOG) || [];

    const entry: ActivityLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      category: options?.category || resolveCategory(type),
      title,
      description: options?.description,
      employeeId: options?.employeeId,
      employeeName: options?.employeeName,
      metadata: {
        ...(options?.metadata || {}),
        ...(options?.level ? { level: options.level } : {}),
      },
      page: options?.page,
      sessionId: getSessionId(),
    };

    logs.unshift(entry);

    // Maks limit
    if (logs.length > MAX_LOGS) {
      logs.length = MAX_LOGS;
    }

    setInStorage(StorageKey.USER_ACTIVITY_LOG, logs);
  } catch (e) {
    console.warn('[ActivityLogger] Log kaydetme hatasi:', e);
  }
}

/**
 * Tum loglari getir
 */
export function getActivityLogs(): ActivityLogEntry[] {
  return getFromStorage<ActivityLogEntry[]>(StorageKey.USER_ACTIVITY_LOG) || [];
}

/**
 * Kategoriye gore filtrele
 */
export function getLogsByCategory(category: ActivityCategory): ActivityLogEntry[] {
  return getActivityLogs().filter(l => l.category === category);
}

/**
 * Calisana gore filtrele
 */
export function getLogsByEmployee(employeeId: string): ActivityLogEntry[] {
  return getActivityLogs().filter(l => l.employeeId === employeeId);
}

/**
 * Belirli bir tarih araligindaki loglari getir
 */
export function getLogsByDateRange(startDate: Date, endDate: Date): ActivityLogEntry[] {
  const start = startDate.getTime();
  const end = endDate.getTime();
  return getActivityLogs().filter(l => {
    const t = new Date(l.timestamp).getTime();
    return t >= start && t <= end;
  });
}

/**
 * Bugunun loglarini getir
 */
export function getTodayLogs(): ActivityLogEntry[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getLogsByDateRange(today, tomorrow);
}

/**
 * Kategorilere gore ozet istatistikleri getir
 */
export function getActivityStats(): Record<ActivityCategory, number> {
  const logs = getTodayLogs();
  const stats: Record<ActivityCategory, number> = {
    auth: 0, sales: 0, stock: 0, customer: 0, cash: 0,
    vehicle: 0, personnel: 0, system: 0, production: 0, finance: 0, security: 0
  };
  logs.forEach(l => { stats[l.category]++; });
  return stats;
}

/**
 * Loglari temizle
 */
export function clearActivityLogs(): void {
  setInStorage(StorageKey.USER_ACTIVITY_LOG, []);
}