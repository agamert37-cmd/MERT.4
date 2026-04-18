// [AJAN-2 | claude/serene-gagarin | 2026-03-24] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { FileText, Edit2, Trash2, Search, Calendar, User, DollarSign, X, Download, FileDown, Camera, Eye, Image as ImageIcon, Plus, Package, ArrowUpDown, Save, ZoomIn, Sparkles, RotateCcw, Archive, CalendarDays, ChevronDown, ChevronRight, Layers, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { kvGet, kvSet } from '../lib/pouchdb-kv';
import { getDb } from '../lib/pouchdb';
import { useEmployee } from '../contexts/EmployeeContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { useTableSync } from '../hooks/useTableSync';
import { useGlobalTableData } from '../contexts/GlobalTableSyncContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getCompanyInfo } from './SettingsPage';
import { addPDFHeader, addPDFFooter, addReportInfoBox, tableStyles } from '../utils/reportGenerator';
import { thermalPrint } from '../utils/thermalPrint';

// Turkce karakter sanitize
const sanitizePDF = (str: any) => {
  if (!str) return '-';
  return String(str)
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C');
};

interface Fis {
  id: string;
  mode: 'satis' | 'gider' | 'alis' | 'sale';
  employeeName?: string;
  cari?: any;
  category?: string;
  amount?: number;
  description?: string;
  total?: number;
  items?: any[];
  payment?: any;
  date: string;
  photo?: string;
}

