/**
 * Üretim Takip Sayfası - İŞLEYEN ET
 * 
 * AKIŞ: Stoktan hammadde seç → İşle → Çıktı ürünü stoka ekle
 * Örnek: 100 kg Dana Eti (stoktan düşer) → İşleme → 70 kg Pişmiş Dana Eti (stoka eklenir)
 * 
 * Çöp/Atık: Kullanıcı çöp kg girer, kalan = girdi - çöp otomatik hesaplanır
 * Fire: Kalan (temiz) → Pişirme → Çıktı; fark fire olarak hesaplanır
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Factory, Plus, Save, Trash2, Settings, TrendingUp, TrendingDown,
  Package, Flame, Thermometer, Scale, DollarSign, Users, Box,
  AlertTriangle, ChevronDown, ChevronRight, RotateCcw, X,
  History, BarChart3, Sparkles, ArrowRight, FileText, Layers,
  Edit2, Copy, PlayCircle, CheckCircle, Clock, Zap, Gauge,
  Search, ArrowDown, ArrowUp, ShoppingCart, Minus, Info, Truck, Star, BadgeCheck,
  Scissors, ToggleLeft, ToggleRight, ChefHat
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PieChart as PieChartRC, Pie, Cell,
  BarChart as BarChartRC, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RCTooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { toast } from 'sonner';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { kvGet, kvSet } from '../lib/pouchdb-kv';
import { getDb } from '../lib/pouchdb';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { logActivity } from '../utils/activityLogger';
import { useTableSync } from '../hooks/useTableSync';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { productToDb, Product } from './StokPage';

// [AJAN-2 | claude/serene-gagarin | 2026-03-24] Son düzenleyen: Claude Sonnet 4.6


// ─── Interfaces ───────────────────────────────────────────────────
interface UretimProfile {
  id: string;
  name: string;
  defaultTupKg: number;
  defaultPaketlemeMaliyeti: number;
  defaultIsyeriMaliyeti: number;
  defaultCalisanMaliyeti: number;
  defaultTupFiyatKg: number;
  avgFireOrani: number;
  avgCopOrani: number;
  createdAt: string;
}

interface UretimKayit {
  id: string;
  profileId: string;
  profileName: string;
  date: string;
  // Hammadde (stoktan)
  hammaddeStokId: string;
  hammaddeAdi: string;
  toptanciAdi: string;
  trKodu: string;
  cigKg: number;
  birimFiyat: number;
  // Temizlik / Çöp
  copKg: number;
  temizKg: number; // = cigKg - copKg
  copOrani: number;
  // Pişirme
  ciktiKg: number;
  fireKg: number;
  fireOrani: number;
  // Tüp / Kazan
  kazanSayisi: number;
  pisSuresiSaat: number;
  tupPerKazan: number;
  tupBaslangicKg: number; // eski uyumluluk
  tupBitisKg: number;     // eski uyumluluk
  tupKullanilanKg: number;
  tupFiyatKg: number;
  // Maliyetler
  paketlemeMaliyeti: number;
  isyeriMaliyeti: number;
  calisanMaliyeti: number;
  // Hesaplanan
  toplamMaliyet: number;
  kgBasinaMaliyet: number;
  // Çıktı stok
  ciktiUrunAdi: string;
  ciktiStokId: string;
  stokIslemleriYapildi: boolean;
  uretimTipi?: 'pisirme' | 'kiyma' | 'karisim';
  // Karışım (multi-ingredient mixing) verileri
  karisimGirdiler?: Array<{
    stokId: string;
    urunAdi: string;
    miktar: number;
    birim: string;
    birimFiyat: number;
  }>;
  createdAt: string;
}

interface UretimDefaults {
  tupFiyatKg: number;
  paketlemeMaliyeti: number;
  isyeriMaliyeti: number;
  calisanMaliyeti: number;
}

interface KarisimGirdi {
  id: string;
  stokId: string;
  urunAdi: string;
  miktar: number;
  maxStok: number;
  birim: string;
  birimFiyat: number;
}

interface SupplierInfo {
  name: string;
  totalKg: number;
  totalAmount: number;
  avgPrice: number;
  lastPrice: number;
  lastDate: string;
  count: number;
}

const DEFAULT_URETIM_DEFAULTS: UretimDefaults = {
  tupFiyatKg: 103,
  paketlemeMaliyeti: 7,
  isyeriMaliyeti: 10,
  calisanMaliyeti: 5,
};

// ─── Kıyma Interfaces ────────────────────────────────────────────
interface KiymaKalem {
  id: string;
  name: string;
  stokId: string;
  kg: number;
  birimFiyat: number;
  useStokFiyat: boolean;
  stokOrtMaliyet: number;
}
interface KiymaRecete {
  id: string;
  name: string;
  kalemler: KiymaKalem[];
  createdAt: string;
}
interface KiymaCalcResult {
  toplamKg: number;
  toplamMaliyet: number;
  ortMaliyet: number;
  stdSapma: number;
  minKalem: { name: string; fiyat: number } | null;
  maxKalem: { name: string; fiyat: number } | null;
  potansiyelTasarruf: number;
  pieData: { name: string; value: number; kg: number }[];
  barData: { name: string; birimMaliyet: number; aboveAvg: boolean }[];
}

const KIYMA_STORAGE_KEY = 'kiyma_receteler_v1';

const KIYMA_COLORS = [
  '#f38ba8', '#fab387', '#f9e2af', '#a6e3a1',
  '#89b4fa', '#b4befe', '#cba6f7', '#74c7ec',
];

/** Stok kaleminden ağırlıklı ortalama alış maliyetini hesapla */
function getKiymaStokMaliyet(stokItem: any): number {
  const movements = Array.isArray(stokItem.movements) ? stokItem.movements : [];
  const alis = movements.filter((m: any) => m.type === 'ALIS' && (m.quantity || 0) > 0 && (m.price || 0) > 0);
  if (alis.length === 0) return (stokItem.sellPrice || 0) / 1.2;
  const totKg = alis.reduce((s: number, m: any) => s + m.quantity, 0);
  const totM = alis.reduce((s: number, m: any) => s + m.quantity * m.price, 0);
  return totKg > 0 ? totM / totKg : (stokItem.sellPrice || 0) / 1.2;
}

