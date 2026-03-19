import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getFromStorage, StorageKey } from './storage';

// ─── Türkçe karakter temizleme ───
const s = (str: any): string => {
  if (!str) return '';
  return String(str)
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C');
};

const fmt = (n: number): string => {
  if (n === null || n === undefined || isNaN(n)) return '0,00';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function getCompany() {
  try {
    const st = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
    if (st?.companyInfo) return {
      name: st.companyInfo.companyName || 'ISLEYEN ET',
      slogan: st.companyInfo.slogan || '',
      phone: st.companyInfo.phone || '',
      address: st.companyInfo.address || '',
      taxNo: st.companyInfo.taxNumber || '',
      taxOffice: st.companyInfo.taxOffice || '',
      email: st.companyInfo.email || '',
    };
  } catch {}
  return { name: 'ISLEYEN ET', slogan: '', phone: '', address: '', taxNo: '', taxOffice: '', email: '' };
}

// ─── Renk paleti (açık tema — görsele uygun) ───
const C = {
  pageBg:     [242, 242, 247] as [number, number, number],  // açık sayfa arkaplanı
  headerBar:  [15, 23, 42]   as [number, number, number],  // lacivert header
  cardBg:     [255, 255, 255] as [number, number, number],  // beyaz kart
  cardBorder: [200, 205, 215] as [number, number, number],  // kart çerçeve
  sectionBg:  [240, 243, 248] as [number, number, number],  // section başlık arka planı
  sectionAccent: [30, 64, 175] as [number, number, number], // mavi accent çizgi
  labelColor: [120, 130, 150] as [number, number, number],  // label gri
  textDark:   [30, 35, 50]   as [number, number, number],  // koyu metin
  textMid:    [80, 90, 110]  as [number, number, number],  // orta metin
  tblHead:    [230, 235, 242] as [number, number, number],  // tablo başlık bg
  tblHeadTxt: [50, 60, 80]   as [number, number, number],  // tablo başlık metin
  tblBorder:  [210, 215, 225] as [number, number, number],  // tablo çerçeve
  tblAltRow:  [248, 250, 253] as [number, number, number],  // alternatif satır
  saleColor:  [30, 35, 50]   as [number, number, number],  // satış = koyu
  iadeColor:  [234, 88, 12]  as [number, number, number],  // iade = turuncu
  iadeRowBg:  [255, 247, 237] as [number, number, number],  // iade satır arka plan
  tahsilatClr:[220, 38, 38]  as [number, number, number],  // tahsilat = kırmızı
  alisColor:  [126, 34, 206] as [number, number, number],  // alış = mor
  greenColor: [22, 163, 74]  as [number, number, number],  // net toplam yeşil
  blueColor:  [37, 99, 235]  as [number, number, number],  // vurgular
  white:      [255, 255, 255] as [number, number, number],
  summaryBg:  [252, 252, 255] as [number, number, number],  // özet kutu arka plan
  summaryBdr: [190, 195, 210] as [number, number, number],
};

// ═══════════════════════════════════════════════════
// ANA FONKSİYON
// ═══════════════════════════════════════════════════
export const generateCariDetailPDF = (cari: any, transactions: any[], startDate?: string, endDate?: string) => {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const co = getCompany();
  const M = 14; // kenar boşluğu
  const W = pw - 2 * M;
  const now = new Date();
  const timestamp = `${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

  // Sayfa arka planı
  const fillPage = () => {
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, pw, ph, 'F');
  };
  fillPage();

  // ════════��══════════════════════════════════
  // 1) İŞLEMLERİ DÜZLE — her fiş, ürün satırlarına açılsın
  // ═══════════════════════════════════════════
  interface ProductRow {
    fisDate: Date;
    fisId: string;
    employee: string;
    productName: string;
    type: 'Satis' | 'IADE' | 'Alis';
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }

  interface PaymentRow {
    fisDate: Date;
    fisId: string;
    method: string;
    amount: number;
  }

  const productRows: ProductRow[] = [];
  const paymentRows: PaymentRow[] = [];

  // Fişleri tarihe göre sırala
  const sorted = [...transactions].sort((a, b) => {
    const da = a.createdAt || a.date || '';
    const db = b.createdAt || b.date || '';
    return new Date(da).getTime() - new Date(db).getTime();
  });

  let totalSatis = 0;
  let totalIade = 0;
  let totalAlis = 0;
  let totalTahsilat = 0;

  sorted.forEach((fis: any) => {
    const fisDate = new Date(fis.createdAt || fis.date || Date.now());
    const fisId = (fis.id || '').substring(0, 10).toUpperCase();
    const employee = fis.employeeName || '';
    const isSale = fis.mode === 'satis' || fis.mode === 'sale';
    const isAlis = fis.mode === 'alis';
    const items = fis.items || [];

    items.forEach((item: any) => {
      const nm = s(item.productName || item.name || 'Urun');
      const q = Math.abs(item.quantity || 0);
      const u = s(item.unit || 'KG');
      const up = Math.abs(item.unitPrice || item.price || 0);
      const tp = Math.abs(item.totalPrice || item.total || up * q);
      const isIade = item.type === 'iade';

      if (isIade) {
        totalIade += tp;
      } else if (isAlis) {
        totalAlis += tp;
      } else {
        totalSatis += tp;
      }

      productRows.push({
        fisDate,
        fisId,
        employee,
        productName: nm,
        type: isIade ? 'IADE' : isAlis ? 'Alis' : 'Satis',
        quantity: q,
        unit: u,
        unitPrice: up,
        totalPrice: tp,
      });
    });

    // Ödeme/tahsilat
    const pa = fis.payment?.amount || 0;
    const pm = fis.payment?.method || 'veresiye';
    if (pa > 0 && pm !== 'veresiye') {
      totalTahsilat += pa;
      const pmLabel = pm === 'nakit' ? 'Nakit' : pm === 'kredi-karti' ? 'Kredi Karti' : pm === 'havale' ? 'Havale/EFT' : pm === 'cek' ? 'Cek' : s(pm);
      paymentRows.push({ fisDate, fisId, method: pmLabel, amount: pa });
    }
  });

  // ═══════════════════════════════════════════
  // 2) LACİVERT HEADER BAR — daha belirgin, şirket adı ile
  // ═══════════════════════════════════════════
  doc.setFillColor(...C.headerBar);
  doc.rect(0, 0, pw, 22, 'F');

  // Header içinde firma adı
  doc.setFontSize(16); doc.setTextColor(...C.white); doc.setFont('helvetica', 'bold');
  doc.text(s(co.name), M + 2, 10);

  // Header sağ: belge türü
  doc.setFontSize(11); doc.setTextColor(180, 200, 255); doc.setFont('helvetica', 'bold');
  doc.text('CARI HESAP EKSTRESI', pw - M - 2, 10, { align: 'right' });

  // Alt satır: slogan veya iletişim
  const headerSubtext: string[] = [];
  if (co.phone) headerSubtext.push(`Tel: ${s(co.phone)}`);
  if (co.email) headerSubtext.push(s(co.email));
  if (co.taxNo) headerSubtext.push(`VKN: ${s(co.taxNo)}`);
  if (headerSubtext.length > 0) {
    doc.setFontSize(7); doc.setTextColor(160, 175, 210); doc.setFont('helvetica', 'normal');
    doc.text(headerSubtext.join('  |  '), M + 2, 17);
  }

  // Tarih bilgisi sağ alt
  doc.setFontSize(7); doc.setTextColor(160, 175, 210); doc.setFont('helvetica', 'normal');
  doc.text(timestamp, pw - M - 2, 17, { align: 'right' });

  // ═══════════════════════════════════════════
  // 3) CARİ / MÜŞTERİ BİLGİ KARTI
  // ═══════════════════════════════════════════
  let y = 28;

  const label = (t: string, x: number, yy: number) => {
    doc.setFontSize(8); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
    doc.text(t, x, yy);
  };
  const value = (t: string, x: number, yy: number, bold = false, color?: [number, number, number]) => {
    doc.setFontSize(9); doc.setTextColor(...(color || C.textDark)); doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(s(t || '-'), x, yy);
  };

  // Beyaz kart çerçeve
  doc.setFillColor(...C.cardBg);
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, W, 34, 2, 2, 'FD');

  // Mavi accent sol kenar
  doc.setFillColor(...C.sectionAccent);
  doc.rect(M, y, 3, 34, 'F');

  const lx = M + 8;
  let ly = y + 8;

  // Sol kolon: Müşteri bilgileri
  doc.setFontSize(10); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text(s(cari.companyName || 'Cari'), lx, ly);
  ly += 7;
  label('Yetkili:', lx, ly);       value(cari.contactPerson, lx + 22, ly);
  label('Telefon:', lx, ly + 6);   value(cari.phone, lx + 22, ly + 6);
  label('Vergi No:', lx, ly + 12); value(cari.taxNumber, lx + 22, ly + 12);

  // Sağ kolon
  const rx = pw / 2 + 10;

  if (startDate && endDate) {
    label('Donem:', rx, y + 8);  value(`${startDate} - ${endDate}`, rx + 22, y + 8, false, C.blueColor);
  }
  label('Rapor No:', rx, y + 15);  value(`CRD-${Date.now().toString().substring(5)}`, rx + 22, y + 15, true);
  label('V. Dairesi:', rx, y + 22); value(cari.taxOffice, rx + 22, y + 22);

  // Bakiye — sağ alt köşede belirgin
  const bakiye = cari.balance || 0;
  const bakiyeColor = bakiye > 0 ? C.tahsilatClr : bakiye < 0 ? C.greenColor : C.textDark;
  doc.setFontSize(8); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
  doc.text('Bakiye:', rx, y + 29);
  doc.setFontSize(12); doc.setTextColor(...bakiyeColor); doc.setFont('helvetica', 'bold');
  doc.text(`${fmt(Math.abs(bakiye))} TL`, rx + 22, y + 30);
  doc.setFontSize(7);
  doc.text(bakiye > 0 ? '(BORCLU)' : bakiye < 0 ? '(ALACAKLI)' : '', rx + 55, y + 30);

  y += 40;

  // ═══════════════════════════════════════════
  // 4) ÜRÜN DETAYLARI TABLOSU
  // ═══════════════════════════════════════════
  // Section başlık
  doc.setFillColor(...C.sectionBg);
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W, 8, 1.5, 1.5, 'FD');
  doc.setFillColor(...C.sectionAccent);
  doc.rect(M, y, 2.5, 8, 'F');

  doc.setFontSize(9); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text(`  URUN DETAYLARI (${productRows.length} kalem)`, M + 3, y + 5.5);
  y += 11;

  // Tablo verisi
  const tableBody = productRows.map((row, i) => [
    String(i + 1),
    row.productName,
    row.type,
    fmt(row.quantity),
    row.unit,
    fmt(row.unitPrice),
    `${row.type === 'IADE' ? '-' : ''}${fmt(row.totalPrice)}`,
  ]);

  // Tablo tipi bilgileri (renklendirme için)
  const rowTypeList = productRows.map(r => r.type);

  let isFirstPage = true;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Urun Adi', 'Tur', 'Miktar', 'Birim', 'B. Fiyat (TL)', 'Toplam (TL)']],
    body: tableBody,
    theme: 'grid' as const,
    headStyles: {
      fillColor: C.tblHead,
      textColor: C.tblHeadTxt,
      fontStyle: 'bold' as const,
      lineWidth: 0.3,
      lineColor: C.tblBorder,
      fontSize: 8,
      halign: 'center' as const,
      cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
    },
    bodyStyles: {
      textColor: C.textDark,
      fillColor: C.cardBg,
      lineWidth: 0.2,
      lineColor: C.tblBorder,
      fontSize: 8.5,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
    },
    alternateRowStyles: { fillColor: C.tblAltRow },
    styles: { font: 'helvetica' },
    margin: { left: M, right: M },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' as const },                // #
      1: { cellWidth: 'auto' as const },                             // Urun Adi
      2: { cellWidth: 20, halign: 'center' as const, fontStyle: 'bold' as const },  // Tur
      3: { cellWidth: 22, halign: 'right' as const },                // Miktar
      4: { cellWidth: 16, halign: 'center' as const },               // Birim
      5: { cellWidth: 28, halign: 'right' as const },                // B. Fiyat
      6: { cellWidth: 30, halign: 'right' as const, fontStyle: 'bold' as const },   // Toplam
    },
    willDrawPage: (data: any) => {
      if (data.pageNumber === 1) return;
      fillPage();
    },
    didParseCell: (cd: any) => {
      if (cd.section !== 'body') return;
      const rType = rowTypeList[cd.row.index];
      if (!rType) return;

      if (rType === 'IADE') {
        // İade satırları: turuncu vurgu, hafif turuncu arka plan
        cd.cell.styles.fillColor = C.iadeRowBg;
        if (cd.column.index === 2) { cd.cell.styles.textColor = C.iadeColor; cd.cell.styles.fontStyle = 'bold'; }
        if (cd.column.index === 6) { cd.cell.styles.textColor = C.iadeColor; cd.cell.styles.fontStyle = 'bold'; }
      } else if (rType === 'Satis') {
        if (cd.column.index === 2) { cd.cell.styles.textColor = C.textDark; cd.cell.styles.fontStyle = 'bold'; }
        if (cd.column.index === 6) { cd.cell.styles.textColor = C.blueColor; cd.cell.styles.fontStyle = 'bold'; }
      } else if (rType === 'Alis') {
        if (cd.column.index === 2) { cd.cell.styles.textColor = C.alisColor; cd.cell.styles.fontStyle = 'bold'; }
        if (cd.column.index === 6) { cd.cell.styles.textColor = C.alisColor; cd.cell.styles.fontStyle = 'bold'; }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ═══════════════════════════════════════════
  // 5) TAHSİLAT/ÖDEME TABLOSU (varsa)
  // ═══════════════════════════════════════════
  if (paymentRows.length > 0) {
    if (y > ph - 60) { doc.addPage(); fillPage(); y = 14; }

    // Section başlık
    doc.setFillColor(...C.sectionBg);
    doc.setDrawColor(...C.cardBorder);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, W, 8, 1.5, 1.5, 'FD');
    doc.setFillColor(...C.tahsilatClr);
    doc.rect(M, y, 2.5, 8, 'F');

    doc.setFontSize(9); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
    doc.text(`  TAHSILAT / ODEME KAYITLARI (${paymentRows.length} islem)`, M + 3, y + 5.5);
    y += 11;

    const payBody = paymentRows.map((row, i) => [
      String(i + 1),
      row.fisDate.toLocaleDateString('tr-TR'),
      `FIS-${row.fisId}`,
      row.method,
      fmt(row.amount),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['#', 'Tarih', 'Fis No', 'Odeme Yontemi', 'Tutar (TL)']],
      body: payBody,
      theme: 'grid' as const,
      headStyles: {
        fillColor: C.tblHead, textColor: C.tblHeadTxt, fontStyle: 'bold' as const,
        lineWidth: 0.3, lineColor: C.tblBorder, fontSize: 8, halign: 'center' as const,
        cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
      },
      bodyStyles: {
        textColor: C.textDark, fillColor: C.cardBg,
        lineWidth: 0.2, lineColor: C.tblBorder, fontSize: 8.5,
        cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      },
      alternateRowStyles: { fillColor: C.tblAltRow },
      styles: { font: 'helvetica' },
      margin: { left: M, right: M },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' as const },
        1: { cellWidth: 28 },
        2: { cellWidth: 35 },
        3: { cellWidth: 'auto' as const },
        4: { cellWidth: 30, halign: 'right' as const, fontStyle: 'bold' as const },
      },
      willDrawPage: (data: any) => { if (data.pageNumber > 1) fillPage(); },
      didParseCell: (cd: any) => {
        if (cd.section !== 'body') return;
        if (cd.column.index === 4) { cd.cell.styles.textColor = C.tahsilatClr; cd.cell.styles.fontStyle = 'bold'; }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ═══════════════════════════════════════════
  // 6) ÖZET KUTUSU (Sipariş Tutarı / İade / Net Toplam)
  // ═══════════════════════════════════════════
  if (y > ph - 60) { doc.addPage(); fillPage(); y = 14; }

  // Özet kutusu — sağa hizalı
  const sumBoxW = 80;
  const sumBoxX = pw - M - sumBoxW;
  const sumBoxY = y;

  doc.setFillColor(...C.summaryBg);
  doc.setDrawColor(...C.summaryBdr);
  doc.setLineWidth(0.4);
  doc.roundedRect(sumBoxX, sumBoxY, sumBoxW, 38, 1.5, 1.5, 'FD');

  let sy = sumBoxY + 8;
  const sumLabel = (t: string, yy: number, color?: [number, number, number]) => {
    doc.setFontSize(8.5); doc.setTextColor(...(color || C.textMid)); doc.setFont('helvetica', 'normal');
    doc.text(t, sumBoxX + 5, yy);
  };
  const sumValue = (t: string, yy: number, color?: [number, number, number], bold = false) => {
    doc.setFontSize(9); doc.setTextColor(...(color || C.textDark)); doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(t, sumBoxX + sumBoxW - 5, yy, { align: 'right' });
  };

  // Satış / Alış toplamı
  const malTutari = totalSatis + totalAlis;
  sumLabel('Siparis Tutari:', sy);
  sumValue(`${fmt(malTutari)} TL`, sy, C.textDark, true);

  // İade
  if (totalIade > 0) {
    sy += 8;
    sumLabel('Iade Tutari:', sy, C.iadeColor);
    sumValue(`-${fmt(totalIade)} TL`, sy, C.iadeColor, true);
  }

  // Tahsilat
  if (totalTahsilat > 0) {
    sy += 8;
    sumLabel('Tahsilat:', sy, C.tahsilatClr);
    sumValue(`-${fmt(totalTahsilat)} TL`, sy, C.tahsilatClr, true);
  }

  // Ayırıcı çizgi
  sy += 5;
  doc.setDrawColor(...C.summaryBdr); doc.setLineWidth(0.3);
  doc.line(sumBoxX + 4, sy, sumBoxX + sumBoxW - 4, sy);
  sy += 6;

  // NET TOPLAM
  doc.setFontSize(10); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text('NET TOPLAM:', sumBoxX + 5, sy);
  const netToplam = bakiye;
  const netColor = netToplam > 0 ? C.tahsilatClr : netToplam < 0 ? C.greenColor : C.textDark;
  doc.setFontSize(11); doc.setTextColor(...netColor); doc.setFont('helvetica', 'bold');
  doc.text(`${fmt(Math.abs(netToplam))} TL`, sumBoxX + sumBoxW - 5, sy, { align: 'right' });

  y = sumBoxY + 46;

  // ═══════════════════════════════════════════
  // 7) İMZA ALANI
  // ═══════════════════════════════════════════
  const np = (doc as any).internal.getNumberOfPages();
  doc.setPage(np);

  // İmza yeterli alan var mı kontrol
  const sigY = Math.max(y + 20, ph - 48);
  if (sigY > ph - 10) {
    doc.addPage(); fillPage();
  }

  const actualSigY = sigY > ph - 10 ? ph - 48 : sigY;

  // Sol: Teslim Eden
  doc.setDrawColor(...C.cardBorder); doc.setLineWidth(0.3);
  doc.line(M, actualSigY, M + 55, actualSigY);
  doc.setFontSize(7.5); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
  doc.text('Teslim Eden', M, actualSigY + 5);
  doc.setFontSize(8); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text(s(co.name), M, actualSigY + 10);

  // Sağ: Teslim Alan
  const rSigX = pw - M - 55;
  doc.setDrawColor(...C.cardBorder);
  doc.line(rSigX, actualSigY, rSigX + 55, actualSigY);
  doc.setFontSize(7.5); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
  doc.text('Teslim Alan', rSigX, actualSigY + 5);
  doc.setFontSize(8); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text(s(cari.companyName || '-'), rSigX, actualSigY + 10);

  // ═══════════════════════════════════════════
  // 8) TÜM SAYFALARA FOOTER
  // ═══════════════════════════════════════════
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);

    // Alt çizgi
    doc.setDrawColor(...C.cardBorder); doc.setLineWidth(0.2);
    doc.line(M, ph - 16, pw - M, ph - 16);

    // Elektronik belge notu
    doc.setFontSize(6.5); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
    doc.text('Bu belge elektronik ortamda olusturulmustur.', pw / 2, ph - 11, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(`${s(co.name)} ERP | ${timestamp}`, pw / 2, ph - 6.5, { align: 'center' });

    // Sayfa numarası
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(`Sayfa ${pg} / ${totalPages}`, pw - M, ph - 6.5, { align: 'right' });

    // 2+ sayfada tekrar eden başlık
    if (pg > 1) {
      doc.setFillColor(...C.headerBar);
      doc.rect(0, 0, pw, 8, 'F');
      doc.setFontSize(7); doc.setTextColor(...C.white); doc.setFont('helvetica', 'bold');
      doc.text(`${s(co.name)}  |  Cari Hesap Detay: ${s(cari.companyName)}`, M, 5.5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 185, 200);
      doc.text(`Sayfa ${pg}/${totalPages}  |  ${now.toLocaleDateString('tr-TR')}`, pw - M, 5.5, { align: 'right' });
    }
  }

  // Dosya kaydet
  doc.save(`cari-detay-${s(cari.companyName).replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
};

// ═══════════════════════════════════════════════════
// TEK FİŞ PDF FONKSİYONU
// ══════════════════════════════════════════════════
export const generateSingleFisPDF = async (
  fis: any,
  cari: any,
  balanceInfo?: { previousBalance: number; newBalance: number }
) => {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const co = getCompany();
  const M = 14;
  const W = pw - 2 * M;
  const now = new Date();
  const fisDate = new Date(fis.createdAt || fis.date || Date.now());
  const timestamp = `${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

  const fillPage = () => {
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, pw, ph, 'F');
  };
  fillPage();

  const label = (t: string, x: number, yy: number) => {
    doc.setFontSize(8); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
    doc.text(t, x, yy);
  };
  const value = (t: string, x: number, yy: number, bold = false, color?: [number, number, number]) => {
    doc.setFontSize(9); doc.setTextColor(...(color || C.textDark)); doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(s(t || '-'), x, yy);
  };

  // ═══════════════════════════════════════════
  // 1) LACİVERT HEADER BAR
  // ═══════════════════════════════════════════
  doc.setFillColor(...C.headerBar);
  doc.rect(0, 0, pw, 8, 'F');

  // ═══════════════════════════════════════════
  // 2) İŞLETME BİLGİLERİ KARTI
  // ═══════════════════════════════════════════
  let y = 14;

  doc.setFillColor(...C.cardBg);
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, W, 28, 2, 2, 'FD');

  const lx = M + 6;
  let ly = y + 8;

  // Sol: İşletme bilgileri
  doc.setFontSize(14); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text(s(co.name), lx, ly);
  if (co.slogan) {
    doc.setFontSize(7); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
    doc.text(s(co.slogan), lx, ly + 5);
  }
  const contactLine: string[] = [];
  if (co.phone) contactLine.push(`Tel: ${s(co.phone)}`);
  if (co.email) contactLine.push(`E-posta: ${s(co.email)}`);
  if (contactLine.length > 0) {
    doc.setFontSize(7); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
    doc.text(contactLine.join('  |  '), lx, ly + 10);
  }
  if (co.address) {
    doc.setFontSize(7); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
    doc.text(s(co.address).substring(0, 80), lx, ly + 15);
  }

  // Sağ: Fiş türü badge
  const isSatis = fis.mode === 'satis' || fis.mode === 'sale';
  const isAlis = fis.mode === 'alis';
  const modeLabel = isSatis ? 'SATIS FISI' : isAlis ? 'ALIS FISI' : 'GIDER FISI';
  const modeColor = isSatis ? C.greenColor : isAlis ? C.blueColor : C.tahsilatClr;

  doc.setFontSize(12); doc.setTextColor(...modeColor); doc.setFont('helvetica', 'bold');
  doc.text(modeLabel, pw - M - 6, ly, { align: 'right' });

  y += 34;

  // ═══════════════════════════════════════════
  // 3) FİŞ META BİLGİLERİ + CARİ BİLGİLERİ KUTUSU
  // ══════════════���════════════════════════════
  doc.setFillColor(...C.cardBg);
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, W, 32, 2, 2, 'FD');

  const metaY = y + 7;
  // Sol kolon: Fiş bilgileri
  label('Fis No:', lx, metaY);
  value((fis.id || '').substring(0, 16).toUpperCase(), lx + 22, metaY, true);
  label('Tarih:', lx, metaY + 7);
  value(fisDate.toLocaleDateString('tr-TR'), lx + 22, metaY + 7);
  label('Saat:', lx, metaY + 14);
  value(fisDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), lx + 22, metaY + 14);
  label('Personel:', lx, metaY + 21);
  value(fis.employeeName || 'Belirtilmemis', lx + 22, metaY + 21);

  // Sağ kolon: Cari bilgileri
  const rx = pw / 2 + 10;
  label('Cari:', rx, metaY);
  value(cari?.companyName || '-', rx + 22, metaY, true);
  label('Yetkili:', rx, metaY + 7);
  value(cari?.contactPerson || '-', rx + 22, metaY + 7);
  label('Telefon:', rx, metaY + 14);
  value(cari?.phone || '-', rx + 22, metaY + 14);
  if (cari?.taxNumber) {
    label('Vergi No:', rx, metaY + 21);
    value(cari.taxNumber, rx + 22, metaY + 21);
  }

  y += 38;

  // ═══════════════════════════════════════════
  // 4) ÜRÜN DETAYLARI TABLOSU
  // ═══════════════════════════════════════════
  doc.setFillColor(...C.sectionBg);
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W, 8, 1.5, 1.5, 'FD');
  doc.setFillColor(...C.sectionAccent);
  doc.rect(M, y, 2.5, 8, 'F');

  const items = fis.items || [];
  doc.setFontSize(9); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text(`  URUN DETAYLARI (${items.length} kalem)`, M + 3, y + 5.5);
  y += 11;

  const tableBody = items.map((item: any, i: number) => {
    const isIade = item.type === 'iade';
    const nm = s(item.productName || item.name || 'Urun');
    const q = Math.abs(item.quantity || 0);
    const u = s(item.unit || 'KG');
    const up = Math.abs(item.unitPrice || item.price || 0);
    const tp = Math.abs(item.totalPrice || item.total || up * q);
    return [
      String(i + 1),
      nm,
      isIade ? 'IADE' : (isSatis ? 'Satis' : 'Alis'),
      fmt(q),
      u,
      fmt(up),
      `${isIade ? '-' : ''}${fmt(tp)}`,
    ];
  });

  const rowTypeList = items.map((item: any) => item.type === 'iade' ? 'IADE' : (isSatis ? 'Satis' : 'Alis'));

  let fisFirstPage = true;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Urun Adi', 'Tur', 'Miktar', 'Birim', 'B. Fiyat (TL)', 'Toplam (TL)']],
    body: tableBody,
    theme: 'grid' as const,
    headStyles: {
      fillColor: C.tblHead, textColor: C.tblHeadTxt, fontStyle: 'bold' as const,
      lineWidth: 0.3, lineColor: C.tblBorder, fontSize: 8, halign: 'center' as const,
      cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
    },
    bodyStyles: {
      textColor: C.textDark, fillColor: C.cardBg,
      lineWidth: 0.2, lineColor: C.tblBorder, fontSize: 8.5,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
    },
    alternateRowStyles: { fillColor: C.tblAltRow },
    styles: { font: 'helvetica' },
    margin: { left: M, right: M },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' as const },
      1: { cellWidth: 'auto' as const },
      2: { cellWidth: 20, halign: 'center' as const, fontStyle: 'bold' as const },
      3: { cellWidth: 22, halign: 'right' as const },
      4: { cellWidth: 16, halign: 'center' as const },
      5: { cellWidth: 28, halign: 'right' as const },
      6: { cellWidth: 30, halign: 'right' as const, fontStyle: 'bold' as const },
    },
    willDrawPage: (data: any) => {
      if (data.pageNumber === 1) return;
      fillPage();
    },
    didParseCell: (cd: any) => {
      if (cd.section !== 'body') return;
      const rType = rowTypeList[cd.row.index];
      if (!rType) return;
      if (rType === 'IADE') {
        cd.cell.styles.fillColor = C.iadeRowBg;
        if (cd.column.index === 2) { cd.cell.styles.textColor = C.iadeColor; cd.cell.styles.fontStyle = 'bold'; }
        if (cd.column.index === 6) { cd.cell.styles.textColor = C.iadeColor; cd.cell.styles.fontStyle = 'bold'; }
      } else if (rType === 'Satis') {
        if (cd.column.index === 6) { cd.cell.styles.textColor = C.blueColor; cd.cell.styles.fontStyle = 'bold'; }
      } else if (rType === 'Alis') {
        if (cd.column.index === 2) { cd.cell.styles.textColor = C.alisColor; cd.cell.styles.fontStyle = 'bold'; }
        if (cd.column.index === 6) { cd.cell.styles.textColor = C.alisColor; cd.cell.styles.fontStyle = 'bold'; }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ═══════════════════════════════════════════
  // 5) AÇIKLAMA (varsa)
  // ═══════════════════════════════════════════
  if (fis.description && fis.description.trim()) {
    if (y > ph - 40) { doc.addPage(); fillPage(); y = 14; }
    doc.setFillColor(...C.summaryBg);
    doc.setDrawColor(...C.summaryBdr);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, W, 14, 1.5, 1.5, 'FD');
    doc.setFontSize(7); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
    doc.text('Aciklama:', M + 4, y + 5);
    doc.setFontSize(8); doc.setTextColor(...C.textMid); doc.setFont('helvetica', 'italic');
    doc.text(s(fis.description).substring(0, 120), M + 4, y + 10);
    y += 18;
  }

  // ═══════════════════════════════════════════
  // 6) BAKİYE HESAPLAMA KUTUSU
  // ═══════════════════════════════════════════
  if (y > ph - 60) { doc.addPage(); fillPage(); y = 14; }

  const sumBoxW = 85;
  const sumBoxX = pw - M - sumBoxW;

  // Sol taraf: Tahsilat bilgisi
  const paymentAmount = fis.payment?.amount || 0;
  const paymentMethod = fis.payment?.method || 'veresiye';
  if (paymentAmount > 0 && paymentMethod !== 'veresiye') {
    doc.setFillColor(...C.summaryBg);
    doc.setDrawColor(...C.summaryBdr);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, sumBoxW, 20, 1.5, 1.5, 'FD');
    doc.setFillColor(...C.tahsilatClr);
    doc.rect(M, y, 2.5, 20, 'F');
    doc.setFontSize(8); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
    doc.text('Odeme / Tahsilat', M + 6, y + 7);
    const pmLabel = paymentMethod === 'nakit' ? 'Nakit' : paymentMethod === 'kredi-karti' ? 'Kredi Karti' : paymentMethod === 'havale' ? 'Havale/EFT' : paymentMethod === 'cek' ? 'Cek' : s(paymentMethod);
    doc.setFontSize(9); doc.setTextColor(...C.tahsilatClr); doc.setFont('helvetica', 'bold');
    doc.text(`${fmt(paymentAmount)} TL (${pmLabel})`, M + 6, y + 14);
  }

  // Sağ taraf: Bakiye kutusu
  const prevBalance = balanceInfo?.previousBalance ?? 0;
  const fisTotal = fis.total || 0;
  const newBalance = balanceInfo?.newBalance ?? (prevBalance + fisTotal - paymentAmount);

  doc.setFillColor(...C.summaryBg);
  doc.setDrawColor(...C.summaryBdr);
  doc.setLineWidth(0.4);
  doc.roundedRect(sumBoxX, y, sumBoxW, 40, 1.5, 1.5, 'FD');

  let sy = y + 8;
  const sumLabel = (t: string, yy: number, color?: [number, number, number]) => {
    doc.setFontSize(8.5); doc.setTextColor(...(color || C.textMid)); doc.setFont('helvetica', 'normal');
    doc.text(t, sumBoxX + 5, yy);
  };
  const sumValue = (t: string, yy: number, color?: [number, number, number], bold = false) => {
    doc.setFontSize(9); doc.setTextColor(...(color || C.textDark)); doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(t, sumBoxX + sumBoxW - 5, yy, { align: 'right' });
  };

  sumLabel('Onceki Bakiye:', sy);
  sumValue(`${fmt(Math.abs(prevBalance))} TL`, sy, prevBalance > 0 ? C.tahsilatClr : C.greenColor);
  sy += 8;
  sumLabel('Fis Tutari:', sy);
  sumValue(`+${fmt(fisTotal)} TL`, sy, C.blueColor, true);
  if (paymentAmount > 0) {
    sy += 8;
    sumLabel('Tahsilat:', sy, C.tahsilatClr);
    sumValue(`-${fmt(paymentAmount)} TL`, sy, C.tahsilatClr, true);
  }
  sy += 5;
  doc.setDrawColor(...C.summaryBdr); doc.setLineWidth(0.3);
  doc.line(sumBoxX + 4, sy, sumBoxX + sumBoxW - 4, sy);
  sy += 6;
  doc.setFontSize(10); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text('GUNCEL BAKIYE:', sumBoxX + 5, sy);
  const netColor = newBalance > 0 ? C.tahsilatClr : newBalance < 0 ? C.greenColor : C.textDark;
  doc.setFontSize(11); doc.setTextColor(...netColor); doc.setFont('helvetica', 'bold');
  doc.text(`${fmt(Math.abs(newBalance))} TL`, sumBoxX + sumBoxW - 5, sy, { align: 'right' });

  y += 48;

  // ═══════════════════════════════════════════
  // 7) İMZA ALANI
  // ═══════════════════════════════════════════
  if (y > ph - 50) { doc.addPage(); fillPage(); y = 14; }

  const sigY = Math.max(y + 10, ph - 55);
  doc.setDrawColor(...C.cardBorder); doc.setLineWidth(0.3);
  doc.line(M, sigY, M + 55, sigY);
  doc.setFontSize(7.5); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
  doc.text('Teslim Eden', M, sigY + 5);
  doc.setFontSize(8); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text(s(co.name), M, sigY + 10);

  const rSigX = pw - M - 55;
  doc.setDrawColor(...C.cardBorder);
  doc.line(rSigX, sigY, rSigX + 55, sigY);
  doc.setFontSize(7.5); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
  doc.text('Teslim Alan', rSigX, sigY + 5);
  doc.setFontSize(8); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
  doc.text(s(cari?.companyName || '-'), rSigX, sigY + 10);

  // ═══════════════════════════════════════════
  // 8) FİŞ FOTOĞRAFI (varsa — en alta eklenir)
  // ══════════════════════════════════════════
  const photoUrl = fis.fisPhoto || fis.photo;
  if (photoUrl) {
    try {
      const imgData = await loadImageAsBase64(photoUrl);
      if (imgData) {
        doc.addPage();
        fillPage();

        // Header tekrarı
        doc.setFillColor(...C.headerBar);
        doc.rect(0, 0, pw, 8, 'F');
        doc.setFontSize(7); doc.setTextColor(...C.white); doc.setFont('helvetica', 'bold');
        doc.text(`${s(co.name)}  |  Fis Fotografi`, M, 5.5);

        let imgY = 14;

        // Başlık
        doc.setFillColor(...C.sectionBg);
        doc.setDrawColor(...C.cardBorder);
        doc.setLineWidth(0.3);
        doc.roundedRect(M, imgY, W, 8, 1.5, 1.5, 'FD');
        doc.setFillColor(...C.sectionAccent);
        doc.rect(M, imgY, 2.5, 8, 'F');
        doc.setFontSize(9); doc.setTextColor(...C.textDark); doc.setFont('helvetica', 'bold');
        doc.text('  FIS FOTOGRAFI', M + 3, imgY + 5.5);
        imgY += 14;

        // Fotoğrafı ekle — sayfaya sığdır
        const maxImgW = W - 10;
        const maxImgH = ph - imgY - 30;
        doc.addImage(imgData, 'JPEG', M + 5, imgY, maxImgW, maxImgH, undefined, 'FAST');
      }
    } catch (e) {
      console.log('Fis fotografi PDF\'e eklenemedi:', e);
    }
  }

  // ═══════════════════════════════════════════
  // 9) TÜM SAYFALARA FOOTER
  // ═══════════════════════════════════════════
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setDrawColor(...C.cardBorder); doc.setLineWidth(0.2);
    doc.line(M, ph - 16, pw - M, ph - 16);
    doc.setFontSize(6.5); doc.setTextColor(...C.labelColor); doc.setFont('helvetica', 'normal');
    doc.text('Bu belge elektronik ortamda olusturulmustur.', pw / 2, ph - 11, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(`${s(co.name)} ERP | ${timestamp}`, pw / 2, ph - 6.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(`Sayfa ${pg} / ${totalPages}`, pw - M, ph - 6.5, { align: 'right' });

    if (pg > 1) {
      doc.setFillColor(...C.headerBar);
      doc.rect(0, 0, pw, 8, 'F');
      doc.setFontSize(7); doc.setTextColor(...C.white); doc.setFont('helvetica', 'bold');
      doc.text(`${s(co.name)}  |  Fis: ${(fis.id || '').substring(0, 12).toUpperCase()}`, M, 5.5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 185, 200);
      doc.text(`Sayfa ${pg}/${totalPages}  |  ${now.toLocaleDateString('tr-TR')}`, pw - M, 5.5, { align: 'right' });
    }
  }

  // Dosya kaydet
  const fisIdShort = (fis.id || 'fis').substring(0, 10);
  doc.save(`fis-${fisIdShort}-${s(cari?.companyName || 'cari').replace(/\s+/g, '-').toLowerCase()}.pdf`);
};

// ─── Yardımcı: Fotoğrafı base64'e çevir ───
function loadImageAsBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
      // Timeout: 10 saniye
      setTimeout(() => resolve(null), 10000);
    } catch {
      resolve(null);
    }
  });
}