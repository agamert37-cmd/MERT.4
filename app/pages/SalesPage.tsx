import React, { useState, useEffect, useMemo } from 'react';
import { useGlobalTableData } from '../contexts/GlobalTableSyncContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { logActivity } from '../utils/activityLogger';
import {
  FileText,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Receipt,
  Plus,
  X,
  Search,
  Camera,
  Save,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Banknote,
  Wallet,
  Building,
  Package,
  Hash,
  Calendar,
  Clock,
  BarChart3,
  Eye,
  Target,
  AlertTriangle,
  Truck,
  ChevronRight,
  Tag,
  CircleDollarSign,
  Upload,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';
import { DatePickerInput } from '../components/DatePickerInput';
import { NumberInput } from '../components/NumberInput';
import { CompactFormInput } from '../components/CompactFormInput';
import { useTableSync } from '../hooks/useTableSync';
import { useAuth } from '../contexts/AuthContext';
import { cariToDb, cariFromDb } from './CariPage';
import { productToDb, productFromDb } from './StokPage';
import { PaymentSelector } from '../components/PaymentSelector';
import { saveCek, type CekData } from './CeklerPage';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';

// Helper: Bugünün gün sonu kapatılmış mı kontrol et
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

// Fiş Modları
type FisMode = 'satis' | 'alis' | 'gider';

// Ödeme Yöntemleri
type PaymentMethod = 'nakit' | 'kredi-karti' | 'havale' | 'cek';

// Cari Interface
interface Cari {
  id: string;
  type: 'Müşteri' | 'Toptancı';
  companyName: string;
  contactPerson: string;
  phone: string;
  balance: number;
  transactions: number;
  email?: string;
  address?: string;
  taxNumber?: string;
  taxOffice?: string;
  transactionHistory?: any[];
}

// Ürün Kalemi
interface ProductItem {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  type: 'satis' | 'alis' | 'iade'; // İşlem Tipi
}

// Ödeme Bilgisi
interface PaymentInfo {
  method: PaymentMethod;
  amount: number;
  // Kredi Kartı için
  bankName?: string;
  slipPhoto?: string;
  // Havale için
  receiverEmployee?: string;
  receiverBank?: string;
  receiptPhoto?: string;
  // Çek için
  dueDate?: string;
  checkPhoto?: string;
}

export function SalesPage() {
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { emit } = useModuleBus();
  
  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canAdd, canDelete } = getPagePermissions(user, currentEmployee, 'satis');
  const sec = usePageSecurity('satis');

  const [isNewFisModalOpen, setIsNewFisModalOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<FisMode | null>(null);

  // Gün sonu kapatma durumu
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

  // Satış / Alış Fişi State'leri
  const [selectedEmployee, setSelectedEmployee] = useState(currentEmployee?.id || '');
  const [selectedCari, setSelectedCari] = useState<Cari | null>(null);
  const [productItems, setProductItems] = useState<ProductItem[]>([]);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [fisPhoto, setFisPhoto] = useState<string>('');
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [fisDate, setFisDate] = useState<Date | null>(new Date());
  
  // Modal Step
  const [currentStep, setCurrentStep] = useState<'mode' | 'employee' | 'cari' | 'products' | 'payment' | 'gider-details'>('mode');
  
  // Gider Fişi State'leri
  const [giderCategory, setGiderCategory] = useState('');
  const [giderAmount, setGiderAmount] = useState(0);
  const [giderDescription, setGiderDescription] = useState('');
  const [giderPhoto, setGiderPhoto] = useState('');
  const [giderEmployee, setGiderEmployee] = useState('');
  const [giderVehicle, setGiderVehicle] = useState('');

  // ─── Alış Fatura Takibi ─────────────────────────────────────────────────
  const [alisHasInvoice, setAlisHasInvoice] = useState(false);
  const [alisKdvRate, setAlisKdvRate] = useState(20);
  const [alisInvoicePhoto, setAlisInvoicePhoto] = useState('');
  const [alisInvoiceNo, setAlisInvoiceNo] = useState('');

  // ─── SENKRONİZASYON (KV STORE) ────────────────────────────────────────────────
  const { data: syncCariList, updateItem: updateCariSync, addItem: addCariSync } = useTableSync<any>({
    tableName: 'cari_hesaplar',
    storageKey: StorageKey.CARI_DATA,
    toDb: cariToDb,
    fromDb: cariFromDb,
  });

  const { data: syncFisler, addItem: addFisSync } = useTableSync<any>({
    tableName: 'fisler',
    storageKey: StorageKey.FISLER,
    // Fişler için spesifik bir mapper yok
  });

  const { data: syncStokList, updateItem: updateStokSync } = useTableSync<any>({
    tableName: 'urunler',
    storageKey: StorageKey.STOK_DATA,
    toDb: productToDb,
    fromDb: productFromDb,
  });
  const { data: syncKasaList, addItem: addKasaSync } = useTableSync<any>({
    tableName: 'kasa_islemleri',
    storageKey: StorageKey.KASA_DATA,
  });
  // ────────────────────────────────��────────────────────────────────────────────

  // Storage'dan verileri yükle — reaktif state ile
  const banks = useGlobalTableData<any>('bankalar');
  const personelList = useGlobalTableData<any>('personeller');
  const vehicleList = useGlobalTableData<any>('araclar');
  const cariList = syncCariList;
  const fisler = syncFisler;

  // Cari arama
  const [cariSearchTerm, setCariSearchTerm] = useState('');
  const [isAddingNewCari, setIsAddingNewCari] = useState(false);
  
  // Yeni cari form
  const [newCariForm, setNewCariForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    taxNumber: '',
    taxOffice: '',
    address: ''
  });

  // Ürün ekleme
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [productUnitPrice, setProductUnitPrice] = useState(0);

  // Storage'dan ürünleri yükle
  const [baseProductList, setBaseProductList] = useState<any[]>(() => getFromStorage<any[]>(StorageKey.STOK_DATA) || []);

  // Modal açıldığında baseProductList güncelle
  useEffect(() => {
    if (isNewFisModalOpen) {
      setBaseProductList(getFromStorage<any[]>(StorageKey.STOK_DATA) || []);
    }
  }, [isNewFisModalOpen]);

  // Müşteri özelinde ürünleri ve fiyatlar�� hesapla (Satış algoritması)
  const getCustomerSpecificProducts = () => {
    if (!selectedCari) return baseProductList;

    const customerFisler = fisler.filter(f => (f.cariId === selectedCari.id || f.cari_id === selectedCari.id) && (f.mode === 'satis' || f.mode === 'alis'));
    const productStats: Record<string, { lastPrice: number, count: number, lastDate: number }> = {};
    
    customerFisler.forEach(fis => {
      if (fis.items) {
        fis.items.forEach((item: any) => {
          if (item.type === 'satis') {
            if (!productStats[item.productName]) {
              productStats[item.productName] = { lastPrice: item.unitPrice, count: 0, lastDate: new Date(fis.date).getTime() };
            }
            productStats[item.productName].count += 1;
            const fisTime = new Date(fis.date).getTime();
            if (fisTime > productStats[item.productName].lastDate) {
              productStats[item.productName].lastPrice = item.unitPrice;
              productStats[item.productName].lastDate = fisTime;
            }
          }
        });
      }
    });

    const customizedList = baseProductList.map(p => {
      const stats = productStats[p.name];
      return {
        ...p,
        price: stats ? stats.lastPrice : 0, // Son alınan fiyat veya 0
        buyCount: stats ? stats.count : 0,
        isFrequent: !!stats
      };
    });

    // Çok alınanlar (buyCount) üstte olacak şekilde sırala
    return customizedList.sort((a, b) => b.buyCount - a.buyCount);
  };

  const productList = getCustomerSpecificProducts();

  // ─── FİŞ FİLTRELEME & İSTATİSTİK ─────────────────────────────────────────
  const [fisFilterTab, setFisFilterTab] = useState<'all' | 'satis' | 'alis' | 'gider'>('all');
  const [fisSearchTerm, setFisSearchTerm] = useState('');
  const [showStats, setShowStats] = useState(true);

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayFisler = fisler.filter(f => f.date && f.date.startsWith(today));
    const satisCount = todayFisler.filter(f => f.mode === 'satis').length;
    const alisCount = todayFisler.filter(f => f.mode === 'alis').length;
    const giderCount = todayFisler.filter(f => f.mode === 'gider').length;
    const satisTotal = todayFisler.filter(f => f.mode === 'satis').reduce((s, f) => s + (f.total || 0), 0);
    const alisTotal = todayFisler.filter(f => f.mode === 'alis').reduce((s, f) => s + (f.total || 0), 0);
    const giderTotal = todayFisler.filter(f => f.mode === 'gider').reduce((s, f) => s + (f.amount || 0), 0);
    const totalRevenue = satisTotal - alisTotal - giderTotal;
    return { satisCount, alisCount, giderCount, satisTotal, alisTotal, giderTotal, totalRevenue, totalCount: todayFisler.length };
  }, [fisler]);

  const weekStats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekFisler = fisler.filter(f => f.date && new Date(f.date) >= weekAgo);
    const satisTotal = weekFisler.filter(f => f.mode === 'satis').reduce((s, f) => s + (f.total || 0), 0);
    const alisTotal = weekFisler.filter(f => f.mode === 'alis').reduce((s, f) => s + (f.total || 0), 0);
    const giderTotal = weekFisler.filter(f => f.mode === 'gider').reduce((s, f) => s + (f.amount || 0), 0);
    return { satisTotal, alisTotal, giderTotal, count: weekFisler.length };
  }, [fisler]);

  const filteredFisler = useMemo(() => {
    let result = fisler;
    if (fisFilterTab !== 'all') {
      result = result.filter(f => f.mode === fisFilterTab);
    }
    if (fisSearchTerm.trim()) {
      const term = fisSearchTerm.toLowerCase();
      result = result.filter(f =>
        (f.cari?.companyName || '').toLowerCase().includes(term) ||
        (f.category || '').toLowerCase().includes(term) ||
        (f.employeeName || '').toLowerCase().includes(term) ||
        (f.id || '').toLowerCase().includes(term) ||
        (f.description || '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [fisler, fisFilterTab, fisSearchTerm]);

  // Fiş Modları
  const fisModes = [
    {
      id: 'satis' as FisMode,
      title: t('salesPage.saleReceipt'),
      icon: ShoppingCart,
      color: 'from-green-600 to-green-700',
      description: t('salesPage.saleDesc')
    },
    {
      id: 'alis' as FisMode,
      title: t('salesPage.purchaseReceipt'),
      icon: Package,
      color: 'from-blue-600 to-blue-700',
      description: t('salesPage.purchaseDesc')
    },
    {
      id: 'gider' as FisMode,
      title: t('salesPage.expenseReceipt'),
      icon: FileText,
      color: 'from-red-600 to-red-700',
      description: t('salesPage.expenseDesc')
    }
  ];

  // Gider Kategorileri
  const giderCategoryKeys: Record<string, string> = {
    'Personel Maaşı': 'personnelSalary',
    'Kira': 'rent',
    'Elektrik': 'electricity',
    'Su': 'water',
    'Doğalgaz': 'naturalGas',
    'İnternet': 'internet',
    'Telefon': 'telephone',
    'Yakıt': 'fuel',
    'Bakım-Onarım': 'maintenance',
    'Yemek': 'food',
    'Temizlik': 'cleaning',
    'Vergi & Harç': 'taxFee',
    'Sigorta': 'insurance',
    'Reklam & Pazarlama': 'adMarketing',
    'Kırtasiye': 'stationery',
    'Diğer Giderler': 'otherExpenses',
  };
  const giderCategories = Object.keys(giderCategoryKeys);
  const getGiderLabel = (cat: string) => t(`salesPage.expenseCat.${giderCategoryKeys[cat] || 'otherExpenses'}`);

  // Cari filtreleme (en son işlem yapılanlar üstte)
  const filteredCariList = cariList
    .filter(c => {
      const isAlisGroup = ['alis'].includes(selectedMode as string);
      const typeMatch = isAlisGroup ? c.type === 'Toptancı' : c.type === 'Müşteri';
      const searchMatch = (c?.companyName || '').toLowerCase().includes((cariSearchTerm || '').toLowerCase()) ||
                          (c?.contactPerson || '').toLowerCase().includes((cariSearchTerm || '').toLowerCase());
      return typeMatch && searchMatch;
    })
    .sort((a, b) => (b?.transactions || 0) - (a?.transactions || 0));

  // Ürün filtreleme
  const filteredProductList = productList.filter(p =>
    (p?.name || '').toLowerCase().includes((productSearchTerm || '').toLowerCase())
  );

  // Ürün ekleme (SATIŞ/ALIŞ)
  const handleAddProductAsSale = () => {
    if (!selectedProduct) return;
    
    const newItem: ProductItem = {
      id: Date.now().toString(),
      productName: selectedProduct.name,
      quantity: productQuantity,
      unit: selectedProduct.unit,
      unitPrice: productUnitPrice,
      totalPrice: productQuantity * productUnitPrice,
      type: selectedMode?.startsWith('alis') ? 'alis' : 'satis'
    };
    
    setProductItems([...productItems, newItem]);
    setSelectedProduct(null);
    setProductQuantity(1);
    setProductUnitPrice(0);
    setProductSearchTerm('');
    toast.success(`Ürün ${selectedMode?.startsWith('alis') ? 'alış' : 'satış'} olarak eklendi!`);
  };

  // Ürün ekleme (İADE)
  const handleAddProductAsReturn = () => {
    if (!selectedProduct) return;
    
    const newItem: ProductItem = {
      id: Date.now().toString(),
      productName: selectedProduct.name,
      quantity: -productQuantity, // Negatif miktar
      unit: selectedProduct.unit,
      unitPrice: productUnitPrice,
      totalPrice: -productQuantity * productUnitPrice, // Negatif tutar
      type: 'iade'
    };
    
    setProductItems([...productItems, newItem]);
    setSelectedProduct(null);
    setProductQuantity(1);
    setProductUnitPrice(0);
    setProductSearchTerm('');
    toast.success(t('salesPage.productReturnAdded'), {
      description: `${selectedMode?.startsWith('alis') ? t('salesPage.purchaseReturn') : t('salesPage.saleReturn')} ${t('salesPage.transactionSaved')}`
    });
  };

  // Ürün silme
  const handleRemoveProduct = (id: string) => {
    setProductItems(productItems.filter(item => item.id !== id));
    toast.info(t('salesPage.productRemoved'));
  };

  // Toplam tutar hesaplama
  const calculateTotal = () => {
    return productItems.reduce((sum, item) => {
      // totalPrice zaten iade için negatif, normal için pozitif
      // Mutlak değer kullanarak doğru hesap yapıyoruz
      const absTotal = Math.abs(item.totalPrice);
      if (item.type === 'iade') {
        return sum - absTotal;
      }
      return sum + absTotal;
    }, 0);
  };

  // Yeni cari ekleme
  const handleAddNewCari = () => {
    if (!newCariForm.companyName || !newCariForm.contactPerson || !newCariForm.phone) {
      toast.error(t('salesPage.requiredFields'));
      return;
    }
    if (!newCariForm.taxNumber) {
      toast.error(t('salesPage.taxNumberRequired'));
      return;
    }
    if (!newCariForm.taxOffice) {
      toast.error(t('salesPage.taxOfficeRequired'));
      return;
    }

    const newCari: Cari = {
      id: `cari-${Date.now()}`,
      type: selectedMode?.startsWith('alis') ? 'Toptancı' : 'Müşteri',
      companyName: newCariForm.companyName,
      contactPerson: newCariForm.contactPerson,
      phone: newCariForm.phone,
      email: newCariForm.email,
      taxNumber: newCariForm.taxNumber,
      taxOffice: newCariForm.taxOffice,
      address: newCariForm.address,
      balance: 0,
      transactions: 0
    };

    // KV STORE SENKRONİZASYONU İLE EKLE
    addCariSync(newCari);
    setSelectedCari(newCari);
    setIsAddingNewCari(false);
    setNewCariForm({
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      taxNumber: '',
      taxOffice: '',
      address: '',
    });
    toast.success(t('salesPage.newCustomerAdded'));
    setCurrentStep('products');
  };

  const handleModeSelect = (mode: FisMode) => {
    setSelectedMode(mode);
    if (mode === 'gider') {
      setCurrentStep('gider-details');
    } else {
      setCurrentStep('employee');
    }
  };

  const handleReset = () => {
    setSelectedMode(null);
    setCurrentStep('mode');
    setSelectedEmployee(currentEmployee?.id || '');
    setSelectedCari(null);
    setProductItems([]);
    setPaymentInfo(null);
    setFisPhoto('');
    setFisDate(new Date());
    setCariSearchTerm('');
    setProductSearchTerm('');
    setGiderCategory('');
    setGiderAmount(0);
    setGiderDescription('');
    setGiderPhoto('');
    setAlisHasInvoice(false);
    setAlisKdvRate(20);
    setAlisInvoicePhoto('');
    setAlisInvoiceNo('');
  };

  // Fotoğraf yükleme helper
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (photo: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        callback(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-28 sm:pb-6">
      {/* Gün Sonu Kapalı Uyarısı */}
      {isDayClosed && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-900/20 border border-red-700/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3"
        >
          <div className="p-2 sm:p-2.5 bg-red-600/20 rounded-lg sm:rounded-xl shrink-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-red-400 font-bold text-sm sm:text-base">{t('salesPage.dayEndClosed')}</p>
            <p className="text-red-400/70 text-xs sm:text-sm">{t('salesPage.dayEndClosedDesc')}</p>
          </div>
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-600 to-blue-700 flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
            <ShoppingCart className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-white tracking-tight truncate">{t('salesPage.title')}</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 truncate">{t('salesPage.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowStats(!showStats)}
            className="hidden sm:flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-sm font-medium text-gray-300"
          >
            <BarChart3 className="w-4 h-4" />
            {showStats ? 'Gizle' : 'İstatistik'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!canAdd) {
                sec.logUnauthorized('add', 'Kullanıcı yeni fiş/fatura oluşturmaya çalıştı ancak yetkisi yoktu.');
                return;
              }
              if (isDayClosed) {
                toast.error(t('salesPage.dayEndClosedDesc'));
                return;
              }
              if (!sec.checkRate('add')) return;
              handleReset();
              setIsNewFisModalOpen(true);
            }}
            disabled={isDayClosed}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 sm:gap-2.5 px-5 sm:px-6 py-3 font-bold rounded-xl shadow-lg transition-all text-sm sm:text-base ${
              isDayClosed
                ? 'bg-secondary text-muted-foreground cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/20'
            }`}
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            {t('sales.newReceipt')}
          </motion.button>
        </div>
      </motion.div>

      {/* ─── Premium İstatistik Kartları ─── */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Bugünün Özeti */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
              {[
                { label: t('salesPage.sale'), total: todayStats.satisTotal, count: todayStats.satisCount, icon: TrendingUp, color: 'emerald', prefix: '+' },
                { label: t('salesPage.purchase'), total: todayStats.alisTotal, count: todayStats.alisCount, icon: Package, color: 'blue', prefix: '-' },
                { label: t('salesPage.expense'), total: todayStats.giderTotal, count: todayStats.giderCount, icon: TrendingDown, color: 'red', prefix: '-' },
                { label: 'Net', total: Math.abs(todayStats.totalRevenue), count: todayStats.totalCount, icon: Target, color: todayStats.totalRevenue >= 0 ? 'emerald' : 'red', prefix: todayStats.totalRevenue >= 0 ? '+' : '-', isNet: true },
              ].map((stat, idx) => {
                const Icon = stat.icon;
                const colors: Record<string, { iconBg: string; iconText: string; hoverBorder: string; glow: string; valueText: string }> = {
                  emerald: { iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-400', hoverBorder: 'hover:border-emerald-500/30', glow: 'bg-emerald-500/5', valueText: 'text-emerald-400' },
                  blue: { iconBg: 'bg-blue-500/15', iconText: 'text-blue-400', hoverBorder: 'hover:border-blue-500/30', glow: 'bg-blue-500/5', valueText: 'text-blue-400' },
                  red: { iconBg: 'bg-red-500/15', iconText: 'text-red-400', hoverBorder: 'hover:border-red-500/30', glow: 'bg-red-500/5', valueText: 'text-red-400' },
                };
                const c = colors[stat.color] || colors.emerald;
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06 }}
                    className={`relative overflow-hidden p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] ${c.hoverBorder} transition-all ${stat.isNet ? 'ring-1 ' + (todayStats.totalRevenue >= 0 ? 'ring-emerald-500/10' : 'ring-red-500/10') : ''}`}
                  >
                    <div className={`absolute -top-4 -right-4 w-16 h-16 ${c.glow} rounded-full blur-2xl`} />
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg ${c.iconBg} flex items-center justify-center`}>
                        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${c.iconText}`} />
                      </div>
                      <span className="text-[10px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wider">{stat.label}</span>
                    </div>
                    <p className={`text-base sm:text-xl lg:text-2xl font-black tracking-tight ${stat.isNet ? c.valueText : 'text-white'}`}>
                      {stat.prefix}₺{stat.total.toLocaleString('tr-TR')}
                    </p>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
                      <span className={`${c.valueText} font-bold`}>{stat.count}</span> {stat.isNet ? 'toplam işlem' : 'fiş bugün'}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            {/* Haftalık Mini Bar */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="flex items-center gap-2 sm:gap-4 p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-x-auto scrollbar-hide"
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-[10px] sm:text-xs text-gray-500 font-semibold">7 Gün:</span>
              </div>
              <div className="flex items-center gap-3 sm:gap-5 flex-1 overflow-x-auto">
                {[
                  { color: 'bg-emerald-400', text: 'text-emerald-400', value: weekStats.satisTotal },
                  { color: 'bg-blue-400', text: 'text-blue-400', value: weekStats.alisTotal },
                  { color: 'bg-red-400', text: 'text-red-400', value: weekStats.giderTotal },
                ].map((w, i) => (
                  <div key={i} className="flex items-center gap-1.5 shrink-0">
                    <div className={`w-2 h-2 rounded-full ${w.color}`} />
                    <span className="text-[10px] sm:text-xs text-gray-400">₺<span className={`${w.text} font-bold`}>{w.value.toLocaleString('tr-TR')}</span></span>
                  </div>
                ))}
              </div>
              <span className="text-[10px] sm:text-xs text-gray-600 font-mono shrink-0">{weekStats.count} fiş</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Hızlı İşlem Butonları (Mobil) ─── */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        {[
          { mode: 'satis' as FisMode, label: t('salesPage.sale'), icon: ShoppingCart, gradient: 'from-emerald-600 to-emerald-700', shadow: 'shadow-emerald-600/20', desc: 'Müşteriye satış' },
          { mode: 'alis' as FisMode, label: t('salesPage.purchase'), icon: Package, gradient: 'from-blue-600 to-blue-700', shadow: 'shadow-blue-600/20', desc: 'Toptancıdan alış' },
          { mode: 'gider' as FisMode, label: t('salesPage.expense'), icon: TrendingDown, gradient: 'from-red-600 to-red-700', shadow: 'shadow-red-600/20', desc: 'Gider kaydı' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.mode}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (!canAdd) {
                  toast.error('İşlem yapma yetkiniz bulunmamaktadır.');
                  return;
                }
                if (isDayClosed) {
                  toast.error(t('salesPage.dayEndClosedDesc'));
                  return;
                }
                handleReset();
                setIsNewFisModalOpen(true);
                setTimeout(() => handleModeSelect(item.mode), 100);
              }}
              disabled={isDayClosed}
              className={`flex flex-col items-center gap-1 p-3.5 rounded-2xl bg-gradient-to-br ${item.gradient} text-white shadow-lg ${item.shadow} ${isDayClosed ? 'opacity-40' : ''} active:opacity-80 transition-all`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-bold">{item.label}</span>
              <span className="text-[9px] text-white/60 font-medium">{item.desc}</span>
            </motion.button>
          );
        })}
      </div>

      {/* New Fiş Modal */}
      <Dialog.Root open={isNewFisModalOpen} onOpenChange={setIsNewFisModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-md z-50" />
          <Dialog.Content 
            className="fixed inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-[#111] sm:border sm:border-white/10 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-8 w-full sm:w-[95vw] sm:max-w-5xl h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto z-50 shadow-2xl sm:rounded-3xl overscroll-contain"
            aria-describedby={undefined}
          >
            
            {/* Mode Selection */}
            {currentStep === 'mode' && (
              <>
                <Dialog.Title className="text-xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">
                  {t('sales.newReceipt')}
                </Dialog.Title>
                <Dialog.Description className="text-muted-foreground text-sm sm:text-base mb-5 sm:mb-8">
                  {t('salesPage.selectMode')}
                </Dialog.Description>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 mb-6">
                  {fisModes.map((mode, index) => {
                    const Icon = mode.icon;
                    return (
                      <motion.button
                        key={mode.id}
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ delay: index * 0.1, type: "spring", stiffness: 300, damping: 20 }}
                        onClick={() => handleModeSelect(mode.id)}
                        className="relative group"
                      >
                        <div className="p-5 sm:p-8 rounded-2xl border-2 border-border/40 hover:border-blue-500/50 active:border-blue-500/30 bg-secondary/30 hover:bg-secondary/50 active:bg-secondary/60 transition-all duration-300 backdrop-blur-sm flex sm:flex-col items-center sm:items-center gap-4 sm:gap-0">
                          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${mode.color} flex items-center justify-center sm:mb-4 shadow-lg transition-transform group-hover:scale-105 shrink-0`}>
                            <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                          </div>
                          <div className="text-left sm:text-center flex-1 min-w-0">
                            <h3 className="text-lg sm:text-xl font-bold text-white mb-0.5 sm:mb-2">{mode.title}</h3>
                            <p className="text-muted-foreground text-xs sm:text-sm line-clamp-2">{mode.description}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-600 sm:hidden shrink-0" />
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                <Dialog.Close asChild>
                  <button className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2.5 hover:bg-secondary active:bg-secondary/80 rounded-xl transition-colors z-10">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </Dialog.Close>
              </>
            )}

            {/* Employee Selection */}
            {currentStep === 'employee' && (['satis', 'alis'].includes(selectedMode || '')) && (
              <>
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <button
                    onClick={() => setCurrentStep('mode')}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                  </button>
                  <div className="min-w-0">
                    <Dialog.Title className="text-lg sm:text-2xl font-bold text-white">
                      {t('sales.selectEmployee')}
                    </Dialog.Title>
                    <Dialog.Description className="text-muted-foreground text-xs sm:text-base">
                      {t('sales.selectEmployeeSub')}
                    </Dialog.Description>
                  </div>
                </div>

                <div className="card-premium rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
                  <p className="text-muted-foreground text-xs sm:text-sm mb-3 sm:mb-4">{t('sales.currentUser')}</p>
                  <div className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-blue-600/10 border border-blue-600/20 rounded-xl">
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm sm:text-base truncate">{currentEmployee?.name}</p>
                      <p className="text-blue-400 text-xs sm:text-sm">{t('sales.defaultSelected')}</p>
                    </div>
                    <button className="px-3 sm:px-4 py-2 bg-secondary/60 hover:bg-accent text-white rounded-lg sm:rounded-xl transition-colors text-xs sm:text-sm shrink-0">
                      {t('salesPage.change')}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setCurrentStep('cari')}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-3.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 text-sm sm:text-base"
                  >
                    {t('salesPage.continue')}
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  </motion.button>
                </div>
              </>
            )}

            {/* Cari Selection */}
            {currentStep === 'cari' && (['satis', 'alis'].includes(selectedMode || '')) && !isAddingNewCari && (
              <>
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <button
                    onClick={() => setCurrentStep('employee')}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                  </button>
                  <div className="min-w-0">
                    <Dialog.Title className="text-lg sm:text-2xl font-bold text-white">
                      {selectedMode?.startsWith('alis') ? t('salesPage.supplierSelect') : t('salesPage.customerSelect')}
                    </Dialog.Title>
                    <Dialog.Description className="text-muted-foreground text-xs sm:text-base">
                      {selectedMode?.startsWith('alis') ? t('salesPage.supplierSelectDesc') : t('salesPage.customerSelectDesc')}
                    </Dialog.Description>
                  </div>
                </div>

                <div className="card-premium rounded-xl sm:rounded-2xl p-3 sm:p-6 mb-4 sm:mb-6">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <div className="flex-1 relative group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/70 group-focus-within:text-blue-400 transition-colors" />
                      <input
                        type="text"
                        value={cariSearchTerm}
                        onChange={(e) => setCariSearchTerm(e.target.value)}
                        placeholder={selectedMode?.startsWith('alis') ? t('salesPage.searchSupplier') : t('salesPage.searchCustomer')}
                        className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-3 bg-secondary/50 border border-border/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                      />
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setIsAddingNewCari(true)}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl transition-all shadow-lg shadow-emerald-600/20 text-sm sm:text-base shrink-0"
                    >
                      <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="sm:inline">{selectedMode?.startsWith('alis') ? t('salesPage.newSupplier') : t('sales.newCustomer')}</span>
                    </motion.button>
                  </div>

                  {cariSearchTerm === '' && (
                    <p className="text-muted-foreground/70 text-sm mb-3">
                      💡 {t('salesPage.mostActiveCustomersFirst')}
                    </p>
                  )}

                  <div className="space-y-2 max-h-[50vh] sm:max-h-96 overflow-y-auto">
                    {filteredCariList.length > 0 ? (
                      filteredCariList.map((cari, index) => (
                        <motion.div
                          key={`${cari.id}-${index}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="p-3 sm:p-4 bg-secondary/30 border border-border/30 hover:border-blue-500/40 hover:bg-secondary/50 rounded-xl cursor-pointer transition-all duration-200 active:bg-secondary/60"
                          onClick={() => {
                            setSelectedCari(cari);
                            setCurrentStep('products');
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-white font-bold text-sm sm:text-base truncate">{cari.companyName}</p>
                              <p className="text-muted-foreground text-xs sm:text-sm truncate">{cari.contactPerson} • {cari.phone}</p>
                              <p className="text-muted-foreground/70 text-[11px] sm:text-xs mt-0.5 sm:mt-1">
                                {cari.transactions} işlem • Bakiye: ₺{(cari.balance || 0).toLocaleString()}
                              </p>
                            </div>
                            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/70 shrink-0" />
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">{selectedMode?.startsWith('alis') ? t('salesPage.supplierNotFound') : t('salesPage.customerNotFound')}</p>
                        <button
                          onClick={() => setIsAddingNewCari(true)}
                          className="mt-4 text-blue-400 hover:text-blue-300"
                        >
                          {selectedMode?.startsWith('alis') ? t('salesPage.addNewSupplier') : t('salesPage.addNewCustomer')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Yeni Cari Form */}
            {currentStep === 'cari' && isAddingNewCari && (
              <>
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <button
                    onClick={() => setIsAddingNewCari(false)}
                    className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                  </button>
                  <div className="min-w-0">
                    <Dialog.Title className="text-lg sm:text-2xl font-bold text-white">
                      {selectedMode?.startsWith('alis') ? t('salesPage.addNewSupplier') : t('salesPage.addNewCustomer')}
                    </Dialog.Title>
                    <Dialog.Description className="text-muted-foreground text-xs sm:text-base">
                      {t('salesPage.fillAllFields')}
                    </Dialog.Description>
                  </div>
                </div>

                <div className="card-premium rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2 text-foreground/80 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
                        <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {t('sales.companyName')} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={newCariForm.companyName}
                        onChange={(e) => setNewCariForm({ ...newCariForm, companyName: e.target.value })}
                        placeholder="Örn: Anadolu Restoran"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                      />
                    </div>
                    
                    <div>
                      <label className="flex items-center gap-2 text-muted-foreground text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
                        <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {t('sales.contactPerson')} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={newCariForm.contactPerson}
                        onChange={(e) => setNewCariForm({ ...newCariForm, contactPerson: e.target.value })}
                        placeholder="Örn: Ahmet Yılmaz"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-muted-foreground text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
                        <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {t('common.phone')} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="tel"
                        value={newCariForm.phone}
                        onChange={(e) => setNewCariForm({ ...newCariForm, phone: e.target.value })}
                        placeholder="0532 xxx xx xx"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-muted-foreground text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
                        <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {t('common.email')}
                      </label>
                      <input
                        type="email"
                        value={newCariForm.email}
                        onChange={(e) => setNewCariForm({ ...newCariForm, email: e.target.value })}
                        placeholder="ornek@email.com"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-muted-foreground text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
                        <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {t('sales.taxNumber')}
                      </label>
                      <input
                        type="text"
                        value={newCariForm.taxNumber}
                        onChange={(e) => setNewCariForm({ ...newCariForm, taxNumber: e.target.value })}
                        placeholder="10 veya 11 haneli vergi no"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-muted-foreground text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
                        <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {t('sales.taxOffice')}
                      </label>
                      <input
                        type="text"
                        value={newCariForm.taxOffice}
                        onChange={(e) => setNewCariForm({ ...newCariForm, taxOffice: e.target.value })}
                        placeholder={t('salesPage.taxOfficePlaceholder')}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2 text-muted-foreground text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
                        <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {t('common.address')}
                      </label>
                      <textarea
                        value={newCariForm.address}
                        onChange={(e) => setNewCariForm({ ...newCariForm, address: e.target.value })}
                        placeholder={t('salesPage.fullAddress')}
                        rows={2}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pb-4 sm:pb-0">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleAddNewCari}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 sm:py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 active:from-emerald-700 active:to-emerald-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 text-sm sm:text-base"
                  >
                    <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                    {t('salesPage.saveAndContinue')}
                  </motion.button>
                </div>
              </>
            )}

            {/* Product Selection & Cart */}
            {currentStep === 'products' && (['satis', 'alis'].includes(selectedMode || '')) && (
              <>
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <button
                    onClick={() => setCurrentStep('cari')}
                    className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <Dialog.Title className="text-lg sm:text-2xl font-bold text-white">
                      {t('salesPage.addProduct')}
                    </Dialog.Title>
                    <Dialog.Description className="text-muted-foreground text-xs sm:text-base truncate">
                      {selectedMode?.startsWith('alis') ? t('salesPage.supplier') : t('salesPage.customer')}: {selectedCari?.companyName}
                    </Dialog.Description>
                  </div>
                  {/* Mobil sepet özeti badge */}
                  {productItems.length > 0 && (
                    <div className="lg:hidden flex items-center gap-2 px-3 py-1.5 bg-blue-600/15 border border-blue-500/30 rounded-xl">
                      <ShoppingCart className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-blue-400 text-xs font-bold">{productItems.length}</span>
                      <span className="text-blue-300 text-xs font-bold">₺{calculateTotal().toLocaleString('tr-TR')}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-6 pb-20 sm:pb-0">
                  {/* Ürün Listesi */}
                  <div className="lg:col-span-2 card-premium rounded-xl sm:rounded-2xl p-3 sm:p-6">
                    <div className="mb-3 sm:mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                        <input
                          type="text"
                          value={productSearchTerm}
                          onChange={(e) => setProductSearchTerm(e.target.value)}
                          placeholder={t('salesPage.searchProduct')}
                          className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:space-y-2 max-h-[30vh] sm:max-h-96 overflow-y-auto overscroll-contain">
                      {filteredProductList.map((product, index) => (
                        <motion.div
                          key={`${product.id}-${index}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={() => {
                            setSelectedProduct(product);
                            setProductUnitPrice(product.price);
                          }}
                          className={`p-3 sm:p-4 rounded-lg cursor-pointer transition-all active:opacity-80 ${
                            selectedProduct?.id === product.id
                              ? 'bg-blue-600/20 border-2 border-blue-500'
                              : 'bg-secondary/50 border border-border hover:border-border'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-white font-bold text-sm sm:text-base truncate">{product.name}</p>
                                {product.isFrequent && (
                                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] uppercase font-bold rounded">
                                    {t('salesPage.frequent')}
                                  </span>
                                )}
                              </div>
                              <p className="text-muted-foreground text-xs sm:text-sm truncate">
                                {product.isFrequent ? `${t('salesPage.lastPrice')}: ` : `${t('salesPage.price')}: `}₺{product.price} / {product.unit}
                              </p>
                            </div>
                            {selectedProduct?.id === product.id && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* Ürün Ekleme Paneli - Modern & Kompakt */}
                    <AnimatePresence>
                      {selectedProduct && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          className="mt-4 p-5 bg-gradient-to-br from-secondary to-card rounded-xl border border-border shadow-xl"
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                                <Package className="w-5 h-5 text-blue-400" />
                              </div>
                              <div>
                                <p className="text-white font-bold text-sm">{selectedProduct.name}</p>
                                <p className="text-muted-foreground text-xs">{t('salesPage.listPrice')}: ₺{selectedProduct.price}</p>
                              </div>
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setSelectedProduct(null)}
                              className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4 text-muted-foreground" />
                            </motion.button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                            <NumberInput
                              label={`${t('salesPage.quantity')} (${selectedProduct.unit})`}
                              value={productQuantity}
                              onChange={setProductQuantity}
                              min={selectedProduct.unit === 'KG' ? 0.01 : 1}
                              step={selectedProduct.unit === 'KG' ? 0.01 : 1}
                              unit={selectedProduct.unit}
                              showButtons={true}
                              precision={selectedProduct.unit === 'KG' ? 2 : 0}
                              icon={Hash}
                            />
                            
                            <NumberInput
                              label={t('salesPage.unitPrice')}
                              value={productUnitPrice}
                              onChange={setProductUnitPrice}
                              min={0}
                              step={0.01}
                              unit="₺"
                              showButtons={false}
                              precision={2}
                              highlight={true}
                            />
                            
                            <div>
                              <label className="text-foreground/80 text-xs font-medium mb-1.5 block">
                                {t('salesPage.totalAmount')}
                              </label>
                              <motion.div
                                animate={{ scale: [1, 1.05, 1] }}
                                transition={{ duration: 0.3 }}
                                key={productQuantity * productUnitPrice}
                                className="w-full px-3 py-2 bg-blue-600/20 border border-blue-500/50 rounded-lg"
                              >
                                <p className="text-blue-400 font-bold text-lg text-center">
                                  ₺{((productQuantity || 0) * (productUnitPrice || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                </p>
                              </motion.div>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={handleAddProductAsSale}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 active:from-green-800 active:to-green-900 text-white font-bold rounded-xl sm:rounded-lg transition-all shadow-lg text-sm"
                            >
                              <Plus className="w-4 h-4" />
                              {selectedMode?.startsWith('alis') ? t('salesPage.purchase') : t('salesPage.sale')}
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={handleAddProductAsReturn}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 active:from-red-800 active:to-red-900 text-white font-bold rounded-xl sm:rounded-lg transition-all shadow-lg text-sm"
                            >
                              <ArrowLeft className="w-4 h-4" />
                              {t('salesPage.return')}
                            </motion.button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Sepet - Modern & Animasyonlu */}
                  <div className="card-premium rounded-xl sm:rounded-2xl p-3 sm:p-6">
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                      <h3 className="text-base sm:text-xl font-bold text-white">{t('salesPage.cart')}</h3>
                      <div className="flex items-center gap-2">
                        {productItems.length > 0 && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center"
                          >
                            <span className="text-white text-xs font-bold">{productItems.length}</span>
                          </motion.div>
                        )}
                      </div>
                    </div>
                    
                    {productItems.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-8 sm:py-12"
                      >
                        <ShoppingCart className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/50 mx-auto mb-2 sm:mb-3" />
                        <p className="text-muted-foreground/70 text-sm">{t('salesPage.noProducts')}</p>
                        <p className="text-muted-foreground/50 text-xs mt-1">{t('salesPage.selectFromList')}</p>
                      </motion.div>
                    ) : (
                      <>
                        <div className="space-y-1.5 sm:space-y-2 mb-3 sm:mb-4 max-h-48 sm:max-h-64 overflow-y-auto">
                          <AnimatePresence mode="popLayout">
                            {productItems.map((item, index) => (
                              <motion.div
                                key={item.id}
                                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: -20, scale: 0.95 }}
                                transition={{ 
                                  type: 'spring', 
                                  stiffness: 400, 
                                  damping: 25,
                                  delay: index * 0.05 
                                }}
                                layout
                                className={`p-3 rounded-lg ${
                                  item.type === 'iade' 
                                    ? 'bg-red-600/10 border border-red-600/30' 
                                    : 'bg-secondary/50 border border-border'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1 mb-1.5 sm:mb-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white font-medium text-xs sm:text-sm truncate">{item.productName}</p>
                                    <p className="text-muted-foreground text-[10px] sm:text-xs">
                                      {Math.abs(item.quantity)} {item.unit} × ₺{(item.unitPrice || 0).toLocaleString('tr-TR')}
                                    </p>
                                  </div>
                                  <motion.button
                                    whileHover={{ scale: 1.2, rotate: 90 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => handleRemoveProduct(item.id)}
                                    className="p-1 hover:bg-accent rounded transition-colors"
                                  >
                                    <X className="w-4 h-4 text-muted-foreground" />
                                  </motion.button>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                                    item.type === 'iade' 
                                      ? 'bg-red-600/20 text-red-400' 
                                      : item.type === 'alis'
                                        ? 'bg-blue-600/20 text-blue-400'
                                        : 'bg-green-600/20 text-green-400'
                                  }`}>
                                    {item.type === 'iade' ? t('salesPage.return') : item.type === 'alis' ? t('salesPage.purchase') : t('salesPage.sale')}
                                  </span>
                                  <motion.p
                                    key={item.totalPrice}
                                    initial={{ scale: 1.2 }}
                                    animate={{ scale: 1 }}
                                    className={`font-bold ${
                                      item.type === 'iade' ? 'text-red-400' : 'text-green-400'
                                    }`}
                                  >
                                    ₺{(Math.abs(item.totalPrice) || 0).toLocaleString('tr-TR')}
                                  </motion.p>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>

                        <motion.div
                          layout
                          className="border-t border-border pt-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-muted-foreground text-xs sm:text-sm">{t('salesPage.totalAmount')}</span>
                            <motion.span
                              key={calculateTotal()}
                              initial={{ scale: 1.1, color: '#3b82f6' }}
                              animate={{ scale: 1, color: '#ffffff' }}
                              transition={{ duration: 0.3 }}
                              className="text-lg sm:text-2xl font-bold"
                            >
                              ₺{calculateTotal().toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </motion.span>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </div>
                </div>

                {/* Desktop: Normal buton */}
                <div className="hidden sm:flex justify-end gap-3">
                  <button
                    onClick={() => {
                      if (productItems.length === 0) {
                        toast.error(t('salesPage.addAtLeastOneProduct'));
                        return;
                      }
                      setCurrentStep('payment');
                    }}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:shadow-none text-base"
                    disabled={productItems.length === 0}
                  >
                    {t('salesPage.paymentInfo')}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Mobile: Sticky bottom bar */}
                <div className="sm:hidden fixed bottom-0 left-0 right-0 z-[60] bg-[#111]/95 backdrop-blur-xl border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-white text-xs font-bold">{productItems.length} ürün</span>
                      </div>
                      <p className="text-blue-400 text-sm font-black mt-0.5">
                        ₺{calculateTotal().toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (productItems.length === 0) {
                          toast.error(t('salesPage.addAtLeastOneProduct'));
                          return;
                        }
                        setCurrentStep('payment');
                      }}
                      disabled={productItems.length === 0}
                      className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 disabled:opacity-40 disabled:shadow-none text-sm shrink-0"
                    >
                      Ödeme
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              </>
            )}

            {/* Payment Info */}
            {currentStep === 'payment' && (['satis', 'alis'].includes(selectedMode || '')) && (
              <>
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <button
                    onClick={() => setCurrentStep('products')}
                    className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <Dialog.Title className="text-lg sm:text-2xl font-bold text-white">
                      {t('salesPage.paymentInfo')}
                    </Dialog.Title>
                    <Dialog.Description className="text-muted-foreground text-xs sm:text-base">
                      {t('salesPage.totalAmount')}: ₺{calculateTotal().toLocaleString()}
                    </Dialog.Description>
                  </div>
                </div>

                <div className="card-premium rounded-xl sm:rounded-2xl p-3 sm:p-6 mb-4 sm:mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {/* Fiş Tarihi */}
                    <div className="sm:col-span-2">
                      <DatePickerInput
                        label={t('salesPage.receiptDate')}
                        value={fisDate}
                        onChange={setFisDate}
                        placeholder={t('salesPage.selectReceiptDate')}
                        required={true}
                      />
                    </div>

                    {/* Fiş Fotoğrafı */}
                    <div className="sm:col-span-2">
                      <label className="text-foreground/80 text-xs font-medium mb-1.5 sm:mb-2 flex items-center gap-2">
                        <Camera className="w-3.5 h-3.5" />
                        {t('salesPage.receiptPhoto')}
                      </label>
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handlePhotoUpload(e, setFisPhoto)}
                          className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm hover:border-border transition-all file:mr-3 sm:file:mr-4 file:py-1.5 sm:file:py-2 file:px-3 sm:file:px-4 file:rounded-lg file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                        />
                      </div>
                      <AnimatePresence>
                        {fisPhoto && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-2 sm:mt-3 flex items-center gap-3 p-2.5 sm:p-3 bg-green-600/10 border border-green-600/30 rounded-xl sm:rounded-lg"
                          >
                            <img src={fisPhoto} alt="Fiş" className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-green-600/50 shadow-lg" />
                            <div className="flex-1 min-w-0">
                              <p className="text-green-400 text-sm font-medium">✓ {t('salesPage.photoUploaded')}</p>
                              <p className="text-muted-foreground text-xs mt-0.5 sm:mt-1">{t('salesPage.photoAdded')}</p>
                            </div>
                            <button onClick={() => setFisPhoto('')} className="p-1.5 hover:bg-red-600/20 active:bg-red-600/30 rounded-lg transition-colors shrink-0">
                              <X className="w-4 h-4 text-red-400" />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Müşteriye Bildirim Gönder */}
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2.5 text-foreground/80 text-xs sm:text-sm font-medium py-1">
                        <input
                          type="checkbox"
                          checked={notifyCustomer}
                          onChange={(e) => setNotifyCustomer(e.target.checked)}
                          className="w-4.5 h-4.5 sm:w-4 sm:h-4 rounded border-border bg-secondary accent-blue-600"
                        />
                        {selectedMode?.startsWith('alis') ? t('salesPage.sendToSupplier') : t('salesPage.sendToCustomer')}
                      </label>
                      {notifyCustomer && selectedCari?.email && (
                        <p className="text-muted-foreground text-xs mt-1 ml-6">
                          📧 {selectedCari.email} adresine gönderilecek
                        </p>
                      )}
                      {notifyCustomer && !selectedCari?.email && (
                        <p className="text-yellow-400 text-xs mt-1 ml-6">
                          ⚠️ {selectedMode?.startsWith('alis') ? t('salesPage.supplierNoEmail') : t('salesPage.customerNoEmail')}
                        </p>
                      )}
                    </div>

                    {/* ─── Alış Fatura Takibi ─── */}
                    {selectedMode === 'alis' && (
                      <div className="sm:col-span-2 p-4 bg-orange-500/5 border border-orange-500/15 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> Alış Fatura Bilgisi
                          </label>
                          <button
                            type="button"
                            onClick={() => setAlisHasInvoice(!alisHasInvoice)}
                            className={`relative w-11 h-6 rounded-full transition-all ${alisHasInvoice ? 'bg-orange-500' : 'bg-white/10'}`}
                          >
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${alisHasInvoice ? 'left-[22px]' : 'left-0.5'}`} />
                          </button>
                        </div>
                        {!alisHasInvoice && (
                          <p className="text-[10px] text-gray-500">Bu alışta toptancıdan fatura alınmadı.</p>
                        )}
                        <AnimatePresence>
                          {alisHasInvoice && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] text-gray-500 font-medium mb-1 block">Fatura No</label>
                                  <input value={alisInvoiceNo} onChange={e => setAlisInvoiceNo(e.target.value)} placeholder="Opsiyonel"
                                    className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 text-xs outline-none" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 font-medium mb-1 block">KDV Oranı</label>
                                  <div className="flex gap-1">
                                    {[1, 10, 20].map(rate => (
                                      <button key={rate} type="button" onClick={() => setAlisKdvRate(rate)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${alisKdvRate === rate ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-white/5 text-gray-500 border-white/5'}`}>
                                        %{rate}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500 font-medium mb-1 flex items-center gap-1">
                                  <Camera className="w-3 h-3" /> Fatura Fotoğrafı <span className="text-red-400">*</span>
                                </label>
                                {alisInvoicePhoto ? (
                                  <div className="relative">
                                    <img src={alisInvoicePhoto} alt="Alış Faturası" className="w-full max-h-32 object-contain rounded-xl border border-white/10" />
                                    <button type="button" onClick={() => setAlisInvoicePhoto('')}
                                      className="absolute top-1 right-1 p-1 bg-red-500/80 rounded-full text-white">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex items-center gap-2 px-3 py-3 bg-white/[0.03] border-2 border-dashed border-orange-500/30 rounded-xl cursor-pointer hover:bg-white/[0.06] transition-all">
                                    <Upload className="w-5 h-5 text-orange-400" />
                                    <span className="text-xs text-orange-400 font-medium">Alış faturası fotoğrafı yükle</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, setAlisInvoicePhoto)} />
                                  </label>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Modern Ödeme Seçici */}
                    <PaymentSelector
                      totalAmount={calculateTotal()}
                      paymentInfo={paymentInfo}
                      onChange={setPaymentInfo}
                    />

                    {/* Kredi Kartı Detayları */}
                    {paymentInfo?.method === 'kredi-karti' && (
                      <>
                        <div>
                          <label className="text-foreground/80 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block">
                            {t('salesPage.bank')} <span className="text-red-400">*</span>
                          </label>
                          <select
                            value={paymentInfo?.bankName || ''}
                            onChange={(e) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), bankName: e.target.value }))}
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                          >
                            <option value="">{t('salesPage.selectBank')}</option>
                            {banks.map((bank: any, idx: number) => (
                              <option key={idx} value={bank.name}>
                                {bank.name} {bank.branch && `- ${bank.branch}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-foreground/80 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block">
                            {t('salesPage.receiptPhotoLabel')} <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handlePhotoUpload(e, (photo) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), slipPhoto: photo })))}
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white cursor-pointer"
                          />
                          {paymentInfo?.slipPhoto && (
                            <p className="text-green-400 text-xs sm:text-sm mt-1.5 sm:mt-2">✓ {t('salesPage.photoUploaded')}</p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Havale Detayları */}
                    {paymentInfo?.method === 'havale' && (
                      <>
                        <div>
                          <label className="text-foreground/80 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block">
                            {t('salesPage.receiverEmployee')} <span className="text-red-400">*</span>
                          </label>
                          <select
                            value={paymentInfo?.receiverEmployee || ''}
                            onChange={(e) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), receiverEmployee: e.target.value }))}
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                          >
                            <option value="">{t('salesPage.selectEmployee')}</option>
                            {personelList.map((person: any) => (
                              <option key={person.id} value={person.name}>
                                {person.name} - {person.position}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-foreground/80 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block">
                            {t('salesPage.bank')} <span className="text-red-400">*</span>
                          </label>
                          <select
                            value={paymentInfo?.receiverBank || ''}
                            onChange={(e) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), receiverBank: e.target.value }))}
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                          >
                            <option value="">{t('salesPage.selectBank')}</option>
                            {banks.map((bank: any, idx: number) => (
                              <option key={idx} value={bank.name}>
                                {bank.name} {bank.branch && `- ${bank.branch}`}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-foreground/80 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block">
                            {t('salesPage.receiptPhotoLabel')} <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handlePhotoUpload(e, (photo) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), receiptPhoto: photo })))}
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white cursor-pointer"
                          />
                          {paymentInfo?.receiptPhoto && (
                            <p className="text-green-400 text-xs sm:text-sm mt-1.5 sm:mt-2">✓ {t('salesPage.photoUploaded')}</p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Çek Detayları */}
                    {paymentInfo?.method === 'cek' && (
                      <>
                        <div className="sm:col-span-2">
                          <label className="text-foreground/80 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block">
                            {t('salesPage.dueDate')} <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="date"
                            value={paymentInfo?.dueDate || ''}
                            onChange={(e) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), dueDate: e.target.value }))}
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-foreground/80 text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 block">
                            {t('salesPage.checkPhoto')} <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handlePhotoUpload(e, (photo) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), checkPhoto: photo })))}
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white cursor-pointer"
                          />
                          {paymentInfo?.checkPhoto && (
                            <p className="text-green-400 text-xs sm:text-sm mt-1.5 sm:mt-2">✓ {t('salesPage.photoUploaded')}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      // Ödeme bilgisi opsiyonel - sadece ödeme yöntemi seçildiyse validate et
                      if (paymentInfo?.method) {
                        if (isNaN(paymentInfo?.amount ?? NaN) || (paymentInfo?.amount ?? 0) <= 0) {
                          toast.error(t('salesPage.enterPaymentAmount'));
                          return;
                        }

                        // Method-specific validation
                        if (paymentInfo!.method === 'kredi-karti') {
                          if (!paymentInfo!.bankName || !paymentInfo!.slipPhoto) {
                            toast.error(t('salesPage.creditCardRequired'));
                            return;
                          }
                        }
                        if (paymentInfo!.method === 'havale') {
                          if (!paymentInfo!.receiverEmployee || !paymentInfo!.receiverBank || !paymentInfo!.receiptPhoto) {
                            toast.error(t('salesPage.transferRequired'));
                            return;
                          }
                        }
                        if (paymentInfo!.method === 'cek') {
                          if (!paymentInfo!.dueDate || !paymentInfo!.checkPhoto) {
                            toast.error(t('salesPage.checkRequired'));
                            return;
                          }
                        }
                      }

                      // Fiş kaydedildi mesajı
                      const fisData = {
                        id: `fis-${Date.now()}`,
                        mode: selectedMode,
                        employee: selectedEmployee,
                        employeeName: currentEmployee?.name,
                        cari: selectedCari,
                        cariId: selectedCari?.id,
                        items: productItems,
                        total: calculateTotal(),
                        payment: paymentInfo,
                        photo: fisPhoto,
                        date: fisDate ? fisDate.toISOString() : new Date().toISOString(),
                        notifyCustomer: notifyCustomer,
                        createdById: currentEmployee?.id,
                        // Alış fatura takibi
                        invoiceInfo: selectedMode === 'alis' ? {
                          hasInvoice: alisHasInvoice,
                          kdvRate: alisHasInvoice ? alisKdvRate : null,
                          invoiceNo: alisInvoiceNo || null,
                          invoicePhoto: alisInvoicePhoto || null,
                        } : undefined,
                      };

                      // LocalStorage ve KV Store'a fişi kaydet
                      addFisSync(fisData);
                      sec.auditLog('add', fisData.id, `fis:${selectedMode}:${calculateTotal()}`);
                      emit('fis:created', { fisId: fisData.id, mode: selectedMode || '', total: calculateTotal(), cariId: selectedCari?.id });

                      // Stok güncelleme (Satış fişi)
                      const existingStokList = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
                      const updatedStokList = existingStokList.map(stock => {
                        const items = productItems.filter(p => p.productName === stock.name);
                        if (items.length > 0) {
                          let netQuantityDiff = 0;
                          let newMovements = [...(stock.movements || [])];
                          
                          items.forEach(item => {
                            let isStockIncrease = false;
                            let moveTypeStr = 'SATIS';
                            
                            if (selectedMode === 'satis') {
                              if (item.type === 'iade') {
                                isStockIncrease = true;
                                moveTypeStr = 'MUSTERI_IADE';
                              } else {
                                isStockIncrease = false;
                                moveTypeStr = 'SATIS';
                              }
                            } else if (selectedMode === 'alis') {
                              if (item.type === 'iade') {
                                isStockIncrease = false;
                                moveTypeStr = 'TOPTANCI_IADE';
                              } else {
                                isStockIncrease = true;
                                moveTypeStr = 'ALIS';
                              }
                            }
                            
                            const absQuantity = Math.abs(item.quantity);
                            const diff = isStockIncrease ? absQuantity : -absQuantity;
                            netQuantityDiff += diff;

                            const newMovement = {
                              id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                              type: moveTypeStr,
                              partyName: selectedCari ? selectedCari.companyName : t('salesPage.cashTransaction'),
                              date: fisData.date,
                              quantity: absQuantity,
                              price: item.unitPrice,
                              totalAmount: Math.abs(item.totalPrice),
                              description: `${moveTypeStr === 'MUSTERI_IADE' ? t('salesPage.customerReturn') : moveTypeStr === 'TOPTANCI_IADE' ? t('salesPage.supplierReturn') : moveTypeStr === 'ALIS' ? t('salesPage.purchase') : t('salesPage.sale')} ${t('salesPage.receipt')}: ${fisData.id}`
                            };
                            
                            newMovements.unshift(newMovement);
                          });
                          
                          const currentQty = typeof stock.currentStock === 'number' && !isNaN(stock.currentStock) ? stock.currentStock : 0;
                          const updatedStock = {
                            ...stock,
                            currentStock: currentQty + netQuantityDiff,
                            movements: newMovements
                          };
                          
                          // KV STORE SENKRONİZASYONU
                          updateStokSync(stock.id, updatedStock);
                          return updatedStock;
                        }
                        return stock;
                      });
                      
                      setBaseProductList(updatedStokList);

                      // Cari bakiyesini ve işlem geçmişini güncelle
                      if (selectedCari) {
                        const targetCari = cariList.find(c => c.id === selectedCari.id);
                        if (targetCari) {
                          let totalSatis = 0;
                          let totalSatisIade = 0;
                          let totalAlis = 0;
                          let totalAlisIade = 0;
                          
                          productItems.forEach(item => {
                            const amount = Math.abs(item.totalPrice);
                            if (selectedMode === 'satis') {
                              if (item.type === 'iade') totalSatisIade += amount;
                              else totalSatis += amount;
                            } else if (selectedMode === 'alis') {
                              if (item.type === 'iade') totalAlisIade += amount;
                              else totalAlis += amount;
                            }
                          });
                          
                          const paidAmount = paymentInfo?.amount || 0;
                          
                          let netBalanceChange = 0;
                          if (selectedMode === 'satis') {
                            netBalanceChange = totalSatis - totalSatisIade - paidAmount;
                          } else if (selectedMode === 'alis') {
                            netBalanceChange = totalAlis - totalAlisIade - paidAmount;
                          }
                          
                          const newBalance = targetCari.balance + netBalanceChange;
                          
                          const transactionHistory = targetCari.transactionHistory || [];
                          let newTransactions = [...transactionHistory];

                          if (totalSatis > 0) {
                            newTransactions.unshift({
                              id: `tx-${Date.now()}-s`,
                              date: fisData.date,
                              type: 'debit',
                              amount: totalSatis,
                              description: `${t('salesPage.saleReceipt')} No: ${fisData.id}`
                            });
                          }
                          if (totalSatisIade > 0) {
                            newTransactions.unshift({
                              id: `tx-${Date.now()}-si`,
                              date: fisData.date,
                              type: 'credit',
                              amount: totalSatisIade,
                              description: `${t('salesPage.saleReturn')} No: ${fisData.id}`
                            });
                          }
                          if (totalAlis > 0) {
                            newTransactions.unshift({
                              id: `tx-${Date.now()}-a`,
                              date: fisData.date,
                              type: 'debit',
                              amount: totalAlis,
                              description: `${t('salesPage.purchaseReceipt')} No: ${fisData.id}`
                            });
                          }
                          if (totalAlisIade > 0) {
                            newTransactions.unshift({
                              id: `tx-${Date.now()}-ai`,
                              date: fisData.date,
                              type: 'credit',
                              amount: totalAlisIade,
                              description: `${t('salesPage.purchaseReturn')} No: ${fisData.id}`
                            });
                          }
                          
                          if (paidAmount > 0) {
                            newTransactions.unshift({
                              id: `tx-${Date.now()}-p`,
                              date: fisData.date,
                              type: 'credit',
                              amount: paidAmount,
                              description: selectedMode === 'satis' ? t('salesPage.collection') : t('salesPage.payment')
                            });
                          }
                          
                          const updatedCari = {
                            ...targetCari,
                            balance: newBalance,
                            transactions: targetCari.transactions + 1,
                            transactionHistory: newTransactions
                          };
                          
                          // KV STORE SENKRONİZASYONU
                          updateCariSync(updatedCari.id, updatedCari);
                        }
                      }

                      // Satış/Alış fişinde ödeme yapılmışsa kasa'ya kayıt ekle
                      if (paymentInfo?.amount && paymentInfo.amount > 0) {
                        const methodNames: Record<string, string> = {
                          'nakit': t('salesPage.payMethod.cash'),
                          'kredi-karti': t('salesPage.payMethod.creditCard'),
                          'havale': t('salesPage.payMethod.transfer'),
                          'cek': t('salesPage.payMethod.check')
                        };
                        const kasaType = selectedMode === 'satis' ? 'Gelir' : 'Gider';
                        const kasaCategory = selectedMode === 'satis' ? t('salesPage.saleCollection') : t('salesPage.purchasePayment');
                        const newKasaEntry = {
                          id: `kasa-fis-${Date.now()}`,
                          type: kasaType,
                          category: kasaCategory,
                          description: `${methodNames[paymentInfo.method] || paymentInfo.method} - ${selectedCari?.companyName || t('salesPage.cash')}`,
                          amount: paymentInfo.amount,
                          date: new Date().toISOString().split('T')[0],
                          time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                        };
                        addKasaSync(newKasaEntry);

                        // Çek ödemesi ise çek kaydı oluştur
                        if (paymentInfo!.method === 'cek' && paymentInfo!.dueDate) {
                          const bankList = getFromStorage<any[]>(StorageKey.BANK_DATA) || [];
                          const newCek: CekData = {
                            id: `cek-fis-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                            direction: 'alinan',
                            amount: paymentInfo!.amount,
                            bankName: t('salesPage.notSpecified'),
                            dueDate: paymentInfo!.dueDate,
                            issueDate: new Date().toISOString().split('T')[0],
                            sourceType: selectedCari?.type === 'Toptancı' ? 'toptanci' : 'musteri',
                            sourceName: selectedCari?.companyName || t('salesPage.unknown'),
                            sourceId: selectedCari?.id || '',
                            relatedFisId: fisData.id,
                            relatedFisDescription: `${selectedMode === 'satis' ? t('salesPage.sale') : t('salesPage.purchase')} ${t('salesPage.receipt')} #${fisData.id.slice(-6)}`,
                            photoFront: paymentInfo!.checkPhoto || null,
                            photoBack: null,
                            status: 'beklemede',
                            createdAt: new Date().toISOString(),
                            createdBy: currentEmployee?.name || t('salesPage.system'),
                          };
                          saveCek(newCek);
                        }
                      }

                      // Başarı mesajı
                      const hasPayment = paymentInfo?.method;
                      const totalAmount = calculateTotal();
                      const paidAmount = paymentInfo?.amount || 0;
                      const isPartialPayment = hasPayment && paidAmount < totalAmount;
                      
                      let paymentDescription = '';
                      if (!hasPayment) {
                        paymentDescription = `${t('salesPage.total')}: ₺${totalAmount.toLocaleString('tr-TR')} - ${t('salesPage.credit')} (${t('salesPage.noPayment')})`;
                      } else if (isPartialPayment) {
                        paymentDescription = `${t('salesPage.paid')}: ₺${paidAmount.toLocaleString('tr-TR')} - ${t('salesPage.remaining')}: ₺${(totalAmount - paidAmount).toLocaleString('tr-TR')} ${t('salesPage.creditLower')}`;
                      } else {
                        const methodName = paymentInfo?.method === 'nakit' ? t('salesPage.payMethod.cash') :
                                          paymentInfo?.method === 'kredi-karti' ? t('salesPage.payMethod.creditCard') :
                                          paymentInfo?.method === 'havale' ? t('salesPage.payMethod.transfer') : t('salesPage.payMethod.check');
                        paymentDescription = `${t('salesPage.total')}: ₺${totalAmount.toLocaleString('tr-TR')} - ${methodName} (${t('salesPage.fullPayment')})`;
                      }
                      
                      let successMsg = t('salesPage.saleReceiptSaved');
                      if (selectedMode === 'alis') successMsg = t('salesPage.purchaseReceiptSaved');

                      toast.success(successMsg, {
                        description: paymentDescription,
                      });

                      // Aktivite log
                      logActivity(
                        selectedMode === 'alis' ? 'receipt_create' : 'sale_create',
                        successMsg,
                        {
                          employeeId: currentEmployee?.id,
                          employeeName: currentEmployee?.name,
                          page: 'sales',
                          description: paymentDescription,
                          metadata: { total: totalAmount, itemCount: productItems.length, mode: selectedMode },
                        }
                      );

                      // Müşteriye bildirim gönder
                      if (notifyCustomer && selectedCari?.email && fisPhoto) {
                        setTimeout(() => {
                          toast.info(`📧 ${t('salesPage.receiptEmailSent')}`, {
                            description: selectedCari.email
                          });
                        }, 1000);
                      }
                      
                      // Reset and close
                      handleReset();
                      setIsNewFisModalOpen(false);
                    }}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-3.5 sm:py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 active:from-emerald-700 active:to-emerald-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 text-sm sm:text-base"
                  >
                    <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                    {t('salesPage.saveReceipt') || 'Fişi Kaydet'}
                  </button>
                </div>
                {/* Mobile bottom spacer for payment step */}
                <div className="h-4 sm:hidden" />
              </>
            )}

            {/* Gider Fişi - Detaylar */}
            {currentStep === 'gider-details' && selectedMode === 'gider' && (
              <>
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <button
                    onClick={() => setCurrentStep('mode')}
                    className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <Dialog.Title className="text-lg sm:text-2xl font-bold text-white">
                      {t('salesPage.expenseDetails') || 'Gider Fişi Detayları'}
                    </Dialog.Title>
                    <Dialog.Description className="text-muted-foreground text-xs sm:text-base">
                      {t('salesPage.enterExpenseInfo') || 'Gider bilgilerini girin'}
                    </Dialog.Description>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                  {/* Sol: Temel Bilgiler */}
                  <div className="lg:col-span-2 space-y-3 sm:space-y-4">
                    {/* BÖLÜM 1: Tarih & Kategori */}
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 }}
                      className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08]"
                    >
                      <div className="flex items-center gap-2 mb-3 sm:mb-4">
                        <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
                          <Tag className="w-3.5 h-3.5 text-red-400" />
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-white">Temel Bilgiler</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <DatePickerInput
                          label={t('salesPage.expenseDate') || 'Gider Tarihi'}
                          value={fisDate}
                          onChange={setFisDate}
                          placeholder={t('salesPage.selectExpenseDate') || 'Gider tarihini seçin'}
                          required={true}
                        />
                        <div>
                          <label className="flex items-center gap-2 text-foreground/80 text-xs font-medium mb-1.5">
                            <TrendingDown className="w-3.5 h-3.5" />
                            {t('salesPage.expenseCategory')} <span className="text-red-400">*</span>
                          </label>
                          <select
                            value={giderCategory}
                            onChange={(e) => setGiderCategory(e.target.value)}
                            className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-white text-sm focus:outline-none focus:border-red-500 hover:border-border/80 transition-all"
                          >
                            <option value="">{t('salesPage.selectCategory')}</option>
                            {giderCategories.map((cat) => (
                              <option key={cat} value={cat}>{getGiderLabel(cat)}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Personel / Araç Seçimi (Dinamik) */}
                      <AnimatePresence>
                        {(giderCategory === 'Personel Maaşı' || giderCategory === 'Yemek') && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            className="mt-3"
                          >
                            <label className="flex items-center gap-2 text-foreground/80 text-xs font-medium mb-1.5">
                              <User className="w-3.5 h-3.5" />
                              {t('salesPage.selectPersonnel')} <span className="text-red-400">*</span>
                            </label>
                            <select
                              value={giderEmployee}
                              onChange={(e) => setGiderEmployee(e.target.value)}
                              className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-white text-sm focus:outline-none focus:border-red-500 hover:border-border/80 transition-all"
                            >
                              <option value="">{t('salesPage.selectPersonnel')}</option>
                              {personelList.map((person: any) => (
                                <option key={person.id} value={person.name}>
                                  {person.name} - {person.position}
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        )}
                        {giderCategory === 'Yakıt' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            className="mt-3"
                          >
                            <label className="flex items-center gap-2 text-foreground/80 text-xs font-medium mb-1.5">
                              <Truck className="w-3.5 h-3.5" />
                              Araç Seçimi
                            </label>
                            <select
                              value={giderVehicle}
                              onChange={(e) => setGiderVehicle(e.target.value)}
                              className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-white text-sm focus:outline-none focus:border-red-500 hover:border-border/80 transition-all"
                            >
                              <option value="">Araç seçin (opsiyonel)</option>
                              {vehicleList.map((v: any) => (
                                <option key={v.id} value={v.plate || v.name}>
                                  {v.plate || v.name} {v.brand ? `- ${v.brand} ${v.model || ''}` : ''}
                                </option>
                              ))}
                            </select>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {/* BÖLÜM 2: Tutar & Açıklama */}
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08]"
                    >
                      <div className="flex items-center gap-2 mb-3 sm:mb-4">
                        <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                          <CircleDollarSign className="w-3.5 h-3.5 text-orange-400" />
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-white">Tutar & Açıklama</h3>
                      </div>
                      <div className="space-y-3">
                        <NumberInput
                          label={t('salesPage.expenseAmount')}
                          value={giderAmount}
                          onChange={setGiderAmount}
                          min={0}
                          step={0.01}
                          unit="₺"
                          showButtons={false}
                          precision={2}
                          required={true}
                          placeholder="0.00"
                          icon={Banknote}
                        />
                        <div>
                          <label className="flex items-center gap-2 text-foreground/80 text-xs font-medium mb-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            {t('salesPage.description')} <span className="text-red-400">*</span>
                          </label>
                          <textarea
                            value={giderDescription}
                            onChange={(e) => setGiderDescription(e.target.value)}
                            placeholder={t('salesPage.expenseDescPlaceholder')}
                            rows={3}
                            className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-lg text-white text-sm focus:outline-none focus:border-red-500 hover:border-border/80 transition-all resize-none placeholder-muted-foreground"
                          />
                        </div>
                      </div>
                    </motion.div>

                    {/* BÖLÜM 3: Fotoğraf */}
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08]"
                    >
                      <div className="flex items-center gap-2 mb-3 sm:mb-4">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                          <Camera className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-white">{t('salesPage.expensePhoto')}</h3>
                        <span className="text-[10px] text-gray-500 ml-auto">(Opsiyonel)</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handlePhotoUpload(e, setGiderPhoto)}
                        className="w-full px-3 py-2.5 bg-secondary/50 border border-border rounded-xl sm:rounded-lg text-white text-sm hover:border-border/80 transition-all file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-600 file:text-white hover:file:bg-red-700 cursor-pointer"
                      />
                      <AnimatePresence>
                        {giderPhoto && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="mt-3 flex items-center gap-3 p-3 bg-green-600/10 border border-green-600/30 rounded-lg"
                          >
                            <img src={giderPhoto} alt={t('salesPage.expensePhoto')} className="w-16 h-16 object-cover rounded-lg border border-green-600/50 shadow-lg" />
                            <div>
                              <p className="text-green-400 text-sm font-medium">✓ {t('salesPage.photoUploaded')}</p>
                              <button onClick={() => setGiderPhoto('')} className="text-red-400 text-xs hover:underline mt-1">Kaldır</button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>

                  {/* Sağ: Ödeme & Özet */}
                  <div className="space-y-3 sm:space-y-4">
                    {/* Ödeme Yöntemi */}
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08]"
                    >
                      <div className="flex items-center gap-2 mb-3 sm:mb-4">
                        <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
                          <Wallet className="w-3.5 h-3.5 text-purple-400" />
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-white">{t('salesPage.paymentMethod')}</h3>
                        <span className="text-red-400 text-xs">*</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'nakit', label: t('salesPage.payMethod.cash'), icon: Wallet },
                          { id: 'kredi-karti', label: t('salesPage.payMethod.creditCard'), icon: CreditCard },
                          { id: 'havale', label: t('salesPage.payMethod.transfer'), icon: Building },
                          { id: 'cek', label: t('salesPage.payMethod.check'), icon: FileText }
                        ].map((method) => {
                          const MIcon = method.icon;
                          const selected = paymentInfo?.method === method.id;
                          return (
                            <motion.button
                              key={method.id}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setPaymentInfo({ 
                                method: method.id as PaymentMethod, 
                                amount: giderAmount 
                              })}
                              className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 ${
                                selected
                                  ? 'border-red-500/60 bg-red-600/15 shadow-lg shadow-red-600/10'
                                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                              }`}
                            >
                              <MIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${selected ? 'text-red-400' : 'text-muted-foreground'}`} />
                              <span className={`text-[10px] sm:text-xs font-semibold leading-tight text-center ${selected ? 'text-red-400' : 'text-muted-foreground'}`}>
                                {method.label}
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>

                      {paymentInfo && (
                        <motion.button
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={() => setPaymentInfo(null)}
                          className="mt-2 w-full px-3 py-1.5 bg-orange-600/10 hover:bg-orange-600/20 text-orange-400 text-[10px] sm:text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <X className="w-3 h-3" />
                          {t('salesPage.removePaymentMethod')}
                        </motion.button>
                      )}

                      {/* Ödeme Detayları (inline) */}
                      <AnimatePresence>
                        {paymentInfo?.method && paymentInfo.method !== 'nakit' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 pt-3 border-t border-white/[0.06] space-y-3"
                          >
                            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">{t('salesPage.paymentDetails')}</p>
                            
                            {paymentInfo?.method === 'kredi-karti' && (
                              <>
                                <div>
                                  <label className="block text-xs font-medium text-foreground/80 mb-1.5">{t('salesPage.bank')} *</label>
                                  <select value={paymentInfo?.bankName || ''} onChange={(e) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), bankName: e.target.value }))} className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-white text-sm focus:outline-none focus:border-red-500">
                                    <option value="">{t('salesPage.selectBank')}</option>
                                    {banks.map((bank: any, idx: number) => <option key={idx} value={bank.name}>{bank.name} {bank.branch && `- ${bank.branch}`}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-foreground/80 mb-1.5">{t('salesPage.receiptPhoto')} *</label>
                                  <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, (photo) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), slipPhoto: photo })))} className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-white text-xs" />
                                  {paymentInfo?.slipPhoto && <p className="text-green-400 text-xs mt-1.5">✓ {t('salesPage.receiptPhotoUploaded')}</p>}
                                </div>
                              </>
                            )}

                            {paymentInfo?.method === 'havale' && (
                              <>
                                <div>
                                  <label className="block text-xs font-medium text-foreground/80 mb-1.5">{t('salesPage.receiverEmployee')} *</label>
                                  <select value={paymentInfo?.receiverEmployee || ''} onChange={(e) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), receiverEmployee: e.target.value }))} className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-white text-sm focus:outline-none focus:border-red-500">
                                    <option value="">{t('salesPage.selectEmployee')}</option>
                                    {personelList.map((person: any) => <option key={person.id} value={person.name}>{person.name} - {person.position}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-foreground/80 mb-1.5">{t('salesPage.destinationBank')} *</label>
                                  <select value={paymentInfo?.receiverBank || ''} onChange={(e) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), receiverBank: e.target.value }))} className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-white text-sm focus:outline-none focus:border-red-500">
                                    <option value="">{t('salesPage.selectBank')}</option>
                                    {banks.map((bank: any, idx: number) => <option key={idx} value={bank.name}>{bank.name} {bank.branch && `- ${bank.branch}`}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-foreground/80 mb-1.5">{t('salesPage.receiptPhoto')} *</label>
                                  <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, (photo) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), receiptPhoto: photo })))} className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-white text-xs" />
                                  {paymentInfo?.receiptPhoto && <p className="text-green-400 text-xs mt-1.5">✓ {t('salesPage.receiptPhotoUploaded')}</p>}
                                </div>
                              </>
                            )}

                            {paymentInfo?.method === 'cek' && (
                              <>
                                <div>
                                  <label className="block text-xs font-medium text-foreground/80 mb-1.5">{t('salesPage.dueDate')} *</label>
                                  <input type="date" value={paymentInfo?.dueDate || ''} onChange={(e) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), dueDate: e.target.value }))} className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-white text-sm focus:outline-none focus:border-red-500" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-foreground/80 mb-1.5">{t('salesPage.checkPhoto')} *</label>
                                  <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, (photo) => setPaymentInfo(prev => ({ ...(prev ?? {} as PaymentInfo), checkPhoto: photo })))} className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-white text-xs" />
                                  {paymentInfo?.checkPhoto && <p className="text-green-400 text-xs mt-1.5">✓ {t('salesPage.checkPhotoUploaded')}</p>}
                                </div>
                              </>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {/* Gider Özeti */}
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                      className={`p-3 sm:p-5 rounded-xl sm:rounded-2xl backdrop-blur-xl border transition-all ${
                        giderCategory && giderAmount > 0 && giderDescription && paymentInfo
                          ? 'bg-red-950/20 border-red-500/20'
                          : 'bg-white/[0.03] border-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
                          <Receipt className="w-3.5 h-3.5 text-red-400" />
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-white">Gider Özeti</h3>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Kategori</span>
                          <span className={`font-medium ${giderCategory ? 'text-white' : 'text-gray-600'}`}>{giderCategory ? getGiderLabel(giderCategory) : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Tutar</span>
                          <span className={`font-bold ${giderAmount > 0 ? 'text-red-400' : 'text-gray-600'}`}>{giderAmount > 0 ? `₺${giderAmount.toLocaleString('tr-TR')}` : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Ödeme</span>
                          <span className={`font-medium ${paymentInfo ? 'text-white' : 'text-gray-600'}`}>
                            {paymentInfo?.method === 'nakit' ? t('salesPage.payMethod.cash') :
                             paymentInfo?.method === 'kredi-karti' ? t('salesPage.payMethod.creditCard') :
                             paymentInfo?.method === 'havale' ? t('salesPage.payMethod.transfer') :
                             paymentInfo?.method === 'cek' ? t('salesPage.payMethod.check') : '—'}
                          </span>
                        </div>
                        {giderEmployee && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Personel</span>
                            <span className="text-white font-medium truncate ml-2">{giderEmployee}</span>
                          </div>
                        )}
                        {giderVehicle && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Araç</span>
                            <span className="text-white font-medium truncate ml-2">{giderVehicle}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">Fotoğraf</span>
                          <span className={`font-medium ${giderPhoto ? 'text-green-400' : 'text-gray-600'}`}>{giderPhoto ? '✓ Eklendi' : 'Yok'}</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/[0.06]">
                        <p className={`text-center text-lg sm:text-xl font-black ${giderAmount > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                          -₺{(giderAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </motion.div>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-6 pb-4 sm:pb-0">
                  <button
                    onClick={() => setCurrentStep('mode')}
                    className="px-5 sm:px-6 py-3.5 sm:py-3 bg-secondary hover:bg-accent active:bg-accent/80 text-white font-bold rounded-xl transition-colors text-sm sm:text-base"
                  >
                    {t('salesPage.cancel')}
                  </button>
                  <button
                    onClick={() => {
                      if (!giderCategory || Number(giderAmount) <= 0 || !giderDescription || !paymentInfo) {
                        toast.error(t('salesPage.fillAllRequired'));
                        return;
                      }

                      // Ödeme yöntemi detay validasyonu
                      if (paymentInfo!.method === 'kredi-karti') {
                        if (!paymentInfo!.bankName || !paymentInfo!.slipPhoto) {
                          toast.error(t('salesPage.creditCardBankRequired'));
                          return;
                        }
                      }
                      if (paymentInfo!.method === 'havale') {
                        if (!paymentInfo!.receiverEmployee || !paymentInfo!.receiverBank || !paymentInfo!.receiptPhoto) {
                          toast.error(t('salesPage.transferDetailsRequired'));
                          return;
                        }
                      }
                      if (paymentInfo!.method === 'cek') {
                        if (!paymentInfo!.dueDate || !paymentInfo!.checkPhoto) {
                          toast.error(t('salesPage.checkDetailsRequired'));
                          return;
                        }
                      }

                      // Gider fişini kaydet
                      const giderFisData = {
                        id: `gider-${Date.now()}`,
                        mode: 'gider',
                        category: giderCategory,
                        amount: giderAmount,
                        description: giderDescription,
                        photo: giderPhoto,
                        payment: paymentInfo,
                        employeeName: currentEmployee?.name,
                        relatedEmployee: giderEmployee || undefined,
                        relatedVehicle: giderVehicle || undefined,
                        date: fisDate ? fisDate.toISOString() : new Date().toISOString()
                      };

                      // KV STORE SENKRONİZASYONU İLE KAYDET
                      addFisSync(giderFisData);
                      sec.auditLog('add', giderFisData.id, `gider:${giderAmount}`);
                      emit('fis:created', { fisId: giderFisData.id, mode: 'gider', total: giderAmount });

                      // Kasa'ya gider olarak ekle
                      const newKasaEntry = {
                        id: `kasa-${Date.now()}`,
                        type: 'Gider',
                        category: giderCategory,
                        amount: giderAmount,
                        description: giderDescription,
                        date: new Date().toISOString().split('T')[0],
                        time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                        employee: currentEmployee?.name,
                        receiptNo: giderFisData.id
                      };
                      // KV STORE SENKRONİZASYONU İLE KASAYA GİDER OLARAK EKLE
                      addKasaSync(newKasaEntry);

                      toast.success(t('salesPage.expenseReceiptSaved'), {
                        description: `${giderCategory} - ₺${giderAmount.toLocaleString()}`
                      });

                      logActivity('cash_expense', t('salesPage.expenseReceiptSaved'), {
                        employeeId: currentEmployee?.id,
                        employeeName: currentEmployee?.name,
                        page: 'sales',
                        description: `${giderCategory} - ₺${giderAmount.toLocaleString()}`,
                        metadata: { category: giderCategory, amount: giderAmount },
                      });

                      // Reset
                      setGiderCategory('');
                      setGiderAmount(0);
                      setGiderDescription('');
                      setGiderPhoto('');
                      setGiderEmployee('');
                      setGiderVehicle('');
                      setPaymentInfo(null);
                      setCurrentStep('mode');
                      setIsNewFisModalOpen(false);
                    }}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 sm:px-6 py-3.5 sm:py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:from-red-700 active:to-red-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 text-sm sm:text-base"
                  >
                    <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                    {t('salesPage.saveExpenseReceipt')}
                  </button>
                </div>
              </>
            )}

          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ─── Gelişmiş Fiş Listesi ─── */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl sm:rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] overflow-hidden"
      >
        {/* Header & Arama */}
        <div className="p-3 sm:p-5 border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                <Receipt className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-white truncate">{t('salesPage.recentReceipts')}</h2>
                <p className="text-[10px] sm:text-xs text-gray-500">
                  <span className="text-blue-400 font-bold">{filteredFisler.length}</span> kayıt gösteriliyor
                </p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/fis-gecmisi')}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-xs sm:text-sm rounded-lg sm:rounded-xl transition-all border border-white/10"
            >
              <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{t('salesPage.viewAll')}</span>
              <ChevronRight className="w-3 h-3 sm:hidden" />
            </motion.button>
          </div>

          {/* Arama & Filtre */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
              <input
                type="text"
                value={fisSearchTerm}
                onChange={(e) => setFisSearchTerm(e.target.value)}
                placeholder="Fiş, müşteri veya personel ara..."
                className="w-full pl-9 pr-8 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-white text-xs sm:text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/30 transition-all"
              />
              {fisSearchTerm && (
                <button onClick={() => setFisSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-white/10 rounded">
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              )}
            </div>
            {/* Tab Filtreleri */}
            <div className="flex gap-0.5 bg-white/5 rounded-lg sm:rounded-xl p-0.5 shrink-0 overflow-x-auto">
              {[
                { id: 'all' as const, label: t('salesPage.filterAll'), count: fisler.length, color: 'bg-white/10 text-white' },
                { id: 'satis' as const, label: t('salesPage.sale'), count: fisler.filter(f => f.mode === 'satis').length, color: 'bg-emerald-600/20 text-emerald-400' },
                { id: 'alis' as const, label: t('salesPage.purchase'), count: fisler.filter(f => f.mode === 'alis').length, color: 'bg-blue-600/20 text-blue-400' },
                { id: 'gider' as const, label: t('salesPage.expense'), count: fisler.filter(f => f.mode === 'gider').length, color: 'bg-red-600/20 text-red-400' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFisFilterTab(tab.id)}
                  className={`relative px-2.5 sm:px-3.5 py-1.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                    fisFilterTab === tab.id ? tab.color : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`ml-1 text-[9px] ${fisFilterTab === tab.id ? 'opacity-80' : 'opacity-50'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop Table Header */}
        <div className="hidden sm:grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-5 py-2 border-b border-white/[0.04] text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
          <span className="w-11">Tip</span>
          <span>Müşteri / Kategori</span>
          <span className="text-right">Tutar</span>
          <span className="text-right">Ödeme</span>
          <span className="text-right w-20">Tarih</span>
        </div>

        {/* Fiş Listesi */}
        <div className="p-1.5 sm:p-2">
          {filteredFisler.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-10 sm:py-16"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-gray-700" />
              </div>
              <p className="text-gray-400 font-medium mb-1 text-sm">
                {fisSearchTerm ? 'Arama sonucu bulunamadı' : t('salesPage.noReceiptsYet')}
              </p>
              <p className="text-gray-600 text-xs">
                {fisSearchTerm ? 'Farklı anahtar kelimeler deneyin' : t('salesPage.clickNewReceipt')}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-1 sm:space-y-0.5 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {filteredFisler.slice(0, 30).map((fis: any, index: number) => {
                  const amountStr = (fis.total || fis.amount || 0).toLocaleString('tr-TR');
                  const hasPayment = fis.payment?.amount > 0;
                  const itemCount = fis.items?.length || 0;
                  
                  return (
                    <motion.div
                      key={fis.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: index * 0.015 }}
                      layout
                      onClick={() => navigate('/fis-gecmisi')}
                      className="group flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl sm:rounded-xl border border-transparent hover:border-white/[0.06] transition-all duration-150 cursor-pointer active:scale-[0.99] active:bg-white/[0.03] hover:bg-white/[0.02]"
                    >
                      {/* Icon */}
                      <div className={`w-10 h-10 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        fis.mode === 'satis' ? 'bg-emerald-500/15' : fis.mode === 'alis' ? 'bg-blue-500/15' : 'bg-red-500/15'
                      }`}>
                        {fis.mode === 'satis' ? <ShoppingCart className="w-4 h-4 text-emerald-400" /> : fis.mode === 'alis' ? <Package className="w-4 h-4 text-blue-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-white font-semibold text-xs sm:text-sm truncate">
                                {fis.mode === 'satis' || fis.mode === 'alis'
                                  ? (fis.cari?.companyName || (fis.mode === 'alis' ? t('salesPage.supplier') : t('salesPage.customer')))
                                  : fis.category}
                              </p>
                              {/* Mobile type badge */}
                              <span className={`sm:hidden text-[9px] px-1.5 py-0.5 rounded-md font-bold shrink-0 ${
                                fis.mode === 'satis' ? 'bg-emerald-500/15 text-emerald-400' : fis.mode === 'alis' ? 'bg-blue-500/15 text-blue-400' : 'bg-red-500/15 text-red-400'
                              }`}>
                                {fis.mode === 'satis' ? 'S' : fis.mode === 'alis' ? 'A' : 'G'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-500 mt-0.5">
                              <span className="truncate max-w-[80px] sm:max-w-none">{fis.employeeName || '-'}</span>
                              <span className="text-gray-700">•</span>
                              <span className="shrink-0">{fis.date ? new Date(fis.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '-'}</span>
                              {itemCount > 0 && (
                                <span className="shrink-0 text-gray-600">{itemCount} kalem</span>
                              )}
                              {hasPayment && (
                                <span className="sm:hidden shrink-0 text-emerald-400/70 font-semibold">
                                  ödendi
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Sağ taraf: tutar + badge */}
                          <div className="flex items-center gap-2 shrink-0">
                            {hasPayment && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/80 font-bold hidden sm:block">
                                ₺{fis.payment.amount.toLocaleString('tr-TR')}
                              </span>
                            )}
                            <div className="text-right">
                              <p className={`font-bold text-sm ${
                                fis.mode === 'satis' ? 'text-emerald-400' : fis.mode === 'alis' ? 'text-blue-400' : 'text-red-400'
                              }`}>
                                {fis.mode === 'satis' ? '+' : '-'}₺{amountStr}
                              </p>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold hidden sm:inline-block ${
                              fis.mode === 'satis' ? 'bg-emerald-500/10 text-emerald-400' : fis.mode === 'alis' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {fis.mode === 'satis' ? t('salesPage.saleUpper') : fis.mode === 'alis' ? t('salesPage.purchaseUpper') : t('salesPage.expenseUpper')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              
              {filteredFisler.length > 30 && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => navigate('/fis-gecmisi')}
                  className="w-full py-3 text-center text-xs text-blue-400 hover:text-blue-300 font-medium hover:bg-white/5 rounded-xl transition-all"
                >
                  +{filteredFisler.length - 30} fiş daha — Tümünü Gör
                </motion.button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Mobile FAB - Yeni Fiş */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 300 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          if (!canAdd) {
            toast.error('İşlem yapma yetkiniz bulunmamaktadır.');
            return;
          }
          if (isDayClosed) {
            toast.error(t('salesPage.dayEndClosedDesc'));
            return;
          }
          handleReset();
          setIsNewFisModalOpen(true);
        }}
        disabled={isDayClosed}
        className={`sm:hidden fixed bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.5rem))] right-4 z-40 w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center ${
          isDayClosed
            ? 'bg-secondary text-muted-foreground'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-600/40'
        }`}
      >
        <Plus className="w-6 h-6" />
      </motion.button>
    </div>
  );
}