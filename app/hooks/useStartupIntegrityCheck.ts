import { useEffect, useState } from 'react';
import { runIntegrityCheck } from '../utils/data-integrity';
import type { IntegrityReport } from '../utils/data-integrity';

const LAST_CHECK_KEY = 'mert4_last_integrity_check';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 saat

export interface StartupCheckResult {
  report: IntegrityReport | null;
  criticalCount: number;
  warningCount: number;
  dismissed: boolean;
  dismiss: () => void;
}

/**
 * Uygulama açıldığında (24 saatte bir) veri bütünlük kontrolü çalıştırır.
 * Kritik sorun bulunursa UI'a bildirim için state döndürür.
 */
export function useStartupIntegrityCheck(): StartupCheckResult {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const last = localStorage.getItem(LAST_CHECK_KEY);
    if (last && Date.now() - Number(last) < CHECK_INTERVAL_MS) return;

    // Kullanıcı sayfayı kullanmaya başlasın, sonra kontrol et
    const timer = setTimeout(() => {
      try {
        const result = runIntegrityCheck(true);
        localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
        const hasCritical = result.checks.some(c => c.severity === 'critical' && !c.fixed);
        const hasWarnings = result.checks.some(c => c.severity === 'warning' && !c.fixed);
        if (hasCritical || (hasWarnings && result.autoFixed > 0)) {
          setReport(result);
        }
      } catch (e) {
        console.error('[IntegrityCheck]', e);
      }
    }, 8000);

    return () => clearTimeout(timer);
  }, []);

  const criticalCount = report?.checks.filter(c => c.severity === 'critical' && !c.fixed).length ?? 0;
  const warningCount = report?.checks.filter(c => c.severity === 'warning').length ?? 0;

  return {
    report,
    criticalCount,
    warningCount,
    dismissed,
    dismiss: () => setDismissed(true),
  };
}
