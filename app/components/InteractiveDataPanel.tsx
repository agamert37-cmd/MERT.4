/**
 * InteractiveDataPanel - Premium glassmorphic data panel
 * Replaces static tables with animated, multi-view, interactive panels
 * Supports: Table view, Card/Grid view, Analytics mini-view
 */

import React, { useState, useMemo, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown,
  LayoutGrid, LayoutList, BarChart3, ArrowDownToLine, X, SlidersHorizontal,
  ChevronRight as ExpandIcon, Maximize2, Minimize2, Filter
} from 'lucide-react';
import { AnimatedCounter, Sparkline } from './ChartComponents';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface PanelColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (item: T, index: number) => React.ReactNode;
  getValue?: (item: T) => string | number;
  /** For card view: which role this column plays */
  cardRole?: 'title' | 'subtitle' | 'badge' | 'value' | 'meta' | 'hidden';
  /** Color function for analytics sparkline */
  color?: string;
}

export interface PanelStat {
  label: string;
  value: number | string;
  color?: string;
  icon?: React.ReactNode;
  prefix?: string;
  suffix?: string;
  sparkData?: number[];
}

interface InteractiveDataPanelProps<T> {
  data: T[];
  columns: PanelColumn<T>[];
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  /** Summary stats shown above the panel */
  stats?: PanelStat[];
  /** Enable card view mode */
  enableCardView?: boolean;
  /** Enable analytics mini-view */
  enableAnalytics?: boolean;
  /** Default view mode */
  defaultView?: 'table' | 'cards' | 'analytics';
  /** Render expanded content for a row */
  renderExpanded?: (item: T) => React.ReactNode;
  /** On row click handler */
  onRowClick?: (item: T, index: number) => void;
  /** Custom row class */
  rowClassName?: (item: T, index: number) => string;
  /** Card renderer override */
  renderCard?: (item: T, index: number) => React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** Header right actions */
  headerActions?: React.ReactNode;
  /** Accent color for the panel */
  accentColor?: string;
  /** Compact mode */
  compact?: boolean;
  /** Enable fullscreen toggle */
  enableFullscreen?: boolean;
  /** Filter chips */
  filterChips?: { label: string; value: string; active: boolean; onClick: () => void }[];
}

type SortDir = 'asc' | 'desc' | null;
type ViewMode = 'table' | 'cards' | 'analytics';

