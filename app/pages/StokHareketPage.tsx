import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  Search,
  Calendar,
  Filter,
  Package,
  Download,
  Plus,
  X,
  History,
  Tag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { staggerContainer, gridCard, hover } from '../utils/animations';
import { useGlobalTableData } from '../contexts/GlobalTableSyncContext';
import { useTableSync } from '../hooks/useTableSync';
import { useEmployee } from '../contexts/EmployeeContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logActivity } from '../utils/activityLogger';
import { toast } from 'sonner';
import { StorageKey, getFromStorage, setInStorage } from '../utils/storage';
import { getDb } from '../lib/pouchdb';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addPDFHeader, addPDFFooter, addReportInfoBox, tableStyles } from '../utils/reportGenerator';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { InteractiveDataPanel, type PanelColumn } from '../components/InteractiveDataPanel';

interface StokHareket {
  id: string;
  date: string;
  productName: string;
  productId?: string;
  type: 'giris' | 'cikis' | 'iade';
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  source: string;
  cari: string;
  employee: string;
  fisMode: string;
  tag?: 'eski_stok' | 'manuel';  // manuel/geçmiş girişler için etiket
}

// Manuel stok girişi arayüzü
interface StokGiris {
  id: string;
  date: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  cari: string;
  note: string;
  tag: 'eski_stok' | 'manuel';
  addedBy: string;
}

