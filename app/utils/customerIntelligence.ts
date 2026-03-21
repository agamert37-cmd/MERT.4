/**
 * MÜŞTERİ ZEKASI ALGORİTMASI v2 — İŞLEYEN ET
 *
 * Katmanlar:
 *  L1 – Temel Puanlama   : ödeme yöntemi, borç, sıklık, tutarlılık
 *  L2 – Davranış Analizi : churn riski, LTV, aylık trend, kohort
 *  L3 – Uyarı Üretimi    : kural tabanlı anomali tespiti
 *  L4 – Özet & Raporlama : topluluk istatistikleri
 *
 * SADECE YÖNETİCİ ROLÜNE AÇIKTIR.
 */

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type RiskLevel = 'guvenli' | 'dikkat' | 'riskli';
export type AlertSeverity = 'low' | 'medium' | 'high';
export type AlertType =
  | 'non_paying'
  | 'below_average'
  | 'risky_method'
  | 'long_absent'
  | 'declining_trend'
  | 'new_debt'
  | 'heavy_check'
  | 'churn_risk'
  | 'sudden_drop';

export interface CustomerAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  date: string;
}

export interface PurchasePoint {
  date: string;
  amount: number;
  method: string;
}

export interface MonthlyPoint {
  month: string;   // "2025-03"
  label: string;   // "Mar 25"
  amount: number;
  count: number;
}

export interface ScoreBreakdown {
  paymentMethodScore: number;  // 0-100
  debtScore: number;           // 0-100
  frequencyScore: number;      // 0-100
  consistencyScore: number;    // 0-100
}

export interface PaymentMethodStat {
  method: string;
  label: string;
  count: number;
  totalAmount: number;
  percent: number;
}

export interface CustomerScore {
  // Kimlik
  cariId: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  type: 'Müşteri' | 'Toptancı';
  region: string;

  // L1 – Ana Puan
  overallScore: number;        // 0-100
  breakdown: ScoreBreakdown;
  riskLevel: RiskLevel;

  // L1 – Borç
  balance: number;
  debtDays: number;
  isNonPaying: boolean;

  // L1 – Alım İstatistikleri
  saleCount: number;
  totalSales: number;
  avgPurchaseAmount: number;
  lastPurchaseAmount: number;
  lastSaleDate: string | null;
  daysSinceLastSale: number;
  firstSaleDate: string | null;
  customerAgeDays: number;     // ilk alımdan bu yana gün

  // L1 – Ortalama Altı
  isBelowAverage: boolean;
  belowAveragePercent: number;

  // L1 – Ödeme Yöntemi
  paymentMethods: PaymentMethodStat[];
  dominantMethod: string;

  // L2 – Churn Riski
  churnRisk: number;           // 0-100 (yüksek = kayıp riski)
  churnLabel: 'Düşük' | 'Orta' | 'Yüksek' | 'Kritik';

  // L2 – Yaşam Boyu Değer
  lifetimeValue: number;       // toplam gelir
  predictedMonthlyValue: number; // tahmini aylık değer

  // L2 – Aylık Trend (son 12 ay)
  monthlyTrend: MonthlyPoint[];
  monthOverMonthChange: number; // % değişim (son ay vs. önceki ay)

  // L2 – Mevsimsellik (bu ay geçen yıla göre)
  yoyChange: number;           // year-over-year % değişim

  // L2 – Alım Hızlanması / Yavaşlaması
  purchaseVelocity: number;    // son 30 gün / önceki 30 gün oranı

  // L3 – Uyarılar
  alerts: CustomerAlert[];
  highAlertCount: number;
  mediumAlertCount: number;

