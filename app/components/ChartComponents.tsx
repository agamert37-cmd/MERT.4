import React, { useEffect, useState, useRef, useMemo, useId } from 'react';
import { motion } from 'motion/react';

// ─── Custom Recharts Tooltip ─────────────────────────────────────────────────
interface TooltipPayload {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

interface PremiumTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  formatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
}

export function PremiumTooltip({ active, payload, label, formatter, labelFormatter }: PremiumTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.90, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: 6, scale: 0.94, filter: 'blur(6px)' }}
      transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.7,
        filter: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
      className="relative"
    >
      <div className="glass-strong rounded-xl p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.5),0_0_0_1px_rgba(59,130,246,0.08)]">
        {/* Accent line */}
        <div className="absolute top-0 left-3 right-3 h-[1px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
        
        {label && (
          <p className="text-[11px] font-semibold text-muted-foreground mb-2.5 uppercase tracking-wider">
            {labelFormatter ? labelFormatter(label) : label}
          </p>
        )}
        
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-3 min-w-[140px]">
              <div className="flex items-center gap-2 flex-1">
                <div 
                  className="w-2.5 h-2.5 rounded-full shadow-lg"
                  style={{ 
                    backgroundColor: entry.color,
                    boxShadow: `0 0 8px ${entry.color}40`
                  }} 
                />
                <span className="text-[11px] text-muted-foreground">{entry.name || entry.dataKey}</span>
              </div>
              <span className="text-[13px] font-bold text-foreground tabular-nums">
                {formatter ? formatter(entry.value || 0) : `${(entry.value || 0).toLocaleString('tr-TR')}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Animated Progress Bar ───────────────────────────────────────────────────
interface AnimatedProgressProps {
  value: number;
  max: number;
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  label?: string;
  showPercentage?: boolean;
  height?: number;
  delay?: number;
}

export function AnimatedProgress({ 
  value, max, color, gradientFrom, gradientTo, 
  label, showPercentage = true, height = 8, delay = 0 
}: AnimatedProgressProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  
  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <span className="text-[11px] text-muted-foreground font-medium">{label}</span>}
          {showPercentage && (
            <span className="text-[11px] text-foreground/80 font-mono font-semibold">
              {percentage.toFixed(0)}%
            </span>
          )}
        </div>
      )}
      <div 
        className="w-full rounded-full overflow-hidden" 
        style={{ 
          height: `${height}px`,
          background: 'rgba(19, 28, 48, 0.8)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)'
        }}
      >
        <motion.div
          initial={{ width: 0, opacity: 0.5 }}
          animate={{ width: `${percentage}%`, opacity: 1 }}
          transition={{
            width: { duration: 1.4, delay, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 0.4, delay }
          }}
          className="h-full rounded-full relative overflow-hidden"
          style={{
            background: gradientFrom && gradientTo
              ? `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})`
              : color || '#3b82f6',
            boxShadow: `0 0 14px ${(color || gradientTo || '#3b82f6')}40, inset 0 1px 0 rgba(255,255,255,0.15)`
          }}
        >
          {/* Sürekli hareket eden shimmer */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)', backgroundSize: '200% 100%' }}
            animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'linear', delay: delay + 1.4 }}
          />
        </motion.div>
      </div>
    </div>
  );
}

// ─── Mini Sparkline ──────────────────────────────────────────────────────────
interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  showDot?: boolean;
  fill?: boolean;
}

export function Sparkline({ data, color = '#3b82f6', width = 80, height = 28, showDot = true, fill = true }: SparklineProps) {
  const uniqueId = useId();
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const padding = 3;
  const effectiveWidth = width - padding * 2;
  const effectiveHeight = height - padding * 2;

  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * effectiveWidth;
    const y = padding + effectiveHeight - ((val - min) / range) * effectiveHeight;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  
  const fillPath = fill
    ? `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
    : '';

  const lastPoint = points[points.length - 1];
  const isUp = data[data.length - 1] >= data[0];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-fill-${uniqueId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      
      {fill && (
        <motion.path
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          d={fillPath}
          fill={`url(#spark-fill-${uniqueId})`}
        />
      )}
      
      <motion.path
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {showDot && lastPoint && (
        <>
          {/* Dış halka — yavaş büyüyüp kaybolan */}
          <motion.circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            fill={color}
            r={2.5}
            opacity={0.35}
            animate={{ r: [2.5, 7, 2.5], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: 1.1 }}
          />
          {/* İç nokta — spring ile ortaya çıkar, sürekli parlar */}
          <motion.circle
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1, type: 'spring', stiffness: 220, damping: 20 }}
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={2.8}
            fill={color}
            style={{ filter: `drop-shadow(0 0 5px ${color})` }}
          />
        </>
      )}
    </svg>
  );
}

// ─── Animated Counter Display ────────────────────────────────────────────────
interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  decimals?: number;
}

export function AnimatedCounter({ value, prefix = '', suffix = '', duration = 1500, className = '', decimals = 0 }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const start = prevValue.current;
    const diff = value - start;
    if (diff === 0) return;

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out expo
      const eased = 1 - Math.pow(2, -10 * progress);
      const current = start + diff * eased;
      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
        prevValue.current = value;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString('tr-TR');

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}{formatted}{suffix}
    </span>
  );
}

// ─── Donut Chart (Mini) ──────────────────────────────────────────────────────
interface DonutProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  label?: string;
}

export function MiniDonut({ value, max, size = 56, strokeWidth = 5, color = '#3b82f6', bgColor = 'rgba(37,56,92,0.3)', label }: DonutProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = max > 0 ? Math.min(value / max, 1) : 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        <motion.circle
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - percentage) }}
          transition={{ duration: 1.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      {label && (
        <span className="absolute text-[10px] font-bold text-white">
          {label}
        </span>
      )}
    </div>
  );
}

// ─── Stat Card v2 Component ──────────────────────────────────────────────────
interface StatCardV2Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  accentColor: string;
  glowColor: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  sparkData?: number[];
  live?: boolean;
  alert?: boolean;
  delay?: number;
}

