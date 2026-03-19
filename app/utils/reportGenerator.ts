import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getFromStorage, StorageKey } from './storage';

// Türkçe karakterleri standart İngilizce karakterlere dönüştür
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

// Dinamik şirket bilgilerini al
function getCompanyInfoForPDF() {
  try {
    const settings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
    if (settings?.companyInfo) {
      return {
        companyName: settings.companyInfo.companyName || 'ISLEYEN ET',
        slogan: settings.companyInfo.slogan || 'Kurumsal ERP Sistemleri',
        phone: settings.companyInfo.phone || '',
        address: settings.companyInfo.address || '',
        taxNumber: settings.companyInfo.taxNumber || '',
        taxOffice: settings.companyInfo.taxOffice || '',
        email: settings.companyInfo.email || '',
      };
    }
  } catch {}
  return {
    companyName: 'ISLEYEN ET',
    slogan: 'Kurumsal ERP Sistemleri',
    phone: '',
    address: '',
    taxNumber: '',
    taxOffice: '',
    email: '',
  };
}

const C = {
  pageBg:     [250, 251, 253] as [number, number, number],
  headerBar:  [20, 25, 40]   as [number, number, number],
  headerSub:  [160, 175, 210] as [number, number, number],
  textDark:   [30, 40, 55]   as [number, number, number],
  textMuted:  [100, 110, 130] as [number, number, number],
  border:     [220, 225, 235] as [number, number, number],
  white:      [255, 255, 255] as [number, number, number],
  accentBlue: [37, 99, 235]  as [number, number, number],
  accentGreen:[22, 163, 74]  as [number, number, number],
  accentRed:  [220, 38, 38]  as [number, number, number],
  accentOrange: [234, 88, 12] as [number, number, number],
  accentPurple: [147, 51, 234] as [number, number, number],
  summaryBg:  [252, 252, 255] as [number, number, number],
  tableHead:  [240, 244, 248] as [number, number, number],
};

