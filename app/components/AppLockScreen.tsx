import { useState, useEffect, useCallback } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { isAppLocked, unlockApp, startLockTimer, updateActivity, onAppLock } from '../lib/secure-storage';
import { broadcastLock } from '../lib/broadcast-sync';
import { useAuth } from '../contexts/AuthContext';

/**
 * Uygulama Kilit Ekranı
 * - 10 dakika hareketsizlikte otomatik kilitler
 * - Kullanıcı adı/şifresiyle açılır (PIN yerine — ek altyapı gerekmez)
 * - Tüm sekmelere broadcastLock() gönderilir
 */
export function AppLockScreen({ children }: { children: React.ReactNode }) {
  const { user, login } = useAuth();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Sayfa yüklendiğinde kilit durumunu kontrol et
    if (isAppLocked()) setLocked(true);

    // Kilit zamanlayıcısını başlat
    startLockTimer();

    // Başka sekmeden kilit mesajı gelirse
    const unsubLock = onAppLock(() => setLocked(true));

    // Kullanıcı etkileşimlerini izle
    const activity = () => updateActivity();
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => document.addEventListener(e, activity, { passive: true }));

    return () => {
      unsubLock();
      events.forEach(e => document.removeEventListener(e, activity));
    };
  }, []);

  const handleUnlock = useCallback(async () => {
    if (!pin.trim() || !user) return;
    setLoading(true);
    setError('');

    try {
      const ok = await login(user.username || user.name || '', pin);
      if (ok) {
        unlockApp();
        setLocked(false);
        setPin('');
      } else {
        setError('Yanlış şifre. Tekrar deneyin.');
      }
    } catch {
      setError('Giriş başarısız.');
    } finally {
      setLoading(false);
    }
  }, [pin, user, login]);

  // Kilitle butonu (toolbar vb. için export edilebilir)
  useEffect(() => {
    const handleManualLock = () => {
      broadcastLock();
      setLocked(true);
    };
    window.addEventListener('mert:lock_app', handleManualLock);
    return () => window.removeEventListener('mert:lock_app', handleManualLock);
  }, []);

  if (!locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#06090f]">
      <div className="w-full max-w-sm px-6 py-8 flex flex-col items-center gap-6">
        {/* İkon */}
        <div className="w-20 h-20 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Lock className="w-10 h-10 text-blue-400" />
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Uygulama Kilitlendi</h2>
          <p className="text-sm text-gray-500 mt-1">
            Devam etmek için şifrenizi girin
          </p>
          {user && (
            <p className="text-xs text-blue-400 mt-1">{user.name}</p>
          )}
        </div>

        <div className="w-full space-y-3">
          <input
            type="password"
            value={pin}
            onChange={e => { setPin(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            placeholder="Şifreniz"
            autoFocus
            className="w-full px-4 py-3 bg-white/[0.05] border border-white/10 rounded-xl text-white text-center text-lg tracking-widest placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            onClick={handleUnlock}
            disabled={loading || !pin.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            Kilidi Aç
          </button>
        </div>

        <p className="text-xs text-gray-600 text-center">
          10 dakika hareketsizlik sonrası otomatik kilitlendi
        </p>
      </div>
    </div>
  );
}

/** Uygulamayı manuel kilitlemek için çağrılır */
export function lockApp(): void {
  window.dispatchEvent(new Event('mert:lock_app'));
}
