/**
 * Banka Hesapları Yönetimi
 * Hesap açma/kapatma, hareket girişi, bakiye takibi.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Landmark, Plus, X, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  ArrowRightLeft, Pencil, Trash2, Save, ChevronRight, Search,
  CreditCard, Calendar, FileText, CheckCircle, AlertCircle,
  RefreshCw, Download, Eye, EyeOff, Hash
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { useEmployee } from '../contexts/EmployeeContext';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../utils/activityLogger';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface BankMovement {
  id: string;
  type: 'giris' | 'cikis';
  category: 'tahsilat' | 'odeme' | 'transfer' | 'faiz' | 'komisyon' | 'maas' | 'kira' | 'diger';
  amount: number;
  description: string;
  date: string;
  reference?: string;   // EFT/havale referans no, dekont no
  createdAt: string;
  createdBy: string;
}

export interface BankAccount {
  id: string;
  bankName: string;
  subeName: string;
  iban: string;
  accountNo: string;
  accountType: 'vadesiz' | 'vadeli' | 'doviz';
  currency: 'TRY' | 'USD' | 'EUR';
  openingBalance: number;
  color: string;
  active: boolean;
  createdAt: string;
  movements: BankMovement[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const BANK_COLORS = ['blue', 'emerald', 'purple', 'orange', 'cyan', 'rose', 'amber'];
const colorClass = (c: string) => ({
  bg: `bg-${c}-500/15`,
  border: `border-${c}-500/25`,
  text: `text-${c}-400`,
  badge: `bg-${c}-500/20 text-${c}-400`,
  dot: `bg-${c}-400`,
});

const CATEGORY_LABELS: Record<BankMovement['category'], string> = {
  tahsilat: 'Tahsilat', odeme: 'Ödeme', transfer: 'Transfer',
  faiz: 'Faiz Geliri', komisyon: 'Banka Komisyonu',
  maas: 'Maaş Ödemesi', kira: 'Kira', diger: 'Diğer',
};

const POPULAR_BANKS = [
  'Ziraat Bankası', 'İş Bankası', 'Garanti BBVA', 'Akbank',
  'Yapı Kredi', 'Halkbank', 'Vakıfbank', 'Denizbank',
  'QNB Finansbank', 'TEB', 'Şekerbank', 'ING Bank',
];

function calcBalance(acc: BankAccount): number {
  const movTotal = acc.movements.reduce(
    (s, m) => s + (m.type === 'giris' ? m.amount : -m.amount), 0
  );
  return acc.openingBalance + movTotal;
}

function fmt(n: number, currency = 'TRY') {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
    + (currency === 'TRY' ? ' ₺' : currency === 'USD' ? ' $' : ' €');
}

const inputCls = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all';
const labelCls = 'block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5';

// ─── Component ────────────────────────────────────────────────────────────────
export function BankaPage() {
  usePageSecurity('kasa');
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const perms = getPagePermissions('kasa', currentEmployee);

  const [accounts, setAccounts] = useState<BankAccount[]>(
    () => (getFromStorage<BankAccount[]>(StorageKey.BANK_DATA) || [])
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddMovement, setShowAddMovement] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [movSearch, setMovSearch] = useState('');
  const [hideBalances, setHideBalances] = useState(false);

  // ─── Persist ───────────────────────────────────────────────────────────────
  const persist = useCallback((next: BankAccount[]) => {
    setAccounts(next);
    setInStorage(StorageKey.BANK_DATA, next);
  }, []);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const selected = useMemo(() => accounts.find(a => a.id === selectedId) || accounts[0] || null, [accounts, selectedId]);

  const stats = useMemo(() => {
    const totalTRY = accounts.filter(a => a.active && a.currency === 'TRY').reduce((s, a) => s + calcBalance(a), 0);
    const today = new Date().toISOString().split('T')[0];
    const todayIn = accounts.flatMap(a => a.movements).filter(m => m.type === 'giris' && m.date === today).reduce((s, m) => s + m.amount, 0);
    const todayOut = accounts.flatMap(a => a.movements).filter(m => m.type === 'cikis' && m.date === today).reduce((s, m) => s + m.amount, 0);
    return { totalTRY, todayIn, todayOut };
  }, [accounts]);

  const filteredMovements = useMemo(() => {
    if (!selected) return [];
    const q = movSearch.toLowerCase();
    return [...selected.movements]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .filter(m => !q || m.description.toLowerCase().includes(q) || (m.reference || '').toLowerCase().includes(q) || CATEGORY_LABELS[m.category].toLowerCase().includes(q));
  }, [selected, movSearch]);

  // ─── Account Form State ────────────────────────────────────────────────────
  const emptyAccountForm = () => ({
    bankName: '', subeName: '', iban: '', accountNo: '',
    accountType: 'vadesiz' as BankAccount['accountType'],
    currency: 'TRY' as BankAccount['currency'],
    openingBalance: 0,
    color: BANK_COLORS[accounts.length % BANK_COLORS.length],
  });
  const [accountForm, setAccountForm] = useState(emptyAccountForm);

  // ─── Movement Form State ───────────────────────────────────────────────────
  const emptyMovForm = () => ({
    type: 'giris' as BankMovement['type'],
    category: 'diger' as BankMovement['category'],
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
  });
  const [movForm, setMovForm] = useState(emptyMovForm);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const addAccount = () => {
    if (!accountForm.bankName.trim()) { toast.error('Banka adı zorunlu'); return; }
    const newAcc: BankAccount = {
      id: `bank-${Date.now()}`,
      ...accountForm,
      active: true,
      createdAt: new Date().toISOString(),
      movements: [],
    };
    const next = [...accounts, newAcc];
    persist(next);
    setSelectedId(newAcc.id);
    setShowAddAccount(false);
    setAccountForm(emptyAccountForm());
    logActivity('bank_account_created', `Banka hesabı oluşturuldu: ${newAcc.bankName}`, { employeeName: currentEmployee?.name || user?.name });
    toast.success(`${newAcc.bankName} hesabı eklendi`);
  };

  const saveEditAccount = () => {
    if (!accountForm.bankName.trim()) { toast.error('Banka adı zorunlu'); return; }
    const next = accounts.map(a => a.id === editingAccountId ? { ...a, ...accountForm } : a);
    persist(next);
    setEditingAccountId(null);
    toast.success('Hesap güncellendi');
  };

  const deleteAccount = (id: string) => {
    if (!confirm('Bu hesabı silmek istediğinizden emin misiniz? Tüm hareketler de silinir.')) return;
    const next = accounts.filter(a => a.id !== id);
    persist(next);
    if (selectedId === id) setSelectedId(null);
    toast.success('Hesap silindi');
  };

  const addMovement = () => {
    if (!selected) return;
    if (!movForm.amount || movForm.amount <= 0) { toast.error('Tutar 0\'dan büyük olmalı'); return; }
    if (!movForm.description.trim()) { toast.error('Açıklama zorunlu'); return; }
    const newMov: BankMovement = {
      id: `bmov-${Date.now()}`,
      ...movForm,
      createdAt: new Date().toISOString(),
      createdBy: currentEmployee?.name || user?.name || 'Sistem',
    };
    const next = accounts.map(a =>
      a.id === selected.id ? { ...a, movements: [...a.movements, newMov] } : a
    );
    persist(next);
    setShowAddMovement(false);
    setMovForm(emptyMovForm());
    logActivity('bank_movement', `Banka hareketi: ${newMov.type === 'giris' ? '+' : '-'}${fmt(newMov.amount)} — ${newMov.description}`, { employeeName: currentEmployee?.name || user?.name });
    toast.success(`Hareket kaydedildi`);
  };

  const deleteMovement = (movId: string) => {
    if (!selected) return;
    const next = accounts.map(a =>
      a.id === selected.id ? { ...a, movements: a.movements.filter(m => m.id !== movId) } : a
    );
    persist(next);
    toast.success('Hareket silindi');
  };

  const openEditAccount = (acc: BankAccount) => {
    setAccountForm({ bankName: acc.bankName, subeName: acc.subeName, iban: acc.iban, accountNo: acc.accountNo, accountType: acc.accountType, currency: acc.currency, openingBalance: acc.openingBalance, color: acc.color });
    setEditingAccountId(acc.id);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">

      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/20 flex items-center justify-center">
            <Landmark className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Banka Hesapları</h1>
            <p className="text-xs sm:text-sm text-gray-500">{accounts.filter(a => a.active).length} aktif hesap</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setHideBalances(h => !h)} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 transition-all" title="Bakiyeleri gizle/göster">
            {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          {perms.canAdd && (
            <button onClick={() => { setAccountForm(emptyAccountForm()); setShowAddAccount(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-blue-600/20">
              <Plus className="w-4 h-4" /> Hesap Ekle
            </button>
          )}
        </div>
      </div>

      {/* ─── Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Toplam TRY Bakiye', value: hideBalances ? '••••••' : fmt(stats.totalTRY), icon: Landmark, color: 'text-blue-400', bg: 'from-blue-500/10 to-indigo-500/10 border-blue-500/15' },
          { label: "Bugün Gelen", value: hideBalances ? '••••••' : fmt(stats.todayIn), icon: ArrowUpRight, color: 'text-emerald-400', bg: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/15' },
          { label: "Bugün Giden", value: hideBalances ? '••••••' : fmt(stats.todayOut), icon: ArrowDownRight, color: 'text-red-400', bg: 'from-red-500/10 to-rose-500/10 border-red-500/15' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className={`p-4 rounded-2xl bg-gradient-to-br border ${s.bg}`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl bg-black/20 flex items-center justify-center`}><s.icon className={`w-4 h-4 ${s.color}`} /></div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{s.label}</p>
                <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ─── Main Grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

        {/* Account List */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">Hesaplar</h2>
          {accounts.length === 0 && (
            <div className="p-8 rounded-2xl bg-white/3 border border-white/5 text-center">
              <Landmark className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 font-medium">Henüz hesap yok</p>
              <p className="text-xs text-gray-600 mt-1">Sağ üstten yeni hesap ekleyin</p>
            </div>
          )}
          {accounts.map((acc, i) => {
            const bal = calcBalance(acc);
            const cc = colorClass(acc.color);
            const isSelected = selected?.id === acc.id;
            return (
              <motion.button key={acc.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                onClick={() => setSelectedId(acc.id)}
                className={`w-full p-4 rounded-2xl border text-left transition-all ${isSelected ? `${cc.bg} ${cc.border} shadow-lg` : 'bg-white/3 border-white/5 hover:bg-white/5 hover:border-white/10'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl ${isSelected ? cc.bg : 'bg-white/5'} flex items-center justify-center`}>
                      <Landmark className={`w-4 h-4 ${isSelected ? cc.text : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white leading-none">{acc.bankName}</p>
                      {acc.subeName && <p className="text-[10px] text-gray-500 mt-0.5">{acc.subeName}</p>}
                    </div>
                  </div>
                  {isSelected && <ChevronRight className={`w-4 h-4 ${cc.text}`} />}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? cc.text : 'text-gray-500'}`}>{acc.accountType} • {acc.currency}</p>
                    {acc.iban && <p className="text-[9px] text-gray-600 font-mono mt-0.5">{acc.iban.slice(0, 8)}••••{acc.iban.slice(-4)}</p>}
                  </div>
                  <p className={`text-base font-black ${bal >= 0 ? (isSelected ? cc.text : 'text-white') : 'text-red-400'}`}>
                    {hideBalances ? '••••' : fmt(bal, acc.currency)}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Account Detail */}
        <div className="space-y-4">
          {!selected ? (
            <div className="h-64 rounded-2xl bg-white/3 border border-white/5 flex flex-col items-center justify-center text-center gap-3">
              <CreditCard className="w-10 h-10 text-gray-600" />
              <p className="text-sm text-gray-500 font-medium">Detay görmek için bir hesap seçin</p>
            </div>
          ) : (
            <>
              {/* Account Header */}
              <div className={`p-5 rounded-2xl bg-gradient-to-br border ${colorClass(selected.color).bg} ${colorClass(selected.color).border}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${colorClass(selected.color).text}`}>{selected.bankName} — {selected.accountType} ({selected.currency})</p>
                    <p className={`text-3xl font-black text-white mt-1`}>{hideBalances ? '••••••' : fmt(calcBalance(selected), selected.currency)}</p>
                    {selected.iban && <p className="text-xs font-mono text-gray-400 mt-1.5">IBAN: {selected.iban}</p>}
                    {selected.accountNo && <p className="text-[10px] text-gray-500">Hesap No: {selected.accountNo}</p>}
                    {selected.subeName && <p className="text-[10px] text-gray-500">{selected.subeName}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {perms.canEdit && (
                      <button onClick={() => openEditAccount(selected)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"><Pencil className="w-4 h-4" /></button>
                    )}
                    {perms.canDelete && (
                      <button onClick={() => deleteAccount(selected.id)} className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"><Trash2 className="w-4 h-4" /></button>
                    )}
                    {perms.canAdd && (
                      <button onClick={() => { setMovForm(emptyMovForm()); setShowAddMovement(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold text-white transition-all">
                        <Plus className="w-4 h-4" /> Hareket Ekle
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Movement History */}
              <div className="rounded-2xl bg-[#111] border border-white/5 overflow-hidden">
                <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-gray-500" />
                    Hareket Geçmişi
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-white/5 text-gray-400 rounded-md">{selected.movements.length}</span>
                  </h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <input value={movSearch} onChange={e => setMovSearch(e.target.value)} placeholder="Hareket ara…" className="pl-9 pr-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40 w-full sm:w-52 transition-all" />
                  </div>
                </div>

                {filteredMovements.length === 0 ? (
                  <div className="p-10 text-center">
                    <FileText className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">{movSearch ? 'Eşleşen hareket yok' : 'Henüz hareket yok'}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 max-h-[480px] overflow-y-auto">
                    {filteredMovements.map((mov, i) => (
                      <motion.div key={mov.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors group">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${mov.type === 'giris' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                          {mov.type === 'giris' ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white truncate">{mov.description}</p>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-gray-500 whitespace-nowrap">{CATEGORY_LABELS[mov.category]}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[10px] text-gray-500">{mov.date}</span>
                            {mov.reference && <span className="text-[10px] font-mono text-gray-600">Ref: {mov.reference}</span>}
                            <span className="text-[10px] text-gray-600">{mov.createdBy}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <p className={`text-sm font-black tabular-nums ${mov.type === 'giris' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {mov.type === 'giris' ? '+' : '-'}{fmt(mov.amount, selected.currency)}
                          </p>
                          {perms.canDelete && (
                            <button onClick={() => deleteMovement(mov.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Modal: Add/Edit Account ────────────────────────── */}
      <AnimatePresence>
        {(showAddAccount || editingAccountId) && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowAddAccount(false); setEditingAccountId(null); }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: 'spring', stiffness: 250, damping: 30 }}
              className="fixed inset-3 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg z-[110] bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-white">{editingAccountId ? 'Hesabı Düzenle' : 'Yeni Banka Hesabı'}</h2>
                  <button onClick={() => { setShowAddAccount(false); setEditingAccountId(null); }} className="p-2 hover:bg-white/10 rounded-xl text-gray-400 transition-all"><X className="w-5 h-5" /></button>
                </div>

                {/* Bank Name Picker */}
                <div>
                  <label className={labelCls}>Banka Adı *</label>
                  <input value={accountForm.bankName} onChange={e => setAccountForm(f => ({ ...f, bankName: e.target.value }))} list="bank-list" className={inputCls} placeholder="Banka adı seçin veya yazın" />
                  <datalist id="bank-list">{POPULAR_BANKS.map(b => <option key={b} value={b} />)}</datalist>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Şube</label>
                    <input value={accountForm.subeName} onChange={e => setAccountForm(f => ({ ...f, subeName: e.target.value }))} className={inputCls} placeholder="Şube adı" />
                  </div>
                  <div>
                    <label className={labelCls}>Hesap No</label>
                    <input value={accountForm.accountNo} onChange={e => setAccountForm(f => ({ ...f, accountNo: e.target.value }))} className={inputCls} placeholder="000 000 000" />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>IBAN</label>
                  <input value={accountForm.iban} onChange={e => setAccountForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))} className={inputCls} placeholder="TR00 0000 0000 0000 0000 0000 00" maxLength={32} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Hesap Türü</label>
                    <select value={accountForm.accountType} onChange={e => setAccountForm(f => ({ ...f, accountType: e.target.value as any }))} className={inputCls}>
                      <option value="vadesiz">Vadesiz</option>
                      <option value="vadeli">Vadeli</option>
                      <option value="doviz">Döviz</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Para Birimi</label>
                    <select value={accountForm.currency} onChange={e => setAccountForm(f => ({ ...f, currency: e.target.value as any }))} className={inputCls}>
                      <option value="TRY">₺ TRY</option>
                      <option value="USD">$ USD</option>
                      <option value="EUR">€ EUR</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Açılış Bakiyesi</label>
                  <input type="number" value={accountForm.openingBalance || ''} onChange={e => setAccountForm(f => ({ ...f, openingBalance: parseFloat(e.target.value) || 0 }))} className={inputCls} placeholder="0.00" />
                </div>

                <div>
                  <label className={labelCls}>Renk</label>
                  <div className="flex gap-2">
                    {BANK_COLORS.map(c => (
                      <button key={c} onClick={() => setAccountForm(f => ({ ...f, color: c }))}
                        className={`w-8 h-8 rounded-lg border-2 transition-all bg-${c}-500/30 ${accountForm.color === c ? `border-${c}-400 scale-110` : 'border-transparent hover:scale-105'}`} />
                    ))}
                  </div>
                </div>

                <button onClick={editingAccountId ? saveEditAccount : addAccount}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white text-sm transition-all flex items-center justify-center gap-2 mt-2">
                  <Save className="w-4 h-4" /> {editingAccountId ? 'Güncelle' : 'Hesap Ekle'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Modal: Add Movement ────────────────────────────── */}
      <AnimatePresence>
        {showAddMovement && selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddMovement(false)} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: 'spring', stiffness: 250, damping: 30 }}
              className="fixed inset-3 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md z-[110] bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl">
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white">Hareket Ekle — {selected.bankName}</h2>
                  <button onClick={() => setShowAddMovement(false)} className="p-2 hover:bg-white/10 rounded-xl text-gray-400 transition-all"><X className="w-5 h-5" /></button>
                </div>

                {/* Giriş / Çıkış toggle */}
                <div className="flex gap-2">
                  {(['giris', 'cikis'] as const).map(t => (
                    <button key={t} onClick={() => setMovForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${movForm.type === t ? (t === 'giris' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                      {t === 'giris' ? <><ArrowUpRight className="w-4 h-4" /> Para Girişi</> : <><ArrowDownRight className="w-4 h-4" /> Para Çıkışı</>}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Tutar *</label>
                    <input type="number" value={movForm.amount || ''} onChange={e => setMovForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className={inputCls} placeholder="0.00" step="0.01" />
                  </div>
                  <div>
                    <label className={labelCls}>Tarih</label>
                    <input type="date" value={movForm.date} onChange={e => setMovForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Kategori</label>
                  <select value={movForm.category} onChange={e => setMovForm(f => ({ ...f, category: e.target.value as any }))} className={inputCls}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Açıklama *</label>
                  <input value={movForm.description} onChange={e => setMovForm(f => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Ödeme açıklaması..." />
                </div>

                <div>
                  <label className={labelCls}>Referans / Dekont No</label>
                  <input value={movForm.reference} onChange={e => setMovForm(f => ({ ...f, reference: e.target.value }))} className={inputCls} placeholder="EFT referans, dekont numarası..." />
                </div>

                <button onClick={addMovement}
                  className={`w-full py-3 rounded-xl font-bold text-white text-sm transition-all flex items-center justify-center gap-2 ${movForm.type === 'giris' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20' : 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20'}`}>
                  <CheckCircle className="w-4 h-4" /> Hareketi Kaydet
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