// ─── Doküman numarası üretici ───────────────────────────────────────────────
function generateDocId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `RPT-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}

// ─── PDF içi yatay bar grafik çizici ────────────────────────────────────────
function drawHorizontalBarChart(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  items: { label: string; value: number; color: [number, number, number] }[],
  title?: string,
): number {
  const barHeight = 7;
  const gap = 3;
  const maxVal = Math.max(...items.map(i => i.value), 1);
  const barAreaWidth = width * 0.55;
  const labelAreaWidth = width * 0.28;
  const valueAreaWidth = width * 0.17;
  let cy = y;
  
  if (title) {
    doc.setFontSize(9);
    doc.setTextColor(...C.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text(title, x, cy);
    cy += 5;
  }
  
  items.forEach((item) => {
    // Label
    doc.setFontSize(7);
    doc.setTextColor(...C.textMuted);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizeStr(item.label).substring(0, 25), x, cy + barHeight - 2);
    
    // Bar background
    const barX = x + labelAreaWidth;
    doc.setFillColor(235, 238, 243);
    doc.roundedRect(barX, cy, barAreaWidth, barHeight, 1, 1, 'F');
    
    // Bar fill
    const fillWidth = Math.max((item.value / maxVal) * barAreaWidth, 2);
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.roundedRect(barX, cy, fillWidth, barHeight, 1, 1, 'F');
    
    // Value
    doc.setFontSize(7);
    doc.setTextColor(...C.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `${item.value.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TL`,
      x + width, cy + barHeight - 2, { align: 'right' }
    );
    
    cy += barHeight + gap;
  });
  
  return cy + 2;
}

// ─── Executive Summary Box ──────────────────────────────────────────────────
function drawExecutiveSummary(
  doc: jsPDF,
  y: number,
  lines: string[],
): number {
  const pw = doc.internal.pageSize.width;
  const lineH = 5;
  const boxH = 8 + lines.length * lineH;
  
  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, y, pw - 28, boxH, 2, 2, 'FD');
  
  // Left accent bar
  doc.setFillColor(37, 99, 235);
  doc.roundedRect(14, y + 3, 3, boxH - 6, 1, 1, 'F');
  
  doc.setFontSize(7);
  doc.setTextColor(37, 99, 235);
  doc.setFont('helvetica', 'bold');
  doc.text('YONETICI OZETI', 21, y + 6);
  
  doc.setFontSize(7);
  doc.setTextColor(...C.textDark);
  doc.setFont('helvetica', 'normal');
  lines.forEach((line, idx) => {
    doc.text(sanitizeStr(line), 21, y + 11 + idx * lineH);
  });
  
  return y + boxH + 6;
}

// ─── Confidentiality watermark ──────────────────────────────────────────────
function addConfidentialityBadge(doc: jsPDF) {
  const pw = doc.internal.pageSize.width;
  doc.setFontSize(6);
  doc.setTextColor(180, 190, 210);
  doc.setFont('helvetica', 'italic');
  doc.text('GIZLI - Bu dokuman yalnizca yetkili personel icindir.', pw / 2, 32, { align: 'center' });
}

export const addPDFHeader = (doc: jsPDF, title: string, subtitle?: string) => {
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const company = getCompanyInfoForPDF();
  const docId = generateDocId();
  
  // Page Background
  doc.setFillColor(...C.pageBg);
  doc.rect(0, 0, pw, ph, 'F');
  
  // Header Bar (taller, more corporate)
  doc.setFillColor(...C.headerBar);
  doc.rect(0, 0, pw, 26, 'F');
  
  // Thin accent line under header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 26, pw, 1.5, 'F');
  
  // Company Name
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(sanitizeStr(company.companyName), 14, 11);
  
  // Slogan or info
  doc.setTextColor(...C.headerSub);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizeStr(company.slogan || 'Kurumsal Yonetim Sistemi'), 14, 17);
  
  // Doc ID
  doc.setFontSize(6);
  doc.setTextColor(100, 120, 160);
  doc.text(`Dokuman No: ${docId}`, 14, 22);

  // Report Title (right side)
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(sanitizeStr(title).toUpperCase(), pw - 14, 11, { align: 'right' });
  
  // Date/Subtitle
  if (subtitle) {
    doc.setTextColor(...C.headerSub);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizeStr(subtitle), pw - 14, 17, { align: 'right' });
  }
  
  // Timestamp
  doc.setFontSize(6);
  doc.setTextColor(100, 120, 160);
  doc.text(`Olusturulma: ${new Date().toLocaleString('tr-TR')}`, pw - 14, 22, { align: 'right' });
  
  // Confidentiality
  addConfidentialityBadge(doc);
};

export const addPDFFooter = (doc: jsPDF) => {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const company = getCompanyInfoForPDF();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Top Border for footer
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.5);
    doc.line(14, ph - 16, pw - 14, ph - 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.textMuted);
    
    const contactParts: string[] = [];
    if (company.phone) contactParts.push(`Tel: ${sanitizeStr(company.phone)}`);
    if (company.email) contactParts.push(`E: ${sanitizeStr(company.email)}`);
    if (company.taxNumber) contactParts.push(`VN: ${sanitizeStr(company.taxNumber)}`);
    
    const contactLine = contactParts.length > 0 ? contactParts.join(' | ') : '';
    if (contactLine) {
      doc.text(contactLine, 14, ph - 11);
    }
    if (company.address) {
      doc.text(sanitizeStr(company.address), 14, ph - 7);
    }
    
    // Legal disclaimer
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(170, 180, 200);
    doc.text('Bu rapor otomatik olarak olusturulmustur. Gizlidir ve yalnizca yetkili personel icindir.', 14, ph - 4);
    
    const timeStr = new Date().toLocaleString('tr-TR');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textMuted);
    doc.text(`${sanitizeStr(company.companyName)} ERP Sistemi | ${timeStr}`, pw / 2, ph - 8, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(`Sayfa ${i} / ${pageCount}`, pw - 14, ph - 8, { align: 'right' });
  }
};

export const addReportInfoBox = (doc: jsPDF, infoMap: { label: string, value: string }[], startY: number) => {
  const pw = doc.internal.pageSize.width;
  
  doc.setFillColor(...C.summaryBg);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, startY, pw - 28, 16, 2, 2, 'FD');
  
  let currentX = 18;
  const itemWidth = (pw - 40) / infoMap.length;
  
  infoMap.forEach((info) => {
    doc.setFontSize(7);
    doc.setTextColor(...C.textMuted);
    doc.setFont('helvetica', 'normal');
    doc.text(info.label, currentX, startY + 6);
    
    doc.setFontSize(9);
    doc.setTextColor(...C.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text(info.value, currentX, startY + 11);
    
    currentX += itemWidth;
  });
  
  return startY + 22;
};

export const tableStyles = {
  theme: 'grid' as const,
  headStyles: { 
    fillColor: C.tableHead,
    textColor: C.textDark,
    fontStyle: 'bold' as const,
    lineWidth: 0.1,
    lineColor: C.border,
    halign: 'left' as const,
  },
  bodyStyles: {
    textColor: C.textDark,
    lineWidth: 0.1,
    lineColor: C.border,
  },
  alternateRowStyles: { 
    fillColor: [253, 254, 255] as [number, number, number] 
  },
  styles: { 
    font: 'helvetica', 
    fontSize: 8, 
    cellPadding: { top: 4, right: 4, bottom: 4, left: 4 } 
  }
};

// PDF Raporlama Fonksiyonları
export const generateSalesPDF = (data: any[], startDate: string, endDate: string, employeeName: string) => {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  
  addPDFHeader(doc, 'Satis Raporu', `Donem: ${startDate} - ${endDate}`);
  
  // Hesaplamalar
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  const iadeTotal = data.filter(i => i.amount < 0).reduce((s, i) => s + Math.abs(i.amount), 0);
  const netTotal = total;
  const avgPerItem = data.length > 0 ? total / data.length : 0;
  const uniqueCustomers = new Set(data.map(d => d.customer)).size;
  const uniqueProducts = new Set(data.map(d => d.product?.replace(/\(.*?\)\s*/, ''))).size;
  
  // Kategori dağılımı
  const categoryMap: Record<string, { amount: number; count: number }> = {};
  data.forEach(item => {
    const cat = item.category || 'Diger';
    if (!categoryMap[cat]) categoryMap[cat] = { amount: 0, count: 0 };
    categoryMap[cat].amount += item.amount;
    categoryMap[cat].count += 1;
  });
  const categories = Object.entries(categoryMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount);
  
  // Müşteri dağılımı  
  const custMap: Record<string, number> = {};
  data.forEach(item => { custMap[item.customer] = (custMap[item.customer] || 0) + item.amount; });
  const topCustomers = Object.entries(custMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  
  // Info box
  const nextY = addReportInfoBox(doc, [
    { label: 'Donem:', value: `${startDate} - ${endDate}` },
    { label: 'Hazirlayan:', value: sanitizeStr(employeeName) },
    { label: 'Toplam Islem:', value: `${data.length} kalem` },
    { label: 'Toplam Ciro:', value: `${total.toLocaleString('tr-TR')} TL` }
  ], 38);
  
  // Executive Summary
  const summaryLines = [
    `Secilen donemde toplam ${data.length} kalem satis islemi gerceklesti. Toplam ciro: ${total.toLocaleString('tr-TR')} TL.`,
    `${uniqueCustomers} farkli musteriye ${uniqueProducts} cesit urun satildi. Ortalama islem tutari: ${avgPerItem.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL.`,
    iadeTotal > 0 ? `Toplam ${iadeTotal.toLocaleString('tr-TR')} TL tutarinda iade islemi bulunmaktadir.` : 'Donem icerisinde iade islemi kaydedilmemistir.',
  ];
  let currentY = drawExecutiveSummary(doc, nextY, summaryLines);
  
  // KPI Cards (4 kutu)
  const kpiBoxW = (pw - 38) / 4;
  const kpiBoxH = 18;
  const kpiItems = [
    { label: 'Toplam Ciro', value: `${total.toLocaleString('tr-TR')} TL`, color: C.accentBlue },
    { label: 'Islem Adedi', value: `${data.length}`, color: C.accentGreen },
    { label: 'Musteri Sayisi', value: `${uniqueCustomers}`, color: C.accentPurple },
    { label: 'Ort. Islem', value: `${avgPerItem.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`, color: C.accentOrange },
  ];
  kpiItems.forEach((item, idx) => {
    const bx = 14 + idx * (kpiBoxW + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.roundedRect(bx, currentY, kpiBoxW, kpiBoxH, 2, 2, 'FD');
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.roundedRect(bx, currentY + 3, 2, kpiBoxH - 6, 1, 1, 'F');
    doc.setFontSize(6);
    doc.setTextColor(...C.textMuted);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, bx + 5, currentY + 7);
    doc.setFontSize(9);
    doc.setTextColor(...C.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, bx + 5, currentY + 14);
  });
  currentY += kpiBoxH + 8;
  
  // Kategori ve Müşteri Grafikleri (yan yana)
  if (categories.length > 0 || topCustomers.length > 0) {
    const halfW = (pw - 34) / 2;
    if (categories.length > 0) {
      const catColors: [number,number,number][] = [C.accentBlue, C.accentGreen, C.accentOrange, C.accentPurple, C.accentRed];
      const catItems = categories.slice(0, 5).map((c, i) => ({ label: c.name, value: c.amount, color: catColors[i % catColors.length] }));
      drawHorizontalBarChart(doc, 14, currentY, halfW, catItems, 'KATEGORI DAGILIMI');
    }
    if (topCustomers.length > 0) {
      const custColors: [number,number,number][] = [C.accentOrange, [234, 88, 12], [249, 115, 22], [245, 158, 11], [217, 119, 6]];
      const custItems = topCustomers.map((c, i) => ({ label: c.name, value: c.value, color: custColors[i % custColors.length] }));
      drawHorizontalBarChart(doc, 14 + halfW + 6, currentY, halfW, custItems, 'EN IYI 5 MUSTERI');
    }
    const maxItems = Math.max(categories.slice(0, 5).length, topCustomers.length);
    currentY += 10 + maxItems * 10 + 6;
  }
  
  // Ana tablo başlığı
  if (currentY > ph - 60) { doc.addPage(); currentY = 20; }
  doc.setFontSize(10);
  doc.setTextColor(...C.accentBlue);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAYLI SATIS LISTESI', 14, currentY);
  currentY += 4;
  
  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Tarih', 'Musteri', 'Urun', 'Kategori', 'Miktar', 'Tutar (TL)']],
    body: data.map((item, idx) => [
      `${idx + 1}`,
      item.date,
      sanitizeStr(item.customer),
      sanitizeStr(item.product),
      sanitizeStr(item.category || '-'),
      `${item.quantity} ${sanitizeStr(item.unit || '')}`,
      `${item.amount.toLocaleString('tr-TR')}`
    ]),
    ...tableStyles,
    columnStyles: { 
      0: { cellWidth: 10, halign: 'center' },
      6: { halign: 'right', fontStyle: 'bold' } 
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = parseFloat(data.cell.raw.toString().replace(/\./g, '').replace(',', '.'));
        if (val < 0) data.cell.styles.textColor = [234, 88, 12];
      }
    }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || currentY;
  
  // Gelişmiş toplam kutusu
  if (finalY > ph - 40) { doc.addPage(); }
  const boxY = finalY + 8;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(pw - 100, boxY, 86, iadeTotal > 0 ? 30 : 16, 2, 2, 'FD');
  
  if (iadeTotal > 0) {
    doc.setFontSize(8);
    doc.setTextColor(...C.textMuted);
    doc.setFont('helvetica', 'normal');
    doc.text('Brut Satis:', pw - 96, boxY + 8);
    doc.setTextColor(...C.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text(`${(total + iadeTotal).toLocaleString('tr-TR')} TL`, pw - 18, boxY + 8, { align: 'right' });
    
    doc.setTextColor(...C.accentOrange);
    doc.setFont('helvetica', 'normal');
    doc.text('Iade Toplam:', pw - 96, boxY + 15);
    doc.setFont('helvetica', 'bold');
    doc.text(`-${iadeTotal.toLocaleString('tr-TR')} TL`, pw - 18, boxY + 15, { align: 'right' });
    
    doc.setDrawColor(203, 213, 225);
    doc.line(pw - 96, boxY + 18, pw - 18, boxY + 18);
    
    doc.setFontSize(10);
    doc.setTextColor(...C.accentBlue);
    doc.setFont('helvetica', 'bold');
    doc.text('NET TOPLAM:', pw - 96, boxY + 25);
    doc.text(`${netTotal.toLocaleString('tr-TR')} TL`, pw - 18, boxY + 25, { align: 'right' });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(...C.textMuted);
    doc.setFont('helvetica', 'normal');
    doc.text('Genel Toplam:', pw - 96, boxY + 10.5);
    doc.setFontSize(12);
    doc.setTextColor(...C.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text(`${total.toLocaleString('tr-TR')} TL`, pw - 18, boxY + 10.5, { align: 'right' });
  }
  
  addPDFFooter(doc);
  doc.save(`satis-raporu-${new Date().getTime()}.pdf`);
};

export const generatePurchasePDF = (data: any[], startDate: string, endDate: string, employeeName: string) => {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.width;
  
  addPDFHeader(doc, 'Alis Raporu', `Donem: ${startDate} - ${endDate}`);
  
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  const iadeTotal = data.filter(item => item.amount < 0).reduce((sum, item) => sum + item.amount, 0);
  const uniqueSuppliers = new Set(data.map(d => d.supplier || d.customer)).size;
  
  const nextY = addReportInfoBox(doc, [
    { label: 'Donem:', value: `${startDate} - ${endDate}` },
    { label: 'Hazirlayan:', value: sanitizeStr(employeeName) },
    { label: 'Toplam Islem:', value: `${data.length} kalem` },
    { label: 'Tedarikci:', value: `${uniqueSuppliers}` },
  ], 38);
  
  let currentY = drawExecutiveSummary(doc, nextY, [
    `Secilen donemde ${uniqueSuppliers} tedarikci ile toplam ${data.length} alis islemi yapildi.`,
    `Toplam alis tutari: ${total.toLocaleString('tr-TR')} TL.${iadeTotal !== 0 ? ` Iade toplam: ${Math.abs(iadeTotal).toLocaleString('tr-TR')} TL.` : ''}`,
  ]);
  
  
  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Tarih', 'Tedarikci', 'Urun', 'Kategori', 'Miktar', 'Tutar (TL)']],
    body: data.map((item, idx) => [
      `${idx + 1}`,
      item.date,
      sanitizeStr(item.supplier || item.customer || '-'),
      sanitizeStr(item.product),
      sanitizeStr(item.category || '-'),
      `${item.quantity} ${sanitizeStr(item.unit || '')}`,
      `${item.amount.toLocaleString('tr-TR')}`
    ]),
    ...tableStyles,
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 6: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = parseFloat(data.cell.raw.toString().replace(/\./g, '').replace(',', '.'));
        if (val < 0) {
          data.cell.styles.textColor = [249, 115, 22];
        }
      }
    }
  });
  
  const alisTotal = data.filter(item => item.amount >= 0).reduce((sum, item) => sum + item.amount, 0);
  const finalY = (doc as any).lastAutoTable.finalY || currentY;
  
  // Summary Box
  const pageWidth = doc.internal.pageSize.width;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(pageWidth - 100, finalY + 8, 86, 30, 2, 2, 'FD');
  
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Toplam Alis:', pageWidth - 96, finalY + 16);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`${alisTotal.toLocaleString('tr-TR')} TL`, pageWidth - 18, finalY + 16, { align: 'right' });
  
  if (iadeTotal !== 0) {
    doc.setFontSize(9);
    doc.setTextColor(249, 115, 22);
    doc.setFont('helvetica', 'normal');
    doc.text('Iade Toplam:', pageWidth - 96, finalY + 22);
    doc.setFont('helvetica', 'bold');
    doc.text(`${Math.abs(iadeTotal).toLocaleString('tr-TR')} TL`, pageWidth - 18, finalY + 22, { align: 'right' });
  }
  
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text('Net Toplam:', pageWidth - 96, finalY + 32);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${total.toLocaleString('tr-TR')} TL`, pageWidth - 18, finalY + 32, { align: 'right' });
  
  addPDFFooter(doc);
  doc.save(`alis-raporu-${new Date().getTime()}.pdf`);
};

export const generateFinancialPDF = (
  incomeData: any[],
  expenseData: any[],
  startDate: string,
  endDate: string,
  employeeName: string
) => {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  
  addPDFHeader(doc, 'Finansal Analiz Raporu', `Donem: ${startDate} - ${endDate}`);
  
  const incomeTotal = incomeData.reduce((sum, item) => sum + item.amount, 0);
  const expenseTotal = expenseData.reduce((sum, item) => sum + item.amount, 0);
  const netProfit = incomeTotal - expenseTotal;
  const isProfit = netProfit >= 0;
  const profitMargin = incomeTotal > 0 ? ((netProfit / incomeTotal) * 100) : 0;
  
  // Gelir kategori dağılımı
  const incCatMap: Record<string, number> = {};
  incomeData.forEach(i => { incCatMap[i.category || 'Diger'] = (incCatMap[i.category || 'Diger'] || 0) + i.amount; });
  const incCategories = Object.entries(incCatMap).sort((a, b) => b[1] - a[1]);
  
  // Gider kategori dağılımı
  const expCatMap: Record<string, number> = {};
  expenseData.forEach(i => { expCatMap[i.category || 'Diger'] = (expCatMap[i.category || 'Diger'] || 0) + i.amount; });
  const expCategories = Object.entries(expCatMap).sort((a, b) => b[1] - a[1]);
  
  const nextY = addReportInfoBox(doc, [
    { label: 'Donem:', value: `${startDate} - ${endDate}` },
    { label: 'Hazirlayan:', value: sanitizeStr(employeeName) },
    { label: 'Gelir Islem:', value: `${incomeData.length}` },
    { label: 'Gider Islem:', value: `${expenseData.length}` },
  ], 38);
  
  // Executive Summary
  let currentY = drawExecutiveSummary(doc, nextY, [
    `Donemde toplam ${incomeTotal.toLocaleString('tr-TR')} TL gelir, ${expenseTotal.toLocaleString('tr-TR')} TL gider kaydedildi.`,
    `Net ${isProfit ? 'kar' : 'zarar'}: ${Math.abs(netProfit).toLocaleString('tr-TR')} TL. Kar marji: %${profitMargin.toFixed(1)}.`,
    `En buyuk gelir kalemi: ${incCategories[0] ? `${sanitizeStr(incCategories[0][0])} (${incCategories[0][1].toLocaleString('tr-TR')} TL)` : '-'}`,
  ]);
  
  // KPI kutuları (5'li)
  const boxW = (pw - 38) / 5;
  const boxH = 20;
  const finKPIs = [
    { label: 'Toplam Gelir', value: `${incomeTotal.toLocaleString('tr-TR')} TL`, color: C.accentGreen },
    { label: 'Toplam Gider', value: `${expenseTotal.toLocaleString('tr-TR')} TL`, color: C.accentRed },
    { label: isProfit ? 'Net Kar' : 'Net Zarar', value: `${Math.abs(netProfit).toLocaleString('tr-TR')} TL`, color: isProfit ? C.accentBlue : C.accentOrange },
    { label: 'Kar Marji', value: `%${profitMargin.toFixed(1)}`, color: C.accentPurple },
    { label: 'Toplam Islem', value: `${incomeData.length + expenseData.length}`, color: [100, 116, 139] as [number,number,number] },
  ];
  finKPIs.forEach((item, idx) => {
    const bx = 14 + idx * (boxW + 2);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.roundedRect(bx, currentY, boxW, boxH, 2, 2, 'FD');
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.roundedRect(bx, currentY + 3, 2, boxH - 6, 1, 1, 'F');
    doc.setFontSize(6);
    doc.setTextColor(...C.textMuted);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, bx + 5, currentY + 8);
    doc.setFontSize(9);
    doc.setTextColor(...C.textDark);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, bx + 5, currentY + 16);
  });
  currentY += boxH + 8;
  
  // Kategori dağılım grafikleri
  if (incCategories.length > 0 || expCategories.length > 0) {
    const halfW = (pw - 34) / 2;
    if (incCategories.length > 0) {
      const items = incCategories.slice(0, 4).map(([name, val]) => ({ label: name, value: val, color: C.accentGreen }));
      drawHorizontalBarChart(doc, 14, currentY, halfW, items, 'GELIR KATEGORILERI');
    }
    if (expCategories.length > 0) {
      const items = expCategories.slice(0, 4).map(([name, val]) => ({ label: name, value: val, color: C.accentRed }));
      drawHorizontalBarChart(doc, 14 + halfW + 6, currentY, halfW, items, 'GIDER KATEGORILERI');
    }
    const maxItems = Math.max(incCategories.slice(0, 4).length, expCategories.slice(0, 4).length);
    currentY += 10 + maxItems * 10 + 6;
  }
  
  // Gelirler Tablosu
  if (currentY > ph - 60) { doc.addPage(); currentY = 20; }
  doc.setFontSize(10);
  doc.setTextColor(...C.accentGreen);
  doc.setFont('helvetica', 'bold');
  doc.text('1. GELIRLER TABLOSU', 14, currentY);
  
  autoTable(doc, {
    startY: currentY + 4,
    head: [['#', 'Tarih', 'Aciklama', 'Kategori', 'Tutar (TL)']],
    body: incomeData.map((item, idx) => [
      `${idx + 1}`,
      item.date,
      sanitizeStr(item.description),
      sanitizeStr(item.category),
      `${item.amount.toLocaleString('tr-TR')}`
    ]),
    ...tableStyles,
    headStyles: { ...tableStyles.headStyles, textColor: [22, 163, 74] },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 4: { halign: 'right', fontStyle: 'bold' } }
  });
  
  let finalY = (doc as any).lastAutoTable.finalY || currentY + 4;
  doc.setFontSize(9);
  doc.setTextColor(...C.accentGreen);
  doc.setFont('helvetica', 'bold');
  doc.text(`Toplam Gelir: ${incomeTotal.toLocaleString('tr-TR')} TL`, pw - 14, finalY + 6, { align: 'right' });
  
  // Giderler Tablosu
  finalY += 16;
  if (finalY > ph - 60) { doc.addPage(); finalY = 20; }
  doc.setFontSize(10);
  doc.setTextColor(...C.accentRed);
  doc.setFont('helvetica', 'bold');
  doc.text('2. GIDERLER TABLOSU', 14, finalY);
  
  autoTable(doc, {
    startY: finalY + 4,
    head: [['#', 'Tarih', 'Aciklama', 'Kategori', 'Tutar (TL)']],
    body: expenseData.map((item, idx) => [
      `${idx + 1}`,
      item.date,
      sanitizeStr(item.description),
      sanitizeStr(item.category),
      `${item.amount.toLocaleString('tr-TR')}`
    ]),
    ...tableStyles,
    headStyles: { ...tableStyles.headStyles, textColor: [220, 38, 38] },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 4: { halign: 'right', fontStyle: 'bold' } }
  });
  
  finalY = (doc as any).lastAutoTable.finalY || finalY + 4;
  doc.setFontSize(9);
  doc.setTextColor(...C.accentRed);
  doc.setFont('helvetica', 'bold');
  doc.text(`Toplam Gider: ${expenseTotal.toLocaleString('tr-TR')} TL`, pw - 14, finalY + 6, { align: 'right' });
  
  // Net Kar/Zarar - Gelişmiş kutu
  finalY += 16;
  if (finalY > ph - 40) { doc.addPage(); finalY = 20; }
  
  const resultBoxH = 22;
  doc.setFillColor(isProfit ? 240 : 254, isProfit ? 253 : 242, isProfit ? 244 : 242);
  doc.setDrawColor(isProfit ? 22 : 220, isProfit ? 163 : 38, isProfit ? 74 : 38);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, finalY, pw - 28, resultBoxH, 3, 3, 'FD');
  
  doc.setFillColor(isProfit ? 22 : 220, isProfit ? 163 : 38, isProfit ? 74 : 38);
  doc.roundedRect(14, finalY + 4, 3, resultBoxH - 8, 1, 1, 'F');
  
  doc.setFontSize(8);
  doc.setTextColor(...C.textMuted);
  doc.setFont('helvetica', 'normal');
  doc.text('DONEM SONUCU', 22, finalY + 8);
  
  doc.setFontSize(14);
  doc.setTextColor(isProfit ? 22 : 220, isProfit ? 163 : 38, isProfit ? 74 : 38);
  doc.setFont('helvetica', 'bold');
  doc.text(`${isProfit ? 'NET KAR' : 'NET ZARAR'}: ${Math.abs(netProfit).toLocaleString('tr-TR')} TL`, 22, finalY + 17);
  
  doc.setFontSize(8);
  doc.setTextColor(...C.textMuted);
  doc.setFont('helvetica', 'normal');
  doc.text(`Kar Marji: %${profitMargin.toFixed(1)} | Gelir: ${incomeTotal.toLocaleString('tr-TR')} TL | Gider: ${expenseTotal.toLocaleString('tr-TR')} TL`, pw - 18, finalY + 17, { align: 'right' });
  
  addPDFFooter(doc);
  doc.save(`finansal-rapor-${new Date().getTime()}.pdf`);
};

