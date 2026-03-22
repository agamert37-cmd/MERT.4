import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Wallet,
  MoreHorizontal, X, FileText, Banknote, CalendarCheck,
  UserCog, Factory, ArrowLeftRight, Receipt, FileCheck,
  FolderOpen, Database, MessageSquare, ShieldAlert, Settings,
  Megaphone, Truck, Search, FileEdit, RefreshCw, Wifi, WifiOff,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { forceSync } from '../utils/storage';
import { toast } from 'sonner';

interface NavItem {
  path: string;
  labelKey: string;
  icon: React.ElementType;
  color: string;
  permKey?: string;
}

// Primary 5 tabs shown in bottom bar
const primaryTabs: NavItem[] = [
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, color: 'blue', permKey: 'dashboard' },
  { path: '/sales', labelKey: 'nav.sales', icon: ShoppingCart, color: 'green', permKey: 'satis' },
  { path: '/stok', labelKey: 'nav.stock', icon: Package, color: 'indigo', permKey: 'stok' },
  { path: '/cari', labelKey: 'nav.customers', icon: Users, color: 'sky', permKey: 'cari' },
  { path: '/kasa', labelKey: 'nav.cash', icon: Wallet, color: 'emerald', permKey: 'kasa' },
];

// All other pages in "more" drawer - grouped
const moreGroups: { titleKey: string; items: NavItem[] }[] = [
  {
    titleKey: 'mobileNav.operations',
    items: [
      { path: '/tahsilat', labelKey: 'nav.collection', icon: Banknote, color: 'lime', permKey: 'kasa' },
      { path: '/cekler', labelKey: 'nav.checks', icon: FileEdit, color: 'purple', permKey: 'kasa' },
      { path: '/faturalar', labelKey: 'nav.invoices', icon: FileCheck, color: 'indigo', permKey: 'kasa' },
      { path: '/stok-hareket', labelKey: 'nav.stockMovement', icon: ArrowLeftRight, color: 'cyan', permKey: 'stok' },
      { path: '/uretim', labelKey: 'nav.production', icon: Factory, color: 'orange', permKey: 'stok' },
    ],
  },
  {
    titleKey: 'mobileNav.reportsManagement',
    items: [
      { path: '/gun-sonu', labelKey: 'nav.dayEnd', icon: CalendarCheck, color: 'rose', permKey: 'raporlar' },
      { path: '/raporlar', labelKey: 'nav.reports', icon: FileText, color: 'cyan', permKey: 'raporlar' },
      { path: '/fis-gecmisi', labelKey: 'nav.receiptHistory', icon: Receipt, color: 'amber', permKey: 'raporlar' },
      { path: '/personel', labelKey: 'nav.personnel', icon: UserCog, color: 'purple', permKey: 'personel' },
      { path: '/arac', labelKey: 'nav.vehicles', icon: Truck, color: 'orange', permKey: 'personel' },
    ],
  },
  {
    titleKey: 'mobileNav.system',
    items: [
      { path: '/dosyalar', labelKey: 'nav.files', icon: FolderOpen, color: 'teal', permKey: 'ayarlar' },
      { path: '/pazarlama', labelKey: 'nav.marketing', icon: Megaphone, color: 'pink', permKey: 'ayarlar' },
      { path: '/yedekler', labelKey: 'nav.backups', icon: Database, color: 'slate', permKey: 'ayarlar' },
      { path: '/chat', labelKey: 'nav.aiAssistant', icon: MessageSquare, color: 'violet', permKey: 'dashboard' },
      { path: '/guvenlik', labelKey: 'nav.security', icon: ShieldAlert, color: 'red', permKey: 'ayarlar' },
      { path: '/settings', labelKey: 'nav.settings', icon: Settings, color: 'gray', permKey: 'ayarlar' },
    ],
  },
];

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  blue:    { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  green:   { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30' },
  indigo:  { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30' },
  sky:     { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30' },
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  lime:    { bg: 'bg-lime-500/15', text: 'text-lime-400', border: 'border-lime-500/30' },
  purple:  { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  cyan:    { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  orange:  { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  rose:    { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' },
  amber:   { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  teal:    { bg: 'bg-teal-500/15', text: 'text-teal-400', border: 'border-teal-500/30' },
  pink:    { bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/30' },
  slate:   { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
  violet:  { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
  red:     { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  gray:    { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' },
};

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);

  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  // Close on route change
  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  const hasPermission = (permKey?: string) => {
    if (!permKey) return true;
    if (user?.id === 'admin-super' || user?.id === 'admin-1' || user?.role === 'Yönetici') return true;
    return currentEmployee?.permissions?.includes(permKey);
  };

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path));

  // Check if any "more" page is currently active
  const isMoreActive = moreGroups.some(g => g.items.some(i => isActive(i.path)));

  // Hafif dokunma titreşimi (destekleyen cihazlarda)
  const haptic = (type: 'light' | 'medium' = 'light') => {
    if ('vibrate' in navigator) {
      navigator.vibrate(type === 'light' ? 8 : 18);
    }
  };

  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    haptic('medium');
    try {
      await forceSync();
      toast.success('Veriler güncellendi', { id: 'mobile-sync', duration: 2000 });
    } catch {
      toast.error('Senkronizasyon başarısız', { id: 'mobile-sync', duration: 2000 });
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Swipe down to close (daha hassas eşik: 60px)
  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - startY.current;
    if (diff > 60) {
      haptic('light');
      setIsMoreOpen(false);
    }
  };

  return (
    <>
      {/* More Drawer (Bottom Sheet) */}
      <AnimatePresence>
        {isMoreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[98]"
              onClick={() => setIsMoreOpen(false)}
            />
            <motion.div
              ref={sheetRef}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-[99] bg-[#0d1117]/98 backdrop-blur-2xl border-t border-white/10 rounded-t-3xl max-h-[75vh] overflow-hidden flex flex-col"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3">
                <div>
                  <h3 className="text-white font-bold text-lg">{t('mobileNav.allModules') || 'Tüm Modüller'}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isOnline ? (
                      <Wifi className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <WifiOff className="w-3 h-3 text-red-400" />
                    )}
                    <span className={`text-[11px] font-medium ${isOnline ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                      {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={handleSync}
                    disabled={isSyncing || !isOnline}
                    className="p-2 rounded-xl bg-blue-600/15 border border-blue-500/20 text-blue-400 disabled:opacity-40 transition-colors"
                    title="Verileri Senkronize Et"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  </motion.button>
                  <button
                    onClick={() => setIsMoreOpen(false)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5 no-scrollbar">
                {moreGroups.map((group, gi) => (
                  <div key={gi}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5 px-1">
                      {t(group.titleKey) || group.titleKey}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {group.items.filter(i => hasPermission(i.permKey)).map(item => {
                        const Icon = item.icon;
                        const active = isActive(item.path);
                        const colors = colorMap[item.color] || colorMap.gray;
                        return (
                          <motion.button
                            key={item.path}
                            whileTap={{ scale: 0.92 }}
                            onClick={() => { haptic('light'); navigate(item.path); }}
                            className={`flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-2xl border transition-all ${
                              active
                                ? `${colors.bg} ${colors.border} border`
                                : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                            }`}
                          >
                            <div className={`p-2 rounded-xl ${active ? colors.bg : 'bg-white/5'}`}>
                              <Icon className={`w-5 h-5 ${active ? colors.text : 'text-gray-400'}`} />
                            </div>
                            <span className={`text-[11px] font-medium leading-tight text-center ${
                              active ? 'text-white' : 'text-gray-400'
                            }`}>
                              {t(item.labelKey)}
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-[97] lg:hidden">
        {/* Çevrimdışı uyarı şeridi */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-red-600/20 border-t border-red-500/30">
                <WifiOff className="w-3 h-3 text-red-400 flex-shrink-0" />
                <span className="text-[11px] text-red-300 font-medium">Çevrimdışı — değişiklikler bağlantı gelince senkronize edilecek</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Sync göstergesi */}
        <AnimatePresence>
          {isSyncing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-blue-600/20 border-t border-blue-500/30">
                <RefreshCw className="w-3 h-3 text-blue-400 animate-spin flex-shrink-0" />
                <span className="text-[11px] text-blue-300 font-medium">Senkronize ediliyor...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Glass background */}
        <div className="absolute inset-0 bg-[#0a0e14]/90 backdrop-blur-2xl border-t border-white/[0.08]" />

        <div className="relative flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom,0px)]">
          {primaryTabs.filter(i => hasPermission(i.permKey)).map(item => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const colors = colorMap[item.color] || colorMap.gray;

            return (
              <button
                key={item.path}
                onClick={() => { haptic('light'); navigate(item.path); }}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5 relative min-w-0"
              >
                {/* Active indicator */}
                {active && (
                  <motion.div
                    layoutId="mobileNavIndicator"
                    className={`absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full`}
                    style={{
                      background: `linear-gradient(90deg, ${
                        item.color === 'blue' ? '#3b82f6' :
                        item.color === 'green' ? '#22c55e' :
                        item.color === 'indigo' ? '#6366f1' :
                        item.color === 'sky' ? '#0ea5e9' :
                        '#10b981'
                      }, transparent)`
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <motion.div
                  animate={active ? { scale: 1.1, y: -1 } : { scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Icon className={`w-5 h-5 ${active ? colors.text : 'text-gray-500'}`} />
                </motion.div>
                <span className={`text-[10px] font-medium truncate max-w-full px-0.5 ${
                  active ? 'text-white' : 'text-gray-500'
                }`}>
                  {t(item.labelKey)}
                </span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => { haptic('medium'); setIsMoreOpen(true); }}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5 relative min-w-0"
          >
            {isMoreActive && (
              <motion.div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-gradient-to-r from-purple-500 to-transparent"
              />
            )}
            <motion.div
              animate={isMoreOpen ? { rotate: 90 } : { rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <MoreHorizontal className={`w-5 h-5 ${isMoreActive ? 'text-purple-400' : 'text-gray-500'}`} />
            </motion.div>
            <span className={`text-[10px] font-medium ${isMoreActive ? 'text-white' : 'text-gray-500'}`}>
              {t('mobileNav.more') || 'Daha'}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
