// [AJAN-2 | claude/serene-gagarin | 2026-03-25]
// CouchDB yapılandırması — PouchDB ↔ CouchDB sync için

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
 * Tarayıcıda:  site ile aynı origin üzerinden nginx proxy kullanılır.
 *   http://localhost:8080/couchdb  →  nginx  →  http://couchdb:5984
 *   • CORS sorunu olmaz (aynı origin)
 *   • Yerel kurulu CouchDB ile çakışmaz
 *   • Docker CouchDB'sine ulaşır
 *
 * .env.local değeri varsa (updater.py yapılandırması) önceliklidir.
 */
function _defaultCouchUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_COUCHDB_URL;
  if (envUrl) return envUrl;
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
] as const;

export type TableName = typeof TABLE_NAMES[number];

export const KV_DB_NAME = 'mert_kv_store';
