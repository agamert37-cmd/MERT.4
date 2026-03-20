import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  RotateCcw, 
  Search, 
  Calendar, 
  Filter, 
  Package, 
  TrendingUp, 
  TrendingDown, 
  FileText,
  Download 
} from 'lucide-react';
import { motion } from 'motion/react';
import { getFromStorage, StorageKey } from '../utils/storage';
import { useEmployee } from '../contexts/EmployeeContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logActivity } from '../utils/activityLogger';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addPDFHeader, addPDFFooter, addReportInfoBox, tableStyles } from '../utils/reportGenerator';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { InteractiveDataPanel, type PanelColumn } from '../components/InteractiveDataPanel';


interface StokHareket {
  id: string;
  date: string;
  productName: string;
  type: 'giris' | 'cikis' | 'iade';
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  source: string;
  cari: string;
  employee: string;
  fisMode: string;
}

export function StokHareketPage() {
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { on, onPrefix, emit } = useModuleBus();
  const { canView, canExport } = { ...getPagePermissions(user, currentEmployee, 'stok'), canExport: true };
  const sec = usePageSecurity('stok_hareket');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'giris' | 'cikis' | 'iade'>('all');

  // Storage + ModuleBus dinle
  const [refreshCounter, setRefreshCounter] = useState(0);
  useEffect(() => {
    const handler = () => setRefreshCounter(c => c + 1);
    window.addEventListener('storage_update', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('storage_update', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  // Cross-module: stok/fis degisikliklerinde otomatik yenile
  useEffect(() => {
    const unsub1 = onPrefix('stok:', () => setRefreshCounter(c => c + 1));
    const unsub2 = onPrefix('fis:', () => setRefreshCounter(c => c + 1));
    const unsub3 = on('uretim:completed', () => setRefreshCounter(c => c + 1));
    const unsub4 = on('system:backup_restored', () => setRefreshCounter(c => c + 1));
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [on, onPrefix]);

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

  // Fislerden stok hareketleri cikar
  const rawFisler = useMemo(() => getFromStorage<any[]>(StorageKey.FISLER) || [], [refreshCounter]);

  const hareketler = useMemo(() => {
    const results: StokHareket[] = [];

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
        if (isIade) {
          type = 'iade';
        } else if (isSatis) {
          type = 'cikis';
        } else if (isAlis) {
          type = 'giris';
        } else {
          type = 'cikis';
        }

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

    return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [rawFisler]);

  // Filtreleme
  const filteredHareketler = useMemo(() => {
    return hareketler.filter(h => {
      if (h.date) {
        let d = new Date(h.date);
        if (!isNaN(d.getTime())) {
          const start = new Date(dateRange.start);
          start.setHours(0, 0, 0, 0);
          const end = new Date(dateRange.end);
          end.setHours(23, 59, 59, 999);
          if (d < start || d > end) return false;
        }
      }
      if (filterType !== 'all' && h.type !== filterType) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          h.productName.toLowerCase().includes(term) ||
          h.cari.toLowerCase().includes(term) ||
          h.source.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [hareketler, dateRange, filterType, searchTerm]);

  // Ozet istatistikler
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

  // Hizli tarih filtreleri
  const quickFilters = useMemo(() => {
    const now = new Date();
    const todayISO = now.toISOString().split('T')[0];
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(weekStart.getDate() - diff);
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
      ]);

      autoTable(doc, {
        head: [['Tarih', 'Tip', 'Urun', 'Miktar', 'Birim Fiyat', 'Toplam', 'Cari', 'Personel', 'Fis No']],
        body: tableData,
        startY: nextY + 8,
        ...tableStyles,
        columnStyles: {
          ...tableStyles.columnStyles,
          4: { halign: 'right' },
          5: { halign: 'right', fontStyle: 'bold' },
        },
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
      sec.auditLog('stok_hareket_export', 'pdf', `${filteredHareketler.length} hareket`);
      logActivity('employee_update', 'Stok Hareket Raporu Indirildi', { employeeName: user?.name, page: 'stok_hareket' });
      toast.success('Stok hareket raporu PDF olarak indirildi!');
    } catch (err) {
      toast.error('PDF olusturulurken hata olustu');
      console.error(err);
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight mb-0.5 sm:mb-1">Stok Hareket Gecmisi</h1>
          <p className="text-[11px] sm:text-sm text-muted-foreground">Urun giris, cikis ve iade hareketlerinin detayli takibi</p>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={filteredHareketler.length === 0}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 sm:py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 active:from-blue-800 active:to-cyan-800 disabled:from-secondary disabled:to-secondary disabled:cursor-not-allowed text-white font-semibold rounded-xl sm:rounded-lg transition-all border border-blue-500/30 text-sm"
        >
          <Download className="w-4 h-4" />
          PDF Aktar
        </button>
      </div>

      {/* Ozet Kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        {[
          { title: 'Toplam Hareket', value: stats.totalHareket.toString(), icon: Package, color: 'from-secondary to-accent' },
          { title: 'Stok Girisi', value: `${stats.totalGiris} AD`, sub: `${stats.totalGirisVal.toLocaleString('tr-TR')} TL`, icon: ArrowDownCircle, color: 'from-green-600 to-green-700' },
          { title: 'Stok Cikisi', value: `${stats.totalCikis} AD`, sub: `${stats.totalCikisVal.toLocaleString('tr-TR')} TL`, icon: ArrowUpCircle, color: 'from-blue-600 to-blue-700' },
          { title: 'Iade', value: `${stats.totalIade} AD`, sub: `${stats.totalIadeVal.toLocaleString('tr-TR')} TL`, icon: RotateCcw, color: 'from-orange-600 to-orange-700' },
        ].map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="card-premium rounded-xl p-3 sm:p-5"
            >
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
      </div>

      {/* Filtreler */}
      <div className="card-premium rounded-xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3">
          {/* Arama */}
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

          {/* Tip Filtresi */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
            {(['all', 'giris', 'cikis', 'iade'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 sm:px-3 py-2 rounded-xl sm:rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 active:scale-95 ${
                  filterType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-card text-muted-foreground hover:text-white border border-border'
                }`}
              >
                {type === 'all' ? 'Tumu' : type === 'giris' ? 'Giris' : type === 'cikis' ? 'Cikis' : 'Iade'}
              </button>
            ))}
          </div>

          {/* Tarih */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl sm:rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-muted-foreground/70 shrink-0" />
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
              className="bg-transparent text-white text-xs sm:text-sm outline-none min-w-0 flex-1"
            />
            <span className="text-muted-foreground/50 shrink-0">-</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
              className="bg-transparent text-white text-xs sm:text-sm outline-none min-w-0 flex-1"
            />
          </div>
        </div>

        {/* Hizli tarih */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
          {quickFilters.map(f => {
            const isActive = dateRange.start === f.start && dateRange.end === f.end;
            return (
              <button
                key={f.label}
                onClick={() => setDateRange({ start: f.start, end: f.end })}
                className={`px-2.5 py-1 rounded-lg sm:rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 active:scale-95 ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-card text-muted-foreground hover:text-white border border-border'
                }`}
              >
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
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${config.bg} ${config.color} border ${config.border}`}>
                  <TypeIcon className="w-3 h-3" />
                  <span className="hidden sm:inline">{config.label}</span>
                  <span className="sm:hidden">{h.type === 'giris' ? 'Giriş' : h.type === 'cikis' ? 'Çıkış' : 'İade'}</span>
                </span>
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
              <span className={`font-mono text-xs sm:text-sm font-bold ${
                h.type === 'giris' ? 'text-green-400' : h.type === 'iade' ? 'text-orange-400' : 'text-blue-400'
              }`}>
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
            <td colSpan={2} className="py-3 px-4 text-white font-bold text-xs sm:text-sm">
              TOPLAM ({filteredHareketler.length} hareket)
            </td>
            <td className="py-3 px-4 text-center text-white font-bold text-xs sm:text-sm font-mono">
              {filteredHareketler.reduce((s, h) => s + h.quantity, 0)}
            </td>
            <td className="py-3 px-4" />
            <td className="py-3 px-4 text-right text-green-400 font-bold text-xs sm:text-sm font-mono">
              {filteredHareketler.reduce((s, h) => s + h.total, 0).toLocaleString('tr-TR')} TL
            </td>
            <td colSpan={3} />
          </tr>
        ) : undefined}
      />
    </div>
  );
}