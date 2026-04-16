/**
 * Web Push Bildirimleri — Notification API yardımcıları
 * Tarayıcı Notification API'sini sarmalar; izin yoksa otomatik ister.
 */

export type NotifPermission = 'granted' | 'denied' | 'default';

/** Mevcut bildirim iznini döndürür */
export function getNotifPermission(): NotifPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return Notification.permission as NotifPermission;
}

/** İzin iste — sonucu döndürür */
export async function requestNotifPermission(): Promise<NotifPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result as NotifPermission;
}

/** Bildirimlerin desteklenip desteklenmediğini kontrol et */
export function isNotifSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export interface NotifOptions {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;      // Aynı tag'e sahip bildirimler güncellenir (çoğalmaz)
  onClick?: () => void;
}

/**
 * Bildirim gönder
 * İzin yoksa önce ister, reddedilmişse sessizce çıkar
 */
export async function sendNotification(opts: NotifOptions): Promise<Notification | null> {
  if (!isNotifSupported()) return null;

  let permission = getNotifPermission();
  if (permission === 'default') {
    permission = await requestNotifPermission();
  }
  if (permission !== 'granted') return null;

  const notif = new Notification(opts.title, {
    body: opts.body,
    icon: opts.icon || '/favicon.ico',
    badge: opts.badge,
    tag: opts.tag,
  });

  if (opts.onClick) {
    notif.onclick = () => {
      window.focus();
      opts.onClick!();
      notif.close();
    };
  }

  return notif;
}

/**
 * Gün sonu özet bildirimi
 * Gün sonu raporu tamamlandığında çağrılır
 */
export async function sendGunSonuNotification(stats: {
  totalRevenue: number;
  totalOrders: number;
  kasaBalance: number;
}) {
  return sendNotification({
    title: '🌙 Gün Sonu Raporu Hazır',
    body: [
      `Ciro: ₺${stats.totalRevenue.toLocaleString('tr-TR')}`,
      `İşlem: ${stats.totalOrders} fiş`,
      `Kasa: ₺${stats.kasaBalance.toLocaleString('tr-TR')}`,
    ].join(' • '),
    tag: 'gun-sonu',
  });
}

/**
 * Kritik stok bildirimi
 */
export async function sendCriticalStockNotification(count: number, productNames: string[]) {
  const names = productNames.slice(0, 3).join(', ');
  const extra = productNames.length > 3 ? ` +${productNames.length - 3} daha` : '';
  return sendNotification({
    title: `⚠️ ${count} Ürün Kritik Stok Seviyesinde`,
    body: `${names}${extra}`,
    tag: 'kritik-stok',
  });
}
