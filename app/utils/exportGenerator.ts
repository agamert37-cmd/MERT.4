import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { getFromStorage, StorageKey } from './storage';
import { getDb } from '../lib/pouchdb';
import { TABLE_NAMES } from '../lib/db-config';

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

// Dinamik şirket bilgileri
function getCompanyInfoForPDF() {
  try {
    const settings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
    if (settings?.companyInfo) {
      return {
        companyName: settings.companyInfo.companyName || 'ISLEYEN ET',
        slogan: settings.companyInfo.slogan || 'Kurumsal ERP Sistemleri',
      };
    }
  } catch {}
  return { companyName: 'ISLEYEN ET', slogan: 'Kurumsal ERP Sistemleri' };
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('tr-TR');
  } catch {
    return dateStr;
  }
};

const formatMoney = (amount: number) => {
  return (amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getModeLabel = (mode: string) => {
  if (mode === 'satis' || mode === 'sale') return 'Satis';
  if (mode === 'alis') return 'Alis';
  if (mode === 'gider') return 'Gider';
  return mode || '-';
};

const getPaymentMethodLabel = (method: string) => {
  if (method === 'nakit') return 'Nakit';
  if (method === 'kredi-karti') return 'Kredi Karti';
  if (method === 'havale') return 'Havale/EFT';
  if (method === 'cek') return 'Cek';
  return method || '-';
};

export const generateDetailedExcelBackup = () => {
  try {
    const wb = XLSX.utils.book_new();

    // Gather all data
    const fisler = getFromStorage<any[]>(StorageKey.FISLER) || [];
    const cari = getFromStorage<any[]>(StorageKey.CARI_DATA) || [];
    const stok = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
    const personel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
    const kasa = getFromStorage<any[]>(StorageKey.KASA_DATA) || [];
    const arac = getFromStorage<any[]>(StorageKey.ARAC_DATA) || [];

    // ─── Fisler (Receipts) ────────────────────────────────────────────────────
    const fislerData = fisler.flatMap(f => {
      const fisMode = getModeLabel(f.mode);
      const baseData = {
        'Fis ID': f.id || '',
        'Tarih': formatDate(f.date),
        'Fis Tipi': fisMode,
        'Musteri/Tedarikci': f.cari?.companyName || (f.mode === 'gider' ? f.category : '-'),
        'Toplam Tutar': f.total || f.amount || 0,
        'Odeme Yontemi': f.payment ? getPaymentMethodLabel(f.payment.method) : 'Veresiye',
        'Odenen Tutar': f.payment?.amount || 0,
        'Personel': f.employeeName || '-',
      };
      
      if (f.items && f.items.length > 0) {
        return f.items.map((i: any) => ({
          ...baseData,
          'Urun': i.productName || i.name || '',
          'Islem Turu': i.type === 'iade' ? 'Iade' : i.type === 'alis' ? 'Alis' : 'Satis',
          'Miktar': Math.abs(i.quantity || 0),
          'Birim': i.unit || '',
          'Birim Fiyat': i.unitPrice || i.price || 0,
          'Satir Toplami': Math.abs(i.totalPrice || 0)
        }));
      }
      
      // Gider fisleri icin
      if (f.mode === 'gider') {
        return [{
          ...baseData,
          'Urun': '-',
          'Islem Turu': 'Gider',
          'Miktar': 1,
          'Birim': '-',
          'Birim Fiyat': f.amount || 0,
          'Satir Toplami': f.amount || 0
        }];
      }
      
      return [baseData];
    });

    // ─── Stok (Products) ──────────────────────────────────────────────────────
    const stokData = stok.map(s => ({
      'Urun ID': s.id || '',
      'Urun Adi': s.name || '',
      'Kategori': s.category || '',
      'Birim': s.unit || '',
      'Satis Fiyati': s.sellPrice ?? s.sell_price ?? 0,
      'Mevcut Stok': s.currentStock ?? s.current_stock ?? 0,
      'Minimum Stok': s.minStock ?? s.min_stock ?? 0,
      'Stok Degeri': ((s.currentStock ?? s.current_stock ?? 0) * (s.sellPrice ?? s.sell_price ?? 0)),
      'Durum': (s.currentStock ?? s.current_stock ?? 0) <= (s.minStock ?? s.min_stock ?? 0) ? 'Kritik' : 'Normal'
    }));

    // ─── Cari (Current Accounts) ──────────────────────────────────────────────
    const cariData = cari.map(c => ({
      'Cari ID': c.id || '',
      'Firma Adi': c.companyName || c.company_name || '',
      'Yetkili Kisi': c.contactPerson || c.contact_person || '',
      'Tip': c.type || '',
      'Telefon': c.phone || '',
      'E-posta': c.email || '',
      'Vergi No': c.taxNumber || c.tax_number || '',
      'Vergi Dairesi': c.taxOffice || c.tax_office || '',
      'Bolge': c.region || '',
      'Kategori': c.category || '',
      'Bakiye': c.balance || 0,
      'Islem Sayisi': c.transactions || 0
    }));

    // ─── Kasa Hareketleri ─────────────────────────────────────────────────────
    const kasaData = kasa.map(k => ({
      'Islem ID': k.id || '',
      'Tarih': k.date || '',
      'Saat': k.time || '',
      'Islem Tipi': k.type || '',
      'Kategori': k.category || '',
      'Aciklama': k.description || '',
      'Tutar': k.amount || 0,
      'Personel': k.employee || ''
    }));

    // ─── Personel (Staff) ─────────────────────────────────────────────────────
    const personelData = personel.map(p => ({
      'Personel ID': p.id || '',
      'Ad Soyad': p.name || '',
      'Pozisyon': p.position || p.role || '',
      'Telefon': p.phone || '',
      'E-posta': p.email || '',
      'Maas': p.salary || 0,
      'Durum': p.status === 'active' ? 'Aktif' : (p.status || 'Aktif')
    }));

    // ─── Araclar (Vehicles) ───────────────────────────────────────────────────
    const aracData = arac.map(a => ({
      'Plaka': a.plate || a.plaka || '',
      'Sofor': a.driver || a.sofor || '',
      'Marka/Model': a.model || a.marka || '',
      'Durum': a.status || a.durum || ''
    }));

    // Append sheets
    if (fislerData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fislerData), "Fisler");
    if (stokData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stokData), "Stoklar");
    if (cariData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cariData), "Cari Hesaplar");
    if (kasaData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kasaData), "Kasa Hareketleri");
    if (personelData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(personelData), "Personel");
    if (aracData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aracData), "Araclar");

    // If no data
    if (wb.SheetNames.length === 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Bilgi: 'Sistemde disa aktarilacak veri bulunmamaktadir.' }]), "Bos");
    }

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `IsleyenET_Yedek_${dateStr}.xlsx`);
    
    return true;
  } catch (error) {
    console.error('Excel Export Error:', error);
    return false;
  }
};

