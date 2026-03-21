import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { useAuth } from '../contexts/AuthContext';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { useTableSync } from '../hooks/useTableSync';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  FileEdit,
  Search,
  Calendar,
  Building,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  Filter,
  ArrowUpDown,
  Camera,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Download,
  User,
  Receipt,
  Banknote,
  Image as ImageIcon,
  Plus,
  History,
  PieChart,
  ArrowRight,
  Send,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  CreditCard,
  Landmark,
  BadgeAlert,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// TİPLER
// ═══════════════════════════════════════════════════════════════

export type CekStatus = 'beklemede' | 'tahsil_edildi' | 'karsiliksiz' | 'iade' | 'ciro' | 'odendi';
export type CekDirection = 'alinan' | 'verilen';

export interface CekAuditEntry {
  id: string;
  timestamp: string;
  action: string;
  detail: string;
  user: string;
}

export interface CekData {
  id: string;
  direction: CekDirection;
  amount: number;
  collectedAmount?: number;
  bankName: string;
  checkNumber?: string;
  dueDate: string;
  issueDate: string;
  // Alınan çekler
  sourceType: 'musteri' | 'toptanci';
  sourceName: string;
  sourceId: string;
  // Verilen çekler
  recipientName?: string;
  paymentReason?: string;
  // İlişkili fiş
  relatedFisId?: string;
  relatedFisDescription?: string;
  photoFront: string | null;
  photoBack: string | null;
  status: CekStatus;
  statusNote?: string;
  endorsedTo?: string;
  endorseDate?: string;
  auditLog?: CekAuditEntry[];
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

// ═══════════════════════════════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════════════════════════

export function saveCek(cek: CekData) {
  const existing = getFromStorage<CekData[]>(StorageKey.CEKLER_DATA) || [];
  const idx = existing.findIndex(c => c.id === cek.id);
  if (idx >= 0) existing[idx] = cek;
  else existing.unshift(cek);
  setInStorage(StorageKey.CEKLER_DATA, existing);
  window.dispatchEvent(new Event('storage_update'));
}

export function getCekler(): CekData[] {
  return (getFromStorage<CekData[]>(StorageKey.CEKLER_DATA) || []).map(c => ({
    ...c,
    direction: c.direction || 'alinan', // Geriye uyumluluk
  }));
}

function addAuditEntry(cek: CekData, action: string, detail: string, user: string): CekData {
  const entry: CekAuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    action, detail, user,
  };
  return { ...cek, auditLog: [...(cek.auditLog || []), entry] };
}

