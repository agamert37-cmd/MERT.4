import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Clock } from 'lucide-react';
import { walLoad, replayWAL } from '../lib/active-client';
import { toast } from 'sonner';

/**
 * Çevrimdışı kuyruk göstergesi — WAL'daki bekleyen işlem sayısını gösterir.
 * Bağlantı geldiğinde otomatik replay yapar veya kullanıcı manuel tetikleyebilir.
 */
export function OfflineSyncBadge() {
  const [pendingCount, setPendingCount] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const refresh = () => setPendingCount(walLoad().length);
    refresh();

    const interval = setInterval(refresh, 5000);
    const onOnline = () => { setIsOnline(true); refresh(); };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('storage', refresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Bağlantı geldiğinde otomatik replay dene
  useEffect(() => {
    if (!isOnline || pendingCount === 0) return;
    handleReplay(true);
  }, [isOnline]);

  const handleReplay = async (silent = false) => {
    if (replaying || pendingCount === 0) return;
    setReplaying(true);
    try {
      const { replayed, failed } = await replayWAL();
      setPendingCount(walLoad().length);
      if (!silent && replayed > 0) {
        toast.success(`${replayed} bekleyen işlem senkronize edildi${failed > 0 ? `, ${failed} başarısız` : ''}`, { duration: 3000 });
      } else if (!silent && replayed === 0) {
        toast.info('Bekleyen işlem yok', { duration: 2000 });
      }
    } catch (e: any) {
      if (!silent) toast.error(`Replay hatası: ${e.message}`, { duration: 3000 });
    } finally {
      setReplaying(false);
    }
  };

  if (pendingCount === 0 && isOnline) return null;

  return (
    <button
      onClick={() => handleReplay(false)}
      disabled={replaying}
      title={`${pendingCount} bekleyen işlem — tıklayarak senkronize edin`}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
        transition-all cursor-pointer select-none
        ${!isOnline
          ? 'bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25'
          : 'bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25'}
      `}
    >
      {replaying ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : !isOnline ? (
        <WifiOff className="w-3 h-3" />
      ) : (
        <Clock className="w-3 h-3" />
      )}
      {replaying ? 'Senkronize ediliyor…' : !isOnline ? 'Çevrimdışı' : `${pendingCount} bekliyor`}
    </button>
  );
}
