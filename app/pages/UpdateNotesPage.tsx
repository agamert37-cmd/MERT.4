import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import {
  ShieldCheck, Sparkles, Bug, Paintbrush, Zap, BarChart3,
  Lock, ArrowLeft, Search, ChevronRight, CheckCircle2,
  AlertTriangle, Info, Star, GitCommit, Calendar,
  Bell, X, Package, TrendingUp, Shield, Rocket,
  ChevronDown, Hash, Clock, Filter,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  UPDATE_NOTES, CURRENT_VERSION, SEEN_VERSION_KEY,
  getVersionGroups, type UpdateCategory, type UpdateNote,
} from '../utils/updateNotes';

// ─── Kategori konfigürasyonu ─────────────────────────────────────────────────
const CAT: Record<UpdateCategory, {
  label: string; icon: React.ElementType;
  color: string; bg: string; border: string; glow: string; gradient: string;
}> = {
  security:    { label: 'Güvenlik',   icon: Lock,       color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/20', gradient: 'from-emerald-500 to-teal-500' },
  feature:     { label: 'Özellik',    icon: Sparkles,   color: 'text-blue-300',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30',    glow: 'shadow-blue-500/20',    gradient: 'from-blue-500 to-indigo-500' },
  bugfix:      { label: 'Düzeltme',   icon: Bug,        color: 'text-rose-300',    bg: 'bg-rose-500/15',    border: 'border-rose-500/30',    glow: 'shadow-rose-500/20',    gradient: 'from-rose-500 to-red-500' },
  ui:          { label: 'Arayüz',     icon: Paintbrush, color: 'text-cyan-300',    bg: 'bg-cyan-500/15',    border: 'border-cyan-500/30',    glow: 'shadow-cyan-500/20',    gradient: 'from-cyan-500 to-sky-500' },
  performance: { label: 'Performans', icon: Zap,        color: 'text-amber-300',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   glow: 'shadow-amber-500/20',   gradient: 'from-amber-500 to-orange-500' },
  analytics:   { label: 'Analiz',     icon: BarChart3,  color: 'text-violet-300',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30',  glow: 'shadow-violet-500/20',  gradient: 'from-violet-500 to-purple-500' },
};

const IMPACT: Record<string, { label: string; color: string; dot: string }> = {
  high:   { label: 'Kritik',  color: 'text-rose-400',   dot: 'bg-rose-400' },
  medium: { label: 'Önemli',  color: 'text-amber-400',  dot: 'bg-amber-400' },
  low:    { label: 'Küçük',   color: 'text-slate-400',  dot: 'bg-slate-400' },
};

// ─── Animated counter ────────────────────────────────────────────────────────
function Counter({ to, duration = 1200 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = to / (duration / 16);
    const id = setInterval(() => {
      start = Math.min(start + step, to);
      setVal(Math.floor(start));
      if (start >= to) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [to, duration]);
  return <>{val}</>;
}

// ─── Version timeline node ────────────────────────────────────────────────────
function VersionNode({
  version, date, notes, isLatest, isFirst,
}: {
  version: string; date: string; notes: UpdateNote[]; isLatest: boolean; isFirst: boolean;
}) {
  const [open, setOpen] = useState(isFirst);
  const newCount = notes.filter(n => n.isNew).length;

  return (
    <div className="relative pl-8 sm:pl-10">
      {/* Timeline line */}
      <div className="absolute left-[11px] sm:left-[13px] top-0 bottom-0 w-px bg-gradient-to-b from-white/20 via-white/10 to-transparent" />

      {/* Node dot */}
      <div className={`absolute left-0 top-1 w-[23px] h-[23px] sm:w-[27px] sm:h-[27px] rounded-full flex items-center justify-center border-2 ${
        isLatest
          ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/40'
          : 'bg-[#1a1f2e] border-white/20'
      }`}>
        {isLatest
          ? <Shield className="w-3 h-3 text-white" />
          : <GitCommit className="w-3 h-3 text-white/40" />
        }
      </div>

      {/* Version header — clickable to collapse */}
      <button
        onClick={() => !isFirst && setOpen(v => !v)}
        className={`w-full flex items-center gap-3 mb-3 group ${isFirst ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
          isLatest
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-white/[0.03] border-white/[0.08] group-hover:bg-white/[0.05]'
        }`}>
          <span className={`font-black text-sm sm:text-base ${isLatest ? 'text-emerald-300' : 'text-white/70'}`}>
            {version}
          </span>
          {isLatest && (
            <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 uppercase tracking-wide">
              Güncel
            </span>
          )}
          {newCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
              {newCount} YENİ
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[10px] text-white/30">
          <Calendar className="w-3 h-3" />
          {new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>

        <div className="flex-1" />

        {!isFirst && (
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <ChevronDown className="w-4 h-4 text-white/30" />
          </motion.div>
        )}
      </button>

      {/* Notes list */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pb-8">
              {notes.map((note, i) => (
                <NoteCard key={note.id} note={note} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Note card ────────────────────────────────────────────────────────────────
function NoteCard({ note, index }: { note: UpdateNote; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cat = CAT[note.category];
  const CatIcon = cat.icon;
  const imp = IMPACT[note.impact];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 320, damping: 28 }}
      onClick={() => setExpanded(v => !v)}
      className={`group relative rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 ${
        expanded
          ? 'bg-white/[0.06] border-white/[0.16] shadow-xl'
          : note.isNew
            ? `${cat.bg} ${cat.border} hover:shadow-lg ${cat.glow}`
            : 'bg-white/[0.025] border-white/[0.07] hover:bg-white/[0.04] hover:border-white/[0.12]'
      }`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b ${cat.gradient} opacity-${expanded ? '100' : '50'} group-hover:opacity-100 transition-opacity`} />

      <div className="pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-3.5">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center border ${cat.bg} ${cat.border} mt-0.5`}>
            {note.emoji
              ? <span className="text-base leading-none">{note.emoji}</span>
              : <CatIcon className={`w-4 h-4 ${cat.color}`} />
            }
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-white leading-tight">{note.title}</span>
              {note.isNew && (
                <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/30 animate-pulse">
                  YENİ
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${cat.bg} ${cat.border} ${cat.color}`}>
                {cat.label}
              </span>
              <span className="flex items-center gap-1 text-[9px]">
                <span className={`w-1.5 h-1.5 rounded-full ${imp.dot}`} />
                <span className={imp.color}>{imp.label}</span>
              </span>
            </div>
            <p className="text-[11px] text-white/50 leading-relaxed mt-1 line-clamp-2 group-hover:text-white/70 transition-colors">
              {note.description}
            </p>
          </div>

          {/* Expand chevron */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            className="shrink-0 mt-2"
          >
            <ChevronDown className="w-3.5 h-3.5 text-white/25" />
          </motion.div>
        </div>

        {/* Expanded details */}
        <AnimatePresence>
          {expanded && note.details && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-white/[0.07] space-y-1.5">
                {note.details.map((d, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-2"
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 ${cat.color} shrink-0 mt-0.5`} />
                    <span className="text-[11px] text-white/60 leading-relaxed">{d}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Stats strip ─────────────────────────────────────────────────────────────
function StatsStrip() {
  const total = UPDATE_NOTES.length;
  const newCount = UPDATE_NOTES.filter(n => n.isNew).length;
  const versions = [...new Set(UPDATE_NOTES.map(n => n.version))].length;
  const highImpact = UPDATE_NOTES.filter(n => n.impact === 'high').length;

  const items = [
    { icon: Package,    label: 'Güncelleme',  value: total,     color: 'text-blue-400' },
    { icon: Star,       label: 'Yeni',        value: newCount,  color: 'text-amber-400' },
    { icon: Hash,       label: 'Versiyon',    value: versions,  color: 'text-emerald-400' },
    { icon: TrendingUp, label: 'Kritik',      value: highImpact, color: 'text-rose-400' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06 }}
            className="flex flex-col items-center gap-1 p-2.5 sm:p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.05] transition-colors"
          >
            <Icon className={`w-4 h-4 ${item.color}`} />
            <p className={`text-lg sm:text-2xl font-black tabular-nums ${item.color}`}>
              <Counter to={item.value} />
            </p>
            <p className="text-[9px] text-white/30 font-semibold uppercase tracking-wider">{item.label}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Category pill tabs ───────────────────────────────────────────────────────
const ALL_CATS = [
  { id: 'all' as const, label: 'Tümü', icon: Rocket, color: 'text-white', bg: 'bg-white/10', border: 'border-white/20' },
  ...Object.entries(CAT).map(([k, v]) => ({
    id: k as UpdateCategory,
    label: v.label,
    icon: v.icon,
    color: v.color,
    bg: v.bg,
    border: v.border,
  })),
];

function CategoryTabs({
  selected, onChange,
}: {
  selected: UpdateCategory | 'all';
  onChange: (v: UpdateCategory | 'all') => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto pb-1 scroll-smooth no-scrollbar"
    >
      {ALL_CATS.map(cat => {
        const Icon = cat.icon;
        const active = selected === cat.id;
        return (
          <motion.button
            key={cat.id}
            whileTap={{ scale: 0.93 }}
            onClick={() => onChange(cat.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              active
                ? `${cat.bg} ${cat.border} ${cat.color} shadow-md`
                : 'bg-white/[0.03] border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {cat.label}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Featured spotlight (latest version) ─────────────────────────────────────
function FeaturedVersion({ notes }: { notes: UpdateNote[] }) {
  const newNotes = notes.filter(n => n.isNew);
  if (newNotes.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.10] via-[#0d1117] to-blue-600/[0.07] p-5 sm:p-6"
    >
      {/* Animated blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ x: [0, 20, 0], y: [0, -10, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-emerald-500/[0.06] blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -14, 0], y: [0, 16, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-blue-500/[0.06] blur-3xl"
        />
      </div>

      <div className="relative z-10">
        {/* Badge row */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Canlı</span>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-500/15 border border-blue-500/30 text-blue-300">
            {CURRENT_VERSION} KALKAN
          </span>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/15 border border-amber-500/30 text-amber-300 animate-pulse">
            {newNotes.length} Yeni Güncelleme
          </span>
        </div>

        {/* Headline */}
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-1">
          Yenilikler
        </h2>
        <p className="text-sm text-white/40 mb-5">
          {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} tarihli güncelleme
        </p>

        {/* Featured notes grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {newNotes.map((note, i) => {
            const cat = CAT[note.category];
            const CatIcon = cat.icon;
            return (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                className={`flex items-start gap-3 p-3 rounded-2xl border ${cat.bg} ${cat.border}`}
              >
                <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br ${cat.gradient} shadow-lg ${cat.glow}`}>
                  {note.emoji
                    ? <span className="text-sm leading-none">{note.emoji}</span>
                    : <CatIcon className="w-4 h-4 text-white" />
                  }
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-bold ${cat.color}`}>{note.title}</p>
                  <p className="text-[10px] text-white/45 leading-relaxed mt-0.5 line-clamp-2">{note.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export function UpdateNotesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selCat, setSelCat] = useState<UpdateCategory | 'all'>('all');
  const [hasNew, setHasNew] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    setHasNew(!seen || seen !== CURRENT_VERSION);
  }, []);

  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 100);
  }, [showSearch]);

  const markSeen = () => {
    localStorage.setItem(SEEN_VERSION_KEY, CURRENT_VERSION);
    setHasNew(false);
    window.dispatchEvent(new CustomEvent('update_notes_seen'));
  };

  const filtered = useMemo(() => {
    return UPDATE_NOTES.filter(note => {
      if (selCat !== 'all' && note.category !== selCat) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          note.title.toLowerCase().includes(q) ||
          note.description.toLowerCase().includes(q) ||
          note.details?.some(d => d.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [selCat, search]);

  const grouped = useMemo(() => getVersionGroups(filtered), [filtered]);
  const latestNotes = useMemo(() =>
    UPDATE_NOTES.filter(n => n.version === CURRENT_VERSION),
    []
  );

  return (
    <div className="min-h-screen bg-[#080b11] text-white font-sans pb-28 sm:pb-10">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-[#080b11]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-white/60 hover:text-white transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>

          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              {showSearch ? (
                <motion.div
                  key="search"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center gap-2 bg-white/[0.07] rounded-xl px-3 py-1.5 border border-white/[0.1]"
                >
                  <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Güncelleme ara..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
                  />
                  {search && (
                    <button onClick={() => setSearch('')}>
                      <X className="w-3.5 h-3.5 text-white/40 hover:text-white" />
                    </button>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="title"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h1 className="text-base font-black text-white leading-none">Güncelleme Notları</h1>
                  <p className="text-[10px] text-white/30 mt-0.5">{CURRENT_VERSION} KALKAN</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-1.5">
            {hasNew && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileTap={{ scale: 0.9 }}
                onClick={markSeen}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/25 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Okundu</span>
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowSearch(v => !v)}
              className={`p-2 rounded-xl border transition-all ${
                showSearch
                  ? 'bg-blue-500/20 border-blue-500/30 text-blue-300'
                  : 'bg-white/[0.05] border-white/[0.08] text-white/50 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Category pills — below header */}
        <div className="px-4 sm:px-6 pb-3">
          <CategoryTabs selected={selCat} onChange={setSelCat} />
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-6 pt-6">

        {/* Featured spotlight — only when no search/filter */}
        {selCat === 'all' && !search && (
          <FeaturedVersion notes={latestNotes} />
        )}

        {/* Stats strip */}
        {selCat === 'all' && !search && (
          <StatsStrip />
        )}

        {/* Active search info */}
        {(search || selCat !== 'all') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-xs text-white/40 flex-wrap"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{filtered.length} sonuç</span>
            {selCat !== 'all' && (
              <button
                onClick={() => setSelCat('all')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${CAT[selCat].bg} ${CAT[selCat].border} ${CAT[selCat].color}`}
              >
                {CAT[selCat].label} <X className="w-2.5 h-2.5" />
              </button>
            )}
            {search && (
              <button
                onClick={() => setSearch('')}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border bg-white/[0.05] border-white/10 text-white/50 text-[10px]"
              >
                "{search}" <X className="w-2.5 h-2.5" />
              </button>
            )}
          </motion.div>
        )}

        {/* Timeline */}
        {grouped.length > 0 ? (
          <div className="space-y-2">
            {grouped.map(([version, notes], i) => (
              <VersionNode
                key={version}
                version={version}
                date={notes[0].date}
                notes={notes}
                isLatest={version === CURRENT_VERSION}
                isFirst={i === 0}
              />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-20 text-white/30"
          >
            <Search className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">Sonuç bulunamadı</p>
            <button
              onClick={() => { setSearch(''); setSelCat('all'); }}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300"
            >
              Filtreleri Temizle
            </button>
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center py-6 border-t border-white/[0.05] space-y-2"
        >
          <div className="flex items-center justify-center gap-2 text-white/20">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-xs font-bold">MERT.4 ERP — {CURRENT_VERSION} KALKAN</span>
          </div>
          <p className="text-[10px] text-white/15">
            Tüm güncellemeler otomatik uygulanır · Sistem güvenliği sürekli izlenmektedir
          </p>
          {hasNew && (
            <button
              onClick={markSeen}
              className="text-[11px] text-emerald-400/70 hover:text-emerald-300 flex items-center gap-1 mx-auto transition-colors"
            >
              <Bell className="w-3 h-3" />
              Tüm güncellemeleri okundu işaretle
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