function getDaysRemaining(dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getStatusColor(status: CekStatus): string {
  switch (status) {
    case 'beklemede': return 'text-yellow-400';
    case 'tahsil_edildi': return 'text-green-400';
    case 'odendi': return 'text-green-400';
    case 'karsiliksiz': return 'text-red-400';
    case 'iade': return 'text-orange-400';
    case 'ciro': return 'text-blue-400';
    default: return 'text-muted-foreground';
  }
}

function getStatusBg(status: CekStatus): string {
  switch (status) {
    case 'beklemede': return 'bg-yellow-500/10 border-yellow-500/30';
    case 'tahsil_edildi': return 'bg-green-500/10 border-green-500/30';
    case 'odendi': return 'bg-green-500/10 border-green-500/30';
    case 'karsiliksiz': return 'bg-red-500/10 border-red-500/30';
    case 'iade': return 'bg-orange-500/10 border-orange-500/30';
    case 'ciro': return 'bg-blue-500/10 border-blue-500/30';
    default: return 'bg-muted border-border';
  }
}

function getStatusIcon(status: CekStatus) {
  switch (status) {
    case 'beklemede': return <Clock className="w-4 h-4 text-yellow-400" />;
    case 'tahsil_edildi': return <CheckCircle className="w-4 h-4 text-green-400" />;
    case 'odendi': return <CheckCircle className="w-4 h-4 text-green-400" />;
    case 'karsiliksiz': return <XCircle className="w-4 h-4 text-red-400" />;
    case 'iade': return <RotateCcw className="w-4 h-4 text-orange-400" />;
    case 'ciro': return <Send className="w-4 h-4 text-blue-400" />;
    default: return null;
  }
}

function getDaysColor(days: number): string {
  if (days < 0) return 'text-red-400';
  if (days <= 7) return 'text-orange-400';
  if (days <= 30) return 'text-yellow-400';
  return 'text-green-400';
}

type ModalType = 'none' | 'status' | 'endorse' | 'partial' | 'addAlinan' | 'addVerilen' | 'photo' | 'history';

// ═══════════════════════════════════════════════════════════════
// ANA SAYFA
// ═══════════════════════════════════════════════════════════════

export function CeklerPage() {
  const { t } = useLanguage();
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { emit } = useModuleBus();

  const { canAdd, canDelete, canEdit } = getPagePermissions(user, currentEmployee, 'cekler');
  const sec = usePageSecurity('cekler');

  const { data: syncedCekler } = useTableSync<CekData>({
    tableName: 'cekler',
    storageKey: StorageKey.CEKLER_DATA,
    initialData: [],
    orderBy: 'createdAt',
    orderAsc: false,
  });

  // Sayfa ziyaretini logla
  useEffect(() => {
    logActivity('page_visit', 'Çekler sayfası görüntülendi', user?.name);
  }, []);

  const [cekler, setCekler] = useState<CekData[]>([]);
  const [activeTab, setActiveTab] = useState<CekDirection>('verilen'); // Verilen çekler öncelikli
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CekStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'amount' | 'createdAt'>('dueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedCek, setSelectedCek] = useState<CekData | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewTab, setViewTab] = useState<'list' | 'bank'>('list');

  // Modal states
  const [modalType, setModalType] = useState<ModalType>('none');
  const [modalCek, setModalCek] = useState<CekData | null>(null);
  const [photoModalData, setPhotoModalData] = useState<{ url: string; title: string } | null>(null);

  const [newStatus, setNewStatus] = useState<CekStatus>('beklemede');
  const [statusNote, setStatusNote] = useState('');
  const [endorseTo, setEndorseTo] = useState('');
  const [endorseDate, setEndorseDate] = useState(new Date().toISOString().split('T')[0]);
  const [partialAmount, setPartialAmount] = useState('');

  // Alınan çek form
  const [newAlinanCek, setNewAlinanCek] = useState({
    amount: '', bankName: '', checkNumber: '', dueDate: '', issueDate: new Date().toISOString().split('T')[0],
    sourceName: '', sourceType: 'musteri' as 'musteri' | 'toptanci',
  });

  // Verilen çek form
  const [newVerilenCek, setNewVerilenCek] = useState({
    amount: '', bankName: '', checkNumber: '', dueDate: '', issueDate: new Date().toISOString().split('T')[0],
    recipientName: '', paymentReason: '',
  });

  const newCekFrontRef = useRef<HTMLInputElement>(null);
  const newCekBackRef = useRef<HTMLInputElement>(null);
  const [newCekPhotoFront, setNewCekPhotoFront] = useState<string | null>(null);
  const [newCekPhotoBack, setNewCekPhotoBack] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    if (syncedCekler && syncedCekler.length > 0) {
      setCekler(syncedCekler.map(c => ({ ...c, direction: c.direction || 'alinan' })));
    } else {
      setCekler(getCekler());
    }
  }, [syncedCekler]);

  useEffect(() => {
    const load = () => setCekler(getCekler());
    window.addEventListener('storage_update', load);
    return () => window.removeEventListener('storage_update', load);
  }, []);

  // Yöne göre ayır
  const alinanCekler = useMemo(() => cekler.filter(c => c.direction === 'alinan'), [cekler]);
  const verilenCekler = useMemo(() => cekler.filter(c => c.direction === 'verilen'), [cekler]);
  const activeCekler = activeTab === 'alinan' ? alinanCekler : verilenCekler;

  // Filtrele ve sırala
  const filteredCekler = useMemo(() => {
    let result = [...activeCekler];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        (c.sourceName || '').toLowerCase().includes(q) ||
        (c.recipientName || '').toLowerCase().includes(q) ||
        c.bankName.toLowerCase().includes(q) ||
        (c.checkNumber || '').toLowerCase().includes(q) ||
        (c.paymentReason || '').toLowerCase().includes(q) ||
        c.amount.toString().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }

    if (dateFrom) result = result.filter(c => c.dueDate >= dateFrom);
    if (dateTo) result = result.filter(c => c.dueDate <= dateTo);

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'dueDate') cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      else if (sortBy === 'amount') cmp = a.amount - b.amount;
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [activeCekler, searchQuery, statusFilter, sortBy, sortDir, dateFrom, dateTo]);

  // İstatistikler (yöne göre)
  const stats = useMemo(() => {
    const data = activeCekler;
    const beklemede = data.filter(c => c.status === 'beklemede');
    const buHafta = beklemede.filter(c => { const d = getDaysRemaining(c.dueDate); return d >= 0 && d <= 7; });
    const gecmis = beklemede.filter(c => getDaysRemaining(c.dueDate) < 0);
    const tahsilEdilen = data.filter(c => c.status === 'tahsil_edildi' || c.status === 'odendi');
    const ciro = data.filter(c => c.status === 'ciro');
    return {
      toplam: data.length,
      toplamTutar: data.reduce((s, c) => s + c.amount, 0),
      beklemede: beklemede.length,
      beklemedeTutar: beklemede.reduce((s, c) => s + c.amount, 0),
      buHafta: buHafta.length,
      buHaftaTutar: buHafta.reduce((s, c) => s + c.amount, 0),
      gecmis: gecmis.length,
      gecmisTutar: gecmis.reduce((s, c) => s + c.amount, 0),
      tahsilAdet: tahsilEdilen.length,
      tahsilTutar: tahsilEdilen.reduce((s, c) => s + c.amount, 0),
      karsiliksiz: data.filter(c => c.status === 'karsiliksiz').length,
      karsiliksizTutar: data.filter(c => c.status === 'karsiliksiz').reduce((s, c) => s + c.amount, 0),
      ciroAdet: ciro.length,
      ciroTutar: ciro.reduce((s, c) => s + c.amount, 0),
    };
  }, [activeCekler]);

  // Global özet (her iki yön)
  const globalStats = useMemo(() => {
    const alinanTotal = alinanCekler.reduce((s, c) => s + c.amount, 0);
    const alinanBeklemede = alinanCekler.filter(c => c.status === 'beklemede').reduce((s, c) => s + c.amount, 0);
    const verilenTotal = verilenCekler.reduce((s, c) => s + c.amount, 0);
    const verilenBeklemede = verilenCekler.filter(c => c.status === 'beklemede').reduce((s, c) => s + c.amount, 0);
    const verilenGecmis = verilenCekler.filter(c => c.status === 'beklemede' && getDaysRemaining(c.dueDate) < 0);
    return {
      alinanTotal, alinanBeklemede, alinanCount: alinanCekler.length,
      verilenTotal, verilenBeklemede, verilenCount: verilenCekler.length,
      verilenGecmis: verilenGecmis.length,
      verilenGecmisTutar: verilenGecmis.reduce((s, c) => s + c.amount, 0),
      netDurum: alinanBeklemede - verilenBeklemede,
    };
  }, [alinanCekler, verilenCekler]);

  // Banka özeti
  const bankSummary = useMemo(() => {
    const map = new Map<string, { count: number; total: number; pending: number; collected: number; bounced: number }>();
    activeCekler.forEach(c => {
      const existing = map.get(c.bankName) || { count: 0, total: 0, pending: 0, collected: 0, bounced: 0 };
      existing.count++;
      existing.total += c.amount;
      if (c.status === 'beklemede') existing.pending += c.amount;
      if (c.status === 'tahsil_edildi' || c.status === 'odendi') existing.collected += c.amount;
      if (c.status === 'karsiliksiz') existing.bounced += c.amount;
      map.set(c.bankName, existing);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [activeCekler]);

  const userName = currentEmployee?.name || 'Sistem';

  const statusLabelsAlinan: Record<string, string> = {
    beklemede: t('checks.statusPending'),
    tahsil_edildi: t('checks.statusCollected'),
    karsiliksiz: t('checks.statusBounced'),
    iade: t('checks.statusReturned'),
    ciro: t('checks.statusEndorsed'),
  };

  const statusLabelsVerilen: Record<string, string> = {
    beklemede: 'Ödeme Bekliyor',
    odendi: 'Ödendi',
    karsiliksiz: t('checks.statusBounced'),
    iade: t('checks.statusReturned'),
  };

  const currentStatusLabels = activeTab === 'alinan' ? statusLabelsAlinan : statusLabelsVerilen;

  // ═══════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════

  const handleStatusChange = () => {
    if (!canEdit) { sec.logUnauthorized('cek_edit', 'Çek durumu değiştirme yetkisi yok'); return; }
    if (!modalCek) return;
    if (!sec.checkRate('edit')) return;
    let updated = { ...modalCek, status: newStatus, statusNote: statusNote || modalCek.statusNote, updatedAt: new Date().toISOString() };
    updated = addAuditEntry(updated, 'status_change', `Durum → ${newStatus}${statusNote ? ` - ${statusNote}` : ''}`, userName);
    saveCek(updated);
    sec.auditLog('cek_status_change', updated.id, updated.bankName);
    emit('cek:status_changed', { cekId: updated.id, newStatus, bankName: updated.bankName, direction: updated.direction });
    setCekler(getCekler());
    setModalType('none');
    setStatusNote('');
    toast.success(t('checks.statusUpdated'));
  };

  const handleEndorse = () => {
    if (!canEdit) { sec.logUnauthorized('cek_endorse', 'Ciro yetkisi yok'); return; }
    if (!modalCek || !endorseTo) return;
    if (!sec.preCheck('edit', { endorseTo })) return;
    let updated: CekData = {
      ...modalCek, status: 'ciro', endorsedTo: endorseTo, endorseDate, updatedAt: new Date().toISOString(),
    };
    updated = addAuditEntry(updated, 'endorse', `Ciro → ${endorseTo}`, userName);
    saveCek(updated);
    sec.auditLog('cek_endorse', updated.id, `${updated.bankName} → ${endorseTo}`);
    emit('cek:status_changed', { cekId: updated.id, newStatus: 'ciro', bankName: updated.bankName });
    setCekler(getCekler());
    setModalType('none');
    setEndorseTo('');
    toast.success(t('checks.endorseSuccess'));
  };

  const handlePartialCollect = () => {
    if (!canEdit) { sec.logUnauthorized('cek_partial', 'Kısmi tahsilat yetkisi yok'); return; }
    if (!modalCek) return;
    if (!sec.checkRate('edit')) return;
    const pAmount = parseFloat(partialAmount);
    if (isNaN(pAmount) || pAmount <= 0) return;
    const collected = (modalCek.collectedAmount || 0) + pAmount;
    const isFullyCollected = collected >= modalCek.amount;
    const doneStatus = modalCek.direction === 'verilen' ? 'odendi' : 'tahsil_edildi';
    let updated: CekData = {
      ...modalCek, collectedAmount: collected, status: isFullyCollected ? doneStatus as CekStatus : 'beklemede',
      updatedAt: new Date().toISOString(),
    };
    updated = addAuditEntry(updated, 'partial_collect', `Kısmi tahsilat ₺${pAmount.toLocaleString()} (Toplam: ₺${collected.toLocaleString()})`, userName);
    saveCek(updated);
    sec.auditLog('cek_partial_collect', updated.id, `₺${pAmount}`);
    setCekler(getCekler());
    setModalType('none');
    setPartialAmount('');
    toast.success(t('checks.partialSuccess'));
  };

  const handleAddAlinanCek = () => {
    if (!canAdd) { sec.logUnauthorized('cek_add', 'Çek ekleme yetkisi yok'); return; }
    const nc = newAlinanCek;
    if (!nc.amount || !nc.bankName || !nc.dueDate || !nc.sourceName) {
      toast.error('Tüm zorunlu alanları doldurun'); return;
    }
    if (!sec.preCheck('add', { bankName: nc.bankName, sourceName: nc.sourceName })) return;
    const cek: CekData = {
      id: `cek-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      direction: 'alinan',
      amount: parseFloat(nc.amount),
      bankName: nc.bankName,
      checkNumber: nc.checkNumber || undefined,
      dueDate: nc.dueDate,
      issueDate: nc.issueDate,
      sourceType: nc.sourceType,
      sourceName: nc.sourceName,
      sourceId: `manual-${Date.now()}`,
      photoFront: newCekPhotoFront,
      photoBack: newCekPhotoBack,
      status: 'beklemede',
      createdAt: new Date().toISOString(),
      createdBy: userName,
      auditLog: [{ id: `audit-${Date.now()}`, timestamp: new Date().toISOString(), action: 'created', detail: 'Alınan çek oluşturuldu', user: userName }],
    };
    saveCek(cek);
    sec.auditLog('cek_add', cek.id, `ALINAN - ${cek.bankName} - ₺${cek.amount}`);
    emit('cek:created', { cekId: cek.id, direction: 'alinan', amount: cek.amount });
    setCekler(getCekler());
    setModalType('none');
    setNewAlinanCek({ amount: '', bankName: '', checkNumber: '', dueDate: '', issueDate: new Date().toISOString().split('T')[0], sourceName: '', sourceType: 'musteri' });
    setNewCekPhotoFront(null); setNewCekPhotoBack(null);
    toast.success('Alınan çek başarıyla kaydedildi');
  };

  const handleAddVerilenCek = () => {
    if (!canAdd) { sec.logUnauthorized('cek_add', 'Çek ekleme yetkisi yok'); return; }
    const nc = newVerilenCek;
    if (!nc.amount || !nc.bankName || !nc.dueDate || !nc.recipientName) {
      toast.error('Tüm zorunlu alanları doldurun'); return;
    }
    if (!sec.preCheck('add', { bankName: nc.bankName, recipientName: nc.recipientName })) return;
    const cek: CekData = {
      id: `cek-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      direction: 'verilen',
      amount: parseFloat(nc.amount),
      bankName: nc.bankName,
      checkNumber: nc.checkNumber || undefined,
      dueDate: nc.dueDate,
      issueDate: nc.issueDate,
      sourceType: 'musteri',
      sourceName: nc.recipientName,
      sourceId: `manual-${Date.now()}`,
      recipientName: nc.recipientName,
      paymentReason: nc.paymentReason || undefined,
      photoFront: newCekPhotoFront,
      photoBack: newCekPhotoBack,
      status: 'beklemede',
      createdAt: new Date().toISOString(),
      createdBy: userName,
      auditLog: [{ id: `audit-${Date.now()}`, timestamp: new Date().toISOString(), action: 'created', detail: 'Verilen çek oluşturuldu', user: userName }],
    };
    saveCek(cek);
    sec.auditLog('cek_add', cek.id, `VERİLEN - ${cek.bankName} - ₺${cek.amount} → ${cek.recipientName}`);
    emit('cek:created', { cekId: cek.id, direction: 'verilen', amount: cek.amount });
    logActivity('cek_verilen', `Verilen çek: ₺${cek.amount.toLocaleString()} → ${cek.recipientName}`, user?.name);
    setCekler(getCekler());
    setModalType('none');
    setNewVerilenCek({ amount: '', bankName: '', checkNumber: '', dueDate: '', issueDate: new Date().toISOString().split('T')[0], recipientName: '', paymentReason: '' });
    setNewCekPhotoFront(null); setNewCekPhotoBack(null);
    toast.success('Verilen çek başarıyla kaydedildi');
  };

  const handleDelete = (id: string, bankName: string) => {
    if (!canDelete) { sec.logUnauthorized('cek_delete', 'Çek silme yetkisi yok'); return; }
    if (!sec.checkRate('delete')) return;
    const existing = getFromStorage<CekData[]>(StorageKey.CEKLER_DATA) || [];
    setInStorage(StorageKey.CEKLER_DATA, existing.filter(c => c.id !== id));
    setCekler(existing.filter(c => c.id !== id));
    emit('cek:deleted', { cekId: id, bankName });
    setSelectedCek(null);
    sec.auditLog('cek_delete', id, bankName);
    logActivity('employee_update', 'Çek Silindi', { employeeName: user?.name, page: 'Cekler', description: `${bankName} bankasına ait çek silindi.` });
    toast.success(t('checks.deleted'));
  };

  const handleExportCSV = () => {
    const dirLabel = activeTab === 'alinan' ? 'Alinan' : 'Verilen';
    const headers = activeTab === 'alinan'
      ? ['Kaynak', 'Banka', 'Çek No', 'Tutar', 'Vade', 'Durum', 'Oluşturma']
      : ['Alıcı', 'Ödeme Nedeni', 'Banka', 'Çek No', 'Tutar', 'Vade', 'Durum', 'Oluşturma'];
    const rows = filteredCekler.map(c => activeTab === 'alinan'
      ? [c.sourceName, c.bankName, c.checkNumber || '-', c.amount.toString(), c.dueDate, c.status, c.createdAt.split('T')[0]]
      : [c.recipientName || c.sourceName, c.paymentReason || '-', c.bankName, c.checkNumber || '-', c.amount.toString(), c.dueDate, c.status, c.createdAt.split('T')[0]]
    );
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `cekler_${dirLabel}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(t('checks.exportSuccess'));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string | null) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setter(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Tema renkleri
  const isVerilen = activeTab === 'verilen';
  const accentColor = isVerilen ? 'red' : 'purple';
  const accentBg = isVerilen ? 'bg-red-600' : 'bg-purple-600';
  const accentHover = isVerilen ? 'hover:bg-red-700' : 'hover:bg-purple-700';
  const accentBgLight = isVerilen ? 'bg-red-600/20 border-red-500/30' : 'bg-purple-600/20 border-purple-500/30';
  const accentText = isVerilen ? 'text-red-400' : 'text-purple-400';
  const accentRing = isVerilen ? 'focus:ring-red-500/40' : 'focus:ring-purple-500/40';

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background overflow-hidden pb-20 lg:pb-0">
      {/* HEADER */}
      <div className="p-4 sm:p-6 border-b border-border flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${accentBgLight} flex items-center justify-center border`}>
              <FileEdit className={`w-5 h-5 sm:w-6 sm:h-6 ${accentText}`} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('checks.title')}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">{t('checks.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button onClick={handleExportCSV}
              className="px-4 py-2 bg-card border border-border rounded-lg text-muted-foreground hover:text-foreground text-sm flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" /> {t('checks.exportCSV')}
            </button>
            <button onClick={() => setModalType(isVerilen ? 'addVerilen' : 'addAlinan')}
              className={`px-4 py-2 ${accentBg} ${accentHover} text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors`}>
              <Plus className="w-4 h-4" />
              {isVerilen ? 'Verilen Çek Ekle' : 'Alınan Çek Ekle'}
            </button>
          </div>
        </div>

        {/* ═══ ANA TAB: ALINAN / VERİLEN ═══ */}
        <div className="mt-5 mb-4">
          <div className="flex rounded-xl overflow-hidden border border-border bg-card/50 p-1 gap-1">
            {/* Alınan Çekler Tab */}
            <button
              onClick={() => { setActiveTab('alinan'); setSelectedCek(null); setSearchQuery(''); setStatusFilter('all'); }}
              className={`flex-1 relative py-3.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-3 ${
                activeTab === 'alinan'
                  ? 'bg-gradient-to-r from-purple-600/90 to-purple-700/90 text-white shadow-lg shadow-purple-900/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              }`}
            >
              <ArrowDownLeft className="w-5 h-5" />
              <div className="flex flex-col items-start">
                <span>ALINAN ÇEKLER</span>
                <span className={`text-xs font-normal ${activeTab === 'alinan' ? 'text-purple-200' : 'text-muted-foreground'}`}>
                  {globalStats.alinanCount} çek · ₺{globalStats.alinanBeklemede.toLocaleString()} beklemede
                </span>
              </div>
              {globalStats.alinanCount > 0 && (
                <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === 'alinan' ? 'bg-white/20 text-white' : 'bg-purple-500/10 text-purple-400'
                }`}>
                  {globalStats.alinanCount}
                </span>
              )}
            </button>

            {/* Verilen Çekler Tab */}
            <button
              onClick={() => { setActiveTab('verilen'); setSelectedCek(null); setSearchQuery(''); setStatusFilter('all'); }}
              className={`flex-1 relative py-3.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-3 ${
                activeTab === 'verilen'
                  ? 'bg-gradient-to-r from-red-600/90 to-red-700/90 text-white shadow-lg shadow-red-900/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              }`}
            >
              <ArrowUpRight className="w-5 h-5" />
              <div className="flex flex-col items-start">
                <span className="flex items-center gap-1.5">
                  VERİLEN ÇEKLER
                  <ShieldAlert className="w-3.5 h-3.5" />
                </span>
                <span className={`text-xs font-normal ${activeTab === 'verilen' ? 'text-red-200' : 'text-muted-foreground'}`}>
                  {globalStats.verilenCount} çek · ₺{globalStats.verilenBeklemede.toLocaleString()} ödeme bekliyor
                </span>
              </div>
              {globalStats.verilenGecmis > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse">
                  {globalStats.verilenGecmis} GECİKMİŞ!
                </span>
              )}
              {globalStats.verilenCount > 0 && (
                <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === 'verilen' ? 'bg-white/20 text-white' : 'bg-red-500/10 text-red-400'
                }`}>
                  {globalStats.verilenCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Net Durum Şeridi */}
        <div className={`rounded-xl p-3 border flex items-center justify-between ${
          globalStats.netDurum >= 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'
        }`}>
          <div className="flex items-center gap-3 text-sm">
            <Landmark className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Net Çek Durumu:</span>
            <span className="font-bold text-foreground">
              Alacak ₺{globalStats.alinanBeklemede.toLocaleString()}
            </span>
            <span className="text-muted-foreground">-</span>
            <span className="font-bold text-foreground">
              Borç ₺{globalStats.verilenBeklemede.toLocaleString()}
            </span>
            <span className="text-muted-foreground">=</span>
            <span className={`font-bold text-lg ${globalStats.netDurum >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {globalStats.netDurum >= 0 ? '+' : ''}₺{globalStats.netDurum.toLocaleString()}
            </span>
          </div>
          {globalStats.verilenGecmis > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-lg animate-pulse">
              <BadgeAlert className="w-4 h-4 text-red-400" />
              <span className="text-xs font-bold text-red-400">
                {globalStats.verilenGecmis} verilen çek gecikmiş! (₺{globalStats.verilenGecmisTutar.toLocaleString()})
              </span>
            </div>
          )}
        </div>

        {/* İstatistik Kartları */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mt-4">
          <StatCard label={isVerilen ? 'Toplam Verilen' : t('checks.totalAmount')} value={`₺${stats.toplamTutar.toLocaleString()}`} sub={`${stats.toplam} çek`} color="text-white" />
          <StatCard label={isVerilen ? 'Ödeme Bekleyen' : t('checks.totalPending')} value={stats.beklemede.toString()} sub={`₺${stats.beklemedeTutar.toLocaleString()}`} color="text-yellow-400" />
          <StatCard label={t('checks.dueThisWeek')} value={stats.buHafta.toString()} sub={`₺${stats.buHaftaTutar.toLocaleString()}`} color="text-orange-400" />
          <StatCard label={isVerilen ? 'Gecikmiş Ödeme' : t('checks.overdue')} value={stats.gecmis.toString()} sub={`₺${stats.gecmisTutar.toLocaleString()}`} color="text-red-400" highlight={isVerilen && stats.gecmis > 0} />
          <StatCard label={isVerilen ? 'Ödenen' : t('checks.collected')} value={`${stats.tahsilAdet}`} sub={`₺${stats.tahsilTutar.toLocaleString()}`} color="text-green-400" />
          {!isVerilen && <StatCard label={t('checks.statusEndorsed')} value={`${stats.ciroAdet}`} sub={`₺${stats.ciroTutar.toLocaleString()}`} color="text-blue-400" />}
          <StatCard label={t('checks.bounced')} value={stats.karsiliksiz.toString()} sub={`₺${stats.karsiliksizTutar.toLocaleString()}`} color="text-red-400" />
          {isVerilen && <StatCard label="İade Edilen" value={activeCekler.filter(c => c.status === 'iade').length.toString()} sub={`₺${activeCekler.filter(c => c.status === 'iade').reduce((s, c) => s + c.amount, 0).toLocaleString()}`} color="text-orange-400" />}
        </div>
      </div>

      {/* FİLTRE BAR */}
      <div className="px-4 sm:px-6 py-3 border-b border-border flex-shrink-0 flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isVerilen ? 'Alıcı, banka, çek no ara...' : t('checks.searchPlaceholder')}
            className={`w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 ${accentRing}`} />
        </div>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
          className={`px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 ${accentRing}`}>
          <option value="all">{t('checks.allStatuses')}</option>
          {Object.entries(currentStatusLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className={`px-2 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 ${accentRing}`} />
          <span className="text-muted-foreground text-xs">-</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className={`px-2 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 ${accentRing}`} />
        </div>

        <div className="flex items-center gap-1">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
            className={`px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 ${accentRing}`}>
            <option value="dueDate">{t('checks.sortByDueDate')}</option>
            <option value="amount">{t('checks.sortByAmount')}</option>
            <option value="createdAt">{t('checks.sortByDate')}</option>
          </select>
          <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="p-2 bg-card border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            {sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex bg-card border border-border rounded-lg overflow-hidden ml-auto">
          <button onClick={() => setViewTab('list')}
            className={`px-3 py-2 text-sm transition-colors ${viewTab === 'list' ? `${accentBg} text-white` : 'text-muted-foreground hover:text-foreground'}`}>
            Liste
          </button>
          <button onClick={() => setViewTab('bank')}
            className={`px-3 py-2 text-sm transition-colors ${viewTab === 'bank' ? `${accentBg} text-white` : 'text-muted-foreground hover:text-foreground'}`}>
            <PieChart className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* İÇERİK */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {viewTab === 'bank' ? (
          /* BANKA ÖZETİ */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Building className={`w-5 h-5 ${accentText}`} />
                {isVerilen ? 'Verilen Çekler - Banka Özeti' : t('checks.bankSummary')}
              </h2>
              {bankSummary.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center gap-3 text-xs"
                >
                  {[
                    { label: 'Beklemede', color: 'text-yellow-400', total: bankSummary.reduce((s, [, d]) => s + d.pending, 0) },
                    { label: isVerilen ? 'Ödenen' : 'Tahsil', color: 'text-green-400', total: bankSummary.reduce((s, [, d]) => s + d.collected, 0) },
                    { label: 'Karşılıksız', color: 'text-red-400', total: bankSummary.reduce((s, [, d]) => s + d.bounced, 0) },
                  ].filter(x => x.total > 0).map(x => (
                    <span key={x.label} className={`font-bold ${x.color}`}>
                      {x.label}: ₺{x.total.toLocaleString()}
                    </span>
                  ))}
                </motion.div>
              )}
            </div>

            {bankSummary.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">{t('checks.noChecks')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bankSummary.map(([bankName, data], idx) => {
                  const collectedPct = data.total > 0 ? (data.collected / data.total) * 100 : 0;
                  const pendingPct = data.total > 0 ? (data.pending / data.total) * 100 : 0;
                  const bouncedPct = data.total > 0 ? (data.bounced / data.total) * 100 : 0;
                  return (
                    <motion.div
                      key={bankName}
                      initial={{ opacity: 0, y: 16, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: idx * 0.06, type: 'spring', stiffness: 280, damping: 26 }}
                      whileHover={{ y: -3, transition: { duration: 0.2 } }}
                      className="card-premium rounded-xl p-5 space-y-4 hover:border-white/15 transition-colors"
                    >
                      {/* Header */}
                      <div className="flex items-center gap-3">
                        <motion.div
                          whileHover={{ rotate: [0, -8, 8, 0] }}
                          transition={{ duration: 0.4 }}
                          className={`w-10 h-10 rounded-xl ${accentBgLight} flex items-center justify-center border`}
                        >
                          <Building className={`w-5 h-5 ${accentText}`} />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground truncate">{bankName}</p>
                          <p className="text-xs text-muted-foreground">{data.count} çek</p>
                        </div>
                        <div className="text-right">
                          <p className="text-base sm:text-lg font-black text-foreground">₺{data.total.toLocaleString()}</p>
                          {collectedPct > 0 && (
                            <p className="text-[10px] text-green-400 font-bold">%{Math.round(collectedPct)} tahsil</p>
                          )}
                        </div>
                      </div>

                      {/* Stat chips */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: isVerilen ? 'Bekleyen' : t('checks.statusPending'), value: data.pending, color: 'yellow' },
                          { label: isVerilen ? 'Ödenen' : t('checks.statusCollected'), value: data.collected, color: 'green' },
                          { label: t('checks.statusBounced'), value: data.bounced, color: 'red' },
                        ].map(({ label, value, color }) => (
                          <motion.div
                            key={label}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.06 + 0.15, type: 'spring', stiffness: 400 }}
                            className={`p-2 rounded-xl bg-${color}-500/10 border border-${color}-500/15`}
                          >
                            <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-none mb-1">{label}</p>
                            <p className={`text-xs sm:text-sm font-black text-${color}-400`}>₺{value.toLocaleString()}</p>
                          </motion.div>
                        ))}
                      </div>

                      {/* Animated stacked progress bar */}
                      <div className="space-y-1.5">
                        <div className="h-2.5 bg-muted/20 rounded-full overflow-hidden flex gap-px">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${collectedPct}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.06 + 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="bg-green-500 h-full rounded-l-full"
                          />
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pendingPct}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.06 + 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="bg-yellow-500 h-full"
                          />
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${bouncedPct}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.06 + 0.4, ease: [0.16, 1, 0.3, 1] }}
                            className="bg-red-500 h-full rounded-r-full"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground/60">
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Tahsil</span>
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" /> Beklemede</span>
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> İade</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* LİSTE GÖRÜNÜMÜ */
          filteredCekler.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileEdit className="w-20 h-20 mb-4 opacity-30" />
              <p className="text-lg">{isVerilen ? 'Henüz verilen çek yok' : t('checks.noChecks')}</p>
              <p className="text-sm mt-1">{isVerilen ? 'Dışarıya kestiğiniz çekleri buradan takip edin' : t('checks.noChecksDesc')}</p>
              <button onClick={() => setModalType(isVerilen ? 'addVerilen' : 'addAlinan')}
                className={`mt-4 px-4 py-2 ${accentBg} ${accentHover} text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors`}>
                <Plus className="w-4 h-4" /> {isVerilen ? 'Verilen Çek Ekle' : 'Alınan Çek Ekle'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {filteredCekler.map((cek, index) => {
                  const daysLeft = getDaysRemaining(cek.dueDate);
                  const isOverdue = daysLeft < 0 && cek.status === 'beklemede';
                  const isExpanded = selectedCek?.id === cek.id;
                  const collected = cek.collectedAmount || 0;
                  const remaining = cek.amount - collected;
                  const cekIsVerilen = cek.direction === 'verilen';

                  return (
                    <motion.div key={cek.id}
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                      transition={{ delay: index * 0.02 }}
                      className={`card-premium rounded-xl overflow-hidden transition-all ${
                        isOverdue && cekIsVerilen ? 'border-red-500/60 ring-1 ring-red-500/30' : isOverdue ? 'border-red-500/40' : ''
                      } ${isExpanded ? `ring-1 ${cekIsVerilen ? 'ring-red-500/40' : 'ring-purple-500/40'}` : ''}`}
                    >
                      {/* Gecikmiş verilen çek uyarı şeridi */}
                      {isOverdue && cekIsVerilen && (
                        <div className="px-4 py-1.5 bg-red-500/20 border-b border-red-500/30 flex items-center gap-2">
                          <BadgeAlert className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                          <span className="text-xs font-bold text-red-400">
                            GECİKMİŞ ÖDEME! {Math.abs(daysLeft)} gün gecikme · ₺{cek.amount.toLocaleString()}
                          </span>
                        </div>
                      )}

                      {/* Ana Satır */}
                      <button
                        onClick={() => setSelectedCek(isExpanded ? null : cek)}
                        className="w-full p-4 flex items-center gap-4 text-left hover:bg-accent/30 transition-colors"
                      >
                        {/* Yön İkonu */}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                          cekIsVerilen
                            ? (isOverdue ? 'bg-red-500/20 border-red-500/50' : getStatusBg(cek.status))
                            : getStatusBg(cek.status)
                        }`}>
                          {cekIsVerilen ? (
                            <ArrowUpRight className={`w-4 h-4 ${isOverdue ? 'text-red-400' : getStatusColor(cek.status).replace('text-', 'text-')}`} />
                          ) : (
                            getStatusIcon(cek.status)
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-foreground truncate">
                              {cekIsVerilen ? (cek.recipientName || cek.sourceName) : cek.sourceName}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusBg(cek.status)} ${getStatusColor(cek.status)}`}>
                              {currentStatusLabels[cek.status] || cek.status}
                            </span>
                            {/* Yön badge */}
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              cekIsVerilen ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                            }`}>
                              {cekIsVerilen ? '↑ Verilen' : '↓ Alınan'}
                            </span>
                            {cek.endorsedTo && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center gap-1">
                                <Send className="w-3 h-3" /> {cek.endorsedTo}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Building className="w-3 h-3" />{cek.bankName}</span>
                            {cek.checkNumber && <span>#{cek.checkNumber}</span>}
                            {cekIsVerilen && cek.paymentReason && (
                              <span className="text-red-300/70 flex items-center gap-1">
                                <Receipt className="w-3 h-3" /> {cek.paymentReason}
                              </span>
                            )}
                            {collected > 0 && remaining > 0 && (
                              <span className="text-green-400 flex items-center gap-1">
                                <DollarSign className="w-3 h-3" /> ₺{collected.toLocaleString()} / ₺{cek.amount.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <p className={`text-lg font-bold ${cekIsVerilen ? 'text-red-400' : 'text-foreground'}`}>
                            {cekIsVerilen ? '-' : '+'}₺{cek.amount.toLocaleString()}
                          </p>
                          {collected > 0 && remaining > 0 && (
                            <p className="text-xs text-green-400">₺{collected.toLocaleString()} {t('checks.collectedAmount')}</p>
                          )}
                        </div>

                        <div className="text-right flex-shrink-0 min-w-[100px]">
                          <p className="text-sm text-muted-foreground">{new Date(cek.dueDate).toLocaleDateString('tr-TR')}</p>
                          {cek.status === 'beklemede' && (
                            <p className={`text-sm font-bold ${getDaysColor(daysLeft)}`}>
                              {daysLeft < 0 ? `${Math.abs(daysLeft)} gün gecikmiş` : daysLeft === 0 ? 'Bugün' : `${daysLeft} gün kaldı`}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {cek.photoFront && <ImageIcon className="w-4 h-4 text-green-400" />}
                          {cek.photoBack && <ImageIcon className="w-4 h-4 text-blue-400" />}
                        </div>

                        <div className="flex-shrink-0">
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* Detay Paneli */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <DetailField label="Tutar" value={`₺${cek.amount.toLocaleString()}`} bold />
                                <DetailField label="Banka" value={cek.bankName} />
                                <DetailField label="Vade Tarihi" value={new Date(cek.dueDate).toLocaleDateString('tr-TR')} />
                                {cekIsVerilen ? (
                                  <DetailField label="Alıcı" value={cek.recipientName || cek.sourceName} icon={<User className="w-3 h-3" />} />
                                ) : (
                                  <DetailField label="Kaynak" value={cek.sourceName} icon={<User className="w-3 h-3" />} />
                                )}
                                <DetailField label="Düzenleme Tarihi" value={new Date(cek.issueDate).toLocaleDateString('tr-TR')} />
                                {cek.checkNumber && <DetailField label="Çek No" value={`#${cek.checkNumber}`} />}
                                <DetailField label="Oluşturan" value={cek.createdBy} />
                                {cekIsVerilen && cek.paymentReason && (
                                  <DetailField label="Ödeme Nedeni" value={cek.paymentReason} />
                                )}
                                {collected > 0 && (
                                  <DetailField label={cekIsVerilen ? 'Ödenen' : 'Tahsil Edilen'} value={`₺${collected.toLocaleString()}`} bold />
                                )}
                                {cek.endorsedTo && (
                                  <DetailField label="Ciro Edilen" value={`${cek.endorsedTo} (${cek.endorseDate || '-'})`} />
                                )}
                              </div>

                              {collected > 0 && (
                                <div>
                                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>{cekIsVerilen ? 'Ödenen' : 'Tahsil edilen'}: ₺{collected.toLocaleString()}</span>
                                    <span>Kalan: ₺{remaining.toLocaleString()}</span>
                                  </div>
                                  <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                                    <div className={`${cekIsVerilen ? 'bg-red-500' : 'bg-green-500'} h-full rounded-full transition-all`} style={{ width: `${Math.min((collected / cek.amount) * 100, 100)}%` }} />
                                  </div>
                                </div>
                              )}

                              {/* Fotoğraflar */}
                              <div className="grid grid-cols-2 gap-3">
                                <PhotoSlot label="Ön Yüz" photo={cek.photoFront} onView={() => cek.photoFront && setPhotoModalData({ url: cek.photoFront, title: 'Ön Yüz' })} />
                                <PhotoSlot label="Arka Yüz" photo={cek.photoBack} onView={() => cek.photoBack && setPhotoModalData({ url: cek.photoBack, title: 'Arka Yüz' })} />
                              </div>

                              {cek.statusNote && (
                                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                                  <p className="text-xs text-muted-foreground mb-1">Not</p>
                                  <p className="text-sm text-foreground">{cek.statusNote}</p>
                                </div>
                              )}

                              {/* Audit Log */}
                              {cek.auditLog && cek.auditLog.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <History className="w-3 h-3" /> İşlem Geçmişi
                                  </p>
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {cek.auditLog.slice().reverse().map(entry => (
                                      <div key={entry.id} className="flex items-center gap-3 text-xs py-1.5 px-3 bg-secondary/20 rounded-lg">
                                        <span className="text-muted-foreground/60 w-28 flex-shrink-0">
                                          {new Date(entry.timestamp).toLocaleDateString('tr-TR')} {new Date(entry.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span className="text-foreground flex-1">{entry.detail}</span>
                                        <span className="text-muted-foreground/60">{entry.user}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Aksiyonlar */}
                              <div className="flex items-center gap-2 pt-2 flex-wrap">
                                <button onClick={() => { setModalCek(cek); setNewStatus(cek.status); setStatusNote(cek.statusNote || ''); setModalType('status'); }}
                                  className={`px-4 py-2 ${accentBg} ${accentHover} text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2`}>
                                  <ArrowUpDown className="w-4 h-4" /> Durum Değiştir
                                </button>
                                {cek.status === 'beklemede' && !cekIsVerilen && (
                                  <button onClick={() => { setModalCek(cek); setEndorseTo(''); setEndorseDate(new Date().toISOString().split('T')[0]); setModalType('endorse'); }}
                                    className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border border-blue-500/30">
                                    <Send className="w-4 h-4" /> Ciro Et
                                  </button>
                                )}
                                {cek.status === 'beklemede' && (
                                  <button onClick={() => { setModalCek(cek); setPartialAmount(''); setModalType('partial'); }}
                                    className="px-4 py-2 bg-green-600/20 hover:bg-green-600/40 text-green-400 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border border-green-500/30">
                                    <DollarSign className="w-4 h-4" /> {cekIsVerilen ? 'Kısmi Ödeme' : 'Kısmi Tahsilat'}
                                  </button>
                                )}
                                <button onClick={() => { if (confirm('Bu çeki silmek istediğinize emin misiniz?')) handleDelete(cek.id, cek.bankName); }}
                                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border border-red-500/30 ml-auto">
                                  <Trash2 className="w-4 h-4" /> Sil
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODALS */}
      {/* ═══════════════════════════════════════════════════════════════ */}

      {/* Fotoğraf Modal */}
      <AnimatePresence>
        {photoModalData && (
          <Overlay onClose={() => setPhotoModalData(null)}>
            <div className="max-w-3xl max-h-[80vh] relative" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-white font-medium">{photoModalData.title}</p>
                <button onClick={() => setPhotoModalData(null)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              <img src={photoModalData.url} alt={photoModalData.title} className="max-w-full max-h-[70vh] object-contain rounded-xl border border-white/10" />
            </div>
          </Overlay>
        )}
      </AnimatePresence>

      {/* Durum Değiştirme Modal */}
      <AnimatePresence>
        {modalType === 'status' && modalCek && (
          <Overlay onClose={() => setModalType('none')}>
            <ModalCard title="Durum Değiştir" icon={<ArrowUpDown className={`w-5 h-5 ${accentText}`} />} onClose={() => setModalType('none')}>
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-1">Mevcut Durum</p>
                <p className={`font-medium ${getStatusColor(modalCek.status)}`}>{currentStatusLabels[modalCek.status] || modalCek.status}</p>
              </div>
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">Yeni Durum</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(currentStatusLabels).filter(([s]) => s !== 'ciro').map(([s, label]) => (
                    <button key={s} onClick={() => setNewStatus(s as CekStatus)}
                      className={`p-3 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${
                        newStatus === s ? `${getStatusBg(s as CekStatus)} ${getStatusColor(s as CekStatus)} ring-1 ${isVerilen ? 'ring-red-500/40' : 'ring-purple-500/40'}` : 'bg-card border-border text-muted-foreground hover:text-foreground'
                      }`}>
                      {getStatusIcon(s as CekStatus)} {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">Not</label>
                <textarea value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Açıklama ekleyin..." rows={3}
                  className={`w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 ${accentRing} resize-none`} />
              </div>
              <div className="flex gap-3">
                <button onClick={handleStatusChange} className={`flex-1 py-3 ${accentBg} ${accentHover} text-white font-bold rounded-lg transition-colors`}>Güncelle</button>
                <button onClick={() => setModalType('none')} className="px-6 py-3 bg-card hover:bg-accent text-foreground font-medium rounded-lg transition-colors border border-border">{t('common.cancel')}</button>
              </div>
            </ModalCard>
          </Overlay>
        )}
      </AnimatePresence>

      {/* Ciro Modal */}
      <AnimatePresence>
        {modalType === 'endorse' && modalCek && (
          <Overlay onClose={() => setModalType('none')}>
            <ModalCard title="Çek Ciro Et" icon={<Send className="w-5 h-5 text-blue-400" />} onClose={() => setModalType('none')}>
              <div className="mb-4 p-3 rounded-lg bg-blue-900/20 border border-blue-800">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tutar</span>
                  <span className="font-bold text-foreground">₺{modalCek.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Banka</span>
                  <span className="text-foreground">{modalCek.bankName}</span>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">Kime Ciro Edilecek <span className="text-red-400">*</span></label>
                <input type="text" value={endorseTo} onChange={(e) => setEndorseTo(e.target.value)} placeholder="Firma / kişi adı"
                  className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
              </div>
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">Ciro Tarihi</label>
                <input type="date" value={endorseDate} onChange={(e) => setEndorseDate(e.target.value)}
                  className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
              </div>
              <div className="flex gap-3">
                <button onClick={handleEndorse} disabled={!endorseTo} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors">Ciro Et</button>
                <button onClick={() => setModalType('none')} className="px-6 py-3 bg-card hover:bg-accent text-foreground font-medium rounded-lg transition-colors border border-border">{t('common.cancel')}</button>
              </div>
            </ModalCard>
          </Overlay>
        )}
      </AnimatePresence>

      {/* Kısmi Tahsilat / Ödeme Modal */}
      <AnimatePresence>
        {modalType === 'partial' && modalCek && (
          <Overlay onClose={() => setModalType('none')}>
            <ModalCard title={modalCek.direction === 'verilen' ? 'Kısmi Ödeme' : 'Kısmi Tahsilat'} icon={<DollarSign className="w-5 h-5 text-green-400" />} onClose={() => setModalType('none')}>
              <div className="mb-4 p-3 rounded-lg bg-green-900/20 border border-green-800 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Çek Tutarı</span>
                  <span className="font-bold text-foreground">₺{modalCek.amount.toLocaleString()}</span>
                </div>
                {(modalCek.collectedAmount || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{modalCek.direction === 'verilen' ? 'Ödenen' : 'Tahsil Edilen'}</span>
                    <span className="font-bold text-green-400">₺{(modalCek.collectedAmount || 0).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Kalan</span>
                  <span className="font-bold text-yellow-400">₺{(modalCek.amount - (modalCek.collectedAmount || 0)).toLocaleString()}</span>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">Tutar (₺)</label>
                <input type="number" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} placeholder="0.00" step="0.01"
                  className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground text-xl font-bold placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setPartialAmount((modalCek.amount - (modalCek.collectedAmount || 0)).toString())}
                    className="px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-400 text-xs rounded-lg hover:bg-green-600/30 transition-colors">
                    Tamamını Öde (₺{(modalCek.amount - (modalCek.collectedAmount || 0)).toLocaleString()})
                  </button>
                  <button onClick={() => setPartialAmount(((modalCek.amount - (modalCek.collectedAmount || 0)) / 2).toFixed(2))}
                    className="px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs rounded-lg hover:bg-blue-600/30 transition-colors">
                    %50
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handlePartialCollect} disabled={!partialAmount || parseFloat(partialAmount) <= 0}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors">
                  {modalCek.direction === 'verilen' ? 'Ödemeyi Kaydet' : 'Tahsilatı Kaydet'}
                </button>
                <button onClick={() => setModalType('none')} className="px-6 py-3 bg-card hover:bg-accent text-foreground font-medium rounded-lg transition-colors border border-border">{t('common.cancel')}</button>
              </div>
            </ModalCard>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ═══ ALINAN ÇEK EKLEME MODAL ═══ */}
      <AnimatePresence>
        {modalType === 'addAlinan' && (
          <Overlay onClose={() => setModalType('none')}>
            <ModalCard title="Alınan Çek Ekle" icon={<ArrowDownLeft className="w-5 h-5 text-purple-400" />} onClose={() => setModalType('none')} wide>
              <div className="mb-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <p className="text-xs text-purple-300">Müşteriden veya toptancıdan aldığınız çekleri buraya kaydedin.</p>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Tutar (₺) <span className="text-red-400">*</span></label>
                  <input type="number" value={newAlinanCek.amount} onChange={e => setNewAlinanCek({ ...newAlinanCek, amount: e.target.value })} placeholder="0.00" step="0.01"
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground text-lg font-bold placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Banka <span className="text-red-400">*</span></label>
                  <input type="text" value={newAlinanCek.bankName} onChange={e => setNewAlinanCek({ ...newAlinanCek, bankName: e.target.value })} placeholder="Banka adı"
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Vade Tarihi <span className="text-red-400">*</span></label>
                  <input type="date" value={newAlinanCek.dueDate} onChange={e => setNewAlinanCek({ ...newAlinanCek, dueDate: e.target.value })}
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Çek Numarası</label>
                  <input type="text" value={newAlinanCek.checkNumber} onChange={e => setNewAlinanCek({ ...newAlinanCek, checkNumber: e.target.value })} placeholder="Opsiyonel"
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Kaynak Adı <span className="text-red-400">*</span></label>
                  <input type="text" value={newAlinanCek.sourceName} onChange={e => setNewAlinanCek({ ...newAlinanCek, sourceName: e.target.value })} placeholder="Müşteri/Toptancı adı"
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Kaynak Tipi</label>
                  <select value={newAlinanCek.sourceType} onChange={e => setNewAlinanCek({ ...newAlinanCek, sourceType: e.target.value as any })}
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/40">
                    <option value="musteri">Müşteri</option>
                    <option value="toptanci">Toptancı</option>
                  </select>
                </div>
              </div>
              {/* Fotoğraflar */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ön Yüz Fotoğrafı</label>
                  {newCekPhotoFront ? (
                    <div className="relative">
                      <img src={newCekPhotoFront} alt="Ön yüz" className="w-full h-28 object-cover rounded-lg border border-border" />
                      <button onClick={() => setNewCekPhotoFront(null)} className="absolute top-1 right-1 p-1 bg-red-600 rounded-full"><X className="w-3 h-3 text-white" /></button>
                    </div>
                  ) : (
                    <button onClick={() => newCekFrontRef.current?.click()} className="w-full h-28 border-2 border-dashed border-border rounded-lg hover:border-purple-600 flex items-center justify-center gap-2 text-muted-foreground hover:text-purple-400 transition-colors">
                      <Camera className="w-6 h-6" /><span className="text-xs">Yükle</span>
                    </button>
                  )}
                  <input ref={newCekFrontRef} type="file" accept="image/*" onChange={e => handlePhotoUpload(e, setNewCekPhotoFront)} className="hidden" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Arka Yüz Fotoğrafı</label>
                  {newCekPhotoBack ? (
                    <div className="relative">
                      <img src={newCekPhotoBack} alt="Arka yüz" className="w-full h-28 object-cover rounded-lg border border-border" />
                      <button onClick={() => setNewCekPhotoBack(null)} className="absolute top-1 right-1 p-1 bg-red-600 rounded-full"><X className="w-3 h-3 text-white" /></button>
                    </div>
                  ) : (
                    <button onClick={() => newCekBackRef.current?.click()} className="w-full h-28 border-2 border-dashed border-border rounded-lg hover:border-purple-600 flex items-center justify-center gap-2 text-muted-foreground hover:text-purple-400 transition-colors">
                      <Camera className="w-6 h-6" /><span className="text-xs">Yükle</span>
                    </button>
                  )}
                  <input ref={newCekBackRef} type="file" accept="image/*" onChange={e => handlePhotoUpload(e, setNewCekPhotoBack)} className="hidden" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleAddAlinanCek} className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors">Alınan Çeki Kaydet</button>
                <button onClick={() => setModalType('none')} className="px-6 py-3 bg-card hover:bg-accent text-foreground font-medium rounded-lg transition-colors border border-border">{t('common.cancel')}</button>
              </div>
            </ModalCard>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ═══ VERİLEN ÇEK EKLEME MODAL ═══ */}
      <AnimatePresence>
        {modalType === 'addVerilen' && (
          <Overlay onClose={() => setModalType('none')}>
            <ModalCard title="Verilen Çek Ekle" icon={<ArrowUpRight className="w-5 h-5 text-red-400" />} onClose={() => setModalType('none')} wide>
              <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  <p className="text-xs text-red-300 font-medium">Kendi adınıza dışarıya kestiğiniz çekleri buraya kaydedin. Bu çekler ödeme yükümlülüğünüzü temsil eder.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Tutar (₺) <span className="text-red-400">*</span></label>
                  <input type="number" value={newVerilenCek.amount} onChange={e => setNewVerilenCek({ ...newVerilenCek, amount: e.target.value })} placeholder="0.00" step="0.01"
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground text-lg font-bold placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Alıcı (Kime Verildi) <span className="text-red-400">*</span></label>
                  <input type="text" value={newVerilenCek.recipientName} onChange={e => setNewVerilenCek({ ...newVerilenCek, recipientName: e.target.value })} placeholder="Firma / kişi adı"
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Banka <span className="text-red-400">*</span></label>
                  <input type="text" value={newVerilenCek.bankName} onChange={e => setNewVerilenCek({ ...newVerilenCek, bankName: e.target.value })} placeholder="Banka adı"
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Vade Tarihi <span className="text-red-400">*</span></label>
                  <input type="date" value={newVerilenCek.dueDate} onChange={e => setNewVerilenCek({ ...newVerilenCek, dueDate: e.target.value })}
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Çek Numarası</label>
                  <input type="text" value={newVerilenCek.checkNumber} onChange={e => setNewVerilenCek({ ...newVerilenCek, checkNumber: e.target.value })} placeholder="Opsiyonel"
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40" />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-foreground mb-1 block">Ödeme Nedeni / Açıklama</label>
                  <input type="text" value={newVerilenCek.paymentReason} onChange={e => setNewVerilenCek({ ...newVerilenCek, paymentReason: e.target.value })} placeholder="Örn: Mal alımı, hizmet bedeli..."
                    className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40" />
                </div>
              </div>
              {/* Fotoğraflar */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ön Yüz Fotoğrafı</label>
                  {newCekPhotoFront ? (
                    <div className="relative">
                      <img src={newCekPhotoFront} alt="Ön yüz" className="w-full h-28 object-cover rounded-lg border border-border" />
                      <button onClick={() => setNewCekPhotoFront(null)} className="absolute top-1 right-1 p-1 bg-red-600 rounded-full"><X className="w-3 h-3 text-white" /></button>
                    </div>
                  ) : (
                    <button onClick={() => newCekFrontRef.current?.click()} className="w-full h-28 border-2 border-dashed border-border rounded-lg hover:border-red-600 flex items-center justify-center gap-2 text-muted-foreground hover:text-red-400 transition-colors">
                      <Camera className="w-6 h-6" /><span className="text-xs">Yükle</span>
                    </button>
                  )}
                  <input ref={newCekFrontRef} type="file" accept="image/*" onChange={e => handlePhotoUpload(e, setNewCekPhotoFront)} className="hidden" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Arka Yüz Fotoğrafı</label>
                  {newCekPhotoBack ? (
                    <div className="relative">
                      <img src={newCekPhotoBack} alt="Arka yüz" className="w-full h-28 object-cover rounded-lg border border-border" />
                      <button onClick={() => setNewCekPhotoBack(null)} className="absolute top-1 right-1 p-1 bg-red-600 rounded-full"><X className="w-3 h-3 text-white" /></button>
                    </div>
                  ) : (
                    <button onClick={() => newCekBackRef.current?.click()} className="w-full h-28 border-2 border-dashed border-border rounded-lg hover:border-red-600 flex items-center justify-center gap-2 text-muted-foreground hover:text-red-400 transition-colors">
                      <Camera className="w-6 h-6" /><span className="text-xs">Yükle</span>
                    </button>
                  )}
                  <input ref={newCekBackRef} type="file" accept="image/*" onChange={e => handlePhotoUpload(e, setNewCekPhotoBack)} className="hidden" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleAddVerilenCek} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                  <ArrowUpRight className="w-4 h-4" /> Verilen Çeki Kaydet
                </button>
                <button onClick={() => setModalType('none')} className="px-6 py-3 bg-card hover:bg-accent text-foreground font-medium rounded-lg transition-colors border border-border">{t('common.cancel')}</button>
              </div>
            </ModalCard>
          </Overlay>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// YARDIMCI BİLEŞENLER
// ═══════════════════════════════════════════════════════════════

function StatCard({ label, value, sub, color, highlight }: { label: string; value: string; sub: string; color: string; highlight?: boolean }) {
  return (
    <div className={`card-premium rounded-xl p-4 ${highlight ? 'ring-1 ring-red-500/40 animate-pulse' : ''}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function DetailField({ label, value, bold, icon }: { label: string; value: string; bold?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm ${bold ? 'text-lg font-bold' : 'font-medium'} text-foreground flex items-center gap-1`}>
        {icon}{value}
      </p>
    </div>
  );
}

function PhotoSlot({ label, photo, onView }: { label: string; photo: string | null; onView: () => void }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {photo ? (
        <button onClick={onView} className="w-full h-28 rounded-lg border border-border overflow-hidden hover:border-purple-500/50 transition-colors group relative">
          <img src={photo} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Eye className="w-6 h-6 text-white" />
          </div>
        </button>
      ) : (
        <div className="w-full h-28 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground/50">
          <Camera className="w-8 h-8" />
        </div>
      )}
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      {children}
    </motion.div>
  );
}

function ModalCard({ children, title, icon, onClose, wide }: { children: React.ReactNode; title: string; icon: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
      className={`modal-glass rounded-2xl p-6 ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'} border border-border max-h-[85vh] overflow-y-auto`}
      onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">{icon}{title}</h3>
        <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-lg transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
      </div>
      {children}
    </motion.div>
  );
}
