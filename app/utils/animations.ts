/**
 * Merkezi Animasyon Presetleri
 * Tüm uygulama genelinde tutarlı, detaylı Framer Motion animasyonları
 * ─────────────────────────────────────────────────────────────────────
 * Kullanım:
 *   import { spring, ease, variants, hover, stagger, pulse } from '../utils/animations';
 *   <motion.div variants={variants.fadeUp} initial="initial" animate="animate" exit="exit">
 */

import type { Variants, Transition } from 'motion/react';

// ═══════════════════════════════════════════════════════════════════
// Spring Presets — physics-based, doğal hissettiren geçişler
// ═══════════════════════════════════════════════════════════════════
export const spring = {
  /** Hızlı, çıtır — butonlar, küçük etkileşimler */
  snappy:  { type: 'spring', stiffness: 520, damping: 30,  mass: 0.7 } as Transition,
  /** Dengeli — genel UI elemanları */
  smooth:  { type: 'spring', stiffness: 240, damping: 26,  mass: 1.0 } as Transition,
  /** Yumuşak zıplama — kartlar, bildirimler */
  bouncy:  { type: 'spring', stiffness: 380, damping: 18,  mass: 0.8 } as Transition,
  /** Ağır, dramatik — modal, büyük paneller */
  gentle:  { type: 'spring', stiffness: 140, damping: 22,  mass: 1.4 } as Transition,
  /** Modal pencereleri */
  modal:   { type: 'spring', stiffness: 300, damping: 32,  mass: 0.9 } as Transition,
  /** Sidebar slide */
  sidebar: { type: 'spring', stiffness: 260, damping: 28,  mass: 0.9 } as Transition,
  /** Mikro animasyonlar (ikon rotasyonu, toggle) */
  micro:   { type: 'spring', stiffness: 600, damping: 35,  mass: 0.5 } as Transition,
  /** Sayfa geçişleri */
  page:    { type: 'spring', stiffness: 200, damping: 28,  mass: 1.0 } as Transition,
} as const;

// ═══════════════════════════════════════════════════════════════════
// Ease Curves — cubic-bezier tabanlı
// ═══════════════════════════════════════════════════════════════════
export const ease = {
  /** Expo çıkış — hız keskin başlar, yavaşça durur */
  out:     [0.16, 1, 0.3, 1]  as [number, number, number, number],
  /** Material Design — genel */
  inOut:   [0.4,  0, 0.2, 1]  as [number, number, number, number],
  /** iOS benzeri */
  apple:   [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
  /** Hızlı giriş */
  in:      [0.4,  0, 1,   1]  as [number, number, number, number],
} as const;

// ═══════════════════════════════════════════════════════════════════
// Variants — yeniden kullanılabilir animasyon setleri
// ═══════════════════════════════════════════════════════════════════

/** Blur + Y yukarı kayma — sayfa ve kart girişleri */
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 18, filter: 'blur(10px)', scale: 0.99 },
  animate: {
    opacity: 1, y: 0, filter: 'blur(0px)', scale: 1,
    transition: { ...spring.smooth, filter: { duration: 0.4, ease: ease.out } }
  },
  exit: {
    opacity: 0, y: -10, filter: 'blur(8px)',
    transition: { duration: 0.22, ease: ease.inOut }
  },
};

/** Blur + scale — modal, popup */
export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.92, filter: 'blur(12px)', y: 16 },
  animate: {
    opacity: 1, scale: 1, filter: 'blur(0px)', y: 0,
    transition: { ...spring.modal, filter: { duration: 0.35, ease: ease.out } }
  },
  exit: {
    opacity: 0, scale: 0.95, filter: 'blur(8px)', y: 8,
    transition: { duration: 0.2, ease: ease.inOut }
  },
};

/** Soldan kayma — sidebar, drawer */
export const slideLeft: Variants = {
  initial: { opacity: 0, x: -28, filter: 'blur(8px)' },
  animate: {
    opacity: 1, x: 0, filter: 'blur(0px)',
    transition: { ...spring.sidebar, filter: { duration: 0.3, ease: ease.out } }
  },
  exit: {
    opacity: 0, x: -20,
    transition: { duration: 0.2, ease: ease.in }
  },
};

