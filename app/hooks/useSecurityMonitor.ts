/**
 * useSecurityMonitor - Gercek Zamanli Guvenlik Izleme Hook'u
 * 
 * - Tehdit tespiti ve bildirim
 * - Oturum butunlugu kontrolu
 * - Hizli islem algilama
 * - Diger sekmelerden force logout dinleme
 * - Periyodik guvenlik skoru guncelleme
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getSecurityThreats,
  calculateSecurityScore,
  validateSessionFingerprint,
  updateSessionActivity,
  addSecurityThreat,
  detectRapidActions,
  getActiveSessions,
  removeSession,
  executeAutoResponse,
  recordDeviceLogin,
  type SecurityThreat,
  type SecurityScore,
  type ActiveSession,
} from '../utils/security';
import { logActivity } from '../utils/activityLogger';
import { useAuth } from '../contexts/AuthContext';

interface SecurityMonitorState {
  threats: SecurityThreat[];
  unresolvedCount: number;
  criticalCount: number;
  score: SecurityScore;
  activeSessions: ActiveSession[];
  threatLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  isMonitoring: boolean;
}

export function useSecurityMonitor(enabled = true) {
  const { user, logout } = useAuth();
  const [state, setState] = useState<SecurityMonitorState>({
    threats: [],
    unresolvedCount: 0,
    criticalCount: 0,
    score: calculateSecurityScore(),
    activeSessions: [],
    threatLevel: 'safe',
    isMonitoring: false,
  });

  const lastRefresh = useRef(0);

  const refreshState = useCallback(() => {
    const threats = getSecurityThreats();
    const unresolved = threats.filter(t => !t.resolved);
    const critical = unresolved.filter(t => t.severity === 'critical').length;
    const high = unresolved.filter(t => t.severity === 'high').length;

    let threatLevel: SecurityMonitorState['threatLevel'] = 'safe';
    if (critical > 0) threatLevel = 'critical';
    else if (high > 2) threatLevel = 'high';
    else if (high > 0 || unresolved.length > 5) threatLevel = 'medium';
    else if (unresolved.length > 0) threatLevel = 'low';

    setState({
      threats,
      unresolvedCount: unresolved.length,
      criticalCount: critical,
      score: calculateSecurityScore(),
      activeSessions: getActiveSessions(),
      threatLevel,
      isMonitoring: true,
    });

    lastRefresh.current = Date.now();
  }, []);

  // Baslangic ve periyodik yenileme
  useEffect(() => {
    if (!enabled) return;

    refreshState();

    // Her 30 saniyede guvenlik durumunu kontrol et
    const interval = setInterval(() => {
      refreshState();
      
      // Oturum aktivitesini guncelle
      if (user) {
        updateSessionActivity();
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [enabled, user, refreshState]);

  // Oturum parmak izi kontrolu (her 2 dakikada)
  useEffect(() => {
    if (!enabled || !user) return;

    const fpCheck = setInterval(() => {
      const result = validateSessionFingerprint();
      if (!result.valid) {
        addSecurityThreat({
          type: 'session_hijack',
          severity: 'critical',
          title: 'Oturum Parmak Izi Uyusmazligi',
          description: result.reason || 'Oturum parmak izi beklenmeyen sekilde degisti. Olasi oturum ele gecirme denemesi.',
          source: 'fingerprint_check',
          metadata: { userId: user.id, userName: user.name },
        });

        logActivity('security_alert', 'Oturum Parmak Izi Uyusmazligi', {
          level: 'high',
          employeeName: user.name,
          description: result.reason,
        });

        refreshState();
      }
    }, 120_000);

    return () => clearInterval(fpCheck);
  }, [enabled, user, refreshState]);

  // Diger sekmelerden force logout dinleme
  useEffect(() => {
    if (!enabled) return;

    const handleForceLogout = (e: StorageEvent) => {
      if (e.key === 'isleyen_et_force_logout' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          const currentSessionId = sessionStorage.getItem('isleyen_et_current_session_id');
          if (data.sessionId === currentSessionId) {
            logActivity('security_alert', 'Uzaktan Oturum Sonlandirma', {
              level: 'high',
              description: 'Oturum baska bir cihaz/sekme tarafindan sonlandirildi.',
              employeeName: user?.name,
            });
            removeSession();
            logout();
          }
        } catch {}
      }
    };

    window.addEventListener('storage', handleForceLogout);
    return () => window.removeEventListener('storage', handleForceLogout);
  }, [enabled, user, logout]);

  // Tehdit event listener
  useEffect(() => {
    if (!enabled) return;

    const handleThreat = (e: Event) => {
      // Otomatik yanit motorunu calistir
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.id) {
        try {
          const result = executeAutoResponse(detail);
          if (result) {
            console.log(`%c[SecurityMonitor] Oto-yanit tetiklendi: ${result.action} (kural: ${result.ruleId})`, 'color: #f59e0b; font-weight: bold');
            if (result.action === 'force_logout' && logout) {
              setTimeout(() => { removeSession(); logout(); }, 1500);
            }
          }
        } catch (err) {
          console.warn('[SecurityMonitor] Oto-yanit hatasi:', err);
        }
      }
      refreshState();
    };

    window.addEventListener('security_threat', handleThreat);
    return () => window.removeEventListener('security_threat', handleThreat);
  }, [enabled, refreshState, logout]);

  // Hizli islem algilama wrapper
  const trackAction = useCallback((actionName: string) => {
    if (detectRapidActions()) {
      addSecurityThreat({
        type: 'rapid_actions',
        severity: 'medium',
        title: 'Hizli Ardisik Islem Tespiti',
        description: `Kisa surede cok fazla '${actionName}' islemi gerceklestirildi. Otomasyon veya bot aktivitesi olabilir.`,
        source: 'action_monitor',
        metadata: { actionName, userId: user?.id },
      });
      refreshState();
    }
  }, [user, refreshState]);

  return {
    ...state,
    refreshState,
    trackAction,
  };
}