export function StatCardV2({
  title, value, subtitle, icon: Icon, accentColor, glowColor,
  change, changeType, sparkData, live, alert, delay = 0
}: StatCardV2Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay,
        duration: 0.6,
        type: 'spring',
        stiffness: 120,
        damping: 20
      }}
      whileHover={{
        y: -4,
        transition: { duration: 0.35, type: 'spring', stiffness: 200, damping: 24 }
      }}
      className="stat-card-v2 p-6 group card-shine"
      style={{
        '--stat-accent': `linear-gradient(90deg, ${accentColor}, ${glowColor})`,
        '--stat-glow': `${glowColor}10`,
        '--stat-glow-hover': `${glowColor}20`,
      } as React.CSSProperties}
    >
      {/* Background glow */}
      <div className="stat-bg-glow" />

      <div className="relative">
        {/* Top Row: Icon + Badges */}
        <div className="flex items-start justify-between mb-4">
          <motion.div
            whileHover={{ rotate: 6, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            className="p-3 rounded-xl shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, ${glowColor})`,
              boxShadow: `0 4px 15px ${accentColor}30`
            }}
          >
            <Icon className="w-6 h-6 text-white" />
          </motion.div>

          <div className="flex items-center gap-2">
            {live && (
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/25 rounded-lg"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" 
                     style={{ boxShadow: '0 0 8px rgba(16,185,129,0.6)' }} />
                <span className="text-[9px] text-green-400 font-bold uppercase tracking-wider">Canli</span>
              </motion.div>
            )}
            {alert && (
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/25 rounded-lg"
              >
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"
                     style={{ boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
                <span className="text-[9px] text-red-400 font-bold uppercase tracking-wider">Kritik</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mb-2.5 transition-colors group-hover:text-foreground/80">
          {title}
        </h3>

        {/* Value + Spark */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-foreground tracking-tight leading-none mb-1">
              {typeof value === 'number' ? (
                <AnimatedCounter value={value} prefix="₺" />
              ) : (
                value
              )}
            </p>
            {change && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: delay + 0.3 }}
                className={`text-xs font-bold ${
                  changeType === 'positive' ? 'text-green-400' :
                  changeType === 'negative' ? 'text-red-400' : 'text-muted-foreground'
                }`}
              >
                {change}
              </motion.span>
            )}
            {subtitle && (
              <p className="text-[11px] text-muted-foreground/60 mt-1.5 font-medium">{subtitle}</p>
            )}
          </div>

          {sparkData && sparkData.length > 2 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: delay + 0.5 }}
            >
              <Sparkline 
                data={sparkData} 
                color={accentColor} 
                width={72} 
                height={32}
              />
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Chart Wrapper with Aurora ───────────────────────────────────────────────
interface ChartWrapperProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  iconColor?: string;
  children: React.ReactNode;
  rightContent?: React.ReactNode;
  className?: string;
}

export function ChartWrapper({ title, subtitle, icon: Icon, iconColor = 'text-blue-400', children, rightContent, className = '' }: ChartWrapperProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`chart-card p-6 ${className}`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {Icon && (
            <motion.div
              whileHover={{ rotate: 8 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className={`p-2 rounded-lg bg-secondary/60 border border-border/40 ${iconColor}`}
            >
              <Icon className="w-5 h-5" />
            </motion.div>
          )}
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {rightContent}
      </div>
      {children}
    </motion.div>
  );
}

// ─── Premium Chart Gradient Defs ─────────────────────────────────────────────
export function PremiumChartDefs() {
  return (
    <defs>
      {/* Blue gradient fill */}
      <linearGradient id="gradient-blue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
        <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.08} />
        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
      </linearGradient>
      {/* Green gradient fill */}
      <linearGradient id="gradient-green" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
        <stop offset="50%" stopColor="#10b981" stopOpacity={0.08} />
        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
      </linearGradient>
      {/* Purple gradient fill */}
      <linearGradient id="gradient-purple" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
        <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.08} />
        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
      </linearGradient>
      {/* Red gradient fill */}
      <linearGradient id="gradient-red" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
        <stop offset="50%" stopColor="#ef4444" stopOpacity={0.08} />
        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
      </linearGradient>
      {/* Cyan gradient fill */}
      <linearGradient id="gradient-cyan" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.25} />
        <stop offset="50%" stopColor="#06b6d4" stopOpacity={0.08} />
        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
      </linearGradient>
      {/* Orange gradient fill */}
      <linearGradient id="gradient-orange" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
        <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.08} />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
      </linearGradient>
      {/* Bar gradients (horizontal) */}
      <linearGradient id="bar-gradient-blue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
      <linearGradient id="bar-gradient-green" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="bar-gradient-purple" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#c084fc" />
        <stop offset="100%" stopColor="#7c3aed" />
      </linearGradient>
      {/* Glow filter */}
      <filter id="glow-blue">
        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

// ─── Empty Chart State ───────────────────────────────────────────────────────
interface EmptyChartProps {
  message?: string;
  height?: number;
}

export function EmptyChartState({ message = 'Yeterli veri bulunmuyor', height = 300 }: EmptyChartProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ height }}>
      <motion.div
        animate={{ y: [0, -6, 0], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="w-16 h-16 rounded-2xl bg-secondary/60 border border-border/40 flex items-center justify-center mb-4"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-muted-foreground/60">
          <path d="M3 3v18h18" />
          <path d="M7 16l4-8 4 4 4-6" />
        </svg>
      </motion.div>
      <p className="text-[13px] text-muted-foreground/60 font-medium">{message}</p>
      <p className="text-[11px] text-muted-foreground/40 mt-1">Veri oluştukça grafikler burada görünecek</p>
    </div>
  );
}

// ─── Radial Gauge Chart ──────────────────────────────────────────────────────
interface RadialGaugeProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  color?: string;
  glowColor?: string;
  icon?: React.ReactNode;
  suffix?: string;
  animate?: boolean;
}

