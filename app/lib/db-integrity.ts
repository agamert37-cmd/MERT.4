// Veri Bütünlük Kontrolü — PouchDB ↔ CouchDB kayıt sayısı karşılaştırması
import { getDb } from './pouchdb';
import { testCouchDbConnection, getAllDbStats } from './pouchdb';
import { getCouchDbConfig, TABLE_NAMES } from './db-config';

export type IntegrityStatus = 'ok' | 'mismatch' | 'missing' | 'unchecked' | 'error';

export interface TableIntegrityResult {
  tableName: string;
  pouchCount: number;
  couchCount: number | null;
  status: IntegrityStatus;
  delta: number;            // couchCount - pouchCount (pozitif = CouchDB fazla, negatif = PouchDB fazla)
  lastChecked: string;
}

export interface IntegrityReport {
  checkedAt: string;
  couchDbReachable: boolean;
  latencyMs: number;
  tables: TableIntegrityResult[];
  totalPouchDocs: number;
  totalCouchDocs: number;
  mismatchCount: number;
  missingCount: number;
  score: number; // 0-100
}

const INTEGRITY_CACHE_KEY = 'mert4_integrity_report';
const MISMATCH_THRESHOLD = 2; // bu kadar farkı "ok" say (replication lag)

/** localStorage'daki son raporu yükle */
export function getCachedIntegrityReport(): IntegrityReport | null {
  try {
    const raw = localStorage.getItem(INTEGRITY_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Raporu localStorage'a kaydet */
function saveIntegrityReport(report: IntegrityReport): void {
  try { localStorage.setItem(INTEGRITY_CACHE_KEY, JSON.stringify(report)); } catch {}
}

/** CouchDB'den tüm tabloların kayıt sayısını al */
async function fetchCouchCounts(): Promise<Record<string, number> | null> {
  const { url, user, password } = getCouchDbConfig();
  if (!url) return null;
  try {
    const auth = btoa(`${user}:${password}`);
    const results: Record<string, number> = {};
    await Promise.all(
      TABLE_NAMES.map(async (t) => {
        const dbName = `mert_${t}`;
        const res = await fetch(`${url}/${dbName}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (res.ok) {
          const data = await res.json();
          results[t] = data.doc_count ?? 0;
        }
      })
    );
    return results;
  } catch {
    return null;
  }
}

/** Tam bütünlük kontrolü çalıştır */
export async function runIntegrityCheck(): Promise<IntegrityReport> {
  const t0 = performance.now();
  const checkedAt = new Date().toISOString();

  // PouchDB sayıları
  const pouchStats = await getAllDbStats().catch(() => [] as { tableName: string; docCount: number }[]);
  const pouchMap: Record<string, number> = {};
  for (const s of pouchStats) pouchMap[s.tableName] = s.docCount;

  // CouchDB bağlantı testi
  const connTest = await testCouchDbConnection().catch(() => ({ ok: false, error: 'timeout' }));
  const latencyMs = Math.round(performance.now() - t0);

  // CouchDB sayıları (bağlı ise)
  const couchMap = connTest.ok ? await fetchCouchCounts() : null;

  const tables: TableIntegrityResult[] = TABLE_NAMES.map((t) => {
    const pouchCount = pouchMap[t] ?? 0;
    const couchCount = couchMap ? (couchMap[t] ?? 0) : null;
    const delta = couchCount !== null ? couchCount - pouchCount : 0;
    let status: IntegrityStatus;
    if (!connTest.ok || couchCount === null) {
      status = 'unchecked';
    } else if (pouchCount === 0 && couchCount > 0) {
      status = 'missing';
    } else if (Math.abs(delta) <= MISMATCH_THRESHOLD) {
      status = 'ok';
    } else {
      status = 'mismatch';
    }
    return { tableName: t, pouchCount, couchCount, status, delta, lastChecked: checkedAt };
  });

  const totalPouchDocs = tables.reduce((s, t) => s + t.pouchCount, 0);
  const totalCouchDocs = couchMap ? tables.reduce((s, t) => s + (t.couchCount ?? 0), 0) : 0;
  const mismatchCount = tables.filter(t => t.status === 'mismatch').length;
  const missingCount = tables.filter(t => t.status === 'missing').length;
  const okCount = tables.filter(t => t.status === 'ok').length;
  const score = Math.round((okCount / TABLE_NAMES.length) * 100);

  const report: IntegrityReport = {
    checkedAt, couchDbReachable: connTest.ok, latencyMs,
    tables, totalPouchDocs, totalCouchDocs, mismatchCount, missingCount, score,
  };

  saveIntegrityReport(report);
  return report;
}

/** Tek tablo için hızlı PouchDB sayısı */
export async function getPouchCount(tableName: string): Promise<number> {
  try {
    const info = await getDb(tableName).info();
    return info.doc_count;
  } catch { return 0; }
}
