/**
 * UBL-TR 1.2 XML Üretici — GİB e-Fatura / e-Arşiv standardı
 *
 * LUCA e-Dönüşüm Entegrasyonu Hakkında:
 * ──────────────────────────────────────
 * TÜRMOB LUCA'nın kamuya açık bir REST API'si YOKTUR.
 * Entegrasyon seçenekleri:
 *   1) MANUEL YÜKLEME (bu dosya): UBL-TR XML oluşturup
 *      https://turmobefatura.luca.com.tr adresine yüklersiniz.
 *   2) SOAP WEB SERVİSİ: LUCA ile kurumsal anlaşma yaparak
 *      SOAP endpoint'leri alınır (Ayarlar → e-Fatura'dan yapılandırılır).
 *   3) GİB DOĞRUDAN ENTEGRASYON: GİB'in özel entegratör statüsü
 *      gerektirir — büyük hacimli işletmeler için.
 *
 * Bu dosya 1. seçeneği (manuel/XML) destekler.
 * Belgeleme: https://www.efatura.gov.tr/efaturastandartlari.html
 */

export interface UBLFaturaData {
  faturaUUID: string;       // UUID v4 (e.g. crypto.randomUUID())
  faturaNo: string;         // e.g. "EAF2026000001234"
  tarih: string;            // "2026-03-20"
  saat: string;             // "14:30:00"
  faturaType: 'SATIS' | 'IADE'; // Fatura tipi
  saticiVKN: string;        // Satıcı VKN/TCKN
  saticiUnvan: string;      // Satıcı firma unvanı
  saticiAdres: string;
  saticiIlce: string;
  saticiIl: string;
  aliciVKN?: string;        // Alıcı VKN/TCKN (boşsa bireysel)
  aliciUnvan: string;       // Alıcı adı/unvanı
  aliciAdres?: string;
  satirlar: UBLSatir[];
  matrahToplam: number;     // KDV hariç toplam
  kdvToplam: number;
  genelToplam: number;      // KDV dahil toplam
  para: 'TRY';
  aciklama?: string;
}

export interface UBLSatir {
  sira: number;
  aciklama: string;
  miktar: number;
  birim: string;           // "KG", "Adet", vb.
  birimFiyat: number;
  matrah: number;
  kdvOrani: number;        // 0, 1, 8, 10, 18, 20
  kdvTutar: number;
  satirToplam: number;
}

/** UBL-TR 1.2 uyumlu e-Fatura XML string üretir */
export function generateUBLXML(data: UBLFaturaData): string {
  const satirXML = data.satirlar.map(s => `
    <cac:InvoiceLine>
      <cbc:ID>${s.sira}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${s.birim}">${s.miktar}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${data.para}">${s.matrah.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${data.para}">${s.kdvTutar.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${data.para}">${s.matrah.toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${data.para}">${s.kdvTutar.toFixed(2)}</cbc:TaxAmount>
          <cbc:Percent>${s.kdvOrani}</cbc:Percent>
          <cac:TaxCategory>
            <cac:TaxScheme>
              <cbc:Name>KDV</cbc:Name>
              <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${escapeXML(s.aciklama)}</cbc:Name>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${data.para}">${s.birimFiyat.toFixed(4)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TICARIFATURA</cbc:ProfileID>
  <cbc:ID>${escapeXML(data.faturaNo)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${data.faturaUUID}</cbc:UUID>
  <cbc:IssueDate>${data.tarih}</cbc:IssueDate>
  <cbc:IssueTime>${data.saat}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${data.para}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${data.satirlar.length}</cbc:LineCountNumeric>
  ${data.aciklama ? `<cbc:Note>${escapeXML(data.aciklama)}</cbc:Note>` : ''}

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${escapeXML(data.saticiVKN)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXML(data.saticiUnvan)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXML(data.saticiAdres)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escapeXML(data.saticiIlce)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXML(data.saticiIl)}</cbc:CityName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      ${data.aliciVKN ? `<cac:PartyIdentification><cbc:ID schemeID="VKN">${escapeXML(data.aliciVKN)}</cbc:ID></cac:PartyIdentification>` : ''}
      <cac:PartyName>
        <cbc:Name>${escapeXML(data.aliciUnvan)}</cbc:Name>
      </cac:PartyName>
      ${data.aliciAdres ? `<cac:PostalAddress><cbc:StreetName>${escapeXML(data.aliciAdres)}</cbc:StreetName><cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country></cac:PostalAddress>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${data.para}">${data.kdvToplam.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${data.para}">${data.matrahToplam.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${data.para}">${data.kdvToplam.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${data.para}">${data.matrahToplam.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${data.para}">${data.matrahToplam.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${data.para}">${data.genelToplam.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${data.para}">${data.genelToplam.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${satirXML}
</Invoice>`;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** XML string'i tarayıcıda dosya olarak indir */
export function downloadXML(xmlContent: string, filename: string): void {
  const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
