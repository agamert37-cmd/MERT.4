import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { NotificationPanel } from './NotificationPanel';
import { SupabaseStatusBadge } from './SupabaseStatus';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { createSystemBackup, getFromStorage, StorageKey } from '../utils/storage';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Wallet, 
  Truck, 
  UserCog,
  LogOut,
  UserCircle,
  ChevronDown,
  Check,
  FileText,
  Receipt,
  FolderOpen,
  Settings,
  ShieldAlert,
  Database,
  ShoppingCart,
  MessageSquare,
  Shield,
  ChevronsLeft,
  ChevronsRight,
  Zap,
  Banknote,
  Search,
  Command,
  CalendarCheck,
  AlertTriangle,
  ArrowLeftRight,
  Factory,
  Megaphone,
  Globe,
  FileEdit,
  FileCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { ProfileEditModal } from './ProfileEditModal';
import { RoleRequestModal } from './RoleRequestModal';
import { CommandPalette } from './CommandPalette';
import { QuickActionFab } from './QuickActionFab';
import { useLanguage } from '../contexts/LanguageContext';
import { type Language, LANGUAGES } from '../utils/i18n';
import { logActivity } from '../utils/activityLogger';
import { useSecurityMonitor } from '../hooks/useSecurityMonitor';
import { validateSessionFingerprint, updateSessionActivity, getSecurityPolicy } from '../utils/security';
import { MobileBottomNav } from './MobileBottomNav';
import { ScrollToTop } from './MobileHelpers';
import { useIsMobile } from '../hooks/useMobile';

interface MenuItem {
  path: string;
  labelKey: string;
  icon: React.ElementType;
  badge?: number;
  color?: string;
  permKey?: string;
}

const menuItems: MenuItem[] = [
  { path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, color: 'blue', permKey: 'dashboard' },
  { path: '/sales', labelKey: 'nav.sales', icon: ShoppingCart, color: 'green', permKey: 'satis' },
  { path: '/stok', labelKey: 'nav.stock', icon: Package, color: 'indigo', permKey: 'stok' },
  { path: '/stok-hareket', labelKey: 'nav.stockMovement', icon: ArrowLeftRight, color: 'cyan', permKey: 'stok' },
  { path: '/uretim', labelKey: 'nav.production', icon: Factory, color: 'orange', permKey: 'stok' },
  { path: '/cari', labelKey: 'nav.customers', icon: Users, color: 'sky', permKey: 'cari' },
  { path: '/kasa', labelKey: 'nav.cash', icon: Wallet, color: 'emerald', permKey: 'kasa' },
  { path: '/tahsilat', labelKey: 'nav.collection', icon: Banknote, color: 'lime', permKey: 'kasa' },
  { path: '/cekler', labelKey: 'nav.checks', icon: FileEdit, color: 'purple', permKey: 'kasa' },
  { path: '/gun-sonu', labelKey: 'nav.dayEnd', icon: CalendarCheck, color: 'rose', permKey: 'raporlar' },
  { path: '/arac', labelKey: 'nav.vehicles', icon: Truck, color: 'orange', permKey: 'personel' },
  { path: '/personel', labelKey: 'nav.personnel', icon: UserCog, color: 'purple', permKey: 'personel' },
  { path: '/raporlar', labelKey: 'nav.reports', icon: FileText, color: 'cyan', permKey: 'raporlar' },
  { path: '/fis-gecmisi', labelKey: 'nav.receiptHistory', icon: Receipt, color: 'amber', permKey: 'raporlar' },
  { path: '/faturalar', labelKey: 'nav.invoices', icon: FileCheck, color: 'indigo', permKey: 'kasa' },
  { path: '/dosyalar', labelKey: 'nav.files', icon: FolderOpen, color: 'teal', permKey: 'ayarlar' },
  { path: '/pazarlama', labelKey: 'nav.marketing', icon: Megaphone, color: 'pink', permKey: 'ayarlar' },
  { path: '/yedekler', labelKey: 'nav.backups', icon: Database, color: 'slate', permKey: 'ayarlar' },
  { path: '/chat', labelKey: 'nav.aiAssistant', icon: MessageSquare, color: 'violet', permKey: 'dashboard' },
  { path: '/guvenlik', labelKey: 'nav.security', icon: ShieldAlert, color: 'red', permKey: 'ayarlar' },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings, color: 'gray', permKey: 'ayarlar' },
];

