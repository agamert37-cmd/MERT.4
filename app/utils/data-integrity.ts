/**
 * Data Integrity Utilities
 * Veri bütünlüğü kontrolü, onarım ve tutarlılık doğrulaması
 */

import { getFromStorage, setInStorage, StorageKey } from './storage';

const STORAGE_PREFIX = 'isleyen_et_';

export interface IntegrityReport {
  timestamp: string;
  checks: IntegrityCheck[];
  totalIssues: number;
  autoFixed: number;
}

export interface IntegrityCheck {
  table: string;
  issue: string;
  severity: 'critical' | 'warning' | 'info';
  fixed: boolean;
  details?: string;
}

/**
 * Normalize numeric field — handles string, null, undefined, NaN
 */
function safeNum(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

/**
 * Validate and fix a single stok item
 */
function validateStokItem(item: any): { fixed: boolean; issues: string[]; item: any } {
  const issues: string[] = [];
  let fixed = false;
  const result = { ...item };

  // ID kontrolü
  if (!result.id) {
    result.id = crypto.randomUUID();
    issues.push('Eksik ID oluşturuldu');
    fixed = true;
  }

  // İsim kontrolü
  if (!(result.name || '').trim()) {
    return { fixed: false, issues: ['İsimsiz ürün — silme adayı'], item: result };
  }

  // Numerik alan normalizasyonu
  const numFields = [
    { key: 'currentStock', alias: 'current_stock' },
    { key: 'minStock', alias: 'min_stock' },
    { key: 'sellPrice', alias: 'sell_price' },
  ];

  for (const { key, alias } of numFields) {
    const val = result[key] ?? result[alias];
    const safe = safeNum(val, 0);
    if (result[key] !== safe) {
      result[key] = safe;
      if (!fixed) fixed = true;
      issues.push(`${key}: ${val} → ${safe}`);
    }
  }

  // Negatif stok kontrolü
  if (result.currentStock < 0) {
    issues.push(`Negatif stok (${result.currentStock}) sıfırlandı`);
    result.currentStock = 0;
    fixed = true;
  }

  // Movements normalizasyonu
  if (!Array.isArray(result.movements)) {
    // supplier_entries'den parse etmeyi dene
    if (typeof result.supplier_entries === 'string') {
      try {
        const parsed = JSON.parse(result.supplier_entries);
        if (Array.isArray(parsed)) {
          result.movements = parsed.map((e: any) => ({
            id: e.id || crypto.randomUUID(),
            type: 'ALIS',
            partyName: e.supplierName || 'Bilinmeyen',
            date: e.date || new Date().toISOString(),
            quantity: safeNum(e.quantity),
            price: safeNum(e.buyPrice || e.price),
            totalAmount: safeNum(e.totalAmount),
            description: 'Otomatik dönüştürüldü',
          }));
        } else if (parsed && Array.isArray(parsed.movements)) {
          result.movements = parsed.movements;
        } else {
          result.movements = [];
        }
        issues.push('supplier_entries → movements dönüştürüldü');
        fixed = true;
      } catch {
        result.movements = [];
        issues.push('Bozuk supplier_entries sıfırlandı');
        fixed = true;
      }
    } else {
      result.movements = [];
      if (!Array.isArray(item.movements)) {
        issues.push('Eksik movements dizisi oluşturuldu');
        fixed = true;
      }
    }
  }

  // Kategori kontrolü
  if (!result.category) {
    result.category = 'Diğer';
    issues.push('Eksik kategori → Diğer');
    fixed = true;
  }

  // Unit kontrolü
  if (!result.unit) {
    result.unit = 'KG';
    issues.push('Eksik birim → KG');
    fixed = true;
  }

  return { fixed, issues, item: result };
}

/**
 * Validate and fix cari data
 */
function validateCariItem(item: any): { fixed: boolean; issues: string[]; item: any } {
  const issues: string[] = [];
  let fixed = false;
  const result = { ...item };

  if (!result.id) {
    result.id = crypto.randomUUID();
    issues.push('Eksik ID');
    fixed = true;
  }

  // Balance normalizasyonu
  if (typeof result.balance !== 'number' || isNaN(result.balance)) {
    result.balance = safeNum(result.balance);
    issues.push('Bakiye normalize edildi');
    fixed = true;
  }

  // Transactions sayısı
  if (typeof result.transactions !== 'number' || isNaN(result.transactions)) {
    result.transactions = safeNum(result.transactions);
    fixed = true;
  }

  return { fixed, issues, item: result };
}

/**
 * Validate fiş data
 */
function validateFisItem(item: any): { fixed: boolean; issues: string[]; item: any } {
  const issues: string[] = [];
  let fixed = false;
  const result = { ...item };

  if (!result.id) {
    result.id = crypto.randomUUID();
    issues.push('Eksik ID');
    fixed = true;
  }

  // Items array kontrolü
  if (!Array.isArray(result.items)) {
    result.items = [];
    issues.push('Eksik items dizisi');
    fixed = true;
  }

  // Total normalizasyonu
  result.total = safeNum(result.total);

  // Date kontrolü
  if (!result.date) {
    result.date = new Date().toISOString();
    issues.push('Eksik tarih eklendi');
    fixed = true;
  }

  return { fixed, issues, item: result };
}

/**
 * Detect duplicate IDs in a dataset
 */
function findDuplicateIds(items: any[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.push(item.id);
    } else {
      seen.add(item.id);
    }
  }
  return duplicates;
}