export function RadialGauge({
  value, max, size = 160, strokeWidth = 10, label, sublabel,
  color = '#3b82f6', glowColor, icon, suffix = '', animate = true
}: RadialGaugeProps) {
  const uniqueId = useId();
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = max > 0 ? Math.min(value / max, 1) : 0;
  const glow = glowColor || color;

  return (
    <div className="relative inline-flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(37,56,92,0.25)" strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Active arc */}
        <motion.circle
          initial={animate ? { strokeDashoffset: circumference } : false}
          animate={{ strokeDashoffset: circumference * (1 - percentage) }}
          transition={{ duration: 1.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={`url(#gauge-grad-${uniqueId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${glow}50)` }}
        />
        <defs>
          <linearGradient id={`gauge-grad-${uniqueId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.8} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {icon && <div className="mb-1 opacity-60">{icon}</div>}
        <motion.span
          initial={animate ? { opacity: 0, scale: 0.5 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: 'spring', stiffness: 180, damping: 20 }}
          className="text-2xl font-black text-white tabular-nums"
        >
          {Math.round(percentage * 100)}{suffix || '%'}
        </motion.span>
        {label && <span className="text-[10px] font-semibold text-muted-foreground mt-0.5">{label}</span>}
        {sublabel && <span className="text-[9px] text-muted-foreground/50">{sublabel}</span>}
      </div>
    </div>
  );
}

// ─── Horizontal Metric Bar ───────────────────────────────────────────────────
interface MetricBarProps {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  suffix?: string;
  delay?: number;
}

export function MetricBar({ label, value, maxValue, color, suffix = '', delay = 0 }: MetricBarProps) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className="text-[12px] font-bold text-white tabular-nums">{value.toLocaleString('tr-TR')}{suffix}</span>
      </div>
      <div className="h-2 rounded-full bg-[#131c30] overflow-hidden">
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ duration: 1.2, delay, ease: [0.16, 1, 0.3, 1] }}
          className="h-full w-full rounded-full"
          style={{
            transformOrigin: 'left',
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            boxShadow: `0 0 12px ${color}30`,
          }}
        />
      </div>
    </div>
  );
}

// ─── Live Pulse Dot ──────────────────────────────────────────────────────────
export function LivePulse({ color = '#10b981', size = 8 }: { color?: string; size?: number }) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size + 8, height: size + 8 }}>
      {/* Üçüncü halka — en dışta, çok silik */}
      <motion.span
        className="absolute rounded-full"
        style={{ backgroundColor: color }}
        animate={{ scale: [1, 3.2, 1], opacity: [0.15, 0, 0.15] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 0.15 }}
        initial={{ width: size, height: size }}
      />
      {/* İkinci halka */}
      <motion.span
        className="absolute rounded-full"
        style={{ backgroundColor: color }}
        animate={{ scale: [1, 2.2, 1], opacity: [0.3, 0, 0.3] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
        initial={{ width: size, height: size }}
      />
      {/* Merkez nokta */}
      <span
        className="relative rounded-full"
        style={{ width: size, height: size, backgroundColor: color, boxShadow: `0 0 8px ${color}90, 0 0 2px ${color}` }}
      />
    </span>
  );
}

// ─── Trend Badge ─────────────────────────────────────────────────────────────
interface TrendBadgeProps {
  value: number;
  suffix?: string;
  showArrow?: boolean;
}

export function TrendBadge({ value, suffix = '%', showArrow = true }: TrendBadgeProps) {
  const isPos = value >= 0;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.7, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 480, damping: 22, mass: 0.7 }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
        isPos
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
          : 'bg-red-500/15 text-red-400 border border-red-500/20'
      }`}
    >
      {showArrow && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className={!isPos ? 'rotate-180' : ''}>
          <path d="M5 1L9 6H1L5 1Z" />
        </svg>
      )}
      {isPos ? '+' : ''}{value.toFixed(1)}{suffix}
    </motion.span>
  );
}

// ─── Glowing Custom Bar Shape for Recharts ───────────────────────────────────
export function GlowBar(props: any) {
  const { x, y, width, height, fill, index, dataKey } = props;
  if (!height || height <= 0) {
    return <rect x={x} y={y} width={0} height={0} fill="none" />;
  }
  const r = Math.min(6, width / 2, height);
  return (
    <rect
      x={x} y={y} width={width} height={height}
      rx={r} ry={r}
      fill={fill}
      style={{ filter: `drop-shadow(0 2px 8px ${fill}40)` }}
      opacity={0.9}
    />
  );
}

// ─── Mini Horizontal Bar List ────────────────────────────────────────────────
interface HBarItem {
  label: string;
  value: number;
  color: string;
}