// Path → Breadcrumb i18n key mapping
const breadcrumbKeyMap: Record<string, string> = {
  '/dashboard': 'breadcrumb.dashboard',
  '/sales': 'breadcrumb.sales',
  '/stok': 'breadcrumb.stock',
  '/stok-hareket': 'breadcrumb.stockMovement',
  '/uretim': 'breadcrumb.production',
  '/cari': 'breadcrumb.customers',
  '/kasa': 'breadcrumb.cash',
  '/tahsilat': 'breadcrumb.collection',
  '/cekler': 'breadcrumb.checks',
  '/gun-sonu': 'breadcrumb.dayEnd',
  '/arac': 'breadcrumb.vehicles',
  '/personel': 'breadcrumb.personnel',
  '/raporlar': 'breadcrumb.reports',
  '/fis-gecmisi': 'breadcrumb.receiptHistory',
  '/faturalar': 'breadcrumb.invoices',
  '/dosyalar': 'breadcrumb.files',
  '/pazarlama': 'breadcrumb.marketing',
  '/yedekler': 'breadcrumb.backups',
  '/chat': 'breadcrumb.aiAssistant',
  '/guvenlik': 'breadcrumb.security',
  '/settings': 'breadcrumb.settings',
};

// Spring physics animation config
const springConfig = {
  type: "spring" as const,
  stiffness: 240,
  damping: 26,
  mass: 1.0
};

const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
    filter: 'blur(12px)',
    scale: 0.985,
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    scale: 1,
    transition: {
      ...springConfig,
      filter: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
      scale: { type: 'spring', stiffness: 320, damping: 32, mass: 0.85 },
    }
  },
  exit: {
    opacity: 0,
    y: -12,
    filter: 'blur(10px)',
    scale: 0.992,
    transition: {
      duration: 0.24,
      ease: [0.4, 0, 0.2, 1]
    }
  }
};

// Animated counter hook
function useAnimatedCount(value: number, duration = 800) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) return;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setDisplay(end);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [value, duration]);
  return display;
}

// Current time display
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono tabular-nums"
    >
      <motion.span
        key={time.getSeconds()}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </motion.span>
    </motion.div>
  );
}

