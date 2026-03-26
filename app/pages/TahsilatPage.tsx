import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useEmployee } from '../contexts/EmployeeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { useTableSync } from '../hooks/useTableSync';
import { cariToDb, cariFromDb } from './CariPage';
import { saveCek, type CekData } from './CeklerPage';
import {
  Wallet,
  CreditCard,
  Banknote,
  FileEdit,
  Camera,
  X,
  Search,
  Calendar,
  Building,
  Check,
  AlertCircle,
  RotateCcw,
  Image as ImageIcon,
  Send,
  Clock,
  History,
  DollarSign,
  CalendarDays,
  ArrowRight,
  CheckCircle2,
  Layers,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as Tabs from '@radix-ui/react-tabs';
import * as Select from '@radix-ui/react-select';

interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: number;
  type?: string;
  transactionHistory?: {
    id: string;
    date: string;
    type: 'credit' | 'debit';
    amount: number;
    description: string;
  }[];
  transactions?: number;
}

type PaymentType = 'nakit' | 'pos' | 'cek' | 'eft' | 'taksit' | 'duzeltme';

interface Bank {
  id: string;
  name: string;
}

interface InstallmentPlan {
  no: number;
  date: string;
  amount: number;
  status: 'pending' | 'paid';
}

export function TahsilatPage() {
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { t } = useLanguage();
  
  const { emit } = useModuleBus();
  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canAdd } = getPagePermissions(user, currentEmployee, 'tahsilat');
  const sec = usePageSecurity('tahsilat');

  const { updateItem: updateCariSync } = useTableSync<any>({
    tableName: 'cari_hesaplar',
    storageKey: StorageKey.CARI_DATA,
    toDb: cariToDb,
    fromDb: cariFromDb,
  });
  const { addItem: addKasaSync } = useTableSync<any>({
    tableName: 'kasa_islemleri',
    storageKey: StorageKey.KASA_DATA,
  });

  const demoBanks = useMemo(() => {
    const bankList = getFromStorage<any[]>(StorageKey.BANK_DATA);
    if (!bankList || bankList.length === 0) {
      return [
        { id: '1', name: 'Ziraat Bankasi' },
        { id: '2', name: 'Is Bankasi' },
        { id: '3', name: 'Garanti BBVA' },
        { id: '4', name: 'Akbank' },
        { id: '5', name: 'Yapi Kredi' },
        { id: '6', name: 'Halkbank' },
        { id: '7', name: 'Vakifbank' },
      ];
    }
    return bankList.map(b => ({ id: b.id, name: b.name }));
  }, []);

  const [refreshCounter, setRefreshCounter] = useState(0);

  const demoCustomers = useMemo(() => {
    const cariList = getFromStorage<any[]>(StorageKey.CARI_DATA);
    if (!cariList) return [];
    return cariList
      .filter(c => (c.type === 'Müşteri' || c.type === 'Toptancı'))
      .map(c => ({
        id: c.id,
        name: c.companyName,
        phone: c.phone,
        balance: c.balance,
        type: c.type,
        transactionHistory: c.transactionHistory || [],
      }));
  }, [refreshCounter]);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>('nakit');
  const [customerSearch, setCustomerSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkPhotoFront, setCheckPhotoFront] = useState<string | null>(null);
  const [checkPhotoBack, setCheckPhotoBack] = useState<string | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [eftReferenceNo, setEftReferenceNo] = useState('');
  const [installmentCount, setInstallmentCount] = useState(3);
  const [installmentPlan, setInstallmentPlan] = useState<InstallmentPlan[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showMobileCustomerPanel, setShowMobileCustomerPanel] = useState(false);

  const checkFrontFileRef = useRef<HTMLInputElement>(null);
  const checkBackFileRef = useRef<HTMLInputElement>(null);

  const filteredCustomers = demoCustomers.filter(c =>
    (c?.name || '').toLowerCase().includes((customerSearch || '').toLowerCase()) ||
    (c?.phone || '').includes(customerSearch || '')
  );

  // Bugünkü tahsilat geçmişi
  const todayPayments = useMemo(() => {
    const kasaData = getFromStorage<any[]>(StorageKey.KASA_DATA) || [];
    const today = new Date().toLocaleDateString('tr-TR');
    return kasaData.filter(k => k.category === 'Tahsilat' && k.date === today).reverse();
  }, [refreshCounter]);

  const todayTotal = todayPayments.reduce((s, p) => s + (p.amount || 0), 0);

  // Generate installment plan
  const generateInstallmentPlan = useCallback(() => {
    const total = parseFloat(amount);
    if (isNaN(total) || total <= 0 || installmentCount < 2) return;
    // Tam kuruş aritmetiği ile yuvarlama hatalarını önle
    const centTotal = Math.round(total * 100);
    const centPerInstallment = Math.floor(centTotal / installmentCount);
    const lastInstallmentCents = centTotal - centPerInstallment * (installmentCount - 1);
    const plan: InstallmentPlan[] = [];
    for (let i = 0; i < installmentCount; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() + i + 1);
      plan.push({
        no: i + 1,
        date: date.toISOString().split('T')[0],
        amount: i === installmentCount - 1 ? lastInstallmentCents / 100 : centPerInstallment / 100,
        status: 'pending',
      });
    }
    setInstallmentPlan(plan);
  }, [amount, installmentCount]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string | null) => void, label: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { setter(reader.result as string); toast.success(`${label} ✓`); };
      reader.readAsDataURL(file);
    }
  };

  const paymentTypeLabels: Record<PaymentType, string> = {
    nakit: t('collection.cash'),
    pos: t('collection.pos'),
    cek: t('collection.check'),
    eft: t('collection.eft'),
    taksit: t('collection.installment'),
    duzeltme: t('collection.correction'),
  };

  const validatePayment = (): boolean => {
    if (!selectedCustomer) { toast.error(t('collection.selectCustomerPrompt')); return false; }
    if (paymentType !== 'taksit' && (!amount || parseFloat(amount) <= 0)) { toast.error(t('collection.collectionAmount') + ' !'); return false; }
    if ((paymentType === 'pos' || paymentType === 'eft') && !selectedBank) { toast.error(t('collection.selectBank') + ' !'); return false; }
    if (paymentType === 'eft' && !eftReferenceNo) { toast.error(t('collection.referenceNo') + ' !'); return false; }
    if (paymentType === 'cek') {
      if (!checkDate) { toast.error(t('collection.dueDate') + ' !'); return false; }
      if (!selectedBank) { toast.error(t('collection.selectBank') + ' !'); return false; }
      if (!checkPhotoFront) { toast.error(t('checks.frontPhotoRequired')); return false; }
    }
    if (paymentType === 'duzeltme' && !correctionNote) { toast.error(t('collection.correctionRequired')); return false; }
    if (paymentType === 'taksit' && installmentPlan.length === 0) { toast.error(t('collection.createPlan')); return false; }
    return true;
  };

  const handlePaymentConfirm = () => {
    if (!canAdd) {
      sec.logUnauthorized('tahsilat_add', 'Kullanıcı tahsilat yapmaya çalıştı ancak yetkisi yoktu.');
      return;
    }
    if (!sec.checkRate('add')) return;
    if (!validatePayment()) return;
    setShowConfirmDialog(true);
  };

  const executePayment = () => {
    if (!selectedCustomer) return;
    setShowConfirmDialog(false);

    const paymentAmount = paymentType === 'taksit'
      ? installmentPlan.reduce((s, i) => s + (i.amount || 0), 0)
      : (parseFloat(amount) || 0);

    // 1. Cari bakiyesini güncelle
    const allCari = getFromStorage<any[]>(StorageKey.CARI_DATA) || [];
    const targetCari = allCari.find(c => c.id === selectedCustomer.id);
    if (targetCari) {
      const descSuffix = paymentType === 'duzeltme' ? ` (${correctionNote})` :
        paymentType === 'eft' ? ` (Ref: ${eftReferenceNo})` :
        paymentType === 'taksit' ? ` (${installmentPlan.length} taksit)` : '';

      const newHistory = [...(targetCari.transactionHistory || [])];
      newHistory.unshift({
        id: `tx-tahsilat-${Date.now()}`,
        date: new Date().toISOString(),
        type: 'debit',
        amount: paymentAmount,
        description: `${paymentTypeLabels[paymentType]} ${t('collection.title')}${descSuffix}`
      });
      const updatedCariRecord = {
        ...targetCari,
        balance: (targetCari.balance || 0) - paymentAmount,
        transactions: (targetCari.transactions || 0) + 1,
        transactionHistory: newHistory
      };
      updateCariSync(selectedCustomer.id, updatedCariRecord);
    }

    // 2. Kasa'ya gelir olarak ekle
    const bankObj = demoBanks.find(b => b.id === selectedBank);
    const descParts = [paymentTypeLabels[paymentType], '-', selectedCustomer.name];
    if (paymentType === 'eft') descParts.push(`(Ref: ${eftReferenceNo})`);
    if (paymentType === 'duzeltme') descParts.push(`(${correctionNote})`);
    if (paymentType === 'taksit') descParts.push(`(${installmentPlan.length} taksit)`);
    if (bankObj) descParts.push(`[${bankObj.name}]`);

    const newKasaEntry = {
      id: `kasa-tahsilat-${Date.now()}`,
      type: 'Gelir',
      category: 'Tahsilat',
      description: descParts.join(' '),
      amount: paymentAmount,
      date: new Date().toLocaleDateString('tr-TR'),
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    addKasaSync(newKasaEntry);

    // 3. Eğer çek ise, çek verisini kaydet
    if (paymentType === 'cek') {
      const newCek: CekData = {
        id: `cek-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        direction: 'alinan',
        amount: paymentAmount,
        bankName: bankObj?.name || selectedBank,
        checkNumber: checkNumber || undefined,
        dueDate: checkDate,
        issueDate: new Date().toISOString().split('T')[0],
        sourceType: (selectedCustomer.type === 'Toptancı' ? 'toptanci' : 'musteri') as 'musteri' | 'toptanci',
        sourceName: selectedCustomer.name,
        sourceId: selectedCustomer.id,
        relatedFisDescription: `${t('collection.title')} - ₺${paymentAmount.toLocaleString()}`,
        photoFront: checkPhotoFront,
        photoBack: checkPhotoBack,
        status: 'beklemede',
        createdAt: new Date().toISOString(),
        createdBy: currentEmployee?.name || 'Sistem',
        auditLog: [{
          id: `audit-${Date.now()}`,
          timestamp: new Date().toISOString(),
          action: 'created',
          detail: 'Tahsilat sayfasindan olusturuldu',
          user: currentEmployee?.name || 'Sistem',
        }],
      };
      saveCek(newCek);
    }

    // 4. Taksit planını kaydet (çekler olarak)
    if (paymentType === 'taksit') {
      installmentPlan.forEach((inst, idx) => {
        const instCek: CekData = {
          id: `taksit-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          direction: 'alinan',
          amount: inst.amount,
          bankName: bankObj?.name || 'Taksit',
          checkNumber: `T${idx + 1}/${installmentPlan.length}`,
          dueDate: inst.date,
          issueDate: new Date().toISOString().split('T')[0],
          sourceType: (selectedCustomer.type === 'Toptancı' ? 'toptanci' : 'musteri') as 'musteri' | 'toptanci',
          sourceName: selectedCustomer.name,
          sourceId: selectedCustomer.id,
          relatedFisDescription: `Taksit ${idx + 1}/${installmentPlan.length} - ₺${inst.amount.toLocaleString()}`,
          photoFront: null,
          photoBack: null,
          status: 'beklemede',
          createdAt: new Date().toISOString(),
          createdBy: currentEmployee?.name || 'Sistem',
          auditLog: [{
            id: `audit-${Date.now()}-${idx}`,
            timestamp: new Date().toISOString(),
            action: 'created',
            detail: `Taksit plani olusturuldu: ${idx + 1}/${installmentPlan.length}`,
            user: currentEmployee?.name || 'Sistem',
          }],
        };
        saveCek(instCek);
      });
    }

    window.dispatchEvent(new Event('storage_update'));
    setRefreshCounter(prev => prev + 1);
    emit('tahsilat:created', { cariId: selectedCustomer.id, amount: paymentAmount, type: paymentType });
    sec.auditLog('tahsilat_add', selectedCustomer.id, `${selectedCustomer.name} - ₺${paymentAmount}`);

    toast.success(
      `${paymentTypeLabels[paymentType]} ${t('collection.title')}! ₺${paymentAmount.toLocaleString()} - ${currentEmployee?.name}`
    );

    // Reset
    setAmount(''); setSelectedBank(''); setCheckDate(''); setCheckNumber('');
    setCheckPhotoFront(null); setCheckPhotoBack(null); setCorrectionNote('');
    setEftReferenceNo(''); setInstallmentPlan([]); setSelectedCustomer(null); setCustomerSearch('');
  };

  const BankSelect = ({ color }: { color: string }) => (
    <Select.Root value={selectedBank} onValueChange={setSelectedBank}>
      <Select.Trigger className={`w-full flex items-center justify-between px-4 py-3 bg-card border border-border rounded-lg text-white hover:bg-accent focus:outline-none focus:ring-2 focus:ring-${color}-500`}>
        <span className="flex items-center gap-2">
          <Building className="w-4 h-4 text-muted-foreground" />
          <Select.Value placeholder={t('collection.selectBank')} />
        </span>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="bg-popover border border-border rounded-lg p-2 shadow-xl z-50">
          <Select.Viewport>
            {demoBanks.map(bank => (
              <Select.Item key={bank.id} value={bank.id}
                className="flex items-center justify-between px-4 py-2 rounded-lg text-foreground hover:bg-accent hover:text-white cursor-pointer outline-none">
                <Select.ItemText>{bank.name}</Select.ItemText>
                <Select.ItemIndicator><Check className={`w-4 h-4 text-${color}-400`} /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col md:flex-row bg-background pb-20 lg:pb-0">
      {/* Mobile customer toggle */}
      <div className="md:hidden p-3 border-b border-border bg-card flex items-center gap-3">
        <button 
          onClick={() => setShowMobileCustomerPanel(!showMobileCustomerPanel)}
          className="flex-1 flex items-center gap-3 p-3 rounded-xl flex-col lg:flex-row bg-secondary/50 border border-border text-left"
        >
          {selectedCustomer ? (
            <>
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {typeof selectedCustomer?.name === 'string' ? selectedCustomer.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{selectedCustomer.name}</p>
                <p className={`text-xs font-bold ${selectedCustomer.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {selectedCustomer.balance > 0 ? 'Borç' : 'Alacak'}: ₺{Math.abs(selectedCustomer.balance).toLocaleString()}
                </p>
              </div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">{t('collection.selectCustomer')}</span>
          )}
        </button>
        <button onClick={() => setShowHistoryPanel(!showHistoryPanel)}
          className={`p-2.5 rounded-lg border transition-colors flex-shrink-0 ${showHistoryPanel ? 'bg-purple-600 border-purple-500 text-white' : 'bg-card border-border text-muted-foreground'}`}>
          <History className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile customer panel overlay */}
      {showMobileCustomerPanel && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMobileCustomerPanel(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-[85vw] max-w-[320px] bg-card border-r border-border flex flex-col z-50">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{t('collection.selectCustomer')}</h2>
              <button onClick={() => setShowMobileCustomerPanel(false)} className="p-2 rounded-lg bg-secondary text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder={t('collection.searchCustomer')}
                  className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredCustomers.map(customer => (
                <button key={customer.id} onClick={() => { setSelectedCustomer(customer); setShowMobileCustomerPanel(false); }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${selectedCustomer?.id === customer.id ? 'bg-blue-600 border-blue-500' : 'bg-card border-border hover:bg-accent'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-white text-sm truncate flex-1">{customer.name}</p>
                    <span className={`text-xs font-bold ml-2 ${customer.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      ₺{Math.abs(customer.balance).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{customer.phone}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sol Panel - Müşteri Seçimi (Desktop only) */}
      <div className="hidden md:flex w-80 bg-card border-r border-border flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">{t('collection.selectCustomer')}</h2>
            <button onClick={() => setShowHistoryPanel(!showHistoryPanel)}
              className={`p-2 rounded-lg border transition-colors ${showHistoryPanel ? 'bg-purple-600 border-purple-500 text-white' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}>
              <History className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder={t('collection.searchCustomer')}
              className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>
        </div>

        {/* Bugünkü toplam */}
        {todayPayments.length > 0 && (
          <div className="px-4 py-2 border-b border-border bg-green-900/10">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('collection.todayTotal')}</span>
              <span className="text-sm font-bold text-green-400">₺{todayTotal.toLocaleString()}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{todayPayments.length} {t('collection.todayCollections')}</span>
          </div>
        )}

        {/* History panel or customer list */}
        {showHistoryPanel ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              <History className="w-4 h-4 text-purple-400" />
              {t('collection.recentPayments')}
            </h3>
            {todayPayments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">{t('collection.noRecentPayments')}</p>
            ) : (
              todayPayments.map(p => (
                <div key={p.id} className="p-3 rounded-lg bg-secondary/30 border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate flex-1">{p.description}</span>
                    <span className="text-sm font-bold text-green-400 ml-2">₺{p.amount?.toLocaleString()}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{p.time}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredCustomers.map(customer => (
              <button key={customer.id} onClick={() => setSelectedCustomer(customer)}
                className={`w-full text-left p-4 rounded-lg border transition-all ${selectedCustomer?.id === customer.id ? 'bg-blue-600 border-blue-500 shadow-lg' : 'bg-card border-border hover:bg-accent'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{customer.name}</p>
                    {customer.type === 'Toptancı' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">{t('checks.wholesaler')}</span>
                    )}
                  </div>
                  <span className={`text-xs font-bold ${customer.balance > 0 ? 'text-red-400' : customer.balance < 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {customer.balance > 0 ? '-' : customer.balance < 0 ? '+' : ''}₺{Math.abs(customer.balance).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{customer.phone}</p>
                {customer.balance > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">{t('collection.totalDebt')}</p>
                    <p className="text-sm font-bold text-red-400">₺{Math.abs(customer.balance).toLocaleString()}</p>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {selectedCustomer && (
          <div className="p-4 border-t border-border bg-card/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                {typeof selectedCustomer?.name === 'string' ? selectedCustomer.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{selectedCustomer.name}</p>
                <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
              </div>
            </div>
            <div className={`p-3 rounded-lg ${selectedCustomer.balance > 0 ? 'bg-red-900/20 border border-red-800' : 'bg-green-900/20 border border-green-800'}`}>
              <p className="text-xs text-muted-foreground mb-1">
                {selectedCustomer.balance > 0 ? t('collection.totalDebt') : t('checks.balance')}
              </p>
              <p className={`text-2xl font-bold ${selectedCustomer.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                ₺{Math.abs(selectedCustomer.balance).toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sağ Panel - Ödeme Formu */}
      <div className="flex-1 flex flex-col overflow-auto min-w-0">
        <div className="p-4 sm:p-6 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('collection.title')} ({t('collection.subtitle')})</h1>
              <p className="text-muted-foreground text-sm">
                {t('collection.performedBy')}: <span className="text-blue-400">{currentEmployee?.name || t('common.noData')}</span>
              </p>
            </div>
            {/* Dinamik günlük toplam göstergesi */}
            <AnimatePresence mode="wait">
              {todayTotal > 0 ? (
                <motion.div
                  key="total-chip"
                  initial={{ opacity: 0, scale: 0.85, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.85, x: 20 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 to-green-500/10 border border-emerald-500/25 shrink-0"
                >
                  <div className="relative">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <motion.div
                      animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2.2, repeat: Infinity }}
                      className="absolute inset-0 rounded-full border border-emerald-400/40"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-wider leading-none">Bugün Toplam</p>
                    <motion.p
                      key={todayTotal}
                      initial={{ y: -8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                      className="text-sm sm:text-base font-black text-emerald-400 leading-none mt-0.5"
                    >
                      ₺{todayTotal.toLocaleString('tr-TR')}
                    </motion.p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-500/60 bg-emerald-500/10 px-1.5 py-0.5 rounded-lg">
                    {todayPayments.length} işlem
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key="empty-chip"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/3 border border-white/8 text-xs text-gray-600"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Henüz tahsilat yok</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Ödeme tipi dağılımı — günlük mini göstergeler */}
        {todayPayments.length > 0 && (() => {
          const labels: Record<string, { color: string; icon: string }> = {
            'Nakit': { color: 'emerald', icon: '💵' },
            'POS': { color: 'blue', icon: '💳' },
            'Çek': { color: 'purple', icon: '📄' },
            'EFT': { color: 'cyan', icon: '🔄' },
            'Taksit': { color: 'indigo', icon: '📅' },
          };
          const byType: Record<string, number> = {};
          todayPayments.forEach(p => {
            const key = Object.keys(labels).find(k => (p.description || '').startsWith(k)) || 'Diğer';
            byType[key] = (byType[key] || 0) + (p.amount || 0);
          });
          const entries = Object.entries(byType).filter(([, v]) => v > 0);
          if (entries.length < 2) return null;
          return (
            <div className="px-4 sm:px-6 py-2.5 border-b border-border/40 bg-secondary/10 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2 min-w-max">
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider shrink-0">Dağılım:</span>
                {entries.map(([type, amount], i) => {
                  const cfg = labels[type] || { color: 'gray', icon: '•' };
                  const pct = Math.round((amount / todayTotal) * 100);
                  return (
                    <motion.div
                      key={type}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 26 }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-${cfg.color}-500/10 border border-${cfg.color}-500/20`}
                    >
                      <span className="text-xs leading-none">{cfg.icon}</span>
                      <span className={`text-[11px] font-bold text-${cfg.color}-400`}>{type}</span>
                      <span className="text-[10px] text-gray-500">₺{Math.round(amount).toLocaleString('tr-TR')}</span>
                      <span className={`text-[9px] font-black text-${cfg.color}-400/70 bg-${cfg.color}-500/15 px-1 py-0.5 rounded-md`}>{pct}%</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="flex-1 p-4 sm:p-6">
          {!selectedCustomer ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Wallet className="w-16 sm:w-20 h-16 sm:h-20 mb-4 opacity-50" />
              <p className="text-base sm:text-lg text-center">{t('collection.selectCustomerPrompt')}</p>
              <button 
                onClick={() => setShowMobileCustomerPanel(true)}
                className="mt-4 md:hidden px-6 py-3 bg-blue-600 text-white rounded-xl font-medium"
              >
                {t('collection.selectCustomer')}
              </button>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Ödeme Türü Seçimi - 6 tab */}
              <Tabs.Root value={paymentType} onValueChange={(v) => { setPaymentType(v as PaymentType); setInstallmentPlan([]); }}>
                <Tabs.List className="grid grid-cols-3 md:grid-cols-6 gap-2 p-1 bg-secondary/80 rounded-lg border border-border/30">
                  <Tabs.Trigger value="nakit" className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg data-[state=active]:bg-green-600 data-[state=active]:text-white text-muted-foreground hover:text-white transition-all text-xs">
                    <Banknote className="w-5 h-5" /><span className="font-medium">{t('collection.cash')}</span>
                  </Tabs.Trigger>
                  <Tabs.Trigger value="pos" className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white text-muted-foreground hover:text-white transition-all text-xs">
                    <CreditCard className="w-5 h-5" /><span className="font-medium">{t('collection.pos')}</span>
                  </Tabs.Trigger>
                  <Tabs.Trigger value="cek" className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white text-muted-foreground hover:text-white transition-all text-xs">
                    <FileEdit className="w-5 h-5" /><span className="font-medium">{t('collection.check')}</span>
                  </Tabs.Trigger>
                  <Tabs.Trigger value="eft" className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-muted-foreground hover:text-white transition-all text-xs">
                    <Send className="w-5 h-5" /><span className="font-medium">{t('collection.eft')}</span>
                  </Tabs.Trigger>
                  <Tabs.Trigger value="taksit" className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-muted-foreground hover:text-white transition-all text-xs">
                    <Layers className="w-5 h-5" /><span className="font-medium">{t('collection.installment')}</span>
                  </Tabs.Trigger>
                  <Tabs.Trigger value="duzeltme" className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg data-[state=active]:bg-orange-600 data-[state=active]:text-white text-muted-foreground hover:text-white transition-all text-xs">
                    <AlertCircle className="w-5 h-5" /><span className="font-medium">{t('collection.correction')}</span>
                  </Tabs.Trigger>
                </Tabs.List>

                {/* ─── NAKİT ─── */}
                <Tabs.Content value="nakit" className="mt-6">
                  <PaymentCard icon={<Banknote className="w-6 h-6 text-white" />} color="green" title={t('collection.cashCollection')} subtitle={t('collection.noExtraInfo')}>
                    <AmountInput value={amount} onChange={setAmount} color="green" balance={selectedCustomer.balance} t={t} />
                    {selectedCustomer.balance > 0 && <QuickAmountButtons balance={selectedCustomer.balance} setAmount={setAmount} t={t} />}
                    <InfoBox color="green" text={`✓ ${t('collection.noExtraInfo')}`} sub={`${t('collection.collectedBy')}: ${currentEmployee?.name}`} />
                  </PaymentCard>
                </Tabs.Content>

                {/* ─── POS ─── */}
                <Tabs.Content value="pos" className="mt-6">
                  <PaymentCard icon={<CreditCard className="w-6 h-6 text-white" />} color="blue" title={t('collection.posPayment')} subtitle={t('collection.bankRequired')}>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('collection.selectBank')} <span className="text-red-400">*</span></label>
                      <BankSelect color="blue" />
                    </div>
                    <AmountInput value={amount} onChange={setAmount} color="blue" balance={selectedCustomer.balance} t={t} />
                    {selectedCustomer.balance > 0 && <QuickAmountButtons balance={selectedCustomer.balance} setAmount={setAmount} t={t} />}
                    <InfoBox color="blue" text={`ℹ️ ${t('collection.bankPosInfo')}`} sub={`${t('collection.performedBy')}: ${currentEmployee?.name}`} />
                  </PaymentCard>
                </Tabs.Content>

                {/* ─── ÇEK ─── */}
                <Tabs.Content value="cek" className="mt-6">
                  <PaymentCard icon={<FileEdit className="w-6 h-6 text-white" />} color="purple" title={t('collection.checkCollection')} subtitle={t('collection.checkRequired')}>
                    <div className="grid grid-cols-2 gap-4">
                      <AmountInput value={amount} onChange={setAmount} color="purple" balance={selectedCustomer.balance} t={t} />
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">{t('checks.checkNumber')}</label>
                        <input type="text" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="Opsiyonel"
                          className="w-full px-4 py-3 bg-card border border-border rounded-lg text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">{t('collection.dueDate')} <span className="text-red-400">*</span></label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">{t('collection.selectBank')} <span className="text-red-400">*</span></label>
                        <BankSelect color="purple" />
                      </div>
                    </div>
                    {/* Çek Fotoğrafları */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('checks.photos')} <span className="text-red-400">*</span></label>
                      <div className="grid grid-cols-2 gap-4">
                        <PhotoUpload label={t('checks.frontPhoto')} photo={checkPhotoFront} onClear={() => setCheckPhotoFront(null)} onUpload={() => checkFrontFileRef.current?.click()} required />
                        <PhotoUpload label={t('checks.backPhoto')} photo={checkPhotoBack} onClear={() => setCheckPhotoBack(null)} onUpload={() => checkBackFileRef.current?.click()} />
                      </div>
                      <input ref={checkFrontFileRef} type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, setCheckPhotoFront, t('checks.frontPhoto'))} className="hidden" />
                      <input ref={checkBackFileRef} type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, setCheckPhotoBack, t('checks.backPhoto'))} className="hidden" />
                    </div>
                    <InfoBox color="purple" text={`⚠️ ${t('checks.frontPhotoRequired')}`} sub={t('checks.savedToChecksPage')} />
                  </PaymentCard>
                </Tabs.Content>

                {/* ─── HAVALE/EFT ─── */}
                <Tabs.Content value="eft" className="mt-6">
                  <PaymentCard icon={<Send className="w-6 h-6 text-white" />} color="cyan" title={t('collection.eftPayment')} subtitle={t('collection.eftDesc')}>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('collection.selectBank')} <span className="text-red-400">*</span></label>
                      <BankSelect color="cyan" />
                    </div>
                    <AmountInput value={amount} onChange={setAmount} color="cyan" balance={selectedCustomer.balance} t={t} />
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('collection.referenceNo')} <span className="text-red-400">*</span></label>
                      <input type="text" value={eftReferenceNo} onChange={(e) => setEftReferenceNo(e.target.value)} placeholder={t('collection.referencePlaceholder')}
                        className="w-full px-4 py-3 bg-card border border-border rounded-lg text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                    </div>
                    {selectedCustomer.balance > 0 && <QuickAmountButtons balance={selectedCustomer.balance} setAmount={setAmount} t={t} />}
                    <InfoBox color="cyan" text={`ℹ️ ${t('collection.eftDesc')}`} sub={`${t('collection.performedBy')}: ${currentEmployee?.name}`} />
                  </PaymentCard>
                </Tabs.Content>

                {/* ─── TAKSİT ─── */}
                <Tabs.Content value="taksit" className="mt-6">
                  <PaymentCard icon={<Layers className="w-6 h-6 text-white" />} color="indigo" title={t('collection.installmentPayment')} subtitle={t('collection.installmentDesc')}>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">{t('checks.totalAmount')} (₺) <span className="text-red-400">*</span></label>
                        <input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setInstallmentPlan([]); }} placeholder="0.00" step="0.01"
                          className="w-full px-4 py-3 bg-card border border-border rounded-lg text-white text-xl font-bold placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">{t('collection.installmentCount')}</label>
                        <div className="flex items-center gap-2">
                          <select value={installmentCount} onChange={e => { setInstallmentCount(Number(e.target.value)); setInstallmentPlan([]); }}
                            className="flex-1 px-4 py-3 bg-card border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            {[2, 3, 4, 5, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n} {t('collection.installment')}</option>)}
                          </select>
                          <button onClick={generateInstallmentPlan} disabled={!amount || parseFloat(amount) <= 0}
                            className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm">
                            {t('collection.createPlan')}
                          </button>
                        </div>
                      </div>
                    </div>

                    {selectedCustomer.balance > 0 && (
                      <button onClick={() => { setAmount(selectedCustomer.balance.toString()); setInstallmentPlan([]); }}
                        className="px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs rounded-lg hover:bg-indigo-600/30 transition-colors">
                        {t('checks.payFull')} (₺{selectedCustomer.balance.toLocaleString()})
                      </button>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('collection.selectBank')}</label>
                      <BankSelect color="indigo" />
                    </div>

                    {/* Taksit Planı Tablosu */}
                    {installmentPlan.length > 0 && (
                      <div className="rounded-lg border border-indigo-500/30 overflow-hidden">
                        <div className="bg-indigo-900/20 px-4 py-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-indigo-400 flex items-center gap-2">
                            <CalendarDays className="w-4 h-4" /> {t('collection.installmentPlan')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {installmentPlan.length} x ₺{installmentPlan[0]?.amount.toLocaleString()}
                          </span>
                        </div>
                        <div className="divide-y divide-border/50">
                          {installmentPlan.map(inst => (
                            <div key={inst.no} className="px-4 py-2.5 flex items-center justify-between hover:bg-accent/20">
                              <div className="flex items-center gap-3">
                                <span className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400 text-sm font-bold">{inst.no}</span>
                                <span className="text-sm text-foreground">{new Date(inst.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                              </div>
                              <span className="text-sm font-bold text-foreground">₺{inst.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                        <div className="bg-indigo-900/10 px-4 py-2.5 flex items-center justify-between">
                          <span className="text-sm font-bold text-foreground">{t('checks.totalAmount')}</span>
                          <span className="text-lg font-bold text-indigo-400">₺{installmentPlan.reduce((s, i) => s + i.amount, 0).toLocaleString()}</span>
                        </div>
                      </div>
                    )}

                    <InfoBox color="indigo" text={`ℹ️ ${t('collection.installmentDesc')}`} sub={t('checks.savedToChecksPage')} />
                  </PaymentCard>
                </Tabs.Content>

                {/* ─── DÜZELTME ─── */}
                <Tabs.Content value="duzeltme" className="mt-6">
                  <PaymentCard icon={<AlertCircle className="w-6 h-6 text-white" />} color="orange" title={t('collection.correction')} subtitle={t('collection.forCorrections')}>
                    <AmountInput value={amount} onChange={setAmount} color="orange" balance={selectedCustomer.balance} t={t} label={t('collection.correctionAmount')} />
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('collection.correctionDesc')} <span className="text-red-400">*</span></label>
                      <textarea value={correctionNote} onChange={(e) => setCorrectionNote(e.target.value)} placeholder={t('collection.correctionPlaceholder')} rows={4}
                        className="w-full px-4 py-3 bg-card border border-border rounded-lg text-white placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
                    </div>
                    <InfoBox color="orange" text={`⚠️ ${t('collection.correctionRequired')}`} sub={t('collection.correctionLogged')} />
                  </PaymentCard>
                </Tabs.Content>
              </Tabs.Root>

              {/* Tamamla Butonu */}
              <div className="flex gap-4 pt-4">
                <button onClick={handlePaymentConfirm}
                  className="flex-1 py-4 bg-green-600 hover:bg-green-700 disabled:bg-muted disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors shadow-lg text-lg flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  {t('collection.complete')}
                </button>
                <button onClick={() => { setAmount(''); setSelectedBank(''); setCheckDate(''); setCheckNumber(''); setCheckPhotoFront(null); setCheckPhotoBack(null); setCorrectionNote(''); setEftReferenceNo(''); setInstallmentPlan([]); }}
                  className="px-6 py-4 bg-card hover:bg-accent text-white font-bold rounded-lg transition-colors">
                  {t('collection.clear')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Onay Dialog */}
      <AnimatePresence>
        {showConfirmDialog && selectedCustomer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmDialog(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="modal-glass rounded-2xl p-6 w-full max-w-md border border-border" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                {t('collection.confirmPayment')}
              </h3>

              <div className="space-y-3 mb-6">
                <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
                  <Row label={t('collection.selectCustomer')} value={selectedCustomer.name} />
                  <Row label={t('collection.subtitle')} value={paymentTypeLabels[paymentType]} highlight />
                  <Row label={t('collection.collectionAmount')}
                    value={`₺${paymentType === 'taksit' ? installmentPlan.reduce((s, i) => s + i.amount, 0).toLocaleString() : parseFloat(amount || '0').toLocaleString()}`}
                    highlight />
                  {selectedBank && <Row label={t('collection.bank')} value={demoBanks.find(b => b.id === selectedBank)?.name || '-'} />}
                  {paymentType === 'cek' && checkDate && <Row label={t('collection.dueDate')} value={new Date(checkDate).toLocaleDateString('tr-TR')} />}
                  {paymentType === 'eft' && eftReferenceNo && <Row label={t('collection.referenceNo')} value={eftReferenceNo} />}
                  {paymentType === 'taksit' && <Row label={t('collection.installmentCount')} value={`${installmentPlan.length} ${t('collection.installment')}`} />}
                  <Row label={t('collection.performedBy')} value={currentEmployee?.name || '-'} />
                </div>

                <p className="text-sm text-muted-foreground text-center">{t('collection.confirmMessage')}</p>
              </div>

              <div className="flex gap-3">
                <button onClick={executePayment}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" /> {t('collection.complete')}
                </button>
                <button onClick={() => setShowConfirmDialog(false)}
                  className="px-6 py-3 bg-card hover:bg-accent text-foreground font-medium rounded-lg transition-colors border border-border">
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Yardımcı Bileşenler ─────────────────────────────

function PaymentCard({ children, icon, color, title, subtitle }: { children: React.ReactNode; icon: React.ReactNode; color: string; title: string; subtitle: string }) {
  const bgMap: Record<string, string> = {
    green: 'bg-green-600', blue: 'bg-blue-600', purple: 'bg-purple-600',
    cyan: 'bg-cyan-600', indigo: 'bg-indigo-600', orange: 'bg-orange-600',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card-premium rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-12 h-12 rounded-lg ${bgMap[color] || 'bg-gray-600'} flex items-center justify-center`}>{icon}</div>
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function AmountInput({ value, onChange, color, balance, t, label }: { value: string; onChange: (v: string) => void; color: string; balance: number; t: (k: string) => string; label?: string }) {
  const ringMap: Record<string, string> = {
    green: 'focus:ring-green-500', blue: 'focus:ring-blue-500', purple: 'focus:ring-purple-500',
    cyan: 'focus:ring-cyan-500', indigo: 'focus:ring-indigo-500', orange: 'focus:ring-orange-500',
  };
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">{label || t('collection.collectionAmount')} (₺)</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" step="0.01"
        className={`w-full px-4 py-3 bg-card border border-border rounded-lg text-white text-xl font-bold placeholder-muted-foreground focus:outline-none focus:ring-2 ${ringMap[color] || 'focus:ring-gray-500'}`} />
      {balance > 0 && <p className="text-xs text-muted-foreground mt-1">{t('checks.partialPaymentHint')}: ₺{balance.toLocaleString()}</p>}
    </div>
  );
}

function QuickAmountButtons({ balance, setAmount, t }: { balance: number; setAmount: (v: string) => void; t: (k: string) => string }) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button onClick={() => setAmount(balance.toString())}
        className="px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-400 text-xs rounded-lg hover:bg-green-600/30 transition-colors">
        {t('checks.payFull')} (₺{balance.toLocaleString()})
      </button>
      <button onClick={() => setAmount((balance / 2).toFixed(2))}
        className="px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs rounded-lg hover:bg-blue-600/30 transition-colors">
        %50 (₺{(balance / 2).toLocaleString()})
      </button>
      <button onClick={() => setAmount((balance / 4).toFixed(2))}
        className="px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-400 text-xs rounded-lg hover:bg-purple-600/30 transition-colors">
        %25 (₺{(balance / 4).toLocaleString()})
      </button>
    </div>
  );
}

function InfoBox({ color, text, sub }: { color: string; text: string; sub: string }) {
  const styleMap: Record<string, { bg: string; border: string; textColor: string }> = {
    green: { bg: 'bg-green-900/20', border: 'border-green-800', textColor: 'text-green-400' },
    blue: { bg: 'bg-blue-900/20', border: 'border-blue-800', textColor: 'text-blue-400' },
    purple: { bg: 'bg-purple-900/20', border: 'border-purple-800', textColor: 'text-purple-400' },
    cyan: { bg: 'bg-cyan-900/20', border: 'border-cyan-800', textColor: 'text-cyan-400' },
    indigo: { bg: 'bg-indigo-900/20', border: 'border-indigo-800', textColor: 'text-indigo-400' },
    orange: { bg: 'bg-orange-900/20', border: 'border-orange-800', textColor: 'text-orange-400' },
  };
  const s = styleMap[color] || styleMap.green;
  return (
    <div className={`p-4 ${s.bg} border ${s.border} rounded-lg space-y-2`}>
      <p className={`text-sm ${s.textColor}`}>{text}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function PhotoUpload({ label, photo, onClear, onUpload, required }: { label: string; photo: string | null; onClear: () => void; onUpload: () => void; required?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
        <ImageIcon className="w-3 h-3" /> {label} {required && <span className="text-red-400">*</span>}
      </p>
      {photo ? (
        <div className="relative">
          <img src={photo} alt={label} className="w-full h-36 object-cover rounded-lg border border-border" />
          <button onClick={onClear} className="absolute top-2 right-2 p-1.5 bg-red-600 rounded-full hover:bg-red-700 transition-colors">
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <button onClick={onUpload}
          className="w-full h-36 border-2 border-dashed border-border rounded-lg hover:border-purple-600 transition-colors flex flex-col items-center justify-center gap-2 group">
          <Camera className="w-8 h-8 text-muted-foreground group-hover:text-purple-400 transition-colors" />
          <span className="text-xs text-muted-foreground group-hover:text-purple-400 transition-colors">{label}</span>
        </button>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-green-400 font-bold' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}