export function HorizontalBarList({ items, maxValue: externalMax }: { items: HBarItem[]; maxValue?: number }) {
  const maxValue = externalMax || Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <motion.div
          key={i}
          className="flex items-center gap-3 group"
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-20px' }}
          transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-[11px] text-muted-foreground w-24 truncate group-hover:text-white transition-colors">{item.label}</span>
          <div className="flex-1 h-3 rounded-full bg-[#131c30] overflow-hidden relative">
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: item.value / maxValue }}
              viewport={{ once: true, margin: '-20px' }}
              transition={{ duration: 1.1, delay: i * 0.08 + 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full rounded-full"
              style={{
                transformOrigin: 'left',
                background: `linear-gradient(90deg, ${item.color}80, ${item.color})`,
                boxShadow: `0 0 8px ${item.color}25`,
              }}
            />
          </div>
          <span className="text-[12px] font-bold text-white tabular-nums w-16 text-right group-hover:text-blue-300 transition-colors">
            ₺{item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : item.value.toLocaleString('tr-TR')}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Stat Mini Card (compact) ────────────────────────────────────────────────
interface StatMiniProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  trend?: number;
}

export function StatMini({ label, value, icon, color, trend }: StatMiniProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-all group"
    >
      <div className="p-2 rounded-lg" style={{ background: `${color}15` }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
        <p className="text-sm font-bold text-white">{value}</p>
      </div>
      {trend !== undefined && <TrendBadge value={trend} />}
    </motion.div>
  );
}

// ─── Hourly Sales Heatmap ────────────────────────────────────────────────────
interface HeatmapCell {
  hour: number;
  day: string;
  value: number;
}

interface HeatmapChartProps {
  data: HeatmapCell[];
  colorScale?: [string, string, string]; // [low, mid, high]
  height?: number;
}

export function HeatmapChart({ data, colorScale = ['#0a1628', '#1e40af', '#3b82f6'], height = 200 }: HeatmapChartProps) {
  if (!data || data.length === 0) return <EmptyChartState message="Isı haritası verisi yok" height={height} />;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const days = [...new Set(data.map(d => d.day))];
  const hours = [...new Set(data.map(d => d.hour))].sort((a, b) => a - b);

  const getColor = (value: number) => {
    const ratio = Math.min(value / maxVal, 1);
    if (ratio < 0.33) return colorScale[0];
    if (ratio < 0.66) return colorScale[1];
    return colorScale[2];
  };

  const getOpacity = (value: number) => {
    if (value === 0) return 0.15;
    return 0.3 + (value / maxVal) * 0.7;
  };

  const cellW = 100 / Math.max(hours.length, 1);
  const cellH = 100 / Math.max(days.length, 1);

  return (
    <div style={{ height }} className="overflow-x-auto no-scrollbar">
      <div className="flex h-full" style={{ minWidth: hours.length > 12 ? '320px' : 'auto' }}>
        {/* Day labels */}
        <div className="flex flex-col justify-around pr-1.5 sm:pr-2 shrink-0" style={{ width: 30 }}>
          {days.map(d => (
            <span key={d} className="text-[8px] sm:text-[9px] text-muted-foreground font-medium truncate">{d}</span>
          ))}
        </div>
        {/* Grid */}
        <div className="flex-1 relative">
          <div className="grid h-full" style={{
            gridTemplateColumns: `repeat(${hours.length}, 1fr)`,
            gridTemplateRows: `repeat(${days.length}, 1fr)`,
            gap: '1px',
          }}>
            {days.map(day =>
              hours.map(hour => {
                const cell = data.find(d => d.day === day && d.hour === hour);
                const val = cell?.value || 0;
                return (
                  <motion.div
                    key={`${day}-${hour}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (hours.indexOf(hour) * 0.02) + (days.indexOf(day) * 0.05) }}
                    className="rounded-sm cursor-pointer group relative"
                    style={{
                      backgroundColor: getColor(val),
                      opacity: getOpacity(val),
                      boxShadow: val > maxVal * 0.5 ? `0 0 8px ${colorScale[2]}30` : 'none',
                    }}
                    title={`${day} ${String(hour).padStart(2,'0')}:00 — ${val} satış`}
                  />
                );
              })
            )}
          </div>
          {/* Hour labels */}
          <div className="flex justify-between mt-1 sm:mt-1.5">
            {hours.filter((_, i) => i % (hours.length > 12 ? 4 : 3) === 0).map(h => (
              <span key={h} className="text-[7px] sm:text-[8px] text-muted-foreground/50 font-mono">{String(h).padStart(2,'0')}</span>
            ))}
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
        <span className="text-[7px] sm:text-[8px] text-muted-foreground/40">Az</span>
        <div className="flex gap-0.5">
          {[0.15, 0.3, 0.5, 0.7, 1].map((o, i) => (
            <div key={i} className="w-2.5 sm:w-3 h-1.5 sm:h-2 rounded-[2px]" style={{ backgroundColor: colorScale[Math.min(Math.floor(o * 3), 2)], opacity: o }} />
          ))}
        </div>
        <span className="text-[7px] sm:text-[8px] text-muted-foreground/40">Çok</span>
      </div>
    </div>
  );
}

// ─── Waterfall Chart (Cumulative Revenue) ────────────────────────────────────
interface WaterfallItem {
  label: string;
  value: number;
  type: 'income' | 'expense' | 'total';
}

interface WaterfallChartProps {
  items: WaterfallItem[];
  height?: number;
}

export function WaterfallChart({ items, height = 220 }: WaterfallChartProps) {
  if (!items || items.length === 0) return <EmptyChartState message="Waterfall verisi yok" height={height} />;

  const maxAbs = Math.max(...items.map(i => Math.abs(i.value)), 1);
  let running = 0;
  const bars = items.map(item => {
    const prev = running;
    if (item.type === 'total') {
      running = item.value;
    } else {
      running += item.type === 'income' ? item.value : -item.value;
    }
    return { ...item, start: prev, end: running };
  });

  const allVals = bars.flatMap(b => [b.start, b.end]);
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 1);
  const range = maxV - minV || 1;

  const barW = 100 / bars.length;

  return (
    <div style={{ height }} className="relative overflow-x-auto no-scrollbar">
      <svg width="100%" height="100%" viewBox={`0 0 ${bars.length * 60} ${height}`} preserveAspectRatio="xMidYMid meet">
        {bars.map((bar, i) => {
          const top = ((maxV - Math.max(bar.start, bar.end)) / range) * (height - 40);
          const bottom = ((maxV - Math.min(bar.start, bar.end)) / range) * (height - 40);
          const barH = Math.max(bottom - top, 2);
          const cx = i * 60 + 30;
          const color = bar.type === 'total' ? '#3b82f6' : bar.type === 'income' ? '#10b981' : '#ef4444';
          return (
            <g key={i}>
              <motion.rect
                initial={{ height: 0, y: height - 40 }}
                animate={{ height: barH, y: top }}
                transition={{ duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                x={cx - 16}
                width={32}
                rx={4}
                fill={color}
                opacity={0.85}
                style={{ filter: `drop-shadow(0 2px 6px ${color}30)` }}
              />
              {/* Connector line */}
              {i < bars.length - 1 && (
                <line
                  x1={cx + 16} y1={((maxV - bar.end) / range) * (height - 40)}
                  x2={(i + 1) * 60 + 14} y2={((maxV - bar.end) / range) * (height - 40)}
                  stroke="#ffffff15" strokeWidth={1} strokeDasharray="3 2"
                />
              )}
              {/* Value */}
              <text
                x={cx} y={Math.max(top - 6, 12)}
                textAnchor="middle" fill="#ffffffcc" fontSize={9} fontWeight="bold" fontFamily="monospace"
              >
                {bar.end >= 0 ? '' : '-'}₺{Math.abs(bar.end).toLocaleString('tr-TR')}
              </text>
              {/* Label */}
              <text
                x={cx} y={height - 8}
                textAnchor="middle" fill="#ffffff50" fontSize={8} fontWeight="600"
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Multi Radial Gauge Group ───────────────────────────────────────────────
interface MultiGaugeItem {
  label: string;
  value: number;
  max: number;
  color: string;
}

export function MultiRadialGauge({ items, size = 80 }: { items: MultiGaugeItem[]; size?: number }) {
  return (
    <div className="flex items-center justify-around gap-1.5 sm:gap-2 flex-wrap">
      {items.map((item, i) => {
        const sw = size < 65 ? 4 : 6;
        const radius = (size - sw * 2) / 2;
        const circumference = 2 * Math.PI * radius;
        const pct = item.max > 0 ? Math.min(item.value / item.max, 1) : 0;
        return (
          <div key={i} className="flex flex-col items-center gap-0.5 sm:gap-1">
            <div className="relative" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="-rotate-90">
                <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(37,56,92,0.2)" strokeWidth={sw} />
                <motion.circle
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference * (1 - pct) }}
                  transition={{ duration: 1.5, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                  cx={size/2} cy={size/2} r={radius}
                  fill="none" stroke={item.color} strokeWidth={sw}
                  strokeDasharray={circumference} strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 6px ${item.color}40)` }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`font-black text-white ${size < 65 ? 'text-[10px]' : 'text-xs'}`}>{Math.round(pct * 100)}%</span>
              </div>
            </div>
            <span className={`font-semibold text-muted-foreground text-center leading-tight ${size < 65 ? 'text-[7px]' : 'text-[9px]'}`}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI Scrolling Ticker ────────────────────────────────────────────────────
interface KPIItem {
  label: string;
  value: string;
  change?: number;
  icon?: React.ReactNode;
}

export function KPITicker({ items }: { items: KPIItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-xl bg-white/[0.02] border border-white/[0.06] py-2.5">
      <motion.div
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: items.length * 5, repeat: Infinity, ease: 'linear' }}
        className="flex items-center gap-6 whitespace-nowrap"
        style={{ width: 'max-content' }}
      >
        {[...items, ...items].map((item, i) => (
          <div key={i} className="flex items-center gap-2 px-3">
            {item.icon && <span className="opacity-60">{item.icon}</span>}
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</span>
            <span className="text-xs font-bold text-white">{item.value}</span>
            {item.change !== undefined && (
              <span className={`text-[10px] font-bold ${item.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {item.change >= 0 ? '▲' : '▼'}{Math.abs(item.change).toFixed(1)}%
              </span>
            )}
            <span className="text-white/10 ml-3">│</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Week-over-Week Comparison Bar ───────────────────────────────────────────
interface WeekCompareProps {
  thisWeek: number;
  lastWeek: number;
  label?: string;
  color?: string;
}

export function WeekCompareBar({ thisWeek, lastWeek, label = 'Bu Hafta', color = '#3b82f6' }: WeekCompareProps) {
  const max = Math.max(thisWeek, lastWeek, 1);
  const change = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : 0;

  return (
    <div className="space-y-2 sm:space-y-2.5">
      {/* This week */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[9px] sm:text-[10px] font-semibold text-white/80 truncate">{label}</span>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="text-[10px] sm:text-xs font-bold text-white tabular-nums">₺{thisWeek.toLocaleString('tr-TR')}</span>
            {change !== 0 && (
              <span className={`text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.5 rounded ${change >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                {change >= 0 ? '+' : ''}{change.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div className="h-2.5 sm:h-3 rounded-full bg-[#131c30] overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: thisWeek / max }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full rounded-full"
            style={{ transformOrigin: 'left', background: `linear-gradient(90deg, ${color}80, ${color})`, boxShadow: `0 0 12px ${color}25` }}
          />
        </div>
      </div>
      {/* Last week */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[9px] sm:text-[10px] font-semibold text-white/40 truncate">Önceki Hafta</span>
          <span className="text-[9px] sm:text-[11px] font-bold text-white/40 tabular-nums shrink-0">₺{lastWeek.toLocaleString('tr-TR')}</span>
        </div>
        <div className="h-2 rounded-full bg-[#131c30] overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: lastWeek / max }}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full rounded-full bg-white/10"
            style={{ transformOrigin: 'left' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Payment Method Donut ────────────────────────────────────────────────────
interface PaymentSegment {
  method: string;
  amount: number;
  color: string;
  icon?: React.ReactNode;
}

export function PaymentDonut({ segments, size = 140 }: { segments: PaymentSegment[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.amount, 0);
  if (total === 0) return <EmptyChartState message="Ödeme verisi yok" height={size} />;

  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
      <div className="relative shrink-0" style={{ width: Math.min(size, 110), height: Math.min(size, 110) }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {segments.map((seg, i) => {
            const pct = seg.amount / total;
            const dashLen = circumference * pct;
            const dashOffset = circumference - offset;
            offset += dashLen;
            return (
              <motion.circle
                key={i}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference - dashLen }}
                transition={{ duration: 1.2, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                cx={size/2} cy={size/2} r={radius}
                fill="none" stroke={seg.color} strokeWidth={10}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={-offset + dashLen}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${seg.color}30)` }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm sm:text-lg font-black text-white">₺{total >= 1000 ? `${(total/1000).toFixed(0)}k` : total.toLocaleString('tr-TR')}</span>
          <span className="text-[7px] sm:text-[8px] text-muted-foreground font-semibold uppercase">TOPLAM</span>
        </div>
      </div>
      <div className="flex flex-wrap sm:flex-col gap-x-4 gap-y-1.5 sm:space-y-2 sm:gap-0 flex-1 min-w-0 justify-center sm:justify-start">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color, boxShadow: `0 0 6px ${seg.color}30` }} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:justify-between">
                <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium truncate">{seg.method}</span>
                <span className="text-[9px] sm:text-[10px] font-bold text-white tabular-nums">%{((seg.amount / total) * 100).toFixed(0)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stock Flow Mini Bars ────────────────────────────────────────────────────
interface StockFlowItem {
  label: string;
  inflow: number;
  outflow: number;
}

export function StockFlowBars({ items }: { items: StockFlowItem[] }) {
  if (!items || items.length === 0) return null;
  const maxVal = Math.max(...items.flatMap(i => [i.inflow, i.outflow]), 1);
  return (
    <div className="space-y-2 sm:space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="space-y-0.5 sm:space-y-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium truncate">{item.label}</span>
            <div className="flex items-center gap-1.5 sm:gap-2 text-[8px] sm:text-[9px] font-bold shrink-0">
              <span className="text-emerald-400">+{item.inflow}</span>
              <span className="text-red-400">−{item.outflow}</span>
            </div>
          </div>
          <div className="flex gap-1 h-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.inflow / maxVal) * 50}%` }}
              transition={{ duration: 0.8, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full bg-emerald-500/70"
              style={{ boxShadow: '0 0 4px rgba(16,185,129,0.2)' }}
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.outflow / maxVal) * 50}%` }}
              transition={{ duration: 0.8, delay: i * 0.08 + 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full bg-red-500/70"
              style={{ boxShadow: '0 0 4px rgba(239,68,68,0.2)' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Performance Radar Chart (Custom SVG) ────────────────────────────────────
interface RadarMetric {
  label: string;
  value: number;
  max: number;
  color?: string;
}

export function PerformanceRadar({ metrics, size = 220, className = '' }: { metrics: RadarMetric[]; size?: number; className?: string }) {
  const uniqueId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [actualSize, setActualSize] = useState(size);
  const n = metrics.length;
  if (n < 3) return null;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.parentElement?.clientWidth || size;
      setActualSize(Math.min(w - 16, size));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [size]);

  const s = actualSize;
  const cx = s / 2;
  const cy = s / 2;
  const labelPad = s < 180 ? 14 : 18;
  const maxR = s / 2 - (s < 180 ? 22 : 30);
  const levels = 4;
  const fontSizeLabel = s < 180 ? 7 : 9;
  const fontSizePct = s < 180 ? 6 : 8;
  const dotR = s < 180 ? 3 : 4;

  const angleSlice = (2 * Math.PI) / n;

  const getPoint = (i: number, r: number) => ({
    x: cx + r * Math.cos(angleSlice * i - Math.PI / 2),
    y: cy + r * Math.sin(angleSlice * i - Math.PI / 2),
  });

  const dataPoints = metrics.map((m, i) => {
    const ratio = m.max > 0 ? Math.min(m.value / m.max, 1) : 0;
    return getPoint(i, maxR * ratio);
  });

  const pathD = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <div ref={containerRef} className={`relative flex justify-center ${className}`}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        <defs>
          <linearGradient id={`radar-fill-${uniqueId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.08} />
          </linearGradient>
          <filter id={`radar-glow-${uniqueId}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Grid levels */}
        {Array.from({ length: levels }).map((_, li) => {
          const r = maxR * ((li + 1) / levels);
          const pts = Array.from({ length: n }).map((_, i) => getPoint(i, r));
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
          return <path key={li} d={d} fill="none" stroke="#ffffff08" strokeWidth={1} />;
        })}

        {/* Axis lines */}
        {metrics.map((_, i) => {
          const end = getPoint(i, maxR);
          return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#ffffff08" strokeWidth={1} />;
        })}

        {/* Data shape */}
        <motion.path
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          d={pathD}
          fill={`url(#radar-fill-${uniqueId})`}
          stroke="#3b82f6"
          strokeWidth={2}
          strokeLinejoin="round"
          style={{ transformOrigin: `${cx}px ${cy}px`, filter: `url(#radar-glow-${uniqueId})` }}
        />

        {/* Data dots */}
        {dataPoints.map((p, i) => (
          <motion.circle
            key={i}
            initial={{ r: 0, opacity: 0 }}
            animate={{ r: dotR, opacity: 1 }}
            transition={{ delay: 0.6 + i * 0.1, type: 'spring', stiffness: 300 }}
            cx={p.x} cy={p.y}
            fill="#3b82f6" stroke="#0a0a0a" strokeWidth={2}
            style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.5))' }}
          />
        ))}

        {/* Labels */}
        {metrics.map((m, i) => {
          const pt = getPoint(i, maxR + labelPad);
          const pct = m.max > 0 ? Math.round((m.value / m.max) * 100) : 0;
          return (
            <g key={`label-${i}`}>
              <text x={pt.x} y={pt.y - 5} textAnchor="middle" fill="#ffffff90" fontSize={fontSizeLabel} fontWeight="600">{m.label}</text>
              <text x={pt.x} y={pt.y + 5} textAnchor="middle" fill="#3b82f6" fontSize={fontSizePct} fontWeight="bold">{pct}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Sales Funnel Chart ──────────────────────────────────────────────────────
interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

export function SalesFunnel({ steps, height = 220 }: { steps: FunnelStep[]; height?: number }) {
  if (!steps || steps.length === 0) return <EmptyChartState message="Hunileme verisi yok" height={height} />;

  const maxVal = Math.max(...steps.map(s => s.value), 1);

  return (
    <div className="space-y-1.5 sm:space-y-2" style={{ minHeight: height }}>
      {steps.map((step, i) => {
        const widthPct = Math.max((step.value / maxVal) * 100, 35);
        const convRate = i > 0 && steps[i - 1].value > 0
          ? ((step.value / steps[i - 1].value) * 100).toFixed(0)
          : '100';

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: i * 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative mx-auto"
            style={{ width: `${widthPct}%`, minWidth: '140px', transformOrigin: 'center' }}
          >
            <div
              className="relative py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-center overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${step.color}25, ${step.color}10)`,
                border: `1px solid ${step.color}30`,
              }}
            >
              <div className="absolute inset-0 shimmer opacity-30" />
              <div className="relative z-10 flex items-center justify-between gap-1 sm:gap-2">
                <span className="text-[9px] sm:text-[10px] font-bold text-white/80 truncate">{step.label}</span>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <span className="text-[10px] sm:text-xs font-black text-white">{step.value.toLocaleString('tr-TR')}</span>
                  {i > 0 && (
                    <span className="text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.5 rounded-md bg-white/5 text-white/50">
                      {convRate}%
                    </span>
                  )}
                </div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex justify-center my-0.5">
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                  <path d="M6 8L0 0H12L6 8Z" fill={`${step.color}30`} />
                </svg>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Bullet Gauge (Target vs Actual) ─────────────────────────────────────────
interface BulletGaugeProps {
  label: string;
  actual: number;
  target: number;
  max: number;
  color: string;
  suffix?: string;
}

export function BulletGauge({ label, actual, target, max, color, suffix = '' }: BulletGaugeProps) {
  const actualPct = max > 0 ? Math.min((actual / max) * 100, 100) : 0;
  const targetPct = max > 0 ? Math.min((target / max) * 100, 100) : 0;
  const achieved = target > 0 ? Math.min((actual / target) * 100, 999) : 0;

  return (
    <div className="space-y-1 sm:space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] sm:text-[10px] font-semibold text-white/70 truncate">{label}</span>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="text-[9px] sm:text-[10px] font-bold text-white tabular-nums">
            {actual.toLocaleString('tr-TR')}{suffix}
          </span>
          <span className={`text-[7px] sm:text-[8px] font-bold px-1 sm:px-1.5 py-0.5 rounded ${achieved >= 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
            {achieved.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="relative h-3 sm:h-4 rounded-lg overflow-hidden bg-[#0d1117]">
        <div className="absolute inset-0 flex">
          <div className="h-full bg-white/[0.02]" style={{ width: '60%' }} />
          <div className="h-full bg-white/[0.04]" style={{ width: '25%' }} />
          <div className="h-full bg-white/[0.06]" style={{ width: '15%' }} />
        </div>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: actualPct / 100 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-1 bottom-1 left-0 right-0 rounded-md"
          style={{
            transformOrigin: 'left',
            background: `linear-gradient(90deg, ${color}90, ${color})`,
            boxShadow: `0 0 12px ${color}30`,
          }}
        />
        <motion.div
          initial={{ left: '0%', opacity: 0 }}
          animate={{ left: `${targetPct}%`, opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="absolute top-0 bottom-0 w-0.5"
          style={{ backgroundColor: '#fff', boxShadow: '0 0 4px rgba(255,255,255,0.5)' }}
        />
      </div>
      <div className="flex items-center justify-between text-[7px] sm:text-[8px] text-white/30">
        <span>0</span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 sm:w-3 h-0.5 bg-white/60 rounded" /> <span className="hidden sm:inline">Hedef: </span>{target.toLocaleString('tr-TR')}{suffix}
        </span>
        <span>{max.toLocaleString('tr-TR')}{suffix}</span>
      </div>
    </div>
  );
}

// ─── Trend Comparison Cards ──────────────────────────────────────────────────
interface TrendItem {
  label: string;
  current: number;
  previous: number;
  format?: (v: number) => string;
  color: string;
  icon?: React.ReactNode;
}

export function TrendComparison({ items }: { items: TrendItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {items.map((item, i) => {
        const change = item.previous > 0 ? ((item.current - item.previous) / item.previous) * 100 : 0;
        const isUp = change >= 0;
        const fmt = item.format || ((v: number) => v.toLocaleString('tr-TR'));
        
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-2.5 sm:p-3 rounded-xl border transition-all active:scale-95 hover:border-white/15"
            style={{
              background: `linear-gradient(135deg, ${item.color}08, transparent)`,
              borderColor: `${item.color}15`,
            }}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
              {item.icon && <span className="opacity-50">{item.icon}</span>}
              <span className="text-[8px] sm:text-[9px] font-bold text-white/50 uppercase tracking-wider truncate">{item.label}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-0.5">
              <span className="text-sm sm:text-lg font-black text-white truncate">{fmt(item.current)}</span>
              <div className="sm:text-right">
                <span className={`text-[9px] sm:text-[10px] font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isUp ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
                </span>
                <p className="text-[7px] sm:text-[8px] text-white/30 hidden sm:block">önceki: {fmt(item.previous)}</p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Activity Heatmap Calendar ───────────────────────────────────────────────
interface CalendarHeatmapProps {
  data: Record<string, number>;
  weeks?: number;
  color?: string;
}

export function CalendarHeatmap({ data, weeks = 12, color = '#3b82f6' }: CalendarHeatmapProps) {
  const today = new Date();
  const maxVal = Math.max(...Object.values(data), 1);
  const days: Array<{ date: string; value: number; dayOfWeek: number }> = [];

  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    days.push({ date: iso, value: data[iso] || 0, dayOfWeek: d.getDay() });
  }

  const weekGroups: typeof days[] = [];
  let currentWeek: typeof days = [];
  days.forEach((day, i) => {
    currentWeek.push(day);
    if (day.dayOfWeek === 6 || i === days.length - 1) {
      weekGroups.push(currentWeek);
      currentWeek = [];
    }
  });

  return (
    <div className="space-y-1.5">
      <div className="flex gap-[2px] sm:gap-[3px] overflow-x-auto no-scrollbar -mx-1 px-1">
        {weekGroups.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[2px] sm:gap-[3px]">
            {week.map((day, di) => {
              const intensity = day.value / maxVal;
              return (
                <motion.div
                  key={day.date}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: wi * 0.02 + di * 0.01 }}
                  className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px] sm:rounded-[3px] cursor-pointer"
                  style={{
                    backgroundColor: day.value === 0 ? '#ffffff06' : color,
                    opacity: day.value === 0 ? 1 : 0.2 + intensity * 0.8,
                    boxShadow: intensity > 0.6 ? `0 0 4px ${color}30` : 'none',
                  }}
                  title={`${day.date}: ${day.value} işlem`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1 sm:gap-1.5">
        <span className="text-[6px] sm:text-[7px] text-white/30">Az</span>
        {[0, 0.25, 0.5, 0.75, 1].map((o, i) => (
          <div key={i} className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px] sm:rounded-[3px]" style={{ backgroundColor: o === 0 ? '#ffffff06' : color, opacity: o === 0 ? 1 : 0.2 + o * 0.8 }} />
        ))}
        <span className="text-[6px] sm:text-[7px] text-white/30">Çok</span>
      </div>
    </div>
  );
}

// ─── Animated Number Ring ────────────────────────────────────────────────────
interface NumberRingProps {
  value: number;
  label: string;
  color: string;
  size?: number;
  icon?: React.ReactNode;
}

export function NumberRing({ value, label, color, size = 90, icon }: NumberRingProps) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const uniqueId = useId();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      className="flex flex-col items-center gap-1.5 cursor-pointer"
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={`ring-${uniqueId}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.6} />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={6} />
          <motion.circle
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
            cx={size/2} cy={size/2} r={radius}
            fill="none" stroke={`url(#ring-${uniqueId})`} strokeWidth={6}
            strokeDasharray={circumference} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {icon && <div className="mb-0.5 opacity-60">{icon}</div>}
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-base font-black text-white tabular-nums"
          >
            {value.toLocaleString('tr-TR')}
          </motion.span>
        </div>
      </div>
      <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider text-center leading-tight">{label}</span>
    </motion.div>
  );
}

// ─── Gradient Progress Arc (for KPIs) ────────────────────────────────────────
interface GradientArcProps {
  value: number;
  max: number;
  label: string;
  sublabel?: string;
  fromColor: string;
  toColor: string;
  size?: number;
  formatValue?: (v: number) => string;
}

export function GradientArc({ value, max, label, sublabel, fromColor, toColor, size = 130, formatValue }: GradientArcProps) {
  const uniqueId = useId();
  const strokeW = 8;
  const radius = (size - strokeW * 2) / 2;
  const circumference = Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
        <svg width={size} height={size / 2 + 10} className="overflow-visible">
          <defs>
            <linearGradient id={`arc-${uniqueId}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fromColor} />
              <stop offset="100%" stopColor={toColor} />
            </linearGradient>
          </defs>
          <path
            d={`M ${strokeW} ${size/2} A ${radius} ${radius} 0 0 1 ${size - strokeW} ${size/2}`}
            fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeW} strokeLinecap="round"
          />
          <motion.path
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - pct) }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            d={`M ${strokeW} ${size/2} A ${radius} ${radius} 0 0 1 ${size - strokeW} ${size/2}`}
            fill="none" stroke={`url(#arc-${uniqueId})`} strokeWidth={strokeW} strokeLinecap="round"
            strokeDasharray={circumference}
            style={{ filter: `drop-shadow(0 0 8px ${toColor}40)` }}
          />
        </svg>
        <div className="absolute bottom-0 left-0 right-0 text-center">
          <span className="text-xl font-black text-white">
            {formatValue ? formatValue(value) : `${Math.round(pct * 100)}%`}
          </span>
        </div>
      </div>
      <span className="text-[9px] sm:text-[10px] font-bold text-white/60 mt-1">{label}</span>
      {sublabel && <span className="text-[7px] sm:text-[8px] text-white/30 truncate max-w-full">{sublabel}</span>}
    </div>
  );
}

// ─── Bar Race (Horizontal Race Chart) ────────────────────────────────────────
interface BarRaceItem {
  label: string;
  value: number;
  color: string;
  icon?: React.ReactNode;
}

export function BarRace({ items, suffix = '' }: { items: BarRaceItem[]; suffix?: string }) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const maxVal = sorted[0]?.value || 1;

  return (
    <div className="space-y-2 sm:space-y-3">
      {sorted.map((item, i) => {
        const pct = (item.value / maxVal) * 100;
        return (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="group"
          >
            {/* Mobile: stacked layout / Desktop: inline */}
            <div className="sm:hidden space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0"
                    style={{ background: `${item.color}20`, color: item.color }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-[9px] font-bold text-white/70 truncate">{item.label}</span>
                </div>
                <span className="text-[9px] font-black text-white/80 tabular-nums shrink-0">
                  {item.value.toLocaleString('tr-TR')}{suffix}
                </span>
              </div>
              <div className="h-4 rounded-lg bg-[#0d1117] overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1.2, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-lg relative overflow-hidden"
                  style={{
                    background: `linear-gradient(90deg, ${item.color}60, ${item.color})`,
                    boxShadow: `0 0 12px ${item.color}20`,
                  }}
                >
                  <div className="absolute inset-0 shimmer opacity-30" />
                </motion.div>
              </div>
            </div>
            {/* Desktop: inline layout */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex items-center gap-2 w-28 shrink-0 min-w-0">
                {item.icon && <span className="opacity-60 shrink-0">{item.icon}</span>}
                <span className="text-[10px] font-bold text-white/70 truncate">{item.label}</span>
              </div>
              <div className="flex-1 h-5 rounded-lg bg-[#0d1117] overflow-hidden relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1.2, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-lg relative overflow-hidden"
                  style={{
                    background: `linear-gradient(90deg, ${item.color}60, ${item.color})`,
                    boxShadow: `0 0 12px ${item.color}20`,
                  }}
                >
                  <div className="absolute inset-0 shimmer opacity-30" />
                </motion.div>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <span className="text-[9px] font-black text-white/80 tabular-nums">
                    {item.value.toLocaleString('tr-TR')}{suffix}
                  </span>
                </div>
              </div>
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                style={{ background: `${item.color}20`, color: item.color }}
              >
                {i + 1}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Animated Wave Progress ──────────────────────────────────────────────────
interface WaveProgressProps {
  value: number;
  max: number;
  label?: string;
  color?: string;
  size?: number;
}

export function WaveProgress({ value, max, label, color = '#3b82f6', size = 80 }: WaveProgressProps) {
  const uniqueId = useId();
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const waterLevel = size - pct * size;

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-hidden rounded-full">
        <defs>
          <clipPath id={`wave-clip-${uniqueId}`}>
            <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} />
          </clipPath>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill="rgba(19,28,48,0.6)" stroke={`${color}30`} strokeWidth={2} />
        <g clipPath={`url(#wave-clip-${uniqueId})`}>
          <motion.rect
            initial={{ y: size }}
            animate={{ y: waterLevel }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            x={0} width={size} height={size}
            fill={`${color}25`}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: 'spring', stiffness: 180, damping: 20 }}
          className="text-base font-black tabular-nums"
          style={{ color }}
        >
          {Math.round(pct * 100)}%
        </motion.span>
        {label && <span className="text-[8px] text-muted-foreground font-medium mt-0.5">{label}</span>}
      </div>
    </div>
  );
}

// ─── Animated Pulse Metric ───────────────────────────────────────────────────
interface PulseMetricProps {
  value: number;
  label: string;
  prefix?: string;
  suffix?: string;
  color?: string;
  icon?: React.ReactNode;
  shouldAnimate?: boolean;
}

export function PulseMetric({ value, label, prefix = '', suffix = '', color = '#3b82f6', icon, shouldAnimate = true }: PulseMetricProps) {
  return (
    <motion.div
      initial={shouldAnimate ? { opacity: 0, scale: 0.9 } : false}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.03 }}
      className="relative p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden group"
    >
      <motion.div
        animate={{ scale: [1, 1.5, 1], opacity: [0.15, 0, 0.15] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-3 right-3 w-8 h-8 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          {icon && <div className="opacity-60">{icon}</div>}
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-2xl font-black tabular-nums" style={{ color }}>
          <AnimatedCounter value={value} prefix={prefix} suffix={suffix} />
        </p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />
    </motion.div>
  );
}

// ─── Data Flow Animation Dots ────────────────────────────────────────────────
export function DataFlowDots({ color = '#3b82f6', count = 5, speed = 2 }: { color?: string; count?: number; speed?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: speed, repeat: Infinity, delay: i * (speed / count), ease: 'easeInOut' }}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

// ─── Status Glow Indicator ───────────────────────────────────────────────────
export function StatusGlow({ status, size = 'sm' }: { status: 'success' | 'warning' | 'error' | 'info'; size?: 'xs' | 'sm' | 'md' }) {
  const colors = { success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6' };
  const c = colors[status];
  const sizeMap = { xs: 6, sm: 8, md: 10 };
  const s = sizeMap[size];
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: s * 2, height: s * 2 }}>
      <motion.span
        animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute rounded-full"
        style={{ width: s, height: s, backgroundColor: c }}
      />
      <span className="relative rounded-full" style={{ width: s, height: s, backgroundColor: c, boxShadow: `0 0 ${s}px ${c}80` }} />
    </span>
  );
}