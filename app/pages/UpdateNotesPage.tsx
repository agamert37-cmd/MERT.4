// [AJAN-3 | claude/multi-db-sync-setup-3DmYn | 2026-03-27] Güncelleme Merkezi — Kompakt Yenileme
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, Sparkles, Bug, Paintbrush, Zap, BarChart3,
  Lock, ArrowLeft, Search, ChevronDown, ChevronRight,
  CheckCircle2, Package, TrendingUp, Hash, Star,
  X, Bell, GitCommit, Shield, Rocket, Clock, Filter,
  Circle, ArrowUpRight,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  UPDATE_NOTES, CURRENT_VERSION, SEEN_VERSION_KEY,
  getVersionGroups, type UpdateCategory, type UpdateNote,
} from '../utils/updateNotes';

// ─── Kategori konfigürasyonu ──────────────────────────────────────────────────
const CAT: Record<UpdateCategory, {
  label: string; icon: React.ElementType;
  color: string; bg: string; border: string; dot: string; gradient: string;
}> = {
  security:    { label: 'Güvenlik',   icon: Lock,       color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', dot: 'bg-emerald-400', gradient: 'from-emerald-500 to-teal-500' },
  feature:     { label: 'Özellik',    icon: Sparkles,   color: 'text-blue-300',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25',    dot: 'bg-blue-400',    gradient: 'from-blue-500 to-indigo-500' },
  bugfix:      { label: 'Düzeltme',   icon: Bug,        color: 'text-rose-300',    bg: 'bg-rose-500/10',    border: 'border-rose-500/25',    dot: 'bg-rose-400',    gradient: 'from-rose-500 to-red-500' },
  ui:          { label: 'Arayüz',     icon: Paintbrush, color: 'text-cyan-300',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25',    dot: 'bg-cyan-400',    gradient: 'from-cyan-500 to-sky-500' },
  performance: { label: 'Performans', icon: Zap,        color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   dot: 'bg-amber-400',   gradient: 'from-amber-500 to-orange-500' },
  analytics:   { label: 'Analiz',     icon: BarChart3,  color: 'text-violet-300',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25',  dot: 'bg-violet-400',  gradient: 'from-violet-500 to-purple-500' },
};

const IMPACT: Record<string, { label: string; color: string; ring: string }> = {
  high:   { label: 'Kritik',  color: 'text-rose-400',   ring: 'ring-rose-500/40' },
  medium: { label: 'Önemli',  color: 'text-amber-400',  ring: 'ring-amber-500/40' },
  low:    { label: 'Küçük',   color: 'text-slate-500',  ring: 'ring-slate-500/30' },
};

const ALL_CATS: { id: UpdateCategory | 'all'; label: string; icon: React.ElementType }[] = [
  { id: 'all',         label: 'Tümü',      icon: Rocket },
  { id: 'feature',     label: 'Özellik',   icon: Sparkles },
  { id: 'bugfix',      label: 'Düzeltme',  icon: Bug },
  { id: 'security',    label: 'Güvenlik',  icon: Lock },
  { id: 'ui',          label: 'Arayüz',    icon: Paintbrush },
  { id: 'performance', label: 'Performans',icon: Zap },
  { id: 'analytics',   label: 'Analiz',    icon: BarChart3 },
];

// ─── Kompakt Not Satırı ───────────────────────────────────────────────────────
function NoteRow({ note, idx }: { note: UpdateNote; idx: number }) {
  const [open, setOpen] = useState(false);
  const cat = CAT[note.category];
  const imp = IMPACT[note.impact];
  const CatIcon = cat.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.025, duration: 0.18 }}
      className={`group relative overflow-hidden rounded-xl border transition-all duration-150 cursor-pointer select-none ${
        open
          ? 'bg-white/[0.05] border-white/[0.14]'
          : 'bg-white/[0.018] border-white/[0.07] hover:bg-white/[0.034] hover:border-white/[0.12]'
      }`}
      onClick={() => setOpen(v => !v)}
    >
      {/* Left accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b ${cat.gradient} opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="pl-3.5 pr-3 py-2.5">
        {/* Main row */}
        <div className="flex items-center gap-2.5">
          {/* Emoji / Icon */}
          <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${cat.bg} border ${cat.border}`}>
            {note.emoji
              ? <span className="text-[13px] leading-none">{note.emoji}</span>
              : <CatIcon className={`w-3.5 h-3.5 ${cat.color}`} />
            }
          </div>

          {/* Title */}
          <span className="flex-1 min-w-0 text-[13px] font-semibold text-white/85 leading-tight truncate">
            {note.title}
          </span>

          {/* Tags */}
          <div className="flex items-center gap-1.5 shrink-0">
            {note.isNew && (
              <span className="px-1.5 py-[2px] rounded-full text-[9px] font-black bg-amber-400/15 border border-amber-400/30 text-amber-300 animate-pulse">
                YENİ
              </span>
            )}
            <span className={`px-1.5 py-[2px] rounded-md text-[9px] font-bold ${cat.bg} border ${cat.border} ${cat.color} hidden sm:inline`}>
              {cat.label}
            </span>
            <span className={`text-[9px] font-bold ${imp.color} tabular-nums hidden xs:inline`}>
              {imp.label}
            </span>
            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.18 }}
              className="ml-0.5"
            >
              <ChevronDown className="w-3 h-3 text-white/20 group-hover:text-white/40 transition-colors" />
            </motion.div>
          </div>
        </div>

        {/* Description line — always visible, small */}
        <p className="mt-1 ml-9 text-[11px] text-white/35 leading-snug line-clamp-1 group-hover:text-white/50 transition-colors">
          {note.description}
        </p>

        {/* Expanded details */}
        <AnimatePresence>
          {open && note.details && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-2.5 ml-9 pt-2.5 border-t border-white/[0.07] grid grid-cols-1 gap-1">
                {note.details.map((d, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className={`w-3 h-3 ${cat.color} shrink-0 mt-[1px]`} />
                    <span className="text-[11px] text-white/55 leading-snug">{d}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Versiyon Grubu ───────────────────────────────────────────────────────────
function VersionGroup({
  version, date, notes, isLatest,
  collapsed, onToggle,
}: {
  version: string; date: string; notes: UpdateNote[];
  isLatest: boolean; collapsed: boolean; onToggle: () => void;
}) {
  const newCount = notes.filter(n => n.isNew).length;
  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    notes.forEach(n => { c[n.category] = (c[n.category] || 0) + 1; });
    return c;
  }, [notes]);

  return (
    <div className="relative">
      {/* Version header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 py-2 px-1 group hover:bg-white/[0.02] rounded-lg transition-colors"
      >
        {/* Node */}
        <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center border-2 ${
          isLatest
            ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/30'
            : 'bg-[#101520] border-white/20'
        }`}>
          {isLatest
            ? <span className="w-1.5 h-1.5 rounded-full bg-white" />
            : <span className="w-1 h-1 rounded-full bg-white/30" />
          }
        </div>

        {/* Version label */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`text-[13px] font-black tracking-tight ${isLatest ? 'text-emerald-300' : 'text-white/60'}`}>
            {version}
          </span>
          {isLatest && (
            <span className="px-1.5 py-[2px] rounded-full text-[8px] font-black bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 uppercase tracking-wider">
              Güncel
            </span>
          )}
          {newCount > 0 && (
            <span className="px-1.5 py-[2px] rounded-full text-[8px] font-black bg-amber-400/15 border border-amber-400/25 text-amber-300 animate-pulse">
              {newCount} yeni
            </span>
          )}

          {/* Category dots */}
          <div className="flex items-center gap-1 ml-1">
            {Object.entries(catCounts).map(([cat]) => (
              <span key={cat} className={`w-1.5 h-1.5 rounded-full ${CAT[cat as UpdateCategory]?.dot || 'bg-white/20'}`} />
            ))}
          </div>
        </div>

        {/* Date + count + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-white/25 hidden sm:inline">{
            new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
          }</span>
          <span className="text-[10px] text-white/30">{notes.length} kayıt</span>
          <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.18 }}>
            <ChevronDown className="w-3.5 h-3.5 text-white/25 group-hover:text-white/50 transition-colors" />
          </motion.div>
        </div>
      </button>

      {/* Notes grid */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-7 mb-4 mt-1 grid grid-cols-1 xl:grid-cols-2 gap-1.5">
              {notes.map((note, i) => (
                <NoteRow key={note.id} note={note} idx={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar() {
  const total     = UPDATE_NOTES.length;
  const newCount  = UPDATE_NOTES.filter(n => n.isNew).length;
  const versions  = [...new Set(UPDATE_NOTES.map(n => n.version))].length;
  const highCount = UPDATE_NOTES.filter(n => n.impact === 'high').length;

  const items = [
    { label: 'Güncelleme', value: total,     icon: Package,    color: 'text-blue-400',    glow: 'shadow-blue-500/20' },
    { label: 'Yeni',       value: newCount,  icon: Star,       color: 'text-amber-400',   glow: 'shadow-amber-500/20' },
    { label: 'Sürüm',      value: versions,  icon: Hash,       color: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
    { label: 'Kritik',     value: highCount, icon: TrendingUp, color: 'text-rose-400',    glow: 'shadow-rose-500/20' },
  ];

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.05]">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
          >
            <Icon className={`w-3 h-3 ${item.color}`} />
            <span className={`text-sm font-black tabular-nums ${item.color}`}>{item.value}</span>
            <span className="text-[10px] text-white/30 font-semibold hidden sm:inline">{item.label}</span>
          </motion.div>
        );
      })}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
        </span>
        <span className="text-[10px] text-emerald-400/70 font-bold hidden sm:inline">{CURRENT_VERSION} · Canlı</span>
      </div>
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({
  selected, onChange, counts,
}: {
  selected: UpdateCategory | 'all';
  onChange: (v: UpdateCategory | 'all') => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.05] overflow-x-auto no-scrollbar">
      <Filter className="w-3 h-3 text-white/20 shrink-0" />
      {ALL_CATS.map(cat => {
        const active = selected === cat.id;
        const Icon = cat.icon;
        const count = cat.id === 'all' ? UPDATE_NOTES.length : (counts[cat.id] || 0);
        const cfg = cat.id !== 'all' ? CAT[cat.id as UpdateCategory] : null;
        return (
          <motion.button
            key={cat.id}
            whileTap={{ scale: 0.92 }}
            onClick={() => onChange(cat.id)}
            className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
              active
                ? cfg
                  ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                  : 'bg-white/10 border-white/20 text-white'
                : 'bg-transparent border-transparent text-white/35 hover:text-white/60 hover:bg-white/[0.04]'
            }`}
          >
            <Icon className="w-3 h-3" />
            {cat.label}
            {count > 0 && (
              <span className={`ml-0.5 text-[9px] tabular-nums ${active ? 'opacity-80' : 'opacity-40'}`}>
                {count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Version Sidebar ──────────────────────────────────────────────────────────
function VersionSidebar({
  groups, current, activeVersion, onSelect,
}: {
  groups: [string, UpdateNote[]][];
  current: string;
  activeVersion: string | null;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="hidden lg:flex flex-col w-44 shrink-0 border-r border-white/[0.06] overflow-y-auto py-3 px-2 gap-0.5">
      <p className="text-[9px] font-black text-white/20 uppercase tracking-widest px-2 mb-1">Sürümler</p>
      {groups.map(([version, notes]) => {
        const isLatest = version === current;
        const newCount = notes.filter(n => n.isNew).length;
        const active = activeVersion === version;
        return (
          <button
            key={version}
            onClick={() => onSelect(version)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all ${
              active
                ? 'bg-white/[0.07] border border-white/[0.12]'
                : 'hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLatest ? 'bg-emerald-400' : 'bg-white/20'}`} />
            <span className={`text-[12px] font-bold flex-1 ${isLatest ? 'text-emerald-300' : active ? 'text-white/80' : 'text-white/40'}`}>
              {version}
            </span>
            {newCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-400/20 text-amber-300 text-[8px] font-black flex items-center justify-center border border-amber-400/30 animate-pulse">
                {newCount}
              </span>
            )}
            <span className="text-[9px] text-white/20">{notes.length}</span>
          </button>
        );
      })}

      {/* Divider + legend */}
      <div className="mt-auto pt-3 border-t border-white/[0.06]">
        <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest px-2 mb-1.5">Etki</p>
        {(['high', 'medium', 'low'] as const).map(k => (
          <div key={k} className="flex items-center gap-1.5 px-2 py-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${IMPACT[k].color.replace('text-', 'bg-').replace('-400', '-400').replace('-500', '-500')}`} />
            <span className="text-[10px] text-white/30">{IMPACT[k].label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────
export function UpdateNotesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selCat, setSelCat] = useState<UpdateCategory | 'all'>('all');
  const [hasNew, setHasNew] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const versionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeVersion, setActiveVersion] = useState<string | null>(null);

  // Tüm versiyonlar başlangıçta açık (latest) ya da kapalı
  const allVersions = useMemo(() => [...new Set(UPDATE_NOTES.map(n => n.version))], []);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    // En son sürüm açık, diğerleri kapalı
    return new Set(allVersions.filter(v => v !== CURRENT_VERSION));
  });

  useEffect(() => {
    const seen = localStorage.getItem(SEEN_VERSION_KEY);
    setHasNew(!seen || seen !== CURRENT_VERSION);
    setActiveVersion(CURRENT_VERSION);
  }, []);

  useEffect(() => {
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 80);
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
          (note.details?.some(d => d.toLowerCase().includes(q)) ?? false)
        );
      }
      return true;
    });
  }, [selCat, search]);

  const grouped = useMemo(() => getVersionGroups(filtered), [filtered]);

  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    filtered.forEach(n => { c[n.category] = (c[n.category] || 0) + 1; });
    return c;
  }, [filtered]);

  const toggleVersion = (version: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  const scrollToVersion = (version: string) => {
    setActiveVersion(version);
    // Expand if collapsed
    setCollapsed(prev => {
      const next = new Set(prev);
      next.delete(version);
      return next;
    });
    setTimeout(() => {
      versionRefs.current[version]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(allVersions.filter(v => v !== CURRENT_VERSION)));

  return (
    <div className="h-screen flex flex-col bg-[#06090e] text-white font-sans overflow-hidden">

      {/* ── Sticky Header ── */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.07] bg-[#06090e]/95 backdrop-blur-xl z-20">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/50 hover:text-white transition-all shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </motion.button>

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {showSearch ? (
              <motion.div
                key="search"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 bg-white/[0.06] rounded-lg px-2.5 py-1.5 border border-white/[0.1]"
              >
                <Search className="w-3 h-3 text-white/35 shrink-0" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Başlık, açıklama veya detay ara..."
                  className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none"
                />
                {search && (
                  <button onClick={() => setSearch('')}>
                    <X className="w-3 h-3 text-white/35 hover:text-white" />
                  </button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="title"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-2"
              >
                <h1 className="text-sm font-black text-white leading-none">Güncelleme Merkezi</h1>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/12 border border-emerald-500/25 text-emerald-300 uppercase tracking-wider">
                  {CURRENT_VERSION}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Expand/Collapse all */}
          <button
            onClick={collapsed.size > 0 ? expandAll : collapseAll}
            className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-white/35 hover:text-white/70 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.08] transition-all hidden sm:flex items-center gap-1"
          >
            {collapsed.size > 0 ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {collapsed.size > 0 ? 'Genişlet' : 'Daralt'}
          </button>

          {hasNew && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileTap={{ scale: 0.9 }}
              onClick={markSeen}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/12 border border-emerald-500/25 text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/20 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span className="hidden sm:inline">Okundu</span>
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowSearch(v => !v)}
            className={`p-1.5 rounded-lg border transition-all ${
              showSearch
                ? 'bg-blue-500/15 border-blue-500/25 text-blue-300'
                : 'bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar />

      {/* Filter bar */}
      <FilterBar selected={selCat} onChange={setSelCat} counts={catCounts} />

      {/* Active search/filter indicator */}
      <AnimatePresence>
        {(search || selCat !== 'all') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-blue-500/[0.04] border-b border-blue-500/[0.1] overflow-hidden"
          >
            <Filter className="w-3 h-3 text-blue-400/60" />
            <span className="text-[11px] text-white/40">{filtered.length} sonuç</span>
            {selCat !== 'all' && (
              <button
                onClick={() => setSelCat('all')}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${CAT[selCat].bg} ${CAT[selCat].border} ${CAT[selCat].color}`}
              >
                {CAT[selCat].label} <X className="w-2 h-2" />
              </button>
            )}
            {search && (
              <button
                onClick={() => setSearch('')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-white/40 text-[9px]"
              >
                "{search}" <X className="w-2 h-2" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar version nav (desktop only) */}
        <VersionSidebar
          groups={grouped}
          current={CURRENT_VERSION}
          activeVersion={activeVersion}
          onSelect={scrollToVersion}
        />

        {/* Main log content */}
        <div ref={mainRef} className="flex-1 overflow-y-auto">
          {grouped.length > 0 ? (
            <div className="max-w-4xl mx-auto px-4 py-3 space-y-0.5">
              {grouped.map(([version, notes]) => (
                <div
                  key={version}
                  ref={el => { versionRefs.current[version] = el; }}
                >
                  <VersionGroup
                    version={version}
                    date={notes[0].date}
                    notes={notes}
                    isLatest={version === CURRENT_VERSION}
                    collapsed={collapsed.has(version)}
                    onToggle={() => toggleVersion(version)}
                  />
                  {/* Thin separator */}
                  <div className="ml-7 border-b border-white/[0.04] mb-0.5" />
                </div>
              ))}

              {/* Footer */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center justify-between py-4 mt-2"
              >
                <div className="flex items-center gap-2 text-white/15">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold">MERT.4 ERP — {CURRENT_VERSION} KALKAN</span>
                </div>
                {hasNew && (
                  <button
                    onClick={markSeen}
                    className="flex items-center gap-1 text-[10px] text-emerald-400/50 hover:text-emerald-300 transition-colors"
                  >
                    <Bell className="w-3 h-3" />
                    Tümünü okundu işaretle
                  </button>
                )}
              </motion.div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-white/20"
            >
              <Search className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-bold">Sonuç bulunamadı</p>
              <button
                onClick={() => { setSearch(''); setSelCat('all'); }}
                className="mt-2 text-xs text-blue-400/60 hover:text-blue-300 transition-colors"
              >
                Filtreleri temizle
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
