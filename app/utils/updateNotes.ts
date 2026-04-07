// ─── Merkezi Güncelleme Veri Dosyası ─────────────────────────────────────────
// Güncelleme notları artık PouchDB/CouchDB'de saklanıyor.
// SEED_NOTES: ilk kurulumda DB boşsa otomatik yüklenen başlangıç verileri.
// Yeni notlar Güncelleme Merkezi UI'ından (yönetici) eklenebilir.

import { getDb } from '../lib/pouchdb';

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

// localStorage anahtarı — kullanıcının en son gördüğü versiyon
export const SEEN_VERSION_KEY = 'isleyen_et_last_seen_version';

// ─── Başlangıç seed verisi ────────────────────────────────────────────────────
// DB boşken bir kez yüklenir. Sonraki eklemeler doğrudan DB'ye yapılır.

export const SEED_NOTES: UpdateNote[] = [
  // ─── v4.5.0 ──────────────────────────────────────────────────────────────
  {
    id: 'u-017', version: 'v4.5.0', date: '2026-03-27', category: 'feature',
    title: 'PouchDB/CouchDB Çoklu Veritabanı Senkronizasyonu',
    description: 'Supabase tamamen kaldırıldı. Veriler yerel PouchDB\'de saklanıyor, CouchDB ile çift yönlü otomatik senkronizasyon sağlanıyor.',
    details: [
      'docker-compose: CouchDB 3.3 container\'ı eklendi',
      'Nginx /couchdb/ yolu üzerinden proxy — CORS sorunu yok',
      'useTableSync: PouchDB changes feed ile gerçek zamanlı güncelleme',
      'GlobalTableSyncProvider: 16 tablo uygulama genelinde sync',
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
    id: 'u-021', version: 'v4.4', date: '2026-03-30', category: 'feature',
    title: 'PouchDB Offline-First Veritabanı',
    description: 'Supabase bağımlılığı kaldırıldı. Tüm veriler artık tarayıcıdaki PouchDB\'de tutulur; CouchDB ile opsiyonel senkronizasyon desteklenir.',
    details: [
      'PouchDB yerel veritabanı tüm modüllerde aktif',
      'Çift-yazma stratejisi: localStorage + PouchDB KV store',
      'Otomatik yedek oluşturma ve indirme',
      'CouchDB endpoint yapılandırması (Ayarlar > Senkronizasyon)',
      'SyncStatusBar ile gerçek zamanlı sync durumu',
    ],
    impact: 'high', emoji: '🗄️',
  },
  {
    id: 'u-022', version: 'v4.4', date: '2026-03-30', category: 'security',
    title: 'Sayfa Bazlı RBAC & Güvenlik İzleme',
    description: 'Her sayfaya rol tabanlı erişim kontrolü ve gerçek zamanlı güvenlik izleme eklendi.',
    details: [
      'getPagePermissions() ile merkezi RBAC yönetimi',
      'usePageSecurity hook: rate limiting ve audit logging',
      'Güvenlik tehdidi tespiti ve log zinciri',
    ],
    impact: 'high', emoji: '🛡️',
  },
  {
    id: 'u-023', version: 'v4.4', date: '2026-03-30', category: 'feature',
    title: 'Modül Olay Yolu (Module Bus)',
    description: 'Sayfalar ve modüller arası iletişim için EventEmitter tabanlı güvenli olay sistemi.',
    details: [
      'ModuleEventMap ile tip-güvenli olaylar',
      'Çek, fatura, stok, üretim modülleri arası anlık bildirim',
      'useModuleBus hook ile kolay abonelik yönetimi',
    ],
    impact: 'medium', emoji: '🔗',
  },
  // ─── v4.3 ────────────────────────────────────────────────────────────────
  {
    id: 'u-024', version: 'v4.3', date: '2026-03-25', category: 'feature',
    title: 'AI Chat Asistanı',
    description: 'OpenAI GPT entegrasyonu ile ERP verilerinizi doğal dilde sorgulayın.',
    details: [
      'Türkçe sorgu desteği (satış, stok, kasa analizi)',
      'Dinamik grafik oluşturma (Bar, Line, Area, Pie)',
      'Sistem prompt özelleştirme',
    ],
    impact: 'high', emoji: '🤖',
  },
  {
    id: 'u-025', version: 'v4.3', date: '2026-03-25', category: 'feature',
    title: 'Araç Takip Modülü',
    description: 'Şirket araçları için kilometre, yakıt, bakım ve masraf takibi.',
    details: [
      'Araç kayıt ve durum yönetimi',
      'Yakıt tüketimi ve km analizi',
      'Bakım hatırlatıcı sistemi',
    ],
    impact: 'medium', emoji: '🚗',
  },
  // ─── v4.2 ────────────────────────────────────────────────────────────────
  {
    id: 'u-026', version: 'v4.2', date: '2026-03-20', category: 'security',
    title: 'Brute Force Koruması & Otomatik Oturum Kapatma',
    description: 'Ardışık başarısız giriş denemelerinde hesap otomatik olarak kilitleniyor. 15 dakika hareketsizlik sonrası oturum sonlandırılıyor.',
    details: [
      '5 başarısız denemeden sonra 15 dakika hesap kilidi',
      'IP bazlı oran sınırlama',
      'Mouse/klavye hareketi izleme',
    ],
    impact: 'high', emoji: '🛡️',
  },
  {
    id: 'u-027', version: 'v4.2', date: '2026-03-20', category: 'ui',
    title: 'Karanlık Tema & Cam Efektleri',
    description: 'Arayüz karanlık tema ile yeniden tasarlandı. Frosted glass ve glow efektleri eklendi.',
    details: ['Catppuccin Mocha renk paleti', 'Backdrop blur efektleri'],
    impact: 'medium', emoji: '🎨',
  },
  {
    id: 'u-028', version: 'v4.2', date: '2026-03-20', category: 'analytics',
    title: 'Gelişmiş Analiz Grafikleri',
    description: 'Dashboard\'a profesyonel seviyede analitik grafikler eklendi.',
    details: [
      'Performans Radarı (6 boyutlu işletme analizi)',
      'Saatlik Satış Isı Haritası',
      'Nakit Akışı Waterfall grafiği',
    ],
    impact: 'high', emoji: '📈',
  },
];

// ─── Veritabanı işlemleri ─────────────────────────────────────────────────────

const DB_NAME = 'guncelleme_notlari';

/** Güncelleme notlarını PouchDB'ye seed et (tablo boşsa). */
export async function seedUpdateNotesToDb(): Promise<number> {
  const db = getDb(DB_NAME);
  const info = await db.info();
  if (info.doc_count > 0) return 0; // zaten dolu, atla

  const docs = SEED_NOTES.map(note => ({ ...note, _id: note.id }));
  const results = await db.bulkDocs(docs);
  return (results as any[]).filter((r: any) => !r.error).length;
}

/** Yeni güncelleme notu ekle. */
export async function addUpdateNote(note: Omit<UpdateNote, 'id'>): Promise<UpdateNote> {
  const db = getDb(DB_NAME);
  const id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const doc: UpdateNote = { ...note, id };
  await db.put({ ...doc, _id: id });
  return doc;
}

/** Mevcut notu güncelle. */
export async function updateUpdateNote(id: string, changes: Partial<UpdateNote>): Promise<void> {
  const db = getDb(DB_NAME);
  const existing = await db.get(id) as any;
  await db.put({ ...existing, ...changes, _id: id });
}

/** Güncelleme notunu sil. */
export async function deleteUpdateNote(id: string): Promise<void> {
  const db = getDb(DB_NAME);
  const doc = await db.get(id) as any;
  await db.remove(doc._id, doc._rev);
}

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

export function getNewUpdateCount(): number {
  const seen = localStorage.getItem(SEEN_VERSION_KEY);
  if (!seen || seen !== CURRENT_VERSION) {
    return SEED_NOTES.filter(n => n.isNew).length;
  }
  return 0;
}

export function getLatestUpdates(count = 8): UpdateNote[] {
  return SEED_NOTES.slice(0, count);
}

export function getVersionGroups(notes: UpdateNote[]) {
  const groups: Record<string, UpdateNote[]> = {};
  notes.forEach(note => {
    if (!groups[note.version]) groups[note.version] = [];
    groups[note.version].push(note);
  });
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }));
}

// Geriye dönük uyumluluk — eski kod UPDATE_NOTES'u referans alıyorsa bozulmasın
export const UPDATE_NOTES = SEED_NOTES;
