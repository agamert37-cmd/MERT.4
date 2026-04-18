import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText, Plus, Search, X, Trash2, Eye, Upload, Download, Filter,
  Building2, User, Calendar, Receipt, CheckCircle2, XCircle, Camera,
  Package, ArrowUpRight, ArrowDownRight, Percent, AlertTriangle,
  ChevronDown, Hash, Phone, MapPin, FileCheck, Sparkles, Image as ImageIcon,
  Store, Truck, ToggleLeft, ToggleRight, MessageCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { staggerContainer, rowItem, hover, tap } from '../utils/animations';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { useTableSync } from '../hooks/useTableSync';
import { SwipeToDelete } from '../components/MobileHelpers';
import { productToDb, productFromDb } from './StokPage';
import { cariToDb, cariFromDb } from './CariPage';
import { useGlobalTableData } from '../contexts/GlobalTableSyncContext';
import { generateUBLXML, downloadXML, type UBLFaturaData } from '../utils/ublTr';
import { getCompanyInfo } from './SettingsPage';

// ─── Interfaces ────────────────────────────────────────────────
export interface Fatura {
  id: string;
  type: 'alis' | 'satis'; // Alış faturası veya Satış faturası
  status: 'aktif' | 'iptal';
  // Kimden/Kime
  counterParty: string; // Karşı taraf (toptancı adı veya müşteri adı)
  counterPartyId?: string; // Cari ID (varsa)
  // Hangi firmamıza kesildi
  issuedTo: string; // İşleyen Et, Mert Götürmeleri vb.
  issuedBy: string; // Kim ekledi (personel)
  // Fatura bilgileri
  faturaNo?: string;
  date: string;
  kdvRate: number;
  // Tutarlar
  netAmount: number; // KDV hariç tutar
  kdvAmount: number; // KDV tutarı
  grossAmount: number; // KDV dahil toplam
  // Tevkifat
  tevkifatRate?: number;    // Tevkifat oranı (ör: 2/10, 5/10 gibi)
  tevkifatAmount?: number;  // Tevkifat tutarı
  // Mal karşılığı mı?
  isLinkedToGoods: boolean;
  linkedFisId?: string; // Bağlı fiş ID'si (varsa)
  // Fatura stoku
  faturaItems: FaturaItem[];
  // Fotoğraf (ZORUNLU)
  photo: string;
  // Meta
  description?: string;
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
  // e-Fatura / LUCA entegrasyon alanları (opsiyonel)
  efatura?: {
    status: 'bekliyor' | 'gonderildi' | 'onaylandi' | 'reddedildi';
    ettn?: string;           // GİB tarafından atanan UUID (e-Fatura imzalandıktan sonra)
    efaturaNo?: string;      // e-Fatura numarası (EAF2026...)
    gonderimTarihi?: string; // Gönderim tarihi ISO
    notlar?: string;
  };
}

export interface FaturaItem {
  id: string;
  name: string; // Fatura stok kalemi adı (ör: Sakatat)
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  // Kalem bazlı KDV (opsiyonel — yoksa fatura genelinden alınır)
  itemKdvRate?: number;
  itemKdvAmount?: number;
  itemGrossTotal?: number;
  // Gerçek stok ilişkisi (opsiyonel)
  linkedStockId?: string;
  linkedStockName?: string;
}

// ─── Fatura Stok Kalemleri (sadece faturada kullanılan) ─────────
export interface FaturaStokItem {
  id: string;
  name: string;
  unit: string;
  description?: string;
  linkedStockId?: string; // Gerçek stok ile eşleşme
  linkedStockName?: string;
}

const DEFAULT_FATURA_STOK: FaturaStokItem[] = [
  { id: 'fs-1', name: 'Sakatat', unit: 'KG', description: 'Fatura kalemlerinde sakatat olarak çıkar' },
  { id: 'fs-2', name: 'Dana Eti', unit: 'KG', description: 'Faturada dana eti olarak görünür' },
  { id: 'fs-3', name: 'Kuzu Eti', unit: 'KG', description: 'Faturada kuzu eti olarak görünür' },
  { id: 'fs-4', name: 'Tavuk', unit: 'KG', description: 'Faturada tavuk olarak görünür' },
  { id: 'fs-5', name: 'Kemik', unit: 'KG', description: 'Fatura kalemlerinde kemik olarak çıkar' },
];

const FIRMA_LISTESI = ['İşleyen Et', 'Mert Götürmeleri'];

const KDV_RATES = [1, 8, 10, 18, 20];

