import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Supabase baglantisini test et (kv_store_daadfb0c tablosu uzerinden)
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    // kv_store_daadfb0c tablosuna erisim testi
    const { error } = await supabase
      .from('kv_store_daadfb0c')
      .select('key', { count: 'exact', head: true });

    if (error) {
      // Ag hatasi
      const isNetworkError =
        error.message?.includes('Failed to fetch') ||
        error.message?.startsWith('TypeError') ||
        error.message?.includes('NetworkError');

      if (isNetworkError) {
        console.warn('Supabase ag hatasi:', error.message);
        return { success: false, error: 'Supabase sunucusuna erisilemyor (ag hatasi).' };
      }

      // Tablo bulunamadiysa — bu ciddi bir hata
      const isSchemaError = 
        error.message.includes('Could not find the table') ||
        error.message.includes('does not exist') ||
        error.code === '42P01';
      
      if (isSchemaError) {
        console.warn('kv_store_daadfb0c tablosu bulunamadi:', error.message);
        return { success: false, error: 'KV store tablosu bulunamadi' };
      }
      
      console.error('Supabase connection test failed:', error);
      return { success: false, error: `Supabase baglanti hatasi: ${error.message}` };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
    const isNetworkError =
      error instanceof TypeError ||
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('NetworkError');

    const lastError = isNetworkError
      ? 'Supabase sunucusuna erisilemyor (ag hatasi).'
      : `Baglanti basarisiz: ${errorMessage}`;
    if (!isNetworkError) console.error('Supabase connection error:', error);
    else console.warn('Supabase ag hatasi:', errorMessage);
    return { success: false, error: lastError };
  }
}