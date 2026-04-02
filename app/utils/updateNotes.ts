// ─── Merkezi Güncelleme Veri Dosyası ─────────────────────────────────────────
// Bu dosya tüm uygulama güncellemelerinin tek kaynağıdır.
// Dashboard kartı, UpdateNotesPage ve bildirim sistemi buradan beslenir.

export type UpdateCategory = 'security' | 'feature' | 'bugfix' | 'ui' | 'performance' | 'analytics';

export interface UpdateNote {
  id: string;
  version: string;
  date: string;
  category: UpdateCategory;
  title: string;
  description: string;
  details?: string[];
  impact: 'high' | 'medium' | 'low';
  isNew?: boolean;
  emoji?: string;
}

// Mevcut uygulama versiyonu — her yeni sürümde burası güncellenir
export const CURRENT_VERSION = 'v4.5.0';
export const CURRENT_VERSION = 'v4.4';

// localStorage anahtarı — kullanıcının en son gördüğü versiyon
export const SEEN_VERSION_KEY = 'isleyen_et_last_seen_version';

export const UPDATE_NOTES: UpdateNote[] = [
  // ─── v4.5.0 ──────────────────────────────────────────────────────────────
  {
    id: 'u-017', version: 'v4.5.0', date: '2026-03-27', category: 'feature',
    title: 'PouchDB/CouchDB Çoklu Veritabanı Senkronizasyonu',
    description: 'Supabase tamamen kaldırıldı. Veriler yerel PouchDB\'de saklanıyor, CouchDB ile çift yönlü otomatik senkronizasyon sağlanıyor.',
    details: [
      'docker-compose: CouchDB 3.3 container\'ı eklendi',
      'Nginx /couchdb/ yolu üzerinden proxy — CORS sorunu yok',
      'useTableSync: PouchDB changes feed ile gerçek zamanlı güncelleme',
      'GlobalTableSyncProvider: 15 tablo uygulama genelinde sync',
      'pouchdb-kv: anahtar-değer deposu (oturum, yapılandırma)',
      'Çevrimdışı-first mimari — internet kesilse bile çalışır',
    ],
    impact: 'high', isNew: true, emoji: '🔄',
  },
  {
    id: 'u-018', version: 'v4.5.0', date: '2026-03-27', category: 'bugfix',
    title: 'TypeScript & Çalışma Zamanı Hata Düzeltmeleri',
    description: 'PouchDB geçişi sonrasında oluşan 20+ TypeScript derleme ve çalışma zamanı hatası giderildi.',
    details: [
      'DashboardPage: liveCounter ve useIsMobile eksik değişkenler eklendi',
      'StorageKey\'e 7 yeni anahtar eklendi (POS_DATA, SYSTEM_SETTINGS, vb.)',
      'KasaPage BankWidget import eksikliği giderildi',
      'MobileBottomNav search/setSearch state eklendi',
      'Record<string,...> tip dönüşümleri 8 bileşende düzeltildi',
      'YedeklerPage bulut yedekleme stub fonksiyonları eklendi',
      '@types/pouchdb devDependency kuruldu',
    ],
    impact: 'high', isNew: true, emoji: '🐛',
  },
  {
    id: 'u-019', version: 'v4.5.0', date: '2026-03-27', category: 'feature',
    title: 'Üretim Karışım/Kıyma Sekmesi',
    description: 'Üretim sayfasına birden fazla hammaddeyi karıştırarak tek çıktı üreten Kıyma/Karışım sekmesi eklendi.',
    details: [
      'Birden fazla hammadde seçimi ve oran ayarı',
      'Otomatik maliyet hesaplama (hammadde oranına göre)',
      'Özel marj ve reçete adı tanımlama',
      'Reçete kaydetme ve yeniden kullanma',
    ],
    impact: 'medium', isNew: true, emoji: '🍖',
  },
  {
    id: 'u-020', version: 'v4.5.0', date: '2026-03-27', category: 'security',
    title: 'Güvenlik & Oturum Güçlendirmesi',
    description: 'Personel şifre migration sistemi ve çapraz cihaz zorla oturum kapatma güçlendirildi.',
    details: [
      'Tuzsuz SHA-256 → tuzlu SHA-256 otomatik migration',
      'KV tabanlı cross-device force logout',
      'CURRENT_EMPLOYEE güvenlik doğrulaması güçlendirildi',
    ],
    impact: 'medium', isNew: true, emoji: '🔐',
  },
  // ─── v4.4 ────────────────────────────────────────────────────────────────
  {
    id: 'u-020', version: 'v4.4', date: '2026-03-30', category: 'feature',
    title: 'PouchDB Offline-First Veritabanı',
    description: 'Supabase bağımlılığı kaldırıldı. Tüm veriler artık tarayıcıdaki PouchDB\'de tutulur; CouchDB ile opsiyonel senkronizasyon desteklenir.',
    details: [
      'PouchDB yerel veritabanı tüm modüllerde aktif',
      'Çift-yazma stratejisi: localStorage + PouchDB KV store',
      'Otomatik yedek oluşturma ve indirme',
      'CouchDB endpoint yapılandırması (Ayarlar > Senkronizasyon)',
      'SyncStatusBar ile gerçek zamanlı sync durumu',
    ],
    impact: 'high', isNew: true, emoji: '🗄️',
  },
  {
    id: 'u-021', version: 'v4.4', date: '2026-03-30', category: 'security',
    title: 'Sayfa Bazlı RBAC & Güvenlik İzleme',
    description: 'Her sayfaya rol tabanlı erişim kontrolü ve gerçek zamanlı güvenlik izleme eklendi.',
    details: [
      'getPagePermissions() ile merkezi RBAC yönetimi',
      'usePageSecurity hook: rate limiting ve audit logging',
      'Güvenlik tehdidi tespiti ve log zinciri',
      'Personel sayfasında şifre güçlüğü analizi (PasswordStrengthBar)',
    ],
    impact: 'high', isNew: true, emoji: '🛡️',
  },
  {
    id: 'u-022', version: 'v4.4', date: '2026-03-30', category: 'feature',
    title: 'Modül Olay Yolu (Module Bus)',
    description: 'Sayfalar ve modüller arası iletişim için EventEmitter tabanlı güvenli olay sistemi.',
    details: [
      'ModuleEventMap ile tip-güvenli olaylar',
      'Çek, fatura, stok, üretim modülleri arası anlık bildirim',
      'useModuleBus hook ile kolay abonelik yönetimi',
    ],
    impact: 'medium', isNew: true, emoji: '🔗',
  },
  {
    id: 'u-023', version: 'v4.4', date: '2026-03-30', category: 'bugfix',
    title: 'TypeScript Tip Güvenliği İyileştirmeleri',
    description: '80 TypeScript derleme hatası giderildi. @types/react kurulumu ile tip kontrol sistemi güçlendirildi.',
    details: [
      '@types/react ve @types/react-dom eklendi',
      'ModuleEventMap eksik olay tipleri tamamlandı',
      'SyncContext setupStatus tip genişletmesi',
      'LanguageContext destructuring düzeltmeleri',
      'Framer Motion Variants tip anotasyonları',
    ],
    impact: 'medium', isNew: true, emoji: '🔧',
  },

  // ─── v4.3 ────────────────────────────────────────────────────────────────
  {
    id: 'u-017', version: 'v4.3', date: '2026-03-25', category: 'feature',
    title: 'AI Chat Asistanı',
    description: 'OpenAI GPT entegrasyonu ile ERP verilerinizi doğal dilde sorgulayın.',
    details: [
      'Türkçe sorgu desteği (satış, stok, kasa analizi)',
      'Dinamik grafik oluşturma (Bar, Line, Area, Pie)',
      'Sistem prompt özelleştirme',
      'Cihaza göre yanıt boyutu adaptasyonu',
    ],
    impact: 'high', emoji: '🤖',
  },
  {
    id: 'u-018', version: 'v4.3', date: '2026-03-25', category: 'feature',
    title: 'Araç Takip Modülü',
    description: 'Şirket araçları için kilometre, yakıt, bakım ve masraf takibi.',
    details: [
      'Araç kayıt ve durum yönetimi',
      'Yakıt tüketimi ve km analizi',
      'Bakım hatırlatıcı sistemi',
      'PDF masraf raporu',
    ],
    impact: 'medium', emoji: '🚗',
  },
  {
    id: 'u-019', version: 'v4.3', date: '2026-03-24', category: 'ui',
    title: 'UBL-TR Fatura Desteği',
    description: 'E-fatura formatına uyumlu UBL-TR XML çıktısı ve tevkifatlı fatura desteği.',
    details: [
      'UBL-TR 2.1 formatında XML üretimi',
      'Tevkifat hesaplama (KDV stopaj)',
      'E-arşiv uyumlu fiş numaralandırma',
    ],
    impact: 'high', emoji: '📄',
  },

  // ─── v4.2.2 ──────────────────────────────────────────────────────────────
  {
    id: 'u-013', version: 'v4.2.2', date: '2026-03-22', category: 'ui',
    title: 'Mobil Arayüz Yeniden Tasarımı',
    description: 'Alt navigasyon çubuğu ve header kompakt biçimde yeniden tasarlandı. Erişilebilirlik ve kullanılabilirlik önemli ölçüde iyileştirildi.',
    details: [
      '4 sütunlu "Tüm Modüller" drawer (eskiden 3 sütundu)',
      'Drawer içinde anlık modül arama özelliği',
      'Pill-style aktif sekme göstergesi (arka plan + üst çizgi)',
      'Header yüksekliği 3.5rem → 2.75rem (daha fazla içerik alanı)',
      'Mobilde dil seçici gizlendi, header sadelendirildi',
      'Kritik stok badge: mobilde ikon-only, sm+ tam görünüm',
      'ARIA rolleri eklendi (aria-label, aria-current, aria-expanded)',
    ],
    impact: 'high', isNew: true, emoji: '📱',
  },
  {
    id: 'u-014', version: 'v4.2.2', date: '2026-03-22', category: 'bugfix',
    title: 'Mobil Profil Dairesi & Şifre Değiştirme Düzeltmesi',
    description: 'Mobil cihazlarda profil dairesi görünmüyor ve şifre değiştirme alanları sığmıyordu. Her iki sorun da giderildi.',
    details: [
      'Header sağ üstüne profil avatar butonu eklendi (mobil)',
      'Mobil sidebar alt kısmına profil kartı + "Profili Düzenle" butonu',
      'ProfileEditModal: mobilde ekran altından yükselen bottom sheet',
      'Şifre + PIN grid-cols-2 → grid-cols-1 (mobilde sıkışma sorunu)',
      'Mobil drag indicator eklendi (kullanıcı deneyimi)',
    ],
    impact: 'high', isNew: true, emoji: '🔐',
  },
  {
    id: 'u-015', version: 'v4.2.2', date: '2026-03-22', category: 'performance',
    title: 'Kullanılmayan Dosya Temizliği',
    description: '48 kullanılmayan dosya projeden kaldırıldı. Build süresi ve bundle boyutu optimize edildi.',
    details: [
      'customerIntelligence.ts kaldırıldı (hiç kullanılmıyordu)',
      'app/components/ui/ klasörü silindi (46 shadcn bileşeni — uygulama zaten Radix UI kullanıyor)',
      'Build dosya sayısı 4000+ → optimize çıktı',
      'Kod tabanı daha temiz ve sürdürülebilir hale getirildi',
    ],
    impact: 'medium', isNew: true, emoji: '🧹',
  },
  {
    id: 'u-016', version: 'v4.2.2', date: '2026-03-22', category: 'feature',
    title: 'Güncelleme Bildirim Sistemi',
    description: 'Yeni bir versiyon yayınlandığında kullanıcılar otomatik olarak bildirim alıyor. Güncelleme notları artık merkezi bir veri kaynağından besleniyor.',
    details: [
      'Yeni versiyon tespitinde otomatik bildirim (localStorage bazlı)',
      'Dashboard, UpdateNotesPage ve bildirimler tek veri kaynağı kullanıyor',
      'Güncelleme notları panelinde "okundu" işaretleme',
      'NotificationPanel mobil responsive düzeltmesi',
    ],
    impact: 'medium', isNew: true, emoji: '🔔',
  },

  // ─── v4.2.1 ──────────────────────────────────────────────────────────────
  {
    id: 'u-001', version: 'v4.2.1', date: '2026-03-22', category: 'feature',
    title: 'Canlı Dashboard Grafikleri',
    description: 'Dashboard artık her 15 saniyede otomatik olarak yenileniyor. Saatlik ciro akışı ve kârlılık trend grafikleri eklendi.',
    details: [
      'Saatlik ciro akışı grafiği (Area + Bar kombine)',
      '7 günlük kârlılık trendi (Net Kâr + Kâr Oranı çift eksen)',
      'Stat kartlarında canlı nabız animasyonu',
      'Otomatik yenileme göstergesi (15s aralık)',
    ],
    impact: 'high', emoji: '📊',
  },
  {
    id: 'u-002', version: 'v4.2.1', date: '2026-03-22', category: 'analytics',
    title: 'Güncelleme Notları Paneli',
    description: 'Güvenlik Kalkanı bölümünde tüm güncellemeler, özellikler ve düzeltmeler detaylı olarak listeleniyor.',
    details: [
      'Kategori bazlı filtreleme (Güvenlik, Özellik, Düzeltme...)',
      'Etki seviyesi göstergeleri',
      'Arama fonksiyonu',
      'Versiyon bazlı gruplama',
    ],
    impact: 'medium', emoji: '📋',
  },
  {
    id: 'u-003', version: 'v4.2.1', date: '2026-03-22', category: 'performance',
    title: 'Dashboard Render Optimizasyonu',
    description: 'Canlı saat bileşeni izole edildi, ana dashboard her saniye yeniden render edilmiyor.',
    details: [
      'LiveClockWidget ayrı bileşene taşındı',
      'useMemo ile veri hesaplamaları optimize edildi',
      'Sparkline genişletildi, karşılaştırma etiketi eklendi',
    ],
    impact: 'medium', emoji: '⚡',
  },

  // ─── v4.2 ────────────────────────────────────────────────────────────────
  {
    id: 'u-004', version: 'v4.2', date: '2026-03-20', category: 'security',
    title: 'Brute Force Koruması',
    description: 'Ardışık başarısız giriş denemelerinde hesap otomatik olarak kilitleniyor.',
    details: [
      '5 başarısız denemeden sonra 15 dakika hesap kilidi',
      'IP bazlı oran sınırlama',
      'Güvenlik loglarına otomatik kayıt',
    ],
    impact: 'high', emoji: '🛡️',
  },
  {
    id: 'u-005', version: 'v4.2', date: '2026-03-20', category: 'security',
    title: 'Otomatik Oturum Kapatma',
    description: '15 dakika hareketsizlik sonrası oturum otomatik olarak sonlandırılıyor.',
    details: [
      'Mouse/klavye hareketi izleme',
      'Oturum süresi dolmadan uyarı',
      'Güvenli çıkış ve veri temizliği',
    ],
    impact: 'high', emoji: '🔒',
  },
  {
    id: 'u-006', version: 'v4.2', date: '2026-03-20', category: 'feature',
    title: 'Güvenlik Merkezi Modülü',
    description: 'Tüm güvenlik ayarları ve logları tek noktadan yönetiliyor.',
    details: [
      'Güvenlik skoru (A-F derecelendirme)',
      'Aktif oturum yönetimi ve zorla çıkış',
      'Tehdit seviyesi sınıflandırması',
      '2FA yapılandırma desteği',
    ],
    impact: 'high', emoji: '🔐',
  },
  {
    id: 'u-007', version: 'v4.2', date: '2026-03-20', category: 'ui',
    title: 'Karanlık Tema & Cam Efektleri',
    description: 'Arayüz karanlık tema ile yeniden tasarlandı. Frosted glass ve glow efektleri eklendi.',
    details: [
      'Catppuccin Mocha renk paleti',
      'Backdrop blur efektleri',
      'Animasyonlu hover ve tap efektleri',
    ],
    impact: 'medium', emoji: '🎨',
  },
  {
    id: 'u-008', version: 'v4.2', date: '2026-03-20', category: 'analytics',
    title: 'Gelişmiş Analiz Grafikleri',
    description: 'Dashboard\'a profesyonel seviyede analitik grafikler eklendi.',
    details: [
      'Performans Radarı (6 boyutlu işletme analizi)',
      'Saatlik Satış Isı Haritası',
      'Satış Hunisi dönüşüm oranları',
      'Nakit Akışı Waterfall grafiği',
      'KPI Ticker bant',
    ],
    impact: 'high', emoji: '📈',
  },
  {
    id: 'u-009', version: 'v4.2', date: '2026-03-19', category: 'bugfix',
    title: 'Stok ve Fiş Hesaplama Düzeltmeleri',
    description: 'Kritik stok hesaplama ve fiş tutarı doğruluğu iyileştirildi.',
    details: [
      'safeNum fonksiyonu ile NaN koruması',
      'İade fişlerinde negatif tutar düzeltmesi',
      'Boş ürün adı kontrolü',
    ],
    impact: 'medium', emoji: '🐛',
  },
  {
    id: 'u-010', version: 'v4.2', date: '2026-03-19', category: 'feature',
    title: 'Aktivite Loglaması',
    description: 'Tüm kullanıcı işlemleri detaylı olarak loglanıyor.',
    details: [
      'Sayfa ziyaretleri, satış/alış işlemleri',
      'PDF rapor indirme kayıtları',
      'Silme işlemleri (kim, ne zaman, ne)',
    ],
    impact: 'medium', emoji: '📝',
  },

  // ─── v4.1 ────────────────────────────────────────────────────────────────
  {
    id: 'u-011', version: 'v4.1', date: '2026-03-15', category: 'feature',
    title: 'Müşteri Zekası Algoritması v2',
    description: 'Cari hesaplar için gelişmiş müşteri analizi ve skorlama sistemi.',
    details: [
      'RFM analizi (Recency, Frequency, Monetary)',
      'Müşteri segmentasyonu',
      'Churn risk tahmini',
    ],
    impact: 'high', emoji: '🧠',
  },
  {
    id: 'u-012', version: 'v4.1', date: '2026-03-14', category: 'performance',
    title: 'Veritabanı Senkronizasyon Optimizasyonu',
    description: 'Çoklu veritabanı senkronizasyonu ve gerçek zamanlı veri akışı.',
    details: [
      'Supabase realtime subscription',
      'Otomatik conflict resolution',
      'Offline-first veri stratejisi',
    ],
    impact: 'high', emoji: '🔄',
  },
];

// Yardımcı: "yeni" sayısı (henüz görülmemiş versiyon varsa)
export function getNewUpdateCount(): number {
  const seen = localStorage.getItem(SEEN_VERSION_KEY);
  if (!seen || seen !== CURRENT_VERSION) {
    return UPDATE_NOTES.filter(n => n.isNew).length;
  }
  return 0;
}

// Yardımcı: en son N güncellemeyi getir (dashboard kartı için)
export function getLatestUpdates(count = 8): UpdateNote[] {
  return UPDATE_NOTES.slice(0, count);
}

// Yardımcı: versiyon grupları oluştur
export function getVersionGroups(notes: UpdateNote[]) {
  const groups: Record<string, UpdateNote[]> = {};
  notes.forEach(note => {
    if (!groups[note.version]) groups[note.version] = [];
    groups[note.version].push(note);
  });
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }));
}
