// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useMemo, useEffect } from 'react';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { 
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Unlock,
  Receipt,
  DollarSign,
  ShoppingCart,
  Wallet,
  TrendingDown,
  FileWarning,
  Camera,
  Download,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { generateGunSonuPDF, type GunSonuPDFData } from '../utils/reportGenerator';
import { kvGet, kvSet } from '../lib/pouchdb-kv';

interface Transaction {
  id: string;
  type: 'sale' | 'payment' | 'expense' | 'stock';
  time: string;
  description: string;
  amount: number;
  employee: string;
  customer?: string;
  hasReceipt: boolean;
  status: 'completed' | 'warning';
}

export function GunSonuPage() {
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { emit } = useModuleBus();

  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canAdd } = getPagePermissions(user, currentEmployee, 'gunsonu');

  // Bugünün tarihini ISO formatında al
  const todayISO = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayTR = useMemo(() => new Date().toLocaleDateString('tr-TR'), []);

  // Gün sonu kapatma durumunu localStorage'dan yükle (tarih bazlı)
  const GUN_SONU_KEY = `isleyen_et_gun_sonu_${todayISO}`;
  const [isDayClosed, setIsDayClosed] = useState(() => {
    try {
      const saved = localStorage.getItem(GUN_SONU_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.closed === true;
      }
      return false;
    } catch {
      return false;
    }
  });
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isReopenDialogOpen, setIsReopenDialogOpen] = useState(false);

  // BUG FIX [AJAN-2]: Mount'ta KV'den gün sonu durumunu yükle — başka cihazdaki kapanış görünsün
  useEffect(() => {
    const local = localStorage.getItem(GUN_SONU_KEY);
    if (!local) {
      kvGet<{ closed: boolean }>(`gun_sonu_${todayISO}`).then(remote => {
        if (remote && remote.closed === true) {
          setIsDayClosed(true);
          localStorage.setItem(GUN_SONU_KEY, JSON.stringify(remote));
          window.dispatchEvent(new Event('storage_update'));
        }
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Storage'dan veri yenileme counter'ı
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Storage değişikliklerini dinle
  useEffect(() => {
    const handler = () => setRefreshCounter(c => c + 1);
    window.addEventListener('storage_update', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('storage_update', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  // Gerçek verilerden bugünün işlemlerini yükle
  const transactions = useMemo(() => {
    const rawFisler = getFromStorage<any[]>(StorageKey.FISLER) || [];
    const rawKasa = getFromStorage<any[]>(StorageKey.KASA_DATA) || [];
    const result: Transaction[] = [];

    // Fişlerden bugünkü satış/alış işlemlerini al
    rawFisler.forEach(f => {
      const fisDate = f.date ? f.date.split('T')[0] : '';
      if (fisDate !== todayISO) return;

      const isSatis = f.mode === 'satis' || f.mode === 'sale';
      const isAlis = f.mode === 'alis';
      const isGider = f.mode === 'gider';

      if (isSatis || isAlis) {
        // Satış/Alış fişlerini toplam tutar ile ekle
        let salesTotal = 0;
        let returnTotal = 0;
        (f.items || []).forEach((item: any) => {
          const absAmount = Math.abs(item.totalPrice || item.total || 0);
          if (item.type === 'iade') {
            returnTotal += absAmount;
          } else {
            salesTotal += absAmount;
          }
        });
        const netAmount = salesTotal - returnTotal;

        result.push({
          id: f.id,
          type: isSatis ? 'sale' : 'stock',
          time: f.date ? new Date(f.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-',
          description: `${isSatis ? 'Satış' : 'Alış'} - ${f.cari?.companyName || 'Peşin İşlem'}`,
          amount: isSatis ? netAmount : -netAmount,
          employee: f.employeeName || 'Bilinmeyen',
          customer: f.cari?.companyName,
          hasReceipt: !!f.photo,
          status: f.photo ? 'completed' : 'warning',
        });
      } else if (isGider) {
        result.push({
          id: f.id,
          type: 'expense',
          time: f.date ? new Date(f.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-',
          description: `Gider - ${f.category || 'Genel'}`,
          amount: -(f.amount || 0),
          employee: f.employeeName || 'Bilinmeyen',
          hasReceipt: !!f.photo,
          status: f.photo ? 'completed' : 'warning',
        });
      }
    });

    // Kasa'dan bugünkü gelir/gider kayıtlarını al
    // Not: Gider fişlerinden gelen kasa kayıtları fisler döngüsünde zaten var, onları atla
    const fislerIdSet = new Set(rawFisler.map(f => f.id));
    rawKasa.forEach(k => {
      const kasaDate = k.date || '';
      // Kasa tarihi TR formatında veya ISO formatında olabilir
      const isToday = kasaDate === todayTR || kasaDate.startsWith(todayISO);
      if (!isToday) return;

      // Fiş kaynaklı gider kasa girişlerini atla (fisler döngüsünde zaten var)
      if (k.receiptNo && fislerIdSet.has(k.receiptNo)) return;

      const isGelir = k.type === 'Gelir' || k.type === 'income';
      result.push({
        id: k.id,
        type: isGelir ? 'payment' : 'expense',
        time: k.time || '-',
        description: k.description || k.category || (isGelir ? 'Tahsilat' : 'Gider'),
        amount: isGelir ? (k.amount || 0) : -(k.amount || 0),
        employee: k.employee || 'Bilinmeyen',
        hasReceipt: true,
        status: 'completed',
      });
    });

    // Saate göre sırala — "HH:MM" veya "HH.MM" biçimlerini normalize et
    const toMinutes = (t: string) => {
      const parts = t.replace('.', ':').split(':');
      if (parts.length < 2) return 0;
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };
    return result.sort((a, b) => toMinutes(b.time) - toMinutes(a.time));
  }, [todayISO, todayTR, refreshCounter]);

  const totalSales = transactions
    .filter(t => t.type === 'sale')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPayments = transactions
    .filter(t => t.type === 'payment')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = Math.abs(transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0));

  const totalStockCost = Math.abs(transactions
    .filter(t => t.type === 'stock')
    .reduce((sum, t) => sum + t.amount, 0));

  const warningCount = transactions.filter(t => t.status === 'warning').length;

  const netCash = totalPayments - totalExpenses - totalStockCost;

  // ─── Dashboard çapraz doğrulama ────────────────────────────────────────────
  const crossValidation = useMemo(() => {
    // Dashboard ile aynı hesaplama mantığını kullan
    const rawFisler = getFromStorage<any[]>(StorageKey.FISLER) || [];
    const todaySalesFisler = rawFisler.filter(
      f => (f.mode === 'sale' || f.mode === 'satis') && f.date?.startsWith(todayISO)
    );
    const dashboardRevenue = todaySalesFisler.reduce((sum: number, item: any) => {
      let net = 0;
      (item.items || []).forEach((p: any) => {
        const amount = Math.abs(p.totalPrice || p.total || (p.unitPrice || p.price || 0) * (p.quantity || 0));
        if (p.type === 'iade') {
          net -= amount;
        } else {
          net += amount;
        }
      });
      return sum + net;
    }, 0);

    const diff = Math.abs(dashboardRevenue - totalSales);
    const match = diff < 1; // 1 TL tolerans

    return { dashboardRevenue, gunSonuSales: totalSales, match, diff };
  }, [todayISO, totalSales, refreshCounter]);

  // ─── Kasa çapraz doğrulama ─────────────────────────────────────────────────
  const kasaValidation = useMemo(() => {
    const rawKasa = getFromStorage<any[]>(StorageKey.KASA_DATA) || [];
    const rawFisler = getFromStorage<any[]>(StorageKey.FISLER) || [];
    const todayTRLocal = new Date().toLocaleDateString('tr-TR');

    const kasaTodayIncome = rawKasa
      .filter(k => {
        const isToday = k.date === todayTRLocal || (k.date && k.date.startsWith(todayISO));
        return isToday && (k.type === 'Gelir' || k.type === 'income');
      })
      .reduce((s: number, k: any) => s + (k.amount || 0), 0);

    // Kasa giderleri = sadece gerçek giderler (mal alışı hariç)
    const kasaTodayExpense = rawKasa
      .filter(k => {
        const isToday = k.date === todayTRLocal || (k.date && k.date.startsWith(todayISO));
        if (!isToday || !(k.type === 'Gider' || k.type === 'expense')) return false;
        // Mal alışı kaynaklı kasa girişlerini hariç tut
        if (k.category === 'Mal Alışı' || k.category === 'Stok Alışı' || k.receiptMode === 'alis') return false;
        return true;
      })
      .reduce((s: number, k: any) => s + (k.amount || 0), 0);

    // Mal alışı tutarlarını ayrı hesapla (kasadaki alış kayıtları)
    const kasaTodayPurchase = rawKasa
      .filter(k => {
        const isToday = k.date === todayTRLocal || (k.date && k.date.startsWith(todayISO));
        if (!isToday || !(k.type === 'Gider' || k.type === 'expense')) return false;
        return k.category === 'Mal Alışı' || k.category === 'Stok Alışı' || k.receiptMode === 'alis';
      })
      .reduce((s: number, k: any) => s + (k.amount || 0), 0);

    const kasaNet = kasaTodayIncome - kasaTodayExpense - kasaTodayPurchase;
    const kasaTotalBalance = rawKasa.reduce((s: number, k: any) => {
      return s + ((k.type === 'Gelir' || k.type === 'income') ? (k.amount || 0) : -(k.amount || 0));
    }, 0);

    // Gün sonu net kasa ile karşılaştır
    const diff = Math.abs(netCash - kasaNet);
    const match = diff < 1;

    return { kasaTodayIncome, kasaTodayExpense, kasaNet, kasaTotalBalance, match, diff, kasaTodayPurchase };
  }, [todayISO, netCash, refreshCounter]);

  // ─── PDF İndirme ───────────────────────────────────────────────────────────
  const handleDownloadPDF = () => {
    const pdfData: GunSonuPDFData = {
      date: todayTR,
      closedBy: currentEmployee?.name || 'Bilinmeyen',
      totalSales,
      totalPurchases: totalStockCost,
      totalPayments,
      totalExpenses,
      netCash,
      transactionCount: transactions.length,
      warningCount,
      transactions: transactions.map(t => ({
        time: t.time,
        type: t.type,
        description: t.description,
        amount: t.amount,
        employee: t.employee,
        hasReceipt: t.hasReceipt,
      })),
      crossValidation: {
        dashboardRevenue: crossValidation.dashboardRevenue,
        gunSonuSales: crossValidation.gunSonuSales,
        match: crossValidation.match,
      },
      kasaValidation: {
        kasaTodayIncome: kasaValidation.kasaTodayIncome,
        kasaTodayExpense: kasaValidation.kasaTodayExpense,
        kasaNet: kasaValidation.kasaNet,
        kasaTotalBalance: kasaValidation.kasaTotalBalance,
        match: kasaValidation.match,
      },
    };
    generateGunSonuPDF(pdfData);
    toast.success('Gün sonu raporu PDF olarak indirildi');
  };

  const handleCloseDay = () => {
    if (!canAdd) {
      toast.error('Gün sonu kapatma yetkiniz bulunmamaktadır.');
      logActivity('security_alert', 'Yetkisiz Gün Sonu Kapatma', { level: 'high', employeeName: user?.name, description: 'Kullanıcı gün sonunu kapatmaya çalıştı ancak yetkisi yoktu.' });
      return;
    }
    setIsDayClosed(true);
    // localStorage'a kaydet (tarih bazlı)
    const gunSonuRecord = {
      closed: true,
      closedAt: new Date().toISOString(),
      closedBy: currentEmployee?.name || 'Bilinmeyen',
    };
    localStorage.setItem(GUN_SONU_KEY, JSON.stringify(gunSonuRecord));
    // BUG FIX [AJAN-2]: Gün sonu durumu KV store'a da yaz — çapraz cihaz senkronu
    kvSet(`gun_sonu_${todayISO}`, gunSonuRecord).catch(() => toast.warning('Gün sonu çapraz cihaz senkronizasyonu başarısız. Diğer cihazlar bu kapatmayı göremeyebilir.'));
    // Diğer sayfaları bilgilendir (SalesPage, KasaPage)
    window.dispatchEvent(new Event('storage_update'));
    setIsCloseDialogOpen(false);
    logActivity('day_end', 'Gün sonu kapatıldı', { employeeName: user?.name || currentEmployee?.name, page: 'GunSonu', description: `Gün sonu ${currentEmployee?.name} tarafından kapatıldı.` });
    emit('gunsonu:closed', { date: todayISO, totalSales });
    toast.success(`Gün sonu kapatıldı! İşlemi yapan: ${currentEmployee?.name}`);
  };

  const handleReopenDay = () => {
    if (!canAdd) {
      toast.error('Gün sonunu açma yetkiniz bulunmamaktadır.');
      logActivity('security_alert', 'Yetkisiz Gün Sonu Açma', { level: 'high', employeeName: user?.name, description: 'Kullanıcı gün sonunu tekrar açmaya çalıştı ancak yetkisi yoktu.' });
      return;
    }
    setIsDayClosed(false);
    // localStorage'dan kaldır
    localStorage.removeItem(GUN_SONU_KEY);
    // BUG FIX [AJAN-2]: Gün sonu açıldı — KV store'a da yaz
    kvSet(`gun_sonu_${todayISO}`, { closed: false, reopenedAt: new Date().toISOString(), reopenedBy: currentEmployee?.name || 'Bilinmeyen' })
      .catch(() => toast.warning('Gün sonu açma çapraz cihaz senkronizasyonu başarısız.'));
    // Diğer sayfaları bilgilendir (SalesPage, KasaPage)
    window.dispatchEvent(new Event('storage_update'));
    setIsReopenDialogOpen(false);
    logActivity('day_end', 'Gün sonu tekrar açıldı', { employeeName: user?.name || currentEmployee?.name, page: 'GunSonu', description: `Gün sonu ${currentEmployee?.name} tarafından tekrar açıldı.` });
    emit('gunsonu:reopened', { date: todayISO });
    
    if (currentEmployee?.role !== 'Yönetici') {
      toast.info('Gün sonu iptal bildirimi yöneticiye gönderildi', {
        description: `${currentEmployee?.name} tarafından iptal edildi`
      });
    }
    
    toast.success('Gün sonu tekrar açıldı');
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'sale':
        return ShoppingCart;
      case 'payment':
        return Wallet;
      case 'expense':
        return TrendingDown;
      case 'stock':
        return Receipt;
      default:
        return Receipt;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'sale':
        return 'text-blue-400';
      case 'payment':
        return 'text-green-400';
      case 'expense':
        return 'text-red-400';
      case 'stock':
        return 'text-purple-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getTransactionBg = (type: string) => {
    switch (type) {
      case 'sale':
        return 'bg-blue-600/10 border-blue-600/30';
      case 'payment':
        return 'bg-green-600/10 border-green-600/30';
      case 'expense':
        return 'bg-red-600/10 border-red-600/30';
      case 'stock':
        return 'bg-purple-600/10 border-purple-600/30';
      default:
        return 'bg-secondary border-border';
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-28 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1 sm:mb-2">{t('dayEnd.operations')}</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {t('common.date')}: <span className="text-white">{new Date().toLocaleDateString('tr-TR')}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
          {isDayClosed && (
            <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-red-900/20 border border-red-800 rounded-lg">
              <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
              <span className="text-red-400 font-medium text-xs sm:text-sm">{t('dayEnd.dayClosed')}</span>
            </div>
          )}
          {!isDayClosed ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsCloseDialogOpen(true)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold rounded-lg transition-colors shadow-lg flex-1 sm:flex-none justify-center text-sm sm:text-base"
            >
              <Lock className="w-4 h-4 sm:w-5 sm:h-5" />
              {t('dayEnd.closeDayBtn')}
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsReopenDialogOpen(true)}
              className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-bold rounded-lg transition-colors shadow-lg flex-1 sm:flex-none justify-center text-sm sm:text-base"
            >
              <Unlock className="w-4 h-4 sm:w-5 sm:h-5" />
              {t('dayEnd.cancelDayEnd')}
            </motion.button>
          )}
        </div>
      </div>

      {/* Özet Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-900/20 border border-blue-800 rounded-xl p-3 sm:p-4"
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
            <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            <p className="text-[10px] sm:text-sm text-muted-foreground">{t('dayEnd.totalSales')}</p>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-blue-400">₺{totalSales.toLocaleString()}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-green-900/20 border border-green-800 rounded-xl p-3 sm:p-4"
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
            <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
            <p className="text-[10px] sm:text-sm text-muted-foreground">{t('dayEnd.totalCollections')}</p>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-green-400">₺{totalPayments.toLocaleString()}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-red-900/20 border border-red-800 rounded-xl p-3 sm:p-4"
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
            <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            <p className="text-[10px] sm:text-sm text-muted-foreground">{t('dayEnd.totalExpenses')}</p>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-red-400">₺{totalExpenses.toLocaleString()}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-purple-900/20 border border-purple-800 rounded-xl p-3 sm:p-4"
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
            <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
            <p className="text-[10px] sm:text-sm text-muted-foreground">{t('dayEnd.stockCost')}</p>
          </div>
          <p className="text-lg sm:text-2xl font-bold text-purple-400">₺{totalStockCost.toLocaleString()}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card-premium rounded-xl p-3 sm:p-4 col-span-2 md:col-span-1"
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            <p className="text-[10px] sm:text-sm text-muted-foreground">{t('dayEnd.netCash')}</p>
          </div>
          <p className={`text-lg sm:text-2xl font-bold ${netCash >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ₺{netCash.toLocaleString()}
          </p>
        </motion.div>
      </div>

      {/* Uyarılar */}
      {warningCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-orange-900/20 border border-orange-800 rounded-xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3"
        >
          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-orange-400 font-bold text-sm sm:text-base mb-0.5 sm:mb-1">
              {warningCount} {t('dayEnd.missingReceipts')}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('dayEnd.missingReceiptsDesc')}
            </p>
          </div>
        </motion.div>
      )}

      {/* Çapraz Doğrulama + PDF İndir */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Dashboard Çapraz Doğrulama */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl p-5 border ${
            crossValidation.match
              ? 'bg-green-900/10 border-green-800'
              : 'bg-red-900/10 border-red-800'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            {crossValidation.match ? (
              <ShieldCheck className="w-6 h-6 text-green-400" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-red-400" />
            )}
            <div>
              <h3 className={`font-bold ${crossValidation.match ? 'text-green-400' : 'text-red-400'}`}>
                {t('dayEnd.crossValidation')}
              </h3>
              <p className="text-xs text-muted-foreground/70">{t('dayEnd.crossValidationDesc')}</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('dayEnd.dashboardRevenue')}:</span>
              <span className="text-white font-medium">₺{crossValidation.dashboardRevenue.toLocaleString('tr-TR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('dayEnd.dayEndSalesTotal')}:</span>
              <span className="text-white font-medium">₺{crossValidation.gunSonuSales.toLocaleString('tr-TR')}</span>
            </div>
            {!crossValidation.match && (
              <div className="flex justify-between pt-2 border-t border-red-800/50">
                <span className="text-red-400 font-medium">{t('dayEnd.difference')}:</span>
                <span className="text-red-400 font-bold">₺{crossValidation.diff.toLocaleString('tr-TR')}</span>
              </div>
            )}
            <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium text-center ${
              crossValidation.match
                ? 'bg-green-600/20 text-green-300'
                : 'bg-red-600/20 text-red-300'
            }`}>
              {crossValidation.match
                ? t('dayEnd.dataMatch')
                : t('dayEnd.discrepancyFound')}
            </div>
          </div>
        </motion.div>

        {/* Kasa Çapraz Doğrulama */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl p-5 border ${
            kasaValidation.match
              ? 'bg-green-900/10 border-green-800'
              : 'bg-red-900/10 border-red-800'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            {kasaValidation.match ? (
              <ShieldCheck className="w-6 h-6 text-green-400" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-red-400" />
            )}
            <div>
              <h3 className={`font-bold ${kasaValidation.match ? 'text-green-400' : 'text-red-400'}`}>
                {t('dayEnd.kasaCrossValidation')}
              </h3>
              <p className="text-xs text-muted-foreground/70">{t('dayEnd.kasaCrossValidationDesc')}</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('dayEnd.kasaDailyIncome')}:</span>
              <span className="text-white font-medium">₺{kasaValidation.kasaTodayIncome.toLocaleString('tr-TR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('dayEnd.kasaDailyExpense')}:</span>
              <span className="text-white font-medium">₺{kasaValidation.kasaTodayExpense.toLocaleString('tr-TR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('dayEnd.kasaDailyNet')}:</span>
              <span className="text-white font-medium">₺{kasaValidation.kasaNet.toLocaleString('tr-TR')}</span>
            </div>
            {!kasaValidation.match && (
              <div className="flex justify-between pt-2 border-t border-red-800/50">
                <span className="text-red-400 font-medium">{t('dayEnd.difference')}:</span>
                <span className="text-red-400 font-bold">₺{kasaValidation.diff.toLocaleString('tr-TR')}</span>
              </div>
            )}
            <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium text-center ${
              kasaValidation.match
                ? 'bg-green-600/20 text-green-300'
                : 'bg-red-600/20 text-red-300'
            }`}>
              {kasaValidation.match
                ? t('dayEnd.dataMatch')
                : t('dayEnd.discrepancyFound')}
            </div>
          </div>
        </motion.div>

        {/* PDF İndir */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-premium rounded-xl p-5 flex flex-col justify-between"
        >
          <div>
            <h3 className="text-white font-bold mb-2">{t('dayEnd.report')}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('dayEnd.reportDesc')}
            </p>
          </div>
          <button
            onClick={handleDownloadPDF}
            disabled={transactions.length === 0}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all"
          >
            <Download className="w-5 h-5" />
            {t('dayEnd.downloadPdf')}
          </button>
        </motion.div>
      </div>

      {/* İşlem Listesi */}
      <div className="card-premium rounded-xl overflow-hidden">
        <div className="p-3 sm:p-4 md:p-6 border-b border-border">
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-white">{t('dayEnd.allTransactions')}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
            {t('common.total')} {transactions.length} {t('dayEnd.transactionsCount')}
          </p>
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-secondary/50 flex items-center justify-center mb-4">
              <Receipt className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground text-sm sm:text-base font-medium">Bugün henüz işlem yok</p>
            <p className="text-muted-foreground/50 text-xs sm:text-sm mt-1">Satış veya gider ekleyerek başlayın</p>
          </div>
        ) : (
        <div className="divide-y divide-border/65">
          {transactions.map((transaction, index) => {
            const Icon = getTransactionIcon(transaction.type);
            const color = getTransactionColor(transaction.type);
            const bgColor = getTransactionBg(transaction.type);

            return (
              <motion.div
                key={transaction.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-3 sm:p-4 hover:bg-secondary/30 active:bg-secondary/40 transition-colors ${
                  !transaction.hasReceipt ? 'bg-orange-900/10' : ''
                }`}
              >
                <div className="flex items-start sm:items-center gap-2.5 sm:gap-4">
                  {/* Icon & Time */}
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <div className={`p-2 sm:p-2.5 md:p-3 rounded-lg border ${bgColor}`}>
                      <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 ${color}`} />
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-white font-medium text-xs sm:text-sm md:text-base truncate">{transaction.description}</p>
                      {/* Mobile receipt badge */}
                      <span className="sm:hidden flex-shrink-0">
                        {transaction.hasReceipt ? (
                          <Camera className="w-3 h-3 text-green-400" />
                        ) : (
                          <FileWarning className="w-3 h-3 text-orange-400" />
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-0.5 text-[10px] sm:text-xs text-muted-foreground/70">
                      <span className="font-mono">{transaction.time}</span>
                      <span>{t('dayEnd.performedBy')}: <span className="text-muted-foreground">{transaction.employee}</span></span>
                      {transaction.customer && (
                        <span className="hidden sm:inline">{t('dayEnd.customer')}: <span className="text-muted-foreground">{transaction.customer}</span></span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm sm:text-base md:text-xl font-bold ${
                      transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {transaction.amount > 0 ? '+' : ''}₺{Math.abs(transaction.amount).toLocaleString()}
                    </p>
                  </div>

                  {/* Status - desktop */}
                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                    {transaction.hasReceipt ? (
                      <div className="flex items-center gap-1 px-2.5 py-1 bg-green-900/20 border border-green-800 rounded-lg">
                        <Camera className="w-3 h-3 text-green-400" />
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 px-2.5 py-1 bg-orange-900/20 border border-orange-800 rounded-lg">
                        <FileWarning className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-xs text-orange-400">{t('dayEnd.noReceipt')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
        )}
      </div>

      {/* Gün Sonu Kapat Dialog */}
      <AlertDialog.Root open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <AlertDialog.Content className="fixed z-50 shadow-2xl border border-border sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-md sm:rounded-xl bottom-0 left-0 right-0 sm:bottom-auto sm:left-1/2 sm:right-auto rounded-t-2xl sm:rounded-xl glass-strong p-4 sm:p-6 w-full sm:w-[95vw] max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <AlertDialog.Title className="text-xl font-bold text-white">
                {t('dayEnd.closeDayBtn')}
              </AlertDialog.Title>
            </div>
            <AlertDialog.Description asChild>
              <div className="text-muted-foreground mb-6">
                {t('dayEnd.closeDayConfirmDesc')}
              
                {warningCount > 0 && (
                  <div className="mt-4 p-3 bg-orange-900/20 border border-orange-800 rounded-lg">
                    <p className="text-orange-400 text-sm font-medium">
                      ⚠️ {warningCount} {t('dayEnd.missingReceipts')}
                    </p>
                  </div>
                )}

                <div className="mt-4 p-4 bg-secondary rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{t('dayEnd.totalTransactions')}:</span>
                    <span className="text-white font-medium">{transactions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('dayEnd.netCash')}:</span>
                    <span className={`font-bold ${netCash >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ₺{netCash.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border">
                    <span>{t('dayEnd.performedBy')}:</span>
                    <span className="text-blue-400 font-medium">{currentEmployee?.name}</span>
                  </div>
                </div>
              </div>
            </AlertDialog.Description>
            <div className="flex gap-3">
              <AlertDialog.Action asChild>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCloseDay}
                  className="flex-1 py-3.5 sm:py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold rounded-lg transition-colors text-sm sm:text-base"
                >
                  {t('dayEnd.yesClose')}
                </motion.button>
              </AlertDialog.Action>
              <AlertDialog.Cancel asChild>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 py-3.5 sm:py-3 bg-secondary hover:bg-muted active:bg-accent text-white font-bold rounded-lg transition-colors text-sm sm:text-base"
                >
                  {t('common.cancel')}
                </motion.button>
              </AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* Gün Sonu İptal Dialog */}
      <AlertDialog.Root open={isReopenDialogOpen} onOpenChange={setIsReopenDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <AlertDialog.Content className="fixed z-50 shadow-2xl border border-border sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-md sm:rounded-xl bottom-0 left-0 right-0 sm:bottom-auto sm:left-1/2 sm:right-auto rounded-t-2xl sm:rounded-xl glass-strong p-4 sm:p-6 w-full sm:w-[95vw] max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-600 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <AlertDialog.Title className="text-xl font-bold text-white">
                {t('dayEnd.cancelDayEnd')}
              </AlertDialog.Title>
            </div>
            <AlertDialog.Description asChild>
              <div className="text-muted-foreground mb-6">
                {t('dayEnd.cancelDayEndDesc')}

                {currentEmployee?.role !== 'Yönetici' && (
                  <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
                    <p className="text-red-400 text-sm font-medium">
                      ⚠️ {t('dayEnd.managerNotified')}
                    </p>
                  </div>
                )}

                <div className="mt-4 p-4 bg-card rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{t('dayEnd.performedBy')}:</span>
                    <span className="text-orange-400 font-medium">{currentEmployee?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('dayEnd.role')}:</span>
                    <span className="text-white font-medium">{currentEmployee?.role}</span>
                  </div>
                </div>
              </div>
            </AlertDialog.Description>
            <div className="flex gap-3">
              <AlertDialog.Action asChild>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleReopenDay}
                  className="flex-1 py-3.5 sm:py-3 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-bold rounded-lg transition-colors text-sm sm:text-base"
                >
                  {t('dayEnd.yesCancel')}
                </motion.button>
              </AlertDialog.Action>
              <AlertDialog.Cancel asChild>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 py-3.5 sm:py-3 bg-secondary hover:bg-muted active:bg-accent text-white font-bold rounded-lg transition-colors text-sm sm:text-base"
                >
                  {t('dayEnd.giveUp')}
                </motion.button>
              </AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}