// ─── Component ───────────────────────────────────────────────────────────────
export function InteractiveDataPanel<T extends Record<string, any>>({
  data,
  columns,
  title,
  subtitle,
  icon,
  pageSize = 10,
  searchable = true,
  searchPlaceholder = 'Ara...',
  emptyMessage = 'Kayıt bulunamadı',
  emptyIcon,
  stats,
  enableCardView = true,
  enableAnalytics = false,
  defaultView = 'table',
  renderExpanded,
  onRowClick,
  rowClassName,
  renderCard,
  footer,
  headerActions,
  accentColor = '#3b82f6',
  compact = false,
  enableFullscreen = false,
  filterChips,
}: InteractiveDataPanelProps<T>) {
  const uid = useId();
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  // Sort handler
  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null); }
      else setSortDir('asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setCurrentPage(0);
  }, [sortKey, sortDir]);

  const toggleExpand = useCallback((idx: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // Filter
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter(item =>
      columns.some(col => {
        const val = col.getValue ? col.getValue(item) : item[col.key];
        return String(val ?? '').toLowerCase().includes(term);
      })
    );
  }, [data, searchTerm, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const col = columns.find(c => c.key === sortKey);
    return [...filtered].sort((a, b) => {
      const aVal = col?.getValue ? col.getValue(a) : a[sortKey];
      const bVal = col?.getValue ? col.getValue(b) : b[sortKey];
      const aNum = typeof aVal === 'number' ? aVal : parseFloat(String(aVal));
      const bNum = typeof bVal === 'number' ? bVal : parseFloat(String(bVal));
      if (!isNaN(aNum) && !isNaN(bNum)) return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
      return sortDir === 'asc'
        ? String(aVal ?? '').localeCompare(String(bVal ?? ''), 'tr')
        : String(bVal ?? '').localeCompare(String(aVal ?? ''), 'tr');
    });
  }, [filtered, sortKey, sortDir, columns]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = useMemo(() => {
    const start = currentPage * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  const alignClass = (a?: string) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/30 ml-0.5" />;
    if (sortDir === 'asc') return <ChevronUp className="w-3 h-3 ml-0.5" style={{ color: accentColor }} />;
    return <ChevronDown className="w-3 h-3 ml-0.5" style={{ color: accentColor }} />;
  };

  const wrapperClass = isFullscreen
    ? 'fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl overflow-auto p-4 sm:p-6'
    : '';

  // ─── Stats Row ─────────────────────────────────────────────────────────────
  const StatsRow = () => {
    if (!stats || stats.length === 0) return null;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        {stats.map((s, i) => (
          <motion.div
            key={`stat-${i}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="relative overflow-hidden p-3 sm:p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all group"
          >
            {/* Glow */}
            <div
              className="absolute -top-6 -right-6 w-16 h-16 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ backgroundColor: `${s.color || accentColor}20` }}
            />
            <div className="relative z-10 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{s.label}</p>
                <p className="text-sm sm:text-lg font-black text-foreground mt-0.5" style={{ color: s.color }}>
                  {typeof s.value === 'number' ? (
                    <AnimatedCounter value={s.value} prefix={s.prefix || ''} suffix={s.suffix || ''} />
                  ) : s.value}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {s.sparkData && s.sparkData.length > 2 && (
                  <Sparkline data={s.sparkData} color={s.color || accentColor} width={48} height={20} showDot={false} />
                )}
                {s.icon && <div className="shrink-0 opacity-60">{s.icon}</div>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    );
  };

  // ─── Default Card Renderer ─────────────────────────────────────────────────
  const DefaultCard = ({ item, index }: { item: T; index: number }) => {
    const titleCol = columns.find(c => c.cardRole === 'title') || columns[0];
    const subtitleCol = columns.find(c => c.cardRole === 'subtitle');
    const valueCol = columns.find(c => c.cardRole === 'value');
    const badgeCol = columns.find(c => c.cardRole === 'badge');
    const metaCols = columns.filter(c => c.cardRole === 'meta');

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        whileHover={{ y: -2, transition: { duration: 0.2 } }}
        onClick={() => onRowClick?.(item, index)}
        className={`relative overflow-hidden p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all ${onRowClick ? 'cursor-pointer' : ''} group`}
      >
        {/* Hover glow line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)` }} />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {titleCol?.render ? titleCol.render(item, index) : (
                <h4 className="text-sm font-bold text-foreground truncate">{String(item[titleCol.key] ?? '')}</h4>
              )}
              {badgeCol && (badgeCol.render ? badgeCol.render(item, index) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground shrink-0">
                  {String(item[badgeCol.key] ?? '')}
                </span>
              ))}
            </div>
            {subtitleCol && (
              <div className="mt-1 text-xs text-muted-foreground">
                {subtitleCol.render ? subtitleCol.render(item, index) : String(item[subtitleCol.key] ?? '')}
              </div>
            )}
          </div>
          {valueCol && (
            <div className="shrink-0 text-right">
              {valueCol.render ? valueCol.render(item, index) : (
                <span className="text-sm font-bold" style={{ color: accentColor }}>{String(item[valueCol.key] ?? '')}</span>
              )}
            </div>
          )}
        </div>

        {metaCols.length > 0 && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.04]">
            {metaCols.map(col => (
              <div key={col.key} className="min-w-0">
                <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{col.label}</p>
                <div className="text-xs text-foreground/80 mt-0.5 truncate">
                  {col.render ? col.render(item, index) : String(item[col.key] ?? '-')}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    );
  };

  // ─── Analytics Mini View ───────────────────────────────────────────────────
  const AnalyticsView = () => {
    const numericCols = columns.filter(col => {
      if (data.length === 0) return false;
      const val = col.getValue ? col.getValue(data[0]) : data[0][col.key];
      return typeof val === 'number' || !isNaN(parseFloat(String(val)));
    }).slice(0, 4);

    return (
      <div className="space-y-4">
        {numericCols.map((col, ci) => {
          const values = data.map(item => {
            const v = col.getValue ? col.getValue(item) : item[col.key];
            return typeof v === 'number' ? v : parseFloat(String(v)) || 0;
          });
          const total = values.reduce((s, v) => s + v, 0);
          const max = Math.max(...values, 1);
          const avg = values.length > 0 ? total / values.length : 0;
          const colorOptions = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
          const color = col.color || colorOptions[ci % colorOptions.length];

          return (
            <motion.div
              key={col.key}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: ci * 0.1 }}
              className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{col.label}</h4>
                <Sparkline data={values.slice(-20)} color={color} width={64} height={20} />
              </div>
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase">Toplam</p>
                  <p className="text-lg font-black" style={{ color }}>
                    <AnimatedCounter value={total} />
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase">Ortalama</p>
                  <p className="text-sm font-bold text-foreground/80">{avg.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase">Max</p>
                  <p className="text-sm font-bold text-foreground/80">{max.toLocaleString('tr-TR')}</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground/60 uppercase">Kayıt</p>
                  <p className="text-sm font-bold text-foreground/80">{values.length}</p>
                </div>
              </div>
              {/* Mini bar distribution */}
              <div className="flex items-end gap-[2px] mt-3 h-8">
                {values.slice(-30).map((v, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max((v / max) * 100, 4)}%` }}
                    transition={{ delay: ci * 0.1 + i * 0.015, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="flex-1 rounded-t-sm min-w-[2px]"
                    style={{
                      background: `linear-gradient(180deg, ${color}, ${color}50)`,
                      opacity: 0.7 + (v / max) * 0.3,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={wrapperClass}>
      <div className="space-y-3">
        {/* ─── Header ─────────────────────────────────────────────────────── */}
        {(title || headerActions || enableCardView || enableFullscreen) && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <div className="shrink-0">{icon}</div>}
              {title && (
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-foreground truncate">{title}</h2>
                  {subtitle && <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* View mode toggle */}
              {(enableCardView || enableAnalytics) && (
                <div className="flex items-center p-0.5 rounded-lg bg-black/30 border border-white/[0.06]">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white/10 text-foreground shadow-sm' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
                    title="Tablo Görünümü"
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                  </button>
                  {enableCardView && (
                    <button
                      onClick={() => setViewMode('cards')}
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-white/10 text-foreground shadow-sm' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
                      title="Kart Görünümü"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {enableAnalytics && (
                    <button
                      onClick={() => setViewMode('analytics')}
                      className={`p-1.5 rounded-md transition-all ${viewMode === 'analytics' ? 'bg-white/10 text-foreground shadow-sm' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
                      title="Analitik Görünümü"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              {enableFullscreen && (
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-1.5 rounded-lg bg-black/20 border border-white/[0.06] text-muted-foreground/50 hover:text-foreground transition-all"
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              )}
              {headerActions}
            </div>
          </div>
        )}

        {/* ─── Stats ──────────────────────────────────────────────────────── */}
        <StatsRow />

        {/* ─── Search + Filters ───────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(0); }}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-8 py-2 bg-black/20 border border-white/[0.06] rounded-lg text-foreground text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/[0.15] focus:ring-1 focus:ring-white/[0.08] transition-all"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Filter chips */}
          {filterChips && filterChips.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
              <Filter className="w-3 h-3 text-muted-foreground/40 shrink-0" />
              {filterChips.map(chip => (
                <button
                  key={chip.value}
                  onClick={chip.onClick}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap shrink-0 ${
                    chip.active
                      ? 'text-foreground border shadow-sm'
                      : 'text-muted-foreground/60 hover:text-muted-foreground border border-transparent'
                  }`}
                  style={chip.active ? { borderColor: `${accentColor}40`, backgroundColor: `${accentColor}10`, color: accentColor } : {}}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 sm:ml-auto shrink-0">
            <span className="text-[10px] text-muted-foreground/40">
              {filtered.length} / {data.length}
            </span>
          </div>
        </div>

        {/* ─── Content Area ───────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {viewMode === 'analytics' ? (
            <motion.div key="analytics" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <AnalyticsView />
            </motion.div>
          ) : viewMode === 'cards' ? (
            <motion.div key="cards" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {paginated.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                  {paginated.map((item, idx) => {
                    const globalIdx = currentPage * pageSize + idx;
                    return renderCard ? (
                      <div key={`card-${globalIdx}`}>{renderCard(item, globalIdx)}</div>
                    ) : (
                      <DefaultCard key={`card-${globalIdx}`} item={item} index={globalIdx} />
                    );
                  })}
                </div>
              ) : (
                <EmptyState message={emptyMessage} icon={emptyIcon} />
              )}
            </motion.div>
          ) : (
            <motion.div key="table" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-black/10">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {renderExpanded && <th className="w-8 py-2.5 px-2" />}
                      {columns.filter(c => c.cardRole !== 'hidden').map(col => (
                        <th
                          key={col.key}
                          className={`py-2.5 px-3 sm:px-4 text-muted-foreground/60 font-semibold text-[10px] uppercase tracking-wider ${alignClass(col.align)} ${col.sortable !== false ? 'cursor-pointer select-none hover:text-muted-foreground transition-colors group' : ''}`}
                          style={col.width ? { width: col.width } : undefined}
                          onClick={() => col.sortable !== false && handleSort(col.key)}
                        >
                          <div className={`inline-flex items-center gap-0.5 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                            {col.label}
                            {col.sortable !== false && <SortIcon colKey={col.key} />}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {paginated.length > 0 ? paginated.map((item, idx) => {
                        const globalIdx = currentPage * pageSize + idx;
                        const isExpanded = expandedRows.has(globalIdx);
                        const isHovered = hoveredRow === globalIdx;

                        return (
                          <React.Fragment key={`row-${globalIdx}`}>
                            <motion.tr
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 8 }}
                              transition={{ delay: idx * 0.025, duration: 0.3 }}
                              className={`border-b border-white/[0.03] transition-all relative ${
                                onRowClick ? 'cursor-pointer' : ''
                              } ${rowClassName ? rowClassName(item, globalIdx) : ''}`}
                              onClick={() => onRowClick?.(item, globalIdx)}
                              onMouseEnter={() => setHoveredRow(globalIdx)}
                              onMouseLeave={() => setHoveredRow(null)}
                              style={{
                                backgroundColor: isHovered ? `${accentColor}06` : 'transparent',
                              }}
                            >
                              {/* Hover indicator line */}
                              {isHovered && (
                                <td className="absolute left-0 top-0 bottom-0 w-[2px] p-0" style={{ backgroundColor: accentColor, opacity: 0.6 }} />
                              )}
                              {renderExpanded && (
                                <td className="py-2.5 px-2">
                                  <button
                                    onClick={e => { e.stopPropagation(); toggleExpand(globalIdx); }}
                                    className="p-1 rounded hover:bg-white/5 transition-colors"
                                  >
                                    <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                                      <ExpandIcon className="w-3 h-3 text-muted-foreground/50" />
                                    </motion.div>
                                  </button>
                                </td>
                              )}
                              {columns.filter(c => c.cardRole !== 'hidden').map(col => (
                                <td key={col.key} className={`py-2.5 sm:py-3 px-3 sm:px-4 ${alignClass(col.align)}`}>
                                  {col.render ? col.render(item, globalIdx) : (
                                    <span className="text-foreground/70 text-xs sm:text-sm">{String(item[col.key] ?? '-')}</span>
                                  )}
                                </td>
                              ))}
                            </motion.tr>
                            {/* Expanded content */}
                            <AnimatePresence>
                              {renderExpanded && isExpanded && (
                                <motion.tr
                                  key={`exp-${globalIdx}`}
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                >
                                  <td colSpan={columns.length + 1} className="p-0">
                                    <motion.div
                                      initial={{ opacity: 0, y: -6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: -6 }}
                                      className="px-4 sm:px-6 py-4 border-b border-white/[0.04]"
                                      style={{ backgroundColor: `${accentColor}04` }}
                                    >
                                      {renderExpanded(item)}
                                    </motion.div>
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </React.Fragment>
                        );
                      }) : (
                        <motion.tr key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <td colSpan={columns.length + (renderExpanded ? 1 : 0)}>
                            <EmptyState message={emptyMessage} icon={emptyIcon} />
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </tbody>
                  {footer && paginated.length > 0 && <tfoot>{footer}</tfoot>}
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Pagination ─────────────────────────────────────────────────── */}
        {totalPages > 1 && viewMode !== 'analytics' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-muted-foreground/40">
              {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, sorted.length)} / {sorted.length}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCurrentPage(0)}
                disabled={currentPage === 0}
                className="px-2 py-1.5 rounded-md text-[10px] text-muted-foreground/50 hover:text-foreground hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                İlk
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) page = i;
                else if (currentPage < 3) page = i;
                else if (currentPage > totalPages - 4) page = totalPages - 5 + i;
                else page = currentPage - 2 + i;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${
                      currentPage === page
                        ? 'text-white shadow-md'
                        : 'text-muted-foreground/50 hover:text-foreground hover:bg-white/5'
                    }`}
                    style={currentPage === page ? { backgroundColor: accentColor, boxShadow: `0 2px 8px ${accentColor}30` } : {}}
                  >
                    {page + 1}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
                className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages - 1)}
                disabled={currentPage === totalPages - 1}
                className="px-2 py-1.5 rounded-md text-[10px] text-muted-foreground/50 hover:text-foreground hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                Son
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      {icon || (
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center"
        >
          <ArrowDownToLine className="w-5 h-5 text-muted-foreground/30" />
        </motion.div>
      )}
      <p className="text-xs text-muted-foreground/40 font-medium">{message}</p>
    </div>
  );
}