// ─── AnimatedCounter ────────────────────────────────────────────
const AnimatedCounter = ({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) => {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    const duration = 600;
    const startTime = Date.now();
    const startValue = displayValue;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + (value - startValue) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <span>{prefix}{displayValue.toLocaleString('tr-TR')}{suffix}</span>;
};

// ─── WhatsApp Paylaşım ──────────────────────────────────────────
function shareViaWhatsApp(fatura: Fatura) {
  const tarih = new Date(fatura.date).toLocaleDateString('tr-TR');
  const satirlar = (fatura.faturaItems || [])
    .map((i: any) => `• ${i.name}: ${i.quantity} ${i.unit} × ₺${Number(i.unitPrice).toFixed(2)} = ₺${Number(i.totalPrice).toFixed(2)}`)
    .join('\n');
  const tip = fatura.type === 'satis' ? 'Satış Faturası' : 'Alış Faturası';
  const text = [
    `🧾 ${tip.toUpperCase()}`,
    `No: ${fatura.faturaNo || fatura.id.slice(-8).toUpperCase()}`,
    `Tarih: ${tarih}`,
    `Müşteri: ${fatura.counterParty}`,
    '',
    satirlar,
    '',
    `KDV (%${fatura.kdvRate}): ₺${Number(fatura.kdvAmount).toFixed(2)}`,
    `TOPLAM: ₺${Number(fatura.grossAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
  ].join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

// ─── Main Page ──────────────────────────────────────────────────
export function FaturaPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { currentEmployee } = useEmployee();
  const { emit } = useModuleBus();
  const { canView, canAdd, canEdit, canDelete } = getPagePermissions(user, currentEmployee, 'faturalar');
  const sec = usePageSecurity('faturalar');

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'alis' | 'satis'>(
    () => (sessionStorage.getItem('mert4_filter_fatura_type') as 'all' | 'alis' | 'satis') ?? 'all'
  );
  const [filterStatus, setFilterStatus] = useState<'all' | 'aktif' | 'iptal'>(
    () => (sessionStorage.getItem('mert4_filter_fatura_status') as 'all' | 'aktif' | 'iptal') ?? 'all'
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedFatura, setSelectedFatura] = useState<Fatura | null>(null);
  const [isFaturaStokModalOpen, setIsFaturaStokModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // ─── Cari & Stok: GlobalTableSyncContext'ten oku (tekrar sync'e gerek yok) ──
  const cariList = useGlobalTableData<any>('cari_hesaplar');
  const { data: stokList, updateItem: updateStokItem } = useTableSync<any>({
    tableName: 'urunler',
    storageKey: StorageKey.STOK_DATA,
    toDb: productToDb,
    fromDb: productFromDb,
  });

  // Form State
  const [form, setForm] = useState({
    type: 'alis' as 'alis' | 'satis',
    counterParty: '',
    counterPartyId: '',
    issuedTo: FIRMA_LISTESI[0],
    faturaNo: '',
    date: new Date().toISOString().split('T')[0],
    kdvRate: 20,
    isLinkedToGoods: true,
    linkedFisId: '',
    photo: '',
    description: '',
    tevkifatRate: 0,
    perItemKdv: false, // Kalem bazlı KDV modu
  });
  const [formItems, setFormItems] = useState<FaturaItem[]>([]);
  const [showCariDropdown, setShowCariDropdown] = useState(false);
  const [cariSearchTerm, setCariSearchTerm] = useState('');
  const [cariPickerTab, setCariPickerTab] = useState<'toptanci' | 'ozel'>('toptanci');
  const [activePageTab, setActivePageTab] = useState<'faturalar' | 'kdvRaporu' | 'stokEtki'>('faturalar');

  // ─── useTableSync ENTEGRASYONU ──────────────────────────────────────
  const { data: syncFaturalar, addItem: addFaturaSync, updateItem: updateFaturaSync, deleteItem: deleteFaturaSync } = useTableSync<any>({
    tableName: 'faturalar',
    storageKey: StorageKey.FATURALAR,
  });
  const { data: syncFaturaStok, addItem: addFaturaStokSync, deleteItem: deleteFaturaStokSync } = useTableSync<any>({
    tableName: 'fatura_stok',
    storageKey: StorageKey.FATURA_STOK,
    initialData: DEFAULT_FATURA_STOK,
  });

  // Sync'ten doğrudan alias — useTableSync optimistik güncelleme yapar
  const faturalar = syncFaturalar;
  const faturaStok = syncFaturaStok;

  // Filtered
  const filtered = useMemo(() => {
    return faturalar.filter(f => {
      const matchType = filterType === 'all' || f.type === filterType;
      const matchStatus = filterStatus === 'all' || f.status === filterStatus;
      const s = searchTerm.toLowerCase();
      const matchSearch = !s ||
        f.counterParty.toLowerCase().includes(s) ||
        f.issuedTo.toLowerCase().includes(s) ||
        (f.faturaNo || '').toLowerCase().includes(s) ||
        (f.description || '').toLowerCase().includes(s);
      return matchType && matchStatus && matchSearch;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [faturalar, filterType, filterStatus, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const aktifler = faturalar.filter(f => f.status === 'aktif');
    const alislar = aktifler.filter(f => f.type === 'alis');
    const satislar = aktifler.filter(f => f.type === 'satis');
    return {
      total: faturalar.length,
      aktif: aktifler.length,
      iptal: faturalar.filter(f => f.status === 'iptal').length,
      alisToplam: alislar.reduce((s, f) => s + f.grossAmount, 0),
      satisToplam: satislar.reduce((s, f) => s + f.grossAmount, 0),
      alisCount: alislar.length,
      satisCount: satislar.length,
      toplamKdv: aktifler.reduce((s, f) => s + f.kdvAmount, 0),
      linkedCount: aktifler.filter(f => f.isLinkedToGoods).length,
      unlinkedCount: aktifler.filter(f => !f.isLinkedToGoods).length,
    };
  }, [faturalar]);

  // Cari dropdown filter
  const filteredCari = useMemo(() => {
    const s = cariSearchTerm.toLowerCase();
    const typeFilter = cariPickerTab === 'toptanci' ? 'Toptancı' : 'Özel';
    return cariList.filter(c => {
      const matchSearch = !s || c.companyName?.toLowerCase().includes(s) || c.contactPerson?.toLowerCase().includes(s);
      const matchType = c.type === typeFilter;
      return matchSearch && matchType;
    }).slice(0, 20);
  }, [cariList, cariSearchTerm, cariPickerTab]);

  // Add item to form
  const addFormItem = () => {
    setFormItems(prev => [...prev, {
      id: `fi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '',
      quantity: 0,
      unit: 'KG',
      unitPrice: 0,
      totalPrice: 0,
    }]);
  };

  const updateFormItem = (id: string, field: string, value: any) => {
    setFormItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        updated.totalPrice = (updated.quantity || 0) * (updated.unitPrice || 0);
      }
      // Per-item KDV hesabı
      if (field === 'quantity' || field === 'unitPrice' || field === 'itemKdvRate') {
        const rate = updated.itemKdvRate ?? form.kdvRate;
        updated.itemKdvAmount = updated.totalPrice * rate / 100;
        updated.itemGrossTotal = updated.totalPrice + updated.itemKdvAmount;
      }
      return updated;
    }));
  };

  const removeFormItem = (id: string) => {
    setFormItems(prev => prev.filter(item => item.id !== id));
  };

  // Calculate totals — per-item KDV destekli
  const formNetAmount = formItems.reduce((s, i) => s + i.totalPrice, 0);
  const formKdvAmount = form.perItemKdv
    ? formItems.reduce((s, i) => s + (i.itemKdvAmount || (i.totalPrice * (i.itemKdvRate ?? form.kdvRate) / 100)), 0)
    : formNetAmount * form.kdvRate / 100;
  const formTevkifatAmount = form.tevkifatRate > 0 ? formKdvAmount * form.tevkifatRate / 10 : 0;
  const formGrossAmount = formNetAmount + formKdvAmount - formTevkifatAmount;

  // Reset form
  const resetForm = () => {
    setForm({
      type: 'alis',
      counterParty: '',
      counterPartyId: '',
      issuedTo: FIRMA_LISTESI[0],
      faturaNo: '',
      date: new Date().toISOString().split('T')[0],
      kdvRate: 20,
      isLinkedToGoods: true,
      linkedFisId: '',
      photo: '',
      description: '',
      tevkifatRate: 0,
      perItemKdv: false,
    });
    setFormItems([]);
    setCariSearchTerm('');
    setShowCariDropdown(false);
    setCariPickerTab('toptanci');
  };

  // Save fatura
  const handleSave = async () => {
    if (!canAdd) { toast.error(t('fatura.err.noPermAdd')); return; }
    if (!form.counterParty.trim()) { toast.error(t('fatura.err.noCounterParty')); return; }
    if (!form.photo) { toast.error(t('fatura.err.noPhoto')); return; }
    if (formItems.length === 0) { toast.error(t('fatura.err.noItems')); return; }
    if (formItems.some(i => !i.name.trim())) { toast.error(t('fatura.err.noItemName')); return; }

    // Duplikat kontrolü (aynı counterParty + faturaNo + date)
    if (form.faturaNo) {
      const duplicate = faturalar.find(f => f.faturaNo === form.faturaNo && f.counterParty === form.counterParty && f.status === 'aktif');
      if (duplicate) {
        toast.error(`${form.faturaNo} — ${t('fatura.err.duplicate')}`);
        return;
      }
    }

    // Per-item KDV'leri güncelle
    const finalItems = formItems.map(item => {
      const rate = form.perItemKdv ? (item.itemKdvRate ?? form.kdvRate) : form.kdvRate;
      return {
        ...item,
        itemKdvRate: rate,
        itemKdvAmount: item.totalPrice * rate / 100,
        itemGrossTotal: item.totalPrice + (item.totalPrice * rate / 100),
      };
    });

    const newFatura: Fatura = {
      id: `fat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: form.type,
      status: 'aktif',
      counterParty: form.counterParty,
      counterPartyId: form.counterPartyId || undefined,
      issuedTo: form.issuedTo,
      issuedBy: currentEmployee?.name || user?.name || 'Bilinmeyen',
      faturaNo: form.faturaNo || undefined,
      date: form.date,
      kdvRate: form.kdvRate,
      netAmount: formNetAmount,
      kdvAmount: formKdvAmount,
      grossAmount: formGrossAmount,
      tevkifatRate: form.tevkifatRate > 0 ? form.tevkifatRate : undefined,
      tevkifatAmount: formTevkifatAmount > 0 ? formTevkifatAmount : undefined,
      isLinkedToGoods: form.isLinkedToGoods,
      linkedFisId: form.linkedFisId || undefined,
      faturaItems: finalItems,
      photo: form.photo,
      description: form.description || undefined,
      createdAt: new Date().toISOString(),
    };

    setInStorage(StorageKey.FATURALAR, [newFatura, ...faturalar]);
    addFaturaSync(newFatura);

    // ─── FATURA → STOK HAREKETİ (useTableSync ile senkron) ─────────────────
    if (form.isLinkedToGoods && finalItems.length > 0) {
      const moveType = form.type === 'alis' ? 'FATURA_ALIS' : 'FATURA_SATIS';

      for (const item of finalItems) {
        const fsItem = faturaStok.find(fs => fs.name === item.name);
        const linkedStockId = item.linkedStockId || fsItem?.linkedStockId;
        if (!linkedStockId) continue;

        const stock = stokList.find((s: any) => s.id === linkedStockId);
        if (!stock) continue;

        const qtyDelta = form.type === 'alis' ? item.quantity : -item.quantity;
        const itemKdvAmt = item.itemKdvAmount || (item.totalPrice * (item.itemKdvRate || form.kdvRate) / 100);
        const movement = {
          id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
          type: moveType,
          partyName: form.counterParty,
          quantity: item.quantity,
          price: item.unitPrice,
          totalAmount: item.totalPrice,
          date: form.date,
          description: `Fatura #${newFatura.id.slice(0, 12)} — ${item.name}`,
          faturaId: newFatura.id,
          faturaNo: form.faturaNo || undefined,
          kdvRate: item.itemKdvRate || form.kdvRate,
          kdvAmount: itemKdvAmt,
          grossAmount: item.totalPrice + itemKdvAmt,
        };

        // useTableSync updateItem ile hem localStorage hem KV'ye yaz
        await updateStokItem(linkedStockId, {
          currentStock: (stock.currentStock ?? 0) + qtyDelta,
          movements: [movement, ...(stock.movements || [])],
        } as any);
      }
      emit('stok:updated', { productId: '', productName: '', changes: {}, source: 'fatura', faturaId: newFatura.id });
    }

    sec.auditLog('add', newFatura.id, `fatura:${form.type}:${formGrossAmount}`);
    emit('fatura:added', { faturaId: newFatura.id, type: form.type, amount: formGrossAmount, items: formItems.length });
    logActivity('invoice_add', `Fatura Eklendi: ${form.counterParty}`, {
      employeeName: user?.name, page: 'Fatura',
      description: `${form.type === 'alis' ? 'Alış' : 'Satış'} faturası — ₺${formGrossAmount.toFixed(2)} (KDV %${form.kdvRate}) — ${formItems.length} kalem`
    });

    toast.success(`${form.type === 'alis' ? t('fatura.purchase') : t('fatura.sale')} ${t('fatura.success.saved')}`);
    setIsAddModalOpen(false);
    resetForm();
  };

  // Cancel fatura — stok hareketlerini de geri al
  const handleCancel = async (id: string) => {
    if (!canEdit) { toast.error(t('fatura.err.noPermCancel')); return; }
    if (!confirm(t('fatura.err.confirmCancel'))) return;

    const fatura = faturalar.find(f => f.id === id);
    if (!fatura) return;

    const cancelledFatura = { ...fatura, status: 'iptal' as const, cancelledAt: new Date().toISOString(), cancelledBy: currentEmployee?.name || user?.name || '' };
    setInStorage(StorageKey.FATURALAR, faturalar.map(f => f.id === id ? cancelledFatura : f));
    updateFaturaSync(id, cancelledFatura);

    // ─── STOK GERİ ALMA (useTableSync ile senkron) ────────────────────────
    if (fatura.isLinkedToGoods && (fatura.faturaItems || []).length > 0) {
      for (const item of (fatura.faturaItems || [])) {
        const fsItem = faturaStok.find(fs => fs.name === item.name);
        const linkedStockId = item.linkedStockId || fsItem?.linkedStockId;
        if (!linkedStockId) continue;

        const stock = stokList.find((s: any) => s.id === linkedStockId);
        if (!stock) continue;

        // Geri al: alış ise stoğu azalt, satış ise stoğu artır
        const qtyDelta = fatura.type === 'alis' ? -item.quantity : item.quantity;
        const reverseMovement = {
          id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
          type: 'FATURA_IPTAL',
          quantity: item.quantity,
          date: new Date().toISOString().split('T')[0],
          partyName: fatura.counterParty,
          description: `Fatura İPTAL #${fatura.id.slice(0, 12)} — ${item.name}`,
          faturaId: fatura.id,
        };

        await updateStokItem(linkedStockId, {
          currentStock: (stock.currentStock ?? 0) + qtyDelta,
          movements: [reverseMovement, ...(stock.movements || [])],
        } as any);
      }
      emit('stok:updated', { productId: '', productName: '', changes: {}, source: 'fatura_iptal', faturaId: id });
    }

    if (selectedFatura?.id === id) setSelectedFatura(cancelledFatura);
    sec.auditLog('cancel', id, `fatura_iptal:${fatura.type}:${fatura.grossAmount}`);
    emit('fatura:cancelled', { faturaId: id, type: fatura.type, amount: fatura.grossAmount });
    toast.success(t('fatura.success.cancelled'));
    logActivity('invoice_cancel', 'Fatura İptal Edildi', { employeeName: user?.name, page: 'Fatura', description: `Fatura ID: ${id} — ₺${fatura.grossAmount}` });
  };

  /** UBL-TR XML indir — LUCA portala yüklemek için */
  const handleDownloadUBL = (fatura: Fatura) => {
    if (fatura.type !== 'satis') { toast.error('UBL-TR XML sadece satış faturaları için oluşturulabilir'); return; }
    const company = getCompanyInfo();
    const satirlar = (fatura.faturaItems || []).map((item, i) => ({
      sira: i + 1,
      aciklama: item.name,
      miktar: item.quantity,
      birim: item.unit || 'KG',
      birimFiyat: item.unitPrice,
      matrah: item.totalPrice,
      kdvOrani: item.itemKdvRate ?? fatura.kdvRate,
      kdvTutar: item.itemKdvAmount ?? (item.totalPrice * (item.itemKdvRate ?? fatura.kdvRate) / 100),
      satirToplam: item.itemGrossTotal ?? (item.totalPrice * (1 + (item.itemKdvRate ?? fatura.kdvRate) / 100)),
    }));
    const ublData: UBLFaturaData = {
      faturaUUID: fatura.id.replace(/[^a-f0-9-]/gi, '') || crypto.randomUUID(),
      faturaNo: fatura.faturaNo || `EAF${new Date().getFullYear()}${String(Date.now()).slice(-9)}`,
      tarih: fatura.date,
      saat: new Date(fatura.createdAt).toTimeString().slice(0, 8),
      faturaType: 'SATIS',
      saticiVKN: (company as any).vkn || '0000000000',
      saticiUnvan: company.companyName || 'İŞLEYEN ET',
      saticiAdres: (company as any).address || '',
      saticiIlce: (company as any).ilce || '',
      saticiIl: (company as any).il || 'İstanbul',
      aliciUnvan: fatura.counterParty,
      aliciVKN: undefined,
      satirlar: satirlar.length > 0 ? satirlar : [{ sira: 1, aciklama: fatura.counterParty, miktar: 1, birim: 'Adet', birimFiyat: fatura.netAmount, matrah: fatura.netAmount, kdvOrani: fatura.kdvRate, kdvTutar: fatura.kdvAmount, satirToplam: fatura.grossAmount }],
      matrahToplam: fatura.netAmount,
      kdvToplam: fatura.kdvAmount,
      genelToplam: fatura.grossAmount,
      para: 'TRY',
      aciklama: fatura.description,
    };
    const xml = generateUBLXML(ublData);
    const fatNo = fatura.faturaNo || fatura.id.slice(-8).toUpperCase();
    downloadXML(xml, `efatura_${fatNo}_${fatura.date}.xml`);
    // e-Fatura durumunu "bekliyor" olarak işaretle
    const updated = faturalar.map(f => f.id === fatura.id ? { ...f, efatura: { ...(f.efatura || {}), status: 'bekliyor' as const, efaturaNo: ublData.faturaNo } } : f);
    setInStorage(StorageKey.FATURALAR, updated);
    logActivity('custom', 'e-Fatura UBL-TR XML indirildi', { employeeName: user?.name, page: 'Fatura', description: `${ublData.faturaNo}` });
    toast.success(`UBL-TR XML indirildi — LUCA portalına yükleyebilirsiniz`, { description: 'turmobefatura.luca.com.tr adresine giriş yapın' });
  };

  /** e-Fatura durumunu güncelle */
  const updateEfaturaStatus = (id: string, status: Fatura['efatura']) => {
    const updated = faturalar.map(f => f.id === id ? { ...f, efatura: status } : f);
    setInStorage(StorageKey.FATURALAR, updated);
    if (selectedFatura?.id === id) setSelectedFatura(updated.find(f => f.id === id) || null);
    toast.success('e-Fatura durumu güncellendi');
  };

  // Delete fatura
  const handleDelete = (id: string) => {
    if (!canDelete) { toast.error(t('fatura.err.noPermDelete')); return; }
    const fatura = faturalar.find(f => f.id === id);
    if (!fatura) return;
    if (fatura.status === 'aktif') {
      toast.error(t('fatura.err.cannotDeleteActive'));
      return;
    }
    if (!confirm(t('fatura.err.confirmDelete'))) return;
    setInStorage(StorageKey.FATURALAR, faturalar.filter(f => f.id !== id));
    deleteFaturaSync(id);
    if (selectedFatura?.id === id) { setSelectedFatura(null); setIsDetailOpen(false); }
    sec.auditLog('delete', id, `fatura_silindi:${fatura.type}:${fatura.grossAmount}`);
    emit('fatura:deleted', { faturaId: id });
    toast.success(t('fatura.success.deleted'));
    logActivity('invoice_delete', 'Fatura Silindi', { employeeName: user?.name, page: 'Fatura', description: `Fatura ID: ${id}` });
  };

  // Fatura stok management
  const [newFaturaStokName, setNewFaturaStokName] = useState('');
  const [newFaturaStokUnit, setNewFaturaStokUnit] = useState('KG');
  const [newFaturaStokLinked, setNewFaturaStokLinked] = useState('');

  const addFaturaStokItem = () => {
    if (!canAdd) { toast.error(t('fatura.err.noPermStokAdd')); return; }
    if (!newFaturaStokName.trim()) { toast.error(t('fatura.err.noStokName')); return; }
    // Duplikat kontrolü
    if (faturaStok.some(fs => fs.name.toLowerCase() === newFaturaStokName.trim().toLowerCase())) {
      toast.error(`"${newFaturaStokName}" ${t('fatura.err.stokDuplicate')}`);
      return;
    }
    const linkedStock = stokList.find(s => s.id === newFaturaStokLinked);
    const newItem: FaturaStokItem = {
      id: `fs-${Date.now()}`,
      name: newFaturaStokName.trim(),
      unit: newFaturaStokUnit,
      linkedStockId: linkedStock?.id,
      linkedStockName: linkedStock?.name,
    };
    setInStorage(StorageKey.FATURA_STOK, [...faturaStok, newItem]);
    addFaturaStokSync(newItem);
    setNewFaturaStokName('');
    setNewFaturaStokLinked('');
    sec.auditLog('add', newItem.id, `fatura_stok_kalemi:${newItem.name}`);
    emit('faturaStok:added', { id: newItem.id, name: newItem.name });
    toast.success(`"${newItem.name}" ${t('fatura.success.stokAdded')}`);
    logActivity('fatura_stok_add', `Fatura Stok Kalemi Eklendi: ${newItem.name}`, { employeeName: user?.name, page: 'Fatura' });
  };

  const removeFaturaStokItem = (id: string) => {
    if (!canDelete) { toast.error(t('fatura.err.noPermStokDelete')); return; }
    const item = faturaStok.find(fs => fs.id === id);
    const usedInFatura = faturalar.some(f => f.status === 'aktif' && (f.faturaItems || []).some((fi: any) => fi.name === item?.name));
    if (usedInFatura && !confirm(`"${item?.name}" ${t('fatura.err.stokInUse')}`)) return;
    setInStorage(StorageKey.FATURA_STOK, faturaStok.filter(s => s.id !== id));
    deleteFaturaStokSync(id);
    sec.auditLog('delete', id, `fatura_stok_silindi:${item?.name}`);
    emit('faturaStok:deleted', { id, name: item?.name });
    logActivity('fatura_stok_delete', `Fatura Stok Kalemi Silindi: ${item?.name}`, { employeeName: user?.name, page: 'Fatura' });
  };

  // ─── FATURA STOK KULLANIM RAPORU ──────────────────────────────────────
  const faturaStokUsage = useMemo(() => {
    const usage: Record<string, { name: string; totalQty: number; totalAmount: number; faturaCount: number; linkedStockName?: string }> = {};
    faturalar.filter(f => f.status === 'aktif').forEach(f => {
      (f.faturaItems || []).forEach((item: any) => {
        const key = item.name;
        if (!usage[key]) {
          const fsItem = faturaStok.find(fs => fs.name === item.name);
          usage[key] = { name: item.name, totalQty: 0, totalAmount: 0, faturaCount: 0, linkedStockName: fsItem?.linkedStockName };
        }
        usage[key].totalQty += item.quantity;
        usage[key].totalAmount += item.totalPrice;
        usage[key].faturaCount += 1;
      });
    });
    return Object.values(usage).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [faturalar, faturaStok]);

  // ─── KDV RAPORU ──────────────────────────────────────────────────────
  const kdvRaporu = useMemo(() => {
    const aktifFaturalar = faturalar.filter(f => f.status === 'aktif');
    const alislar = aktifFaturalar.filter(f => f.type === 'alis');
    const satislar = aktifFaturalar.filter(f => f.type === 'satis');

    // KDV oran bazlı kırılım
    const kdvByRate: Record<number, { alisNet: number; alisKdv: number; satisNet: number; satisKdv: number; count: number }> = {};
    aktifFaturalar.forEach(f => {
      if (!kdvByRate[f.kdvRate]) kdvByRate[f.kdvRate] = { alisNet: 0, alisKdv: 0, satisNet: 0, satisKdv: 0, count: 0 };
      kdvByRate[f.kdvRate].count++;
      if (f.type === 'alis') {
        kdvByRate[f.kdvRate].alisNet += f.netAmount;
        kdvByRate[f.kdvRate].alisKdv += f.kdvAmount;
      } else {
        kdvByRate[f.kdvRate].satisNet += f.netAmount;
        kdvByRate[f.kdvRate].satisKdv += f.kdvAmount;
      }
    });

    // Aylık KDV özeti
    const monthlyKdv: Record<string, { alisKdv: number; satisKdv: number; net: number; faturaCount: number }> = {};
    aktifFaturalar.forEach(f => {
      const month = f.date.slice(0, 7); // YYYY-MM
      if (!monthlyKdv[month]) monthlyKdv[month] = { alisKdv: 0, satisKdv: 0, net: 0, faturaCount: 0 };
      monthlyKdv[month].faturaCount++;
      if (f.type === 'alis') {
        monthlyKdv[month].alisKdv += f.kdvAmount;
      } else {
        monthlyKdv[month].satisKdv += f.kdvAmount;
      }
      monthlyKdv[month].net = monthlyKdv[month].satisKdv - monthlyKdv[month].alisKdv;
    });

    // Tevkifat özeti
    const tevkifatTotal = aktifFaturalar.reduce((s, f) => s + (f.tevkifatAmount || 0), 0);
    const tevkifatCount = aktifFaturalar.filter(f => f.tevkifatRate && f.tevkifatRate > 0).length;

    return {
      totalAlisKdv: alislar.reduce((s, f) => s + f.kdvAmount, 0),
      totalSatisKdv: satislar.reduce((s, f) => s + f.kdvAmount, 0),
      kdvFark: satislar.reduce((s, f) => s + f.kdvAmount, 0) - alislar.reduce((s, f) => s + f.kdvAmount, 0),
      kdvByRate,
      monthlyKdv,
      tevkifatTotal,
      tevkifatCount,
    };
  }, [faturalar]);

  // ─── STOK ETKİ ANALİZİ ──────────────────────────────────────────────
  const stokEtkiData = useMemo(() => {
    const faturaMovements: { productName: string; productId: string; movements: any[] }[] = [];

    (stokList || []).forEach((stock: any) => {
      const fMoves = (stock.movements || []).filter((m: any) =>
        m.type === 'FATURA_ALIS' || m.type === 'FATURA_SATIS' || m.type === 'FATURA_IPTAL'
      );
      if (fMoves.length > 0) {
        faturaMovements.push({ productName: stock.name, productId: stock.id, movements: fMoves });
      }
    });

    return faturaMovements.sort((a, b) => b.movements.length - a.movements.length);
  }, [faturalar, stokList]);

  // Photo upload handler — canvas sıkıştırmalı
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
    if (!file) return;
    compressImage(file).then(photo => setForm(f => ({ ...f, photo }))).catch(() => toast.error(t('fatura.err.fileTooBig')));
  };

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-4 sm:pb-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-black flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-blue-600/10 border border-indigo-500/20">
              <FileText className="w-7 h-7 text-indigo-400" />
            </div>
            {t('fatura.title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('fatura.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsFaturaStokModalOpen(true)}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-amber-400"
          >
            <Package className="w-4 h-4" /> {t('fatura.faturaStok')}
          </button>
          <button
            onClick={() => { resetForm(); setIsAddModalOpen(true); }}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> {t('fatura.add')}
          </button>
        </div>
      </div>

      {/* ─── Stats ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('fatura.totalInvoices'), value: stats.total, icon: FileText, color: 'blue' },
          { label: t('fatura.purchaseInvoices'), value: stats.alisCount, sub: `₺${stats.alisToplam.toLocaleString('tr-TR')}`, icon: ArrowDownRight, color: 'orange' },
          { label: t('fatura.salesInvoices'), value: stats.satisCount, sub: `₺${stats.satisToplam.toLocaleString('tr-TR')}`, icon: ArrowUpRight, color: 'emerald' },
          { label: t('fatura.cancelled'), value: stats.iptal, icon: XCircle, color: 'red' },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`p-4 rounded-2xl bg-gradient-to-br from-${s.color}-500/10 via-[#111] to-[#111] border border-${s.color}-500/20`}
          >
            <div className="flex items-center justify-between mb-2">
              <s.icon className={`w-5 h-5 text-${s.color}-400`} />
              <span className="text-2xl font-black text-white"><AnimatedCounter value={s.value} /></span>
            </div>
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            {s.sub && <p className={`text-xs font-bold text-${s.color}-400 mt-0.5`}>{s.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* ─── KDV & Bağlantı Özeti ─── */}
      {stats.aktif > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
            <span className="text-xs text-gray-500">{t('fatura.totalKdv')}</span>
            <span className="text-sm font-bold text-blue-400">₺{stats.toplamKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
            <span className="text-xs text-gray-500">{t('fatura.goodsLinked')}</span>
            <span className="text-sm font-bold text-emerald-400">{stats.linkedCount}</span>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
            <span className="text-xs text-gray-500">{t('fatura.independent')}</span>
            <span className="text-sm font-bold text-purple-400">{stats.unlinkedCount}</span>
          </div>
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        {([
          { key: 'faturalar' as const, label: t('fatura.tab.invoices'), icon: FileText },
          { key: 'kdvRaporu' as const, label: t('fatura.tab.kdvReport'), icon: Percent },
          { key: 'stokEtki' as const, label: t('fatura.tab.stockImpact'), icon: Package },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActivePageTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activePageTab === tab.key
                ? 'bg-white/10 text-white shadow-lg'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════ TAB: Faturalar ═══════ */}
      {activePageTab === 'faturalar' && (<>

      {/* ─── Filters ─── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={t('fatura.search')}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-all"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'alis', 'satis'] as const).map(type => (
            <button key={type} onClick={() => { setFilterType(type); sessionStorage.setItem('mert4_filter_fatura_type', type); }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${filterType === type ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-white/5 text-gray-500 border-white/5 hover:bg-white/10'}`}>
              {type === 'all' ? t('fatura.all') : type === 'alis' ? t('fatura.purchase') : t('fatura.sale')}
            </button>
          ))}
          {(['all', 'aktif', 'iptal'] as const).map(st => (
            <button key={st} onClick={() => { setFilterStatus(st); sessionStorage.setItem('mert4_filter_fatura_status', st); }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${filterStatus === st ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-gray-500 border-white/5 hover:bg-white/10'}`}>
              {st === 'all' ? t('fatura.statusFilter') : st === 'aktif' ? t('fatura.active') : t('fatura.cancelledStatus')}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Fatura List ─── */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-600">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-bold">{t('fatura.noInvoice')}</p>
            <p className="text-sm mt-1">{t('fatura.noInvoiceDesc')}</p>
          </div>
        )}
        <motion.div
          variants={staggerContainer(0.04, 0.02)}
          initial="initial"
          animate="animate"
        >
        <AnimatePresence>
          {filtered.map((fatura) => (
            <SwipeToDelete
              key={fatura.id}
              disabled={fatura.status === 'aktif' || !canDelete}
              onDelete={() => handleDelete(fatura.id)}
            >
            <motion.div
              variants={rowItem}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.16 } }}
              whileHover={{ x: 3, transition: { duration: 0.15 } }}
              whileTap={tap.card}
              onClick={() => { setSelectedFatura(fatura); setIsDetailOpen(true); }}
              className={`p-4 rounded-2xl border cursor-pointer transition-colors hover:shadow-lg group ${
                fatura.status === 'iptal'
                  ? 'bg-red-500/5 border-red-500/10 opacity-60'
                  : fatura.type === 'alis'
                    ? 'bg-gradient-to-r from-orange-500/5 to-transparent border-orange-500/10 hover:border-orange-500/30'
                    : 'bg-gradient-to-r from-emerald-500/5 to-transparent border-emerald-500/10 hover:border-emerald-500/30'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Icon + Badge */}
                <div className="relative">
                  <div className={`p-3 rounded-xl ${fatura.type === 'alis' ? 'bg-orange-500/10' : 'bg-emerald-500/10'}`}>
                    {fatura.type === 'alis' ? <ArrowDownRight className="w-5 h-5 text-orange-400" /> : <ArrowUpRight className="w-5 h-5 text-emerald-400" />}
                  </div>
                  {fatura.status === 'aktif' && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-500 text-white text-[9px] font-black flex items-center justify-center shadow-lg shadow-blue-500/40">F</span>
                  )}
                  {fatura.status === 'iptal' && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">✕</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white text-sm truncate">{fatura.counterParty}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${fatura.type === 'alis' ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {fatura.type === 'alis' ? t('fatura.purchaseTag') : t('fatura.saleTag')}
                    </span>
                    {!fatura.isLinkedToGoods && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400">Mal Karşılığı Yok</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{new Date(fatura.date).toLocaleDateString('tr-TR')}</span>
                    <span>•</span>
                    <span>{fatura.issuedTo}</span>
                    <span>•</span>
                    <span>KDV %{fatura.kdvRate}</span>
                    {fatura.faturaNo && <><span>•</span><span className="font-mono">{fatura.faturaNo}</span></>}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right">
                  <p className="text-lg font-black text-white">₺{fatura.grossAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-gray-500">KDV: ₺{fatura.kdvAmount.toFixed(2)}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => shareViaWhatsApp(fatura)} className="p-2 hover:bg-green-500/10 rounded-lg transition-all" title="WhatsApp ile Paylaş">
                    <MessageCircle className="w-4 h-4 text-green-400" />
                  </button>
                  {fatura.status === 'aktif' && fatura.type === 'satis' && (
                    <button onClick={() => handleDownloadUBL(fatura)} className="p-2 hover:bg-blue-500/10 rounded-lg transition-all" title="e-Fatura XML İndir (LUCA)">
                      <Download className="w-4 h-4 text-blue-400" />
                    </button>
                  )}
                  {fatura.status === 'aktif' && (
                    <button onClick={() => handleCancel(fatura.id)} className="p-2 hover:bg-red-500/10 rounded-lg transition-all" title="İptal Et">
                      <XCircle className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                  <button onClick={() => handleDelete(fatura.id)} className="p-2 hover:bg-red-500/10 rounded-lg transition-all" title="Sil">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
                {/* e-Fatura durum rozeti */}
                {fatura.efatura && (
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${
                      fatura.efatura.status === 'onaylandi' ? 'bg-emerald-500/20 text-emerald-400' :
                      fatura.efatura.status === 'reddedildi' ? 'bg-red-500/20 text-red-400' :
                      fatura.efatura.status === 'gonderildi' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>
                      e-Fatura {fatura.efatura.status === 'bekliyor' ? 'Bekliyor' : fatura.efatura.status === 'gonderildi' ? 'Gönderildi' : fatura.efatura.status === 'onaylandi' ? 'Onaylandı ✓' : 'Reddedildi ✗'}
                    </span>
                    {fatura.efatura.efaturaNo && <span className="text-[9px] font-mono text-gray-500">{fatura.efatura.efaturaNo}</span>}
                  </div>
                )}
              </div>

              {/* Items preview */}
              {(fatura.faturaItems || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-2">
                  {(fatura.faturaItems || []).slice(0, 4).map((item: any, i: number) => (
                    <span key={i} className="px-2 py-1 bg-white/5 rounded-lg text-[10px] text-gray-400">
                      {item.name} • {item.quantity} {item.unit} • ₺{item.totalPrice.toFixed(2)}
                    </span>
                  ))}
                  {(fatura.faturaItems || []).length > 4 && (
                    <span className="px-2 py-1 bg-white/5 rounded-lg text-[10px] text-gray-500">+{(fatura.faturaItems || []).length - 4} kalem</span>
                  )}
                </div>
              )}
            </motion.div>
            </SwipeToDelete>
          ))}
        </AnimatePresence>
        </motion.div>
      </div>

      </>)}

      {/* ═══════ TAB: KDV Raporu ═══════ */}
      {activePageTab === 'kdvRaporu' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              { label: 'Alış KDV', value: kdvRaporu.totalAlisKdv, color: 'orange', desc: 'Ödenen KDV' },
              { label: 'Satış KDV', value: kdvRaporu.totalSatisKdv, color: 'emerald', desc: 'Tahsil edilen KDV' },
              { label: 'KDV Farkı', value: kdvRaporu.kdvFark, color: kdvRaporu.kdvFark >= 0 ? 'blue' : 'red', desc: 'Ödenecek / Devreden' },
              { label: 'Tevkifat', value: kdvRaporu.tevkifatTotal, color: 'purple', desc: `${kdvRaporu.tevkifatCount} faturada` },
            ].map((s, i) => (
              <div key={i} className={`p-4 rounded-2xl bg-gradient-to-br from-${s.color}-500/10 via-[#111] to-[#111] border border-${s.color}-500/20`}>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{s.label}</p>
                <p className={`text-xl font-black text-${s.color}-400 mt-1`}>₺{Math.abs(s.value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="p-5 rounded-2xl card-premium">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Percent className="w-4 h-4 text-blue-400" /> KDV Oran Bazlı Kırılım
            </h3>
            <div className="overflow-x-auto">
              <div className="min-w-[380px] space-y-2">
                <div className="grid grid-cols-5 gap-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold px-3 pb-2 border-b border-white/5">
                  <span>Oran</span><span>Alış Net</span><span>Alış KDV</span><span>Satış Net</span><span>Satış KDV</span>
                </div>
                {(Object.entries(kdvRaporu.kdvByRate) as [string, { alisNet: number; alisKdv: number; satisNet: number; satisKdv: number; count: number }][]).sort(([a], [b]) => Number(a) - Number(b)).map(([rate, data]) => (
                  <div key={rate} className="grid grid-cols-5 gap-2 text-xs px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                    <span className="font-bold text-blue-400">%{rate}</span>
                    <span className="text-orange-300">₺{data.alisNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    <span className="text-orange-400 font-bold">₺{data.alisKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    <span className="text-emerald-300">₺{data.satisNet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    <span className="text-emerald-400 font-bold">₺{data.satisKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                {Object.keys(kdvRaporu.kdvByRate).length === 0 && (
                  <p className="text-center text-gray-600 text-xs py-6">Henüz fatura verisi yok</p>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl card-premium">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" /> Aylık KDV Özeti
            </h3>
            <div className="overflow-x-auto">
              <div className="min-w-[380px] space-y-2">
                <div className="grid grid-cols-5 gap-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold px-3 pb-2 border-b border-white/5">
                  <span>Dönem</span><span>Fatura</span><span>Alış KDV</span><span>Satış KDV</span><span>Fark</span>
                </div>
                {(Object.entries(kdvRaporu.monthlyKdv) as [string, { alisKdv: number; satisKdv: number; net: number; faturaCount: number }][]).sort(([a], [b]) => b.localeCompare(a)).map(([month, data]) => (
                  <div key={month} className="grid grid-cols-5 gap-2 text-xs px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                    <span className="font-bold text-white">{month}</span>
                    <span className="text-gray-400">{data.faturaCount}</span>
                    <span className="text-orange-400">₺{data.alisKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    <span className="text-emerald-400">₺{data.satisKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    <span className={`font-bold ${data.net >= 0 ? 'text-blue-400' : 'text-red-400'}`}>₺{data.net.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                {Object.keys(kdvRaporu.monthlyKdv).length === 0 && (
                  <p className="text-center text-gray-600 text-xs py-6">Henüz aylık veri yok</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══════ TAB: Stok Etkisi ═══════ */}
      {activePageTab === 'stokEtki' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="p-5 rounded-2xl card-premium">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" /> Fatura Kaynaklı Stok Hareketleri
            </h3>
            {stokEtkiData.length === 0 ? (
              <p className="text-center text-gray-600 text-xs py-8">Fatura kaynaklı stok hareketi bulunamadı</p>
            ) : (
              <div className="space-y-3">
                {stokEtkiData.map(item => (
                  <div key={item.productId} className="p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-white">{item.productName}</span>
                      <span className="text-[10px] text-gray-500">{item.movements.length} hareket</span>
                    </div>
                    <div className="space-y-1">
                      {item.movements.slice(0, 5).map((m: any, i: number) => (
                        <div key={m.id || i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              m.type === 'FATURA_ALIS' ? 'bg-indigo-500/15 text-indigo-400' :
                              m.type === 'FATURA_SATIS' ? 'bg-teal-500/15 text-teal-400' :
                              'bg-rose-500/15 text-rose-400'
                            }`}>{m.type === 'FATURA_ALIS' ? 'Alış' : m.type === 'FATURA_SATIS' ? 'Satış' : 'İptal'}</span>
                            <span className="text-gray-500 truncate max-w-[180px]">{m.description || m.partyName || '-'}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold ${m.type === 'FATURA_ALIS' ? 'text-emerald-400' : 'text-red-400'}`}>
                              {m.type === 'FATURA_ALIS' ? '+' : '-'}{m.quantity}
                            </span>
                            {m.kdvAmount ? <span className="text-blue-400 text-[10px]">KDV ₺{m.kdvAmount.toFixed(2)}</span> : null}
                            <span className="text-gray-600 text-[10px]">{m.date ? new Date(m.date).toLocaleDateString('tr-TR') : ''}</span>
                          </div>
                        </div>
                      ))}
                      {item.movements.length > 5 && (
                        <p className="text-[10px] text-gray-600 text-center pt-1">+{item.movements.length - 5} daha...</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════ FATURA EKLE MODAL ═══════════════════════════ */}
      <Dialog.Root open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-2xl bg-[#0a0a0f] border border-white/10 rounded-3xl z-50 flex flex-col overflow-hidden shadow-2xl" style={{maxHeight: 'calc(100dvh - 1rem)'}}>
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-400" /> Yeni Fatura Ekle
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Alış veya satış faturası kaydı oluşturun</p>
              </div>
              <Dialog.Close className="p-2 hover:bg-white/10 rounded-xl transition-all">
                <X className="w-5 h-5 text-gray-400" />
              </Dialog.Close>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Tür */}
              <div className="grid grid-cols-2 gap-3">
                {(['alis', 'satis'] as const).map(type => (
                  <button key={type} onClick={() => { setForm(f => ({ ...f, type, counterParty: '', counterPartyId: '' })); setCariPickerTab(type === 'alis' ? 'toptanci' : 'ozel'); setCariSearchTerm(''); }}
                    className={`p-4 rounded-2xl border text-left transition-all ${form.type === type ? (type === 'alis' ? 'bg-orange-500/10 border-orange-500/30' : 'bg-emerald-500/10 border-emerald-500/30') : 'bg-white/[0.03] border-white/5 hover:border-white/15'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {type === 'alis' ? <ArrowDownRight className={`w-5 h-5 ${form.type === type ? 'text-orange-400' : 'text-gray-500'}`} />
                        : <ArrowUpRight className={`w-5 h-5 ${form.type === type ? 'text-emerald-400' : 'text-gray-500'}`} />}
                      <span className={`font-bold text-sm ${form.type === type ? 'text-white' : 'text-gray-400'}`}>{type === 'alis' ? 'Alış Faturası' : 'Satış Faturası'}</span>
                    </div>
                    <p className="text-[10px] text-gray-600">{type === 'alis' ? 'Toptancıdan aldığımız fatura' : 'Müşteriye kestiğimiz fatura'}</p>
                  </button>
                ))}
              </div>

              {/* Karşı Taraf (Cari) — Sekmeli Seçici */}
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">
                  {form.type === 'alis' ? 'Kimden Alındı' : 'Kime Kesildi'}
                </label>

                {/* Seçili cari göstergesi */}
                {form.counterParty && (
                  <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <span className={`w-2.5 h-2.5 rounded-full ${form.counterPartyId ? (cariList.find(c => c.id === form.counterPartyId)?.type === 'Toptancı' ? 'bg-orange-500' : 'bg-blue-500') : 'bg-gray-500'}`} />
                    <span className="text-sm font-semibold text-white flex-1 truncate">{form.counterParty}</span>
                    <button onClick={() => { setForm(f => ({ ...f, counterParty: '', counterPartyId: '' })); setCariSearchTerm(''); }}
                      className="text-xs text-red-400 hover:text-red-300 font-bold transition-colors px-2 py-0.5 rounded-lg hover:bg-red-500/10">Değiştir</button>
                  </div>
                )}

                {/* Sekmeler + Liste */}
                {!form.counterParty && (
                  <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-white/[0.02]">
                    {/* Tab Headers */}
                    <div className="flex border-b border-white/[0.08]">
                      {(['toptanci', 'ozel'] as const).map(tab => (
                        <button key={tab} onClick={() => { setCariPickerTab(tab); setCariSearchTerm(''); }}
                          className={`flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${cariPickerTab === tab ? 'bg-blue-500/15 text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'}`}>
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${tab === 'toptanci' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                          {tab === 'toptanci' ? 'Toptancılar' : 'Özel Cariler'}
                        </button>
                      ))}
                    </div>

                    {/* Arama */}
                    <div className="p-2 border-b border-white/[0.06]">
                      <input
                        value={cariSearchTerm}
                        onChange={e => setCariSearchTerm(e.target.value)}
                        placeholder="Cari ara..."
                        className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg text-white placeholder-gray-600 text-xs outline-none focus:border-blue-500/40 transition-all"
                      />
                    </div>

                    {/* Cari Listesi */}
                    <div className="max-h-48 overflow-y-auto">
                      {filteredCari.length === 0 ? (
                        <div className="p-4 text-center text-gray-600 text-xs">
                          {cariSearchTerm ? 'Sonuç bulunamadı' : (cariPickerTab === 'toptanci' ? 'Toptancı carisi yok' : 'Özel cari yok')}
                        </div>
                      ) : (
                        filteredCari.map(c => (
                          <button key={c.id}
                            onClick={() => { setForm(f => ({ ...f, counterParty: c.companyName, counterPartyId: c.id })); setCariSearchTerm(''); }}
                            className="w-full px-4 py-2.5 text-left hover:bg-white/5 transition-all flex items-center gap-3 text-sm border-b border-white/[0.04] last:border-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${c.type === 'Toptancı' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate">{c.companyName}</p>
                              {c.contactPerson && <p className="text-gray-600 text-[10px] truncate">{c.contactPerson}</p>}
                            </div>
                            {c.balance !== undefined && c.balance !== 0 && (
                              <span className={`text-[10px] font-bold ${c.balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                ₺{Math.abs(c.balance).toLocaleString('tr-TR')}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Firmamız + Fatura No + Tarih */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">Kesildiği Firma</label>
                  <select value={form.issuedTo} onChange={e => setForm(f => ({ ...f, issuedTo: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm outline-none">
                    {FIRMA_LISTESI.map(f => <option key={f} value={f} className="bg-[#111]">{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">Fatura No</label>
                  <input value={form.faturaNo} onChange={e => setForm(f => ({ ...f, faturaNo: e.target.value }))}
                    placeholder="Opsiyonel" className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">Tarih</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm outline-none" />
                </div>
              </div>

              {/* KDV + Mal Karşılığı */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">KDV Oranı</label>
                  <div className="flex gap-1.5">
                    {KDV_RATES.map(rate => (
                      <button key={rate} onClick={() => setForm(f => ({ ...f, kdvRate: rate }))}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${form.kdvRate === rate ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-white/5 text-gray-500 border-white/5 hover:bg-white/10'}`}>
                        %{rate}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">Mal Karşılığı</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setForm(f => ({ ...f, isLinkedToGoods: true }))}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${form.isLinkedToGoods ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' : 'bg-white/5 text-gray-500 border-white/5'}`}>
                      Evet
                    </button>
                    <button onClick={() => setForm(f => ({ ...f, isLinkedToGoods: false }))}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${!form.isLinkedToGoods ? 'bg-purple-600/20 text-purple-400 border-purple-500/30' : 'bg-white/5 text-gray-500 border-white/5'}`}>
                      Hayır
                    </button>
                  </div>
                </div>
              </div>

              {/* Fatura Kalemleri */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-500 font-bold uppercase tracking-wider">Fatura Kalemleri</label>
                  <button onClick={addFormItem} className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition-all">
                    <Plus className="w-3.5 h-3.5" /> Kalem Ekle
                  </button>
                </div>
                <div className="space-y-2">
                  {formItems.map((item, idx) => (
                    <div key={item.id} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-[10px] text-gray-600 font-bold w-5 flex-shrink-0">{idx + 1}</span>
                        <select value={item.name} onChange={e => {
                          const selected = faturaStok.find(fs => fs.name === e.target.value);
                          updateFormItem(item.id, 'name', e.target.value);
                          if (selected) {
                            setFormItems(prev => prev.map(fi => fi.id === item.id ? { ...fi, unit: selected.unit, linkedStockId: selected.linkedStockId, linkedStockName: selected.linkedStockName } : fi));
                          }
                        }}
                          className="flex-1 min-w-[160px] px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-xs outline-none">
                          <option value="" className="bg-[#111]">Fatura kalemi seçin...</option>
                          {faturaStok.map(fs => (
                            <option key={fs.id} value={fs.name} className="bg-[#111]">{fs.name} ({fs.unit}){fs.linkedStockName ? ` → ${fs.linkedStockName}` : ''}</option>
                          ))}
                        </select>
                        <input type="number" step="0.01" value={item.quantity || ''} onChange={e => updateFormItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          placeholder="Miktar" className="w-20 flex-shrink-0 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-xs outline-none text-right" />
                        <input type="number" step="0.01" value={item.unitPrice || ''} onChange={e => updateFormItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          placeholder="B.Fiyat" className="w-24 flex-shrink-0 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-xs outline-none text-right" />
                        <span className="text-xs font-bold text-white w-20 flex-shrink-0 text-right">₺{item.totalPrice.toFixed(2)}</span>
                        <button onClick={() => removeFormItem(item.id)} className="p-2 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {formItems.length === 0 && (
                    <button onClick={addFormItem} className="w-full py-4 border border-dashed border-white/10 rounded-xl text-gray-600 hover:text-gray-400 hover:border-white/20 transition-all text-xs flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" /> İlk fatura kalemini ekleyin
                    </button>
                  )}
                </div>
              </div>

              {/* Tutar Özeti */}
              {formItems.length > 0 && (
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Net Tutar:</span>
                    <span className="font-bold text-white">₺{formNetAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-blue-400">
                    <span>KDV (%{form.kdvRate}):</span>
                    <span className="font-bold">₺{formKdvAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/5">
                    <span>Genel Toplam (KDV Dahil):</span>
                    <span className="text-lg">₺{formGrossAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Fatura Fotoğrafı (ZORUNLU) */}
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Fatura Fotoğrafı <span className="text-red-400">*</span>
                </label>
                {form.photo ? (
                  <div className="relative">
                    <img src={form.photo} alt="Fatura" className="w-full max-h-48 object-contain rounded-xl border border-white/10" />
                    <button onClick={() => setForm(f => ({ ...f, photo: '' }))}
                      className="absolute top-2 right-2 p-1.5 bg-red-500/80 rounded-full text-white hover:bg-red-400 transition-all">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-3 px-4 py-6 bg-white/[0.03] border-2 border-dashed border-amber-500/30 rounded-xl cursor-pointer hover:bg-white/[0.06] transition-all">
                    <Upload className="w-6 h-6 text-amber-400" />
                    <div>
                      <p className="text-sm text-amber-400 font-bold">Fatura fotoğrafı yükle</p>
                      <p className="text-[10px] text-gray-600">Bu alan zorunludur. PNG, JPG — maks 10MB</p>
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                )}
              </div>

              {/* Açıklama */}
              <div>
                <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1.5 block">Açıklama (opsiyonel)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Ek not..."
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 text-sm outline-none resize-none" />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/10 flex gap-3">
              <Dialog.Close className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all text-sm text-gray-400">İptal</Dialog.Close>
              <button onClick={handleSave} className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20">
                <CheckCircle2 className="w-4 h-4" /> Faturayı Kaydet
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ═══════════════════════════ FATURA DETAY MODAL ═══════════════════════════ */}
      <Dialog.Root open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-xl bg-[#0a0a0f] border border-white/10 rounded-3xl z-50 flex flex-col overflow-hidden shadow-2xl" style={{maxHeight: 'calc(100dvh - 1rem)'}}>
            {selectedFatura && (
              <>
                <div className={`p-6 border-b border-white/10 ${selectedFatura.status === 'iptal' ? 'bg-red-500/5' : selectedFatura.type === 'alis' ? 'bg-orange-500/5' : 'bg-emerald-500/5'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold tracking-widest uppercase ${selectedFatura.type === 'alis' ? 'text-orange-400' : 'text-emerald-400'}`}>
                          {selectedFatura.type === 'alis' ? 'Alış Faturası' : 'Satış Faturası'}
                        </span>
                        {selectedFatura.status === 'iptal' && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-[10px] font-bold">İPTAL</span>}
                        {selectedFatura.status === 'aktif' && <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[9px] font-black flex items-center justify-center">F</span>}
                      </div>
                      <h2 className="text-2xl font-black text-white">{selectedFatura.counterParty}</h2>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-white">₺{selectedFatura.grossAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-xs text-gray-500">KDV %{selectedFatura.kdvRate} — ₺{selectedFatura.kdvAmount.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white/5 rounded-xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Tarih</p>
                      <p className="text-sm font-bold text-white">{new Date(selectedFatura.date).toLocaleDateString('tr-TR')}</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Kesildiği Firma</p>
                      <p className="text-sm font-bold text-white">{selectedFatura.issuedTo}</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Ekleyen</p>
                      <p className="text-sm font-bold text-white">{selectedFatura.issuedBy}</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Mal Karşılığı</p>
                      <p className={`text-sm font-bold ${selectedFatura.isLinkedToGoods ? 'text-emerald-400' : 'text-purple-400'}`}>
                        {selectedFatura.isLinkedToGoods ? 'Evet' : 'Hayır'}
                      </p>
                    </div>
                  </div>
                  {selectedFatura.faturaNo && (
                    <div className="p-3 bg-white/5 rounded-xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Fatura No</p>
                      <p className="text-sm font-bold text-white font-mono">{selectedFatura.faturaNo}</p>
                    </div>
                  )}

                  {/* Tutar Detayı */}
                  <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl space-y-2">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Net Tutar (KDV Hariç):</span>
                      <span className="font-bold text-white">₺{selectedFatura.netAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-blue-400">
                      <span>KDV (%{selectedFatura.kdvRate}):</span>
                      <span className="font-bold">₺{selectedFatura.kdvAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/5">
                      <span>Toplam (KDV Dahil):</span>
                      <span>₺{selectedFatura.grossAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Kalemler */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Fatura Kalemleri ({(selectedFatura.faturaItems || []).length})</h3>
                    <div className="space-y-1.5">
                      {(selectedFatura.faturaItems || []).map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-xl">
                          <div>
                            <span className="font-bold text-white text-sm">{item.name}</span>
                            <span className="text-xs text-gray-500 ml-2">{item.quantity} {item.unit} x ₺{item.unitPrice.toFixed(2)}</span>
                          </div>
                          <span className="text-sm font-bold text-white">₺{item.totalPrice.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fotoğraf */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                      <Camera className="w-3 h-3" /> Fatura Görüntüsü
                    </h3>
                    <img
                      src={selectedFatura.photo}
                      alt="Fatura"
                      className="w-full max-h-64 object-contain rounded-xl border border-white/10 cursor-pointer hover:opacity-80 transition-all"
                      onClick={() => setLightboxImage(selectedFatura.photo)}
                    />
                  </div>

                  {selectedFatura.description && (
                    <div className="p-3 bg-white/5 rounded-xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Açıklama</p>
                      <p className="text-sm text-gray-300">{selectedFatura.description}</p>
                    </div>
                  )}

                  {/* Stok Etkisi */}
                  {selectedFatura.isLinkedToGoods && selectedFatura.status === 'aktif' && (
                    <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                      <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Package className="w-3 h-3" /> Stok Etkisi
                      </h3>
                      <div className="space-y-1">
                        {(selectedFatura.faturaItems || []).map((item, i) => {
                          const fsItem = faturaStok.find(fs => fs.name === item.name);
                          const hasLink = item.linkedStockId || fsItem?.linkedStockId;
                          return (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">{item.name}</span>
                              {hasLink ? (
                                <span className="text-emerald-400 font-bold">
                                  {selectedFatura.type === 'alis' ? '+' : '-'}{item.quantity} {item.unit} → {fsItem?.linkedStockName || 'Stok'}
                                </span>
                              ) : (
                                <span className="text-gray-600 italic">Stok eşleşmesi yok</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedFatura.status === 'iptal' && (
                    <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                      <p className="text-xs text-red-400 font-bold">İptal Bilgisi</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {selectedFatura.cancelledBy} tarafından {selectedFatura.cancelledAt ? new Date(selectedFatura.cancelledAt).toLocaleString('tr-TR') : ''} tarihinde iptal edildi.
                      </p>
                    </div>
                  )}
                </div>

                {/* ─── e-Fatura / LUCA Bölümü ───────────────────────── */}
                {selectedFatura.type === 'satis' && selectedFatura.status === 'aktif' && (
                  <div className="mx-6 mb-4 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/15">
                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FileCheck className="w-3.5 h-3.5" /> e-Fatura (LUCA)
                    </h3>
                    <div className="flex items-center gap-3 mb-3">
                      {(['bekliyor', 'gonderildi', 'onaylandi', 'reddedildi'] as const).map(s => (
                        <button key={s} onClick={() => updateEfaturaStatus(selectedFatura.id, { ...(selectedFatura.efatura || { status: 'bekliyor' }), status: s })}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${selectedFatura.efatura?.status === s ? (s === 'onaylandi' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : s === 'reddedildi' ? 'bg-red-500/20 text-red-400 border-red-500/30' : s === 'gonderildi' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30') : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10'}`}>
                          {s === 'bekliyor' ? 'Bekliyor' : s === 'gonderildi' ? 'Gönderildi' : s === 'onaylandi' ? 'Onaylandı ✓' : 'Reddedildi ✗'}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => handleDownloadUBL(selectedFatura)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/25 rounded-xl text-sm font-bold text-blue-300 transition-all">
                      <Download className="w-4 h-4" /> UBL-TR XML İndir
                    </button>
                    <p className="text-[10px] text-gray-600 mt-2">XML dosyasını <a href="https://turmobefatura.luca.com.tr" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">turmobefatura.luca.com.tr</a> adresine yükleyin.</p>
                  </div>
                )}

                <div className="p-6 border-t border-white/10 flex gap-3">
                  <button onClick={() => shareViaWhatsApp(selectedFatura)} className="py-3 px-4 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-xl font-bold transition-all text-sm flex items-center gap-2" title="WhatsApp ile Paylaş">
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </button>
                  {selectedFatura.status === 'aktif' && (
                    <button onClick={() => handleCancel(selectedFatura.id)} className="flex-1 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2">
                      <XCircle className="w-4 h-4" /> İptal Et
                    </button>
                  )}
                  <Dialog.Close className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all text-sm">Kapat</Dialog.Close>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ═══════════════════════════ FATURA STOK YÖNETİMİ ═══════════════════════════ */}
      <Dialog.Root open={isFaturaStokModalOpen} onOpenChange={setIsFaturaStokModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[95vw] sm:max-w-lg bg-[#0a0a0f] border border-white/10 rounded-3xl z-50 flex flex-col overflow-hidden shadow-2xl" style={{maxHeight: 'calc(100dvh - 1rem)'}}>
            <div className="p-6 border-b border-white/10">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" /> Fatura Stok Kalemleri
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Sadece fatura oluştururken görünen özel kalemler (ör: Sakatat)</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Mevcut kalemler */}
              <div className="space-y-2">
                {faturaStok.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl group">
                    <Package className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">{item.name} <span className="text-gray-500 font-normal">({item.unit})</span></p>
                      {item.linkedStockName && (
                        <p className="text-[10px] text-emerald-400 mt-0.5">→ Gerçek Stok: {item.linkedStockName}</p>
                      )}
                      {item.description && <p className="text-[10px] text-gray-600 mt-0.5">{item.description}</p>}
                    </div>
                    <button onClick={() => removeFaturaStokItem(item.id)}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg transition-all sm:opacity-0 sm:group-hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Yeni kalem ekle */}
              <div className="p-4 bg-white/[0.03] border border-dashed border-amber-500/20 rounded-2xl space-y-3">
                <p className="text-xs text-amber-400 font-bold uppercase tracking-wider">Yeni Fatura Kalemi Ekle</p>
                <div className="grid grid-cols-3 gap-2">
                  <input value={newFaturaStokName} onChange={e => setNewFaturaStokName(e.target.value)}
                    placeholder="Kalem adı (ör: Sakatat)" className="col-span-2 px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 text-xs outline-none" />
                  <select value={newFaturaStokUnit} onChange={e => setNewFaturaStokUnit(e.target.value)}
                    className="px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-xs outline-none">
                    <option value="KG" className="bg-[#111]">KG</option>
                    <option value="Adet" className="bg-[#111]">Adet</option>
                    <option value="Koli" className="bg-[#111]">Koli</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-600 mb-1 block">Gerçek Stok İle Eşleştir (opsiyonel):</label>
                  <select value={newFaturaStokLinked} onChange={e => setNewFaturaStokLinked(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-xs outline-none">
                    <option value="" className="bg-[#111]">Eşleştirme yok</option>
                    {stokList.map(s => <option key={s.id} value={s.id} className="bg-[#111]">{s.name}</option>)}
                  </select>
                </div>
                <button onClick={addFaturaStokItem}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
                  <Plus className="w-3.5 h-3.5" /> Ekle
                </button>
              </div>

              {/* Kullanım Raporu */}
              {faturaStokUsage.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-blue-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Aktif Faturalardaki Kullanım
                  </p>
                  {faturaStokUsage.map(u => (
                    <div key={u.name} className="flex items-center gap-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">{u.name}</p>
                        <p className="text-[10px] text-gray-500">
                          {u.faturaCount} faturada — {u.totalQty.toFixed(1)} birim
                          {u.linkedStockName && <span className="text-emerald-400"> → {u.linkedStockName}</span>}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-blue-400">₺{u.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/10">
              <Dialog.Close className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all text-sm">Kapat</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ═══════════════════════════ LIGHTBOX ═══════════════════════════ */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-8 cursor-pointer"
            onClick={() => setLightboxImage(null)}
          >
            <img src={lightboxImage} alt="Fatura" className="max-w-full max-h-full object-contain rounded-xl" />
            <button className="absolute top-6 right-6 p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
              <X className="w-6 h-6 text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
