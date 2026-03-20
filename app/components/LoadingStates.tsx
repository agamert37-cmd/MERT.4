import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Corporate Loading Spinner
 * Kullanım: <LoadingSpinner size="sm" | "md" | "lg" />
 */
export function LoadingSpinner({ 
  size = 'md',
  className = ''
}: { 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className={`spinner-corporate ${sizeClasses[size]} ${className}`} />
  );
}

/**
 * Loading Spinner with Icon (Lucide)
 */
export function LoadingIcon({ 
  size = 'md',
  className = ''
}: { 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-500 ${className}`} />
  );
}

/**
 * Dot Loading Animation
 * Kullanım: <DotLoading />
 */
export function DotLoading({ className = '' }: { className?: string }) {
  return (
    <div className={`dot-loading flex gap-1 ${className}`}>
      <span className="w-2 h-2 rounded-full bg-blue-500" />
      <span className="w-2 h-2 rounded-full bg-blue-500" />
      <span className="w-2 h-2 rounded-full bg-blue-500" />
    </div>
  );
}

/**
 * Skeleton Loading Card
 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`glass rounded-xl p-6 ${className}`}>
      <div className="skeleton h-6 w-32 rounded mb-4" />
      <div className="skeleton h-4 w-full rounded mb-2" />
      <div className="skeleton h-4 w-3/4 rounded" />
    </div>
  );
}

/**
 * Skeleton Stat Card
 */
export function SkeletonStatCard({ className = '' }: { className?: string }) {
  return (
    <div className={`glass rounded-xl p-6 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="skeleton h-12 w-12 rounded-lg" />
        <div className="skeleton h-6 w-16 rounded" />
      </div>
      <div className="skeleton h-8 w-24 rounded mb-2" />
      <div className="skeleton h-4 w-32 rounded" />
    </div>
  );
}

/**
 * Skeleton Table Row
 */
export function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 w-full rounded" />
        </td>
      ))}
    </tr>
  );
}

/**
 * Pulse Loading Overlay
 */
export function PulseOverlay({ 
  show,
  message = 'Yükleniyor...'
}: { 
  show: boolean;
  message?: string;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[9999] flex items-center justify-center transition-smooth">
      <div className="glass-strong rounded-2xl p-8 flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-muted-foreground font-medium">{message}</p>
      </div>
    </div>
  );
}

/**
 * Full Page Loading
 */
export function FullPageLoading({ message = 'Yükleniyor...' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-muted-foreground font-medium">{message}</p>
      </div>
    </div>
  );
}

/**
 * Inline Loading (for buttons)
 */
export function InlineLoading({ 
  text = 'Yükleniyor',
  size = 'sm'
}: { 
  text?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <LoadingSpinner size={size} />
      <span>{text}</span>
    </span>
  );
}

/**
 * Progress Bar
 */
export function ProgressBar({ 
  progress,
  className = '',
  showLabel = true
}: { 
  progress: number;
  className?: string;
  showLabel?: boolean;
}) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between mb-2">
          <span className="text-sm text-muted-foreground">İlerleme</span>
          <span className="text-sm font-medium text-blue-400">{clampedProgress.toFixed(0)}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-primary transition-smooth"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Status Pulse Indicator
 */
export function StatusPulse({ 
  status = 'active',
  size = 'md'
}: { 
  status?: 'active' | 'idle' | 'error';
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  const colorClasses = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    error: 'bg-red-500'
  };

  return (
    <span 
      className={`${sizeClasses[size]} ${colorClasses[status]} rounded-full status-pulse inline-block`}
    />
  );
}