// [AJAN-3 | claude/multi-db-sync-setup-3DmYn | 2026-03-27] Güncelleme Merkezi — Kompakt Yenileme
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, Sparkles, Bug, Paintbrush, Zap, BarChart3,
  Lock, ArrowLeft, Search, ChevronDown, ChevronRight,
  CheckCircle2, Package, TrendingUp, Hash, Star,
  X, Bell, GitCommit, Shield, Rocket, Clock, Filter,
  Circle, ArrowUpRight, Plus, Pencil, Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import {
  UPDATE_NOTES, CURRENT_VERSION, SEEN_VERSION_KEY,
  getVersionGroups, getAllVersions,
  addUpdateNote, updateUpdateNote, deleteUpdateNote,
  type UpdateCategory, type UpdateNote,
} from '../utils/updateNotes';
import { useGlobalTableData } from '../contexts/GlobalTableSyncContext';
import { useAuth } from '../contexts/AuthContext';

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
interface NoteRowProps {
  note: UpdateNote;
  idx: number;
  isAdmin?: boolean;
  onEdit?: (note: UpdateNote) => void;
  onDelete?: (id: string) => void;
  deleteId?: string | null;
  setDeleteId?: (id: string | null) => void;
}

function NoteRow({ note, idx, isAdmin, onEdit, onDelete, deleteId, setDeleteId }: NoteRowProps) {
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
            {isAdmin && (
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                {deleteId === note.id ? (
                  <div className="flex gap-1 items-center">
                    <button onClick={() => { onDelete?.(note.id); setDeleteId?.(null); }} className="text-[9px] text-rose-300 font-bold px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/30">Sil</button>
                    <button onClick={() => setDeleteId?.(null)} className="text-[9px] text-white/30 px-1 py-0.5">İptal</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => onEdit?.(note)} className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-blue-300 transition-colors">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => setDeleteId?.(note.id)} className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-rose-300 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            )}
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
  isAdmin, onEdit, onDelete, deleteId, setDeleteId,
}: {
  version: string; date: string; notes: UpdateNote[];
  isLatest: boolean; collapsed: boolean; onToggle: () => void;
  isAdmin?: boolean;
  onEdit?: (note: UpdateNote) => void;
  onDelete?: (id: string) => void;
  deleteId?: string | null;
  setDeleteId?: (id: string | null) => void;
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
                <NoteRow key={note.id} note={note} idx={i}
                  isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete}
                  deleteId={deleteId} setDeleteId={setDeleteId}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ notes }: { notes: UpdateNote[] }) {
  const total     = notes.length;
  const newCount  = notes.filter(n => n.isNew).length;
  const versions  = [...new Set(notes.map(n => n.version))].length;
  const highCount = notes.filter(n => n.impact === 'high').length;

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
        const count = cat.id === 'all' ? (counts['all'] || 0) : (counts[cat.id] || 0);
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

// ─── Not Ekle/Düzenle Modal ──────────────────────────────────────────────────
interface NoteForm {
  version: string; newVersion: string; category: UpdateCategory;
  title: string; description: string; details: string[];
  impact: 'high' | 'medium' | 'low'; isNew: boolean; emoji: string;
}

const DEFAULT_FORM: NoteForm = {
  version: CURRENT_VERSION, newVersion: '', category: 'feature',
  title: '', description: '', details: [''],
  impact: 'medium', isNew: false, emoji: '',
};

function NoteModal({ open, onClose, editing, existingVersions }: {
  open: boolean; onClose: () => void;
  editing: UpdateNote | null;
  existingVersions: string[];
}) {
  const [form, setForm] = useState<NoteForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [useNewVer, setUseNewVer] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        version: editing.version, newVersion: '',
        category: editing.category, title: editing.title,
        description: editing.description, details: editing.details?.length ? editing.details : [''],
        impact: editing.impact, isNew: editing.isNew ?? false, emoji: editing.emoji ?? '',
      });
      setUseNewVer(!existingVersions.includes(editing.version));
    } else {
      setForm(DEFAULT_FORM);
      setUseNewVer(false);
    }
  }, [editing, open]);

  const finalVersion = useNewVer ? form.newVersion : form.version;

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Başlık zorunlu'); return; }
    if (!finalVersion.trim()) { toast.error('Sürüm zorunlu'); return; }
    setSaving(true);
    try {
      const payload = {
        version: finalVersion.trim(),
        date: new Date().toISOString().slice(0, 10),
        category: form.category,
        title: form.title.trim(),
        description: form.description.trim(),
        details: form.details.filter(d => d.trim()),
        impact: form.impact,
        isNew: form.isNew,
        emoji: form.emoji.trim() || undefined,
      };
      if (editing) {
        await updateUpdateNote(editing.id, payload);
        toast.success('Not güncellendi');
      } else {
        await addUpdateNote(payload);
        toast.success('Not eklendi');
      }
      onClose();
    } catch (e: any) {
      toast.error(`Hata: ${e?.message || 'Bilinmeyen'}`);
    } finally {
      setSaving(false);
    }
  };

  const updateDetail = (i: number, val: string) => {
    setForm(f => { const d = [...f.details]; d[i] = val; return { ...f, details: d }; });
  };
  const addDetail = () => setForm(f => ({ ...f, details: [...f.details, ''] }));
  const removeDetail = (i: number) => setForm(f => ({ ...f, details: f.details.filter((_, j) => j !== i) }));

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-[#0c1220] border border-white/10 rounded-2xl z-50 shadow-2xl overflow-y-auto sm:w-[95vw] sm:max-w-xl" style={{ maxHeight: 'calc(100dvh - 1rem)' }}>
          <div className="p-5">
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="text-base font-black text-white">
                {editing ? 'Notu Düzenle' : 'Yeni Not Ekle'}
              </Dialog.Title>
              <Dialog.Close className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </Dialog.Close>
            </div>

            <div className="space-y-4">
              {/* Versiyon */}
              <div>
                <label className="text-xs text-white/40 font-bold block mb-1.5">Sürüm</label>
                <div className="flex gap-2 mb-1.5">
                  <button onClick={() => setUseNewVer(false)} className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${!useNewVer ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-white/5 border-white/10 text-white/40'}`}>Mevcut</button>
                  <button onClick={() => setUseNewVer(true)} className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${useNewVer ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-white/5 border-white/10 text-white/40'}`}>Yeni Sürüm</button>
                </div>
                {useNewVer ? (
                  <input value={form.newVersion} onChange={e => setForm(f => ({ ...f, newVersion: e.target.value }))} placeholder="örn. v4.6.0" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/40" />
                ) : (
                  <select value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-blue-500/40">
                    {existingVersions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>

              {/* Kategori */}
              <div>
                <label className="text-xs text-white/40 font-bold block mb-1.5">Kategori</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(CAT) as UpdateCategory[]).map(k => {
                    const c = CAT[k];
                    const active = form.category === k;
                    return (
                      <button key={k} onClick={() => setForm(f => ({ ...f, category: k }))}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold transition-all ${active ? `${c.bg} ${c.border} ${c.color}` : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}>
                        <c.icon className="w-3 h-3" />{c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Başlık */}
              <div>
                <label className="text-xs text-white/40 font-bold block mb-1.5">Başlık</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Not başlığı" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/40" />
              </div>

              {/* Açıklama */}
              <div>
                <label className="text-xs text-white/40 font-bold block mb-1.5">Açıklama</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Kısa açıklama" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/40 resize-none" />
              </div>

              {/* Detaylar */}
              <div>
                <label className="text-xs text-white/40 font-bold block mb-1.5">Detaylar</label>
                <div className="space-y-1.5">
                  {form.details.map((d, i) => (
                    <div key={i} className="flex gap-1.5">
                      <input value={d} onChange={e => updateDetail(i, e.target.value)} placeholder={`Detay ${i + 1}`} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/40" />
                      <button onClick={() => removeDetail(i)} className="p-1.5 hover:bg-rose-500/20 text-white/30 hover:text-rose-300 rounded-lg transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <button onClick={addDetail} className="text-xs text-blue-400/60 hover:text-blue-300 flex items-center gap-1 transition-colors">
                    <Plus className="w-3 h-3" /> Detay ekle
                  </button>
                </div>
              </div>

              {/* Etki + isNew + Emoji */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/40 font-bold block mb-1.5">Etki Seviyesi</label>
                  <div className="flex gap-1.5">
                    {(['high', 'medium', 'low'] as const).map(k => (
                      <button key={k} onClick={() => setForm(f => ({ ...f, impact: k }))}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${form.impact === k ? `${IMPACT[k].color} bg-white/10 border-white/20` : 'text-white/30 bg-white/5 border-white/5'}`}>
                        {IMPACT[k].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-white/40 font-bold block mb-1.5">Emoji (opsiyonel)</label>
                    <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value.slice(0, 2) }))} placeholder="🚀" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-blue-500/40" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input type="checkbox" checked={form.isNew} onChange={e => setForm(f => ({ ...f, isNew: e.target.checked }))} className="w-4 h-4 accent-amber-400" />
                    <span className="text-xs text-amber-400 font-bold">YENİ</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5 pt-4 border-t border-white/10">
              <Dialog.Close className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white/40 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">İptal</Dialog.Close>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors">
                {saving ? 'Kaydediliyor…' : editing ? 'Güncelle' : 'Ekle'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────
export function UpdateNotesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Yönetici';

  // Canlı PouchDB verisi — boşsa seed fallback
  const liveNotes = useGlobalTableData<UpdateNote>('guncelleme_notlari');
  const notes = liveNotes.length > 0 ? liveNotes : UPDATE_NOTES;

  // Admin modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<UpdateNote | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleEdit = (note: UpdateNote) => { setEditingNote(note); setModalOpen(true); };
  const handleOpenAdd = () => { setEditingNote(null); setModalOpen(true); };
  const handleDelete = async (id: string) => {
    try {
      await deleteUpdateNote(id);
      toast.success('Not silindi');
    } catch (e: any) {
      toast.error(`Silinemedi: ${e?.message}`);
    }
  };

  const [search, setSearch] = useState('');
  const [selCat, setSelCat] = useState<UpdateCategory | 'all'>('all');
  const [hasNew, setHasNew] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const versionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeVersion, setActiveVersion] = useState<string | null>(null);

  const existingVersions = useMemo(() => getAllVersions(notes), [notes]);

  // Tüm versiyonlar başlangıçta açık (latest) ya da kapalı
  const allVersions = useMemo(() => [...new Set(notes.map(n => n.version))], [notes]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
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
    return notes.filter(note => {
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
  }, [notes, selCat, search]);

  const grouped = useMemo(() => getVersionGroups(filtered), [filtered]);

  const catCounts = useMemo(() => {
    const c: Record<string, number> = { all: filtered.length };
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

  // Sync collapse state when new versions appear (live data)
  useEffect(() => {
    setCollapsed(prev => {
      const newVersions = allVersions.filter(v => !prev.has(v) && v !== CURRENT_VERSION);
      if (newVersions.length === 0) return prev;
      return new Set([...prev, ...newVersions]);
    });
  }, [allVersions]);

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(allVersions.filter(v => v !== CURRENT_VERSION)));

  return (
    <div className="h-dvh flex flex-col bg-[#06090e] text-white font-sans overflow-hidden">

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
          {isAdmin && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleOpenAdd}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-[11px] font-bold hover:bg-blue-600/30 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden sm:inline">Ekle</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar notes={notes} />

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
              {grouped.map(([version, versionNotes]) => (
                <div
                  key={version}
                  ref={el => { versionRefs.current[version] = el; }}
                >
                  <VersionGroup
                    version={version}
                    date={versionNotes[0].date}
                    notes={versionNotes}
                    isLatest={version === CURRENT_VERSION}
                    collapsed={collapsed.has(version)}
                    onToggle={() => toggleVersion(version)}
                    isAdmin={isAdmin}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    deleteId={deleteId}
                    setDeleteId={setDeleteId}
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

      {/* Admin: Not Ekle/Düzenle Modal */}
      <NoteModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editingNote}
        existingVersions={existingVersions}
      />
    </div>
  );
}