export const generatePDFBackup = () => {
  try {
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const dateStr = new Date().toISOString().split('T')[0];
    const company = getCompanyInfoForPDF();
    
    // ─── Header ───────────────────────────────────────────────────────────────
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 3, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(sanitizeStr(company.companyName), 14, 16);
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizeStr(company.slogan) + ' - Sistem Ozet Raporu', 14, 23);

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(sanitizeStr('SISTEM YEDEKLEME RAPORU'), pageWidth - 14, 16, { align: 'right' });
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')}`, pageWidth - 14, 23, { align: 'right' });

    let yPos = 36;

    // Gather data
    const fisler = getFromStorage<any[]>(StorageKey.FISLER) || [];
    const cari = getFromStorage<any[]>(StorageKey.CARI_DATA) || [];
    const stok = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
    const kasa = getFromStorage<any[]>(StorageKey.KASA_DATA) || [];

    // ─── Ozet Istatistikler ───────────────────────────────────────────────────
    const totalSatis = fisler.filter(f => f.mode === 'satis' || f.mode === 'sale').reduce((s, f) => s + (f.total || 0), 0);
    const totalAlis = fisler.filter(f => f.mode === 'alis').reduce((s, f) => s + (f.total || 0), 0);
    const totalGider = fisler.filter(f => f.mode === 'gider').reduce((s, f) => s + (f.amount || 0), 0);
    const totalCariAlacak = cari.filter(c => c.balance > 0).reduce((s, c) => s + c.balance, 0);
    const totalCariBorç = cari.filter(c => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);

    // Stats cards
    const cardWidth = (pageWidth - 42) / 5;
    const stats = [
      { label: 'Toplam Satis', value: formatMoney(totalSatis) + ' TL', color: [34, 197, 94] },
      { label: 'Toplam Alis', value: formatMoney(totalAlis) + ' TL', color: [59, 130, 246] },
      { label: 'Toplam Gider', value: formatMoney(totalGider) + ' TL', color: [239, 68, 68] },
      { label: 'Cari Alacak', value: formatMoney(totalCariAlacak) + ' TL', color: [16, 185, 129] },
      { label: 'Cari Borc', value: formatMoney(totalCariBorç) + ' TL', color: [245, 158, 11] },
    ];

    stats.forEach((stat, i) => {
      const x = 14 + i * (cardWidth + 3.5);
      doc.setFillColor(stat.color[0], stat.color[1], stat.color[2]);
      doc.roundedRect(x, yPos, cardWidth, 4, 1, 1, 'F');
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, yPos + 4, cardWidth, 16, 0, 0, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(stat.label, x + cardWidth / 2, yPos + 10, { align: 'center' });
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(stat.value, x + cardWidth / 2, yPos + 17, { align: 'center' });
    });

    yPos += 28;

    // ─── 1. Cari Hesap Ozeti ──────────────────────────────────────────────────
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('1. Cari Hesap Ozeti (En Yuksek Bakiyeler)', 14, yPos);
    yPos += 4;
    
    const cariTableData = cari
      .filter(c => (c.balance || 0) !== 0)
      .sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0))
      .slice(0, 12)
      .map(c => [
        sanitizeStr(c.companyName || c.company_name || '-'), 
        sanitizeStr(c.type || '-'),
        sanitizeStr(c.contactPerson || c.contact_person || '-'),
        sanitizeStr(c.phone || '-'),
        formatMoney(c.balance || 0) + ' TL',
        String(c.transactions || 0)
      ]);

    if (cariTableData.length > 0) {
      (doc as any).autoTable({
        startY: yPos,
        head: [['Firma Adi', 'Tip', 'Yetkili', 'Telefon', 'Bakiye', 'Islem']],
        body: cariTableData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        margin: { left: 14, right: 14 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    } else {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Bakiyesi olan cari kaydi bulunamadi.', 14, yPos + 5);
      yPos += 12;
    }

    // ─── 2. Stok Ozeti ────────────────────────────────────────────────────────
    if (yPos > 160) { doc.addPage(); yPos = 20; }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('2. Stok Ozeti', 14, yPos);
    yPos += 4;

    const stokTableData = stok
      .sort((a, b) => (a.currentStock ?? a.current_stock ?? 0) - (b.currentStock ?? b.current_stock ?? 0))
      .slice(0, 15)
      .map(s => {
        const stock = s.currentStock ?? s.current_stock ?? 0;
        const minStock = s.minStock ?? s.min_stock ?? 0;
        const price = s.sellPrice ?? s.sell_price ?? 0;
        return [
          sanitizeStr(s.name || ''),
          sanitizeStr(s.category || ''),
          `${stock} ${s.unit || 'KG'}`,
          `${minStock} ${s.unit || 'KG'}`,
          formatMoney(price) + ' TL',
          formatMoney(stock * price) + ' TL',
          stock <= minStock ? 'KRITIK' : 'Normal'
        ];
      });

    if (stokTableData.length > 0) {
      (doc as any).autoTable({
        startY: yPos,
        head: [['Urun Adi', 'Kategori', 'Stok', 'Min Stok', 'Fiyat', 'Deger', 'Durum']],
        body: stokTableData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        margin: { left: 14, right: 14 },
        didDrawCell: (data: any) => {
          if (data.column.index === 6 && data.section === 'body') {
            if (data.cell.text[0] === 'KRITIK') {
              doc.setTextColor(220, 38, 38);
            }
          }
        }
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    } else {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Stok kaydi bulunamadi.', 14, yPos + 5);
      yPos += 12;
    }

    // ─── 3. Son Fisler ────────────────────────────────────────────────────────
    if (yPos > 140) { doc.addPage(); yPos = 20; }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('3. Son Islemler (Fisler)', 14, yPos);
    yPos += 4;

    const fislerTableData = fisler
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20)
      .map(f => [
        formatDate(f.date),
        sanitizeStr(getModeLabel(f.mode)),
        sanitizeStr(f.cari?.companyName || (f.mode === 'gider' ? f.category : '-')),
        formatMoney(f.total || f.amount || 0) + ' TL',
        sanitizeStr(f.payment ? getPaymentMethodLabel(f.payment.method) : 'Veresiye'),
        sanitizeStr(f.employeeName || '-')
      ]);

    if (fislerTableData.length > 0) {
      (doc as any).autoTable({
        startY: yPos,
        head: [['Tarih', 'Tip', 'Cari/Kategori', 'Tutar', 'Odeme', 'Personel']],
        body: fislerTableData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        margin: { left: 14, right: 14 },
      });
    } else {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Fis kaydi bulunamadi.', 14, yPos + 5);
    }

    // ─── Footer ───────────────────────────────────────────────────────────────
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(`${sanitizeStr(company.companyName)} - ${sanitizeStr(company.slogan)} | Bu belge elektronik ortamda olusturulmustur.`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text(`Olusturma: ${new Date().toLocaleString('tr-TR')} | Sayfa 1`, pageWidth / 2, pageHeight - 6, { align: 'center' });

    doc.save(`IsleyenET_Ozet_Rapor_${dateStr}.pdf`);
    return true;
  } catch (error) {
    console.error('PDF Export Error:', error);
    return false;
  }
};

// ─── Türkçe tablo adları ──────────────────────────────────────────────────────
const TABLE_LABELS: Record<string, string> = {
  fisler: 'Fisler',
  urunler: 'Urunler (Stok)',
  cari_hesaplar: 'Cari Hesaplar',
  kasa_islemleri: 'Kasa Islemleri',
  personeller: 'Personeller',
  bankalar: 'Bankalar',
  cekler: 'Cekler',
  araclar: 'Araclar',
  arac_shifts: 'Arac Vardiyeleri',
  arac_km_logs: 'Km Loglari',
  uretim_profilleri: 'Uretim Profilleri',
  uretim_kayitlari: 'Uretim Kayitlari',
  faturalar: 'Faturalar',
  fatura_stok: 'Fatura Stok',
  tahsilatlar: 'Tahsilatlar',
  guncelleme_notlari: 'Guncelleme Notlari',
  stok_giris: 'Stok Girisleri',
};

/** PouchDB'deki tüm tablolardan veri okur ve çok sayfalı Excel dosyası indirir */
export async function generateFullPouchDbExcel(
  onProgress?: (tableName: string, index: number, total: number) => void
): Promise<{ ok: number; fail: number; totalRows: number }> {
  const wb = XLSX.utils.book_new();
  const dateStr = new Date().toISOString().split('T')[0];
  let ok = 0;
  let fail = 0;
  let totalRows = 0;

  // Özet sayfası için
  const summaryRows: { Tablo: string; 'Kayit Sayisi': number; Durum: string }[] = [];

  for (let i = 0; i < TABLE_NAMES.length; i++) {
    const tableName = TABLE_NAMES[i];
    const label = TABLE_LABELS[tableName] || tableName;

    try {
      onProgress?.(tableName, i, TABLE_NAMES.length);
      const db = getDb(tableName);
      const result = await db.allDocs({ include_docs: true });
      const rows = result.rows
        .filter((r: any) => r.doc && !r.doc._deleted)
        .map((r: any) => {
          const { _id, _rev, _deleted, _conflicts, _attachments, ...rest } = r.doc;
          if (!rest.id) rest.id = _id;
          // Tüm alanları düzleştir (nested objeleri JSON string'e çevir)
          const flat: Record<string, any> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
              flat[k] = JSON.stringify(v);
            } else if (Array.isArray(v)) {
              flat[k] = JSON.stringify(v);
            } else {
              flat[k] = v;
            }
          }
          return flat;
        });

      if (rows.length > 0) {
        const ws = XLSX.utils.json_to_sheet(rows);
        // Sütun genişliklerini ayarla
        const colWidths = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 12) }));
        ws['!cols'] = colWidths;
        XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31)); // Excel max 31 char
      }

      summaryRows.push({ Tablo: label, 'Kayit Sayisi': rows.length, Durum: 'OK' });
      totalRows += rows.length;
      ok++;
    } catch (e: any) {
      console.error(`[Excel Export] ${tableName}:`, e.message);
      summaryRows.push({ Tablo: label, 'Kayit Sayisi': 0, Durum: `Hata: ${e.message}` });
      fail++;
    }
  }

  // Özet sayfası en başa ekle
  const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Ozet');

  // Ozet en başa al
  wb.SheetNames = ['Ozet', ...wb.SheetNames.filter(n => n !== 'Ozet')];

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Bilgi: 'Veri bulunamadi.' }]), 'Bos');
  }

  XLSX.writeFile(wb, `IsleyenET_TamVeri_${dateStr}.xlsx`);
  return { ok, fail, totalRows };
}