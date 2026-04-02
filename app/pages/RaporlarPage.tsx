import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  FileText, TrendingUp, DollarSign, Package, Users,
  Calendar, BarChart3, PieChart, Receipt,
  CheckCircle, XCircle, AlertCircle, Building2,
  Plus, Trash2, Edit2, ShoppingCart, UserCheck, Filter,
  Download, ArrowUpRight, ArrowDownRight, Activity,
  Layers, Zap, Target, Award, TrendingDown,
  AreaChart, RefreshCw, Briefcase, ChevronRight,
  Shield, Lock, Eye, AlertTriangle, LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../utils/activityLogger';
import { getPagePermissions } from '../utils/permissions';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, Area, AreaChart as ReAreaChart,
  Line, ComposedChart
} from 'recharts';
import { useEmployee } from '../contexts/EmployeeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useModuleBus } from '../hooks/useModuleBus';
import { DynamicTable, type Column } from '../components/DynamicTable';
import { 
  PremiumTooltip, AnimatedCounter, AnimatedProgress, 
  MiniDonut
} from '../components/ChartComponents';
import {
  generateSalesPDF, generatePurchasePDF, generateFinancialPDF,
  generateStockPDF, generateCariPDF, generatePersonelPerformansPDF,
  type PersonelPerformansPDFData
} from '../utils/reportGenerator';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';

const safeNum = (v: any, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return isNaN(n) || !isFinite(n) ? fallback : n;
};

// ─── Mini Inline Bar ────────────────────────────────────────────────
const InlineBar = ({ value, max, color = '#3b82f6', height = 6 }: { value: number; max: number; color?: string; height?: number }) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-white/5 rounded-full overflow-hidden" style={{ height }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}cc, ${color})`, boxShadow: `0 0 8px ${color}40` }}
      />
    </div>
  );
};