/**
 * Remove duplicate items, keeping the last occurrence
 */
function deduplicateById(items: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

/**
 * Full integrity check and repair
 */
export function runIntegrityCheck(autoFix = true): IntegrityReport {
  const checks: IntegrityCheck[] = [];

  // ─── STOK VERİLERİ ────────────────────────────────────────────────────
  const stokData = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
  let fixedStok = [...stokData];
  let stokFixed = false;

  // Duplicate ID kontrolü
  const stokDups = findDuplicateIds(stokData);
  if (stokDups.length > 0) {
    checks.push({
      table: 'stok',
      issue: `${stokDups.length} duplicate ID bulundu`,
      severity: 'critical',
      fixed: autoFix,
      details: stokDups.join(', '),
    });
    if (autoFix) {
      fixedStok = deduplicateById(fixedStok);
      stokFixed = true;
    }
  }

  // İsimsiz ürün kontrolü
  const nameless = fixedStok.filter(s => !(s.name || '').trim());
  if (nameless.length > 0) {
    checks.push({
      table: 'stok',
      issue: `${nameless.length} isimsiz ürün bulundu`,
      severity: 'warning',
      fixed: autoFix,
    });
    if (autoFix) {
      fixedStok = fixedStok.filter(s => (s.name || '').trim());
      stokFixed = true;
    }
  }

  // Her ürünü doğrula
  fixedStok = fixedStok.map(item => {
    const result = validateStokItem(item);
    if (result.issues.length > 0) {
      checks.push({
        table: 'stok',
        issue: `${item.name || item.id}: ${result.issues.join('; ')}`,
        severity: result.fixed ? 'warning' : 'info',
        fixed: result.fixed && autoFix,
      });
      if (result.fixed) stokFixed = true;
    }
    return result.item;
  });

  if (stokFixed && autoFix) {
    setInStorage(StorageKey.STOK_DATA, fixedStok);
  }

  // ─── CARİ VERİLERİ ────────────────────────────────────────────────────
  const cariData = getFromStorage<any[]>(StorageKey.CARI_DATA) || [];
  let fixedCari = [...cariData];
  let cariFixed = false;

  const cariDups = findDuplicateIds(cariData);
  if (cariDups.length > 0) {
    checks.push({
      table: 'cari',
      issue: `${cariDups.length} duplicate cari ID`,
      severity: 'critical',
      fixed: autoFix,
    });
    if (autoFix) {
      fixedCari = deduplicateById(fixedCari);
      cariFixed = true;
    }
  }

  fixedCari = fixedCari.map(item => {
    const result = validateCariItem(item);
    if (result.issues.length > 0) {
      checks.push({
        table: 'cari',
        issue: `${item.companyName || item.company_name || item.id}: ${result.issues.join('; ')}`,
        severity: 'warning',
        fixed: result.fixed && autoFix,
      });
      if (result.fixed) cariFixed = true;
    }
    return result.item;
  });

  if (cariFixed && autoFix) {
    setInStorage(StorageKey.CARI_DATA, fixedCari);
  }

  // ─── FİŞ VERİLERİ ─────────────────────────────────────────────────────
  const fisData = getFromStorage<any[]>(StorageKey.FISLER) || [];
  let fixedFis = [...fisData];
  let fisFixed = false;

  const fisDups = findDuplicateIds(fisData);
  if (fisDups.length > 0) {
    checks.push({
      table: 'fisler',
      issue: `${fisDups.length} duplicate fiş ID`,
      severity: 'critical',
      fixed: autoFix,
    });
    if (autoFix) {
      fixedFis = deduplicateById(fixedFis);
      fisFixed = true;
    }
  }

  fixedFis = fixedFis.map(item => {
    const result = validateFisItem(item);
    if (result.issues.length > 0) {
      checks.push({
        table: 'fisler',
        issue: `Fiş ${item.id?.substring(0, 8)}: ${result.issues.join('; ')}`,
        severity: 'warning',
        fixed: result.fixed && autoFix,
      });
      if (result.fixed) fisFixed = true;
    }
    return result.item;
  });

  if (fisFixed && autoFix) {
    setInStorage(StorageKey.FISLER, fixedFis);
  }

  // ─── KASA VERİLERİ ────────────────────────────────────────────────────
  const kasaData = getFromStorage<any[]>(StorageKey.KASA_DATA) || [];
  const kasaDups = findDuplicateIds(kasaData);
  if (kasaDups.length > 0) {
    checks.push({
      table: 'kasa',
      issue: `${kasaDups.length} duplicate kasa ID`,
      severity: 'critical',
      fixed: autoFix,
    });
    if (autoFix) {
      setInStorage(StorageKey.KASA_DATA, deduplicateById(kasaData));
    }
  }

  // ─── ÇAPRAZ DOĞRULAMA: Fiş cari referansları ─────────────────────────
  const cariIds = new Set(fixedCari.map(c => c.id));
  const orphanedFisCari = fixedFis.filter(f => f.cari_id && !cariIds.has(f.cari_id));
  if (orphanedFisCari.length > 0) {
    checks.push({
      table: 'fisler',
      issue: `${orphanedFisCari.length} fiş silinmiş cari hesaba referans veriyor`,
      severity: 'info',
      fixed: false,
      details: 'Otomatik düzeltme uygulanmadı — yalnızca bilgilendirme',
    });
  }

  // ─── MALİ TUTARLILIK KONTROLÜ ─────────────────────────────────────────────
  // Fiş satır toplamı → fiş.total karşılaştırması
  let totalFisMismatch = 0;
  let totalFisFixed = false;
  const revalidatedFis = fixedFis.map(fis => {
    if (!Array.isArray(fis.items) || fis.items.length === 0) return fis;
    const computed = fis.items.reduce((sum: number, item: any) => {
      return sum + safeNum(item.quantity) * safeNum(item.price ?? item.unitPrice ?? item.birimFiyat);
    }, 0);
    const stored = safeNum(fis.total);
    // %0.1 tolerans — kayan nokta hatalarını yut
    if (stored > 0 && Math.abs(computed - stored) / stored > 0.001) {
      totalFisMismatch++;
      if (autoFix) {
        totalFisFixed = true;
        return { ...fis, total: computed };
      }
    }
    return fis;
  });

  if (totalFisMismatch > 0) {
    checks.push({
      table: 'fisler',
      issue: `${totalFisMismatch} fişte satır toplamı ≠ fiş.total`,
      severity: 'warning',
      fixed: autoFix,
      details: 'Satır toplam × birim fiyat baz alınarak hesaplandı',
    });
    if (totalFisFixed) {
      setInStorage(StorageKey.FISLER, revalidatedFis);
    }
  }

  // ─── STOK HAREKETİ TUTARLILIK KONTROLÜ ────────────────────────────────────
  // Giriş - Çıkış hareketlerinin toplamı mevcut stokla örtüşüyor mu?
  let stokMismatch = 0;
  fixedStok.forEach((prod: any) => {
    if (!Array.isArray(prod.movements) || prod.movements.length === 0) return;
    let computed = 0;
    for (const mv of prod.movements) {
      const qty = safeNum(mv.quantity);
      const type = (mv.type || '').toUpperCase();
      if (type === 'ALIS' || type === 'IN' || type === 'GIRIS') computed += qty;
      else if (type === 'SATIS' || type === 'OUT' || type === 'CIKIS') computed -= qty;
    }
    const current = safeNum(prod.currentStock);
    // 0 başlangıç stoğu varsayımıyla ≥ %10 sapma — ciddi hata
    if (current > 5 && Math.abs(computed - current) / current > 0.10) {
      stokMismatch++;
    }
  });

  if (stokMismatch > 0) {
    checks.push({
      table: 'stok',
      issue: `${stokMismatch} üründe hareket toplamı mevcut stokla uyuşmuyor (≥%10 sapma)`,
      severity: 'info',
      fixed: false,
      details: 'Manuel kontrol önerilir — başlangıç stok değeri bilinmiyorsa normaldir',
    });
  }

  // ─── CARİ DÖNGÜSEL REFERANS KONTROLÜ ──────────────────────────────────────
  const cariIdSet = new Set(fixedCari.map((c: any) => c.id));
  let orphanCount = 0;
  fixedCari.forEach((c: any) => {
    if (c.parentId && !cariIdSet.has(c.parentId)) orphanCount++;
  });
  if (orphanCount > 0) {
    checks.push({
      table: 'cari',
      issue: `${orphanCount} cari hesabın parent ID'si geçersiz`,
      severity: 'warning',
      fixed: false,
    });
  }

  const report: IntegrityReport = {
    timestamp: new Date().toISOString(),
    checks,
    totalIssues: checks.length,
    autoFixed: checks.filter(c => c.fixed).length,
  };

  console.log('[DataIntegrity] Check complete:', {
    totalIssues: report.totalIssues,
    autoFixed: report.autoFixed,
    critical: checks.filter(c => c.severity === 'critical').length,
    warnings: checks.filter(c => c.severity === 'warning').length,
  });

  return report;
}

/**
 * Quick storage health check — returns true if all data is readable
 */
export function quickHealthCheck(): boolean {
  const keys = [
    StorageKey.STOK_DATA,
    StorageKey.CARI_DATA,
    StorageKey.FISLER,
    StorageKey.KASA_DATA,
    StorageKey.PERSONEL_DATA,
  ];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        JSON.parse(raw);
      }
    } catch {
      console.error(`[DataIntegrity] Corrupted data for key: ${key}`);
      return false;
    }
  }
  return true;
}

