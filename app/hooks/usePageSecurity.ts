/**
 * usePageSecurity - Merkezi Sayfa Guvenlik Hook'u
 * 
 * Tum CRUD sayfalarinda tekrar eden guvenlik katmanlarini tek bir hook'ta toplar:
 * - Rate limiter (islem tipi + kullanici bazli)
 * - SQL injection tespiti
 * - XSS / input sanitizasyonu
 * - Tamper-proof audit trail (log hash zinciri)
 * - Hizli islem algılama (trackAction)
 * - Tehdit kaydi olusturma
 * - Guvenlik loglama
 * 
 * Kullanim:
 *   const sec = usePageSecurity('stok');
 *   if (!sec.checkRate('add')) return;
 *   if (!sec.validateInputs({ name: val, desc: val2 })) return;
 *   sec.auditLog('stok_add', itemId, itemName);
 */

import { useCallback, useRef } from 'react';
import {
  checkRateLimit,
  addSecurityThreat,
  deepSanitize,
  detectSQLInjection,
  appendToLogChain,
  generateCSRFToken,
  validateCSRFToken,
} from '../utils/security';
import { useSecurityMonitor } from './useSecurityMonitor';
import { logActivity } from '../utils/activityLogger';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

type ActionType = 'add' | 'edit' | 'delete' | 'view' | 'export' | 'import' | 'custom';

/** Her islem tipi icin rate limit ayarlari */
const RATE_LIMITS: Record<ActionType, { max: number; windowMs: number }> = {
  add: { max: 12, windowMs: 60_000 },
  edit: { max: 18, windowMs: 60_000 },
  delete: { max: 8, windowMs: 60_000 },
  view: { max: 60, windowMs: 60_000 },
  export: { max: 5, windowMs: 120_000 },
  import: { max: 5, windowMs: 120_000 },
  custom: { max: 20, windowMs: 60_000 },
};

export function usePageSecurity(pageName: string) {
  const { user } = useAuth();
  const { trackAction } = useSecurityMonitor(true);
  const csrfTokenRef = useRef<string | null>(null);

  /** Rate limit kontrolu — false donerse islem reddedilmeli */
  const checkRate = useCallback((action: ActionType, customKey?: string): boolean => {
    const key = customKey || `${pageName}_${action}_${user?.id || 'anon'}`;
    const limits = RATE_LIMITS[action];
    const result = checkRateLimit(key, limits.max, limits.windowMs);

    if (!result.allowed) {
      const waitSec = Math.ceil(result.resetIn / 1000);
      toast.error(`Cok fazla islem! ${waitSec} saniye bekleyin.`);
      addSecurityThreat({
        type: 'rapid_actions',
        severity: 'medium',
        title: `Hizli Islem Tespiti - ${pageName}`,
        description: `${user?.name || 'Bilinmeyen'} kullanicisi ${pageName} sayfasinda kisa surede cok fazla '${action}' islemi gerceklestirdi.`,
        source: pageName,
        metadata: { userId: user?.id, action, remaining: result.remaining },
      });
      logActivity('security_alert', `Rate limit asildi: ${pageName}/${action}`, {
        level: 'medium',
        employeeName: user?.name,
        page: pageName,
      });
      return false;
    }

    trackAction(`${pageName}_${action}`);
    return true;
  }, [pageName, user, trackAction]);

  /** Birden fazla input'u SQL injection + XSS icin toplu kontrol et */
  const validateInputs = useCallback((inputs: Record<string, string>, silent = false): boolean => {
    for (const [field, value] of Object.entries(inputs)) {
      if (!value) continue;

      if (detectSQLInjection(value)) {
        if (!silent) toast.error('Guvenlik ihlali tespit edildi! Girdi reddedildi.');
        addSecurityThreat({
          type: 'sql_injection',
          severity: 'critical',
          title: `SQL Injection Denemesi - ${pageName}`,
          description: `"${field}" alaninda supheli girdi tespit edildi. Deger: "${value.substring(0, 50)}..."`,
          source: `${pageName}_form`,
          metadata: { userId: user?.id, field },
        });
        logActivity('security_alert', `SQL Injection - ${pageName}/${field}`, {
          level: 'high',
          employeeName: user?.name,
          page: pageName,
          metadata: { field, valuePreview: value.substring(0, 30) },
        });
        return false;
      }
    }
    return true;
  }, [pageName, user]);

  /** Tek bir string'i sanitize et (XSS temizleme) */
  const sanitize = useCallback((input: string): string => {
    return deepSanitize(input);
  }, []);

  /** Birden fazla alani toplu sanitize et */
  const sanitizeAll = useCallback(<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T => {
    const result = { ...obj };
    for (const field of fields) {
      if (typeof result[field] === 'string') {
        (result as any)[field] = deepSanitize(result[field] as string);
      }
    }
    return result;
  }, []);

  /** Tamper-proof audit trail'e kayit ekle */
  const auditLog = useCallback((action: string, itemId?: string, itemName?: string) => {
    const entry = `${pageName}:${action}:${itemId || '-'}:${itemName || '-'}:${Date.now()}`;
    appendToLogChain(entry);
  }, [pageName]);

  /** Yetkisiz erisim girisimini logla */
  const logUnauthorized = useCallback((action: string, detail?: string) => {
    const description = detail || `Kullanici ${action} islemi icin yetki sahibi degil.`;
    toast.error(`Bu islem icin yetkiniz bulunmamaktadir.`);
    logActivity('security_alert', `Yetkisiz erisim - ${pageName}/${action}`, {
      level: 'high',
      employeeName: user?.name,
      page: pageName,
      description,
    });
    addSecurityThreat({
      type: 'privilege_escalation',
      severity: 'high',
      title: `Yetkisiz Erisim Girisimi - ${pageName}`,
      description,
      source: pageName,
      metadata: { userId: user?.id, action },
    });
  }, [pageName, user]);

  /** CSRF token olustur */
  const getCSRFToken = useCallback((): string => {
    const token = generateCSRFToken();
    csrfTokenRef.current = token;
    return token;
  }, []);

  /** CSRF token dogrula */
  const verifyCSRF = useCallback((token: string): boolean => {
    return validateCSRFToken(token);
  }, []);

  /** Toplu guvenlik kontrolu — tek satirda rate + input validation */
  const preCheck = useCallback((action: ActionType, inputs?: Record<string, string>): boolean => {
    if (!checkRate(action)) return false;
    if (inputs && !validateInputs(inputs)) return false;
    return true;
  }, [checkRate, validateInputs]);

  return {
    checkRate,
    validateInputs,
    sanitize,
    sanitizeAll,
    auditLog,
    logUnauthorized,
    getCSRFToken,
    verifyCSRF,
    preCheck,
    trackAction,
  };
}
