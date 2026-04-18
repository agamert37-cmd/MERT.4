// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useMemo, useEffect } from 'react';
import { useEmployee } from '../contexts/EmployeeContext';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, ArrowDownRight, ArrowUpRight, Download, Edit, Calendar, Receipt, DollarSign,
  FileText, AlertCircle, Building2, Phone, Mail, MapPin, Hash,
  Image as ImageIcon, Eye, PackageOpen, ChevronDown, ChevronRight,
  Camera, User, Clock, Printer, BadgeCheck, FileArchive,
  StickyNote, Plus, Trash2, Pin, PinOff, AlertTriangle, Info, MessageSquare,
  FileCheck, XCircle, Upload, CheckCircle2, Percent,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logActivity } from '../utils/activityLogger';
import { getPagePermissions } from '../utils/permissions';
import { generateCariDetailPDF, generateSingleFisPDF } from '../utils/cariDetailPdf';
import { useTableSync } from '../hooks/useTableSync';
import { getDb } from '../lib/pouchdb';
import { useModuleBus } from '../hooks/useModuleBus';
import { useGlobalTableData } from '../contexts/GlobalTableSyncContext';
import { cariToDb, cariFromDb } from './CariPage';
import { getCompanyInfo } from './SettingsPage';

interface RealDailyExtract {
  date: string;
  previousBalance: number;
  orderAmount: number;
  payment: number;
  newBalance: number;
  fisler: any[];
  standalonePayments: any[];
}

interface EditLog {
  id: string;
  date: string;
  time: string;
  editor: string;
  field: string;
  oldValue: string;
  newValue: string;
  note: string;
}