  // Meta
  computedAt: string;
  trend: 'up' | 'down' | 'stable'; // genel eğilim
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_SCORES: Record<string, number> = {
  nakit: 100,
  havale: 88,
  eft: 88,
  'kredi-karti': 72,
  pos: 72,
  duzeltme: 55,
  cek: 38,
  taksit: 22,
  bilinmiyor: 50,
};

const METHOD_LABELS: Record<string, string> = {
  nakit: 'Nakit',
  havale: 'Havale',
  eft: 'EFT',
  'kredi-karti': 'Kredi Kartı',
  pos: 'POS',
  cek: 'Çek',
  taksit: 'Taksit',
  duzeltme: 'Düzeltme',
  bilinmiyor: 'Bilinmiyor',
};

const WEIGHTS = {
  paymentMethod: 0.28,
  debt: 0.32,
  frequency: 0.22,
  consistency: 0.18,
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function daysBetween(dateA: string | Date, dateB: Date = new Date()): number {
  try {
    const diff = dateB.getTime() - new Date(dateA).getTime();
    return Math.max(0, Math.floor(diff / 86_400_000));
  } catch { return 0; }
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}

function toMonthKey(date: string): string {
  try { return date.slice(0, 7); } catch { return ''; }
}

function monthLabel(key: string): string {
  try {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
  } catch { return key; }
}

// ─── L1: Puan Fonksiyonları ───────────────────────────────────────────────────

function scorePaymentMethod(payments: { method: string; amount: number }[]): number {
  if (payments.length === 0) return 60;
  const total = payments.reduce((s, p) => s + p.amount, 0) || 1;
  return clamp(Math.round(payments.reduce((s, p) => {
    return s + ((p.amount / total) * (PAYMENT_METHOD_SCORES[p.method] ?? 50));
  }, 0)));
}

function scoreDebt(balance: number, debtDays: number): number {
  if (balance >= 0) return 100;
  if (debtDays < 15) return 82;
  if (debtDays < 30) return 58;
  if (debtDays < 60) return 30;
  return clamp(Math.max(0, 30 - (debtDays - 60) / 2));
}

function scoreFrequency(daysSinceLast: number): number {
  if (daysSinceLast <= 0)  return 100;
  if (daysSinceLast <= 7)  return 95;
  if (daysSinceLast <= 14) return 85;
  if (daysSinceLast <= 30) return 70;
  if (daysSinceLast <= 60) return 45;
  if (daysSinceLast <= 90) return 20;
  return 5;
}

function scoreConsistency(last3Avg: number, historicalAvg: number): number {
  if (historicalAvg <= 0 || last3Avg <= 0) return 70;
  const ratio = last3Avg / historicalAvg;
  if (ratio >= 0.85) return 100;
  if (ratio >= 0.70) return 82;
  if (ratio >= 0.55) return 60;
  if (ratio >= 0.40) return 35;
  return 15;
}

// ─── L2: Churn Riski ─────────────────────────────────────────────────────────

function computeChurnRisk(
  daysSinceLast: number,
  saleCount: number,
  purchaseVelocity: number,
  overallScore: number,
  balance: number,
): { risk: number; label: 'Düşük' | 'Orta' | 'Yüksek' | 'Kritik' } {
  if (saleCount === 0) return { risk: 85, label: 'Kritik' };

  let risk = 0;

  // Uzun süre alım yok → büyük etken
  if (daysSinceLast > 90) risk += 40;
  else if (daysSinceLast > 60) risk += 25;
  else if (daysSinceLast > 30) risk += 12;

  // Yavaşlayan alım hızı
  if (purchaseVelocity < 0.3) risk += 25;
  else if (purchaseVelocity < 0.6) risk += 12;

  // Genel puan düşükse
  risk += Math.round((100 - overallScore) * 0.25);

  // Borç varsa churn riski artar
  if (balance < 0) risk += 10;

  risk = clamp(risk);

  const label = risk < 25 ? 'Düşük'
    : risk < 50 ? 'Orta'
    : risk < 75 ? 'Yüksek'
    : 'Kritik';

  return { risk, label };
}

// ─── L2: Aylık Trend ─────────────────────────────────────────────────────────

function buildMonthlyTrend(purchases: PurchasePoint[], months = 12): MonthlyPoint[] {
  const now = new Date();
  const result: MonthlyPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = purchases.filter(p => toMonthKey(p.date) === key);
    result.push({
      month: key,
      label: monthLabel(key),
      amount: inMonth.reduce((s, p) => s + p.amount, 0),
      count: inMonth.length,
    });
  }
  return result;
}

// ─── L2: Satın Alma Hızı ─────────────────────────────────────────────────────

function purchaseVelocityCalc(purchases: PurchasePoint[]): number {
  const now = Date.now();
  const last30 = purchases.filter(p => now - new Date(p.date).getTime() < 30 * 86_400_000);
  const prev30 = purchases.filter(p => {
    const age = now - new Date(p.date).getTime();
    return age >= 30 * 86_400_000 && age < 60 * 86_400_000;
  });
  const l = last30.reduce((s, p) => s + p.amount, 0);
  const p = prev30.reduce((s, p) => s + p.amount, 0);
  if (p === 0) return l > 0 ? 2 : 1; // yeni müşteri veya hiç alım yok
  return l / p;
}

// ─── L3: Uyarı Üreteci ───────────────────────────────────────────────────────

function generateAlerts(
  balance: number,
  debtDays: number,
  daysSinceLast: number,
  isBelowAverage: boolean,
  belowAveragePercent: number,
  dominantMethod: string,
  checkPercent: number,
  recentAmounts: number[],
  churnRisk: number,
  velocity: number,
): CustomerAlert[] {
  const now = new Date().toISOString();
  const alerts: CustomerAlert[] = [];
  let idSeed = Date.now();

  const push = (type: AlertType, severity: AlertSeverity, message: string) => {
    alerts.push({ id: `${type}-${idSeed++}`, type, severity, message, date: now });
  };

  // Ödeme yapmayan
  if (balance < 0) {
    if (debtDays >= 60) push('non_paying', 'high', `${debtDays} gündür ödeme yapılmıyor — bakiye ₺${Math.abs(balance).toFixed(0)}`);
    else if (debtDays >= 30) push('non_paying', 'medium', `${debtDays} gündür açık borç: ₺${Math.abs(balance).toFixed(0)}`);
    else if (debtDays >= 15) push('new_debt', 'low', `${debtDays} gündür borçlu: ₺${Math.abs(balance).toFixed(0)}`);
  }

  // Ortalama altı alım
  if (isBelowAverage) {
    if (belowAveragePercent > 55) push('below_average', 'high', `Son alımlar ortalamanın %${belowAveragePercent.toFixed(0)} altında`);
    else if (belowAveragePercent > 30) push('below_average', 'medium', `Son alımlar ortalamanın %${belowAveragePercent.toFixed(0)} altında`);
    else push('below_average', 'low', `Son alımlar ortalamadan biraz düşük (%${belowAveragePercent.toFixed(0)})`);
  }

  // Uzun süre gelmemiş
  if (daysSinceLast >= 90) push('long_absent', 'high', `${daysSinceLast} gündür yeni alım yok`);
  else if (daysSinceLast >= 60) push('long_absent', 'medium', `${daysSinceLast} gündür yeni alım yok`);
  else if (daysSinceLast >= 30) push('long_absent', 'low', `${daysSinceLast} gündür yeni alım yok`);

  // Çek ağırlıklı
  if (checkPercent > 70) push('heavy_check', 'high', `Ödemelerin %${checkPercent.toFixed(0)}'i çekle — yüksek iade riski`);
  else if (checkPercent > 50) push('heavy_check', 'medium', `Ödemelerin %${checkPercent.toFixed(0)}'i çekle`);
  else if (dominantMethod === 'cek' || dominantMethod === 'taksit')
    push('risky_method', 'low', `Baskın ödeme yöntemi riskli: ${METHOD_LABELS[dominantMethod]}`);

  // Churn riski
  if (churnRisk >= 75) push('churn_risk', 'high', `Kritik kayıp riski — olasılık %${churnRisk}`);
  else if (churnRisk >= 50) push('churn_risk', 'medium', `Yüksek kayıp riski — olasılık %${churnRisk}`);

  // Ani düşüş (son 4 alımda her biri öncekinden düşük)
  if (recentAmounts.length >= 4) {
    const dips = recentAmounts.reduce((c, v, i) => i === 0 ? c : c + (v < recentAmounts[i - 1] ? 1 : 0), 0);
    if (dips >= recentAmounts.length - 1)
      push('declining_trend', 'medium', `Son ${recentAmounts.length} alımda sürekli düşüş trendi`);
  }

  // Alım hızı ani düşüş
  if (velocity < 0.2) push('sudden_drop', 'high', 'Bu ay alım hacminde ani düşüş (önceki aya göre -%80+)');
  else if (velocity < 0.4) push('sudden_drop', 'medium', 'Bu ay alım hacminde belirgin düşüş');

  return alerts;
}

// ─── Ana Algoritma ────────────────────────────────────────────────────────────

export function computeCustomerScores(
  cariList: any[],
  fisler: any[],
): CustomerScore[] {
  const now = new Date();

  return cariList
    .filter(c => c.type === 'Müşteri' || c.type === 'Toptancı')
    .map(cari => {

      // ── Alım geçmişi ─────────────────────────────────────────
      const purchases: PurchasePoint[] = fisler
        .filter(f =>
          (f.mode === 'satis' || f.mode === 'sale') &&
          (f.cariId === cari.id || f.cari?.id === cari.id) &&
          f.date && (f.total ?? f.amount ?? 0) > 0
        )
        .map(f => ({
          date: f.date,
          amount: f.total ?? f.amount ?? 0,
          method: f.payment?.method ?? 'bilinmiyor',
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const saleCount = purchases.length;
      const totalSales = purchases.reduce((s, p) => s + p.amount, 0);
      const avgPurchaseAmount = saleCount > 0 ? totalSales / saleCount : 0;

      const lastP = purchases[purchases.length - 1] ?? null;
      const firstP = purchases[0] ?? null;
      const lastSaleDate = lastP?.date ?? null;
      const firstSaleDate = firstP?.date ?? null;
      const daysSinceLastSale = lastSaleDate ? daysBetween(lastSaleDate, now) : 9999;
      const customerAgeDays = firstSaleDate ? daysBetween(firstSaleDate, now) : 0;
      const lastPurchaseAmount = lastP?.amount ?? 0;

      // Son 3 alım ortalaması
      const last3 = purchases.slice(-3);
      const last3Avg = last3.length > 0 ? last3.reduce((s, p) => s + p.amount, 0) / last3.length : 0;
      const belowAveragePercent = avgPurchaseAmount > 0
        ? clamp(((avgPurchaseAmount - last3Avg) / avgPurchaseAmount) * 100)
        : 0;
      const isBelowAverage = belowAveragePercent > 25 && saleCount >= 4;

      // ── Ödeme yöntemleri ─────────────────────────────────────
      const methodMap: Record<string, { count: number; amount: number }> = {};
      purchases.forEach(p => {
        const m = p.method || 'bilinmiyor';
        if (!methodMap[m]) methodMap[m] = { count: 0, amount: 0 };
        methodMap[m].count++;
        methodMap[m].amount += p.amount;
      });
      const paymentMethods: PaymentMethodStat[] = Object.entries(methodMap)
        .map(([method, s]) => ({
          method, label: METHOD_LABELS[method] ?? method,
          count: s.count, totalAmount: s.amount,
          percent: saleCount > 0 ? Math.round((s.count / saleCount) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      const dominantMethod = paymentMethods[0]?.method ?? 'bilinmiyor';
      const checkPercent = methodMap['cek']
        ? (methodMap['cek'].count / (saleCount || 1)) * 100
        : 0;

      // ── Borç ─────────────────────────────────────────────────
      const balance: number = cari.balance ?? cari.openingBalance ?? 0;
      let debtDays = 0;
      if (balance < 0) {
        const history: any[] = cari.transactionHistory ?? [];
        const lastCredit = [...history]
          .filter(tx => tx.type === 'credit')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        debtDays = lastCredit
          ? daysBetween(lastCredit.date, now)
          : (lastSaleDate ? daysBetween(lastSaleDate, now) : 30);
      }
      const recentPayment = (cari.transactionHistory ?? []).some(
        (tx: any) => tx.type === 'credit' && daysBetween(tx.date, now) <= 14
      );
      const isNonPaying = balance < 0 && debtDays >= 30 && !recentPayment;

      // ── L1 Puanlar ───────────────────────────────────────────
      const paymentMethodScore = scorePaymentMethod(purchases.map(p => ({ method: p.method, amount: p.amount })));
      const debtScore = scoreDebt(balance, debtDays);
      const frequencyScore = scoreFrequency(daysSinceLastSale);
      const consistencyScore = scoreConsistency(last3Avg, avgPurchaseAmount);

      const overallScore = clamp(Math.round(
        paymentMethodScore * WEIGHTS.paymentMethod +
        debtScore * WEIGHTS.debt +
        frequencyScore * WEIGHTS.frequency +
        consistencyScore * WEIGHTS.consistency
      ));
      const riskLevel = overallScore >= 72 ? 'guvenli' : overallScore >= 45 ? 'dikkat' : 'riskli';

      // ── L2: Aylık trend ──────────────────────────────────────
      const monthlyTrend = buildMonthlyTrend(purchases, 12);
      const currentMonthAmount = monthlyTrend[monthlyTrend.length - 1]?.amount ?? 0;
      const prevMonthAmount = monthlyTrend[monthlyTrend.length - 2]?.amount ?? 0;
      const monthOverMonthChange = prevMonthAmount > 0
        ? Math.round(((currentMonthAmount - prevMonthAmount) / prevMonthAmount) * 100)
        : 0;

      // YoY karşılaştırma (bu ay geçen yılın aynı ayıyla)
      const yoyMonthKey = (() => {
        const d = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })();
      const yoyAmount = monthlyTrend.find(m => m.month === yoyMonthKey)?.amount ?? 0;
      const yoyChange = yoyAmount > 0
        ? Math.round(((currentMonthAmount - yoyAmount) / yoyAmount) * 100)
        : 0;

      // ── L2: Alım hızı ────────────────────────────────────────
      const velocity = purchaseVelocityCalc(purchases);

      // ── L2: Churn Riski ──────────────────────────────────────
      const { risk: churnRisk, label: churnLabel } = computeChurnRisk(
        daysSinceLastSale, saleCount, velocity, overallScore, balance
      );

      // ── L2: LTV & Tahmini aylık değer ───────────────────────
      const lifetimeValue = totalSales;
      const predictedMonthlyValue = customerAgeDays > 30 && saleCount > 0
        ? Math.round((totalSales / (customerAgeDays / 30)) * 100) / 100
        : avgPurchaseAmount;

      // ── Genel trend ──────────────────────────────────────────
      const trend: 'up' | 'down' | 'stable' =
        velocity > 1.15 ? 'up' : velocity < 0.85 ? 'down' : 'stable';

      // ── L3: Uyarılar ─────────────────────────────────────────
      const alerts = generateAlerts(
        balance, debtDays, daysSinceLastSale,
        isBelowAverage, belowAveragePercent,
        dominantMethod, checkPercent,
        purchases.slice(-5).map(p => p.amount),
        churnRisk, velocity,
      );

      return {
        cariId: cari.id,
        companyName: cari.companyName ?? cari.company_name ?? 'İsimsiz',
        contactPerson: cari.contactPerson ?? cari.contact_person ?? '',
        phone: cari.phone ?? '',
        type: cari.type ?? 'Müşteri',
        region: cari.region ?? '',

        overallScore,
        breakdown: { paymentMethodScore, debtScore, frequencyScore, consistencyScore },
        riskLevel,

        balance, debtDays, isNonPaying,

        saleCount, totalSales, avgPurchaseAmount, lastPurchaseAmount,
        lastSaleDate, daysSinceLastSale, firstSaleDate, customerAgeDays,

        isBelowAverage, belowAveragePercent,

        paymentMethods, dominantMethod,

        churnRisk, churnLabel,
        lifetimeValue, predictedMonthlyValue,
        monthlyTrend, monthOverMonthChange, yoyChange,
        purchaseVelocity: velocity,

        alerts,
        highAlertCount: alerts.filter(a => a.severity === 'high').length,
        mediumAlertCount: alerts.filter(a => a.severity === 'medium').length,

        computedAt: now.toISOString(),
        trend,
        purchaseTrend: purchases.slice(-10),
      } satisfies CustomerScore;
    });
}

// ─── L4: Özet İstatistikler ───────────────────────────────────────────────────

export interface RiskCohort {
  label: string;
  count: number;
  percent: number;
  avgScore: number;
  totalDebt: number;
  totalRevenue: number;
}

export interface IntelligenceSummary {
  total: number;
  guvenli: number;
  dikkat: number;
  riskli: number;
  nonPaying: number;
  belowAverage: number;
  totalAlerts: number;
  highAlerts: number;
  avgScore: number;
  totalDebt: number;         // tüm müşterilerin toplam borcu
  totalRevenue: number;      // tüm müşterilerin toplam alım toplamı
  avgChurnRisk: number;
  topRiskyCustomers: CustomerScore[];
  topChurnRisk: CustomerScore[];
  recentAlerts: (CustomerAlert & { companyName: string })[];
  cohorts: RiskCohort[];
  methodDistribution: { method: string; label: string; count: number; percent: number }[];
  monthlyRevenue: MonthlyPoint[];  // tüm müşterilerin aylık toplamı
}

export function summarizeScores(scores: CustomerScore[]): IntelligenceSummary {
  const n = scores.length || 1;
  const guvenli = scores.filter(s => s.riskLevel === 'guvenli').length;
  const dikkat = scores.filter(s => s.riskLevel === 'dikkat').length;
  const riskli = scores.filter(s => s.riskLevel === 'riskli').length;
  const nonPaying = scores.filter(s => s.isNonPaying).length;
  const belowAverage = scores.filter(s => s.isBelowAverage).length;

  const allAlerts = scores.flatMap(s => s.alerts);
  const totalAlerts = allAlerts.length;
  const highAlerts = allAlerts.filter(a => a.severity === 'high').length;

  const avgScore = Math.round(scores.reduce((s, c) => s + c.overallScore, 0) / n);
  const totalDebt = scores.filter(s => s.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);
  const totalRevenue = scores.reduce((s, c) => s + c.totalSales, 0);
  const avgChurnRisk = Math.round(scores.reduce((s, c) => s + c.churnRisk, 0) / n);

  const topRiskyCustomers = [...scores]
    .sort((a, b) => a.overallScore - b.overallScore)
    .slice(0, 8);

  const topChurnRisk = [...scores]
    .sort((a, b) => b.churnRisk - a.churnRisk)
    .slice(0, 6);

  const recentAlerts = scores
    .flatMap(s => s.alerts.map(a => ({ ...a, companyName: s.companyName })))
    .sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.severity] - { high: 3, medium: 2, low: 1 }[a.severity]))
    .slice(0, 25);

  const cohorts: RiskCohort[] = [
    { label: 'Güvenli',  scores: scores.filter(s => s.riskLevel === 'guvenli') },
    { label: 'Dikkat',   scores: scores.filter(s => s.riskLevel === 'dikkat') },
    { label: 'Riskli',   scores: scores.filter(s => s.riskLevel === 'riskli') },
  ].map(({ label, scores: g }) => ({
    label,
    count: g.length,
    percent: Math.round((g.length / n) * 100),
    avgScore: g.length > 0 ? Math.round(g.reduce((s, c) => s + c.overallScore, 0) / g.length) : 0,
    totalDebt: g.filter(s => s.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0),
    totalRevenue: g.reduce((s, c) => s + c.totalSales, 0),
  }));

  // Ödeme yöntemi dağılımı (tüm müşteriler)
  const methodCount: Record<string, number> = {};
  scores.forEach(s => s.paymentMethods.forEach(pm => {
    methodCount[pm.method] = (methodCount[pm.method] ?? 0) + pm.count;
  }));
  const totalMethodCount = Object.values(methodCount).reduce((s, v) => s + v, 0) || 1;
  const methodDistribution = Object.entries(methodCount)
    .map(([method, count]) => ({
      method, label: METHOD_LABELS[method] ?? method,
      count, percent: Math.round((count / totalMethodCount) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // Toplam aylık gelir (tüm müşterilerin birleşimi, son 12 ay)
  const monthlyMap: Record<string, MonthlyPoint> = {};
  scores.forEach(s => s.monthlyTrend.forEach(mp => {
    if (!monthlyMap[mp.month]) monthlyMap[mp.month] = { ...mp, amount: 0, count: 0 };
    monthlyMap[mp.month].amount += mp.amount;
    monthlyMap[mp.month].count += mp.count;
  }));
  const monthlyRevenue = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  return {
    total: scores.length,
    guvenli, dikkat, riskli,
    nonPaying, belowAverage,
    totalAlerts, highAlerts,
    avgScore, totalDebt, totalRevenue, avgChurnRisk,
    topRiskyCustomers, topChurnRisk, recentAlerts,
    cohorts, methodDistribution, monthlyRevenue,
  };
}

// ─── Yardımcı Exportlar ───────────────────────────────────────────────────────

export { METHOD_LABELS };
export const INTELLIGENCE_VERSION = '2.0.0';