/**
 * Veri sağlık skoru — 0-100 arası puan (100 = mükemmel)
 * Son integrity check raporunu baz alır, sıfırdan çalıştırır.
 */
export interface DataHealthScore {
  score: number;          // 0–100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  color: string;
  breakdown: { category: string; deduction: number; reason: string }[];
}

export function getDataHealthScore(): DataHealthScore {
  const report = runIntegrityCheck(false); // sadece oku, düzeltme yapma
  const breakdown: DataHealthScore['breakdown'] = [];
  let score = 100;

  const critical = report.checks.filter(c => c.severity === 'critical').length;
  const warnings = report.checks.filter(c => c.severity === 'warning').length;
  const infos    = report.checks.filter(c => c.severity === 'info').length;

  if (critical > 0) {
    const ded = Math.min(critical * 20, 60);
    score -= ded;
    breakdown.push({ category: 'Kritik Hatalar', deduction: ded, reason: `${critical} kritik sorun (yinelenen ID, bozuk veri)` });
  }
  if (warnings > 0) {
    const ded = Math.min(warnings * 5, 30);
    score -= ded;
    breakdown.push({ category: 'Uyarılar', deduction: ded, reason: `${warnings} uyarı (eksik alan, mali sapma)` });
  }
  if (infos > 0) {
    const ded = Math.min(infos * 2, 10);
    score -= ded;
    breakdown.push({ category: 'Bilgiler', deduction: ded, reason: `${infos} bilgilendirme notu` });
  }

  score = Math.max(0, score);

  let grade: DataHealthScore['grade'];
  let label: string;
  let color: string;
  if (score >= 90) { grade = 'A'; label = 'Mükemmel'; color = '#22c55e'; }
  else if (score >= 75) { grade = 'B'; label = 'İyi'; color = '#84cc16'; }
  else if (score >= 60) { grade = 'C'; label = 'Orta'; color = '#eab308'; }
  else if (score >= 40) { grade = 'D'; label = 'Zayıf'; color = '#f97316'; }
  else { grade = 'F'; label = 'Kritik'; color = '#ef4444'; }

  return { score, grade, label, color, breakdown };
}

/**
 * Get storage statistics
 */
export function getStorageStats(): Record<string, { count: number; sizeKB: number }> {
  const stats: Record<string, { count: number; sizeKB: number }> = {};
  
  const tables: Array<{ key: string; label: string }> = [
    { key: StorageKey.STOK_DATA, label: 'Stok' },
    { key: StorageKey.CARI_DATA, label: 'Cari' },
    { key: StorageKey.FISLER, label: 'Fişler' },
    { key: StorageKey.KASA_DATA, label: 'Kasa' },
    { key: StorageKey.PERSONEL_DATA, label: 'Personel' },
    { key: StorageKey.ARAC_DATA, label: 'Araçlar' },
    { key: StorageKey.URETIM_DATA, label: 'Üretim' },
  ];

  for (const { key, label } of tables) {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        stats[label] = {
          count: Array.isArray(parsed) ? parsed.length : 1,
          sizeKB: Math.round((raw.length * 2) / 1024), // UTF-16
        };
      } else {
        stats[label] = { count: 0, sizeKB: 0 };
      }
    } catch {
      stats[label] = { count: -1, sizeKB: 0 }; // -1 = corrupted
    }
  }

  return stats;
}
