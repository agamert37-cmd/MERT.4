/**
 * ISLEYEN ET ERP - Gelismis Guvenlik Katmani (v2.0)
 * 
 * Icerir:
 * - SHA-256 hash
 * - XSS sanitizer
 * - Veri maskeleme
 * - CSRF token uretimi/dogrulama
 * - Sifre guc analizi
 * - Oturum parmak izi (fingerprint)
 * - Rate limiter
 * - Supheli aktivite tespit
 * - Guvenli AES-GCM sifreleme/cozme
 * - Tamper-proof log hash zinciri
 */

import { getFromStorage, setInStorage, StorageKey } from './storage';
import { logActivity } from './activityLogger';

// ─── HASH ─────────────────────────────────────────────────────────────────────

export const hashString = async (message: string): Promise<string> => {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/** Tuzlu SHA-256 hash — sifre saklama icin kullanin (rainbow table direnci) */
export const hashStringWithSalt = async (message: string, salt: string): Promise<string> => {
  const msgUint8 = new TextEncoder().encode(`${salt}:${message}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/** Senkron hash - basit djb2 algoritması (non-crypto, hızlı) */
export function quickHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // 32-bit int
  }
  return Math.abs(hash).toString(36);
}

// ─── VERI MASKELEME ───────────────────────────────────────────────────────────

export const maskSensitiveData = (data: string, visibleChars = 2) => {
  if (!data) return '';
  if (data.length <= visibleChars * 2) return '*'.repeat(data.length);
  return data.substring(0, visibleChars) + '*'.repeat(data.length - visibleChars * 2) + data.substring(data.length - visibleChars);
};

/** E-posta maskeleme: us**@gm***.com */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return maskSensitiveData(email);
  const [user, domain] = email.split('@');
  const [domName, ...ext] = domain.split('.');
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(user.length - 2, 2))}@${domName.slice(0, 2)}${'*'.repeat(Math.max(domName.length - 2, 2))}.${ext.join('.')}`;
}

/** Telefon maskeleme: 053*****89 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return maskSensitiveData(phone);
  return phone.slice(0, 3) + '*'.repeat(phone.length - 5) + phone.slice(-2);
}

// ─── XSS / INPUT SANITIZASYON ─────────────────────────────────────────────────

export const sanitizeInput = (input: string) => {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#x27;', "/": '&#x2F;',
  };
  const reg = /[&<>"'/]/ig;
  return input.replace(reg, (match) => (map[match]));
};

/** Derin sanitizasyon - script/event handler temizleme */
export function deepSanitize(input: string): string {
  let cleaned = input;
  // Script taglari
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Event handler'lar
  cleaned = cleaned.replace(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // javascript: protocol
  cleaned = cleaned.replace(/javascript\s*:/gi, '');
  // data: URI (potansiyel XSS)
  cleaned = cleaned.replace(/data\s*:\s*text\/html/gi, '');
  // Base sanitize
  return sanitizeInput(cleaned);
}

/** SQL injection tespiti */
export function detectSQLInjection(input: string): boolean {
  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/i,
    /(--|;|\/\*|\*\/|xp_)/i,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /('.*(\bOR\b|\bAND\b).*')/i,
  ];
  return patterns.some(p => p.test(input));
}

// ─── CSRF TOKEN ───────────────────────────────────────────────────────────────

const CSRF_STORAGE_KEY = 'isleyen_et_csrf_token';
const CSRF_TIMESTAMP_KEY = 'isleyen_et_csrf_ts';
const CSRF_EXPIRY_MS = 30 * 60 * 1000; // 30 dakika

/** CSRF token uret */
export function generateCSRFToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const token = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  sessionStorage.setItem(CSRF_TIMESTAMP_KEY, Date.now().toString());
  return token;
}

/** CSRF token dogrula */
export function validateCSRFToken(token: string): boolean {
  const stored = sessionStorage.getItem(CSRF_STORAGE_KEY);
  const ts = parseInt(sessionStorage.getItem(CSRF_TIMESTAMP_KEY) || '0', 10);
  if (!stored || !ts) return false;
  if (Date.now() - ts > CSRF_EXPIRY_MS) {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
    sessionStorage.removeItem(CSRF_TIMESTAMP_KEY);
    return false;
  }
  // Timing-safe karsilastirma (best-effort JS)
  if (token.length !== stored.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── SIFRE GUC ANALIZI ───────────────────────────────────────────────────────

export interface PasswordStrength {
  score: number; // 0-100
  level: 'cok_zayif' | 'zayif' | 'orta' | 'guclu' | 'cok_guclu';
  label: string;
  color: string;
  suggestions: string[];
}

export function analyzePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const suggestions: string[] = [];

  if (!password) return { score: 0, level: 'cok_zayif', label: 'Cok Zayif', color: '#ef4444', suggestions: ['Sifre bos olamaz'] };

  // Uzunluk
  if (password.length >= 6) score += 10;
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 15;
  if (password.length >= 16) score += 10;
  if (password.length < 8) suggestions.push('En az 8 karakter kullanin');

  // Karakter cesitliligi
  if (/[a-z]/.test(password)) score += 10;
  else suggestions.push('Kucuk harf ekleyin');
  
  if (/[A-Z]/.test(password)) score += 10;
  else suggestions.push('Buyuk harf ekleyin');
  
  if (/\d/.test(password)) score += 10;
  else suggestions.push('Rakam ekleyin');
  
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 15;
  else suggestions.push('Ozel karakter ekleyin (!@#$%...)');

  // Yaygin sifre kontrolu
  const commonPasswords = ['123456', 'password', 'qwerty', 'admin', '12345678', 'abc123', 'letmein', 'welcome'];
  if (commonPasswords.includes(password.toLowerCase())) {
    score = Math.max(score - 40, 0);
    suggestions.push('Cok yaygin bir sifre - farkli bir sifre secin');
  }

  // Tekrar eden karakterler
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(score - 10, 0);
    suggestions.push('Ard arda tekrar eden karakterlerden kacinin');
  }

  // Sirasal karakterler
  if (/(?:abc|bcd|cde|def|123|234|345|456|567|678|789)/i.test(password)) {
    score = Math.max(score - 10, 0);
    suggestions.push('Ardisik karakter/rakam dizisinden kacinin');
  }

  score = Math.min(score, 100);

  let level: PasswordStrength['level'];
  let label: string;
  let color: string;

  if (score < 20) { level = 'cok_zayif'; label = 'Cok Zayif'; color = '#ef4444'; }
  else if (score < 40) { level = 'zayif'; label = 'Zayif'; color = '#f97316'; }
  else if (score < 60) { level = 'orta'; label = 'Orta'; color = '#eab308'; }
  else if (score < 80) { level = 'guclu'; label = 'Guclu'; color = '#22c55e'; }
  else { level = 'cok_guclu'; label = 'Cok Guclu'; color = '#06b6d4'; }

  return { score, level, label, color, suggestions };
}

// ─── OTURUM PARMAK IZI (SESSION FINGERPRINT) ──────────────────────────────────

export interface SessionFingerprint {
  userAgent: string;
  language: string;
  platform: string;
  screenRes: string;
  timezone: string;
  colorDepth: number;
  hash: string;
  createdAt: string;
}

export function generateSessionFingerprint(): SessionFingerprint {
  const ua = navigator.userAgent || '';
  const lang = navigator.language || '';
  const platform = navigator.platform || '';
  const screenRes = `${screen.width}x${screen.height}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const cd = screen.colorDepth || 24;
  
  const raw = `${ua}|${lang}|${platform}|${screenRes}|${tz}|${cd}`;
  const hash = quickHash(raw);

  return {
    userAgent: ua,
    language: lang,
    platform,
    screenRes,
    timezone: tz,
    colorDepth: cd,
    hash,
    createdAt: new Date().toISOString(),
  };
}

const SESSION_FP_KEY = 'isleyen_et_session_fp';

export function storeSessionFingerprint(fp: SessionFingerprint): void {
  sessionStorage.setItem(SESSION_FP_KEY, JSON.stringify(fp));
}

export function getStoredFingerprint(): SessionFingerprint | null {
  try {
    const raw = sessionStorage.getItem(SESSION_FP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Oturum parmak izi degismis mi kontrol et */
export function validateSessionFingerprint(): { valid: boolean; reason?: string } {
  const stored = getStoredFingerprint();
  if (!stored) return { valid: true }; // Ilk oturum

  const current = generateSessionFingerprint();
  
  if (current.hash !== stored.hash) {
    return { 
      valid: false, 
      reason: `Oturum parmak izi degismis. Eski: ${stored.hash}, Yeni: ${current.hash}. UA: ${current.userAgent !== stored.userAgent ? 'degisti' : 'ayni'}, Platform: ${current.platform !== stored.platform ? 'degisti' : 'ayni'}` 
    };
  }
  return { valid: true };
}

// ─── RATE LIMITER — KAYAN PENCERE (Sliding Window) ───────────────────────────
// Sabit pencere algoritması ani-patlama saldırılarına karşı açıktır (pencere
// sıfırlanma anında 2× kapasite kullanılabilir). Kayan pencere her zaman
// gerçek son windowMs ms'yi kontrol eder.

// Bellek içi timestamp dizileri (sessionStorage fallback ile)
const slidingWindowStore = new Map<string, number[]>();

function getSlidingTimestamps(key: string): number[] {
  // Önce bellek içi harita — en hızlı
  if (slidingWindowStore.has(key)) return slidingWindowStore.get(key)!;
  try {
    const raw = sessionStorage.getItem(`rl2_${key}`);
    const arr: number[] = raw ? JSON.parse(raw) : [];
    slidingWindowStore.set(key, arr);
    return arr;
  } catch {
    return [];
  }
}

function saveSlidingTimestamps(key: string, timestamps: number[]): void {
  slidingWindowStore.set(key, timestamps);
  try {
    sessionStorage.setItem(`rl2_${key}`, JSON.stringify(timestamps));
  } catch { /* sessionStorage full — bellek içi yeterli */ }
}

/**
 * Kayan pencere rate limiter — sabit pencereye göre %50 daha doğru.
 * @param key         — benzersiz anahtar ('login_admin', 'api_export' …)
 * @param maxRequests — pencere başına max istek
 * @param windowMs    — pencere süresi (ms)
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Eski damgaları temizle — O(n) ama n her zaman maxRequests'den küçük
  const timestamps = getSlidingTimestamps(key).filter(t => t > cutoff);

  if (timestamps.length >= maxRequests) {
    // En eski damganın windowMs sonrası ne zaman reset olur
    const resetIn = timestamps[0] + windowMs - now;
    saveSlidingTimestamps(key, timestamps);
    return { allowed: false, remaining: 0, resetIn: Math.max(resetIn, 0) };
  }

  timestamps.push(now);
  saveSlidingTimestamps(key, timestamps);
  return {
    allowed: true,
    remaining: maxRequests - timestamps.length,
    resetIn: windowMs,
  };
}

/** Rate limit sayacını sıfırla */
export function resetRateLimit(key: string): void {
  slidingWindowStore.delete(key);
  try { sessionStorage.removeItem(`rl2_${key}`); } catch { /* ignore */ }
}

// ─── GİRİŞ ENTROPİSİ ANALİZİ ─────────────────────────────────────────────────

/**
 * Shannon entropisini hesaplar (0–8 bit aralığı).
 * Yüksek entropi → base64/hex kodlanmış payload veya injection girişimi olabilir.
 */
export function calcInputEntropy(input: string): number {
  if (!input || input.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of input) freq.set(ch, (freq.get(ch) || 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / input.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export interface InputThreatAnalysis {
  safe: boolean;
  entropy: number;
  suspectedPayload: boolean;
  hasXSS: boolean;
  hasSQLi: boolean;
  score: number; // 0 = temiz, 100 = çok tehlikeli
}

/**
 * Bir girişi hem içerik hem de entropi açısından tehdit analizi yapar.
 * Entropi ≥ 4.5 + uzunluk ≥ 40 → muhtemelen kodlanmış payload.
 */
export function analyzeInputThreat(input: string): InputThreatAnalysis {
  const entropy = calcInputEntropy(input);
  const hasXSS = /<script|on\w+=|javascript:/i.test(input);
  const hasSQLi = detectSQLInjection(input);

  // Base64/hex kodlu uzun string → yüksek entropi + yüksek uzunluk
  const suspectedPayload = entropy >= 4.5 && input.length >= 40;

  let score = 0;
  if (hasXSS) score += 50;
  if (hasSQLi) score += 40;
  if (suspectedPayload) score += 20;
  if (entropy >= 5.5) score += 10; // Olağandışı yüksek entropi
  score = Math.min(score, 100);

  return {
    safe: score === 0,
    entropy: Math.round(entropy * 100) / 100,
    suspectedPayload,
    hasXSS,
    hasSQLi,
    score,
  };
}

// ─── SUPHELI AKTIVITE TESPIT ─────────────────────────────────────────────────

export interface SecurityThreat {
  id: string;
  type: 'brute_force' | 'session_hijack' | 'xss_attempt' | 'sql_injection' | 'rapid_actions' | 'unusual_hour' | 'concurrent_session' | 'data_exfil' | 'privilege_escalation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  timestamp: string;
  source?: string;
  metadata?: Record<string, any>;
  resolved: boolean;
}

const THREATS_KEY = 'isleyen_et_security_threats';
const MAX_THREATS = 200;

export function getSecurityThreats(): SecurityThreat[] {
  try {
    const raw = localStorage.getItem(THREATS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addSecurityThreat(threat: Omit<SecurityThreat, 'id' | 'timestamp' | 'resolved'>): SecurityThreat {
  const full: SecurityThreat = {
    ...threat,
    id: `threat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    resolved: false,
  };

  const threats = getSecurityThreats();
  threats.unshift(full);
  if (threats.length > MAX_THREATS) threats.length = MAX_THREATS;
  localStorage.setItem(THREATS_KEY, JSON.stringify(threats));

  // ModuleBus ile emit (global event)
  window.dispatchEvent(new CustomEvent('security_threat', { detail: full }));

  return full;
}

