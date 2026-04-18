// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus, Search, Building2, User, Phone, TrendingUp, TrendingDown,
  Eye, Trash2, MapPin, Tag, Receipt, Mail, CreditCard, Edit2,
  X, ChevronDown, Check, Globe, LayoutGrid, List, Filter, BadgeCheck, Users,
  Sparkles, ArrowRight, ShieldCheck, Store, Truck, CheckCircle2, History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { staggerContainer, tableRow, gridCard, hover, tap } from '../utils/animations';
import { useNavigate } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { useTableSync } from '../hooks/useTableSync';
import { SyncStatusBar, SyncBadge } from '../components/SyncStatusBar';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { kvGet, kvSet } from '../lib/pouchdb-kv';
import { SwipeToDelete } from '../components/MobileHelpers';

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface Cari {
  id: string;
  type: 'Müşteri' | 'Toptancı';
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
  taxOffice: string;
  approvedBusinessNo?: string;
  region: string;
  category: string;
  balance: number;
  transactions: number;
  transactionHistory?: Transaction[];
  created_at?: string;
  invoiceMode?: 'tam' | 'kismi' | 'yok';
  defaultKdvRate?: number;
  openingBalance?: number;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
}

interface Region {
  id: string;
  name: string;
  color: string;
}

// ─── Initial Data ───────────────────────────────────────────────────────────
const INITIAL_REGIONS: Region[] = [
  { id: 'r1', name: 'Çankaya', color: '#3b82f6' },
  { id: 'r2', name: 'Keçiören', color: '#10b981' },
  { id: 'r3', name: 'Yenimahalle', color: '#f59e0b' },
  { id: 'r4', name: 'Altındağ', color: '#8b5cf6' },
  { id: 'r5', name: 'Sincan', color: '#ef4444' },
  { id: 'r6', name: 'Mamak', color: '#06b6d4' },
  { id: 'r7', name: 'OSB Bölgesi', color: '#ec4899' },
];

const DEFAULT_MUSTERI_CATEGORIES = ['Restoran', 'Market', 'Lokanta', 'Kebapçı', 'Kasap', 'Catering', 'Otel', 'Diğer'];
const DEFAULT_TOPTANCI_CATEGORIES = ['Et Tedarikçisi', 'Yan Ürün', 'Ambalaj', 'Soğuk Zincir', 'İthalat', 'Diğer'];

const CATEGORY_COLORS: Record<string, string> = {
  'Restoran': '#f59e0b', 'Market': '#3b82f6', 'Lokanta': '#10b981', 'Kebapçı': '#ef4444',
  'Kasap': '#dc2626', 'Catering': '#8b5cf6', 'Otel': '#06b6d4', 'Diğer': '#64748b',
  'Et Tedarikçisi': '#ef4444', 'Yan Ürün': '#f97316', 'Ambalaj': '#84cc16',
  'Soğuk Zincir': '#06b6d4', 'İthalat': '#a855f7',
};

const initialCariList: Cari[] = [];

