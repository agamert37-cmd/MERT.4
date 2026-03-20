import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, ChevronUp, ArrowUp } from 'lucide-react';

// ─── Pull to Refresh ────────────────────────────────────────────────
interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className = '' }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const threshold = 70;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, 120));
    }
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPullDistance(threshold);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPullDistance(0);
    setPulling(false);
  }, [pullDistance, refreshing, onRefresh]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <AnimatePresence>
        {(pullDistance > 10 || refreshing) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: Math.max(pullDistance, refreshing ? 48 : 0) }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-center overflow-hidden"
          >
            <motion.div
              animate={refreshing ? { rotate: 360 } : { rotate: pullDistance * 3 }}
              transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : { type: 'tween', duration: 0 }}
            >
              <RefreshCw className={`w-5 h-5 ${pullDistance >= threshold || refreshing ? 'text-blue-400' : 'text-gray-500'}`} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}

// ─── Scroll-to-top button ────────────────────────────────────────────
interface ScrollToTopProps {
  scrollRef?: React.RefObject<HTMLElement>;
  threshold?: number;
}

export function ScrollToTop({ scrollRef, threshold = 400 }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef?.current || document.querySelector('main');
    if (!el) return;
    const handler = () => setVisible(el.scrollTop > threshold);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [scrollRef, threshold]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: 20 }}
          onClick={() => {
            const el = scrollRef?.current || document.querySelector('main');
            el?.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="fixed bottom-20 right-4 z-[85] lg:bottom-6 w-10 h-10 rounded-full bg-blue-600/80 backdrop-blur-sm border border-blue-500/30 flex items-center justify-center shadow-lg shadow-blue-600/20 active:scale-90 transition-transform"
        >
          <ArrowUp className="w-4 h-4 text-white" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

// ─── Mobile section collapsible card ─────────────────────────────────
interface MobileCollapsibleProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number;
  className?: string;
}

export function MobileCollapsible({ title, icon, defaultOpen = true, children, badge, className = '' }: MobileCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/5 transition-colors"
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="flex-1 text-sm font-semibold text-white">{title}</span>
        {badge !== undefined && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            {badge}
          </span>
        )}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronUp className="w-4 h-4 text-gray-500" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Mobile search bar (sticky, iOS-like) ────────────────────────────
interface MobileSearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function MobileSearchBar({ value, onChange, placeholder = 'Ara...', className = '' }: MobileSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`sticky top-0 z-10 px-3 py-2 bg-background/80 backdrop-blur-xl ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 pl-10 pr-10 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-blue-500/40 focus:bg-white/[0.08] transition-colors"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {value && (
          <button
            onClick={() => { onChange(''); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-white/10 text-gray-400 active:bg-white/20"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Haptic-like tap feedback (vibrate API) ──────────────────────────
export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light') {
  if ('vibrate' in navigator) {
    const durations = { light: 5, medium: 15, heavy: 30 };
    navigator.vibrate(durations[type]);
  }
}

// ─── Mobile stat card (compact) ──────────────────────────────────────
interface MobileStatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  onClick?: () => void;
}

export function MobileStatCard({ label, value, icon, color = 'blue', trend, trendValue, onClick }: MobileStatCardProps) {
  const colors = {
    blue: 'from-blue-500/10 border-blue-500/20',
    green: 'from-green-500/10 border-green-500/20',
    red: 'from-red-500/10 border-red-500/20',
    amber: 'from-amber-500/10 border-amber-500/20',
    purple: 'from-purple-500/10 border-purple-500/20',
    indigo: 'from-indigo-500/10 border-indigo-500/20',
    emerald: 'from-emerald-500/10 border-emerald-500/20',
    cyan: 'from-cyan-500/10 border-cyan-500/20',
  };

  return (
    <motion.div
      whileTap={onClick ? { scale: 0.97 } : undefined}
      onClick={onClick}
      className={`p-3 rounded-xl bg-gradient-to-br ${colors[color as keyof typeof colors] || colors.blue} via-[#111] to-[#111] border ${onClick ? 'cursor-pointer active:bg-white/5' : ''}`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="p-1.5 rounded-lg bg-white/5">{icon}</div>
        {trend && trendValue && (
          <span className={`text-[10px] font-bold ${trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
            {trend === 'up' ? '+' : trend === 'down' ? '-' : ''}{trendValue}
          </span>
        )}
      </div>
      <p className="text-white font-bold text-lg leading-tight">{value}</p>
      <p className="text-gray-500 text-[11px] mt-0.5 truncate">{label}</p>
    </motion.div>
  );
}