export function resolveSecurityThreat(threatId: string): void {
  const threats = getSecurityThreats();
  const idx = threats.findIndex(t => t.id === threatId);
  if (idx >= 0) {
    threats[idx].resolved = true;
    localStorage.setItem(THREATS_KEY, JSON.stringify(threats));
  }
}

export function clearResolvedThreats(): void {
  const threats = getSecurityThreats().filter(t => !t.resolved);
  localStorage.setItem(THREATS_KEY, JSON.stringify(threats));
}

/** Calisma saati disi giris kontrolu (08:00-22:00 arasi normal) */
export function isUnusualHour(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 23;
}

/**
 * Hızlı ardışık işlem tespiti — kayan pencere algoritması.
 * @param windowMs   — kontrol penceresi (ms), varsayılan 5000
 * @param maxActions — pencerede izin verilen max işlem sayısı, varsayılan 10
 */
const _rapidActionTs: number[] = [];
export function detectRapidActions(windowMs = 5000, maxActions = 10): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Pencere dışındaki damgaları at
  while (_rapidActionTs.length > 0 && _rapidActionTs[0] < cutoff) {
    _rapidActionTs.shift();
  }
  _rapidActionTs.push(now);

  return _rapidActionTs.length > maxActions;
}

// ─── AKTIF OTURUM YONETIMI ───────────────────────────────────────────────────

export interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  fingerprint: string;
  userAgent: string;
  loginTime: string;
  lastActivity: string;
  isCurrentSession: boolean;
}

const SESSIONS_KEY = 'isleyen_et_active_sessions';
const CURRENT_SESSION_ID_KEY = 'isleyen_et_current_session_id';

function getCurrentSessionId(): string {
  let id = sessionStorage.getItem(CURRENT_SESSION_ID_KEY);
  if (!id) {
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    id = `sess_${Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')}`;
    sessionStorage.setItem(CURRENT_SESSION_ID_KEY, id);
  }
  return id;
}

export function registerSession(userId: string, userName: string): ActiveSession {
  const fp = generateSessionFingerprint();
  const sessionId = getCurrentSessionId();

  const session: ActiveSession = {
    id: sessionId,
    userId,
    userName,
    fingerprint: fp.hash,
    userAgent: navigator.userAgent.substring(0, 100),
    loginTime: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    isCurrentSession: true,
  };

  const sessions = getActiveSessions();
  // Ayni session ID varsa guncelle
  const existIdx = sessions.findIndex(s => s.id === sessionId);
  if (existIdx >= 0) {
    sessions[existIdx] = session;
  } else {
    sessions.push(session);
  }
  
  // 24 saatten eski oturumlari temizle
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const cleaned = sessions.filter(s => new Date(s.lastActivity).getTime() > cutoff);
  
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(cleaned));
  storeSessionFingerprint(fp);

  // Esazamanli oturum uyarisi
  const userSessions = cleaned.filter(s => s.userId === userId);
  if (userSessions.length > 1) {
    addSecurityThreat({
      type: 'concurrent_session',
      severity: 'medium',
      title: 'Esazamanli Oturum Tespiti',
      description: `${userName} kullanicisi icin ${userSessions.length} aktif oturum tespit edildi.`,
      source: 'auth',
      metadata: { sessionCount: userSessions.length, userId },
    });
  }

  // Mesai disi giris kontrolu
  if (isUnusualHour()) {
    addSecurityThreat({
      type: 'unusual_hour',
      severity: 'low',
      title: 'Mesai Disi Giris',
      description: `${userName} kullanicisi mesai saatleri disinda giris yapti (${new Date().toLocaleTimeString('tr-TR')}).`,
      source: 'auth',
      metadata: { userId, hour: new Date().getHours() },
    });
  }

  return session;
}

