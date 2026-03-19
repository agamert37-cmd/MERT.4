/**
 * useModuleProtocol - Standartlastirilmis Modul Baslangic Protokolu
 * 
 * Her ERP modulu bu hook'u cagirarak standart guvenlik, dil, yetkilendirme,
 * loglama ve modul-arasi iletisim protokollerini otomatik olarak baslatir.
 * 
 * Kullanim:
 * ```ts
 * const mp = useModuleProtocol({
 *   moduleName: 'stok',
 *   requiredPermissions: ['stok_view'],
 * });
 * 
 * // Auth & Language
 * mp.user, mp.currentEmployee, mp.t
 * 
 * // Permissions
 * mp.can.view, mp.can.add, mp.can.edit, mp.can.delete
 * 
 * // Logging
 * mp.log('Urun eklendi', { productId: '123' })
 * mp.logSecurity('Yetkisiz erisim denemesi', 'high')
 * 
 * // Module Bus
 * mp.emit('stok:added', { productId: '123', productName: 'Test', quantity: 10 })
 * 
 * // Health
 * mp.health -> { status: 'healthy' | 'degraded' | 'error', ... }
 * ```
 */

import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logActivity } from '../utils/activityLogger';
import { moduleBus, ModuleEvent, ModuleEventMap } from '../lib/module-bus';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ModuleProtocolConfig {
  /** Modul adi (kucuk harf, alt cizgi). Ornegin: 'stok', 'cari', 'kasa' */
  moduleName: string;
  /** Modulu gormek icin gereken izin(ler) */
  requiredPermissions?: string[];
  /** Modul acildiginda otomatik log atsln mi */
  logOnMount?: boolean;
  /** Sayfa URL'si (opsiyonel, otomatik navigate icin) */
  pageRoute?: string;
}

export interface ModulePermissions {
  isSuperAdmin: boolean;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
  check: (permission: string) => boolean;
}

export type ModuleHealthStatus = 'healthy' | 'degraded' | 'error' | 'initializing';

export interface ModuleHealth {
  status: ModuleHealthStatus;
  authOk: boolean;
  languageOk: boolean;
  employeeOk: boolean;
  issues: string[];
}

export interface ModuleProtocol {
  // Contexts
  user: any;
  currentEmployee: any;
  t: (key: string, params?: Record<string, any>) => string;
  language: string;

  // Permissions
  can: ModulePermissions;

  // Logging
  log: (message: string, extra?: Record<string, any>) => void;
  logSecurity: (message: string, level?: 'info' | 'medium' | 'high', extra?: Record<string, any>) => void;

  // Module Bus
  emit: <E extends ModuleEvent>(event: E, payload: ModuleEventMap[E]) => void;
  on: <E extends ModuleEvent>(event: E, listener: (payload: ModuleEventMap[E]) => void) => void;
  onPrefix: (prefix: string, listener: (data: { event: string; payload: any }) => void) => void;

  // Health
  health: ModuleHealth;
  moduleName: string;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useModuleProtocol(config: ModuleProtocolConfig): ModuleProtocol {
  const { moduleName, requiredPermissions = [], logOnMount = true } = config;

  // ── Core Contexts ─────────────────────────────────────────────────────
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { t, lang: language } = useLanguage();

  const mountLogged = useRef(false);
  const subscriptions = useRef<Array<() => void>>([]);

  // ── Permissions ───────────────────────────────────────────────────────
  const can = useMemo<ModulePermissions>(() => {
    const isSuperAdmin = user?.id === 'admin-super' || user?.id === 'admin-1';
    const isManager = user?.role === 'Yönetici';
    const perms = currentEmployee?.permissions || [];

    const check = (perm: string): boolean => {
      if (isSuperAdmin || isManager) return true;
      return perms.includes(perm);
    };

    return {
      isSuperAdmin,
      canView: isSuperAdmin || isManager || check(`${moduleName}_view`),
      canAdd: isSuperAdmin || isManager || check(`${moduleName}_add`),
      canEdit: isSuperAdmin || isManager || check(`${moduleName}_edit`),
      canDelete: isSuperAdmin || isManager || check(`${moduleName}_delete`),
      canManage: isSuperAdmin || isManager || check(`${moduleName}_manage`),
      check,
    };
  }, [user?.id, user?.role, currentEmployee?.permissions, moduleName]);

  // ── Logging helpers ───────────────────────────────────────────────────
  const log = useCallback((message: string, extra?: Record<string, any>) => {
    logActivity('custom', message, {
      employeeName: user?.name,
      page: moduleName,
      ...extra,
    });
  }, [user?.name, moduleName]);

  const logSecurity = useCallback((message: string, level: 'info' | 'medium' | 'high' = 'medium', extra?: Record<string, any>) => {
    logActivity('security_alert', message, {
      level,
      employeeName: user?.name,
      page: moduleName,
      ...extra,
    });
  }, [user?.name, moduleName]);

  // ── Module Bus wrappers ───────────────────────────────────────────────
  const emit = useCallback(<E extends ModuleEvent>(event: E, payload: ModuleEventMap[E]) => {
    moduleBus.emit(event, payload);
  }, []);

  const on = useCallback(<E extends ModuleEvent>(event: E, listener: (payload: ModuleEventMap[E]) => void) => {
    const unsub = moduleBus.on(event, listener);
    subscriptions.current.push(unsub);
  }, []);

  const onPrefix = useCallback((prefix: string, listener: (data: { event: string; payload: any }) => void) => {
    const unsub = moduleBus.onPrefix(prefix, listener);
    subscriptions.current.push(unsub);
  }, []);

  // ── Mount loglama ─────────────────────────────────────────────────────
  useEffect(() => {
    if (logOnMount && !mountLogged.current && user) {
      mountLogged.current = true;
      logActivity('custom', `${moduleName} modulu acildi`, {
        employeeName: user?.name,
        page: moduleName,
      });
    }
  }, [logOnMount, moduleName, user]);

  // ── Cleanup subscriptions on unmount ──────────────────────────────────
  useEffect(() => {
    return () => {
      subscriptions.current.forEach(unsub => unsub());
      subscriptions.current = [];
    };
  }, []);

  // ── Health check ──────────────────────────────────────────────────────
  const health = useMemo<ModuleHealth>(() => {
    const issues: string[] = [];
    const authOk = !!user;
    const languageOk = !!t;
    const employeeOk = !!currentEmployee || can.isSuperAdmin;

    if (!authOk) issues.push('Kullanici oturumu bulunamadi');
    if (!languageOk) issues.push('Dil sistemi baslatilmadi');
    if (!employeeOk) issues.push('Personel bilgisi yuklenemedi');

    if (requiredPermissions.length > 0 && !can.canView) {
      issues.push(`${moduleName} erisim yetkisi yok`);
    }

    let status: ModuleHealthStatus = 'healthy';
    if (issues.length > 0 && issues.length <= 1) status = 'degraded';
    if (issues.length > 1 || !authOk) status = 'error';
    if (!user) status = 'initializing';

    return { status, authOk, languageOk, employeeOk, issues };
  }, [user, t, currentEmployee, can.isSuperAdmin, can.canView, requiredPermissions, moduleName]);

  return {
    user,
    currentEmployee,
    t,
    language,
    can,
    log,
    logSecurity,
    emit,
    on,
    onPrefix,
    health,
    moduleName,
  };
}