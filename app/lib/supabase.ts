/**
 * Supabase client — Stub (Supabase removed, using CouchDB/PouchDB)
 *
 * Exports a no-op supabase object for backward compatibility.
 * All actual data operations should use PouchDB (getDb from pouchdb.ts).
 */

// Stub supabase client that returns empty results for any .from() chain
const noopResult = { data: null, error: null, count: 0 };
const noopChain: any = new Proxy({}, {
  get: () => (..._args: any[]) => Promise.resolve(noopResult),
});

export const supabase: any = {
  from: (_table: string) => noopChain,
  auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
  channel: () => ({ on: () => ({ subscribe: () => {} }), unsubscribe: () => {} }),
};

/**
 * Supabase connection test — stub (always returns success: false)
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Supabase removed — using CouchDB' };
}
