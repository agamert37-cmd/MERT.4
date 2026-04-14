// [AJAN-2 | claude/serene-gagarin | 2026-03-25]
// CouchDB yapılandırması — PouchDB ↔ CouchDB sync için

// LOCAL ONLY — intentionally not synced (CouchDB server URL may differ per device/location)
const CONFIG_KEY = 'mert4_couchdb_config';

export interface CouchDbConfig {
  url: string;
  user: string;
  password: string;
  peerUrl: string; // diğer bilgisayarın CouchDB adresi
}

/**
 * Varsayılan CouchDB bağlantı noktasını belirle.
 *
 * Öncelik sırası:
 *   1. VITE_COUCHDB_URL env değişkeni (build-time veya .env.local)
 *   2. Tarayıcı origin + '/couchdb' — nginx reverse proxy yolu (Docker)
 *      http://<sunucu>/couchdb  →  nginx  →  http://couchdb:5984
 *      • CORS sorunu olmaz (aynı origin)
 *      • Herhangi bir cihazdan bağlanılabilir (hardcoded localhost değil)
 *      • Docker servis adı (couchdb) ile doğrudan iletişim kurulur
 *   3. Fallback: http://localhost:5984 (doğrudan geliştirme ortamı)
 */
function _defaultCouchUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_COUCHDB_URL;
  if (envUrl) return envUrl;
  // Tarayıcıda çalışıyorsa nginx proxy yolunu kullan (Docker deployment için)
  if (typeof window !== 'undefined') {
    return window.location.origin + '/couchdb';
  }
  return 'http://localhost:5984';
}

const DEFAULT_CONFIG: CouchDbConfig = {
  url: _defaultCouchUrl(),
  user: (import.meta as any).env?.VITE_COUCHDB_USER || 'adm1n',
  password: (import.meta as any).env?.VITE_COUCHDB_PASSWORD || '135790',
  peerUrl: (import.meta as any).env?.VITE_COUCHDB_PEER_URL || '',
};

export function getCouchDbConfig(): CouchDbConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

export function setCouchDbConfig(config: Partial<CouchDbConfig>): void {
  const current = getCouchDbConfig();
  const merged = { ...current, ...config };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
}

export function getCouchDbAuthUrl(): string {
  const { url, user, password } = getCouchDbConfig();
  if (!user) return url;
  try {
    const u = new URL(url);
    u.username = user;
    u.password = password;
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function getPeerCouchDbUrl(): string {
  const { peerUrl, user, password } = getCouchDbConfig();
  if (!peerUrl) return '';
  try {
    const u = new URL(peerUrl);
    if (user) {
      u.username = user;
      u.password = password;
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

// Tüm tablo isimleri (PouchDB database adları)
export const DB_PREFIX = 'mert_';

export const TABLE_NAMES = [
  'fisler',
  'urunler',
  'cari_hesaplar',
  'kasa_islemleri',
  'personeller',
  'bankalar',
  'cekler',
  'araclar',
  'arac_shifts',
  'arac_km_logs',
  'uretim_profilleri',
  'uretim_kayitlari',
  'faturalar',
  'fatura_stok',
  'tahsilatlar',
  'guncelleme_notlari',
  'stok_giris',
] as const;

export type TableName = typeof TABLE_NAMES[number];

export const KV_DB_NAME = 'mert_kv_store';
