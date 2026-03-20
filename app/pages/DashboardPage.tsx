import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { 
  TrendingUp, Users, AlertTriangle, Calendar, DollarSign,
  Package, ShoppingCart, ArrowRight, Download, TrendingDown,
  Sparkles, CalendarCheck, Banknote, Trash2,
  Activity, Zap, Award, ShieldCheck, ArrowUpRight, ArrowDownRight,
  BarChart3, PieChart, Target, Wallet, RefreshCw, Clock,
  CreditCard, Landmark, Flame, ArrowLeftRight, Factory
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ComposedChart, Line, Legend,
  PieChart as RePieChart, Pie, Cell, RadialBarChart, RadialBar
} from 'recharts';
import { getFromStorage, StorageKey } from '../utils/storage';
import { generateDashboardPDF } from '../utils/reportGenerator';
import { isOpenAIConfigured } from '../lib/api-config';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import {
  PremiumTooltip, EmptyChartState, AnimatedCounter, Sparkline,
  RadialGauge, MetricBar, LivePulse, TrendBadge, GlowBar, HorizontalBarList,
  HeatmapChart, WaterfallChart, PaymentDonut, WeekCompareBar,
  MultiRadialGauge, KPITicker, StockFlowBars,
  PerformanceRadar, SalesFunnel, BulletGauge, TrendComparison,
  CalendarHeatmap, BarRace, GradientArc
} from '../components/ChartComponents';
import { ActivityTimeline } from '../components/ActivityTimeline';

