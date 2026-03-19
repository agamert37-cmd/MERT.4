import React, { useState, useMemo, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronUp, ChevronDown, ChevronsUpDown, Search, 
  ChevronLeft, ChevronRight, ArrowDownToLine, ChevronRight as ExpandIcon, X
} from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (item: T, index: number) => React.ReactNode;
  getValue?: (item: T) => string | number;
}

interface DynamicTableProps<T> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  expandable?: boolean;
  renderExpanded?: (item: T) => React.ReactNode;
  footer?: React.ReactNode;
  onRowClick?: (item: T, index: number) => void;
  rowClassName?: (item: T, index: number) => string;
  stickyHeader?: boolean;
  animateRows?: boolean;
  accentColor?: string;
}

type SortDir = 'asc' | 'desc' | null;

export function DynamicTable<T extends Record<string, any>>({
  data,
  columns,
  pageSize = 10,
  searchable = true,
  searchPlaceholder = 'Ara...',
  emptyMessage = 'Kayıt bulunamadı',
  emptyIcon,
  expandable = false,
  renderExpanded,
  footer,
  onRowClick,
  rowClassName,
  stickyHeader = false,
  animateRows = true,
  accentColor = '#3b82f6',
}: DynamicTableProps<T>) {
  const uid = useId();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

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
    return data.filter(item => {
      return columns.some(col => {
        const val = col.getValue ? col.getValue(item) : item[col.key];
        return String(val ?? '').toLowerCase().includes(term);
      });
    });
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
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
      }
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      return sortDir === 'asc' ? aStr.localeCompare(bStr, 'tr') : bStr.localeCompare(aStr, 'tr');
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

  return (
    <div className="space-y-3">
      {/* Search + Info Bar */}
      {searchable && (
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(0); }}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 py-2 bg-black/20 border border-white/[0.06] rounded-lg text-foreground text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/[0.15] focus:ring-1 focus:ring-white/[0.08] transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/40 shrink-0">
            {filtered.length} / {data.length}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-black/10">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {expandable && <th className="w-8 py-2.5 px-2" />}
              {columns.map((col) => (
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
                      initial={animateRows ? { opacity: 0, x: -8 } : undefined}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ delay: animateRows ? idx * 0.025 : 0, duration: 0.3 }}
                      className={`border-b border-white/[0.03] transition-all relative ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName ? rowClassName(item, globalIdx) : ''}`}
                      onClick={() => onRowClick?.(item, globalIdx)}
                      onMouseEnter={() => setHoveredRow(globalIdx)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{ backgroundColor: isHovered ? `${accentColor}06` : 'transparent' }}
                    >
                      {/* Hover accent indicator */}
                      {isHovered && (
                        <td className="absolute left-0 top-0 bottom-0 w-[2px] p-0" style={{ backgroundColor: accentColor, opacity: 0.5 }} />
                      )}
                      {expandable && (
                        <td className="py-2.5 px-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(globalIdx); }}
                            className="p-1 rounded hover:bg-white/5 transition-colors"
                          >
                            <motion.div
                              animate={{ rotate: isExpanded ? 90 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ExpandIcon className="w-3 h-3 text-muted-foreground/50" />
                            </motion.div>
                          </button>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={`py-2.5 sm:py-3 px-3 sm:px-4 ${alignClass(col.align)}`}
                        >
                          {col.render ? col.render(item, globalIdx) : (
                            <span className="text-foreground/70 text-xs sm:text-sm">
                              {String(item[col.key] ?? '-')}
                            </span>
                          )}
                        </td>
                      ))}
                    </motion.tr>
                    {/* Expanded Row */}
                    <AnimatePresence>
                      {expandable && isExpanded && renderExpanded && (
                        <motion.tr
                          key={`expanded-${globalIdx}`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
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
                <motion.tr
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key="empty"
                >
                  <td colSpan={columns.length + (expandable ? 1 : 0)} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      {emptyIcon || (
                        <motion.div
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                          className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center"
                        >
                          <ArrowDownToLine className="w-5 h-5 text-muted-foreground/30" />
                        </motion.div>
                      )}
                      <p className="text-xs text-muted-foreground/40">{emptyMessage}</p>
                    </div>
                  </td>
                </motion.tr>
              )}
            </AnimatePresence>
          </tbody>
          {footer && paginated.length > 0 && (
            <tfoot>
              {footer}
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between"
        >
          <span className="text-[10px] text-muted-foreground/40">
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, sorted.length)} / {sorted.length}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setCurrentPage(0)}
              disabled={currentPage === 0}
              className="px-2 py-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-[10px]"
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
              if (totalPages <= 5) {
                page = i;
              } else if (currentPage < 3) {
                page = i;
              } else if (currentPage > totalPages - 4) {
                page = totalPages - 5 + i;
              } else {
                page = currentPage - 2 + i;
              }
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
              className="px-2 py-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-[10px]"
            >
              Son
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
