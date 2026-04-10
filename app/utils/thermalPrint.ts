// ─── Termal Yazıcı Fiş Baskısı ────────────────────────────────────────────────
// 80mm (POS / termal) yazıcı için tarayıcı print dialog üzerinden çalışır.
// Kullanım: thermalPrint(fis, companyInfo)
// Müşteriye verilecek fiş formatı — sadece önemli bilgiler.

import type { CompanyInfo } from '../pages/SettingsPage';

// ─── Yardımcı ──────────────────────────────────────────────────────────────────
const line = (char = '-', len = 32) => char.repeat(len);

const pad = (left: string, right: string, total = 32): string => {
  const leftStr = String(left).substring(0, total - String(right).length - 1);
  const spaces = total - leftStr.length - String(right).length;
  return leftStr + ' '.repeat(Math.max(spaces, 1)) + String(right);
};

const fmtMoney = (val: number) =>
  val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';

const fmtDate = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const center = (text: string, width = 32) => {
  const t = text.substring(0, width);
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return ' '.repeat(pad) + t;
};

// ─── Fiş Tipi Etiketi ─────────────────────────────────────────────────────────
const getModeLabel = (mode: string) => {
  if (mode === 'satis' || mode === 'sale') return 'SATIŞ FİŞİ';
  if (mode === 'alis') return 'ALIŞ FİŞİ';
  return 'GİDER FİŞİ';
};

// ─── Ödeme Yöntemi Türkçe ──────────────────────────────────────────────────────
const getPaymentLabel = (method: string) => {
  const map: Record<string, string> = {
    nakit: 'Nakit',
    pos: 'Kredi Kartı (POS)',
    havale: 'Havale / EFT',
    cek: 'Çek',
    veresiye: 'Veresiye',
  };
  return map[method] || method || '-';
};