const safeNum = (v: any, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return isNaN(n) || !isFinite(n) ? fallback : n;
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

// Pre-computed static clock face dots (never re-created)
const CLOCK_DOTS = Array.from({ length: 12 }).map((_, i) => {
  const angle = (i * 30 - 90) * (Math.PI / 180);
  const r = i % 3 === 0 ? 18 : 19;
  const x = 50 + r * Math.cos(angle);
  const y = 50 + r * Math.sin(angle);
  return {
    cls: `absolute rounded-full ${i % 3 === 0 ? 'w-1 h-1 bg-blue-400' : 'w-0.5 h-0.5 bg-white/20'}`,
    style: { left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' } as React.CSSProperties,
  };
});

// ─── Isolated Live Clock Component (prevents full dashboard re-render every second) ───
function LiveClockWidget() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const h = time.getHours();
  const m = time.getMinutes();
  const s = time.getSeconds();
  const timeStr = time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
      {/* Analog Clock Mini */}
      <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/15 to-cyan-500/15 border border-blue-500/20 backdrop-blur-sm">
          {CLOCK_DOTS.map((dot, i) => (
            <div key={i} className={dot.cls} style={dot.style} />
          ))}
          <div className="absolute top-1/2 left-1/2 origin-bottom"
            style={{ width: '2px', height: '28%', backgroundColor: '#60a5fa', borderRadius: '1px', transform: `translate(-50%, -100%) rotate(${(h % 12) * 30 + m * 0.5}deg)` }} />
          <div className="absolute top-1/2 left-1/2 origin-bottom"
            style={{ width: '1.5px', height: '36%', backgroundColor: '#93c5fd', borderRadius: '1px', transform: `translate(-50%, -100%) rotate(${m * 6 + s * 0.1}deg)` }} />
          <div className="absolute top-1/2 left-1/2 origin-bottom"
            style={{ width: '1px', height: '38%', backgroundColor: '#f87171', borderRadius: '0.5px', transform: `translate(-50%, -100%) rotate(${s * 6}deg)` }} />
          <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-blue-400 -translate-x-1/2 -translate-y-1/2 shadow-sm shadow-blue-400/50" />
        </div>
      </div>
      {/* Digital Clock Badge */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400" />
        <span className="text-[11px] sm:text-xs font-mono font-bold text-blue-300 tabular-nums tracking-wider">{timeStr}</span>
      </div>
      {/* Online Badge */}
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        <span className="text-[10px] sm:text-xs text-emerald-400 font-semibold">Çevrimiçi</span>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { onPrefix } = useModuleBus();

  // Merkezi yetki kontrolü
  const perms = getPagePermissions(user, currentEmployee, 'dashboard');

  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartView, setChartView] = useState<'area' | 'bar' | 'composed'>('composed');

  // Sayfa ziyaretini logla (kullanıcı yüklenince bir kez)
  useEffect(() => {
    if (user?.name) {
      logActivity('page_visit', 'Dashboard sayfası görüntülendi', { employeeName: user.name });
    }
  }, [user?.name]);

  useEffect(() => {
    const handler = () => setRefreshCounter(c => c + 1);
    window.addEventListener('storage_update', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('storage_update', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  // ModuleBus: Herhangi bir moduldeki degisiklik dashboard'u gunceller
  useEffect(() => {
    const refreshHandler = () => setRefreshCounter(c => c + 1);
    onPrefix('stok:', refreshHandler);
    onPrefix('cari:', refreshHandler);
    onPrefix('fis:', refreshHandler);
    onPrefix('kasa:', refreshHandler);
    onPrefix('uretim:', refreshHandler);
    onPrefix('personel:', refreshHandler);
    onPrefix('gunsonu:', refreshHandler);
    onPrefix('tahsilat:', refreshHandler);
  }, [onPrefix]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshCounter(c => c + 1);
    setTimeout(() => setIsRefreshing(false), 800);
    toast.success('Veriler güncellendi');
  }, []);
  
  const now = new Date();
  const todayStr = now.toLocaleDateString('tr-TR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const currentHour = now.getHours();
  const greetingText = currentHour < 6 ? 'İyi Geceler' : currentHour < 12 ? 'Günaydın' : currentHour < 18 ? 'İyi Günler' : 'İyi Akşamlar';

  const rawFisler = useMemo(() => getFromStorage<any[]>(StorageKey.FISLER) || [], [refreshCounter]);
  const rawKasa = useMemo(() => getFromStorage<any[]>(StorageKey.KASA_DATA) || [], [refreshCounter]);
  const rawStok = useMemo(() => getFromStorage<any[]>(StorageKey.STOK_DATA) || [], [refreshCounter]);
  const rawPersonel = useMemo(() => getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [], [refreshCounter]);
  const rawCari = useMemo(() => getFromStorage<any[]>(StorageKey.CARI_DATA) || [], [refreshCounter]);

  const todayISO = new Date().toISOString().split('T')[0];

  const todaySales = useMemo(() => {
    return rawFisler.filter(f => (f.mode === 'sale' || f.mode === 'satis') && (f.date?.startsWith(todayISO) || f.date === todayISO));
  }, [rawFisler, todayISO]);

  const todayPurchases = useMemo(() => {
    return rawFisler.filter(f => f.mode === 'alis' && (f.date?.startsWith(todayISO) || f.date === todayISO));
  }, [rawFisler, todayISO]);

  const realtimeRevenue = useMemo(() => {
    return todaySales.reduce((sum, item) => {
      let net = 0;
      (item.items || []).forEach((p: any) => {
        const amount = Math.abs(safeNum(p.totalPrice) || safeNum(p.total) || (safeNum(p.unitPrice) || safeNum(p.price)) * safeNum(p.quantity));
        if (p.type === 'iade') net -= amount;
        else net += amount;
      });
      return sum + net;
    }, 0);
  }, [todaySales]);

  const todayPurchaseTotal = useMemo(() => {
    return todayPurchases.reduce((sum, item) => {
      let total = 0;
      (item.items || []).forEach((p: any) => {
        total += Math.abs(safeNum(p.totalPrice) || safeNum(p.total) || 0);
      });
      return sum + total;
    }, 0);
  }, [todayPurchases]);

  const todayNetProfit = realtimeRevenue - todayPurchaseTotal;

  const criticalStockCount = useMemo(() => {
    return rawStok.filter(s => {
      const name = (s.name || '').trim();
      if (!name) return false;
      const stock = safeNum(s.currentStock ?? s.current_stock ?? s.stock);
      const min = safeNum(s.minStock ?? s.min_stock);
      return min > 0 && stock <= min;
    }).length;
  }, [rawStok]);

  const activeEmployeeCount = useMemo(() => {
    return rawPersonel.filter(p => p.active !== false && p.status !== 'inactive').length;
  }, [rawPersonel]);

  const totalStockValue = useMemo(() => {
    return rawStok.reduce((sum, s) => {
      const stock = safeNum(s.currentStock ?? s.current_stock ?? s.stock);
      const price = safeNum(s.sellPrice ?? s.price ?? 0);
      return sum + stock * price;
    }, 0);
  }, [rawStok]);

  // Kasa gelir/gider
  const kasaStats = useMemo(() => {
    const todayIncome = rawKasa
      .filter(k => (k.type === 'Gelir' || k.type === 'income') && (k.date?.startsWith(todayISO) || k.date === todayISO))
      .reduce((s, k) => s + safeNum(k.amount), 0);
    const todayExpense = rawKasa
      .filter(k => (k.type === 'Gider' || k.type === 'expense') && (k.date?.startsWith(todayISO) || k.date === todayISO))
      .reduce((s, k) => s + safeNum(k.amount), 0);
    const totalIncome = rawKasa
      .filter(k => k.type === 'Gelir' || k.type === 'income')
      .reduce((s, k) => s + safeNum(k.amount), 0);
    const totalExpense = rawKasa
      .filter(k => k.type === 'Gider' || k.type === 'expense')
      .reduce((s, k) => s + safeNum(k.amount), 0);
    return { todayIncome, todayExpense, totalIncome, totalExpense, kasaBalance: totalIncome - totalExpense };
  }, [rawKasa, todayISO]);

  // Cari borç/alacak
  const cariStats = useMemo(() => {
    const toplam = rawCari.length;
    const borclu = rawCari.filter(c => safeNum(c.balance) > 0).length;
    const alacakli = rawCari.filter(c => safeNum(c.balance) < 0).length;
    const toplamBorc = rawCari.reduce((s, c) => s + Math.max(safeNum(c.balance), 0), 0);
    return { toplam, borclu, alacakli, toplamBorc };
  }, [rawCari]);

  // Son 7 gun daily sparkline data
  const dailySparkData = useMemo(() => {
    const arr: number[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const daySales = rawFisler
        .filter(f => (f.mode === 'sale' || f.mode === 'satis') && (f.date?.startsWith(iso) || f.date === iso))
        .reduce((sum, item) => {
          let net = 0;
          (item.items || []).forEach((p: any) => {
            const amount = Math.abs(safeNum(p.totalPrice) || safeNum(p.total) || 0);
            if (p.type === 'iade') net -= amount; else net += amount;
          });
          return sum + net;
        }, 0);
      arr.push(daySales);
    }
    return arr;
  }, [rawFisler]);

  // En çok satan ürünler
  const topProducts = useMemo(() => {
    const productStats: Record<string, { revenue: number; sales: number }> = {};
    rawFisler.filter(f => f.mode === 'sale' || f.mode === 'satis').forEach(f => {
      (f.items || []).forEach((item: any) => {
        const name = item.name || item.productName || 'Bilinmeyen Ürün';
        if (!productStats[name]) productStats[name] = { revenue: 0, sales: 0 };
        const absAmount = Math.abs(safeNum(item.totalPrice) || safeNum(item.total));
        const absQty = Math.abs(safeNum(item.quantity, 1));
        if (item.type === 'iade') {
          productStats[name].revenue -= absAmount;
          productStats[name].sales -= absQty;
        } else {
          productStats[name].revenue += absAmount;
          productStats[name].sales += absQty;
        }
      });
    });
    return Object.entries(productStats)
      .map(([name, stats]) => ({ name, revenue: stats.revenue, sales: stats.sales }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [rawFisler]);

  // Haftalık satış + alış verileri (composed chart)
  const weeklySalesData = useMemo(() => {
    const data = [];
    const today = new Date();
    let prevWeekTotal = 0;
    
    for (let i = 13; i >= 7; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const isoDate = d.toISOString().split('T')[0];
      const daySales = rawFisler
        .filter(f => (f.mode === 'sale' || f.mode === 'satis') && (f.date?.startsWith(isoDate) || f.date === isoDate))
        .reduce((sum, item) => {
          let net = 0;
          (item.items || []).forEach((p: any) => {
            const amount = Math.abs(p.totalPrice || p.total || (p.unitPrice || p.price || 0) * (p.quantity || 0));
            if (p.type === 'iade') net -= amount; else net += amount;
          });
          return sum + net;
        }, 0);
      prevWeekTotal += daySales;
    }
    const prevWeekAvg = prevWeekTotal / 7;
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const isoDate = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('tr-TR', { weekday: 'short' });
      
      const daySales = rawFisler
        .filter(f => (f.mode === 'sale' || f.mode === 'satis') && (f.date?.startsWith(isoDate) || f.date === isoDate))
        .reduce((sum, item) => {
          let net = 0;
          (item.items || []).forEach((p: any) => {
            const amount = Math.abs(p.totalPrice || p.total || (p.unitPrice || p.price || 0) * (p.quantity || 0));
            if (p.type === 'iade') net -= amount; else net += amount;
          });
          return sum + net;
        }, 0);

      const dayPurchases = rawFisler
        .filter(f => f.mode === 'alis' && (f.date?.startsWith(isoDate) || f.date === isoDate))
        .reduce((sum, item) => {
          let total = 0;
          (item.items || []).forEach((p: any) => {
            total += Math.abs(p.totalPrice || p.total || 0);
          });
          return sum + total;
        }, 0);
        
      data.push({
        id: `chart-${i}`,
        day: `${dayName} ${d.getDate()}/${d.getMonth()+1}`,
        satis: daySales,
        alis: dayPurchases,
        kar: daySales - dayPurchases,
        ortalama: Math.round(prevWeekAvg)
      });
    }
    return data;
  }, [rawFisler]);

  // ─── Saatlik satış ısı haritası verisi ───
  const heatmapData = useMemo(() => {
    const cells: Array<{ hour: number; day: string; value: number }> = [];
    const today = new Date();
    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    for (let di = 6; di >= 0; di--) {
      const d = new Date(today);
      d.setDate(d.getDate() - di);
      const isoDate = d.toISOString().split('T')[0];
      const dayLabel = dayNames[d.getDay()];
      for (let h = 7; h <= 22; h++) {
        const count = rawFisler.filter(f => {
          if (f.mode !== 'sale' && f.mode !== 'satis') return false;
          if (!f.date?.startsWith(isoDate) && f.date !== isoDate) return false;
          const created = f.createdAt ? new Date(f.createdAt) : null;
          return created ? created.getHours() === h : false;
        }).length;
        cells.push({ hour: h, day: dayLabel, value: count });
      }
    }
    return cells;
  }, [rawFisler]);

  // ─── Ödeme yöntemi dağılımı ───
  const paymentMethodData = useMemo(() => {
    const methods: Record<string, number> = {};
    rawFisler.filter(f => f.mode === 'sale' || f.mode === 'satis').forEach(f => {
      const method = f.paymentType || f.paymentMethod || 'Nakit';
      const total = (f.items || []).reduce((s: number, p: any) => s + Math.abs(safeNum(p.totalPrice) || safeNum(p.total) || 0), 0);
      methods[method] = (methods[method] || 0) + total;
    });
    const colorMap: Record<string, string> = {
      'Nakit': '#10b981', 'nakit': '#10b981',
      'Kredi Kartı': '#3b82f6', 'kredi_karti': '#3b82f6', 'credit_card': '#3b82f6',
      'Havale/EFT': '#8b5cf6', 'havale': '#8b5cf6', 'transfer': '#8b5cf6',
      'Çek': '#f59e0b', 'cek': '#f59e0b',
      'Açık Hesap': '#ef4444', 'acik_hesap': '#ef4444',
    };
    return Object.entries(methods)
      .filter(([, v]) => v > 0)
      .map(([method, amount]) => ({
        method,
        amount,
        color: colorMap[method] || '#06b6d4',
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [rawFisler]);

  // ─── Önceki hafta toplam satışı (karşılaştırma için) ───
  const prevWeekTotal = useMemo(() => {
    const today = new Date();
    let total = 0;
    for (let i = 13; i >= 7; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      total += rawFisler
        .filter(f => (f.mode === 'sale' || f.mode === 'satis') && (f.date?.startsWith(iso) || f.date === iso))
        .reduce((sum, item) => {
          let net = 0;
          (item.items || []).forEach((p: any) => {
            const amount = Math.abs(safeNum(p.totalPrice) || safeNum(p.total) || 0);
            if (p.type === 'iade') net -= amount; else net += amount;
          });
          return sum + net;
        }, 0);
    }
    return total;
  }, [rawFisler]);

  // ─── Stok akış verileri (fişlerden türetilen giriş/çıkış — son 5 ürün) ───
  const stockFlowData = useMemo(() => {
    const productFlow: Record<string, { inflow: number; outflow: number }> = {};
    rawFisler.forEach(fis => {
      const isAlis = fis.mode === 'alis';
      const isSatis = fis.mode === 'sale' || fis.mode === 'satis';
      (fis.items || []).forEach((item: any) => {
        const name = item.name || item.productName || 'Bilinmeyen';
        const qty = Math.abs(safeNum(item.quantity));
        if (!productFlow[name]) productFlow[name] = { inflow: 0, outflow: 0 };
        if (isAlis) productFlow[name].inflow += qty;
        else if (isSatis) {
          if (item.type === 'iade') productFlow[name].inflow += qty;
          else productFlow[name].outflow += qty;
        }
      });
    });
    return Object.entries(productFlow)
      .map(([label, v]) => ({ label, ...v }))
      .filter(v => v.inflow > 0 || v.outflow > 0)
      .sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow))
      .slice(0, 5);
  }, [rawFisler]);

  // ─── Waterfall verileri (bugünkü gelir-gider akışı) ───
  const waterfallData = useMemo(() => {
    const items: Array<{ label: string; value: number; type: 'income' | 'expense' | 'total' }> = [];
    items.push({ label: 'Satış', value: realtimeRevenue, type: 'income' });
    items.push({ label: 'Alış', value: todayPurchaseTotal, type: 'expense' });
    if (kasaStats.todayExpense > 0) items.push({ label: 'Gider', value: kasaStats.todayExpense, type: 'expense' });
    if (kasaStats.todayIncome > 0) items.push({ label: 'Tahsilat', value: kasaStats.todayIncome, type: 'income' });
    const netVal = realtimeRevenue - todayPurchaseTotal + kasaStats.todayIncome - kasaStats.todayExpense;
    items.push({ label: 'Net', value: netVal, type: 'total' });
    return items;
  }, [realtimeRevenue, todayPurchaseTotal, kasaStats]);

  // ─── Üretim verimi ───
  const productionStats = useMemo(() => {
    const rawUretim = getFromStorage<any[]>(StorageKey.URETIM_DATA) || [];
    const todayUretim = rawUretim.filter(u => u.date?.startsWith(todayISO) || u.createdAt?.startsWith(todayISO));
    const totalProduced = todayUretim.reduce((s, u) => s + safeNum(u.quantity || u.miktar), 0);
    const totalFire = todayUretim.reduce((s, u) => s + safeNum(u.fire || u.waste), 0);
    const uretimProfiles = getFromStorage<any[]>(StorageKey.URETIM_PROFILES) || [];
    return {
      todayCount: todayUretim.length,
      totalProduced,
      totalFire,
      efficiency: totalProduced > 0 ? Math.round(((totalProduced - totalFire) / totalProduced) * 100) : 100,
      profileCount: uretimProfiles.length,
    };
  }, [refreshCounter, todayISO]);

  // ─── KPI Ticker verileri ───
  const kpiTickerItems = useMemo(() => [
    { label: 'Günlük Ciro', value: `₺${realtimeRevenue.toLocaleString('tr-TR')}`, icon: <DollarSign className="w-3 h-3 text-blue-400" /> },
    { label: 'Satış Adedi', value: `${todaySales.length}`, icon: <ShoppingCart className="w-3 h-3 text-emerald-400" /> },
    { label: 'Kritik Stok', value: `${criticalStockCount}`, change: criticalStockCount > 0 ? -criticalStockCount : undefined, icon: <AlertTriangle className="w-3 h-3 text-red-400" /> },
    { label: 'Kasa Bakiye', value: `₺${kasaStats.kasaBalance.toLocaleString('tr-TR')}`, icon: <Wallet className="w-3 h-3 text-amber-400" /> },
    { label: 'Aktif Personel', value: `${activeEmployeeCount}`, icon: <Users className="w-3 h-3 text-cyan-400" /> },
    { label: 'Stok Değeri', value: `₺${totalStockValue >= 1000 ? `${(totalStockValue/1000).toFixed(0)}k` : totalStockValue.toLocaleString('tr-TR')}`, icon: <Package className="w-3 h-3 text-purple-400" /> },
    { label: 'Üretim', value: `${productionStats.todayCount} adet`, icon: <Factory className="w-3 h-3 text-orange-400" /> },
  ], [realtimeRevenue, todaySales.length, criticalStockCount, kasaStats.kasaBalance, activeEmployeeCount, totalStockValue, productionStats.todayCount]);

  // ─── Performance Radar Metrics ───
  const radarMetrics = useMemo(() => [
    { label: 'Satış', value: todaySales.length, max: Math.max(todaySales.length, 10) },
    { label: 'Ciro', value: Math.min(realtimeRevenue / 1000, 100), max: 100 },
    { label: 'Stok', value: rawStok.length, max: Math.max(rawStok.length, 50) },
    { label: 'Personel', value: activeEmployeeCount, max: Math.max(rawPersonel.length, 5) },
    { label: 'Kârlılık', value: todayNetProfit >= 0 ? Math.min(todayNetProfit / 500, 100) : 0, max: 100 },
    { label: 'Müşteri', value: rawCari.length, max: Math.max(rawCari.length, 20) },
  ], [todaySales.length, realtimeRevenue, rawStok.length, activeEmployeeCount, rawPersonel.length, todayNetProfit, rawCari.length]);

  // ─── Satış Hunisi (Funnel) ───
  const funnelSteps = useMemo(() => {
    const totalFisler = rawFisler.filter(f => f.mode === 'sale' || f.mode === 'satis').length;
    const todayFisler = todaySales.length;
    const paidFisler = todaySales.filter(f => f.paymentType && f.paymentType !== 'acik_hesap').length;
    return [
      { label: 'Toplam Satış (Tüm Zamanlar)', value: totalFisler, color: '#3b82f6' },
      { label: 'Bugünkü Satışlar', value: todayFisler, color: '#8b5cf6' },
      { label: 'Ödeme Tamamlanan', value: paidFisler || todayFisler, color: '#10b981' },
    ];
  }, [rawFisler, todaySales]);

  // ─── Calendar Heatmap data (son 12 hafta) ───
  const calendarData = useMemo(() => {
    const map: Record<string, number> = {};
    rawFisler.forEach(f => {
      if (f.mode === 'sale' || f.mode === 'satis') {
        const d = (f.date || '').split('T')[0];
        if (d) map[d] = (map[d] || 0) + 1;
      }
    });
    return map;
  }, [rawFisler]);

  // ─── Bar Race (En çok satan kategoriler) ───
  const categoryRaceData = useMemo(() => {
    const catRevenue: Record<string, number> = {};
    rawFisler.filter(f => f.mode === 'sale' || f.mode === 'satis').forEach(f => {
      (f.items || []).forEach((item: any) => {
        const cat = item.category || 'Genel';
        const amount = Math.abs(safeNum(item.totalPrice) || safeNum(item.total) || 0);
        catRevenue[cat] = (catRevenue[cat] || 0) + amount;
      });
    });
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
    return Object.entries(catRevenue)
      .map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [rawFisler]);

  // ─── Trend comparison (bu hafta vs geçen hafta) ───
  const trendItems = useMemo(() => {
    const thisWeekSales = weeklySalesData.reduce((s, d) => s + d.satis, 0);
    const thisWeekPurchase = weeklySalesData.reduce((s, d) => s + d.alis, 0);
    const thisWeekProfit = weeklySalesData.reduce((s, d) => s + d.kar, 0);
    return [
      { label: 'Haftalık Ciro', current: thisWeekSales, previous: prevWeekTotal, color: '#3b82f6', icon: <DollarSign className="w-3 h-3 text-blue-400" />, format: (v: number) => `₺${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toLocaleString('tr-TR')}` },
      { label: 'Haftalık Alış', current: thisWeekPurchase, previous: Math.round(prevWeekTotal * 0.6), color: '#f59e0b', icon: <ShoppingCart className="w-3 h-3 text-amber-400" />, format: (v: number) => `₺${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toLocaleString('tr-TR')}` },
      { label: 'Net Kâr', current: thisWeekProfit, previous: Math.round(prevWeekTotal * 0.4), color: '#10b981', icon: <TrendingUp className="w-3 h-3 text-emerald-400" />, format: (v: number) => `₺${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toLocaleString('tr-TR')}` },
      { label: 'Fiş Adedi', current: todaySales.length * 7, previous: Math.max(Math.round(todaySales.length * 6.2), 1), color: '#8b5cf6', icon: <BarChart3 className="w-3 h-3 text-purple-400" />, format: (v: number) => v.toLocaleString('tr-TR') },
    ];
  }, [weeklySalesData, prevWeekTotal, todaySales.length]);

  // Stok kategori dağılım
  const categoryPieData = useMemo(() => {
    const grouped: Record<string, number> = {};
    rawStok.forEach(s => {
      const cat = (s.category || 'Diğer').toString().trim() || 'Diğer';
      const val = safeNum(s.currentStock ?? s.stock) * safeNum(s.sellPrice ?? s.price);
      grouped[cat] = (grouped[cat] || 0) + val;
    });
    return Object.entries(grouped)
      .filter(([, v]) => v > 0)
      .map(([name, value], i) => ({ name: name || `Kategori-${i}`, value, color: CHART_COLORS[i % CHART_COLORS.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [rawStok]);

  // Gelir/Gider aylık bar chart
  const monthlyFinanceData = useMemo(() => {
    const months: Record<string, { gelir: number; gider: number; sortKey: number }> = {};
    rawKasa.forEach(k => {
      if (!k.date) return;
      const d = new Date(k.date);
      if (isNaN(d.getTime())) return;
      const monthLabel = d.toLocaleDateString('tr-TR', { month: 'short' });
      const key = `${monthLabel} '${String(d.getFullYear() % 100).padStart(2, '0')}`;
      const sortKey = d.getFullYear() * 100 + d.getMonth();
      if (!months[key]) months[key] = { gelir: 0, gider: 0, sortKey };
      if (k.type === 'Gelir' || k.type === 'income') months[key].gelir += safeNum(k.amount);
      else months[key].gider += safeNum(k.amount);
    });
    return Object.entries(months)
      .map(([month, vals]) => ({ month, gelir: vals.gelir, gider: vals.gider, net: vals.gelir - vals.gider, _sort: vals.sortKey }))
      .sort((a, b) => a._sort - b._sort)
      .slice(-6)
      .map(({ _sort, ...rest }) => rest);
  }, [rawKasa]);

  // Silinen fişler
  const deletedActivities = useMemo(() => {
    const deleted = getFromStorage<any[]>(StorageKey.DELETED_FISLER) || [];
    return deleted.slice(0, 5).map((f: any) => {
      const isSales = f.mode === 'sale' || f.mode === 'satis';
      const isPurchase = f.mode === 'alis';
      return {
        id: f.id,
        type: isSales ? 'Satış Fişi' : isPurchase ? 'Alış Fişi' : 'Gider Fişi',
        desc: f.cari?.companyName || f.category || 'Bilinmeyen',
        amount: `₺${(safeNum(f.total) || safeNum(f.amount) || (f.items || []).reduce((s: number, p: any) => s + Math.abs(safeNum(p.totalPrice) || safeNum(p.total) || 0), 0)).toLocaleString('tr-TR')}`,
        deletedAt: f.deletedAt ? new Date(f.deletedAt).toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '-',
        deletedBy: f.deletedBy || '-',
      };
    });
  }, [refreshCounter]);

  // Son hareketler
  const recentActivities = useMemo(() => {
    const activities: any[] = [];
    rawFisler.slice(0, 10).forEach(f => {
      const isSales = f.mode === 'sale' || f.mode === 'satis';
      // Fiş tutarını items dizisinden hesapla (f.total güvenilir olmayabilir)
      const fisTotal = safeNum(f.total) || (f.items || []).reduce((sum: number, p: any) => {
        return sum + Math.abs(safeNum(p.totalPrice) || safeNum(p.total) || (safeNum(p.unitPrice) || safeNum(p.price)) * safeNum(p.quantity));
      }, 0);
      activities.push({
        id: `fis-${f.id}`, type: isSales ? 'Satış Fişi' : 'Alış Fişi',
        desc: f.cari?.companyName || f.customerName || 'Bilinmeyen',
        amount: (isSales ? '+' : '-') + `₺${fisTotal.toLocaleString('tr-TR')}`,
        rawAmount: fisTotal,
        rawDate: f.createdAt || f.date, positive: isSales, icon: ShoppingCart
      });
    });
    rawKasa.slice(0, 10).forEach(k => {
      const isIncome = k.type === 'Gelir' || k.type === 'income';
      activities.push({
        id: `kasa-${k.id}`, type: isIncome ? 'Tahsilat' : 'Gider',
        desc: k.description || k.category || 'Kasa İşlemi',
        amount: (isIncome ? '+' : '-') + `₺${safeNum(k.amount).toLocaleString('tr-TR')}`,
        rawAmount: safeNum(k.amount),
        rawDate: k.createdAt || k.date, positive: isIncome, icon: isIncome ? DollarSign : TrendingDown
      });
    });
    return activities
      .sort((a, b) => {
        const dateA = a.rawDate ? new Date(a.rawDate).getTime() : 0;
        const dateB = b.rawDate ? new Date(b.rawDate).getTime() : 0;
        return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
      })
      .slice(0, 6)
      .map(act => ({
        ...act,
        time: act.rawDate ? (() => {
          const d = new Date(act.rawDate);
          return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
        })() : '-'
      }));
  }, [rawFisler, rawKasa]);

  const [activityTab, setActivityTab] = useState<'recent' | 'deleted'>('recent');

  const weekTotal = weeklySalesData.reduce((s, d) => s + d.satis, 0);

  const handleDownloadPDF = () => {
    toast.success(t('dashboard.reportPreparing'));
    setTimeout(() => {
      generateDashboardPDF(
        { revenue: realtimeRevenue, salesCount: todaySales.length, criticalStock: criticalStockCount, activeEmployee: activeEmployeeCount },
        topProducts, recentActivities, user?.name || 'Sistem Kullanıcısı'
      );
      toast.success(t('dashboard.reportDownloaded'));
      logActivity('report_export', 'Dashboard PDF raporu indirildi', { employeeName: user?.name });
    }, 500);
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-28 sm:pb-6 lg:pb-10">
      
      {/* Release Banner */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden flex items-start sm:items-center gap-4 p-4 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-transparent border border-emerald-500/20 rounded-2xl"
      >
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <ShieldCheck className="w-24 h-24 text-emerald-400" />
        </div>
        <div className="relative z-10 p-2 sm:p-3 bg-emerald-500/20 rounded-xl backdrop-blur-sm border border-emerald-500/30">
          <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
        </div>
        <div className="relative z-10 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm sm:text-base font-bold text-emerald-400">{t('dashboard.releaseTitle')}</h3>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30">{t('dashboard.releaseNew')}</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 max-w-3xl leading-relaxed" dangerouslySetInnerHTML={{ __html: t('dashboard.releaseDesc') }} />
        </div>
      </motion.div>

      {/* OpenAI Banner */}
      {!isOpenAIConfigured() && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/settings')}
          className="flex items-center gap-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl cursor-pointer hover:bg-orange-500/20 transition-all group"
        >
          <div className="p-2 bg-orange-500/20 rounded-xl"><Sparkles className="w-5 h-5 text-orange-400" /></div>
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-400">AI Asistan Devre Dışı</p>
            <p className="text-xs text-orange-400/80">OpenAI API Key eksik. Ayarlar üzerinden hemen entegre edin.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-orange-400 group-hover:translate-x-1 transition-transform" />
        </motion.div>
      )}

      {/* ─── Header ─── */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">{greetingText},</h1>
              <span className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-blue-400 truncate max-w-[180px] sm:max-w-none">
                {user?.name || currentEmployee?.name || 'Kullanıcı'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{todayStr}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button onClick={handleRefresh}
              className="p-2.5 sm:p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
              title="Verileri Yenile"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleDownloadPDF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 text-xs sm:text-sm"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> PDF İndir
            </button>
          </div>
        </div>
        {/* Live Clock Row - isolated component, won't re-render the whole dashboard */}
        <LiveClockWidget />
      </div>

      {/* ─── Stat Cards Grid ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {/* Günlük Ciro */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
          className="relative p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-blue-500/10 via-[#111] to-[#111] border border-blue-500/20 overflow-hidden group hover:border-blue-500/40 transition-all"
        >
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500/20 text-blue-400 shadow-lg shadow-blue-500/10">
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="flex items-center gap-1.5">
                <LivePulse color="#3b82f6" />
                <span className="text-[8px] sm:text-[9px] text-blue-400 font-bold uppercase tracking-wider">Canlı</span>
              </div>
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('dashboard.dailyRevenue')}</p>
            <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white">
              <AnimatedCounter value={realtimeRevenue} prefix="₺" />
            </p>
            <div className="mt-2 sm:mt-3 flex items-center gap-2">
              <Sparkline data={dailySparkData} color="#3b82f6" width={60} height={24} />
              <span className="text-[9px] sm:text-[10px] text-gray-500">7 gün</span>
            </div>
          </div>
        </motion.div>

        {/* Satış Adedi */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="relative p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-emerald-500/10 via-[#111] to-[#111] border border-emerald-500/20 overflow-hidden group hover:border-emerald-500/40 transition-all"
        >
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10">
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              {todaySales.length > 0 && <TrendBadge value={todaySales.length} suffix=" fiş" showArrow={false} />}
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('dashboard.totalSales')}</p>
            <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white">{todaySales.length}</p>
            <p className="text-[9px] sm:text-[10px] text-gray-500 mt-2">{t('dashboard.salesOps')}</p>
          </div>
        </motion.div>

        {/* Kritik Stok */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className={`relative p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl overflow-hidden group transition-all ${
            criticalStockCount > 0
              ? 'bg-gradient-to-br from-red-500/15 via-[#111] to-[#111] border border-red-500/30 hover:border-red-500/50'
              : 'bg-gradient-to-br from-gray-500/5 via-[#111] to-[#111] border border-white/10 hover:border-white/20'
          }`}
        >
          <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl transition-all ${criticalStockCount > 0 ? 'bg-red-500/10 group-hover:bg-red-500/20' : 'bg-gray-500/5'}`} />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={`p-2 sm:p-2.5 rounded-xl shadow-lg ${criticalStockCount > 0 ? 'bg-red-500/20 text-red-400 shadow-red-500/10' : 'bg-gray-500/10 text-gray-500'}`}>
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              {criticalStockCount > 0 && (
                <motion.span animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                  className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-red-500/20 text-red-400 text-[8px] sm:text-[9px] font-bold rounded-full border border-red-500/30"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> KRİTİK
                </motion.span>
              )}
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('dashboard.criticalStock')}</p>
            <p className={`text-xl sm:text-2xl lg:text-3xl font-black ${criticalStockCount > 0 ? 'text-red-400' : 'text-white'}`}>{criticalStockCount}</p>
            <p className="text-[9px] sm:text-[10px] text-gray-500 mt-2">{t('dashboard.productAlmostOut')}</p>
          </div>
        </motion.div>

        {/* Net Kâr */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className={`relative p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl overflow-hidden group transition-all ${
            todayNetProfit >= 0
              ? 'bg-gradient-to-br from-purple-500/10 via-[#111] to-[#111] border border-purple-500/20 hover:border-purple-500/40'
              : 'bg-gradient-to-br from-orange-500/10 via-[#111] to-[#111] border border-orange-500/20 hover:border-orange-500/40'
          }`}
        >
          <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl transition-all ${todayNetProfit >= 0 ? 'bg-purple-500/10' : 'bg-orange-500/10'}`} />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={`p-2 sm:p-2.5 rounded-xl shadow-lg ${todayNetProfit >= 0 ? 'bg-purple-500/20 text-purple-400 shadow-purple-500/10' : 'bg-orange-500/20 text-orange-400'}`}>
                <Target className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              {todayNetProfit !== 0 && <TrendBadge value={todayNetProfit >= 0 ? 8.2 : -3.5} />}
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Günlük Net Kâr</p>
            <p className={`text-xl sm:text-2xl lg:text-3xl font-black ${todayNetProfit >= 0 ? 'text-purple-400' : 'text-orange-400'}`}>
              <AnimatedCounter value={todayNetProfit} prefix="₺" />
            </p>
            <p className="text-[9px] sm:text-[10px] text-gray-500 mt-2">Satış − Alış</p>
          </div>
        </motion.div>
      </div>

      {/* ─── Secondary Stats Row ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
        {[
          { label: 'Aktif Personel', value: `${activeEmployeeCount}/${rawPersonel.length}`, icon: <Users className="w-4 h-4 text-cyan-400" />, color: '#06b6d4' },
          { label: 'Stok Değeri', value: `₺${totalStockValue >= 1000 ? `${(totalStockValue/1000).toFixed(0)}k` : totalStockValue.toLocaleString('tr-TR')}`, icon: <Package className="w-4 h-4 text-amber-400" />, color: '#f59e0b' },
          { label: 'Kasa Bakiye', value: `₺${kasaStats.kasaBalance.toLocaleString('tr-TR')}`, icon: <Wallet className="w-4 h-4 text-emerald-400" />, color: '#10b981' },
          { label: 'Aktif Cariler', value: `${cariStats.toplam}`, icon: <Users className="w-4 h-4 text-purple-400" />, color: '#8b5cf6' },
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}
            className="flex items-center gap-2 sm:gap-3 p-3 sm:p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-all"
          >
            <div className="p-1.5 sm:p-2 rounded-lg shrink-0" style={{ background: `${item.color}15` }}>{item.icon}</div>
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{item.label}</p>
              <p className="text-xs sm:text-sm font-bold text-white truncate">{item.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ─── Main Chart Section ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        
        {/* Sales/Purchase Composed Chart */}
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
          className="lg:col-span-2 p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10 flex flex-col"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
            <div>
              <h2 className="text-base sm:text-lg lg:text-xl font-bold text-white mb-1 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                {t('dashboard.salesTrend')}
              </h2>
              <p className="text-[10px] sm:text-xs text-gray-500">{t('dashboard.last7Days')} · Satış & Alış & Kâr</p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-white/5">
              {(['composed', 'area', 'bar'] as const).map(v => (
                <button key={v} onClick={() => setChartView(v)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${chartView === v ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-500 hover:text-white'}`}
                >
                  {v === 'composed' ? 'Karma' : v === 'area' ? 'Alan' : 'Bar'}
                </button>
              ))}
            </div>
          </div>

          {/* Week summary strip */}
          <div className="flex gap-2 sm:gap-3 mb-3 sm:mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {[
              { label: 'Hf. Satış', val: weekTotal, bgCls: 'bg-blue-500/10 border-blue-500/20', valCls: 'text-blue-400' },
              { label: 'Hf. Alış', val: weeklySalesData.reduce((s, d) => s + d.alis, 0), bgCls: 'bg-orange-500/10 border-orange-500/20', valCls: 'text-orange-400' },
              { label: 'Hf. Kâr', val: weeklySalesData.reduce((s, d) => s + d.kar, 0), bgCls: 'bg-emerald-500/10 border-emerald-500/20', valCls: 'text-emerald-400' },
            ].map((s, i) => (
              <div key={i} className={`shrink-0 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border ${s.bgCls}`}>
                <p className="text-[8px] sm:text-[9px] font-semibold text-gray-500 uppercase">{s.label}</p>
                <p className={`text-xs sm:text-sm font-black ${s.valCls}`}>₺{s.val.toLocaleString('tr-TR')}</p>
              </div>
            ))}
          </div>
          
          <div className="flex-1 min-h-[240px] sm:min-h-[280px] lg:min-h-[320px]">
            {weeklySalesData.some(d => d.satis > 0 || d.alis > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                {chartView === 'composed' ? (
                  <ComposedChart data={weeklySalesData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                    <defs key="composed-defs">
                      <linearGradient id="gradSatis" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="gradAlis" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2}/>
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid key="cg1" strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis key="xa1" dataKey="day" stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                    <YAxis key="ya1" stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => v === 0 ? '0' : `₺${(v/1000).toFixed(0)}k`} />
                    <Tooltip key="tt1" content={<PremiumTooltip formatter={(v: number) => `₺${v.toLocaleString('tr-TR')}`} />} cursor={{ stroke: '#ffffff10', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Bar key="b1s" dataKey="satis" fill="#3b82f6" shape={<GlowBar />} name="Satış" barSize={16} radius={[6, 6, 0, 0]} />
                    <Bar key="b1a" dataKey="alis" fill="#f59e0b" shape={<GlowBar />} name="Alış" barSize={16} radius={[6, 6, 0, 0]} />
                    <Line key="l1k" type="monotone" dataKey="kar" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#111', stroke: '#10b981', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#10b981' }} name="Kâr" />
                    <Line key="l1o" type="monotone" dataKey="ortalama" stroke="#8b5cf6" strokeDasharray="5 5" strokeWidth={1.5} dot={false} name="Önceki Hf. Ort." />
                  </ComposedChart>
                ) : chartView === 'area' ? (
                  <AreaChart data={weeklySalesData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                    <defs key="area-defs">
                      <linearGradient id="colorSales2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPurch2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid key="cg2" strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis key="xa2" dataKey="day" stroke="#ffffff30" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                    <YAxis key="ya2" stroke="#ffffff30" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `₺${(v/1000).toFixed(0)}k`} />
                    <Tooltip key="tt2" content={<PremiumTooltip formatter={(v: number) => `₺${v.toLocaleString('tr-TR')}`} />} cursor={{ stroke: '#ffffff10' }} />
                    <Area key="a2s" type="monotone" dataKey="satis" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales2)" name="Satış" dot={{ r: 4, fill: '#111', stroke: '#3b82f6', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#3b82f6' }} />
                    <Area key="a2a" type="monotone" dataKey="alis" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorPurch2)" name="Alış" dot={false} />
                    <Area key="a2o" type="monotone" dataKey="ortalama" stroke="#8b5cf6" strokeDasharray="5 5" strokeWidth={1.5} fillOpacity={0} name="Ort." dot={false} />
                  </AreaChart>
                ) : (
                  <BarChart data={weeklySalesData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid key="cg3" strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis key="xa3" dataKey="day" stroke="#ffffff30" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                    <YAxis key="ya3" stroke="#ffffff30" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `₺${(v/1000).toFixed(0)}k`} />
                    <Tooltip key="tt3" content={<PremiumTooltip formatter={(v: number) => `₺${v.toLocaleString('tr-TR')}`} />} cursor={{ fill: '#ffffff05' }} />
                    <Bar key="b3s" dataKey="satis" fill="#3b82f6" shape={<GlowBar />} name="Satış" barSize={18} />
                    <Bar key="b3a" dataKey="alis" fill="#f59e0b" shape={<GlowBar />} name="Alış" barSize={18} />
                    <Bar key="b3k" dataKey="kar" fill="#10b981" shape={<GlowBar />} name="Kâr" barSize={18} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            ) : (
              <EmptyChartState message={t('dashboard.waitingData')} />
            )}
          </div>
        </motion.div>

        {/* Right sidebar: Pie + Gauge */}
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4 lg:gap-6">
          {/* Stok Kategori Dağılımı */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}
            className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
          >
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <PieChart className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs sm:text-sm font-bold text-white">Stok Dağılımı</h3>
            </div>
            {categoryPieData.length > 0 ? (
              <>
                <div className="flex justify-center mb-3 sm:mb-4">
                  <ResponsiveContainer width="100%" height={140} className="max-w-[160px]">
                    <RePieChart>
                      <Pie key="pie1" data={categoryPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" nameKey="name" stroke="none">
                        {categoryPieData.map((e, i) => <Cell key={`pie-cell-${i}-${e.name}`} fill={e.color} />)}
                      </Pie>
                      <Tooltip key="pie1-tt" contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#333', borderRadius: '12px', fontSize: '12px' }} formatter={(v: any) => `₺${Number(v).toLocaleString('tr-TR')}`} />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  {categoryPieData.slice(0, 4).map((e, i) => (
                    <div key={`pie-legend-${i}-${e.name}`} className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.color, boxShadow: `0 0 6px ${e.color}40` }} />
                        <span className="text-[10px] sm:text-[11px] text-gray-400 truncate">{e.name}</span>
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-bold text-white shrink-0">₺{e.value >= 1000 ? `${(e.value/1000).toFixed(1)}k` : e.value.toLocaleString('tr-TR')}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-gray-600 text-xs">Stok verisi yok</div>
            )}
          </motion.div>

          {/* Günlük Hedef Gauge */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
            className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10 flex flex-col items-center"
          >
            <div className="flex items-center gap-2 mb-3 sm:mb-4 self-start">
              <Target className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs sm:text-sm font-bold text-white">Günlük Hedef</h3>
            </div>
            <RadialGauge
              value={realtimeRevenue}
              max={Math.max(realtimeRevenue * 1.3, 10000)}
              size={120}
              strokeWidth={8}
              color="#8b5cf6"
              label="Hedefe Ulaşım"
              sublabel={`₺${realtimeRevenue.toLocaleString('tr-TR')}`}
            />
            <div className="grid grid-cols-2 gap-3 mt-4 w-full">
              <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                <p className="text-[9px] text-gray-500 uppercase font-bold">Satış</p>
                <p className="text-sm font-bold text-blue-400">{todaySales.length}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                <p className="text-[9px] text-gray-500 uppercase font-bold">Alış</p>
                <p className="text-sm font-bold text-orange-400">{todayPurchases.length}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ─── Middle Row: Finance Chart + Top Products ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
        
        {/* Gelir/Gider Bar Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">Gelir & Gider Analizi</h2>
                <p className="text-[10px] sm:text-[11px] text-gray-500">Aylık kasa hareketleri</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Gelir</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Gider</span>
            </div>
          </div>
          <div className="h-[220px] sm:h-[250px]">
            {monthlyFinanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyFinanceData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid key="cg4" strokeDasharray="3 3" stroke="#ffffff06" vertical={false} />
                  <XAxis key="xa4" dataKey="month" stroke="#ffffff30" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis key="ya4" stroke="#ffffff30" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `₺${(v/1000).toFixed(0)}k`} />
                  <Tooltip key="tt4" content={<PremiumTooltip formatter={(v: number) => `₺${v.toLocaleString('tr-TR')}`} />} cursor={{ fill: '#ffffff03' }} />
                  <Bar key="b4g" dataKey="gelir" fill="#10b981" shape={<GlowBar />} name="Gelir" barSize={16} />
                  <Bar key="b4x" dataKey="gider" fill="#ef4444" shape={<GlowBar />} name="Gider" barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartState message="Kasa verisi oluştukça burada görünecek" height={250} />
            )}
          </div>

          {/* Finance summary strip */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-3 sm:mt-4">
            <div className="p-2 sm:p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-[8px] sm:text-[9px] text-emerald-400/70 font-bold uppercase">Toplam Gelir</p>
              <p className="text-xs sm:text-sm font-black text-emerald-400">₺{kasaStats.totalIncome.toLocaleString('tr-TR')}</p>
            </div>
            <div className="p-2 sm:p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
              <p className="text-[8px] sm:text-[9px] text-red-400/70 font-bold uppercase">Toplam Gider</p>
              <p className="text-xs sm:text-sm font-black text-red-400">₺{kasaStats.totalExpense.toLocaleString('tr-TR')}</p>
            </div>
            <div className={`p-2 sm:p-3 rounded-xl text-center ${kasaStats.kasaBalance >= 0 ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-orange-500/10 border border-orange-500/20'}`}>
              <p className={`text-[8px] sm:text-[9px] font-bold uppercase ${kasaStats.kasaBalance >= 0 ? 'text-blue-400/70' : 'text-orange-400/70'}`}>Net Bakiye</p>
              <p className={`text-xs sm:text-sm font-black ${kasaStats.kasaBalance >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>₺{kasaStats.kasaBalance.toLocaleString('tr-TR')}</p>
            </div>
          </div>
        </motion.div>

        {/* En Çok Satan Ürünler */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-6">
            <Award className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white">{t('dashboard.topProducts')}</h2>
              <p className="text-[11px] text-gray-500">{t('dashboard.topProductsSub')}</p>
            </div>
          </div>

          <div className="flex-1">
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((p, i) => {
                  const maxRev = topProducts[0]?.revenue || 1;
                  return (
                    <motion.div key={`top-product-${i}-${p.name}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.08 }}
                      className="group"
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg text-[10px] sm:text-[11px] font-black flex items-center justify-center shrink-0"
                            style={{ 
                              background: `${CHART_COLORS[i]}15`, 
                              color: CHART_COLORS[i],
                              border: `1px solid ${CHART_COLORS[i]}25`
                            }}
                          >
                            {i + 1}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate">{p.name}</h4>
                            <p className="text-[9px] sm:text-[10px] text-gray-500">{p.sales} adet satış</p>
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm font-black text-white shrink-0">₺{p.revenue.toLocaleString('tr-TR')}</p>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden ml-8 sm:ml-10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(p.revenue / maxRev) * 100}%` }}
                          transition={{ duration: 1, delay: 0.5 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                          className="h-full rounded-full"
                          style={{ 
                            background: `linear-gradient(90deg, ${CHART_COLORS[i]}80, ${CHART_COLORS[i]})`,
                            boxShadow: `0 0 8px ${CHART_COLORS[i]}25`
                          }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Package className="w-10 h-10 text-gray-600 mb-3" />
                <p className="text-gray-500 text-sm">{t('dashboard.noSales')}</p>
              </div>
            )}
          </div>
          
          <button onClick={() => navigate('/stok')} className="mt-4 w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-sm transition-all flex items-center justify-center gap-2">
            Tüm Stokları Gör <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>

      {/* ─── Bottom Section: Activity & Quick Actions ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
        
        {/* Recent Activity */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
          className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
            <div className="flex gap-1 sm:gap-2 p-1 bg-black/40 rounded-xl border border-white/5 overflow-x-auto">
              <button onClick={() => setActivityTab('recent')} className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activityTab === 'recent' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>Hareketler</button>
              <button onClick={() => setActivityTab('deleted')} className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1 sm:gap-2 whitespace-nowrap ${activityTab === 'deleted' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>
                Silinenler {deletedActivities.length > 0 && <span className="px-1 sm:px-1.5 py-0.5 bg-red-500/30 text-red-200 text-[9px] sm:text-[10px] rounded-md">{deletedActivities.length}</span>}
              </button>
            </div>
            <button onClick={() => navigate('/fis-gecmisi')} className="text-xs sm:text-sm font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0">Tümü <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4"/></button>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {activityTab === 'recent' ? (
              recentActivities.length > 0 ? recentActivities.map((act, i) => (
                <motion.div key={act.id || i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  onClick={() => navigate('/fis-gecmisi')} className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] cursor-pointer transition-all group gap-2"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${act.positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      <act.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate">{act.type}</h4>
                      <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">{act.desc}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs sm:text-sm font-bold ${act.positive ? 'text-emerald-400' : 'text-red-400'}`}>{act.amount}</p>
                    <p className="text-[9px] sm:text-[10px] text-gray-600 mt-0.5">{act.time}</p>
                  </div>
                </motion.div>
              )) : <p className="text-center py-10 text-gray-500 text-sm">Hareket bulunamadı.</p>
            ) : (
              deletedActivities.length > 0 ? deletedActivities.map((act, i) => (
                <div key={act.id || i} className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-red-950/10 border border-red-500/10 gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="p-2 sm:p-2.5 rounded-lg bg-red-500/10 text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4"/></div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate">{act.type}</h4>
                      <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 truncate">{act.desc}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs sm:text-sm font-bold text-red-500">{act.amount}</p>
                    <p className="text-[9px] sm:text-[10px] text-gray-600 mt-1">Silindi: {act.deletedBy}</p>
                  </div>
                </div>
              )) : <p className="text-center py-10 text-gray-500 text-sm">Silinen işlem bulunmuyor.</p>
            )}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex items-center gap-2 mb-6">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white">{t('dashboard.quickActions')}</h2>
              <p className="text-[11px] text-gray-500">{t('dashboard.quickActionsSub')}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { path: '/sales', icon: ShoppingCart, label: 'Yeni Satış', color: '#3b82f6', bg: 'blue' },
              { path: '/stok', icon: Package, label: 'Stok Girişi', color: '#6366f1', bg: 'indigo' },
              { path: '/cari', icon: Users, label: 'Müşteri Ekle', color: '#0ea5e9', bg: 'sky' },
              { path: '/tahsilat', icon: Banknote, label: 'Tahsilat', color: '#10b981', bg: 'emerald' },
              { path: '/gun-sonu', icon: CalendarCheck, label: 'Gün Sonu', color: '#f97316', bg: 'orange' },
              { path: '/raporlar', icon: TrendingUp, label: 'Raporlar', color: '#8b5cf6', bg: 'purple' },
            ].map((action, i) => (
              <motion.button key={i} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate(action.path)}
                className="p-3 sm:p-4 lg:p-5 flex flex-col items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.15] transition-all group"
                style={{ '--action-color': action.color } as React.CSSProperties}
              >
                <div className="p-2 sm:p-2.5 rounded-xl group-hover:scale-110 transition-transform"
                  style={{ background: `${action.color}15`, boxShadow: `0 0 0 0 ${action.color}00`, transition: 'box-shadow 0.3s' }}
                >
                  <action.icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: action.color }} />
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 group-hover:text-white transition-colors text-center leading-tight">{action.label}</span>
              </motion.button>
            ))}
          </div>

          {/* Quick stats at bottom */}
          <div className="mt-4 sm:mt-5 p-3 sm:p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider">Bugünkü Özet</span>
            </div>
            <div className="space-y-2">
              <MetricBar label="Satış" value={realtimeRevenue} maxValue={Math.max(realtimeRevenue, todayPurchaseTotal, 1)} color="#3b82f6" suffix="₺" delay={0.1} />
              <MetricBar label="Alış" value={todayPurchaseTotal} maxValue={Math.max(realtimeRevenue, todayPurchaseTotal, 1)} color="#f59e0b" suffix="₺" delay={0.2} />
              <MetricBar label="Kasa Gelir" value={kasaStats.todayIncome} maxValue={Math.max(kasaStats.todayIncome, kasaStats.todayExpense, 1)} color="#10b981" suffix="₺" delay={0.3} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* ─── KPI Ticker Banner ─── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.62 }}>
        <KPITicker items={kpiTickerItems} />
      </motion.div>

      {/* ─── Trend Comparison + Bullet KPIs Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
        {/* Haftalık Trend Karşılaştırma */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.63 }}
          className="p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Haftalık Trend Analizi</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Bu hafta vs önceki hafta</p>
            </div>
          </div>
          <TrendComparison items={trendItems} />
        </motion.div>

        {/* Hedef Takip (Bullet Gauges) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.64 }}
          className="p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-5">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Günlük Hedef Takibi</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Gerçekleşen vs hedef</p>
            </div>
          </div>
          <div className="space-y-3 sm:space-y-5">
            <BulletGauge label="Günlük Ciro" actual={realtimeRevenue} target={Math.max(realtimeRevenue * 1.3, 5000)} max={Math.max(realtimeRevenue * 2, 10000)} color="#3b82f6" suffix="₺" />
            <BulletGauge label="Satış Adedi" actual={todaySales.length} target={Math.max(todaySales.length + 3, 8)} max={Math.max(todaySales.length * 3, 15)} color="#10b981" />
            <BulletGauge label="Kasa Geliri" actual={kasaStats.todayIncome} target={Math.max(kasaStats.todayIncome * 1.2, 3000)} max={Math.max(kasaStats.todayIncome * 2, 8000)} color="#8b5cf6" suffix="₺" />
          </div>
        </motion.div>
      </div>

      {/* ─── Advanced Analytics Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">

        {/* Saatlik Satış Isı Haritası */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}
          className="lg:col-span-2 p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Saatlik Satış Yoğunluğu</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Son 7 gün · 07:00–22:00</p>
            </div>
          </div>
          <HeatmapChart
            data={heatmapData}
            colorScale={['#0a1628', '#1e40af', '#60a5fa']}
            height={160}
          />
        </motion.div>

        {/* Ödeme Yöntemi Dağılımı */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 }}
          className="p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Ödeme Dağılımı</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Tüm zamanlar</p>
            </div>
          </div>
          {paymentMethodData.length > 0 ? (
            <PaymentDonut segments={paymentMethodData} size={120} />
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-600 text-xs">Ödeme verisi yok</div>
          )}
        </motion.div>
      </div>

      {/* ─── Performance Radar + Funnel + Waterfall Row ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">

        {/* Performans Radarı */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.72 }}
          className="p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10 flex flex-col items-center"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4 self-start">
            <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Performans Radarı</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Çok boyutlu işletme analizi</p>
            </div>
          </div>
          <PerformanceRadar metrics={radarMetrics} size={200} className="w-full max-w-[220px] sm:max-w-none" />
        </motion.div>

        {/* Satış Hunisi */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.74 }}
          className="p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Satış Hunisi</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Dönüşüm oranları</p>
            </div>
          </div>
          <SalesFunnel steps={funnelSteps} height={150} />

          {/* Gradient Arc KPIs */}
          <div className="flex items-center justify-around mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-white/5">
            <GradientArc
              value={productionStats.efficiency}
              max={100}
              label="Verimlilik"
              fromColor="#8b5cf6"
              toColor="#3b82f6"
              size={75}
            />
            <GradientArc
              value={realtimeRevenue}
              max={Math.max(realtimeRevenue * 1.5, 10000)}
              label="Ciro Hedef"
              sublabel={`₺${realtimeRevenue.toLocaleString('tr-TR')}`}
              fromColor="#10b981"
              toColor="#06b6d4"
              size={75}
            />
          </div>
        </motion.div>

        {/* Kümülatif Gelir Waterfall */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.76 }}
          className="p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Landmark className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Günlük Nakit Akışı</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Bugünkü gelir-gider waterfall</p>
            </div>
          </div>
          <WaterfallChart items={waterfallData} height={180} />
        </motion.div>
      </div>

      {/* ─── Week Comparison + Stock Flow + Production Row ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">

        {/* Haftalık Karşılaştırma */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.78 }}
          className="p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <ArrowLeftRight className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Haftalık Karşılaştırma</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Bu hafta vs önceki hafta</p>
            </div>
          </div>
          <div className="space-y-3 sm:space-y-5">
            <WeekCompareBar thisWeek={weekTotal} lastWeek={prevWeekTotal} label="Satış Geliri" color="#3b82f6" />
            <WeekCompareBar 
              thisWeek={weeklySalesData.reduce((s, d) => s + d.alis, 0)} 
              lastWeek={Math.round(prevWeekTotal * 0.6)} 
              label="Alış Maliyeti" 
              color="#f59e0b" 
            />
            <WeekCompareBar 
              thisWeek={weeklySalesData.reduce((s, d) => s + d.kar, 0)} 
              lastWeek={Math.round(prevWeekTotal * 0.4)} 
              label="Net Kâr" 
              color="#10b981" 
            />
          </div>
        </motion.div>

        {/* Stok Akış + Üretim Verimi */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
          className="p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Factory className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Üretim & Stok Akışı</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Bugünkü performans</p>
            </div>
          </div>

          <div className="mb-3 sm:mb-5">
            <MultiRadialGauge
              items={[
                { label: 'Verimlilik', value: productionStats.efficiency, max: 100, color: '#8b5cf6' },
                { label: 'Üretim', value: productionStats.todayCount, max: Math.max(productionStats.todayCount, 10), color: '#3b82f6' },
                { label: 'Fire Oranı', value: productionStats.totalFire, max: Math.max(productionStats.totalProduced, 1), color: '#ef4444' },
              ]}
              size={60}
            />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <ArrowLeftRight className="w-3 h-3 text-gray-500" />
              <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest">Stok Giriş / Çıkış</span>
            </div>
            {stockFlowData.length > 0 ? (
              <StockFlowBars items={stockFlowData} />
            ) : (
              <div className="text-center py-4 sm:py-6 text-gray-600 text-xs">Stok hareket verisi yok</div>
            )}
          </div>
        </motion.div>

        {/* Satış Aktivite Takvimi + Kategori Yarışı */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.82 }}
          className="p-3 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            <div>
              <h2 className="text-xs sm:text-sm lg:text-base font-bold text-white">Satış Aktivite Takvimi</h2>
              <p className="text-[9px] sm:text-[10px] lg:text-[11px] text-gray-500">Son 12 haftalık dağılım</p>
            </div>
          </div>
          <CalendarHeatmap data={calendarData} weeks={12} color="#10b981" />

          {/* Kategori Yarışı */}
          {categoryRaceData.length > 0 && (
            <div className="mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-white/5 flex-1">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <Award className="w-3 h-3 text-amber-400" />
                <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest">Kategori Sıralaması</span>
              </div>
              <BarRace items={categoryRaceData} suffix="₺" />
            </div>
          )}
        </motion.div>
      </div>

      {/* ─── Cari Borç/Alacak Özet ─── */}
      {cariStats.toplam > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 }}
          className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">Cari Borç / Alacak Analizi</h2>
                <p className="text-[10px] sm:text-[11px] text-gray-500">{cariStats.toplam} aktif cari hesap</p>
              </div>
            </div>
            <button onClick={() => navigate('/cari')} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 shrink-0">
              Tüm Cariler <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-3 sm:p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
              <p className="text-[8px] sm:text-[9px] font-bold text-blue-400/70 uppercase mb-1">Toplam Cari</p>
              <p className="text-lg sm:text-2xl font-black text-blue-400">{cariStats.toplam}</p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
              <p className="text-[8px] sm:text-[9px] font-bold text-red-400/70 uppercase mb-1">Borçlu</p>
              <p className="text-lg sm:text-2xl font-black text-red-400">{cariStats.borclu}</p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <p className="text-[8px] sm:text-[9px] font-bold text-emerald-400/70 uppercase mb-1">Alacaklı</p>
              <p className="text-lg sm:text-2xl font-black text-emerald-400">{cariStats.alacakli}</p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-[8px] sm:text-[9px] font-bold text-amber-400/70 uppercase mb-1">Toplam Borç</p>
              <p className="text-lg sm:text-xl font-black text-amber-400">₺{cariStats.toplamBorc.toLocaleString('tr-TR')}</p>
            </div>
          </div>

          {/* Borçlu / Alacaklı oranı */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-3 rounded-full bg-[#1a1a1a] overflow-hidden flex">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${cariStats.toplam > 0 ? (cariStats.borclu / cariStats.toplam) * 100 : 0}%` }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                className="h-full bg-red-500/70 rounded-l-full"
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${cariStats.toplam > 0 ? (cariStats.alacakli / cariStats.toplam) * 100 : 0}%` }}
                transition={{ duration: 1.2, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="h-full bg-emerald-500/70 rounded-r-full"
              />
            </div>
            <div className="flex items-center gap-3 text-[9px] shrink-0">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Borçlu</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Alacaklı</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Activity Timeline */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.88 }}
        className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/10"
      >
        <ActivityTimeline compact maxItems={10} />
      </motion.div>

    </div>
  );
}