// ─── Step Indicator ────────────────────────────────────────────────
function StepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="relative mb-5 md:mb-8">
      {/* Background track */}
      <div className="absolute top-[18px] md:top-[22px] left-0 right-0 h-[2px] bg-secondary/60 mx-8 md:mx-14" />
      {/* Progress fill */}
      <motion.div
        className="absolute top-[18px] md:top-[22px] left-0 h-[2px] bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500 mx-8 md:mx-14 rounded-full"
        style={{ originX: 0 }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: currentStep / (steps.length - 1) }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />

      <div className="relative flex justify-between">
        {steps.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 md:gap-2.5 z-10">
              <motion.div
                animate={{ scale: active ? 1.08 : 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                className={`relative w-9 h-9 md:w-11 md:h-11 rounded-xl md:rounded-2xl flex items-center justify-center text-xs md:text-sm font-bold transition-all duration-500 ${
                  done
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                    : active
                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-secondary/80 text-muted-foreground border border-border/50'
                }`}
              >
                {done ? <CheckCircle className="w-4 h-4 md:w-5 md:h-5" /> : i + 1}
                {active && (
                  <motion.div
                    className="absolute -inset-1 rounded-2xl md:rounded-3xl border-2 border-blue-400/40"
                    animate={{ opacity: [0.4, 0, 0.4], scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                  />
                )}
              </motion.div>
              <span className={`text-[9px] md:text-[11px] font-semibold tracking-wide text-center leading-tight max-w-[55px] md:max-w-[80px] transition-colors duration-300 ${
                active ? 'text-white' : done ? 'text-emerald-400/80' : 'text-muted-foreground/50'
              }`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AnimatedStat ──────────────────────────────────────────────────
function AnimatedStat({ label, value, suffix = '', icon: Icon, color = 'blue', alert = false }: {
  label: string; value: string | number; suffix?: string; icon: React.ElementType; color?: string; alert?: boolean;
}) {
  const colorMap: Record<string, { accent: string; glow: string; glowHover: string; text: string; iconBg: string; border: string }> = {
    blue:   { accent: 'linear-gradient(135deg, #3b82f6, #60a5fa)', glow: 'rgba(37, 99, 235, 0.06)', glowHover: 'rgba(37, 99, 235, 0.12)', text: 'text-blue-400', iconBg: 'from-blue-600/20 to-blue-500/10', border: 'border-blue-500/[0.12]' },
    green:  { accent: 'linear-gradient(135deg, #10b981, #34d399)', glow: 'rgba(16, 185, 129, 0.06)', glowHover: 'rgba(16, 185, 129, 0.12)', text: 'text-emerald-400', iconBg: 'from-emerald-600/20 to-emerald-500/10', border: 'border-emerald-500/[0.12]' },
    red:    { accent: 'linear-gradient(135deg, #ef4444, #f87171)', glow: 'rgba(239, 68, 68, 0.06)', glowHover: 'rgba(239, 68, 68, 0.12)', text: 'text-red-400', iconBg: 'from-red-600/20 to-red-500/10', border: 'border-red-500/[0.12]' },
    orange: { accent: 'linear-gradient(135deg, #f97316, #fb923c)', glow: 'rgba(245, 158, 11, 0.06)', glowHover: 'rgba(245, 158, 11, 0.12)', text: 'text-orange-400', iconBg: 'from-orange-600/20 to-orange-500/10', border: 'border-orange-500/[0.12]' },
    purple: { accent: 'linear-gradient(135deg, #a855f7, #c084fc)', glow: 'rgba(147, 51, 234, 0.06)', glowHover: 'rgba(147, 51, 234, 0.12)', text: 'text-purple-400', iconBg: 'from-purple-600/20 to-purple-500/10', border: 'border-purple-500/[0.12]' },
    cyan:   { accent: 'linear-gradient(135deg, #06b6d4, #22d3ee)', glow: 'rgba(6, 182, 212, 0.06)', glowHover: 'rgba(6, 182, 212, 0.12)', text: 'text-cyan-400', iconBg: 'from-cyan-600/20 to-cyan-500/10', border: 'border-cyan-500/[0.12]' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`stat-card-v2 p-3 md:p-4 group ${c.border}`}
      style={{ '--stat-accent': c.accent, '--stat-glow': c.glow, '--stat-glow-hover': c.glowHover } as React.CSSProperties}
    >
      <div className="stat-bg-glow" />
      {alert && <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-2 h-2 bg-red-500 rounded-full status-pulse" />}
      <div className="flex items-center gap-2 md:gap-2.5 relative z-10">
        <div className={`w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br ${c.iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${c.text}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] md:text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">{label}</p>
          <p className="text-sm md:text-lg font-bold text-white tech-number truncate">{value}{suffix}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Stok Arama Dropdown ──────────────────────────────────────────
function StokSearchSelect({ value, onSelect, stokList }: {
  value: string;
  onSelect: (item: any) => void;
  stokList: any[];
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Dışarı tıklayınca kapat
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // FIX: position:fixed kullan — overflow:hidden olan üst container'lardan etkilenmez
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const goUpward = spaceBelow < 300 && spaceAbove > spaceBelow;
    const maxH = Math.min(340, Math.max(160, (goUpward ? spaceAbove : spaceBelow) - 12));

    if (goUpward) {
      setDropdownStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
        width: rect.width,
        maxHeight: maxH,
        zIndex: 9999,
      });
    } else {
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
        maxHeight: maxH,
        zIndex: 9999,
      });
    }
  }, []);

  // Açıkken scroll/resize'da pozisyonu güncelle
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  const handleOpen = () => {
    if (isOpen) { setIsOpen(false); return; }
    updatePosition();
    setIsOpen(true);
  };

  const filtered = useMemo(() => {
    const validStok = stokList.filter(s => (s.name || '').trim().length > 0 && (s.currentStock || s.stock || 0) > 0);
    if (!search.trim()) return validStok;
    const q = search.toLowerCase();
    return validStok.filter(s => (s.name || '').toLowerCase().includes(q));
  }, [stokList, search]);

  const selectedItem = stokList.find(s => s.id === value);

  const dropdown = isOpen ? (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      style={dropdownStyle}
      className="glass-strong rounded-xl shadow-2xl flex flex-col overflow-hidden border border-border/30"
    >
      <div className="p-3 border-b border-border/40 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-white text-sm placeholder-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-snappy"
            placeholder={t('common.search') || 'Urun ara...'}
            autoFocus
          />
        </div>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            {stokList.length === 0 ? (t('uretim.messages.noStock') || 'Stokta urun bulunamadi') : (t('uretim.messages.noMatch') || 'Aramayla eslesen urun yok')}
          </div>
        ) : (
          filtered.map(item => (
            <button
              key={item.id}
              onClick={() => { onSelect(item); setIsOpen(false); setSearch(''); }}
              className={`w-full text-left px-4 py-3.5 sm:py-3 hover:bg-blue-600/10 active:bg-blue-600/15 transition-snappy flex items-center justify-between border-b border-border/20 last:border-0 data-row ${
                value === item.id ? 'bg-blue-600/10' : ''
              }`}
              style={{ '--row-accent': '#3b82f6' } as React.CSSProperties}
            >
              <div>
                <p className="text-sm font-medium text-white">{item.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {item.category || 'Genel'} &bull; Satis: ₺{(item.sellPrice ?? item.price ?? 0).toFixed(2)}/{item.unit || 'kg'}
                </p>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <p className="text-sm font-bold text-emerald-400">
                  {(item.currentStock ?? item.stock ?? 0).toFixed(1)}
                </p>
                <p className="text-[10px] text-muted-foreground/60">{item.unit || 'kg'}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </motion.div>
  ) : null;

  return (
    <div ref={containerRef}>
      <div
        onClick={handleOpen}
        className="w-full px-4 py-3.5 sm:py-3 bg-card border border-border rounded-xl text-white cursor-pointer flex items-center justify-between hover:border-blue-500/30 active:bg-card/80 transition-corporate"
      >
        {selectedItem ? (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Package className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-sm font-medium">{selectedItem.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                ({(selectedItem.currentStock ?? selectedItem.stock ?? 0).toFixed(1)} {selectedItem.unit || 'kg'} mevcut)
              </span>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground/60 text-sm">{t('uretim.labels.select_placeholder') || 'Stoktan urun secin...'}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      <AnimatePresence>
        {isOpen && createPortal(dropdown, document.body)}
      </AnimatePresence>
    </div>
  );
}

// ─── Çıktı Ürün Seçici (Stoktan Seç veya Yeni Ürün Yaz) ──────────
function CiktiUrunSelect({ value, onChange, stokList, hammaddeAdi }: {
  value: string;
  onChange: (val: string) => void;
  stokList: any[];
  hammaddeAdi: string;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Dışarı tıklayınca kapat
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // FIX: position:fixed — overflow:hidden olan üst container'lardan etkilenmez
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const goUpward = spaceBelow < 300 && spaceAbove > spaceBelow;
    const maxH = Math.min(window.innerHeight * 0.65, Math.max(220, (goUpward ? spaceAbove : spaceBelow) - 16));
    setDropdownStyle(goUpward ? {
      position: 'fixed', bottom: window.innerHeight - rect.top + 8,
      left: rect.left, width: rect.width, maxHeight: maxH, zIndex: 9999,
    } : {
      position: 'fixed', top: rect.bottom + 8,
      left: rect.left, width: rect.width, maxHeight: maxH, zIndex: 9999,
    });
  }, []);

  // Mevcut stok ürünlerini filtrele (isimsizleri hariç tut)
  const suggestions = useMemo(() => {
    const items = stokList.filter(s => (s.name || '').trim().length > 0);
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(s => (s.name || '').toLowerCase().includes(q));
  }, [stokList, search]);

  // Hammaddeye dayalı öneriler
  const quickSuggestions = useMemo(() => {
    if (!hammaddeAdi) return [];
    const base = hammaddeAdi.replace(/\s*\(.*\)\s*$/, '').trim();
    return [
      `${base} (Pismis)`,
      `${base} (Islenmis)`,
      `${base} (Kavurma)`,
      `${base} (Kusbasi)`,
      `${base} (Kiyma)`,
    ];
  }, [hammaddeAdi]);

  const handleSelect = (val: string) => {
    onChange(val);
    setSearch(val);
    setIsOpen(false);
  };

  const ciktiDropdown = isOpen ? (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      style={dropdownStyle}
      className="glass-strong rounded-xl shadow-2xl flex flex-col overflow-hidden border border-border/30"
    >
      {/* Hızlı öneriler — sadece arama yokken göster */}
      {quickSuggestions.length > 0 && !search.trim() && (
        <div className="p-3 border-b border-border/40 flex-shrink-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-2">{t('uretim.labels.quick_suggestions') || 'Hizli Oneriler'}</p>
          <div className="flex flex-wrap gap-1.5">
            {quickSuggestions.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSelect(suggestion)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium btn-press transition-snappy ${
                  value === suggestion
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-secondary/60 text-muted-foreground hover:bg-accent/60 hover:text-foreground/80 border border-transparent'
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="overflow-y-auto flex-1 min-h-0 custom-scrollbar">
        {suggestions.length > 0 && (
          <div className="px-4 py-2 border-b border-border/40 sticky top-0 bg-card/80 backdrop-blur-sm">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{t('uretim.labels.existing_stock') || 'Mevcut Stok Urunleri'}</p>
          </div>
        )}
        {suggestions.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelect(item.name)}
            className={`w-full text-left px-4 py-2.5 hover:bg-emerald-600/10 transition-snappy flex items-center justify-between border-b border-border/20 last:border-0 data-row ${
              value === item.name ? 'bg-emerald-600/10' : ''
            }`}
            style={{ '--row-accent': '#10b981' } as React.CSSProperties}
          >
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-white">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {item.category || 'Genel'} &bull; Stok: {(item.currentStock ?? item.stock ?? 0).toFixed(1)} {item.unit || 'kg'}
                </p>
              </div>
            </div>
            {value === item.name && <CheckCircle className="w-4 h-4 text-emerald-400" />}
          </button>
        ))}
        {search.trim() && !suggestions.find(s => s.name.toLowerCase() === search.trim().toLowerCase()) && (
          <button
            type="button"
            onClick={() => handleSelect(search.trim())}
            className="w-full text-left px-4 py-3 hover:bg-blue-600/10 transition-colors flex items-center gap-2 border-t border-border/30"
          >
            <Plus className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-blue-400">
              "<span className="font-bold text-white">{search.trim()}</span>" {t('uretim.labels.create_new') || 'olarak yeni urun olustur'}
            </span>
          </button>
        )}
        {suggestions.length === 0 && !search.trim() && (
          <div className="p-4 text-center text-muted-foreground/60 text-xs">
            Stokta kayıtlı ürün yok — yukarıdan hızlı öneri seçin veya yeni isim yazın
          </div>
        )}
      </div>
    </motion.div>
  ) : null;

  return (
    <div ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={isOpen ? search : value}
          onChange={e => { setSearch(e.target.value); onChange(e.target.value); }}
          onFocus={() => { setSearch(value || ''); updatePosition(); setIsOpen(true); }}
          className="w-full pl-9 pr-4 py-3 bg-card border border-border rounded-xl text-white text-sm placeholder-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-corporate focus-corporate"
          placeholder={t('uretim.labels.output_placeholder') || 'Urun adi yazin veya stoktan secin...'}
        />
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); setSearch(''); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-accent flex items-center justify-center hover:bg-border transition-colors"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && createPortal(ciktiDropdown, document.body)}
      </AnimatePresence>
    </div>
  );
}

// ─── Flow Visualization ──────────────────────────────────────────
function FlowVisualization({ cigKg, copKg, temizKg, ciktiKg, fireKg, copOrani, fireOrani, hammaddeAdi, ciktiAdi }: {
  cigKg: number; copKg: number; temizKg: number; ciktiKg: number; fireKg: number;
  copOrani: number; fireOrani: number; hammaddeAdi: string; ciktiAdi: string;
}) {
  const { t } = useLanguage();
  if (cigKg <= 0) return null;
  const verimlilik = cigKg > 0 ? ((ciktiKg / cigKg) * 100) : 0;
  return (
    <div className="p-3 md:p-5 rounded-xl card-premium relative overflow-hidden">
      {/* subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/[0.03] via-transparent to-emerald-500/[0.03] pointer-events-none" />

      <div className="flex items-center justify-between mb-3 md:mb-4 relative z-10">
        <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-1.5">
          <Zap className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-400" />
          {t('uretim.flow', 'Üretim Akışı')}
        </p>
        {ciktiKg > 0 && (
          <span className={`text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-full ${
            verimlilik >= 70 ? 'bg-emerald-500/15 text-emerald-400' :
            verimlilik >= 50 ? 'bg-orange-500/15 text-orange-400' :
            'bg-red-500/15 text-red-400'
          }`}>
            {t('uretim.efficiencyShort', 'Verim')}: %{verimlilik.toFixed(0)}
          </span>
        )}
      </div>

      {/* Desktop: horizontal flow */}
      <div className="hidden md:flex items-center gap-2 relative z-10">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0 }}
          className="px-4 py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-center min-w-[80px]">
          <p className="text-sm text-blue-400 font-bold tech-number">{cigKg.toFixed(1)} kg</p>
          <p className="text-[9px] text-muted-foreground/70 truncate max-w-[90px]">{hammaddeAdi || t('uretim.rawMaterial', 'Hammadde')}</p>
        </motion.div>
        {copKg > 0 && (
          <>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 }}
              className="w-6 h-6 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
              <Minus className="w-3 h-3 text-orange-400" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="px-3 py-2 rounded-xl bg-orange-600/10 border border-orange-500/20 text-center">
              <p className="text-xs text-orange-400 font-bold tech-number">{copKg.toFixed(1)} kg</p>
              <p className="text-[9px] text-muted-foreground/60">{t('uretim.wasteShort', 'Çöp')} %{copOrani.toFixed(1)}</p>
            </motion.div>
          </>
        )}
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 }}
          className="flex items-center gap-0.5 flex-shrink-0">
          <div className="w-5 h-[2px] bg-gradient-to-r from-muted-foreground/30 to-muted-foreground/10 rounded-full" />
          <ArrowRight className="w-4 h-4 text-muted-foreground/50" />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="px-3 py-2 rounded-xl bg-secondary/60 border border-border/30 text-center">
          <p className="text-xs text-foreground/80 font-bold tech-number">{temizKg.toFixed(1)} kg</p>
          <p className="text-[9px] text-muted-foreground/60">{t('uretim.cleanShort', 'Temiz')}</p>
        </motion.div>
        {ciktiKg > 0 && (
          <>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 }}
              className="flex items-center gap-0.5 flex-shrink-0">
              <div className="w-5 h-[2px] bg-gradient-to-r from-muted-foreground/30 to-emerald-500/30 rounded-full" />
              <ArrowRight className="w-4 h-4 text-emerald-400/60" />
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-center min-w-[80px] relative">
              <p className="text-sm text-emerald-400 font-bold tech-number">{ciktiKg.toFixed(1)} kg</p>
              <p className="text-[9px] text-muted-foreground/70 truncate max-w-[90px]">{ciktiAdi || t('uretim.outputShort', 'Çıktı')}</p>
            </motion.div>
            {fireKg > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                className="px-2.5 py-2 rounded-xl bg-red-600/8 border border-red-500/15 text-center">
                <p className="text-[10px] text-red-400 font-bold tech-number">-{fireKg.toFixed(1)} kg</p>
                <p className="text-[9px] text-muted-foreground/50">{t('uretim.fireShort', 'Fire')} %{fireOrani.toFixed(1)}</p>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Mobile: segmented bar */}
      <div className="md:hidden relative z-10">
        <div className="flex items-stretch gap-[2px] rounded-xl overflow-hidden">
          <div className="flex-1 text-center py-2 bg-blue-600/12 border-l border-y border-blue-500/20 rounded-l-lg">
            <p className="text-[10px] text-blue-400 font-bold tech-number">{cigKg.toFixed(0)}kg</p>
            <p className="text-[8px] text-muted-foreground/50 truncate px-1">{hammaddeAdi?.split(' ')[0] || t('uretim.rawMaterial', 'Hammadde')}</p>
          </div>
          {copKg > 0 && (
            <div className="text-center py-2 px-2 bg-orange-600/12 border-y border-orange-500/20">
              <p className="text-[10px] text-orange-400 font-bold">-{copKg.toFixed(0)}</p>
              <p className="text-[8px] text-muted-foreground/50">{t('uretim.wasteShort', 'Çöp')}</p>
            </div>
          )}
          <div className="text-center py-2 px-2 bg-secondary/40 border-y border-border/20">
            <p className="text-[10px] text-foreground/70 font-bold tech-number">{temizKg.toFixed(0)}kg</p>
            <p className="text-[8px] text-muted-foreground/50">{t('uretim.cleanShort', 'Temiz')}</p>
          </div>
          {ciktiKg > 0 && (
            <div className="flex-1 text-center py-2 bg-emerald-600/12 border-r border-y border-emerald-500/20 rounded-r-lg">
              <p className="text-[10px] text-emerald-400 font-bold tech-number">{ciktiKg.toFixed(0)}kg</p>
              <p className="text-[8px] text-muted-foreground/50 truncate px-1">{ciktiAdi?.split(' ')[0] || t('uretim.outputShort', 'Çıktı')}</p>
            </div>
          )}
        </div>
        {/* Progress bar showing efficiency */}
        {ciktiKg > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: verimlilik / 100 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{ transformOrigin: 'left' }}
                className={`h-full w-full rounded-full ${
                  verimlilik >= 70 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
                  verimlilik >= 50 ? 'bg-gradient-to-r from-orange-500 to-orange-400' :
                  'bg-gradient-to-r from-red-500 to-red-400'
                }`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground/60 tabular-nums">%{verimlilik.toFixed(0)}</span>
          </div>
        )}
        {(copKg > 0 || fireKg > 0) && (
          <div className="flex items-center justify-center gap-3 mt-1.5 text-[9px]">
            {copKg > 0 && <span className="text-orange-400/80">{t('uretim.wasteShort', 'Çöp')} %{copOrani.toFixed(0)}</span>}
            {fireKg > 0 && <span className="text-red-400/80">{t('uretim.fireShort', 'Fire')} %{fireOrani.toFixed(0)} ({fireKg.toFixed(1)}kg)</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────
export function UretimPage() {
  const { t } = useLanguage();
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { emit } = useModuleBus();
  
  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canAdd, canDelete, canEdit } = getPagePermissions(user, currentEmployee, 'uretim');
  const sec = usePageSecurity('uretim');

  const { data: syncProfiles, addItem: addProfile, updateItem: updateProfile, deleteItem: deleteProfile } = useTableSync<UretimProfile>({
    tableName: 'uretim_profilleri',
    storageKey: 'uretim_profiles',
    initialData: [],
  });

  const { data: syncKayitlar, addItem: addKayit, deleteItem: deleteKayit } = useTableSync<UretimKayit>({
    tableName: 'uretim_kayitlari',
    storageKey: 'uretim_data',
    initialData: [],
    orderBy: 'date',
    orderAsc: false,
  });

  const profiles = syncProfiles || [];

  const kayitlar = useMemo(() => {
    const raw = syncKayitlar || [];
    return raw.map((k: any) => {
      const oldTupUsed = (k.tupBaslangicKg && k.tupBitisKg) ? Math.max(0, k.tupBaslangicKg - k.tupBitisKg) : 0;
      const tupPerKazan = k.tupPerKazan ?? 10;
      const kazanSayisi = k.kazanSayisi ?? (oldTupUsed > 0 ? Math.max(1, Math.round(oldTupUsed / tupPerKazan)) : 1);
      return {
        ...k,
        ciktiKg: k.ciktiKg ?? k.pismisSonrasiKg ?? 0,
        ciktiUrunAdi: k.ciktiUrunAdi ?? k.uretimSonuUrunAdi ?? '',
        temizKg: k.temizKg ?? (k.temizlikYapildiMi ? k.temizlikSonrasiKg : k.cigKg) ?? k.cigKg ?? 0,
        stokIslemleriYapildi: k.stokIslemleriYapildi ?? k.uretimSonuStokEklendi ?? false,
        hammaddeStokId: k.hammaddeStokId ?? '',
        trKodu: k.trKodu ?? k.tr_kodu ?? '',
        ciktiStokId: k.ciktiStokId ?? '',
        kazanSayisi,
        pisSuresiSaat: k.pisSuresiSaat ?? 6,
        tupPerKazan,
        tupKullanilanKg: k.tupKullanilanKg ?? oldTupUsed ?? (kazanSayisi * tupPerKazan),
      };
    });
  }, [syncKayitlar]);

  const [defaults, setDefaults] = useState<UretimDefaults>(DEFAULT_URETIM_DEFAULTS);

  const [activeView, setActiveView] = useState<'kayitlar' | 'yeni' | 'hizli' | 'karisim' | 'profiller' | 'analiz' | 'kiyma'>('kayitlar');
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<UretimProfile | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UretimProfile | null>(null);

  // Cari verisi — toptancı TR kodunu otomatik doldurmak için
  const cariList = useMemo(() => {
    try {
      return getFromStorage<any[]>(StorageKey.CARI_DATA) || [];
    } catch { return []; }
  }, []);

  /** Toptancı adına göre onaylı işletme numarasını (TR kodu) bul */
  const findTrKodu = (supplierName: string): string => {
    if (!supplierName) return '';
    const cari = cariList.find(
      (c: any) => c.type === 'Toptancı' && (
        (c.companyName || c.company_name || '').toLowerCase() === supplierName.toLowerCase()
      )
    );
    return cari?.approvedBusinessNo || cari?.approved_business_no || '';
  };

  // Stok verisi - her yeni üretim başlatıldığında taze oku (isimsizleri temizle & normalize et)
  const [stokList, setStokList] = useState<any[]>([]);
  const refreshStok = () => {
    const raw = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
    // İsimsiz (boş isimli) stok ürünlerini temizle & movements/fiyat normalize et
    const cleaned = raw
      .filter(s => (s.name || '').trim().length > 0)
      .map(s => {
        // movements doğrudan array olabilir veya supplier_entries içinden parse edilmesi gerekebilir
        let movements = Array.isArray(s.movements) ? s.movements : [];
        let category = s.category || 'Genel';
        // Eğer movements boşsa ama supplier_entries varsa → parse et (KV'den gelen format)
        if (movements.length === 0 && s.supplier_entries) {
          try {
            const parsed = typeof s.supplier_entries === 'string'
              ? JSON.parse(s.supplier_entries)
              : s.supplier_entries;
            if (Array.isArray(parsed)) {
              movements = parsed.map((entry: any) => ({
                id: entry.id || crypto.randomUUID(),
                type: 'ALIS',
                partyName: entry.supplierName || 'Bilinmeyen',
                date: entry.date || new Date().toISOString(),
                quantity: entry.quantity || 0,
                price: entry.buyPrice || 0,
                totalAmount: entry.totalAmount || 0,
              }));
            } else if (parsed && Array.isArray(parsed.movements)) {
              movements = parsed.movements;
              category = parsed.category || category;
            }
          } catch {}
        }
        return {
          ...s,
          movements,
          category,
          currentStock: s.currentStock ?? s.current_stock ?? s.stock ?? 0,
          sellPrice: s.sellPrice ?? s.sell_price ?? s.price ?? 0,
        };
      });
    if (cleaned.length !== raw.length) {
      setInStorage(StorageKey.STOK_DATA, cleaned);
    }
    setStokList(cleaned);
  };

  // Seçili stok ürünün toptancı bilgileri
  const [selectedStokItem, setSelectedStokItem] = useState<any>(null);

  const stokSuppliers = useMemo<SupplierInfo[]>(() => {
    if (!selectedStokItem || !selectedStokItem.movements) return [];
    const movements = (selectedStokItem.movements || []).filter(
      (m: any) => m.type === 'ALIS' && m.partyName
    );
    const map: Record<string, SupplierInfo> = {};
    movements.forEach((m: any) => {
      const name = m.partyName;
      if (!map[name]) {
        map[name] = { name, totalKg: 0, totalAmount: 0, avgPrice: 0, lastPrice: 0, lastDate: '', count: 0 };
      }
      map[name].count++;
      map[name].totalKg += Math.abs(m.quantity || 0);
      map[name].totalAmount += m.totalAmount || 0;
      if (!map[name].lastDate || m.date > map[name].lastDate) {
        map[name].lastDate = m.date;
        map[name].lastPrice = m.price || 0;
      }
    });
    Object.values(map).forEach(s => {
      s.avgPrice = s.totalKg > 0 ? s.totalAmount / s.totalKg : 0;
    });
    return Object.values(map).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [selectedStokItem]);

  // Form state
  const [form, setForm] = useState({
    profileId: '',
    hammaddeStokId: '',
    hammaddeAdi: '',
    toptanciAdi: '',
    trKodu: '',
    cigKg: 0,
    birimFiyat: 0,
    maxStok: 0, // stokta mevcut miktar
    // Çöp/Atık
    copKg: 0,
    // Pişirme
    ciktiKg: 0,
    // Kazan & Tüp
    kazanSayisi: 1,
    pisSuresiSaat: 6,
    tupPerKazan: 10,
    tupFiyatKg: DEFAULT_URETIM_DEFAULTS.tupFiyatKg,
    // Masraflar
    paketlemeMaliyeti: DEFAULT_URETIM_DEFAULTS.paketlemeMaliyeti,
    isyeriMaliyeti: DEFAULT_URETIM_DEFAULTS.isyeriMaliyeti,
    calisanMaliyeti: DEFAULT_URETIM_DEFAULTS.calisanMaliyeti,
    // Çıktı
    ciktiUrunAdi: '',
    // Üretim tipi
    uretimTipi: 'pisirme' as 'pisirme' | 'kiyma',
  });

  const [profileForm, setProfileForm] = useState({
    name: '',
    defaultTupKg: 10,
    defaultPaketlemeMaliyeti: 7,
    defaultIsyeriMaliyeti: 10,
    defaultCalisanMaliyeti: 5,
    defaultTupFiyatKg: 103,
  });

  // ─── Hızlı İşleme Form State ─────────────────────────────────────
  const [hizliForm, setHizliForm] = useState({
    hammaddeStokId: '',
    hammaddeAdi: '',
    birim: 'KG' as string,
    girisMiktar: 0,
    maxStok: 0,
    birimFiyat: 0,
    // Fire (opsiyonel)
    showFire: false,
    fireMiktar: 0,
    // Maliyet (opsiyonel)
    showMaliyet: false,
    iscilikMaliyeti: 0,
    ekMaliyet: 0,
    maliyetAciklama: '',
    // Çıktı
    ciktiUrunAdi: '',
    ciktiMiktar: 0,
    aciklama: '',
  });

  const hizliCalc = useMemo(() => {
    const { girisMiktar, fireMiktar, birimFiyat, iscilikMaliyeti, ekMaliyet, ciktiMiktar } = hizliForm;
    const fireOrani = girisMiktar > 0 ? ((fireMiktar / girisMiktar) * 100) : 0;
    const hammaddeMaliyet = girisMiktar * birimFiyat;
    const toplamMaliyet = hammaddeMaliyet + iscilikMaliyeti + ekMaliyet;
    const birimMaliyet = ciktiMiktar > 0 ? (toplamMaliyet / ciktiMiktar) : 0;
    const verimlilik = girisMiktar > 0 ? ((ciktiMiktar / girisMiktar) * 100) : 0;
    // Kâr marjı hesaplamaları (%20, %30, %50)
    const karMarjlari = [20, 30, 50].map(marj => ({
      marj,
      fiyat: birimMaliyet > 0 ? Math.round(birimMaliyet * (1 + marj / 100) * 100) / 100 : 0,
      kar: birimMaliyet > 0 ? Math.round(birimMaliyet * (marj / 100) * ciktiMiktar * 100) / 100 : 0,
    }));
    return { fireOrani, hammaddeMaliyet, toplamMaliyet, birimMaliyet, verimlilik, karMarjlari };
  }, [hizliForm]);

  // Son hızlı işlemeler (template olarak kullanmak için)
  const recentHizliIslemeler = useMemo(() => {
    return kayitlar
      .filter(k => k.profileId === '__hizli_isleme__')
      .slice(0, 5);
  }, [kayitlar]);

  // ─── Kıyma Karışım State ─────────────────────────────────────────
  const [kiymaKalemler, setKiymaKalemler] = useState<KiymaKalem[]>([
    { id: crypto.randomUUID(), name: '', stokId: '', kg: 0, birimFiyat: 0, useStokFiyat: true, stokOrtMaliyet: 0 }
  ]);
  const [kiymaOzelMarj, setKiymaOzelMarj] = useState(20);
  const [kiymaReceteAdi, setKiymaReceteAdi] = useState('');
  const [kiymaReceteler, setKiymaReceteler] = useState<Array<{ id: string; name: string; kalemler: KiymaKalem[] }>>([]);

  // Kayıt listesi filtreleme
  const [kayitFilter, setKayitFilter] = useState('');
  const [kayitTypeFilter, setKayitTypeFilter] = useState<'all' | 'hizli' | 'detayli'>('all');
  
  const filteredKayitlar = useMemo(() => {
    let result = kayitlar;
    if (kayitTypeFilter === 'hizli') result = result.filter(k => k.profileId === '__hizli_isleme__');
    if (kayitTypeFilter === 'detayli') result = result.filter(k => k.profileId !== '__hizli_isleme__');
    if (kayitFilter.trim()) {
      const q = kayitFilter.toLowerCase();
      result = result.filter(k =>
        (k.hammaddeAdi || '').toLowerCase().includes(q) ||
        (k.ciktiUrunAdi || '').toLowerCase().includes(q) ||
        (k.profileName || '').toLowerCase().includes(q) ||
        (k.toptanciAdi || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [kayitlar, kayitFilter, kayitTypeFilter]);

  // Hızlı işleme template'ten doldur
  const applyHizliTemplate = (kayit: UretimKayit) => {
    const stokItem = stokList.find(s => s.name === kayit.hammaddeAdi);
    if (stokItem) {
      handleHizliStokSelect(stokItem);
      setTimeout(() => {
        setHizliForm(prev => ({
          ...prev,
          ciktiUrunAdi: kayit.ciktiUrunAdi,
          showFire: kayit.fireKg > 0,
        }));
      }, 50);
      toast.success(`"${kayit.hammaddeAdi} → ${kayit.ciktiUrunAdi}" şablonu yüklendi`);
    } else {
      toast.error(`"${kayit.hammaddeAdi}" stokta bulunamadı`);
    }
  };

  const resetHizliForm = () => {
    setHizliForm({
      hammaddeStokId: '', hammaddeAdi: '', birim: 'KG', girisMiktar: 0, maxStok: 0, birimFiyat: 0,
      showFire: false, fireMiktar: 0,
      showMaliyet: false, iscilikMaliyeti: 0, ekMaliyet: 0, maliyetAciklama: '',
      ciktiUrunAdi: '', ciktiMiktar: 0, aciklama: '',
    });
    setSelectedStokItem(null);
  };

  // ─── Karışım (Multi-Ingredient Mixing) State ─────────────────────
  const [karisimGirdiler, setKarisimGirdiler] = useState<KarisimGirdi[]>([]);
  const [karisimCikti, setKarisimCikti] = useState({
    urunAdi: '',
    miktar: 0,
    aciklama: '',
    showMaliyet: false,
    iscilikMaliyeti: 0,
    ekMaliyet: 0,
  });

  const karisimCalc = useMemo(() => {
    const toplamGirdi = karisimGirdiler.reduce((s, g) => s + g.miktar, 0);
    const hammaddeMaliyet = karisimGirdiler.reduce((s, g) => s + (g.miktar * g.birimFiyat), 0);
    const ekMaliyetler = karisimCikti.showMaliyet ? (karisimCikti.iscilikMaliyeti + karisimCikti.ekMaliyet) : 0;
    const toplamMaliyet = hammaddeMaliyet + ekMaliyetler;
    const birimMaliyet = karisimCikti.miktar > 0 ? (toplamMaliyet / karisimCikti.miktar) : 0;
    const verimlilik = toplamGirdi > 0 ? ((karisimCikti.miktar / toplamGirdi) * 100) : 0;
    const fireKg = Math.max(0, toplamGirdi - karisimCikti.miktar);
    const fireOrani = toplamGirdi > 0 ? ((fireKg / toplamGirdi) * 100) : 0;
    const karMarjlari = [20, 30, 50].map(marj => ({
      marj,
      fiyat: birimMaliyet > 0 ? Math.round(birimMaliyet * (1 + marj / 100) * 100) / 100 : 0,
      kar: birimMaliyet > 0 ? Math.round(birimMaliyet * (marj / 100) * karisimCikti.miktar * 100) / 100 : 0,
    }));
    return { toplamGirdi, hammaddeMaliyet, ekMaliyetler, toplamMaliyet, birimMaliyet, verimlilik, fireKg, fireOrani, karMarjlari };
  }, [karisimGirdiler, karisimCikti]);

  const addKarisimGirdi = (item: any) => {
    if (karisimGirdiler.find(g => g.stokId === item.id)) {
      toast.error('Bu ürün zaten listeye ekli');
      return;
    }
    const stokMiktar = item.currentStock ?? item.stock ?? 0;
    setKarisimGirdiler(prev => [...prev, {
      id: crypto.randomUUID(),
      stokId: item.id,
      urunAdi: item.name || '',
      miktar: 0,
      maxStok: stokMiktar,
      birim: item.unit || 'KG',
      birimFiyat: item.sellPrice ?? item.price ?? 0,
    }]);
  };

  const removeKarisimGirdi = (id: string) => {
    setKarisimGirdiler(prev => prev.filter(g => g.id !== id));
  };

  const updateKarisimGirdi = (id: string, field: string, value: number) => {
    setKarisimGirdiler(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));
  };

  const resetKarisimForm = () => {
    setKarisimGirdiler([]);
    setKarisimCikti({ urunAdi: '', miktar: 0, aciklama: '', showMaliyet: false, iscilikMaliyeti: 0, ekMaliyet: 0 });
  };

  // Load defaults and initial stock
  useEffect(() => {
    const savedDefaults = getFromStorage<UretimDefaults>(StorageKey.URETIM_DEFAULTS);
    if (savedDefaults) {
      setDefaults(savedDefaults);
    } else {
      // [AJAN-2] KV fallback — localStorage boşsa varsayılanları KV'den yükle
      kvGet<UretimDefaults>('uretim_defaults').then(kv => {
        if (kv) {
          setDefaults(kv);
          setInStorage(StorageKey.URETIM_DEFAULTS, kv);
        }
      }).catch(() => {});
    }
    refreshStok();
  }, []);

  // ─── Calculations ────────────────────────────────────────────────
  const calc = useMemo(() => {
    const { cigKg, copKg, ciktiKg, birimFiyat,
      kazanSayisi, tupPerKazan, tupFiyatKg,
      paketlemeMaliyeti, isyeriMaliyeti, calisanMaliyeti } = form;

    const temizKg = Math.max(0, cigKg - copKg);
    const copOrani = cigKg > 0 ? ((copKg / cigKg) * 100) : 0;
    const fireKg = Math.max(0, temizKg - ciktiKg);
    const fireOrani = temizKg > 0 ? ((fireKg / temizKg) * 100) : 0;
    // Kıyma işlemede kazan/tüp kullanılmaz
    const isKiyma = form.uretimTipi === 'kiyma';
    const tupKullanilanKg = isKiyma ? 0 : kazanSayisi * tupPerKazan;
    const toplamPisSuresi = isKiyma ? 0 : kazanSayisi * form.pisSuresiSaat;

    // Maliyet hesaplama
    const hammaddeMaliyet = cigKg * birimFiyat;
    const tupMaliyet = isKiyma ? 0 : tupKullanilanKg * tupFiyatKg;
    const paketMaliyet = ciktiKg * paketlemeMaliyeti;
    const isyeriMaliyet = ciktiKg * isyeriMaliyeti;
    const calisanMaliyet = ciktiKg * calisanMaliyeti;
    const toplamMaliyet = hammaddeMaliyet + tupMaliyet + paketMaliyet + isyeriMaliyet + calisanMaliyet;
    const kgBasinaMaliyet = ciktiKg > 0 ? (toplamMaliyet / ciktiKg) : 0;

    return {
      temizKg, copOrani, fireKg, fireOrani, tupKullanilanKg, toplamPisSuresi,
      hammaddeMaliyet, tupMaliyet, paketMaliyet, isyeriMaliyet, calisanMaliyet,
      toplamMaliyet, kgBasinaMaliyet,
    };
  }, [form]);

  // ─── Kıyma Calculations ──────────────────────────────────────────
  const kiymaCalc = useMemo((): KiymaCalcResult => {
    const aktif = kiymaKalemler.filter(k => k.kg > 0 && (k.useStokFiyat ? k.stokOrtMaliyet : k.birimFiyat) > 0);
    const toplamKg = aktif.reduce((s, k) => s + k.kg, 0);
    const toplamMaliyet = aktif.reduce((s, k) => s + k.kg * (k.useStokFiyat ? k.stokOrtMaliyet : k.birimFiyat), 0);
    const ortMaliyet = toplamKg > 0 ? toplamMaliyet / toplamKg : 0;

    // Standart sapma (birim maliyetlerin ağırlıklı varyansı)
    const stdSapma = aktif.length > 1
      ? Math.sqrt(
          aktif.reduce((s, k) => {
            const fiyat = k.useStokFiyat ? k.stokOrtMaliyet : k.birimFiyat;
            return s + k.kg * Math.pow(fiyat - ortMaliyet, 2);
          }, 0) / (toplamKg || 1)
        )
      : 0;

    // En pahalı / en ucuz malzeme (birim maliyet bazında)
    const sorted = [...aktif].sort((a, b) => {
      const fa = a.useStokFiyat ? a.stokOrtMaliyet : a.birimFiyat;
      const fb = b.useStokFiyat ? b.stokOrtMaliyet : b.birimFiyat;
      return fa - fb;
    });
    const minKalem = sorted.length > 0
      ? { name: sorted[0].name || 'İsimsiz', fiyat: sorted[0].useStokFiyat ? sorted[0].stokOrtMaliyet : sorted[0].birimFiyat }
      : null;
    const maxKalem = sorted.length > 0
      ? { name: sorted[sorted.length - 1].name || 'İsimsiz', fiyat: sorted[sorted.length - 1].useStokFiyat ? sorted[sorted.length - 1].stokOrtMaliyet : sorted[sorted.length - 1].birimFiyat }
      : null;

    // Potansiyel tasarruf: en pahalı malzemeyi en ucuzla değiştirseydik ne kadar tasarruf ederdin?
    const potansiyelTasarruf = (aktif.length > 1 && minKalem && maxKalem)
      ? (maxKalem.fiyat - minKalem.fiyat) *
        (sorted[sorted.length - 1].kg)
      : 0;

    const pieData = aktif.map(k => ({
      name: k.name || 'İsimsiz',
      value: k.kg * (k.useStokFiyat ? k.stokOrtMaliyet : k.birimFiyat),
      kg: k.kg,
    }));
    const barData = aktif.map(k => {
      const fiyat = k.useStokFiyat ? k.stokOrtMaliyet : k.birimFiyat;
      return {
        name: (k.name || 'İsimsiz').slice(0, 12),
        birimMaliyet: fiyat,
        aboveAvg: fiyat > ortMaliyet,
      };
    });
    return { toplamKg, toplamMaliyet, ortMaliyet, stdSapma, minKalem, maxKalem, potansiyelTasarruf, pieData, barData };
  }, [kiymaKalemler]);

  // ─── Stoktan ürün seçildiğinde ──────────────────────────────────
  const handleStokSelect = (item: any) => {
    const stokMiktar = item.currentStock ?? item.current_stock ?? item.stock ?? 0;
    const fiyat = item.sellPrice ?? item.sell_price ?? item.price ?? 0;
    // movements normalize — localStorage'dan gelirken undefined olabilir
    const normalizedItem = {
      ...item,
      movements: Array.isArray(item.movements) ? item.movements : [],
      currentStock: stokMiktar,
      sellPrice: fiyat,
    };
    setSelectedStokItem(normalizedItem);
    setForm(prev => ({
      ...prev,
      hammaddeStokId: item.id,
      hammaddeAdi: item.name || '',
      birimFiyat: fiyat,
      maxStok: stokMiktar,
      cigKg: 0,
      toptanciAdi: '',
      trKodu: '',
      ciktiUrunAdi: '',
    }));
  };

  // ─── Toptancı seçildiğinde ───────────────────────────────────────
  const handleSupplierSelect = (supplier: SupplierInfo) => {
    const trKodu = findTrKodu(supplier.name);
    setForm(prev => ({
      ...prev,
      toptanciAdi: supplier.name,
      trKodu,
      birimFiyat: supplier.lastPrice, // son alış fiyatını kullan
    }));
  };

  // ─── Profile Selection ──────────────────────────────────────────
  const handleProfileSelect = (profile: UretimProfile) => {
    setSelectedProfile(profile);
    setForm(prev => ({
      ...prev,
      profileId: profile.id,
      tupFiyatKg: profile.defaultTupFiyatKg || defaults.tupFiyatKg,
      tupPerKazan: profile.defaultTupKg || 10,
      paketlemeMaliyeti: profile.defaultPaketlemeMaliyeti || defaults.paketlemeMaliyeti,
      isyeriMaliyeti: profile.defaultIsyeriMaliyeti || defaults.isyeriMaliyeti,
      calisanMaliyeti: profile.defaultCalisanMaliyeti || defaults.calisanMaliyeti,
    }));
  };

  // ─── Save Profile ────────────────────────────────────────────────
  const handleSaveProfile = () => {
    if (editingProfile && !canEdit) {
      sec.logUnauthorized('uretim_edit', 'Kullanıcı üretim profili düzenlemeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    if (!editingProfile && !canAdd) {
      sec.logUnauthorized('uretim_add', 'Kullanıcı üretim profili eklemeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    if (!sec.preCheck(editingProfile ? 'edit' : 'add', { name: profileForm.name })) return;
    if (!profileForm.name.trim()) {
      toast.error('Profil adi giriniz');
      return;
    }

    const newProfile: UretimProfile = {
      id: editingProfile?.id || crypto.randomUUID(),
      name: profileForm.name,
      defaultTupKg: profileForm.defaultTupKg,
      defaultPaketlemeMaliyeti: profileForm.defaultPaketlemeMaliyeti,
      defaultIsyeriMaliyeti: profileForm.defaultIsyeriMaliyeti,
      defaultCalisanMaliyeti: profileForm.defaultCalisanMaliyeti,
      defaultTupFiyatKg: profileForm.defaultTupFiyatKg,
      avgFireOrani: 0,
      avgCopOrani: 0,
      createdAt: editingProfile?.createdAt || new Date().toISOString(),
    };

    const profileKayitlar = kayitlar.filter(k => k.profileId === newProfile.id);
    if (profileKayitlar.length > 0) {
      newProfile.avgFireOrani = profileKayitlar.reduce((s, k) => s + k.fireOrani, 0) / profileKayitlar.length;
      newProfile.avgCopOrani = profileKayitlar.reduce((s, k) => s + k.copOrani, 0) / profileKayitlar.length;
    }

    const updated = editingProfile
      ? profiles.map(p => p.id === editingProfile.id ? newProfile : p)
      : [...profiles, newProfile];

    if (editingProfile) {
      updateProfile(newProfile.id, newProfile);
    } else {
      addProfile(newProfile);
    }

    setShowProfileModal(false);
    setEditingProfile(null);
    setProfileForm({ name: '', defaultTupKg: 10, defaultPaketlemeMaliyeti: 7, defaultIsyeriMaliyeti: 10, defaultCalisanMaliyeti: 5, defaultTupFiyatKg: 103 });
    sec.auditLog(editingProfile ? 'uretim_profile_edit' : 'uretim_profile_add', newProfile.id, newProfile.name);
    logActivity('custom', editingProfile ? 'Üretim profili güncellendi' : 'Yeni üretim profili oluşturuldu', { employeeName: user?.name, page: 'Uretim' });
    toast.success(editingProfile ? 'Profil guncellendi' : 'Profil olusturuldu');
  };

  // ─── Save Production Record ──────────────────────────────────────
  const handleSaveProduction = async () => {
    if (!canAdd) { sec.logUnauthorized('uretim_add', 'Kullanıcı üretim kaydı oluşturmaya çalıştı ancak yetkisi yoktu.'); return; }
    if (!selectedProfile) { toast.error('Oncelikle bir uretim profili secin'); return; }
    if (!form.hammaddeStokId) { toast.error('Stoktan bir hammadde secin'); return; }
    if (form.cigKg <= 0) { toast.error('Hammadde miktari giriniz'); return; }
    if (form.ciktiKg <= 0) { toast.error('Cikti urun miktarini giriniz'); return; }
    if (!form.ciktiUrunAdi.trim()) { toast.error('Cikti urun adini giriniz'); return; }
    if (!sec.preCheck('add', { ciktiUrunAdi: form.ciktiUrunAdi, hammaddeAdi: form.hammaddeAdi })) return;

    // Stok kontrolu
    if (form.cigKg > form.maxStok) {
      toast.error(`Stokta yetersiz miktar! Mevcut: ${form.maxStok.toFixed(1)} kg, Istenen: ${form.cigKg} kg`);
      return;
    }

    try {

    const newKayit: UretimKayit = {
      id: crypto.randomUUID(),
      profileId: selectedProfile.id,
      profileName: selectedProfile.name,
      date: new Date().toISOString(),
      hammaddeStokId: form.hammaddeStokId,
      hammaddeAdi: form.hammaddeAdi,
      toptanciAdi: form.toptanciAdi,
      trKodu: form.trKodu,
      cigKg: form.cigKg,
      birimFiyat: form.birimFiyat,
      copKg: form.copKg,
      temizKg: calc.temizKg,
      copOrani: calc.copOrani,
      ciktiKg: form.ciktiKg,
      fireKg: calc.fireKg,
      fireOrani: calc.fireOrani,
      kazanSayisi: form.kazanSayisi,
      pisSuresiSaat: form.pisSuresiSaat,
      tupPerKazan: form.tupPerKazan,
      tupBaslangicKg: 0,
      tupBitisKg: 0,
      tupKullanilanKg: calc.tupKullanilanKg,
      tupFiyatKg: form.tupFiyatKg,
      paketlemeMaliyeti: form.paketlemeMaliyeti,
      isyeriMaliyeti: form.isyeriMaliyeti,
      calisanMaliyeti: form.calisanMaliyeti,
      toplamMaliyet: calc.toplamMaliyet,
      kgBasinaMaliyet: calc.kgBasinaMaliyet,
      ciktiUrunAdi: form.ciktiUrunAdi,
      ciktiStokId: '',
      stokIslemleriYapildi: true,
      uretimTipi: form.uretimTipi,
      createdAt: new Date().toISOString(),
    };

    // ─── STOK İŞLEMLERİ ────────────────────────────────────────
    const rawStok = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
    // Normalize et: farklı field isimleri (camelCase / snake_case) ve undefined movements
    const currentStok = rawStok.map(s => {
      let movements = Array.isArray(s.movements) ? s.movements : [];
      // movements boşsa supplier_entries'den parse et (KV formatı)
      if (movements.length === 0 && s.supplier_entries) {
        try {
          const parsed = typeof s.supplier_entries === 'string'
            ? JSON.parse(s.supplier_entries)
            : s.supplier_entries;
          if (parsed && Array.isArray(parsed.movements)) {
            movements = parsed.movements;
          } else if (Array.isArray(parsed)) {
            movements = parsed.map((e: any) => ({
              id: e.id || crypto.randomUUID(),
              type: 'ALIS',
              partyName: e.supplierName || 'Bilinmeyen',
              date: e.date || new Date().toISOString(),
              quantity: e.quantity || 0,
              price: e.buyPrice || 0,
              totalAmount: e.totalAmount || 0,
            }));
          }
        } catch {}
      }
      return {
        ...s,
        currentStock: s.currentStock ?? s.current_stock ?? s.stock ?? 0,
        movements,
      };
    });

    // 1) Hammaddeyi stoktan düş
    const updatedStok = currentStok.map(s => {
      if (s.id === form.hammaddeStokId) {
        const newStock = Math.max(0, s.currentStock - form.cigKg);
        const movements = [...(s.movements || [])];
        movements.push({
          id: crypto.randomUUID(),
          type: 'URETIM_CIKIS',
          partyName: 'Uretim: ' + selectedProfile.name,
          date: new Date().toISOString(),
          quantity: form.cigKg,
          price: form.birimFiyat,
          totalAmount: form.cigKg * form.birimFiyat,
          description: `Uretim icin stoktan dusuldu → ${form.ciktiKg}kg ${form.ciktiUrunAdi} uretildi`,
          uretimDetay: {
            ciktiUrunAdi: form.ciktiUrunAdi,
            ciktiKg: form.ciktiKg,
            profilAdi: selectedProfile.name,
          },
        });
        return {
          ...s,
          currentStock: newStock,
          stock: newStock,
          movements,
          // KV senkronizasyonu için supplier_entries güncelle
          supplier_entries: JSON.stringify({ category: s.category || 'Genel', movements }),
        };
      }
      return s;
    });

    // 2) Çıktı ürünü stoka ekle — Üretim detayları ile
    const uretimDetay = {
      profilAdi: selectedProfile.name,
      hammaddeAdi: form.hammaddeAdi,
      hammaddeKg: form.cigKg,
      hammaddeBirimFiyat: form.birimFiyat,
      hammaddeMaliyet: calc.hammaddeMaliyet,
      toptanciAdi: form.toptanciAdi,
      trKodu: form.trKodu,
      copKg: form.copKg,
      copOrani: calc.copOrani,
      temizKg: calc.temizKg,
      fireKg: calc.fireKg,
      fireOrani: calc.fireOrani,
      ciktiKg: form.ciktiKg,
      kazanSayisi: form.kazanSayisi,
      pisSuresiSaat: form.pisSuresiSaat,
      tupKullanilanKg: calc.tupKullanilanKg,
      tupFiyatKg: form.tupFiyatKg,
      tupMaliyeti: calc.tupMaliyet,
      paketlemeMaliyeti: calc.paketMaliyet,
      isyeriMaliyeti: calc.isyeriMaliyet,
      calisanMaliyeti: calc.calisanMaliyet,
      toplamMaliyet: calc.toplamMaliyet,
      kgBasinaMaliyet: calc.kgBasinaMaliyet,
      uretimTarihi: new Date().toISOString(),
    };

    const ciktiMovement = {
      id: crypto.randomUUID(),
      type: 'URETIM_GIRIS' as const,
      partyName: 'Uretim: ' + selectedProfile.name,
      date: new Date().toISOString(),
      quantity: form.ciktiKg,
      price: calc.kgBasinaMaliyet,
      totalAmount: calc.toplamMaliyet,
      description: `Uretimden: ${form.cigKg}kg ${form.hammaddeAdi} → ${form.ciktiKg}kg (Cop: %${calc.copOrani.toFixed(1)}, Fire: %${calc.fireOrani.toFixed(1)}) | Maliyet: ₺${calc.toplamMaliyet.toFixed(2)} (₺${calc.kgBasinaMaliyet.toFixed(2)}/kg)`,
      uretimDetay,
    };

    const existingCikti = updatedStok.find(s => s.name === form.ciktiUrunAdi);
    if (existingCikti) {
      const idx = updatedStok.findIndex(s => s.id === existingCikti.id);
      const newStock = (existingCikti.currentStock ?? existingCikti.stock ?? 0) + form.ciktiKg;
      const movements = [...(existingCikti.movements || []), ciktiMovement];
      
      // Maliyet tabanlı otomatik satış fiyatı güncelleme (Ağırlıklı Ortalama Maliyet)
      const currentAvgCost = (existingCikti.sellPrice || 0) / 1.2;
      const currentStockAmount = existingCikti.currentStock ?? existingCikti.stock ?? 0;
      
      let newAvgCost = calc.kgBasinaMaliyet;
      if (currentStockAmount > 0) {
        newAvgCost = ((currentStockAmount * currentAvgCost) + (form.ciktiKg * calc.kgBasinaMaliyet)) / (currentStockAmount + form.ciktiKg);
      }
      
      const finalSellPrice = Math.round(newAvgCost * 1.2 * 100) / 100;

      updatedStok[idx] = {
        ...existingCikti,
        currentStock: newStock,
        stock: newStock,
        sellPrice: finalSellPrice, // Maliyet/satış fiyatı senkronizasyonu
        movements,
        // KV senkronizasyonu için supplier_entries güncelle
        supplier_entries: JSON.stringify({ category: existingCikti.category || 'İşlenmiş Et', movements }),
      };
      newKayit.ciktiStokId = existingCikti.id;
    } else {
      const newCiktiId = crypto.randomUUID();
      const now = new Date().toISOString();
      updatedStok.push({
        id: newCiktiId,
        name: form.ciktiUrunAdi,
        category: 'İşlenmiş Et',
        unit: 'KG',
        sellPrice: Math.round(calc.kgBasinaMaliyet * 1.2 * 100) / 100, // Varsayilan %20 kar marji ile baslangic satis fiyati
        currentStock: form.ciktiKg,
        stock: form.ciktiKg,
        minStock: 5,
        movements: [ciktiMovement],
        // KV senkronizasyonu için movements'ı JSON olarak da sakla
        supplier_entries: JSON.stringify({ category: 'İşlenmiş Et', movements: [ciktiMovement] }),
        createdAt: now,
        created_at: now,
      });
      newKayit.ciktiStokId = newCiktiId;
    }

    setInStorage(StorageKey.STOK_DATA, updatedStok);
    setStokList(updatedStok);

    // ─── KAYIT KAYDET ──────────────────────────────────────────
    const updatedKayitlar = [newKayit, ...kayitlar];
    addKayit(newKayit);
    emit('uretim:completed', { kayitId: newKayit.id, inputKg: newKayit.cigKg, outputKg: newKayit.ciktiKg, productName: newKayit.ciktiUrunAdi });

    // Update profile averages
    const profileKayitlar = updatedKayitlar.filter(k => k.profileId === selectedProfile.id);
    const updatedProfile = {
      ...selectedProfile,
      avgFireOrani: profileKayitlar.reduce((s, k) => s + k.fireOrani, 0) / profileKayitlar.length,
      avgCopOrani: profileKayitlar.reduce((s, k) => s + k.copOrani, 0) / profileKayitlar.length,
    };
    updateProfile(updatedProfile.id, updatedProfile);

    // Save defaults
    const newDefaults = {
      tupFiyatKg: form.tupFiyatKg,
      paketlemeMaliyeti: form.paketlemeMaliyeti,
      isyeriMaliyeti: form.isyeriMaliyeti,
      calisanMaliyeti: form.calisanMaliyeti,
    };
    setDefaults(newDefaults);
    setInStorage(StorageKey.URETIM_DEFAULTS, newDefaults);
    kvSet('uretim_defaults', newDefaults).catch(() => {});

    // ─── POUCHDB SYNC: Değişen stok kalemlerini urunler tablosuna yaz ───
    // ─── SYNC: Değişen stok kalemlerini yaz (useTableSync → PouchDB → CouchDB) ───
    const changedItems: any[] = [];
    // Hammadde (stoktan düşülen)
    const updatedHammadde = updatedStok.find((s: any) => s.id === form.hammaddeStokId);
    if (updatedHammadde) changedItems.push(updatedHammadde);
    // Çıktı ürün (eklenen/güncellenen)
    const updatedCikti = updatedStok.find((s: any) => s.id === newKayit.ciktiStokId);
    if (updatedCikti && updatedCikti.id !== updatedHammadde?.id) changedItems.push(updatedCikti);
    if (changedItems.length > 0) {
      const urunlerDb = getDb('urunler');
      for (const item of changedItems) {
        try {
          const dbRow = productToDb(item as Product);
          const existing = await urunlerDb.get(item.id).catch(() => null);
          if (existing) {
            await urunlerDb.put({ ...dbRow, _id: item.id, _rev: (existing as any)._rev });
          } else {
            await urunlerDb.put({ ...dbRow, _id: item.id });
          }
        } catch (e) {
          console.error('[UretimPage] urunler PouchDB yazma hatası:', e);
        }
      }
    }
    // sync handled by useTableSync → PouchDB → CouchDB

    toast.success(
      <div>
        <p className="font-bold">{t('uretim.messages.success') || 'Uretim basariyla kaydedildi!'}</p>
        <p className="text-xs opacity-80 mt-0.5">
          {form.cigKg} kg {form.hammaddeAdi} {t('uretim.messages.success_desc_1') || 'stoktan dusuldu,'} {form.ciktiKg} kg {form.ciktiUrunAdi} {t('uretim.messages.success_desc_2') || 'stoga eklendi'}
        </p>
      </div>
    );
    sec.auditLog('uretim_production_add', newKayit.id, `${form.hammaddeAdi}→${form.ciktiUrunAdi}`);
    logActivity('custom', 'Üretim kaydı oluşturuldu', { employeeName: user?.name, page: 'Uretim', description: `${form.cigKg} kg ${form.hammaddeAdi} işlenerek ${form.ciktiKg} kg ${form.ciktiUrunAdi} üretildi.` });
    setActiveView('kayitlar');
    resetForm();

    } catch (error) {
      console.error('[UretimPage] handleSaveProduction HATA:', error);
      toast.error(`${t('uretim.messages.error') || 'Uretim kaydedilirken hata olustu'}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const resetForm = () => {
    setForm({
      profileId: '',
      hammaddeStokId: '',
      hammaddeAdi: '',
      toptanciAdi: '',
      trKodu: '',
      cigKg: 0,
      birimFiyat: 0,
      maxStok: 0,
      copKg: 0,
      ciktiKg: 0,
      kazanSayisi: 1,
      pisSuresiSaat: 6,
      tupPerKazan: 10,
      tupFiyatKg: defaults.tupFiyatKg,
      paketlemeMaliyeti: defaults.paketlemeMaliyeti,
      isyeriMaliyeti: defaults.isyeriMaliyeti,
      calisanMaliyeti: defaults.calisanMaliyeti,
      ciktiUrunAdi: '',
      uretimTipi: 'pisirme' as 'pisirme' | 'kiyma',
    });
    setSelectedProfile(null);
    setSelectedStokItem(null);
    setCurrentStep(0);
  };

  const handleDeleteKayit = (id: string) => {
    if (!canDelete) { sec.logUnauthorized('uretim_delete', 'Kullanıcı üretim kaydı silmeye çalıştı ancak yetkisi yoktu.'); return; }
    if (!sec.checkRate('delete')) return;
    if (!confirm(t('uretim.messages.confirmDelete') || 'Bu uretim kaydini silmek istediginize emin misiniz?')) return;
    deleteKayit(id);
    sec.auditLog('uretim_delete', id);
    emit('uretim:deleted', { kayitId: id });
    logActivity('custom', 'Üretim kaydı silindi', { employeeName: user?.name, page: 'Uretim' });
    toast.success(t('uretim.messages.deleted') || 'Kayit silindi');
  };

  // ─── Hızlı İşleme: Stok Seç ─────────────────────────────────────
  const handleHizliStokSelect = (item: any) => {
    const stokMiktar = item.currentStock ?? item.current_stock ?? item.stock ?? 0;
    const fiyat = item.sellPrice ?? item.sell_price ?? item.price ?? 0;
    const birim = (item.unit || 'KG').toUpperCase();
    setSelectedStokItem({
      ...item,
      movements: Array.isArray(item.movements) ? item.movements : [],
      currentStock: stokMiktar,
      sellPrice: fiyat,
    });
    setHizliForm(prev => ({
      ...prev,
      hammaddeStokId: item.id,
      hammaddeAdi: item.name || '',
      birim,
      birimFiyat: fiyat,
      maxStok: stokMiktar,
      girisMiktar: 0,
      fireMiktar: 0,
      ciktiMiktar: 0,
      ciktiUrunAdi: '',
    }));
  };

  // ─── Hızlı İşleme: Kaydet ───────────────────────────────────────
  const handleSaveHizliIsleme = async () => {
    if (!canAdd) { sec.logUnauthorized('uretim_add', 'Kullanıcı hızlı işleme kaydı oluşturmaya çalıştı ancak yetkisi yoktu.'); return; }
    if (!hizliForm.hammaddeStokId) { toast.error('Stoktan bir ürün seçin'); return; }
    if (hizliForm.girisMiktar <= 0) { toast.error('İşlenecek miktar giriniz'); return; }
    if (hizliForm.ciktiMiktar <= 0) { toast.error('Çıktı miktarı giriniz'); return; }
    if (!hizliForm.ciktiUrunAdi.trim()) { toast.error('Çıktı ürün adını giriniz'); return; }
    if (!sec.preCheck('add', { ciktiUrunAdi: hizliForm.ciktiUrunAdi, hammaddeAdi: hizliForm.hammaddeAdi })) return;
    if (hizliForm.girisMiktar > hizliForm.maxStok) {
      toast.error(`Stokta yetersiz! Mevcut: ${hizliForm.maxStok.toFixed(1)} ${hizliForm.birim.toLowerCase()}`);
      return;
    }

    try {
      const birimLabel = hizliForm.birim.toLowerCase();
      const fireKg = hizliForm.showFire ? hizliForm.fireMiktar : 0;
      const fireOrani = hizliForm.girisMiktar > 0 ? ((fireKg / hizliForm.girisMiktar) * 100) : 0;
      const toplamMaliyet = hizliForm.showMaliyet ? hizliCalc.toplamMaliyet : (hizliForm.girisMiktar * hizliForm.birimFiyat);
      const birimMaliyet = hizliForm.ciktiMiktar > 0 ? (toplamMaliyet / hizliForm.ciktiMiktar) : 0;

      // Kayıt oluştur (UretimKayit formatına uygun)
      const newKayit: UretimKayit = {
        id: crypto.randomUUID(),
        profileId: '__hizli_isleme__',
        profileName: 'Hızlı İşleme',
        date: new Date().toISOString(),
        hammaddeStokId: hizliForm.hammaddeStokId,
        hammaddeAdi: hizliForm.hammaddeAdi,
        toptanciAdi: '',
        trKodu: '',
        cigKg: hizliForm.girisMiktar,
        birimFiyat: hizliForm.birimFiyat,
        copKg: 0,
        temizKg: hizliForm.girisMiktar,
        copOrani: 0,
        ciktiKg: hizliForm.ciktiMiktar,
        fireKg,
        fireOrani,
        kazanSayisi: 0,
        pisSuresiSaat: 0,
        tupPerKazan: 0,
        tupBaslangicKg: 0,
        tupBitisKg: 0,
        tupKullanilanKg: 0,
        tupFiyatKg: 0,
        paketlemeMaliyeti: 0,
        isyeriMaliyeti: hizliForm.showMaliyet ? hizliForm.iscilikMaliyeti : 0,
        calisanMaliyeti: hizliForm.showMaliyet ? hizliForm.ekMaliyet : 0,
        toplamMaliyet,
        kgBasinaMaliyet: birimMaliyet,
        ciktiUrunAdi: hizliForm.ciktiUrunAdi,
        ciktiStokId: '',
        stokIslemleriYapildi: true,
        createdAt: new Date().toISOString(),
      };

      // ─── STOK İŞLEMLERİ ────────────────────────────────────
      const rawStok = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
      const currentStok = rawStok.map(s => {
        let movements = Array.isArray(s.movements) ? s.movements : [];
        if (movements.length === 0 && s.supplier_entries) {
          try {
            const parsed = typeof s.supplier_entries === 'string' ? JSON.parse(s.supplier_entries) : s.supplier_entries;
            if (parsed && Array.isArray(parsed.movements)) movements = parsed.movements;
            else if (Array.isArray(parsed)) movements = parsed.map((e: any) => ({
              id: e.id || crypto.randomUUID(), type: 'ALIS', partyName: e.supplierName || 'Bilinmeyen',
              date: e.date || new Date().toISOString(), quantity: e.quantity || 0, price: e.buyPrice || 0, totalAmount: e.totalAmount || 0,
            }));
          } catch {}
        }
        return { ...s, currentStock: s.currentStock ?? s.current_stock ?? s.stock ?? 0, movements };
      });

      // 1) Hammaddeyi stoktan düş
      const updatedStok = currentStok.map(s => {
        if (s.id === hizliForm.hammaddeStokId) {
          const newStock = Math.max(0, s.currentStock - hizliForm.girisMiktar);
          const movements = [...(s.movements || []), {
            id: crypto.randomUUID(),
            type: 'URETIM_CIKIS',
            partyName: 'Hızlı İşleme',
            date: new Date().toISOString(),
            quantity: hizliForm.girisMiktar,
            price: hizliForm.birimFiyat,
            totalAmount: hizliForm.girisMiktar * hizliForm.birimFiyat,
            description: `Hızlı işleme: ${hizliForm.girisMiktar} ${birimLabel} → ${hizliForm.ciktiMiktar} ${birimLabel} ${hizliForm.ciktiUrunAdi}${hizliForm.aciklama ? ' (' + hizliForm.aciklama + ')' : ''}`,
          }];
          return { ...s, currentStock: newStock, stock: newStock, movements, supplier_entries: JSON.stringify({ category: s.category || 'Genel', movements }) };
        }
        return s;
      });

      // 2) Çıktı ürünü stoka ekle
      const ciktiMovement = {
        id: crypto.randomUUID(),
        type: 'URETIM_GIRIS' as const,
        partyName: 'Hızlı İşleme',
        date: new Date().toISOString(),
        quantity: hizliForm.ciktiMiktar,
        price: birimMaliyet,
        totalAmount: toplamMaliyet,
        description: `Hızlı işleme: ${hizliForm.girisMiktar} ${birimLabel} ${hizliForm.hammaddeAdi} → ${hizliForm.ciktiMiktar} ${birimLabel}${fireKg > 0 ? ` (Fire: ${fireKg} ${birimLabel})` : ''}${hizliForm.aciklama ? ' | ' + hizliForm.aciklama : ''}`,
      };

      const existingCikti = updatedStok.find(s => s.name === hizliForm.ciktiUrunAdi);
      if (existingCikti) {
        const idx = updatedStok.findIndex(s => s.id === existingCikti.id);
        const newStock = (existingCikti.currentStock ?? existingCikti.stock ?? 0) + hizliForm.ciktiMiktar;
        const movements = [...(existingCikti.movements || []), ciktiMovement];
        updatedStok[idx] = {
          ...existingCikti,
          currentStock: newStock, stock: newStock, movements,
          supplier_entries: JSON.stringify({ category: existingCikti.category || 'İşlenmiş Et', movements }),
        };
        newKayit.ciktiStokId = existingCikti.id;
      } else {
        const newCiktiId = crypto.randomUUID();
        const now = new Date().toISOString();
        const hammaddeItem = updatedStok.find(s => s.id === hizliForm.hammaddeStokId);
        updatedStok.push({
          id: newCiktiId,
          name: hizliForm.ciktiUrunAdi,
          category: 'İşlenmiş Et',
          unit: hizliForm.birim,
          sellPrice: Math.round(birimMaliyet * 1.2 * 100) / 100,
          currentStock: hizliForm.ciktiMiktar,
          stock: hizliForm.ciktiMiktar,
          minStock: hammaddeItem?.minStock ?? 5,
          movements: [ciktiMovement],
          supplier_entries: JSON.stringify({ category: 'İşlenmiş Et', movements: [ciktiMovement] }),
          createdAt: now,
          created_at: now,
        });
        newKayit.ciktiStokId = newCiktiId;
      }

      setInStorage(StorageKey.STOK_DATA, updatedStok);
      setStokList(updatedStok);
      addKayit(newKayit);
      emit('uretim:completed', { kayitId: newKayit.id, inputKg: newKayit.cigKg, outputKg: newKayit.ciktiKg, productName: newKayit.ciktiUrunAdi });

      // KV Sync
      const changedItems: any[] = [];
      const updatedHammadde = updatedStok.find((s: any) => s.id === hizliForm.hammaddeStokId);
      if (updatedHammadde) changedItems.push(updatedHammadde);
      const updatedCikti = updatedStok.find((s: any) => s.id === newKayit.ciktiStokId);
      if (updatedCikti && updatedCikti.id !== updatedHammadde?.id) changedItems.push(updatedCikti);
      // sync handled by useTableSync → PouchDB → CouchDB

      toast.success(
        <div>
          <p className="font-bold">Hızlı işleme kaydedildi!</p>
          <p className="text-xs opacity-80 mt-0.5">
            {hizliForm.girisMiktar} {birimLabel} {hizliForm.hammaddeAdi} → {hizliForm.ciktiMiktar} {birimLabel} {hizliForm.ciktiUrunAdi}
          </p>
        </div>
      );
      sec.auditLog('uretim_hizli_add', newKayit.id, `${hizliForm.hammaddeAdi}→${hizliForm.ciktiUrunAdi}`);
      logActivity('custom', 'Hızlı işleme kaydı oluşturuldu', { employeeName: user?.name, page: 'Uretim', description: `${hizliForm.girisMiktar} ${birimLabel} ${hizliForm.hammaddeAdi} → ${hizliForm.ciktiMiktar} ${birimLabel} ${hizliForm.ciktiUrunAdi}` });
      setActiveView('kayitlar');
      resetHizliForm();
    } catch (error) {
      console.error('[UretimPage] handleSaveHizliIsleme HATA:', error);
      toast.error(`İşlem kaydedilirken hata: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // ─── Karışım Kaydet ────────────────────────────────────────────
  const handleSaveKarisim = async () => {
    if (!canAdd) { sec.logUnauthorized('uretim_add', 'Karışım kaydı yetki yok'); return; }
    if (karisimGirdiler.length < 2) { toast.error('En az 2 farklı hammadde seçin'); return; }
    const emptyGirdi = karisimGirdiler.find(g => g.miktar <= 0);
    if (emptyGirdi) { toast.error(`"${emptyGirdi.urunAdi}" için miktar giriniz`); return; }
    const overStock = karisimGirdiler.find(g => g.miktar > g.maxStok);
    if (overStock) { toast.error(`"${overStock.urunAdi}" stokta yetersiz! Mevcut: ${overStock.maxStok.toFixed(1)}`); return; }
    if (karisimCikti.miktar <= 0) { toast.error('Çıktı miktarı giriniz'); return; }
    if (!karisimCikti.urunAdi.trim()) { toast.error('Çıktı ürün adını giriniz'); return; }

    try {
      const toplamGirdi = karisimCalc.toplamGirdi;
      const hammaddeAdlari = karisimGirdiler.map(g => g.urunAdi).join(' + ');
      const toplamMaliyet = karisimCalc.toplamMaliyet;
      const birimMaliyet = karisimCalc.birimMaliyet;

      const newKayit: UretimKayit = {
        id: crypto.randomUUID(),
        profileId: '__karisim__',
        profileName: 'Karışım İşleme',
        date: new Date().toISOString(),
        hammaddeStokId: karisimGirdiler[0].stokId,
        hammaddeAdi: hammaddeAdlari,
        toptanciAdi: '',
        trKodu: '',
        cigKg: toplamGirdi,
        birimFiyat: toplamGirdi > 0 ? karisimCalc.hammaddeMaliyet / toplamGirdi : 0,
        copKg: 0,
        temizKg: toplamGirdi,
        copOrani: 0,
        ciktiKg: karisimCikti.miktar,
        fireKg: karisimCalc.fireKg,
        fireOrani: karisimCalc.fireOrani,
        kazanSayisi: 0,
        pisSuresiSaat: 0,
        tupPerKazan: 0,
        tupBaslangicKg: 0,
        tupBitisKg: 0,
        tupKullanilanKg: 0,
        tupFiyatKg: 0,
        paketlemeMaliyeti: 0,
        isyeriMaliyeti: karisimCikti.showMaliyet ? karisimCikti.iscilikMaliyeti : 0,
        calisanMaliyeti: karisimCikti.showMaliyet ? karisimCikti.ekMaliyet : 0,
        toplamMaliyet,
        kgBasinaMaliyet: birimMaliyet,
        ciktiUrunAdi: karisimCikti.urunAdi,
        ciktiStokId: '',
        stokIslemleriYapildi: true,
        uretimTipi: 'karisim',
        karisimGirdiler: karisimGirdiler.map(g => ({
          stokId: g.stokId,
          urunAdi: g.urunAdi,
          miktar: g.miktar,
          birim: g.birim,
          birimFiyat: g.birimFiyat,
        })),
        createdAt: new Date().toISOString(),
      };

      // Stok işlemleri
      const rawStok = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
      const currentStok = rawStok.map(s => {
        let movements = Array.isArray(s.movements) ? s.movements : [];
        if (movements.length === 0 && s.supplier_entries) {
          try {
            const parsed = typeof s.supplier_entries === 'string' ? JSON.parse(s.supplier_entries) : s.supplier_entries;
            if (parsed && Array.isArray(parsed.movements)) movements = parsed.movements;
            else if (Array.isArray(parsed)) movements = parsed.map((e: any) => ({
              id: e.id || crypto.randomUUID(), type: 'ALIS', partyName: e.supplierName || 'Bilinmeyen',
              date: e.date || new Date().toISOString(), quantity: e.quantity || 0, price: e.buyPrice || 0, totalAmount: e.totalAmount || 0,
            }));
          } catch {}
        }
        return { ...s, currentStock: s.currentStock ?? s.current_stock ?? s.stock ?? 0, movements };
      });

      // 1) Tüm hammaddeleri stoktan düş
      let updatedStok = [...currentStok];
      const changedIds: string[] = [];
      for (const girdi of karisimGirdiler) {
        updatedStok = updatedStok.map(s => {
          if (s.id === girdi.stokId) {
            const newStock = Math.max(0, s.currentStock - girdi.miktar);
            const movements = [...(s.movements || []), {
              id: crypto.randomUUID(),
              type: 'URETIM_CIKIS',
              partyName: 'Karışım İşleme',
              date: new Date().toISOString(),
              quantity: girdi.miktar,
              price: girdi.birimFiyat,
              totalAmount: girdi.miktar * girdi.birimFiyat,
              description: `Karışım: ${girdi.miktar} ${girdi.birim.toLowerCase()} → ${karisimCikti.urunAdi}`,
            }];
            changedIds.push(s.id);
            return { ...s, currentStock: newStock, stock: newStock, movements, supplier_entries: JSON.stringify({ category: s.category || 'Genel', movements }) };
          }
          return s;
        });
      }

      // 2) Çıktı ürünü stoka ekle
      const ciktiMovement = {
        id: crypto.randomUUID(),
        type: 'URETIM_GIRIS' as const,
        partyName: 'Karışım İşleme',
        date: new Date().toISOString(),
        quantity: karisimCikti.miktar,
        price: birimMaliyet,
        totalAmount: toplamMaliyet,
        description: `Karışım: ${hammaddeAdlari} → ${karisimCikti.miktar} kg ${karisimCikti.urunAdi}`,
      };

      const existingCikti = updatedStok.find(s => s.name === karisimCikti.urunAdi);
      if (existingCikti) {
        const idx = updatedStok.findIndex(s => s.id === existingCikti.id);
        const newStock = (existingCikti.currentStock ?? 0) + karisimCikti.miktar;
        const movements = [...(existingCikti.movements || []), ciktiMovement];
        updatedStok[idx] = { ...existingCikti, currentStock: newStock, stock: newStock, movements, supplier_entries: JSON.stringify({ category: existingCikti.category || 'İşlenmiş Et', movements }) };
        newKayit.ciktiStokId = existingCikti.id;
        changedIds.push(existingCikti.id);
      } else {
        const newCiktiId = crypto.randomUUID();
        const now = new Date().toISOString();
        updatedStok.push({
          id: newCiktiId, name: karisimCikti.urunAdi, category: 'Karışım', unit: 'KG',
          sellPrice: Math.round(birimMaliyet * 1.2 * 100) / 100,
          currentStock: karisimCikti.miktar, stock: karisimCikti.miktar, minStock: 5,
          movements: [ciktiMovement],
          supplier_entries: JSON.stringify({ category: 'Karışım', movements: [ciktiMovement] }),
          createdAt: now, created_at: now,
        });
        newKayit.ciktiStokId = newCiktiId;
        changedIds.push(newCiktiId);
      }

      setInStorage(StorageKey.STOK_DATA, updatedStok);
      setStokList(updatedStok);
      addKayit(newKayit);
      emit('uretim:completed', { kayitId: newKayit.id, inputKg: newKayit.cigKg, outputKg: newKayit.ciktiKg, productName: newKayit.ciktiUrunAdi });

      // sync handled by useTableSync → PouchDB → CouchDB

      toast.success(
        <div>
          <p className="font-bold">Karışım kaydedildi!</p>
          <p className="text-xs opacity-80 mt-0.5">
            {karisimGirdiler.length} hammadde → {karisimCikti.miktar} kg {karisimCikti.urunAdi}
          </p>
        </div>
      );
      sec.auditLog('uretim_karisim_add', newKayit.id, `${hammaddeAdlari}→${karisimCikti.urunAdi}`);
      logActivity('custom', 'Karışım üretim kaydı oluşturuldu', { employeeName: user?.name, page: 'Uretim', description: `${karisimGirdiler.length} hammadde → ${karisimCikti.miktar} kg ${karisimCikti.urunAdi}` });
      setActiveView('kayitlar');
      resetKarisimForm();
    } catch (error) {
      console.error('[UretimPage] handleSaveKarisim HATA:', error);
      toast.error(`Karışım kaydedilirken hata: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // ─── Analytics ───────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (kayitlar.length === 0) return null;

    const avgFire = kayitlar.reduce((s, k) => s + k.fireOrani, 0) / kayitlar.length;
    const avgCop = kayitlar.reduce((s, k) => s + k.copOrani, 0) / kayitlar.length;
    const avgMaliyet = kayitlar.reduce((s, k) => s + k.kgBasinaMaliyet, 0) / kayitlar.length;
    const toplamUretim = kayitlar.reduce((s, k) => s + k.ciktiKg, 0);
    const toplamHammadde = kayitlar.reduce((s, k) => s + k.cigKg, 0);
    const toplamMaliyet = kayitlar.reduce((s, k) => s + k.toplamMaliyet, 0);

    const supplierMap: Record<string, { count: number; totalKg: number; totalCikti: number; totalMaliyet: number; avgFire: number; avgCop: number; avgMaliyet: number; fires: number[]; cops: number[]; trKodu: string; urunler: Record<string, { count: number; totalKg: number; totalCikti: number; avgFire: number; fires: number[] }> }> = {};
    kayitlar.forEach(k => {
      const supplier = k.toptanciAdi || t('uretim.trKodu.unknown');
      if (!supplierMap[supplier]) supplierMap[supplier] = { count: 0, totalKg: 0, totalCikti: 0, totalMaliyet: 0, avgFire: 0, avgCop: 0, avgMaliyet: 0, fires: [], cops: [], trKodu: '', urunler: {} };
      if (k.trKodu && !supplierMap[supplier].trKodu) supplierMap[supplier].trKodu = k.trKodu;
      supplierMap[supplier].count++;
      supplierMap[supplier].totalKg += k.cigKg;
      supplierMap[supplier].totalCikti += k.ciktiKg;
      supplierMap[supplier].totalMaliyet += k.toplamMaliyet;
      supplierMap[supplier].fires.push(k.fireOrani);
      supplierMap[supplier].cops.push(k.copOrani);
      // Ürün bazlı
      const urunKey = k.hammaddeAdi || 'Bilinmeyen';
      if (!supplierMap[supplier].urunler[urunKey]) {
        supplierMap[supplier].urunler[urunKey] = { count: 0, totalKg: 0, totalCikti: 0, avgFire: 0, fires: [] };
      }
      supplierMap[supplier].urunler[urunKey].count++;
      supplierMap[supplier].urunler[urunKey].totalKg += k.cigKg;
      supplierMap[supplier].urunler[urunKey].totalCikti += k.ciktiKg;
      supplierMap[supplier].urunler[urunKey].fires.push(k.fireOrani);
    });
    Object.values(supplierMap).forEach(s => {
      s.avgFire = s.fires.reduce((a, b) => a + b, 0) / s.fires.length;
      s.avgCop = s.cops.reduce((a, b) => a + b, 0) / s.cops.length;
      s.avgMaliyet = s.totalKg > 0 ? s.totalMaliyet / s.totalKg : 0;
      Object.values(s.urunler).forEach(u => {
        u.avgFire = u.fires.reduce((a, b) => a + b, 0) / u.fires.length;
      });
    });

    const monthlyMap: Record<string, { count: number; totalMaliyet: number; avgFire: number; fires: number[] }> = {};
    kayitlar.forEach(k => {
      const month = k.date.substring(0, 7);
      if (!monthlyMap[month]) monthlyMap[month] = { count: 0, totalMaliyet: 0, avgFire: 0, fires: [] };
      monthlyMap[month].count++;
      monthlyMap[month].totalMaliyet += k.toplamMaliyet;
      monthlyMap[month].fires.push(k.fireOrani);
    });
    Object.values(monthlyMap).forEach(m => {
      m.avgFire = m.fires.reduce((a, b) => a + b, 0) / m.fires.length;
    });

    // Profil bazlı analiz
    const profileMap: Record<string, { name: string; count: number; totalIn: number; totalOut: number; avgFire: number; avgCop: number; fires: number[]; cops: number[] }> = {};
    kayitlar.forEach(k => {
      if (!profileMap[k.profileId]) profileMap[k.profileId] = { name: k.profileName, count: 0, totalIn: 0, totalOut: 0, avgFire: 0, avgCop: 0, fires: [], cops: [] };
      profileMap[k.profileId].count++;
      profileMap[k.profileId].totalIn += k.cigKg;
      profileMap[k.profileId].totalOut += k.ciktiKg;
      profileMap[k.profileId].fires.push(k.fireOrani);
      profileMap[k.profileId].cops.push(k.copOrani);
    });
    Object.values(profileMap).forEach(p => {
      p.avgFire = p.fires.reduce((a, b) => a + b, 0) / p.fires.length;
      p.avgCop = p.cops.reduce((a, b) => a + b, 0) / p.cops.length;
    });

    return {
      avgFire, avgCop, avgMaliyet, toplamUretim, toplamHammadde, toplamMaliyet,
      supplierMap, monthlyMap, profileMap, totalKayit: kayitlar.length,
    };
  }, [kayitlar]);

  const inputClass = "w-full px-4 py-3 bg-card/80 border border-border/60 rounded-xl text-white placeholder-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 focus:bg-card transition-all duration-300 text-sm hover:border-border/80";

  const steps = [
    t('uretim.steps.step1') || 'Profil & Hammadde',
    t('uretim.steps.step2') || 'Temizlik & Pisirme',
    t('uretim.steps.step3') || 'Masraflar',
    t('uretim.steps.step4') || 'Ozet & Kaydet'
  ];

  return (
    <div className="p-3 sm:p-6 md:p-8 space-y-4 sm:space-y-6 max-w-[1400px] mx-auto pb-4 sm:pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl md:rounded-3xl p-4 md:p-6 card-premium"
      >
        {/* Aurora background effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600/[0.06] via-red-600/[0.04] to-amber-600/[0.06] pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/[0.04] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative">
              <div className="w-11 h-11 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-xl shadow-orange-600/25">
                <Factory className="w-5 h-5 md:w-7 md:h-7 text-white" />
              </div>
              <div className="absolute -inset-1 rounded-xl md:rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-600/20 blur-md -z-10" />
            </div>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">{t('uretim.title') || 'Uretim Takip'}</h1>
              <p className="text-muted-foreground/80 text-[11px] md:text-sm mt-0.5 hidden sm:block">{t('uretim.desc') || 'Stoktan hammadde sec → isle → cikti urunu stoka ekle'}</p>
            </div>
          </div>
          {/* Quick stats in header */}
          {analytics && (
            <div className="flex items-center gap-2 md:gap-4">
              <div className="text-right">
                <p className="text-sm md:text-lg font-bold text-white tech-number">{analytics.toplamUretim.toFixed(0)}<span className="text-[10px] md:text-xs text-muted-foreground ml-0.5">kg</span></p>
                <p className="text-[9px] md:text-[10px] text-muted-foreground/60">{t('uretim.totalProduction', 'Toplam Üretim')}</p>
              </div>
              <div className="w-px h-6 md:h-8 bg-border/40" />
              <div className="text-right">
                <p className={`text-sm md:text-lg font-bold tech-number ${analytics.avgFire > 35 ? 'text-red-400' : 'text-emerald-400'}`}>%{analytics.avgFire.toFixed(1)}</p>
                <p className="text-[9px] md:text-[10px] text-muted-foreground/60">{t('uretim.avgFire', 'Ort. Fire')}</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 md:gap-1.5 p-1 md:p-1.5 rounded-xl md:rounded-2xl bg-secondary/40 border border-border/30 overflow-x-auto no-scrollbar">
        {[
          { key: 'kayitlar', label: t('uretim.tabs.history') || 'Uretim Kayitlari', shortLabel: t('uretim.tabs.history_short') || 'Kayitlar', icon: History, count: kayitlar.length },
          { key: 'hizli', label: 'Hızlı İşleme', shortLabel: 'İşleme', icon: Scissors },
          { key: 'karisim', label: 'Karışım / Kıyma', shortLabel: 'Karışım', icon: Layers },
          { key: 'yeni', label: t('uretim.tabs.new') || 'Yeni Uretim', shortLabel: t('uretim.tabs.new_short') || 'Yeni', icon: PlayCircle },
          { key: 'profiller', label: t('uretim.tabs.profiles') || 'Urun Profilleri', shortLabel: t('uretim.tabs.profiles_short') || 'Profiller', icon: Layers, count: profiles.length },
          { key: 'analiz', label: t('uretim.tabs.analytics') || 'Analiz & Raporlar', shortLabel: t('uretim.tabs.analytics_short') || 'Analiz', icon: BarChart3 },
          { key: 'kiyma', label: 'Kıyma Maliyeti', shortLabel: 'Kıyma', icon: ChefHat },
        ].map(tab => (
          <motion.button
            key={tab.key}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              setActiveView(tab.key as any);
              if (tab.key === 'yeni') { resetForm(); refreshStok(); }
              if (tab.key === 'hizli') { resetHizliForm(); refreshStok(); }
              if (tab.key === 'karisim') { resetKarisimForm(); refreshStok(); }
            }}
            className={`relative flex-1 flex items-center justify-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-2.5 md:py-2.5 rounded-lg md:rounded-xl font-medium text-[11px] md:text-sm whitespace-nowrap transition-all duration-300 active:scale-[0.97] ${
              activeView === tab.key
                ? 'bg-gradient-to-b from-orange-500/20 to-orange-600/10 text-orange-300 shadow-lg shadow-orange-500/10'
                : 'text-muted-foreground/70 hover:text-foreground/80 hover:bg-secondary/60'
            }`}
          >
            {activeView === tab.key && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 rounded-lg md:rounded-xl border border-orange-500/30 bg-orange-500/[0.08]"
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 md:gap-2">
              <tab.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden md:inline">{tab.label}</span>
              <span className="md:hidden">{tab.shortLabel}</span>
              {tab.count !== undefined && (
                <span className={`ml-0.5 px-1 md:px-1.5 py-0.5 rounded-md text-[8px] md:text-[10px] font-bold ${
                  activeView === tab.key ? 'bg-orange-500/20 text-orange-300' : 'bg-accent/50 text-muted-foreground/60'
                }`}>{tab.count}</span>
              )}
            </span>
          </motion.button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
           ANIMATED VIEW TRANSITIONS
         ═══════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
      {/* ═══════════════════════════════════════════════════════
           YENİ ÜRETİM
         ═══════════════════════════════════════════════════════ */}
      {activeView === 'yeni' && (
        <motion.div
          key="view-yeni"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4 md:space-y-6"
        >
          <StepIndicator currentStep={currentStep} steps={steps} />

          <AnimatePresence mode="wait">
            {/* ── Step 0: Profil & Hammadde ─────────────────── */}
            {currentStep === 0 && (
              <motion.div
                key="step-0"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6 space-y-4 md:space-y-6"
              >
                <div className="flex items-center gap-2.5 md:gap-3 mb-2">
                  <div className="relative">
                    <div className="w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                      <Package className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </div>
                    <div className="absolute -inset-0.5 rounded-lg md:rounded-xl bg-blue-500/15 blur-md -z-10" />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-white">{t('uretim.step1.title') || 'Profil & Hammadde Secimi'}</h2>
                    <p className="text-[11px] md:text-xs text-muted-foreground/70 hidden sm:block">{t('uretim.step1.desc') || 'Stoktan urun secip islenecek miktari belirleyin'}</p>
                  </div>
                </div>

                {/* Profile Selection */}
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2">{t('uretim.labels.profile') || 'Uretim Profili'}</label>
                  {profiles.length === 0 ? (
                    <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 text-center">
                      <p className="text-orange-400 text-sm mb-2">{t('uretim.empty.profile') || 'Henuz uretim profili olusturulmamis'}</p>
                      <button onClick={() => setActiveView('profiller')} className="text-xs text-blue-400 hover:text-blue-300">
                        {t('uretim.empty.createProfile') || 'Profil olusturmak icin tiklayin &rarr;'}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {profiles.map((profile, i) => (
                        <motion.button
                          key={profile.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05, duration: 0.3 }}
                          whileHover={{ scale: 1.03, y: -2 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleProfileSelect(profile)}
                          className={`p-3 sm:p-4 rounded-xl border text-left transition-all active:scale-[0.97] ${
                            selectedProfile?.id === profile.id
                              ? 'bg-orange-600/15 border-orange-500/40 ring-1 ring-orange-500/20'
                              : 'glass-light border-border/30 hover:border-border/50'
                          }`}
                        >
                          <p className="text-sm font-semibold text-white mb-1">{profile.name}</p>
                          <div className="text-[10px] text-muted-foreground space-y-0.5">
                            {profile.avgFireOrani > 0 && <p>Ort. Fire: %{profile.avgFireOrani.toFixed(1)}</p>}
                            {profile.avgCopOrani > 0 && <p>Ort. Cop: %{profile.avgCopOrani.toFixed(1)}</p>}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Üretim Tipi Seçimi */}
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    İşlem Tipi
                  </label>
                  <div className="flex rounded-xl overflow-hidden border border-border/50 bg-secondary/30">
                    {([
                      { key: 'pisirme', label: 'Pişirme / Kavurma', icon: Flame, desc: 'Kazan, tüp ve ateş gerektirir' },
                      { key: 'kiyma', label: 'Kıyma İşleme', icon: Scissors, desc: 'Sadece temizleme & öğütme' },
                    ] as const).map(item => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, uretimTipi: item.key, kazanSayisi: 1 }))}
                        className={`flex-1 flex items-center gap-2 px-3 py-3 text-sm font-medium transition-all ${
                          form.uretimTipi === item.key
                            ? item.key === 'pisirme'
                              ? 'bg-orange-600/20 text-orange-300 border-r border-orange-500/20'
                              : 'bg-emerald-600/20 text-emerald-300'
                            : 'text-muted-foreground/70 hover:bg-secondary/60'
                        }`}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <div className="text-left min-w-0">
                          <p className="font-semibold leading-none">{item.label}</p>
                          <p className="text-[10px] opacity-60 mt-0.5 hidden sm:block">{item.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stoktan Hammadde Seçimi */}
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2">
                    <span className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-blue-400" />
                      {t('uretim.labels.select_raw') || 'Stoktan Hammadde Sec'}
                    </span>
                  </label>
                  <StokSearchSelect
                    value={form.hammaddeStokId}
                    onSelect={handleStokSelect}
                    stokList={stokList}
                  />
                </div>

                {form.hammaddeStokId && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4"
                  >
                    {/* Ürün Bilgisi */}
                    <div className="p-2.5 md:p-4 rounded-xl bg-blue-600/5 border border-blue-600/15">
                      <div className="flex items-center gap-1.5 mb-1.5 md:mb-2">
                        <Info className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
                        <span className="text-[10px] md:text-xs text-blue-400 font-medium">{t('uretim.labels.selectedInfo') || 'Secilen Urun'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 md:gap-4 text-center">
                        <div>
                          <p className="text-xs md:text-lg font-bold text-white truncate">{form.hammaddeAdi}</p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground">Urun</p>
                        </div>
                        <div>
                          <p className="text-xs md:text-lg font-bold text-emerald-400">{form.maxStok.toFixed(1)}kg</p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground">Stok</p>
                        </div>
                        <div>
                          <p className="text-xs md:text-lg font-bold text-blue-400">₺{form.birimFiyat.toFixed(0)}</p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground">Fiyat</p>
                        </div>
                      </div>
                    </div>

                    {/* Toptancı Seçimi */}
                    <div className="p-3 md:p-5 rounded-xl glass-light space-y-3 md:space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 md:gap-2">
                          <Truck className="w-3 h-3 md:w-4 md:h-4 text-purple-400" />
                          <h3 className="text-xs md:text-sm font-semibold text-foreground/80">{t('uretim.labels.select_supplier') || 'Toptanci Sec'}</h3>
                        </div>
                        {stokSuppliers.length > 0 && (
                          <span className="text-[9px] md:text-[10px] text-muted-foreground/60">{stokSuppliers.length} toptanci</span>
                        )}
                      </div>

                      {stokSuppliers.length > 0 ? (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
                            {stokSuppliers.map((supplier, idx) => {
                              const isSelected = form.toptanciAdi === supplier.name;
                              return (
                                <motion.button
                                  key={supplier.name}
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: idx * 0.05 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => handleSupplierSelect(supplier)}
                                  className={`p-2.5 md:p-4 rounded-lg md:rounded-xl border text-left transition-all relative overflow-hidden ${
                                    isSelected
                                      ? 'bg-purple-600/15 border-purple-500/40 ring-1 ring-purple-500/20'
                                      : 'bg-card/60 border-border/30 hover:border-purple-500/20'
                                  }`}
                                >
                                  {isSelected && <CheckCircle className="absolute top-2 right-2 w-3.5 h-3.5 md:w-4 md:h-4 text-purple-400" />}
                                  {idx === 0 && !isSelected && <Star className="absolute top-2 right-2 w-2.5 h-2.5 md:w-3 md:h-3 text-yellow-500" />}
                                  <p className="text-xs md:text-sm font-semibold text-white mb-1.5 md:mb-2 pr-5">{supplier.name}</p>
                                  {/* Mobile: compact 2-line summary */}
                                  <div className="sm:hidden flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <span className="text-emerald-400 font-medium">₺{supplier.lastPrice.toFixed(0)}/kg</span>
                                    <span>•</span>
                                    <span>{supplier.totalKg.toFixed(0)}kg</span>
                                    <span>•</span>
                                    <span>{supplier.count}x</span>
                                  </div>
                                  {/* Desktop: full details */}
                                  <div className="hidden sm:block space-y-1 text-[11px]">
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>Son Fiyat:</span>
                                      <span className="text-emerald-400 font-medium">₺{supplier.lastPrice.toFixed(2)}/kg</span>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>Ort. Fiyat:</span>
                                      <span className="text-blue-400 font-medium">₺{supplier.avgPrice.toFixed(2)}/kg</span>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>Toplam:</span>
                                      <span className="text-white font-medium">{supplier.totalKg.toFixed(1)}kg / {supplier.count} alis</span>
                                    </div>
                                  </div>
                                  {supplier.avgPrice > 0 && supplier.lastPrice > supplier.avgPrice * 1.1 && (
                                    <div className="mt-1 md:mt-2 flex items-center gap-1 text-[9px] text-orange-400">
                                      <AlertTriangle className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                      <span className="hidden sm:inline">Son fiyat ortalamadan %{(((supplier.lastPrice - supplier.avgPrice) / supplier.avgPrice) * 100).toFixed(0)} yuksek</span>
                                      <span className="sm:hidden">+%{(((supplier.lastPrice - supplier.avgPrice) / supplier.avgPrice) * 100).toFixed(0)} ort. ustu</span>
                                    </div>
                                  )}
                                </motion.button>
                              );
                            })}
                          </div>

                          {/* Toptancı bilgisi yoksa veya farklı bir toptancı girmek istiyorsa */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-border/30">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">veya elle girin:</span>
                            <input
                              value={form.toptanciAdi}
                              onChange={e => { const v = e.target.value; setForm({ ...form, toptanciAdi: v, trKodu: findTrKodu(v) }); }}
                              className={inputClass}
                              placeholder="Farkli bir toptanci yazin..."
                            />
                          </div>
                        </>
                      ) : (
                        <div>
                          <div className="p-3 rounded-lg bg-secondary/30 border border-border/20 mb-3">
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5" />
                              Bu urun icin stok hareketlerinde toptanci kaydı bulunamadi
                            </p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Toptanci / Tedarikci Adi</label>
                            <input
                              value={form.toptanciAdi}
                              onChange={e => { const v = e.target.value; setForm({ ...form, toptanciAdi: v, trKodu: findTrKodu(v) }); }}
                              className={inputClass}
                              placeholder="Toptanci adini girin..."
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* TR Kodu — Onaylı İşletme Numarası */}
                    {form.toptanciAdi && (
                      <div className="p-3 md:p-4 rounded-xl bg-gradient-to-r from-emerald-500/5 to-teal-500/5 border border-emerald-500/15">
                        <div className="flex items-center gap-2 mb-2">
                          <BadgeCheck className="w-4 h-4 text-emerald-400" />
                          <label className="text-xs md:text-sm font-semibold text-white">{t('uretim.trKodu.label')}</label>
                        </div>
                        <input
                          value={form.trKodu}
                          onChange={e => setForm({ ...form, trKodu: e.target.value })}
                          className={inputClass}
                          placeholder={t('uretim.trKodu.placeholder')}
                        />
                        <p className="text-[10px] md:text-[11px] text-muted-foreground/70 mt-1.5">
                          {form.trKodu
                            ? `✅ ${t('uretim.trKodu.filled')}`
                            : t('uretim.trKodu.empty')}
                        </p>
                      </div>
                    )}

                    {/* Miktar & Fiyat */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-2">
                          Islenecek Miktar (kg)
                          <span className="text-[10px] text-emerald-400 ml-2">Max: {form.maxStok.toFixed(1)} kg</span>
                        </label>
                        <input
                          type="number"
                          value={form.cigKg || ''}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setForm({ ...form, cigKg: val });
                          }}
                          className={`${inputClass} ${form.cigKg > form.maxStok ? 'border-red-500/50 ring-1 ring-red-500/20' : ''}`}
                          placeholder="100"
                          min={0}
                          max={form.maxStok}
                          step={0.1}
                        />
                        {form.cigKg > form.maxStok && (
                          <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Stok yetersiz! {form.maxStok.toFixed(1)} kg mevcut
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-2">
                          Birim Fiyat (TL/kg)
                          {form.toptanciAdi && stokSuppliers.find(s => s.name === form.toptanciAdi) && (
                            <span className="text-[10px] text-purple-400 ml-2">
                              ({form.toptanciAdi} son fiyati)
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          value={form.birimFiyat || ''}
                          onChange={e => setForm({ ...form, birimFiyat: Number(e.target.value) })}
                          className={inputClass}
                          placeholder="150"
                          min={0}
                          step={0.01}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className="flex justify-end mt-6">
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setCurrentStep(1)}
                    disabled={!selectedProfile || !form.hammaddeStokId || form.cigKg <= 0 || form.cigKg > form.maxStok}
                    className="flex items-center justify-center w-full md:w-auto gap-2 px-6 py-3.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 disabled:from-muted disabled:to-muted disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 transition-all duration-300"
                  >
                    {t('uretim.buttons.next') || 'Sonraki Adim'}
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── Step 1: Temizlik & Pişirme ────────────────── */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6 space-y-4 md:space-y-6"
              >
                <div className="flex items-center gap-2.5 md:gap-3 mb-2">
                  <div className="relative">
                    <div className="w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                      <Flame className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </div>
                    <div className="absolute -inset-0.5 rounded-lg md:rounded-xl bg-orange-500/15 blur-md -z-10" />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-white">
                      {form.uretimTipi === 'kiyma' ? 'Temizlik & Kıyma İşleme' : (t('uretim.step2.title') || 'Temizlik & Pisirme')}
                    </h2>
                    <p className="text-[11px] md:text-xs text-muted-foreground/70 hidden sm:block">
                      {form.uretimTipi === 'kiyma'
                        ? 'Cop/Sinir cikarildiktan sonra kalan et kıymaya islenir'
                        : (t('uretim.step2.desc') || 'Cop cikarildiktan sonra kalan miktar otomatik hesaplanir')}
                    </p>
                  </div>
                </div>

                {/* Çöp / Atık Bölümü */}
                <div className="p-3 md:p-5 rounded-xl glass-light space-y-3 md:space-y-4">
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <Trash2 className="w-3 h-3 md:w-4 md:h-4 text-orange-400" />
                    <h3 className="text-xs md:text-sm font-semibold text-foreground/80">Cop / Atik</h3>
                  </div>

                  <div className="grid grid-cols-3 gap-2 md:gap-4">
                    <div>
                      <label className="block text-[9px] md:text-xs font-medium text-muted-foreground mb-1">Girdi</label>
                      <div className="px-2 md:px-4 py-2 md:py-3 bg-card/50 border border-border/30 rounded-lg md:rounded-xl text-white text-xs md:text-sm font-bold tech-number">
                        {form.cigKg.toFixed(1)}kg
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] md:text-xs font-medium text-muted-foreground mb-1">
                        Cop (kg)
                        {calc.copOrani > 0 && <span className="text-orange-400 ml-0.5 md:ml-1">%{calc.copOrani.toFixed(0)}</span>}
                      </label>
                      <input type="number" value={form.copKg || ''}
                        onChange={e => { const val = Math.min(Number(e.target.value), form.cigKg); setForm({ ...form, copKg: Math.max(0, val) }); }}
                        className="w-full px-2 md:px-4 py-2 md:py-3 bg-card border border-border rounded-lg md:rounded-xl text-white placeholder-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-xs md:text-sm"
                        placeholder="0" min={0} max={form.cigKg} step={0.1} />
                    </div>
                    <div>
                      <label className="block text-[9px] md:text-xs font-medium text-emerald-400 mb-1">Temiz</label>
                      <div className="px-2 md:px-4 py-2 md:py-3 bg-emerald-600/10 border border-emerald-600/25 rounded-lg md:rounded-xl text-emerald-400 text-xs md:text-sm font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 md:w-4 md:h-4 hidden sm:block" />
                        {calc.temizKg.toFixed(1)}kg
                      </div>
                    </div>
                  </div>

                  {form.copKg > 0 && (
                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-orange-500/5 border border-orange-500/15">
                      <Info className="w-3 h-3 text-orange-400 flex-shrink-0" />
                      <p className="text-[10px] md:text-[11px] text-orange-300">
                        <span className="hidden sm:inline">{form.cigKg.toFixed(1)}kg etten {form.copKg.toFixed(1)}kg cop cikarildi, kalan {calc.temizKg.toFixed(1)}kg temiz et</span>
                        <span className="sm:hidden">{form.copKg.toFixed(1)}kg cop → {calc.temizKg.toFixed(1)}kg temiz</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Pişirme / Kıyma Bölümü */}
                <div className="p-3 md:p-5 rounded-xl glass-light space-y-3 md:space-y-4">
                  <div className="flex items-center gap-1.5 md:gap-2">
                    {form.uretimTipi === 'kiyma'
                      ? <Scissors className="w-3 h-3 md:w-4 md:h-4 text-emerald-400" />
                      : <Flame className="w-3 h-3 md:w-4 md:h-4 text-red-400" />}
                    <h3 className="text-xs md:text-sm font-semibold text-foreground/90">
                      {form.uretimTipi === 'kiyma' ? 'Kıyma İşleme' : 'Pisirme'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-3 gap-2 md:gap-4">
                    <div>
                      <label className="block text-[9px] md:text-xs font-medium text-muted-foreground mb-1">Giren</label>
                      <div className="px-2 md:px-4 py-2 md:py-3 bg-card/50 border border-border/30 rounded-lg md:rounded-xl text-white text-xs md:text-sm font-bold tech-number">
                        {calc.temizKg.toFixed(1)}kg
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] md:text-xs font-medium text-muted-foreground mb-1">
                        {form.uretimTipi === 'kiyma' ? 'Kıyma Çıktı (kg)' : 'Cikti (kg)'}
                      </label>
                      <input type="number" value={form.ciktiKg || ''}
                        onChange={e => { const val = Math.min(Number(e.target.value), calc.temizKg); setForm({ ...form, ciktiKg: Math.max(0, val) }); }}
                        className="w-full px-2 md:px-4 py-2 md:py-3 bg-card border border-border rounded-lg md:rounded-xl text-white placeholder-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-xs md:text-sm"
                        placeholder={form.uretimTipi === 'kiyma' ? `${(calc.temizKg * 0.95).toFixed(0)}` : `${(calc.temizKg * 0.7).toFixed(0)}`}
                        min={0} max={calc.temizKg} step={0.1} />
                    </div>
                    <div>
                      <label className="block text-[9px] md:text-xs font-medium text-red-400 mb-1">Fire</label>
                      <div className="px-2 md:px-4 py-2 md:py-3 bg-red-600/10 border border-red-600/25 rounded-lg md:rounded-xl flex items-center justify-between">
                        <span className="text-red-400 text-xs md:text-sm font-bold">%{calc.fireOrani.toFixed(1)}</span>
                        <span className="text-[9px] md:text-xs text-muted-foreground hidden sm:inline">{calc.fireKg.toFixed(1)}kg</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Çıktı Ürün Adı - Pişirme sonrası hemen seç */}
                {form.ciktiKg > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 md:p-5 rounded-xl bg-gradient-to-br from-emerald-500/5 to-green-500/5 border border-emerald-500/20 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs md:text-sm font-semibold text-emerald-300">Cikti Urun Adi</h3>
                      <span className="text-[9px] md:text-[10px] text-emerald-400/60 ml-auto">+{form.ciktiKg} kg stoka eklenecek</span>
                    </div>
                    <CiktiUrunSelect
                      value={form.ciktiUrunAdi}
                      onChange={(val) => setForm(prev => ({ ...prev, ciktiUrunAdi: val }))}
                      stokList={stokList}
                      hammaddeAdi={form.hammaddeAdi}
                    />
                    {form.ciktiUrunAdi && stokList.find(s => s.name === form.ciktiUrunAdi) && (
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-blue-600/5 border border-blue-600/15">
                        <Info className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <p className="text-[10px] md:text-[11px] text-blue-300">
                          Mevcut stok: {((stokList.find(s => s.name === form.ciktiUrunAdi)?.currentStock ?? 0)).toFixed(1)} kg &bull; Urun mevcut, uzerine eklenecek
                        </p>
                      </div>
                    )}
                    {form.ciktiUrunAdi && !stokList.find(s => s.name === form.ciktiUrunAdi) && (
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-600/5 border border-emerald-600/15">
                        <Sparkles className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <p className="text-[10px] md:text-[11px] text-emerald-300">Yeni urun olarak stoka eklenecek</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Akış Görseli */}
                <FlowVisualization
                  cigKg={form.cigKg}
                  copKg={form.copKg}
                  temizKg={calc.temizKg}
                  ciktiKg={form.ciktiKg}
                  fireKg={calc.fireKg}
                  copOrani={calc.copOrani}
                  fireOrani={calc.fireOrani}
                  hammaddeAdi={form.hammaddeAdi}
                  ciktiAdi={form.ciktiUrunAdi}
                />

                {/* Kazan & Tüp/Gaz Sistemi — sadece pişirme modunda */}
                {form.uretimTipi !== 'kiyma' && (<div className="p-3 md:p-5 rounded-xl bg-gradient-to-br from-muted/80 to-secondary/50 border border-orange-500/[0.08] space-y-3 md:space-y-5 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-orange-500/25 to-transparent" />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/15 flex items-center justify-center shadow-md shadow-orange-500/10">
                        <Flame className="w-3.5 h-3.5 md:w-4 md:h-4 text-orange-400" />
                      </div>
                      <div>
                        <h3 className="text-xs md:text-sm font-semibold text-white">Kazan & Tup</h3>
                        <p className="text-[9px] md:text-[10px] text-muted-foreground/60 hidden sm:block">Her kazan {form.pisSuresiSaat} saat, {form.tupPerKazan} kg tup</p>
                      </div>
                    </div>
                    <div className="px-2.5 md:px-3.5 py-1.5 md:py-2 rounded-xl bg-orange-500/8 border border-orange-500/15 text-right">
                      <p className="text-[8px] md:text-[10px] text-muted-foreground/60 uppercase tracking-wider">Tup Maliyeti</p>
                      <p className="text-xs md:text-sm font-bold text-orange-400 tech-number">₺{(calc.tupKullanilanKg * form.tupFiyatKg).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
                    </div>
                  </div>

                  {/* Kazan Sayısı */}
                  <div>
                    <label className="block text-[10px] md:text-xs font-medium text-muted-foreground mb-2">Kazan Sayisi</label>
                    <div className="flex items-center gap-2 md:gap-4">
                      <motion.button whileTap={{ scale: 0.9 }}
                        onClick={() => setForm({ ...form, kazanSayisi: Math.max(1, form.kazanSayisi - 1) })}
                        className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-secondary hover:bg-accent border border-border/50 text-white font-bold text-sm md:text-lg flex items-center justify-center">
                        -
                      </motion.button>
                      
                      {/* Desktop: visual kazans */}
                      <div className="hidden md:flex flex-1 items-center justify-center gap-2 py-3 px-4 bg-card rounded-xl border border-border/40">
                        {Array.from({ length: Math.min(form.kazanSayisi, 8) }).map((_, i) => (
                          <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 200, damping: 20 }}>
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-b from-orange-500/20 to-red-600/10 border border-orange-500/25 flex flex-col items-center justify-center">
                              <motion.div animate={{ y: [0, -1.5, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.25, ease: 'easeInOut' }}>
                                <Flame className="w-4 h-4 text-orange-400" />
                              </motion.div>
                              <span className="text-[8px] text-orange-400/60 font-bold">{i + 1}</span>
                            </div>
                          </motion.div>
                        ))}
                        {form.kazanSayisi > 8 && <span className="text-xs text-muted-foreground ml-1">+{form.kazanSayisi - 8}</span>}
                      </div>

                      {/* Mobile: simple counter */}
                      <div className="md:hidden flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-card rounded-lg border border-border/40">
                        {Array.from({ length: Math.min(form.kazanSayisi, 4) }).map((_, i) => (
                          <Flame key={i} className="w-3.5 h-3.5 text-orange-400/70" />
                        ))}
                        {form.kazanSayisi > 4 && <span className="text-[10px] text-muted-foreground">+{form.kazanSayisi - 4}</span>}
                        <span className="text-lg font-bold text-white ml-2">{form.kazanSayisi}</span>
                      </div>

                      <motion.button whileTap={{ scale: 0.9 }}
                        onClick={() => setForm({ ...form, kazanSayisi: form.kazanSayisi + 1 })}
                        className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-400 font-bold text-sm md:text-lg flex items-center justify-center">
                        +
                      </motion.button>

                      <div className="hidden md:block text-center min-w-[50px]">
                        <p className="text-2xl font-bold text-white">{form.kazanSayisi}</p>
                        <p className="text-[9px] text-muted-foreground">kazan</p>
                      </div>
                    </div>
                  </div>

                  {/* Kazan Parametreleri */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                    <div className="p-2 md:p-3 rounded-lg md:rounded-xl bg-card/70 border border-border/30">
                      <label className="flex items-center gap-1 text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        <Clock className="w-2.5 h-2.5 md:w-3 md:h-3 text-blue-400" /> Sure
                      </label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={form.pisSuresiSaat || ''}
                          onChange={e => setForm({ ...form, pisSuresiSaat: Math.max(0.5, Number(e.target.value)) })}
                          className="w-full px-2 py-1.5 bg-background border border-border/40 rounded-md text-white text-xs md:text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                          min={0.5} step={0.5} />
                        <span className="text-[9px] md:text-xs text-muted-foreground whitespace-nowrap">sa</span>
                      </div>
                    </div>
                    <div className="p-2 md:p-3 rounded-lg md:rounded-xl bg-card/70 border border-border/30">
                      <label className="flex items-center gap-1 text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        <Thermometer className="w-2.5 h-2.5 md:w-3 md:h-3 text-orange-400" /> Tup/Kzn
                      </label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={form.tupPerKazan || ''}
                          onChange={e => setForm({ ...form, tupPerKazan: Math.max(0.1, Number(e.target.value)) })}
                          className="w-full px-2 py-1.5 bg-background border border-border/40 rounded-md text-white text-xs md:text-sm font-bold focus:outline-none focus:ring-1 focus:ring-orange-500/40"
                          min={0.1} step={0.5} />
                        <span className="text-[9px] md:text-xs text-muted-foreground whitespace-nowrap">kg</span>
                      </div>
                    </div>
                    <div className="p-2 md:p-3 rounded-lg md:rounded-xl bg-card/70 border border-border/30">
                      <label className="flex items-center gap-1 text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        <DollarSign className="w-2.5 h-2.5 md:w-3 md:h-3 text-emerald-400" /> Tup ₺
                      </label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={form.tupFiyatKg || ''}
                          onChange={e => setForm({ ...form, tupFiyatKg: Math.max(0, Number(e.target.value)) })}
                          className="w-full px-2 py-1.5 bg-background border border-border/40 rounded-md text-white text-xs md:text-sm font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                          min={0} step={1} />
                        <span className="text-[9px] md:text-xs text-muted-foreground whitespace-nowrap">TL</span>
                      </div>
                    </div>
                    <div className="p-2 md:p-3 rounded-lg md:rounded-xl bg-gradient-to-br from-orange-500/5 to-red-500/5 border border-orange-500/15 flex flex-col justify-center">
                      <p className="text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase mb-1">Toplam</p>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 md:w-4 md:h-4 text-blue-400" />
                        <span className="text-base md:text-lg font-bold text-white">{calc.toplamPisSuresi}</span>
                        <span className="text-[9px] md:text-xs text-muted-foreground">sa</span>
                      </div>
                    </div>
                  </div>

                  {/* Tüketim Özet */}
                  <div className="p-2.5 md:p-4 rounded-lg md:rounded-xl bg-gradient-to-r from-orange-500/5 via-red-500/5 to-orange-500/5 border border-orange-500/15">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-1.5">
                        <Flame className="w-3 h-3 md:w-4 md:h-4 text-orange-400" />
                        <span className="text-[10px] md:text-xs font-semibold text-foreground/90">Tup Tuketimi</span>
                      </div>
                      <span className="text-[10px] md:text-xs text-muted-foreground">
                        {form.kazanSayisi}×{form.tupPerKazan}kg = <span className="text-orange-400 font-bold">{calc.tupKullanilanKg.toFixed(1)}kg</span>
                      </span>
                    </div>
                    
                    {/* Gauge */}
                    <div className="relative h-6 md:h-8 bg-card rounded-full overflow-hidden border border-border/30">
                      <motion.div initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.min(1, calc.tupKullanilanKg / Math.max(1, form.kazanSayisi * form.tupPerKazan * 2)) }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        style={{ transformOrigin: 'left' }}
                        className="absolute inset-y-0 inset-x-0 bg-gradient-to-r from-orange-600/60 via-red-500/50 to-orange-500/40 rounded-full" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] md:text-xs font-bold text-white drop-shadow-lg">
                          {calc.tupKullanilanKg.toFixed(1)}kg × ₺{form.tupFiyatKg} = ₺{(calc.tupKullanilanKg * form.tupFiyatKg).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>

                    {/* Kazan detay - hide on mobile, show on desktop */}
                    <div className="hidden md:flex mt-3 flex-wrap gap-2">
                      {Array.from({ length: Math.min(form.kazanSayisi, 6) }).map((_, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card/60 border border-border/20">
                          <Flame className="w-3 h-3 text-orange-400/70" />
                          <span className="text-[10px] text-muted-foreground">K{i + 1}:</span>
                          <span className="text-[10px] text-white font-medium">{form.tupPerKazan}kg</span>
                          <span className="text-[10px] text-muted-foreground/50">•</span>
                          <span className="text-[10px] text-blue-400">{form.pisSuresiSaat}sa</span>
                          <span className="text-[10px] text-muted-foreground/50">•</span>
                          <span className="text-[10px] text-orange-400">₺{(form.tupPerKazan * form.tupFiyatKg).toFixed(0)}</span>
                        </div>
                      ))}
                      {form.kazanSayisi > 6 && (
                        <div className="flex items-center px-2.5 py-1 rounded-lg bg-card/60 border border-border/20">
                          <span className="text-[10px] text-muted-foreground">+{form.kazanSayisi - 6} kazan daha</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>)}

                <div className="flex flex-col-reverse md:flex-row justify-between gap-3 mt-6">
                  <button onClick={() => setCurrentStep(0)} className="w-full md:w-auto px-6 py-3.5 sm:py-3 bg-secondary/50 hover:bg-accent/50 active:bg-accent/70 text-muted-foreground hover:text-foreground/90 font-medium rounded-xl border border-border/30 transition-all duration-300">
                    {t('uretim.buttons.back') || 'Geri'}
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setCurrentStep(2)}
                    disabled={form.ciktiKg <= 0 || !form.ciktiUrunAdi.trim()}
                    className="flex items-center justify-center w-full md:w-auto gap-2 px-6 py-3.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 disabled:from-muted disabled:to-muted disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 transition-all duration-300"
                  >
                    {t('uretim.buttons.next') || 'Sonraki Adim'} <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Masraflar ─────────────────────────── */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6 space-y-4 md:space-y-6"
              >
                <div className="flex items-center gap-2.5 md:gap-3 mb-2">
                  <div className="relative">
                    <div className="w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </div>
                    <div className="absolute -inset-0.5 rounded-lg md:rounded-xl bg-emerald-500/15 blur-md -z-10" />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-white">{t('uretim.step3.title') || 'Masraflar & Maliyetler'}</h2>
                    <p className="text-[11px] md:text-xs text-muted-foreground/70 hidden sm:block">{t('uretim.step3.desc') || 'Onceki uretimden kalan degerler varsayilan olarak yuklenir'}</p>
                  </div>
                </div>

                {/* Tüp/Gaz Özet Kartı — sadece pişirme modunda */}
                {form.uretimTipi !== 'kiyma' && (<div className="p-2.5 md:p-4 rounded-xl bg-gradient-to-r from-orange-500/5 to-red-500/5 border border-orange-500/15">
                  <div className="flex items-center gap-1.5 mb-2 md:mb-3">
                    <Flame className="w-3 h-3 md:w-4 md:h-4 text-orange-400" />
                    <span className="text-xs md:text-sm font-semibold text-white">Kazan & Tup</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 md:gap-3">
                    <div className="text-center p-1.5 md:p-2.5 rounded-md md:rounded-lg bg-card/60 border border-border/20">
                      <p className="text-sm md:text-lg font-bold text-white">{form.kazanSayisi}</p>
                      <p className="text-[8px] md:text-[10px] text-muted-foreground">Kazan</p>
                    </div>
                    <div className="text-center p-1.5 md:p-2.5 rounded-md md:rounded-lg bg-card/60 border border-border/20">
                      <p className="text-sm md:text-lg font-bold text-blue-400">{calc.toplamPisSuresi}sa</p>
                      <p className="text-[8px] md:text-[10px] text-muted-foreground">Sure</p>
                    </div>
                    <div className="text-center p-1.5 md:p-2.5 rounded-md md:rounded-lg bg-card/60 border border-border/20">
                      <p className="text-sm md:text-lg font-bold text-orange-400">{calc.tupKullanilanKg.toFixed(0)}kg</p>
                      <p className="text-[8px] md:text-[10px] text-muted-foreground">Tup</p>
                    </div>
                    <div className="text-center p-1.5 md:p-2.5 rounded-md md:rounded-lg bg-orange-500/10 border border-orange-500/20">
                      <p className="text-sm md:text-lg font-bold text-orange-400">₺{(calc.tupMaliyet / 1000 >= 1 ? (calc.tupMaliyet / 1000).toFixed(0) + 'K' : calc.tupMaliyet.toFixed(0))}</p>
                      <p className="text-[8px] md:text-[10px] text-muted-foreground">Maliyet</p>
                    </div>
                  </div>
                </div>)}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4">
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-foreground/90 mb-1 md:mb-2">
                      <span className="flex items-center gap-1"><Box className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-400" />Paketleme ₺/kg</span>
                    </label>
                    <input type="number" value={form.paketlemeMaliyeti || ''} onChange={e => setForm({ ...form, paketlemeMaliyeti: Number(e.target.value) })} className={inputClass} min={0} step={0.01} />
                  </div>
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-foreground/90 mb-1 md:mb-2">
                      <span className="flex items-center gap-1"><Zap className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-400" />Isyeri ₺/kg</span>
                    </label>
                    <input type="number" value={form.isyeriMaliyeti || ''} onChange={e => setForm({ ...form, isyeriMaliyeti: Number(e.target.value) })} className={inputClass} min={0} step={0.01} />
                  </div>
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-foreground/90 mb-1 md:mb-2">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3 md:w-3.5 md:h-3.5 text-purple-400" />Calisan ₺/kg</span>
                    </label>
                    <input type="number" value={form.calisanMaliyeti || ''} onChange={e => setForm({ ...form, calisanMaliyeti: Number(e.target.value) })} className={inputClass} min={0} step={0.01} />
                  </div>
                </div>

                <div className="flex flex-col-reverse md:flex-row justify-between gap-3 mt-6">
                  <button onClick={() => setCurrentStep(1)} className="w-full md:w-auto px-6 py-3.5 sm:py-3 bg-secondary/50 hover:bg-accent/50 active:bg-accent/70 text-muted-foreground hover:text-foreground/90 font-medium rounded-xl border border-border/30 transition-all duration-300">
                    {t('uretim.buttons.back') || 'Geri'}
                  </button>
                  <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }} onClick={() => setCurrentStep(3)}
                    className="flex items-center justify-center w-full md:w-auto gap-2 px-6 py-3.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 transition-all duration-300">
                    {t('uretim.buttons.summary') || 'Ozet & Kaydet'} <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Özet & Kaydet ─────────────────────── */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-6"
              >
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                  <AnimatedStat label={t('stok.rawMaterial', 'Hammadde')} value={`${form.cigKg}kg`} icon={Package} color="blue" />
                  <AnimatedStat label={t('stok.output', 'Cikti')} value={`${form.ciktiKg}kg`} icon={Flame} color="green" />
                  <AnimatedStat label={t('stok.fireLoss', 'Fire')} value={`%${calc.fireOrani.toFixed(1)}`} icon={TrendingDown} color="red" alert={calc.fireOrani > 40} />
                  <AnimatedStat label={t('stok.waste', 'Cop')} value={`${form.copKg}kg (%${calc.copOrani.toFixed(0)})`} icon={Trash2} color="orange" />
                </div>

                {/* Flow */}
                <FlowVisualization
                  cigKg={form.cigKg} copKg={form.copKg} temizKg={calc.temizKg}
                  ciktiKg={form.ciktiKg} fireKg={calc.fireKg} copOrani={calc.copOrani}
                  fireOrani={calc.fireOrani} hammaddeAdi={form.hammaddeAdi} ciktiAdi={form.ciktiUrunAdi}
                />

                {/* Tedarikçi & TR Kodu Bilgisi */}
                {(form.toptanciAdi || form.trKodu) && (
                  <div className="p-3 md:p-4 rounded-xl card-premium flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent" />
                    {form.toptanciAdi && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <Truck className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{t('uretim.trKodu.supplier')}</p>
                          <p className="text-sm font-semibold text-white">{form.toptanciAdi}</p>
                        </div>
                      </div>
                    )}
                    {form.toptanciAdi && form.trKodu && <div className="hidden sm:block w-px h-8 bg-border/30" />}
                    {form.trKodu && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{t('uretim.trKodu.labelShort')}</p>
                          <p className="text-sm font-bold text-emerald-400 font-mono tracking-wider">{form.trKodu}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Cost Breakdown */}
                <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
                  <div className="flex items-center gap-2.5 mb-3 md:mb-5">
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-emerald-600/20 to-green-500/10 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h2 className="text-sm md:text-lg font-bold text-white">Maliyet Dokumu</h2>
                  </div>

                  <div className="space-y-1.5 md:space-y-3">
                    {[
                      { label: 'Hammadde', value: calc.hammaddeMaliyet, desc: `${form.cigKg}kg × ₺${form.birimFiyat}`, color: 'text-blue-400' },
                      { label: 'Tup/Gaz', value: calc.tupMaliyet, desc: `${calc.tupKullanilanKg.toFixed(1)}kg × ₺${form.tupFiyatKg}`, color: 'text-orange-400' },
                      { label: 'Paketleme', value: calc.paketMaliyet, desc: `${form.ciktiKg}kg × ₺${form.paketlemeMaliyeti}`, color: 'text-cyan-400' },
                      { label: 'Isyeri', value: calc.isyeriMaliyet, desc: `${form.ciktiKg}kg × ₺${form.isyeriMaliyeti}`, color: 'text-yellow-400' },
                      { label: 'Calisan', value: calc.calisanMaliyet, desc: `${form.ciktiKg}kg × ₺${form.calisanMaliyeti}`, color: 'text-purple-400' },
                    ].map((item, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                        className="flex items-center justify-between p-2 md:p-3 rounded-lg md:rounded-xl bg-secondary/40 border border-border/20 data-row"
                        style={{ '--row-accent': item.color.replace('text-', '').includes('blue') ? '#3b82f6' : item.color.includes('orange') ? '#f97316' : item.color.includes('cyan') ? '#06b6d4' : item.color.includes('yellow') ? '#eab308' : '#a855f7' } as React.CSSProperties}>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs md:text-sm font-medium ${item.color}`}>{item.label}</p>
                          <p className="text-[9px] md:text-[11px] text-muted-foreground/70 truncate">{item.desc}</p>
                        </div>
                        <p className="text-xs md:text-sm font-bold text-white ml-2 flex-shrink-0">₺{item.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
                      </motion.div>
                    ))}

                    <div className="border-t border-border/20 pt-3 md:pt-4 mt-1 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm md:text-lg font-bold text-white tracking-tight">TOPLAM MALiYET</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground/70 tech-number">₺{calc.kgBasinaMaliyet.toFixed(2)}/kg birim maliyet</p>
                      </div>
                      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-right">
                        <p className="text-xl md:text-3xl font-bold text-emerald-400 tech-number">
                          ₺{calc.toplamMaliyet.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                        </p>
                      </motion.div>
                    </div>
                  </div>
                </div>

                {/* Stok İşlemleri Özeti */}
                <div className="card-premium rounded-xl md:rounded-2xl p-4 md:p-6 space-y-3 md:space-y-4">
                  <div className="flex items-center gap-2.5 mb-1 md:mb-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-blue-600/15 to-emerald-500/10 flex items-center justify-center">
                      <Package className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400" />
                    </div>
                    <h2 className="text-sm md:text-lg font-bold text-white">Stok Islemleri</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
                    <div className="p-3 md:p-4 rounded-lg md:rounded-xl bg-red-600/5 border border-red-600/15">
                      <div className="flex items-center justify-between mb-1 md:mb-2">
                        <div className="flex items-center gap-1.5">
                          <ArrowDown className="w-3 h-3 md:w-4 md:h-4 text-red-400" />
                          <span className="text-[10px] md:text-xs font-bold text-red-400 uppercase">Dusulecek</span>
                        </div>
                        <span className="text-[9px] md:text-[10px] text-muted-foreground">Kalan: {(form.maxStok - form.cigKg).toFixed(1)}kg</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-white font-semibold text-xs md:text-sm truncate">{form.hammaddeAdi}</p>
                        <p className="text-red-400 font-bold text-sm md:text-lg ml-2">-{form.cigKg}kg</p>
                      </div>
                    </div>
                    <div className="p-3 md:p-4 rounded-lg md:rounded-xl bg-emerald-600/5 border border-emerald-600/15">
                      <div className="flex items-center justify-between mb-1 md:mb-2">
                        <div className="flex items-center gap-1.5">
                          <ArrowUp className="w-3 h-3 md:w-4 md:h-4 text-emerald-400" />
                          <span className="text-[10px] md:text-xs font-bold text-emerald-400 uppercase">Eklenecek</span>
                        </div>
                      </div>
                      <p className="text-white font-semibold text-xs md:text-sm">{form.ciktiUrunAdi || '(adsiz)'}</p>
                      <p className="text-emerald-400 font-bold text-lg mt-1">+{form.ciktiKg} kg</p>
                      <p className="text-[10px] text-muted-foreground">Birim maliyet: ₺{calc.kgBasinaMaliyet.toFixed(2)}/kg</p>
                      {form.ciktiUrunAdi && stokList.find(s => s.name === form.ciktiUrunAdi) && (
                        <p className="text-[10px] text-blue-400 mt-1">
                          Mevcut stok: {((stokList.find(s => s.name === form.ciktiUrunAdi)?.currentStock ?? stokList.find(s => s.name === form.ciktiUrunAdi)?.stock ?? 0)).toFixed(1)} kg &bull; Uzerine eklenecek
                        </p>
                      )}
                      {form.ciktiUrunAdi && !stokList.find(s => s.name === form.ciktiUrunAdi) && (
                        <p className="text-[10px] text-emerald-400 mt-1">
                          Yeni urun olarak stoka eklenecek
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-2 md:p-3 rounded-lg bg-blue-600/5 border border-blue-600/15 flex items-start gap-1.5">
                    <Info className="w-3 h-3 md:w-4 md:h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] md:text-[11px] text-blue-300">
                      <span className="hidden sm:inline">Kaydet butonuna bastiginizda: <strong>{form.hammaddeAdi}</strong> stoktan <strong>{form.cigKg}kg</strong> dusulecek ve <strong>{form.ciktiUrunAdi || '(adsiz)'}</strong> olarak <strong>{form.ciktiKg}kg</strong> stoga eklenecek.</span>
                      <span className="sm:hidden"><strong>{form.cigKg}kg</strong> dusulecek, <strong>{form.ciktiKg}kg</strong> {form.ciktiUrunAdi || 'yeni urun'} eklenecek.</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col-reverse md:flex-row justify-between gap-3 mt-6">
                  <button onClick={() => setCurrentStep(2)} className="w-full md:w-auto px-6 py-3.5 sm:py-3 bg-secondary/50 hover:bg-accent/50 active:bg-accent/70 text-muted-foreground hover:text-foreground/90 font-medium rounded-xl border border-border/30 transition-all duration-300">
                    {t('uretim.buttons.back') || 'Geri'}
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSaveProduction}
                    className="relative flex items-center justify-center w-full md:w-auto gap-2 px-6 md:px-8 py-3.5 md:py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 active:from-emerald-600 active:to-green-700 text-white font-bold text-sm md:text-base rounded-xl shadow-xl shadow-emerald-600/25 hover:shadow-emerald-500/35 transition-all duration-300 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700" />
                    <Save className="w-4 h-4 md:w-5 md:h-5 relative z-10" />
                    <span className="hidden sm:inline relative z-10">{t('uretim.buttons.save') || 'Uretimi Kaydet & Stok Guncelle'}</span>
                    <span className="sm:hidden relative z-10">Kaydet</span>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
           HIZLI İŞLEME
         ═══════════════════════════════════════════════════════ */}
      {activeView === 'hizli' && (
        <motion.div
          key="view-hizli"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4 md:space-y-5"
        >
          {/* Üst bilgi kartı */}
          <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/[0.04] via-transparent to-blue-500/[0.04] pointer-events-none" />
            <div className="relative z-10 flex items-center gap-3 md:gap-4">
              <div className="relative">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                  <Scissors className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="absolute -inset-1 rounded-xl md:rounded-2xl bg-violet-500/15 blur-md -z-10" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-bold text-white">Hızlı İşleme</h2>
                <p className="text-[11px] md:text-xs text-muted-foreground/70">Stoktan al → İşle (kes, temizle, ayır) → Başka stoka ekle</p>
              </div>
            </div>
          </div>

          {/* Son İşlemeler - Hızlı Şablonlar */}
          {recentHizliIslemeler.length > 0 && !hizliForm.hammaddeStokId && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <RotateCcw className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm md:text-base font-bold text-white">Son İşlemeler</h3>
                  <p className="text-[10px] text-muted-foreground/60">Hızlıca tekrarlamak için tıklayın</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentHizliIslemeler.map((kayit, idx) => (
                  <motion.button
                    key={kayit.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05, duration: 0.3 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => applyHizliTemplate(kayit)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/50 border border-border/30 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all duration-300 group active:scale-[0.97]"
                  >
                    <Scissors className="w-3 h-3 text-violet-400/60 group-hover:text-violet-400 transition-colors" />
                    <div className="text-left">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-blue-400 font-medium">{kayit.hammaddeAdi}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40" />
                        <span className="text-emerald-400 font-medium">{kayit.ciktiUrunAdi}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground/50">
                        {kayit.cigKg}→{kayit.ciktiKg} {kayit.fireKg > 0 ? `• F%${kayit.fireOrani.toFixed(0)}` : ''}
                        <span className="ml-1">{new Date(kayit.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}</span>
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            {/* ── Sol: Giriş & Fire ─────────────────────────── */}
            <div className="space-y-4 relative">
              {/* Stoktan Ürün Seç */}
              <div className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 space-y-3 md:space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <ShoppingCart className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-400" />
                  </div>
                  <h3 className="text-sm md:text-base font-bold text-white">Kaynak Ürün</h3>
                </div>

                <StokSearchSelect
                  value={hizliForm.hammaddeStokId}
                  onSelect={handleHizliStokSelect}
                  stokList={stokList}
                />

                {hizliForm.hammaddeStokId && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                    {/* Seçili ürün bilgisi */}
                    <div className="p-3 rounded-xl bg-blue-600/5 border border-blue-600/15">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-xs md:text-sm font-bold text-white truncate">{hizliForm.hammaddeAdi}</p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground">Ürün</p>
                        </div>
                        <div>
                          <p className="text-xs md:text-sm font-bold text-emerald-400">{hizliForm.maxStok.toFixed(1)} {hizliForm.birim.toLowerCase()}</p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground">Mevcut Stok</p>
                        </div>
                        <div>
                          <p className="text-xs md:text-sm font-bold text-blue-400">₺{hizliForm.birimFiyat.toFixed(0)}/{hizliForm.birim.toLowerCase()}</p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground">Fiyat</p>
                        </div>
                      </div>
                    </div>

                    {/* Miktar */}
                    <div>
                      <label className="block text-xs md:text-sm font-medium text-foreground/80 mb-1.5">
                        İşlenecek Miktar ({hizliForm.birim.toLowerCase()})
                        <span className="text-[10px] text-emerald-400 ml-2">Max: {hizliForm.maxStok.toFixed(1)}</span>
                      </label>
                      <input
                        type="number"
                        value={hizliForm.girisMiktar || ''}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setHizliForm(prev => ({
                            ...prev,
                            girisMiktar: val,
                            // Otomatik çıktı hesapla (fire yoksa girdi = çıktı)
                            ciktiMiktar: prev.showFire ? Math.max(0, val - prev.fireMiktar) : val,
                          }));
                        }}
                        className={`${inputClass} ${hizliForm.girisMiktar > hizliForm.maxStok ? 'border-red-500/50 ring-1 ring-red-500/20' : ''}`}
                        placeholder="Örn: 50"
                        min={0}
                        max={hizliForm.maxStok}
                        step={hizliForm.birim === 'ADET' ? 1 : 0.1}
                      />
                      {hizliForm.girisMiktar > hizliForm.maxStok && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Stok yetersiz! {hizliForm.maxStok.toFixed(1)} {hizliForm.birim.toLowerCase()} mevcut
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Fire / Kayıp (Opsiyonel) */}
              {hizliForm.hammaddeStokId && hizliForm.girisMiktar > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 space-y-3">
                  <button
                    onClick={() => setHizliForm(prev => {
                      const newShowFire = !prev.showFire;
                      return {
                        ...prev,
                        showFire: newShowFire,
                        fireMiktar: newShowFire ? prev.fireMiktar : 0,
                        ciktiMiktar: newShowFire ? Math.max(0, prev.girisMiktar - prev.fireMiktar) : prev.girisMiktar,
                      };
                    })}
                    className="w-full flex items-center justify-between group active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-colors ${
                        hizliForm.showFire ? 'bg-red-500/15' : 'bg-secondary/60'
                      }`}>
                        <TrendingDown className={`w-3.5 h-3.5 md:w-4 md:h-4 ${hizliForm.showFire ? 'text-red-400' : 'text-muted-foreground/60'}`} />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm md:text-base font-bold text-white">Fire / Kayıp</h3>
                        <p className="text-[10px] md:text-[11px] text-muted-foreground/60">Temizlik, kesim vb. sırasında oluşan kayıp</p>
                      </div>
                    </div>
                    {hizliForm.showFire
                      ? <ToggleRight className="w-7 h-7 md:w-8 md:h-8 text-red-400" />
                      : <ToggleLeft className="w-7 h-7 md:w-8 md:h-8 text-muted-foreground/40" />
                    }
                  </button>

                  <AnimatePresence>
                    {hizliForm.showFire && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                      >
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div>
                            <label className="block text-[10px] md:text-xs font-medium text-muted-foreground mb-1">
                              Fire ({hizliForm.birim.toLowerCase()})
                            </label>
                            <input
                              type="number"
                              value={hizliForm.fireMiktar || ''}
                              onChange={e => {
                                const val = Math.min(Number(e.target.value), hizliForm.girisMiktar);
                                setHizliForm(prev => ({
                                  ...prev,
                                  fireMiktar: Math.max(0, val),
                                  ciktiMiktar: Math.max(0, prev.girisMiktar - Math.max(0, val)),
                                }));
                              }}
                              className={inputClass}
                              placeholder="0"
                              min={0}
                              max={hizliForm.girisMiktar}
                              step={hizliForm.birim === 'ADET' ? 1 : 0.1}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] md:text-xs font-medium text-red-400 mb-1">Fire Oranı</label>
                            <div className="px-3 py-3 bg-red-600/10 border border-red-600/25 rounded-xl text-red-400 text-sm font-bold flex items-center gap-1.5">
                              <TrendingDown className="w-3.5 h-3.5" />
                              %{hizliCalc.fireOrani.toFixed(1)}
                            </div>
                          </div>
                        </div>
                        {hizliForm.fireMiktar > 0 && (
                          <div className="mt-2 flex items-center gap-1.5 p-2 rounded-lg bg-red-500/5 border border-red-500/15">
                            <Info className="w-3 h-3 text-red-400 flex-shrink-0" />
                            <p className="text-[10px] text-red-300">
                              {hizliForm.girisMiktar} {hizliForm.birim.toLowerCase()} → {hizliForm.fireMiktar} fire = <strong>{(hizliForm.girisMiktar - hizliForm.fireMiktar).toFixed(hizliForm.birim === 'ADET' ? 0 : 1)} {hizliForm.birim.toLowerCase()}</strong> kalan
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>

            {/* ── Sağ: Çıktı & Maliyet ─────────────────────── */}
            <div className="space-y-4 relative">
              {/* Çıktı Ürün */}
              {hizliForm.hammaddeStokId && hizliForm.girisMiktar > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 space-y-3 md:space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <Package className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400" />
                    </div>
                    <h3 className="text-sm md:text-base font-bold text-white">Çıktı Ürün</h3>
                    <span className="text-[10px] text-emerald-400/70 ml-auto">+{hizliForm.ciktiMiktar.toFixed(hizliForm.birim === 'ADET' ? 0 : 1)} {hizliForm.birim.toLowerCase()} stoka eklenecek</span>
                  </div>

                  {/* Çıktı Adı */}
                  <CiktiUrunSelect
                    value={hizliForm.ciktiUrunAdi}
                    onChange={(val) => setHizliForm(prev => ({ ...prev, ciktiUrunAdi: val }))}
                    stokList={stokList}
                    hammaddeAdi={hizliForm.hammaddeAdi}
                  />

                  {/* Çıktı Miktarı */}
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-foreground/80 mb-1.5">
                      Çıktı Miktarı ({hizliForm.birim.toLowerCase()})
                    </label>
                    <input
                      type="number"
                      value={hizliForm.ciktiMiktar || ''}
                      onChange={e => setHizliForm(prev => ({ ...prev, ciktiMiktar: Math.max(0, Number(e.target.value)) }))}
                      className={inputClass}
                      placeholder={`${(hizliForm.girisMiktar - hizliForm.fireMiktar).toFixed(hizliForm.birim === 'ADET' ? 0 : 1)}`}
                      min={0}
                      step={hizliForm.birim === 'ADET' ? 1 : 0.1}
                    />
                  </div>

                  {/* Bilgi: Mevcut stokta var mı? */}
                  {hizliForm.ciktiUrunAdi && stokList.find(s => s.name === hizliForm.ciktiUrunAdi) && (
                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-blue-600/5 border border-blue-600/15">
                      <Info className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      <p className="text-[10px] text-blue-300">
                        Mevcut stok: {((stokList.find(s => s.name === hizliForm.ciktiUrunAdi)?.currentStock ?? 0)).toFixed(1)} {hizliForm.birim.toLowerCase()} — Üzerine eklenecek
                      </p>
                    </div>
                  )}
                  {hizliForm.ciktiUrunAdi && !stokList.find(s => s.name === hizliForm.ciktiUrunAdi) && (
                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-600/5 border border-emerald-600/15">
                      <Sparkles className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <p className="text-[10px] text-emerald-300">Yeni ürün olarak stoka eklenecek</p>
                    </div>
                  )}

                  {/* Açıklama */}
                  <div>
                    <label className="block text-[10px] md:text-xs font-medium text-muted-foreground mb-1">Açıklama (opsiyonel)</label>
                    <input
                      value={hizliForm.aciklama}
                      onChange={e => setHizliForm(prev => ({ ...prev, aciklama: e.target.value }))}
                      className={inputClass}
                      placeholder="Örn: Temizlenip kemikler ayrıldı"
                    />
                  </div>
                </motion.div>
              )}

              {/* Maliyet (Opsiyonel) */}
              {hizliForm.hammaddeStokId && hizliForm.girisMiktar > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 space-y-3">
                  <button
                    onClick={() => setHizliForm(prev => ({ ...prev, showMaliyet: !prev.showMaliyet }))}
                    className="w-full flex items-center justify-between group active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-colors ${
                        hizliForm.showMaliyet ? 'bg-emerald-500/15' : 'bg-secondary/60'
                      }`}>
                        <DollarSign className={`w-3.5 h-3.5 md:w-4 md:h-4 ${hizliForm.showMaliyet ? 'text-emerald-400' : 'text-muted-foreground/60'}`} />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm md:text-base font-bold text-white">Ek Maliyetler</h3>
                        <p className="text-[10px] md:text-[11px] text-muted-foreground/60">İşçilik, ek masraflar (opsiyonel)</p>
                      </div>
                    </div>
                    {hizliForm.showMaliyet
                      ? <ToggleRight className="w-7 h-7 md:w-8 md:h-8 text-emerald-400" />
                      : <ToggleLeft className="w-7 h-7 md:w-8 md:h-8 text-muted-foreground/40" />
                    }
                  </button>

                  <AnimatePresence>
                    {hizliForm.showMaliyet && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                          <div>
                            <label className="block text-[10px] md:text-xs font-medium text-muted-foreground mb-1">İşçilik Maliyeti (₺)</label>
                            <input
                              type="number"
                              value={hizliForm.iscilikMaliyeti || ''}
                              onChange={e => setHizliForm(prev => ({ ...prev, iscilikMaliyeti: Math.max(0, Number(e.target.value)) }))}
                              className={inputClass}
                              placeholder="0"
                              min={0}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] md:text-xs font-medium text-muted-foreground mb-1">Ek Masraf (₺)</label>
                            <input
                              type="number"
                              value={hizliForm.ekMaliyet || ''}
                              onChange={e => setHizliForm(prev => ({ ...prev, ekMaliyet: Math.max(0, Number(e.target.value)) }))}
                              className={inputClass}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div className="mt-2">
                          <label className="block text-[10px] md:text-xs font-medium text-muted-foreground mb-1">Maliyet Açıklaması</label>
                          <input
                            value={hizliForm.maliyetAciklama}
                            onChange={e => setHizliForm(prev => ({ ...prev, maliyetAciklama: e.target.value }))}
                            className={inputClass}
                            placeholder="Örn: 2 kişi 3 saat çalıştı"
                          />
                        </div>
                        {/* Maliyet Özeti */}
                        <div className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 space-y-1.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Hammadde:</span>
                            <span className="text-white font-medium">₺{hizliCalc.hammaddeMaliyet.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                          </div>
                          {hizliForm.iscilikMaliyeti > 0 && (
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">İşçilik:</span>
                              <span className="text-white font-medium">₺{hizliForm.iscilikMaliyeti.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                            </div>
                          )}
                          {hizliForm.ekMaliyet > 0 && (
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Ek Masraf:</span>
                              <span className="text-white font-medium">₺{hizliForm.ekMaliyet.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                            </div>
                          )}
                          <div className="border-t border-emerald-500/15 pt-1.5 flex justify-between text-xs">
                            <span className="text-emerald-400 font-bold">Toplam:</span>
                            <span className="text-emerald-400 font-bold">₺{hizliCalc.toplamMaliyet.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                          </div>
                          {hizliForm.ciktiMiktar > 0 && (
                            <div className="flex justify-between text-[10px] text-muted-foreground/70">
                              <span>Birim maliyet:</span>
                              <span>₺{hizliCalc.birimMaliyet.toFixed(2)}/{hizliForm.birim.toLowerCase()}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </div>

          {/* ── Akış Özeti & Kaydet ────────────────────────── */}
          {hizliForm.hammaddeStokId && hizliForm.girisMiktar > 0 && hizliForm.ciktiMiktar > 0 && hizliForm.ciktiUrunAdi.trim() && (
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Akış Görseli */}
              <div className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500/[0.03] via-transparent to-emerald-500/[0.03] pointer-events-none" />
                <div className="flex items-center gap-1.5 mb-3 relative z-10">
                  <Zap className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider font-bold">İşleme Akışı</span>
                </div>

                {/* Desktop akış */}
                <div className="hidden sm:flex items-center gap-2 relative z-10">
                  <div className="px-4 py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-center min-w-[90px]">
                    <p className="text-sm text-blue-400 font-bold tech-number">{hizliForm.girisMiktar.toFixed(hizliForm.birim === 'ADET' ? 0 : 1)} {hizliForm.birim.toLowerCase()}</p>
                    <p className="text-[9px] text-muted-foreground/70 truncate max-w-[100px]">{hizliForm.hammaddeAdi}</p>
                  </div>
                  {hizliForm.showFire && hizliForm.fireMiktar > 0 && (
                    <>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <div className="w-5 h-[2px] bg-muted-foreground/20 rounded-full" />
                        <Minus className="w-3 h-3 text-red-400" />
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-red-600/10 border border-red-500/20 text-center">
                        <p className="text-xs text-red-400 font-bold tech-number">{hizliForm.fireMiktar.toFixed(hizliForm.birim === 'ADET' ? 0 : 1)} {hizliForm.birim.toLowerCase()}</p>
                        <p className="text-[9px] text-muted-foreground/60">Fire %{hizliCalc.fireOrani.toFixed(0)}</p>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <div className="w-5 h-[2px] bg-gradient-to-r from-muted-foreground/20 to-emerald-500/30 rounded-full" />
                    <ArrowRight className="w-4 h-4 text-emerald-400/60" />
                  </div>
                  <div className="px-4 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-center min-w-[90px]">
                    <p className="text-sm text-emerald-400 font-bold tech-number">{hizliForm.ciktiMiktar.toFixed(hizliForm.birim === 'ADET' ? 0 : 1)} {hizliForm.birim.toLowerCase()}</p>
                    <p className="text-[9px] text-muted-foreground/70 truncate max-w-[100px]">{hizliForm.ciktiUrunAdi}</p>
                  </div>
                </div>

                {/* Mobile akış */}
                <div className="sm:hidden relative z-10">
                  <div className="flex items-stretch gap-[2px] rounded-xl overflow-hidden">
                    <div className="flex-1 text-center py-2 bg-blue-600/12 border-l border-y border-blue-500/20 rounded-l-lg">
                      <p className="text-[10px] text-blue-400 font-bold tech-number">{hizliForm.girisMiktar.toFixed(hizliForm.birim === 'ADET' ? 0 : 1)}</p>
                      <p className="text-[8px] text-muted-foreground/50 truncate px-1">{hizliForm.hammaddeAdi}</p>
                    </div>
                    {hizliForm.showFire && hizliForm.fireMiktar > 0 && (
                      <div className="text-center py-2 px-2 bg-red-600/12 border-y border-red-500/20">
                        <p className="text-[10px] text-red-400 font-bold">-{hizliForm.fireMiktar.toFixed(hizliForm.birim === 'ADET' ? 0 : 1)}</p>
                        <p className="text-[8px] text-muted-foreground/50">Fire</p>
                      </div>
                    )}
                    <div className="flex-1 text-center py-2 bg-emerald-600/12 border-r border-y border-emerald-500/20 rounded-r-lg">
                      <p className="text-[10px] text-emerald-400 font-bold tech-number">{hizliForm.ciktiMiktar.toFixed(hizliForm.birim === 'ADET' ? 0 : 1)}</p>
                      <p className="text-[8px] text-muted-foreground/50 truncate px-1">{hizliForm.ciktiUrunAdi}</p>
                    </div>
                  </div>
                </div>

                {/* Stok İşlemleri Özeti */}
                <div className="mt-3 grid grid-cols-2 gap-2 relative z-10">
                  <div className="p-2.5 rounded-lg bg-red-600/5 border border-red-600/15 flex items-center gap-2">
                    <ArrowDown className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-red-400 font-bold uppercase">Düşülecek</p>
                      <p className="text-[10px] text-white truncate">{hizliForm.hammaddeAdi}: -{hizliForm.girisMiktar.toFixed(hizliForm.birim === 'ADET' ? 0 : 1)}</p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-600/5 border border-emerald-600/15 flex items-center gap-2">
                    <ArrowUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-emerald-400 font-bold uppercase">Eklenecek</p>
                      <p className="text-[10px] text-white truncate">{hizliForm.ciktiUrunAdi}: +{hizliForm.ciktiMiktar.toFixed(hizliForm.birim === 'ADET' ? 0 : 1)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Kâr Marjı Hesaplayıcı */}
              {hizliCalc.birimMaliyet > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.03] via-transparent to-blue-500/[0.03] pointer-events-none" />
                  <div className="flex items-center gap-2 mb-3 relative z-10">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <DollarSign className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm md:text-base font-bold text-white">Satış Fiyatı Önerisi</h3>
                      <p className="text-[10px] text-muted-foreground/60">Birim maliyet: ₺{hizliCalc.birimMaliyet.toFixed(2)}/{hizliForm.birim.toLowerCase()}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 relative z-10">
                    {hizliCalc.karMarjlari.map((m) => (
                      <div key={m.marj} className="p-2.5 md:p-3 rounded-xl bg-secondary/40 border border-border/20 text-center hover:border-emerald-500/20 transition-colors">
                        <p className="text-[9px] md:text-[10px] text-muted-foreground/60 uppercase tracking-wider font-bold mb-1">%{m.marj} Kâr</p>
                        <p className="text-sm md:text-lg font-bold text-emerald-400 tech-number">₺{m.fiyat.toFixed(0)}</p>
                        <p className="text-[9px] text-muted-foreground/50">/{hizliForm.birim.toLowerCase()}</p>
                        {m.kar > 0 && (
                          <p className="text-[8px] md:text-[9px] text-emerald-400/70 mt-0.5">+₺{m.kar.toFixed(0)} toplam</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Verimlilik göstergesi */}
                  {hizliCalc.verimlilik > 0 && (
                    <div className="mt-3 flex items-center gap-2 relative z-10">
                      <span className="text-[10px] text-muted-foreground/60">Verimlilik:</span>
                      <div className="flex-1 h-2 bg-secondary/40 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: Math.min(1, hizliCalc.verimlilik / 100) }}
                          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                          style={{ transformOrigin: 'left' }}
                          className={`h-full w-full rounded-full ${
                            hizliCalc.verimlilik >= 90 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
                            hizliCalc.verimlilik >= 70 ? 'bg-gradient-to-r from-blue-500 to-blue-400' :
                            hizliCalc.verimlilik >= 50 ? 'bg-gradient-to-r from-orange-500 to-orange-400' :
                            'bg-gradient-to-r from-red-500 to-red-400'
                          }`}
                        />
                      </div>
                      <span className={`text-[10px] font-bold tech-number ${
                        hizliCalc.verimlilik >= 90 ? 'text-emerald-400' :
                        hizliCalc.verimlilik >= 70 ? 'text-blue-400' :
                        hizliCalc.verimlilik >= 50 ? 'text-orange-400' : 'text-red-400'
                      }`}>%{hizliCalc.verimlilik.toFixed(0)}</span>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Kaydet Butonu */}
              <motion.button
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSaveHizliIsleme}
                className="w-full relative flex items-center justify-center gap-2.5 px-6 py-4 sm:py-3.5 bg-gradient-to-r from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 active:from-violet-600 active:to-blue-700 text-white font-bold text-sm md:text-base rounded-xl shadow-xl shadow-violet-600/25 hover:shadow-violet-500/35 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700" />
                <Save className="w-4 h-4 md:w-5 md:h-5 relative z-10" />
                <span className="relative z-10">İşlemeyi Kaydet & Stok Güncelle</span>
              </motion.button>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
           KARIŞIM / KIYMA İŞLEME
         ═══════════════════════════════════════════════════════ */}
      {activeView === 'karisim' && (
        <motion.div
          key="view-karisim"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4 md:space-y-5"
        >
          {/* Üst bilgi kartı */}
          <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.04] via-transparent to-red-500/[0.04] pointer-events-none" />
            <div className="relative z-10 flex items-center gap-3 md:gap-4">
              <div className="relative">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
                  <Layers className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="absolute -inset-1 rounded-xl md:rounded-2xl bg-amber-500/15 blur-md -z-10" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-bold text-white">Karışım / Kıyma İşleme</h2>
                <p className="text-[11px] md:text-xs text-muted-foreground/70">Birden fazla hammaddeyi karıştırarak yeni ürün oluşturun</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            {/* ── Sol: Hammaddeler ─────────────────────────── */}
            <div className="space-y-4 relative">
              {/* Hammadde Ekle */}
              <div className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 space-y-3 md:space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                      <ShoppingCart className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-400" />
                    </div>
                    <h3 className="text-sm md:text-base font-bold text-white">Hammaddeler</h3>
                  </div>
                  {karisimGirdiler.length > 0 && (
                    <span className="text-[10px] text-blue-400/70 px-2 py-0.5 rounded-lg bg-blue-500/10">
                      {karisimGirdiler.length} ürün seçili
                    </span>
                  )}
                </div>

                <StokSearchSelect
                  value=""
                  onSelect={addKarisimGirdi}
                  stokList={stokList.filter(s => !karisimGirdiler.find(g => g.stokId === s.id))}
                />

                {/* Seçili hammaddeler listesi */}
                <AnimatePresence>
                  {karisimGirdiler.map((girdi, idx) => (
                    <motion.div
                      key={girdi.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: idx * 0.03 }}
                      className="p-3 rounded-xl bg-blue-600/5 border border-blue-600/15 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Package className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-white truncate">{girdi.urunAdi}</span>
                          <span className="text-[10px] text-muted-foreground/60">
                            ({girdi.maxStok.toFixed(1)} {girdi.birim.toLowerCase()} stok)
                          </span>
                        </div>
                        <button
                          onClick={() => removeKarisimGirdi(girdi.id)}
                          className="w-6 h-6 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                        >
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-0.5">Miktar ({girdi.birim.toLowerCase()})</label>
                          <input
                            type="number"
                            value={girdi.miktar || ''}
                            onChange={e => updateKarisimGirdi(girdi.id, 'miktar', Math.max(0, Number(e.target.value)))}
                            className={`w-full px-3 py-2 bg-card border rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40 ${
                              girdi.miktar > girdi.maxStok ? 'border-red-500/50' : 'border-border'
                            }`}
                            placeholder="0"
                            min={0}
                            max={girdi.maxStok}
                            step={0.1}
                          />
                          {girdi.miktar > girdi.maxStok && (
                            <p className="text-[9px] text-red-400 mt-0.5 flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" /> Stok yetersiz!
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-0.5">Fiyat (₺/{girdi.birim.toLowerCase()})</label>
                          <div className="px-3 py-2 bg-card/60 border border-border/50 rounded-lg text-sm text-muted-foreground">
                            ₺{girdi.birimFiyat.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      {girdi.miktar > 0 && (
                        <div className="flex justify-between text-[10px] text-muted-foreground/60 px-1">
                          <span>Tutar: ₺{(girdi.miktar * girdi.birimFiyat).toFixed(0)}</span>
                          <span>Oran: %{karisimCalc.toplamGirdi > 0 ? ((girdi.miktar / karisimCalc.toplamGirdi) * 100).toFixed(0) : 0}</span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {karisimGirdiler.length > 0 && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-blue-600/5 to-violet-600/5 border border-blue-500/15">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Toplam Girdi:</span>
                      <span className="text-blue-400 font-bold">{karisimCalc.toplamGirdi.toFixed(1)} kg</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-muted-foreground">Toplam Hammadde Maliyeti:</span>
                      <span className="text-white font-bold">₺{karisimCalc.hammaddeMaliyet.toFixed(0)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Sağ: Çıktı & Maliyet ─────────────────────── */}
            <div className="space-y-4 relative">
              {karisimGirdiler.length >= 2 && karisimCalc.toplamGirdi > 0 && (
                <>
                  {/* Çıktı Ürün */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 space-y-3 md:space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                        <Package className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400" />
                      </div>
                      <h3 className="text-sm md:text-base font-bold text-white">Çıktı Ürün</h3>
                    </div>

                    <CiktiUrunSelect
                      value={karisimCikti.urunAdi}
                      onChange={(val) => setKarisimCikti(prev => ({ ...prev, urunAdi: val }))}
                      stokList={stokList}
                      hammaddeAdi={karisimGirdiler.map(g => g.urunAdi).join(' + ')}
                    />

                    <div>
                      <label className="block text-xs md:text-sm font-medium text-foreground/80 mb-1.5">
                        Çıktı Miktarı (kg)
                        <span className="text-[10px] text-muted-foreground ml-2">Girdi toplamı: {karisimCalc.toplamGirdi.toFixed(1)} kg</span>
                      </label>
                      <input
                        type="number"
                        value={karisimCikti.miktar || ''}
                        onChange={e => setKarisimCikti(prev => ({ ...prev, miktar: Math.max(0, Number(e.target.value)) }))}
                        className="w-full px-4 py-3 bg-card border border-border rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-corporate"
                        placeholder={karisimCalc.toplamGirdi.toFixed(1)}
                        min={0}
                        step={0.1}
                      />
                    </div>

                    {karisimCikti.urunAdi && stokList.find(s => s.name === karisimCikti.urunAdi) && (
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-blue-600/5 border border-blue-600/15">
                        <Info className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <p className="text-[10px] text-blue-300">
                          Mevcut stok: {((stokList.find(s => s.name === karisimCikti.urunAdi)?.currentStock ?? 0)).toFixed(1)} kg — Üzerine eklenecek
                        </p>
                      </div>
                    )}
                    {karisimCikti.urunAdi && !stokList.find(s => s.name === karisimCikti.urunAdi) && (
                      <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-600/5 border border-emerald-600/15">
                        <Sparkles className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <p className="text-[10px] text-emerald-300">Yeni ürün olarak stoka eklenecek</p>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] md:text-xs font-medium text-muted-foreground mb-1">Açıklama (opsiyonel)</label>
                      <input
                        value={karisimCikti.aciklama}
                        onChange={e => setKarisimCikti(prev => ({ ...prev, aciklama: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                        placeholder="Örn: %60 dana %40 kuzu karışım kıyma"
                      />
                    </div>
                  </motion.div>

                  {/* Ek Maliyet (Opsiyonel) */}
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 space-y-3">
                    <button
                      onClick={() => setKarisimCikti(prev => ({ ...prev, showMaliyet: !prev.showMaliyet }))}
                      className="w-full flex items-center justify-between group active:scale-[0.99] transition-transform"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-colors ${
                          karisimCikti.showMaliyet ? 'bg-emerald-500/15' : 'bg-secondary/60'
                        }`}>
                          <DollarSign className={`w-3.5 h-3.5 md:w-4 md:h-4 ${karisimCikti.showMaliyet ? 'text-emerald-400' : 'text-muted-foreground/60'}`} />
                        </div>
                        <div className="text-left">
                          <h3 className="text-sm md:text-base font-bold text-white">Ek Maliyetler</h3>
                          <p className="text-[10px] md:text-[11px] text-muted-foreground/60">İşçilik, kıyma makinesi vb.</p>
                        </div>
                      </div>
                      {karisimCikti.showMaliyet
                        ? <ToggleRight className="w-7 h-7 md:w-8 md:h-8 text-emerald-400" />
                        : <ToggleLeft className="w-7 h-7 md:w-8 md:h-8 text-muted-foreground/40" />
                      }
                    </button>

                    <AnimatePresence>
                      {karisimCikti.showMaliyet && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="grid grid-cols-2 gap-3 pt-2"
                        >
                          <div>
                            <label className="block text-[10px] md:text-xs font-medium text-muted-foreground mb-1">İşçilik (₺)</label>
                            <input
                              type="number"
                              value={karisimCikti.iscilikMaliyeti || ''}
                              onChange={e => setKarisimCikti(prev => ({ ...prev, iscilikMaliyeti: Math.max(0, Number(e.target.value)) }))}
                              className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                              placeholder="0"
                              min={0}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] md:text-xs font-medium text-muted-foreground mb-1">Ek Masraf (₺)</label>
                            <input
                              type="number"
                              value={karisimCikti.ekMaliyet || ''}
                              onChange={e => setKarisimCikti(prev => ({ ...prev, ekMaliyet: Math.max(0, Number(e.target.value)) }))}
                              className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                              placeholder="0"
                              min={0}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </>
              )}
            </div>
          </div>

          {/* ── Akış Özeti & Kaydet ────────────────────────── */}
          {karisimGirdiler.length >= 2 && karisimCalc.toplamGirdi > 0 && karisimCikti.miktar > 0 && karisimCikti.urunAdi.trim() && (
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Akış Görseli */}
              <div className="card-premium rounded-xl md:rounded-2xl p-4 md:p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.03] via-transparent to-emerald-500/[0.03] pointer-events-none" />
                <div className="flex items-center gap-1.5 mb-3 relative z-10">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider font-bold">Karışım Akışı</span>
                </div>

                {/* Girdi ürünleri → Çıktı */}
                <div className="relative z-10 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {karisimGirdiler.map((g, idx) => (
                      <React.Fragment key={g.id}>
                        {idx > 0 && <span className="text-amber-400/50 text-sm font-bold self-center">+</span>}
                        <div className="px-3 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/20 text-center">
                          <p className="text-[11px] text-blue-400 font-bold tech-number">{g.miktar.toFixed(1)} kg</p>
                          <p className="text-[9px] text-muted-foreground/70 truncate max-w-[80px]">{g.urunAdi}</p>
                        </div>
                      </React.Fragment>
                    ))}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="w-4 h-[2px] bg-gradient-to-r from-muted-foreground/20 to-emerald-500/30 rounded-full" />
                      <ArrowRight className="w-4 h-4 text-emerald-400/60" />
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-center">
                      <p className="text-[11px] text-emerald-400 font-bold tech-number">{karisimCikti.miktar.toFixed(1)} kg</p>
                      <p className="text-[9px] text-muted-foreground/70 truncate max-w-[80px]">{karisimCikti.urunAdi}</p>
                    </div>
                  </div>

                  {/* Maliyet özeti */}
                  <div className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Hammadde maliyeti:</span>
                      <span className="text-white font-medium">₺{karisimCalc.hammaddeMaliyet.toFixed(0)}</span>
                    </div>
                    {karisimCalc.ekMaliyetler > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Ek maliyetler:</span>
                        <span className="text-white font-medium">₺{karisimCalc.ekMaliyetler.toFixed(0)}</span>
                      </div>
                    )}
                    <div className="border-t border-emerald-500/15 pt-1 flex justify-between text-xs">
                      <span className="text-emerald-400 font-bold">Toplam maliyet:</span>
                      <span className="text-emerald-400 font-bold">₺{karisimCalc.toplamMaliyet.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground/70">
                      <span>Birim maliyet:</span>
                      <span>₺{karisimCalc.birimMaliyet.toFixed(2)}/kg</span>
                    </div>
                    {karisimCalc.fireKg > 0 && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-red-400/70">Fire:</span>
                        <span className="text-red-400">{karisimCalc.fireKg.toFixed(1)} kg (%{karisimCalc.fireOrani.toFixed(0)})</span>
                      </div>
                    )}
                  </div>

                  {/* Verimlilik */}
                  {karisimCalc.verimlilik > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/60">Verimlilik:</span>
                      <div className="flex-1 h-2 bg-secondary/40 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: Math.min(1, karisimCalc.verimlilik / 100) }}
                          transition={{ duration: 0.8 }}
                          style={{ transformOrigin: 'left' }}
                          className={`h-full w-full rounded-full ${
                            karisimCalc.verimlilik >= 90 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
                            karisimCalc.verimlilik >= 70 ? 'bg-gradient-to-r from-blue-500 to-blue-400' :
                            'bg-gradient-to-r from-orange-500 to-orange-400'
                          }`}
                        />
                      </div>
                      <span className={`text-[10px] font-bold tech-number ${
                        karisimCalc.verimlilik >= 90 ? 'text-emerald-400' : karisimCalc.verimlilik >= 70 ? 'text-blue-400' : 'text-orange-400'
                      }`}>%{karisimCalc.verimlilik.toFixed(0)}</span>
                    </div>
                  )}

                  {/* Satış fiyatı önerisi */}
                  {karisimCalc.birimMaliyet > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {karisimCalc.karMarjlari.map((m) => (
                        <div key={m.marj} className="p-2 rounded-xl bg-secondary/40 border border-border/20 text-center hover:border-emerald-500/20 transition-colors">
                          <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-bold mb-0.5">%{m.marj} Kâr</p>
                          <p className="text-sm font-bold text-emerald-400 tech-number">₺{m.fiyat.toFixed(0)}</p>
                          <p className="text-[8px] text-muted-foreground/50">/kg</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stok işlemleri özeti */}
                <div className="mt-3 space-y-1.5 relative z-10">
                  {karisimGirdiler.map(g => (
                    <div key={g.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-red-600/5 border border-red-600/10">
                      <ArrowDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                      <p className="text-[10px] text-white truncate">{g.urunAdi}: <span className="text-red-400 font-bold">-{g.miktar.toFixed(1)} kg</span></p>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 p-1.5 rounded-lg bg-emerald-600/5 border border-emerald-600/10">
                    <ArrowUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    <p className="text-[10px] text-white truncate">{karisimCikti.urunAdi}: <span className="text-emerald-400 font-bold">+{karisimCikti.miktar.toFixed(1)} kg</span></p>
                  </div>
                </div>
              </div>

              {/* Kaydet Butonu */}
              <motion.button
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSaveKarisim}
                className="w-full relative flex items-center justify-center gap-2.5 px-6 py-4 sm:py-3.5 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 active:from-amber-600 active:to-red-700 text-white font-bold text-sm md:text-base rounded-xl shadow-xl shadow-amber-600/25 hover:shadow-amber-500/35 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700" />
                <Save className="w-4 h-4 md:w-5 md:h-5 relative z-10" />
                <span className="relative z-10">Karışımı Kaydet & Stok Güncelle</span>
              </motion.button>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
           ÜRETİM KAYITLARI
         ═══════════════════════════════════════════════════════ */}
      {activeView === 'kayitlar' && (
        <motion.div key="view-kayitlar" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 18 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">
          {kayitlar.length === 0 ? (
            <div className="card-premium rounded-xl md:rounded-2xl p-10 md:p-16 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.03] to-red-500/[0.03] pointer-events-none" />
              <div className="relative z-10">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-gradient-to-br from-orange-500/15 to-red-500/10 border border-orange-500/15 mx-auto mb-4 md:mb-5 flex items-center justify-center">
                  <Factory className="w-8 h-8 md:w-10 md:h-10 text-orange-400/60" />
                </div>
                <h3 className="text-base md:text-lg font-bold text-white mb-2">Henüz üretim kaydı yok</h3>
                <p className="text-muted-foreground/70 text-xs md:text-sm mb-5 md:mb-6 max-w-sm mx-auto">İlk üretim kaydını oluşturarak stok ve maliyet takibine başlayın</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setActiveView('hizli'); resetHizliForm(); refreshStok(); }}
                    className="px-6 py-2.5 md:py-3 text-sm bg-gradient-to-r from-violet-500 to-blue-600 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 active:from-violet-600 active:to-blue-700 transition-all duration-300">
                    <span className="flex items-center gap-2"><Scissors className="w-4 h-4" />Hızlı İşleme</span>
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setActiveView('yeni'); refreshStok(); }}
                    className="px-6 py-2.5 md:py-3 text-sm bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold rounded-xl shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 active:from-orange-600 active:to-red-700 transition-all duration-300">
                    <span className="flex items-center gap-2"><PlayCircle className="w-4 h-4" />Detaylı Üretim</span>
                  </motion.button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {analytics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                  <AnimatedStat label={t('nav.production', 'Uretim')} value={`${analytics.toplamUretim.toFixed(0)}kg`} icon={Factory} color="green" />
                  <AnimatedStat label={t('stok.fireLoss', 'Fire')} value={`%${analytics.avgFire.toFixed(1)}`} icon={TrendingDown} color="red" />
                  <AnimatedStat label={t('stok.waste', 'Cop')} value={`%${analytics.avgCop.toFixed(1)}`} icon={Trash2} color="orange" />
                  <AnimatedStat label={t('stok.costPerKg', 'Maliyet')} value={`₺${analytics.avgMaliyet.toFixed(0)}/kg`} icon={DollarSign} color="cyan" />
                </div>
              )}

              <div className="card-premium rounded-xl md:rounded-2xl overflow-hidden">
                <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border/20 flex items-center justify-between bg-gradient-to-r from-transparent via-orange-500/[0.02] to-transparent">
                  <h2 className="text-sm md:text-lg font-bold text-white flex items-center gap-1.5 md:gap-2">
                    <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                      <History className="w-3 h-3 md:w-3.5 md:h-3.5 text-orange-400" />
                    </div>
                    <span className="hidden sm:inline">Uretim Gecmisi</span>
                    <span className="sm:hidden">Gecmis</span>
                    <span className="text-[10px] md:text-xs font-normal text-muted-foreground/60 ml-1">({kayitlar.length})</span>
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { setActiveView('hizli'); resetHizliForm(); refreshStok(); }}
                      className="flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3 py-1.5 md:py-2 text-[11px] md:text-xs font-semibold bg-gradient-to-r from-violet-600/20 to-blue-600/15 hover:from-violet-600/30 hover:to-blue-600/25 text-violet-400 rounded-lg md:rounded-xl border border-violet-500/15 transition-all duration-300 active:scale-[0.97]">
                      <Scissors className="w-3 h-3" /> <span className="hidden sm:inline">Hızlı İşleme</span><span className="sm:hidden">İşle</span>
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { setActiveView('yeni'); refreshStok(); }}
                      className="flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3.5 py-1.5 md:py-2 text-[11px] md:text-xs font-semibold bg-gradient-to-r from-orange-600/20 to-red-600/15 hover:from-orange-600/30 hover:to-red-600/25 text-orange-400 rounded-lg md:rounded-xl border border-orange-500/15 transition-all duration-300 active:scale-[0.97]">
                      <Plus className="w-3 h-3" /> <span className="hidden sm:inline">{t('uretim.tabs.new', 'Yeni Üretim')}</span><span className="sm:hidden">{t('uretim.tabs.new_short', 'Yeni')}</span>
                    </motion.button>
                  </div>
                </div>

                {/* Filtre & Arama Barı */}
                <div className="px-3 md:px-6 py-2.5 md:py-3 border-b border-border/15 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                    <input
                      value={kayitFilter}
                      onChange={e => setKayitFilter(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-secondary/30 border border-border/20 rounded-lg text-white text-xs placeholder-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-orange-500/30 transition-all"
                      placeholder="Kayıt ara (ürün, profil, toptancı)..."
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {(['all', 'hizli', 'detayli'] as const).map(typ => (
                      <button
                        key={typ}
                        onClick={() => setKayitTypeFilter(typ)}
                        className={`px-2.5 py-1.5 text-[10px] md:text-[11px] font-medium rounded-lg transition-all ${
                          kayitTypeFilter === typ
                            ? typ === 'hizli' ? 'bg-violet-500/15 text-violet-400 border border-violet-500/25'
                              : typ === 'detayli' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/25'
                              : 'bg-secondary/60 text-white border border-border/30'
                            : 'text-muted-foreground/60 hover:text-foreground/70 hover:bg-secondary/30 border border-transparent'
                        }`}
                      >
                        {typ === 'all' ? 'Tümü' : typ === 'hizli' ? 'Hızlı' : 'Detaylı'}
                      </button>
                    ))}
                    {(kayitFilter || kayitTypeFilter !== 'all') && (
                      <span className="text-[9px] text-muted-foreground/50 ml-1">{filteredKayitlar.length}/{kayitlar.length}</span>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-border/15">
                  {filteredKayitlar.length === 0 && kayitlar.length > 0 && (
                    <div className="p-6 md:p-10 text-center">
                      <Search className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground/60">Aramayla eşleşen kayıt bulunamadı</p>
                      <button onClick={() => { setKayitFilter(''); setKayitTypeFilter('all'); }} className="mt-2 text-xs text-orange-400 hover:text-orange-300">Filtreleri temizle</button>
                    </div>
                  )}
                  {filteredKayitlar.map((kayit, i) => {
                    const verim = kayit.cigKg > 0 ? ((kayit.ciktiKg / kayit.cigKg) * 100) : 0;
                    return (
                    <motion.div
                      key={kayit.id}
                      initial={{ opacity: 0, x: -10, scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ delay: Math.min(i * 0.08, 0.8), duration: 0.4, ease: "easeOut" }}
                      className="px-3 md:px-6 py-3 md:py-4 hover:bg-secondary/20 active:bg-secondary/30 transition-all duration-300 group data-row"
                      style={{ '--row-accent': '#f97316' } as React.CSSProperties}
                    >
                      {/* Desktop layout */}
                      <div className="hidden sm:flex sm:items-start justify-between gap-4">
                        <div className="flex gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kayit.profileId === '__hizli_isleme__' ? 'from-violet-500/15 to-blue-500/10 border-violet-500/10 group-hover:border-violet-500/25' : 'from-orange-500/15 to-red-500/10 border-orange-500/10 group-hover:border-orange-500/25'} border flex items-center justify-center flex-shrink-0 transition-colors`}>
                            {kayit.profileId === '__hizli_isleme__'
                              ? <Scissors className="w-4 h-4 text-violet-400/80" />
                              : <Factory className="w-4 h-4 text-orange-400/80" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="text-white font-semibold text-sm">{kayit.profileName}</span>
                              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded-md border border-blue-500/10">
                                {kayit.hammaddeAdi}
                              </span>
                              <div className="flex items-center gap-1">
                                <div className="w-4 h-[1px] bg-gradient-to-r from-blue-400/40 to-emerald-400/40" />
                                <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                              </div>
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-md border border-emerald-500/10">
                                {kayit.ciktiUrunAdi}
                              </span>
                              {kayit.stokIslemleriYapildi && (
                                <span className="px-1.5 py-0.5 bg-emerald-500/8 text-emerald-400 text-[9px] font-bold rounded-md border border-emerald-500/15 flex items-center gap-0.5">
                                  <CheckCircle className="w-2.5 h-2.5" /> STOK
                                </span>
                              )}
                              {kayit.uretimTipi === 'kiyma' && (
                                <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 text-[9px] font-bold rounded-md border border-cyan-500/15 flex items-center gap-0.5">
                                  <Scissors className="w-2.5 h-2.5" /> KIYMA
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-muted-foreground/80">
                              {kayit.toptanciAdi && <span className="bg-secondary/60 px-2 py-0.5 rounded-md">{kayit.toptanciAdi}</span>}
                              {kayit.trKodu && <span className="text-emerald-400/80 bg-emerald-400/8 px-2 py-0.5 rounded-md flex items-center gap-1"><BadgeCheck className="w-2.5 h-2.5" />TR: {kayit.trKodu}</span>}
                              <span className="bg-secondary/60 px-2 py-0.5 rounded-md tech-number">{kayit.cigKg}kg → {kayit.ciktiKg}kg</span>
                              <span className={`px-2 py-0.5 rounded-md tech-number ${kayit.fireOrani > 35 ? 'text-red-400 bg-red-400/8' : 'text-orange-300 bg-orange-400/8'}`}>Fire %{kayit.fireOrani.toFixed(1)}</span>
                              {kayit.copKg > 0 && <span className="text-orange-400/80 bg-orange-400/8 px-2 py-0.5 rounded-md tech-number">Cop {kayit.copKg}kg (%{kayit.copOrani.toFixed(0)})</span>}
                              {kayit.kazanSayisi > 0 && <span className="bg-secondary/60 px-2 py-0.5 rounded-md">{kayit.kazanSayisi} kazan</span>}
                              <span className="bg-secondary/60 px-2 py-0.5 rounded-md">{new Date(kayit.date).toLocaleDateString('tr-TR')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0 gap-1">
                          <p className="text-lg font-bold text-emerald-400 tech-number">₺{kayit.toplamMaliyet.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
                          <p className="text-[10px] text-muted-foreground/60 tech-number">₺{kayit.kgBasinaMaliyet.toFixed(2)}/kg · Verim %{verim.toFixed(0)}</p>
                          <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleDeleteKayit(kayit.id)}
                            className="p-1.5 rounded-lg bg-red-500/8 hover:bg-red-500/20 text-red-400/60 hover:text-red-400 transition-all duration-200 mt-1 sm:opacity-0 sm:group-hover:opacity-100" title="Sil">
                            <Trash2 className="w-3.5 h-3.5" />
                          </motion.button>
                        </div>
                      </div>

                      {/* Mobile layout - compact card */}
                      <div className="sm:hidden">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${kayit.profileId === '__hizli_isleme__' ? 'bg-violet-500/10' : 'bg-orange-500/10'}`}>
                              {kayit.profileId === '__hizli_isleme__'
                                ? <Scissors className="w-3 h-3 text-violet-400/70" />
                                : <Factory className="w-3 h-3 text-orange-400/70" />}
                            </div>
                            <span className="text-white font-semibold text-xs truncate">{kayit.profileName}</span>
                            {kayit.stokIslemleriYapildi && <CheckCircle className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <span className="text-sm font-bold text-emerald-400 tech-number">₺{kayit.toplamMaliyet.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                            <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleDeleteKayit(kayit.id)}
                              className="p-1 rounded-md bg-red-500/10 text-red-400/70">
                              <Trash2 className="w-3 h-3" />
                            </motion.button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] mb-1">
                          <span className="text-blue-400 font-medium truncate max-w-[80px]">{kayit.hammaddeAdi}</span>
                          <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                          <span className="text-emerald-400 font-medium truncate max-w-[80px]">{kayit.ciktiUrunAdi}</span>
                          <span className="text-muted-foreground/30 mx-0.5">·</span>
                          <span className="text-muted-foreground/70 tech-number">{kayit.cigKg}→{kayit.ciktiKg}kg</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
                          <span className={`tech-number ${kayit.fireOrani > 35 ? 'text-red-400' : 'text-orange-300/80'}`}>F%{kayit.fireOrani.toFixed(0)}</span>
                          {kayit.copKg > 0 && <span className="text-orange-400/70">C%{kayit.copOrani.toFixed(0)}</span>}
                          {kayit.trKodu && <span className="text-emerald-400/70">TR:{kayit.trKodu}</span>}
                          <span className="tech-number">₺{kayit.kgBasinaMaliyet.toFixed(0)}/kg</span>
                          <span className="ml-auto text-muted-foreground/40">{new Date(kayit.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}</span>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
           ÜRÜN PROFİLLERİ
         ═══════════════════════════════════════════════════════ */}
      {activeView === 'profiller' && (
        <motion.div key="view-profiller" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">
          <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <div className="flex items-center gap-2.5 md:gap-3">
                <div className="relative">
                  <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <Layers className="w-4 h-4 md:w-5 md:h-5 text-white" />
                  </div>
                  <div className="absolute -inset-0.5 rounded-lg md:rounded-xl bg-purple-500/15 blur-md -z-10" />
                </div>
                <div>
                  <h2 className="text-base md:text-lg font-bold text-white">Urun Profilleri</h2>
                  <p className="text-[10px] md:text-xs text-muted-foreground/60 hidden sm:block">{profiles.length} profil tanimli</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setEditingProfile(null);
                  setProfileForm({ name: '', defaultTupKg: 5, defaultPaketlemeMaliyeti: defaults.paketlemeMaliyeti, defaultIsyeriMaliyeti: defaults.isyeriMaliyeti, defaultCalisanMaliyeti: defaults.calisanMaliyeti, defaultTupFiyatKg: defaults.tupFiyatKg });
                  setShowProfileModal(true);
                }}
                className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs md:text-sm rounded-lg md:rounded-xl shadow-lg shadow-purple-500/15 transition-all duration-300"
              >
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">Yeni Profil</span><span className="sm:hidden">Yeni</span>
              </motion.button>
            </div>

            {profiles.length === 0 ? (
              <div className="text-center py-10 md:py-14">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-purple-500/15 to-indigo-500/10 border border-purple-500/15 mx-auto mb-4 flex items-center justify-center">
                  <Layers className="w-7 h-7 md:w-8 md:h-8 text-purple-400/50" />
                </div>
                <p className="text-foreground/80 font-medium">Henuz profil olusturulmamis</p>
                <p className="text-muted-foreground/60 text-sm mt-1.5 max-w-xs mx-auto">Kelle, Yanak, Kuyruk gibi uretim tipleri icin profil ekleyin</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                {profiles.map((profile, i) => {
                  const profileKayitlar = kayitlar.filter(k => k.profileId === profile.id);
                  return (
                    <motion.div
                      key={profile.id}
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.1, duration: 0.4, ease: "easeOut" }}
                      className="p-3 md:p-5 rounded-xl md:rounded-2xl glass-light hover:border-purple-500/25 transition-all duration-300 card-hover group relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="flex items-center justify-between mb-2 md:mb-3">
                        <h3 className="text-sm md:text-base font-bold text-white">{profile.name}</h3>
                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingProfile(profile);
                              setProfileForm({
                                name: profile.name,
                                defaultTupKg: profile.defaultTupKg,
                                defaultPaketlemeMaliyeti: profile.defaultPaketlemeMaliyeti,
                                defaultIsyeriMaliyeti: profile.defaultIsyeriMaliyeti,
                                defaultCalisanMaliyeti: profile.defaultCalisanMaliyeti,
                                defaultTupFiyatKg: profile.defaultTupFiyatKg,
                              });
                              setShowProfileModal(true);
                            }}
                            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground/80 hover:text-blue-400 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm('Bu profili silmek istediginize emin misiniz?')) return;
                              deleteProfile(profile.id);
                              toast.success('Profil silindi');
                            }}
                            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground/80 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 md:space-y-1.5 text-[10px] md:text-xs text-muted-foreground/80">
                        <div className="flex justify-between"><span>Tup:</span><span className="text-orange-400">{profile.defaultTupKg}kg × ₺{profile.defaultTupFiyatKg}</span></div>
                        <div className="flex justify-between"><span>Paket/Isyeri/Calisan:</span><span className="text-white">₺{profile.defaultPaketlemeMaliyeti} / ₺{profile.defaultIsyeriMaliyeti} / ₺{profile.defaultCalisanMaliyeti}</span></div>
                      </div>
                      {profileKayitlar.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/30">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">{profileKayitlar.length} uretim</span>
                            <span className="text-red-400">Ort. Fire: %{profile.avgFireOrani.toFixed(1)}</span>
                          </div>
                          {profile.avgCopOrani > 0 && (
                            <div className="flex justify-between text-[11px] mt-0.5">
                              <span></span>
                              <span className="text-orange-400">Ort. Cop: %{profile.avgCopOrani.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
           ANALİZ
         ═══════════════════════════════════════════════════════ */}
      {activeView === 'analiz' && analytics && (
        <motion.div key="view-analiz" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="space-y-4 md:space-y-6">
          {/* Stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
            <AnimatedStat label={t('uretim.tabs.history_short', 'Kayit')} value={analytics.totalKayit} icon={FileText} color="blue" />
            <AnimatedStat label={t('nav.production', 'Uretim')} value={`${analytics.toplamUretim.toFixed(0)}kg`} icon={Factory} color="green" />
            <AnimatedStat label={t('stok.fireLoss', 'Fire')} value={`%${analytics.avgFire.toFixed(1)}`} icon={TrendingDown} color="red" alert={analytics.avgFire > 40} />
            <AnimatedStat label={t('stok.waste', 'Cop')} value={`%${analytics.avgCop.toFixed(1)}`} icon={Trash2} color="orange" />
            <AnimatedStat label={t('stok.rawMaterial', 'Hammadde')} value={`${analytics.toplamHammadde.toFixed(0)}kg`} icon={Package} color="cyan" />
            <AnimatedStat label={t('common.amount', 'Maliyet')} value={`₺${(analytics.toplamMaliyet / 1000).toFixed(0)}K`} icon={DollarSign} color="purple" />
          </div>

          {/* Verimlilik Özeti */}
          <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6">
            <div className="flex items-center gap-2.5 mb-3 md:mb-5">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-emerald-600/20 to-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-400" />
              </div>
              <h2 className="text-sm md:text-lg font-bold text-white">Verimlilik Ozeti</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              {[
                { value: `%${analytics.toplamHammadde > 0 ? ((analytics.toplamUretim / analytics.toplamHammadde) * 100).toFixed(1) : '0'}`, label: 'Verimlilik', color: 'from-emerald-500/15 to-emerald-600/5', textColor: 'text-emerald-400' },
                { value: `₺${analytics.avgMaliyet.toFixed(0)}`, label: 'Ort. Maliyet/kg', color: 'from-blue-500/15 to-blue-600/5', textColor: 'text-blue-400' },
                { value: `${(analytics.toplamHammadde - analytics.toplamUretim).toFixed(0)}kg`, label: 'Toplam Kayip', color: 'from-red-500/15 to-red-600/5', textColor: 'text-red-400' },
                { value: `₺${(analytics.toplamMaliyet / 1000).toFixed(0)}K`, label: 'Toplam Yatirim', color: 'from-purple-500/15 to-purple-600/5', textColor: 'text-purple-400' },
              ].map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                  className={`p-3 md:p-4 rounded-xl md:rounded-2xl bg-gradient-to-br ${item.color} border border-border/20 text-center relative overflow-hidden group hover:border-border/40 transition-all duration-300`}>
                  <p className={`text-lg md:text-2xl font-bold ${item.textColor} tech-number`}>
                    {item.value}
                  </p>
                  <p className="text-[9px] md:text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-wider font-medium">{item.label}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Profil Bazlı Analiz */}
          {analytics.profileMap && Object.keys(analytics.profileMap).length > 0 && (
            <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6">
              <div className="flex items-center gap-2.5 mb-3 md:mb-5">
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-purple-600/20 to-purple-500/10 flex items-center justify-center">
                  <Layers className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-400" />
                </div>
                <h2 className="text-sm md:text-lg font-bold text-white">Profil Bazli Analiz</h2>
              </div>
              <div className="space-y-2 md:space-y-3">
                {Object.entries(analytics.profileMap).map(([id, data_], i) => {
                  const data = data_ as { name: string; count: number; totalIn: number; totalOut: number; avgFire: number; avgCop: number };
                  const verimlilik = data.totalIn > 0 ? ((data.totalOut / data.totalIn) * 100) : 0;
                  return (
                    <motion.div key={id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className="flex items-center justify-between p-2.5 md:p-4 rounded-lg md:rounded-xl glass-light">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs md:text-sm font-semibold text-white truncate">{data.name}</p>
                        <p className="text-[9px] md:text-[11px] text-muted-foreground">
                          <span className="hidden sm:inline">{data.count} uretim &bull; {data.totalIn.toFixed(0)}kg &rarr; {data.totalOut.toFixed(0)}kg</span>
                          <span className="sm:hidden">{data.count}x &bull; {data.totalIn.toFixed(0)}→{data.totalOut.toFixed(0)}kg</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs ml-2 flex-shrink-0">
                        <div className="text-center">
                          <p className={`font-bold ${verimlilik < 60 ? 'text-red-400' : verimlilik < 75 ? 'text-orange-400' : 'text-emerald-400'}`}>
                            %{verimlilik.toFixed(0)}
                          </p>
                          <p className="text-muted-foreground/70 text-[8px] md:text-[10px]">Verim</p>
                        </div>
                        <div className="text-center">
                          <p className={`font-bold ${data.avgFire > 35 ? 'text-red-400' : 'text-foreground/90'}`}>%{data.avgFire.toFixed(0)}</p>
                          <p className="text-muted-foreground/70 text-[8px] md:text-[10px]">Fire</p>
                        </div>
                        <div className="text-center hidden sm:block">
                          <p className={`font-bold ${data.avgCop > 3 ? 'text-orange-400' : 'text-foreground/90'}`}>%{data.avgCop.toFixed(1)}</p>
                          <p className="text-muted-foreground/70 text-[10px]">Cop</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Supplier Analysis */}
          <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6">
            <div className="flex items-center gap-2.5 mb-3 md:mb-5">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-blue-600/20 to-blue-500/10 flex items-center justify-center">
                <Truck className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm md:text-lg font-bold text-white">Toptanci Analiz</h2>
                <p className="text-[9px] md:text-[10px] text-muted-foreground/60">{Object.keys(analytics.supplierMap).length} toptanci</p>
              </div>
            </div>
            <div className="space-y-2 md:space-y-4">
              {(Object.entries(analytics.supplierMap) as [string, any][])
                .sort(([, a], [, b]) => b.totalKg - a.totalKg)
                .map(([name, data], i) => {
                  const verimlilik = data.totalKg > 0 ? ((data.totalCikti / data.totalKg) * 100) : 0;
                  return (
                    <motion.div key={name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                      className="rounded-lg md:rounded-xl glass-light overflow-hidden">
                      {/* Desktop header */}
                      <div className="hidden sm:flex p-4 items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-purple-600/15 border border-purple-600/20 flex items-center justify-center">
                            <Truck className="w-4 h-4 text-purple-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-white">{name}</p>
                              {data.trKodu && <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded flex items-center gap-0.5"><BadgeCheck className="w-2.5 h-2.5" />{data.trKodu}</span>}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {data.count} uretim &bull; {data.totalKg.toFixed(0)}kg &rarr; {data.totalCikti.toFixed(0)}kg
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <div className="text-center">
                            <p className={`font-bold ${verimlilik < 60 ? 'text-red-400' : verimlilik < 75 ? 'text-orange-400' : 'text-emerald-400'}`}>%{verimlilik.toFixed(1)}</p>
                            <p className="text-muted-foreground/70">Verim</p>
                          </div>
                          <div className="text-center">
                            <p className={`font-bold ${data.avgFire > 35 ? 'text-red-400' : 'text-foreground/90'}`}>%{data.avgFire.toFixed(1)}</p>
                            <p className="text-muted-foreground/70">Fire</p>
                          </div>
                          <div className="text-center">
                            <p className={`font-bold ${data.avgCop > 3 ? 'text-orange-400' : 'text-foreground/90'}`}>%{data.avgCop.toFixed(1)}</p>
                            <p className="text-muted-foreground/70">Cop</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-emerald-400">₺{data.avgMaliyet.toFixed(0)}</p>
                            <p className="text-muted-foreground/70">Ort/kg</p>
                          </div>
                          {data.avgFire > 40 && <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />}
                        </div>
                      </div>
                      {/* Mobile header - compact */}
                      <div className="sm:hidden p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <Truck className="w-3 h-3 text-purple-400" />
                            {name}
                            {data.trKodu && <span className="text-[8px] font-mono text-emerald-400">({data.trKodu})</span>}
                            {data.avgFire > 40 && <AlertTriangle className="w-2.5 h-2.5 text-red-400" />}
                          </p>
                          <span className="text-[10px] text-muted-foreground">{data.count}x</span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="text-muted-foreground">{data.totalKg.toFixed(0)}→{data.totalCikti.toFixed(0)}kg</span>
                          <span className={`font-bold ${verimlilik < 60 ? 'text-red-400' : verimlilik < 75 ? 'text-orange-400' : 'text-emerald-400'}`}>V%{verimlilik.toFixed(0)}</span>
                          <span className={`font-bold ${data.avgFire > 35 ? 'text-red-400' : 'text-foreground/90'}`}>F%{data.avgFire.toFixed(0)}</span>
                          <span className="font-bold text-emerald-400 ml-auto">₺{data.avgMaliyet.toFixed(0)}/kg</span>
                        </div>
                      </div>

                      {/* Ürün Bazlı Detay */}
                      {Object.keys(data.urunler).length > 0 && (
                        <div className="border-t border-border/20 px-2.5 md:px-4 pb-2 md:pb-3 pt-1.5 md:pt-2">
                          <p className="text-[9px] md:text-[10px] text-muted-foreground/70 uppercase tracking-wider font-bold mb-1.5 md:mb-2">Urun Detay</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 md:gap-2">
                            {(Object.entries(data.urunler) as [string, any][])
                              .sort(([, a], [, b]) => b.totalKg - a.totalKg)
                              .map(([urunName, urunData]) => {
                                const urunVerim = urunData.totalKg > 0 ? ((urunData.totalCikti / urunData.totalKg) * 100) : 0;
                                return (
                                  <div key={urunName} className="flex items-center justify-between p-1.5 md:p-2.5 rounded-md md:rounded-lg bg-background/60 border border-border/15">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[10px] md:text-xs font-medium text-white truncate">{urunName}</p>
                                      <p className="text-[9px] md:text-[10px] text-muted-foreground/70">
                                        {urunData.count}x &bull; {urunData.totalKg.toFixed(0)}→{urunData.totalCikti.toFixed(0)}kg
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 md:gap-2.5 text-[9px] md:text-[10px] ml-1">
                                      <span className={`font-bold ${urunVerim < 60 ? 'text-red-400' : urunVerim < 75 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                        %{urunVerim.toFixed(0)}
                                      </span>
                                      <span className={`font-bold ${urunData.avgFire > 35 ? 'text-red-400' : 'text-muted-foreground/80'}`}>
                                        F%{urunData.avgFire.toFixed(0)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              {Object.keys(analytics.supplierMap).length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-6">Toptanci verisi bulunamadi</p>
              )}
            </div>
          </div>

          {/* Monthly Trends */}
          <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6">
            <div className="flex items-center gap-2.5 mb-3 md:mb-5">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-cyan-600/20 to-cyan-500/10 flex items-center justify-center">
                <BarChart3 className="w-3.5 h-3.5 md:w-4 md:h-4 text-cyan-400" />
              </div>
              <h2 className="text-sm md:text-lg font-bold text-white">Aylik Trend</h2>
            </div>
            <div className="space-y-1.5 md:space-y-3">
              {(Object.entries(analytics.monthlyMap) as [string, any][])
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([month, data], i) => (
                <motion.div key={month} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                  className="flex items-center justify-between p-2.5 md:p-4 rounded-lg md:rounded-xl glass-light">
                  <div>
                    <p className="text-xs md:text-sm font-semibold text-white">{month}</p>
                    <p className="text-[9px] md:text-[11px] text-muted-foreground">{data.count} uretim</p>
                  </div>
                  <div className="flex items-center gap-3 md:gap-6 text-[10px] md:text-xs">
                    <div className="text-center">
                      <p className="font-bold text-emerald-400">₺{(data.totalMaliyet / 1000).toFixed(0)}K</p>
                      <p className="text-muted-foreground/70 text-[8px] md:text-[10px]">Maliyet</p>
                    </div>
                    <div className="text-center">
                      <p className={`font-bold ${data.avgFire > 35 ? 'text-red-400' : 'text-foreground/90'}`}>%{data.avgFire.toFixed(0)}</p>
                      <p className="text-muted-foreground/70 text-[8px] md:text-[10px]">Fire</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
           KIYMA MALİYET HESAPLAMA
         ═══════════════════════════════════════════════════════ */}
      {activeView === 'kiyma' && (
        <motion.div
          key="view-kiyma"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4 md:space-y-6"
        >
          {/* Başlık kartı */}
          <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                  <ChefHat className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="absolute -inset-1 rounded-xl bg-red-500/15 blur-md -z-10" />
              </div>
              <div>
                <h2 className="text-base md:text-xl font-bold text-white">Kıyma Maliyet Hesaplama</h2>
                <p className="text-[11px] md:text-sm text-muted-foreground/70">Farklı ağırlık ve fiyattaki ürünleri karıştırarak ağırlıklı ortalama maliyet hesaplayın ve reçeteleri karşılaştırın</p>
              </div>
            </div>
          </div>

          {/* Ana içerik - iki sütun */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start">

            {/* ─── Sol: Reçete oluşturucu ─────────────────────────── */}
            <div className="space-y-3">
              <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                    <Scale className="w-4 h-4 text-red-400" />
                    Malzeme Listesi
                  </h3>
                  <button
                    onClick={() => setKiymaKalemler(prev => [...prev, {
                      id: crypto.randomUUID(), name: '', stokId: '', kg: 0, birimFiyat: 0, useStokFiyat: true, stokOrtMaliyet: 0,
                    }])}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-medium rounded-lg border border-red-500/20 transition-all duration-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Malzeme Ekle
                  </button>
                </div>

                <div className="space-y-2.5">
                  {kiymaKalemler.map((kalem) => (
                    <motion.div
                      key={kalem.id}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-2"
                    >
                      {/* Ürün seç + sil */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <select
                            value={kalem.stokId}
                            onChange={e => {
                              const sel = stokList.find(s => s.id === e.target.value);
                              const ortMaliyet = sel ? getKiymaStokMaliyet(sel) : 0;
                              setKiymaKalemler(prev => prev.map(k => k.id === kalem.id ? {
                                ...k, stokId: e.target.value,
                                name: sel?.name || k.name,
                                stokOrtMaliyet: ortMaliyet,
                                birimFiyat: k.useStokFiyat ? ortMaliyet : k.birimFiyat,
                              } : k));
                            }}
                            className="w-full text-xs bg-secondary/50 border border-border/40 rounded-lg px-2.5 py-1.5 text-foreground/90 focus:outline-none focus:border-red-500/40"
                          >
                            <option value="">— Stoktan Seç —</option>
                            {stokList.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        {kiymaKalemler.length > 1 && (
                          <button
                            onClick={() => setKiymaKalemler(prev => prev.filter(k => k.id !== kalem.id))}
                            className="p-1.5 text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Manuel ürün adı (stok seçilmediyse) */}
                      {!kalem.stokId && (
                        <input
                          type="text"
                          placeholder="Ürün adı (manuel giriş)"
                          value={kalem.name}
                          onChange={e => setKiymaKalemler(prev => prev.map(k => k.id === kalem.id ? { ...k, name: e.target.value } : k))}
                          className="w-full text-xs bg-secondary/50 border border-border/40 rounded-lg px-2.5 py-1.5 text-foreground/90 focus:outline-none focus:border-red-500/40 placeholder:text-muted-foreground/40"
                        />
                      )}

                      {/* Miktar + Fiyat */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground/70 mb-1 block">Miktar (kg)</label>
                          <input
                            type="number"
                            value={kalem.kg || ''}
                            onChange={e => setKiymaKalemler(prev => prev.map(k => k.id === kalem.id ? { ...k, kg: Number(e.target.value) } : k))}
                            placeholder="0"
                            min={0} step={0.5}
                            className="w-full text-xs bg-secondary/50 border border-border/40 rounded-lg px-2.5 py-1.5 text-foreground/90 focus:outline-none focus:border-red-500/40"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-muted-foreground/70">
                              {kalem.useStokFiyat && kalem.stokId ? 'Stok Ort. Fiyat (₺/kg)' : 'Manuel Fiyat (₺/kg)'}
                            </label>
                            {kalem.stokId && (
                              <button
                                onClick={() => setKiymaKalemler(prev => prev.map(k => k.id === kalem.id ? {
                                  ...k, useStokFiyat: !k.useStokFiyat,
                                  birimFiyat: !k.useStokFiyat ? k.stokOrtMaliyet : k.birimFiyat,
                                } : k))}
                                className={`text-[9px] px-1.5 py-0.5 rounded-md border font-medium transition-all ${
                                  kalem.useStokFiyat
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                                }`}
                              >
                                {kalem.useStokFiyat ? '📦 Stok' : '✏️ Manuel'}
                              </button>
                            )}
                          </div>
                          <input
                            type="number"
                            value={kalem.useStokFiyat && kalem.stokId
                              ? (kalem.stokOrtMaliyet || '')
                              : (kalem.birimFiyat || '')}
                            onChange={e => {
                              if (kalem.useStokFiyat && kalem.stokId) return;
                              setKiymaKalemler(prev => prev.map(k => k.id === kalem.id ? { ...k, birimFiyat: Number(e.target.value) } : k));
                            }}
                            readOnly={kalem.useStokFiyat && !!kalem.stokId}
                            placeholder="0.00"
                            min={0} step={0.01}
                            className={`w-full text-xs border rounded-lg px-2.5 py-1.5 text-foreground/90 focus:outline-none transition-colors ${
                              kalem.useStokFiyat && kalem.stokId
                                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300 cursor-not-allowed'
                                : 'bg-secondary/50 border-border/40 focus:border-red-500/40'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Kalem alt satırı */}
                      {kalem.kg > 0 && (kalem.useStokFiyat ? kalem.stokOrtMaliyet : kalem.birimFiyat) > 0 && (
                        <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-border/20">
                          <span className="text-muted-foreground/60">
                            {kalem.kg} kg × ₺{(kalem.useStokFiyat ? kalem.stokOrtMaliyet : kalem.birimFiyat).toFixed(2)}/kg
                          </span>
                          <span className="font-bold text-white">
                            = ₺{(kalem.kg * (kalem.useStokFiyat ? kalem.stokOrtMaliyet : kalem.birimFiyat)).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {/* Stok yeterliliği */}
                      {kalem.stokId && kalem.kg > 0 && (() => {
                        const stok = stokList.find(s => s.id === kalem.stokId);
                        if (!stok) return null;
                        const mevcutStok = stok.currentStock ?? stok.current_stock ?? stok.stock ?? 0;
                        const yeterli = mevcutStok >= kalem.kg;
                        return (
                          <div className={`flex items-center gap-1 text-[9px] font-medium ${yeterli ? 'text-emerald-400' : 'text-red-400'}`}>
                            <span>{yeterli ? '✓' : '⚠'}</span>
                            <span>
                              {yeterli
                                ? `Stok yeterli — mevcut: ${mevcutStok.toFixed(1)} kg`
                                : `Stok yetersiz — mevcut: ${mevcutStok.toFixed(1)} kg, eksik: ${(kalem.kg - mevcutStok).toFixed(1)} kg`}
                            </span>
                          </div>
                        );
                      })()}
                    </motion.div>
                  ))}
                </div>

                {/* Özet + Kaydet */}
                {kiymaCalc.toplamKg > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 rounded-xl bg-gradient-to-br from-red-500/10 to-rose-600/5 border border-red-500/20"
                  >
                    {/* Özet istatistikler */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { label: 'Toplam', value: `${kiymaCalc.toplamKg.toFixed(1)}`, unit: 'kg', color: 'text-white' },
                        { label: 'Ort. Maliyet', value: `₺${kiymaCalc.ortMaliyet.toFixed(2)}`, unit: '/kg', color: 'text-red-400' },
                        { label: 'Toplam Maliyet', value: `₺${kiymaCalc.toplamMaliyet.toFixed(0)}`, unit: '', color: 'text-orange-400' },
                      ].map((s, i) => (
                        <div key={i} className="text-center">
                          <p className={`text-lg md:text-2xl font-bold tech-number ${s.color}`}>
                            {s.value}<span className="text-[10px] text-muted-foreground/60 ml-0.5">{s.unit}</span>
                          </p>
                          <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Gelişmiş metrikler */}
                    {kiymaCalc.stdSapma > 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-3 p-2.5 rounded-lg bg-secondary/20 border border-border/20">
                        <div>
                          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-0.5">Std. Sapma</p>
                          <p className="text-xs font-bold text-purple-400 tech-number">±₺{kiymaCalc.stdSapma.toFixed(2)}/kg</p>
                          <p className="text-[9px] text-muted-foreground/40">Fiyat tutarlılığı</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-0.5">Pot. Tasarruf</p>
                          <p className="text-xs font-bold text-cyan-400 tech-number">₺{kiymaCalc.potansiyelTasarruf.toFixed(2)}</p>
                          <p className="text-[9px] text-muted-foreground/40">En pahalıyı ucuzla değiştir</p>
                        </div>
                        {kiymaCalc.minKalem && kiymaCalc.maxKalem && kiymaCalc.minKalem.name !== kiymaCalc.maxKalem.name && (
                          <div className="col-span-2 flex items-center justify-between pt-1.5 border-t border-border/15">
                            <span className="text-[9px] text-emerald-400">⬇ En ucuz: {kiymaCalc.minKalem.name} (₺{kiymaCalc.minKalem.fiyat.toFixed(2)}/kg)</span>
                            <span className="text-[9px] text-red-400">⬆ En pahalı: {kiymaCalc.maxKalem.name} (₺{kiymaCalc.maxKalem.fiyat.toFixed(2)}/kg)</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Kar marjı senaryoları + özel marj */}
                    <div className="mb-3 pt-3 border-t border-border/20">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                        {[20, 30, 50].map(marj => (
                          <div key={marj} className="text-center p-2 rounded-lg bg-secondary/30">
                            <p className="text-xs md:text-sm font-bold text-emerald-400 tech-number">
                              ₺{(kiymaCalc.ortMaliyet * (1 + marj / 100)).toFixed(2)}
                            </p>
                            <p className="text-[9px] text-muted-foreground/60">+%{marj} kâr</p>
                          </div>
                        ))}
                        <div className="text-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <p className="text-xs md:text-sm font-bold text-blue-400 tech-number">
                            ₺{(kiymaCalc.ortMaliyet * (1 + kiymaOzelMarj / 100)).toFixed(2)}
                          </p>
                          <div className="flex items-center justify-center gap-0.5">
                            <span className="text-[9px] text-muted-foreground/60">+%</span>
                            <input
                              type="number"
                              value={kiymaOzelMarj}
                              onChange={e => setKiymaOzelMarj(Math.max(0, Number(e.target.value)))}
                              min={0} max={500}
                              className="w-8 text-[9px] text-center bg-transparent border-b border-blue-500/30 text-blue-300 focus:outline-none focus:border-blue-400"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Kaydet */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Reçete adı..."
                        value={kiymaReceteAdi}
                        onChange={e => setKiymaReceteAdi(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const n = kiymaReceteAdi.trim();
                            if (!n) { toast.warning('Reçete adı girin'); return; }
                            const yeni: KiymaRecete = {
                              id: crypto.randomUUID(), name: n,
                              kalemler: kiymaKalemler.filter(k => k.kg > 0),
                              createdAt: new Date().toISOString(),
                            };
                            const updated = [...kiymaReceteler, yeni];
                            setKiymaReceteler(updated);
                            setInStorage(KIYMA_STORAGE_KEY as any, updated);
                            setKiymaReceteAdi('');
                            toast.success(`"${n}" reçetesi kaydedildi`);
                          }
                        }}
                        className="flex-1 text-xs bg-secondary/50 border border-border/40 rounded-lg px-2.5 py-2 text-foreground/90 focus:outline-none focus:border-red-500/40 placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={() => {
                          const n = kiymaReceteAdi.trim();
                          if (!n) { toast.warning('Reçete adı girin'); return; }
                          const yeni: KiymaRecete = {
                            id: crypto.randomUUID(), name: n,
                            kalemler: kiymaKalemler.filter(k => k.kg > 0),
                            createdAt: new Date().toISOString(),
                          };
                          const updated = [...kiymaReceteler, yeni];
                          setKiymaReceteler(updated);
                          setInStorage(KIYMA_STORAGE_KEY as any, updated);
                          setKiymaReceteAdi('');
                          toast.success(`"${n}" reçetesi kaydedildi`);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-red-500/20 transition-all duration-200 whitespace-nowrap flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Kaydet
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* ─── Sağ: Grafikler ─────────────────────────────────── */}
            <div className="space-y-4">
              {kiymaCalc.toplamKg > 0 && kiymaCalc.pieData.length > 0 ? (
                <>
                  {/* Pasta grafik - maliyet dağılımı */}
                  <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6">
                    <h3 className="text-sm md:text-base font-bold text-white flex items-center gap-2 mb-4">
                      <DollarSign className="w-4 h-4 text-red-400" />
                      Maliyet Dağılımı
                    </h3>
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChartRC>
                        <Pie
                          data={kiymaCalc.pieData}
                          cx="50%" cy="50%"
                          innerRadius={52} outerRadius={80}
                          dataKey="value"
                          paddingAngle={3}
                          label={({ name, percent }) => percent > 0.07 ? `%${(percent * 100).toFixed(0)}` : ''}
                          labelLine={false}
                        >
                          {kiymaCalc.pieData.map((_, i) => (
                            <Cell key={i} fill={KIYMA_COLORS[i % KIYMA_COLORS.length]} />
                          ))}
                        </Pie>
                        <RCTooltip
                          contentStyle={{ background: '#2a2a3d', border: '1px solid #45475a', borderRadius: 8, fontSize: 11 }}
                          formatter={(v: number, n: string) => [`₺${v.toFixed(2)}`, n]}
                        />
                      </PieChartRC>
                    </ResponsiveContainer>
                    {/* Açıklama listesi */}
                    <div className="space-y-1.5 mt-1">
                      {kiymaCalc.pieData.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: KIYMA_COLORS[i % KIYMA_COLORS.length] }} />
                            <span className="text-muted-foreground/80 truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                            <span className="text-muted-foreground/60">{item.kg.toFixed(1)} kg</span>
                            <span className="font-bold text-white">₺{item.value.toFixed(2)}</span>
                            <div className="w-14 bg-secondary/50 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${kiymaCalc.toplamMaliyet > 0 ? (item.value / kiymaCalc.toplamMaliyet * 100) : 0}%`,
                                  background: KIYMA_COLORS[i % KIYMA_COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bar grafik - ürün birim maliyet karşılaştırması */}
                  <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                      <BarChart3 className="w-4 h-4 text-orange-400" />
                      Ürün Birim Maliyet (₺/kg)
                    </h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChartRC data={kiymaCalc.barData} margin={{ top: 0, right: 0, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#7f849c', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#7f849c', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₺${v}`} />
                        <ReferenceLine
                          y={kiymaCalc.ortMaliyet}
                          stroke="#f38ba8"
                          strokeDasharray="4 3"
                          label={{ value: `Ort ₺${kiymaCalc.ortMaliyet.toFixed(0)}`, fill: '#f38ba8', fontSize: 10, position: 'insideTopRight' }}
                        />
                        <RCTooltip
                          contentStyle={{ background: '#2a2a3d', border: '1px solid #45475a', borderRadius: 8, fontSize: 11 }}
                          formatter={(v: number) => [`₺${v.toFixed(2)}/kg`, 'Birim Maliyet']}
                        />
                        <Bar dataKey="birimMaliyet" radius={[4, 4, 0, 0]} name="Birim Maliyet/kg">
                          {kiymaCalc.barData.map((entry, i) => (
                            <Cell key={i} fill={entry.aboveAvg ? '#f38ba8' : '#a6e3a1'} />
                          ))}
                        </Bar>
                      </BarChartRC>
                    </ResponsiveContainer>
                    <div className="flex items-center justify-center gap-4 mt-2">
                      <span className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
                        <span className="w-2 h-2 rounded-sm bg-[#a6e3a1] inline-block" /> Ortalamanın altında
                      </span>
                      <span className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
                        <span className="w-2 h-2 rounded-sm bg-[#f38ba8] inline-block" /> Ortalamanın üstünde
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="card-premium rounded-xl md:rounded-2xl p-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/15 flex items-center justify-center mx-auto mb-3">
                    <ChefHat className="w-7 h-7 text-red-400/40" />
                  </div>
                  <p className="text-sm font-medium text-white mb-1">Grafik burada görünecek</p>
                  <p className="text-xs text-muted-foreground/60">Sol taraftan malzemeleri ekleyip kg ve fiyat girin</p>
                </div>
              )}
            </div>
          </div>

          {/* ─── Kayıtlı reçeteler karşılaştırması ──────────────── */}
          {kiymaReceteler.length > 0 && (
            <div className="card-premium card-shine rounded-xl md:rounded-2xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  Kayıtlı Reçete Karşılaştırması
                  <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-400">{kiymaReceteler.length}</span>
                </h3>
                <button
                  onClick={() => {
                    if (window.confirm('Tüm kayıtlı reçeteler silinsin mi?')) {
                      setKiymaReceteler([]);
                      setInStorage(KIYMA_STORAGE_KEY as any, []);
                      toast.success('Reçeteler temizlendi');
                    }
                  }}
                  className="p-1.5 text-red-400/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Bar chart - ortalama maliyet karşılaştırması */}
              <ResponsiveContainer width="100%" height={180}>
                <BarChartRC
                  data={kiymaReceteler.map(r => {
                    const totKg = r.kalemler.reduce((s, k) => s + k.kg, 0);
                    const totM = r.kalemler.reduce((s, k) => s + k.kg * (k.useStokFiyat ? k.stokOrtMaliyet : k.birimFiyat), 0);
                    return {
                      name: r.name.length > 14 ? r.name.slice(0, 14) + '…' : r.name,
                      ortMaliyet: totKg > 0 ? Math.round((totM / totKg) * 100) / 100 : 0,
                      toplamKg: totKg,
                    };
                  })}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#7f849c', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#7f849c', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₺${v}`} />
                  <RCTooltip
                    contentStyle={{ background: '#2a2a3d', border: '1px solid #45475a', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, _: string, p: any) => [
                      `₺${v.toFixed(2)}/kg  (${p.payload.toplamKg.toFixed(1)} kg toplam)`,
                      'Ort. Maliyet',
                    ]}
                  />
                  <Bar dataKey="ortMaliyet" radius={[5, 5, 0, 0]} name="Ort. Maliyet/kg">
                    {kiymaReceteler.map((_, i) => (
                      <Cell key={i} fill={KIYMA_COLORS[i % KIYMA_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChartRC>
              </ResponsiveContainer>

              {/* Reçete kartları */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                {kiymaReceteler.map((r, ri) => {
                  const totKg = r.kalemler.reduce((s, k) => s + k.kg, 0);
                  const totM = r.kalemler.reduce((s, k) => s + k.kg * (k.useStokFiyat ? k.stokOrtMaliyet : k.birimFiyat), 0);
                  const ortM = totKg > 0 ? totM / totKg : 0;
                  return (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: ri * 0.05 }}
                      className="relative p-3.5 rounded-xl border border-border/30 glass-light overflow-hidden group"
                    >
                      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: KIYMA_COLORS[ri % KIYMA_COLORS.length] }} />
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-xs font-bold text-white">{r.name}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {r.kalemler.length} malzeme &bull; {totKg.toFixed(1)} kg
                          </p>
                        </div>
                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => {
                              const yeniKalemler = r.kalemler.map(k => ({ ...k, id: crypto.randomUUID() }));
                              setKiymaKalemler(yeniKalemler.length > 0 ? yeniKalemler : [{ id: crypto.randomUUID(), name: '', stokId: '', kg: 0, birimFiyat: 0, useStokFiyat: true, stokOrtMaliyet: 0 }]);
                              setKiymaReceteAdi(r.name + ' (kopya)');
                              toast.success(`"${r.name}" hesaplayıcıya yüklendi`);
                            }}
                            title="Hesaplayıcıya yükle"
                            className="p-1 text-muted-foreground/40 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v13"/><path d="m5 9 7 7 7-7"/><rect x="3" y="19" width="18" height="2" rx="1"/></svg>
                          </button>
                          <button
                            onClick={() => {
                              const updated = kiymaReceteler.filter(x => x.id !== r.id);
                              setKiymaReceteler(updated);
                              setInStorage(KIYMA_STORAGE_KEY as any, updated);
                            }}
                            className="p-1 text-muted-foreground/40 hover:text-red-400 rounded-lg transition-all"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xl font-bold tech-number mb-0.5" style={{ color: KIYMA_COLORS[ri % KIYMA_COLORS.length] }}>
                        ₺{ortM.toFixed(2)}<span className="text-[10px] text-muted-foreground/60 ml-0.5">/kg</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mb-2">Toplam: ₺{totM.toFixed(0)}</p>

                      {/* Kâr senaryoları */}
                      <div className="flex gap-1 flex-wrap mb-2">
                        {[20, 30, 50].map(marj => (
                          <span key={marj} className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-medium">
                            +%{marj}: ₺{(ortM * (1 + marj / 100)).toFixed(2)}
                          </span>
                        ))}
                      </div>

                      {/* Mini malzeme listesi */}
                      <div className="pt-2 border-t border-border/20 space-y-0.5">
                        {r.kalemler.slice(0, 3).map((k, ki) => (
                          <div key={ki} className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground/60 truncate max-w-[110px]">{k.name || 'İsimsiz'}</span>
                            <span className="text-muted-foreground/70 flex-shrink-0">
                              {k.kg}kg @ ₺{(k.useStokFiyat ? k.stokOrtMaliyet : k.birimFiyat).toFixed(0)}
                            </span>
                          </div>
                        ))}
                        {r.kalemler.length > 3 && (
                          <p className="text-[9px] text-muted-foreground/40">+{r.kalemler.length - 3} malzeme daha</p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {activeView === 'analiz' && !analytics && (
        <motion.div key="view-analiz-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card-premium rounded-2xl p-10 md:p-16 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.03] to-cyan-500/[0.03] pointer-events-none" />
          <div className="relative z-10">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-gradient-to-br from-blue-500/15 to-cyan-500/10 border border-blue-500/15 mx-auto mb-4 md:mb-5 flex items-center justify-center">
              <BarChart3 className="w-8 h-8 md:w-10 md:h-10 text-blue-400/60" />
            </div>
            <h3 className="text-base md:text-lg font-bold text-white mb-2">Analiz icin veri yetersiz</h3>
            <p className="text-muted-foreground/70 text-xs md:text-sm max-w-sm mx-auto">Uretim kayitlari olusturdukca analiz verileri burada gorunecek</p>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════
           PROFİL MODAL
         ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showProfileModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowProfileModal(false)} className="fixed inset-0 bg-black/70 backdrop-blur-md z-50" />
            {/* Desktop: centered modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ type: 'spring', stiffness: 240, damping: 28 }}
              className="fixed z-50 modal-glass border border-border/40 shadow-2xl overflow-y-auto
                sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl sm:p-6 sm:max-h-[90vh]
                inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-auto rounded-t-2xl p-4 max-h-[85vh]"
            >
              {/* Mobile drag handle */}
              <div className="sm:hidden flex justify-center pt-1 pb-3">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500/60 to-transparent rounded-t-2xl" />
              
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <Layers className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-white">{editingProfile ? 'Profil Duzenle' : 'Yeni Uretim Profili'}</h3>
                </div>
                <button onClick={() => setShowProfileModal(false)} className="p-2 hover:bg-secondary/60 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-muted-foreground/60" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-2">Profil Adi</label>
                  <input
                    value={profileForm.name}
                    onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                    className={inputClass}
                    placeholder="ornegin: Kelle, Yanak, Kuyruk Yagi..."
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tup Fiyati (TL/kg)</label>
                    <input type="number" value={profileForm.defaultTupFiyatKg} onChange={e => setProfileForm({ ...profileForm, defaultTupFiyatKg: Number(e.target.value) })} className={inputClass} min={0} />
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">Simdi: ~103 TL/kg civari</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tup/Kazan (kg)</label>
                    <input type="number" value={profileForm.defaultTupKg} onChange={e => setProfileForm({ ...profileForm, defaultTupKg: Number(e.target.value) })} className={inputClass} min={0} />
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">Her kazan icin tup kullanimi</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Paketleme (TL/kg)</label>
                    <input type="number" value={profileForm.defaultPaketlemeMaliyeti} onChange={e => setProfileForm({ ...profileForm, defaultPaketlemeMaliyeti: Number(e.target.value) })} className={inputClass} min={0} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Isyeri Masrafi (TL/kg)</label>
                    <input type="number" value={profileForm.defaultIsyeriMaliyeti} onChange={e => setProfileForm({ ...profileForm, defaultIsyeriMaliyeti: Number(e.target.value) })} className={inputClass} min={0} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Calisan (TL/kg)</label>
                    <input type="number" value={profileForm.defaultCalisanMaliyeti} onChange={e => setProfileForm({ ...profileForm, defaultCalisanMaliyeti: Number(e.target.value) })} className={inputClass} min={0} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <motion.button whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.98 }} onClick={handleSaveProfile}
                  className="flex-1 py-3.5 sm:py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:from-purple-700 active:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-purple-500/15 transition-all duration-300 text-sm sm:text-base">
                  {editingProfile ? 'Guncelle' : 'Olustur'}
                </motion.button>
                <button onClick={() => setShowProfileModal(false)} className="flex-1 py-3.5 sm:py-3 bg-secondary/50 hover:bg-accent/50 active:bg-accent/70 text-muted-foreground hover:text-foreground/90 rounded-xl border border-border/30 transition-all duration-300 text-sm sm:text-base">
                  Iptal
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
