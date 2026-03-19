import React, { useState } from 'react';
import { useEmployee } from '../contexts/EmployeeContext';
import { 
  FileText, 
  Download, 
  Upload, 
  Database,
  Users,
  Package,
  Receipt,
  Briefcase,
  Truck,
  Wallet,
  Archive,
  AlertCircle,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../utils/activityLogger';
import { useLanguage } from '../contexts/LanguageContext';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FileSection {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  storageKey: string;
  columns: string[];
}

const FILE_SECTIONS: FileSection[] = [
  {
    id: 'cari',
    title: 'Cari Hesaplar',
    description: 'Müşteri ve tedarikçi kayıtları',
    icon: <Users className="w-6 h-6" />,
    color: 'blue',
    storageKey: StorageKey.CARI_DATA,
    columns: ['ID', 'Firma Adi', 'Yetkili Kisi', 'Telefon', 'Vergi No', 'Bakiye', 'Islem Sayisi']
  },
  {
    id: 'fisler',
    title: 'İşlem Fişleri',
    description: 'Tüm satış ve alış fişleri',
    icon: <Receipt className="w-6 h-6" />,
    color: 'green',
    storageKey: StorageKey.FISLER,
    columns: ['Fis ID', 'Tur', 'Musteri', 'Personel', 'Urun Sayisi', 'Toplam Tutar', 'Odeme', 'Tarih']
  },
  {
    id: 'stock',
    title: 'Stok Kayitlari',
    description: 'Ürün ve stok hareketleri',
    icon: <Package className="w-6 h-6" />,
    color: 'purple',
    storageKey: StorageKey.STOK_DATA,
    columns: ['Urun Adi', 'Kategori', 'Stok Miktari', 'Birim', 'Birim Fiyat', 'Tedarikci']
  },
  {
    id: 'employees',
    title: 'Personel Kayitlari',
    description: 'Çalışan bilgileri ve izinleri',
    icon: <Briefcase className="w-6 h-6" />,
    color: 'orange',
    storageKey: StorageKey.PERSONEL_DATA,
    columns: ['Ad Soyad', 'Pozisyon', 'Telefon', 'E-posta', 'Maas', 'Durum']
  },
  {
    id: 'vehicles',
    title: 'Arac Kayitlari',
    description: 'Araç ve lojistik bilgileri',
    icon: <Truck className="w-6 h-6" />,
    color: 'teal',
    storageKey: StorageKey.ARAC_DATA,
    columns: ['Plaka', 'Marka/Model', 'Yil', 'Tip', 'Surucu', 'Durum', 'Son Bakim']
  },
  {
    id: 'cash',
    title: 'Kasa Hareketleri',
    description: 'Gelir ve gider kayıtları',
    icon: <Wallet className="w-6 h-6" />,
    color: 'red',
    storageKey: StorageKey.KASA_DATA,
    columns: ['Tarih', 'Tur', 'Kategori', 'Tutar', 'Aciklama', 'Personel', 'Fis No']
  }
];

export function FilesPage() {
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const [exportingSection, setExportingSection] = useState<string | null>(null);
  const { language } = useLanguage();
  const { emit } = useModuleBus();
  const { canView } = getPagePermissions(user, currentEmployee, 'dosyalar');

  // We map text to English characters in tables to prevent jspdf encoding issues, 
  // since standard jspdf doesn't support Turkish characters out of the box without a custom font.
  const sanitizeStr = (str: any) => {
    if (!str) return '-';
    return String(str)
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ş/g, 's').replace(/Ş/g, 'S')
      .replace(/ı/g, 'i').replace(/İ/g, 'I')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ç/g, 'c').replace(/Ç/g, 'C');
  };

  const getMappedData = (sectionId: string, data: any[]) => {
    switch (sectionId) {
      case 'cari':
        return data.map(item => [
          item.id?.substring(0, 6) || '-',
          sanitizeStr(item.companyName),
          sanitizeStr(item.contactPerson),
          sanitizeStr(item.phone),
          sanitizeStr(item.taxNumber),
          `${item.balance || 0} TL`,
          String(item.transactions || 0)
        ]);
      case 'fisler':
        return data.map(item => [
          item.id?.substring(0, 6) || '-',
          (item.mode === 'satis' || item.mode === 'sale') ? 'SATIS' : (item.mode === 'alis' ? 'ALIS' : sanitizeStr(item.mode?.toUpperCase() || '-')),
          sanitizeStr(item.cari?.companyName || item.customerName),
          sanitizeStr(item.employeeName),
          String(item.items?.length || 0),
          `${item.total || item.totalAmount || 0} TL`,
          sanitizeStr(item.payment?.method || item.paymentMethod || 'Belirtilmedi'),
          new Date(item.date).toLocaleDateString('tr-TR')
        ]);
      case 'stock':
        return data.map(item => [
          sanitizeStr(item.name),
          sanitizeStr(item.category),
          String(item.stock || 0),
          sanitizeStr(item.unit),
          `${item.price || 0} TL`,
          sanitizeStr(item.supplier)
        ]);
      case 'employees':
        return data.map(item => [
          sanitizeStr(item.name),
          sanitizeStr(item.position),
          sanitizeStr(item.phone),
          sanitizeStr(item.email),
          `${item.salary || 0} TL`,
          sanitizeStr(item.status || 'Aktif')
        ]);
      case 'vehicles':
        return data.map(item => [
          sanitizeStr(item.plate),
          sanitizeStr(item.brand),
          String(item.year || '-'),
          sanitizeStr(item.type),
          sanitizeStr(item.driver),
          sanitizeStr(item.status),
          sanitizeStr(item.lastMaintenance)
        ]);
      case 'cash':
        return data.map(item => [
          sanitizeStr(item.date),
          item.type === 'income' ? 'Gelir' : 'Gider',
          sanitizeStr(item.category),
          `${item.amount || 0} TL`,
          sanitizeStr(item.description),
          sanitizeStr(item.employee),
          sanitizeStr(item.receiptNo)
        ]);
      default:
        return [];
    }
  };

  const addPDFHeader = (doc: jsPDF, title: string, subtitle?: string) => {
    // Elegant dark header
    doc.setFillColor(15, 23, 42); // bg-slate-900
    doc.rect(0, 0, doc.internal.pageSize.width, 30, 'F');
    
    // Add gradient-like accent line
    doc.setFillColor(59, 130, 246); // bg-blue-500
    doc.rect(0, 30, doc.internal.pageSize.width, 1.5, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('ISLEYEN ET ERP', 14, 20);
    
    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184); // text-slate-400
    doc.text(sanitizeStr(title), doc.internal.pageSize.width / 2, 20, { align: 'center' });
    
    if (subtitle) {
      doc.setFontSize(9);
      doc.setTextColor(203, 213, 225); // text-slate-300
      doc.text(subtitle, doc.internal.pageSize.width - 14, 20, { align: 'right' });
    }
  };

  const addPDFFooter = (doc: jsPDF) => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Isleyen Et Sistemleri - Sayfa ${i} / ${pageCount}`, 
        doc.internal.pageSize.width / 2, 
        doc.internal.pageSize.height - 10, 
        { align: 'center' }
      );
    }
  };

  const exportToPDF = (section: FileSection) => {
    try {
      setExportingSection(section.id);
      
      const data = getFromStorage<any[]>(section.storageKey) || [];
      
      if (data.length === 0) {
        toast.error('Dışa aktarılacak veri bulunamadı', {
          description: `${section.title} için kayıt bulunmamaktadır.`
        });
        setExportingSection(null);
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape' });
      const timestamp = new Date().toLocaleString('tr-TR');
      
      addPDFHeader(doc, `${section.title} Raporu`, `Tarih: ${timestamp}`);

      const tableData = getMappedData(section.id, data);

      autoTable(doc, {
        head: [section.columns],
        body: tableData,
        startY: 40,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: 4,
          textColor: [51, 65, 85], // slate-700
          lineColor: [226, 232, 240], // slate-200
        },
        headStyles: {
          fillColor: [248, 250, 252], // slate-50
          textColor: [15, 23, 42], // slate-900
          fontStyle: 'bold',
          lineColor: [203, 213, 225], // slate-300
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252], // slate-50
        },
        margin: { top: 40, right: 14, bottom: 20, left: 14 }
      });

      addPDFFooter(doc);

      const fileName = `IsleyenEt_${section.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);

      toast.success('PDF başarıyla oluşturuldu!', {
        description: `${data.length} kayıt PDF formatında indirildi.`
      });

      const exportLog = getFromStorage<any[]>('export_logs') || [];
      exportLog.unshift({
        id: `exp-${Date.now()}`,
        section: section.title,
        recordCount: data.length,
        fileName: fileName,
        exportedBy: currentEmployee?.name || 'Bilinmiyor',
        date: new Date().toISOString()
      });
      setInStorage('export_logs', exportLog.slice(0, 50));

    } catch (error) {
      console.error('Export error:', error);
      toast.error('Dosya oluşturulurken hata oluştu');
    } finally {
      setExportingSection(null);
    }
  };

  const exportAllDataPDF = () => {
    try {
      toast.info('Tüm veriler PDF olarak hazırlanıyor...');

      const doc = new jsPDF({ orientation: 'landscape' });
      const timestamp = new Date().toLocaleString('tr-TR');
      let isFirstPage = true;
      let hasData = false;

      FILE_SECTIONS.forEach((section) => {
        const data = getFromStorage<any[]>(section.storageKey) || [];
        if (data.length === 0) return;

        hasData = true;

        if (!isFirstPage) {
          doc.addPage();
        }
        isFirstPage = false;

        addPDFHeader(doc, `Tum Veriler - ${sanitizeStr(section.title)}`, `Tarih: ${timestamp}`);

        const tableData = getMappedData(section.id, data);

        autoTable(doc, {
          head: [section.columns],
          body: tableData,
          startY: 40,
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: 9,
            cellPadding: 4,
            textColor: [51, 65, 85],
            lineColor: [226, 232, 240],
          },
          headStyles: {
            fillColor: [248, 250, 252],
            textColor: [15, 23, 42],
            fontStyle: 'bold',
            lineColor: [203, 213, 225],
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          margin: { top: 40, right: 14, bottom: 20, left: 14 }
        });
      });

      if (!hasData) {
        toast.error('Aktarılacak hiçbir veri bulunamadı.');
        return;
      }

      addPDFFooter(doc);

      const fileName = `IsleyenEt_TumVeriler_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);

      toast.success('Tüm veriler başarıyla PDF olarak aktarıldı!');

      const exportLog = getFromStorage<any[]>('export_logs') || [];
      exportLog.unshift({
        id: `exp-${Date.now()}`,
        section: 'Tüm Veriler',
        recordCount: 'Hepsi',
        fileName: fileName,
        exportedBy: currentEmployee?.name || 'Bilinmiyor',
        date: new Date().toISOString()
      });
      setInStorage('export_logs', exportLog.slice(0, 50));

    } catch (error) {
      console.error('Export all error:', error);
      toast.error('Toplu dışa aktarma sırasında hata oluştu');
    }
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
      blue: { bg: 'bg-blue-900/20', border: 'border-blue-800', text: 'text-blue-400', icon: 'bg-blue-600' },
      green: { bg: 'bg-green-900/20', border: 'border-green-800', text: 'text-green-400', icon: 'bg-green-600' },
      purple: { bg: 'bg-purple-900/20', border: 'border-purple-800', text: 'text-purple-400', icon: 'bg-purple-600' },
      orange: { bg: 'bg-orange-900/20', border: 'border-orange-800', text: 'text-orange-400', icon: 'bg-orange-600' },
      teal: { bg: 'bg-teal-900/20', border: 'border-teal-800', text: 'text-teal-400', icon: 'bg-teal-600' },
      red: { bg: 'bg-red-900/20', border: 'border-red-800', text: 'text-red-400', icon: 'bg-red-600' },
    };
    return colors[color] || colors.blue;
  };

  const exportLogs = getFromStorage<any[]>('export_logs') || [];

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-28 sm:pb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Dosyalar & PDF Yedekleme</h1>
          <p className="text-sm text-muted-foreground">
            Tüm sistem verilerinizi düzenli ve şık PDF formatında dışa aktarın
          </p>
        </div>
        <button
          onClick={exportAllDataPDF}
          className="flex items-center gap-2 px-5 sm:px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold rounded-lg transition-all shadow-lg w-full sm:w-auto justify-center text-sm sm:text-base"
        >
          <Database className="w-5 h-5" />
          Tüm Verileri PDF Yap
        </button>
      </div>

      <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-red-600 flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white mb-2">Düzenli ve Güvenli PDF Yedekleme</h3>
            <p className="text-sm text-foreground/80 mb-3">
              Verileriniz, hem okunması kolay hem de şık bir tasarıma sahip PDF dosyaları olarak indirilir.
              Raporlarınızı kolayca yazdırabilir, e-posta ile gönderebilir ve arşivleyebilirsiniz.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Kurumsal şık tasarım</span>
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Değiştirilemez ve güvenli</span>
              </div>
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Yazdırılmaya hazır</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {FILE_SECTIONS.map((section, index) => {
          const colors = getColorClasses(section.color);
          const dataCount = (getFromStorage<any[]>(section.storageKey) || []).length;
          
          return (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`${colors.bg} border ${colors.border} rounded-xl p-6 hover:shadow-lg transition-all`}
            >
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-12 h-12 rounded-lg ${colors.icon} flex items-center justify-center flex-shrink-0`}>
                  {section.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-1">{section.title}</h3>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </div>
              </div>

              <div className="mb-4 p-3 bg-secondary/50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Toplam Kayıt:</span>
                  <span className={`font-bold ${colors.text}`}>{dataCount}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => exportToPDF(section)}
                  disabled={exportingSection === section.id || dataCount === 0}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-secondary hover:bg-accent text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-5 h-5" />
                  {exportingSection === section.id ? 'İndiriliyor...' : 'PDF İndir'}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="bg-muted border border-border rounded-xl overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold text-white mb-1">Dışa Aktarma Geçmişi</h2>
          <p className="text-sm text-muted-foreground">Son yapılan PDF dışa aktarma işlemleri</p>
        </div>

        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {exportLogs.length === 0 ? (
            <div className="p-8 text-center">
              <Archive className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground/70">Henüz dışa aktarma işlemi yapılmamış</p>
            </div>
          ) : (
            exportLogs.slice(0, 20).map((log, index) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-red-900/20 border border-red-800 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-white">{log.fileName}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      <span>{log.section}</span>
                      <span>•</span>
                      <span>{log.recordCount} kayıt</span>
                      <span>•</span>
                      <span>{log.exportedBy}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {new Date(log.date).toLocaleString('tr-TR')}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}