/** Sağdan kayma */
export const slideRight: Variants = {
  initial: { opacity: 0, x: 28, filter: 'blur(8px)' },
  animate: {
    opacity: 1, x: 0, filter: 'blur(0px)',
    transition: { ...spring.sidebar, filter: { duration: 0.3, ease: ease.out } }
  },
  exit: {
    opacity: 0, x: 20,
    transition: { duration: 0.2, ease: ease.in }
  },
};

/** Pop — bildirim, badge, küçük ögeler */
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.7, y: 6 },
  animate: {
    opacity: 1, scale: 1, y: 0,
    transition: spring.bouncy
  },
  exit: {
    opacity: 0, scale: 0.8, y: -4,
    transition: { duration: 0.15, ease: ease.in }
  },
};

/** Stagger container — çocuk elemanları sıralı giriş */
export const staggerContainer = (staggerChildren = 0.06, delayChildren = 0.04): Variants => ({
  initial: {},
  animate: {
    transition: { staggerChildren, delayChildren }
  },
});

/** Stagger alt öğe — container ile birlikte kullanılır */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 16, filter: 'blur(8px)', scale: 0.98 },
  animate: {
    opacity: 1, y: 0, filter: 'blur(0px)', scale: 1,
    transition: { ...spring.smooth, filter: { duration: 0.35, ease: ease.out } }
  },
};

/** Stagger alt öğe — yalnızca fade (daha hafif) */
export const staggerItemFade: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1, y: 0,
    transition: spring.smooth
  },
};

/** Liste satırı — scroll-triggered */
export const listRow: Variants = {
  initial: { opacity: 0, x: -12 },
  animate: {
    opacity: 1, x: 0,
    transition: spring.snappy
  },
};

// ═══════════════════════════════════════════════════════════════════
// Hover & Tap Presets — whileHover / whileTap için
// ═══════════════════════════════════════════════════════════════════
export const hover = {
  /** Kart kaldırma efekti */
  lift:   { scale: 1.025, y: -3, transition: spring.snappy } as const,
  /** Hafif büyüme */
  grow:   { scale: 1.04,  transition: spring.micro }  as const,
  /** Küçük kıpırdama */
  nudge:  { scale: 1.015, y: -1, transition: spring.snappy } as const,
  /** Parlama — renkli sınır verilmeli */
  glow:   { scale: 1.02, transition: spring.snappy } as const,
  /** İkon hover */
  icon:   { scale: 1.2, rotate: 8, transition: spring.bouncy } as const,
  /** Buton hover */
  button: { scale: 1.03, y: -1, transition: spring.snappy } as const,
} as const;

export const tap = {
  /** Standart tıklama geri bildirimi */
  press:  { scale: 0.95, transition: { duration: 0.08 } } as const,
  /** Küçük öğe tıklama */
  small:  { scale: 0.92, transition: { duration: 0.07 } } as const,
  /** Buton tıklama */
  button: { scale: 0.96, transition: { duration: 0.09 } } as const,
} as const;

// ═══════════════════════════════════════════════════════════════════
// Pulse / Breathing — keyframe animasyonlar (sürekli döngü)
// ═══════════════════════════════════════════════════════════════════
export const pulse = {
  /** Bildirim noktası — nefes alan ölçek */
  dot: {
    scale: [1, 1.35, 1],
    opacity: [1, 0.5, 1],
    transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
  },
  /** Glow halka — badge ve alert */
  ring: {
    scale: [1, 1.6, 1],
    opacity: [0.7, 0, 0.7],
    transition: { duration: 2.2, repeat: Infinity, ease: 'easeOut' }
  },
  /** Nefes alma — aktif göstergeler */
  breathe: {
    opacity: [1, 0.55, 1],
    scale: [1, 0.97, 1],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' }
  },
  /** Shimmer — yükleme iskelet */
  shimmer: {
    backgroundPosition: ['200% 50%', '-200% 50%'],
    transition: { duration: 1.8, repeat: Infinity, ease: 'linear' }
  },
} as const;

// ═══════════════════════════════════════════════════════════════════
// Özel geçiş nesneleri — tek kullanım için
// ═══════════════════════════════════════════════════════════════════

/** index bazlı stagger gecikme (geriye dönük uyumluluk için) */
export const staggerDelay = (i: number, base = 0.05) => ({
  transition: { ...spring.smooth, delay: i * base }
});

/** Sayı sayacı animasyonu */
export const counterTransition: Transition = {
  duration: 1.2,
  ease: ease.out,
};
