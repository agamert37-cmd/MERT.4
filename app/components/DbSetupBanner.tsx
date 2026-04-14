/**
 * Veritabanı Kurulum Banner'ı
 *
 * Uygulama açılışında CouchDB durumunu kullanıcıya bildirir.
 * Bağlantı hatası durumunda inline yapılandırma formu gösterir.
 */

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Database, CheckCircle2, Loader2, AlertTriangle, RefreshCw, X, Settings, Eye, EyeOff, Save } from 'lucide-react';
import { testCouchDbConnection } from '../lib/pouchdb';
import { getCouchDbConfig, setCouchDbConfig } from '../lib/db-config';

type DbInitStatus = 'idle' | 'checking' | 'setup_needed' | 'setting_up' | 'ready' | 'error';

async function checkDatabaseStatus(): Promise<{ status: DbInitStatus; message?: string }> {
  try {
    const result = await testCouchDbConnection();
    if (result.ok) return { status: 'ready' };
    return { status: 'error', message: result.error || 'CouchDB bağlantı hatası' };
  } catch (e: any) {
    return { status: 'error', message: e.message || 'Bağlantı hatası' };
  }
}

interface DbSetupBannerProps {
  onReady?: () => void;
}

export function DbSetupBanner({ onReady }: DbSetupBannerProps) {
  const [status, setStatus] = useState<DbInitStatus>('checking');
  const [message, setMessage] = useState('Veritabanı kontrol ediliyor...');
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  // Inline CouchDB config form
  const [showConfig, setShowConfig] = useState(false);
  const [cfgUrl, setCfgUrl] = useState('');
  const [cfgUser, setCfgUser] = useState('');
  const [cfgPass, setCfgPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);

  const runInit = async () => {
    setStatus('checking');
    setMessage('Veritabanı kontrol ediliyor...');
    setVisible(true);
    setDismissed(false);
    setShowConfig(false);

    const checkResult = await checkDatabaseStatus();

    if (checkResult.status === 'ready') {
      setStatus('ready');
      setMessage('Veritabanı bağlantısı başarılı ✓');
      onReady?.();
      setTimeout(() => setVisible(false), 3000);
      return;
    }

    setStatus('error');
    setMessage(checkResult.message || 'Bağlantı hatası');

    // Mevcut config'i forma doldur
    const cfg = getCouchDbConfig();
    setCfgUrl(cfg.url || '');
    setCfgUser(cfg.user || '');
    setCfgPass(cfg.password || '');
  };

  useEffect(() => { runInit(); }, []);

  const handleSaveConfig = async () => {
    if (!cfgUrl.trim()) return;
    setCfgSaving(true);
    setCouchDbConfig({ url: cfgUrl.trim(), user: cfgUser.trim(), password: cfgPass });
    // Bağlantıyı test et
    const result = await testCouchDbConnection();
    setCfgSaving(false);
    if (result.ok) {
      setStatus('ready');
      setMessage('Veritabanı bağlantısı başarılı ✓');
      setShowConfig(false);
      onReady?.();
      // Sayfayı yenile — yeni config ile sync başlasın
      setTimeout(() => location.reload(), 1200);
    } else {
      setMessage(result.error || 'Bağlantı kurulamadı');
    }
  };

  if (dismissed || !visible) return null;

  const colorMap: Record<DbInitStatus, { bg: string; border: string; icon: React.ReactNode; textColor: string }> = {
    idle:        { bg: 'bg-secondary/60',      border: 'border-border/30',       icon: <Database className="w-4 h-4 text-muted-foreground" />,           textColor: 'text-muted-foreground' },
    checking:    { bg: 'bg-blue-500/10',        border: 'border-blue-500/20',     icon: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />,       textColor: 'text-blue-400' },
    setup_needed:{ bg: 'bg-amber-500/10',       border: 'border-amber-500/20',    icon: <Database className="w-4 h-4 text-amber-400" />,                  textColor: 'text-amber-400' },
    setting_up:  { bg: 'bg-amber-500/10',       border: 'border-amber-500/20',    icon: <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />,      textColor: 'text-amber-400' },
    ready:       { bg: 'bg-emerald-500/10',     border: 'border-emerald-500/20',  icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,            textColor: 'text-emerald-400' },
    error:       { bg: 'bg-red-500/10',         border: 'border-red-500/20',      icon: <AlertTriangle className="w-4 h-4 text-red-400" />,               textColor: 'text-red-400' },
  };

  const c = colorMap[status];

  return (
    <AnimatePresence>
      <motion.div
        key="db-setup-banner"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25 }}
        className={`fixed top-0 left-0 right-0 z-[200] ${c.bg} border-b ${c.border}`}
      >
        {/* Ana satır */}
        <div className="px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {c.icon}
            <span className={`text-xs font-medium ${c.textColor} truncate`}>
              {message}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {status === 'error' && (
              <>
                <button
                  onClick={() => setShowConfig(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20 transition-all active:scale-95"
                >
                  <Settings className="w-3 h-3" />
                  {showConfig ? 'Kapat' : 'Ayarla'}
                </button>
                <button
                  onClick={runInit}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 transition-all active:scale-95"
                >
                  <RefreshCw className="w-3 h-3" />
                  Tekrar Dene
                </button>
              </>
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
        </div>

        {/* Inline CouchDB yapılandırma formu */}
        <AnimatePresence>
          {showConfig && status === 'error' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-red-500/20 bg-black/40 px-4 py-3"
            >
              <p className="text-[10px] text-red-400/80 mb-2 font-semibold uppercase tracking-wider">CouchDB Bağlantı Ayarları</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[180px]">
                  <input
                    type="text"
                    value={cfgUrl}
                    onChange={e => setCfgUrl(e.target.value)}
                    placeholder="http://localhost:5984"
                    className="w-full bg-black/60 text-white text-xs px-3 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div className="w-28">
                  <input
                    type="text"
                    value={cfgUser}
                    onChange={e => setCfgUser(e.target.value)}
                    placeholder="Kullanıcı"
                    className="w-full bg-black/60 text-white text-xs px-3 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div className="w-32 relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={cfgPass}
                    onChange={e => setCfgPass(e.target.value)}
                    placeholder="Şifre"
                    className="w-full bg-black/60 text-white text-xs px-3 py-2 pr-8 rounded-lg border border-white/10 focus:outline-none focus:border-red-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  >
                    {showPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <button
                  onClick={handleSaveConfig}
                  disabled={cfgSaving || !cfgUrl.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {cfgSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Kaydet & Test Et
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