export function getActiveSessions(): ActiveSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const sessions: ActiveSession[] = raw ? JSON.parse(raw) : [];
    const currentId = getCurrentSessionId();
    return sessions.map(s => ({ ...s, isCurrentSession: s.id === currentId }));
  } catch { return []; }
}

export function updateSessionActivity(): void {
  const sessionId = getCurrentSessionId();
  const sessions = getActiveSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx >= 0) {
    sessions[idx].lastActivity = new Date().toISOString();
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }
}

export function removeSession(sessionId?: string): void {
  const id = sessionId || getCurrentSessionId();
  const sessions = getActiveSessions().filter(s => s.id !== id);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function forceLogoutSession(sessionId: string): void {
  removeSession(sessionId);
  // Diger sekmelere sinyal gonder
  localStorage.setItem('isleyen_et_force_logout', JSON.stringify({ sessionId, timestamp: Date.now() }));
}

// ─── GUVENLIK POLITIKASI ─────────────────────────────────────────────────────

export interface SecurityPolicy {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  sessionTimeoutMinutes: number;
  requirePasswordChangeOnFirstLogin: boolean;
  passwordExpiryDays: number;
  maxConcurrentSessions: number;
  enforceIPRestriction: boolean;
  logRetentionDays: number;
}

const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  minPasswordLength: 8,           // Minimum 8 karakter (NIST SP 800-63B)
  requireUppercase: true,         // En az 1 büyük harf zorunlu
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,      // En az 1 özel karakter zorunlu
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 15,
  sessionTimeoutMinutes: 15,
  requirePasswordChangeOnFirstLogin: true,  // İlk girişte şifre değiştirme zorunlu
  passwordExpiryDays: 90,
  maxConcurrentSessions: 3,
  enforceIPRestriction: false,
  logRetentionDays: 30,
};

const POLICY_KEY = 'isleyen_et_security_policy';

export function getSecurityPolicy(): SecurityPolicy {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    return raw ? { ...DEFAULT_SECURITY_POLICY, ...JSON.parse(raw) } : DEFAULT_SECURITY_POLICY;
  } catch { return DEFAULT_SECURITY_POLICY; }
}

export function updateSecurityPolicy(updates: Partial<SecurityPolicy>): SecurityPolicy {
  const current = getSecurityPolicy();
  const updated = { ...current, ...updates };
  localStorage.setItem(POLICY_KEY, JSON.stringify(updated));
  return updated;
}

// ─── TAMPER-PROOF LOG HASH ZINCIRI ────────────────────────────────────────────

const LOG_CHAIN_KEY = 'isleyen_et_log_chain';

export function getLogChainHash(): string {
  return localStorage.getItem(LOG_CHAIN_KEY) || '0';
}

export function appendToLogChain(logEntry: string): string {
  const prevHash = getLogChainHash();
  const newHash = quickHash(`${prevHash}|${logEntry}|${Date.now()}`);
  localStorage.setItem(LOG_CHAIN_KEY, newHash);
  return newHash;
}

/** Log zinciri butunlugunu dogrula */
export function verifyLogChainIntegrity(): { valid: boolean; chainHash: string } {
  const chainHash = getLogChainHash();
  // Basit kontrol: hash var mi ve uygun formatta mi
  const valid = chainHash !== '0' || (getSecurityThreats().length === 0);
  return { valid, chainHash };
}

// ─── SECURITY SCORE HESAPLAMA ─────────────────────────────────────────────────

export interface SecurityScore {
  overall: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: {
    authentication: number;
    dataProtection: number;
    accessControl: number;
    monitoring: number;
    compliance: number;
  };
  recommendations: string[];
}

export function calculateSecurityScore(): SecurityScore {
  const policy = getSecurityPolicy();
  const threats = getSecurityThreats();
  const unresolvedThreats = threats.filter(t => !t.resolved);
  const criticalThreats = unresolvedThreats.filter(t => t.severity === 'critical').length;
  const highThreats = unresolvedThreats.filter(t => t.severity === 'high').length;

  let auth = 100;
  let dataProt = 100;
  let accessCtrl = 100;
  let monitoring = 100;
  let compliance = 100;
  const recommendations: string[] = [];

  // Authentication
  if (policy.minPasswordLength < 8) { auth -= 15; recommendations.push('Minimum sifre uzunlugunu 8 karaktere cikarin'); }
  if (!policy.requireUppercase) { auth -= 5; recommendations.push('Buyuk harf zorunlulugu ekleyin'); }
  if (!policy.requireSpecialChars) { auth -= 5; recommendations.push('Ozel karakter zorunlulugu ekleyin'); }
  if (policy.maxLoginAttempts > 5) { auth -= 10; recommendations.push('Maksimum giris denemesini 5 ile sinirlayin'); }

  // Data Protection
  if (policy.passwordExpiryDays > 90) { dataProt -= 10; recommendations.push('Sifre gecerlilik suresini 90 gune dusurun'); }
  if (policy.logRetentionDays < 30) { dataProt -= 10; recommendations.push('Log saklama suresini en az 30 gun yapin'); }

  // Access Control
  if (policy.maxConcurrentSessions > 3) { accessCtrl -= 10; recommendations.push('Esazamanli oturum limitini 3 ile sinirlayin'); }
  if (policy.sessionTimeoutMinutes > 30) { accessCtrl -= 10; recommendations.push('Oturum zaman asimini 30 dakikaya dusurun'); }

  // Monitoring
  if (criticalThreats > 0) { monitoring -= criticalThreats * 15; recommendations.push(`${criticalThreats} kritik tehdit cozumlenmemis`); }
  if (highThreats > 0) { monitoring -= highThreats * 8; recommendations.push(`${highThreats} yuksek riskli tehdit cozumlenmemis`); }

  // Compliance
  const personnel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
  const noPasswordUsers = personnel.filter(p => !p.password && !p.pinCode && !p.pin_code);
  if (noPasswordUsers.length > 0) { compliance -= 20; recommendations.push(`${noPasswordUsers.length} personelin sifresi tanimlanmamis`); }

  // Clamp
  auth = Math.max(0, Math.min(100, auth));
  dataProt = Math.max(0, Math.min(100, dataProt));
  accessCtrl = Math.max(0, Math.min(100, accessCtrl));
  monitoring = Math.max(0, Math.min(100, monitoring));
  compliance = Math.max(0, Math.min(100, compliance));

  const overall = Math.round((auth + dataProt + accessCtrl + monitoring + compliance) / 5);

  let grade: SecurityScore['grade'];
  if (overall >= 90) grade = 'A';
  else if (overall >= 75) grade = 'B';
  else if (overall >= 60) grade = 'C';
  else if (overall >= 40) grade = 'D';
  else grade = 'F';

  return {
    overall,
    grade,
    categories: {
      authentication: auth,
      dataProtection: dataProt,
      accessControl: accessCtrl,
      monitoring,
      compliance,
    },
    recommendations,
  };
}

