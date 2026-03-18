# 🎨 İŞLEYEN ET - Tema & Animasyon Rehberi

> Kurumsal, hızlı ve teknik görünüm için optimize edilmiş tema sistemi

## 📋 İçindekiler

- [Animasyon Süreleri](#animasyon-süreleri)
- [Glassmorphism](#glassmorphism)
- [Transition Utility Classes](#transition-utility-classes)
- [Loading States](#loading-states)
- [Stagger Animations](#stagger-animations)
- [Button Effects](#button-effects)
- [Card Variants](#card-variants)
- [Status Indicators](#status-indicators)
- [Typography](#typography)

---

## ⚡ Animasyon Süreleri

Optimize edilmiş, kurumsal hız:

```css
--transition-fast:    150ms  /* Mikro-etkileşimler (hover, focus) */
--transition-base:    250ms  /* Standart geçişler */
--transition-slow:    350ms  /* Card hover, modal açma */
--transition-slower:  500ms  /* Sayfa geçişleri */
```

### Easing Curves

```css
--ease-corporate: cubic-bezier(0.4, 0, 0.2, 1)     /* Material-like */
--ease-snappy:    cubic-bezier(0.25, 0.1, 0.25, 1) /* Hızlı & keskin */
--ease-smooth:    cubic-bezier(0.22, 1, 0.36, 1)   /* Yumuşak & kurumsal */
--ease-elastic:   cubic-bezier(0.68, -0.15, 0.265, 1.15) /* Hafif bounce */
```

**Kullanım:**
```tsx
<button className="transition-snappy hover:scale-105">
  Hızlı Buton
</button>
```

---

## 🔮 Glassmorphism

Rafine edilmiş blur değerleri:

```css
.glass         /* blur: 10px - Standart */
.glass-light   /* blur: 8px - Hafif */
.glass-strong  /* blur: 14px - Yoğun */
```

**Örnek:**
```tsx
<div className="glass rounded-xl p-6">
  <h3>Glassmorphic Card</h3>
</div>
```

---

## 🚀 Transition Utility Classes

Hızlı uygulamalar için hazır sınıflar:

| Class | Süre | Easing | Kullanım |
|-------|------|--------|----------|
| `.transition-corporate` | 250ms | corporate | Standart |
| `.transition-snappy` | 150ms | snappy | Butonlar, toggle'lar |
| `.transition-smooth` | 250ms | smooth | Card hover, modal |

```tsx
<div className="transition-corporate hover:bg-secondary">
  Kurumsal Geçiş
</div>

<button className="transition-snappy hover:scale-105">
  Hızlı Buton
</button>
```

---

## 📦 Loading States

### 1. Spinner (Corporate)

```tsx
import { LoadingSpinner } from './components/LoadingStates';

<LoadingSpinner size="sm" />  // 16px
<LoadingSpinner size="md" />  // 32px
<LoadingSpinner size="lg" />  // 48px
```

**Alternatif (Lucide Icon):**
```tsx
import { LoadingIcon } from './components/LoadingStates';

<LoadingIcon size="md" />
```

### 2. Dot Loading

```tsx
import { DotLoading } from './components/LoadingStates';

<DotLoading />
```

Görünüm: ● ● ●

### 3. Skeleton Loading

```tsx
import { SkeletonCard, SkeletonStatCard } from './components/LoadingStates';

<SkeletonCard />
<SkeletonStatCard />
```

### 4. Inline Loading (Buttons)

```tsx
import { InlineLoading } from './components/LoadingStates';

<button disabled>
  <InlineLoading text="Kaydediliyor" size="sm" />
</button>
```

### 5. Full Page Overlay

```tsx
import { PulseOverlay } from './components/LoadingStates';

<PulseOverlay show={isLoading} message="Veriler yükleniyor..." />
```

---

## 🎭 Stagger Animations

Çocuk elementleri sırayla canlandırma:

### Standart Stagger (400ms, 40ms delay)

```tsx
<div className="stagger-children">
  <div>Item 1</div>  {/* 0ms */}
  <div>Item 2</div>  {/* 40ms */}
  <div>Item 3</div>  {/* 80ms */}
</div>
```

### Fast Stagger (300ms, 30ms delay)

Tab butonları, hızlı menüler için:

```tsx
<div className="stagger-fast">
  <button>Tab 1</button>  {/* 0ms */}
  <button>Tab 2</button>  {/* 30ms */}
  <button>Tab 3</button>  {/* 60ms */}
</div>
```

---

## 🎯 Button Effects

### 1. Press Effect

```tsx
<button className="btn-press px-4 py-2 bg-blue-600 rounded-lg">
  Basıldığında scale(0.96)
</button>
```

### 2. Ripple Effect

```tsx
<button className="ripple-effect px-4 py-2 bg-blue-600 rounded-lg">
  Tıklama Ripple
</button>
```

### 3. Hazır Primary Button

```tsx
<button className="btn-primary">
  Gradient + Glow + Hover
</button>
```

---

## 🃏 Card Variants

### 1. Premium Card (Standart)

```tsx
<div className="card-premium rounded-xl p-6">
  <h3>Glassmorphic Card</h3>
</div>
```

### 2. Stat Card v2

Hover'da border glow + translateY:

```tsx
<div className="stat-card-v2 rounded-xl p-6" style={{'--stat-accent': '#3b82f6', '--stat-glow': 'rgba(37,99,235,0.06)'}}>
  <h3>Stat Card</h3>
  <div className="stat-bg-glow"></div>
</div>
```

### 3. Chart Card

Grafik içeren kartlar için:

```tsx
<div className="chart-card p-6">
  <h3>Satış Grafiği</h3>
  {/* Chart component */}
</div>
```

### 4. Card Hover

Basit hover efekti:

```tsx
<div className="card-premium card-hover rounded-xl p-6">
  Hover'da -2px yukayı çık
</div>
```

---

## 🚦 Status Indicators

### Pulsing Dot

```tsx
import { StatusPulse } from './components/LoadingStates';

<StatusPulse status="active" size="md" />  // Yeşil
<StatusPulse status="idle" size="md" />    // Sarı
<StatusPulse status="error" size="md" />   // Kırmızı
```

### Custom CSS

```tsx
<span className="w-3 h-3 bg-green-500 rounded-full status-pulse" />
```

---

## 🔤 Typography

### Teknik Sayılar (Monospace)

```tsx
<span className="tech-number text-2xl">₺12,345.67</span>
```

Font: JetBrains Mono
- Tabular nums (hizalı)
- Slashed zero (0 çizgili)
- Letter spacing: 0.02em

### Gradient Text

```tsx
<h1 className="text-gradient-blue">Mavi Gradient</h1>
<h1 className="text-gradient-green">Yeşil Gradient</h1>
<h1 className="text-gradient-red">Kırmızı Gradient</h1>

{/* Animasyonlu */}
<h1 className="text-gradient-animated">
  Akıcı Gradient
</h1>
```

---

## 🎨 Special Effects

### 1. Grid Pattern Background

```tsx
<div className="grid-pattern p-8">
  {/* Subtle 32x32 grid */}
</div>

<div className="grid-pattern-dense p-8">
  {/* Dense 16x16 grid */}
</div>
```

### 2. Card Shine

Hafif ışık geçişi:

```tsx
<div className="card-shine card-premium rounded-xl p-6">
  6 saniyede bir parlama efekti
</div>
```

### 3. Aurora Background

Yavaş, ambient glow:

```tsx
<div className="aurora-bg p-8">
  <div>İçerik</div>
</div>
```

### 4. Halo Effect (Icon Glow)

```tsx
<div className="w-12 h-12 rounded-full bg-blue-500 halo-blue flex items-center justify-center">
  <Icon />
</div>

{/* Diğer renkler */}
.halo-green
.halo-red
.halo-purple
```

---

## 📱 Responsive Utilities

### Data Row Hover

Tablo satırları için:

```tsx
<tr className="data-row" style={{'--row-accent': '#3b82f6'}}>
  <td>Cell 1</td>
  <td>Cell 2</td>
</tr>
```

Hover'da:
- Background: rgba(19, 28, 48, 0.5)
- Border-left: 3px accent rengi
- TranslateX: 3px

---

## 🎬 Animation Classes

| Class | Açıklama |
|-------|----------|
| `.animate-slide-in-up` | Aşağıdan yukarı slide (0.55s) |
| `.animate-slide-in-left` | Soldan sağa slide (0.6s) |
| `.animate-slide-in-right` | Sağdan sola slide (0.6s) |
| `.animate-slide-in-down` | Yukarıdan aşağı slide (0.55s) |
| `.animate-fade-in-scale` | Fade + scale (0.45s) |
| `.animate-scale-in-bounce` | Scale + bounce (0.6s) |
| `.shimmer` | Shimmer efekti (2.5s loop) |
| `.pulse-glow` | Glow pulse (2.5s loop) |
| `.breathe` | Nefes alma efekti (4s loop) |
| `.float` | Yukarı-aşağı float (3s loop) |

---

## 💡 Best Practices

### 1. Button'lar için

```tsx
<button className="transition-snappy btn-press px-4 py-2 bg-gradient-primary rounded-lg">
  Hızlı + Press Effect
</button>
```

### 2. Modal/Dialog için

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }} // corporate easing
  className="glass-strong rounded-2xl p-6"
>
  Modal içerik
</motion.div>
```

### 3. List Item Hover için

```tsx
<div className="transition-corporate hover:bg-secondary/50 hover:translate-x-1">
  List item
</div>
```

### 4. Stat Card için

```tsx
<div className="stat-card-v2 rounded-xl p-6" style={{
  '--stat-accent': 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
  '--stat-glow': 'rgba(37,99,235,0.06)',
  '--stat-glow-hover': 'rgba(37,99,235,0.12)'
}}>
  <div className="stat-bg-glow" />
  <h3>İstatistik</h3>
  <p className="tech-number text-3xl">₺45,678</p>
</div>
```

---

## 🎯 Performans İpuçları

1. **Animasyon sürelerini minimize edin**: 150-350ms arası ideal
2. **Motion.div kullanırken `layoutId` ekleyin**: Smooth transitions
3. **Stagger delay'i fazla uzatmayın**: 30-40ms ideal
4. **Blur değerlerini düşük tutun**: 8-14px arası performanslı
5. **Transform > position**: translate, scale kullanın (GPU hızlandırmalı)

---

## 📦 Import Örnekleri

### LoadingStates

```tsx
import {
  LoadingSpinner,
  LoadingIcon,
  DotLoading,
  SkeletonCard,
  SkeletonStatCard,
  PulseOverlay,
  InlineLoading,
  ProgressBar,
  StatusPulse
} from './components/LoadingStates';
```

### Motion (Framer Motion)

```tsx
import { motion, AnimatePresence } from 'motion/react';

<AnimatePresence mode="wait">
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
  >
    İçerik
  </motion.div>
</AnimatePresence>
```

---

## 🎨 Color Variables

```css
/* Primary Blues */
--primary: #2563eb
--primary-hover: #3b82f6
--primary-active: #1d4ed8

/* Status Colors */
--success: #10b981
--destructive: #ef4444
--warning: #f59e0b
--info: #3b82f6

/* Glassmorphism */
--glass-bg: rgba(12, 18, 32, 0.70)
--glass-border: rgba(148, 163, 184, 0.10)
```

---

## 🚀 Quick Start Checklist

- [ ] Button'lara `transition-snappy` ve `btn-press` ekle
- [ ] Card'lara `card-premium` veya `stat-card-v2` kullan
- [ ] Loading state'lerde `LoadingSpinner` veya `DotLoading`
- [ ] List'lerde `stagger-fast` veya `stagger-children`
- [ ] Sayılarda `tech-number` class'ı
- [ ] Modal'larda `glass-strong` ve kurumsal easing
- [ ] Hover'larda `transition-corporate`
- [ ] Icon glow'lar için `halo-blue`, `halo-green`, vs.

---

**Geliştiren:** İŞLEYEN ET Development Team  
**Tarih:** 2026-03-12  
**Versiyon:** 2.0 (Corporate Optimized)
