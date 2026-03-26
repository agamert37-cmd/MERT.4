/**
 * Veritabanı Kurulum Banner'ı
 *
 * Uygulama açılışında veritabanı durumunu kullanıcıya bildirir:
 *   - Tablolar kontrol ediliyor  → mavi "yükleniyor" banner
 *   - Kurulum yapılıyor          → turuncu "kurulum" banner
 *   - Kurulum tamamlandı         → yeşil "hazır" banner (3s sonra gizlenir)
 *   - Hata                       → kırmızı "hata" banner (retry butonu)
 */

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Database, CheckCircle2, Loader2, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { testCouchDbConnection } from '../lib/pouchdb';

type DbInitStatus = 'idle' | 'checking' | 'setup_needed' | 'setting_up' | 'ready' | 'error';

// CouchDB-based stubs replacing old db-init (Supabase)
async function checkDatabaseStatus(): Promise<{ status: DbInitStatus; message?: string }> {
  try {
    const result = await testCouchDbConnection();
    if (result.ok) return { status: 'ready' };
    return { status: 'error', message: result.error || 'CouchDB bağlantı hatası' };
  } catch (e: any) {
    return { status: 'error', message: e.message || 'Bağlantı hatası' };
  }
}

async function setupDatabase(): Promise<{ status: DbInitStatus; message?: string }> {
  return checkDatabaseStatus();
}

function resetDbInitCache() {
  // no-op for CouchDB
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DbSetupBannerProps {
  /** Kurulum tamamlandığında çağrılır */
  onReady?: () => void;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export function DbSetupBanner({ onReady }: DbSetupBannerProps) {
  const [status, setStatus] = useState<DbInitStatus>('checking');
  const [message, setMessage] = useState('Veritabanı kontrol ediliyor...');
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const runInit = async () => {
    setStatus('checking');
    setMessage('Veritabanı tablolar kontrol ediliyor...');
    setVisible(true);
    setDismissed(false);

    // 1. Mevcut durumu kontrol et
    const checkResult = await checkDatabaseStatus();

    if (checkResult.status === 'ready') {
      setStatus('ready');
      setMessage('Veritabanı hazır ✓');
      onReady?.();
      setTimeout(() => setVisible(false), 3000);
      return;
    }

    if (checkResult.status === 'error') {
      setStatus('error');
      setMessage(checkResult.message || 'Bağlantı hatası');
      return;
    }

    // 2. Tablolar eksik → hemen kur
    setStatus('setting_up');
    setMessage('Tablolar oluşturuluyor...');

    const setupResult = await setupDatabase();

    if (setupResult.status === 'ready') {
      setStatus('ready');
      setMessage('Tablolar oluşturuldu, veritabanı hazır ✓');
      onReady?.();
      setTimeout(() => setVisible(false), 3000);
    } else {
      setStatus('error');
      setMessage(setupResult.message || 'Kurulum başarısız');
    }
  };

  useEffect(() => {
    runInit();
  }, []);

  const handleRetry = () => {
    resetDbInitCache();
    runInit();
  };

  if (dismissed || !visible) return null;

  const config: Record<string, {
    bg: string;
    border: string;
    icon: React.ReactNode;
    textColor: string;
  }> = {
    idle: {
      bg: 'bg-secondary/60',
      border: 'border-border/30',
      icon: <Database className="w-4 h-4 text-muted-foreground" />,
      textColor: 'text-muted-foreground',
    },
    checking: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      icon: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />,
      textColor: 'text-blue-400',
    },
    setup_needed: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: <Database className="w-4 h-4 text-amber-400" />,
      textColor: 'text-amber-400',
    },
    setting_up: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />,
      textColor: 'text-amber-400',
    },
    ready: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
      textColor: 'text-emerald-400',
    },
    error: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
      textColor: 'text-red-400',
    },
  };

  const c = config[status];

  return (
    <AnimatePresence>
      <motion.div
        key="db-setup-banner"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25 }}
        className={`fixed top-0 left-0 right-0 z-[200] ${c.bg} border-b ${c.border} px-4 py-2 flex items-center justify-between gap-3`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {c.icon}
          <span className={`text-xs font-medium ${c.textColor} truncate`}>
            {message}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {status === 'error' && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20 transition-all active:scale-95"
            >
              <RefreshCw className="w-3 h-3" />
              Tekrar Dene
            </button>
          )}
          {(status === 'ready' || status === 'error') && (
            <button
              onClick={() => setDismissed(true)}
              className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground/50 transition-all active:scale-95"
              title="Kapat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
