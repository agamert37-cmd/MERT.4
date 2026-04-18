/**
 * Güvenli Depolama — Web Crypto API ile hassas localStorage anahtarları şifrelenir.
 * Şifreleme anahtarı SessionStorage'da tutulur (sekme kapanınca silinir).
 * Uygulama kilitlendiğinde anahtar bellekten temizlenir.
 *
 * Korunan anahtarlar: CouchDB şifresi, oturum token'ları, PIN hash.
 * PouchDB verileri OS düzeyinde şifrelenmiş depolama üzerinde zaten korunur.
 */

const KEY_STORAGE = 'mert4_enc_key';
const IV_LENGTH = 12; // AES-GCM için

// ─── Anahtar üretimi ─────────────────────────────────────────────

/** Oturum başına rastgele AES-GCM anahtarı oluştur */
async function generateSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/** Anahtarı sessionStorage'a kaydet */
async function persistKey(key: CryptoKey): Promise<void> {
  const exported = await crypto.subtle.exportKey('raw', key);
  sessionStorage.setItem(KEY_STORAGE, btoa(String.fromCharCode(...new Uint8Array(exported))));
}

/** sessionStorage'dan anahtarı yükle */
async function loadKey(): Promise<CryptoKey | null> {
  const raw = sessionStorage.getItem(KEY_STORAGE);
  if (!raw) return null;
  try {
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

/** Mevcut anahtarı al veya yeni oluştur */
async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await loadKey();
  if (existing) return existing;
  const newKey = await generateSessionKey();
  await persistKey(newKey);
  return newKey;
}

// ─── Şifreleme / Çözme ───────────────────────────────────────────

/** Metni şifrele — "iv:ciphertext" base64 formatında döner */
export async function encryptValue(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(IV_LENGTH + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), IV_LENGTH);
  return btoa(String.fromCharCode(...combined));
}

/** Şifreli değeri çöz */
export async function decryptValue(ciphertext: string): Promise<string | null> {
  try {
    const key = await loadKey();
    if (!key) return null;
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv = combined.slice(0, IV_LENGTH);
    const data = combined.slice(IV_LENGTH);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

// ─── Şifreli localStorage ────────────────────────────────────────

const SECURE_PREFIX = 'mert4_sec_';

/** Hassas veriyi şifreli olarak localStorage'a yaz */
export async function setSecure(key: string, value: string): Promise<void> {
  const encrypted = await encryptValue(value);
  localStorage.setItem(SECURE_PREFIX + key, encrypted);
}

/** Şifreli localStorage değerini oku ve çöz */
export async function getSecure(key: string): Promise<string | null> {
  const raw = localStorage.getItem(SECURE_PREFIX + key);
  if (!raw) return null;
  return decryptValue(raw);
}

/** Şifreli anahtarı sil */
export function removeSecure(key: string): void {
  localStorage.removeItem(SECURE_PREFIX + key);
}

// ─── Otomatik Ekran Kilidi ────────────────────────────────────────

const LOCK_KEY = 'mert4_app_locked';
const LAST_ACTIVITY_KEY = 'mert4_last_activity';
const DEFAULT_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 dakika

let _lockTimeout: ReturnType<typeof setTimeout> | null = null;
let _lockListeners: Array<() => void> = [];

export function onAppLock(cb: () => void): () => void {
  _lockListeners.push(cb);
  return () => { _lockListeners = _lockListeners.filter(l => l !== cb); };
}

function _fireLock(): void {
  sessionStorage.removeItem(KEY_STORAGE); // şifreleme anahtarını temizle
  localStorage.setItem(LOCK_KEY, '1');
  _lockListeners.forEach(l => l());
}

export function updateActivity(): void {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  if (_lockTimeout) clearTimeout(_lockTimeout);
  _lockTimeout = setTimeout(_fireLock, DEFAULT_LOCK_TIMEOUT_MS);
}

export function isAppLocked(): boolean {
  return localStorage.getItem(LOCK_KEY) === '1';
}

export function unlockApp(): void {
  localStorage.removeItem(LOCK_KEY);
  updateActivity();
}

/** Kilit zamanlayıcısını başlat */
export function startLockTimer(timeoutMs = DEFAULT_LOCK_TIMEOUT_MS): void {
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!raw) {
    // İlk ziyaret — hemen kilitleme, aktiviteyi şimdi kaydet ve timer başlat
    updateActivity();
    return;
  }
  const last = Number(raw);
  const elapsed = Date.now() - last;
  if (elapsed >= timeoutMs) {
    _fireLock();
    return;
  }
  if (_lockTimeout) clearTimeout(_lockTimeout);
  _lockTimeout = setTimeout(_fireLock, timeoutMs - elapsed);
}

export function stopLockTimer(): void {
  if (_lockTimeout) { clearTimeout(_lockTimeout); _lockTimeout = null; }
}

export function getLockTimeoutMs(): number {
  return DEFAULT_LOCK_TIMEOUT_MS;
}
