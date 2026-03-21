/**
 * SMS Bildirim Servisi — Netgsm entegrasyonu (Türkiye'nin en yaygın SMS sağlayıcısı)
 * Ayarlar → SMS Bildirimleri bölümünden yapılandırılır.
 */
import { getFromStorage, StorageKey } from './storage';

export interface SMSConfig {
  enabled: boolean;
  provider: 'netgsm';
  usercode: string;       // Netgsm kullanıcı kodu
  password: string;       // Netgsm şifresi
  msgheader: string;      // Gönderici başlığı (max 11 karakter, GİB onaylı)
  triggers: {
    onSale: boolean;        // Satış fişi oluşturulunca
    onCollection: boolean;  // Tahsilat yapılınca
    onInvoice: boolean;     // Fatura gönderilince
    onLowStock: boolean;    // Kritik stok uyarısı
  };
}

export const DEFAULT_SMS_CONFIG: SMSConfig = {
  enabled: false,
  provider: 'netgsm',
  usercode: '',
  password: '',
  msgheader: 'İŞLEYENET',
  triggers: {
    onSale: true,
    onCollection: true,
    onInvoice: false,
    onLowStock: false,
  },
};

function getSMSConfig(): SMSConfig | null {
  try {
    const settings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
    return settings?.smsConfig || null;
  } catch {
    return null;
  }
}

/**
 * Netgsm REST API üzerinden SMS gönder
 * Belgeleme: https://www.netgsm.com.tr/dokuman/
 */
export async function sendSMS(
  to: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const config = getSMSConfig();
  if (!config || !config.enabled) {
    return { success: false, error: 'SMS devre dışı' };
  }
  if (!config.usercode || !config.password || !config.msgheader) {
    return { success: false, error: 'SMS yapılandırması eksik' };
  }

  // Türkiye numarasını normalize et (başında 0 veya +90 olabilir)
  const normalized = to.replace(/\D/g, '').replace(/^0/, '90').replace(/^(?!90)/, '90');
  if (normalized.length !== 12) {
    return { success: false, error: `Geçersiz telefon: ${to}` };
  }

  try {
    // Netgsm GET API — CORS nedeniyle proxy üzerinden veya server-side çağrılmalı
    // Tarayıcı ortamında direkt çağrı CORS hatası verebilir;
    // Supabase Edge Function aracılığıyla çağırılması önerilir.
    const params = new URLSearchParams({
      usercode: config.usercode,
      password: config.password,
      gsmno: normalized,
      message,
      msgheader: config.msgheader,
      dil: 'TR',
    });
    const url = `https://api.netgsm.com.tr/sms/send/get?${params}`;
    const res = await fetch(url);
    const text = (await res.text()).trim();

    // Netgsm "00 XXXX" → başarılı (00 + mesaj ID)
    if (text.startsWith('00')) {
      return { success: true };
    }
    const errorMap: Record<string, string> = {
      '20': 'Mesaj gövdesi boş',
      '30': 'Geçersiz kullanıcı adı/şifre',
      '40': 'Mesaj başlığı (header) onaylı değil',
      '50': 'Abone hesap aktif değil',
      '51': 'Kredi yetersiz',
      '70': 'Hatalı sorgulama',
      '80': 'Mesaj kuyruğa alınamadı',
      '85': 'Filtreleme hatası',
    };
    return { success: false, error: errorMap[text] || `Netgsm hatası: ${text}` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Ağ hatası' };
  }
}

/** Satış fişi bildirimi */
export function buildSalesSMS(customerName: string, total: number, fisId: string): string {
  return `Sayın ${customerName}, ${total.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺ tutarındaki siparişiniz alındı. Fiş: #${fisId.slice(-6).toUpperCase()}. Teşekkürler.`;
}

/** Tahsilat bildirimi */
export function buildCollectionSMS(customerName: string, amount: number, method: string): string {
  const methodLabel: Record<string, string> = {
    nakit: 'nakit', kart: 'kredi kartı', havale: 'EFT/havale', cek: 'çek',
  };
  return `Sayın ${customerName}, ${amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺ ${methodLabel[method] || method} ödemeniz alındı. İyi günler.`;
}

/** Fatura bildirimi */
export function buildInvoiceSMS(customerName: string, faturaNo: string, total: number): string {
  return `Sayın ${customerName}, ${faturaNo} nolu ${total.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺ tutarındaki faturanız düzenlendi.`;
}

/** Kritik stok uyarısı (personele) */
export function buildLowStockSMS(productName: string, currentStock: number, unit: string): string {
  return `⚠️ STOK UYARISI: ${productName} kritik seviyede! Mevcut: ${currentStock} ${unit}. Lütfen sipariş veriniz.`;
}
