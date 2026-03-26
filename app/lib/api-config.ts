/**
 * API Configuration Manager
 * Supabase bilgileri gomulu (supabase-config), sadece OpenAI key localStorage'da saklanir
 */

// supabase-config removed — hardcoded placeholders for legacy compatibility
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

const OPENAI_KEY_STORAGE = 'isleyen_et_openai_key';
// Legacy key for migration
const LEGACY_STORAGE_KEY = 'isleyen_et_api_config';

/**
 * Gomulu Supabase bilgileri
 */
export function getEmbeddedSupabaseConfig() {
  return {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  };
}

/**
 * OpenAI API key'i localStorage'dan al
 */
export function getOpenAIKey(): string {
  try {
    const key = localStorage.getItem(OPENAI_KEY_STORAGE);
    if (key && key.trim() !== '') {
      return key.trim();
    }
    // Legacy formatindan migration
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        if (parsed.openaiApiKey && parsed.openaiApiKey.trim() !== '' && parsed.openaiApiKey !== 'YOUR_OPENAI_API_KEY_HERE') {
          localStorage.setItem(OPENAI_KEY_STORAGE, parsed.openaiApiKey.trim());
          return parsed.openaiApiKey.trim();
        }
      } catch {}
    }
  } catch (error) {
    console.error('OpenAI key read error:', error);
  }
  return '';
}

/**
 * OpenAI API key'i localStorage'a kaydet
 */
export function saveOpenAIKey(key: string): void {
  try {
    localStorage.setItem(OPENAI_KEY_STORAGE, key.trim());
  } catch (error) {
    console.error('OpenAI key save error:', error);
  }
}

/**
 * OpenAI API key'i sil
 */
export function clearOpenAIKey(): void {
  try {
    localStorage.removeItem(OPENAI_KEY_STORAGE);
  } catch (error) {
    console.error('OpenAI key clear error:', error);
  }
}

/**
 * OpenAI key ayarlanmis mi?
 */
export function isOpenAIConfigured(): boolean {
  const key = getOpenAIKey();
  return !!(key && key.startsWith('sk-'));
}