// ─── Ana HTML Oluşturucu ───────────────────────────────────────────────────────
function buildReceiptHtml(fis: any, company: CompanyInfo): string {
  const isSatis = fis.mode === 'satis' || fis.mode === 'sale';
  const isAlis = fis.mode === 'alis';
  const isGider = !isSatis && !isAlis;
  const modeLabel = getModeLabel(fis.mode);

  const items: any[] = fis.items || [];
  const total: number = fis.total || fis.amount || 0;
  const paid: number = fis.payment?.amount || 0;
  const remaining = total - paid;

  // Satır HTML'leri
  const rows: string[] = [];

  if (items.length > 0) {
    rows.push(`<tr class="section-header"><td colspan="4">ÜRÜNLER</td></tr>`);
    items.forEach(item => {
      const isIade = item.type === 'iade';
      const qty = Math.abs(item.quantity || 0);
      const price = item.unitPrice || item.price || 0;
      const itemTotal = Math.abs(item.totalPrice || item.total || qty * price);
      const name = (item.name || item.productName || 'Bilinmeyen').substring(0, 20);
      rows.push(`
        <tr class="${isIade ? 'iade-row' : ''}">
          <td colspan="2" class="item-name">${isIade ? '↩ ' : ''}${name}</td>
          <td class="qty">${qty} ${item.unit || 'AD'}</td>
          <td class="money">${fmtMoney(itemTotal)}</td>
        </tr>
        <tr class="sub-row">
          <td colspan="2" class="unit-price">  @${fmtMoney(price)}</td>
          <td colspan="2"></td>
        </tr>
      `);
    });
    rows.push(`<tr class="divider"><td colspan="4"><hr/></td></tr>`);
  } else if (isGider && fis.category) {
    rows.push(`<tr class="section-header"><td colspan="4">AÇIKLAMA</td></tr>`);
    rows.push(`<tr><td colspan="4" class="item-name">${fis.category}${fis.description ? ': ' + fis.description : ''}</td></tr>`);
    rows.push(`<tr class="divider"><td colspan="4"><hr/></td></tr>`);
  }

  // Tutar satırları
  rows.push(`<tr class="total-row"><td colspan="3"><b>TOPLAM</b></td><td class="money"><b>${fmtMoney(total)}</b></td></tr>`);

  if (fis.payment) {
    rows.push(`<tr><td colspan="3">Ödeme: ${getPaymentLabel(fis.payment.method)}</td><td class="money">${fmtMoney(paid)}</td></tr>`);
    if (remaining > 0.01) {
      rows.push(`<tr class="balance-row"><td colspan="3"><b>BAKİYE (KALAN)</b></td><td class="money"><b>${fmtMoney(remaining)}</b></td></tr>`);
    } else if (remaining < -0.01) {
      rows.push(`<tr><td colspan="3">Para Üstü</td><td class="money">${fmtMoney(Math.abs(remaining))}</td></tr>`);
    }
    if (fis.payment.bankName) {
      rows.push(`<tr class="bank-row"><td colspan="4">Banka: ${fis.payment.bankName}</td></tr>`);
    }
  }

  // Cari bakiye (varsa)
  if (fis.cari?.balance !== undefined) {
    rows.push(`<tr class="divider"><td colspan="4"><hr/></td></tr>`);
    rows.push(`<tr class="cari-balance"><td colspan="3">Cari Bakiye</td><td class="money ${fis.cari.balance > 0 ? 'debt' : 'credit'}">${fmtMoney(Math.abs(fis.cari.balance))} ${fis.cari.balance > 0 ? '(Borç)' : '(Alacak)'}</td></tr>`);
  }

  const fisNo = fis.fisNo || fis.id?.substring(0, 8)?.toUpperCase() || '-';
  const cariName = fis.cari?.companyName || fis.cari?.contactPerson || '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fiş - ${fisNo}</title>
<style>
  /* ── Termal kağıt: 80mm genişlik, sonsuz uzunluk ── */
  @page {
    size: 80mm auto;
    margin: 4mm 3mm;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    color: #000;
    background: #fff;
    width: 72mm;
    max-width: 72mm;
  }

  .header {
    text-align: center;
    padding: 4px 0 2px;
    border-bottom: 1px dashed #000;
    margin-bottom: 6px;
  }
  .header .company-name {
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 0.5px;
  }
  .header .company-sub {
    font-size: 9px;
    margin-top: 1px;
    color: #333;
  }

  .fis-info {
    margin-bottom: 5px;
  }
  .fis-info table { width: 100%; border-collapse: collapse; }
  .fis-info td { font-size: 10px; padding: 1px 0; }
  .fis-info .label { color: #555; width: 45%; }
  .fis-info .value { font-weight: bold; }

  .mode-label {
    text-align: center;
    font-size: 12px;
    font-weight: bold;
    border: 1px solid #000;
    padding: 3px;
    margin: 5px 0;
    letter-spacing: 1px;
  }

  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 4px;
  }
  .items-table td {
    font-size: 10px;
    padding: 1.5px 1px;
    vertical-align: top;
  }
  .items-table .item-name { font-weight: bold; max-width: 120px; word-break: break-word; }
  .items-table .qty { text-align: center; white-space: nowrap; }
  .items-table .money { text-align: right; white-space: nowrap; font-weight: bold; }
  .items-table .unit-price { font-size: 9px; color: #555; }
  .items-table .section-header td {
    font-size: 9px; text-transform: uppercase; color: #555;
    border-bottom: 1px solid #ccc; padding-top: 3px;
  }
  .items-table .divider td { padding: 2px 0; }
  .items-table .divider hr { border: none; border-top: 1px dashed #000; }
  .items-table .total-row td { font-size: 12px; padding-top: 3px; border-top: 1px solid #000; }
  .items-table .balance-row td { color: #c00; font-size: 11px; }
  .items-table .cari-balance td { font-size: 10px; }
  .items-table .iade-row td { color: #777; }
  .items-table .bank-row td { font-size: 9px; color: #555; }
  .items-table .debt { color: #c00; }
  .items-table .credit { color: #060; }
  .items-table .sub-row td { font-size: 9px; }

  .footer {
    text-align: center;
    font-size: 9px;
    color: #555;
    border-top: 1px dashed #000;
    margin-top: 8px;
    padding-top: 5px;
  }
  .footer .thanks {
    font-size: 11px;
    font-weight: bold;
    color: #000;
    margin-bottom: 2px;
  }

  /* Tarayıcı print düğmelerini gizle */
  @media print {
    body { -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- ── Başlık ── -->
<div class="header">
  <div class="company-name">${company.companyName}</div>
  ${company.phone ? `<div class="company-sub">Tel: ${company.phone}</div>` : ''}
  ${company.address ? `<div class="company-sub">${company.address.substring(0, 40)}</div>` : ''}
  ${company.taxNumber ? `<div class="company-sub">V.No: ${company.taxNumber} (${company.taxOffice || ''})</div>` : ''}
</div>

<!-- ── Fiş Tipi ── -->
<div class="mode-label">${modeLabel}</div>

<!-- ── Fiş Bilgileri ── -->
<div class="fis-info">
  <table>
    <tr>
      <td class="label">Fiş No</td>
      <td class="value">#${fisNo}</td>
    </tr>
    <tr>
      <td class="label">Tarih</td>
      <td class="value">${fmtDate(fis.date)}</td>
    </tr>
    ${cariName ? `<tr>
      <td class="label">${isSatis ? 'Müşteri' : isAlis ? 'Tedarikçi' : 'İlgili'}</td>
      <td class="value">${cariName.substring(0, 22)}</td>
    </tr>` : ''}
    ${fis.employeeName ? `<tr>
      <td class="label">Personel</td>
      <td class="value">${fis.employeeName}</td>
    </tr>` : ''}
  </table>
</div>

<!-- ── Kalem listesi + Tutarlar ── -->
<table class="items-table">
  ${rows.join('\n')}
</table>

<!-- ── Alt Bilgi ── -->
<div class="footer">
  <div class="thanks">Teşekkür ederiz!</div>
  ${company.slogan ? `<div>${company.slogan}</div>` : ''}
  <div style="margin-top:4px; font-size:8px;">
    Bu fiş ${new Date().toLocaleDateString('tr-TR')} tarihinde düzenlenmiştir.
  </div>
</div>

</body>
</html>`;
}

// ─── Dışa Aktarılan Ana Fonksiyon ─────────────────────────────────────────────
export function thermalPrint(fis: any, company: CompanyInfo): void {
  const html = buildReceiptHtml(fis, company);

  const win = window.open('', '_blank', 'width=380,height=700,menubar=no,toolbar=no,status=no');
  if (!win) {
    alert('Popup açılamadı. Tarayıcı ayarlarından bu site için popup izni verin.');
    return;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();

  // Sayfa yüklendikten sonra print dialog'u aç
  win.addEventListener('load', () => {
    setTimeout(() => {
      win.print();
      // Print tamamlanınca pencereyi kapat (bazı tarayıcılarda otomatik olur)
      win.addEventListener('afterprint', () => win.close());
    }, 150);
  });
}