// ─── Status Badge ────────────────────────────────────────────────────
const StatusBadge = ({ status, label }: { status: 'success' | 'warning' | 'danger' | 'info'; label: string }) => {
  const map = { success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', warning: 'bg-amber-500/15 text-amber-400 border-amber-500/20', danger: 'bg-red-500/15 text-red-400 border-red-500/20', info: 'bg-blue-500/15 text-blue-400 border-blue-500/20' };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${map[status]}`}>{label}</span>;
};

// ─── Category Filter Chips ──────────────────────────────────────────
const CategoryFilter = ({ categories, selected, onChange }: { categories: string[]; selected: string; onChange: (v: string) => void }) => (
  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
    <button onClick={() => onChange('')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${!selected ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>Tümü</button>
    {categories.map(cat => (
      <button key={cat} onClick={() => onChange(selected === cat ? '' : cat)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${selected === cat ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>{cat}</button>
    ))}
  </div>
);

const StatCard = ({ title, value, numValue, icon: Icon, color, trend, delay = 0, prefix = '₺' }: any) => {
  const colorMap: Record<string, string> = {
    blue: 'blue', green: 'emerald', red: 'red', purple: 'purple', orange: 'orange', cyan: 'cyan',
  };
  const c = colorMap[color] || 'blue';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.5 }}
      className={`p-5 rounded-3xl bg-[#111] border border-white/5 relative overflow-hidden group hover:border-${c}-500/30 transition-all`}
    >
      <div className={`absolute -top-12 -right-12 w-32 h-32 bg-${c}-500/10 rounded-full blur-3xl group-hover:bg-${c}-500/20 transition-all`} />
      <div className="relative z-10 flex items-start justify-between mb-4">
        <div className={`p-3 rounded-2xl bg-${c}-500/10 text-${c}-400 border border-${c}-500/20 shadow-lg shadow-${c}-500/10`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${trend >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            %{Math.abs(trend).toFixed(1)}
          </div>
        )}
      </div>
      <div className="relative z-10">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">{title}</p>
        <p className="text-3xl font-black text-white">
          <AnimatedCounter value={numValue} prefix={prefix} duration={1200} />
        </p>
      </div>
    </motion.div>
  );
};

export function RaporlarPage() {
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { t } = useLanguage();

  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canView: canViewReports } = getPagePermissions(user, currentEmployee, 'reports');
  const { emit } = useModuleBus();
  
  const [selectedTab, setSelectedTab] = useState('sales');
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handler = () => setRefreshCounter(c => c + 1);
    window.addEventListener('storage_update', handler);
    window.addEventListener('storage', handler);
    return () => { window.removeEventListener('storage_update', handler); window.removeEventListener('storage', handler); };
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true); setRefreshCounter(c => c + 1);
    const tid = setTimeout(() => setIsRefreshing(false), 800);
    toast.success('Gerçek zamanlı veriler güncellendi.');
    return () => clearTimeout(tid);
  }, []);

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateRange, setDateRange] = useState({ start: firstDayOfMonth.toISOString().split('T')[0], end: today.toISOString().split('T')[0] });
  
  const rawFisler = useMemo(() => getFromStorage<any[]>(StorageKey.FISLER) || [], [refreshCounter]);
  const rawKasa = useMemo(() => getFromStorage<any[]>(StorageKey.KASA_DATA) || [], [refreshCounter]);
  const rawStok = useMemo(() => getFromStorage<any[]>(StorageKey.STOK_DATA) || [], [refreshCounter]);
  const rawCari = useMemo(() => getFromStorage<any[]>(StorageKey.CARI_DATA) || [], [refreshCounter]);
  const rawPersonel = useMemo(() => getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [], [refreshCounter]);
  const [banks, setBanks] = useState(() => getFromStorage<any[]>(StorageKey.BANK_DATA) || []);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [newBankForm, setNewBankForm] = useState({ name: '', code: '', branch: '' });
  const checkData: any[] = [];

  const isWithinRange = (dateString: string) => {
    if (!dateString) return false;
    let d = new Date(dateString);
    if (isNaN(d.getTime())) {
      const parts = dateString.split('.');
      if (parts.length === 3) d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    if (isNaN(d.getTime())) return false; // Geçersiz tarih → rapora dahil etme
    const start = new Date(dateRange.start); start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end); end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  };

  const salesData = useMemo(() => {
    return rawFisler.filter(f => (f.mode === 'sale' || f.mode === 'satis') && isWithinRange(f.date)).flatMap(f => (f.items || []).map((i: any) => {
      const isIade = i.type === 'iade';
      const val = i.totalPrice || i.total || 0;
      return {
        date: f.date ? new Date(f.date).toLocaleDateString('tr-TR') : '-',
        customer: f.cari?.companyName || 'Bilinmiyor',
        product: isIade ? `(İADE) ${i.name || i.productName}` : i.name || i.productName,
        category: i.category || 'Kategori Yok', quantity: Math.abs(i.quantity || 0), unit: i.unit || 'AD',
        amount: isIade ? -Math.abs(val) : Math.abs(val), rawDate: f.date
      };
    }));
  }, [rawFisler, dateRange]);

  const purchaseData = useMemo(() => {
    return rawFisler.filter(f => f.mode === 'alis' && isWithinRange(f.date)).flatMap(f => (f.items || []).map((i: any) => {
      const isIade = i.type === 'iade';
      const val = i.totalPrice || i.total || 0;
      return {
        date: f.date ? new Date(f.date).toLocaleDateString('tr-TR') : '-',
        supplier: f.cari?.companyName || 'Bilinmiyor',
        product: isIade ? `(İADE) ${i.name || i.productName}` : i.name || i.productName,
        category: i.category || 'Kategori Yok', quantity: Math.abs(i.quantity || 0), unit: i.unit || 'AD',
        amount: isIade ? -Math.abs(val) : Math.abs(val), rawDate: f.date
      };
    }));
  }, [rawFisler, dateRange]);

  const incomeData = useMemo(() => rawKasa.filter(k => (k.type === 'Gelir' || k.type === 'income') && isWithinRange(k.date)).map(k => ({ date: k.date ? new Date(k.date).toLocaleDateString('tr-TR') : '-', description: k.description || 'Gelir', category: k.category || 'Tahsilat', amount: k.amount || 0 })), [rawKasa, dateRange]);
  const expenseData = useMemo(() => rawKasa.filter(k => (k.type === 'Gider' || k.type === 'expense') && isWithinRange(k.date)).map(k => ({ date: k.date ? new Date(k.date).toLocaleDateString('tr-TR') : '-', description: k.description || 'Gider', category: k.category || 'Ödeme', amount: k.amount || 0 })), [rawKasa, dateRange]);

  const stockData = useMemo(() => rawStok.map(s => {
    let movements: any[] = [];
    try { if (s.movements && Array.isArray(s.movements)) movements = s.movements; } catch {}
    return { name: s.name || '-', category: s.category || 'Kategori', stock: safeNum(s.currentStock ?? s.stock), minStock: safeNum(s.minStock), unit: s.unit || 'AD', price: safeNum(s.sellPrice ?? s.price), buyPrice: safeNum(s.buyPrice ?? s.cost), movements };
  }), [rawStok]);

  const cariData = useMemo(() => rawCari.map(c => ({ type: c.type || 'Müşteri', companyName: c.companyName || '-', contactPerson: c.contactPerson || '-', phone: c.phone || '-', balance: c.balance || 0, transactions: c.transactions || 0 })), [rawCari]);

  const totalSales = salesData.reduce((sum, item) => sum + item.amount, 0);
  const totalPurchases = purchaseData.reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = incomeData.reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = expenseData.reduce((sum, item) => sum + item.amount, 0);
  const netProfit = totalIncome - totalExpense;
  const totalStockValue = stockData.reduce((sum, item) => sum + (item.stock * item.price), 0);
  const activeCariCount = rawCari.length;
  const grossMargin = totalSales > 0 ? ((totalSales - totalPurchases) / totalSales) * 100 : 0;

  const personelPerformansData = useMemo(() => {
    const stats: Record<string, any> = {};
    rawFisler.filter(f => isWithinRange(f.date)).forEach(f => {
      const empId = f.employeeId || f.employeeName || f.employee || 'Bilinmiyor';
      if (!stats[empId]) stats[empId] = { name: empId, role: '-', fisCount: 0, salesTotal: 0, returnTotal: 0, purchaseTotal: 0, customerSet: new Set() };
      stats[empId].fisCount += 1;
      if (f.cari?.companyName) stats[empId].customerSet.add(f.cari.companyName);
      if (f.mode === 'satis' || f.mode === 'sale' || f.mode === 'alis') {
        (f.items || []).forEach((item: any) => {
          const amt = Math.abs(item.totalPrice || item.total || 0);
          if (item.type === 'iade') stats[empId].returnTotal += amt;
          else if (f.mode === 'alis') stats[empId].purchaseTotal += amt;
          else stats[empId].salesTotal += amt;
        });
      }
    });
    return Object.values(stats).map((s: any) => ({ ...s, customerCount: s.customerSet.size, netSales: s.salesTotal - s.returnTotal })).sort((a: any, b: any) => b.netSales - a.netSales);
  }, [rawFisler, dateRange]);

  const monthlySalesChartData = useMemo(() => {
    const grouped = salesData.reduce((acc: any, item) => {
      const d = new Date(item.rawDate); if (isNaN(d.getTime())) return acc;
      const month = d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
      if (!acc[month]) acc[month] = { satis: 0, alis: 0 };
      acc[month].satis += item.amount; return acc;
    }, {});
    purchaseData.forEach(item => {
      const d = new Date(item.rawDate); if (isNaN(d.getTime())) return;
      const month = d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
      if (!grouped[month]) grouped[month] = { satis: 0, alis: 0 };
      grouped[month].alis += item.amount;
    });
    return Object.entries(grouped).map(([month, vals]: any) => ({ month, satis: vals.satis, alis: vals.alis, kar: vals.satis - vals.alis }));
  }, [salesData, purchaseData]);

  const categoryPieData = useMemo(() => {
    const grouped = stockData.reduce((acc: any, item) => { acc[item.category] = (acc[item.category] || 0) + (item.stock * item.price); return acc; }, {});
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#ec4899', '#06b6d4'];
    return Object.entries(grouped).map(([name, value], idx) => ({ name, value: Number(value), color: colors[idx % colors.length] })).filter(x => x.value > 0);
  }, [stockData]);

  const dailyTrendData = useMemo(() => {
    const grouped: Record<string, { satis: number; alis: number; label: string }> = {};
    salesData.forEach(item => {
      const d = new Date(item.rawDate); if (isNaN(d.getTime())) return;
      const isoKey = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      if (!grouped[isoKey]) grouped[isoKey] = { satis: 0, alis: 0, label };
      grouped[isoKey].satis += item.amount;
    });
    purchaseData.forEach(item => {
      const d = new Date(item.rawDate); if (isNaN(d.getTime())) return;
      const isoKey = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
      if (!grouped[isoKey]) grouped[isoKey] = { satis: 0, alis: 0, label };
      grouped[isoKey].alis += item.amount;
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, vals]) => ({ day: vals.label, satis: vals.satis, alis: vals.alis }))
      .slice(-14);
  }, [salesData, purchaseData]);

  const quickDateFilters = useMemo(() => {
    const now = new Date(); const todayISO = now.toISOString().split('T')[0];
    const wStart = new Date(now); wStart.setDate(wStart.getDate() - (wStart.getDay() === 0 ? 6 : wStart.getDay() - 1));
    const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    return [
      { label: t('reports.today'), start: todayISO, end: todayISO }, { label: t('reports.thisWeek'), start: wStart.toISOString().split('T')[0], end: todayISO },
      { label: t('reports.thisMonth'), start: firstDayOfMonth.toISOString().split('T')[0], end: todayISO }, { label: t('reports.lastMonth'), start: lmStart.toISOString().split('T')[0], end: lmEnd.toISOString().split('T')[0] },
      { label: t('reports.all'), start: '2020-01-01', end: todayISO },
    ];
  }, [t]);

  const topProducts = useMemo(() => {
    const grouped: Record<string, { amount: number; qty: number }> = {};
    salesData.forEach(item => { const k = item.product.replace(/\(.*?\)\s*/, ''); if (!grouped[k]) grouped[k] = { amount: 0, qty: 0 }; grouped[k].amount += item.amount; grouped[k].qty += item.quantity; });
    return Object.entries(grouped).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [salesData]);

  // Müşteri bazlı satış dağılımı
  const customerDistribution = useMemo(() => {
    const grouped: Record<string, number> = {};
    salesData.forEach(item => { grouped[item.customer] = (grouped[item.customer] || 0) + item.amount; });
    return Object.entries(grouped).map(([name, value]) => ({ name: name.length > 15 ? name.slice(0,15) + '...' : name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [salesData]);

  // Gelir-Gider karşılaştırma
  const financialComparisonData = useMemo(() => {
    const items = [
      { name: 'Gelir', value: totalIncome, color: '#10b981' },
      { name: 'Gider', value: totalExpense, color: '#ef4444' },
      { name: 'Net', value: Math.abs(netProfit), color: netProfit >= 0 ? '#3b82f6' : '#f59e0b' },
    ];
    return items;
  }, [totalIncome, totalExpense, netProfit]);

  const topProductsChartData = useMemo(() => {
    return topProducts.map((p, i) => ({
      name: p.name.length > 12 ? p.name.slice(0, 12) + '...' : p.name,
      ciro: p.amount,
      adet: p.qty,
    }));
  }, [topProducts]);

  const PdfButton = ({ type, onClick }: any) => (
    <button onClick={onClick} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-600/20 text-sm">
      <FileText className="w-4 h-4" /> PDF İndir
    </button>
  );

  // ─── Interactive table state ──────────────────────────────────────
  const [salesCategoryFilter, setSalesCategoryFilter] = useState('');
  const [purchaseCategoryFilter, setPurchaseCategoryFilter] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'critical' | 'ok'>('all');
  const [incomeCategoryFilter, setIncomeCategoryFilter] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('');
  const [selectedSaleRow, setSelectedSaleRow] = useState<any>(null);

  // Unique categories
  const salesCategories = useMemo(() => [...new Set(salesData.map(s => s.category))].filter(Boolean).slice(0, 8), [salesData]);
  const purchaseCategories = useMemo(() => [...new Set(purchaseData.map(p => p.category))].filter(Boolean).slice(0, 8), [purchaseData]);
  const stockCategories = useMemo(() => [...new Set(stockData.map(s => s.category))].filter(Boolean).slice(0, 8), [stockData]);
  const incomeCategories = useMemo(() => [...new Set(incomeData.map(i => i.category))].filter(Boolean).slice(0, 8), [incomeData]);
  const expenseCategories = useMemo(() => [...new Set(expenseData.map(e => e.category))].filter(Boolean).slice(0, 8), [expenseData]);

  // Filtered data
  const filteredSales = useMemo(() => salesCategoryFilter ? salesData.filter(s => s.category === salesCategoryFilter) : salesData, [salesData, salesCategoryFilter]);
  const filteredPurchases = useMemo(() => purchaseCategoryFilter ? purchaseData.filter(p => p.category === purchaseCategoryFilter) : purchaseData, [purchaseData, purchaseCategoryFilter]);
  const filteredStock = useMemo(() => {
    let d = stockData;
    if (stockCategoryFilter) d = d.filter(s => s.category === stockCategoryFilter);
    if (stockStatusFilter === 'critical') d = d.filter(s => s.stock <= s.minStock);
    else if (stockStatusFilter === 'ok') d = d.filter(s => s.stock > s.minStock);
    return d;
  }, [stockData, stockCategoryFilter, stockStatusFilter]);
  const filteredIncome = useMemo(() => incomeCategoryFilter ? incomeData.filter(i => i.category === incomeCategoryFilter) : incomeData, [incomeData, incomeCategoryFilter]);
  const filteredExpense = useMemo(() => expenseCategoryFilter ? expenseData.filter(e => e.category === expenseCategoryFilter) : expenseData, [expenseData, expenseCategoryFilter]);

  // Max values for inline bars
  const maxSaleAmount = useMemo(() => Math.max(1, ...salesData.map(s => Math.abs(s.amount))), [salesData]);
  const maxStockValue = useMemo(() => Math.max(1, ...stockData.map(s => s.stock * s.price)), [stockData]);
  const maxPersonelSales = useMemo(() => Math.max(1, ...personelPerformansData.map((p: any) => p.netSales)), [personelPerformansData]);

  // Security log data from activity logger
  const securityLogs = useMemo(() => {
    const logs = getFromStorage<any[]>('ISLEYEN_ET_ACTIVITY_LOG' as any) || [];
    return logs.filter(l => isWithinRange(l.timestamp || l.date)).slice(0, 100).map(l => ({
      time: l.timestamp ? new Date(l.timestamp).toLocaleString('tr-TR') : '-',
      user: l.employeeName || l.user || '-',
      action: l.action || l.type || '-',
      detail: l.description || l.detail || '-',
      page: l.page || '-',
      level: l.action?.includes('delete') || l.action?.includes('error') ? 'danger' : l.action?.includes('login') || l.action?.includes('auth') ? 'warning' : 'info',
    }));
  }, [refreshCounter, dateRange]);

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-28 sm:pb-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">Kapsamlı Raporlar</h1>
            <button onClick={handleRefresh} className="p-2 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl transition-all"><RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`}/></button>
          </div>
          <p className="text-gray-400 text-sm sm:text-base">Satış, finans ve stok analitik verileri</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto p-2 bg-[#111] rounded-2xl border border-white/5 overflow-x-auto">
          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 ml-2 flex-shrink-0" />
          <input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="bg-transparent text-white outline-none text-xs sm:text-sm font-bold min-w-[120px]" />
          <span className="text-gray-600 flex-shrink-0">-</span>
          <input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="bg-transparent text-white outline-none text-xs sm:text-sm font-bold pr-2 min-w-[120px]" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {quickDateFilters.map(f => (
          <button key={f.label} onClick={() => setDateRange({ start: f.start, end: f.end })} className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${dateRange.start === f.start && dateRange.end === f.end ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard title={t('reports.totalSales')} numValue={totalSales} icon={TrendingUp} color="blue" trend={12.5} />
        <StatCard title={t('reports.totalPurchases')} numValue={totalPurchases} icon={ShoppingCart} color="orange" />
        <StatCard title={t('reports.netProfitLoss')} numValue={netProfit} icon={DollarSign} color={netProfit >= 0 ? 'green' : 'red'} />
        <StatCard title={t('reports.stockValue')} numValue={totalStockValue} icon={Package} color="purple" />
        <StatCard title={t('reports.grossMargin')} numValue={grossMargin} icon={Target} color="cyan" prefix="%" />
        <StatCard title={t('reports.registeredCari')} numValue={activeCariCount} icon={Users} color="orange" prefix="" />
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 sm:p-2.5 rounded-xl bg-purple-500/10 text-purple-400"><AreaChart className="w-4 h-4 sm:w-5 sm:h-5"/></div>
            <div><h2 className="font-bold text-base sm:text-lg">{t('reports.dailySalesTrend')}</h2><p className="text-[10px] sm:text-xs text-gray-500">{t('reports.last14Days')}</p></div>
          </div>
          <div className="h-52 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ReAreaChart data={dailyTrendData}>
                <defs>
                  <linearGradient id="colorSatis" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient>
                  <linearGradient id="colorAlis" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="day" stroke="#666" tick={{fill: '#666', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis stroke="#666" tick={{fill: '#666', fontSize: 12}} tickLine={false} axisLine={false} tickFormatter={v => `₺${v/1000}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '12px', color: '#fff' }} />
                <Area type="monotone" dataKey="satis" stroke="#8b5cf6" strokeWidth={3} fill="url(#colorSatis)" name={t('reports.sales')} dot={{ r: 3, fill: '#0a0a0a', stroke: '#8b5cf6', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#8b5cf6', stroke: '#0a0a0a', strokeWidth: 2 }} />
                <Area type="monotone" dataKey="alis" stroke="#f59e0b" strokeWidth={3} fill="url(#colorAlis)" name={t('reports.purchase')} dot={false} />
              </ReAreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5 flex flex-col">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400"><PieChart className="w-4 h-4 sm:w-5 sm:h-5"/></div>
            <div><h2 className="font-bold text-base sm:text-lg">{t('reports.stockValueDistribution')}</h2><p className="text-[10px] sm:text-xs text-gray-500">{t('reports.byCategory')}</p></div>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <div className="h-48 w-full mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={categoryPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                    {categoryPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '12px' }} formatter={v => `₺${Number(v).toLocaleString('tr-TR')}`} />
                </RePieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {categoryPieData.slice(0,4).map((e,i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: e.color}}/> <span className="text-gray-300">{e.name}</span></div>
                  <span className="font-bold text-white">₺{e.value.toLocaleString('tr-TR')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* Aylık Satış vs Alış Karşılaştırma */}
        <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500/10 text-blue-400"><BarChart3 className="w-4 h-4 sm:w-5 sm:h-5"/></div>
            <div><h2 className="font-bold text-base sm:text-lg">{t('reports.monthlySalesVsPurchases')}</h2><p className="text-[10px] sm:text-xs text-gray-500">{t('reports.comparativeAnalysis')}</p></div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlySalesChartData}>
                <defs>
                  <linearGradient id="barSatis" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9}/><stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4}/></linearGradient>
                  <linearGradient id="barAlis" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9}/><stop offset="100%" stopColor="#f59e0b" stopOpacity={0.4}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />
                <XAxis dataKey="month" stroke="#555" tick={{fill:'#666', fontSize: 11}} tickLine={false} axisLine={false} />
                <YAxis stroke="#555" tick={{fill:'#666', fontSize: 11}} tickLine={false} axisLine={false} tickFormatter={v => `₺${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<PremiumTooltip formatter={v => `₺${v.toLocaleString('tr-TR')}`} />} />
                <Bar dataKey="satis" name={t('reports.sales')} fill="url(#barSatis)" radius={[4,4,0,0]} barSize={20} />
                <Bar dataKey="alis" name={t('reports.purchase')} fill="url(#barAlis)" radius={[4,4,0,0]} barSize={20} />
                <Line type="monotone" dataKey="kar" name="Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#111', stroke: '#10b981', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* En Çok Satan Ürünler */}
        <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 sm:p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400"><Award className="w-4 h-4 sm:w-5 sm:h-5"/></div>
            <div><h2 className="font-bold text-base sm:text-lg">En Çok Satan 5 Ürün</h2><p className="text-[10px] sm:text-xs text-gray-500">Ciro bazlı sıralama</p></div>
          </div>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((p, i) => {
                const maxAmount = topProducts[0]?.amount || 1;
                const pct = (p.amount / maxAmount) * 100;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{i < 3 ? medals[i] : `#${i+1}`}</span>
                        <span className="text-sm text-gray-300 truncate max-w-[140px]">{p.name}</span>
                      </div>
                      <span className="text-sm font-bold text-white">₺{p.amount.toLocaleString('tr-TR')}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, #06b6d4, #3b82f6)`, boxShadow: '0 0 8px rgba(6,182,212,0.3)' }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">{p.qty} adet satış</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Henüz satış verisi yok</div>
          )}
        </div>

        {/* Müşteri Dağılımı */}
        <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 sm:p-2.5 rounded-xl bg-orange-500/10 text-orange-400"><Users className="w-4 h-4 sm:w-5 sm:h-5"/></div>
            <div><h2 className="font-bold text-base sm:text-lg">Müşteri Dağılımı</h2><p className="text-[10px] sm:text-xs text-gray-500">En yüksek cirolu cariler</p></div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={customerDistribution} layout="vertical">
                <defs>
                  <linearGradient id="barCustomer" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.8}/><stop offset="100%" stopColor="#ef4444" stopOpacity={0.6}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" horizontal={false} />
                <XAxis type="number" stroke="#555" tick={{fill:'#666', fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={v => `₺${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" stroke="#555" tick={{fill:'#999', fontSize: 11}} tickLine={false} axisLine={false} width={100} />
                <Tooltip content={<PremiumTooltip formatter={v => `₺${v.toLocaleString('tr-TR')}`} />} />
                <Bar dataKey="value" name="Ciro" fill="url(#barCustomer)" radius={[0,6,6,0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root value={selectedTab} onValueChange={setSelectedTab}>
        <Tabs.List className="flex gap-1.5 sm:gap-2 overflow-x-auto bg-[#111] p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border border-white/5 mb-4 sm:mb-6 no-scrollbar">
          {[
            { id: 'sales', label: `${t('reports.tabs.sales')} & ${t('reports.tabs.purchases')}`, icon: TrendingUp },
            { id: 'financial', label: t('reports.tabs.financial'), icon: DollarSign },
            { id: 'stock', label: t('reports.tabs.stock'), icon: Package },
            { id: 'personel', label: t('reports.tabs.personnel'), icon: UserCheck },
            { id: 'security', label: 'Güvenlik', icon: Shield },
            { id: 'kar', label: 'Kâr Analizi', icon: Target },
          ].map(tab => (
            <Tabs.Trigger key={tab.id} value={tab.id} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-bold transition-all whitespace-nowrap text-xs sm:text-sm active:scale-95 ${selectedTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ═══════════════════════════════════ SATIŞ & ALIŞ ═══════════════════════════════════ */}
        <Tabs.Content value="sales">
          <div className="space-y-4 sm:space-y-6">
            {/* Satış Özet Şeridi */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t('reports.totalSales'), value: `₺${totalSales.toLocaleString('tr-TR')}`, color: '#3b82f6' },
                { label: t('reports.totalTransactions'), value: `${filteredSales.length} Kalem`, color: '#8b5cf6' },
                { label: t('reports.avgTransactionAmount'), value: `₺${filteredSales.length > 0 ? Math.round(totalSales / filteredSales.length).toLocaleString('tr-TR') : '0'}`, color: '#06b6d4' },
                { label: t('reports.return'), value: `₺${Math.abs(filteredSales.filter(s => s.amount < 0).reduce((s, i) => s + i.amount, 0)).toLocaleString('tr-TR')}`, color: '#ef4444' },
              ].map((s, i) => (
                <div key={i} className="p-3 rounded-xl bg-black/30 border border-white/5">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{s.label}</p>
                  <p className="text-lg font-black text-white mt-1">{s.value}</p>
                  <div className="mt-2 h-1 rounded-full bg-white/5"><div className="h-full rounded-full" style={{ width: '100%', background: s.color, opacity: 0.6 }} /></div>
                </div>
              ))}
            </div>

            {/* Satış Tablosu */}
            <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-400" /> {t('reports.salesTransactions')}</h2>
                <PdfButton onClick={() => { generateSalesPDF(salesData, dateRange.start, dateRange.end, currentEmployee?.name || 'Admin'); logActivity('report_export', 'Satış raporu PDF indirildi', { employeeName: user?.name, page: 'Raporlar', description: `${salesData.length} satış kaydı PDF olarak indirildi.` }); toast.success('PDF indirildi.'); }} />
              </div>
              {salesCategories.length > 1 && <div className="mb-4"><CategoryFilter categories={salesCategories} selected={salesCategoryFilter} onChange={setSalesCategoryFilter} /></div>}
              <DynamicTable
                data={filteredSales}
                columns={[
                  { key: 'date', label: t('reports.date'), render: i => <span className="font-mono text-xs text-gray-400">{i.date}</span> },
                  { key: 'customer', label: t('reports.customer'), render: i => <div><p className="font-bold text-sm">{i.customer}</p></div> },
                  { key: 'product', label: t('reports.product'), render: i => (
                    <div>
                      <p className={`text-sm ${i.amount < 0 ? 'text-red-300' : 'text-gray-200'}`}>{i.product}</p>
                      <p className="text-[10px] text-gray-600">{i.category}</p>
                    </div>
                  )},
                  { key: 'quantity', label: t('reports.quantity'), align: 'center', render: i => (
                    <span className="px-2 py-0.5 bg-white/5 rounded-md text-xs font-mono text-gray-300">{i.quantity} {i.unit}</span>
                  )},
                  { key: 'amount', label: t('reports.amount'), align: 'right', render: i => (
                    <div className="flex flex-col items-end gap-1">
                      <span className={`font-black text-sm ${i.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {i.amount < 0 ? '-' : ''}₺{Math.abs(i.amount).toLocaleString('tr-TR')}
                      </span>
                      <div className="w-20"><InlineBar value={Math.abs(i.amount)} max={maxSaleAmount} color={i.amount < 0 ? '#ef4444' : '#10b981'} /></div>
                    </div>
                  )},
                  { key: 'status', label: t('reports.status'), align: 'center', render: i => (
                    i.amount < 0
                      ? <StatusBadge status="danger" label="İADE" />
                      : <StatusBadge status="success" label="SATIŞ" />
                  )},
                ]}
                pageSize={12}
                searchPlaceholder="Ürün, müşteri veya tarih ara..."
                emptyMessage="Seçili dönemde satış verisi bulunamadı."
                accentColor="#3b82f6"
                expandable
                renderExpanded={(item: any) => (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div><p className="text-gray-500 mb-1">Müşteri</p><p className="font-bold text-white">{item.customer}</p></div>
                    <div><p className="text-gray-500 mb-1">Kategori</p><p className="font-bold text-gray-300">{item.category}</p></div>
                    <div><p className="text-gray-500 mb-1">Birim Fiyat</p><p className="font-bold text-blue-400">₺{item.quantity > 0 ? (Math.abs(item.amount) / item.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '0'}</p></div>
                    <div><p className="text-gray-500 mb-1">Satış Tarihi</p><p className="font-bold text-gray-300">{item.date}</p></div>
                  </div>
                )}
                footer={filteredSales.length > 0 ? (
                  <tr className="border-t-2 border-blue-500/30 bg-blue-500/5">
                    <td className="py-3 px-4" />{/* expand */}
                    <td className="py-3 px-4 text-xs font-bold text-blue-400 uppercase">Toplam</td>
                    <td className="py-3 px-4 text-xs text-gray-400">{filteredSales.length} kalem</td>
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 text-right text-xs text-gray-400">{filteredSales.reduce((s, i) => s + i.quantity, 0).toLocaleString('tr-TR')}</td>
                    <td className="py-3 px-4 text-right font-black text-sm text-blue-400">₺{filteredSales.reduce((s, i) => s + i.amount, 0).toLocaleString('tr-TR')}</td>
                    <td className="py-3 px-4" />
                  </tr>
                ) : undefined}
              />
            </div>

            {/* Alış Tablosu */}
            <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-orange-400" /> {t('reports.purchaseTransactions')}</h2>
                <PdfButton onClick={() => { generatePurchasePDF(purchaseData, dateRange.start, dateRange.end, currentEmployee?.name || 'Admin'); logActivity('report_export', 'Alış raporu PDF indirildi', { employeeName: user?.name, page: 'Raporlar' }); toast.success('PDF indirildi.'); }} />
              </div>
              {purchaseCategories.length > 1 && <div className="mb-4"><CategoryFilter categories={purchaseCategories} selected={purchaseCategoryFilter} onChange={setPurchaseCategoryFilter} /></div>}
              <DynamicTable
                data={filteredPurchases}
                columns={[
                  { key: 'date', label: t('reports.date'), render: i => <span className="font-mono text-xs text-gray-400">{i.date}</span> },
                  { key: 'supplier', label: t('reports.supplier'), render: i => <p className="font-bold text-sm">{i.supplier}</p> },
                  { key: 'product', label: t('reports.product'), render: i => (
                    <div><p className="text-sm text-gray-200">{i.product}</p><p className="text-[10px] text-gray-600">{i.category}</p></div>
                  )},
                  { key: 'quantity', label: t('reports.quantity'), align: 'center', render: i => (
                    <span className="px-2 py-0.5 bg-white/5 rounded-md text-xs font-mono text-gray-300">{i.quantity} {i.unit}</span>
                  )},
                  { key: 'amount', label: t('reports.amount'), align: 'right', render: i => (
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-black text-sm text-orange-400">₺{Math.abs(i.amount).toLocaleString('tr-TR')}</span>
                      <div className="w-20"><InlineBar value={Math.abs(i.amount)} max={maxSaleAmount} color="#f59e0b" /></div>
                    </div>
                  )},
                ]}
                pageSize={10}
                searchPlaceholder="Alış ara..."
                emptyMessage="Seçili dönemde alış verisi yok."
                accentColor="#f59e0b"
                expandable
                renderExpanded={(item: any) => (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div><p className="text-gray-500 mb-1">Tedarikçi</p><p className="font-bold text-white">{item.supplier}</p></div>
                    <div><p className="text-gray-500 mb-1">Kategori</p><p className="font-bold text-gray-300">{item.category}</p></div>
                    <div><p className="text-gray-500 mb-1">Birim Maliyet</p><p className="font-bold text-orange-400">₺{item.quantity > 0 ? (Math.abs(item.amount) / item.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '0'}</p></div>
                    <div><p className="text-gray-500 mb-1">Alış Tarihi</p><p className="font-bold text-gray-300">{item.date}</p></div>
                  </div>
                )}
                footer={filteredPurchases.length > 0 ? (
                  <tr className="border-t-2 border-orange-500/30 bg-orange-500/5">
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 text-xs font-bold text-orange-400 uppercase">Toplam</td>
                    <td className="py-3 px-4 text-xs text-gray-400">{filteredPurchases.length} kalem</td>
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 text-right text-xs text-gray-400">{filteredPurchases.reduce((s, i) => s + i.quantity, 0).toLocaleString('tr-TR')}</td>
                    <td className="py-3 px-4 text-right font-black text-sm text-orange-400">₺{filteredPurchases.reduce((s, i) => s + i.amount, 0).toLocaleString('tr-TR')}</td>
                  </tr>
                ) : undefined}
              />
            </div>
          </div>
        </Tabs.Content>

        {/* ═══════════════════════════════════ FİNANS ═══════════════════════════════════ */}
        <Tabs.Content value="financial">
          <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500/10 text-blue-400"><DollarSign className="w-4 h-4 sm:w-5 sm:h-5"/></div>
                <div><h2 className="font-bold text-base sm:text-lg">{t('reports.financialSummary')}</h2><p className="text-[10px] sm:text-xs text-gray-500">{t('reports.financialSubtitle')}</p></div>
              </div>
              <PdfButton onClick={() => { generateFinancialPDF(incomeData, expenseData, dateRange.start, dateRange.end, currentEmployee?.name || 'Admin'); logActivity('report_export', 'Finans raporu PDF indirildi', { employeeName: user?.name, page: 'Raporlar' }); toast.success('PDF indirildi.'); }} />
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {financialComparisonData.map((item, i) => (
                <div key={i} className="text-center">
                  <MiniDonut value={item.value} max={Math.max(totalIncome, totalExpense) || 1} size={64} strokeWidth={6} color={item.color} label={`${item.value > 0 ? Math.round((item.value / (Math.max(totalIncome, totalExpense) || 1)) * 100) : 0}%`} />
                  <p className="text-xs text-gray-400 mt-2">{item.name}</p>
                  <p className="text-sm font-bold text-white">₺{item.value.toLocaleString('tr-TR')}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: netProfit >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${netProfit >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
              <div className={`p-2 rounded-lg ${netProfit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {netProfit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-xs text-gray-400">{t('reports.periodResult')}</p>
                <p className={`text-lg font-black ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {netProfit >= 0 ? '+' : '-'}₺{Math.abs(netProfit).toLocaleString('tr-TR')} {netProfit >= 0 ? t('reports.profit') : t('reports.loss')}
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
              <div className="flex justify-between items-center mb-3"><h2 className="text-lg sm:text-xl font-bold text-emerald-400 flex items-center gap-2"><ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5"/> {t('reports.incomes')}</h2></div>
              {incomeCategories.length > 1 && <div className="mb-3"><CategoryFilter categories={incomeCategories} selected={incomeCategoryFilter} onChange={setIncomeCategoryFilter} /></div>}
              <DynamicTable data={filteredIncome} columns={[
                { key: 'date', label: t('reports.date'), render: i => <span className="font-mono text-xs text-gray-400">{i.date}</span> },
                { key: 'category', label: t('reports.category'), render: i => <StatusBadge status="success" label={i.category} /> },
                { key: 'description', label: t('reports.description'), render: i => <span className="font-medium text-sm">{i.description}</span> },
                { key: 'amount', label: t('reports.amount'), align: 'right', render: i => <span className="font-black text-emerald-400">+₺{i.amount.toLocaleString('tr-TR')}</span> },
              ]} pageSize={10} searchable searchPlaceholder="Gelir ara..." emptyMessage="Gelir kaydı yok." accentColor="#10b981"
                footer={filteredIncome.length > 0 ? (
                  <tr className="border-t-2 border-emerald-500/30 bg-emerald-500/5">
                    <td className="py-3 px-4 text-xs font-bold text-emerald-400 uppercase">Toplam</td>
                    <td className="py-3 px-4 text-xs text-gray-400">{filteredIncome.length} kayıt</td>
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 text-right font-black text-sm text-emerald-400">+₺{filteredIncome.reduce((s, i) => s + i.amount, 0).toLocaleString('tr-TR')}</td>
                  </tr>
                ) : undefined}
              />
            </div>
            <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
              <div className="flex justify-between items-center mb-3"><h2 className="text-lg sm:text-xl font-bold text-red-400 flex items-center gap-2"><ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5"/> {t('reports.expenses')}</h2></div>
              {expenseCategories.length > 1 && <div className="mb-3"><CategoryFilter categories={expenseCategories} selected={expenseCategoryFilter} onChange={setExpenseCategoryFilter} /></div>}
              <DynamicTable data={filteredExpense} columns={[
                { key: 'date', label: t('reports.date'), render: i => <span className="font-mono text-xs text-gray-400">{i.date}</span> },
                { key: 'category', label: t('reports.category'), render: i => <StatusBadge status="danger" label={i.category} /> },
                { key: 'description', label: t('reports.description'), render: i => <span className="font-medium text-sm">{i.description}</span> },
                { key: 'amount', label: t('reports.amount'), align: 'right', render: i => <span className="font-black text-red-400">-₺{i.amount.toLocaleString('tr-TR')}</span> },
              ]} pageSize={10} searchable searchPlaceholder="Gider ara..." emptyMessage="Gider kaydı yok." accentColor="#ef4444"
                footer={filteredExpense.length > 0 ? (
                  <tr className="border-t-2 border-red-500/30 bg-red-500/5">
                    <td className="py-3 px-4 text-xs font-bold text-red-400 uppercase">Toplam</td>
                    <td className="py-3 px-4 text-xs text-gray-400">{filteredExpense.length} kayıt</td>
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 text-right font-black text-sm text-red-400">-₺{filteredExpense.reduce((s, i) => s + i.amount, 0).toLocaleString('tr-TR')}</td>
                  </tr>
                ) : undefined}
              />
            </div>
          </div>
        </Tabs.Content>

        {/* ═══════════════════════════════════ STOK ═══════════════════════════════════ */}
        <Tabs.Content value="stock">
          <div className="space-y-4 sm:space-y-6">
            {/* Stok Özet Şeridi */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t('reports.totalProducts'), value: `${stockData.length} Çeşit`, color: '#8b5cf6' },
                { label: t('reports.stockValue'), value: `₺${totalStockValue.toLocaleString('tr-TR')}`, color: '#3b82f6' },
                { label: t('reports.criticalStock'), value: `${stockData.filter(s => s.stock <= s.minStock).length} Ürün`, color: '#ef4444' },
                { label: t('reports.normalStock'), value: `${stockData.filter(s => s.stock > s.minStock).length} Ürün`, color: '#10b981' },
              ].map((s, i) => (
                <div key={i} className="p-3 rounded-xl bg-black/30 border border-white/5">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{s.label}</p>
                  <p className="text-lg font-black text-white mt-1">{s.value}</p>
                  <div className="mt-2 h-1 rounded-full bg-white/5"><div className="h-full rounded-full" style={{ width: '100%', background: s.color, opacity: 0.6 }} /></div>
                </div>
              ))}
            </div>

            <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2"><Package className="w-5 h-5 text-purple-400" /> Stok Durum Raporu</h2>
                <PdfButton onClick={() => { generateStockPDF(stockData, currentEmployee?.name || 'Admin'); logActivity('report_export', 'Stok raporu PDF indirildi', { employeeName: user?.name, page: 'Raporlar', description: `${stockData.length} stok kaydı PDF olarak indirildi.` }); toast.success('PDF indirildi.'); }} />
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {stockCategories.length > 1 && <CategoryFilter categories={stockCategories} selected={stockCategoryFilter} onChange={setStockCategoryFilter} />}
                <div className="flex gap-1.5">
                  {(['all', 'critical', 'ok'] as const).map(s => (
                    <button key={s} onClick={() => setStockStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${stockStatusFilter === s ? (s === 'critical' ? 'bg-red-600 text-white' : s === 'ok' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white') : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                      {s === 'all' ? t('reports.all') : s === 'critical' ? `${t('reports.critical')} (${stockData.filter(x => x.stock <= x.minStock).length})` : `${t('reports.normal')} (${stockData.filter(x => x.stock > x.minStock).length})`}
                    </button>
                  ))}
                </div>
              </div>
              <DynamicTable
                data={filteredStock}
                columns={[
                  { key: 'name', label: t('reports.product'), render: i => (
                    <div><p className="font-bold text-sm">{i.name}</p><p className="text-[10px] text-gray-600">{i.category}</p></div>
                  )},
                  { key: 'stock', label: t('reports.stockLevel'), align: 'center', render: i => {
                    const ratio = i.minStock > 0 ? i.stock / i.minStock : (i.stock > 0 ? 3 : 0);
                    const isCritical = i.stock <= i.minStock;
                    return (
                      <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-black text-sm ${isCritical ? 'text-red-400' : 'text-emerald-400'}`}>{i.stock}</span>
                          <span className="text-gray-600 text-[10px]">/ {i.minStock} {i.unit}</span>
                        </div>
                        <div className="w-full"><InlineBar value={Math.max(i.stock, 0)} max={Math.max(i.minStock * 3, i.stock, 1)} color={isCritical ? '#ef4444' : ratio > 2 ? '#10b981' : '#f59e0b'} /></div>
                      </div>
                    );
                  }},
                  { key: 'status', label: t('reports.status'), align: 'center', render: i => (
                    i.stock <= 0 ? <StatusBadge status="danger" label={t('reports.depleted')} />
                    : i.stock <= i.minStock ? <StatusBadge status="warning" label={t('reports.critical')} />
                    : <StatusBadge status="success" label={t('reports.sufficient')} />
                  )},
                  { key: 'buyPrice', label: t('reports.buyPrice'), align: 'right', render: i => <span className="text-xs text-gray-400">₺{i.buyPrice.toLocaleString('tr-TR')}</span> },
                  { key: 'price', label: t('reports.sellPrice'), align: 'right', render: i => <span className="text-xs font-bold text-gray-300">₺{i.price.toLocaleString('tr-TR')}</span> },
                  { key: 'margin', label: t('reports.profitMargin'), align: 'center', render: i => {
                    const m = i.price > 0 && i.buyPrice > 0 ? ((i.price - i.buyPrice) / i.price * 100) : 0;
                    return <span className={`text-xs font-bold ${m > 30 ? 'text-emerald-400' : m > 15 ? 'text-amber-400' : 'text-red-400'}`}>{m > 0 ? `%${m.toFixed(0)}` : '-'}</span>;
                  }},
                  { key: 'value', label: t('reports.stockValue'), align: 'right', render: i => (
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-black text-sm text-blue-400">₺{(i.stock * i.price).toLocaleString('tr-TR')}</span>
                      <div className="w-16"><InlineBar value={i.stock * i.price} max={maxStockValue} color="#3b82f6" /></div>
                    </div>
                  )},
                ]}
                pageSize={12}
                searchPlaceholder="Ürün adı veya kategori ara..."
                emptyMessage="Stok verisi bulunamadı."
                accentColor="#8b5cf6"
                expandable
                renderExpanded={(item: any) => {
                  const recentMoves = (item.movements || []).slice(-5);
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                        <div><p className="text-gray-500 mb-1">Kategori</p><p className="font-bold text-white">{item.category}</p></div>
                        <div><p className="text-gray-500 mb-1">Mevcut Stok</p><p className="font-bold text-emerald-400">{item.stock} {item.unit}</p></div>
                        <div><p className="text-gray-500 mb-1">Min. Stok</p><p className="font-bold text-amber-400">{item.minStock} {item.unit}</p></div>
                        <div><p className="text-gray-500 mb-1">Alış Fiyatı</p><p className="font-bold text-gray-300">₺{item.buyPrice.toLocaleString('tr-TR')}</p></div>
                        <div><p className="text-gray-500 mb-1">Satış Fiyatı</p><p className="font-bold text-blue-400">₺{item.price.toLocaleString('tr-TR')}</p></div>
                      </div>
                      {recentMoves.length > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Son Hareketler</p>
                          <div className="space-y-1">
                            {recentMoves.map((m: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white/[0.02]">
                                <span className="text-gray-500">{m.date ? new Date(m.date).toLocaleDateString('tr-TR') : '-'}</span>
                                <span className={m.type === 'ALIS' ? 'text-orange-400' : 'text-emerald-400'}>{m.type === 'ALIS' ? 'Alış' : 'Satış'}</span>
                                <span className="text-gray-400">{m.quantity} {item.unit}</span>
                                <span className="font-bold text-gray-300">₺{(m.totalAmount || 0).toLocaleString('tr-TR')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
                footer={filteredStock.length > 0 ? (
                  <tr className="border-t-2 border-purple-500/30 bg-purple-500/5">
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 text-xs font-bold text-purple-400 uppercase">Toplam {filteredStock.length} Ürün</td>
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 text-right font-black text-sm text-blue-400">₺{filteredStock.reduce((s, i) => s + (i.stock * i.price), 0).toLocaleString('tr-TR')}</td>
                  </tr>
                ) : undefined}
              />
            </div>
          </div>
        </Tabs.Content>

        {/* ═══════════════════════════════════ PERSONEL ═══════════════════════════════════ */}
        <Tabs.Content value="personel">
          <div className="space-y-4 sm:space-y-6">
            {/* Personel Özet */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t('reports.totalPersonnel'), value: `${personelPerformansData.length}`, color: '#06b6d4' },
                { label: t('reports.totalSales'), value: `₺${personelPerformansData.reduce((s: number, p: any) => s + p.salesTotal, 0).toLocaleString('tr-TR')}`, color: '#10b981' },
                { label: t('reports.totalReturns'), value: `₺${personelPerformansData.reduce((s: number, p: any) => s + p.returnTotal, 0).toLocaleString('tr-TR')}`, color: '#f59e0b' },
                { label: t('reports.avgPerformance'), value: `₺${personelPerformansData.length > 0 ? Math.round(personelPerformansData.reduce((s: number, p: any) => s + p.netSales, 0) / personelPerformansData.length).toLocaleString('tr-TR') : '0'}`, color: '#3b82f6' },
              ].map((s, i) => (
                <div key={i} className="p-3 rounded-xl bg-black/30 border border-white/5">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{s.label}</p>
                  <p className="text-lg font-black text-white mt-1">{s.value}</p>
                  <div className="mt-2 h-1 rounded-full bg-white/5"><div className="h-full rounded-full" style={{ width: '100%', background: s.color, opacity: 0.6 }} /></div>
                </div>
              ))}
            </div>

            <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2"><UserCheck className="w-5 h-5 text-cyan-400" /> {t('reports.personnelPerformance')}</h2>
                <PdfButton onClick={() => {
                  const pdfData: PersonelPerformansPDFData = {
                    dateRange: `${dateRange.start} - ${dateRange.end}`,
                    personnel: personelPerformansData.map((p: any) => ({
                      name: p.name, role: p.role || '-', satisCount: p.fisCount, satisTutar: p.salesTotal,
                      iadeCount: 0, iadeTutar: p.returnTotal, alisCount: 0, alisTutar: p.purchaseTotal,
                      giderCount: 0, giderTutar: 0, musteriCount: p.customerCount,
                    })),
                  };
                  generatePersonelPerformansPDF(pdfData);
                  logActivity('report_export', 'Personel performans PDF indirildi', { employeeName: user?.name, page: 'Raporlar' });
                  toast.success('PDF indirildi.');
                }} />
              </div>
              <DynamicTable
                data={personelPerformansData}
                columns={[
                  { key: 'rank', label: '#', align: 'center', render: (i: any, idx: number) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    return <span className="text-sm font-bold">{idx < 3 ? medals[idx] : `#${idx + 1}`}</span>;
                  }},
                  { key: 'name', label: t('reports.personnel'), render: (i: any) => (
                    <div><p className="font-bold text-sm">{i.name}</p><p className="text-[10px] text-gray-600">{i.role !== '-' ? i.role : `${i.customerCount} müşteri`}</p></div>
                  )},
                  { key: 'fisCount', label: t('reports.transactions'), align: 'center', render: (i: any) => (
                    <span className="px-2.5 py-1 bg-white/5 rounded-lg text-xs font-mono font-bold">{i.fisCount}</span>
                  )},
                  { key: 'salesTotal', label: t('reports.grossSales'), align: 'right', render: (i: any) => (
                    <span className="text-emerald-400 font-bold text-sm">₺{i.salesTotal.toLocaleString('tr-TR')}</span>
                  )},
                  { key: 'returnTotal', label: t('reports.return'), align: 'right', render: (i: any) => (
                    <span className="text-orange-400 text-xs">-₺{i.returnTotal.toLocaleString('tr-TR')}</span>
                  )},
                  { key: 'netSales', label: t('reports.netPerformance'), align: 'right', render: (i: any) => (
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-black text-sm text-blue-400">₺{i.netSales.toLocaleString('tr-TR')}</span>
                      <div className="w-20"><InlineBar value={Math.max(i.netSales, 0)} max={maxPersonelSales} color="#3b82f6" /></div>
                    </div>
                  )},
                  { key: 'share', label: t('reports.share'), align: 'center', render: (i: any) => {
                    const totalNet = personelPerformansData.reduce((s: number, p: any) => s + p.netSales, 0);
                    const pct = totalNet > 0 ? (i.netSales / totalNet * 100) : 0;
                    return <span className="text-xs font-bold text-purple-400">%{pct.toFixed(1)}</span>;
                  }},
                ]}
                pageSize={10}
                searchPlaceholder="Personel ara..."
                emptyMessage="Seçili dönemde personel verisi yok."
                accentColor="#06b6d4"
                expandable
                renderExpanded={(item: any) => (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                    <div><p className="text-gray-500 mb-1">Toplam Fiş</p><p className="font-bold text-white">{item.fisCount}</p></div>
                    <div><p className="text-gray-500 mb-1">Brüt Satış</p><p className="font-bold text-emerald-400">₺{item.salesTotal.toLocaleString('tr-TR')}</p></div>
                    <div><p className="text-gray-500 mb-1">İadeler</p><p className="font-bold text-orange-400">₺{item.returnTotal.toLocaleString('tr-TR')}</p></div>
                    <div><p className="text-gray-500 mb-1">Alışlar</p><p className="font-bold text-purple-400">₺{item.purchaseTotal.toLocaleString('tr-TR')}</p></div>
                    <div><p className="text-gray-500 mb-1">Benzersiz Müşteri</p><p className="font-bold text-cyan-400">{item.customerCount}</p></div>
                  </div>
                )}
                footer={personelPerformansData.length > 0 ? (
                  <tr className="border-t-2 border-cyan-500/30 bg-cyan-500/5">
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 text-xs font-bold text-cyan-400 uppercase">Toplam</td>
                    <td className="py-3 px-4 text-center text-xs text-gray-400">{personelPerformansData.reduce((s: number, p: any) => s + p.fisCount, 0)}</td>
                    <td className="py-3 px-4 text-right text-xs text-emerald-400 font-bold">₺{personelPerformansData.reduce((s: number, p: any) => s + p.salesTotal, 0).toLocaleString('tr-TR')}</td>
                    <td className="py-3 px-4 text-right text-xs text-orange-400">-₺{personelPerformansData.reduce((s: number, p: any) => s + p.returnTotal, 0).toLocaleString('tr-TR')}</td>
                    <td className="py-3 px-4 text-right font-black text-sm text-blue-400">₺{personelPerformansData.reduce((s: number, p: any) => s + p.netSales, 0).toLocaleString('tr-TR')}</td>
                    <td className="py-3 px-4" />
                  </tr>
                ) : undefined}
              />
            </div>
          </div>
        </Tabs.Content>

        {/* ═══════════════════════════════════ GÜVENLİK ═══════════════════════════════════ */}
        <Tabs.Content value="security">
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t('reports.totalLogs'), value: `${securityLogs.length}`, color: '#3b82f6', icon: Activity },
                { label: t('reports.loginLogs'), value: `${securityLogs.filter(l => l.action.includes('login')).length}`, color: '#10b981', icon: LogIn },
                { label: t('reports.deletionLogs'), value: `${securityLogs.filter(l => l.action.includes('delete')).length}`, color: '#ef4444', icon: Trash2 },
                { label: t('reports.exportLogs'), value: `${securityLogs.filter(l => l.action.includes('export')).length}`, color: '#f59e0b', icon: Download },
              ].map((s, i) => (
                <div key={i} className="p-3 rounded-xl bg-black/30 border border-white/5 flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ background: `${s.color}15` }}>
                    <s.icon className="w-4 h-4" style={{ color: s.color }} />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">{s.label}</p>
                    <p className="text-lg font-black text-white">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400"><Shield className="w-5 h-5" /></div>
                <div><h2 className="font-bold text-lg">{t('reports.securityTitle')}</h2><p className="text-[10px] text-gray-500">{t('reports.securitySubtitle')}</p></div>
              </div>
              <DynamicTable
                data={securityLogs}
                columns={[
                  { key: 'time', label: t('reports.time'), render: i => <span className="font-mono text-[10px] text-gray-500">{i.time}</span> },
                  { key: 'user', label: t('reports.user'), render: i => <span className="font-bold text-sm">{i.user}</span> },
                  { key: 'action', label: t('reports.transactions'), render: i => (
                    <StatusBadge
                      status={i.level as any}
                      label={i.action.replace(/_/g, ' ').toUpperCase().slice(0, 20)}
                    />
                  )},
                  { key: 'detail', label: t('reports.detail'), render: i => <span className="text-xs text-gray-400 line-clamp-1 max-w-[200px]">{i.detail}</span> },
                  { key: 'page', label: t('reports.page'), align: 'center', render: i => (
                    <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] text-gray-400">{i.page}</span>
                  )},
                ]}
                pageSize={15}
                searchPlaceholder="Log ara..."
                emptyMessage="Seçili dönemde güvenlik logu bulunamadı."
                accentColor="#ef4444"
              />
            </div>
          </div>
        </Tabs.Content>

        {/* ═══════════════════════════════════════════════════ KÂR ANALİZİ ═══════════════════════════════════════════════════ */}
        <Tabs.Content value="kar">
          {(() => {
            // Her ürün için ağırlıklı ortalama alış fiyatı hesapla
            const karData = rawStok.map((product: any) => {
              const movements: any[] = product.movements || [];
              // Alış hareketlerini filtrele
              const alisMov = movements.filter((m: any) =>
                ['ALIS', 'FATURA_ALIS', 'URETIM_GIRIS', 'alis'].includes(m.type)
              );
              const totalQtyAlis = alisMov.reduce((s: number, m: any) => s + Math.abs(m.quantity || 0), 0);
              const totalCostAlis = alisMov.reduce((s: number, m: any) => s + Math.abs((m.price || 0) * (m.quantity || 0)), 0);
              const avgBuyPrice = totalQtyAlis > 0 ? totalCostAlis / totalQtyAlis : 0;

              const sellPrice = product.sellPrice || 0;
              const margin = sellPrice > 0 && avgBuyPrice > 0 ? ((sellPrice - avgBuyPrice) / sellPrice) * 100 : null;
              const profitPerUnit = sellPrice - avgBuyPrice;

              // Satış hareketleri
              const satisMov = movements.filter((m: any) => ['SATIS', 'satis'].includes(m.type));
              const totalQtySold = satisMov.reduce((s: number, m: any) => s + Math.abs(m.quantity || 0), 0);
              const totalProfit = totalQtySold * profitPerUnit;

              return {
                id: product.id,
                name: product.name || 'Bilinmiyor',
                category: product.category || '-',
                unit: product.unit || 'KG',
                sellPrice,
                avgBuyPrice,
                margin,
                profitPerUnit,
                totalQtySold,
                totalProfit,
                currentStock: product.currentStock || 0,
              };
            }).filter((p: any) => p.sellPrice > 0 || p.avgBuyPrice > 0);

            const sorted = [...karData].sort((a: any, b: any) => (b.totalProfit || 0) - (a.totalProfit || 0));
            const totalEstProfit = karData.reduce((s: any, p: any) => s + (p.totalProfit || 0), 0);
            const avgMargin = karData.filter((p: any) => p.margin !== null).length > 0
              ? karData.filter((p: any) => p.margin !== null).reduce((s: any, p: any) => s + p.margin, 0) / karData.filter((p: any) => p.margin !== null).length
              : 0;

            return (
              <div className="space-y-4 sm:space-y-6">
                {/* Özet kartlar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: t('reports.estimatedTotalProfit'), value: `₺${totalEstProfit.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`, color: '#10b981' },
                    { label: t('reports.avgProfitMargin'), value: `%${avgMargin.toFixed(1)}`, color: '#3b82f6' },
                    { label: t('reports.analyzedProducts'), value: `${karData.length}`, color: '#8b5cf6' },
                    { label: t('reports.unprofitableProducts'), value: `${karData.filter((p: any) => p.margin !== null && p.margin <= 0).length}`, color: '#ef4444' },
                  ].map((s, i) => (
                    <div key={i} className="p-3 rounded-xl bg-black/30 border border-white/5">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{s.label}</p>
                      <p className="text-lg font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#111] border border-white/5">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10"><Target className="w-5 h-5 text-emerald-400" /></div>
                    <div>
                      <h2 className="font-bold text-lg">{t('reports.productProfitMargin')}</h2>
                      <p className="text-[10px] text-gray-500">{t('reports.productProfitSubtitle')}</p>
                    </div>
                  </div>

                  {sorted.length === 0 ? (
                    <div className="py-12 text-center">
                      <Target className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">{t('reports.profitAnalysisEmpty')}</p>
                      <p className="text-xs text-gray-600 mt-1">{t('reports.profitAnalysisEmptyDesc')}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/5">
                            {[t('reports.product'), t('reports.category'), t('reports.avgBuyPrice'), t('reports.sellPrice'), t('reports.unitProfit'), t('reports.marginPct'), t('reports.soldQty'), t('reports.estimatedProfit')].map(h => (
                              <th key={h} className="text-left py-2 px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {sorted.map((p: any, i: number) => {
                            const hasMargin = p.margin !== null;
                            const good = hasMargin && p.margin >= 15;
                            const warn = hasMargin && p.margin >= 0 && p.margin < 15;
                            const bad = hasMargin && p.margin < 0;
                            return (
                              <tr key={p.id} className="hover:bg-white/3 transition-colors">
                                <td className="py-2.5 px-3">
                                  <p className="font-bold text-white text-sm">{p.name}</p>
                                  <p className="text-[10px] text-gray-600">{p.unit}</p>
                                </td>
                                <td className="py-2.5 px-3 text-xs text-gray-400">{p.category}</td>
                                <td className="py-2.5 px-3 text-xs font-mono text-amber-400">
                                  {p.avgBuyPrice > 0 ? `₺${p.avgBuyPrice.toFixed(2)}` : <span className="text-gray-600">—</span>}
                                </td>
                                <td className="py-2.5 px-3 text-xs font-mono text-white">
                                  {p.sellPrice > 0 ? `₺${p.sellPrice.toFixed(2)}` : <span className="text-gray-600">—</span>}
                                </td>
                                <td className="py-2.5 px-3 text-xs font-mono font-bold">
                                  {p.avgBuyPrice > 0 && p.sellPrice > 0
                                    ? <span className={p.profitPerUnit >= 0 ? 'text-emerald-400' : 'text-red-400'}>₺{p.profitPerUnit.toFixed(2)}</span>
                                    : <span className="text-gray-600">—</span>}
                                </td>
                                <td className="py-2.5 px-3">
                                  {hasMargin ? (
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-black tabular-nums ${good ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-red-400'}`}>
                                        %{p.margin.toFixed(1)}
                                      </span>
                                      <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${good ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-red-500'}`}
                                          style={{ width: `${Math.min(Math.max(p.margin, 0), 100)}%` }} />
                                      </div>
                                    </div>
                                  ) : <span className="text-[10px] text-gray-600">Alış yok</span>}
                                </td>
                                <td className="py-2.5 px-3 text-xs font-mono text-gray-300">
                                  {p.totalQtySold > 0 ? `${p.totalQtySold.toFixed(1)} ${p.unit}` : <span className="text-gray-600">0</span>}
                                </td>
                                <td className="py-2.5 px-3 text-xs font-black tabular-nums">
                                  {p.totalProfit !== 0
                                    ? <span className={p.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>₺{Math.abs(p.totalProfit).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                                    : <span className="text-gray-600">—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p className="text-[10px] text-gray-600 mt-4 pl-1">
                    * Kâr hesabı: ağırlıklı ortalama alış fiyatı (ALIS hareketlerinden) vs. güncel satış fiyatı karşılaştırmasıdır.
                    Tahmini kâr = birim kâr × toplam satılan miktar. Gerçek kâr faturalar ve KDV dahil hesaplama gerektirir.
                  </p>
                </div>
              </div>
            );
          })()}
        </Tabs.Content>

      </Tabs.Root>
    </div>
  );
}