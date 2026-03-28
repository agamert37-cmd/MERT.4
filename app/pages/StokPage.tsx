// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Search, AlertCircle, CheckCircle, TrendingUp, Package, ChevronDown,
  ChevronRight, X, ArrowDownRight, ArrowUpRight, RefreshCcw, Tag, Edit,
  Trash2, AlertTriangle, Factory, Link2, Settings, BarChart3, Bell,
  FolderOpen, ArrowUpDown, Eye, Download, Filter, Layers, ShoppingCart,
  Minus, MoreVertical, Warehouse, Scale, Clock, Flame, History, PieChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { staggerContainer, staggerItem, hover, tap, rowItem } from '../utils/animations';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import { SyncStatusBar, SyncBadge } from '../components/SyncStatusBar';
import { useTableSync } from '../hooks/useTableSync';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { logActivity } from '../utils/activityLogger';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { useModuleProtocol } from '../hooks/useModuleProtocol';
import { cariToDb, cariFromDb } from './CariPage';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { PremiumTooltip, GlowBar, EmptyChartState } from '../components/ChartComponents';
import { kvGet, kvSet } from '../lib/pouchdb-kv';

export type MovementType = 'ALIS' | 'SATIS' | 'MUSTERI_IADE' | 'TOPTANCI_IADE' | 'FIRE' | 'URETIM_CIKIS' | 'URETIM_GIRIS' | 'FATURA_ALIS' | 'FATURA_SATIS' | 'FATURA_IPTAL';
export type ProductCategory = string;

export interface StockMovement {
  id: string;
  type: MovementType;
  partyName: string;
  date: string;
  quantity: number;
  price: number;
  totalAmount: number;
  description?: string;
  // KDV bilgileri
  kdvRate?: number;
  kdvAmount?: number;
  grossAmount?: number;
  faturaId?: string;
  faturaNo?: string;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  unit: 'KG' | 'Adet' | 'Koli';
  currentStock: number;
  minStock: number;
  sellPrice: number;
  movements: StockMovement[];
}

export function productToDb(p: Product) {
  return {
    id: p.id,
    name: p.name,
    unit: p.unit,
    sell_price: p.sellPrice,
    current_stock: p.currentStock,
    min_stock: p.minStock,
    supplier_entries: JSON.stringify({ category: p.category, movements: p.movements }),
  };
}

export function productFromDb(row: any): Product {
  let parsed = { category: 'Diger' as ProductCategory, movements: [] as StockMovement[] };
  try {
    if (typeof row.supplier_entries === 'string') {
      const data = JSON.parse(row.supplier_entries);
      if (Array.isArray(data)) {
        parsed.movements = data.map((entry: any) => ({
          id: entry.id || crypto.randomUUID(),
          type: 'ALIS',
          partyName: entry.supplierName || 'Bilinmeyen Toptanci',
          date: entry.date || new Date().toISOString(),
          quantity: entry.quantity || 0,
          price: entry.buyPrice || 0,
          totalAmount: entry.totalAmount || 0,
          description: 'Eski sistemden aktarildi'
        }));
      } else {
        parsed.category = data.category || 'Diger';
        parsed.movements = data.movements || [];
      }
    } else if (Array.isArray(row.supplier_entries)) {
       parsed.movements = row.supplier_entries.map((entry: any) => ({
          id: entry.id || crypto.randomUUID(),
          type: 'ALIS',
          partyName: entry.supplierName || 'Bilinmeyen Toptanci',
          date: entry.date || new Date().toISOString(),
          quantity: entry.quantity || 0,
          price: entry.buyPrice || 0,
          totalAmount: entry.totalAmount || 0,
        }));
    }
  } catch {}

  let normalizedUnit: 'KG' | 'Adet' | 'Koli' = 'KG';
  const rawUnit = (row.unit || 'KG').toString().trim().toLowerCase();
  if (rawUnit === 'adet' || rawUnit === 'ad' || rawUnit === 'adt' || rawUnit === 'pcs' || rawUnit === 'piece') {
    normalizedUnit = 'Adet';
  } else if (rawUnit === 'koli' || rawUnit === 'kutu' || rawUnit === 'box' || rawUnit === 'paket') {
    normalizedUnit = 'Koli';
  } else {
    normalizedUnit = 'KG';
  }

  return {
    id: row.id,
    name: row.name || '',
    category: parsed.category,
    unit: normalizedUnit,
    sellPrice: row.sell_price ?? 0,
    currentStock: row.current_stock ?? 0,
    minStock: row.min_stock ?? 0,
    movements: parsed.movements,
  };
}

const DEFAULT_CATEGORIES: string[] = ['Dana', 'Kuzu', 'Sakatat', 'Tavuk', 'Islenmiş Et', 'Fatura Stoku', 'Diger'];

type TabKey = 'urunler' | 'uyarilar' | 'kategoriler' | 'ozet';
type SortKey = 'name' | 'stock' | 'cost' | 'category';
type SortDir = 'asc' | 'desc';