export function StokHareketPage() {
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { canView, canAdd, canExport } = { ...getPagePermissions(user, currentEmployee, 'stok'), canExport: true };
  const sec = usePageSecurity('stok_hareket');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'giris' | 'cikis' | 'iade'>('all');
  const [showGecmisModal, setShowGecmisModal] = useState(false);

  // Log mount
  useEffect(() => {
    logActivity('custom', 'Stok Hareket sayfasi acildi', { employeeName: user?.name, page: 'stok_hareket' });
  }, []);

  // Tarih filtresi
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateRange, setDateRange] = useState({
    start: firstDay.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0],
  });

  // Fişlerden ve manuel stok girişlerinden veri al
  const rawFisler = useGlobalTableData<any>('fisler');
  const rawStokGiris = useGlobalTableData<StokGiris>('stok_giris');
  const urunler = useGlobalTableData<any>('urunler');
  const cariList = useGlobalTableData<any>('cari_hesaplar');

  // Manuel stok girişleri için useTableSync (addItem gerekiyor)
  const { addItem: addStokGiris } = useTableSync<StokGiris>({
    tableName: 'stok_giris',
    storageKey: StorageKey.STOK_GIRIS,
    orderBy: 'date',
    orderAsc: false,
  });

  // Fişlerden stok hareketleri çıkar + manuel girişleri ekle
  const hareketler = useMemo(() => {
    const results: StokHareket[] = [];

    // 1) Fiş kaynaklı hareketler
    rawFisler.forEach(fis => {
      const fisDate = fis.date || fis.createdAt || '';
      const isSatis = fis.mode === 'satis' || fis.mode === 'sale';
      const isAlis = fis.mode === 'alis';
      const cariName = fis.cari?.companyName || 'Bilinmeyen';
      const empName = fis.employeeName || fis.employee || '-';
      const fisNo = fis.fisNo || fis.id?.slice(0, 8) || '-';

      (fis.items || []).forEach((item: any, idx: number) => {
        const isIade = item.type === 'iade';
        const productName = item.name || item.productName || 'Bilinmeyen Urun';
        const quantity = Math.abs(item.quantity || 0);
        const unitPrice = item.unitPrice || item.price || 0;
        const total = Math.abs(item.totalPrice || item.total || 0);
        const unit = item.unit || 'AD';

        let type: 'giris' | 'cikis' | 'iade';
        if (isIade) type = 'iade';
        else if (isSatis) type = 'cikis';
        else if (isAlis) type = 'giris';
        else type = 'cikis';

        results.push({
          id: `${fis.id}-${idx}`,
          date: fisDate,
          productName,
          type,
          quantity,
          unit,
          unitPrice,
          total,
          source: fisNo,
          cari: cariName,
          employee: empName,
          fisMode: fis.mode || '-',
        });
      });
    });

    // 2) Manuel / eski stok girişleri
    rawStokGiris.forEach(g => {
      results.push({
        id: g.id,
        date: g.date,
        productName: g.productName,
        productId: g.productId,
        type: 'giris',
        quantity: g.quantity,
        unit: g.unit,
        unitPrice: g.unitPrice,
        total: g.total,
        source: 'Manuel',
        cari: g.cari || '-',
        employee: g.addedBy || '-',
        fisMode: g.tag === 'eski_stok' ? 'Eski Stok' : 'Manuel Giriş',
        tag: g.tag,
      });
    });

    return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [rawFisler, rawStokGiris]);

  // Filtreleme
  const filteredHareketler = useMemo(() => {
    return hareketler.filter(h => {
      if (h.date) {
        const d = new Date(h.date);
        if (!isNaN(d.getTime())) {
          const start = new Date(dateRange.start); start.setHours(0, 0, 0, 0);
          const end = new Date(dateRange.end); end.setHours(23, 59, 59, 999);
          if (d < start || d > end) return false;
        }
      }
      if (filterType !== 'all' && h.type !== filterType) return false;
      if (searchTerm?.trim()) {
        const term = searchTerm.trim().toLowerCase();
        return (
          (h.productName || '').toLowerCase().includes(term) ||
          (h.cari || '').toLowerCase().includes(term) ||
          (h.source || '').toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [hareketler, dateRange, filterType, searchTerm]);

  // Özet istatistikler
  const stats = useMemo(() => {
    const giris = filteredHareketler.filter(h => h.type === 'giris');
    const cikis = filteredHareketler.filter(h => h.type === 'cikis');
    const iade = filteredHareketler.filter(h => h.type === 'iade');
    return {
      totalGiris: giris.reduce((s, h) => s + h.quantity, 0),
      totalGirisVal: giris.reduce((s, h) => s + h.total, 0),
      totalCikis: cikis.reduce((s, h) => s + h.quantity, 0),
      totalCikisVal: cikis.reduce((s, h) => s + h.total, 0),
      totalIade: iade.reduce((s, h) => s + h.quantity, 0),
      totalIadeVal: iade.reduce((s, h) => s + h.total, 0),
      totalHareket: filteredHareketler.length,
    };
  }, [filteredHareketler]);

  // Hızlı tarih filtreleri
  const quickFilters = useMemo(() => {
    const now = new Date();
    const todayISO = now.toISOString().split('T')[0];
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    return [
      { label: 'Bugun', start: todayISO, end: todayISO },
      { label: 'Bu Hafta', start: weekStart.toISOString().split('T')[0], end: todayISO },
      { label: 'Bu Ay', start: firstDay.toISOString().split('T')[0], end: todayISO },
      { label: 'Gecen Ay', start: lastMonthStart.toISOString().split('T')[0], end: lastMonthEnd.toISOString().split('T')[0] },
      { label: 'Tumunu Goster', start: '2020-01-01', end: todayISO },
    ];
  }, []);

  const typeConfig = {
    giris: { label: 'Stok Girisi', icon: ArrowDownCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    cikis: { label: 'Stok Cikisi', icon: ArrowUpCircle, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    iade: { label: 'Iade', icon: RotateCcw, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  };

  const handleExportPDF = () => {
    if (!sec.checkRate('export')) return;
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      addPDFHeader(doc, 'Stok Hareket Raporu', `Tarih: ${new Date().toLocaleDateString('tr-TR')}`);
      const nextY = addReportInfoBox(doc, [
        { label: 'Donem:', value: `${dateRange.start || '-'} / ${dateRange.end || '-'}` },
        { label: 'Toplam Hareket:', value: `${filteredHareketler.length} Islem` },
        { label: 'Toplam Giris:', value: `${stats.totalGirisVal.toLocaleString('tr-TR')} TL` },
        { label: 'Toplam Cikis:', value: `${stats.totalCikisVal.toLocaleString('tr-TR')} TL` }
      ], 36);
      const tableData = filteredHareketler.map(h => [
        h.date ? new Date(h.date).toLocaleDateString('tr-TR') : '-',
        h.type === 'giris' ? 'Giris' : h.type === 'cikis' ? 'Cikis' : 'Iade',
        h.productName,
        `${h.quantity} ${h.unit}`,
        `${h.unitPrice.toLocaleString('tr-TR')} TL`,
        `${h.total.toLocaleString('tr-TR')} TL`,
        h.cari,
        h.employee,
        h.source,
        h.tag === 'eski_stok' ? 'Eski Stok' : '',
      ]);
      autoTable(doc, {
        head: [['Tarih', 'Tip', 'Urun', 'Miktar', 'Birim Fiyat', 'Toplam', 'Cari', 'Personel', 'Fis No', 'Etiket']],
        body: tableData,
        startY: nextY + 8,
        ...tableStyles,
        columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 1) {
            if (data.cell.raw === 'Giris') data.cell.styles.textColor = [22, 163, 74];
            else if (data.cell.raw === 'Cikis') data.cell.styles.textColor = [37, 99, 235];
            else if (data.cell.raw === 'Iade') data.cell.styles.textColor = [234, 88, 12];
          }
        }
      });
      addPDFFooter(doc);
      doc.save(`stok-hareket-raporu-${dateRange.start}-${dateRange.end}.pdf`);
      logActivity('employee_update', 'Stok Hareket Raporu Indirildi', { employeeName: user?.name, page: 'stok_hareket' });
      toast.success('Stok hareket raporu PDF olarak indirildi!');
    } catch (err) {
      toast.error('PDF olusturulurken hata olustu');
    }
  };

  // ─── Geçmiş Stok Girişi Formu ─────────────────────────────────────────────

  const [gecmisForm, setGecmisForm] = useState({
    productId: '',
    date: today.toISOString().split('T')[0],
    quantity: '',
    unitPrice: '',
    cari: '',
    note: '',
    isEskiStok: true,  // default: eski sistemden geçiş
  });

  const selectedUrun = useMemo(() => urunler.find(u => u.id === gecmisForm.productId), [urunler, gecmisForm.productId]);

  const handleGecmisStokSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gecmisForm.productId) { toast.error('Ürün seçmelisiniz!'); return; }
    const qty = Number(gecmisForm.quantity);
    const price = Number(gecmisForm.unitPrice);
    if (!qty || qty <= 0) { toast.error('Geçerli bir miktar girin!'); return; }

    const product = urunler.find(u => u.id === gecmisForm.productId);
    if (!product) { toast.error('Ürün bulunamadı!'); return; }

    const newGiris: StokGiris = {
      id: crypto.randomUUID(),
      date: gecmisForm.date || today.toISOString(),
      productId: gecmisForm.productId,
      productName: product.name,
      quantity: qty,
      unit: product.unit || 'AD',
      unitPrice: price,
      total: qty * price,
      cari: gecmisForm.cari,
      note: gecmisForm.note,
      tag: gecmisForm.isEskiStok ? 'eski_stok' : 'manuel',
      addedBy: currentEmployee?.name || user?.name || 'Sistem',
    };

    try {
      // 1. stok_giris tablosuna kaydet (PouchDB → CouchDB sync)
      await addStokGiris(newGiris);

      // 2. Ürünün currentStock'unu güncelle — localStorage + PouchDB
      const existingStok = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
      const updatedStok = existingStok.map(s => {
        if (s.id !== gecmisForm.productId) return s;
        return { ...s, currentStock: (s.currentStock || 0) + qty };
      });
      setInStorage(StorageKey.STOK_DATA, updatedStok);

      // PouchDB güncelle
      try {
        const db = getDb('urunler');
        const existing = await db.get(gecmisForm.productId) as any;
        await db.put({ ...existing, current_stock: (existing.current_stock || existing.currentStock || 0) + qty });
      } catch (dbErr) {
        console.warn('[StokGiris] PouchDB stok güncelleme:', dbErr);
      }

      toast.success(`${product.name} için ${qty} ${product.unit || 'AD'} ${gecmisForm.isEskiStok ? 'eski stok' : 'manuel'} girişi eklendi`);
      logActivity('employee_update', 'Geçmiş stok girişi eklendi', {
        employeeName: user?.name,
        page: 'stok_hareket',
        description: `${product.name}: +${qty} (${gecmisForm.isEskiStok ? 'Eski Stok' : 'Manuel'})`,
      });

      setGecmisForm({ productId: '', date: today.toISOString().split('T')[0], quantity: '', unitPrice: '', cari: '', note: '', isEskiStok: true });
      setShowGecmisModal(false);
    } catch (err) {
      toast.error('Stok girişi kaydedilemedi');
      console.error(err);
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight mb-0.5 sm:mb-1">Stok Hareket Gecmisi</h1>
          <p className="text-[11px] sm:text-sm text-muted-foreground">Urun giris, cikis ve iade hareketlerinin detayli takibi</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canAdd && (
            <button
              onClick={() => setShowGecmisModal(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-emerald-600/20"
            >
              <History className="w-4 h-4" />
              Geçmiş Stok Ekle
            </button>
          )}
          <button
            onClick={handleExportPDF}
            disabled={filteredHareketler.length === 0}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-secondary disabled:to-secondary disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all border border-blue-500/30 text-sm"
          >
            <Download className="w-4 h-4" />
            PDF Aktar
          </button>
        </div>
      </div>

      {/* Özet Kartlar */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4"
        variants={staggerContainer(0.06, 0.02)}
        initial="initial"
        animate="animate"
      >
        {[
          { title: 'Toplam Hareket', value: stats.totalHareket.toString(), icon: Package, color: 'from-secondary to-accent' },
          { title: 'Stok Girisi', value: `${stats.totalGiris} AD`, sub: `${stats.totalGirisVal.toLocaleString('tr-TR')} TL`, icon: ArrowDownCircle, color: 'from-green-600 to-green-700' },
          { title: 'Stok Cikisi', value: `${stats.totalCikis} AD`, sub: `${stats.totalCikisVal.toLocaleString('tr-TR')} TL`, icon: ArrowUpCircle, color: 'from-blue-600 to-blue-700' },
          { title: 'Iade', value: `${stats.totalIade} AD`, sub: `${stats.totalIadeVal.toLocaleString('tr-TR')} TL`, icon: RotateCcw, color: 'from-orange-600 to-orange-700' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.title} variants={gridCard} whileHover={hover.liftMd} className="card-premium rounded-xl p-3 sm:p-5">
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div className={`p-1.5 sm:p-2.5 rounded-lg bg-gradient-to-br ${card.color}`}>
                  <Icon className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-semibold uppercase tracking-wider leading-tight">{card.title}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-white">{card.value}</p>
              {card.sub && <p className="text-[11px] sm:text-sm text-muted-foreground/70 mt-0.5 sm:mt-1">{card.sub}</p>}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Filtreler */}
      <div className="card-premium rounded-xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
            <input
              type="text"
              placeholder="Urun, cari veya fis no ara..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 sm:py-2 bg-card border border-border rounded-xl sm:rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
            {(['all', 'giris', 'cikis', 'iade'] as const).map(type => (
              <button key={type} onClick={() => setFilterType(type)}
                className={`px-3 py-2 rounded-xl sm:rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 active:scale-95 ${filterType === type ? 'bg-blue-600 text-white' : 'bg-card text-muted-foreground hover:text-white border border-border'}`}>
                {type === 'all' ? 'Tumu' : type === 'giris' ? 'Giris' : type === 'cikis' ? 'Cikis' : 'Iade'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl sm:rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-muted-foreground/70 shrink-0" />
            <input type="date" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="bg-transparent text-white text-xs sm:text-sm outline-none min-w-0 flex-1" />
            <span className="text-muted-foreground/50 shrink-0">-</span>
            <input type="date" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="bg-transparent text-white text-xs sm:text-sm outline-none min-w-0 flex-1" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
          {quickFilters.map(f => {
            const isActive = dateRange.start === f.start && dateRange.end === f.end;
            return (
              <button key={f.label} onClick={() => setDateRange({ start: f.start, end: f.end })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 active:scale-95 ${isActive ? 'bg-blue-600 text-white' : 'bg-card text-muted-foreground hover:text-white border border-border'}`}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Interactive Data Panel ─── */}
      <InteractiveDataPanel<StokHareket>
        data={filteredHareketler}
        columns={[
          {
            key: 'date', label: 'Tarih', cardRole: 'subtitle',
            render: (h) => <span className="font-mono text-xs sm:text-sm text-foreground/80">{h.date ? new Date(h.date).toLocaleDateString('tr-TR') : '-'}</span>,
            getValue: (h) => h.date ? new Date(h.date).getTime() : 0,
          },
          {
            key: 'type', label: 'Tip', cardRole: 'badge',
            render: (h) => {
              const config = typeConfig[h.type];
              const TypeIcon = config.icon;
              return (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${config.bg} ${config.color} border ${config.border}`}>
                    <TypeIcon className="w-3 h-3" />
                    <span className="hidden sm:inline">{config.label}</span>
                    <span className="sm:hidden">{h.type === 'giris' ? 'Giriş' : h.type === 'cikis' ? 'Çıkış' : 'İade'}</span>
                  </span>
                  {h.tag && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${h.tag === 'eski_stok' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' : 'bg-purple-500/15 text-purple-400 border-purple-500/25'}`}>
                      <Tag className="w-2.5 h-2.5" />
                      {h.tag === 'eski_stok' ? 'Eski Stok' : 'Manuel'}
                    </span>
                  )}
                </div>
              );
            },
          },
          {
            key: 'productName', label: 'Ürün', cardRole: 'title',
            render: (h) => <span className="text-xs sm:text-sm font-medium text-white">{h.productName}</span>,
          },
          {
            key: 'quantity', label: 'Miktar', align: 'center', cardRole: 'meta',
            render: (h) => <span className="font-mono text-xs sm:text-sm text-foreground/80">{h.quantity} {h.unit}</span>,
            getValue: (h) => h.quantity,
          },
          {
            key: 'unitPrice', label: 'Birim Fiyat', align: 'right', cardRole: 'meta',
            render: (h) => <span className="font-mono text-xs sm:text-sm text-foreground/80">{h.unitPrice.toLocaleString('tr-TR')} TL</span>,
            getValue: (h) => h.unitPrice,
          },
          {
            key: 'total', label: 'Toplam', align: 'right', cardRole: 'value', color: '#3b82f6',
            render: (h) => (
              <span className={`font-mono text-xs sm:text-sm font-bold ${h.type === 'giris' ? 'text-green-400' : h.type === 'iade' ? 'text-orange-400' : 'text-blue-400'}`}>
                {h.type === 'cikis' ? '-' : '+'}{h.total.toLocaleString('tr-TR')} TL
              </span>
            ),
            getValue: (h) => h.total,
          },
          {
            key: 'cari', label: 'Cari', cardRole: 'meta',
            render: (h) => <span className="text-xs sm:text-sm text-foreground/70">{h.cari}</span>,
          },
          {
            key: 'employee', label: 'Personel', cardRole: 'hidden',
            render: (h) => <span className="text-xs sm:text-sm text-muted-foreground">{h.employee}</span>,
          },
          {
            key: 'source', label: 'Fiş No', cardRole: 'hidden',
            render: (h) => <span className="text-xs font-mono text-muted-foreground/60">#{h.source}</span>,
          },
        ]}
        enableCardView
        enableAnalytics
        searchable={false}
        pageSize={15}
        emptyMessage="Seçili filtrelere uygun stok hareketi bulunamadı"
        accentColor="#3b82f6"
        renderExpanded={(h) => (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><span className="text-muted-foreground/60 block mb-0.5">Personel</span><span className="text-foreground font-medium">{h.employee}</span></div>
            <div><span className="text-muted-foreground/60 block mb-0.5">Fiş No</span><span className="text-foreground font-mono">#{h.source}</span></div>
            <div><span className="text-muted-foreground/60 block mb-0.5">İşlem Modu</span><span className="text-foreground">{h.fisMode}</span></div>
            <div><span className="text-muted-foreground/60 block mb-0.5">Birim</span><span className="text-foreground">{h.unit}</span></div>
          </div>
        )}
        footer={filteredHareketler.length > 0 ? (
          <tr className="border-t-2 border-white/[0.08]">
            <td className="py-3 px-4" />
            <td colSpan={2} className="py-3 px-4 text-white font-bold text-xs sm:text-sm">TOPLAM ({filteredHareketler.length} hareket)</td>
            <td className="py-3 px-4 text-center text-white font-bold text-xs sm:text-sm font-mono">{filteredHareketler.reduce((s, h) => s + h.quantity, 0)}</td>
            <td className="py-3 px-4" />
            <td className="py-3 px-4 text-right text-green-400 font-bold text-xs sm:text-sm font-mono">{filteredHareketler.reduce((s, h) => s + h.total, 0).toLocaleString('tr-TR')} TL</td>
            <td colSpan={3} />
          </tr>
        ) : undefined}
      />

      {/* ─── Geçmiş Stok Ekle Modal ─── */}
      <AnimatePresence>
        {showGecmisModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
              onClick={() => setShowGecmisModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="fixed inset-x-3 top-[5%] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[90vw] sm:max-w-lg z-50 bg-[#111] rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
              style={{ maxHeight: '90dvh' }}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-emerald-500/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <History className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Geçmiş Stok Girişi</h2>
                    <p className="text-xs text-gray-500">Eski sistemden geçiş / başlangıç stoğu ekle</p>
                  </div>
                </div>
                <button onClick={() => setShowGecmisModal(false)} className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleGecmisStokSubmit} className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90dvh - 80px)' }}>
                {/* Eski Stok Toggle */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <button
                    type="button"
                    onClick={() => setGecmisForm(f => ({ ...f, isEskiStok: !f.isEskiStok }))}
                    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${gecmisForm.isEskiStok ? 'bg-amber-500' : 'bg-white/10'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${gecmisForm.isEskiStok ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <div>
                    <p className="text-sm font-bold text-amber-400">Eski Sistemden Geçiş (Eski Stok)</p>
                    <p className="text-xs text-gray-500">Bu stok eski sisteme aitti — "Eski Stok" etiketi ile işaretlenir</p>
                  </div>
                </div>

                {/* Ürün seç */}
                <div>
                  <label className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1.5 block">Ürün *</label>
                  <select
                    required
                    value={gecmisForm.productId}
                    onChange={e => setGecmisForm(f => ({ ...f, productId: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-emerald-500/50"
                  >
                    <option value="">-- Ürün Seçin --</option>
                    {urunler.map(u => (
                      <option key={u.id} value={u.id}>{u.name} (Mevcut: {u.currentStock ?? u.current_stock ?? 0} {u.unit || 'AD'})</option>
                    ))}
                  </select>
                </div>

                {/* Tarih */}
                <div>
                  <label className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1.5 block">Tarih *</label>
                  <input
                    type="date"
                    required
                    value={gecmisForm.date}
                    onChange={e => setGecmisForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-emerald-500/50"
                  />
                </div>

                {/* Miktar + Birim Fiyat */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1.5 block">Miktar *</label>
                    <input
                      type="number"
                      required min="0.001" step="0.001"
                      placeholder="0"
                      value={gecmisForm.quantity}
                      onChange={e => setGecmisForm(f => ({ ...f, quantity: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-emerald-500/50"
                    />
                    {selectedUrun && <p className="text-[10px] text-gray-600 mt-1 ml-1">Birim: {selectedUrun.unit || 'AD'}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1.5 block">Birim Fiyat (₺)</label>
                    <input
                      type="number"
                      min="0" step="0.01"
                      placeholder="0.00"
                      value={gecmisForm.unitPrice}
                      onChange={e => setGecmisForm(f => ({ ...f, unitPrice: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </div>

                {/* Toplam göster */}
                {gecmisForm.quantity && Number(gecmisForm.quantity) > 0 && (
                  <div className="px-3 py-2 bg-emerald-500/8 rounded-xl border border-emerald-500/20 text-sm text-emerald-400 font-bold">
                    Toplam: {(Number(gecmisForm.quantity) * Number(gecmisForm.unitPrice || 0)).toLocaleString('tr-TR')} ₺
                  </div>
                )}

                {/* Cari (opsiyonel) */}
                <div>
                  <label className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1.5 block">Tedarikçi / Cari (opsiyonel)</label>
                  <input
                    type="text"
                    placeholder="Tedarikçi veya kaynak"
                    value={gecmisForm.cari}
                    onChange={e => setGecmisForm(f => ({ ...f, cari: e.target.value }))}
                    list="cari-datalist"
                    className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-emerald-500/50"
                  />
                  <datalist id="cari-datalist">
                    {cariList.map(c => <option key={c.id} value={c.companyName || c.name} />)}
                  </datalist>
                </div>

                {/* Not */}
                <div>
                  <label className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1.5 block">Not (opsiyonel)</label>
                  <textarea
                    rows={2}
                    placeholder="Açıklama veya not..."
                    value={gecmisForm.note}
                    onChange={e => setGecmisForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-emerald-500/50 resize-none"
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowGecmisModal(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold transition-all">İptal</button>
                  <button type="submit" className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/20">
                    <Plus className="w-4 h-4 inline mr-1.5" />
                    Stok Ekle
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