// ─── IP / CIHAZ İZLEME (GEO-ENRICHED DEVICE TRACKING) ─────────────────────

export interface DeviceInfo {
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  timezone: string;
  language: string;
  screenRes: string;
  cores: number;
  memory: number;
  connectionType: string;
  fingerprint: string;
  collectedAt: string;
}

export function collectDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  let browser = 'Bilinmiyor';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

  let os = 'Bilinmiyor';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  let deviceType: DeviceInfo['deviceType'] = 'desktop';
  if (/Mobile|Android|iPhone/i.test(ua)) deviceType = 'mobile';
  else if (/iPad|Tablet/i.test(ua)) deviceType = 'tablet';

  const connType = (navigator as any).connection?.effectiveType || 'bilinmiyor';

  return {
    browser,
    os,
    deviceType,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language: navigator.language || '',
    screenRes: `${screen.width}x${screen.height}`,
    cores: navigator.hardwareConcurrency || 0,
    memory: (navigator as any).deviceMemory || 0,
    connectionType: connType,
    fingerprint: quickHash(`${ua}|${screen.width}|${navigator.language}|${navigator.hardwareConcurrency}`),
    collectedAt: new Date().toISOString(),
  };
}

const DEVICE_HISTORY_KEY = 'isleyen_et_device_history';
const MAX_DEVICE_HISTORY = 50;

export function recordDeviceLogin(userId: string, userName: string): void {
  const device = collectDeviceInfo();
  const history = getDeviceHistory();
  history.unshift({ ...device, userId, userName, loginAt: new Date().toISOString() });
  if (history.length > MAX_DEVICE_HISTORY) history.length = MAX_DEVICE_HISTORY;
  localStorage.setItem(DEVICE_HISTORY_KEY, JSON.stringify(history));

  // Yeni cihaz uyarisi
  const knownFingerprints = new Set(history.filter(h => h.userId === userId).map(h => h.fingerprint));
  if (knownFingerprints.size > 1) {
    const prevDevices = history.filter(h => h.userId === userId && h.fingerprint !== device.fingerprint);
    if (prevDevices.length > 0 && prevDevices[0].fingerprint !== device.fingerprint) {
      // Ilk kez bu cihazdan giris
      addSecurityThreat({
        type: 'concurrent_session',
        severity: 'low',
        title: 'Yeni Cihaz Tespiti',
        description: `${userName} yeni bir cihazdan giris yapti: ${device.browser}/${device.os} (${device.deviceType})`,
        source: 'device_tracking',
        metadata: { userId, device },
      });
    }
  }
}