export function MainLayout() {
  const { user, logout } = useAuth();
  const { currentEmployee, availableEmployees = [], setCurrentEmployee } = useEmployee();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, setLang, languages, currentLanguage } = useLanguage();

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isRoleRequestModalOpen, setIsRoleRequestModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // ─── Global Security Monitor ─────────────────────────────────────
  const {
    threatLevel, unresolvedCount, criticalCount, refreshState: refreshSecurity,
  } = useSecurityMonitor(!!user);

  // Gerçek zamanlı tehdit toast bildirimleri
  useEffect(() => {
    if (!user) return;
    const handleThreat = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const severity = detail.severity;
      if (severity === 'critical') {
        toast.error(`🚨 KRİTİK TEHDİT: ${detail.title}`, { duration: 8000 });
      } else if (severity === 'high') {
        toast.warning(`⚠️ Yüksek Risk: ${detail.title}`, { duration: 5000 });
      }
    };
    window.addEventListener('security_threat', handleThreat);
    return () => window.removeEventListener('security_threat', handleThreat);
  }, [user]);

  // Dinamik oturum zaman aşımı (güvenlik politikasından)
  const sessionTimeoutMs = useMemo(() => {
    try { return getSecurityPolicy().sessionTimeoutMinutes * 60 * 1000; }
    catch { return 15 * 60 * 1000; }
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  // Security: Auto-logout on idle (15 minutes)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const IDLE_TIMEOUT = sessionTimeoutMs; // Dinamik zaman aşımı

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (user) {
          logActivity('security_alert', 'Otomatik oturum kapatma (Inactivity)', { 
            employeeName: user.name, 
            level: 'medium', 
            description: `${Math.round(sessionTimeoutMs / 60000)} dakika hareketsizlik nedeniyle oturum kapatıldı.` 
          });
          logout();
          toast.error("Oturum zaman aşımına uğradı. Güvenlik nedeniyle çıkış yapıldı.");
          navigate('/login');
        }
      }, IDLE_TIMEOUT);
    };

    // Her harekette oturum aktivitesini de güncelle (throttled — 60s)
    let lastSessionUpdate = 0;
    const handleActivity = () => {
      resetTimer();
      const now = Date.now();
      if (now - lastSessionUpdate > 60_000) {
        lastSessionUpdate = now;
        updateSessionActivity();
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, handleActivity, true));

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => document.removeEventListener(event, handleActivity, true));
    };
  }, [user, logout, navigate, sessionTimeoutMs]);

  // Route Protection (RBAC)
  useEffect(() => {
    if (!user || user.role === 'Yönetici' || user.id === 'admin-super' || user.id === 'admin-1') return;

    // Bulunan path'in permKey'ini bul
    const currentItem = menuItems.find(item => 
      location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
    );

    if (currentItem && currentItem.permKey) {
      const hasPermission = currentEmployee?.permissions?.includes(currentItem.permKey);
      if (!hasPermission) {
        toast.error('Bu sayfaya erişim yetkiniz bulunmamaktadır.');
        logActivity('security_alert', 'Yetkisiz erisim denemesi', { page: location.pathname, employeeName: user.name, level: 'high' });
        navigate('/dashboard');
      }
    }
  }, [location.pathname, user, currentEmployee, navigate]);

  // Live sidebar badges
  const [badgeData, setBadgeData] = useState({ criticalStock: 0, todayFisCount: 0 });
  useEffect(() => {
    const updateBadges = () => {
      try {
        const stok = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
        const fisler = getFromStorage<any[]>(StorageKey.FISLER) || [];
        const todayISO = new Date().toISOString().split('T')[0];
        const criticalStock = stok.filter(s => {
          const stock = Number(s.currentStock ?? s.current_stock ?? 0) || 0;
          const min = Number(s.minStock ?? s.min_stock ?? 0) || 0;
          return stock <= min && min > 0;
        }).length;
        const todayFisCount = fisler.filter(f => f.date?.startsWith(todayISO)).length;
        setBadgeData({ criticalStock, todayFisCount });
      } catch {}
    };
    updateBadges();
    window.addEventListener('storage_update', updateBadges);
    const interval = setInterval(updateBadges, 30000);
    return () => {
      window.removeEventListener('storage_update', updateBadges);
      clearInterval(interval);
    };
  }, []);

  // Ctrl+K shortcut for command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Breadcrumb
  const currentPageLabel = useMemo(() => {
    if (location.pathname.startsWith('/cari/')) return t('breadcrumb.customerDetail');
    const key = breadcrumbKeyMap[location.pathname];
    return key ? t(key) : '';
  }, [location.pathname, t]);

  // Sayfa degisikligi loglama
  useEffect(() => {
    const pageName = breadcrumbKeyMap[location.pathname];
    if (pageName) {
      logActivity('page_visit', t(pageName), {
        page: location.pathname,
        employeeId: currentEmployee?.id,
        employeeName: currentEmployee?.name,
      });
    }
  }, [location.pathname]);

  // Kullanici yoksa login'e yonlendir
  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleLogout = useCallback(() => {
    logout();
    toast.success(t('auth.loggedOut'));
    navigate('/login');
  }, [logout, navigate, t]);

  const handleBackup = useCallback(() => {
    try {
      createSystemBackup();
      toast.success(t('backups.createBackup') + ' ✓');
    } catch (error) {
      toast.error(t('common.error'));
    }
  }, [t]);

  const handleEmployeeSwitch = useCallback((employee: typeof currentEmployee) => {
    if (employee) {
      setCurrentEmployee(employee);
      toast.success(`${employee.name} olarak giriş yapıldı`);
    }
  }, [setCurrentEmployee]);

  if (!user) {
    return null;
  }

  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="min-h-screen bg-background flex relative overflow-hidden text-foreground">
        {/* Subtle Background Ambient Glow */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-15%] left-[15%] w-[40%] h-[45%] bg-blue-600/[0.04] rounded-full blur-[160px]" />
          <div className="absolute bottom-[-10%] right-[5%] w-[35%] h-[40%] bg-indigo-600/[0.03] rounded-full blur-[160px]" />
          <div className="absolute top-[50%] left-[60%] w-[25%] h-[30%] bg-cyan-600/[0.02] rounded-full blur-[140px]" />
        </div>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isMobileSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* Mobile Sidebar Drawer */}
        <AnimatePresence>
          {isMobileSidebarOpen && (
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
              className="fixed top-0 left-0 bottom-0 w-[270px] bg-sidebar/98 backdrop-blur-2xl border-r border-sidebar-border flex flex-col z-50 lg:hidden overflow-hidden"
            >
              {/* Mobile Sidebar inner gradient */}
              <div className="absolute inset-0 bg-gradient-to-b from-blue-600/[0.03] via-transparent to-indigo-600/[0.02] pointer-events-none" />

              {/* Mobile Logo & Close */}
              <div className="p-4 border-b border-border relative flex items-center justify-between">
                <Link to="/dashboard" className="flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-600/25 flex-shrink-0">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-white font-bold text-lg tracking-tight whitespace-nowrap">İŞLEYEN ET</h1>
                    <p className="text-muted-foreground/60 text-[10px] font-semibold tracking-[0.2em]">ERP v4.2 KALKAN</p>
                  </div>
                </Link>
                <button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="p-2 hover:bg-secondary rounded-lg text-muted-foreground transition-colors"
                >
                  <ChevronsLeft className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Navigation */}
              <nav className="flex-1 px-2 py-3 overflow-y-auto">
                <div className="space-y-0.5">
                  {menuItems.map((item) => {
                    const hasPermission = user?.id === 'admin-super' || user?.id === 'admin-1' || user?.role === 'Yönetici' ||
                      (currentEmployee?.permissions && item.permKey && currentEmployee.permissions.includes(item.permKey));
                    if (!hasPermission) return null;

                    const Icon = item.icon;
                    const isActive = location.pathname === item.path ||
                      (item.path !== '/dashboard' && location.pathname.startsWith(item.path));

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive ? 'text-white bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg shadow-blue-600/20' : 'text-muted-foreground hover:text-white hover:bg-secondary/50'
                        }`}
                      >
                        <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                        <span className="whitespace-nowrap">{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </nav>

              {/* Mobile User Section */}
              <div className="p-3 border-t border-border/60 space-y-2">
                {/* Profil kartı */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/30">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-lg flex-shrink-0 ${
                    user?.id === 'admin-super'
                      ? 'bg-gradient-to-br from-red-600 to-red-900'
                      : 'bg-gradient-to-br from-blue-600 to-purple-600'
                  }`}>
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${user?.id === 'admin-super' ? 'text-red-400' : 'text-white'}`}>
                      {user?.name || 'Kullanıcı'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user?.role || 'Personel'}</p>
                  </div>
                </div>
                {/* Profili Düzenle */}
                <button
                  onClick={() => { setIsMobileSidebarOpen(false); setIsProfileModalOpen(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-secondary/60 hover:text-white transition-colors"
                >
                  <UserCircle className="w-[18px] h-[18px]" />
                  <span>{t('userMenu.editProfile')}</span>
                </button>
                {/* Çıkış */}
                <button
                  onClick={() => { setIsMobileSidebarOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-[18px] h-[18px]" />
                  <span>{t('userMenu.logout')}</span>
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Desktop Sidebar */}
        <motion.aside 
          initial={false}
          animate={{ width: isCollapsed ? 72 : 260 }}
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          className="hidden lg:flex bg-sidebar/95 backdrop-blur-2xl border-r border-sidebar-border flex-col z-10 relative overflow-hidden"
        >
          {/* Sidebar inner gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-600/[0.03] via-transparent to-indigo-600/[0.02] pointer-events-none" />

          {/* Logo & Company */}
          <div className="p-4 border-b border-border relative">
            <Link to="/dashboard" className="flex items-center gap-3 group">
              <motion.div
                whileHover={{ scale: 1.12, rotate: 4, boxShadow: '0 0 22px rgba(99,102,241,0.55)' }}
                whileTap={{ scale: 0.93, rotate: -2 }}
                transition={{ type: 'spring', stiffness: 520, damping: 28, mass: 0.7 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-600/30 flex-shrink-0 relative overflow-hidden"
              >
                <Package className="w-5 h-5 text-white relative z-10" />
                {/* Shine sweep */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent skew-x-12"
                  animate={{ x: [-56, 56] }}
                  transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 5, ease: [0.4, 0, 0.6, 1] }}
                />
                {/* Subtle pulse glow overlay */}
                <motion.div
                  className="absolute inset-0 rounded-xl bg-white/5"
                  animate={{ opacity: [0, 0.15, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1 }}
                />
              </motion.div>
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    <h1 className="text-white font-bold text-lg tracking-tight group-hover:text-blue-400 transition-colors whitespace-nowrap">
                      ISLEYEN ET
                    </h1>
                    <p className="text-muted-foreground/60 text-[10px] font-semibold tracking-[0.2em]">ERP v4.2 KALKAN</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Link>
          </div>

          {/* Collapse Toggle */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsCollapsed(prev => !prev)}
            className="absolute top-[72px] -right-3 w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-white hover:bg-blue-600 hover:border-blue-500 transition-all z-20 shadow-lg"
          >
            {isCollapsed ? <ChevronsRight className="w-3 h-3" /> : <ChevronsLeft className="w-3 h-3" />}
          </motion.button>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-3 overflow-y-auto custom-scrollbar">
            <div className="space-y-0.5">
              {menuItems.map((item, index) => {
                // Güvenlik: Menü yetki kontrolü
                const hasPermission = user?.id === 'admin-super' || user?.id === 'admin-1' || user?.role === 'Yönetici' ||
                                      (currentEmployee?.permissions && item.permKey && currentEmployee.permissions.includes(item.permKey));
                
                if (!hasPermission) return null;

                const Icon = item.icon;
                const isActive = location.pathname === item.path || 
                               (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                const isHovered = hoveredItem === item.path;
                
                // Dynamic badges
                const dynamicBadge = 
                  item.path === '/stok' && badgeData.criticalStock > 0 ? badgeData.criticalStock :
                  item.path === '/fis-gecmisi' && badgeData.todayFisCount > 0 ? badgeData.todayFisCount :
                  item.badge;
                const isCriticalBadge = item.path === '/stok' && badgeData.criticalStock > 0;

                const linkContent = (
                  <Link
                    key={item.path}
                    to={item.path}
                    onMouseEnter={() => setHoveredItem(item.path)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={`
                      relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ripple-effect
                      ${isCollapsed ? 'justify-center px-0' : ''}
                      ${isActive 
                        ? 'text-white' 
                        : 'text-muted-foreground hover:text-white'
                      }
                    `}
                  >
                    {/* Active Background */}
                    {isActive && (
                      <motion.div
                        layoutId="activeNavBg"
                        className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg shadow-blue-600/20"
                        transition={{ type: "spring", stiffness: 260, damping: 28 }}
                      />
                    )}
                    
                    {/* Hover Background */}
                    {!isActive && isHovered && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-secondary/50 rounded-lg"
                      />
                    )}

                    {/* Active Left Bar — glow ile */}
                    {isActive && (
                      <>
                        <motion.div
                          layoutId="activeNavBar"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-blue-300 rounded-full"
                          transition={{ type: "spring", stiffness: 320, damping: 30 }}
                          style={{ boxShadow: '0 0 8px rgba(147,197,253,0.8)' }}
                        />
                        <motion.div
                          layoutId="activeNavGlow"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-10 bg-blue-400/30 rounded-full blur-md"
                          transition={{ type: "spring", stiffness: 320, damping: 30 }}
                        />
                      </>
                    )}

                    <motion.div
                      className="relative z-10 flex-shrink-0"
                      whileHover={{ scale: 1.18, rotate: isActive ? 0 : 6 }}
                      whileTap={{ scale: 0.88 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 28, mass: 0.5 }}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                      {/* Collapsed badge dot */}
                      {isCollapsed && dynamicBadge && (
                        <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-popover ${
                          isCriticalBadge ? 'bg-red-500 animate-pulse' : 'bg-blue-500'
                        }`} />
                      )}
                    </motion.div>
                    
                    <AnimatePresence>
                      {!isCollapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          transition={{ duration: 0.15 }}
                          className="relative z-10 whitespace-nowrap"
                        >
                          {t(item.labelKey)}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    
                    {dynamicBadge && !isCollapsed && (
                      <motion.span
                        initial={{ scale: 0, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 24, mass: 0.6 }}
                        className={`relative z-10 ml-auto text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                          isCriticalBadge ? 'bg-red-500' : 'bg-blue-500/80'
                        }`}
                      >
                        {isCriticalBadge && (
                          <motion.span
                            className="absolute inset-0 rounded-full bg-red-400"
                            animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                          />
                        )}
                        {dynamicBadge}
                      </motion.span>
                    )}
                  </Link>
                );

                if (isCollapsed) {
                  return (
                    <Tooltip.Root key={item.path}>
                      <Tooltip.Trigger asChild>
                        {linkContent}
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          side="right"
                          sideOffset={8}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-secondary border border-border rounded-lg shadow-xl z-[100]"
                        >
                          {t(item.labelKey)}
                          <Tooltip.Arrow className="fill-secondary" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  );
                }

                return linkContent;
              })}
            </div>
          </nav>

          {/* Version Badge */}
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-2 border-t border-border/40"
              >
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gradient-to-r from-emerald-900/20 to-blue-900/20 border border-emerald-800/20">
                  <motion.div
                    animate={{ rotate: [0, 20, -10, 0] }}
                    transition={{ duration: 4, repeat: Infinity, repeatDelay: 6, ease: 'easeInOut' }}
                  >
                    <Zap className="w-3 h-3 text-emerald-400" />
                  </motion.div>
                  <span className="text-[10px] text-emerald-300/80 font-medium tracking-wider">KALKAN v4.2</span>
                  <motion.span
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 relative"
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <motion.span
                      className="absolute inset-0 rounded-full bg-emerald-400"
                      animate={{ scale: [1, 2.8, 1], opacity: [0.4, 0, 0.4] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeOut' }}
                    />
                  </motion.span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* User Menu */}
          <div className={`p-3 border-t border-border/60 ${isCollapsed ? 'px-2' : ''}`}>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className={`w-full flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/60 text-foreground transition-colors group cursor-pointer border-none outline-none ${isCollapsed ? 'justify-center' : ''}`}>
                  <motion.div 
                    whileHover={{ rotate: [0, -5, 5, 0] }}
                    transition={{ duration: 0.4 }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-lg flex-shrink-0
                    ${user?.id === 'admin-super' 
                      ? 'bg-gradient-to-br from-red-600 to-red-900 shadow-red-500/50' 
                      : 'bg-gradient-to-br from-blue-600 to-purple-600'}`}
                  >
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </motion.div>
                  {!isCollapsed && (
                    <>
                      <div className="flex-1 text-left">
                        <p className={`text-sm font-medium ${user?.id === 'admin-super' ? 'text-red-400' : 'text-white'}`}>
                          {user?.name || 'Kullanıcı'}
                        </p>
                        <p className="text-xs text-muted-foreground">{user?.role || 'Personel'}</p>
                      </div>
                      <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </>
                  )}
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[240px] bg-popover/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl shadow-black/40 p-2 z-50 animate-fade-in-scale"
                  sideOffset={5}
                  side={isCollapsed ? "right" : "top"}
                >
                  {/* Personel Değiştir */}
                  {availableEmployees?.length > 1 && (
                    <>
                      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('userMenu.switchEmployee')}
                      </div>
                      {availableEmployees.map((emp, index) => (
                        <DropdownMenu.Item
                          key={emp.id || `emp-${index}`}
                          onSelect={() => handleEmployeeSwitch(emp)}
                          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-foreground hover:bg-secondary/60 hover:text-white outline-none cursor-pointer transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold text-xs">
                            {emp?.name?.charAt(0)?.toUpperCase() || 'P'}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{emp?.name || 'Bilinmeyen'}</p>
                            <p className="text-xs text-muted-foreground">{emp?.role}</p>
                          </div>
                          {currentEmployee?.id === emp.id && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                              <Check className="w-4 h-4 text-green-400" />
                            </motion.div>
                          )}
                        </DropdownMenu.Item>
                      ))}
                      <DropdownMenu.Separator className="my-2 h-px bg-secondary/60" />
                    </>
                  )}

                  {/* Actions */}
                  <DropdownMenu.Item
                    onSelect={() => setIsProfileModalOpen(true)}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-foreground hover:bg-secondary/60 hover:text-white outline-none cursor-pointer transition-colors"
                  >
                    <UserCircle className="w-4 h-4" />
                    <span>{t('userMenu.editProfile')}</span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Item
                    onSelect={() => setIsRoleRequestModalOpen(true)}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-foreground hover:bg-secondary/60 hover:text-white outline-none cursor-pointer transition-colors"
                  >
                    <Shield className="w-4 h-4" />
                    <span>{t('userMenu.requestRole')}</span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Item
                    onSelect={() => navigate('/settings')}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-foreground hover:bg-secondary/60 hover:text-white outline-none cursor-pointer transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span>{t('userMenu.settings')}</span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Item
                    onSelect={handleBackup}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-foreground hover:bg-secondary/60 hover:text-white outline-none cursor-pointer transition-colors"
                  >
                    <Database className="w-4 h-4" />
                    <span>{t('userMenu.backup')}</span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="my-2 h-px bg-secondary/60" />

                  <DropdownMenu.Item
                    onSelect={handleLogout}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 outline-none cursor-pointer transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('userMenu.logout')}</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </motion.aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header
            className="bg-sidebar/80 backdrop-blur-xl border-b border-sidebar-border flex items-center justify-between px-3 sm:px-6 z-10 relative"
            style={{
              paddingTop: 'env(safe-area-inset-top, 0px)',
              minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
            }}
          >
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
              {/* Mobile Hamburger */}
              <motion.button
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.08)' }}
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-white transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </motion.button>

              {/* Mobile page title */}
              {currentPageLabel && (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={currentPageLabel}
                    initial={{ opacity: 0, x: -14, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)',
                      transition: { type: 'spring', stiffness: 400, damping: 30, filter: { duration: 0.25 } }
                    }}
                    exit={{ opacity: 0, x: 10, filter: 'blur(4px)',
                      transition: { duration: 0.16, ease: [0.4, 0, 1, 1] }
                    }}
                    className="lg:hidden text-white font-semibold text-sm truncate max-w-[120px] sm:max-w-[180px]"
                  >
                    {currentPageLabel}
                  </motion.span>
                </AnimatePresence>
              )}

              <div className="hidden sm:block flex-shrink-0">
                <SupabaseStatusBadge />
              </div>

              {/* Breadcrumb (desktop) */}
              {currentPageLabel && (
                <div className="hidden lg:flex items-center gap-1.5 text-sm flex-shrink-0">
                  <motion.span
                    animate={{ opacity: [0.3, 0.5, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-muted-foreground/40"
                  >/</motion.span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentPageLabel + '-desk'}
                      initial={{ opacity: 0, y: -8, filter: 'blur(6px)', scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1,
                        transition: { type: 'spring', stiffness: 380, damping: 28, mass: 0.7, filter: { duration: 0.3 } }
                      }}
                      exit={{ opacity: 0, y: 8, filter: 'blur(4px)',
                        transition: { duration: 0.18, ease: [0.4, 0, 1, 1] }
                      }}
                      className="text-foreground font-medium"
                    >
                      {currentPageLabel}
                    </motion.span>
                  </AnimatePresence>
                </div>
              )}

              {/* Divider */}
              <div className="w-px h-5 bg-secondary hidden md:block flex-shrink-0" />

              {currentEmployee && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0 overflow-hidden"
                >
                  <motion.div
                    className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 relative"
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-full bg-green-400"
                      animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut' }}
                    />
                  </motion.div>
                  <span className="text-muted-foreground hidden lg:inline flex-shrink-0">Aktif:</span>
                  <span className={`font-medium truncate max-w-[80px] sm:max-w-[140px] lg:max-w-none ${currentEmployee.id === 'admin-super' ? 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.8)]' : 'text-white'}`}>
                    {currentEmployee.name}
                  </span>
                  {currentEmployee.id === 'admin-super' && (
                    <motion.span 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse flex-shrink-0"
                    >
                      SÜPER ADMİN
                    </motion.span>
                  )}
                </motion.div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Mobile search icon */}
              <button
                onClick={() => setIsCommandPaletteOpen(true)}
                className="sm:hidden p-2 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/50 text-muted-foreground active:bg-secondary transition-colors"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* Desktop Search / Command Palette Trigger */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setIsCommandPaletteOpen(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-secondary/40 hover:bg-secondary/70 border border-border/50 rounded-lg transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="text-xs">Ara...</span>
                <kbd className="hidden md:inline-flex ml-2 items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-background/60 border border-border/50 rounded">
                  <Command className="w-2.5 h-2.5" />K
                </kbd>
              </motion.button>

              {/* Live badges summary */}
              {badgeData.criticalStock > 0 && (
                <Tooltip.Root>
                  <Tooltip.Trigger onClick={() => navigate('/stok')} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer outline-none">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold">{badgeData.criticalStock}</span>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="bottom"
                      sideOffset={4}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-secondary border border-border rounded-lg shadow-xl z-[100]"
                    >
                      {badgeData.criticalStock} ürün kritik stok seviyesinde
                      <Tooltip.Arrow className="fill-secondary" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              )}

              <div className="hidden sm:block">
                <LiveClock />
              </div>
              <div className="w-px h-5 bg-secondary hidden sm:block" />

              {/* Language Switcher */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/50 text-muted-foreground hover:text-white transition-colors cursor-pointer outline-none" title={t('settings.language')}>
                    <Globe className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold uppercase">{lang}</span>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="min-w-[180px] bg-popover/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl shadow-black/40 p-1.5 z-[100]"
                    sideOffset={5}
                    side="bottom"
                    align="end"
                  >
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('settings.language')}
                    </div>
                    {languages.map(l => (
                      <DropdownMenu.Item
                        key={l.code}
                        onSelect={() => setLang(l.code)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm outline-none cursor-pointer transition-colors ${
                          lang === l.code
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'text-foreground hover:bg-secondary/60 hover:text-white'
                        }`}
                      >
                        <span className="text-base">{l.flag}</span>
                        <div className="flex-1">
                          <p className="font-medium text-[13px]">{l.nativeName}</p>
                        </div>
                        {lang === l.code && (
                          <Check className="w-4 h-4 text-blue-400" />
                        )}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <NotificationPanel />

              {/* Mobile Profile Avatar */}
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="lg:hidden flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 shadow-md"
                style={{
                  background: user?.id === 'admin-super'
                    ? 'linear-gradient(135deg, #dc2626, #7f1d1d)'
                    : 'linear-gradient(135deg, #2563eb, #7c3aed)'
                }}
                title="Profili Düzenle"
              >
                <span className="text-white font-bold text-xs">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </button>
            </div>
          </header>

          {/* Page Content with Animated Transitions */}
          <main className="flex-1 overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <ProfileEditModal 
          isOpen={isProfileModalOpen} 
          onClose={() => setIsProfileModalOpen(false)} 
        />
        <RoleRequestModal 
          isOpen={isRoleRequestModalOpen} 
          onClose={() => setIsRoleRequestModalOpen(false)} 
        />
        <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
        <QuickActionFab />
        {isMobile && <MobileBottomNav />}
        <ScrollToTop />
      </div>
    </Tooltip.Provider>
  );
}