export const generateStockPDF = (products: any[], employeeName: string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  addPDFHeader(doc, 'Stok Durum Raporu', `Tarih: ${new Date().toLocaleDateString('tr-TR')}`);

  // Toplam istatistikler (hesaplamalar)
  const totalProducts = products.length;
  const criticalCount = products.filter(p => p.stock <= p.minStock).length;
  const totalStockValue = products.reduce((sum, p) => {
    const purchases = (p.movements || []).filter((m: any) => m.type === 'ALIS');
    const totalQty = purchases.reduce((s: number, m: any) => s + (m.quantity || 0), 0);
    const totalCost = purchases.reduce((s: number, m: any) => s + (m.totalAmount || 0), 0);
    const avgCost = totalQty > 0 ? totalCost / totalQty : (p.price || 0);
    return sum + (Math.max(p.stock, 0) * avgCost);
  }, 0);
  const totalPurchaseMovements = products.reduce((sum, p) => sum + ((p.movements || []).filter((m: any) => m.type === 'ALIS').length), 0);
  
  const nextY = addReportInfoBox(doc, [
    { label: 'Hazirlayan:', value: sanitizeStr(employeeName) },
    { label: 'Urun Cesidi:', value: String(totalProducts) },
    { label: 'Kritik:', value: String(criticalCount) },
    { label: 'Stok Degeri:', value: `${totalStockValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL` }
  ], 38);

  // Executive Summary
  const negativeCount = products.filter(p => p.stock < 0).length;
  const yeterliCount = totalProducts - criticalCount;
  const stockCategoryMap: Record<string, number> = {};
  products.forEach(p => { stockCategoryMap[p.category || 'Diger'] = (stockCategoryMap[p.category || 'Diger'] || 0) + 1; });
  const stockCategoryCount = Object.keys(stockCategoryMap).length;
  
  let currentStockY = drawExecutiveSummary(doc, nextY, [
    `Depoda toplam ${totalProducts} cesit urun takip edilmektedir. Toplam stok degeri: ${totalStockValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL.`,
    `${criticalCount} urun kritik seviyede${negativeCount > 0 ? `, ${negativeCount} urun acikta (negatif stok)` : ''}. ${yeterliCount} urun yeterli seviyede.`,
    `Urunler ${stockCategoryCount} kategoriye dagilmis olup toplam ${totalPurchaseMovements} alis hareketi kaydedilmistir.`,
  ]);
  
  // Kategori bazlı stok dağılımı grafik
  const catStockMap: Record<string, { count: number; value: number }> = {};
  products.forEach(p => {
    const cat = p.category || 'Diger';
    if (!catStockMap[cat]) catStockMap[cat] = { count: 0, value: 0 };
    catStockMap[cat].count += 1;
    const purch2 = (p.movements || []).filter((m: any) => m.type === 'ALIS');
    const tQty2 = purch2.reduce((s: number, m: any) => s + (m.quantity || 0), 0);
    const tCost2 = purch2.reduce((s: number, m: any) => s + (m.totalAmount || 0), 0);
    const aCost2 = tQty2 > 0 ? tCost2 / tQty2 : (p.price || 0);
    catStockMap[cat].value += Math.max(p.stock, 0) * aCost2;
  });
  const catStockItems = Object.entries(catStockMap).sort((a, b) => b[1].value - a[1].value).slice(0, 5);
  
  if (catStockItems.length > 1) {
    const catBarColors: [number,number,number][] = [[37,99,235],[22,163,74],[147,51,234],[234,88,12],[220,38,38]];
    const barItems = catStockItems.map(([name, v], i) => ({ label: `${name} (${v.count})`, value: v.value, color: catBarColors[i % catBarColors.length] }));
    currentStockY = drawHorizontalBarChart(doc, 14, currentStockY, pageWidth - 28, barItems, 'KATEGORI BAZLI STOK DEGERI');
    currentStockY += 4;
  }

  // ─── 1. GENEL STOK DURUMU TABLOSU ─────────────────────────────────────────
  if (currentStockY > pageHeight - 60) { doc.addPage(); currentStockY = 20; }
  doc.setFontSize(11);
  doc.setTextColor(37, 99, 235);
  doc.setFont('helvetica', 'bold');
  doc.text('1. GENEL STOK DURUMU', 14, currentStockY + 4);

  autoTable(doc, {
    startY: currentStockY + 8,
    head: [['Urun Adi', 'Kategori', 'Mevcut Stok', 'Kritik Seviye', 'Birim', 'Ort. Maliyet', 'Stok Degeri', 'Durum']],
    body: products.map(item => {
      const isCritical = item.stock <= item.minStock;
      const isNegative = item.stock < 0;
      const purchases = (item.movements || []).filter((m: any) => m.type === 'ALIS');
      const totalQty = purchases.reduce((s: number, m: any) => s + (m.quantity || 0), 0);
      const totalCost = purchases.reduce((s: number, m: any) => s + (m.totalAmount || 0), 0);
      const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      const stockValue = Math.max(item.stock, 0) * (avgCost || item.price || 0);
      return [
        sanitizeStr(item.name),
        sanitizeStr(item.category),
        `${item.stock}`,
        `${item.minStock}`,
        sanitizeStr(item.unit),
        avgCost > 0 ? `${avgCost.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL` : '-',
        `${stockValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
        isNegative ? 'ACIKTA!' : isCritical ? 'KRITIK' : 'YETERLI'
      ];
    }),
    ...tableStyles,
    styles: { ...tableStyles.styles, fontSize: 8 },
    headStyles: { ...tableStyles.headStyles, textColor: [37, 99, 235], fontSize: 7 },
    columnStyles: { 
      2: { halign: 'center' }, 
      3: { halign: 'center' }, 
      5: { halign: 'right' }, 
      6: { halign: 'right', fontStyle: 'bold' }, 
      7: { fontStyle: 'bold', halign: 'center' } 
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 7) {
        if (data.cell.raw === 'ACIKTA!') {
          data.cell.styles.textColor = [153, 27, 27]; // red-800
          data.cell.styles.fillColor = [254, 226, 226]; // red-100
        } else if (data.cell.raw === 'KRITIK') {
          data.cell.styles.textColor = [220, 38, 38];
        } else {
          data.cell.styles.textColor = [22, 163, 74];
        }
      }
    }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 12;

  // ─── 2. TOPTANCI BAZLI DETAYLI ALIS RAPORU ────────────────────────────────
  // Tüm ürünlerdeki ALIS hareketlerini toptancı bazında grupla
  const supplierMap: Record<string, { 
    supplier: string; 
    items: { product: string; date: string; quantity: number; unit: string; price: number; total: number }[] 
  }> = {};

  products.forEach((product: any) => {
    const movements = product.movements || [];
    movements
      .filter((m: any) => m.type === 'ALIS')
      .forEach((m: any) => {
        const supplierName = m.partyName || m.supplierName || 'Bilinmeyen Toptanci';
        if (!supplierMap[supplierName]) {
          supplierMap[supplierName] = { supplier: supplierName, items: [] };
        }
        supplierMap[supplierName].items.push({
          product: product.name || '-',
          date: m.date ? new Date(m.date).toLocaleDateString('tr-TR') : '-',
          quantity: m.quantity || 0,
          unit: product.unit || 'KG',
          price: m.price || 0,
          total: m.totalAmount || (m.quantity || 0) * (m.price || 0),
        });
      });
  });

  const suppliers = Object.values(supplierMap).sort((a, b) => {
    const totalA = a.items.reduce((s, i) => s + i.total, 0);
    const totalB = b.items.reduce((s, i) => s + i.total, 0);
    return totalB - totalA;
  });

  if (suppliers.length > 0) {
    // Check page space
    if (currentY > pageHeight - 60) { doc.addPage(); currentY = 20; }

    doc.setFontSize(11);
    doc.setTextColor(147, 51, 234); // purple-600
    doc.setFont('helvetica', 'bold');
    doc.text('2. TOPTANCI BAZLI ALIS DETAYLARI', 14, currentY);
    currentY += 4;

    // Toptancı özet tablosu
    const supplierSummary = suppliers.map(s => {
      const totalQty = s.items.reduce((sum, i) => sum + i.quantity, 0);
      const totalAmount = s.items.reduce((sum, i) => sum + i.total, 0);
      const uniqueProducts = [...new Set(s.items.map(i => i.product))];
      return [
        sanitizeStr(s.supplier),
        String(s.items.length),
        String(uniqueProducts.length),
        `${totalQty.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Toptanci / Tedarikci', 'Alis Sayisi', 'Urun Cesidi', 'Toplam Miktar', 'Toplam Tutar']],
      body: supplierSummary,
      ...tableStyles,
      styles: { ...tableStyles.styles, fontSize: 9 },
      headStyles: { ...tableStyles.headStyles, textColor: [147, 51, 234] },
      columnStyles: { 
        1: { halign: 'center' }, 
        2: { halign: 'center' }, 
        3: { halign: 'right' }, 
        4: { halign: 'right', fontStyle: 'bold' } 
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;

    // Grand total
    const grandTotal = suppliers.reduce((s, sup) => s + sup.items.reduce((ss, i) => ss + i.total, 0), 0);
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(pageWidth - 84, currentY, 70, 12, 2, 2, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Toplam Alis:', pageWidth - 80, currentY + 8);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`${grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`, pageWidth - 18, currentY + 8, { align: 'right' });

    currentY += 20;

    // ─── 3. HER TOPTANCININ DETAYLI ALIS LİSTESİ ───────────────────────────
    if (currentY > pageHeight - 60) { doc.addPage(); currentY = 20; }

    doc.setFontSize(11);
    doc.setTextColor(234, 88, 12); // orange-600
    doc.setFont('helvetica', 'bold');
    doc.text('3. TOPTANCI DETAY - URUN BAZLI ALISLAR', 14, currentY);
    currentY += 6;

    suppliers.forEach((supplier, sIdx) => {
      // Check page space for each supplier section
      if (currentY > pageHeight - 50) { doc.addPage(); currentY = 20; }

      const supplierTotal = supplier.items.reduce((s, i) => s + i.total, 0);
      const supplierQty = supplier.items.reduce((s, i) => s + i.quantity, 0);

      // Supplier header
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(14, currentY, pageWidth - 28, 10, 2, 2, 'FD');
      
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(`${sanitizeStr(supplier.supplier)}`, 18, currentY + 7);
      
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `${supplier.items.length} alis | ${supplierQty.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} birim | ${supplierTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`,
        pageWidth - 18, currentY + 7, { align: 'right' }
      );

      currentY += 13;

      // Item details table
      autoTable(doc, {
        startY: currentY,
        head: [['Tarih', 'Urun Adi', 'Miktar', 'Birim', 'Birim Fiyat', 'Toplam Tutar']],
        body: supplier.items
          .sort((a, b) => {
            const dateA = new Date(a.date.split('.').reverse().join('-')).getTime();
            const dateB = new Date(b.date.split('.').reverse().join('-')).getTime();
            return dateB - dateA;
          })
          .map(item => [
            item.date,
            sanitizeStr(item.product),
            `${item.quantity.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            sanitizeStr(item.unit),
            `${item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`,
            `${item.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
          ]),
        ...tableStyles,
        styles: { ...tableStyles.styles, fontSize: 8, cellPadding: { top: 3, right: 3, bottom: 3, left: 3 } },
        headStyles: { ...tableStyles.headStyles, fontSize: 7 },
        columnStyles: { 
          0: { cellWidth: 22 },
          2: { halign: 'right' }, 
          3: { halign: 'center', cellWidth: 16 }, 
          4: { halign: 'right' }, 
          5: { halign: 'right', fontStyle: 'bold' } 
        },
        margin: { left: 14, right: 14 },
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;
    });
  } else {
    // No supplier data
    if (currentY > pageHeight - 40) { doc.addPage(); currentY = 20; }
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.text('2. TOPTANCI BAZLI ALIS DETAYLARI', 14, currentY);
    currentY += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Henuz toptancidan alis hareketi kaydedilmemistir.', 14, currentY);
  }
  
  addPDFFooter(doc);
  doc.save(`stok-raporu-${new Date().getTime()}.pdf`);
};

export const generateCariPDF = (cariList: any[], employeeName: string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  addPDFHeader(doc, 'Cari Hesaplar Raporu', `Tarih: ${new Date().toLocaleDateString('tr-TR')}`);
  
  // Toplam istatistikler
  const totalBorclu = cariList.filter(c => (c.balance || 0) > 0).length;
  const totalAlacakli = cariList.filter(c => (c.balance || 0) < 0).length;
  const totalBorcTutar = cariList.reduce((s, c) => s + Math.max(c.balance || 0, 0), 0);
  const totalAlacakTutar = cariList.reduce((s, c) => s + Math.abs(Math.min(c.balance || 0, 0)), 0);
  const netBakiye = totalBorcTutar - totalAlacakTutar;
  const musteriCount = cariList.filter(c => c.type === 'musteri').length;
  const tedarikciCount = cariList.filter(c => c.type === 'tedarikci').length;
  
  const nextY = addReportInfoBox(doc, [
    { label: 'Hazirlayan:', value: sanitizeStr(employeeName) },
    { label: 'Toplam Cari:', value: String(cariList.length) },
    { label: 'Borclu:', value: `${totalBorclu} kisi` },
    { label: 'Alacakli:', value: `${totalAlacakli} kisi` },
  ], 38);
  
  // Executive Summary
  const cariSummaryY = drawExecutiveSummary(doc, nextY, [
    `Sistemde toplam ${cariList.length} cari hesap kayitli (${musteriCount} musteri, ${tedarikciCount} tedarikci).`,
    `Toplam alacak: ${totalBorcTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL | Toplam borc: ${totalAlacakTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL.`,
    `Net bakiye: ${Math.abs(netBakiye).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL ${netBakiye >= 0 ? '(alacak lehine)' : '(borc lehine)'}.`,
  ]);
  
  // En borçlu 5 cari grafik
  const topBorcluCari = cariList.filter(c => (c.balance || 0) > 0).sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 5);
  let chartEndY = cariSummaryY;
  if (topBorcluCari.length > 0) {
    const borcBarItems = topBorcluCari.map(c => ({ label: c.companyName || '-', value: c.balance || 0, color: [220, 38, 38] as [number, number, number] }));
    chartEndY = drawHorizontalBarChart(doc, 14, cariSummaryY, pageWidth - 28, borcBarItems, 'EN YUKSEK BORCLU CARILER (TOP 5)');
    chartEndY += 4;
  }
  
  // Ozet kutulari
  const boxW = (pageWidth - 38) / 4;
  const boxH = 18;
  let bx = 14;
  const by = chartEndY + 2;
  const summaryCards = [
    { label: 'Toplam Cari', value: `${cariList.length}`, color: [37, 99, 235] },
    { label: 'Toplam Borc', value: `${totalBorcTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, color: [220, 38, 38] },
    { label: 'Toplam Alacak', value: `${totalAlacakTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, color: [22, 163, 74] },
    { label: 'Net Bakiye', value: `${(totalBorcTutar - totalAlacakTutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, color: totalBorcTutar >= totalAlacakTutar ? [220, 38, 38] : [22, 163, 74] },
  ];
  summaryCards.forEach((item) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.roundedRect(bx, by, boxW, boxH, 2, 2, 'FD');
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.roundedRect(bx, by + 3, 2, boxH - 6, 1, 1, 'F');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, bx + 5, by + 7);
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, bx + 5, by + 14);
    bx += boxW + 3;
  });
  
  let currentY = by + boxH + 8;
  
  // Ana tablo
  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Tur', 'Firma/Kisi', 'Yetkili', 'Telefon', 'Bakiye (TL)', 'Durum']],
    body: cariList
      .sort((a, b) => Math.abs(b.balance || 0) - Math.abs(a.balance || 0))
      .map((item, idx) => {
        const bal = item.balance || 0;
        const durum = bal > 0 ? 'Borclu' : bal < 0 ? 'Alacakli' : 'Dengede';
        return [
          `${idx + 1}`,
          sanitizeStr(item.type === 'musteri' ? 'Musteri' : item.type === 'tedarikci' ? 'Tedarikci' : item.type || '-'),
          sanitizeStr(item.companyName),
          sanitizeStr(item.contactPerson),
          sanitizeStr(item.phone),
          `${bal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
          durum,
        ];
      }),
    ...tableStyles,
    headStyles: { ...tableStyles.headStyles, textColor: [15, 23, 42] as [number, number, number] },
    columnStyles: { 
      0: { cellWidth: 10, halign: 'center' as const },
      1: { cellWidth: 20, halign: 'center' as const },
      5: { halign: 'right' as const, fontStyle: 'bold' as const, cellWidth: 28 }, 
      6: { halign: 'center' as const, fontStyle: 'bold' as const, cellWidth: 20 } 
    },
    didParseCell: (data: any) => {
      if (data.section === 'body') {
        if (data.column.index === 5) {
          const val = parseFloat(data.cell.raw.toString().replace(/\./g, '').replace(',', '.'));
          if (val > 0) data.cell.styles.textColor = [220, 38, 38];
          else if (val < 0) data.cell.styles.textColor = [22, 163, 74];
        }
        if (data.column.index === 6) {
          if (data.cell.raw === 'Borclu') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fillColor = [254, 242, 242];
          } else if (data.cell.raw === 'Alacakli') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fillColor = [240, 253, 244];
          }
        }
      }
    }
  });
  
  addPDFFooter(doc);
  doc.save(`cari-raporu-${new Date().getTime()}.pdf`);
};

export const generateCariDetailPDF = (cari: any, transactions: any[], startDate?: string, endDate?: string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const company = getCompanyInfoForPDF();
  
  addPDFHeader(doc, 'Cari Hesap Ekstresi', `Tarih: ${new Date().toLocaleDateString('tr-TR')}`);
  
  // ═══════════════════════════════════════════════════════════════
  // BOLUM 1: MUSTERI BILGI KARTI (Detayli)
  // ═══════════════════════════════════════════════════════════════
  const cariType = cari.type === 'musteri' ? 'Musteri' : cari.type === 'tedarikci' ? 'Tedarikci' : 'Diger';
  
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, 38, pageWidth - 28, 38, 3, 3, 'FD');
  
  // Cari type badge
  const badgeR = cariType === 'Musteri' ? 37 : cariType === 'Tedarikci' ? 147 : 100;
  const badgeG = cariType === 'Musteri' ? 99 : cariType === 'Tedarikci' ? 51 : 116;
  const badgeB = cariType === 'Musteri' ? 235 : cariType === 'Tedarikci' ? 234 : 139;
  doc.setFillColor(badgeR, badgeG, badgeB);
  doc.roundedRect(pageWidth - 45, 40, 28, 7, 2, 2, 'F');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitizeStr(cariType).toUpperCase(), pageWidth - 31, 45, { align: 'center' });
  
  // Sol sutun
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Firma Unvani:', 20, 46);
  doc.text('Yetkili Kisi:', 20, 52);
  doc.text('Telefon:', 20, 58);
  doc.text('E-posta:', 20, 64);
  doc.text('Adres:', 20, 70);
  
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(sanitizeStr(cari.companyName), 52, 46);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizeStr(cari.contactPerson || '-'), 52, 52);
  doc.text(sanitizeStr(cari.phone || '-'), 52, 58);
  doc.text(sanitizeStr(cari.email || '-'), 52, 64);
  doc.text(sanitizeStr(cari.address || '-').substring(0, 50), 52, 70);
  
  // Sag sutun
  const rightCol = 125;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Vergi No:', rightCol, 52);
  doc.text('Vergi Dairesi:', rightCol, 58);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizeStr(cari.taxNumber || '-'), rightCol + 25, 52);
  doc.text(sanitizeStr(cari.taxOffice || '-'), rightCol + 25, 58);
  
  if (startDate && endDate) {
    doc.setTextColor(100, 116, 139);
    doc.text('Rapor Donemi:', rightCol, 64);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`${startDate} - ${endDate}`, rightCol + 25, 64);
    doc.setFont('helvetica', 'normal');
  }
  
  // Guncel Bakiye
  const isPositive = (cari.balance || 0) >= 0;
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Guncel Bakiye:', rightCol, 70);
  doc.setFontSize(12);
  doc.setTextColor(isPositive ? 220 : 22, isPositive ? 38 : 163, isPositive ? 38 : 74);
  doc.setFont('helvetica', 'bold');
  const balanceStr = `${Math.abs(cari.balance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`;
  doc.text(balanceStr, rightCol + 25, 70);
  
  // ═══════════════════════════════════════════════════════════════
  // BOLUM 2: ISLEM OZET KUTULARI
  // ═══════════════════════════════════════════════════════════════
  let totalSales = 0;
  let totalPurchases = 0;
  let totalReturn = 0;
  let totalPayment = 0;
  let totalVeresiye = 0;
  let fisCount = transactions.length;
  let itemCount = 0;
  
  transactions.forEach((t: any) => {
    const isSale = t.mode === 'satis' || t.mode === 'sale';
    const isAlis = t.mode === 'alis';
    (t.items || []).forEach((item: any) => {
      itemCount++;
      const amount = Math.abs(item.totalPrice || item.total || (item.unitPrice || item.price || 0) * (item.quantity || 0));
      if (item.type === 'iade') {
        totalReturn += amount;
      } else if (isSale) {
        totalSales += amount;
      } else if (isAlis) {
        totalPurchases += amount;
      } else {
        totalSales += amount;
      }
    });
    totalPayment += t.payment?.amount || 0;
    if (!t.payment?.method || t.payment?.method === 'veresiye') {
      totalVeresiye += Math.abs(t.total || 0);
    }
  });
  
  let currentY = 82;
  
  const summaryBoxWidth = (pageWidth - 34) / 5;
  const summaryBoxH = 18;
  const summaryItems = [
    { label: 'Toplam Siparis', value: `${totalSales.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: [37, 99, 235] },
    { label: 'Iade Toplam', value: `${totalReturn.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: [234, 88, 12] },
    { label: 'Odeme Toplam', value: `${totalPayment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: [22, 163, 74] },
    { label: 'Veresiye', value: `${totalVeresiye.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, color: [220, 38, 38] },
    { label: 'Fis / Kalem', value: `${fisCount} / ${itemCount}`, color: [147, 51, 234] },
  ];
  
  summaryItems.forEach((item, idx) => {
    const bx = 14 + idx * (summaryBoxWidth + 2);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.roundedRect(bx, currentY, summaryBoxWidth, summaryBoxH, 2, 2, 'FD');
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.roundedRect(bx, currentY + 3, 2, summaryBoxH - 6, 1, 1, 'F');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, bx + 5, currentY + 7);
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, bx + 5, currentY + 14);
  });
  
  currentY += summaryBoxH + 10;
  
  // ═══════════════════════════════════════════════════════════════
  // BOLUM 3: GUN BAZLI ADISYON TABLOSU
  // ═══════════════════════════════════════════════════════════════
  doc.setFontSize(11);
  doc.setTextColor(37, 99, 235);
  doc.setFont('helvetica', 'bold');
  doc.text('GUN BAZLI ADISYON DETAYI', 14, currentY);
  currentY += 6;
  
  // Fisleri tarihe gore grupla
  const grouped: Record<string, any[]> = {};
  transactions.forEach(fis => {
    const dateKey = fis.date ? new Date(fis.date).toLocaleDateString('tr-TR') : 'Belirsiz';
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(fis);
  });
  
  const parseDate2 = (d: string) => {
    const parts = d.split('.');
    if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
    return new Date(d).getTime();
  };
  const sortedDates = Object.keys(grouped).sort((a, b) => parseDate2(a) - parseDate2(b));
  
  // Gun bazli toplamlar hesapla
  const dayTotals = sortedDates.map(dateKey => {
    const dayFisler = grouped[dateKey];
    let dayOrder = 0;
    let dayReturn2 = 0;
    let dayPayment = 0;
    dayFisler.forEach((f: any) => {
      (f.items || []).forEach((item: any) => {
        const amount = Math.abs(item.totalPrice || item.total || (item.unitPrice || item.price || 0) * (item.quantity || 0));
        if (item.type === 'iade') dayReturn2 += amount;
        else dayOrder += amount;
      });
      dayPayment += f.payment?.amount || 0;
    });
    return { dateKey, dayOrder, dayReturn: dayReturn2, dayPayment, net: dayOrder - dayReturn2 - dayPayment };
  });
  
  // Geriye dogru bakiye hesaplama
  let balanceEnd = cari.balance || 0;
  const dayBalances: { prevBalance: number; endBalance: number }[] = [];
  for (let i = dayTotals.length - 1; i >= 0; i--) {
    const endBal = balanceEnd;
    const prevBal = endBal - dayTotals[i].net;
    dayBalances[i] = { prevBalance: prevBal, endBalance: endBal };
    balanceEnd = prevBal;
  }
  
  // Her gun icin adisyon bolumu olustur
  sortedDates.forEach((dateKey, dayIdx) => {
    const dayFisler = grouped[dateKey];
    const dayBal = dayBalances[dayIdx] || { prevBalance: 0, endBalance: 0 };
    const dt = dayTotals[dayIdx];
    
    if (currentY > pageHeight - 70) {
      doc.addPage();
      currentY = 20;
    }
    
    // --- Gun Baslik Bandi ---
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, currentY, pageWidth - 28, 12, 2, 2, 'FD');
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(14, currentY, 4, 12, 2, 0, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`${sanitizeStr(dateKey)}`, 22, currentY + 8);
    
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(`${dayFisler.length} fis`, 60, currentY + 5);
    
    if (dt.dayOrder > 0) {
      doc.setTextColor(37, 99, 235);
      doc.text(`Siparis: ${dt.dayOrder.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, 80, currentY + 5);
    }
    if (dt.dayReturn > 0) {
      doc.setTextColor(234, 88, 12);
      doc.text(`Iade: -${dt.dayReturn.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, 80, currentY + 10);
    }
    if (dt.dayPayment > 0) {
      doc.setTextColor(22, 163, 74);
      doc.text(`Odeme: ${dt.dayPayment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, 130, currentY + 5);
    }
    
    // Bakiye bilgisi (sagda)
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text('Onceki:', pageWidth - 60, currentY + 5);
    doc.text('Sonraki:', pageWidth - 60, currentY + 10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(`${dayBal.prevBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, pageWidth - 18, currentY + 5, { align: 'right' });
    doc.setTextColor(dayBal.endBalance > 0 ? 220 : 22, dayBal.endBalance > 0 ? 38 : 163, dayBal.endBalance > 0 ? 38 : 74);
    doc.text(`${dayBal.endBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, pageWidth - 18, currentY + 10, { align: 'right' });
    
    currentY += 15;
    
    // --- Her Fis icin Urun Detay Tablosu ---
    dayFisler.forEach((fis: any) => {
      if (currentY > pageHeight - 50) {
        doc.addPage();
        currentY = 20;
      }
      
      const isSale = fis.mode === 'satis' || fis.mode === 'sale';
      const isAlis = fis.mode === 'alis';
      const modeLabel = isSale ? 'SATIS FISI' : isAlis ? 'ALIS FISI' : 'GIDER FISI';
      const payMethod = fis.payment?.method === 'nakit' ? 'Nakit' : 
                        fis.payment?.method === 'kredi-karti' ? 'Kredi Karti' :
                        fis.payment?.method === 'havale' ? 'Havale/EFT' :
                        fis.payment?.method === 'cek' ? 'Cek' : 'Veresiye';
      const payAmount = fis.payment?.amount || 0;
      
      // Fis baslik satiri
      doc.setFillColor(253, 253, 254);
      doc.roundedRect(18, currentY, pageWidth - 36, 8, 1, 1, 'F');
      
      const modeR = isSale ? 37 : isAlis ? 147 : 100;
      const modeG = isSale ? 99 : isAlis ? 51 : 116;
      const modeB = isSale ? 235 : isAlis ? 234 : 139;
      doc.setFontSize(7);
      doc.setTextColor(modeR, modeG, modeB);
      doc.setFont('helvetica', 'bold');
      doc.text(modeLabel, 22, currentY + 5.5);
      
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(`#${(fis.id || '').substring(0, 8).toUpperCase()}`, 50, currentY + 5.5);
      
      const fisTime = fis.createdAt ? new Date(fis.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
      if (fisTime) doc.text(`Saat: ${fisTime}`, 72, currentY + 5.5);
      if (fis.employeeName) doc.text(`Personel: ${sanitizeStr(fis.employeeName)}`, 95, currentY + 5.5);
      
      // Odeme bilgisi (sagda)
      const payR = payMethod === 'Veresiye' ? 220 : 22;
      const payG = payMethod === 'Veresiye' ? 38 : 163;
      const payB = payMethod === 'Veresiye' ? 38 : 74;
      doc.setTextColor(payR, payG, payB);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(`${payMethod}${payAmount > 0 ? ': ' + payAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TL' : ''}`, pageWidth - 22, currentY + 5.5, { align: 'right' });
      
      currentY += 10;
      
      // Urun detay tablosu
      const items = fis.items || [];
      if (items.length > 0) {
        const tableBody = items.map((item: any, itemIdx: number) => {
          const isIade = item.type === 'iade';
          const name = item.productName || item.name || 'Urun';
          const qty = Math.abs(item.quantity || 0);
          const unit = item.unit || 'KG';
          const unitPrice = item.unitPrice || item.price || 0;
          const totalPrice = Math.abs(item.totalPrice || item.total || qty * unitPrice);
          
          return [
            `${itemIdx + 1}`,
            isIade ? `(IADE) ${sanitizeStr(name)}` : sanitizeStr(name),
            `${qty.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${sanitizeStr(unit)}`,
            `${unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`,
            isIade ? `-${totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL` : `${totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`,
          ];
        });
        
        const fisTotal = Math.abs(fis.total || items.reduce((s: number, i: any) => {
          const amt = Math.abs(i.totalPrice || i.total || (i.unitPrice || i.price || 0) * (i.quantity || 0));
          return s + (i.type === 'iade' ? -amt : amt);
        }, 0));
        
        autoTable(doc, {
          startY: currentY,
          head: [['#', 'Urun Adi', 'Miktar', 'Birim Fiyat', 'Toplam']],
          body: tableBody,
          ...tableStyles,
          styles: { 
            ...tableStyles.styles, 
            fontSize: 7.5, 
            cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 } 
          },
          headStyles: { 
            ...tableStyles.headStyles, 
            fontSize: 7,
            fillColor: [241, 245, 249] as [number, number, number],
            textColor: [71, 85, 105] as [number, number, number],
          },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' as const },
            2: { cellWidth: 28, halign: 'right' as const },
            3: { cellWidth: 28, halign: 'right' as const },
            4: { cellWidth: 32, halign: 'right' as const, fontStyle: 'bold' as const },
          },
          margin: { left: 18, right: 18 },
          didParseCell: (cellData: any) => {
            if (cellData.section === 'body') {
              const nameCell = cellData.row.cells[1];
              if (nameCell && nameCell.raw && nameCell.raw.toString().includes('(IADE)')) {
                if (cellData.column.index === 1 || cellData.column.index === 4) {
                  cellData.cell.styles.textColor = [234, 88, 12];
                }
                cellData.cell.styles.fillColor = [255, 247, 237];
              }
            }
          },
        });
        
        currentY = (doc as any).lastAutoTable.finalY;
        
        // Fis alt toplam satiri
        const subtotalBoxH = 7;
        doc.setFillColor(241, 245, 249);
        doc.rect(18, currentY, pageWidth - 36, subtotalBoxH, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.line(18, currentY, pageWidth - 18, currentY);
        
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.text('Fis Toplam:', pageWidth - 75, currentY + 5);
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(`${fisTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, pageWidth - 22, currentY + 5, { align: 'right' });
        
        if (payAmount > 0 && payAmount < fisTotal) {
          doc.setFontSize(6);
          doc.setTextColor(220, 38, 38);
          doc.setFont('helvetica', 'normal');
          doc.text(`Veresiye Kalan: ${(fisTotal - payAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, 22, currentY + 5);
        }
        
        currentY += subtotalBoxH + 4;
      } else {
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`Tutar: ${(fis.total || fis.amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, 22, currentY);
        if (fis.description) doc.text(`Aciklama: ${sanitizeStr(fis.description)}`, 70, currentY);
        currentY += 6;
      }
    });
    
    // Gun sonu cizgisi
    if (currentY > pageHeight - 30) { doc.addPage(); currentY = 20; }
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(18, currentY, pageWidth - 18, currentY);
    doc.setLineDashPattern([], 0);
    currentY += 6;
  });
  
  // ═══════════════════════════════════════════════════════════════
  // BOLUM 4: GENEL OZET TABLOSU
  // ═══════════════════════════════════════════════════════════════
  if (currentY > pageHeight - 60) { doc.addPage(); currentY = 20; }
  
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('EKSTRE OZET TABLOSU', 14, currentY);
  currentY += 6;
  
  const payMethodSummaryStr = cariPayMethodSummary(transactions);
  const summaryTableBody = [
    ['Toplam Siparis (Mal Bedeli)', `${totalSales.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, `${fisCount} fis`],
    ['Iade Edilen Tutar', `-${totalReturn.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, ''],
    ['Net Borc', `${(totalSales - totalReturn).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, ''],
    ['Yapilan Odemeler', `-${totalPayment.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, payMethodSummaryStr],
    ['KALAN BAKIYE', `${(cari.balance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`, (cari.balance || 0) > 0 ? 'BORCLU' : (cari.balance || 0) < 0 ? 'ALACAKLI' : 'DENGEDE'],
  ];
  
  autoTable(doc, {
    startY: currentY,
    head: [['Aciklama', 'Tutar', 'Detay']],
    body: summaryTableBody,
    ...tableStyles,
    styles: { ...tableStyles.styles, fontSize: 9 },
    headStyles: { ...tableStyles.headStyles, textColor: [15, 23, 42] as [number, number, number] },
    columnStyles: {
      0: { fontStyle: 'bold' as const },
      1: { halign: 'right' as const, fontStyle: 'bold' as const, cellWidth: 45 },
      2: { halign: 'center' as const, cellWidth: 35, fontSize: 8 },
    },
    didParseCell: (cellData: any) => {
      if (cellData.section === 'body') {
        if (cellData.row.index === 1 && cellData.column.index === 1) {
          cellData.cell.styles.textColor = [234, 88, 12];
        }
        if (cellData.row.index === 3 && cellData.column.index === 1) {
          cellData.cell.styles.textColor = [22, 163, 74];
        }
        if (cellData.row.index === 4) {
          cellData.cell.styles.fillColor = [240, 249, 255];
          cellData.cell.styles.fontStyle = 'bold';
          const bal = cari.balance || 0;
          if (cellData.column.index === 1 || cellData.column.index === 2) {
            cellData.cell.styles.textColor = bal > 0 ? [220, 38, 38] : bal < 0 ? [22, 163, 74] : [15, 23, 42];
          }
          cellData.cell.styles.fontSize = 10;
        }
      }
    },
  });
  
  currentY = (doc as any).lastAutoTable.finalY + 8;
  
  // ═══════════════════════════════════════════════════════════════
  // BOLUM 5: ODEME TIPLERI DAGILIMI
  // ═══════════════════════════════════════════════════════════════
  if (currentY < pageHeight - 40) {
    const payBreakdown = getCariPaymentBreakdown(transactions);
    if (payBreakdown.length > 0) {
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'bold');
      doc.text('ODEME TIPLERI DAGILIMI', 14, currentY);
      currentY += 5;
      autoTable(doc, {
        startY: currentY,
        head: [['Odeme Tipi', 'Islem Sayisi', 'Toplam Tutar']],
        body: payBreakdown,
        ...tableStyles,
        styles: { ...tableStyles.styles, fontSize: 8 },
        headStyles: { ...tableStyles.headStyles, fontSize: 7 },
        columnStyles: {
          1: { halign: 'center' as const },
          2: { halign: 'right' as const, fontStyle: 'bold' as const },
        },
        margin: { left: 14, right: pageWidth / 2 },
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // BOLUM 6: IMZA ALANI
  // ═══════════════════════════════════════════════════════════════
  const lastPage = (doc as any).internal.getNumberOfPages();
  doc.setPage(lastPage);
  const signY = pageHeight - 38;
  
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(14, signY, 80, signY);
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizeStr(company.companyName), 14, signY + 4);
  doc.text('Imza / Kase', 14, signY + 8);
  
  doc.line(pageWidth - 80, signY, pageWidth - 14, signY);
  doc.text(sanitizeStr(cari.companyName), pageWidth - 80, signY + 4);
  doc.text('Imza / Kase', pageWidth - 80, signY + 8);

  addPDFFooter(doc);
  doc.save(`cari-ekstre-${sanitizeStr(cari.companyName).replace(/\s+/g, '-').toLowerCase()}-${new Date().getTime()}.pdf`);
};

// Yardimci: Odeme tipi ozeti
function cariPayMethodSummary(transactions: any[]): string {
  const methods: Record<string, number> = {};
  transactions.forEach((t: any) => {
    const m = t.payment?.method || 'veresiye';
    methods[m] = (methods[m] || 0) + 1;
  });
  return Object.entries(methods).map(([k, v]) => {
    const label = k === 'nakit' ? 'Nakit' : k === 'kredi-karti' ? 'K.Karti' : k === 'havale' ? 'Havale' : k === 'cek' ? 'Cek' : 'Veresiye';
    return `${v}x ${label}`;
  }).join(', ');
}

function getCariPaymentBreakdown(transactions: any[]): string[][] {
  const methods: Record<string, { count: number; total: number }> = {};
  transactions.forEach((t: any) => {
    const m = t.payment?.method || 'veresiye';
    const label = m === 'nakit' ? 'Nakit' : m === 'kredi-karti' ? 'Kredi Karti' : m === 'havale' ? 'Havale/EFT' : m === 'cek' ? 'Cek' : 'Veresiye';
    if (!methods[label]) methods[label] = { count: 0, total: 0 };
    methods[label].count++;
    methods[label].total += t.payment?.amount || 0;
  });
  return Object.entries(methods).map(([label, d]) => [
    label,
    `${d.count}`,
    `${d.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`,
  ]);
}

export const generateDashboardPDF = (stats: any, topProducts: any[], activities: any[], userName: string) => {
  const doc = new jsPDF();
  
  addPDFHeader(doc, 'Sistem Ozeti (Dashboard)', `Tarih: ${new Date().toLocaleDateString('tr-TR')}`);
  
  const nextY = addReportInfoBox(doc, [
    { label: 'Raporu Olusturan:', value: sanitizeStr(userName) },
    { label: 'Rapor Turu:', value: 'Gercek Zamanli Ozet' }
  ], 38);

  // Executive Summary
  const dashSummaryY = drawExecutiveSummary(doc, nextY, [
    `Gunluk ciro: ${stats.revenue.toLocaleString('tr-TR')} TL. Toplam ${stats.salesCount} satis fisi kesilmistir.`,
    `${stats.criticalStock} urun kritik stok seviyesinde. ${stats.activeEmployee} personel aktif olarak calismaktadir.`,
    `En cok satan urun: ${topProducts.length > 0 ? sanitizeStr(topProducts[0]?.name || '-') : '-'}. Son ${activities.length} aktivite kaydedildi.`,
  ]);

  // 1. Özet İstatistikler (Modern Kartlar)
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('GENEL ISTATISTIKLER', 14, dashSummaryY + 2);
  
  const boxWidth = (doc.internal.pageSize.width - 38) / 4;
  const boxHeight = 22;
  let startX = 14;
  let startY = dashSummaryY + 7;
  
  const statItems = [
    { title: 'Gunluk Ciro', value: `${stats.revenue.toLocaleString('tr-TR')} TL`, color: [37, 99, 235] },
    { title: 'Satis Islem', value: `${stats.salesCount} Fis`, color: [22, 163, 74] },
    { title: 'Kritik Stok', value: `${stats.criticalStock} Urun`, color: [220, 38, 38] },
    { title: 'Personel', value: `${stats.activeEmployee} Aktif`, color: [147, 51, 234] }
  ];

  statItems.forEach((item) => {
    // Card background
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.roundedRect(startX, startY, boxWidth, boxHeight, 3, 3, 'FD');
    
    // Left colored accent
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.roundedRect(startX, startY + 3, 2, boxHeight - 6, 1, 1, 'F');
    
    // Title
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(item.title, startX + 6, startY + 8);
    
    // Value
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, startX + 6, startY + 16);
    
    startX += boxWidth + 3.33; // gap
  });

  let currentY = startY + boxHeight + 15;

  // 2. Çok Satan Ürünler
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('EN COK SATAN URUNLER', 14, currentY);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Sira', 'Urun Adi', 'Satis Adedi', 'Ciro (TL)']],
    body: topProducts.map((p, i) => [
      `#${i + 1}`,
      sanitizeStr(p.name),
      `${p.sales} islem`,
      p.revenue.toLocaleString('tr-TR')
    ]),
    ...tableStyles,
    columnStyles: { 0: { fontStyle: 'bold', halign: 'center', cellWidth: 20 }, 2: { halign: 'center' }, 3: { halign: 'right', fontStyle: 'bold' } }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // 3. Son Aktiviteler
  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('SON SISTEM AKTIVITELERI', 14, currentY);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Zaman', 'Islem Turu', 'Aciklama', 'Tutar']],
    body: activities.map(a => [
      a.time,
      sanitizeStr(a.type),
      sanitizeStr(a.desc),
      sanitizeStr(a.amount)
    ]),
    ...tableStyles,
    columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 3) {
        const val = data.cell.raw.toString();
        if (val.startsWith('+')) {
          data.cell.styles.textColor = [22, 163, 74];
        } else if (val.startsWith('-')) {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
    }
  });

  addPDFFooter(doc);
  doc.save(`sistem-ozeti-${new Date().getTime()}.pdf`);
};

// ─── GÜN SONU RAPORU PDF ─────────���──────────────────────────────────────────
export interface GunSonuPDFData {
  date: string;
  closedBy: string;
  totalSales: number;
  totalPurchases: number;
  totalPayments: number;
  totalExpenses: number;
  netCash: number;
  transactionCount: number;
  warningCount: number;
  transactions: Array<{
    time: string;
    type: string;
    description: string;
    amount: number;
    employee: string;
    hasReceipt: boolean;
  }>;
  crossValidation?: {
    dashboardRevenue: number;
    gunSonuSales: number;
    match: boolean;
  };
  kasaValidation?: {
    kasaTodayIncome: number;
    kasaTodayExpense: number;
    kasaNet: number;
    kasaTotalBalance: number;
    match: boolean;
  };
}

export const generateGunSonuPDF = (data: GunSonuPDFData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  addPDFHeader(doc, 'Gun Sonu Raporu', `Tarih: ${data.date}`);
  
  const nextY = addReportInfoBox(doc, [
    { label: 'Kapatan:', value: sanitizeStr(data.closedBy) },
    { label: 'Islem:', value: `${data.transactionCount} adet` },
    { label: 'Net Kasa:', value: `${data.netCash.toLocaleString('tr-TR')} TL` },
    { label: 'Uyari:', value: data.warningCount > 0 ? `${data.warningCount} fis eksik` : 'Yok' },
  ], 38);

  // Executive Summary
  const gunSonuSummaryY = drawExecutiveSummary(doc, nextY, [
    `${data.date} tarihli gun sonu kapanisi ${sanitizeStr(data.closedBy)} tarafindan gerceklestirilmistir.`,
    `Satis: ${data.totalSales.toLocaleString('tr-TR')} TL | Alis: ${data.totalPurchases.toLocaleString('tr-TR')} TL | Tahsilat: ${data.totalPayments.toLocaleString('tr-TR')} TL`,
    `Net kasa: ${data.netCash.toLocaleString('tr-TR')} TL. ${data.warningCount > 0 ? `DIKKAT: ${data.warningCount} fiste eksik belge tespit edildi!` : 'Tum fisler tam.'}`,
  ]);

  // Özet Kartları (5 kutu)
  const boxWidth = (pageWidth - 38) / 5;
  const boxHeight = 22;
  let bx = 14;
  const by = gunSonuSummaryY + 2;

  const summaryItems = [
    { title: 'Satis', value: `${data.totalSales.toLocaleString('tr-TR')} TL`, color: [37, 99, 235] },
    { title: 'Alis', value: `${data.totalPurchases.toLocaleString('tr-TR')} TL`, color: [147, 51, 234] },
    { title: 'Tahsilat', value: `${data.totalPayments.toLocaleString('tr-TR')} TL`, color: [22, 163, 74] },
    { title: 'Gider', value: `${data.totalExpenses.toLocaleString('tr-TR')} TL`, color: [220, 38, 38] },
    { title: 'Net Kasa', value: `${data.netCash.toLocaleString('tr-TR')} TL`, color: data.netCash >= 0 ? [16, 185, 129] : [239, 68, 68] },
  ];

  summaryItems.forEach((item) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.roundedRect(bx, by, boxWidth, boxHeight, 3, 3, 'FD');

    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.roundedRect(bx, by + 3, 2, boxHeight - 6, 1, 1, 'F');

    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(item.title, bx + 5, by + 8);

    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, bx + 5, by + 17);

    bx += boxWidth + 2;
  });

  let currentY = by + boxHeight + 10;

  // Çapraz Doğrulama Kutusu
  if (data.crossValidation) {
    const cv = data.crossValidation;
    const cvColor = cv.match ? [22, 163, 74] : [220, 38, 38];
    doc.setFillColor(cv.match ? 240 : 254, cv.match ? 253 : 242, cv.match ? 244 : 242);
    doc.setDrawColor(cvColor[0], cvColor[1], cvColor[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(cvColor[0], cvColor[1], cvColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(cv.match ? 'CAPRAZ DOGRULAMA: ESLESTI' : 'CAPRAZ DOGRULAMA: UYUMSUZLUK', 20, currentY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(
      `Dashboard Ciro: ${cv.dashboardRevenue.toLocaleString('tr-TR')} TL | Gun Sonu Satis: ${cv.gunSonuSales.toLocaleString('tr-TR')} TL`,
      20, currentY + 11
    );

    currentY += 20;
  }

  // Kasanın Doğrulaması
  if (data.kasaValidation) {
    const kv = data.kasaValidation;
    const kvColor = kv.match ? [22, 163, 74] : [220, 38, 38];
    doc.setFillColor(kv.match ? 240 : 254, kv.match ? 253 : 242, kv.match ? 244 : 242);
    doc.setDrawColor(kvColor[0], kvColor[1], kvColor[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(kvColor[0], kvColor[1], kvColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(kv.match ? 'KASA DOGRULAMA: ESLESTI' : 'KASA DOGRULAMA: UYUMSUZLUK', 20, currentY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(
      `Giris: ${kv.kasaTodayIncome.toLocaleString('tr-TR')} TL | Cikis: ${kv.kasaTodayExpense.toLocaleString('tr-TR')} TL | Net: ${kv.kasaNet.toLocaleString('tr-TR')} TL | Toplam Bakiye: ${kv.kasaTotalBalance.toLocaleString('tr-TR')} TL`,
      20, currentY + 11
    );

    currentY += 20;
  }

  // İşlem Listesi Tablosu
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('ISLEM DETAYLARI', 14, currentY);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Saat', 'Tur', 'Aciklama', 'Personel', 'Tutar (TL)', 'Fis']],
    body: data.transactions.map(t => {
      const typeLabel = t.type === 'sale' ? 'Satis' : t.type === 'payment' ? 'Tahsilat' : t.type === 'expense' ? 'Gider' : t.type === 'stock' ? 'Alis' : t.type;
      return [
        t.time,
        typeLabel,
        sanitizeStr(t.description),
        sanitizeStr(t.employee),
        (t.amount > 0 ? '+' : '') + t.amount.toLocaleString('tr-TR'),
        t.hasReceipt ? 'Var' : 'Yok',
      ];
    }),
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' },
      1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 28 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 26 },
      5: { cellWidth: 14, halign: 'center' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body') {
        if (data.column.index === 4) {
          const val = data.cell.raw?.toString() || '';
          if (val.startsWith('+')) data.cell.styles.textColor = [22, 163, 74];
          else if (val.startsWith('-')) data.cell.styles.textColor = [220, 38, 38];
        }
        if (data.column.index === 5) {
          if (data.cell.raw === 'Yok') {
            data.cell.styles.textColor = [234, 88, 12];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [22, 163, 74];
          }
        }
      }
    }
  });

  addPDFFooter(doc);
  doc.save(`gun-sonu-raporu-${data.date.replace(/[\\.\\/ ]/g, '-')}.pdf`);
};

// ─── PERSONEL PERFORMANS PDF ────────────────────────────────────────────────
export interface PersonelPerformansPDFData {
  dateRange: string;
  personnel: Array<{
    name: string;
    role: string;
    satisCount: number;
    satisTutar: number;
    iadeCount: number;
    iadeTutar: number;
    alisCount: number;
    alisTutar: number;
    giderCount: number;
    giderTutar: number;
    musteriCount: number;
  }>;
}

export const generatePersonelPerformansPDF = (data: PersonelPerformansPDFData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  addPDFHeader(doc, 'Personel Performans', `Donem: ${sanitizeStr(data.dateRange)}`);

  const totSatis = data.personnel.reduce((s, p) => s + p.satisTutar, 0);
  const totPersonel = data.personnel.length;
  const bestEmp = data.personnel[0];
  
  const nextY = addReportInfoBox(doc, [
    { label: 'Toplam Personel:', value: `${totPersonel} kisi` },
    { label: 'Rapor Donemi:', value: sanitizeStr(data.dateRange) },
    { label: 'Toplam Satis:', value: `${totSatis.toLocaleString('tr-TR')} TL` },
  ], 38);

  // Executive Summary
  let currentY = drawExecutiveSummary(doc, nextY, [
    `${totPersonel} personel degerlendirmeye alindi. Toplam satis hasilati: ${totSatis.toLocaleString('tr-TR')} TL.`,
    bestEmp ? `En basarili personel: ${sanitizeStr(bestEmp.name)} (${bestEmp.satisTutar.toLocaleString('tr-TR')} TL satis, ${bestEmp.satisCount} islem).` : 'Henuz performans verisi yok.',
    `Kisi basi ortalama satis: ${totPersonel > 0 ? (totSatis / totPersonel).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : '0'} TL.`,
  ]);

  // Performans bar grafiği
  if (data.personnel.length > 1) {
    const perfBarItems = data.personnel.slice(0, 6).map(p => ({
      label: p.name,
      value: p.satisTutar,
      color: [37, 99, 235] as [number, number, number],
    }));
    currentY = drawHorizontalBarChart(doc, 14, currentY, pageWidth - 28, perfBarItems, 'PERSONEL SATIS PERFORMANSI');
    currentY += 4;
  }

  // En İyi 3 Personel Kutusu
  const top3 = data.personnel.slice(0, 3);
  if (top3.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text('EN IYI 3 PERSONEL', 14, currentY);
    currentY += 5;

    const boxW = (pageWidth - 32) / 3;
    const boxH = 26;
    const medalColors = [[234, 179, 8], [148, 163, 184], [234, 88, 12]];
    const medalLabels = ['ALTIN', 'GUMUS', 'BRONZ'];

    top3.forEach((emp, idx) => {
      const bx = 14 + idx * (boxW + 2);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(medalColors[idx][0], medalColors[idx][1], medalColors[idx][2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(bx, currentY, boxW, boxH, 3, 3, 'FD');

      doc.setFillColor(medalColors[idx][0], medalColors[idx][1], medalColors[idx][2]);
      doc.roundedRect(bx, currentY + 3, 2, boxH - 6, 1, 1, 'F');

      doc.setFontSize(6);
      doc.setTextColor(medalColors[idx][0], medalColors[idx][1], medalColors[idx][2]);
      doc.setFont('helvetica', 'bold');
      doc.text(medalLabels[idx], bx + 5, currentY + 7);

      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(sanitizeStr(emp.name), bx + 5, currentY + 14);

      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text(`${emp.satisCount} satis | ${emp.satisTutar.toLocaleString('tr-TR')} TL`, bx + 5, currentY + 20);
    });

    currentY += boxH + 10;
  }

  // Detay Tablosu
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('PERSONEL DETAY TABLOSU', 14, currentY);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['#', 'Personel', 'Rol', 'Satis', 'Satis TL', 'Iade', 'Iade TL', 'Alis', 'Gider TL', 'Musteri']],
    body: data.personnel.map((p, i) => [
      `${i + 1}`,
      sanitizeStr(p.name),
      sanitizeStr(p.role),
      `${p.satisCount}`,
      p.satisTutar.toLocaleString('tr-TR'),
      `${p.iadeCount}`,
      p.iadeTutar.toLocaleString('tr-TR'),
      `${p.alisCount}`,
      p.giderTutar.toLocaleString('tr-TR'),
      `${p.musteriCount}`,
    ]),
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { fontStyle: 'bold' },
      2: { cellWidth: 20 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'right', cellWidth: 20 },
      7: { halign: 'center', cellWidth: 14 },
      8: { halign: 'right', cellWidth: 20 },
      9: { halign: 'center', cellWidth: 16 },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 4) {
        const val = parseFloat(data.cell.raw?.toString().replace(/\./g, '').replace(',', '.') || '0');
        if (val > 0) data.cell.styles.textColor = [22, 163, 74];
      }
    }
  });

  // Toplam satırı
  const totals = data.personnel.reduce((acc, p) => ({
    satisCount: acc.satisCount + p.satisCount,
    satisTutar: acc.satisTutar + p.satisTutar,
    iadeCount: acc.iadeCount + p.iadeCount,
    iadeTutar: acc.iadeTutar + p.iadeTutar,
    alisCount: acc.alisCount + p.alisCount,
    giderTutar: acc.giderTutar + p.giderTutar,
    musteriCount: acc.musteriCount + p.musteriCount,
  }), { satisCount: 0, satisTutar: 0, iadeCount: 0, iadeTutar: 0, alisCount: 0, giderTutar: 0, musteriCount: 0 });

  currentY = (doc as any).lastAutoTable.finalY + 6;
  if (currentY > 260) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, currentY, pageWidth - 28, 12, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(37, 99, 235);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `TOPLAM: ${totals.satisCount} Satis (${totals.satisTutar.toLocaleString('tr-TR')} TL) | ${totals.iadeCount} Iade (${totals.iadeTutar.toLocaleString('tr-TR')} TL) | ${totals.alisCount} Alis | Gider: ${totals.giderTutar.toLocaleString('tr-TR')} TL | ${totals.musteriCount} Musteri`,
    20, currentY + 8
  );

  addPDFFooter(doc);
  doc.save(`personel-performans-${new Date().getTime()}.pdf`);
};