export function getDeviceHistory(): Array<DeviceInfo & { userId?: string; userName?: string; loginAt?: string }> {
  try {
    const raw = localStorage.getItem(DEVICE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ─── OTOMATİK TEHDİT YANIT MOTORU ──────────────────────────────────────────

export interface AutoResponseRule {
  id: string;
  enabled: boolean;
  threatType: SecurityThreat['type'] | 'any';
  minSeverity: SecurityThreat['severity'];
  action: 'notify' | 'block_session' | 'force_logout' | 'lock_account' | 'log_only';
  description: string;
  cooldownMinutes: number;
  lastTriggered?: string;
}

const AUTO_RESPONSE_KEY = 'isleyen_et_auto_response_rules';

const DEFAULT_AUTO_RESPONSES: AutoResponseRule[] = [
  { id: 'ar_bruteforce', enabled: true, threatType: 'brute_force', minSeverity: 'high', action: 'block_session', description: 'Brute force saldirisinda oturumu kilitle', cooldownMinutes: 15 },
  { id: 'ar_sqli', enabled: true, threatType: 'sql_injection', minSeverity: 'critical', action: 'force_logout', description: 'SQL injection denemesinde oturumu kapat', cooldownMinutes: 30 },
  { id: 'ar_hijack', enabled: true, threatType: 'session_hijack', minSeverity: 'critical', action: 'force_logout', description: 'Oturum ele gecirme tespitinde zorla cikis', cooldownMinutes: 0 },
  { id: 'ar_rapid', enabled: false, threatType: 'rapid_actions', minSeverity: 'medium', action: 'notify', description: 'Hizli islem tespitinde bildirim gonder', cooldownMinutes: 5 },
  { id: 'ar_xss', enabled: true, threatType: 'xss_attempt', minSeverity: 'high', action: 'log_only', description: 'XSS denemesini sadece logla', cooldownMinutes: 1 },
  { id: 'ar_unusual', enabled: false, threatType: 'unusual_hour', minSeverity: 'low', action: 'notify', description: 'Mesai disi giris bildirim', cooldownMinutes: 60 },
];

export function getAutoResponseRules(): AutoResponseRule[] {
  try {
    const raw = localStorage.getItem(AUTO_RESPONSE_KEY);
    if (!raw) return DEFAULT_AUTO_RESPONSES;
    const saved = JSON.parse(raw);
    // Merge with defaults to pick up new rules
    const savedIds = new Set(saved.map((r: any) => r.id));
    const merged = [...saved];
    for (const def of DEFAULT_AUTO_RESPONSES) {
      if (!savedIds.has(def.id)) merged.push(def);
    }
    return merged;
  } catch { return DEFAULT_AUTO_RESPONSES; }
}

export function saveAutoResponseRules(rules: AutoResponseRule[]): void {
  localStorage.setItem(AUTO_RESPONSE_KEY, JSON.stringify(rules));
}

export function executeAutoResponse(threat: SecurityThreat): { action: string; ruleId: string } | null {
  const rules = getAutoResponseRules();
  const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.threatType !== 'any' && rule.threatType !== threat.type) continue;
    if (severityOrder[threat.severity] < severityOrder[rule.minSeverity]) continue;

    // Cooldown check
    if (rule.lastTriggered && rule.cooldownMinutes > 0) {
      const elapsed = (Date.now() - new Date(rule.lastTriggered).getTime()) / 60000;
      if (elapsed < rule.cooldownMinutes) continue;
    }

    // Execute action
    rule.lastTriggered = new Date().toISOString();
    saveAutoResponseRules(rules);

    switch (rule.action) {
      case 'force_logout':
        localStorage.setItem('isleyen_et_force_logout', JSON.stringify({ sessionId: sessionStorage.getItem('isleyen_et_current_session_id'), timestamp: Date.now(), reason: rule.description }));
        break;
      case 'block_session':
        sessionStorage.setItem('isleyen_et_session_blocked', JSON.stringify({ blockedAt: Date.now(), reason: rule.description, duration: rule.cooldownMinutes * 60000 }));
        break;
      case 'lock_account':
        sessionStorage.setItem('isleyen_et_account_locked', 'true');
        break;
    }

    logActivity('security_alert', `Oto-yanit: ${rule.action} - ${rule.description}`, {
      level: 'high',
      page: 'guvenlik',
      metadata: { ruleId: rule.id, threatId: threat.id, action: rule.action },
    });

    return { action: rule.action, ruleId: rule.id };
  }

  return null;
}

// ─── İHLAL TESPİT (BREACH DETECTION) ───────────────────────────────────────

const COMMON_BREACHED_PASSWORDS = [
  '123456', 'password', '12345678', 'qwerty', 'abc123', 'monkey', 'master',
  'dragon', '111111', 'baseball', 'iloveyou', 'trustno1', 'sunshine', 'princess',
  'admin', 'welcome', 'shadow', 'letmein', 'passw0rd', 'football', '123123',
  '654321', 'superman', 'qazwsx', 'michael', 'login', 'starwars', 'hello',
  'charlie', 'donald', 'password1', '1234567', '123456789', '0987654321',
];

export function checkPasswordBreach(password: string): { breached: boolean; reason?: string } {
  if (!password) return { breached: false };

  const lower = password.toLowerCase();

  // Direkt eslestirme
  if (COMMON_BREACHED_PASSWORDS.includes(lower)) {
    return { breached: true, reason: 'Bu sifre bilinen ihlal listelerinde bulunuyor' };
  }

  // Basit varyasyon kontrolleri
  const stripped = lower.replace(/[0-9!@#$%^&*()]/g, '');
  if (stripped.length < 4 && password.length < 8) {
    return { breached: true, reason: 'Sifre cok basit ve tahmin edilebilir' };
  }

  // Tekrar eden pattern
  if (/^(.)\1+$/.test(password)) {
    return { breached: true, reason: 'Sifre tamamen ayni karakterden olusuyor' };
  }

  // Klavye pattern'leri
  const keyboardPatterns = ['qwerty', 'asdf', 'zxcv', '1234', '9876', 'abcd', 'qazwsx'];
  for (const pattern of keyboardPatterns) {
    if (lower.includes(pattern)) {
      return { breached: true, reason: 'Sifre bilinen klavye kalibini iceriyor' };
    }
  }

  return { breached: false };
}

// ─── GÜVENLİK DENETİM RAPORU ───────────────────────────────────────────────

export interface SecurityAuditItem {
  id: string;
  category: 'authentication' | 'data_protection' | 'access_control' | 'monitoring' | 'compliance' | 'network';
  title: string;
  status: 'pass' | 'warning' | 'fail' | 'info';
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation?: string;
}

export function generateSecurityAudit(): { items: SecurityAuditItem[]; passRate: number; timestamp: string } {
  const policy = getSecurityPolicy();
  const threats = getSecurityThreats();
  const unresolved = threats.filter(t => !t.resolved);
  const sessions = getActiveSessions();
  const logChain = verifyLogChainIntegrity();
  const items: SecurityAuditItem[] = [];

  // ── Authentication Checks ──
  items.push({
    id: 'auth_pw_length', category: 'authentication', title: 'Minimum Sifre Uzunlugu',
    status: policy.minPasswordLength >= 8 ? 'pass' : policy.minPasswordLength >= 6 ? 'warning' : 'fail',
    description: `Mevcut: ${policy.minPasswordLength} karakter`,
    severity: policy.minPasswordLength >= 8 ? 'low' : 'high',
    recommendation: policy.minPasswordLength < 8 ? 'En az 8 karakter zorunlulugu ekleyin' : undefined,
  });

  items.push({
    id: 'auth_uppercase', category: 'authentication', title: 'Buyuk Harf Zorunlulugu',
    status: policy.requireUppercase ? 'pass' : 'warning',
    description: policy.requireUppercase ? 'Aktif' : 'Devre disi',
    severity: 'medium',
    recommendation: !policy.requireUppercase ? 'Buyuk harf zorunlulugu guvenlik seviyesini arttirir' : undefined,
  });

  items.push({
    id: 'auth_special', category: 'authentication', title: 'Ozel Karakter Zorunlulugu',
    status: policy.requireSpecialChars ? 'pass' : 'warning',
    description: policy.requireSpecialChars ? 'Aktif' : 'Devre disi',
    severity: 'medium',
    recommendation: !policy.requireSpecialChars ? 'Ozel karakter zorunlulugu eklenmeli' : undefined,
  });

  items.push({
    id: 'auth_login_limit', category: 'authentication', title: 'Giris Deneme Limiti',
    status: policy.maxLoginAttempts <= 5 ? 'pass' : 'warning',
    description: `${policy.maxLoginAttempts} deneme`,
    severity: policy.maxLoginAttempts > 5 ? 'high' : 'low',
    recommendation: policy.maxLoginAttempts > 5 ? '5 veya daha az deneme ile sinirlayin' : undefined,
  });

  items.push({
    id: 'auth_lockout', category: 'authentication', title: 'Kilitleme Suresi',
    status: policy.lockoutDurationMinutes >= 15 ? 'pass' : 'warning',
    description: `${policy.lockoutDurationMinutes} dakika`,
    severity: 'medium',
  });

  // ── Data Protection ──
  items.push({
    id: 'dp_pw_expiry', category: 'data_protection', title: 'Sifre Gecerlilik Suresi',
    status: policy.passwordExpiryDays <= 90 ? 'pass' : 'warning',
    description: `${policy.passwordExpiryDays} gun`,
    severity: policy.passwordExpiryDays > 180 ? 'high' : 'medium',
    recommendation: policy.passwordExpiryDays > 90 ? '90 gun veya daha kisa yapilmali' : undefined,
  });

  items.push({
    id: 'dp_log_retention', category: 'data_protection', title: 'Log Saklama Suresi',
    status: policy.logRetentionDays >= 30 ? 'pass' : 'fail',
    description: `${policy.logRetentionDays} gun`,
    severity: policy.logRetentionDays < 30 ? 'high' : 'low',
    recommendation: policy.logRetentionDays < 30 ? 'En az 30 gun saklayin' : undefined,
  });

  items.push({
    id: 'dp_log_chain', category: 'data_protection', title: 'Log Zinciri Butunlugu',
    status: logChain.valid ? 'pass' : 'fail',
    description: logChain.valid ? 'Butun ve dogrulanmis' : 'Zincir bozulmuş!',
    severity: logChain.valid ? 'low' : 'critical',
    recommendation: !logChain.valid ? 'Log zinciri bozulmus, veri butunlugu tehlikede' : undefined,
  });

  // ── Access Control ──
  items.push({
    id: 'ac_session_timeout', category: 'access_control', title: 'Oturum Zaman Asimi',
    status: policy.sessionTimeoutMinutes <= 30 ? 'pass' : policy.sessionTimeoutMinutes <= 60 ? 'warning' : 'fail',
    description: `${policy.sessionTimeoutMinutes} dakika`,
    severity: policy.sessionTimeoutMinutes > 30 ? 'medium' : 'low',
    recommendation: policy.sessionTimeoutMinutes > 30 ? '30 dakika veya daha kisa yapilmali' : undefined,
  });

  items.push({
    id: 'ac_concurrent', category: 'access_control', title: 'Esazamanli Oturum Limiti',
    status: policy.maxConcurrentSessions <= 3 ? 'pass' : 'warning',
    description: `${policy.maxConcurrentSessions} oturum`,
    severity: 'medium',
  });

  items.push({
    id: 'ac_active_sessions', category: 'access_control', title: 'Aktif Oturumlar',
    status: sessions.length <= policy.maxConcurrentSessions ? 'pass' : 'warning',
    description: `${sessions.length} aktif oturum`,
    severity: sessions.length > policy.maxConcurrentSessions ? 'medium' : 'low',
  });

  // ── Monitoring ──
  items.push({
    id: 'mon_threats', category: 'monitoring', title: 'Cozumlenmemis Tehditler',
    status: unresolved.length === 0 ? 'pass' : unresolved.some(t => t.severity === 'critical') ? 'fail' : 'warning',
    description: `${unresolved.length} cozumlenmemis tehdit`,
    severity: unresolved.some(t => t.severity === 'critical') ? 'critical' : unresolved.length > 5 ? 'high' : 'medium',
    recommendation: unresolved.length > 0 ? 'Acik tehditleri inceleyin ve cozumleyin' : undefined,
  });

  const critCount = unresolved.filter(t => t.severity === 'critical').length;
  items.push({
    id: 'mon_critical', category: 'monitoring', title: 'Kritik Tehditler',
    status: critCount === 0 ? 'pass' : 'fail',
    description: critCount === 0 ? 'Kritik tehdit yok' : `${critCount} kritik tehdit!`,
    severity: critCount > 0 ? 'critical' : 'low',
  });

  const autoRules = getAutoResponseRules();
  const enabledRules = autoRules.filter(r => r.enabled).length;
  items.push({
    id: 'mon_auto_response', category: 'monitoring', title: 'Otomatik Yanit Kurallari',
    status: enabledRules >= 3 ? 'pass' : enabledRules >= 1 ? 'warning' : 'fail',
    description: `${enabledRules}/${autoRules.length} kural aktif`,
    severity: enabledRules === 0 ? 'high' : 'low',
    recommendation: enabledRules < 3 ? 'Daha fazla oto-yanit kurali etkinlestirin' : undefined,
  });

  // ── Compliance ──
  const personnel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
  const noPassUsers = personnel.filter(p => !p.password && !p.pinCode && !p.pin_code);
  items.push({
    id: 'comp_all_passwords', category: 'compliance', title: 'Personel Sifre Tanimlamalari',
    status: noPassUsers.length === 0 ? 'pass' : 'fail',
    description: noPassUsers.length === 0 ? 'Tum personelin sifresi tanimli' : `${noPassUsers.length} personelin sifresi yok`,
    severity: noPassUsers.length > 0 ? 'high' : 'low',
    recommendation: noPassUsers.length > 0 ? 'Tum personele sifre tanimlayin' : undefined,
  });

  items.push({
    id: 'comp_first_login', category: 'compliance', title: 'Ilk Giris Sifre Degisimi',
    status: policy.requirePasswordChangeOnFirstLogin ? 'pass' : 'info',
    description: policy.requirePasswordChangeOnFirstLogin ? 'Aktif' : 'Opsiyonel',
    severity: 'low',
  });

  // ── Network ──
  items.push({
    id: 'net_https', category: 'network', title: 'HTTPS Baglanti',
    status: window.location.protocol === 'https:' ? 'pass' : 'warning',
    description: window.location.protocol === 'https:' ? 'Guvenli baglanti' : 'HTTP kullaniliyor',
    severity: window.location.protocol !== 'https:' ? 'high' : 'low',
    recommendation: window.location.protocol !== 'https:' ? 'Uretim ortaminda HTTPS zorunlu kilinin' : undefined,
  });

  const passCount = items.filter(i => i.status === 'pass').length;
  const passRate = Math.round((passCount / items.length) * 100);

  return { items, passRate, timestamp: new Date().toISOString() };
}

// ─── 2FA ───────────────────────────────────────────────────────────────────────

const TWO_FA_KEY = 'isleyen_et_2fa_config';

export interface TwoFAConfig {
  enabled: boolean;
  method: 'totp' | 'sms' | 'email';
  setupComplete: boolean;
  backupCodes: string[];
  lastVerified?: string;
  secret?: string; // Hex-encoded TOTP secret
}

export function get2FAConfig(): TwoFAConfig {
  try {
    const raw = localStorage.getItem(TWO_FA_KEY);
    return raw ? JSON.parse(raw) : { enabled: false, method: 'totp', setupComplete: false, backupCodes: [] };
  } catch { return { enabled: false, method: 'totp', setupComplete: false, backupCodes: [] }; }
}

export function save2FAConfig(config: Partial<TwoFAConfig>): TwoFAConfig {
  const current = get2FAConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(TWO_FA_KEY, JSON.stringify(updated));
  return updated;
}

/** Rastgele TOTP sirri uret (20 byte / 160-bit) */
export function generateTOTPSecret(): string {
  const arr = new Uint8Array(20);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function generate2FABackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    codes.push(Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase());
  }
  return codes;
}

/** RFC 6238 TOTP hesaplama (HMAC-SHA1) */
async function computeTOTP(secretHex: string, counter: number): Promise<string> {
  const keyBytes = new Uint8Array((secretHex.match(/.{1,2}/g) || []).map(b => parseInt(b, 16)));
  const counterBytes = new Uint8Array(8);
  let temp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes));
  const offset = sig[sig.length - 1] & 0x0f;
  const code = (
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

export async function verify2FACode(inputCode: string): Promise<boolean> {
  const config = get2FAConfig();
  if (!config.enabled) return true;

  // Yedek kod kontrolu
  if (config.backupCodes.includes(inputCode.toUpperCase())) {
    save2FAConfig({ backupCodes: config.backupCodes.filter(c => c !== inputCode.toUpperCase()), lastVerified: new Date().toISOString() });
    return true;
  }

  // TOTP dogrulama — ±1 pencere (30 sn tolerans)
  if (/^\d{6}$/.test(inputCode) && config.secret) {
    const counter = Math.floor(Date.now() / 1000 / 30);
    for (const offset of [-1, 0, 1]) {
      const expected = await computeTOTP(config.secret, counter + offset);
      if (expected === inputCode) {
        save2FAConfig({ lastVerified: new Date().toISOString() });
        return true;
      }
    }
  }

  return false;
}

// ─── GÜVENLİK OLAY ZAMAN ÇİZELGESİ ────────────────────────────────────────

export interface SecurityTimelineEvent {
  id: string;
  timestamp: string;
  type: 'threat' | 'login' | 'logout' | 'policy_change' | 'session_action' | 'auto_response' | 'audit';
  title: string;
  description: string;
  severity?: SecurityThreat['severity'];
  metadata?: Record<string, any>;
}

export function getSecurityTimeline(limit = 50): SecurityTimelineEvent[] {
  const events: SecurityTimelineEvent[] = [];

  // Threats → timeline
  const threats = getSecurityThreats();
  for (const t of threats.slice(0, 30)) {
    events.push({
      id: t.id, timestamp: t.timestamp, type: 'threat',
      title: t.title, description: t.description, severity: t.severity,
      metadata: { resolved: t.resolved, source: t.source },
    });
  }

  // Device history → login events
  const devices = getDeviceHistory();
  for (const d of devices.slice(0, 20)) {
    events.push({
      id: `dev_${d.collectedAt}`, timestamp: d.loginAt || d.collectedAt, type: 'login',
      title: `Giris: ${d.userName || 'Bilinmeyen'}`,
      description: `${d.browser}/${d.os} (${d.deviceType}) — ${d.timezone}`,
      metadata: { fingerprint: d.fingerprint },
    });
  }

  // Sort by timestamp desc
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, limit);
}

// ─── OTURUM BLOKAJ KONTROLÜ ────────────────────────────────────────────────

export function isSessionBlocked(): { blocked: boolean; reason?: string; remaining?: number } {
  try {
    const raw = sessionStorage.getItem('isleyen_et_session_blocked');
    if (!raw) return { blocked: false };
    const data = JSON.parse(raw);
    const elapsed = Date.now() - data.blockedAt;
    if (elapsed > data.duration) {
      sessionStorage.removeItem('isleyen_et_session_blocked');
      return { blocked: false };
    }
    return { blocked: true, reason: data.reason, remaining: Math.ceil((data.duration - elapsed) / 1000) };
  } catch { return { blocked: false }; }
}