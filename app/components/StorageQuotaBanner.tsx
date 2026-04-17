import { useEffect, useState } from 'react';
import { HardDrive, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { useStartupIntegrityCheck } from '../hooks/useStartupIntegrityCheck';

interface QuotaInfo {
  usageMB: number;
  quotaMB: number;
  percent: number;
}

async function getStorageQuota(): Promise<QuotaInfo | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (quota === 0) return null;
    return {
      usageMB: Math.round(usage / 1024 / 1024),
      quotaMB: Math.round(quota / 1024 / 1024),
      percent: Math.round((usage / quota) * 100),
    };
  } catch {
    return null;
  }
}

/**
 * İki görev üstlenir:
 * 1. IndexedDB depolama kotası %80+ dolduğunda uyarı gösterir
 * 2. Startup bütünlük kontrolü kritik sorun bulursa bildirim gösterir
 */
export function StorageQuotaBanner() {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [quotaDismissed, setQuotaDismissed] = useState(false);
  const { report, criticalCount, warningCount, dismissed, dismiss } = useStartupIntegrityCheck();

  useEffect(() => {
    getStorageQuota().then(info => {
      if (info && info.percent >= 80) setQuota(info);
    });
  }, []);

  const showQuota = quota && !quotaDismissed;
  const showIntegrity = report && !dismissed && (criticalCount > 0 || warningCount > 0);

  if (!showQuota && !showIntegrity) return null;

  return (
    <div className="fixed bottom-16 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 flex flex-col gap-2">
      {/* Depolama kota uyarısı */}
      {showQuota && (
        <div className={`flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-sm shadow-xl ${
          quota.percent >= 95
            ? 'bg-red-950/90 border-red-500/40 text-red-200'
            : 'bg-amber-950/90 border-amber-500/40 text-amber-200'
        }`}>
          <HardDrive className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">
              {quota.percent >= 95 ? 'Depolama Kritik Seviyede' : 'Depolama Dolmak Üzere'}
            </p>
            <p className="text-xs opacity-75 mt-0.5">
              {quota.usageMB} MB / {quota.quotaMB} MB kullanıldı (%{quota.percent})
            </p>
            <div className="w-full h-1.5 bg-white/20 rounded-full mt-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${quota.percent >= 95 ? 'bg-red-400' : 'bg-amber-400'}`}
                style={{ width: `${Math.min(quota.percent, 100)}%` }}
              />
            </div>
            {quota.percent >= 90 && (
              <p className="text-xs opacity-60 mt-1">Yedek alın ve eski verileri temizleyin.</p>
            )}
          </div>
          <button onClick={() => setQuotaDismissed(true)} className="opacity-50 hover:opacity-100 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bütünlük kontrolü uyarısı */}
      {showIntegrity && (
        <div className={`flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-sm shadow-xl ${
          criticalCount > 0
            ? 'bg-red-950/90 border-red-500/40 text-red-200'
            : 'bg-blue-950/90 border-blue-500/40 text-blue-200'
        }`}>
          {criticalCount > 0 ? (
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
          ) : (
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold">
              {criticalCount > 0 ? `${criticalCount} Kritik Veri Sorunu` : 'Veri Kontrolü Tamamlandı'}
            </p>
            <p className="text-xs opacity-75 mt-0.5">
              {report!.autoFixed > 0
                ? `${report!.autoFixed} sorun otomatik düzeltildi`
                : `${warningCount} uyarı bulundu`}
              {' · '}
              <button
                onClick={() => { window.location.href = '/yedekler'; dismiss(); }}
                className="underline underline-offset-2 hover:no-underline"
              >
                Detaylar
              </button>
            </p>
          </div>
          <button onClick={dismiss} className="opacity-50 hover:opacity-100 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
