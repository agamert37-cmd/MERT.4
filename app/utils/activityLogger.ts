/**
 * Kullanici Hareket Izleme (Activity Logger)
 * Tum kullanici islemlerini merkezi olarak loglar
 */

import { getFromStorage, setInStorage, StorageKey } from './storage';
import { kvSet } from '../lib/supabase-kv';

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

const MAX_LOGS = 1000;

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
    // [AJAN-2] KV sync — denetim logları tüm cihazlarda görünsün
    kvSet('activity_logs', logs).catch(() => {});
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
  kvSet('activity_logs', []).catch(() => {});
}

// ─── ANOMALİ TESPİT ALGORİTMASI ──────────────────────────────────────────────

export type AnomalyType =
  | 'mass_delete'        // Kısa sürede çok sayıda silme
  | 'bulk_export'        // Sık rapor/export
  | 'off_hours_bulk'     // Mesai dışı yoğun işlem
  | 'rapid_login_fail'   // Hızlı başarısız giriş denemeleri
  | 'unusual_volume'     // Olağandışı işlem hacmi
  | 'repeated_resource'; // Aynı kaynak üzerinde aşırı işlem

export interface AnomalyReport {
  type: AnomalyType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  count: number;
  windowMinutes: number;
  employeeId?: string;
  employeeName?: string;
  detectedAt: string;
}

/**
 * Son N dakikadaki logları belirli kalıplara göre tarar.
 * @param windowMinutes — taranacak geriye dönük süre (dakika), varsayılan: 30
 */
export function detectActivityAnomalies(windowMinutes = 30): AnomalyReport[] {
  const anomalies: AnomalyReport[] = [];
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  const recent = getActivityLogs().filter(l => new Date(l.timestamp).getTime() >= cutoff);

  if (recent.length === 0) return anomalies;

  // ── 1. Toplu silme tespiti (1 dakikada >5 silme) ──────────────────────────
  const deleteTypes: ActivityType[] = ['sale_delete', 'stock_delete', 'customer_delete', 'receipt_delete'];
  const deletes = recent.filter(l => deleteTypes.includes(l.type));

  // 1-dakikalık yuvarlanmış zaman dilimleri ile gruplama
  const deleteByMinute = new Map<string, ActivityLogEntry[]>();
  deletes.forEach(l => {
    const minute = new Date(l.timestamp).toISOString().substring(0, 16); // YYYY-MM-DDTHH:MM
    const bucket = deleteByMinute.get(minute) || [];
    bucket.push(l);
    deleteByMinute.set(minute, bucket);
  });
  deleteByMinute.forEach((entries, _minute) => {
    if (entries.length >= 5) {
      const emp = entries[0];
      anomalies.push({
        type: 'mass_delete',
        severity: entries.length >= 10 ? 'critical' : 'high',
        title: 'Toplu Silme Tespit Edildi',
        description: `Bir dakika içinde ${entries.length} kayıt silme işlemi gerçekleşti.`,
        count: entries.length,
        windowMinutes: 1,
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        detectedAt: new Date().toISOString(),
      });
    }
  });

  // ── 2. Sık export/rapor tespiti (30 dakikada >5 export) ──────────────────
  const exports = recent.filter(l => l.type === 'report_export' || l.type === 'backup_create');
  if (exports.length >= 5) {
    anomalies.push({
      type: 'bulk_export',
      severity: 'medium',
      title: 'Sık Rapor Exportu',
      description: `Son ${windowMinutes} dakikada ${exports.length} export/yedek işlemi yapıldı.`,
      count: exports.length,
      windowMinutes,
      employeeId: exports[0].employeeId,
      employeeName: exports[0].employeeName,
      detectedAt: new Date().toISOString(),
    });
  }

  // ── 3. Mesai dışı yoğun işlem (06:00 öncesi veya 23:00 sonrası, >10 işlem) ─
  const offHours = recent.filter(l => {
    const h = new Date(l.timestamp).getHours();
    return h < 6 || h >= 23;
  });
  if (offHours.length >= 10) {
    // Çalışana göre grupla
    const byEmp = new Map<string, ActivityLogEntry[]>();
    offHours.forEach(l => {
      const k = l.employeeId || 'unknown';
      byEmp.set(k, (byEmp.get(k) || []).concat(l));
    });
    byEmp.forEach((entries) => {
      if (entries.length >= 10) {
        anomalies.push({
          type: 'off_hours_bulk',
          severity: 'high',
          title: 'Mesai Dışı Yoğun Aktivite',
          description: `${entries[0].employeeName || 'Bilinmeyen'} kullanıcısı mesai saatleri dışında ${entries.length} işlem yaptı.`,
          count: entries.length,
          windowMinutes,
          employeeId: entries[0].employeeId,
          employeeName: entries[0].employeeName,
          detectedAt: new Date().toISOString(),
        });
      }
    });
  }

  // ── 4. Hızlı başarısız giriş (5 dakikada >3 login) ──────────────────────
  const loginWindow = Date.now() - 5 * 60 * 1000;
  const recentLogins = getActivityLogs()
    .filter(l => l.type === 'login' && new Date(l.timestamp).getTime() >= loginWindow);
  // Sadece güvenlik uyarısı içeren loginler
  const failedLogins = recentLogins.filter(l => (l.metadata?.level === 'high' || l.metadata?.failed));
  if (failedLogins.length >= 3) {
    anomalies.push({
      type: 'rapid_login_fail',
      severity: 'critical',
      title: 'Hızlı Başarısız Giriş',
      description: `5 dakika içinde ${failedLogins.length} başarısız giriş denemesi tespit edildi.`,
      count: failedLogins.length,
      windowMinutes: 5,
      detectedAt: new Date().toISOString(),
    });
  }

  // ── 5. Olağandışı işlem hacmi (son windowMinutes'de normal günün 3 katı) ──
  const todayAll = getTodayLogs();
  const avgPerWindow = (todayAll.length / (24 * 60 / windowMinutes)) || 1;
  if (recent.length > avgPerWindow * 3 && recent.length > 20) {
    anomalies.push({
      type: 'unusual_volume',
      severity: 'medium',
      title: 'Olağandışı İşlem Hacmi',
      description: `Son ${windowMinutes} dk'da ${recent.length} işlem (günlük ortalama ${windowMinutes} dk diliminin 3 katı).`,
      count: recent.length,
      windowMinutes,
      detectedAt: new Date().toISOString(),
    });
  }

  // Tekrar tespitini önlemek için aynı tipten birden fazla raporlanmasın
  const seen = new Set<AnomalyType>();
  return anomalies.filter(a => {
    if (seen.has(a.type)) return false;
    seen.add(a.type);
    return true;
  });
}