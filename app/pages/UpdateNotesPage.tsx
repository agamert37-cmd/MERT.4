import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, Sparkles, Bug, Paintbrush, Zap, BarChart3,
  Lock, ArrowLeft, Search, ChevronDown,
  CheckCircle2, AlertTriangle, Info, Star, Wrench,
  Eye, GitBranch, Calendar, Tag, Bell, X,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';
import {
  UPDATE_NOTES, CURRENT_VERSION, SEEN_VERSION_KEY,
  getVersionGroups, type UpdateCategory, type UpdateNote,
} from '../utils/updateNotes';

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
  high:   { label: 'Yüksek', color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20',   icon: AlertTriangle },
  medium: { label: 'Orta',   color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Info },
  low:    { label: 'Düşük',  color: 'text-gray-400',  bg: 'bg-gray-500/10',  border: 'border-gray-500/20',  icon: CheckCircle2 },
};

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export function UpdateNotesPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<UpdateCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedImpact, setSelectedImpact] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [hasNewUpdates, setHasNewUpdates] = useState(false);

  // Yeni güncelleme var mı kontrol et
  useEffect(() => {
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    setHasNewUpdates(!seen || seen !== CURRENT_VERSION);
  }, []);

  // Sayfayı açınca "görüldü" olarak işaretle
  const markAllSeen = () => {
    localStorage.setItem(SEEN_VERSION_KEY, CURRENT_VERSION);
    setHasNewUpdates(false);
    window.dispatchEvent(new CustomEvent('update_notes_seen'));
  };

  const filteredNotes = useMemo(() => {
    return UPDATE_NOTES.filter(note => {
      if (selectedCategory !== 'all' && note.category !== selectedCategory) return false;
      if (selectedImpact !== 'all' && note.impact !== selectedImpact) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return note.title.toLowerCase().includes(q) ||
          note.description.toLowerCase().includes(q) ||
          note.details?.some(d => d.toLowerCase().includes(q));
      }
      return true;
    });
  }, [selectedCategory, selectedImpact, searchQuery]);

  const groupedNotes = useMemo(() => getVersionGroups(filteredNotes), [filteredNotes]);

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
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl bg-gradient-to-br from-emerald-500/[0.08] via-[#111] to-blue-500/[0.06] border border-emerald-500/20 p-4 sm:p-8 lg:p-10"
      >
        <div className="absolute top-0 right-0 opacity-[0.04]">
          <ShieldCheck className="w-64 h-64 text-emerald-400" />
        </div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-0 right-1/4 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl" />

        <div className="relative z-10">
          {/* Geri butonu */}
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors mb-4 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Dashboard'a Dön
          </button>

          <div className="flex items-start sm:items-center gap-3 sm:gap-5">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="p-3 sm:p-4 bg-emerald-500/20 rounded-2xl border border-emerald-500/30 shadow-xl shadow-emerald-500/10 flex-shrink-0"
            >
              <ShieldCheck className="w-7 h-7 sm:w-10 sm:h-10 text-emerald-400" />
            </motion.div>

            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tight">
                Güvenlik Kalkanı
              </h1>
              <p className="text-xs sm:text-base text-gray-400 mt-0.5">Güncelleme Raporu & Değişiklik Geçmişi</p>

              <div className="flex items-center gap-2 mt-2 sm:mt-3 flex-wrap">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">Koruma Aktif</span>
                </div>
                <span className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400">
                  <Tag className="w-2.5 h-2.5 inline mr-1" />{CURRENT_VERSION} KALKAN
                </span>
                {hasNewUpdates && totalNew > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-400 animate-pulse">
                    <Star className="w-2.5 h-2.5 inline mr-1" />{totalNew} Yeni Güncelleme
                  </span>
                )}
              </div>
            </div>

            {/* Tümünü okundu işaretle */}
            {hasNewUpdates && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={markAllSeen}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Okundu İşaretle</span>
              </motion.button>
            )}
          </div>

          {/* Kategori istatistik kartları */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 mt-4 sm:mt-6">
            {(Object.entries(CATEGORIES) as [UpdateCategory, typeof CATEGORIES[UpdateCategory]][]).map(([key, cat]) => {
              const CatIcon = cat.icon;
              const count = categoryCounts[key] || 0;
              return (
                <motion.button
                  key={key}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory(selectedCategory === key ? 'all' : key)}
                  className={`p-2 sm:p-3 rounded-xl border text-center transition-all ${
                    selectedCategory === key
                      ? `${cat.bg} ${cat.border} ring-1 ring-current/20`
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                  }`}
                >
                  <CatIcon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mx-auto mb-1 ${selectedCategory === key ? cat.color : 'text-gray-500'}`} />
                  <p className={`text-base sm:text-xl font-black ${selectedCategory === key ? cat.color : 'text-white'}`}>{count}</p>
                  <p className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">{cat.label}</p>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ─── Filtreler ─── */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Güncelleme ara..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#111] border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
          {(['all', 'high', 'medium', 'low'] as const).map(imp => (
            <button
              key={imp}
              onClick={() => setSelectedImpact(imp)}
              className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-all flex-shrink-0 ${
                selectedImpact === imp
                  ? imp === 'all'
                    ? 'bg-white/10 border-white/20 text-white'
                    : `${IMPACT_CONFIG[imp].bg} ${IMPACT_CONFIG[imp].border} ${IMPACT_CONFIG[imp].color}`
                  : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:text-white'
              }`}
            >
              {imp === 'all' ? 'Tümü' : IMPACT_CONFIG[imp].label}
            </button>
          ))}
        </div>
      </div>

      {/* Aktif filtre özeti */}
      {(selectedCategory !== 'all' || selectedImpact !== 'all' || searchQuery) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Filtre:</span>
          {selectedCategory !== 'all' && (
            <button onClick={() => setSelectedCategory('all')} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-medium ${CATEGORIES[selectedCategory].bg} ${CATEGORIES[selectedCategory].border} ${CATEGORIES[selectedCategory].color}`}>
              {CATEGORIES[selectedCategory].label} <X className="w-3 h-3" />
            </button>
          )}
          {selectedImpact !== 'all' && (
            <button onClick={() => setSelectedImpact('all')} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-medium ${IMPACT_CONFIG[selectedImpact].bg} ${IMPACT_CONFIG[selectedImpact].border} ${IMPACT_CONFIG[selectedImpact].color}`}>
              {IMPACT_CONFIG[selectedImpact].label} <X className="w-3 h-3" />
            </button>
          )}
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-medium bg-white/5 border-white/10 text-gray-400">
              "{searchQuery}" <X className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setSelectedImpact('all'); }} className="text-xs text-blue-400 hover:text-blue-300 ml-1">
            Tümünü Temizle
          </button>
        </div>
      )}

      {/* ─── Güncelleme Listesi ─── */}
      {filteredNotes.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <Search className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Arama kriterlerinize uygun güncelleme bulunamadı.</p>
        </motion.div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {groupedNotes.map(([version, notes], groupIdx) => {
            const isLatest = version === CURRENT_VERSION;
            return (
              <motion.div
                key={version}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: groupIdx * 0.07 }}
              >
                {/* Versiyon başlığı */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                    isLatest
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-white/[0.04] border-white/[0.08]'
                  }`}>
                    <GitBranch className={`w-3.5 h-3.5 ${isLatest ? 'text-emerald-400' : 'text-blue-400'}`} />
                    <span className={`text-sm font-black ${isLatest ? 'text-emerald-400' : 'text-white'}`}>{version}</span>
                    {isLatest && (
                      <span className="px-1.5 py-0.5 text-[8px] font-black bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30 uppercase tracking-wider">
                        Güncel
                      </span>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                  <span className="text-[10px] text-gray-600 font-mono flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {notes[0]?.date}
                  </span>
                </div>

                {/* Notlar */}
                <div className="space-y-2">
                  {notes.map((note, noteIdx) => {
                    const cat = CATEGORIES[note.category];
                    const CatIcon = cat.icon;
                    const impact = IMPACT_CONFIG[note.impact];
                    const ImpactIcon = impact.icon;
                    const isExpanded = expandedId === note.id;
                    const isUnseen = note.isNew && hasNewUpdates;

                    return (
                      <motion.div
                        key={note.id}
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: groupIdx * 0.07 + noteIdx * 0.04 }}
                        className={`rounded-2xl border overflow-hidden cursor-pointer transition-all ${
                          isExpanded
                            ? 'bg-white/[0.05] border-white/[0.14] shadow-lg'
                            : isUnseen
                              ? `${cat.bg} ${cat.border}`
                              : 'bg-[#111] border-white/[0.06] hover:bg-white/[0.03] hover:border-white/[0.1]'
                        }`}
                        onClick={() => setExpandedId(isExpanded ? null : note.id)}
                      >
                        <div className="p-3 sm:p-4">
                          <div className="flex items-start gap-2.5 sm:gap-4">
                            {/* Kategori ikonu */}
                            <div className={`p-2 rounded-xl ${cat.bg} border ${cat.border} shrink-0 mt-0.5`}>
                              {note.emoji
                                ? <span className="text-base leading-none">{note.emoji}</span>
                                : <CatIcon className={`w-4 h-4 ${cat.color}`} />
                              }
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                <h3 className="text-sm font-bold text-white">{note.title}</h3>
                                {isUnseen && (
                                  <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="px-1.5 py-0.5 text-[8px] font-bold bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30 animate-pulse"
                                  >
                                    YENİ
                                  </motion.span>
                                )}
                                <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded-md border ${cat.bg} ${cat.border} ${cat.color}`}>
                                  {cat.label}
                                </span>
                                <span className={`hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-bold rounded-md border ${impact.bg} ${impact.border} ${impact.color}`}>
                                  <ImpactIcon className="w-2.5 h-2.5" />{impact.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 leading-relaxed">{note.description}</p>
                            </div>

                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                              className="shrink-0 mt-1"
                            >
                              <ChevronDown className="w-4 h-4 text-gray-600" />
                            </motion.div>
                          </div>

                          {/* Detaylar */}
                          <AnimatePresence>
                            {isExpanded && note.details && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <Eye className="w-3 h-3 text-gray-500" />
                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Detaylar</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {note.details.map((detail, di) => (
                                      <motion.div
                                        key={di}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: di * 0.04 }}
                                        className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02]"
                                      >
                                        <CheckCircle2 className={`w-3.5 h-3.5 ${cat.color} shrink-0 mt-0.5`} />
                                        <span className="text-[10px] text-gray-300 leading-relaxed">{detail}</span>
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
            );
          })}
        </div>
      )}

      {/* Alt bilgi */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-center space-y-1"
      >
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500/60" />
          <span className="text-xs font-bold text-gray-500">MERT.4 ERP — {CURRENT_VERSION} KALKAN</span>
        </div>
        <p className="text-[10px] text-gray-600">
          Tüm güncellemeler otomatik uygulanır · Sistem güvenliği sürekli izlenmektedir
        </p>
        {hasNewUpdates && (
          <button
            onClick={markAllSeen}
            className="mt-1 text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 mx-auto"
          >
            <Bell className="w-3 h-3" />
            Tüm güncellemeleri okundu işaretle
          </button>
        )}
      </motion.div>
    </div>
  );
}