// ─── Custom Select ────────────────────────────────────────
function CustomSelect({ value, onChange, options, placeholder, name }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; name?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const s = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(s));
  }, [options, search]);

  const selectedLabel = options.find(o => o.value === value)?.label || value || placeholder || 'Seciniz';

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchRef.current && options.length > 5) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen, options.length]);

  return (
    <div className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className={`w-full p-3 bg-secondary/60 border rounded-xl text-white outline-none text-left flex items-center justify-between gap-2 transition-all text-sm ${isOpen ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-border hover:border-blue-500/30'}`}
      >
        <span className={value ? 'text-white' : 'text-gray-500'}>{selectedLabel}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[200] left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl shadow-black/80 overflow-hidden"
            style={{ maxHeight: 'min(280px, 50vh)' }}
          >
            {options.length > 5 && (
              <div className="p-2 border-b border-white/5">
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Ara..."
                  className="w-full px-3 py-2 bg-secondary/60 border border-border rounded-lg text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                />
              </div>
            )}
            <div className="overflow-y-auto" style={{ maxHeight: options.length > 5 ? 'min(220px, 40vh)' : 'min(280px, 50vh)' }}>
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500 text-center">Sonuc bulunamadi</div>
              ) : (
                filtered.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(''); }}
                    className={`w-full text-left px-4 py-3 text-sm transition-all flex items-center justify-between ${
                      opt.value === value ? 'bg-blue-500/15 text-blue-400 font-bold' : 'text-white hover:bg-white/5'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {opt.value === value && <CheckCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Glassmorphism Card ────────────────────────────────────
function GlassCard({ children, className = '', hover = false, ...props }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={`rounded-2xl lg:rounded-3xl card-premium ${hover ? 'hover:border-blue-500/30 transition-all duration-300' : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}

// ─── Movement Type Badge ────────────────────────────────────
function MovementBadge({ type }: { type: MovementType }) {
  const config: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    'ALIS': { label: 'Alis', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: <ArrowDownRight className="w-3 h-3" /> },
    'SATIS': { label: 'Satis', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20', icon: <ArrowUpRight className="w-3 h-3" /> },
    'MUSTERI_IADE': { label: 'M. Iade', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20', icon: <ArrowDownRight className="w-3 h-3" /> },
    'TOPTANCI_IADE': { label: 'T. Iade', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20', icon: <ArrowUpRight className="w-3 h-3" /> },
    'FIRE': { label: 'Fire', cls: 'bg-red-500/15 text-red-400 border-red-500/20', icon: <Flame className="w-3 h-3" /> },
    'URETIM_CIKIS': { label: 'Ur. Cikis', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20', icon: <ArrowUpRight className="w-3 h-3" /> },
    'URETIM_GIRIS': { label: 'Ur. Giris', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20', icon: <ArrowDownRight className="w-3 h-3" /> },
    'FATURA_ALIS': { label: 'Fat. Alış', cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20', icon: <ArrowDownRight className="w-3 h-3" /> },
    'FATURA_SATIS': { label: 'Fat. Satış', cls: 'bg-teal-500/15 text-teal-400 border-teal-500/20', icon: <ArrowUpRight className="w-3 h-3" /> },
    'FATURA_IPTAL': { label: 'Fat. İptal', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/20', icon: <AlertTriangle className="w-3 h-3" /> },
  };
  const c = config[type] || { label: type, cls: 'bg-gray-500/15 text-gray-400 border-gray-500/20', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

// ─── Stock Status Indicator ─────────────────────────────────
function StockStatus({ current, min }: { current: number; min: number }) {
  if (current < 0) return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold animate-pulse border border-red-500/20"><AlertTriangle className="w-3 h-3" />EKSI</span>;
  if (current <= min) return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-lg text-[10px] font-bold border border-orange-500/20"><AlertCircle className="w-3 h-3" />KRITIK</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-lg text-[10px] font-bold border border-emerald-500/20"><CheckCircle className="w-3 h-3" />NORMAL</span>;
}

export function StokPage() {
  // ─── Module Protocol (standart baslangic) ─────────────────────────────
  const mp = useModuleProtocol({
    moduleName: 'stok',
    requiredPermissions: ['stok_view'],
    logOnMount: true,
  });

  const { t } = useLanguage();
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { emit, on, onPrefix } = useModuleBus();

  const { canAdd, canDelete, canEdit, canView } = getPagePermissions(user, currentEmployee, 'stok');
  const sec = usePageSecurity('stok');

  const { data: products, addItem, deleteItem, updateItem, refresh: refreshProducts, syncState, lastSync, batchUpdate } = useTableSync<Product>({
    tableName: 'urunler',
    storageKey: 'stok_data',
    initialData: [],
    orderBy: 'created_at',
    orderAsc: false,
    toDb: productToDb,
    fromDb: productFromDb,
  });

  const { data: cariList, updateItem: updateCari } = useTableSync<any>({
    tableName: 'cari_hesaplar',
    storageKey: StorageKey.CARI_DATA,
    toDb: cariToDb,
    fromDb: cariFromDb,
  });

  const safeCariList = useMemo(() => (cariList || []).filter((c: any) => c.companyName), [cariList]);

  // ─── Cross-Module Event Listeners ─────────────────────────────────────
  useEffect(() => {
    // Uretim tamamlandiginda stok verilerini yenile
    const unsub1 = on('uretim:completed', (payload) => {
      console.log('[StokPage] Uretim tamamlandi, stok yenileniyor:', payload.productName);
      refreshProducts();
    });

    // Fis olusturuldiginda stok verilerini yenile
    const unsub2 = on('fis:created', () => {
      console.log('[StokPage] Yeni fis olusturuldu, stok yenileniyor');
      refreshProducts();
    });

    // Sistem verisi yenilendiginde stok yenile
    const unsub3 = on('system:data_refreshed', () => {
      refreshProducts();
    });

    // Backup restore sonrasi yenile
    const unsub4 = on('system:backup_restored', () => {
      console.log('[StokPage] Backup restore algılandi, stok yenileniyor');
      refreshProducts();
    });

    // Fatura eklendi/iptal edildi — stok etkisi olabilir
    const unsub5 = on('fatura:added', (payload) => {
      console.log('[StokPage] Fatura eklendi, stok yenileniyor:', payload.faturaId);
      refreshProducts();
    });
    const unsub6 = on('fatura:cancelled', (payload) => {
      console.log('[StokPage] Fatura iptal edildi, stok geri alınıyor:', payload.faturaId);
      refreshProducts();
    });

    const unsub7 = on('stok:updated', (payload) => {
      console.log('[StokPage] Stok güncellendi (kaynak:', payload.source ?? payload.productName, ')');
      refreshProducts();
    });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); };
  }, [on, refreshProducts]);

  const findCariByName = (partyName: string) => {
    if (!partyName) return null;
    const lower = partyName.toLowerCase().trim();
    return safeCariList.find((c: any) => c.companyName?.toLowerCase().trim() === lower) || null;
  };

  const getCariBalanceEffect = (type: MovementType, totalAmount: number) => {
    switch (type) {
      case 'ALIS': return { delta: -totalAmount, txType: 'debit', category: 'Stok Alis' };
      case 'SATIS': return { delta: totalAmount, txType: 'debit', category: 'Stok Satis' };
      case 'MUSTERI_IADE': return { delta: -totalAmount, txType: 'credit', category: 'Musteri Iade' };
      case 'TOPTANCI_IADE': return { delta: totalAmount, txType: 'credit', category: 'Toptanci Iade' };
      case 'FATURA_ALIS': return { delta: -totalAmount, txType: 'debit', category: 'Fatura Alis' };
      case 'FATURA_SATIS': return { delta: totalAmount, txType: 'debit', category: 'Fatura Satis' };
      case 'FATURA_IPTAL': return null; // İptal işlemi stok düzeltme, cari etki yok
      default: return null;
    }
  };

  const updateCariForMovement = (partyName: string, movement: StockMovement, productName: string, reverse = false) => {
    const cari = findCariByName(partyName);
    if (!cari) return;
    const effect = getCariBalanceEffect(movement.type, movement.totalAmount);
    if (!effect) return;
    const delta = reverse ? -effect.delta : effect.delta;
    const txType = reverse ? (effect.txType === 'debit' ? 'credit' : 'debit') : effect.txType as 'debit' | 'credit';
    const newTransaction = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      description: reverse
        ? `[IPTAL] ${productName} — ${movement.quantity} stok hareketi iptal edildi`
        : `${productName} — ${movement.quantity} x ₺${movement.price.toFixed(2)}`,
      amount: Math.abs(movement.totalAmount),
      type: txType,
      category: effect.category,
    };
    const existingHistory = Array.isArray(cari.transactionHistory) ? cari.transactionHistory : [];
    updateCari(cari.id, {
      ...cari,
      balance: (cari.balance || 0) + delta,
      transactions: (cari.transactions || 0) + 1,
      transactionHistory: [newTransaction, ...existingHistory],
    });
    const directionIcon = delta > 0 ? '📈' : '📉';
    toast.info(`${directionIcon} ${cari.companyName}: ${delta > 0 ? '+' : ''}₺${delta.toFixed(2)} Cari Bakiye Guncellendi`, { duration: 4000 });
  };

  const safeProducts = useMemo(() =>
    (products || []).filter(p => (p.name || '').trim().length > 0).map(p => ({
      ...p,
      movements: Array.isArray(p.movements) ? p.movements : [],
      category: p.category || 'Diger' as ProductCategory,
      unit: p.unit || 'KG' as const,
      currentStock: p.currentStock ?? 0,
      minStock: p.minStock ?? 0,
    })), [products]);

  // ─── Stock Alert System (after safeProducts is defined) ──────────────
  const prevAlertRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!safeProducts.length) return;
    const newAlerts = new Set<string>();
    safeProducts.forEach(p => {
      if (p.currentStock < 0) {
        const key = `neg_${p.id}`;
        newAlerts.add(key);
        if (!prevAlertRef.current.has(key)) {
          emit('stok:stock_alert', {
            productId: p.id, productName: p.name,
            currentStock: p.currentStock, minStock: p.minStock,
            alertType: 'negative',
          });
        }
      } else if (p.currentStock <= p.minStock && p.minStock > 0) {
        const key = `crit_${p.id}`;
        newAlerts.add(key);
        if (!prevAlertRef.current.has(key)) {
          emit('stok:stock_alert', {
            productId: p.id, productName: p.name,
            currentStock: p.currentStock, minStock: p.minStock,
            alertType: 'critical',
          });
        }
      }
    });
    prevAlertRef.current = newAlerts;
  }, [safeProducts, emit]);

  const [categories, setCategories] = useState<string[]>(() => {
    const saved = getFromStorage<string[]>(StorageKey.STOK_CATEGORIES);
    return saved && saved.length > 0 ? saved : DEFAULT_CATEGORIES;
  });

  // BUG FIX [AJAN-2]: localStorage boşsa KV store'dan kategorileri yükle (mobil ilk açılış)
  useEffect(() => {
    const saved = getFromStorage<string[]>(StorageKey.STOK_CATEGORIES);
    if (!saved || saved.length === 0) {
      kvGet<string[]>('stok_categories').then(remote => {
        if (remote && remote.length > 0) {
          setCategories(remote);
          setInStorage(StorageKey.STOK_CATEGORIES, remote);
        }
      }).catch(() => {});
    }
  }, []);

  // UI State
  const [activeTab, setActiveTab] = useState<TabKey>('urunler');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('Tumu');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddMovementModalOpen, setIsAddMovementModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  // Movement form state
  const [partySearch, setPartySearch] = useState('');
  const [showCariSuggestions, setShowCariSuggestions] = useState(false);
  const [selectedCariId, setSelectedCariId] = useState<string | null>(null);
  const [movementTypeForFilter, setMovementTypeForFilter] = useState<string>('ALIS');

  // Form state for custom selects
  const [addFormCategory, setAddFormCategory] = useState<string>(categories[0] || 'Dana');
  const [addFormUnit, setAddFormUnit] = useState<string>('KG');
  const [editFormCategory, setEditFormCategory] = useState<string>('');
  const [editFormUnit, setEditFormUnit] = useState<string>('');

  // Category management
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCatIdx, setEditingCatIdx] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  const partyInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const getExpectedCariType = (mType: string): string | null => {
    if (mType === 'ALIS' || mType === 'TOPTANCI_IADE' || mType === 'FATURA_ALIS') return 'Toptanci';
    if (mType === 'SATIS' || mType === 'MUSTERI_IADE' || mType === 'FATURA_SATIS') return 'Musteri';
    return null;
  };

  const filteredCariSuggestions = useMemo(() => {
    const expectedType = getExpectedCariType(movementTypeForFilter);
    return safeCariList.filter((c: any) => {
      if (expectedType && c.type !== expectedType) return false;
      if (!partySearch.trim()) return true;
      return c.companyName?.toLowerCase().includes(partySearch.toLowerCase());
    }).slice(0, 8);
  }, [safeCariList, partySearch, movementTypeForFilter]);

  // Sorting & filtering
  const filteredProducts = useMemo(() => {
    let list = safeProducts.filter(p => {
      const matchSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = selectedCategoryFilter === 'Tumu' || p.category === selectedCategoryFilter;
      return matchSearch && matchCat;
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name, 'tr'); break;
        case 'stock': cmp = a.currentStock - b.currentStock; break;
        case 'cost': cmp = calculateWeightedAverage(a) - calculateWeightedAverage(b); break;
        case 'category': cmp = a.category.localeCompare(b.category, 'tr'); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [safeProducts, searchTerm, selectedCategoryFilter, sortKey, sortDir]);

  const calculateWeightedAverage = (product: Product): number => {
    const additions = product.movements.filter(m => ['ALIS', 'URETIM_GIRIS', 'FATURA_ALIS'].includes(m.type));
    if (additions.length === 0) return 0;
    const totalQty = additions.reduce((sum, e) => sum + e.quantity, 0);
    const totalCost = additions.reduce((sum, e) => sum + e.totalAmount, 0);
    return totalQty > 0 ? totalCost / totalQty : 0;
  };

  // KDV dahil maliyet hesabı
  const calculateWeightedAverageWithKdv = (product: Product): number => {
    const additions = product.movements.filter(m => ['ALIS', 'URETIM_GIRIS', 'FATURA_ALIS'].includes(m.type));
    if (additions.length === 0) return 0;
    const totalQty = additions.reduce((sum, e) => sum + e.quantity, 0);
    const totalGross = additions.reduce((sum, e) => sum + (e.grossAmount || e.totalAmount), 0);
    return totalQty > 0 ? totalGross / totalQty : 0;
  };

  const calculateAverageSellPrice = (product: Product): number => {
    const sales = product.movements.filter(m => m.type === 'SATIS');
    if (sales.length === 0) return 0;
    const totalQty = sales.reduce((sum, e) => sum + e.quantity, 0);
    const totalRev = sales.reduce((sum, e) => sum + e.totalAmount, 0);
    return totalQty > 0 ? totalRev / totalQty : 0;
  };

  const formatAmount = (val: number) => `₺${(val || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatStock = (val: number, unit: string) => {
    if (unit === 'KG') return val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return val.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };
  const getUnitLabel = (unit: string) => {
    switch (unit) { case 'KG': return 'KG'; case 'Adet': return 'Adet'; case 'Koli': return 'Koli'; default: return unit; }
  };
  const formatDate = (dStr: string) => {
    if (!dStr) return '-';
    return new Date(dStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ─── Handlers ───────────────────────────────────────────
  const handleAddProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canAdd) { sec.logUnauthorized('stok_add', 'Kullanici urun eklemeye calisti ancak yetkisi yoktu.'); return; }
    const fd = new FormData(e.currentTarget);
    const name = fd.get('name') as string;
    if (!sec.preCheck('add', { name })) return;
    const newProduct: Product = {
      id: crypto.randomUUID(),
      name: sec.sanitize(name),
      category: addFormCategory as ProductCategory,
      unit: addFormUnit as 'KG' | 'Adet' | 'Koli',
      currentStock: 0,
      minStock: Number(fd.get('minStock')),
      sellPrice: 0,
      movements: [],
    };
    addItem(newProduct);
    emit('stok:added', { productId: newProduct.id, productName: newProduct.name, quantity: 0 });
    sec.auditLog('stok_add', newProduct.id, newProduct.name);
    logActivity('employee_update', 'Yeni Urun Eklendi', { employeeName: user?.name, page: 'Stok', description: `${newProduct.name} urunu stoga eklendi.` });
    toast.success('Urun tanimlandi');
    setIsAddModalOpen(false);
    setAddFormCategory(categories[0] || 'Dana');
    setAddFormUnit('KG');
  };

  const handleEditProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) { sec.logUnauthorized('stok_edit', `Kullanici ${selectedProduct?.name} urunu duzenlemeye calisti.`); return; }
    if (!selectedProduct) return;
    const fd = new FormData(e.currentTarget);
    const productName = fd.get('name') as string;
    if (!sec.preCheck('edit', { name: productName })) return;
    updateItem(selectedProduct.id, {
      ...selectedProduct,
      name: sec.sanitize(productName),
      category: (editFormCategory || selectedProduct.category) as ProductCategory,
      unit: (editFormUnit || selectedProduct.unit) as 'KG' | 'Adet' | 'Koli',
      minStock: Number(fd.get('minStock')),
    });
    emit('stok:updated', { productId: selectedProduct.id, productName, changes: { name: productName } });
    sec.auditLog('stok_edit', selectedProduct.id, productName);
    logActivity('employee_update', 'Urun Guncellendi', { employeeName: user?.name, page: 'Stok', description: `${productName} urunu guncellendi.` });
    toast.success('Urun guncellendi');
    setIsEditModalOpen(false);
  };

  const handleDeleteProduct = (productId: string, productName: string) => {
    if (!canDelete) { sec.logUnauthorized('stok_delete', `Kullanici ${productName} urunu silmeye calisti.`); return; }
    if (!sec.checkRate('delete')) return;
    if (confirm(`"${productName}" urununu silmek istediginize emin misiniz?`)) {
      deleteItem(productId);
      emit('stok:deleted', { productId, productName });
      sec.auditLog('stok_delete', productId, productName);
      logActivity('employee_update', 'Urun Silindi', { employeeName: user?.name, page: 'Stok', description: `${productName} urunu sistemden silindi.` });
      toast.success('Urun silindi');
    }
  };

  const handleAddMovement = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const fd = new FormData(e.currentTarget);
    const type = fd.get('type') as MovementType;
    const partyName = (fd.get('partyName') as string || partySearch).trim();
    const qty = Number(fd.get('quantity'));
    const price = Number(fd.get('price'));
    const desc = (fd.get('description') as string) || '';
    if (!partyName) { toast.error('Ilgili kisi/firma secilmeli!'); return; }
    if (!sec.preCheck('add', { partyName, description: desc })) return;
    const newMv: StockMovement = {
      id: crypto.randomUUID(), type, partyName: sec.sanitize(partyName),
      date: new Date().toISOString(), quantity: qty, price, totalAmount: qty * price,
      description: sec.sanitize(desc)
    };
    let sc = 0;
    if (['ALIS', 'MUSTERI_IADE', 'URETIM_GIRIS', 'FATURA_ALIS'].includes(type)) sc = qty;
    if (['SATIS', 'TOPTANCI_IADE', 'FIRE', 'URETIM_CIKIS', 'FATURA_SATIS'].includes(type)) sc = -qty;
    updateItem(selectedProduct.id, {
      ...selectedProduct,
      currentStock: selectedProduct.currentStock + sc,
      movements: [newMv, ...selectedProduct.movements]
    });
    const mc = findCariByName(partyName);
    if (mc && ['ALIS', 'SATIS', 'MUSTERI_IADE', 'TOPTANCI_IADE', 'FATURA_ALIS', 'FATURA_SATIS'].includes(type)) {
      updateCariForMovement(partyName, newMv, selectedProduct.name);
    }
    emit('stok:movement', { productId: selectedProduct.id, productName: selectedProduct.name, type, quantity: qty, partyName: sec.sanitize(partyName) });
    toast.success('Hareket kaydedildi');
    setIsAddMovementModalOpen(false);
    setPartySearch('');
    setSelectedCariId(null);
  };

  // ─── Stats ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const critical = safeProducts.filter(p => p.currentStock >= 0 && p.currentStock <= p.minStock);
    const negative = safeProducts.filter(p => p.currentStock < 0);
    const totalValue = safeProducts.reduce((sum, p) => p.currentStock > 0 ? sum + (calculateWeightedAverage(p) * p.currentStock) : sum, 0);
    const totalMovements = safeProducts.reduce((sum, p) => sum + p.movements.length, 0);
    const categoryBreakdown = safeProducts.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const recentMovements = safeProducts
      .flatMap(p => p.movements.map(m => ({ ...m, productName: p.name, productUnit: p.unit })))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    // KDV özet verileri
    const allMovements = safeProducts.flatMap(p => p.movements);
    const kdvSummary = {
      alisKdv: allMovements.filter(m => ['ALIS', 'FATURA_ALIS'].includes(m.type)).reduce((s, m) => s + (m.kdvAmount || 0), 0),
      satisKdv: allMovements.filter(m => ['SATIS', 'FATURA_SATIS'].includes(m.type)).reduce((s, m) => s + (m.kdvAmount || 0), 0),
      faturaMovements: allMovements.filter(m => m.type.startsWith('FATURA_')).length,
    };
    // Fatura Stoku kategorisi
    const faturaStokuCount = safeProducts.filter(p => p.category === 'Fatura Stoku').length;

    return { total: safeProducts.length, critical, negative, totalValue, totalMovements, categoryBreakdown, recentMovements, kdvSummary, faturaStokuCount };
  }, [safeProducts]);

  // ─── Category Mgmt ─────────────────────────────────────
  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (categories.includes(name)) { toast.error('Bu kategori zaten mevcut'); return; }
    const updated = [...categories, name];
    setCategories(updated);
    setInStorage(StorageKey.STOK_CATEGORIES, updated);
    kvSet('stok_categories', updated).catch(e => console.error('[Stok] kategori kv sync:', e));
    setNewCategoryName('');
    emit('stok:category_changed', { action: 'add', categoryName: name });
    logActivity('employee_update', 'Kategori Eklendi', { employeeName: user?.name, page: 'Stok', description: `"${name}" kategorisi eklendi.` });
    sec.auditLog('stok_category_add', name, name);
    toast.success(`"${name}" kategorisi eklendi`);
  };

  const handleEditCategory = (idx: number) => {
    const name = editingCatName.trim();
    if (!name) return;
    if (categories.includes(name)) { toast.error('Bu kategori zaten mevcut'); return; }
    if (!sec.preCheck('edit', { name })) return;
    const oldName = categories[idx];
    const updated = [...categories];
    updated[idx] = name;
    setCategories(updated);
    setInStorage(StorageKey.STOK_CATEGORIES, updated);
    kvSet('stok_categories', updated).catch(e => console.error('[Stok] kategori kv sync:', e));
    // Update products with batch
    const affectedProducts = safeProducts.filter(p => p.category === oldName);
    if (affectedProducts.length > 0) {
      const batchUpdates = affectedProducts.map(p => ({
        id: p.id,
        changes: { ...p, category: name } as Partial<Product>,
      }));
      batchUpdate(batchUpdates);
    }
    setEditingCatIdx(null);
    setEditingCatName('');
    emit('stok:category_changed', { action: 'edit', categoryName: name, oldName });
    logActivity('employee_update', 'Kategori Guncellendi', { employeeName: user?.name, page: 'Stok', description: `Kategori "${oldName}" → "${name}"` });
    sec.auditLog('stok_category_edit', oldName, name);
    toast.success(`Kategori "${oldName}" → "${name}" olarak guncellendi`);
  };

  const handleDeleteCategory = (idx: number) => {
    if (!canDelete) { sec.logUnauthorized('stok_category_delete', 'Kategori silme yetkisi yok'); return; }
    if (!sec.checkRate('delete')) return;
    const name = categories[idx];
    const productsInCat = safeProducts.filter(p => p.category === name).length;
    if (productsInCat > 0) {
      toast.error(`"${name}" kategorisinde ${productsInCat} urun var. Once urunleri tasiyiniz.`);
      return;
    }
    const updated = categories.filter((_, i) => i !== idx);
    setCategories(updated);
    setInStorage(StorageKey.STOK_CATEGORIES, updated);
    kvSet('stok_categories', updated).catch(e => console.error('[Stok] kategori kv sync:', e));
    emit('stok:category_changed', { action: 'delete', categoryName: name });
    logActivity('employee_update', 'Kategori Silindi', { employeeName: user?.name, page: 'Stok', description: `"${name}" kategorisi silindi.` });
    sec.auditLog('stok_category_delete', name, name);
    toast.success(`"${name}" kategorisi silindi`);
  };

  // Tabs
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'urunler', label: 'Urunler', icon: <Package className="w-4 h-4" />, badge: stats.total },
    { key: 'uyarilar', label: 'Uyarilar', icon: <Bell className="w-4 h-4" />, badge: stats.critical.length + stats.negative.length },
    { key: 'kategoriler', label: 'Kategoriler', icon: <FolderOpen className="w-4 h-4" />, badge: categories.length },
    { key: 'ozet', label: 'Ozet & Rapor', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-28 sm:pb-6">
      <SyncStatusBar tableName="urunler" />

      {/* Module Health Banner */}
      {mp.health.status === 'error' && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <div className="flex-1">
            <span className="text-red-400 font-bold">Modul Saglik Hatasi: </span>
            <span className="text-red-300">{mp.health.issues.join(', ')}</span>
          </div>
        </div>
      )}
      {mp.health.status === 'degraded' && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1">
            <span className="text-amber-400 font-bold">Uyari: </span>
            <span className="text-amber-300">{mp.health.issues.join(', ')}</span>
          </div>
        </div>
      )}

      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-600/20 glow-blue">
              <Warehouse className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Depo & Stok</h1>
              <p className="text-xs sm:text-sm text-gray-500">Urun tanimlari, maliyet analizi ve depo hareketleri</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <SyncBadge tableName="urunler" />
          <button
            onClick={() => { refreshProducts(); toast.success('Stok verileri yenileniyor...'); }}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/[0.06]"
            title="Verileri Yenile"
          >
            <RefreshCcw className={`w-4 h-4 ${syncState === 'loading' ? 'animate-spin' : ''}`} />
          </button>
          {lastSync && (
            <span className="hidden lg:block text-[10px] text-gray-600 font-mono">
              Son: {new Date(lastSync).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {canAdd && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm transition-all shadow-lg shadow-blue-600/25"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" /> <span className="hidden sm:inline">Yeni Urun</span><span className="sm:hidden">Ekle</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* ─── Bento Stats ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Toplam Urun', value: stats.total, icon: Package, gradient: 'from-blue-500/10 via-[#111] to-[#111]', border: 'border-blue-500/20 hover:border-blue-500/40', iconBg: 'bg-blue-500/20', text: 'text-blue-400', glow: 'bg-blue-500/10', shadow: 'shadow-blue-500/10' },
          { label: 'Kritik Stok', value: stats.critical.length, icon: AlertCircle, gradient: 'from-amber-500/10 via-[#111] to-[#111]', border: 'border-amber-500/20 hover:border-amber-500/40', iconBg: 'bg-amber-500/20', text: 'text-amber-400', glow: 'bg-amber-500/10', shadow: 'shadow-amber-500/10' },
          { label: 'Eksi Stok', value: stats.negative.length, icon: AlertTriangle, gradient: 'from-red-500/15 via-[#111] to-[#111]', border: 'border-red-500/20 hover:border-red-500/40', iconBg: 'bg-red-500/20', text: 'text-red-400', glow: 'bg-red-500/10', shadow: 'shadow-red-500/10' },
          { label: 'Depo Degeri', value: formatAmount(stats.totalValue), icon: TrendingUp, gradient: 'from-emerald-500/10 via-[#111] to-[#111]', border: 'border-emerald-500/20 hover:border-emerald-500/40', iconBg: 'bg-emerald-500/20', text: 'text-emerald-400', glow: 'bg-emerald-500/10', shadow: 'shadow-emerald-500/10' },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`relative p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl bg-gradient-to-br ${s.gradient} border ${s.border} overflow-hidden group transition-all`}
          >
            <div className={`absolute -top-8 -right-8 w-28 h-28 ${s.glow} rounded-full blur-2xl group-hover:opacity-100 opacity-70 transition-all pointer-events-none`} />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className={`p-2 sm:p-2.5 rounded-xl ${s.iconBg} ${s.text} shadow-lg ${s.shadow}`}>
                  <s.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
              <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{s.label}</p>
              <p className={`text-xl sm:text-2xl lg:text-3xl font-black text-white tabular-nums`}>{s.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 p-1 rounded-2xl glass border border-white/[0.08] overflow-x-auto scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white/10 text-white shadow-lg'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                activeTab === tab.key ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-600'
              }`}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════ TAB: Urunler ═══════════════ */}
      {activeTab === 'urunler' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Filter Bar */}
          <GlassCard className="p-3 sm:p-4 flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="Urun adi ara..."
                className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm text-white placeholder-gray-600 focus:border-blue-500/50 transition-all outline-none"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <select
                value={selectedCategoryFilter} onChange={e => setSelectedCategoryFilter(e.target.value)}
                className="px-3 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm text-white focus:border-blue-500/50 transition-all outline-none"
              >
                <option value="Tumu">Tum Kategoriler</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex bg-secondary/50 rounded-xl border border-border overflow-hidden">
                {([['name', 'Ad'], ['stock', 'Stok'], ['cost', 'Maliyet']] as [SortKey, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => toggleSort(key)}
                    className={`px-3 py-2 text-[10px] sm:text-xs font-bold transition-all ${sortKey === key ? 'bg-blue-500/15 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    {label} {sortKey === key && (sortDir === 'asc' ? '↑' : '↓')}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Product Count */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-gray-500">{filteredProducts.length} urun listeleniyor</span>
          </div>

          {/* Products */}
          <motion.div
            className="space-y-3"
            variants={staggerContainer(0.04, 0.02)}
            initial="initial"
            animate="animate"
          >
            <AnimatePresence>
              {filteredProducts.map((product, idx) => {
                const isExp = expandedProducts.has(product.id);
                const isNeg = product.currentStock < 0;
                const isCrit = product.currentStock >= 0 && product.currentStock <= product.minStock;
                const avgCost = calculateWeightedAverage(product);
                const avgSell = calculateAverageSellPrice(product);
                const profitMargin = avgSell > 0 && avgCost > 0 ? ((avgSell - avgCost) / avgCost * 100) : 0;

                return (
                  <motion.div
                    key={product.id}
                    layout
                    variants={staggerItem}
                    exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.18 } }}
                    whileHover={{ y: -2, transition: { duration: 0.15 } }}
                    className={`rounded-2xl border transition-colors overflow-hidden backdrop-blur-xl ${
                      isNeg ? 'bg-gradient-to-br from-red-500/10 via-card to-card border-red-500/25 hover:border-red-500/40' : isCrit ? 'bg-gradient-to-br from-amber-500/8 via-card to-card border-amber-500/20 hover:border-amber-500/35' : 'card-premium hover:border-blue-500/30'
                    }`}
                  >
                    {/* Main Row */}
                    <div className="p-3 sm:p-5 flex flex-col lg:flex-row gap-3 sm:gap-5 items-start lg:items-center justify-between">
                      {/* Left Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                          onClick={() => { const ns = new Set(expandedProducts); if (ns.has(product.id)) ns.delete(product.id); else ns.add(product.id); setExpandedProducts(ns); }}
                          className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors shrink-0"
                        >
                          <motion.div animate={{ rotate: isExp ? 90 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          </motion.div>
                        </button>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-sm sm:text-base font-bold text-white truncate">{product.name}</h3>
                            <StockStatus current={product.currentStock} min={product.minStock} />
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 bg-white/5 border border-white/[0.06] rounded-lg text-[10px] text-gray-400 font-medium flex items-center gap-1"><Tag className="w-2.5 h-2.5" />{product.category}</span>
                            <span className="px-2 py-0.5 bg-white/5 border border-white/[0.06] rounded-lg text-[10px] text-gray-400 font-medium flex items-center gap-1"><Scale className="w-2.5 h-2.5" />{product.unit}</span>
                            <span className="px-2 py-0.5 bg-white/5 border border-white/[0.06] rounded-lg text-[10px] text-gray-400 font-medium flex items-center gap-1"><History className="w-2.5 h-2.5" />{product.movements.length} hareket</span>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 w-full lg:w-auto">
                        <div className="p-2.5 sm:p-3 rounded-xl bg-secondary/40 border border-border text-center">
                          <p className="text-[9px] font-bold text-gray-600 uppercase mb-0.5">Stok</p>
                          <p className={`text-base sm:text-lg font-black ${isNeg ? 'text-red-400' : isCrit ? 'text-orange-400' : 'text-emerald-400'}`}>
                            {formatStock(product.currentStock, product.unit)}
                          </p>
                          <p className="text-[9px] text-gray-600">{getUnitLabel(product.unit)}</p>
                        </div>
                        <div className="p-2.5 sm:p-3 rounded-xl bg-secondary/40 border border-border text-center">
                          <p className="text-[9px] font-bold text-gray-600 uppercase mb-0.5">Maliyet</p>
                          <p className="text-sm sm:text-base font-bold text-white">{avgCost > 0 ? formatAmount(avgCost) : '-'}</p>
                        </div>
                        <div className="p-2.5 sm:p-3 rounded-xl bg-secondary/40 border border-border text-center">
                          <p className="text-[9px] font-bold text-gray-600 uppercase mb-0.5">Satis</p>
                          <p className="text-sm sm:text-base font-bold text-blue-400">{avgSell > 0 ? formatAmount(avgSell) : '-'}</p>
                          {profitMargin > 0 && <p className="text-[9px] text-emerald-400 font-bold">+%{profitMargin.toFixed(0)}</p>}
                        </div>
                        <div className="col-span-3 sm:col-span-1 flex gap-1.5">
                          <button onClick={() => { setSelectedProduct(product); setIsAddMovementModalOpen(true); }} className="flex-1 sm:flex-initial px-3 py-2 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-bold text-[10px] sm:text-xs rounded-xl transition-colors border border-indigo-500/15 flex items-center justify-center gap-1">
                            <RefreshCcw className="w-3 h-3" /><span className="hidden sm:inline">Hareket</span>
                          </button>
                          {canEdit && (
                            <button onClick={() => { setSelectedProduct(product); setEditFormCategory(product.category); setEditFormUnit(product.unit); setIsEditModalOpen(true); }} className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl transition-colors"><Edit className="w-3.5 h-3.5" /></button>
                          )}
                          {canDelete && (
                            <button onClick={() => handleDeleteProduct(product.id, product.name)} className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded: Movements */}
                    <AnimatePresence>
                      {isExp && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border bg-secondary/30">
                          <div className="p-3 sm:p-5">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3" />Son Hareketler</h4>
                              <span className="text-[10px] text-gray-600">{product.movements.length} kayit</span>
                            </div>
                            {product.movements.length === 0 ? (
                              <p className="text-gray-600 text-sm py-4 text-center">Hareket bulunamadi.</p>
                            ) : (
                              <div className="space-y-1.5 max-h-[300px] overflow-y-auto scrollbar-hide">
                                {product.movements.slice(0, 15).map((m, i) => (
                                  <div key={m.id || i} className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors">
                                    <div className="flex items-center gap-2.5">
                                      <MovementBadge type={m.type} />
                                      <div>
                                        <p className="text-white font-semibold text-xs sm:text-sm">{m.partyName}</p>
                                        <p className="text-[10px] text-gray-600">{formatDate(m.date)}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-4 sm:gap-6 text-right flex-wrap">
                                      <div>
                                        <p className="text-[9px] text-gray-600 uppercase">Miktar</p>
                                        <p className={`text-xs font-bold ${['ALIS', 'MUSTERI_IADE', 'URETIM_GIRIS'].includes(m.type) ? 'text-emerald-400' : 'text-red-400'}`}>
                                          {['ALIS', 'MUSTERI_IADE', 'URETIM_GIRIS'].includes(m.type) ? '+' : '-'}{m.quantity} {product.unit}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[9px] text-gray-600 uppercase">B. Fiyat</p>
                                        <p className="text-xs font-bold text-white">{formatAmount(m.price)}</p>
                                      </div>
                                      <div>
                                        <p className="text-[9px] text-gray-600 uppercase">Toplam</p>
                                        <p className="text-xs font-bold text-white">{formatAmount(m.totalAmount)}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {filteredProducts.length === 0 && (
              <GlassCard className="p-12 text-center">
                <Package className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Urun bulunamadi</p>
                <p className="text-gray-600 text-sm mt-1">Arama kriterlerinizi degistirin veya yeni urun ekleyin</p>
              </GlassCard>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* ═══════════════ TAB: Uyarilar ═══════════════ */}
      {activeTab === 'uyarilar' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          {/* Critical Stock */}
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">Kritik Stok Uyarilari</h3>
                <p className="text-[10px] sm:text-xs text-gray-500">Minimum stok seviyesinin altina dusen urunler</p>
              </div>
              <span className="ml-auto px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-400 text-xs font-bold">{stats.critical.length}</span>
            </div>
            {stats.critical.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 text-emerald-500/30 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Tum urunler yeterli stok seviyesinde</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.critical.map((p, i) => (
                  <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className="flex items-center justify-between p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 hover:border-orange-500/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-orange-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <p className="text-[10px] text-gray-500">{p.category} · {p.unit}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-orange-400">{formatStock(p.currentStock, p.unit)} {p.unit}</p>
                      <p className="text-[10px] text-gray-600">Min: {formatStock(p.minStock, p.unit)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Negative Stock */}
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">Eksi Stok Uyarilari</h3>
                <p className="text-[10px] sm:text-xs text-gray-500">Stok miktari sifirin altinda olan urunler</p>
              </div>
              <span className="ml-auto px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 text-xs font-bold">{stats.negative.length}</span>
            </div>
            {stats.negative.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 text-emerald-500/30 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Eksi stoklu urun bulunmuyor</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.negative.map((p, i) => (
                  <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/10 hover:border-red-500/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center animate-pulse">
                        <Minus className="w-4 h-4 text-red-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <p className="text-[10px] text-gray-500">{p.category} · {p.unit}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-red-400">{formatStock(p.currentStock, p.unit)} {p.unit}</p>
                      <button
                        onClick={() => { setSelectedProduct(p); setMovementTypeForFilter('ALIS'); setIsAddMovementModalOpen(true); }}
                        className="mt-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/20 transition-colors"
                      >
                        + Stok Girisi Yap
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </GlassCard>
        </motion.div>
      )}

      {/* ═══════════════ TAB: Kategoriler ═══════════════ */}
      {activeTab === 'kategoriler' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          <GlassCard className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">Kategori Yonetimi</h3>
                <p className="text-[10px] sm:text-xs text-gray-500">Urun kategorilerini ekle, duzenle veya sil</p>
              </div>
            </div>

            {/* Add Category */}
            <div className="flex gap-2 mb-5">
              <input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="Yeni kategori adi..."
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                className="flex-1 px-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm text-white placeholder-gray-600 focus:border-purple-500/50 outline-none transition-all"
              />
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="px-4 py-2.5 bg-purple-600/80 hover:bg-purple-600 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-30"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Category List */}
            <div className="space-y-2">
              {categories.map((cat, idx) => {
                const count = safeProducts.filter(p => p.category === cat).length;
                const isEditing = editingCatIdx === idx;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/15 to-blue-500/15 flex items-center justify-center text-purple-400">
                      <Tag className="w-3.5 h-3.5" />
                    </div>
                    {isEditing ? (
                      <input
                        value={editingCatName}
                        onChange={e => setEditingCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleEditCategory(idx); if (e.key === 'Escape') setEditingCatIdx(null); }}
                        onBlur={() => handleEditCategory(idx)}
                        autoFocus
                        className="flex-1 px-3 py-1.5 bg-secondary/50 border border-purple-500/30 rounded-lg text-sm text-white outline-none"
                      />
                    ) : (
                      <span className="flex-1 text-sm font-semibold text-white">{cat}</span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-gray-500 font-bold">{count} urun</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingCatIdx(idx); setEditingCatName(cat); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                        <Edit className="w-3 h-3 text-gray-400" />
                      </button>
                      <button onClick={() => handleDeleteCategory(idx)} className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* ═══════════════ TAB: Ozet & Rapor ═══════════════ */}
      {activeTab === 'ozet' && (() => {
        const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

        const categoryPieData = (Object.entries(stats.categoryBreakdown) as [string, number][])
          .sort((a, b) => b[1] - a[1])
          .map(([name, value], i) => ({ name, value, fill: CHART_COLORS[i % CHART_COLORS.length] }));

        const topValueData = safeProducts
          .map(p => ({ name: p.name.length > 14 ? p.name.slice(0, 14) + '...' : p.name, fullName: p.name, value: p.currentStock > 0 ? Math.round(calculateWeightedAverage(p) * p.currentStock) : 0 }))
          .filter(p => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 8);

        const stockLevelData = safeProducts
          .filter(p => p.currentStock > 0 || p.currentStock < 0)
          .sort((a, b) => b.currentStock - a.currentStock)
          .slice(0, 10)
          .map(p => ({
            name: p.name.length > 12 ? p.name.slice(0, 12) + '...' : p.name,
            fullName: p.name,
            stok: p.currentStock,
            minStok: p.minStock,
          }));

        return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          {/* Row 1: Category Pie + Stock Value Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* Category Pie Chart */}
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
              className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl card-premium flex flex-col"
            >
              <div className="flex items-center gap-3 mb-4 sm:mb-6">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                  <PieChart className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base lg:text-lg font-bold text-white">Kategoriye Gore Dagilim</h2>
                  <p className="text-[10px] sm:text-xs text-gray-500">Urun sayilarinin kategori bazli analizi</p>
                </div>
              </div>
              {categoryPieData.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-4 flex-1">
                  <div className="w-full sm:w-1/2 h-[200px] sm:h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RePieChart>
                        <Pie
                          data={categoryPieData}
                          cx="50%" cy="50%"
                          innerRadius={50} outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="transparent"
                        >
                          {categoryPieData.map((entry, i) => (
                            <Cell key={`cell-${i}`} fill={entry.fill} style={{ filter: `drop-shadow(0 0 6px ${entry.fill}40)` }} />
                          ))}
                        </Pie>
                        <Tooltip content={<PremiumTooltip formatter={(v: number) => `${v} urun`} />} />
                      </RePieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1.5 w-full">
                    {categoryPieData.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill, boxShadow: `0 0 8px ${item.fill}40` }} />
                        <span className="text-[11px] text-gray-400 flex-1 truncate">{item.name}</span>
                        <span className="text-[11px] font-bold text-white tabular-nums">{item.value}</span>
                        <span className="text-[10px] text-gray-600 font-mono w-10 text-right">%{stats.total > 0 ? (item.value / stats.total * 100).toFixed(0) : 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyChartState message="Kategori verisi yok" />
              )}
            </motion.div>

            {/* Stock Value Bar Chart */}
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
              className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl card-premium flex flex-col"
            >
              <div className="flex items-center gap-3 mb-4 sm:mb-6">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base lg:text-lg font-bold text-white">Deger Bazli Siralama</h2>
                  <p className="text-[10px] sm:text-xs text-gray-500">Stok degerine gore en yuksek 8 urun</p>
                </div>
              </div>
              {topValueData.length > 0 ? (
                <div className="flex-1 h-[220px] sm:h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topValueData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} layout="vertical">
                      <defs>
                        <linearGradient id="gradStokVal" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.9}/>
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                      <XAxis type="number" stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => v === 0 ? '0' : `${(v/1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} width={90} />
                      <Tooltip content={<PremiumTooltip formatter={(v: number) => `${v.toLocaleString('tr-TR')} TL`} />} cursor={{ fill: '#ffffff08' }} />
                      <Bar dataKey="value" fill="url(#gradStokVal)" shape={<GlowBar />} barSize={14} radius={[0, 6, 6, 0]} name="Stok Degeri" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChartState message="Stok degeri verisi yok" />
              )}
            </motion.div>
          </div>

          {/* Row 2: Stock Levels Area Chart (full width) */}
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl card-premium flex flex-col"
          >
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base lg:text-lg font-bold text-white">Stok Seviyeleri</h2>
                <p className="text-[10px] sm:text-xs text-gray-500">Mevcut stok & minimum stok karsilastirmasi (ilk 10 urun)</p>
              </div>
            </div>
            {stockLevelData.length > 0 ? (
              <div className="h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stockLevelData} margin={{ top: 10, right: 5, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradStokCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9}/>
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4}/>
                      </linearGradient>
                      <linearGradient id="gradStokMin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.7}/>
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.2}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="name" stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#ffffff30" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip content={<PremiumTooltip />} cursor={{ fill: '#ffffff08' }} />
                    <Bar dataKey="stok" fill="url(#gradStokCurrent)" shape={<GlowBar />} name="Mevcut Stok" barSize={18} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="minStok" fill="url(#gradStokMin)" shape={<GlowBar />} name="Min. Stok" barSize={18} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChartState message="Stok seviyesi verisi yok" />
            )}
          </motion.div>

          {/* Row 3: KDV Özeti & Fatura Stoku */}
          {(stats.kdvSummary.alisKdv > 0 || stats.kdvSummary.satisKdv > 0 || stats.faturaStokuCount > 0) && (
            <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
            >
              <div className="p-4 sm:p-5 rounded-2xl card-premium">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
                    <ArrowDownRight className="w-4 h-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Alış KDV</p>
                    <p className="text-lg font-black text-orange-400">₺{stats.kdvSummary.alisKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600">Toptancı alışlarından ödenen KDV</p>
              </div>
              <div className="p-4 sm:p-5 rounded-2xl card-premium">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Satış KDV</p>
                    <p className="text-lg font-black text-emerald-400">₺{stats.kdvSummary.satisKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600">Müşteriye yansıtılan KDV</p>
              </div>
              <div className="p-4 sm:p-5 rounded-2xl card-premium">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <Scale className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">KDV Farkı</p>
                    <p className={`text-lg font-black ${stats.kdvSummary.satisKdv - stats.kdvSummary.alisKdv >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      ₺{(stats.kdvSummary.satisKdv - stats.kdvSummary.alisKdv).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600">
                  Satış KDV - Alış KDV · {stats.kdvSummary.faturaMovements} fatura hareketi
                  {stats.faturaStokuCount > 0 && ` · ${stats.faturaStokuCount} fatura stok ürünü`}
                </p>
              </div>
            </motion.div>
          )}

          {/* Row 4: Recent Movements */}
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
            className="p-4 sm:p-5 lg:p-6 rounded-2xl lg:rounded-3xl card-premium"
          >
            <div className="flex items-center gap-3 mb-4 sm:mb-5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
                <History className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base lg:text-lg font-bold text-white">Son Hareketler</h2>
                <p className="text-[10px] sm:text-xs text-gray-500">Toplam {stats.totalMovements} hareket · Tum urunler</p>
              </div>
            </div>
            {stats.recentMovements.length === 0 ? (
              <EmptyChartState message="Henuz hareket yok" />
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto custom-scrollbar">
                {stats.recentMovements.map((m: any, i) => (
                  <div key={m.id || i} className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] transition-all">
                    <MovementBadge type={m.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-white truncate">{m.productName}</p>
                      <p className="text-[10px] text-gray-600">{m.partyName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-bold tabular-nums ${['ALIS', 'MUSTERI_IADE', 'URETIM_GIRIS', 'FATURA_ALIS'].includes(m.type) ? 'text-emerald-400' : m.type === 'FATURA_IPTAL' ? 'text-rose-400' : 'text-red-400'}`}>
                        {['ALIS', 'MUSTERI_IADE', 'URETIM_GIRIS', 'FATURA_ALIS'].includes(m.type) ? '+' : '-'}{m.quantity} {m.productUnit}
                      </p>
                      {m.kdvAmount ? <p className="text-[8px] text-blue-400 font-mono">KDV: ₺{m.kdvAmount.toFixed(2)}</p> : null}
                      <p className="text-[9px] text-gray-600 font-mono">{new Date(m.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
        );
      })()}

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* Add Product Modal */}
      <Dialog.Root open={isAddModalOpen} onOpenChange={(open) => { setIsAddModalOpen(open); if (!open) { setAddFormCategory(categories[0] || 'Dana'); setAddFormUnit('KG'); } }}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-md z-50" /><Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 modal-glass p-5 sm:p-7 rounded-2xl sm:rounded-3xl border border-white/10 w-[95vw] max-w-md z-50 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <Dialog.Title className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center"><Package className="w-4 h-4 text-blue-400" /></div>
              Yeni Urun
            </Dialog.Title>
            <Dialog.Close className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-4 h-4 text-gray-500" /></Dialog.Close>
          </div>
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Urun Adi</label>
              <input type="text" name="name" required placeholder="Orn: Dana But" className="w-full p-3 bg-secondary/60 border border-border rounded-xl text-white outline-none focus:border-blue-500/50 text-sm transition-all" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Kategori</label>
                <CustomSelect value={addFormCategory} onChange={setAddFormCategory} options={categories.map(c => ({ value: c, label: c }))} placeholder="Kategori Sec" name="category" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Birim</label>
                <CustomSelect value={addFormUnit} onChange={setAddFormUnit} options={[{ value: 'KG', label: 'KG' }, { value: 'Adet', label: 'Adet' }, { value: 'Koli', label: 'Koli' }]} placeholder="Birim Sec" name="unit" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Kritik Stok Seviyesi</label>
              <input type="number" name="minStock" required placeholder="Orn: 10" className="w-full p-3 bg-secondary/60 border border-border rounded-xl text-white outline-none focus:border-blue-500/50 text-sm transition-all" />
            </div>
            <button type="submit" className="w-full py-3 mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-blue-600/20">Urunu Kaydet</button>
          </form>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* Add Movement Modal */}
      <Dialog.Root open={isAddMovementModalOpen} onOpenChange={(open) => { setIsAddMovementModalOpen(open); if (!open) { setPartySearch(''); setSelectedCariId(null); setMovementTypeForFilter('ALIS'); } }}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-md z-50" /><Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 modal-glass p-5 sm:p-7 rounded-2xl sm:rounded-3xl border border-white/10 w-[95vw] max-w-md z-50 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <Dialog.Title className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center"><RefreshCcw className="w-4 h-4 text-indigo-400" /></div>
              Stok Hareketi
            </Dialog.Title>
            <Dialog.Close className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-4 h-4 text-gray-500" /></Dialog.Close>
          </div>
          {selectedProduct && (
            <form onSubmit={handleAddMovement} className="space-y-4">
              <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06] flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-sm">{selectedProduct.name}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${selectedProduct.unit === 'KG' ? 'bg-blue-500/15 text-blue-400' : selectedProduct.unit === 'Adet' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-orange-500/15 text-orange-400'}`}>{selectedProduct.unit}</span>
                </div>
                <span className="font-bold text-white text-sm">{formatStock(selectedProduct.currentStock, selectedProduct.unit)} {getUnitLabel(selectedProduct.unit)}</span>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Islem Turu</label>
                <CustomSelect
                  value={movementTypeForFilter}
                  onChange={(v) => { setMovementTypeForFilter(v); setPartySearch(''); setSelectedCariId(null); }}
                  options={[
                    { value: 'ALIS', label: 'Toptancidan Alis (+)' },
                    { value: 'SATIS', label: 'Musteriye Satis (-)' },
                    { value: 'MUSTERI_IADE', label: 'Musteri Iadesi (+)' },
                    { value: 'TOPTANCI_IADE', label: 'Toptanciya Iade (-)' },
                    { value: 'FIRE', label: 'Fire / Zayiat (-)' },
                    { value: 'FATURA_ALIS', label: 'Fatura Alış (+)' },
                    { value: 'FATURA_SATIS', label: 'Fatura Satış (-)' },
                  ]}
                  placeholder="Islem turu sec"
                  name="type"
                />
              </div>

              <div className="relative">
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Ilgili Kisi / Firma</label>
                <input
                  type="text" ref={partyInputRef as any} name="partyName" value={partySearch}
                  onChange={e => { setPartySearch(e.target.value); setShowCariSuggestions(true); setSelectedCariId(null); }}
                  placeholder="Ilgili Kisi / Firma Ara..."
                  className={`w-full p-3 bg-secondary/60 border rounded-xl text-white outline-none focus:border-indigo-500/50 text-sm transition-all ${selectedCariId ? 'border-emerald-500/40' : 'border-border'}`}
                  autoComplete="off"
                />
                {showCariSuggestions && filteredCariSuggestions.length > 0 && (
                  <div ref={suggestionsRef as any} className="absolute z-[200] top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-2xl shadow-black/80 overflow-hidden" style={{ maxHeight: 'min(200px, 40vh)' }}>
                    <div className="overflow-y-auto" style={{ maxHeight: 'min(200px, 40vh)' }}>
                      {filteredCariSuggestions.map((c: any) => (
                        <div key={c.id} onClick={() => { setPartySearch(c.companyName); setSelectedCariId(c.id); setShowCariSuggestions(false); }} className="p-3 hover:bg-white/10 cursor-pointer border-b border-white/5 flex justify-between">
                          <span className="text-sm font-bold">{c.companyName}</span>
                          <span className="text-xs text-gray-500">{c.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1 ml-1">Miktar ({getUnitLabel(selectedProduct.unit)})</label>
                  <input type="number" name="quantity" required step={selectedProduct.unit === 'KG' ? '0.01' : '1'} min={selectedProduct.unit === 'KG' ? '0.01' : '1'} placeholder={selectedProduct.unit === 'KG' ? '25.50' : '10'} className="w-full p-3 bg-secondary/60 border border-border rounded-xl text-white outline-none focus:border-indigo-500/50 text-sm transition-all" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1 ml-1">B. Fiyat (₺/{selectedProduct.unit})</label>
                  <input type="number" name="price" required step="0.01" min="0" placeholder="350.00" className="w-full p-3 bg-secondary/60 border border-border rounded-xl text-white outline-none focus:border-indigo-500/50 text-sm transition-all" />
                </div>
              </div>
              <input type="text" name="description" placeholder="Aciklama (Opsiyonel)" className="w-full p-3 bg-secondary/60 border border-border rounded-xl text-white outline-none focus:border-indigo-500/50 text-sm transition-all" />
              <button type="submit" className="w-full py-3 mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20">Hareketi Kaydet</button>
            </form>
          )}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* Edit Product Modal */}
      <Dialog.Root open={isEditModalOpen} onOpenChange={(open) => { setIsEditModalOpen(open); if (open && selectedProduct) { setEditFormCategory(selectedProduct.category); setEditFormUnit(selectedProduct.unit); } }}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-md z-50" /><Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 modal-glass p-5 sm:p-7 rounded-2xl sm:rounded-3xl border border-white/10 w-[95vw] max-w-md z-50 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <Dialog.Title className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center"><Edit className="w-4 h-4 text-blue-400" /></div>
              Urun Duzenle
            </Dialog.Title>
            <Dialog.Close className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-4 h-4 text-gray-500" /></Dialog.Close>
          </div>
          {selectedProduct && (
            <form onSubmit={handleEditProduct} className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Urun Adi</label>
                <input type="text" name="name" defaultValue={selectedProduct.name} required className="w-full p-3 bg-secondary/60 border border-border rounded-xl text-white outline-none focus:border-blue-500/50 text-sm transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Kategori</label>
                  <CustomSelect value={editFormCategory || selectedProduct.category} onChange={setEditFormCategory} options={categories.map(c => ({ value: c, label: c }))} placeholder="Kategori Sec" name="category" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Birim</label>
                  <CustomSelect value={editFormUnit || selectedProduct.unit} onChange={setEditFormUnit} options={[{ value: 'KG', label: 'KG' }, { value: 'Adet', label: 'Adet' }, { value: 'Koli', label: 'Koli' }]} placeholder="Birim Sec" name="unit" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Kritik Stok Seviyesi</label>
                <input type="number" name="minStock" defaultValue={selectedProduct.minStock} required className="w-full p-3 bg-secondary/60 border border-border rounded-xl text-white outline-none focus:border-blue-500/50 text-sm transition-all" />
              </div>
              <button type="submit" className="w-full py-3 mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-blue-600/20">Guncelle</button>
            </form>
          )}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
