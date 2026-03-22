import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, Sparkles, Bug, Paintbrush, Zap, BarChart3,
  Lock, RefreshCw, ArrowLeft, Search, Filter, ChevronDown,
  CheckCircle2, AlertTriangle, Info, Star, Rocket, Wrench,
  Eye, GitBranch, Calendar, Tag
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';

// ─── Güncelleme veri tipi ─────────────────────────────────────────────────────
type UpdateCategory = 'security' | 'feature' | 'bugfix' | 'ui' | 'performance' | 'analytics';

interface UpdateNote {
  id: string;
  version: string;
  date: string;
  category: UpdateCategory;
  title: string;
  description: string;
  details?: string[];
  impact: 'high' | 'medium' | 'low';
  isNew?: boolean;
}

// ─── Kategori bilgileri ───────────────────────────────────────────────────────
const CATEGORIES: Record<UpdateCategory, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  security:    { label: 'Güvenlik',   icon: Lock,       color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  feature:     { label: 'Özellik',    icon: Sparkles,   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  bugfix:      { label: 'Düzeltme',   icon: Bug,        color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  ui:          { label: 'Arayüz',     icon: Paintbrush, color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20' },
  performance: { label: 'Performans', icon: Zap,        color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  analytics:   { label: 'Analiz',     icon: BarChart3,  color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
};

const IMPACT_CONFIG = {
  high:   { label: 'Yüksek Etki', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle },
  medium: { label: 'Orta Etki',   color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Info },
  low:    { label: 'Düşük Etki',  color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', icon: CheckCircle2 },
};

// ─── Güncelleme verileri ──────────────────────────────────────────────────────
const UPDATE_NOTES: UpdateNote[] = [
  {
    id: 'u-001', version: 'v4.2.1', date: '2026-03-22', category: 'feature',
    title: 'Canlı Dashboard Grafikleri',
    description: 'Dashboard artık her 15 saniyede otomatik olarak yenileniyor. Saatlik ciro akışı ve kârlılık trend grafikleri eklendi.',
    details: [
      'Saatlik ciro akışı grafiği (Area + Bar kombine)',
      '7 günlük kârlılık trendi (Net Kâr + Kâr Oranı çift eksen)',
      'Stat kartlarında canlı nabız animasyonu',
      'Otomatik yenileme göstergesi (15s aralık)',
    ],
    impact: 'high', isNew: true,
  },
  {
    id: 'u-002', version: 'v4.2.1', date: '2026-03-22', category: 'analytics',
    title: 'Güncelleme Notları Paneli',
    description: 'Güvenlik Kalkanı bölümünde tüm güncellemeler, özellikler ve düzeltmeler detaylı olarak listeleniyor.',
    details: [
      'Kategori bazlı filtreleme (Güvenlik, Özellik, Düzeltme...)',
      'Etki seviyesi göstergeleri',
      'Arama fonksiyonu',
      'Versiyon bazlı gruplama',
    ],
    impact: 'medium', isNew: true,
  },
  {
    id: 'u-003', version: 'v4.2.1', date: '2026-03-22', category: 'performance',
    title: 'Dashboard Render Optimizasyonu',
    description: 'Canlı saat bileşeni izole edildi, ana dashboard her saniye yeniden render edilmiyor.',
    details: [
      'LiveClockWidget ayrı bileşene taşındı',
      'useMemo ile veri hesaplamaları optimize edildi',
      'Sparkline genişletildi, karşılaştırma etiketi eklendi',
    ],
    impact: 'medium', isNew: true,
  },
  {
    id: 'u-004', version: 'v4.2', date: '2026-03-20', category: 'security',
    title: 'Brute Force Koruması',
    description: 'Ardışık başarısız giriş denemelerinde hesap otomatik olarak kilitleniyor.',
    details: [
      '5 başarısız denemeden sonra 15 dakika hesap kilidi',
      'IP bazlı oran sınırlama',
      'Güvenlik loglarına otomatik kayıt',
    ],
    impact: 'high',
  },
  {
    id: 'u-005', version: 'v4.2', date: '2026-03-20', category: 'security',
    title: 'Otomatik Oturum Kapatma',
    description: '15 dakika hareketsizlik sonrası oturum otomatik olarak sonlandırılıyor.',
    details: [
      'Mouse/klavye hareketi izleme',
      'Oturum süresi dolmadan 2 dakika uyarı',
      'Güvenli çıkış ve veri temizliği',
    ],
    impact: 'high',
  },
  {
    id: 'u-006', version: 'v4.2', date: '2026-03-20', category: 'feature',
    title: 'Güvenlik Merkezi Modülü',
    description: 'Yeni Güvenlik Merkezi sayfası ile tüm güvenlik ayarları ve logları tek noktadan yönetiliyor.',
    details: [
      'Güvenlik skoru (A-F derecelendirme)',
      'Aktif oturum yönetimi ve zorla çıkış',
      'Tehdit seviyesi sınıflandırması',
      '2FA yapılandırma desteği',
      'Güvenlik zaman çizelgesi görselleştirmesi',
    ],
    impact: 'high',
  },
  {
    id: 'u-007', version: 'v4.2', date: '2026-03-20', category: 'ui',
    title: 'Karanlık Tema & Cam Efektleri',
    description: 'Arayüz karanlık tema ile yeniden tasarlandı. Frosted glass ve glow efektleri eklendi.',
    details: [
      'Catppuccin Mocha renk paleti',
      'Backdrop blur efektleri',
      'Animasyonlu hover ve tap efektleri',
      'Responsive mobil uyum iyileştirmeleri',
    ],
    impact: 'medium',
  },
  {
    id: 'u-008', version: 'v4.2', date: '2026-03-20', category: 'analytics',
    title: 'Gelişmiş Analiz Grafikleri',
    description: 'Dashboard\'a profesyonel seviyede analitik grafikler eklendi.',
    details: [
      'Performans Radarı (6 boyutlu işletme analizi)',
      'Saatlik Satış Isı Haritası',
      'Satış Hunisi (funnel) dönüşüm oranları',
      'Nakit Akışı Waterfall grafiği',
      'KPI Ticker bant',
      'Takvim ısı haritası (12 haftalık)',
      'Kategori yarışı bar grafiği',
    ],
    impact: 'high',
  },
  {
    id: 'u-009', version: 'v4.2', date: '2026-03-19', category: 'bugfix',
    title: 'Stok ve Fiş Hesaplama Düzeltmeleri',
    description: 'Kritik stok hesaplama ve fiş tutarı doğruluğu iyileştirildi.',
    details: [
      'safeNum fonksiyonu ile NaN koruması',
      'İade fişlerinde negatif tutar düzeltmesi',
      'Boş ürün adı kontrolü',
    ],
    impact: 'medium',
  },
  {
    id: 'u-010', version: 'v4.2', date: '2026-03-19', category: 'feature',
    title: 'Aktivite Loglaması',
    description: 'Tüm kullanıcı işlemleri detaylı olarak loglanıyor.',
    details: [
      'Sayfa ziyaretleri, satış/alış işlemleri',
      'PDF rapor indirme kayıtları',
      'Silme işlemleri (kim, ne zaman, ne)',
      'Zaman çizelgesi görünümü',
    ],
    impact: 'medium',
  },
  {
    id: 'u-011', version: 'v4.1', date: '2026-03-15', category: 'feature',
    title: 'Müşteri Zekası Algoritması v2',
    description: 'Cari hesaplar için gelişmiş müşteri analizi ve skorlama sistemi.',
    details: [
      'RFM analizi (Recency, Frequency, Monetary)',
      'Müşteri segmentasyonu',
      'Churn risk tahmini',
    ],
    impact: 'high',
  },
  {
    id: 'u-012', version: 'v4.1', date: '2026-03-14', category: 'performance',
    title: 'Veritabanı Senkronizasyon Optimizasyonu',
    description: 'Çoklu veritabanı senkronizasyonu ve gerçek zamanlı veri akışı.',
    details: [
      'Supabase realtime subscription',
      'Otomatik conflict resolution',
      'Offline-first veri stratejisi',
    ],
    impact: 'high',
  },
];

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export function UpdateNotesPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<UpdateCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedImpact, setSelectedImpact] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const filteredNotes = useMemo(() => {
    return UPDATE_NOTES.filter(note => {
      if (selectedCategory !== 'all' && note.category !== selectedCategory) return false;
      if (selectedImpact !== 'all' && note.impact !== selectedImpact) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return note.title.toLowerCase().includes(q) || note.description.toLowerCase().includes(q) || note.details?.some(d => d.toLowerCase().includes(q));
      }
      return true;
    });
  }, [selectedCategory, selectedImpact, searchQuery]);

  // Versiyon bazlı gruplama
  const groupedNotes = useMemo(() => {
    const groups: Record<string, UpdateNote[]> = {};
    filteredNotes.forEach(note => {
      if (!groups[note.version]) groups[note.version] = [];
      groups[note.version].push(note);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }));
  }, [filteredNotes]);

  const totalNew = UPDATE_NOTES.filter(n => n.isNew).length;
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    UPDATE_NOTES.forEach(n => { counts[n.category] = (counts[n.category] || 0) + 1; });
    return counts;
  }, []);

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-28 sm:pb-6 lg:pb-10">

      {/* ─── Hero Header ─── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl bg-gradient-to-br from-emerald-500/[0.08] via-[#111] to-blue-500/[0.06] border border-emerald-500/20 p-6 sm:p-8 lg:p-10"
      >
        {/* Dekoratif arka plan */}
        <div className="absolute top-0 right-0 opacity-[0.04]">
          <ShieldCheck className="w-64 h-64 text-emerald-400" />
        </div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-0 right-1/4 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl" />

        <div className="relative z-10">
          {/* Geri butonu */}
          <button onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors mb-4 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Dashboard'a Dön
          </button>

          <div className="flex items-start sm:items-center gap-4 sm:gap-5">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="p-3 sm:p-4 bg-emerald-500/20 rounded-2xl border border-emerald-500/30 shadow-xl shadow-emerald-500/10"
            >
              <ShieldCheck className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400" />
            </motion.div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight">
                Güvenlik Kalkanı
              </h1>
              <p className="text-sm sm:text-base text-gray-400 mt-1">Güncelleme Raporu & Değişiklik Geçmişi</p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="text-[10px] sm:text-xs font-bold text-emerald-400">Koruma Aktif</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] sm:text-xs font-bold text-blue-400">
                  <Tag className="w-3 h-3 inline mr-1" />v4.2.1 KALKAN
                </span>
                {totalNew > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] sm:text-xs font-bold text-amber-400 animate-pulse">
                    <Star className="w-3 h-3 inline mr-1" />{totalNew} Yeni Güncelleme
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* İstatistik kartları */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 mt-6">
            {(Object.entries(CATEGORIES) as [UpdateCategory, typeof CATEGORIES[UpdateCategory]][]).map(([key, cat]) => {
              const CatIcon = cat.icon;
              const count = categoryCounts[key] || 0;
              return (
                <motion.button
                  key={key}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory(selectedCategory === key ? 'all' : key)}
                  className={`p-2.5 sm:p-3 rounded-xl border text-center transition-all ${
                    selectedCategory === key
                      ? `${cat.bg} ${cat.border} ring-1 ring-current/20`
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                  }`}
                >
                  <CatIcon className={`w-4 h-4 mx-auto mb-1 ${selectedCategory === key ? cat.color : 'text-gray-500'}`} />
                  <p className={`text-lg sm:text-xl font-black ${selectedCategory === key ? cat.color : 'text-white'}`}>{count}</p>
                  <p className="text-[8px] sm:text-[9px] text-gray-500 font-bold uppercase tracking-wider">{cat.label}</p>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ─── Filtreler ─── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Güncelleme ara..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#111] border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'high', 'medium', 'low'] as const).map(imp => (
            <button key={imp} onClick={() => setSelectedImpact(imp)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                selectedImpact === imp
                  ? imp === 'all' ? 'bg-white/10 border-white/20 text-white' : `${IMPACT_CONFIG[imp].bg} ${IMPACT_CONFIG[imp].border} ${IMPACT_CONFIG[imp].color}`
                  : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:text-white'
              }`}
            >
              {imp === 'all' ? 'Tümü' : IMPACT_CONFIG[imp].label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Güncelleme Listesi (Versiyon Bazlı) ─── */}
      <div className="space-y-6 sm:space-y-8">
        {groupedNotes.map(([version, notes], groupIdx) => (
          <motion.div
            key={version}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIdx * 0.1 }}
          >
            {/* Versiyon başlığı */}
            <div className="flex items-center gap-3 mb-3 sm:mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <GitBranch className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-sm sm:text-base font-black text-white">{version}</span>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              <span className="text-[10px] sm:text-xs text-gray-600 font-mono flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                {notes[0]?.date}
              </span>
            </div>

            {/* Notlar */}
            <div className="space-y-2.5 sm:space-y-3">
              {notes.map((note, noteIdx) => {
                const cat = CATEGORIES[note.category];
                const CatIcon = cat.icon;
                const impact = IMPACT_CONFIG[note.impact];
                const ImpactIcon = impact.icon;
                const isExpanded = expandedId === note.id;

                return (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: groupIdx * 0.1 + noteIdx * 0.05 }}
                    className={`rounded-2xl border overflow-hidden transition-all cursor-pointer ${
                      isExpanded
                        ? `bg-white/[0.04] border-white/[0.12] shadow-lg`
                        : 'bg-[#111] border-white/[0.06] hover:bg-white/[0.03] hover:border-white/[0.1]'
                    }`}
                    onClick={() => setExpandedId(isExpanded ? null : note.id)}
                  >
                    <div className="p-3.5 sm:p-4 lg:p-5">
                      <div className="flex items-start gap-3 sm:gap-4">
                        {/* Kategori ikonu */}
                        <motion.div
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          className={`p-2 sm:p-2.5 rounded-xl ${cat.bg} border ${cat.border} shrink-0 mt-0.5`}
                        >
                          <CatIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${cat.color}`} />
                        </motion.div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-sm sm:text-base font-bold text-white">{note.title}</h3>
                            {note.isNew && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30 animate-pulse"
                              >
                                YENİ
                              </motion.span>
                            )}
                            <span className={`px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold rounded-md border ${cat.bg} ${cat.border} ${cat.color}`}>
                              {cat.label}
                            </span>
                            <span className={`px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold rounded-md border ${impact.bg} ${impact.border} ${impact.color} flex items-center gap-0.5`}>
                              <ImpactIcon className="w-2.5 h-2.5" />{impact.label}
                            </span>
                          </div>
                          <p className="text-[11px] sm:text-xs text-gray-400 leading-relaxed">{note.description}</p>
                        </div>

                        {/* Expand indicator */}
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                          className="shrink-0 mt-1"
                        >
                          <ChevronDown className="w-4 h-4 text-gray-600" />
                        </motion.div>
                      </div>

                      {/* Detaylar (genişletilmiş) */}
                      <AnimatePresence>
                        {isExpanded && note.details && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/[0.06]">
                              <div className="flex items-center gap-1.5 mb-2.5">
                                <Eye className="w-3 h-3 text-gray-500" />
                                <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">Detaylar</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                                {note.details.map((detail, di) => (
                                  <motion.div
                                    key={di}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: di * 0.05 }}
                                    className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02]"
                                  >
                                    <CheckCircle2 className={`w-3.5 h-3.5 ${cat.color} shrink-0 mt-0.5`} />
                                    <span className="text-[10px] sm:text-[11px] text-gray-300 leading-relaxed">{detail}</span>
                                  </motion.div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Sonuç yok */}
      {filteredNotes.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <Search className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Arama kriterlerinize uygun güncelleme bulunamadı.</p>
          <button onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setSelectedImpact('all'); }}
            className="mt-3 text-xs text-blue-400 hover:text-blue-300 font-bold"
          >
            Filtreleri Temizle
          </button>
        </motion.div>
      )}

      {/* Alt bilgi */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-center"
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500/60" />
          <span className="text-xs font-bold text-gray-500">MERT.4 ERP — Güvenlik Kalkanı v4.2 KALKAN</span>
        </div>
        <p className="text-[10px] sm:text-[11px] text-gray-600">
          Tüm güncellemeler otomatik olarak uygulanır. Sistem güvenliği sürekli izlenmektedir.
        </p>
      </motion.div>
    </div>
  );
}
