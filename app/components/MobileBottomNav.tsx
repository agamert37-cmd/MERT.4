// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Opus 4.6
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Wallet,
  MoreHorizontal, X, FileText, Banknote, CalendarCheck,
  UserCog, Factory, ArrowLeftRight, Receipt, FileCheck,
  FolderOpen, Database, MessageSquare, ShieldAlert, Settings,
  Megaphone, Truck, Search, FileEdit, RefreshCw, Wifi, WifiOff,
  LogOut,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { restartAllSync, testCouchDbConnection } from '../lib/pouchdb';
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

// Color tokens
const colorMap: Record<string, { bg: string; text: string; bar: string }> = {
  blue:    { bg: 'bg-blue-500/20',    text: 'text-blue-400',    bar: '#3b82f6' },
  green:   { bg: 'bg-green-500/20',   text: 'text-green-400',   bar: '#22c55e' },
  indigo:  { bg: 'bg-indigo-500/20',  text: 'text-indigo-400',  bar: '#6366f1' },
  sky:     { bg: 'bg-sky-500/20',     text: 'text-sky-400',     bar: '#0ea5e9' },
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', bar: '#10b981' },
  lime:    { bg: 'bg-lime-500/20',    text: 'text-lime-400',    bar: '#84cc16' },
  purple:  { bg: 'bg-purple-500/20',  text: 'text-purple-400',  bar: '#a855f7' },
  cyan:    { bg: 'bg-cyan-500/20',    text: 'text-cyan-400',    bar: '#06b6d4' },
  orange:  { bg: 'bg-orange-500/20',  text: 'text-orange-400',  bar: '#f97316' },
  rose:    { bg: 'bg-rose-500/20',    text: 'text-rose-400',    bar: '#f43f5e' },
  amber:   { bg: 'bg-amber-500/20',   text: 'text-amber-400',   bar: '#f59e0b' },
  teal:    { bg: 'bg-teal-500/20',    text: 'text-teal-400',    bar: '#14b8a6' },
  pink:    { bg: 'bg-pink-500/20',    text: 'text-pink-400',    bar: '#ec4899' },
  slate:   { bg: 'bg-slate-500/20',   text: 'text-slate-400',   bar: '#64748b' },
  violet:  { bg: 'bg-violet-500/20',  text: 'text-violet-400',  bar: '#8b5cf6' },
  red:     { bg: 'bg-red-500/20',     text: 'text-red-400',     bar: '#ef4444' },
  gray:    { bg: 'bg-gray-500/20',    text: 'text-gray-400',    bar: '#6b7280' },
};

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const { currentEmployee } = useEmployee();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

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
    setSearch('');
  }, [location.pathname]);

  // Focus search when drawer opens
  useEffect(() => {
    if (isMoreOpen) {
      setTimeout(() => searchRef.current?.focus(), 200);
    }
  }, [isMoreOpen]);

  const hasPermission = (permKey?: string) => {
    if (!permKey) return true;
    if (user?.id === 'admin-super' || user?.id === 'admin-1' || user?.role === 'Yönetici') return true;
    return currentEmployee?.permissions?.includes(permKey);
  };

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path));

  const isMoreActive = moreGroups.some(g => g.items.some(i => isActive(i.path)));

  const haptic = (type: 'light' | 'medium' = 'light') => {
    if ('vibrate' in navigator) navigator.vibrate(type === 'light' ? 6 : 14);
  };

  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    haptic('medium');
    try {
      // Önce bağlantı testi yap
      const result = await testCouchDbConnection();
      if (!result.ok) {
        toast.error(`Sunucuya ulaşılamıyor: ${result.error || 'Bağlantı hatası'}`, {
          id: 'mobile-sync',
          duration: 3000,
        });
        return;
      }
      // Bağlantı tamam — tüm sync'leri yeniden başlat
      restartAllSync();
      toast.success('Senkronizasyon başlatıldı', { id: 'mobile-sync', duration: 2000 });
    } catch (e: any) {
      toast.error(`Senkronizasyon hatası: ${e?.message || 'Bilinmeyen hata'}`, {
        id: 'mobile-sync',
        duration: 3000,
      });
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Swipe down to close (daha hassas eşik: 60px)
  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches[0].clientY - startY.current > 60) {
      haptic('light');
      setIsMoreOpen(false);
    }
  };

  // Filtered groups for search
  const filteredGroups = search.trim()
    ? moreGroups.map(g => ({
        ...g,
        items: g.items.filter(i =>
          hasPermission(i.permKey) &&
          t(i.labelKey).toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(g => g.items.length > 0)
    : moreGroups.map(g => ({ ...g, items: g.items.filter(i => hasPermission(i.permKey)) })).filter(g => g.items.length > 0);

  return (
    <>
      {/* ── More Drawer (Bottom Sheet) ── */}
      <AnimatePresence>
        {isMoreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[98]"
              onClick={() => setIsMoreOpen(false)}
            />
            <motion.div
              ref={sheetRef}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[99] bg-[#0d1117]/98 backdrop-blur-2xl border-t border-white/[0.08] rounded-t-3xl max-h-[82vh] overflow-hidden flex flex-col"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-2.5 pb-1.5">
                <div className="w-9 h-[3px] rounded-full bg-white/20" />
              </div>

              {/* Header — Kullanıcı bilgisi + araçlar */}
              <div className="px-5 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold text-lg">{t('mobileNav.allModules') || 'Tüm Modüller'}</h3>
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
                {/* Kullanıcı kartı + durum */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{user?.name || 'Kullanıcı'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user?.role || ''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isOnline ? (
                      <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Search bar */}
              <div className="px-4 pb-3">
                <div className="flex items-center gap-2 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Modül ara..."
                    className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="text-gray-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 overscroll-contain">
                {filteredGroups.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                    <Search className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">Sonuç bulunamadı</p>
                  </div>
                )}

                {/* Oturum Kapat */}
                <div className="pt-3 mt-1 border-t border-white/[0.06]">
                  <button
                    onClick={() => { setIsMoreOpen(false); logout(); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98] transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Oturum Kapat</span>
                  </button>
                </div>
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
        <div className="absolute inset-0 bg-[#0a0e14]/92 backdrop-blur-2xl border-t border-white/[0.07]" />

        <div
          className="relative flex items-stretch justify-around"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}
        >
          {primaryTabs.filter(i => hasPermission(i.permKey)).map(item => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const colors = colorMap[item.color] || colorMap.gray;

            return (
              <button
                key={item.path}
                onClick={() => { haptic('light'); navigate(item.path); }}
                aria-label={t(item.labelKey)}
                aria-current={active ? 'page' : undefined}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative min-w-0 min-h-[48px]"
              >
                {/* Active pill under icon */}
                {active && (
                  <motion.div
                    layoutId="mobileNavPill"
                    className="absolute inset-x-2 inset-y-1 rounded-xl"
                    style={{ background: `${colors.bar}18` }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                {/* Top indicator bar */}
                {active && (
                  <motion.div
                    layoutId="mobileNavBar"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full"
                    style={{ background: colors.bar }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <motion.div
                  animate={active ? { scale: 1.1, y: -1 } : { scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="relative z-10"
                >
                  <Icon className={`w-[19px] h-[19px] ${active ? colors.text : 'text-gray-500'}`} />
                </motion.div>
                <span className={`text-[10px] font-medium truncate max-w-full px-1 relative z-10 ${
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
            aria-label="Tüm modüller"
            aria-expanded={isMoreOpen}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative min-w-0 min-h-[48px]"
          >
            {isMoreActive && (
              <div className="absolute inset-x-2 inset-y-1 rounded-xl bg-purple-500/10" />
            )}
            {isMoreActive && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full bg-purple-500" />
            )}
            <motion.div
              animate={isMoreOpen ? { rotate: 45, scale: 1.1 } : { rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="relative z-10"
            >
              <MoreHorizontal className={`w-[19px] h-[19px] ${isMoreActive ? 'text-purple-400' : 'text-gray-500'}`} />
            </motion.div>
            <span className={`text-[10px] font-medium relative z-10 ${isMoreActive ? 'text-white' : 'text-gray-500'}`}>
              {t('mobileNav.more') || 'Daha'}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