// ─── Region Selector Component ──────────────────────────────────────────────
function RegionSelector({
  value,
  onChange,
  regions,
  onManageRegions,
}: {
  value: string;
  onChange: (v: string) => void;
  regions: Region[];
  onManageRegions: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const selected = regions.find(r => r.name === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-accent/50 border border-border rounded-lg text-white focus:outline-none focus:border-blue-500 hover:border-border transition-colors"
      >
        {selected ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
            <span className="flex-1 text-left">{selected.name}</span>
          </>
        ) : (
          <>
            <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-left text-muted-foreground">{t('customers.selectRegion')}</span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full mt-1 left-0 right-0 bg-secondary border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="max-h-52 overflow-y-auto">
              {regions.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { onChange(r.name); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-left"
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-white text-sm flex-1">{r.name}</span>
                  {value === r.name && <Check className="w-4 h-4 text-blue-400" />}
                </button>
              ))}
            </div>
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => { setOpen(false); onManageRegions(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-blue-600/10 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('cari.manageRegionsBtn', 'Bölge Ekle / Düzenle')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Region Manager Modal ────────────────────────────────────────────────────
const REGION_COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#f97316','#84cc16','#a78bfa'];

function RegionManagerModal({
  open,
  onClose,
  regions,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  regions: Region[];
  onSave: (regions: Region[]) => void;
}) {
  const [localRegions, setLocalRegions] = useState<Region[]>(regions);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(REGION_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const { t } = useLanguage();

  useEffect(() => { setLocalRegions(regions); }, [regions, open]);

  const handleAdd = () => {
    if (!newName.trim()) { toast.error(t('cari.regionEmpty')); return; }
    if (localRegions.some(r => r.name.toLowerCase() === newName.trim().toLowerCase())) {
      toast.error(t('cari.regionExists')); return;
    }
    const added: Region = { id: `r-${Date.now()}`, name: newName.trim(), color: newColor };
    setLocalRegions([...localRegions, added]);
    setNewName('');
    toast.success(`"${added.name}" ${t('cari.regionAdded')}`);
  };

  const handleDelete = (id: string) => {
    setLocalRegions(localRegions.filter(r => r.id !== id));
  };

  const handleEditSave = (id: string) => {
    if (!editName.trim()) return;
    setLocalRegions(localRegions.map(r => r.id === id ? { ...r, name: editName.trim() } : r));
    setEditingId(null);
  };

  const handleSave = () => {
    onSave(localRegions);
    onClose();
    toast.success(t('cari.regionsSaved'));
  };

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" />
        <Dialog.Content
          className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 rounded-2xl border border-border/40 sm:w-[95vw] sm:max-w-lg shadow-2xl z-[60] modal-glass overflow-y-auto overscroll-contain" style={{maxHeight:'calc(100dvh - 1rem)'}}
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between p-6 border-b border-border">
            <Dialog.Title className="text-xl font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-400" />
              {t('cari.regionManagement')}
            </Dialog.Title>
            <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Yeni bölge ekleme */}
            <div>
              <p className="text-sm text-muted-foreground mb-3">{t('cari.regionAddEdit')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
                  placeholder={t('cari.regionNamePlaceholder')}
                  className="flex-1 px-4 py-2.5 bg-secondary border border-border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-1 p-1 bg-secondary border border-border rounded-lg">
                  {REGION_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`w-5 h-5 rounded-full transition-all ${newColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-background scale-110' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  {t('common.add')}
                </button>
              </div>
            </div>

            {/* Mevcut bölgeler */}
            <div>
              <p className="text-sm text-muted-foreground mb-3">{t('customers.existingRegions')} ({localRegions.length})</p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {localRegions.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                    {editingId === r.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(r.id); if (e.key === 'Escape') setEditingId(null); }}
                        onBlur={() => handleEditSave(r.id)}
                        className="flex-1 bg-accent border border-blue-500 rounded px-2 py-1 text-white text-sm focus:outline-none"
                      />
                    ) : (
                      <span className="flex-1 text-white text-sm">{r.name}</span>
                    )}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => { setEditingId(r.id); setEditName(r.name); }}
                        className="p-1.5 hover:bg-accent rounded transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 hover:bg-red-900/40 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 p-6 border-t border-border">
            <button onClick={onClose} className="flex-1 py-2.5 bg-secondary hover:bg-accent text-white rounded-lg text-sm transition-colors">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
              {t('common.save')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Category Manager Modal ─────────────────────────────────────────────────
function CategoryManagerModal({
  open,
  onClose,
  musteriCategories,
  toptanciCategories,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  musteriCategories: string[];
  toptanciCategories: string[];
  onSave: (musteri: string[], toptanci: string[]) => void;
}) {
  const [localMusteri, setLocalMusteri] = useState<string[]>(musteriCategories);
  const [localToptanci, setLocalToptanci] = useState<string[]>(toptanciCategories);
  const [activeTab, setActiveTab] = useState<'musteri' | 'toptanci'>('musteri');
  const [newCat, setNewCat] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    setLocalMusteri(musteriCategories);
    setLocalToptanci(toptanciCategories);
  }, [musteriCategories, toptanciCategories, open]);

  const currentList = activeTab === 'musteri' ? localMusteri : localToptanci;
  const setCurrentList = activeTab === 'musteri' ? setLocalMusteri : setLocalToptanci;

  const handleAdd = () => {
    const val = newCat.trim();
    if (!val) { toast.error('Kategori adı boş olamaz'); return; }
    if (currentList.some(c => c.toLowerCase() === val.toLowerCase())) { toast.error('Bu kategori zaten mevcut'); return; }
    setCurrentList([...currentList, val]);
    setNewCat('');
    toast.success(`"${val}" eklendi`);
  };

  const handleDelete = (idx: number) => {
    setCurrentList(currentList.filter((_, i) => i !== idx));
  };

  const handleEditSave = (idx: number) => {
    const val = editVal.trim();
    if (!val) return;
    setCurrentList(currentList.map((c, i) => i === idx ? val : c));
    setEditIdx(null);
  };

  const handleSave = () => {
    onSave(localMusteri, localToptanci);
    onClose();
    toast.success('Kategoriler kaydedildi');
  };

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[60]"
          />
        </Dialog.Overlay>
        <Dialog.Content aria-describedby={undefined} asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 30 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-lg overflow-y-auto z-[60] rounded-3xl border border-white/[0.08] shadow-[0_32px_100px_-20px_rgba(0,0,0,0.7),0_0_60px_-10px_rgba(59,130,246,0.15)]"
            style={{ background: 'linear-gradient(145deg, rgba(12,18,32,0.97), rgba(6,9,15,0.98))', backdropFilter: 'blur(40px) saturate(180%)', maxHeight: 'calc(100dvh - 1rem)' }}
          >
            <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-t-3xl" />

            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ rotate: -15, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 12, delay: 0.1 }}
                  className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-600/30"
                >
                  <Tag className="w-5 h-5 text-white" />
                </motion.div>
                <div>
                  <Dialog.Title className="text-lg font-bold text-white">Kategori Yönetimi</Dialog.Title>
                  <p className="text-xs text-gray-500 mt-0.5">{t('cari.categoryManagementDesc')}</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </motion.button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 px-6 mb-4">
              {([
                { key: 'musteri' as const, label: t('cari.customerCategories'), icon: Store, color: 'blue' },
                { key: 'toptanci' as const, label: t('cari.supplierCategories'), icon: Truck, color: 'purple' },
              ]).map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <motion.button
                    key={tab.key}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setActiveTab(tab.key); setNewCat(''); setEditIdx(null); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 border ${
                      isActive
                        ? tab.color === 'blue'
                          ? 'bg-blue-600/15 text-blue-400 border-blue-500/30'
                          : 'bg-purple-600/15 text-purple-400 border-purple-500/30'
                        : 'bg-white/[0.03] text-gray-500 border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </motion.button>
                );
              })}
            </div>

            <div className="px-6 pb-2 space-y-4">
              {/* Yeni kategori ekleme */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
                  placeholder="Yeni kategori adı..."
                  className="flex-1 px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-amber-500/50 placeholder-gray-600 transition-all duration-300"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={handleAdd}
                  className="px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm rounded-xl font-semibold transition-all flex items-center gap-1.5 shadow-lg shadow-amber-600/20"
                >
                  <Plus className="w-4 h-4" />
                  Ekle
                </motion.button>
              </div>

              {/* Mevcut kategoriler */}
              <div>
                <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">
                  Mevcut Kategoriler ({currentList.length})
                </p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  <AnimatePresence>
                    {currentList.map((cat, idx) => (
                      <motion.div
                        key={`${cat}-${idx}`}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl group hover:border-white/[0.12] transition-all"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CATEGORY_COLORS[cat] || '#64748b' }}
                        />
                        {editIdx === idx ? (
                          <input
                            autoFocus
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(idx); if (e.key === 'Escape') setEditIdx(null); }}
                            onBlur={() => handleEditSave(idx)}
                            className="flex-1 bg-white/[0.06] border border-blue-500/40 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
                          />
                        ) : (
                          <span className="flex-1 text-white text-sm">{cat}</span>
                        )}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => { setEditIdx(idx); setEditVal(cat); }}
                            className="p-1.5 hover:bg-white/[0.08] rounded-lg transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(idx)}
                            className="p-1.5 hover:bg-red-900/40 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-white/[0.06] mt-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                className="flex-1 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-gray-400 rounded-xl text-sm font-medium transition-all"
              >
                İptal
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                className="flex-1 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-amber-600/20"
              >
                Kaydet
              </motion.button>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── DB mapping fonksiyonları — bileşen dışında tanımlı (stable ref, sonsuz döngü önleme)
export function cariToDb(c: Cari) {
  return {
    id: c.id,
    type: c.type,
    company_name: c.companyName,
    contact_person: c.contactPerson,
    phone: c.phone,
    email: c.email || null,
    address: c.address || null,
    tax_number: c.taxNumber || null,
    tax_office: c.taxOffice || null,
    approved_business_no: c.approvedBusinessNo || null,
    region: c.region || null,
    category: c.category || null,
    balance: c.balance,
    transactions: c.transactions,
    // transactionHistory'yi JSON string olarak sakla
    transaction_history: JSON.stringify(c.transactionHistory || []),
    invoice_mode: c.invoiceMode || 'yok',
    default_kdv_rate: c.defaultKdvRate ?? 20,
    opening_balance: c.openingBalance ?? 0,
  };
}

export function cariFromDb(row: any): Cari {
  let transactionHistory: Transaction[] = [];
  try {
    if (typeof row.transaction_history === 'string') {
      transactionHistory = JSON.parse(row.transaction_history);
    } else if (Array.isArray(row.transaction_history)) {
      transactionHistory = row.transaction_history;
    } else if (Array.isArray(row.transactionHistory)) {
      transactionHistory = row.transactionHistory;
    }
  } catch {}
  
  return {
    id: row.id,
    type: row.type,
    companyName: row.company_name || row.companyName || '',
    contactPerson: row.contact_person || row.contactPerson || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    taxNumber: row.tax_number || row.taxNumber || '',
    taxOffice: row.tax_office || row.taxOffice || '',
    approvedBusinessNo: row.approved_business_no || row.approvedBusinessNo || '',
    region: row.region || '',
    category: row.category || '',
    balance: row.balance ?? 0,
    transactions: row.transactions ?? 0,
    transactionHistory,
    created_at: row.created_at,
    invoiceMode: row.invoice_mode || row.invoiceMode || 'yok',
    defaultKdvRate: row.default_kdv_rate ?? row.defaultKdvRate ?? 20,
    openingBalance: row.opening_balance ?? row.openingBalance ?? 0,
  };
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function CariPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { emit } = useModuleBus();
  
  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canAdd, canDelete } = getPagePermissions(user, currentEmployee, 'cari');
  const sec = usePageSecurity('cari');

  const { data: cariList, addItem, deleteItem } = useTableSync<Cari>({
    tableName: 'cari_hesaplar',
    storageKey: 'cari_data',
    initialData: initialCariList,
    orderBy: 'created_at',
    orderAsc: false,
    toDb: cariToDb,
    fromDb: cariFromDb,
  });

  // Regions — localStorage'da sakla
  const [regions, setRegions] = useState<Region[]>(() => {
    try {
      const saved = localStorage.getItem('isleyen_et_regions');
      return saved ? JSON.parse(saved) : INITIAL_REGIONS;
    } catch { return INITIAL_REGIONS; }
  });

  const saveRegions = (updated: Region[]) => {
    setRegions(updated);
    // KV store birincil kaynak (CouchDB üzerinden senkronize), localStorage önbellek
    kvSet('cari_regions', updated).catch(e => console.error('[Cari] regions kv sync:', e));
    localStorage.setItem('isleyen_et_regions', JSON.stringify(updated));
  };

  // Kategoriler — localStorage'da sakla (özelleştirilebilir)
  const [musteriCategories, setMusteriCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('isleyen_et_musteri_cats');
      return saved ? JSON.parse(saved) : DEFAULT_MUSTERI_CATEGORIES;
    } catch { return DEFAULT_MUSTERI_CATEGORIES; }
  });
  const [toptanciCategories, setToptanciCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('isleyen_et_toptanci_cats');
      return saved ? JSON.parse(saved) : DEFAULT_TOPTANCI_CATEGORIES;
    } catch { return DEFAULT_TOPTANCI_CATEGORIES; }
  });
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const saveCategories = (musteri: string[], toptanci: string[]) => {
    setMusteriCategories(musteri);
    setToptanciCategories(toptanci);
    // KV store birincil kaynak (CouchDB üzerinden senkronize), localStorage önbellek
    kvSet('cari_musteri_cats', musteri).catch(e => console.error('[Cari] cats kv sync:', e));
    kvSet('cari_toptanci_cats', toptanci).catch(e => console.error('[Cari] cats kv sync:', e));
    localStorage.setItem('isleyen_et_musteri_cats', JSON.stringify(musteri));
    localStorage.setItem('isleyen_et_toptanci_cats', JSON.stringify(toptanci));
  };

  // Mount'ta KV'den bölge ve kategorileri yükle — KV her zaman otorite (localStorage önbellek olarak)
  useEffect(() => {
    kvGet<Region[]>('cari_regions').then(r => {
      if (r && r.length > 0) { setRegions(r); localStorage.setItem('isleyen_et_regions', JSON.stringify(r)); }
    }).catch(() => {});
    kvGet<string[]>('cari_musteri_cats').then(r => {
      if (r && r.length > 0) { setMusteriCategories(r); localStorage.setItem('isleyen_et_musteri_cats', JSON.stringify(r)); }
    }).catch(() => {});
    kvGet<string[]>('cari_toptanci_cats').then(r => {
      if (r && r.length > 0) { setToptanciCategories(r); localStorage.setItem('isleyen_et_toptanci_cats', JSON.stringify(r)); }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState<'Müşteri' | 'Toptancı'>(
    () => (sessionStorage.getItem('mert4_filter_cari_type') as 'Müşteri' | 'Toptancı') ?? 'Müşteri'
  );
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRegionManagerOpen, setIsRegionManagerOpen] = useState(false);
  const [selectedCari, setSelectedCari] = useState<Cari | null>(null);

  // Önceki Bakiye dialog state
  const [isOncekiBakiyeOpen, setIsOncekiBakiyeOpen] = useState(false);
  const [oncekiBakiyeCari, setOncekiBakiyeCari] = useState<Cari | null>(null);
  const [oncekiBakiyeForm, setOncekiBakiyeForm] = useState({
    amount: '',
    type: 'debit' as 'debit' | 'credit',
    description: 'Önceki Bakiye',
    date: new Date().toISOString().split('T')[0],
  });

  // Add form state
  const [formData, setFormData] = useState({
    type: 'Müşteri' as 'Müşteri' | 'Toptancı',
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    taxNumber: '',
    taxOffice: '',
    approvedBusinessNo: '',
    region: '',
    category: '',
    invoiceMode: 'yok' as 'tam' | 'kismi' | 'yok',
    defaultKdvRate: 20,
    openingBalance: 0,
  });
  const [formRegion, setFormRegion] = useState('');
  const [showFormRegionManager, setShowFormRegionManager] = useState(false);
  const [formStep, setFormStep] = useState(0); // 0: tip, 1: firma, 2: iletişim, 3: sınıflandırma, 4: fatura

  // Önceki bakiye girişleri — her biri bir Transaction olarak kaydedilir
  const [openingEntries, setOpeningEntries] = useState<Array<{
    id: string; date: string; description: string; amount: string; type: 'debit' | 'credit';
  }>>([]);

  const addOpeningEntry = () => {
    setOpeningEntries(prev => [...prev, {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      description: '',
      amount: '',
      type: 'debit',
    }]);
  };

  const updateOpeningEntry = (id: string, field: string, value: string) => {
    setOpeningEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeOpeningEntry = (id: string) => {
    setOpeningEntries(prev => prev.filter(e => e.id !== id));
  };

  // Tüm girişlerin net toplamı (debit = alacak +, credit = borç -)
  const openingTotal = useMemo(() =>
    openingEntries.reduce((sum, e) => {
      const amt = parseFloat(e.amount) || 0;
      return sum + (e.type === 'debit' ? amt : -amt);
    }, 0),
  [openingEntries]);

  const resetForm = () => {
    setFormData({ type: 'Müşteri', companyName: '', contactPerson: '', phone: '', email: '', address: '', taxNumber: '', taxOffice: '', approvedBusinessNo: '', region: '', category: '', invoiceMode: 'yok' as 'tam' | 'kismi' | 'yok', defaultKdvRate: 20, openingBalance: 0 });
    setFormRegion('');
    setOpeningEntries([]);
  };

  // Filtered data
  const categories = selectedTab === 'Müşteri' ? musteriCategories : toptanciCategories;

  const filteredCari = useMemo(() => {
    return cariList.filter(c => {
      const matchesType = c.type === selectedTab;
      const sTerm = (searchTerm || '').toLowerCase();
      const matchesSearch =
        (c?.companyName || '').toLowerCase().includes(sTerm) ||
        (c?.contactPerson || '').toLowerCase().includes(sTerm) ||
        (c?.taxNumber || '').toLowerCase().includes(sTerm) ||
        (c?.approvedBusinessNo || '').toLowerCase().includes(sTerm) ||
        (c?.phone || '').includes(searchTerm || '');
      const matchesRegion = !selectedRegion || c.region === selectedRegion;
      const matchesCat = !selectedCategory || c.category === selectedCategory;
      return matchesType && matchesSearch && matchesRegion && matchesCat;
    });
  }, [cariList, selectedTab, searchTerm, selectedRegion, selectedCategory]);

  // Region → color lookup
  const regionColor = (name: string) => regions.find(r => r.name === name)?.color ?? '#64748b';

  // Summary stats
  const typeList = cariList.filter(c => c.type === selectedTab);
  const totalBalance = typeList.reduce((s, c) => s + c.balance, 0);
  const positiveCount = typeList.filter(c => c.balance > 0).length;
  const negativeCount = typeList.filter(c => c.balance < 0).length;

  const handleAddCari = async () => {
    if (!canAdd) {
      sec.logUnauthorized('add', 'Kullanıcı cari eklemeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    if (!formData.companyName.trim()) { toast.error(t('cari.companyNameRequired')); return; }
    if (!formData.contactPerson.trim()) { toast.error(t('cari.contactRequired')); return; }
    if (!formData.phone.trim()) { toast.error(t('cari.phoneRequired')); return; }
    if (!formData.taxNumber.trim()) { toast.error(t('cari.taxNumberRequired')); return; }
    if (!formData.taxOffice.trim()) { toast.error(t('cari.taxOfficeRequired')); return; }

    // Güvenlik kontrolleri: rate limit + SQL injection
    if (!sec.preCheck('add', { 
      companyName: formData.companyName, 
      contactPerson: formData.contactPerson,
      taxNumber: formData.taxNumber,
      email: formData.email 
    })) return;

    // Önceki bakiye girişlerinden Transaction listesi oluştur
    const initialHistory: Transaction[] = openingEntries
      .filter(e => e.description.trim() && (parseFloat(e.amount) || 0) > 0)
      .map(e => ({
        id: e.id,
        date: new Date(e.date).toISOString(),
        description: e.description.trim(),
        amount: parseFloat(e.amount) || 0,
        type: e.type,
        category: 'Açılış Bakiyesi',
      }));

    // Basit açılış bakiyesi de varsa onu da ekle (çoklu giriş yoksa)
    const simpleOpening = formData.openingBalance || 0;
    if (initialHistory.length === 0 && simpleOpening !== 0) {
      initialHistory.push({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        description: 'Açılış Bakiyesi',
        amount: Math.abs(simpleOpening),
        type: simpleOpening > 0 ? 'debit' : 'credit',
        category: 'Açılış Bakiyesi',
      });
    }

    // Net bakiye = çoklu girişlerin toplamı veya basit bakiye
    const computedBalance = initialHistory.length > 0
      ? openingTotal
      : simpleOpening;

    const newCari: Cari = {
      id: crypto.randomUUID(),
      ...sec.sanitizeAll(formData, ['companyName', 'contactPerson', 'address', 'email']),
      region: formRegion,
      balance: computedBalance,
      transactions: initialHistory.length,
      transactionHistory: initialHistory,
      invoiceMode: formData.invoiceMode || 'yok',
      defaultKdvRate: formData.defaultKdvRate || 20,
      openingBalance: computedBalance,
    };

    await addItem(newCari);
    sec.auditLog('add', newCari.id, newCari.companyName);
    emit('cari:added', { cariId: newCari.id, firmaAdi: newCari.companyName });
    
    logActivity('employee_update', 'Yeni Cari Eklendi', {
      employeeName: user?.name,
      page: 'Cari',
      description: `${newCari.companyName} carisi sisteme eklendi.`
    });
    
    toast.success(`${newCari.type} ${t('cari.added')}: ${newCari.companyName}`);
    setIsAddModalOpen(false);
    resetForm();
  };

  const handleSaveOncekiBakiye = () => {
    if (!oncekiBakiyeCari) return;
    const amount = parseFloat(oncekiBakiyeForm.amount);
    if (!amount || amount <= 0) { toast.error('Geçerli bir tutar girin.'); return; }

    const tx: Transaction = {
      id: crypto.randomUUID(),
      date: new Date(oncekiBakiyeForm.date).toISOString(),
      description: oncekiBakiyeForm.description.trim() || 'Önceki Bakiye',
      amount,
      type: oncekiBakiyeForm.type,
      category: 'Önceki Bakiye',
    };

    const balanceDelta = oncekiBakiyeForm.type === 'debit' ? amount : -amount;
    const updatedHistory = [...(oncekiBakiyeCari.transactionHistory || []), tx];

    updateItem(oncekiBakiyeCari.id, {
      balance: (oncekiBakiyeCari.balance || 0) + balanceDelta,
      openingBalance: (oncekiBakiyeCari.openingBalance || 0) + balanceDelta,
      transactionHistory: updatedHistory,
    } as any);

    logActivity('employee_update', 'Önceki Bakiye Girildi', {
      employeeName: user?.name,
      page: 'Cari',
      description: `${oncekiBakiyeCari.companyName} için ₺${amount} önceki bakiye girildi (${oncekiBakiyeForm.type === 'debit' ? 'Alacak' : 'Borç'}).`,
    });
    toast.success(`Önceki bakiye kaydedildi: ₺${amount.toLocaleString('tr-TR')}`);
    setIsOncekiBakiyeOpen(false);
    setOncekiBakiyeCari(null);
    setOncekiBakiyeForm({ amount: '', type: 'debit', description: 'Önceki Bakiye', date: new Date().toISOString().split('T')[0] });
  };

  const handleDeleteCari = async (id: string, name: string) => {
    if (!canDelete) {
      sec.logUnauthorized('delete', `Kullanıcı ${name} carisini silmeye çalıştı ancak yetkisi yoktu.`);
      return;
    }
    if (!sec.checkRate('delete')) return;
    if (!confirm(`"${name}" ${t('cari.deleteConfirm')}`)) return;
    await deleteItem(id);
    sec.auditLog('delete', id, name);
    emit('cari:deleted', { cariId: id, firmaAdi: name });
    
    logActivity('employee_update', 'Cari Silindi', {
      employeeName: user?.name,
      page: 'Cari',
      description: `${name} carisi sistemden silindi.`
    });
    
    toast.success(t('cari.deleted'));
    if (selectedCari?.id === id) { setIsDetailModalOpen(false); setSelectedCari(null); }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 pb-4 sm:pb-6">
      <SyncStatusBar tableName="cari_hesaplar" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">{t('customers.title')}</h1>
            <SyncBadge tableName="cari_hesaplar" />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">{t('customers.subtitle')}</p>
        </div>
        <motion.button
          onClick={() => { resetForm(); setFormStep(0); setIsAddModalOpen(true); }}
          whileHover={{ scale: 1.04, y: -2 }}
          whileTap={{ scale: 0.97 }}
          className="relative group flex items-center gap-3 px-5 sm:px-7 py-3 sm:py-3.5 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-600/25 hover:shadow-blue-500/40 transition-all duration-300 overflow-hidden w-full sm:w-auto justify-center"
        >
          {/* Animated shine effect */}
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
          {/* Pulse ring */}
          <span className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl opacity-0 group-hover:opacity-30 blur-lg transition-opacity duration-300" />
          <div className="relative flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm tracking-wide">{t('customers.addCustomer')}</span>
            <Sparkles className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
        </motion.button>
      </div>

      {/* Tabs — Müşteri / Toptancı */}
      <div className="flex gap-2 overflow-x-auto">
        {(['Müşteri', 'Toptancı'] as const).map(tab => {
          const count = cariList.filter(c => c.type === tab).length;
          return (
            <button
              key={tab}
              onClick={() => { setSelectedTab(tab); setSelectedCategory(''); setSelectedRegion(''); sessionStorage.setItem('mert4_filter_cari_type', tab); }}
              className={`px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${
                selectedTab === tab
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-secondary text-muted-foreground hover:bg-accent hover:text-white'
              }`}
            >
              {tab === 'Müşteri' ? t('cari.customers') : t('cari.suppliers')}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${selectedTab === tab ? 'bg-white/20' : 'bg-accent'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
        {[
          { label: t('cari.totalAccounts'), value: typeList.length, color: 'blue', icon: Users },
          { label: t('cari.creditor'), value: positiveCount, color: 'green', icon: TrendingUp },
          { label: t('cari.debtor'), value: negativeCount, color: 'red', icon: TrendingDown },
        ].map((s, i) => {
          const colorMap: Record<string, { accent: string; glow: string; glowHover: string; text: string; iconBg: string; border: string }> = {
            blue:   { accent: 'linear-gradient(135deg, #3b82f6, #60a5fa)', glow: 'rgba(37, 99, 235, 0.06)', glowHover: 'rgba(37, 99, 235, 0.12)', text: 'text-blue-400', iconBg: 'from-blue-600/20 to-blue-500/10', border: 'border-blue-500/[0.12]' },
            green:  { accent: 'linear-gradient(135deg, #10b981, #34d399)', glow: 'rgba(16, 185, 129, 0.06)', glowHover: 'rgba(16, 185, 129, 0.12)', text: 'text-emerald-400', iconBg: 'from-emerald-600/20 to-emerald-500/10', border: 'border-emerald-500/[0.12]' },
            red:    { accent: 'linear-gradient(135deg, #ef4444, #f87171)', glow: 'rgba(239, 68, 68, 0.06)', glowHover: 'rgba(239, 68, 68, 0.12)', text: 'text-red-400', iconBg: 'from-red-600/20 to-red-500/10', border: 'border-red-500/[0.12]' },
          };
          const c = colorMap[s.color] || colorMap.blue;
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`stat-card-v2 p-5 group ${c.border}`}
              style={{ '--stat-accent': c.accent, '--stat-glow': c.glow, '--stat-glow-hover': c.glowHover } as React.CSSProperties}
            >
              <div className="stat-bg-glow" />
              <div className="flex items-center gap-3 relative z-10 mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${c.text}`} />
                </div>
                <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-bold">{s.label}</p>
              </div>
              <p className={`text-2xl sm:text-3xl font-bold ${c.text} relative z-10 tech-number ml-1`}>{s.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Arama */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('cari.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border/50 rounded-xl text-white text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
          />
        </div>

        {/* Bölge Filtresi */}
        <div className="relative">
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2.5 bg-secondary/50 border border-border/50 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all cursor-pointer"
          >
            <option value="">{t('cari.allRegions')}</option>
            {regions.map(r => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>

        {/* Bölge Yönet */}
        <button
          onClick={() => setIsRegionManagerOpen(true)}
          className="flex items-center gap-2 px-3 py-2.5 bg-secondary hover:bg-accent border border-border text-foreground text-sm rounded-xl transition-colors"
        >
          <Globe className="w-4 h-4" />
          {t('cari.manageRegions')}
        </button>

        {/* Kategori Yönet */}
        <button
          onClick={() => setIsCategoryManagerOpen(true)}
          className="flex items-center gap-2 px-3 py-2.5 bg-secondary hover:bg-accent border border-border text-foreground text-sm rounded-xl transition-colors"
        >
          <Tag className="w-4 h-4" />
          Kategori Yönet
        </button>

        {/* Görünüm */}
        <div className="flex gap-1 bg-secondary border border-border rounded-xl p-1">
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-white'}`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-white'}`}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Kategori Filtresi */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${!selectedCategory ? 'bg-blue-600 text-white' : 'bg-secondary text-muted-foreground hover:text-white hover:bg-accent'}`}
        >
          {t('common.all')}
        </button>
        {categories.map(cat => {
          const count = typeList.filter(c => c.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-secondary text-muted-foreground hover:text-white hover:bg-accent'}`}
            >
              {cat} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Sonuç Sayısı */}
      <p className="text-muted-foreground text-sm">
        {filteredCari.length} {t('cari.resultsShowing')}
        {(selectedRegion || selectedCategory) && (
          <button onClick={() => { setSelectedRegion(''); setSelectedCategory(''); }} className="ml-2 text-blue-400 hover:text-blue-300">
            {t('cari.clearFilters')}
          </button>
        )}
      </p>

      {/* Grid / List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <AnimatePresence>
            {filteredCari.map((cari, index) => (
              <motion.div
                key={cari.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -15 }}
                transition={{ delay: index * 0.08, duration: 0.4, ease: "easeOut" }}
                className="card-premium rounded-2xl p-5 hover:border-blue-500/30 transition-all duration-300 cursor-pointer group hover:shadow-[0_8px_30px_rgb(59,130,246,0.12)]"
                onClick={() => { setSelectedCari(cari); setIsDetailModalOpen(true); }}
              >
                {/* Top Row */}
                <div className="flex items-start gap-3 mb-4">
                  <div className={`p-3 rounded-xl flex-shrink-0 ${cari.type === 'Müşteri' ? 'bg-blue-600/20' : 'bg-purple-600/20'}`}>
                    <Building2 className={`w-5 h-5 ${cari.type === 'Müşteri' ? 'text-blue-400' : 'text-purple-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold truncate group-hover:text-blue-400 transition-colors">
                      {cari.companyName}
                    </h3>
                    <p className="text-muted-foreground text-xs mt-0.5">{cari.transactions} {t('cari.transaction')}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCari(cari.id, cari.companyName); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-900/40 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {cari.region && (
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-medium"
                      style={{ backgroundColor: `${regionColor(cari.region)}30`, border: `1px solid ${regionColor(cari.region)}60`, color: regionColor(cari.region) }}
                    >
                      <MapPin className="w-2.5 h-2.5" />
                      {cari.region}
                    </span>
                  )}
                  {cari.category && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-foreground text-xs border border-border">
                      <Tag className="w-2.5 h-2.5" />
                      {cari.category}
                    </span>
                  )}
                </div>

                {/* Contact */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <User className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{cari.contactPerson}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{cari.phone}</span>
                  </div>
                  {cari.taxNumber && (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Receipt className="w-3 h-3 flex-shrink-0" />
                      <span>VN: {cari.taxNumber}</span>
                      {cari.taxOffice && <span className="text-muted-foreground/70">· {cari.taxOffice}</span>}
                    </div>
                  )}
                  {cari.type === 'Toptancı' && cari.approvedBusinessNo && (
                    <div className="flex items-center gap-2 text-emerald-400 text-xs">
                      <BadgeCheck className="w-3 h-3 flex-shrink-0" />
                      <span>OİN: {cari.approvedBusinessNo}</span>
                    </div>
                  )}
                </div>

                {/* Balance */}
                <div className={`flex items-center justify-between p-3 rounded-xl ${
                  cari.balance > 1000 ? 'bg-amber-900/20 border border-amber-600/40' : cari.balance > 0 ? 'bg-green-900/20 border border-green-700/30' : cari.balance < 0 ? 'bg-red-900/20 border border-red-700/30' : 'bg-secondary border border-border'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs font-medium">{t('customers.balance')}</span>
                    {cari.balance > 1000 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-[8px] font-bold border border-amber-500/30">⚠ Borçlu</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {cari.balance > 0 ? (
                      <TrendingUp className={`w-4 h-4 ${cari.balance > 1000 ? 'text-amber-400' : 'text-green-400'}`} />
                    ) : cari.balance < 0 ? (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    ) : null}
                    <span className={`font-bold ${cari.balance > 1000 ? 'text-amber-400' : cari.balance > 0 ? 'text-green-400' : cari.balance < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {cari.balance > 0 ? '+' : ''}₺{Math.abs(cari.balance).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Detay + Önceki Bakiye Butonları */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/cari/${cari.id}`); }}
                    className="flex-1 py-2 text-sm text-blue-400 hover:text-white bg-blue-600/10 hover:bg-blue-600 border border-blue-600/30 hover:border-blue-600 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    {t('cari.viewDetails')}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOncekiBakiyeCari(cari);
                      setOncekiBakiyeForm({ amount: '', type: 'debit', description: 'Önceki Bakiye', date: new Date().toISOString().split('T')[0] });
                      setIsOncekiBakiyeOpen(true);
                    }}
                    className="px-3 py-2 text-sm text-violet-400 hover:text-white bg-violet-600/10 hover:bg-violet-600 border border-violet-600/30 hover:border-violet-600 rounded-xl transition-all flex items-center justify-center gap-1.5"
                    title="Önceki Bakiye Gir"
                  >
                    <History className="w-4 h-4" />
                    <span className="text-xs font-semibold">Önceki</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        /* List View */
        <>
          {/* Masaüstü: HTML tablo */}
          <div className="hidden sm:block card-premium rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs text-muted-foreground uppercase">{t('cari.listHeaders.company')}</th>
                  <th className="text-left px-5 py-3 text-xs text-muted-foreground uppercase">{t('cari.listHeaders.contactPhone')}</th>
                  <th className="text-left px-5 py-3 text-xs text-muted-foreground uppercase">{t('cari.listHeaders.taxNo')}</th>
                  <th className="text-left px-5 py-3 text-xs text-muted-foreground uppercase">{t('cari.listHeaders.regionCategory')}</th>
                  <th className="text-right px-5 py-3 text-xs text-muted-foreground uppercase">{t('customers.balance')}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <motion.tbody
                className="divide-y divide-border"
                variants={staggerContainer(0.04, 0.02)}
                initial="initial"
                animate="animate"
              >
                <AnimatePresence>
                  {filteredCari.map((cari) => (
                    <motion.tr
                      key={cari.id}
                      layout
                      variants={tableRow}
                      exit={{ opacity: 0, x: 12, filter: 'blur(6px)', transition: { duration: 0.18 } }}
                      className="hover:bg-accent/30 transition-colors cursor-pointer group data-row border-b border-border/40 last:border-0 relative"
                      style={{ '--row-accent': cari.type === 'Müşteri' ? '#3b82f6' : '#a855f7' } as React.CSSProperties}
                      whileHover={hover.row}
                      onClick={() => { setSelectedCari(cari); setIsDetailModalOpen(true); }}
                    >
                      <td className="px-5 py-4">
                        <p className="text-white font-medium group-hover:text-blue-400 transition-colors">{cari.companyName}</p>
                        <p className="text-muted-foreground text-xs">{cari.transactions} {t('cari.transaction')}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-foreground text-sm">{cari.contactPerson}</p>
                        <p className="text-muted-foreground text-xs">{cari.phone}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-muted-foreground text-sm font-mono">{cari.taxNumber || '—'}</p>
                        <p className="text-muted-foreground/70 text-xs">{cari.taxOffice || ''}</p>
                        {cari.type === 'Toptancı' && cari.approvedBusinessNo && (
                          <p className="text-emerald-400 text-xs font-mono mt-0.5 flex items-center gap-1">
                            <BadgeCheck className="w-3 h-3 inline" />
                            OİN: {cari.approvedBusinessNo}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {cari.region && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: `${regionColor(cari.region)}25`, color: regionColor(cari.region), border: `1px solid ${regionColor(cari.region)}50` }}>
                              {cari.region}
                            </span>
                          )}
                          {cari.category && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-accent text-foreground border border-border">
                              {cari.category}
                            </span>
                          )}
                          {cari.invoiceMode && cari.invoiceMode !== 'yok' && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cari.invoiceMode === 'tam' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                              F {cari.invoiceMode === 'tam' ? t('cari.invoiceFull') : t('cari.invoicePartial')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className={`font-bold text-sm ${cari.balance > 0 ? 'text-green-400' : cari.balance < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                          {cari.balance > 0 ? '+' : ''}₺{Math.abs(cari.balance).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => navigate(`/cari/${cari.id}`)} className="p-1.5 hover:bg-accent rounded-lg transition-colors" title="Detay">
                            <Eye className="w-4 h-4 text-blue-400" />
                          </button>
                          <button
                            onClick={() => {
                              setOncekiBakiyeCari(cari);
                              setOncekiBakiyeForm({ amount: '', type: 'debit', description: 'Önceki Bakiye', date: new Date().toISOString().split('T')[0] });
                              setIsOncekiBakiyeOpen(true);
                            }}
                            className="p-1.5 hover:bg-violet-900/40 rounded-lg transition-colors"
                            title="Önceki Bakiye Gir"
                          >
                            <History className="w-4 h-4 text-violet-400" />
                          </button>
                          <button onClick={() => handleDeleteCari(cari.id, cari.companyName)} className="p-1.5 hover:bg-red-900/40 rounded-lg transition-colors" title="Sil">
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </motion.tbody>
            </table>
            {filteredCari.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Filter className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>{t('cari.noFilterResults')}</p>
              </div>
            )}
          </div>

          {/* Mobil: kart listesi */}
          <div className="sm:hidden space-y-2">
            <AnimatePresence>
              {filteredCari.map((cari) => (
                <SwipeToDelete key={cari.id} onDelete={() => handleDeleteCari(cari.id, cari.companyName)} className="rounded-xl">
                <motion.div
                  variants={tableRow}
                  exit={{ opacity: 0, x: 12, filter: 'blur(6px)', transition: { duration: 0.18 } }}
                  onClick={() => { setSelectedCari(cari); setIsDetailModalOpen(true); }}
                  className="card-premium rounded-xl p-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <div className={`w-2 h-8 rounded-full flex-shrink-0 ${cari.type === 'Müşteri' ? 'bg-blue-400' : 'bg-purple-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{cari.companyName}</p>
                    <p className="text-white/40 text-xs truncate">
                      {cari.phone || cari.contactPerson || '—'}
                      {cari.region ? ` · ${cari.region}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${cari.balance > 0 ? 'text-emerald-400' : cari.balance < 0 ? 'text-rose-400' : 'text-white/40'}`}>
                      {cari.balance > 0 ? '+' : ''}₺{Math.abs(cari.balance).toLocaleString()}
                    </p>
                    <p className="text-white/30 text-[10px]">{cari.transactions} {t('cari.transaction')}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/cari/${cari.id}`); }}
                    className="p-2 hover:bg-accent rounded-lg transition-colors flex-shrink-0"
                  >
                    <Eye className="w-4 h-4 text-blue-400" />
                  </button>
                </motion.div>
                </SwipeToDelete>
              ))}
            </AnimatePresence>
            {filteredCari.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Filter className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>{t('cari.noFilterResults')}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Add Cari Modal — Premium Wizard ─────────────────────────────── */}
      <Dialog.Root open={isAddModalOpen} onOpenChange={v => { if (!v) { setIsAddModalOpen(false); resetForm(); setFormStep(0); } }}>
        <Dialog.Portal>
          <Dialog.Overlay asChild>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xl z-50"
            />
          </Dialog.Overlay>
          <Dialog.Content
            aria-describedby={undefined}
            asChild
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-2xl overflow-y-auto z-50 rounded-3xl border border-white/[0.08] shadow-[0_32px_100px_-20px_rgba(0,0,0,0.7),0_0_60px_-10px_rgba(59,130,246,0.15)]"
              style={{ background: 'linear-gradient(145deg, rgba(12,18,32,0.97), rgba(6,9,15,0.98))', backdropFilter: 'blur(40px) saturate(180%)', maxHeight: 'calc(100dvh - 1rem)' }}
            >
              {/* ── Decorative top gradient bar ── */}
              <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 rounded-t-3xl" />

              {/* ── Header ── */}
              <div className="relative px-4 sm:px-8 pt-5 sm:pt-7 pb-4 sm:pb-5">
                {/* Background glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/[0.06] rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute top-0 left-1/2 w-40 h-40 bg-indigo-500/[0.04] rounded-full blur-[60px] pointer-events-none" />

                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-4">
                    <motion.div
                      initial={{ rotate: -15, scale: 0 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={{ type: 'spring', damping: 12, delay: 0.1 }}
                      className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/30"
                    >
                      <Plus className="w-6 h-6 text-white" />
                    </motion.div>
                    <div>
                      <Dialog.Title className="text-xl font-bold text-white tracking-tight">
                        {t('customers.addCustomer')}
                      </Dialog.Title>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {formStep === 0 ? t('cari.stepSubtitle0') : formStep === 1 ? t('cari.stepSubtitle1') : formStep === 2 ? t('cari.stepSubtitle2') : formStep === 3 ? t('cari.stepSubtitle3') : t('cari.stepSubtitle4')}
                      </p>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { setIsAddModalOpen(false); resetForm(); setFormStep(0); }}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </motion.button>
                </div>

                {/* ── Step Indicators ── */}
                <div className="flex items-center gap-2 mt-6 relative z-10">
                  {[
                    { label: 'Tür', icon: Store },
                    { label: 'Firma', icon: Building2 },
                    { label: 'İletişim', icon: Phone },
                    { label: 'Sınıf', icon: Tag },
                  ].map((step, i) => {
                    const StepIcon = step.icon;
                    const isActive = formStep === i;
                    const isDone = formStep > i;
                    return (
                      <React.Fragment key={i}>
                        {i > 0 && (
                          <div className={`flex-1 h-[2px] rounded-full transition-all duration-500 ${isDone ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-white/[0.06]'}`} />
                        )}
                        <motion.button
                          type="button"
                          onClick={() => setFormStep(i)}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.95 }}
                          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
                            isActive
                              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-600/10'
                              : isDone
                                ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/20'
                                : 'bg-white/[0.03] text-gray-500 border border-white/[0.06] hover:border-white/[0.12]'
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                          <span className="hidden sm:inline">{step.label}</span>
                        </motion.button>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* ── Form Content ── */}
              <div className="px-8 pb-2 min-h-[280px]">
                <AnimatePresence mode="wait">
                  {/* ─ STEP 0: Cari Tipi ─ */}
                  {formStep === 0 && (
                    <motion.div
                      key="step0"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                      className="space-y-5"
                    >
                      <p className="text-sm text-gray-400">{t('cari.selectAccountTypeDesc')}</p>
                      <div className="grid grid-cols-2 gap-4">
                        {([
                          { type: 'Müşteri' as const, icon: Store, desc: 'Restoran, market, otel vb.', gradient: 'from-blue-600 to-cyan-500', glow: 'rgba(59,130,246,0.15)', border: 'border-blue-500/40' },
                          { type: 'Toptancı' as const, icon: Truck, desc: 'Et tedarikçisi, ambalaj vb.', gradient: 'from-purple-600 to-pink-500', glow: 'rgba(168,85,247,0.15)', border: 'border-purple-500/40' },
                        ]).map(opt => {
                          const isSelected = formData.type === opt.type;
                          const Icon = opt.icon;
                          return (
                            <motion.button
                              key={opt.type}
                              type="button"
                              whileHover={{ scale: 1.03, y: -4 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setFormData(f => ({ ...f, type: opt.type, category: '' }))}
                              className={`relative p-6 rounded-2xl border-2 text-left transition-all duration-300 group overflow-hidden ${
                                isSelected
                                  ? `${opt.border} bg-gradient-to-br ${opt.gradient.replace('from-', 'from-').split(' ').map(c => c + '/10').join(' ')}`
                                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                              }`}
                              style={isSelected ? { boxShadow: `0 8px 32px ${opt.glow}` } : {}}
                            >
                              {/* Selected check */}
                              <AnimatePresence>
                                {isSelected && (
                                  <motion.div
                                    initial={{ scale: 0, rotate: -90 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    exit={{ scale: 0, rotate: 90 }}
                                    className="absolute top-3 right-3"
                                  >
                                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${opt.gradient} flex items-center justify-center shadow-lg`}>
                                      <Check className="w-4 h-4 text-white" />
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${opt.gradient} flex items-center justify-center mb-4 shadow-lg transition-transform duration-300 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`}
                                style={isSelected ? { boxShadow: `0 4px 20px ${opt.glow}` } : {}}
                              >
                                <Icon className="w-7 h-7 text-white" />
                              </div>
                              <h3 className={`text-lg font-bold mb-1 transition-colors ${isSelected ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                                {opt.type}
                              </h3>
                              <p className="text-xs text-gray-500">{opt.desc}</p>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* ─ STEP 1: Firma Bilgileri ─ */}
                  {formStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-4 h-4 text-blue-400" />
                        <p className="text-sm font-semibold text-gray-300">{t('cari.companyInfo')}</p>
                      </div>

                      {/* Firma Adı */}
                      <div className="group">
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                          <Building2 className="w-3 h-3" /> {t('cari.firmName')} <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <input
                            autoFocus
                            value={formData.companyName}
                            onChange={(e) => setFormData(f => ({ ...f, companyName: e.target.value }))}
                            placeholder={t('cari.exampleCompany')}
                            className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] placeholder-gray-600 transition-all duration-300"
                          />
                          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600/0 via-blue-600/0 to-blue-600/0 group-focus-within:from-blue-600/5 group-focus-within:to-indigo-600/5 pointer-events-none transition-all duration-500" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Vergi No */}
                        <div className="group">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                            <Receipt className="w-3 h-3" /> {t('cari.taxNumber')} <span className="text-red-400">*</span>
                          </label>
                          <input
                            value={formData.taxNumber}
                            onChange={(e) => setFormData(f => ({ ...f, taxNumber: e.target.value }))}
                            placeholder="10 veya 11 haneli vergi no"
                            maxLength={11}
                            className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] placeholder-gray-600 transition-all duration-300 font-mono tracking-wider"
                          />
                        </div>

                        {/* Vergi Dairesi */}
                        <div className="group">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                            <Building2 className="w-3 h-3" /> {t('cari.taxOffice')} <span className="text-red-400">*</span>
                          </label>
                          <input
                            value={formData.taxOffice}
                            onChange={(e) => setFormData(f => ({ ...f, taxOffice: e.target.value }))}
                            placeholder={t('cari.taxOfficePlaceholder', 'Örn: Çankaya VD')}
                            className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] placeholder-gray-600 transition-all duration-300"
                          />
                        </div>
                      </div>

                      {/* Onaylı İşletme No — Sadece Toptancı */}
                      <AnimatePresence>
                        {formData.type === 'Toptancı' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.12]">
                              <label className="flex items-center gap-1.5 text-xs text-emerald-400 mb-2 font-medium uppercase tracking-wider">
                                <ShieldCheck className="w-3 h-3" /> {t('cari.approvedBusinessNo', 'Onaylı İşletme Numarası')}
                              </label>
                              <input
                                value={formData.approvedBusinessNo}
                                onChange={(e) => setFormData(f => ({ ...f, approvedBusinessNo: e.target.value }))}
                                placeholder={t('cari.approvedBusinessNoPlaceholder', 'Tarım ve Orman Bakanlığı onaylı işletme numarası')}
                                className="w-full px-4 py-3 bg-white/[0.04] border border-emerald-500/[0.15] rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500/50 placeholder-gray-600 transition-all duration-300"
                              />
                              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                                {t('cari.approvedBusinessNoDesc', 'Et ve et ürünleri tedarikçileri için Tarım ve Orman Bakanlığı tarafından verilen onaylı işletme numarası')}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* ─ STEP 2: İletişim ─ */}
                  {formStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className="w-4 h-4 text-blue-400" />
                        <p className="text-sm font-semibold text-gray-300">{t('cari.contact', 'İletişim Bilgileri')}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="group">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                            <User className="w-3 h-3" /> {t('reports.contact', 'Yetkili Kişi')} <span className="text-red-400">*</span>
                          </label>
                          <input
                            autoFocus
                            value={formData.contactPerson}
                            onChange={(e) => setFormData(f => ({ ...f, contactPerson: e.target.value }))}
                            placeholder={t('cari.contactPlaceholder', 'Örn: Ahmet Yılmaz')}
                            className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] placeholder-gray-600 transition-all duration-300"
                          />
                        </div>
                        <div className="group">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                            <Phone className="w-3 h-3" /> {t('common.phone')} <span className="text-red-400">*</span>
                          </label>
                          <input
                            value={formData.phone}
                            onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))}
                            placeholder="0532 xxx xx xx"
                            className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] placeholder-gray-600 transition-all duration-300 font-mono"
                          />
                        </div>
                      </div>

                      <div className="group">
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                          <Mail className="w-3 h-3" /> E-posta
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))}
                          placeholder="firma@email.com"
                          className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] placeholder-gray-600 transition-all duration-300"
                        />
                      </div>

                      <div className="group">
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                          <MapPin className="w-3 h-3" /> Adres
                        </label>
                        <textarea
                          value={formData.address}
                          onChange={(e) => setFormData(f => ({ ...f, address: e.target.value }))}
                          placeholder="Tam adres..."
                          rows={2}
                          className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-blue-500/60 focus:bg-white/[0.06] focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] placeholder-gray-600 transition-all duration-300 resize-none"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* ─ STEP 3: Sınıflandırma ─ */}
                  {formStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                      className="space-y-5"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Tag className="w-4 h-4 text-blue-400" />
                        <p className="text-sm font-semibold text-gray-300">Sınıflandırma</p>
                      </div>

                      {/* Bölge */}
                      <div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                          <Globe className="w-3 h-3" /> Bölge
                        </label>
                        <RegionSelector
                          value={formRegion}
                          onChange={setFormRegion}
                          regions={regions}
                          onManageRegions={() => setShowFormRegionManager(true)}
                        />
                      </div>

                      {/* Kategori — Visual Grid */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 font-medium uppercase tracking-wider">
                            <Tag className="w-3 h-3" /> Kategori
                          </label>
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsCategoryManagerOpen(true)}
                            className="flex items-center gap-1.5 text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition-colors"
                          >
                            <Edit2 className="w-3 h-3" />
                            Kategorileri Düzenle
                          </motion.button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {(formData.type === 'Müşteri' ? musteriCategories : toptanciCategories).map(cat => {
                            const isSelected = formData.category === cat;
                            const catColor = CATEGORY_COLORS[cat] || '#64748b';
                            return (
                              <motion.button
                                key={cat}
                                type="button"
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => setFormData(f => ({ ...f, category: isSelected ? '' : cat }))}
                                className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border flex items-center gap-1.5 justify-center ${
                                  isSelected
                                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 shadow-lg shadow-blue-600/10'
                                    : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.05] hover:text-white'
                                }`}
                              >
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isSelected ? '#3b82f6' : catColor }} />
                                {isSelected && <Check className="w-3 h-3 flex-shrink-0" />}
                                {cat}
                              </motion.button>
                            );
                          })}
                          {/* Hızlı Kategori Ekle */}
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setIsCategoryManagerOpen(true)}
                            className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-dashed border-amber-500/30 text-amber-400/70 hover:text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/[0.05] transition-all duration-200 flex items-center gap-1.5 justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Yeni
                          </motion.button>
                        </div>
                      </div>

                      {/* Özet */}
                      {formData.companyName && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 rounded-2xl bg-gradient-to-br from-blue-600/[0.06] to-indigo-600/[0.04] border border-blue-500/[0.1]"
                        >
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Kayıt Özeti</p>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${formData.type === 'Müşteri' ? 'bg-blue-600/20' : 'bg-purple-600/20'}`}>
                              {formData.type === 'Müşteri' ? <Store className="w-5 h-5 text-blue-400" /> : <Truck className="w-5 h-5 text-purple-400" />}
                            </div>
                            <div className="flex-1">
                              <p className="text-white font-bold text-sm">{formData.companyName}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                                {formData.contactPerson && <span>{formData.contactPerson}</span>}
                                {formData.phone && <span>· {formData.phone}</span>}
                              </div>
                            </div>
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${formData.type === 'Müşteri' ? 'bg-blue-600/20 text-blue-400' : 'bg-purple-600/20 text-purple-400'}`}>
                              {formData.type}
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {/* ─ STEP 4: Fatura Ayarları ─ */}
                  {formStep === 4 && (
                    <motion.div
                      key="step4"
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                      className="space-y-5"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Receipt className="w-4 h-4 text-amber-400" />
                        <p className="text-sm font-semibold text-gray-300">Bakiye & Fatura Ayarları</p>
                      </div>

                      {/* Önceki Bakiyeler — çoklu giriş */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 font-medium uppercase tracking-wider">
                            <CreditCard className="w-3 h-3" /> Önceki Bakiyeler
                          </label>
                          <button
                            type="button"
                            onClick={addOpeningEntry}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-xs rounded-lg transition-all"
                          >
                            <Plus className="w-3 h-3" /> Bakiye Ekle
                          </button>
                        </div>

                        {openingEntries.length === 0 ? (
                          /* Hiç giriş yoksa basit tek alan göster */
                          <div className="space-y-2">
                            <div className="relative">
                              <input
                                type="number"
                                step="0.01"
                                value={formData.openingBalance || ''}
                                onChange={e => setFormData(f => ({ ...f, openingBalance: parseFloat(e.target.value) || 0 }))}
                                placeholder="0.00 — Tek bir açılış bakiyesi girin"
                                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:border-blue-500/50 focus:bg-white/[0.06] transition-all text-sm outline-none"
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">₺</span>
                            </div>
                            <p className="text-[10px] text-gray-600 ml-1">
                              Pozitif = alacak (müşteri bize borçlu) · Negatif = borç (biz borçluyuz) · Ya da "Bakiye Ekle" ile birden fazla kaydı ayrı ayrı girin.
                            </p>
                          </div>
                        ) : (
                          /* Çoklu giriş tablosu */
                          <div className="space-y-2">
                            {/* Başlık satırı */}
                            <div className="grid grid-cols-[1fr_2fr_1fr_auto_auto] gap-2 px-2">
                              {['Tarih', 'Açıklama', 'Tutar (₺)', 'Tür', ''].map(h => (
                                <span key={h} className="text-[10px] text-gray-600 uppercase tracking-wider">{h}</span>
                              ))}
                            </div>
                            {/* Giriş satırları */}
                            {openingEntries.map(entry => (
                              <div key={entry.id} className="grid grid-cols-[1fr_2fr_1fr_auto_auto] gap-2 items-center">
                                <input
                                  type="date"
                                  value={entry.date}
                                  onChange={e => updateOpeningEntry(entry.id, 'date', e.target.value)}
                                  className="px-2 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-xs outline-none focus:border-blue-500/40 transition-all"
                                />
                                <input
                                  type="text"
                                  value={entry.description}
                                  onChange={e => updateOpeningEntry(entry.id, 'description', e.target.value)}
                                  placeholder="Açıklama…"
                                  className="px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder-gray-600 text-xs outline-none focus:border-blue-500/40 transition-all"
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={entry.amount}
                                  onChange={e => updateOpeningEntry(entry.id, 'amount', e.target.value)}
                                  placeholder="0.00"
                                  className="px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white placeholder-gray-600 text-xs outline-none focus:border-blue-500/40 transition-all"
                                />
                                {/* Tür toggle */}
                                <button
                                  type="button"
                                  onClick={() => updateOpeningEntry(entry.id, 'type', entry.type === 'debit' ? 'credit' : 'debit')}
                                  className={`px-2 py-2 rounded-lg text-[10px] font-bold border transition-all whitespace-nowrap ${
                                    entry.type === 'debit'
                                      ? 'bg-green-600/20 border-green-500/30 text-green-400'
                                      : 'bg-red-600/20 border-red-500/30 text-red-400'
                                  }`}
                                >
                                  {entry.type === 'debit' ? 'Alacak' : 'Borç'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeOpeningEntry(entry.id)}
                                  className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            {/* Net toplam */}
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                              <span className="text-xs text-gray-500">Net Açılış Bakiyesi:</span>
                              <span className={`text-sm font-bold ${openingTotal > 0 ? 'text-green-400' : openingTotal < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                {openingTotal > 0 ? '+' : ''}₺{openingTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-600 ml-1">Alacak = müşteri bize borçlu (+) · Borç = biz müşteriye borçluyuz (−)</p>
                          </div>
                        )}
                      </div>

                      {/* Fatura Modu */}
                      <div>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">
                          {t('cari.billingType')}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {([
                            { key: 'tam', label: t('cari.invoiceFullLabel'), desc: t('cari.invoiceFullDesc'), icon: '📋', color: 'emerald' },
                            { key: 'kismi', label: t('cari.invoicePartialLabel'), desc: t('cari.invoicePartialDesc'), icon: '📄', color: 'amber' },
                            { key: 'yok', label: t('cari.invoiceNoneLabel'), desc: t('cari.invoiceNoneDesc'), icon: '🚫', color: 'gray' },
                          ] as const).map(opt => (
                            <motion.button
                              key={opt.key}
                              type="button"
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setFormData(f => ({ ...f, invoiceMode: opt.key }))}
                              className={`p-4 rounded-2xl border text-left transition-all duration-200 ${
                                formData.invoiceMode === opt.key
                                  ? opt.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-600/10'
                                  : opt.color === 'amber' ? 'bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-600/10'
                                  : 'bg-gray-500/10 border-gray-500/40'
                                  : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.15]'
                              }`}
                            >
                              <div className="text-xl mb-2">{opt.icon}</div>
                              <p className={`text-sm font-bold ${formData.invoiceMode === opt.key ? 'text-white' : 'text-gray-400'}`}>{opt.label}</p>
                              <p className="text-[10px] text-gray-500 mt-1">{opt.desc}</p>
                              {formData.invoiceMode === opt.key && (
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-2">
                                  <Check className="w-4 h-4 text-emerald-400" />
                                </motion.div>
                              )}
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      {/* KDV Oranı */}
                      {formData.invoiceMode !== 'yok' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">
                            Varsayılan KDV Oranı
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {[1, 8, 10, 18, 20].map(rate => (
                              <motion.button
                                key={rate}
                                type="button"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setFormData(f => ({ ...f, defaultKdvRate: rate }))}
                                className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                                  formData.defaultKdvRate === rate
                                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 shadow-lg shadow-blue-600/10'
                                    : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:border-white/[0.15]'
                                }`}
                              >
                                %{rate}
                              </motion.button>
                            ))}
                          </div>
                          <p className="text-[10px] text-gray-600 mt-2 ml-1">Her fiş kaydında ayrıca değiştirilebilir.</p>
                        </motion.div>
                      )}

                      {/* Özet */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-2xl bg-gradient-to-br from-amber-600/[0.06] to-orange-600/[0.04] border border-amber-500/[0.1]"
                      >
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Fatura Özeti</p>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-amber-400" />
                          </div>
                          <div className="flex-1">
                            <p className="text-white font-bold text-sm">
                              {formData.invoiceMode === 'tam' ? 'Tam Fatura' : formData.invoiceMode === 'kismi' ? 'Kısmi Fatura' : 'Fatura Yok'}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formData.invoiceMode !== 'yok' ? `Varsayılan KDV: %${formData.defaultKdvRate}` : 'Bu müşteriye fatura kesilmeyecek'}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ── */}
              <div className="px-8 py-5 border-t border-white/[0.06] mt-4">
                <div className="flex items-center gap-3">
                  {formStep > 0 ? (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setFormStep(s => s - 1)}
                      className="px-5 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-gray-400 hover:text-white rounded-xl text-sm font-medium transition-all duration-200"
                    >
                      Geri
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { setIsAddModalOpen(false); resetForm(); setFormStep(0); }}
                      className="px-5 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-gray-400 hover:text-white rounded-xl text-sm font-medium transition-all duration-200"
                    >
                      İptal
                    </motion.button>
                  )}
                  <div className="flex-1" />
                  {formStep < 4 ? (
                    <motion.button
                      whileHover={{ scale: 1.03, x: 2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        // Step validation
                        if (formStep === 1) {
                          if (!formData.companyName.trim()) { toast.error(t('cari.companyNameRequired')); return; }
                          if (!formData.taxNumber.trim()) { toast.error(t('cari.taxNumberRequired')); return; }
                          if (!formData.taxOffice.trim()) { toast.error(t('cari.taxOfficeRequired')); return; }
                        }
                        if (formStep === 2) {
                          if (!formData.contactPerson.trim()) { toast.error(t('cari.contactRequired')); return; }
                          if (!formData.phone.trim()) { toast.error(t('cari.phoneRequired')); return; }
                        }
                        setFormStep(s => s + 1);
                      }}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 transition-all duration-300"
                    >
                      Devam Et
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleAddCari}
                      className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 transition-all duration-300"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Kaydet
                      <Sparkles className="w-3.5 h-3.5 opacity-70" />
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ─── Detail Modal ───────────────────────────────────────────────────── */}
      <Dialog.Root open={isDetailModalOpen} onOpenChange={v => { if (!v) { setIsDetailModalOpen(false); setSelectedCari(null); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <Dialog.Content
            className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 card-premium border border-border/50 rounded-2xl sm:w-[95vw] sm:max-w-2xl overflow-y-auto z-50 shadow-2xl" style={{maxHeight:'calc(100dvh - 1rem)'}}
            aria-describedby={undefined}
          >
            {selectedCari && (
              <>
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <div>
                    <Dialog.Title className="text-xl font-bold text-white">{selectedCari.companyName}</Dialog.Title>
                    <div className="flex gap-2 mt-2">
                      {selectedCari.region && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${regionColor(selectedCari.region)}25`, color: regionColor(selectedCari.region), border: `1px solid ${regionColor(selectedCari.region)}50` }}>
                          {selectedCari.region}
                        </span>
                      )}
                      {selectedCari.category && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-accent text-foreground border border-border">
                          {selectedCari.category}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs ${selectedCari.type === 'Müşteri' ? 'bg-blue-900/40 text-blue-400 border border-blue-700/40' : 'bg-purple-900/40 text-purple-400 border border-purple-700/40'}`}>
                        {selectedCari.type}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => { setIsDetailModalOpen(false); setSelectedCari(null); }} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: t('customers.contactPerson', 'Yetkili Kişi'), value: selectedCari.contactPerson, icon: <User className="w-4 h-4" /> },
                      { label: t('common.phone', 'Telefon'), value: selectedCari.phone, icon: <Phone className="w-4 h-4" /> },
                      { label: t('common.email', 'E-posta'), value: selectedCari.email || '—', icon: <Mail className="w-4 h-4" /> },
                      { label: t('cari.taxNumber', 'Vergi No'), value: selectedCari.taxNumber || '—', icon: <Receipt className="w-4 h-4" /> },
                      { label: t('cari.taxOffice', 'Vergi Dairesi'), value: selectedCari.taxOffice || '—', icon: <Building2 className="w-4 h-4" /> },
                      ...(selectedCari.type === 'Toptancı' ? [{ label: t('uretim.trKodu.labelShort', 'Onaylı İşletme No'), value: selectedCari.approvedBusinessNo || '—', icon: <BadgeCheck className="w-4 h-4 text-emerald-400" /> }] : []),
                      { label: t('cari.totalTransactions', 'Toplam İşlem'), value: `${selectedCari.transactions} adet`, icon: <CreditCard className="w-4 h-4" /> },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-3 p-3 bg-secondary/60 rounded-xl">
                        <span className="text-muted-foreground">{item.icon}</span>
                        <div>
                          <p className="text-muted-foreground text-xs">{item.label}</p>
                          <p className="text-white text-sm font-medium">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedCari.address && (
                    <div className="flex items-start gap-3 p-3 bg-secondary/60 rounded-xl">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-muted-foreground text-xs">{t('common.address', 'Adres')}</p>
                        <p className="text-white text-sm">{selectedCari.address}</p>
                      </div>
                    </div>
                  )}

                  {/* Bakiye */}
                  <div className={`flex items-center justify-between p-4 rounded-xl border ${
                    selectedCari.balance > 0 ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'
                  }`}>
                    <span className="text-foreground font-medium">{t('customers.balance', 'Bakiye')}</span>
                    <span className={`text-2xl font-bold ${selectedCari.balance > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {selectedCari.balance > 0 ? '+' : ''}₺{Math.abs(selectedCari.balance).toLocaleString()}
                    </span>
                  </div>

                  {/* İşlem Geçmişi */}
                  {selectedCari.transactionHistory && selectedCari.transactionHistory.length > 0 && (
                    <div>
                      <h4 className="text-white font-bold mb-3">{t('cari.accountStatement', 'Hesap Ekstresi')}</h4>
                      <div className="space-y-2">
                        {selectedCari.transactionHistory.map(tx => (
                          <div key={tx.id} className="flex items-center justify-between p-3 bg-secondary/60 rounded-xl">
                            <div>
                              <p className="text-white text-sm font-medium">{tx.description}</p>
                              <p className="text-muted-foreground text-xs">{tx.date} · {tx.category}</p>
                            </div>
                            <span className={`font-bold text-sm ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                              {tx.amount > 0 ? '+' : ''}₺{Math.abs(tx.amount).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 p-6 border-t border-border">
                  <button
                    onClick={() => { setIsDetailModalOpen(false); setSelectedCari(null); }}
                    className="flex-1 py-2.5 bg-secondary hover:bg-accent text-white rounded-xl text-sm transition-colors"
                  >
                    Kapat
                  </button>
                  <button
                    onClick={() => navigate(`/cari/${selectedCari.id}`)}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    Tam Ekran Görüntüle
                  </button>
                  <button
                    onClick={() => handleDeleteCari(selectedCari.id, selectedCari.companyName)}
                    className="px-4 py-2.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700/40 rounded-xl text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ─── Region Manager Modals ──────────────────────────────────────────── */}
      <RegionManagerModal
        open={isRegionManagerOpen}
        onClose={() => setIsRegionManagerOpen(false)}
        regions={regions}
        onSave={saveRegions}
      />
      <RegionManagerModal
        open={showFormRegionManager}
        onClose={() => setShowFormRegionManager(false)}
        regions={regions}
        onSave={(updated) => { saveRegions(updated); setShowFormRegionManager(false); }}
      />

      {/* ─── Category Manager Modal ────────────────────────────────────────── */}
      <CategoryManagerModal
        open={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        musteriCategories={musteriCategories}
        toptanciCategories={toptanciCategories}
        onSave={saveCategories}
      />

      {/* ─── Önceki Bakiye Dialog ──────────────────────────────────────────── */}
      <Dialog.Root open={isOncekiBakiyeOpen} onOpenChange={v => { if (!v) { setIsOncekiBakiyeOpen(false); setOncekiBakiyeCari(null); } }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-md z-50" />
          <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-sm bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl z-50 p-6">
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="text-base font-bold text-white flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <History className="w-4 h-4 text-violet-400" />
                </div>
                Önceki Bakiye Gir
              </Dialog.Title>
              <Dialog.Close className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </Dialog.Close>
            </div>

            {oncekiBakiyeCari && (
              <div className="flex items-center gap-3 p-3 bg-white/[0.04] border border-white/[0.08] rounded-xl mb-5">
                <div className={`p-2 rounded-lg ${oncekiBakiyeCari.type === 'Müşteri' ? 'bg-blue-600/20' : 'bg-purple-600/20'}`}>
                  <Building2 className={`w-4 h-4 ${oncekiBakiyeCari.type === 'Müşteri' ? 'text-blue-400' : 'text-purple-400'}`} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{oncekiBakiyeCari.companyName}</p>
                  <p className="text-xs text-gray-500">{oncekiBakiyeCari.type}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Tutar + Tür yan yana */}
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Tutar (₺)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={oncekiBakiyeForm.amount}
                      onChange={e => setOncekiBakiyeForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:border-violet-500/50 transition-all text-sm outline-none"
                      autoFocus
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">₺</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOncekiBakiyeForm(f => ({ ...f, type: f.type === 'debit' ? 'credit' : 'debit' }))}
                  className={`px-4 py-3 rounded-xl text-sm font-bold border transition-all ${
                    oncekiBakiyeForm.type === 'debit'
                      ? 'bg-green-600/20 border-green-500/30 text-green-400'
                      : 'bg-red-600/20 border-red-500/30 text-red-400'
                  }`}
                >
                  {oncekiBakiyeForm.type === 'debit' ? 'Alacak' : 'Borç'}
                </button>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Açıklama</label>
                <input
                  type="text"
                  value={oncekiBakiyeForm.description}
                  onChange={e => setOncekiBakiyeForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:border-violet-500/50 transition-all text-sm outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1.5 ml-1">Tarih</label>
                <input
                  type="date"
                  value={oncekiBakiyeForm.date}
                  onChange={e => setOncekiBakiyeForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white focus:border-violet-500/50 transition-all text-sm outline-none"
                />
              </div>

              <p className="text-[10px] text-gray-600">
                <span className="text-green-500 font-bold">Alacak</span> = müşteri/toptancı bize borçlu (bakiye artar) ·{' '}
                <span className="text-red-500 font-bold">Borç</span> = biz borçluyuz (bakiye azalır)
              </p>

              <button
                onClick={handleSaveOncekiBakiye}
                className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <History className="w-4 h-4" />
                Önceki Bakiyeyi Kaydet
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}