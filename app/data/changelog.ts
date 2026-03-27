// ─── Uygulama Sürüm Geçmişi ─────────────────────────────────────
// Yeni sürüm eklendiğinde en üste (başa) yeni bir VersionEntry ekleyin.
// Kural: yenilik = özellik, iyileştirme = iyileştirme, düzeltme = hata, güvenlik = güvenlik

export type ChangeType = 'yenilik' | 'iyileştirme' | 'düzeltme' | 'güvenlik';

export interface Change {
  type: ChangeType;
  text: string;
}

export interface VersionEntry {
  version: string;      // örn. "4.3"
  codename: string;     // örn. "KALKAN"
  date: string;         // örn. "22 Mart 2026"
  summary: string;      // tek satır açıklama
  changes: Change[];
}

export const CHANGELOG: VersionEntry[] = [
  {
    version: '4.5',
    codename: 'KALKAN',
    date: '27 Mart 2026',
    summary: 'PouchDB/CouchDB çoklu veritabanı senkronizasyonu & Üretim karışım özelliği',
    changes: [
      { type: 'yenilik',     text: 'Supabase tamamen PouchDB/CouchDB ile değiştirildi. Veriler yerel PouchDB\'de; CouchDB ile çift yönlü otomatik senkronizasyon.' },
      { type: 'yenilik',     text: 'docker-compose.yml: CouchDB 3.3 container\'ı eklendi; nginx /couchdb/ proxy ile CORS sorunu yok.' },
      { type: 'yenilik',     text: 'GlobalTableSyncProvider: 15 tablo uygulama genelinde otomatik senkronize.' },
      { type: 'yenilik',     text: 'Üretim sayfasına Karışım/Kıyma sekmesi eklendi — birden fazla hammadde karıştırarak çıktı üretme.' },
      { type: 'düzeltme',    text: 'DashboardPage liveCounter ve useIsMobile eksik değişkenleri giderildi.' },
      { type: 'düzeltme',    text: 'StorageKey\'e 7 yeni anahtar eklendi (POS_DATA, SYSTEM_SETTINGS, LOGIN_CONTENT vb.).' },
      { type: 'düzeltme',    text: '20+ TypeScript derleme ve çalışma zamanı hatası giderildi; @types/pouchdb kuruldu.' },
      { type: 'güvenlik',    text: 'Tuzsuz SHA-256 → tuzlu SHA-256 şifre migration otomatik yürütülüyor.' },
    ],
  },
  {
    version: '4.4',
    codename: 'KALKAN',
    date: '22 Mart 2026',
    summary: 'Arka plan algoritmaları güçlendirmesi & AI dashboard entegrasyonu',
    changes: [
      { type: 'yenilik',     text: 'Dashboard\'a inline AI sohbet paneli eklendi; Bot ikonuyla açılır, tüm sistem verilerine erişir.' },
      { type: 'iyileştirme', text: 'chatgpt-assistant.ts: tüm 12 veri kaynağı (stok, cari, kasa, banka, üretim, çekler, araçlar vb.) AI prompt\'una dahil edildi.' },
      { type: 'yenilik',     text: 'data-integrity.ts: fiş satır toplamı ↔ fiş.total mali tutarlılık kontrolü eklendi (±%0.1 tolerans).' },
      { type: 'yenilik',     text: 'data-integrity.ts: stok hareket toplamı ↔ mevcut stok çapraz doğrulama algoritması eklendi.' },
      { type: 'yenilik',     text: 'data-integrity.ts: DataHealthScore (0–100, A–F not) fonksiyonu — kritik/uyarı/bilgi sayısına göre ağırlıklı hesaplama.' },
      { type: 'yenilik',     text: 'activityLogger.ts: detectActivityAnomalies() — toplu silme, sık export, mesai dışı bulk işlem, hızlı giriş denemesi ve olağandışı hacim tespiti.' },
      { type: 'iyileştirme', text: 'activityLogger.ts: maksimum log sınırı 500 → 1000\'e yükseltildi.' },
      { type: 'iyileştirme', text: 'security.ts: rate limiter sabit pencere → kayan pencere (Sliding Window) algoritmasına yükseltildi; patlama saldırısı açığı kapatıldı.' },
      { type: 'yenilik',     text: 'security.ts: analyzeInputThreat() — Shannon entropisi + XSS + SQL injection birleşik tehdit skoru (0–100).' },
      { type: 'iyileştirme', text: 'security.ts: detectRapidActions() kayan pencere ile yeniden yazıldı; false-positive oranı azaldı.' },
      { type: 'iyileştirme', text: 'useTableSync.ts: WriteQueue adaptif debounce — 20+ işlem varsa anında flush, kritik tablolar (fisler/kasa) için 80ms min gecikme.' },
      { type: 'iyileştirme', text: 'useTableSync.ts: syncHealth.isHealthy gerçek hata oranı (%20 eşiği) ve anlık bekleyen yazma sayısını izliyor.' },
    ],
  },
  {
    version: '4.3',
    codename: 'KALKAN',
    date: '22 Mart 2026',
    summary: 'Giriş ekranı kurumsal yenileme & hata ayıklama',
    changes: [
      { type: 'iyileştirme', text: 'HeroCarousel iç içe 3 katman gradient → tek temiz overlay; görsel gürültü ortadan kaldırıldı.' },
      { type: 'iyileştirme', text: 'FloatingParticles animasyonu kaldırıldı; sayfa yük süresi iyileşti.' },
      { type: 'iyileştirme', text: 'Şirket logosu hero üzerine absolute-positioned olmaktan çıkarıldı; kendi header şeridine taşındı.' },
      { type: 'yenilik',     text: 'Sol panel alt kısmına kurumsal güven rozeti şeridi eklendi (ISO 22000, Teslimat, Soğuk Zincir).' },
      { type: 'iyileştirme', text: 'Sağ panel büyük nested gradient promosyon kartı → yatay kaydırılabilir 4 chip şeridine dönüştürüldü.' },
      { type: 'yenilik',     text: '"Müşteri Portali" sticky navigasyon şeridi ile backdrop-blur üst bar eklendi.' },
      { type: 'iyileştirme', text: 'İçerik bölümlerine (Haberler & Tarifler / Ürün Kataloğu) ayırıcı başlık ve divider eklendi.' },
      { type: 'iyileştirme', text: 'Login modal; glassmorphism → sade koyu panel (tek border, gradient olmadan).' },
      { type: 'iyileştirme', text: 'Tab switcher animated spring div → düz renk geçişine sadeleştirildi.' },
      { type: 'iyileştirme', text: 'Mobil alt bar; gradient shimmer animasyonu kaldırıldı, backdrop-blur panele dönüştürüldü.' },
      { type: 'düzeltme',    text: 'Kullanılmayan Heart ve Fingerprint ikon importları temizlendi.' },
      { type: 'düzeltme',    text: 'Tanımlı ama hiç çağrılmayan FloatingParticles fonksiyonu silindi.' },
    ],
  },
  {
    version: '4.2',
    codename: 'KALKAN',
    date: '15 Mart 2026',
    summary: 'Vitrin analitikleri & ürün kataloğu genişletme',
    changes: [
      { type: 'yenilik',     text: 'Vitrin analitik modülü (trackVitrinEvent) eklendi; ürün tıklama, kategori filtre ve teklif talepleri loglanıyor.' },
      { type: 'yenilik',     text: 'Ürün kataloğu 5 → 8 ürüne genişletildi (Dana Biftek, Dana Kaburga, Sucuk eklendi).' },
      { type: 'yenilik',     text: 'Teklif talebi formu; sepetteki ürünlerle birlikte ad/telefon/e-posta/not içeriyor.' },
      { type: 'iyileştirme', text: 'Pazarlama modülü ürünleri vitrin kataloğuyla dinamik birleştirildi.' },
      { type: 'iyileştirme', text: 'Ürün kartlarına besin değeri mini barı (kalori, protein) eklendi.' },
      { type: 'düzeltme',    text: 'Sepet sayacının sıfır olduğunda görünür kaldığı hata düzeltildi.' },
      { type: 'güvenlik',    text: 'Brute-force kilitleme süresi 15 dk → 3 dk olarak güncellendi (UX dengesi).' },
    ],
  },
  {
    version: '4.1',
    codename: 'KALKAN',
    date: '5 Mart 2026',
    summary: 'Mobil bottom sheet giriş & multi-dil desteği',
    changes: [
      { type: 'yenilik',     text: 'Mobil giriş için MobileBottomSheet bileşeni eklendi; spring animasyonlu açılma/kapanma.' },
      { type: 'yenilik',     text: 'Çoklu dil desteği (TR/EN/RU/UZ) tüm giriş ekranına uygulandı.' },
      { type: 'yenilik',     text: 'Haber detay modalı; tam içerik görüntüleme ve kapak görseli eklendi.' },
      { type: 'iyileştirme', text: 'Hero carousel otomatik geçiş süresi 4 sn → 6 sn, geçiş animasyonu yumuşatıldı.' },
      { type: 'düzeltme',    text: 'iOS safe-area-inset-bottom nedeniyle giriş butonunun notch arkasında kalması düzeltildi.' },
    ],
  },
  {
    version: '4.0',
    codename: 'KALKAN',
    date: '20 Şubat 2026',
    summary: 'Büyük mimari yenileme — KALKAN sürümü başlangıcı',
    changes: [
      { type: 'yenilik',     text: 'React 18 + Vite 6 + Tailwind CSS 4 tabanlı mimari yenileme.' },
      { type: 'yenilik',     text: 'Radix UI bileşen kütüphanesi entegre edildi.' },
      { type: 'yenilik',     text: 'Supabase entegrasyonu ile çoklu veritabanı senkronizasyon altyapısı kuruldu.' },
      { type: 'yenilik',     text: 'Rol tabanlı erişim kontrolü (Admin / Personel) yeniden tasarlandı.' },
      { type: 'güvenlik',    text: 'SHA-256 şifre hash, CSRF token ve oturum parmak izi güvenlik katmanları eklendi.' },
      { type: 'güvenlik',    text: 'Olağandışı saat tespiti ve cihaz giriş kaydı güvenlik modülü devreye alındı.' },
    ],
  },
];

/** Mevcut (en güncel) versiyon */
export const CURRENT_VERSION = CHANGELOG[0];