// ───────── Animated Counter ─────────
const AnimatedCounter = ({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) => {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const duration = 800;
    const startTime = Date.now();
    const startVal = displayValue;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startVal + (value - startVal) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <span>{prefix}{displayValue.toLocaleString('tr-TR')}{suffix}</span>;
};

// ───────── Image Lightbox ─────────
const ImageLightbox = ({ src, onClose }: { src: string; onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md cursor-pointer"
    onClick={onClose}
  >
    <motion.div
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.7, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="relative max-w-[90vw] max-h-[90vh]"
      onClick={(e) => e.stopPropagation()}
    >
      <img src={src} alt="Belge" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
      <button
        onClick={onClose}
        className="absolute -top-3 -right-3 w-10 h-10 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full glass-strong text-foreground/80 text-xs">
        Kapatmak icin disa tiklayin
      </div>
    </motion.div>
  </motion.div>
);

export function FisHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { emit } = useModuleBus();

  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canEdit, canDelete } = getPagePermissions(user, currentEmployee, 'fisler');

  // useTableSync ile PouchDB/CouchDB senkronizasyonu
  const { data: syncedFisler, deleteItem: deleteFis, updateItem: updateFis, addItem: addFis } = useTableSync<Fis>({
    tableName: 'fisler',
    storageKey: StorageKey.FISLER,
    initialData: [],
    orderBy: 'date',
    orderAsc: false,
  });

  const fisler = syncedFisler;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'satis' | 'alis' | 'gider' | 'deleted'>('all');
  const [selectedFis, setSelectedFis] = useState<Fis | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedFisId, setExpandedFisId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'gunBazli'>('gunBazli');
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  // Silinen fişler
  const [deletedFisler, setDeletedFisler] = useState<(Fis & { deletedAt?: string; deletedBy?: string })[]>([]);
  const [showDeletedTab, setShowDeletedTab] = useState(false);

  // ── Edit modal state for full item editing ──
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAmount, setEditAmount] = useState(0);
  const [editPaymentAmount, setEditPaymentAmount] = useState(0);

  // Stok listesi (urun ekleme icin)
  const stokList = useGlobalTableData<any>('urunler');
  const [addProductSearch, setAddProductSearch] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Silinen fişler için başlangıç yüklemesi (KV fallback dahil)
  useEffect(() => {
    const local = getFromStorage<any[]>(StorageKey.DELETED_FISLER);
    if (local && local.length > 0) {
      setDeletedFisler(local);
    } else {
      // [AJAN-2] KV fallback — localStorage boşsa silinen fiş geçmişini KV'den yükle
      kvGet<any[]>('deleted_fisler').then(kv => {
        if (kv && kv.length > 0) {
          setDeletedFisler(kv);
          setInStorage(StorageKey.DELETED_FISLER, kv);
        }
      }).catch(() => {});
    }
  }, []);

  // URL param ?fisId=... → fiş otomatik seç + düzenleme modalı aç
  useEffect(() => {
    const fisId = searchParams.get('fisId');
    if (!fisId || fisler.length === 0) return;
    const target = fisler.find(f => f.id === fisId);
    if (target) {
      setSelectedFis(target);
      setIsDetailModalOpen(true);
      // URL'yi temizle (geri gelince tekrar açmasın)
      setSearchParams({}, { replace: true });
    }
  }, [fisler, searchParams]);

  // Filtreleme + siralama
  const filteredFisler = fisler
    .filter(fis => {
      const searchTermSafe = (searchTerm || '').toLowerCase();
      const matchesSearch =
        (fis?.employeeName || '').toLowerCase().includes(searchTermSafe) ||
        (fis?.category || '').toLowerCase().includes(searchTermSafe) ||
        (fis?.description || '').toLowerCase().includes(searchTermSafe) ||
        (fis?.cari?.companyName || '').toLowerCase().includes(searchTermSafe) ||
        (fis?.id || '').toLowerCase().includes(searchTermSafe);

      const fisMode = fis?.mode === 'sale' ? 'satis' : fis?.mode;
      const matchesFilter = filterMode === 'all' || fisMode === filterMode;

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

  // ── Gün bazlı gruplama ──
  const turkishDayNames = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi'];
  const turkishMonthNames = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];

  const dayGroupedFisler = useMemo(() => {
    const groups: Record<string, { dateKey: string; dayLabel: string; dayName: string; fisler: Fis[]; totalSatis: number; totalGider: number; totalAlis: number; fisCount: number }> = {};
    
    filteredFisler.forEach(fis => {
      const d = new Date(fis.date);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayName = turkishDayNames[d.getDay()];
      const dayLabel = `${d.getDate()} ${turkishMonthNames[d.getMonth()]} ${d.getFullYear()}, ${dayName}`;
      
      if (!groups[dateKey]) {
        groups[dateKey] = { dateKey, dayLabel, dayName, fisler: [], totalSatis: 0, totalGider: 0, totalAlis: 0, fisCount: 0 };
      }
      groups[dateKey].fisler.push(fis);
      groups[dateKey].fisCount++;
      
      const fisMode = fis.mode === 'sale' ? 'satis' : fis.mode;
      if (fisMode === 'satis') groups[dateKey].totalSatis += (fis.total || 0);
      else if (fisMode === 'alis') groups[dateKey].totalAlis += (fis.total || 0);
      else if (fisMode === 'gider') groups[dateKey].totalGider += (fis.amount || 0);
    });

    return Object.values(groups).sort((a, b) => 
      sortOrder === 'desc' ? b.dateKey.localeCompare(a.dateKey) : a.dateKey.localeCompare(b.dateKey)
    );
  }, [filteredFisler, sortOrder]);

  const toggleDayCollapse = (dateKey: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  // Fis silme (Silinenler geçmişine taşı)
  const handleDelete = (id: string) => {
    if (confirm('Bu fisi silmek istediginizden emin misiniz?')) {
      const fisToDelete = fisler.find(f => f.id === id);

      if (fisToDelete) {
        const isSatisAlis = fisToDelete.mode === 'satis' || fisToDelete.mode === 'sale' || fisToDelete.mode === 'alis';

        // ─── Stok geri al ───────────────────────────────────────
        if (isSatisAlis && fisToDelete.items?.length) {
          const existingStokList = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
          const updatedStokList = existingStokList.map(stock => {
            const matchItems = fisToDelete.items!.filter((p: any) => p.productName === stock.name);
            if (!matchItems.length) return stock;

            let netReversal = 0;
            matchItems.forEach((item: any) => {
              const absQty = Math.abs(item.quantity);
              // Orijinal işlemde ne oldu → tersini uygula
              let wasIncrease = false;
              if (fisToDelete.mode === 'satis' || fisToDelete.mode === 'sale') {
                wasIncrease = item.type === 'iade'; // iade stoku artırmıştı
              } else if (fisToDelete.mode === 'alis') {
                wasIncrease = item.type !== 'iade'; // alış stoku artırmıştı
              }
              netReversal += wasIncrease ? -absQty : absQty;
            });

            // Bu fişe ait hareket kayıtlarını da temizle
            const filteredMovements = (stock.movements || []).filter(
              (m: any) => !(m.description || '').includes(id)
            );

            return { ...stock, currentStock: stock.currentStock + netReversal, movements: filteredMovements };
          });
          setInStorage(StorageKey.STOK_DATA, updatedStokList);

          // PouchDB senkronizasyonu — değişen stok kayıtlarını CouchDB'ye de yansıt
          const changedProducts = updatedStokList.filter((p: any, i: number) => {
            const orig = existingStokList[i];
            return orig && p.currentStock !== orig.currentStock;
          });
          changedProducts.forEach(async (product: any) => {
            try {
              const db = getDb('urunler');
              const existing = await db.get(product.id) as any;
              await db.put({ ...existing, current_stock: product.currentStock });
            } catch {}
          });
        }

        // ─── Gider → Kasa kaydını sil ────────────────────────────
        if (fisToDelete.mode === 'gider') {
          const kasaList = getFromStorage<any[]>(StorageKey.KASA_DATA) || [];
          const kasaToDelete = kasaList.filter(k => k.receiptNo === id || k.fisId === id);
          if (kasaToDelete.length > 0) {
            const updatedKasa = kasaList.filter(k => k.receiptNo !== id && k.fisId !== id);
            setInStorage(StorageKey.KASA_DATA, updatedKasa);
            // PouchDB kasa_islemleri tablosundan da kaldır
            kasaToDelete.forEach(async (entry: any) => {
              try {
                const db = getDb('kasa_islemleri');
                const doc = await db.get(entry.id) as any;
                await db.remove(doc._id, doc._rev);
              } catch {}
            });
          }
        }

        // ─── Cari bakiyesi geri al ───────────────────────────────
        if (isSatisAlis && fisToDelete.cari?.id) {
          const cariList = getFromStorage<any[]>(StorageKey.CARI_DATA) || [];
          const updatedCariList = cariList.map(cari => {
            if (cari.id !== fisToDelete.cari.id) return cari;

            const total = fisToDelete.total || 0;
            const paidAmount = fisToDelete.payment?.amount || 0;
            // Orijinalde balance'a eklenen miktar: (total - paidAmount)
            // Silince geri çıkar → negatif delta
            const balanceReversal = -(total - paidAmount);

            const filteredHistory = (cari.transactionHistory || []).filter(
              (t: any) => !(t.fisId || '').includes(id) && !(t.description || '').includes(id)
            );

            return {
              ...cari,
              balance: cari.balance + balanceReversal,
              transactionHistory: filteredHistory,
            };
          });
          setInStorage(StorageKey.CARI_DATA, updatedCariList);
          // PouchDB cari_hesaplar güncelle (cross-device / mobile sync için)
          const updatedCari = updatedCariList.find((c: any) => c.id === fisToDelete.cari.id);
          if (updatedCari) {
            (async () => {
              try {
                const db = getDb('cari_hesaplar');
                const doc = await db.get(fisToDelete.cari.id) as any;
                await db.put({ ...doc, balance: updatedCari.balance, transactionHistory: updatedCari.transactionHistory });
              } catch {}
            })();
          }
        }

        // ─── Silinen fişi geçmişe ekle ─────────────────────────
        const deletedEntry = {
          ...fisToDelete,
          deletedAt: new Date().toISOString(),
          deletedBy: currentEmployee?.name || 'Bilinmeyen',
        };
        const updatedDeleted = [deletedEntry, ...deletedFisler].slice(0, 100);
        setDeletedFisler(updatedDeleted);
        setInStorage(StorageKey.DELETED_FISLER, updatedDeleted);
        kvSet('deleted_fisler', updatedDeleted).catch(() => {});
      }

      deleteFis(id).catch(e => console.warn('[FisHistory] PouchDB delete hatası:', e));

      emit('fis:deleted', { fisId: id, mode: fisToDelete?.mode });
      logActivity('custom', 'Fiş silindi (çöp kutusuna)', { employeeName: user?.name, page: 'FisHistory' });
      toast.success('Fis silinenler gecmisine tasindi');
    }
  };

  // Silinen fişi geri yükle
  const handleRestoreDeleted = (id: string) => {
    const fisToRestore = deletedFisler.find(f => f.id === id);
    if (!fisToRestore) return;

    // deletedAt ve deletedBy alanlarını kaldır
    const { deletedAt, deletedBy, ...cleanFis } = fisToRestore;
    addFis(cleanFis as Fis).catch(e => console.warn('[FisHistory] PouchDB restore hatası:', e));

    const updatedDeleted = deletedFisler.filter(f => f.id !== id);
    setDeletedFisler(updatedDeleted);
    setInStorage(StorageKey.DELETED_FISLER, updatedDeleted);
    kvSet('deleted_fisler', updatedDeleted).catch(() => {});

    logActivity('custom', 'Fiş geri yüklendi', { employeeName: user?.name, page: 'FisHistory' });
    toast.success('Fis basariyla geri yuklendi');
  };

  // Silinen fişi kalıcı olarak sil
  const handlePermanentDelete = (id: string) => {
    if (confirm('Bu fis kalici olarak silinecek. Emin misiniz?')) {
      const updatedDeleted = deletedFisler.filter(f => f.id !== id);
      setDeletedFisler(updatedDeleted);
      setInStorage(StorageKey.DELETED_FISLER, updatedDeleted);
      kvSet('deleted_fisler', updatedDeleted).catch(() => {});
      logActivity('custom', 'Fiş kalıcı olarak silindi', { employeeName: user?.name, page: 'FisHistory' });
      toast.success('Fis kalici olarak silindi');
    }
  };

  // Tüm silinen fişleri temizle
  const handleClearAllDeleted = () => {
    if (confirm('Tum silinen fisleri kalici olarak temizlemek istediginize emin misiniz?')) {
      setDeletedFisler([]);
      setInStorage(StorageKey.DELETED_FISLER, []);
      kvSet('deleted_fisler', []).catch(() => {});
      toast.success('Silinenler gecmisi temizlendi');
    }
  };

  // Fis duzenleme modali ac
  const handleEdit = (fis: Fis) => {
    setSelectedFis({ ...fis });
    setPhotoPreview(fis.photo || (fis as any).fisPhoto || null);
    setEditDescription(fis.description || '');
    setEditCategory(fis.category || '');
    setEditAmount(fis.amount || 0);
    setEditPaymentAmount(fis.payment?.amount || 0);
    setEditItems(fis.items ? fis.items.map((item: any, idx: number) => ({
      ...item,
      _editId: item.id || `item-${idx}-${Date.now()}`
    })) : []);
    setShowAddProduct(false);
    setAddProductSearch('');
    setIsEditModalOpen(true);
  };

  const handleDetail = (fis: Fis) => {
    setSelectedFis(fis);
    setIsDetailModalOpen(true);
  };

  const compressImage = (file: File, maxWidth = 1200, quality = 0.75): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onloadend = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas yok')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) compressImage(file).then(setPhotoPreview).catch(() => toast.error('Fotoğraf yüklenemedi'));
  };

  // ── Edit: urun guncelle ──
  const updateEditItem = (editId: string, field: string, value: any) => {
    setEditItems(prev => prev.map(item => {
      if (item._editId !== editId) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? value : (item.quantity || 0);
        const price = field === 'unitPrice' ? value : (item.unitPrice || item.price || 0);
        const isIade = item.type === 'iade';
        updated.totalPrice = isIade ? -(Math.abs(qty) * price) : Math.abs(qty) * price;
        if (field === 'quantity' && isIade) updated.quantity = -Math.abs(value);
      }
      return updated;
    }));
  };

  const removeEditItem = (editId: string) => {
    setEditItems(prev => prev.filter(item => item._editId !== editId));
    toast.info('Urun kaldirildi');
  };

  const addNewItemToEdit = (product: any, type: 'satis' | 'alis' | 'iade') => {
    const newItem = {
      _editId: `new-${Date.now()}`,
      id: `item-${Date.now()}`,
      productName: product.name,
      name: product.name,
      quantity: type === 'iade' ? -1 : 1,
      unit: product.unit || 'kg',
      unitPrice: product.price || 0,
      price: product.price || 0,
      totalPrice: type === 'iade' ? -(product.price || 0) : (product.price || 0),
      type,
    };
    setEditItems(prev => [...prev, newItem]);
    setShowAddProduct(false);
    setAddProductSearch('');
    toast.success(`${product.name} eklendi`);
  };

  // Toplam hesapla
  const calculateEditTotal = () => {
    return editItems.reduce((sum, item) => {
      const absTotal = Math.abs(item.totalPrice || 0);
      return item.type === 'iade' ? sum - absTotal : sum + absTotal;
    }, 0);
  };

  // Fis guncelleme
  const handleUpdate = async () => {
    if (!selectedFis) return;

    const isSatisAlis = selectedFis.mode === 'satis' || selectedFis.mode === 'sale' || selectedFis.mode === 'alis';
    const newItems = editItems.map(({ _editId, ...rest }) => rest);
    const newTotal = calculateEditTotal();

    // ─── Stok delta güncelle ───────────────────────────────────
    if (isSatisAlis) {
      const oldItems: any[] = selectedFis.items || [];
      const allProductNames = new Set([
        ...oldItems.map((i: any) => i.productName),
        ...newItems.map((i: any) => i.productName),
      ]);

      const existingStokList = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
      const updatedStokList = existingStokList.map(stock => {
        if (!allProductNames.has(stock.name)) return stock;

        // Orijinal fişin stok etkisi
        const oldEffect = oldItems
          .filter((i: any) => i.productName === stock.name)
          .reduce((sum: number, item: any) => {
            const absQty = Math.abs(item.quantity);
            let wasIncrease = false;
            if (selectedFis.mode === 'satis' || selectedFis.mode === 'sale') {
              wasIncrease = item.type === 'iade';
            } else if (selectedFis.mode === 'alis') {
              wasIncrease = item.type !== 'iade';
            }
            return sum + (wasIncrease ? absQty : -absQty);
          }, 0);

        // Güncel fişin stok etkisi
        const newEffect = newItems
          .filter((i: any) => i.productName === stock.name)
          .reduce((sum: number, item: any) => {
            const absQty = Math.abs(item.quantity);
            let isIncrease = false;
            if (selectedFis.mode === 'satis' || selectedFis.mode === 'sale') {
              isIncrease = item.type === 'iade';
            } else if (selectedFis.mode === 'alis') {
              isIncrease = item.type !== 'iade';
            }
            return sum + (isIncrease ? absQty : -absQty);
          }, 0);

        const delta = newEffect - oldEffect;
        if (delta === 0) return stock;

        return { ...stock, currentStock: stock.currentStock + delta };
      });
      setInStorage(StorageKey.STOK_DATA, updatedStokList);

      // PouchDB urunler tablosunu da güncelle (CouchDB sync için)
      updatedStokList.forEach(async (product: any, i: number) => {
        const orig = existingStokList[i];
        if (!orig || product.currentStock === orig.currentStock) return;
        try {
          const db = getDb('urunler');
          const doc = await db.get(product.id) as any;
          await db.put({ ...doc, current_stock: product.currentStock });
        } catch {}
      });
    }

    // ─── Cari bakiyesi delta güncelle ─────────────────────────
    if (isSatisAlis && selectedFis.cari?.id) {
      const oldTotal = selectedFis.total || 0;
      const oldPaid = selectedFis.payment?.amount || 0;
      const newPaid = editPaymentAmount;

      const oldBalanceEffect = oldTotal - oldPaid;
      const newBalanceEffect = newTotal - newPaid;
      const balanceDelta = newBalanceEffect - oldBalanceEffect;

      if (balanceDelta !== 0) {
        const cariList = getFromStorage<any[]>(StorageKey.CARI_DATA) || [];
        const updatedCariList = cariList.map(cari => {
          if (cari.id !== selectedFis.cari.id) return cari;
          return { ...cari, balance: cari.balance + balanceDelta };
        });
        setInStorage(StorageKey.CARI_DATA, updatedCariList);

        // PouchDB cari_hesaplar tablosunu da güncelle (CouchDB sync için)
        try {
          const db = getDb('cari_hesaplar');
          const doc = await db.get(selectedFis.cari.id) as any;
          await db.put({ ...doc, balance: (doc.balance || 0) + balanceDelta });
        } catch {}
      }
    }

    // ─── Fişi güncelle ────────────────────────────────────────
    const updatedFis: Fis = {
      ...selectedFis,
      description: editDescription,
      photo: photoPreview || undefined,
      ...(selectedFis.mode === 'gider' ? {
        category: editCategory,
        amount: editAmount,
      } : {}),
      ...(isSatisAlis ? {
        items: newItems,
        total: newTotal,
      } : {}),
      ...(selectedFis.payment ? {
        payment: { ...selectedFis.payment, amount: editPaymentAmount }
      } : {}),
    };

    // BUG FIX [AJAN-2]: useTableSync üzerinden güncelle — setInStorage bypass kaldırıldı
    updateFis(updatedFis.id, updatedFis).catch(e => console.warn('[FisHistory] PouchDB update hatası:', e));
    logActivity('custom', 'Fiş güncellendi', { employeeName: user?.name, page: 'FisHistory' });
    toast.success('Fis basariyla guncellendi');
    setIsEditModalOpen(false);
    setSelectedFis(null);
  };

  // Toplam istatistikler
  const stats = {
    totalSatis: fisler.filter(f => f.mode === 'satis' || f.mode === 'sale').reduce((sum, f) => sum + (f.total || 0), 0),
    totalAlis: fisler.filter(f => f.mode === 'alis').reduce((sum, f) => sum + (f.total || 0), 0),
    totalGider: fisler.filter(f => f.mode === 'gider').reduce((sum, f) => sum + (f.amount || 0), 0),
    count: fisler.length
  };

  const getModeLabel = (mode: string) => {
    if (mode === 'satis' || mode === 'sale') return 'SATIS';
    if (mode === 'alis') return 'ALIS';
    return 'GIDER';
  };

  const getModeColor = (mode: string) => {
    if (mode === 'satis' || mode === 'sale') return 'green';
    if (mode === 'alis') return 'blue';
    return 'red';
  };

  // ════════════ Termal Yazıcı Baskı ════════════
  const handleThermalPrint = (fis: Fis) => {
    thermalPrint(fis, getCompanyInfo());
  };

  // ════════════ PDF - Tek Fis (Detayli Adisyon) ════════════
  const handleDownloadSingleFisPDF = (fis: Fis) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const company = getCompanyInfo();

    // ─── Baslik ───
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePDF(company.companyName), 14, 16);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizePDF(company.slogan), 14, 22);
    const contactParts: string[] = [];
    if (company.phone) contactParts.push(`Tel: ${sanitizePDF(company.phone)}`);
    if (company.email) contactParts.push(sanitizePDF(company.email));
    if (contactParts.length > 0) {
      doc.text(contactParts.join(' | '), 14, 26);
    }

    const isSatis = fis.mode === 'satis' || fis.mode === 'sale';
    const isAlis = fis.mode === 'alis';
    const modeLabel = isSatis ? 'SATIS FISI' : isAlis ? 'ALIS FISI' : 'GIDER FISI';

    // Fis tipi badge (sag ust)
    const badgeColors = isSatis ? [22, 163, 74] : isAlis ? [37, 99, 235] : [220, 38, 38];
    doc.setFillColor(badgeColors[0], badgeColors[1], badgeColors[2]);
    doc.roundedRect(pageWidth - 50, 8, 36, 14, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(modeLabel, pageWidth - 32, 17, { align: 'center' });

    // ─── Fis Bilgi Kutusu ───
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, 34, pageWidth - 28, 24, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Fis No:', 20, 42);
    doc.text('Tarih:', 20, 48);
    doc.text('Saat:', 20, 54);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(fis.id.substring(0, 12).toUpperCase(), 42, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(fis.date ? new Date(fis.date).toLocaleDateString('tr-TR') : '-', 42, 48);
    doc.text(fis.date ? new Date(fis.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-', 42, 54);

    // Sag kisim
    doc.setTextColor(100, 116, 139);
    doc.text('Calisan:', 100, 42);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePDF(fis.employeeName || 'Bilinmeyen'), 125, 42);

    let currentY = 64;

    if (fis.mode === 'satis' || fis.mode === 'sale' || fis.mode === 'alis') {
      // ─── Cari Bilgileri ───
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, currentY, pageWidth - 28, 8, 2, 2, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('CARI / MUSTERI BILGILERI', 20, currentY + 6);
      currentY += 12;

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('Firma:', 20, currentY);
      doc.text('Yetkili:', 20, currentY + 6);
      doc.text('Telefon:', 20, currentY + 12);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizePDF(fis.cari?.companyName || '-'), 45, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(sanitizePDF(fis.cari?.contactPerson || '-'), 45, currentY + 6);
      doc.text(sanitizePDF(fis.cari?.phone || '-'), 45, currentY + 12);

      // Sag: Vergi bilgisi
      if (fis.cari?.taxNumber) {
        doc.setTextColor(100, 116, 139);
        doc.text('Vergi No:', 120, currentY);
        doc.setTextColor(15, 23, 42);
        doc.text(sanitizePDF(fis.cari.taxNumber), 150, currentY);
      }
      if (fis.cari?.taxOffice) {
        doc.setTextColor(100, 116, 139);
        doc.text('Vergi Dairesi:', 120, currentY + 6);
        doc.setTextColor(15, 23, 42);
        doc.text(sanitizePDF(fis.cari.taxOffice), 150, currentY + 6);
      }

      currentY += 20;

      // ─── Urun Detay Tablosu ───
      if (fis.items && fis.items.length > 0) {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(14, currentY, pageWidth - 28, 8, 2, 2, 'F');
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`URUN DETAYLARI (${fis.items.length} kalem)`, 20, currentY + 6);
        currentY += 12;

        // Iade ve normal kalemleri ayir
        let normalTotal = 0;
        let iadeTotal = 0;
        fis.items.forEach((item: any) => {
          const amt = Math.abs(item.totalPrice || (item.unitPrice || item.price || 0) * (item.quantity || 0));
          if (item.type === 'iade') iadeTotal += amt;
          else normalTotal += amt;
        });

        autoTable(doc, {
          head: [['#', 'Urun Adi', 'Tur', 'Miktar', 'Birim', 'B. Fiyat (TL)', 'Toplam (TL)']],
          body: fis.items.map((item: any, idx: number) => {
            const isIade = item.type === 'iade';
            const qty = Math.abs(item.quantity || 0);
            const unitPrice = item.unitPrice || item.price || 0;
            const totalPrice = Math.abs(item.totalPrice || qty * unitPrice);
            return [
              `${idx + 1}`,
              sanitizePDF(item.productName || item.name || '-'),
              isIade ? 'IADE' : (fis.mode === 'alis' ? 'Alis' : 'Satis'),
              `${qty.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
              sanitizePDF(item.unit || 'KG'),
              `${unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
              `${isIade ? '-' : ''}${totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
            ];
          }),
          startY: currentY,
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontSize: 8, fontStyle: 'bold' as const, halign: 'center' as const },
          bodyStyles: { fontSize: 8, textColor: [15, 23, 42] as [number, number, number] },
          alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' as const },
            1: { cellWidth: 'auto' as const },
            2: { halign: 'center' as const, cellWidth: 16, fontStyle: 'bold' as const },
            3: { halign: 'right' as const, cellWidth: 22 },
            4: { halign: 'center' as const, cellWidth: 16 },
            5: { halign: 'right' as const, cellWidth: 26 },
            6: { halign: 'right' as const, cellWidth: 28, fontStyle: 'bold' as const },
          },
          margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            if (data.section === 'body') {
              if (data.column.index === 2 && data.cell.raw === 'IADE') {
                data.cell.styles.textColor = [234, 88, 12];
                data.cell.styles.fontStyle = 'bold';
              }
              if (data.column.index === 6) {
                const val = data.cell.raw?.toString() || '';
                if (val.startsWith('-')) {
                  data.cell.styles.textColor = [234, 88, 12];
                  data.cell.styles.fillColor = [255, 247, 237];
                }
              }
            }
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + 4;

        // ─── Toplam Ozet Kutusu ───
        const boxW = 90;
        const boxX = pageWidth - boxW - 14;
        let boxH = 12;
        if (iadeTotal > 0) boxH += 7;

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.roundedRect(boxX, currentY, boxW, boxH + 14, 2, 2, 'FD');

        let ty = currentY + 7;
        if (iadeTotal > 0) {
          doc.setFontSize(8);
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'normal');
          doc.text('Siparis Tutari:', boxX + 4, ty);
          doc.setFont('helvetica', 'bold');
          doc.text(`${normalTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, boxX + boxW - 4, ty, { align: 'right' });
          ty += 7;

          doc.setTextColor(234, 88, 12);
          doc.setFont('helvetica', 'normal');
          doc.text('Iade Tutari:', boxX + 4, ty);
          doc.setFont('helvetica', 'bold');
          doc.text(`-${iadeTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, boxX + boxW - 4, ty, { align: 'right' });
          ty += 5;

          doc.setDrawColor(100, 116, 139);
          doc.line(boxX + 4, ty, boxX + boxW - 4, ty);
          ty += 6;
        }

        // Net Toplam
        const netTotal = normalTotal - iadeTotal;
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'normal');
        doc.text('NET TOPLAM:', boxX + 4, ty);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(badgeColors[0], badgeColors[1], badgeColors[2]);
        doc.text(`${netTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, boxX + boxW - 4, ty, { align: 'right' });

        currentY += boxH + 20;
      }

    } else {
      // ─── Gider Detaylari ───
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, currentY, pageWidth - 28, 8, 2, 2, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('GIDER DETAYLARI', 20, currentY + 6);
      currentY += 14;

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('Kategori:', 20, currentY);
      doc.text('Aciklama:', 20, currentY + 8);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizePDF(fis.category || '-'), 55, currentY);
      doc.setFont('helvetica', 'normal');
      const description = sanitizePDF(fis.description || '-');
      const splitDescription = doc.splitTextToSize(description, pageWidth - 75);
      doc.text(splitDescription, 55, currentY + 8);
      currentY += 8 + (splitDescription.length * 5) + 12;

      // Tutar kutusu
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.5);
      doc.roundedRect(pageWidth - 90, currentY, 76, 16, 3, 3, 'FD');
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('TUTAR:', pageWidth - 85, currentY + 7);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(`${(fis.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, pageWidth - 18, currentY + 12, { align: 'right' });
      currentY += 24;
    }

    // ─── Odeme Bilgileri ───
    if (fis.payment) {
      if (currentY > pageHeight - 60) { doc.addPage(); currentY = 20; }

      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, currentY, pageWidth - 28, 8, 2, 2, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('ODEME BILGILERI', 20, currentY + 6);
      currentY += 14;

      const payMethodLabel = fis.payment.method === 'nakit' ? 'Nakit' :
        fis.payment.method === 'kredi-karti' ? 'Kredi Karti' :
          fis.payment.method === 'havale' ? 'Havale/EFT' :
            fis.payment.method === 'cek' ? 'Cek' : 'Veresiye';

      // Odeme detay kutusu
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.1);
      const payBoxH = fis.payment.bankName ? 28 : 20;
      doc.roundedRect(14, currentY, pageWidth - 28, payBoxH, 2, 2, 'FD');

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('Odeme Yontemi:', 20, currentY + 6);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');

      const isVeresiye = payMethodLabel === 'Veresiye';
      if (isVeresiye) doc.setTextColor(220, 38, 38);
      else doc.setTextColor(22, 163, 74);
      doc.text(payMethodLabel, 55, currentY + 6);
      doc.setTextColor(15, 23, 42);

      if (fis.payment.bankName) {
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.text('Banka:', 20, currentY + 13);
        doc.setTextColor(15, 23, 42);
        doc.text(sanitizePDF(fis.payment.bankName), 55, currentY + 13);
      }

      const paidY = fis.payment.bankName ? currentY + 20 : currentY + 13;
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('Odenen Tutar:', 20, paidY);
      doc.setTextColor(22, 163, 74);
      doc.setFont('helvetica', 'bold');
      doc.text(`${(fis.payment.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, 55, paidY);

      // Sag taraf: Kalan/Veresiye
      const fisTotal = fis.total || fis.amount || 0;
      const paidAmount = fis.payment.amount || 0;
      const remaining = fisTotal - paidAmount;

      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('Fis Tutari:', 120, currentY + 6);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(`${fisTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, pageWidth - 18, currentY + 6, { align: 'right' });

      if (remaining > 0) {
        doc.setTextColor(220, 38, 38);
        doc.setFont('helvetica', 'normal');
        doc.text('Kalan (Veresiye):', 120, currentY + 13);
        doc.setFont('helvetica', 'bold');
        doc.text(`${remaining.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, pageWidth - 18, currentY + 13, { align: 'right' });
      } else {
        doc.setTextColor(22, 163, 74);
        doc.setFont('helvetica', 'bold');
        doc.text('TAMAMLANDI', pageWidth - 18, currentY + 13, { align: 'right' });
      }

      currentY += payBoxH + 10;
    }

    // ─── Imza Alani ───
    const signY = pageHeight - 35;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(14, signY, 75, signY);
    doc.line(pageWidth - 75, signY, pageWidth - 14, signY);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Teslim Eden', 14, signY + 4);
    doc.text(sanitizePDF(company.companyName), 14, signY + 8);
    doc.text('Teslim Alan', pageWidth - 75, signY + 4);
    if (fis.cari?.companyName) doc.text(sanitizePDF(fis.cari.companyName), pageWidth - 75, signY + 8);

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text('Bu belge elektronik ortamda olusturulmustur.', pageWidth / 2, pageHeight - 15, { align: 'center' });
    doc.text(`${sanitizePDF(company.companyName)} ERP | ${new Date().toLocaleString('tr-TR')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text(`Sayfa 1 / 1`, pageWidth - 14, pageHeight - 5, { align: 'right' });

    doc.save(`Fis_${isSatis ? 'Satis' : isAlis ? 'Alis' : 'Gider'}_${fis.id.substring(0, 8)}.pdf`);
    toast.success('PDF basariyla indirildi');
  };

  // ════════════ PDF - Tum Fisler ════════════
  const handleDownloadAllFisPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const company = getCompanyInfo();

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePDF(company.companyName), pageWidth / 2, 13, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizePDF(company.slogan), pageWidth / 2, 20, { align: 'center' });
    const contactLine = [company.phone ? `Tel: ${sanitizePDF(company.phone)}` : '', company.email ? sanitizePDF(company.email) : ''].filter(Boolean).join(' | ') || '';
    if (contactLine) doc.text(contactLine, pageWidth / 2, 26, { align: 'center' });
    if (company.address) doc.text(sanitizePDF(company.address), pageWidth / 2, 32, { align: 'center' });

    doc.setFillColor(59, 130, 246);
    doc.rect(0, 40, pageWidth, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('FIS GECMISI RAPORU', pageWidth / 2, 48, { align: 'center' });

    const cardY = 58;
    const cardWidth = (pageWidth - 40) / 3;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, cardY, cardWidth - 2, 20, 2, 2, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('TOPLAM FIS', 14 + cardWidth / 2 - 1, cardY + 6, { align: 'center' });
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(stats.count.toString(), 14 + cardWidth / 2 - 1, cardY + 15, { align: 'center' });
    doc.setFillColor(220, 252, 231);
    doc.roundedRect(14 + cardWidth, cardY, cardWidth - 2, 20, 2, 2, 'F');
    doc.setTextColor(22, 101, 52);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('TOPLAM SATIS', 14 + cardWidth * 1.5 - 1, cardY + 6, { align: 'center' });
    doc.setTextColor(21, 128, 61);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(stats.totalSatis.toLocaleString('tr-TR') + ' TL', 14 + cardWidth * 1.5 - 1, cardY + 15, { align: 'center' });
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(14 + cardWidth * 2, cardY, cardWidth - 2, 20, 2, 2, 'F');
    doc.setTextColor(153, 27, 27);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('TOPLAM GIDER', 14 + cardWidth * 2.5 - 1, cardY + 6, { align: 'center' });
    doc.setTextColor(185, 28, 28);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(stats.totalGider.toLocaleString('tr-TR') + ' TL', 14 + cardWidth * 2.5 - 1, cardY + 15, { align: 'center' });

    const netProfit = stats.totalSatis - stats.totalGider;
    const isProfit = netProfit >= 0;
    doc.setFillColor(isProfit ? 240 : 254, isProfit ? 253 : 242, isProfit ? 244 : 242);
    doc.roundedRect(14, cardY + 25, pageWidth - 28, 15, 2, 2, 'F');
    doc.setTextColor(isProfit ? 88 : 234, isProfit ? 28 : 88, isProfit ? 135 : 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('NET KAR/ZARAR:', pageWidth / 2 - 30, cardY + 33);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text((isProfit ? '+' : '') + netProfit.toLocaleString('tr-TR') + ' TL', pageWidth / 2 + 15, cardY + 33);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DETAYLI FIS LISTESI', 14, cardY + 50);

    autoTable(doc, {
      head: [['#', 'Tur', 'Calisan', 'Cari/Kategori', 'Kalem', 'Iade', 'Tutar (TL)', 'Odeme', 'Tarih']],
      body: filteredFisler.map((fis, idx) => {
        const isSale = fis.mode === 'satis' || fis.mode === 'sale';
        const isAlis = fis.mode === 'alis';
        const kalemCount = (fis.items || []).length;
        const iadeCount = (fis.items || []).filter((i: any) => i.type === 'iade').length;
        const payMethod = fis.payment?.method === 'nakit' ? 'Nakit' : 
                          fis.payment?.method === 'kredi-karti' ? 'K.Karti' :
                          fis.payment?.method === 'havale' ? 'Havale' :
                          fis.payment?.method === 'cek' ? 'Cek' : 'Veresiye';
        return [
          `${idx + 1}`,
          isSale ? 'SATIS' : isAlis ? 'ALIS' : 'GIDER',
          sanitizePDF(fis.employeeName || 'Bilinmeyen'),
          sanitizePDF(((isSale || isAlis) ? (fis.cari?.companyName || '-') : (fis.category || '-')).substring(0, 25)),
          kalemCount > 0 ? `${kalemCount}` : '-',
          iadeCount > 0 ? `${iadeCount}` : '-',
          (fis.total || fis.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
          payMethod,
          fis.date ? new Date(fis.date).toLocaleDateString('tr-TR') : '-'
        ];
      }),
      startY: cardY + 55,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontSize: 7, fontStyle: 'bold' as const, halign: 'center' as const },
      bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] as [number, number, number], lineWidth: 0.1, lineColor: [226, 232, 240] as [number, number, number] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' as const },
        1: { cellWidth: 16, halign: 'center' as const, fontStyle: 'bold' as const },
        2: { cellWidth: 25 },
        3: { cellWidth: 'auto' as const },
        4: { cellWidth: 12, halign: 'center' as const },
        5: { cellWidth: 12, halign: 'center' as const },
        6: { halign: 'right' as const, cellWidth: 26, fontStyle: 'bold' as const },
        7: { halign: 'center' as const, cellWidth: 18 },
        8: { halign: 'center' as const, cellWidth: 22 },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        if (data.section === 'body') {
          // Iade sayisi varsa turuncu
          if (data.column.index === 5 && data.cell.raw !== '-') {
            data.cell.styles.textColor = [234, 88, 12];
            data.cell.styles.fontStyle = 'bold';
          }
          // Veresiye kirmizi
          if (data.column.index === 7 && data.cell.raw === 'Veresiye') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
          // Tur renkleri
          if (data.column.index === 1) {
            if (data.cell.raw === 'SATIS') data.cell.styles.textColor = [22, 163, 74];
            else if (data.cell.raw === 'ALIS') data.cell.styles.textColor = [37, 99, 235];
            else data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    if (finalY < pageHeight - 30) {
      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageHeight - 25, pageWidth - 14, pageHeight - 25);
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.text('Bu rapor elektronik ortamda olusturulmustur ve guvenlidir.', pageWidth / 2, pageHeight - 18, { align: 'center' });
      doc.text(`${sanitizePDF(company.companyName)} - Kalite ve Guven`, pageWidth / 2, pageHeight - 13, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(`Sayfa 1 | Toplam ${filteredFisler.length} fis listelendi`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    }

    const fileName = `IsleyenET_Fis_Raporu_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')}.pdf`;
    doc.save(fileName);
    toast.success('PDF raporu basariyla indirildi');
  };

  // ════════════ PDF - Gun Bazli ════════════
  const handleDownloadDayPDF = (dayGroup: { dateKey: string; dayLabel: string; dayName: string; fisler: Fis[]; totalSatis: number; totalGider: number; totalAlis: number; fisCount: number }) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const company = getCompanyInfo();

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 32, 'F');
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePDF(company.companyName), 14, 15);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizePDF(company.slogan), 14, 21);
    const contactParts: string[] = [];
    if (company.phone) contactParts.push(`Tel: ${sanitizePDF(company.phone)}`);
    if (company.email) contactParts.push(sanitizePDF(company.email));
    if (contactParts.length > 0) doc.text(contactParts.join(' | '), 14, 27);

    // Gun baslik
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 36, pageWidth, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`${sanitizePDF(dayGroup.dayLabel)} - GUN RAPORU`, pageWidth / 2, 45, { align: 'center' });

    // Ozet kartlar
    const cardY = 56;
    const cardW = (pageWidth - 42) / 4;
    
    // Fis sayisi
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, cardY, cardW, 18, 2, 2, 'F');
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('TOPLAM FIS', 14 + cardW / 2, cardY + 6, { align: 'center' });
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${dayGroup.fisCount}`, 14 + cardW / 2, cardY + 14, { align: 'center' });

    // Satis
    doc.setFillColor(220, 252, 231);
    doc.roundedRect(14 + cardW + 3, cardY, cardW, 18, 2, 2, 'F');
    doc.setTextColor(22, 101, 52);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('SATIS', 14 + cardW * 1.5 + 3, cardY + 6, { align: 'center' });
    doc.setTextColor(21, 128, 61);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${dayGroup.totalSatis.toLocaleString('tr-TR')} TL`, 14 + cardW * 1.5 + 3, cardY + 14, { align: 'center' });

    // Alis
    doc.setFillColor(219, 234, 254);
    doc.roundedRect(14 + (cardW + 3) * 2, cardY, cardW, 18, 2, 2, 'F');
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('ALIS', 14 + cardW * 2.5 + 6, cardY + 6, { align: 'center' });
    doc.setTextColor(37, 99, 235);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${dayGroup.totalAlis.toLocaleString('tr-TR')} TL`, 14 + cardW * 2.5 + 6, cardY + 14, { align: 'center' });

    // Gider
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(14 + (cardW + 3) * 3, cardY, cardW, 18, 2, 2, 'F');
    doc.setTextColor(153, 27, 27);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('GIDER', 14 + cardW * 3.5 + 9, cardY + 6, { align: 'center' });
    doc.setTextColor(185, 28, 28);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${dayGroup.totalGider.toLocaleString('tr-TR')} TL`, 14 + cardW * 3.5 + 9, cardY + 14, { align: 'center' });

    let currentY = cardY + 26;

    // Fis listesi tablosu
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('FIS DETAYLARI', 14, currentY);
    currentY += 5;

    autoTable(doc, {
      head: [['#', 'Saat', 'Tur', 'Calisan', 'Cari/Kategori', 'Urunler', 'Tutar (TL)', 'Odeme']],
      body: dayGroup.fisler
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((fis, idx) => {
          const isSale = fis.mode === 'satis' || fis.mode === 'sale';
          const isAlis = fis.mode === 'alis';
          const saatStr = fis.date ? new Date(fis.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-';
          const urunSummary = (fis.items || []).length > 0
            ? (fis.items || []).slice(0, 3).map((i: any) => `${sanitizePDF(i.productName || i.name || '?')} x${Math.abs(i.quantity || 0)}`).join(', ') + ((fis.items || []).length > 3 ? ` +${(fis.items || []).length - 3}` : '')
            : '-';
          const payMethod = fis.payment?.method === 'nakit' ? 'Nakit' :
            fis.payment?.method === 'kredi-karti' ? 'K.Karti' :
              fis.payment?.method === 'havale' ? 'Havale' :
                fis.payment?.method === 'cek' ? 'Cek' : 'Veresiye';
          return [
            `${idx + 1}`,
            saatStr,
            isSale ? 'SATIS' : isAlis ? 'ALIS' : 'GIDER',
            sanitizePDF(fis.employeeName || '-'),
            sanitizePDF(((isSale || isAlis) ? (fis.cari?.companyName || 'Pesin') : (fis.category || '-')).substring(0, 20)),
            urunSummary.substring(0, 40),
            (fis.total || fis.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
            payMethod,
          ];
        }),
      startY: currentY,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontSize: 7, fontStyle: 'bold' as const, halign: 'center' as const },
      bodyStyles: { fontSize: 7, textColor: [15, 23, 42] as [number, number, number] },
      alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' as const },
        1: { cellWidth: 14, halign: 'center' as const },
        2: { cellWidth: 14, halign: 'center' as const, fontStyle: 'bold' as const },
        3: { cellWidth: 22 },
        4: { cellWidth: 28 },
        5: { cellWidth: 'auto' as const },
        6: { halign: 'right' as const, cellWidth: 24, fontStyle: 'bold' as const },
        7: { halign: 'center' as const, cellWidth: 16 },
      },
      margin: { left: 14, right: 14 },
      didParseCell: (data: any) => {
        if (data.section === 'body') {
          if (data.column.index === 2) {
            if (data.cell.raw === 'SATIS') data.cell.styles.textColor = [22, 163, 74];
            else if (data.cell.raw === 'ALIS') data.cell.styles.textColor = [37, 99, 235];
            else data.cell.styles.textColor = [220, 38, 38];
          }
          if (data.column.index === 7 && data.cell.raw === 'Veresiye') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;

    // Urun bazli ozet (bu gundeki tum urunler topluca)
    const urunMap: Record<string, { name: string; totalQty: number; totalAmount: number; unit: string }> = {};
    dayGroup.fisler.forEach(fis => {
      (fis.items || []).forEach((item: any) => {
        const name = item.productName || item.name || 'Bilinmeyen';
        const isIade = item.type === 'iade';
        const qty = Math.abs(item.quantity || 0);
        const total = Math.abs(item.totalPrice || 0);
        if (!urunMap[name]) urunMap[name] = { name, totalQty: 0, totalAmount: 0, unit: item.unit || 'KG' };
        urunMap[name].totalQty += isIade ? -qty : qty;
        urunMap[name].totalAmount += isIade ? -total : total;
      });
    });

    const urunList = Object.values(urunMap).sort((a, b) => b.totalAmount - a.totalAmount);
    if (urunList.length > 0) {
      if (currentY > pageHeight - 60) { doc.addPage(); currentY = 20; }
      
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('URUN BAZLI OZET', 14, currentY);
      currentY += 5;

      autoTable(doc, {
        head: [['Urun Adi', 'Birim', 'Toplam Miktar', 'Toplam Tutar (TL)']],
        body: urunList.map(u => [
          sanitizePDF(u.name),
          sanitizePDF(u.unit),
          u.totalQty.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
          u.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
        ]),
        startY: currentY,
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontSize: 7.5, fontStyle: 'bold' as const },
        bodyStyles: { fontSize: 7.5, textColor: [15, 23, 42] as [number, number, number] },
        alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
        columnStyles: {
          0: { cellWidth: 'auto' as const },
          1: { cellWidth: 18, halign: 'center' as const },
          2: { cellWidth: 30, halign: 'right' as const },
          3: { cellWidth: 35, halign: 'right' as const, fontStyle: 'bold' as const },
        },
        margin: { left: 14, right: 14 },
      });
    }

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Bu belge elektronik ortamda olusturulmustur.', pageWidth / 2, pageHeight - 15, { align: 'center' });
    doc.text(`${sanitizePDF(company.companyName)} ERP | ${sanitizePDF(dayGroup.dayLabel)}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    const dateForFile = dayGroup.dateKey.replace(/-/g, '');
    doc.save(`${sanitizePDF(dayGroup.dayName)}_${dateForFile}_Gun_Raporu.pdf`);
    toast.success(`${dayGroup.dayLabel} gun raporu indirildi`);
  };

  // Stat card config
  const statCards = [
    { label: 'Toplam Fis', value: stats.count, icon: FileText, color: 'blue', prefix: '', suffix: '', isCurrency: false },
    { label: 'Toplam Satis', value: stats.totalSatis, icon: DollarSign, color: 'green', prefix: '', suffix: '', isCurrency: true },
    { label: 'Toplam Alis', value: stats.totalAlis, icon: Package, color: 'blue', prefix: '', suffix: '', isCurrency: true },
    { label: 'Toplam Gider', value: stats.totalGider, icon: DollarSign, color: 'red', prefix: '', suffix: '', isCurrency: true },
  ];

  const filterTabs = [
    { key: 'all', label: 'Tumunu Gor', count: fisler.length },
    { key: 'satis', label: 'Satis', count: fisler.filter(f => f.mode === 'satis' || f.mode === 'sale').length, color: 'green' },
    { key: 'alis', label: 'Alis', count: fisler.filter(f => f.mode === 'alis').length, color: 'blue' },
    { key: 'gider', label: 'Gider', count: fisler.filter(f => f.mode === 'gider').length, color: 'red' },
    { key: 'deleted', label: 'Silinenler', count: deletedFisler.length, color: 'orange' },
  ];

  const filteredStokList = stokList.filter(p =>
    (p?.name || '').toLowerCase().includes((addProductSearch || '').toLowerCase())
  );

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImage && <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />}
      </AnimatePresence>

      {/* ═══════ Header ═══════ */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <FileText className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight">Fis Gecmisi</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">Tum satis, alis ve gider fislerini yonetin</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleDownloadAllFisPDF}
            disabled={filteredFisler.length === 0}
            className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-accent disabled:to-accent disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:shadow-none text-sm"
          >
            <FileDown className="w-4.5 h-4.5" />
            <span className="hidden sm:inline">Tum Fisleri PDF</span>
            <span className="sm:hidden">PDF</span>
          </motion.button>
        </div>
      </motion.div>

      {/* ═══════ Stat Cards ═══════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          const colorMap: Record<string, string> = {
            blue: 'from-blue-600/15 to-blue-600/5 border-blue-600/20',
            green: 'from-emerald-600/15 to-emerald-600/5 border-emerald-600/20',
            red: 'from-red-600/15 to-red-600/5 border-red-600/20',
          };
          const iconColorMap: Record<string, string> = { blue: 'text-blue-400', green: 'text-emerald-400', red: 'text-red-400' };
          const valueColorMap: Record<string, string> = { blue: 'text-blue-400', green: 'text-emerald-400', red: 'text-red-400' };
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: index * 0.08, type: 'spring', stiffness: 200, damping: 20 }}
              className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${colorMap[stat.color]} p-3 sm:p-5 group hover:scale-[1.02] transition-transform duration-300`}
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-white/[0.03] to-transparent rounded-bl-full" />
              <div className="flex items-center gap-2 sm:gap-2.5 mb-2 sm:mb-3">
                <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center shrink-0 ${iconColorMap[stat.color]}`}>
                  <Icon className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
                </div>
                <span className="text-muted-foreground text-[10px] sm:text-xs font-medium uppercase tracking-wider truncate">{stat.label}</span>
              </div>
              <p className={`text-lg sm:text-2xl md:text-3xl font-bold ${stat.isCurrency ? valueColorMap[stat.color] : 'text-white'}`}>
                {stat.isCurrency ? <AnimatedCounter value={stat.value} prefix="₺" /> : <AnimatedCounter value={stat.value} />}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* ═══════ Search & Filters ═══════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="card-premium rounded-2xl p-3 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex-1 relative group">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/70 group-focus-within:text-blue-400 transition-colors" />
            <input
              type="text"
              placeholder="Fis ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-secondary/50 border border-border/50 rounded-xl text-white text-sm sm:text-base placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
            {filterTabs.map(tab => {
              const isActive = filterMode === tab.key;
              const activeColorMap: Record<string, string> = {
                all: 'bg-blue-600 text-white shadow-blue-600/30',
                satis: 'bg-emerald-600 text-white shadow-emerald-600/30',
                alis: 'bg-blue-600 text-white shadow-blue-600/30',
                gider: 'bg-red-600 text-white shadow-red-600/30',
                deleted: 'bg-orange-600 text-white shadow-orange-600/30',
              };
              return (
                <motion.button
                  key={tab.key}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setFilterMode(tab.key as any)}
                  className={`relative px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all whitespace-nowrap flex-shrink-0 active:scale-95 ${
                    isActive
                      ? `${activeColorMap[tab.key]} shadow-lg`
                      : 'bg-secondary/60 text-muted-foreground hover:bg-accent/60 hover:text-foreground/80'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 text-xs ${isActive ? 'opacity-80' : 'opacity-50'}`}>
                    {tab.count}
                  </span>
                </motion.button>
              );
            })}

            <div className="flex items-center bg-secondary/60 rounded-xl p-0.5 border border-border/30">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-600/30 text-blue-400 shadow-sm' : 'text-muted-foreground/70 hover:text-foreground/80'}`}
                title="Liste Gorunumu"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('gunBazli')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'gunBazli' ? 'bg-blue-600/30 text-blue-400 shadow-sm' : 'text-muted-foreground/70 hover:text-foreground/80'}`}
                title="Gun Bazli Gorunum"
              >
                <CalendarDays className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="p-2.5 bg-secondary/60 hover:bg-accent/60 text-muted-foreground hover:text-white rounded-xl transition-all"
              title={sortOrder === 'desc' ? 'Eskiden yeniye' : 'Yeniden eskiye'}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* ═══════ Silinenler Listesi ═══════ */}
      {filterMode === 'deleted' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="card-premium rounded-2xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Archive className="w-4 h-4 text-orange-400" />
              Silinen Fisler
              <span className="text-sm font-normal text-muted-foreground/70 ml-1">({deletedFisler.length})</span>
            </h2>
            {deletedFisler.length > 0 && (
              <button
                onClick={handleClearAllDeleted}
                className="px-3 py-1.5 text-xs font-medium bg-red-600/15 hover:bg-red-600/25 text-red-400 rounded-lg transition-all"
              >
                Tumunu Temizle
              </button>
            )}
          </div>

          {deletedFisler.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="w-20 h-20 rounded-3xl bg-secondary/50 flex items-center justify-center mb-5">
                <Archive className="w-10 h-10 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground text-lg font-medium">Silinen fis bulunmuyor</p>
              <p className="text-muted-foreground/50 text-sm mt-1">Sildiginiz fisler burada gorunecek</p>
            </motion.div>
          ) : (
            <div className="divide-y divide-border/20">
              {deletedFisler.map((fis, index) => {
                const modeColor = getModeColor(fis.mode);
                const modeLabel = getModeLabel(fis.mode);
                const isSatisAlis = fis.mode === 'satis' || fis.mode === 'sale' || fis.mode === 'alis';
                const badgeMap: Record<string, string> = {
                  green: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
                  blue: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
                  red: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                };
                return (
                  <motion.div
                    key={`deleted-${fis.id}-${index}`}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.04, 0.5) }}
                    className="border-l-[3px] border-l-orange-500/50 hover:bg-secondary/30 transition-all duration-200 opacity-75 hover:opacity-100"
                  >
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="hidden md:flex flex-shrink-0">
                        <span className={`px-3 py-1.5 text-[11px] font-bold rounded-lg ${badgeMap[modeColor]}`}>
                          {modeLabel}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <span className="text-white font-semibold text-sm truncate">
                            {isSatisAlis ? fis.cari?.companyName || 'Pesin Islem' : fis.category || 'Kategorisiz'}
                          </span>
                          <span className="px-1.5 py-0.5 bg-orange-600/15 text-orange-400 text-[10px] font-bold rounded">
                            SILINDI
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground/70">
                          <span className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" />
                            {fis.employeeName || 'Bilinmeyen'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {fis.date ? new Date(fis.date).toLocaleDateString('tr-TR') : '-'}
                          </span>
                          <span className="flex items-center gap-1.5 text-orange-400/70">
                            <Trash2 className="w-3.5 h-3.5" />
                            Silen: {fis.deletedBy || '-'} • {fis.deletedAt ? new Date(fis.deletedAt).toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 mr-2">
                        <p className="text-lg font-bold text-muted-foreground line-through">
                          ₺{(fis.total || fis.amount || 0).toLocaleString('tr-TR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleRestoreDeleted(fis.id)}
                          className="p-2 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 transition-all"
                          title="Geri Yukle"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handlePermanentDelete(fis.id)}
                          className="p-2 rounded-lg bg-red-600/15 hover:bg-red-600/30 text-red-400 hover:text-red-300 transition-all"
                          title="Kalici Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* ═══════ Fis Listesi ═══════ */}
      {filterMode !== 'deleted' && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="space-y-4"
      >
        {filteredFisler.length === 0 ? (
          <div className="card-premium rounded-2xl overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="w-20 h-20 rounded-3xl bg-secondary/50 flex items-center justify-center mb-5">
                <FileText className="w-10 h-10 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground text-lg font-medium">Henuz fis bulunmuyor</p>
              <p className="text-muted-foreground/50 text-sm mt-1">Yeni fis ekleyerek baslayin</p>
            </motion.div>
          </div>
        ) : viewMode === 'gunBazli' ? (
          /* ═══════ GÜN BAZLI GÖRÜNÜM ═══════ */
          <div className="space-y-4">
            {dayGroupedFisler.map((dayGroup, dayIdx) => {
              const isCollapsed = collapsedDays.has(dayGroup.dateKey);
              const isToday = dayGroup.dateKey === new Date().toISOString().substring(0, 10);
              const isYesterday = (() => {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                return dayGroup.dateKey === y.toISOString().substring(0, 10);
              })();

              return (
                <motion.div
                  key={dayGroup.dateKey}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(dayIdx * 0.06, 0.4) }}
                  className="card-premium rounded-2xl overflow-hidden"
                >
                  {/* Gün Başlığı */}
                  <div
                    onClick={() => toggleDayCollapse(dayGroup.dateKey)}
                    className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 cursor-pointer hover:bg-secondary/20 transition-colors border-b border-border/20"
                  >
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                      isToday ? 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/20' :
                      isYesterday ? 'bg-gradient-to-br from-accent to-accent' :
                      'bg-gradient-to-br from-accent/60 to-secondary/60'
                    }`}>
                      <span className="text-white text-lg font-bold leading-none">{new Date(dayGroup.dateKey + 'T00:00:00').getDate()}</span>
                      <span className="text-white/60 text-[9px] font-medium uppercase">{dayGroup.dayName.substring(0, 3)}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-bold text-sm">{dayGroup.dayLabel}</h3>
                        {isToday && (
                          <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-full">BUGUN</span>
                        )}
                        {isYesterday && (
                          <span className="px-2 py-0.5 bg-accent/20 text-muted-foreground text-[10px] font-bold rounded-full">DUN</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5 mt-0.5 sm:mt-1 text-[10px] sm:text-[11px]">
                        <span className="text-muted-foreground/70">{dayGroup.fisCount} fis</span>
                        {dayGroup.totalSatis > 0 && (
                          <span className="text-emerald-400 font-medium">₺{dayGroup.totalSatis.toLocaleString('tr-TR')}</span>
                        )}
                        {dayGroup.totalAlis > 0 && (
                          <span className="text-blue-400 font-medium">₺{dayGroup.totalAlis.toLocaleString('tr-TR')}</span>
                        )}
                        {dayGroup.totalGider > 0 && (
                          <span className="text-red-400 font-medium">-₺{dayGroup.totalGider.toLocaleString('tr-TR')}</span>
                        )}
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={(e) => { e.stopPropagation(); handleDownloadDayPDF(dayGroup); }}
                      className="p-2 rounded-lg bg-purple-600/15 hover:bg-purple-600/25 text-purple-400 hover:text-purple-300 transition-all flex-shrink-0"
                      title="Gun PDF Indir"
                    >
                      <FileDown className="w-4 h-4" />
                    </motion.button>

                    <div className="flex-shrink-0 text-muted-foreground/70">
                      {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>

                  {/* Günün Fişleri */}
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="divide-y divide-border/15">
                          {dayGroup.fisler.map((fis, index) => {
                            const modeColor = getModeColor(fis.mode);
                            const modeLabel = getModeLabel(fis.mode);
                            const hasPhoto = !!(fis.photo || (fis as any).fisPhoto);
                            const isSatisAlis = fis.mode === 'satis' || fis.mode === 'sale' || fis.mode === 'alis';
                            const borderColorMap: Record<string, string> = {
                              green: 'border-l-emerald-500',
                              blue: 'border-l-blue-500',
                              red: 'border-l-red-500'
                            };
                            const badgeMap: Record<string, string> = {
                              green: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
                              blue: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
                              red: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                            };

                            return (
                              <motion.div
                                key={fis.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: Math.min(index * 0.03, 0.3) }}
                                className={`border-l-[3px] ${borderColorMap[modeColor]} hover:bg-secondary/20 transition-all duration-200`}
                              >
                                <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3">
                                  {/* Saat */}
                                  <div className="flex-shrink-0 w-10 sm:w-12 text-center">
                                    <span className="text-white font-mono text-xs sm:text-sm font-bold">
                                      {fis.date ? new Date(fis.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                    </span>
                                  </div>

                                  {/* Mode Badge */}
                                  <div className="hidden md:flex flex-shrink-0">
                                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${badgeMap[modeColor]}`}>
                                      {modeLabel}
                                    </span>
                                  </div>

                                  {/* Main Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className={`md:hidden px-1.5 py-0.5 text-[9px] font-bold rounded ${badgeMap[modeColor]}`}>
                                        {modeLabel}
                                      </span>
                                      <span className="text-white font-semibold text-sm truncate">
                                        {isSatisAlis ? fis.cari?.companyName || 'Pesin Islem' : fis.category || 'Kategorisiz'}
                                      </span>
                                      {hasPhoto && (
                                        <button
                                          onClick={() => setLightboxImage(fis.photo || (fis as any).fisPhoto)}
                                          className="p-0.5 rounded bg-purple-600/15 text-purple-400"
                                        >
                                          <ImageIcon className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground/70">
                                      <span className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {fis.employeeName || 'Bilinmeyen'}
                                      </span>
                                      {isSatisAlis && fis.items && (
                                        <span className="flex items-center gap-1">
                                          <Package className="w-3 h-3" />
                                          {fis.items.length} urun
                                          {fis.items.some((i: any) => i.type === 'iade') && (
                                            <span className="text-orange-400 ml-0.5">({fis.items.filter((i: any) => i.type === 'iade').length} iade)</span>
                                          )}
                                        </span>
                                      )}
                                      {fis.payment && (
                                        <span className={`font-medium ${fis.payment.method === 'veresiye' || !fis.payment.method ? 'text-red-400' : 'text-muted-foreground'}`}>
                                          {fis.payment.method === 'nakit' ? 'Nakit' :
                                            fis.payment.method === 'kredi-karti' ? 'K.Karti' :
                                              fis.payment.method === 'havale' ? 'Havale' :
                                                fis.payment.method === 'cek' ? 'Cek' : 'Veresiye'}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Amount */}
                                  <div className="text-right flex-shrink-0">
                                    <p className={`text-base font-bold ${modeColor === 'green' ? 'text-emerald-400' : modeColor === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
                                      ₺{(fis.total || fis.amount || 0).toLocaleString('tr-TR')}
                                    </p>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-0.5 flex-shrink-0">
                                    <motion.button
                                      whileTap={{ scale: 0.85 }}
                                      onClick={() => handleDetail(fis)}
                                      className="p-2 sm:p-1.5 rounded-lg bg-accent/30 hover:bg-accent/60 active:bg-accent/80 text-muted-foreground hover:text-white transition-all"
                                      title="Detay"
                                    >
                                      <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                    </motion.button>
                                    <motion.button
                                      whileTap={{ scale: 0.85 }}
                                      onClick={() => handleThermalPrint(fis)}
                                      className="hidden sm:block p-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 transition-all"
                                      title="Termal Yazıcı"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                    </motion.button>
                                    <motion.button
                                      whileTap={{ scale: 0.85 }}
                                      onClick={() => handleDownloadSingleFisPDF(fis)}
                                      className="hidden sm:block p-1.5 rounded-lg bg-purple-600/15 hover:bg-purple-600/30 text-purple-400 hover:text-purple-300 transition-all"
                                      title="PDF Indir"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </motion.button>
                                    <motion.button
                                      whileTap={{ scale: 0.85 }}
                                      onClick={() => handleEdit(fis)}
                                      className="p-2 sm:p-1.5 rounded-lg bg-blue-600/15 hover:bg-blue-600/30 active:bg-blue-600/40 text-blue-400 hover:text-blue-300 transition-all"
                                      title="Duzenle"
                                    >
                                      <Edit2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                    </motion.button>
                                    <motion.button
                                      whileTap={{ scale: 0.85 }}
                                      onClick={() => handleDelete(fis.id)}
                                      className="p-2 sm:p-1.5 rounded-lg bg-red-600/15 hover:bg-red-600/30 active:bg-red-600/40 text-red-400 hover:text-red-300 transition-all"
                                      title="Sil"
                                    >
                                      <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                    </motion.button>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>

                        {/* Gün Özet Bar */}
                        <div className="px-5 py-3 bg-secondary/30 border-t border-border/20 flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground/70 font-medium">{dayGroup.fisCount} fis &bull; {dayGroup.dayName}</span>
                          <div className="flex items-center gap-4 text-xs font-bold">
                            {dayGroup.totalSatis > 0 && <span className="text-emerald-400">+₺{dayGroup.totalSatis.toLocaleString('tr-TR')}</span>}
                            {dayGroup.totalAlis > 0 && <span className="text-blue-400">₺{dayGroup.totalAlis.toLocaleString('tr-TR')}</span>}
                            {dayGroup.totalGider > 0 && <span className="text-red-400">-₺{dayGroup.totalGider.toLocaleString('tr-TR')}</span>}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* ═══════ LİSTE GÖRÜNÜMÜ (MEVCUT) ═══════ */
          <div className="card-premium rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                Fisler
                <span className="text-sm font-normal text-muted-foreground/70 ml-1">({filteredFisler.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-border/20">
              {filteredFisler.map((fis, index) => {
                const modeColor = getModeColor(fis.mode);
                const modeLabel = getModeLabel(fis.mode);
                const hasPhoto = !!(fis.photo || (fis as any).fisPhoto);
                const isSatisAlis = fis.mode === 'satis' || fis.mode === 'sale' || fis.mode === 'alis';
                const borderColorMap: Record<string, string> = {
                  green: 'border-l-emerald-500',
                  blue: 'border-l-blue-500',
                  red: 'border-l-red-500'
                };
                const badgeMap: Record<string, string> = {
                  green: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
                  blue: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
                  red: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20'
                };

                return (
                  <motion.div
                    key={fis.id}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.04, 0.5), type: 'spring', stiffness: 200, damping: 25 }}
                    className={`border-l-[3px] ${borderColorMap[modeColor]} hover:bg-secondary/30 transition-all duration-200`}
                  >
                    <div className="flex items-center gap-4 px-5 py-4">
                      {/* Mode Badge */}
                      <div className="hidden md:flex flex-shrink-0">
                        <span className={`px-3 py-1.5 text-[11px] font-bold rounded-lg ${badgeMap[modeColor]}`}>
                          {modeLabel}
                        </span>
                      </div>

                      {/* Main Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <span className={`md:hidden px-2 py-0.5 text-[10px] font-bold rounded ${badgeMap[modeColor]}`}>
                            {modeLabel}
                          </span>
                          <span className="text-white font-semibold text-sm truncate">
                            {isSatisAlis ? fis.cari?.companyName || 'Pesin Islem' : fis.category || 'Kategorisiz'}
                          </span>
                          {hasPhoto && (
                            <button
                              onClick={() => setLightboxImage(fis.photo || (fis as any).fisPhoto)}
                              className="p-1 rounded-md bg-purple-600/15 hover:bg-purple-600/25 text-purple-400 transition-colors"
                              title="Fotografi goruntule"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground/70">
                          <span className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" />
                            {fis.employeeName || 'Bilinmeyen'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {fis.date ? new Date(fis.date).toLocaleDateString('tr-TR') : '-'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {fis.date ? new Date(fis.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                          {isSatisAlis && fis.items && (
                            <span className="flex items-center gap-1.5">
                              <Package className="w-3.5 h-3.5" />
                              {fis.items.length} urun
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0 mr-2">
                        <p className={`text-lg font-bold ${modeColor === 'green' ? 'text-emerald-400' : modeColor === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
                          ₺{(fis.total || fis.amount || 0).toLocaleString('tr-TR')}
                        </p>
                        {fis.payment && (
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            {fis.payment.method === 'nakit' ? 'Nakit' :
                              fis.payment.method === 'kredi-karti' ? 'Kredi Karti' :
                                fis.payment.method === 'havale' ? 'Havale' :
                                  fis.payment.method === 'cek' ? 'Cek' : ''}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleDetail(fis)}
                          className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/60 text-muted-foreground hover:text-white transition-all"
                          title="Detay"
                        >
                          <Eye className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleThermalPrint(fis)}
                          className="p-2 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 transition-all"
                          title="Termal Yazıcı"
                        >
                          <Printer className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleDownloadSingleFisPDF(fis)}
                          className="p-2 rounded-lg bg-purple-600/15 hover:bg-purple-600/30 text-purple-400 hover:text-purple-300 transition-all"
                          title="PDF Indir"
                        >
                          <Download className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleEdit(fis)}
                          className="p-2 rounded-lg bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 transition-all"
                          title="Duzenle"
                        >
                          <Edit2 className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleDelete(fis.id)}
                          className="p-2 rounded-lg bg-red-600/15 hover:bg-red-600/30 text-red-400 hover:text-red-300 transition-all"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
      )}

      {/* ═══════════════════════════════════════════
           DUZENLEME MODALI (TAM KAPSAMLI)
         ═══════════════════════════════════════════ */}
      <Dialog.Root open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-md z-50" />
          <Dialog.Content
            className="fixed inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-3xl sm:max-h-[92vh] overflow-y-auto z-50 sm:rounded-2xl border-0 sm:border border-border/40 shadow-2xl modal-glass"
          >
              {/* Header */}
              <div className="sticky top-0 z-10 px-4 sm:px-6 py-3 sm:py-4 border-b border-border/30 bg-secondary/90 backdrop-blur-xl sm:rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                    <Edit2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base sm:text-xl font-bold text-white">Fis Duzenle</Dialog.Title>
                    <Dialog.Description className="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5">
                      {selectedFis && `#${selectedFis.id.substring(0, 8).toUpperCase()} - ${
                        (selectedFis.mode === 'satis' || selectedFis.mode === 'sale') ? 'Satis Fisi' :
                          selectedFis.mode === 'alis' ? 'Alis Fisi' : 'Gider Fisi'
                      }`}
                    </Dialog.Description>
                  </div>
                </div>
                <Dialog.Close className="p-2 hover:bg-secondary/50 active:bg-secondary/70 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </Dialog.Close>
              </div>

              {selectedFis && (
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                  {/* Gider - Kategori & Tutar */}
                  {selectedFis.mode === 'gider' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-2">Kategori</label>
                        <input
                          value={editCategory}
                          onChange={e => setEditCategory(e.target.value)}
                          className="w-full px-4 py-3 bg-secondary/60 border border-border/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-2">Tutar (₺)</label>
                        <input
                          type="number"
                          value={editAmount}
                          onChange={e => setEditAmount(Number(e.target.value))}
                          className="w-full px-4 py-3 bg-secondary/60 border border-border/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* ═══ Satis/Alis - Urun Tablosu ═══ */}
                  {(selectedFis.mode === 'satis' || selectedFis.mode === 'sale' || selectedFis.mode === 'alis') && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Package className="w-4 h-4 text-blue-400" />
                          Urun Detaylari ({editItems.length})
                        </h3>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setShowAddProduct(!showAddProduct)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg text-sm font-medium transition-all"
                        >
                          <Plus className="w-4 h-4" />
                          Urun Ekle
                        </motion.button>
                      </div>

                      {/* Yeni Urun Ekleme Paneli */}
                      <AnimatePresence>
                        {showAddProduct && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden mb-4"
                          >
                            <div className="p-4 rounded-xl border border-emerald-600/20 bg-emerald-600/5">
                              <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                                <input
                                  type="text"
                                  value={addProductSearch}
                                  onChange={e => setAddProductSearch(e.target.value)}
                                  placeholder="Urun adi ile arayiniz..."
                                  className="w-full pl-10 pr-4 py-2.5 bg-secondary/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                  autoFocus
                                />
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                                {filteredStokList.length > 0 ? filteredStokList.slice(0, 15).map(product => (
                                  <div
                                    key={product.id || product.name}
                                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-secondary/50 transition-colors group"
                                  >
                                    <div>
                                      <span className="text-white text-sm font-medium">{product.name}</span>
                                      <span className="text-muted-foreground/70 text-xs ml-2">
                                        {product.unit} | ₺{(product.price || 0).toLocaleString('tr-TR')}
                                      </span>
                                    </div>
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => addNewItemToEdit(product, selectedFis.mode === 'alis' ? 'alis' : 'satis')}
                                        className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-md text-xs font-medium transition-colors"
                                      >
                                        {selectedFis.mode === 'alis' ? 'Alis' : 'Satis'}
                                      </button>
                                      <button
                                        onClick={() => addNewItemToEdit(product, 'iade')}
                                        className="px-2.5 py-1 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 rounded-md text-xs font-medium transition-colors"
                                      >
                                        Iade
                                      </button>
                                    </div>
                                  </div>
                                )) : (
                                  <p className="text-muted-foreground/70 text-sm text-center py-4">Urun bulunamadi</p>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Urun Listesi */}
                      <div className="rounded-xl border border-border/30 overflow-hidden">
                        {editItems.length === 0 ? (
                          <div className="p-8 text-center">
                            <Package className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                            <p className="text-muted-foreground/70 text-sm">Henuz urun eklenmemis</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-border/20">
                            {/* Desktop table header */}
                            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 bg-secondary/50 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                              <span className="col-span-3">Urun</span>
                              <span className="col-span-1 text-center">Tur</span>
                              <span className="col-span-2 text-center">Miktar</span>
                              <span className="col-span-1 text-center">Birim</span>
                              <span className="col-span-2 text-center">Birim Fiyat</span>
                              <span className="col-span-2 text-right">Toplam</span>
                              <span className="col-span-1"></span>
                            </div>
                            <AnimatePresence mode="popLayout">
                              {editItems.map((item, idx) => {
                                const isIade = item.type === 'iade';
                                const itemName = item.productName || item.name || '-';
                                const itemPrice = item.unitPrice || item.price || 0;
                                const itemQty = Math.abs(item.quantity || 0);
                                const itemTotal = Math.abs(item.totalPrice || 0);
                                return (
                                  <motion.div
                                    key={item._editId}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10, height: 0 }}
                                    layout
                                    className={`${isIade ? 'bg-red-900/5' : 'hover:bg-secondary/20'} transition-colors`}
                                  >
                                    {/* Desktop: grid layout */}
                                    <div className="hidden sm:grid grid-cols-12 gap-2 items-center px-4 py-3">
                                      <span className="col-span-3 text-sm text-white font-medium truncate" title={itemName}>{itemName}</span>
                                      <span className="col-span-1 flex justify-center">
                                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${isIade ? 'bg-orange-600/20 text-orange-400' : item.type === 'alis' ? 'bg-blue-600/20 text-blue-400' : 'bg-emerald-600/20 text-emerald-400'}`}>
                                          {isIade ? 'IADE' : item.type === 'alis' ? 'ALIS' : 'SATIS'}
                                        </span>
                                      </span>
                                      <div className="col-span-2 flex justify-center">
                                        <input type="number" value={itemQty} onChange={e => { const val = Number(e.target.value); updateEditItem(item._editId, 'quantity', isIade ? -Math.abs(val) : Math.abs(val)); }} min={0} step={0.1} className="w-20 px-2 py-1.5 bg-secondary/60 border border-border/40 rounded-lg text-white text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40" />
                                      </div>
                                      <span className="col-span-1 text-center text-xs text-muted-foreground">{item.unit || 'kg'}</span>
                                      <div className="col-span-2 flex justify-center">
                                        <input type="number" value={itemPrice} onChange={e => updateEditItem(item._editId, 'unitPrice', Number(e.target.value))} min={0} step={0.01} className="w-24 px-2 py-1.5 bg-secondary/60 border border-border/40 rounded-lg text-white text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40" />
                                      </div>
                                      <span className={`col-span-2 text-right text-sm font-bold ${isIade ? 'text-orange-400' : 'text-white'}`}>{isIade ? '-' : ''}₺{itemTotal.toLocaleString('tr-TR')}</span>
                                      <div className="col-span-1 flex justify-end">
                                        <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }} onClick={() => removeEditItem(item._editId)} className="p-1.5 rounded-lg hover:bg-red-600/20 text-muted-foreground/70 hover:text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5" /></motion.button>
                                      </div>
                                    </div>
                                    {/* Mobile: card layout */}
                                    <div className="sm:hidden px-3 py-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded flex-shrink-0 ${isIade ? 'bg-orange-600/20 text-orange-400' : item.type === 'alis' ? 'bg-blue-600/20 text-blue-400' : 'bg-emerald-600/20 text-emerald-400'}`}>
                                            {isIade ? 'IADE' : item.type === 'alis' ? 'ALIS' : 'SATIS'}
                                          </span>
                                          <span className="text-sm text-white font-medium truncate">{itemName}</span>
                                        </div>
                                        <motion.button whileTap={{ scale: 0.85 }} onClick={() => removeEditItem(item._editId)} className="p-2 rounded-lg bg-red-600/10 active:bg-red-600/25 text-red-400 transition-all flex-shrink-0"><Trash2 className="w-4 h-4" /></motion.button>
                                      </div>
                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="text-[10px] text-muted-foreground/60 mb-1 block">Miktar ({item.unit || 'kg'})</label>
                                          <input type="number" value={itemQty} onChange={e => { const val = Number(e.target.value); updateEditItem(item._editId, 'quantity', isIade ? -Math.abs(val) : Math.abs(val)); }} min={0} step={0.1} className="w-full px-2 py-2 bg-secondary/60 border border-border/40 rounded-lg text-white text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40" />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-muted-foreground/60 mb-1 block">B. Fiyat</label>
                                          <input type="number" value={itemPrice} onChange={e => updateEditItem(item._editId, 'unitPrice', Number(e.target.value))} min={0} step={0.01} className="w-full px-2 py-2 bg-secondary/60 border border-border/40 rounded-lg text-white text-center text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40" />
                                        </div>
                                        <div className="flex flex-col items-end justify-end">
                                          <label className="text-[10px] text-muted-foreground/60 mb-1 block">Toplam</label>
                                          <span className={`text-sm font-bold ${isIade ? 'text-orange-400' : 'text-white'}`}>{isIade ? '-' : ''}₺{itemTotal.toLocaleString('tr-TR')}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Toplam */}
                        {editItems.length > 0 && (
                          <div className="px-4 py-3 bg-secondary/30 border-t border-border/30 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground font-medium">Genel Toplam</span>
                            <span className={`text-xl font-bold ${calculateEditTotal() >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              ₺{calculateEditTotal().toLocaleString('tr-TR')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Odeme Tutari */}
                  {selectedFis.payment && (
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-2">Odenen Tutar (₺)</label>
                      <input
                        type="number"
                        value={editPaymentAmount}
                        onChange={e => setEditPaymentAmount(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-secondary/60 border border-border/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                      />
                    </div>
                  )}

                  {/* Aciklama */}
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-2">Aciklama / Icerik</label>
                    <textarea
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 bg-secondary/60 border border-border/50 rounded-xl text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                      placeholder="Fis ile ilgili detaylari buraya yazabilirsiniz..."
                    />
                  </div>

                  {/* Fotograf */}
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-2">Fis / Belge Fotografi</label>
                    <div className="flex items-start gap-4">
                      {photoPreview ? (
                        <div
                          className="relative w-28 h-28 rounded-xl overflow-hidden border border-border/50 group cursor-pointer"
                          onClick={() => setLightboxImage(photoPreview)}
                        >
                          <img src={photoPreview} alt="Belge" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <ZoomIn className="w-5 h-5 text-white" />
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPhotoPreview(null); }}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-md sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-28 h-28 border-2 border-dashed border-border/50 rounded-xl hover:border-blue-500/40 hover:bg-blue-500/5 cursor-pointer transition-all">
                          <Camera className="w-6 h-6 text-muted-foreground/70 mb-1" />
                          <span className="text-xs text-muted-foreground/70">Yukle</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handlePhotoUpload}
                          />
                        </label>
                      )}
                      <div className="text-xs text-muted-foreground/70 mt-2">
                        Opsiyonel: Fisin, faturanin veya ilgili belgenin fotografini ekleyebilirsiniz.<br />
                        <span className="text-blue-400">Max boyut: 2MB</span>
                      </div>
                    </div>
                  </div>

                  {/* Butonlar */}
                  <div className="flex gap-3 pt-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleUpdate}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20"
                    >
                      <Save className="w-5 h-5" />
                      Guncelle
                    </motion.button>
                    <Dialog.Close asChild>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex-1 py-3.5 bg-secondary/60 hover:bg-secondary/70 text-foreground/80 font-semibold rounded-xl transition-all border border-border/30"
                      >
                        Iptal
                      </motion.button>
                    </Dialog.Close>
                  </div>
                </div>
              )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ═══════════════════════════════════════════
           DETAY GORUNTULEME MODALI
         ═══════════════════════════════════════════ */}
      <Dialog.Root open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-md z-50" />
          <Dialog.Content
            className="fixed inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-2xl sm:max-h-[90vh] overflow-y-auto z-50 sm:rounded-2xl border-0 sm:border border-border/40 shadow-2xl modal-glass"
          >
              {/* Header */}
              <div className="sticky top-0 z-10 px-4 sm:px-6 py-3 sm:py-4 border-b border-border/30 bg-secondary/90 backdrop-blur-xl sm:rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center ${
                    selectedFis && (selectedFis.mode === 'satis' || selectedFis.mode === 'sale')
                      ? 'bg-gradient-to-br from-emerald-600 to-emerald-700'
                      : selectedFis?.mode === 'alis'
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700'
                        : 'bg-gradient-to-br from-red-600 to-red-700'
                  }`}>
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base sm:text-xl font-bold text-white">Fis Detayi</Dialog.Title>
                    <Dialog.Description className="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5">
                      {selectedFis?.date && new Date(selectedFis.date).toLocaleString('tr-TR')}
                    </Dialog.Description>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedFis && (
                    <>
                      <button
                        onClick={() => handleThermalPrint(selectedFis)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-400 text-xs font-semibold transition-all"
                        title="Termal Yazıcı ile Yazdır"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Termal</span>
                      </button>
                      <button
                        onClick={() => handleDownloadSingleFisPDF(selectedFis)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-600/15 hover:bg-purple-600/30 text-purple-400 text-xs font-semibold transition-all"
                        title="A4 PDF İndir"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">A4 PDF</span>
                      </button>
                    </>
                  )}
                  <Dialog.Close className="p-2 hover:bg-secondary/50 active:bg-secondary/70 rounded-xl transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </Dialog.Close>
                </div>
              </div>

              {selectedFis && (
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {[
                      {
                        label: 'Islem Tipi',
                        content: (
                          <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${
                            (selectedFis.mode === 'satis' || selectedFis.mode === 'sale') ? 'bg-emerald-600/20 text-emerald-400' :
                              selectedFis.mode === 'alis' ? 'bg-blue-600/20 text-blue-400' : 'bg-red-600/20 text-red-400'
                          }`}>
                            {(selectedFis.mode === 'satis' || selectedFis.mode === 'sale') ? 'SATIS' : selectedFis.mode === 'alis' ? 'ALIS' : 'GIDER'}
                          </span>
                        )
                      },
                      { label: 'Personel', content: <span className="text-white font-medium">{selectedFis.employeeName || 'Bilinmiyor'}</span> },
                      {
                        label: (selectedFis.mode === 'satis' || selectedFis.mode === 'sale' || selectedFis.mode === 'alis') ? 'Cari / Musteri' : 'Kategori',
                        content: <span className="text-white font-medium">
                          {(selectedFis.mode === 'satis' || selectedFis.mode === 'sale' || selectedFis.mode === 'alis')
                            ? selectedFis.cari?.companyName || 'Pesin Islem' : selectedFis.category}
                        </span>
                      },
                      {
                        label: 'Tutar',
                        content: <span className="text-xl font-bold text-white">₺{(selectedFis.total || selectedFis.amount || 0).toLocaleString('tr-TR')}</span>
                      }
                    ].map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="p-4 rounded-xl bg-secondary/30 border border-border/20"
                      >
                        <span className="block text-[11px] text-muted-foreground/70 mb-1.5 uppercase tracking-wider">{item.label}</span>
                        {item.content}
                      </motion.div>
                    ))}
                  </div>

                  {/* Aciklama */}
                  {selectedFis.description && (
                    <div className="p-4 rounded-xl bg-secondary/30 border border-border/20">
                      <span className="block text-[11px] text-muted-foreground/70 mb-2 uppercase tracking-wider">Aciklama</span>
                      <p className="text-foreground/80 text-sm">{selectedFis.description}</p>
                    </div>
                  )}

                  {/* Urunler */}
                  {selectedFis.items && selectedFis.items.length > 0 && (
                    <div className="rounded-xl border border-border/20 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-border/20 bg-secondary/40">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Urun Detaylari</span>
                      </div>
                      {/* Desktop table */}
                      <table className="hidden sm:table w-full text-left text-sm">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="px-4 py-2.5 text-muted-foreground/70 font-medium text-xs">Urun</th>
                            <th className="px-4 py-2.5 text-muted-foreground/70 font-medium text-xs">Tur</th>
                            <th className="px-4 py-2.5 text-muted-foreground/70 font-medium text-xs">Miktar</th>
                            <th className="px-4 py-2.5 text-muted-foreground/70 font-medium text-xs">Fiyat</th>
                            <th className="px-4 py-2.5 text-muted-foreground/70 font-medium text-xs text-right">Toplam</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/15">
                          {selectedFis.items.map((item: any, i: number) => {
                            const itemName = item.name || item.productName;
                            const itemPrice = item.price || item.unitPrice || 0;
                            const itemQuantity = item.quantity || 0;
                            const itemTotal = item.totalPrice || (itemQuantity * itemPrice);
                            const isIade = item.type === 'iade';
                            return (
                              <motion.tr
                                key={i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.03 }}
                                className={isIade ? 'bg-red-900/5' : ''}
                              >
                                <td className="px-4 py-3 text-foreground/80 text-sm">{itemName}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isIade ? 'bg-orange-600/20 text-orange-400' : item.type === 'alis' ? 'bg-blue-600/20 text-blue-400' : 'bg-emerald-600/20 text-emerald-400'
                                  }`}>
                                    {isIade ? 'IADE' : item.type === 'alis' ? 'ALIS' : 'SATIS'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-foreground/80 text-sm">{Math.abs(itemQuantity)} {item.unit || ''}</td>
                                <td className="px-4 py-3 text-foreground/80 text-sm">₺{itemPrice.toLocaleString('tr-TR')}</td>
                                <td className={`px-4 py-3 font-semibold text-right text-sm ${isIade ? 'text-orange-400' : 'text-white'}`}>
                                  {isIade ? '-' : ''}₺{Math.abs(itemTotal).toLocaleString('tr-TR')}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {/* Mobile card list */}
                      <div className="sm:hidden divide-y divide-border/15">
                        {selectedFis.items.map((item: any, i: number) => {
                          const itemName = item.name || item.productName;
                          const itemPrice = item.price || item.unitPrice || 0;
                          const itemQuantity = item.quantity || 0;
                          const itemTotal = item.totalPrice || (itemQuantity * itemPrice);
                          const isIade = item.type === 'iade';
                          return (
                            <div key={i} className={`px-3 py-2.5 ${isIade ? 'bg-red-900/5' : ''}`}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded flex-shrink-0 ${isIade ? 'bg-orange-600/20 text-orange-400' : item.type === 'alis' ? 'bg-blue-600/20 text-blue-400' : 'bg-emerald-600/20 text-emerald-400'}`}>
                                    {isIade ? 'IADE' : item.type === 'alis' ? 'ALIS' : 'SATIS'}
                                  </span>
                                  <span className="text-sm text-white font-medium truncate">{itemName}</span>
                                </div>
                                <span className={`text-sm font-bold flex-shrink-0 ${isIade ? 'text-orange-400' : 'text-white'}`}>
                                  {isIade ? '-' : ''}₺{Math.abs(itemTotal).toLocaleString('tr-TR')}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                                <span>{Math.abs(itemQuantity)} {item.unit || 'kg'}</span>
                                <span>x ₺{itemPrice.toLocaleString('tr-TR')}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Odeme Bilgileri */}
                  {selectedFis.payment && (
                    <div className="p-4 rounded-xl bg-secondary/30 border border-border/20">
                      <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Odeme Bilgileri</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[11px] text-muted-foreground/70">Odeme Yontemi</span>
                          <p className="text-white font-medium text-sm mt-0.5 capitalize">
                            {selectedFis.payment.method === 'nakit' ? 'Nakit' :
                              selectedFis.payment.method === 'kredi-karti' ? 'Kredi Karti' :
                                selectedFis.payment.method === 'havale' ? 'Havale/EFT' :
                                  selectedFis.payment.method === 'cek' ? 'Cek' : selectedFis.payment.method || '-'}
                          </p>
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground/70">Odenen Tutar</span>
                          <p className="text-emerald-400 font-bold text-lg mt-0.5">₺{(selectedFis.payment.amount || 0).toLocaleString('tr-TR')}</p>
                        </div>
                        {selectedFis.payment.bankName && (
                          <div>
                            <span className="text-[11px] text-muted-foreground/70">Banka</span>
                            <p className="text-white text-sm mt-0.5">{selectedFis.payment.bankName}</p>
                          </div>
                        )}
                        {selectedFis.payment.receiverEmployee && (
                          <div>
                            <span className="text-[11px] text-muted-foreground/70">Parayi Alan</span>
                            <p className="text-white text-sm mt-0.5">{selectedFis.payment.receiverEmployee}</p>
                          </div>
                        )}
                        {selectedFis.payment.dueDate && (
                          <div>
                            <span className="text-[11px] text-muted-foreground/70">Vade Tarihi</span>
                            <p className="text-amber-400 text-sm mt-0.5">{selectedFis.payment.dueDate}</p>
                          </div>
                        )}
                        {(() => {
                          const total = selectedFis.total || selectedFis.amount || 0;
                          const paid = selectedFis.payment.amount || 0;
                          const remaining = total - paid;
                          if (remaining > 0) {
                            return (
                              <div>
                                <span className="text-[11px] text-muted-foreground/70">Kalan (Veresiye)</span>
                                <p className="text-red-400 font-bold text-sm mt-0.5">₺{remaining.toLocaleString('tr-TR')}</p>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Odeme yapilmamissa */}
                  {!selectedFis.payment && (selectedFis.mode === 'satis' || selectedFis.mode === 'sale' || selectedFis.mode === 'alis') && (
                    <div className="p-4 rounded-xl bg-amber-600/10 border border-amber-600/20">
                      <p className="text-amber-400 text-sm font-medium">Odeme yapilmamis (Veresiye)</p>
                      <p className="text-amber-400/60 text-xs mt-1">Toplam tutar cari bakiyeye eklenmistir</p>
                    </div>
                  )}

                  {/* Ekli Fotograf */}
                  {(selectedFis.photo || (selectedFis as any).fisPhoto) && (
                    <div>
                      <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ekli Belge / Fotograf</span>
                      <div
                        className="rounded-xl border border-border/30 overflow-hidden cursor-pointer group relative"
                        onClick={() => setLightboxImage(selectedFis.photo || (selectedFis as any).fisPhoto)}
                      >
                        <img
                          src={selectedFis.photo || (selectedFis as any).fisPhoto}
                          alt="Ekli Belge"
                          className="w-full max-h-[400px] object-contain bg-background/50"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="px-4 py-2 rounded-xl glass-strong flex items-center gap-2 text-white text-sm">
                            <ZoomIn className="w-4 h-4" />
                            Buyuk goruntule
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
