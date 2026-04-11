// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useEffect, useMemo } from 'react';
import { useGlobalTableData } from '../contexts/GlobalTableSyncContext';
import { 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  CreditCard, 
  Trash2, 
  Lock, 
  ShieldCheck, 
  ShieldAlert,
  X,
  CheckCircle2,
  Calendar,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { staggerContainer, rowItem, hover, tap } from '../utils/animations';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { useTableSync } from '../hooks/useTableSync';
import { SyncStatusBar, SyncBadge } from '../components/SyncStatusBar';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { logActivity } from '../utils/activityLogger';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { BankWidget } from '../components/BankWidget';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { kvGet, kvSet } from '../lib/pouchdb-kv';

const checkIsDayClosed = (): boolean => {
  try {
    const todayISO = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(`isleyen_et_gun_sonu_${todayISO}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.closed === true;
    }
    return false;
  } catch {
    return false;
  }
};

interface POSDevice {
  id: string;
  name: string;
  bankName: string;
  serialNumber: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  type: 'Gelir' | 'Gider';
  category: string;
  description: string;
  amount: number;
  date: string;
  time: string;
}

const initialTransactions: Transaction[] = [];

export function KasaPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { emit } = useModuleBus();
  
  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canAdd, canDelete } = getPagePermissions(user, currentEmployee, 'kasa');
  const sec = usePageSecurity('kasa');

  const [isDayClosed, setIsDayClosed] = useState(checkIsDayClosed);
  
  useEffect(() => {
    const checkDay = () => setIsDayClosed(checkIsDayClosed());
    window.addEventListener('storage_update', checkDay);
    window.addEventListener('storage', checkDay);
    const interval = setInterval(checkDay, 30000);
    return () => {
      window.removeEventListener('storage_update', checkDay);
      window.removeEventListener('storage', checkDay);
      clearInterval(interval);
    };
  }, []);

  const { data: transactions, addItem: addTransaction, deleteItem: deleteTransaction } = useTableSync<Transaction>({
    tableName: 'kasa_islemleri',
    storageKey: 'kasa_data',
    initialData: initialTransactions,
    orderBy: 'created_at',
    orderAsc: false,
  });

  const personnelList = useGlobalTableData<any>('personeller');
  const vehicles = useGlobalTableData<any>('araclar');
  const globalFisler = useGlobalTableData<any>('fisler');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'Gelir' | 'Gider'>('Gelir');
  const [selectedCategory, setSelectedCategory] = useState<string>('Satış');
  const [activeTab, setActiveTab] = useState<'transactions' | 'pos'>('transactions');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'Tümü'|'Gelir'|'Gider'>('Tümü');
  
  const [posDevices, setPosDevices] = useState<POSDevice[]>(() => {
    return getFromStorage<POSDevice[]>(StorageKey.POS_DATA) || [];
  });

  // BUG FIX [AJAN-2]: localStorage boşsa KV store'dan POS cihazlarını yükle (mobil ilk açılış)
  useEffect(() => {
    const saved = getFromStorage<POSDevice[]>(StorageKey.POS_DATA);
    if (!saved || saved.length === 0) {
      kvGet<POSDevice[]>('pos_devices').then(remote => {
        if (remote && remote.length > 0) {
          setPosDevices(remote);
          setInStorage(StorageKey.POS_DATA, remote);
        }
      }).catch(() => {});
    }
  }, []);

  const [isPosModalOpen, setIsPosModalOpen] = useState(false);
  const [newPosForm, setNewPosForm] = useState({
    name: '',
    bankName: '',
    serialNumber: ''
  });

  const totalAssets = transactions.reduce((sum, t) => sum + (t.type === 'Gelir' ? t.amount : -t.amount), 0);
  const today = new Date().toLocaleDateString('tr-TR');
  
  const todayIncome = transactions
    .filter(t => t.type === 'Gelir' && (t.date === today || (t.date && t.date.startsWith(new Date().toISOString().split('T')[0]))))
    .reduce((sum, t) => sum + t.amount, 0);

  const todayExpense = transactions
    .filter(t => t.type === 'Gider' && (t.date === today || (t.date && t.date.startsWith(new Date().toISOString().split('T')[0]))))
    .reduce((sum, t) => sum + t.amount, 0);

  const kasaGunSonuValidation = useMemo(() => {
    const todayISO = new Date().toISOString().split('T')[0];
    const rawFisler = globalFisler.length > 0 ? globalFisler : (getFromStorage<any[]>(StorageKey.FISLER) || []);

    const kasaTodayIncome = todayIncome;
    const kasaTodayExpense = todayExpense;
    const kasaNet = kasaTodayIncome - kasaTodayExpense;

    const todaySalesFis = rawFisler.filter(
      f => (f.mode === 'satis' || f.mode === 'sale') && f.date?.startsWith(todayISO)
    );
    const gunSonuSalesTotal = todaySalesFis.reduce((sum: number, item: any) => {
      let net = 0;
      (item.items || []).forEach((p: any) => {
        const amount = Math.abs(p.totalPrice || p.total || (p.unitPrice || p.price || 0) * (p.quantity || 0));
        if (p.type === 'iade') net -= amount;
        else net += amount;
      });
      return sum + net;
    }, 0);

    return { kasaTodayIncome, kasaTodayExpense, kasaNet, gunSonuSalesTotal, isDayClosed, totalAssets };
  }, [todayIncome, todayExpense, isDayClosed, totalAssets, globalFisler]);

  const handleOpenModal = (type: 'Gelir' | 'Gider') => {
    setModalType(type);
    setSelectedCategory(type === 'Gelir' ? 'Satış' : 'Alışveriş');
    setIsModalOpen(true);
  };

  const handleAddTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canAdd) {
      sec.logUnauthorized('add', 'Kullanıcı kasaya işlem eklemeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    if (isDayClosed) {
      toast.error('Gün sonu kapatıldığı için yeni işlem eklenemez!');
      return;
    }
    if (!sec.checkRate('add')) return;

    const formData = new FormData(e.currentTarget);
    
    let description = formData.get('description') as string;
    const category = formData.get('category') as string;

    if (!sec.validateInputs({ description: description || '', category })) return;

    if (modalType === 'Gider') {
      if (category === 'Personel') {
        const subCat = formData.get('subCategory');
        const personnel = formData.get('personnelId');
        const baseDesc = `${subCat} - ${personnel}`;
        description = description ? `${baseDesc} (${description})` : baseDesc;
      } else if (category === 'Araç') {
        const subCat = formData.get('subCategory');
        const vehicle = formData.get('vehicleId');
        const baseDesc = `${subCat} - ${vehicle}`;
        description = description ? `${baseDesc} (${description})` : baseDesc;
      }
    }
    
    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      type: modalType,
      category,
      description,
      amount: Number(formData.get('amount')),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };

    await addTransaction(newTransaction);
    sec.auditLog('add', newTransaction.id, `${modalType}:${newTransaction.amount}`);
    emit('kasa:transaction_added', { transactionId: newTransaction.id, type: modalType, amount: newTransaction.amount });
    toast.success(`${modalType} işlemi başarıyla eklendi!`);
    setIsModalOpen(false);
    (e.target as HTMLFormElement).reset();
    logActivity(modalType === 'Gelir' ? 'cash_income' : 'cash_expense', `${modalType} eklendi: ${description}`, {
      page: 'kasa',
      metadata: { amount: newTransaction.amount, category: newTransaction.category },
    });
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!canDelete) {
      sec.logUnauthorized('delete', 'Kullanıcı kasadan işlem silmeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    if (!sec.checkRate('delete')) return;
    if (!confirm('Bu işlem kalıcı olarak silinecektir. Onaylıyor musunuz?')) return;
    await deleteTransaction(id);
    sec.auditLog('delete', id);
    emit('kasa:transaction_deleted', { transactionId: id });
    toast.success('İşlem silindi');
    logActivity('custom', `Kasa islemi silindi`, { page: 'kasa', metadata: { id }, employeeName: user?.name });
  };

  const handleAddPosDevice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canAdd) {
      sec.logUnauthorized('add', 'Kullanıcı POS cihazı eklemeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    if (!sec.preCheck('add', { name: newPosForm.name, bankName: newPosForm.bankName })) return;

    const newDevice: POSDevice = {
      id: Date.now().toString(),
      ...newPosForm,
      createdAt: new Date().toISOString().split('T')[0],
    };
    const updated = [newDevice, ...posDevices];
    setPosDevices(updated);
    setInStorage(StorageKey.POS_DATA, updated);
    // BUG FIX [AJAN-2]: POS cihazını KV store'a da yaz
    kvSet('pos_devices', updated).catch(e => console.error('[Kasa] POS kv sync:', e));
    toast.success('POS cihazı sisteme eklendi');
    setIsPosModalOpen(false);
    setNewPosForm({ name: '', bankName: '', serialNumber: '' });
    logActivity('custom', `POS cihazi eklendi: ${newDevice.name}`, { page: 'kasa', metadata: { bankName: newDevice.bankName } });
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === 'Tümü' || t.type === filterType;
      return matchSearch && matchType;
    });
  }, [transactions, searchTerm, filterType]);

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-4 sm:pb-6">
      <SyncStatusBar tableName="kasa_islemleri" />

      {/* ─── Gün Sonu Kapalı Uyarısı ─── */}
      <AnimatePresence>
        {isDayClosed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 overflow-hidden"
          >
            <div className="p-2.5 sm:p-3 bg-red-500/20 rounded-xl flex-shrink-0">
              <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-red-400 font-bold text-base sm:text-lg mb-1">Gün Sonu Kapatıldı</h3>
              <p className="text-red-400/70 text-xs sm:text-sm">
                Bugün için gün sonu işlemleri tamamlanmıştır. Yeni gelir/gider kaydı eklenemez. 
                Değişiklik yapmak için "Gün Sonu" sayfasından işlemi iptal etmelisiniz.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Header ─── */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Kasa & Finans</h1>
              <SyncBadge tableName="kasa_islemleri" />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">Günlük nakit akışı, POS cihazları ve finansal özetler.</p>
          </div>
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => {
                if (isDayClosed) { toast.error('Gün sonu kapatıldı!'); return; }
                handleOpenModal('Gelir');
              }}
              disabled={isDayClosed}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                isDayClosed ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10' 
                : 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5" /> <span className="hidden sm:inline">Gelir</span> Ekle
            </button>
            <button
              onClick={() => {
                if (isDayClosed) { toast.error('Gün sonu kapatıldı!'); return; }
                handleOpenModal('Gider');
              }}
              disabled={isDayClosed}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                isDayClosed ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10' 
                : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
              }`}
            >
              <ArrowDownCircle className="w-4 h-4 sm:w-5 sm:h-5" /> <span className="hidden sm:inline">Gider</span> Ekle
            </button>
          </div>
        </div>
      </div>

      {/* ─── Summary Cards (Bento Grid) ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        
        {/* Total Assets - col-span-2 on mobile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="col-span-2 lg:col-span-1 relative overflow-hidden rounded-2xl lg:rounded-3xl bg-gradient-to-br from-blue-600/20 to-blue-900/20 border border-blue-500/30 p-4 sm:p-6 flex flex-col justify-between"
        >
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
          <div>
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className="p-2 sm:p-3 bg-blue-500/20 rounded-xl text-blue-400 border border-blue-500/30"><Wallet className="w-4 h-4 sm:w-5 sm:h-5" /></div>
              <h3 className="font-bold text-[10px] sm:text-sm text-blue-300 uppercase tracking-wider">Toplam Kasa</h3>
            </div>
            <p className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white break-all">₺{totalAssets.toLocaleString()}</p>
          </div>
          <div className="mt-4 sm:mt-6 flex items-center justify-between text-[10px] sm:text-xs font-medium text-blue-200/60 bg-blue-950/30 p-2 sm:p-3 rounded-xl border border-blue-500/20">
            <span>Net gelir/gider sonucu</span>
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
          </div>
        </motion.div>

        {/* Today's Income */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-2xl lg:rounded-3xl bg-white/5 border border-white/10 p-4 sm:p-6 flex flex-col justify-between group hover:border-green-500/30 transition-colors"
        >
          <div>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-green-500/10 rounded-xl text-green-400"><TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                <h3 className="font-bold text-[10px] sm:text-sm text-gray-400 uppercase tracking-wider">Bugün Giren</h3>
              </div>
            </div>
            <p className="text-lg sm:text-3xl lg:text-4xl font-bold text-green-400 break-all">+₺{todayIncome.toLocaleString()}</p>
          </div>
          <div className="mt-4 sm:mt-6 h-1 w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }} />
          </div>
        </motion.div>

        {/* Today's Expense */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-2xl lg:rounded-3xl bg-white/5 border border-white/10 p-4 sm:p-6 flex flex-col justify-between group hover:border-red-500/30 transition-colors"
        >
          <div>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-red-500/10 rounded-xl text-red-400"><TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                <h3 className="font-bold text-[10px] sm:text-sm text-gray-400 uppercase tracking-wider">Bugün Çıkan</h3>
              </div>
            </div>
            <p className="text-lg sm:text-3xl lg:text-4xl font-bold text-red-400 break-all">-₺{todayExpense.toLocaleString()}</p>
          </div>
          <div className="mt-4 sm:mt-6 h-1 w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full" style={{ width: '100%' }} />
          </div>
        </motion.div>

      </div>

      {/* ─── Validation & Consistency Check ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        <div className={`rounded-3xl p-6 border transition-colors ${kasaGunSonuValidation.isDayClosed ? 'bg-red-900/10 border-red-500/20' : 'bg-green-900/10 border-green-500/20'}`}>
          <div className="flex items-start gap-4 mb-6">
            {kasaGunSonuValidation.isDayClosed ? (
              <div className="p-3 bg-red-500/20 rounded-xl"><ShieldAlert className="w-6 h-6 text-red-400" /></div>
            ) : (
              <div className="p-3 bg-green-500/20 rounded-xl"><ShieldCheck className="w-6 h-6 text-green-400" /></div>
            )}
            <div>
              <h3 className={`text-lg font-bold ${kasaGunSonuValidation.isDayClosed ? 'text-red-400' : 'text-green-400'}`}>
                Sistem & Gün Sonu Durumu
              </h3>
              <p className="text-sm text-gray-400">Veri tutarlılığını kontrol edin.</p>
            </div>
          </div>
          <div className="space-y-3 bg-black/40 p-4 rounded-2xl border border-white/5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Günlük Net Durum:</span>
              <span className={`font-bold ${kasaGunSonuValidation.kasaNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {kasaGunSonuValidation.kasaNet >= 0 ? '+' : ''}₺{kasaGunSonuValidation.kasaNet.toLocaleString('tr-TR')}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-white/10 pt-3">
              <span className="text-gray-400">Satış Modülü Mutabakatı:</span>
              <span className="text-blue-400 font-bold">₺{kasaGunSonuValidation.gunSonuSalesTotal.toLocaleString('tr-TR')}</span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl p-6 border border-white/10 bg-white/5 flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-500/20 rounded-xl text-purple-400"><CreditCard className="w-6 h-6" /></div>
            <div>
              <h3 className="text-lg font-bold text-white">POS Yönetimi</h3>
              <p className="text-sm text-gray-400">Sisteme kayıtlı cihaz sayısı: {posDevices.length}</p>
            </div>
          </div>
          <button
            onClick={() => setIsPosModalOpen(true)}
            className="w-full py-4 mt-auto rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all shadow-lg shadow-purple-600/20"
          >
            Yeni POS Cihazı Ekle
          </button>
        </div>
      </motion.div>

      {/* ─── Main Content Tabs ─── */}
      <div className="rounded-3xl border border-white/10 bg-[#111] overflow-hidden">
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-5 text-center font-bold text-sm transition-all ${
              activeTab === 'transactions' ? 'bg-blue-600/10 text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            Kasa Hareketleri
          </button>
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex-1 py-5 text-center font-bold text-sm transition-all ${
              activeTab === 'pos' ? 'bg-purple-600/10 text-purple-400 border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            Kayıtlı POS Cihazları
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'transactions' && (
            <div className="space-y-6">
              {/* Search & Filter */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Açıklama veya kategori ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="flex bg-black/50 border border-white/10 rounded-xl p-1">
                  {['Tümü', 'Gelir', 'Gider'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type as any)}
                      className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                        filterType === type ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transactions List */}
              <motion.div
                className="space-y-3"
                variants={staggerContainer(0.04, 0.02)}
                initial="initial"
                animate="animate"
              >
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-16">
                    <Wallet className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-400 mb-2">İşlem Bulunamadı</h3>
                    <p className="text-gray-600">Arama kriterlerinize uygun kasa hareketi yoktur.</p>
                  </div>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <motion.div
                      key={transaction.id}
                      layout
                      variants={rowItem}
                      whileHover={{ x: 3, borderColor: 'rgba(255,255,255,0.12)', transition: { duration: 0.15 } }}
                      whileTap={tap.card}
                      className="group flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl transition-colors"
                    >
                      <div className="flex items-center gap-4 w-full md:w-auto mb-4 md:mb-0">
                        <div className={`p-3 rounded-xl flex-shrink-0 ${transaction.type === 'Gelir' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {transaction.type === 'Gelir' ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${transaction.type === 'Gelir' ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
                              {transaction.category}
                            </span>
                            <span className="text-xs text-gray-500 font-medium">{transaction.date} &bull; {transaction.time}</span>
                          </div>
                          <p className="text-white font-medium line-clamp-1">{transaction.description || 'Açıklama girilmedi'}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-6 pl-14 md:pl-0">
                        <p className={`text-xl font-extrabold ${transaction.type === 'Gelir' ? 'text-green-400' : 'text-red-400'}`}>
                          {transaction.type === 'Gelir' ? '+' : '-'}₺{transaction.amount.toLocaleString('tr-TR')}
                        </p>
                        <button
                          onClick={() => handleDeleteTransaction(transaction.id)}
                          className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors md:opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            </div>
          )}

          {activeTab === 'pos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {posDevices.length === 0 ? (
                <div className="col-span-full text-center py-16">
                  <CreditCard className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-400 mb-2">POS Cihazı Yok</h3>
                  <p className="text-gray-600 mb-6">Sisteme henüz bir POS cihazı tanımlanmamış.</p>
                  <button onClick={() => setIsPosModalOpen(true)} className="px-6 py-3 bg-purple-600 rounded-xl font-bold text-white">İlk Cihazı Ekle</button>
                </div>
              ) : (
                posDevices.map((device) => (
                  <motion.div
                    key={device.id}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="p-5 rounded-2xl bg-gradient-to-br from-purple-900/20 to-black border border-purple-500/20 flex flex-col group relative overflow-hidden"
                  >
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
                    <div className="flex justify-between items-start mb-4 relative z-10">
                      <div className="p-3 bg-purple-500/20 rounded-xl text-purple-400">
                        <CreditCard className="w-6 h-6" />
                      </div>
                      <button
                        onClick={() => {
                          if(confirm('POS cihazını silmek istediğinize emin misiniz?')) {
                            const updated = posDevices.filter(d => d.id !== device.id);
                            setPosDevices(updated);
                            setInStorage(StorageKey.POS_DATA, updated);
                            // BUG FIX [AJAN-2]: POS silme KV store'a da yaz
                            kvSet('pos_devices', updated).catch(e => console.error('[Kasa] POS kv sync:', e));
                            toast.success('POS Cihazı silindi.');
                          }
                        }}
                        className="p-2 bg-red-500/10 text-red-400 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="relative z-10 space-y-1">
                      <h4 className="text-lg font-bold text-white">{device.name}</h4>
                      <p className="text-sm font-medium text-purple-300">🏦 {device.bankName}</p>
                      <p className="text-xs text-gray-500 font-mono">SN: {device.serialNumber}</p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5 text-[10px] text-gray-600 font-medium relative z-10">
                      Eklenme: {device.createdAt}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── İşlem Modal ─── */}
      <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />
          <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#111] border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-8 w-[95vw] sm:w-full max-w-lg z-50 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <Dialog.Title className={`text-2xl font-bold flex items-center gap-3 ${modalType === 'Gelir' ? 'text-green-400' : 'text-red-400'}`}>
                {modalType === 'Gelir' ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                {modalType} Ekle
              </Dialog.Title>
              <Dialog.Close className="p-2 hover:bg-white/10 rounded-xl text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>
            
            <form onSubmit={handleAddTransaction} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">Kategori</label>
                <select
                  name="category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-4 bg-black/50 border border-white/10 rounded-xl text-white focus:border-blue-500 outline-none transition-all"
                  required
                >
                  {modalType === 'Gelir' ? (
                    <><option value="Satış">Satış</option><option value="Tahsilat">Tahsilat</option><option value="Diğer">Diğer</option></>
                  ) : (
                    <><option value="Alışveriş">Alışveriş</option><option value="Personel">Personel</option><option value="Araç">Araç</option><option value="Fatura">Fatura</option><option value="Diğer">Diğer</option></>
                  )}
                </select>
              </div>

              {modalType === 'Gider' && selectedCategory === 'Personel' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-400 mb-2">İşlem Tipi</label>
                    <select name="subCategory" required className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white outline-none">
                      <option value="Maaş">Maaş</option><option value="Avans">Avans</option><option value="Prim">Prim</option><option value="Mesaî">Mesaî</option><option value="Diğer">Diğer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-400 mb-2">Personel</label>
                    <select name="personnelId" required className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white outline-none">
                      <option value="">Seçiniz...</option>
                      {personnelList.map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {modalType === 'Gider' && selectedCategory === 'Araç' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-400 mb-2">İşlem Tipi</label>
                    <select name="subCategory" required className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white outline-none">
                      <option value="Yakıt">Yakıt</option><option value="Bakım/Onarım">Bakım/Onarım</option><option value="Sigorta/Kasko">Sigorta/Kasko</option><option value="Ceza">Ceza</option><option value="Diğer">Diğer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-400 mb-2">Araç Seçimi</label>
                    <select name="vehicleId" required className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white outline-none">
                      <option value="">Seçiniz...</option>
                      {vehicles.map((v: any) => <option key={v.id} value={v.plate}>{v.plate} ({v.model})</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">Açıklama</label>
                <input
                  type="text" name="description" placeholder="İşlem detayları..."
                  className="w-full px-4 py-4 bg-black/50 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:border-blue-500 outline-none transition-all"
                  required={modalType === 'Gelir' || (selectedCategory !== 'Personel' && selectedCategory !== 'Araç')}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">Tutar (₺)</label>
                <input
                  type="number" name="amount" placeholder="0.00" step="0.01" min="0.01"
                  className="w-full px-4 py-4 bg-black/50 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:border-blue-500 outline-none transition-all text-xl font-bold"
                  required
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Dialog.Close asChild>
                  <button type="button" className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-colors">İptal</button>
                </Dialog.Close>
                <button type="submit" className={`flex-1 py-4 font-bold rounded-xl text-white transition-all shadow-lg ${modalType === 'Gelir' ? 'bg-green-600 hover:bg-green-500 shadow-green-600/20' : 'bg-red-600 hover:bg-red-500 shadow-red-600/20'}`}>
                  İşlemi Kaydet
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ─── POS Modal ─── */}
      <Dialog.Root open={isPosModalOpen} onOpenChange={setIsPosModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />
          <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#111] border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-8 w-[95vw] sm:w-full max-w-lg z-50 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <Dialog.Title className="text-2xl font-bold text-purple-400 flex items-center gap-3">
                <CreditCard className="w-6 h-6" /> POS Cihazı Ekle
              </Dialog.Title>
              <Dialog.Close className="p-2 hover:bg-white/10 rounded-xl text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>
            
            <form onSubmit={handleAddPosDevice} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">Cihaz / Şube Adı</label>
                <input
                  type="text" required value={newPosForm.name} onChange={e => setNewPosForm({...newPosForm, name: e.target.value})}
                  placeholder="Örn: Kasa 1, Merkez Şube"
                  className="w-full px-4 py-4 bg-black/50 border border-white/10 rounded-xl text-white focus:border-purple-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">Banka Adı</label>
                <input
                  type="text" required value={newPosForm.bankName} onChange={e => setNewPosForm({...newPosForm, bankName: e.target.value})}
                  placeholder="Örn: Garanti BBVA"
                  className="w-full px-4 py-4 bg-black/50 border border-white/10 rounded-xl text-white focus:border-purple-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-2">Seri Numarası</label>
                <input
                  type="text" required value={newPosForm.serialNumber} onChange={e => setNewPosForm({...newPosForm, serialNumber: e.target.value})}
                  placeholder="Cihaz seri numarası"
                  className="w-full px-4 py-4 bg-black/50 border border-white/10 rounded-xl text-white focus:border-purple-500 outline-none transition-all font-mono"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Dialog.Close asChild>
                  <button type="button" className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-colors">İptal</button>
                </Dialog.Close>
                <button type="submit" className="flex-1 py-4 font-bold rounded-xl text-white bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-600/20 transition-all">
                  POS Ekle
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ─── Banka Yönetimi ─── */}
      <BankWidget canEdit={canAdd} />

    </div>
  );
}