export function CariDetailPage() {
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();

  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canEdit } = getPagePermissions(user, currentEmployee, 'cariler');
  const { emit, on } = useModuleBus();
  
  const [selectedExtract, setSelectedExtract] = useState<RealDailyExtract | null>(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [selectedFis, setSelectedFis] = useState<any>(null);
  const [isFisDetailOpen, setIsFisDetailOpen] = useState(false);
  const [fisGroupMode, setFisGroupMode] = useState<'gun' | 'hafta' | 'ay'>('gun');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const { updateItem: updateCariSync } = useTableSync<any>({
    tableName: 'cari_hesaplar',
    storageKey: StorageKey.CARI_DATA,
    toDb: cariToDb,
    fromDb: cariFromDb,
  });

  const cariList = useGlobalTableData<any>('cari_hesaplar');
  const cari = useMemo(() => cariList.find(c => c.id === id), [cariList, id]);

  // Canlı PouchDB fişleri — GlobalTableSyncContext üzerinden reaktif
  const globalFisler = useGlobalTableData<any>('fisler');

  const [editForm, setEditForm] = useState({
    companyName: cari?.companyName || '',
    contactPerson: cari?.contactPerson || '',
    phone: cari?.phone || '',
    email: cari?.email || '',
    address: cari?.address || '',
    taxNumber: cari?.taxNumber || '',
    taxOffice: cari?.taxOffice || '',
    approvedBusinessNo: cari?.approvedBusinessNo || '',
    region: cari?.region || '',
    category: cari?.category || '',
  });

  const [editLogs, setEditLogs] = useState<EditLog[]>(() => {
    return getFromStorage<EditLog[]>(`${StorageKey.CARI_DATA}_edit_logs_${id}`) || [];
  });

  const companyInfo = useMemo(() => getCompanyInfo(), []);

  // Silinen fişler için reaktif Set — fis:deleted event'i gelince anında güncellenir
  const [deletedFisIds, setDeletedFisIds] = useState<Set<string>>(
    () => new Set((getFromStorage<any[]>(StorageKey.DELETED_FISLER) || []).map((f: any) => f.id))
  );
  useEffect(() => {
    return on('fis:deleted', ({ fisId }: any) => {
      setDeletedFisIds(prev => new Set([...prev, fisId]));
    });
  }, [on]);

  const allFisler = useMemo(() => {
    // PouchDB canlı veri önce, yoksa localStorage fallback
    const fisler = globalFisler.length > 0
      ? globalFisler
      : (getFromStorage<any[]>(StorageKey.FISLER) || []);
    return fisler
      .filter(fis =>
        !deletedFisIds.has(fis.id) &&
        (fis.cariId === id || fis.cari_id === id || fis.cari?.id === id)
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [id, globalFisler, deletedFisIds]);

  const fisBalanceMap = useMemo(() => {
    const map = new Map<string, { previousBalance: number; newBalance: number }>();
    if (allFisler.length === 0) return map;

    const chronological = [...allFisler].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let runningBalance = 0;
    
    chronological.forEach(fis => {
      const prevBal = runningBalance;
      let fisAmount = 0;
      (fis.items || []).forEach((item: any) => {
        const tp = Math.abs(item.totalPrice || 0);
        if (item.type === 'iade') fisAmount -= tp;
        else fisAmount += tp;
      });
      const payment = fis.payment?.amount || 0;
      runningBalance = prevBal + fisAmount - payment;
      map.set(fis.id, { previousBalance: prevBal, newBalance: runningBalance });
    });
    return map;
  }, [allFisler]);

  const dailyExtracts = useMemo((): RealDailyExtract[] => {
    if (allFisler.length === 0 && (!cari?.transactionHistory || cari.transactionHistory.length === 0)) return [];

    const grouped: Record<string, { fisler: any[], standalonePayments: any[] }> = {};
    
    allFisler.forEach(fis => {
      const dateKey = fis.date ? new Date(fis.date).toLocaleDateString('tr-TR') : 'Belirsiz';
      if (!grouped[dateKey]) grouped[dateKey] = { fisler: [], standalonePayments: [] };
      grouped[dateKey].fisler.push(fis);
    });

    const standalonePayments = (cari?.transactionHistory || []).filter((tx: any) => {
      if (tx.id.match(/-[spa]i?$/)) return false; 
      if (allFisler.some(f => tx.description?.includes(f.id))) return false;
      if (tx.id?.match(/-[spa]i?$/)) return false;
      if (allFisler.some((f: any) => tx.description?.includes(f.id))) return false;
      return true;
    });

    standalonePayments.forEach((tx: any) => {
      const dateKey = tx.date ? new Date(tx.date).toLocaleDateString('tr-TR') : 'Belirsiz';
      if (!grouped[dateKey]) grouped[dateKey] = { fisler: [], standalonePayments: [] };
      grouped[dateKey].standalonePayments.push(tx);
    });

    const parseDate = (d: string) => {
      if (d === 'Belirsiz') return 0;
      const [day, month, year] = d.split('.');
      return new Date(`${year}-${month}-${day}`).getTime();
    };
    const sortedDates = Object.keys(grouped).sort((a, b) => parseDate(b) - parseDate(a));

    let runningBalance = cari?.balance || 0;
    const extracts: RealDailyExtract[] = [];

    sortedDates.forEach(dateKey => {
      const dayData = grouped[dateKey];
      let orderAmount = 0;
      let returnAmount = 0;
      
      dayData.fisler.forEach((f: any) => {
        (f.items || []).forEach((item: any) => {
          if (item.type === 'iade') returnAmount += Math.abs(item.totalPrice || 0);
          else orderAmount += Math.abs(item.totalPrice || 0);
        });
      });
      
      let paymentAmount = dayData.fisler.reduce((sum: number, f: any) => sum + (f.payment?.amount || 0), 0);

      dayData.standalonePayments.forEach(tx => {
        if (tx.type === 'credit') paymentAmount += tx.amount;
        else orderAmount += tx.amount;
      });

      const newBalance = runningBalance;
      const previousBalance = runningBalance - orderAmount + returnAmount + paymentAmount;

      extracts.push({
        date: dateKey,
        previousBalance,
        orderAmount: orderAmount - returnAmount,
        payment: paymentAmount,
        newBalance,
        fisler: dayData.fisler,
        standalonePayments: dayData.standalonePayments
      });

      runningBalance = previousBalance;
    });

    return extracts;
  }, [allFisler, cari?.balance, cari?.transactionHistory]);

  if (!cari) {
    return (
      <div className="p-4 sm:p-8 min-h-screen bg-background text-white flex flex-col items-center justify-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
        <h2 className="text-3xl font-extrabold mb-2">Cari Bulunamadı</h2>
        <p className="text-gray-400 mb-8">Aradığınız müşteri kaydı sistemde bulunmuyor veya silinmiş olabilir.</p>
        <button onClick={() => navigate('/cari')} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20">
          Cari Listesine Dön
        </button>
      </div>
    );
  }

  const handleExportPDF = (startDate?: string, endDate?: string) => {
    toast.success('PDF Ekstre hazırlanıyor...');
    let transactionsToExport = allFisler;
    if (startDate && endDate) {
      const startParts = startDate.split('.');
      const endParts = endDate.split('.');
      if (startParts.length === 3 && endParts.length === 3) {
        const start = new Date(`${startParts[2]}-${startParts[1]}-${startParts[0]}`);
        const end = new Date(`${endParts[2]}-${endParts[1]}-${endParts[0]}`);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
        transactionsToExport = allFisler.filter(f => {
          const d = new Date(f.date);
          return d >= start && d <= end;
        });
      }
    }
    setTimeout(() => {
      generateCariDetailPDF(cari, transactionsToExport, startDate, endDate);
    }, 500);
  };

  const handleFisPDF = (fis: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const balInfo = fisBalanceMap.get(fis.id);
    toast.success('Fiş PDF hazırlanıyor...');
    generateSingleFisPDF(fis, cari, balInfo ? { previousBalance: balInfo.previousBalance, newBalance: balInfo.newBalance } : undefined)
      .catch(() => toast.error('PDF oluşturulamadı.'));
  };

  const handleEdit = () => {
    if (!canEdit) {
      toast.error('Cari düzenleme yetkiniz bulunmamaktadır.');
      logActivity('security_alert', 'Yetkisiz Cari Düzenleme', { level: 'medium', employeeName: user?.name, description: 'Kullanıcı cari bilgilerini düzenlemeye çalıştı ancak yetkisi yoktu.' });
      return;
    }
    if (!editNote.trim()) { toast.error('Açıklama zorunludur.'); return; }
    const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];

    if (editForm.companyName !== cari.companyName) changes.push({ field: 'Firma Adı', oldValue: cari.companyName, newValue: editForm.companyName });
    if (editForm.contactPerson !== cari.contactPerson) changes.push({ field: 'Yetkili Kişi', oldValue: cari.contactPerson, newValue: editForm.contactPerson });
    if (editForm.phone !== cari.phone) changes.push({ field: 'Telefon', oldValue: cari.phone, newValue: editForm.phone });
    if (editForm.email !== (cari.email || '')) changes.push({ field: 'E-posta', oldValue: cari.email || '-', newValue: editForm.email });
    if (editForm.address !== (cari.address || '')) changes.push({ field: 'Adres', oldValue: cari.address || '-', newValue: editForm.address });
    if (editForm.taxNumber !== (cari.taxNumber || '')) changes.push({ field: 'Vergi No', oldValue: cari.taxNumber || '-', newValue: editForm.taxNumber });
    if (editForm.approvedBusinessNo !== (cari.approvedBusinessNo || '')) changes.push({ field: 'Onaylı İşletme No', oldValue: cari.approvedBusinessNo || '-', newValue: editForm.approvedBusinessNo });

    if (changes.length === 0) {
      toast.info('Değişiklik tespit edilmedi.');
      setIsEditModalOpen(false);
      return;
    }

    const updatedCariItem = {
      ...cari,
      ...editForm
    };

    const updatedCariList = cariList.map(c => c.id === id ? updatedCariItem : c);
    setInStorage(StorageKey.CARI_DATA, updatedCariList);
    updateCariSync(id!, updatedCariItem);

    const now = new Date();
    const newLogs = changes.map((change, idx) => ({
      id: `${Date.now()}-${idx}`,
      date: now.toLocaleDateString('tr-TR'),
      time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      editor: currentEmployee?.name || 'Bilinmeyen',
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      note: editNote,
    }));

    const updatedLogs = [...newLogs, ...editLogs];
    setEditLogs(updatedLogs);
    setInStorage(`${StorageKey.CARI_DATA}_edit_logs_${id}`, updatedLogs);

    toast.success('Müşteri bilgileri güncellendi.');
    setIsEditModalOpen(false);
    setEditNote('');
  };

  const handleOpenEditModal = () => {
    setEditForm({
      companyName: cari?.companyName || '', contactPerson: cari?.contactPerson || '',
      phone: cari?.phone || '', email: cari?.email || '', address: cari?.address || '',
      taxNumber: cari?.taxNumber || '', taxOffice: cari?.taxOffice || '',
      approvedBusinessNo: cari?.approvedBusinessNo || '', region: cari?.region || '',
      category: cari?.category || '',
    });
    setIsEditModalOpen(true);
  };

  const totalBalance = cari.balance || 0;
  const totalFisler = allFisler.length;

  // Son 30 günlük özet istatistikler
  const last30Stats = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const recent = allFisler.filter(f => new Date(f.date) >= cutoff);
    let satis = 0, iade = 0, odeme = 0;
    recent.forEach(fis => {
      (fis.items || []).forEach((item: any) => {
        const tp = Math.abs(item.totalPrice || 0);
        if (item.type === 'iade') iade += tp;
        else satis += tp;
      });
      (fis.payments || []).forEach((p: any) => { odeme += Math.abs(p.amount || 0); });
    });
    return { fisCount: recent.length, satis, iade, odeme, netSatis: satis - iade };
  }, [allFisler]);

  // ─── NOT SİSTEMİ ──────────────────────────────────────────────────
  interface CariNote {
    id: string;
    date: string;
    time: string;
    author: string;
    title: string;
    content: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    category: string;
    pinned: boolean;
  }

  const NOTES_KEY = `ISLEYEN_ET_CARI_NOTES_${id}`;
  const [cariNotes, setCariNotes] = useState<CariNote[]>(() => getFromStorage<CariNote[]>(NOTES_KEY as any) || []);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteViewItem, setNoteViewItem] = useState<CariNote | null>(null);
  const [isNoteViewOpen, setIsNoteViewOpen] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '', priority: 'normal' as CariNote['priority'], category: 'Genel' });

  const saveNotes = (notes: CariNote[]) => { setCariNotes(notes); setInStorage(NOTES_KEY as any, notes); };

  const handleAddNote = () => {
    if (!newNote.title.trim() || !newNote.content.trim()) { toast.error('Başlık ve içerik zorunludur.'); return; }
    const now = new Date();
    const note: CariNote = {
      id: `note-${Date.now()}`,
      date: now.toLocaleDateString('tr-TR'),
      time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      author: currentEmployee?.name || user?.name || 'Bilinmeyen',
      title: newNote.title.trim(),
      content: newNote.content.trim(),
      priority: newNote.priority,
      category: newNote.category,
      pinned: false,
    };
    saveNotes([note, ...cariNotes]);
    setNewNote({ title: '', content: '', priority: 'normal', category: 'Genel' });
    setIsNoteModalOpen(false);
    toast.success('Not başarıyla eklendi.');
    logActivity('cari_note_add', `${cari.companyName} için not eklendi`, { employeeName: user?.name, page: 'Cari Detay', description: `Not: "${note.title}"` });
  };

  const handleTogglePin = (noteId: string) => {
    saveNotes(cariNotes.map(n => n.id === noteId ? { ...n, pinned: !n.pinned } : n));
  };

  const handleDeleteNote = (noteId: string) => {
    if (!confirm('Bu notu silmek istediğinize emin misiniz?')) return;
    saveNotes(cariNotes.filter(n => n.id !== noteId));
    toast.success('Not silindi.');
    logActivity('cari_note_delete', `${cari.companyName} notu silindi`, { employeeName: user?.name, page: 'Cari Detay' });
  };

  const sortedNotes = useMemo(() => {
    return [...cariNotes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const bStr = (b.date || '01.01.2000').split('.').reverse().join('-') + 'T' + (b.time || '00:00');
      const aStr = (a.date || '01.01.2000').split('.').reverse().join('-') + 'T' + (a.time || '00:00');
      return new Date(bStr).getTime() - new Date(aStr).getTime();
    });
  }, [cariNotes]);

  const priorityConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    low: { label: t('cari.priorityLow'), color: '#6b7280', bg: 'bg-gray-500/10 text-gray-400 border-gray-500/20', icon: Info },
    normal: { label: t('cari.priorityNormal'), color: '#3b82f6', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: MessageSquare },
    high: { label: t('cari.priorityHigh'), color: '#f59e0b', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: AlertTriangle },
    urgent: { label: t('cari.priorityUrgent'), color: '#ef4444', bg: 'bg-red-500/10 text-red-400 border-red-500/20', icon: AlertCircle },
  };

  const noteCategories = ['Genel', 'Ödeme', 'Sipariş', 'Şikayet', 'İade', 'Hatırlatma', 'Anlaşma', 'Diğer'];

  // ─── FATURA SİSTEMİ ──────────────────────────────────────────────────
  const [invoiceKdvRate, setInvoiceKdvRate] = useState(cari?.defaultKdvRate || 20);
  const [invoicePhoto, setInvoicePhoto] = useState<string>('');

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

  const updateFisInStorage = (fisId: string, updater: (fis: any) => any) => {
    const allFis = getFromStorage<any[]>(StorageKey.FISLER) || [];
    const updated = allFis.map(f => f.id === fisId ? updater(f) : f);
    setInStorage(StorageKey.FISLER, updated);
    window.dispatchEvent(new Event('storage_update'));
    // PouchDB güncelle — cross-device sync için
    const updatedFis = updated.find(f => f.id === fisId);
    if (updatedFis) {
      (async () => {
        try {
          const db = getDb('fisler');
          const doc = await db.get(fisId) as any;
          await db.put({ ...doc, ...updatedFis, _id: doc._id, _rev: doc._rev });
        } catch {}
      })();
    }
  };

  const handleAddInvoice = (fisId: string) => {
    if (!canEdit) { toast.error('Fatura kesme yetkiniz bulunmamaktadır.'); return; }
    const now = new Date();
    updateFisInStorage(fisId, (fis) => ({
      ...fis,
      invoice: {
        status: 'kesildi',
        date: now.toLocaleDateString('tr-TR'),
        time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        kdvRate: invoiceKdvRate,
        photo: invoicePhoto || null,
        addedBy: currentEmployee?.name || user?.name || 'Bilinmeyen',
      }
    }));
    // Update selected fis in state too
    if (selectedFis?.id === fisId) {
      setSelectedFis((prev: any) => prev ? ({
        ...prev,
        invoice: {
          status: 'kesildi',
          date: now.toLocaleDateString('tr-TR'),
          time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          kdvRate: invoiceKdvRate,
          photo: invoicePhoto || null,
          addedBy: currentEmployee?.name || user?.name || 'Bilinmeyen',
        }
      }) : prev);
    }
    setInvoicePhoto('');
    toast.success('Fatura başarıyla kesildi.');
    logActivity('invoice_add', `${cari.companyName} fişine fatura kesildi`, { employeeName: user?.name, page: 'Cari Detay', description: `Fiş: ${fisId}, KDV: %${invoiceKdvRate}` });
  };

  const handleCancelInvoice = (fisId: string) => {
    if (!canEdit) { toast.error('Fatura iptal yetkiniz bulunmamaktadır.'); return; }
    if (!confirm('Bu fişin faturasını iptal etmek istediğinize emin misiniz?')) return;
    updateFisInStorage(fisId, (fis) => ({
      ...fis,
      invoice: { status: 'iptal', cancelledAt: new Date().toISOString(), cancelledBy: currentEmployee?.name || user?.name }
    }));
    if (selectedFis?.id === fisId) {
      setSelectedFis((prev: any) => prev ? ({ ...prev, invoice: { status: 'iptal' } }) : prev);
    }
    toast.success('Fatura iptal edildi.');
    logActivity('invoice_cancel', `${cari.companyName} fişinin faturası iptal edildi`, { employeeName: user?.name, page: 'Cari Detay', description: `Fiş: ${fisId}` });
  };

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-4 sm:pb-6">
      
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <button onClick={() => navigate('/cari')} className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all shrink-0">
            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight truncate">{cari.companyName}</h1>
            <p className="text-gray-400 mt-1 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${cari.type === 'Toptancı' ? 'bg-orange-500' : 'bg-blue-500'}`}></span>
              Müşteri Cari Özeti
              {cari.invoiceMode && cari.invoiceMode !== 'yok' && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${cari.invoiceMode === 'tam' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                  {cari.invoiceMode === 'tam' ? `📋 ${t('cari.invoiceFullLabel')}` : `📄 ${t('cari.invoicePartialLabel')}`} • KDV %{cari.defaultKdvRate || 20}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
          <button onClick={handleOpenEditModal} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold transition-all text-sm sm:text-base">
            <Edit className="w-4 h-4" /> Düzenle
          </button>
          <button onClick={() => handleExportPDF()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 text-sm sm:text-base">
            <FileArchive className="w-4 h-4" /> Ekstre Al
          </button>
        </div>
      </div>

      {/* ─── Grid: Info & Stats ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

        {/* Company Info */}
        <div className="lg:col-span-2 p-4 sm:p-8 rounded-3xl bg-white/5 border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-bl-full blur-3xl" />
          <h3 className="text-base sm:text-xl font-bold mb-4 sm:mb-6 text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" /> İletişim & Vergi Bilgileri
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 sm:gap-y-6 gap-x-4 sm:gap-x-8 relative z-10">
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Yetkili Kişi</p>
              <p className="font-medium text-lg">{cari.contactPerson || 'Belirtilmemiş'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Telefon</p>
              <p className="font-medium text-lg font-mono">{cari.phone || 'Belirtilmemiş'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">E-posta</p>
              <p className="font-medium text-gray-300">{cari.email || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Adres</p>
              <p className="font-medium text-gray-300 line-clamp-2">{cari.address || '—'}</p>
            </div>
            <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Vergi Dairesi</p>
              <p className="font-medium text-gray-300">{cari.taxOffice || '—'}</p>
            </div>
            <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Vergi Numarası</p>
              <p className="font-bold text-white font-mono tracking-wider">{cari.taxNumber || '—'}</p>
            </div>
          </div>
        </div>

        {/* Stats Column */}
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className={`p-4 sm:p-8 rounded-3xl border flex-1 flex flex-col justify-center ${totalBalance < 0 ? 'bg-red-950/20 border-red-500/30' : 'bg-emerald-950/20 border-emerald-500/30'}`}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-70">Güncel Bakiye</p>
            <p className={`text-3xl sm:text-5xl font-black tracking-tighter ${totalBalance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {totalBalance > 0 ? '+' : ''}₺{Math.abs(totalBalance).toLocaleString()}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${totalBalance < 0 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                {totalBalance < 0 ? 'SİZ BORÇLUSUNUZ' : totalBalance > 0 ? 'ALACAKLISINIZ' : 'HESAP KAPALI'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="p-3 sm:p-6 bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl">
              <Receipt className="w-4 h-4 sm:w-6 sm:h-6 text-blue-400 mb-1.5 sm:mb-3" />
              <p className="text-lg sm:text-2xl font-bold">{totalFisler}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase mt-0.5 sm:mt-1">İşlem Fişi</p>
            </div>
            <div className="p-3 sm:p-6 bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl">
              <Calendar className="w-4 h-4 sm:w-6 sm:h-6 text-purple-400 mb-1.5 sm:mb-3" />
              <p className="text-lg sm:text-2xl font-bold">{dailyExtracts.length}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase mt-0.5 sm:mt-1">İşlem Günü</p>
            </div>
            <div className="p-3 sm:p-6 bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl cursor-pointer hover:bg-white/10 transition-all" onClick={() => setIsNoteModalOpen(true)}>
              <StickyNote className="w-4 h-4 sm:w-6 sm:h-6 text-amber-400 mb-1.5 sm:mb-3" />
              <p className="text-lg sm:text-2xl font-bold">{cariNotes.length}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase mt-0.5 sm:mt-1">Not</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Son 30 Gün Özet Kartı ─── */}
      {last30Stats.fisCount > 0 && (
        <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 to-purple-950/30 border border-indigo-500/20">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
            <h3 className="text-sm sm:text-base font-bold text-white">Son 30 Günlük Özet</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[9px] font-bold border border-indigo-500/30">{last30Stats.fisCount} Fiş</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Satış</p>
              <p className="text-base sm:text-xl font-black text-emerald-400">₺{last30Stats.satis.toLocaleString('tr-TR')}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">İade</p>
              <p className="text-base sm:text-xl font-black text-red-400">₺{last30Stats.iade.toLocaleString('tr-TR')}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Ödeme</p>
              <p className="text-base sm:text-xl font-black text-blue-400">₺{last30Stats.odeme.toLocaleString('tr-TR')}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Net Satış</p>
              <p className="text-base sm:text-xl font-black text-amber-400">₺{last30Stats.netSatis.toLocaleString('tr-TR')}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tabs / Sections ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-8">
        
        {/* Left: Ekstre */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <FileText className="w-6 h-6 text-indigo-400" /> Hesap Ekstresi
            </h2>
            <button onClick={() => handleExportPDF()} className="text-sm text-indigo-400 font-bold hover:text-indigo-300">PDF Rapor Al</button>
          </div>
          
          <div className="space-y-3">
            {dailyExtracts.length === 0 ? (
              <div className="p-10 border border-white/5 rounded-3xl bg-white/5 text-center">
                <PackageOpen className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 font-medium">Bu cariye ait hiçbir hareket bulunamadı.</p>
              </div>
            ) : (
              dailyExtracts.map((ex, i) => (
                <motion.div key={ex.date} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} 
                  onClick={() => { setSelectedExtract(ex); setIsOrderDetailOpen(true); }}
                  className="p-5 rounded-2xl bg-[#111] border border-white/5 hover:border-white/20 cursor-pointer transition-all group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex flex-col items-center justify-center">
                        <span className="text-lg font-bold leading-none">{(ex.date || '').split('.')[0] || '—'}</span>
                        <span className="text-[9px] uppercase font-bold">{ex.date ? new Date(ex.date.split('.').reverse().join('-')).toLocaleString('tr-TR', {month:'short'}) : '—'}</span>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Önceki: <span className="text-white">₺{ex.previousBalance.toLocaleString()}</span></p>
                        <p className="text-sm text-gray-400">Satış: <span className="text-blue-400">₺{ex.orderAmount.toLocaleString()}</span></p>
                        <p className="text-sm text-gray-400">Ödeme: <span className="text-emerald-400">₺{ex.payment.toLocaleString()}</span></p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Kapanış Bakiyesi</p>
                      <p className={`text-xl font-bold ${ex.newBalance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        ₺{Math.abs(ex.newBalance).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Right: Detaylı Fişler */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <Receipt className="w-6 h-6 text-blue-400" /> Tüm İşlem Fişleri
            </h2>
          </div>

          <div className="space-y-3">
            {allFisler.length === 0 ? (
              <div className="p-10 border border-white/5 rounded-3xl bg-white/5 text-center">
                <Receipt className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 font-medium">Bu cariye ait hiçbir fiş bulunamadı.</p>
              </div>
            ) : (
              allFisler.map((fis, i) => (
                <motion.div key={fis.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  onClick={() => { setSelectedFis(fis); setIsFisDetailOpen(true); }}
                  className="p-5 rounded-2xl bg-[#111] border border-white/5 hover:bg-white/5 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${fis.mode === 'alis' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {fis.mode === 'alis' ? <ArrowDownRight className="w-5 h-5"/> : <ArrowUpRight className="w-5 h-5"/>}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white text-sm font-mono">{fis.id.split('-')[0].toUpperCase()}</p>
                        {fis.invoice?.status === 'kesildi' && (
                          <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-blue-500/30" title="Fatura Kesildi">F</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(fis.date).toLocaleString('tr-TR')} • {fis.items?.length || 0} Kalem</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className="text-lg font-bold text-white">₺{(fis.total || 0).toLocaleString()}</p>
                      {fis.payment && fis.payment.amount > 0 && <p className="text-[10px] text-emerald-400 font-bold">Ödendi: ₺{fis.payment.amount.toLocaleString()}</p>}
                    </div>
                    <button onClick={e => handleFisPDF(fis, e)} className="p-2 bg-white/5 hover:bg-blue-600 rounded-lg text-gray-400 hover:text-white transition-colors">
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ─── Modals ─── */}
      <Dialog.Root open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 z-50"/><Dialog.Content aria-describedby={undefined} className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-[#111] p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 sm:w-[95vw] sm:max-w-2xl z-50 shadow-2xl overflow-y-auto overscroll-contain" style={{maxHeight:'calc(100dvh - 1rem)'}}>
          <Dialog.Title className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Müşteri Düzenle</Dialog.Title>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { label: 'Firma Adı', key: 'companyName', type: 'text' },
              { label: 'Yetkili', key: 'contactPerson', type: 'text' },
              { label: 'Telefon', key: 'phone', type: 'text' },
              { label: 'E-posta', key: 'email', type: 'email' },
              { label: 'Vergi Dairesi', key: 'taxOffice', type: 'text' },
              { label: 'Vergi Numarası', key: 'taxNumber', type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 ml-1">{f.label}</label>
                <input type={f.type} value={(editForm as any)[f.key]} onChange={e => setEditForm(s => ({...s, [f.key]: e.target.value}))} className="w-full mt-1 p-3 bg-black/50 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500" />
              </div>
            ))}
          </div>
          <div className="mb-4">
            <label className="text-xs text-gray-500 ml-1">Adres</label>
            <textarea value={editForm.address} onChange={e => setEditForm(s => ({...s, address: e.target.value}))} rows={2} className="w-full mt-1 p-3 bg-black/50 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500 resize-none"></textarea>
          </div>
          <div className="mb-6">
            <label className="text-xs text-red-400 font-bold ml-1">Değişiklik Nedeni (Zorunlu)</label>
            <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Örn: Telefon numarası güncellendi" className="w-full mt-1 p-3 bg-black/50 border border-red-500/30 rounded-xl text-white outline-none focus:border-red-500" />
          </div>
          <div className="flex gap-3">
            <Dialog.Close className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all">İptal</Dialog.Close>
            <button onClick={handleEdit} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all">Kaydet</button>
          </div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* Ekstre Detay Modal */}
      <Dialog.Root open={isOrderDetailOpen} onOpenChange={setIsOrderDetailOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 z-50"/><Dialog.Content aria-describedby={undefined} className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-[#111] p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 sm:w-[95vw] sm:max-w-lg z-50 shadow-2xl overflow-y-auto overscroll-contain" style={{maxHeight:'calc(100dvh - 1rem)'}}>
          {selectedExtract && (
            <>
              <h2 className="text-2xl font-bold text-white mb-2">{selectedExtract.date} Hareketleri</h2>
              <p className="text-gray-400 mb-6">Bu güne ait toplam {selectedExtract.fisler.length} adet fiş bulunuyor.</p>
              
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                {selectedExtract.fisler.map(fis => (
                  <div key={fis.id} className="p-4 bg-black/50 border border-white/10 rounded-2xl">
                    <div className="flex justify-between items-center mb-3 pb-3 border-b border-white/5">
                      <span className="font-bold text-white font-mono">{fis.id.split('-')[0].toUpperCase()}</span>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded ${fis.mode === 'alis' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {fis.mode === 'alis' ? 'ALIŞ' : 'SATIŞ'}
                      </span>
                    </div>
                    {fis.items?.map((it:any, i:number) => (
                      <div key={i} className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300">{it.productName || it.name} <span className="text-gray-600 text-xs ml-1">x{it.quantity}</span></span>
                        <span className="font-bold">₺{(it.totalPrice || 0).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="mt-3 pt-3 border-t border-white/5 flex justify-between text-lg font-bold text-blue-400">
                      <span>Toplam</span>
                      <span>₺{(fis.total || 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Dialog.Close className="w-full mt-6 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all">Kapat</Dialog.Close>
            </>
          )}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* Fiş İnceleme Modal */}
      <Dialog.Root open={isFisDetailOpen} onOpenChange={setIsFisDetailOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 z-50"/><Dialog.Content aria-describedby={undefined} className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-[#111] p-0 rounded-2xl sm:rounded-3xl border border-white/10 sm:w-[95vw] sm:max-w-2xl z-50 shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:'calc(100dvh - 1rem)'}}>
          {selectedFis && (() => {
            const isAlis = selectedFis.mode === 'alis';
            return (
              <>
                <div className={`p-6 border-b border-white/10 ${isAlis ? 'bg-orange-950/20' : 'bg-blue-950/20'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`text-xs font-bold tracking-widest uppercase mb-1 ${isAlis ? 'text-orange-400' : 'text-blue-400'}`}>
                        {isAlis ? t('salesPage.purchaseReceipt') : t('salesPage.saleReceipt')}
                      </p>
                      <h2 className="text-3xl font-black text-white">{selectedFis.id.split('-')[0].toUpperCase()}</h2>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-white">₺{(selectedFis.total || 0).toLocaleString()}</p>
                      {selectedFis.payment && selectedFis.payment.amount > 0 && <p className="text-sm font-bold text-emerald-400 mt-1">Ödenen: ₺{selectedFis.payment.amount.toLocaleString()}</p>}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/5 rounded-2xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Tarih / Saat</p>
                      <p className="font-bold text-white">{new Date(selectedFis.date).toLocaleString('tr-TR')}</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Personel</p>
                      <p className="font-bold text-white flex items-center gap-2"><User className="w-4 h-4 text-gray-400"/> {selectedFis.employeeName || 'Bilinmiyor'}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 pl-1">Ürün Kalemleri</h3>
                    <div className="space-y-2">
                      {selectedFis.items?.map((it:any, i:number) => {
                        const kdvRate = it.kdvRate || selectedFis.invoice?.kdvRate || cari?.defaultKdvRate || 0;
                        const tp = it.totalPrice || 0;
                        const kdvAmount = selectedFis.invoice?.status === 'kesildi' && kdvRate > 0 ? tp * kdvRate / (100 + kdvRate) : 0;
                        return (
                          <div key={i} className="p-4 bg-black/40 border border-white/5 rounded-2xl">
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className="font-bold text-white">{it.productName || it.name}</span>
                                <span className="text-xs text-gray-500 mt-0.5">{it.quantity} {it.unit || 'AD'} x ₺{it.unitPrice || it.price}</span>
                              </div>
                              <span className="text-lg font-bold text-white">₺{tp.toLocaleString()}</span>
                            </div>
                            {selectedFis.invoice?.status === 'kesildi' && kdvRate > 0 && (
                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                                <span className="text-[10px] text-blue-400 font-bold flex items-center gap-1">
                                  <Percent className="w-3 h-3" /> KDV %{kdvRate}
                                </span>
                                <span className="text-xs text-blue-400 font-bold">₺{kdvAmount.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* KDV Toplam */}
                    {selectedFis.invoice?.status === 'kesildi' && (() => {
                      const kdvRate = selectedFis.invoice?.kdvRate || cari?.defaultKdvRate || 0;
                      if (kdvRate <= 0) return null;
                      const total = selectedFis.total || 0;
                      const kdvTotal = total * kdvRate / (100 + kdvRate);
                      const netTotal = total - kdvTotal;
                      return (
                        <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-1">
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>Net Tutar:</span>
                            <span className="font-bold text-white">₺{netTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-blue-400">
                            <span>KDV (%{kdvRate}):</span>
                            <span className="font-bold">₺{kdvTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-white/5">
                            <span>Genel Toplam:</span>
                            <span>₺{total.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* ─── FATURA DURUMU ─── */}
                  <div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 pl-1 flex items-center gap-2">
                      <FileCheck className="w-4 h-4" /> Fatura Durumu
                    </h3>
                    {selectedFis.invoice?.status === 'kesildi' ? (
                      <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-black flex items-center justify-center shadow-lg shadow-blue-500/30">F</span>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-blue-400">Fatura Kesildi</p>
                            <p className="text-[10px] text-gray-500">{selectedFis.invoice?.date || '—'} • KDV %{selectedFis.invoice?.kdvRate || 0}</p>
                          </div>
                          <button
                            onClick={() => handleCancelInvoice(selectedFis.id)}
                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" /> İptal Et
                          </button>
                        </div>
                        {selectedFis.invoice?.photo && (
                          <img src={selectedFis.invoice.photo} alt="Fatura" className="w-full max-h-48 object-contain rounded-xl border border-white/10 cursor-pointer" onClick={() => setLightboxImage(selectedFis.invoice.photo)} />
                        )}
                      </div>
                    ) : (
                      <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-gray-700 text-gray-400 text-sm font-black flex items-center justify-center">—</span>
                          <p className="text-sm text-gray-400 flex-1">Fatura kesilmedi</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 font-bold">KDV Oranı:</label>
                          <div className="flex gap-1.5">
                            {[1, 8, 10, 18, 20].map(rate => (
                              <button
                                key={rate}
                                onClick={() => setInvoiceKdvRate(rate)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${invoiceKdvRate === rate ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-white/5 text-gray-500 border-white/5 hover:bg-white/10'}`}
                              >
                                %{rate}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-bold block mb-1">Fatura Fotoğrafı (opsiyonel):</label>
                          <label className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-all">
                            <Upload className="w-4 h-4 text-gray-400" />
                            <span className="text-xs text-gray-400">{invoicePhoto ? 'Fotoğraf yüklendi ✓' : 'Fotoğraf yükle...'}</span>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) compressImage(file).then(setInvoicePhoto).catch(() => toast.error('Fotoğraf yüklenemedi'));
                            }} />
                          </label>
                          {invoicePhoto && <img src={invoicePhoto} alt="preview" className="mt-2 max-h-24 rounded-lg border border-white/10" />}
                        </div>
                        <button
                          onClick={() => handleAddInvoice(selectedFis.id)}
                          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/20"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Fatura Kes
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* ─── ALIŞ FATURA BİLGİSİ (toptancıdan gelen fatura) ─── */}
                  {selectedFis.invoiceInfo && (
                    <div>
                      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 pl-1 flex items-center gap-2">
                        <Receipt className="w-4 h-4" /> Alış Fatura Bilgisi
                      </h3>
                      <div className={`p-4 rounded-2xl border space-y-2 ${selectedFis.invoiceInfo.hasInvoice ? 'bg-orange-500/5 border-orange-500/15' : 'bg-white/[0.03] border-white/5'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-full text-sm font-black flex items-center justify-center ${selectedFis.invoiceInfo.hasInvoice ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-gray-700 text-gray-400'}`}>
                            {selectedFis.invoiceInfo.hasInvoice ? 'F' : '—'}
                          </span>
                          <div className="flex-1">
                            <p className={`text-sm font-bold ${selectedFis.invoiceInfo.hasInvoice ? 'text-orange-400' : 'text-gray-400'}`}>
                              {selectedFis.invoiceInfo.hasInvoice ? 'Toptancıdan Fatura Alındı' : 'Fatura Alınmadı'}
                            </p>
                            {selectedFis.invoiceInfo.hasInvoice && (
                              <p className="text-[10px] text-gray-500">
                                KDV %{selectedFis.invoiceInfo.kdvRate || 0}
                                {selectedFis.invoiceInfo.invoiceNo && ` • No: ${selectedFis.invoiceInfo.invoiceNo}`}
                              </p>
                            )}
                          </div>
                        </div>
                        {selectedFis.invoiceInfo.invoicePhoto && (
                          <img
                            src={selectedFis.invoiceInfo.invoicePhoto}
                            alt="Alış Faturası"
                            className="w-full max-h-48 object-contain rounded-xl border border-white/10 cursor-pointer hover:opacity-80 transition-all"
                            onClick={() => setLightboxImage(selectedFis.invoiceInfo.invoicePhoto)}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {selectedFis.fisPhoto && (
                     <div>
                       <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 pl-1">Ekli Belge</h3>
                       <img src={selectedFis.fisPhoto} alt="Belge" className="w-full max-w-sm rounded-xl border border-white/10" />
                     </div>
                  )}
                </div>

                <div className="p-6 border-t border-white/10 bg-black/40 flex gap-3">
                  <button onClick={e => handleFisPDF(selectedFis, e)} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all flex justify-center items-center gap-2">
                    <Printer className="w-5 h-5"/> PDF Yazdır
                  </button>
                  <Dialog.Close className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all">Kapat</Dialog.Close>
                </div>
              </>
            );
          })()}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* ═══════════════════════════ MÜŞTERİ NOTLARI ═══════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <StickyNote className="w-6 h-6 text-amber-400" /> Müşteri Notları
            {cariNotes.length > 0 && <span className="text-sm font-normal text-gray-500">({cariNotes.length})</span>}
          </h2>
          <button
            onClick={() => setIsNoteModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-600/20 text-sm"
          >
            <Plus className="w-4 h-4" /> Not Ekle
          </button>
        </div>

        {sortedNotes.length === 0 ? (
          <div className="p-10 border border-white/5 rounded-3xl bg-white/5 text-center">
            <StickyNote className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">Henüz not eklenmemiş.</p>
            <p className="text-gray-600 text-sm mt-1">Müşteriye fiş gibi notlar ekleyerek takip edebilirsiniz.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {sortedNotes.map((note, i) => {
                const pConfig = priorityConfig[note.priority];
                const PIcon = pConfig.icon;
                return (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => { setNoteViewItem(note); setIsNoteViewOpen(true); }}
                    className="p-5 rounded-2xl bg-[#111] border border-white/5 hover:border-white/15 cursor-pointer transition-all group relative overflow-hidden"
                  >
                    {/* Priority accent line */}
                    <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: pConfig.color }} />
                    {note.pinned && <div className="absolute top-3 right-3"><Pin className="w-3.5 h-3.5 text-amber-400" /></div>}

                    <div className="flex items-start gap-3 mb-3">
                      <div className={`p-2 rounded-lg border ${pConfig.bg}`}>
                        <PIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm truncate">{note.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500">{note.date} {note.time}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">{note.category}</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-gray-400 line-clamp-3 leading-relaxed">{note.content}</p>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3 h-3 text-gray-600" />
                        <span className="text-[10px] text-gray-500">{note.author}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(note.id); }}
                          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                          title={note.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
                        >
                          {note.pinned ? <PinOff className="w-3.5 h-3.5 text-amber-400" /> : <Pin className="w-3.5 h-3.5 text-gray-500" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Not Ekleme Modal */}
      <Dialog.Root open={isNoteModalOpen} onOpenChange={setIsNoteModalOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 z-50" /><Dialog.Content aria-describedby={undefined} className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-[#111] p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 sm:w-[95vw] sm:max-w-lg z-50 shadow-2xl overflow-y-auto overscroll-contain" style={{maxHeight:'calc(100dvh - 1rem)'}}>
          <Dialog.Title className="text-2xl font-bold mb-6 flex items-center gap-3">
            <StickyNote className="w-6 h-6 text-amber-400" /> Yeni Not Ekle
          </Dialog.Title>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 ml-1 font-bold">Başlık</label>
              <input
                type="text"
                value={newNote.title}
                onChange={e => setNewNote(s => ({ ...s, title: e.target.value }))}
                placeholder="Örn: Ödeme hatırlatması yapıldı"
                className="w-full mt-1 p-3 bg-black/50 border border-white/10 rounded-xl text-white outline-none focus:border-amber-500 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 ml-1 font-bold">İçerik</label>
              <textarea
                value={newNote.content}
                onChange={e => setNewNote(s => ({ ...s, content: e.target.value }))}
                placeholder="Not detaylarını buraya yazın..."
                rows={4}
                className="w-full mt-1 p-3 bg-black/50 border border-white/10 rounded-xl text-white outline-none focus:border-amber-500 resize-none text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 ml-1 font-bold">Öncelik</label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(Object.entries(priorityConfig) as [string, any][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setNewNote(s => ({ ...s, priority: key as any }))}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${newNote.priority === key ? cfg.bg + ' border-current' : 'bg-white/5 text-gray-500 border-white/5 hover:bg-white/10'}`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 ml-1 font-bold">Kategori</label>
                <select
                  value={newNote.category}
                  onChange={e => setNewNote(s => ({ ...s, category: e.target.value }))}
                  className="w-full mt-1.5 p-2.5 bg-black/50 border border-white/10 rounded-xl text-white outline-none focus:border-amber-500 text-sm"
                >
                  {noteCategories.map(c => <option key={c} value={c} className="bg-black">{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Dialog.Close className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all">İptal</Dialog.Close>
            <button onClick={handleAddNote} className="flex-1 py-3.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Kaydet
            </button>
          </div>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* Not Görüntüleme Modal */}
      <Dialog.Root open={isNoteViewOpen} onOpenChange={setIsNoteViewOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 z-50" /><Dialog.Content aria-describedby={undefined} className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-[#111] p-0 rounded-2xl sm:rounded-3xl border border-white/10 sm:w-[95vw] sm:max-w-lg z-50 shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:'calc(100dvh - 1rem)'}}>
          {noteViewItem && (() => {
            const pConfig = priorityConfig[noteViewItem.priority];
            const PIcon = pConfig.icon;
            return (
              <>
                <div className="p-6 border-b border-white/10 relative" style={{ background: `linear-gradient(135deg, ${pConfig.color}15, transparent)` }}>
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ background: pConfig.color }} />
                  <div className="flex items-start gap-3">
                    <div className={`p-3 rounded-xl border ${pConfig.bg}`}>
                      <PIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <Dialog.Title className="text-xl font-black text-white">{noteViewItem.title}</Dialog.Title>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${pConfig.bg}`}>{pConfig.label}</span>
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/5 text-gray-400 border border-white/5">{noteViewItem.category}</span>
                        {noteViewItem.pinned && <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Sabitlendi</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  <div className="p-4 bg-white/[0.03] rounded-xl border border-white/5">
                    <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{noteViewItem.content}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-black/30 rounded-xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Tarih / Saat</p>
                      <p className="font-bold text-white text-sm">{noteViewItem.date} - {noteViewItem.time}</p>
                    </div>
                    <div className="p-3 bg-black/30 rounded-xl">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Ekleyen</p>
                      <p className="font-bold text-white text-sm flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-gray-400" />{noteViewItem.author}</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 border-t border-white/10 bg-black/40 flex gap-3">
                  <button onClick={() => { handleTogglePin(noteViewItem.id); setIsNoteViewOpen(false); }} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm">
                    {noteViewItem.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    {noteViewItem.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}
                  </button>
                  <button onClick={() => { handleDeleteNote(noteViewItem.id); setIsNoteViewOpen(false); }} className="py-3 px-5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm">
                    <Trash2 className="w-4 h-4" /> Sil
                  </button>
                  <Dialog.Close className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all text-sm">Kapat</Dialog.Close>
                </div>
              </>
            );
          })()}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}