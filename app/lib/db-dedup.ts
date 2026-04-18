// Deduplication — Fuzzy matching ve merge
import { getDb } from './pouchdb';

export interface DuplicateCandidate {
  docA: any;
  docB: any;
  score: number; // 0-100
  matchedFields: string[];
}

/** Levenshtein distance (string similarity) */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/** String similarity 0-1 */
function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - distance / maxLen;
}

/** Normalize string for comparison */
function normalizeStr(s: any): string {
  if (!s) return '';
  return String(s).toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Benzer kayıtları bul */
export async function findDuplicates(
  tableName: string,
  matchFields: string[],
  threshold = 0.85
): Promise<DuplicateCandidate[]> {
  try {
    const db = getDb(tableName);
    const result = await db.allDocs({ include_docs: true });
    const docs = result.rows.map(row => row.doc as any).filter(d => !d._deleted);

    const candidates: DuplicateCandidate[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const pairKey = `${docs[i]._id}__${docs[j]._id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        let totalScore = 0;
        let matchCount = 0;
        const matchedFields: string[] = [];

        for (const field of matchFields) {
          const valA = normalizeStr(docs[i][field]);
          const valB = normalizeStr(docs[j][field]);

          if (valA && valB) {
            const sim = stringSimilarity(valA, valB);
            if (sim > threshold) {
              matchedFields.push(field);
              totalScore += sim;
              matchCount++;
            }
          }
        }

        if (matchCount > 0) {
          const avgScore = (totalScore / matchCount) * 100;
          if (avgScore >= threshold * 100) {
            candidates.push({
              docA: docs[i],
              docB: docs[j],
              score: Math.round(avgScore),
              matchedFields,
            });
          }
        }
      }
    }

    return candidates.sort((a, b) => b.score - a.score);
  } catch (e) {
    console.error('[findDuplicates]', e);
    return [];
  }
}

/** İki kaydı birleştir (primary seç, secondary'yi delete) */
export async function mergeDuplicates(
  tableName: string,
  primaryDocId: string,
  secondaryDocId: string,
  userId: string,
  mergeFields?: Record<string, any> // hangi alanları primaryden al
): Promise<void> {
  try {
    const db = getDb(tableName);
    const primary = await db.get(primaryDocId) as any;
    const secondary = await db.get(secondaryDocId) as any;

    // Secondary'deki unique bilgileri primary'ye merge et
    const merged = { ...primary };
    if (mergeFields) {
      for (const [field, value] of Object.entries(mergeFields)) {
        merged[field] = value;
      }
    }

    // Primary'yi güncelle
    await db.put({
      ...merged,
      _mergedWith: [secondary._id],
      _mergedAt: new Date().toISOString(),
      _mergedBy: userId,
    });

    // Secondary'yi sil (soft delete)
    await db.remove(secondary);
  } catch (e) {
    console.error('[mergeDuplicates]', e);
    throw e;
  }
}

/** Dedup tipik field'ları tablo bazında */
export const DEDUP_FIELDS: Record<string, string[]> = {
  cari_hesaplar: ['companyName', 'title', 'taxId'],
  personeller: ['name', 'email', 'phone'],
  urunler: ['name', 'code'],
  bankalar: ['name', 'accountNumber'],
  araclar: ['plaka', 'markModel'],
};

/** Tablo için default dedup field'larını getir */
export function getDefaultDedupFields(tableName: string): string[] {
  return DEDUP_FIELDS[tableName] || ['name', 'title', 'companyName'].filter(f => f);
}
