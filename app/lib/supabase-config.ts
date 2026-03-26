/**
 * Merkezi Supabase Yapılandırması
 * 
 * Yerel Supabase (Docker) ve bulut Supabase arasında geçiş yapmak için
 * bu dosyayı düzenleyin. Tüm dosyalar bu modülden import eder.
 * 
 * Yerel kurulum bilgileri (npx supabase status çıktısından):
 *   Studio:    http://127.0.0.1:54323
 *   API:       http://127.0.0.1:54321
 *   DB:        postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *   Anon Key:  (Settings → Yerel Depo → Yerel Ayarlar sekmesinden girin)
 *   Secret:    (Settings → Yerel Depo → Yerel Ayarlar sekmesinden girin)
 */

// ═══════════════════════════════════════════════════════════════
// ORTAM SEÇİCİ: 'local' veya 'cloud' olarak değiştirin
// ═══════════════════════════════════════════════════════════════
export type Environment = 'local' | 'cloud';

// Otomatik algılama: localhost/127.0.0.1'den erişiliyorsa local, değilse cloud
function detectEnvironment(): Environment {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) {
      return 'local';
    }
  }
  return 'cloud';
}

// Manuel override: 'local' = yerel Supabase, 'cloud' = bulut, null = otomatik
// Figma Make ortamında 'cloud' kullanılmalı, yerel geliştirmede 'local' veya null
const FORCE_ENVIRONMENT: Environment | null = 'cloud';

export const ENV: string = FORCE_ENVIRONMENT || detectEnvironment();

// ═══════════════════════════════════════════════════════════════
// YEREL SUPABASE (Docker - npx supabase start)
// ═══════════════════════════════════════════════════════════════
const LOCAL_CONFIG = {
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey: 'sb_publishable_ACJWlzQhlZjBrEguHvfOxg_3BJgxAaH',
  supabaseServiceRoleKey: '', // Settings → Yerel Depo → Yerel Ayarlar sekmesinden girin
  // Yerel Edge Function server URL (Deno doğrudan çalıştırma)
  // supabase functions serve kullanıyorsanız: http://127.0.0.1:54321/functions/v1/server
  // Doğrudan deno run kullanıyorsanız: http://127.0.0.1:8000
  serverBaseUrl: 'http://127.0.0.1:54321/functions/v1/make-server-daadfb0c',
};

// ═══════════════════════════════════════════════════════════════
// BULUT SUPABASE (Figma Make / Production)
// ═══════════════════════════════════════════════════════════════
const CLOUD_CONFIG = {
  supabaseUrl: 'https://pmbpawntaislortnjzmq.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtYnBhd250YWlzbG9ydG5qem1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTYyMjcsImV4cCI6MjA4ODIzMjIyN30.Rb_dqcnicLoKqL5YdTLi7RwqX8yAgijdXhqJ--YQH0c',
  supabaseServiceRoleKey: '', // Sadece sunucu tarafında kullanılır
  serverBaseUrl: 'https://pmbpawntaislortnjzmq.supabase.co/functions/v1/make-server-daadfb0c',
};

// ═══════════════════════════════════════════════════════════════
// AKTİF YAPILANDIRMA (Tüm dosyalar bunu kullanır)
// ═══════════════════════════════════════════════════════════════
const ACTIVE = ENV === 'local' ? LOCAL_CONFIG : CLOUD_CONFIG;

export const SUPABASE_URL = ACTIVE.supabaseUrl;
export const SUPABASE_ANON_KEY = ACTIVE.supabaseAnonKey;
export const SERVER_BASE_URL = ACTIVE.serverBaseUrl;

// Geriye uyumluluk: projectId ve publicAnonKey olarak da export et
export const projectId = ENV === 'local' ? 'local' : 'pmbpawntaislortnjzmq';
export const publicAnonKey = SUPABASE_ANON_KEY;

// Debug log
if (typeof window !== 'undefined') {
  console.log(
    `%c[Supabase Config] Ortam: ${ENV.toUpperCase()} | URL: ${SUPABASE_URL}`,
    'color: #22c55e; font-weight: bold;'
  );
}