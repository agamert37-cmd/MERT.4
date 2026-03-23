/**
 * Pazarlama Yonetim Paneli - ISLEYEN ET
 * Login sayfasindaki tum icerik kutucuklarini buradan yonetin.
 * Tab bazli navigasyon, canli onizleme, icerik saglik skoru ve sablonlar destekli.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Megaphone, Save, Plus, Trash2, X, Edit2, Eye, EyeOff,
  Newspaper, BarChart3, Building2, Star,
  Gift, HelpCircle, Share2, Image as ImageIcon,
  Sparkles,
  ExternalLink, Globe, ShoppingBag,
  Instagram, Facebook, Youtube, Twitter, Linkedin,
  ArrowUp, ArrowDown, Copy, Monitor, AlertCircle,
  Palette, CheckCircle, LayoutDashboard,
  Layers, PanelRightOpen, PanelRightClose,
  Check, ChevronRight, Heart, Wand2, Rocket,
  Upload, Package, Search as SearchIcon, Link2, FileImage
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';
import { getVitrinAnalytics, getPopularProducts, getDailyStats, getVitrinEventsToday, clearVitrinAnalytics } from '../utils/vitrinAnalytics';

// ─── Interfaces ──────────────────────────────────────────────────
interface HeroBanner {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  active: boolean;
}

interface Announcement {
  id: string;
  title: string;
  text: string;
  date: string;
  badge: string;
  imageUrl: string;
  active: boolean;
  relatedProducts?: string[]; // Haber hangi vitrin ürünleriyle ilgili (isim eşleşmesi)
}

interface ProductShowcase {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  badge: string;
  active: boolean;
}

interface StatCard {
  id: string;
  icon: string;
  value: string;
  label: string;
  color: string;
}

interface Testimonial {
  id: string;
  name: string;
  company: string;
  text: string;
  rating: number;
  active: boolean;
}

interface Campaign {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  validUntil: string;
  discount: string;
  active: boolean;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  active: boolean;
}

interface SocialLink {
  platform: string;
  url: string;
  active: boolean;
}

interface PazarlamaContent {
  heroBanners: HeroBanner[];
  announcements: Announcement[];
  products: ProductShowcase[];
  stats: StatCard[];
  companyAbout: string;
  companyMission: string;
  companyVision: string;
  testimonials: Testimonial[];
  campaigns: Campaign[];
  faq: FAQItem[];
  socialLinks: SocialLink[];
  footerText: string;
  theme: {
    primaryColor: string;
    accentColor: string;
    showParticles: boolean;
  };
}

const DEFAULT_CONTENT: PazarlamaContent = {
  heroBanners: [
    { id: '1', imageUrl: 'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcmVtaXVtJTIwc3RlYWslMjBjdXRzJTIwcmF3JTIwbWVhdHxlbnwxfHx8fDE3NzMwNjA0NDh8MA&ixlib=rb-4.1.0&q=80&w=1080', title: 'Premium Kalite Et Urunleri', subtitle: 'En yuksek hijyen standartlarinda, guvenilir uretim', buttonText: '', buttonLink: '', active: true },
    { id: '2', imageUrl: 'https://images.unsplash.com/photo-1763140446057-9becaa30b868?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcmVtaXVtJTIwbWVhdCUyMGN1dHMlMjBkaXNwbGF5JTIwYnV0Y2hlcnxlbnwxfHx8fDE3NzMwNjUxNTd8MA&ixlib=rb-4.1.0&q=80&w=1080', title: 'Genis Urun Yelpazesi', subtitle: 'Her damak tadina uygun secenekler', buttonText: '', buttonLink: '', active: true },
  ],
  announcements: [
    { id: '1', title: 'Yeni Sezon Urunleri', text: 'Kis sezonuna ozel urun yelpazemiz hazir. Premium dana ve kuzu cesitlerimiz stoklarimizda.', date: '2026-03-09', badge: 'Yeni', imageUrl: '', active: true, relatedProducts: [] },
    { id: '2', title: 'Hijyen Sertifikamiz Yenilendi', text: 'ISO 22000 Gida Guvenligi sertifikamiz 2026 yili icin guncellenmistir.', date: '2026-03-01', badge: 'Onemli', imageUrl: '', active: true, relatedProducts: [] },
    { id: '3', title: 'Musteri Memnuniyeti %98', text: '2025 yili musteri memnuniyet anketinde %98 basari orani elde ettik.', date: '2026-02-15', badge: 'Basari', imageUrl: '', active: true, relatedProducts: [] },
  ],
  products: [
    { id: '1', name: 'Dana But', description: 'Birinci sinif dana but, gunluk kesim', imageUrl: '', price: 'Fiyat icin arayin', badge: 'Populer', active: true },
    { id: '2', name: 'Kuzu Pirzola', description: 'Taze kuzu pirzola, ozel kesim', imageUrl: '', price: 'Fiyat icin arayin', badge: 'Premium', active: true },
    { id: '3', name: 'Dana Kiyma', description: 'Taze cekilmis dana kiyma, yuksek protein', imageUrl: '', price: 'Fiyat icin arayin', badge: '', active: true },
  ],
  stats: [
    { id: '1', icon: 'award', value: '15+', label: 'Yillik Deneyim', color: 'blue' },
    { id: '2', icon: 'users', value: '2500+', label: 'Mutlu Musteri', color: 'emerald' },
    { id: '3', icon: 'package', value: '120+', label: 'Urun Cesidi', color: 'purple' },
    { id: '4', icon: 'truck', value: '50+', label: 'Gunluk Teslimat', color: 'orange' },
  ],
  companyAbout: 'Isleyen Et, 2010 yilinda kurulmus olup, yillardir et sektorunde kalite ve guveni bir arada sunmaktadir. Modern tesislerimiz ve deneyimli kadromuzla, musterilerimize en taze ve kaliteli urunleri ulastirmayi hedefliyoruz.',
  companyMission: 'Turkiye\'nin en guvenilir et tedarikci markasi olmak icin calisiyoruz.',
  companyVision: 'Gida guvenligi ve musteri memnuniyetini on planda tutarak, sektorun lider firmasi olmaya devam etmek.',
  testimonials: [
    { id: '1', name: 'Ahmet Yilmaz', company: 'Yilmaz Lokantasi', text: 'Isleyen Et ile yillardir calisiyoruz, kaliteden hic odun vermiyorlar.', rating: 5, active: true },
    { id: '2', name: 'Fatma Demir', company: 'Demir Market', text: 'Zamaninda teslimat ve harika urun kalitesi. Kesinlikle tavsiye ederim.', rating: 5, active: true },
  ],
  campaigns: [
    { id: '1', title: 'Kis Kampanyasi', description: 'Secili urunlerde %15 indirim firsati. Stoklar sinirlidir, acele edin!', imageUrl: '', validUntil: '2026-04-01', discount: '%15', active: true },
  ],
  faq: [
    { id: '1', question: 'Siparisimi nasil verebilirim?', answer: 'Telefonla veya dogrudan magazamizi ziyaret ederek siparis verebilirsiniz. Toptan siparisler icin ozel fiyat alinabilir.', active: true },
    { id: '2', question: 'Teslimat yapiliyor mu?', answer: 'Evet, sehir ici ucretsiz teslimat hizmeti sunmaktayiz. Sehir disi teslimatlar icin lutfen bizi arayin.', active: true },
  ],
  socialLinks: [
    { platform: 'instagram', url: '', active: true },
    { platform: 'facebook', url: '', active: true },
    { platform: 'youtube', url: '', active: false },
    { platform: 'twitter', url: '', active: false },
  ],
  footerText: 'Tum haklari saklidir.',
  theme: { primaryColor: 'blue', accentColor: 'cyan', showParticles: true },
};

type TabKey = 'dashboard' | 'hero' | 'haberler' | 'urunler' | 'kampanyalar' | 'firma' | 'referanslar' | 'sss' | 'ayarlar' | 'analytics';

// ─── Content Templates ──────────────────────────────────────────
const ANNOUNCEMENT_TEMPLATES = [
  { title: 'Yeni Urun Lansmani', text: 'Yeni urun yelpazemizi kesfetmek icin bizi ziyaret edin.', badge: 'Yeni' },
  { title: 'Ozel Kampanya', text: 'Sinirli sureli ozel kampanyamizdan yararlanin!', badge: 'Kampanya' },
  { title: 'Sertifika Yenilemesi', text: 'Gida guvenligi sertifikamiz basariyla yenilenmistir.', badge: 'Onemli' },
  { title: 'Bayram Mesaji', text: 'Tum musterilerimizin bayramini kutlariz.', badge: 'Duyuru' },
];

const PRODUCT_TEMPLATES = [
  { name: 'Dana Bonfile', description: 'Premium kesim, en kaliteli parcalar', price: 'Fiyat icin arayin', badge: 'Premium' },
  { name: 'Kuzu Kusbasi', description: 'Taze kuzu, ozel dogranmis', price: 'Fiyat icin arayin', badge: 'Taze' },
  { name: 'Tavuk Gogus', description: 'Antibiyotiksiz, dogal beslenmis', price: 'Fiyat icin arayin', badge: 'Dogal' },
];

const FAQ_TEMPLATES = [
  { question: 'Minimum siparis miktari var mi?', answer: 'Toptan siparisler icin minimum 10 kg siparis gerekliligi bulunmaktadir. Perakende satis icin limit yoktur.' },
  { question: 'Gida guvenligi nasil saglaniyor?', answer: 'ISO 22000 sertifikali tesislerimizde, soguk zincir kirilmadan uretim ve dagitim yapilmaktadir.' },
  { question: 'Odeme yontemleri nelerdir?', answer: 'Nakit, kredi karti, havale/EFT ve veresiye ile odeme kabul edilmektedir.' },
];

// ─── Vitrin Analytics Tab ──────────────────────────────────────
function VitrinAnalyticsTab() {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const analytics = React.useMemo(() => getVitrinAnalytics(), [refreshKey]);
  const popular = React.useMemo(() => getPopularProducts(), [refreshKey]);
  const daily = React.useMemo(() => getDailyStats(7), [refreshKey]);
  const today = React.useMemo(() => getVitrinEventsToday(), [refreshKey]);

  const evLabels: Record<string, { label: string; cls: string }> = {
    page_view: { label: 'Sayfa', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    product_click: { label: 'Ürün Tıklama', cls: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
    product_view: { label: 'Ürün Görüntüleme', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    cart_add: { label: 'Sepete Ekleme', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    quote_request: { label: 'Teklif Talebi', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    news_view: { label: 'Haber', cls: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
    recipe_view: { label: 'Tarif', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    category_filter: { label: 'Kategori', cls: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
    login_attempt: { label: 'Giriş', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  };

  const maxD = Math.max(...daily.map(d => d.views + d.cartAdds + d.quotes), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Sayfa Görüntüleme', value: analytics.summary.totalPageViews, icon: '👁️', color: 'from-blue-600/20 to-blue-800/10', border: 'border-blue-500/20' },
          { label: 'Ürün Tıklama', value: analytics.summary.totalProductViews, icon: '🛍️', color: 'from-purple-600/20 to-purple-800/10', border: 'border-purple-500/20' },
          { label: 'Sepete Ekleme', value: analytics.summary.totalCartAdds, icon: '🛒', color: 'from-orange-600/20 to-orange-800/10', border: 'border-orange-500/20' },
          { label: 'Teklif Talebi', value: analytics.summary.totalQuoteRequests, icon: '📋', color: 'from-emerald-600/20 to-emerald-800/10', border: 'border-emerald-500/20' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`rounded-2xl bg-gradient-to-br ${s.color} border ${s.border} p-4 sm:p-5`}>
            <div className="text-2xl mb-2">{s.icon}</div>
            <p className="text-2xl sm:text-3xl font-black text-white">{s.value}</p>
            <p className="text-[10px] sm:text-xs text-gray-400 font-medium mt-1">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {analytics.summary.lastVisit && (
        <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-400">
          Son ziyaret: <span className="text-white font-semibold">{new Date(analytics.summary.lastVisit).toLocaleString('tr-TR')}</span>
        </div>
      )}

      <div className="bg-[#111] rounded-2xl p-5 sm:p-6 border border-white/5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-white" /></div>
            <div><h3 className="text-sm font-bold text-white">Son 7 Gün</h3><p className="text-[10px] text-gray-500">Günlük etkileşim</p></div>
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-400 transition-colors">Yenile</button>
        </div>
        <div className="space-y-2">
          {daily.map((day, i) => {
            const total = day.views + day.cartAdds + day.quotes;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[10px] text-gray-500 font-mono w-16 shrink-0">{new Date(day.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</span>
                <div className="flex-1 h-6 bg-black/40 rounded-lg overflow-hidden relative">
                  {day.views > 0 && <motion.div initial={{ width: 0 }} animate={{ width: `${(day.views / maxD) * 100}%` }} transition={{ delay: i * 0.05, duration: 0.5 }} className="absolute inset-y-0 left-0 bg-blue-600/60 rounded-l-lg" />}
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white/70 font-medium">{total > 0 ? total : ''}</span>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <span className="text-[9px] text-blue-400">{day.views}g</span>
                  <span className="text-[9px] text-orange-400">{day.cartAdds}s</span>
                  <span className="text-[9px] text-emerald-400">{day.quotes}t</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[9px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-600/60" /> Görüntüleme</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500/40" /> Sepet</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/40" /> Teklif</span>
        </div>
      </div>

      <div className="bg-[#111] rounded-2xl p-5 sm:p-6 border border-white/5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center"><Star className="w-4 h-4 text-white" /></div>
          <div><h3 className="text-sm font-bold text-white">Popüler Ürünler</h3><p className="text-[10px] text-gray-500">En çok ilgi gören ürünler</p></div>
        </div>
        {popular.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">Henüz veri yok</div>
        ) : (
          <div className="space-y-2">
            {popular.slice(0, 10).map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-gray-500">{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-white truncate">{p.name}</span>
                <div className="flex gap-3 shrink-0 text-[10px]">
                  <span className="text-purple-400">{p.views} <span className="text-gray-600">görüntüleme</span></span>
                  <span className="text-orange-400">{p.cartAdds} <span className="text-gray-600">sepet</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#111] rounded-2xl p-5 sm:p-6 border border-white/5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center"><Layers className="w-4 h-4 text-white" /></div>
            <div><h3 className="text-sm font-bold text-white">Bugünkü Etkileşimler</h3><p className="text-[10px] text-gray-500">{today.length} etkinlik</p></div>
          </div>
          <button onClick={() => { if (confirm('Tüm vitrin analitik verilerini silmek istediğinize emin misiniz?')) { clearVitrinAnalytics(); setRefreshKey(k => k + 1); } }}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-[10px] text-red-400 font-medium transition-colors border border-red-500/10">Verileri Temizle</button>
        </div>
        {today.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">Bugün henüz etkileşim yok</div>
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto scrollbar-hide">
            {[...today].reverse().slice(0, 50).map((ev) => {
              const m = evLabels[ev.type] || { label: ev.type, cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
              return (
                <div key={ev.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${m.cls}`}>{m.label}</span>
                  <span className="flex-1 text-[11px] text-gray-400 truncate">{ev.data?.productName || ev.data?.newsTitle || ev.data?.recipeName || ev.data?.category || ev.data?.name || ''}</span>
                  <span className="text-[9px] text-gray-600 font-mono shrink-0">{new Date(ev.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper Components ──────────────────────────────────────────
function Toggle({ value, onChange, size = 'md' }: { value: boolean; onChange: (v: boolean) => void; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-8 h-4' : 'w-10 h-5';
  const dotSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const dotPos = size === 'sm' ? (value ? 'left-4' : 'left-0.5') : (value ? 'left-5' : 'left-0.5');
  return (
    <button onClick={() => onChange(!value)} className={`${sizeClass} rounded-full transition-all relative ${value ? 'bg-emerald-600' : 'bg-muted-foreground/30'}`}>
      <div className={`${dotSize} bg-white rounded-full absolute top-0.5 transition-all ${dotPos}`} />
    </button>
  );
}

function ItemActions({ active, onToggle, onMoveUp, onMoveDown, onDuplicate, onDelete }: {
  active: boolean; onToggle: () => void; onMoveUp?: () => void; onMoveDown?: () => void; onDuplicate?: () => void; onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button onClick={onToggle} className={`p-1.5 rounded-lg transition-all ${active ? 'text-emerald-400 hover:bg-emerald-600/15' : 'text-muted-foreground/50 hover:bg-muted/50'}`} title={active ? 'Gizle' : 'Goster'}>
        {active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>
      {onMoveUp && <button onClick={onMoveUp} className="p-1.5 rounded-lg text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground/80 transition-all" title="Yukari"><ArrowUp className="w-3.5 h-3.5" /></button>}
      {onMoveDown && <button onClick={onMoveDown} className="p-1.5 rounded-lg text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground/80 transition-all" title="Asagi"><ArrowDown className="w-3.5 h-3.5" /></button>}
      {onDuplicate && <button onClick={onDuplicate} className="p-1.5 rounded-lg text-muted-foreground/60 hover:bg-muted/50 hover:text-blue-400 transition-all" title="Kopyala"><Copy className="w-3.5 h-3.5" /></button>}
      <button onClick={onDelete} className="p-1.5 rounded-lg text-red-400/60 hover:bg-red-600/15 hover:text-red-400 transition-all" title="Sil"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function AddButton({ label, onClick, color = 'blue' }: { label: string; onClick: () => void; color?: string }) {
  const cm: Record<string, string> = { blue: 'hover:border-blue-500/40 hover:text-blue-400', cyan: 'hover:border-cyan-500/40 hover:text-cyan-400', purple: 'hover:border-purple-500/40 hover:text-purple-400', red: 'hover:border-red-500/40 hover:text-red-400', amber: 'hover:border-amber-500/40 hover:text-amber-400', orange: 'hover:border-orange-500/40 hover:text-orange-400', emerald: 'hover:border-emerald-500/40 hover:text-emerald-400', pink: 'hover:border-pink-500/40 hover:text-pink-400' };
  return (
    <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={onClick}
      className={`w-full py-3 border border-dashed border-border/50 ${cm[color] || cm.blue} rounded-xl text-sm text-muted-foreground transition-all flex items-center justify-center gap-2`}>
      <Plus className="w-4 h-4" /> {label}
    </motion.button>
  );
}

// ─── File Upload Helper ─────────────────────────────────────────
function FileUploadButton({ onUpload, label = 'Dosyadan Yukle' }: { onUpload: (dataUrl: string) => void; label?: string }) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Lutfen bir gorsel dosyasi secin (JPG, PNG, WebP)');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Dosya boyutu 5MB\'dan kucuk olmalidir');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpload(reader.result);
        toast.success(`Gorsel yuklendi: ${file.name}`);
      }
    };
    reader.onerror = () => toast.error('Dosya okunamadi');
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-muted-foreground hover:text-white hover:border-blue-500/40 transition-all"
      >
        <Upload className="w-4 h-4" />
        <span className="hidden md:inline">{label}</span>
      </button>
    </>
  );
}

// ─── Image Input (URL + Dosya Yukleme) ──────────────────────────
function ImageInputField({ value, onChange, placeholder = 'Gorsel URL (Unsplash vb.)' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [mode, setMode] = React.useState<'url' | 'file'>('url');
  
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Lutfen bir gorsel dosyasi secin (JPG, PNG, WebP)'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Dosya boyutu 5MB\'dan kucuk olmalidir'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') { onChange(reader.result); toast.success(`Gorsel yuklendi: ${file.name}`); } };
    reader.onerror = () => toast.error('Dosya okunamadi');
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const isDataUrl = value?.startsWith('data:');

  return (
    <div className="space-y-2">
      <div className="flex gap-1 mb-1">
        <button type="button" onClick={() => setMode('url')} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${mode === 'url' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-muted-foreground/50 hover:text-muted-foreground border border-transparent'}`}>
          <Link2 className="w-3 h-3" /> URL
        </button>
        <button type="button" onClick={() => setMode('file')} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${mode === 'file' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-muted-foreground/50 hover:text-muted-foreground border border-transparent'}`}>
          <FileImage className="w-3 h-3" /> Dosya
        </button>
        {value && (
          <button type="button" onClick={() => onChange('')} className="ml-auto text-[10px] text-red-400/60 hover:text-red-400 transition-colors">Temizle</button>
        )}
      </div>
      {mode === 'url' ? (
        <input value={isDataUrl ? '' : value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-white placeholder-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all text-sm" placeholder={placeholder} />
      ) : (
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-card border border-dashed border-purple-500/30 rounded-xl text-sm text-purple-400 hover:bg-purple-500/5 hover:border-purple-500/50 transition-all">
            <Upload className="w-4 h-4" />
            {isDataUrl ? 'Dosya Yuklendi - Degistir' : 'Gorsel Dosyasi Sec (JPG, PNG, WebP)'}
          </button>
        </div>
      )}
      {value && (
        <div className="h-16 rounded-lg overflow-hidden bg-card/50 border border-border/30">
          <img src={value} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
    </div>
  );
}

// ─── Content Health Score ────────────────────────────────────────
function ContentHealthScore({ content }: { content: PazarlamaContent }) {
  const checks = useMemo(() => {
    const items: { label: string; ok: boolean; tip: string }[] = [
      { label: 'Hero banner var', ok: content.heroBanners.filter(b => b.active).length > 0, tip: 'En az 1 aktif hero banner ekleyin' },
      { label: 'Banner gorselleri yuklu', ok: content.heroBanners.filter(b => b.active && b.imageUrl).length === content.heroBanners.filter(b => b.active).length, tip: 'Tum bannerlara gorsel URL ekleyin' },
      { label: 'En az 2 haber', ok: content.announcements.filter(a => a.active).length >= 2, tip: 'Guncel haberler eklemeye devam edin' },
      { label: 'Urun vitrini dolu', ok: content.products.filter(p => p.active).length >= 2, tip: 'En az 2 vitrin urunu ekleyin' },
      { label: 'Firma bilgisi yazilmis', ok: content.companyAbout.length > 50, tip: 'Hakkimizda metnini en az 50 karakter yapin' },
      { label: 'Misyon & vizyon', ok: content.companyMission.length > 10 && content.companyVision.length > 10, tip: 'Misyon ve vizyon alanlarini doldurun' },
      { label: 'Musteri referansi var', ok: content.testimonials.filter(t => t.active).length >= 1, tip: 'En az 1 musteri yorumu ekleyin' },
      { label: 'SSS sorulari', ok: content.faq.filter(f => f.active).length >= 2, tip: 'Sik sorulan sorulari ekleyin' },
      { label: 'Sosyal medya linki', ok: content.socialLinks.filter(s => s.active && s.url).length >= 1, tip: 'En az 1 sosyal medya linki ekleyin' },
      { label: 'Istatistik kartlari', ok: content.stats.length >= 3, tip: 'En az 3 istatistik karti olsun' },
    ];
    return items;
  }, [content]);

  const score = Math.round((checks.filter(c => c.ok).length / checks.length) * 100);
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400';
  const ringColor = score >= 80 ? 'stroke-emerald-500' : score >= 50 ? 'stroke-amber-500' : 'stroke-red-500';
  const circumference = 2 * Math.PI * 38;
  const offset = circumference - (score / 100) * circumference;
  const failedChecks = checks.filter(c => !c.ok);

  return (
    <div className="bg-[#111] rounded-3xl p-6 border border-white/5">
      <div className="flex items-start gap-5">
        {/* Score Ring */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="38" fill="none" className="stroke-muted/50" strokeWidth="4" />
            <circle cx="40" cy="40" r="38" fill="none" className={ringColor} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${scoreColor}`}>{score}</span>
            <span className="text-[8px] text-muted-foreground/60 uppercase tracking-wider">Puan</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Heart className={`w-4 h-4 ${scoreColor}`} />
            <h3 className="text-sm font-bold text-white">Icerik Saglik Skoru</h3>
          </div>
          <p className="text-xs text-muted-foreground/60 mb-3">
            {score >= 80 ? 'Harika! Iceriginiz cok iyi durumda.' : score >= 50 ? 'Iyi, ama gelistirilecek alanlar var.' : 'Dikkat! Bircok alan eksik.'}
          </p>

          {failedChecks.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-bold">Oneriler:</p>
              {failedChecks.slice(0, 3).map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="text-muted-foreground/70">{c.tip}</span>
                </div>
              ))}
              {failedChecks.length > 3 && <p className="text-[10px] text-muted-foreground/50">+{failedChecks.length - 3} daha...</p>}
            </div>
          )}
        </div>

        {/* Checklist */}
        <div className="hidden lg:block w-44 flex-shrink-0 space-y-1">
          {checks.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]">
              {c.ok ? <Check className="w-3 h-3 text-emerald-400" /> : <X className="w-3 h-3 text-muted-foreground/30" />}
              <span className={c.ok ? 'text-muted-foreground/70' : 'text-muted-foreground/40'}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Template Picker ─────────────────────────────────────────────
function TemplatePicker<T>({ templates, onSelect, label, color }: {
  templates: T[]; onSelect: (t: T) => void; label: string; color: string;
}) {
  const [open, setOpen] = useState(false);
  const colorMap: Record<string, string> = {
    cyan: 'border-cyan-500/30 bg-cyan-500/5', purple: 'border-purple-500/30 bg-purple-500/5',
    orange: 'border-orange-500/30 bg-orange-500/5', red: 'border-red-500/30 bg-red-500/5',
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-white bg-card/60 hover:bg-muted/50 rounded-lg transition-all border border-border/30">
        <Wand2 className="w-3 h-3" /> Sablon
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -5, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: 0.95 }}
            className={`absolute right-0 top-full mt-2 w-64 p-3 rounded-xl border ${colorMap[color] || 'border-border/30 bg-card/80'} backdrop-blur-xl shadow-2xl z-50`}>
            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-bold mb-2">{label}</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {templates.map((t: any, i) => (
                <button key={i} onClick={() => { onSelect(t); setOpen(false); toast.success('Şablon uygulandı!'); }}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-white/5 transition-all group">
                  <p className="text-xs font-medium text-white group-hover:text-blue-300 transition-colors">{t.title || t.name || t.question}</p>
                  <p className="text-[10px] text-muted-foreground/50 line-clamp-1 mt-0.5">{t.text || t.description || t.answer || ''}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Live Mini Preview ───────────────────────────────────────────
// Yeni giriş sayfası layout'unu yansıtır: sol panel (carousel) + sağ panel (reklam + kartlar)
function LivePreview({ content, companyInfo }: { content: PazarlamaContent; companyInfo: any }) {
  const activeBanners = content.heroBanners.filter(b => b.active);
  const banner0 = activeBanners[0];
  const banner1 = activeBanners[1] ?? banner0;

  return (
    <div className="w-full h-full bg-[#080c14] rounded-xl overflow-hidden border border-white/10 flex">

      {/* Sol panel: carousel */}
      <div className="w-[38%] flex-shrink-0 flex flex-col border-r border-white/5">
        {/* Header */}
        <div className="flex items-center gap-1 px-1.5 py-1 bg-black/50 border-b border-white/5 flex-shrink-0">
          <div className="w-3 h-3 rounded-sm bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-1.5 h-1.5 text-white" />
          </div>
          <span className="text-[5px] font-bold text-white truncate">{companyInfo.name}</span>
        </div>
        {/* Banner */}
        <div className="relative flex-1">
          {banner0?.imageUrl ? (
            <img src={banner0.imageUrl} className="w-full h-full object-cover opacity-70" alt="" />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-blue-900/40 to-[#080c14]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          {banner0 && (
            <div className="absolute bottom-1.5 left-1.5 right-1.5">
              <p className="text-[5px] font-bold text-white leading-tight line-clamp-2">{banner0.title}</p>
            </div>
          )}
        </div>
        {/* Trust bar */}
        <div className="flex items-center gap-1 px-1.5 py-1 bg-black/40 border-t border-white/5 flex-shrink-0">
          <span className="text-[4px] text-white/30">ISO 22000</span>
          <span className="w-px h-1.5 bg-white/10" />
          <span className="text-[4px] text-white/30">15+ Yıl</span>
          <span className="w-px h-1.5 bg-white/10" />
          <span className="text-[4px] text-white/30">Aynı Gün</span>
        </div>
      </div>

      {/* Sağ panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Nav */}
        <div className="flex items-center justify-between px-1.5 py-1 border-b border-white/5 bg-[#080c14]/80 flex-shrink-0">
          <span className="text-[4px] font-bold text-blue-400/70 uppercase tracking-wider">Müşteri Portali</span>
          <div className="px-1 py-0.5 rounded bg-blue-600 text-[4px] text-white font-bold">Giriş</div>
        </div>

        {/* Büyük reklam banner */}
        <div className="relative flex-1 m-1 rounded-lg overflow-hidden min-h-0">
          {banner1?.imageUrl ? (
            <img src={banner1.imageUrl} className="w-full h-full object-cover opacity-60" alt="" />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-blue-900/40 to-[#080c14]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent" />
          {banner1 && (
            <div className="absolute inset-0 flex flex-col justify-center px-2">
              <span className="text-[4px] font-bold text-blue-400 uppercase tracking-wider mb-0.5">Kampanya</span>
              <span className="text-[6px] font-bold text-white leading-tight line-clamp-2">{banner1.title}</span>
              <span className="text-[4px] text-white/50 mt-0.5 line-clamp-1">{banner1.subtitle}</span>
            </div>
          )}
          {/* Dots */}
          <div className="absolute bottom-1.5 right-1.5 flex gap-0.5">
            {activeBanners.slice(0, 3).map((_, j) => (
              <div key={j} className={`rounded-full bg-white ${j === 0 ? 'w-2.5 h-1 opacity-80' : 'w-1 h-1 opacity-30'}`} />
            ))}
          </div>
        </div>

        {/* Özellik kartları */}
        <div className="grid grid-cols-4 gap-0.5 mx-1 mb-1 flex-shrink-0">
          {content.stats.slice(0, 4).map(s => (
            <div key={s.id} className="rounded bg-white/[0.04] border border-white/[0.06] p-1">
              <p className="text-[5px] font-bold text-white leading-tight">{s.value}</p>
              <p className="text-[3.5px] text-white/30 leading-tight line-clamp-1">{s.label}</p>
            </div>
          ))}
          {content.stats.length === 0 && [1, 2, 3, 4].map(i => (
            <div key={i} className="rounded bg-white/[0.04] border border-white/[0.06] p-1 h-5" />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-1.5 pb-1 flex-shrink-0">
          <span className="text-[3.5px] text-white/20">{companyInfo.name} © 2026</span>
          <div className="flex items-center gap-0.5">
            <div className="w-1 h-1 rounded-full bg-emerald-400/60" />
            <span className="text-[3.5px] text-white/20">Güvenli</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stok Import Panel ──────────────────────────────────────────
function StokImportPanel({ onImport, existingProductNames }: { onImport: (items: { name: string; description?: string; category?: string; unit?: string; price?: string; badge?: string }[]) => void; existingProductNames: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [stokSearch, setStokSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const stokData = useMemo(() => {
    const raw = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
    return raw.filter((p: any) => p.name && p.name.trim().length > 0).map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category || 'Diger',
      unit: p.unit || 'KG',
      currentStock: p.currentStock ?? p.current_stock ?? 0,
      sellPrice: p.sellPrice ?? p.sell_price ?? 0,
      alreadyInVitrine: existingProductNames.some(n => n.toLowerCase() === p.name.toLowerCase()),
    }));
  }, [existingProductNames]);

  const filteredStok = useMemo(() => {
    if (!stokSearch.trim()) return stokData;
    const s = stokSearch.toLowerCase();
    return stokData.filter(p => p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s));
  }, [stokData, stokSearch]);

  const toggleId = (id: string) => {
    const ns = new Set(selectedIds);
    if (ns.has(id)) ns.delete(id); else ns.add(id);
    setSelectedIds(ns);
  };

  const handleImport = () => {
    const items = stokData.filter(p => selectedIds.has(p.id)).map(p => ({
      name: p.name,
      description: `${p.category} - Birim: ${p.unit}${p.currentStock > 0 ? ` - Stok: ${p.currentStock}` : ''}`,
      category: p.category,
      unit: p.unit,
      price: p.sellPrice > 0 ? `₺${p.sellPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : 'Fiyat icin arayin',
      badge: p.category,
    }));
    onImport(items);
    setSelectedIds(new Set());
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => setIsOpen(true)}
        className="w-full py-4 border border-dashed border-purple-500/30 hover:border-purple-500/60 rounded-2xl text-sm text-purple-400 hover:text-purple-300 transition-all flex items-center justify-center gap-3 bg-purple-500/5 hover:bg-purple-500/10">
        <Package className="w-5 h-5" />
        <span className="font-bold">Stoktan Urun Aktar</span>
        <span className="text-[10px] text-muted-foreground/50 font-normal">({stokData.length} urun mevcut)</span>
      </motion.button>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      className="bg-[#111] rounded-3xl p-5 sm:p-6 border border-purple-500/20 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center"><Package className="w-5 h-5 text-white" /></div>
          <div>
            <h3 className="text-sm font-bold text-white">Stoktan Urun Aktar</h3>
            <p className="text-[10px] text-muted-foreground/60">Depo stokundaki urunleri vitrine ekleyin</p>
          </div>
        </div>
        <button onClick={() => { setIsOpen(false); setSelectedIds(new Set()); }} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-4 h-4 text-gray-400" /></button>
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={stokSearch} onChange={e => setStokSearch(e.target.value)} placeholder="Urun veya kategori ara..."
          className="w-full pl-10 pr-4 py-2.5 bg-black/50 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:border-purple-500/50 text-sm outline-none" />
      </div>

      {/* Selectable Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
        {filteredStok.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500 text-sm">
            {stokData.length === 0 ? 'Stokta urun bulunamadi. Oncelikle Stok sayfasindan urun ekleyin.' : 'Aramayla eslesen urun yok.'}
          </div>
        ) : (
          filteredStok.map(p => {
            const isSelected = selectedIds.has(p.id);
            return (
              <button key={p.id} type="button" onClick={() => !p.alreadyInVitrine && toggleId(p.id)}
                disabled={p.alreadyInVitrine}
                className={`text-left p-3 rounded-xl border transition-all ${
                  p.alreadyInVitrine ? 'opacity-40 cursor-not-allowed border-border/20 bg-muted/30' :
                  isSelected ? 'border-purple-500/50 bg-purple-500/10' : 'border-border/20 hover:border-purple-500/30 hover:bg-white/[0.02]'
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white truncate">{p.name}</span>
                  {isSelected && <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />}
                  {p.alreadyInVitrine && <span className="text-[8px] text-emerald-400 flex-shrink-0">Vitrinde</span>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                  <span className="px-1.5 py-0.5 rounded bg-card/60 border border-border/20">{p.category}</span>
                  <span>{p.unit}</span>
                  {p.sellPrice > 0 && <span className="text-emerald-400/70">₺{p.sellPrice.toFixed(0)}</span>}
                  <span className={p.currentStock <= 0 ? 'text-red-400/70' : 'text-muted-foreground/40'}>Stok: {p.currentStock}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-xs text-muted-foreground">{selectedIds.size} urun secildi</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-2 text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all">Temizle</button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleImport}
              className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-all shadow-lg shadow-purple-600/20">
              {selectedIds.size} Urunu Vitrine Aktar
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────────
export function PazarlamaPage() {
  const { t } = useLanguage();
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { emit } = useModuleBus();
  
  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canEdit } = getPagePermissions(user, currentEmployee, 'pazarlama');
  const sec = usePageSecurity('pazarlama');

  const [content, setContent] = useState<PazarlamaContent>(DEFAULT_CONTENT);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const saved = getFromStorage<PazarlamaContent>(StorageKey.PAZARLAMA_CONTENT);
    if (saved) setContent({ ...DEFAULT_CONTENT, ...saved });
  }, []);

  const companyInfo = useMemo(() => {
    const settings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
    return {
      name: settings?.companyInfo?.companyName || 'ISLEYEN ET',
      slogan: settings?.companyInfo?.slogan || 'Kurumsal Yonetim Sistemi',
      phone: settings?.companyInfo?.phone || '',
      email: settings?.companyInfo?.email || '',
      address: settings?.companyInfo?.address || '',
    };
  }, []);

  const updateContent = useCallback((updates: Partial<PazarlamaContent>) => {
    setContent(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!canEdit) {
      toast.error('Pazarlama içeriğini kaydetmek için yönetici yetkisi gereklidir.');
      sec.logUnauthorized('pazarlama_edit', 'Kullanıcı pazarlama içeriğini kaydetmeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    setInStorage(StorageKey.PAZARLAMA_CONTENT, content);
    setInStorage(StorageKey.LOGIN_CONTENT, {
      announcements: content.announcements,
      companyHistory: content.companyAbout,
      stats: content.stats.map(s => ({ label: s.label, value: s.value })),
      products: content.products,
      campaigns: content.campaigns,
    });
    setHasChanges(false);
    setLastSaved(new Date().toLocaleTimeString('tr-TR'));
    sec.auditLog('pazarlama_save', 'content', 'Pazarlama içeriği kaydedildi');
    logActivity('custom', 'Pazarlama içeriği kaydedildi', { employeeName: user?.name, page: 'Pazarlama', description: 'Pazarlama paneli içeriği güncellendi ve kaydedildi.' });
    emit('pazarlama:saved', { updatedAt: new Date().toISOString() });
    toast.success('Pazarlama icerigi basariyla kaydedildi!');
  }, [content, canEdit, user?.name, emit, sec]);

  const inputClass = "w-full px-3 py-2.5 bg-card border border-border rounded-xl text-white placeholder-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all text-sm";

  // CRUD Helpers
  const checkEditPerm = (action: string): boolean => {
    if (!canEdit) {
      toast.error('Bu işlem için yönetici yetkisi gereklidir.');
      sec.logUnauthorized(`pazarlama_${action}`, `Pazarlama ${action} yetkisi yok`);
      return false;
    }
    return true;
  };

  const addItem = <T extends { id: string }>(key: keyof PazarlamaContent, newItem: T) => {
    if (!checkEditPerm('add')) return;
    updateContent({ [key]: [...(content[key] as T[]), newItem] } as any);
    sec.auditLog('pazarlama_item_add', newItem.id, String(key));
    logActivity('custom', `Pazarlama öğesi eklendi: ${key}`, { employeeName: user?.name, page: 'Pazarlama' });
  };
  const removeItem = (key: keyof PazarlamaContent, id: string) => {
    if (!checkEditPerm('delete')) return;
    if (!window.confirm('Bu öğeyi silmek istediğinize emin misiniz?')) return;
    updateContent({ [key]: (content[key] as any[]).filter((i: any) => i.id !== id) } as any);
    sec.auditLog('pazarlama_item_delete', id, String(key));
    logActivity('custom', `Pazarlama öğesi silindi: ${key}`, { employeeName: user?.name, page: 'Pazarlama' });
    toast.success('Öğe silindi');
  };
  const updateItem = <T extends { id: string }>(key: keyof PazarlamaContent, id: string, updates: Partial<T>) => {
    if (!canEdit) { toast.error('Düzenleme için yönetici yetkisi gereklidir.'); return; }
    updateContent({ [key]: (content[key] as T[]).map((i: any) => i.id === id ? { ...i, ...updates } : i) } as any);
  };
  const moveItem = (key: keyof PazarlamaContent, id: string, direction: 'up' | 'down') => {
    if (!checkEditPerm('move')) return;
    const arr = [...(content[key] as any[])];
    const idx = arr.findIndex((i: any) => i.id === id);
    if (direction === 'up' && idx > 0) [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
    if (direction === 'down' && idx < arr.length - 1) [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    updateContent({ [key]: arr } as any);
  };
  const duplicateItem = (key: keyof PazarlamaContent, id: string) => {
    if (!checkEditPerm('duplicate')) return;
    const arr = content[key] as any[];
    const item = arr.find((i: any) => i.id === id);
    if (item) {
      const copy = { ...item, id: crypto.randomUUID(), title: (item.title || item.name || item.question || '') + ' (Kopya)' };
      if (copy.name) copy.name = copy.name + ' (Kopya)';
      updateContent({ [key]: [...arr, copy] } as any);
      toast.success('Öğe kopyalandı');
    }
  };

  // Dashboard Stats
  const dashboardStats = useMemo(() => {
    const totalItems = content.heroBanners.length + content.announcements.length + content.products.length +
      content.campaigns.length + content.testimonials.length + content.faq.length;
    const activeItems = content.heroBanners.filter(i => i.active).length +
      content.announcements.filter(i => i.active).length + content.products.filter(i => i.active).length +
      content.campaigns.filter(i => i.active).length + content.testimonials.filter(i => i.active).length +
      content.faq.filter(i => i.active).length;
    const activeSocial = content.socialLinks.filter(l => l.active && l.url).length;
    const expiredCampaigns = content.campaigns.filter(c => c.validUntil && new Date(c.validUntil) < new Date()).length;
    return { totalItems, activeItems, inactiveItems: totalItems - activeItems, activeSocial, expiredCampaigns };
  }, [content]);

  // Tabs
  const tabs: { key: TabKey; label: string; icon: React.ElementType; badge?: number; color: string }[] = [
    { key: 'dashboard', label: 'Genel Bakis', icon: LayoutDashboard, color: 'pink' },
    { key: 'hero', label: 'Carousel', icon: ImageIcon, badge: content.heroBanners.length, color: 'blue' },
    { key: 'haberler', label: 'Haberler', icon: Newspaper, badge: content.announcements.length, color: 'cyan' },
    { key: 'urunler', label: 'Urunler', icon: ShoppingBag, badge: content.products.length, color: 'purple' },
    { key: 'kampanyalar', label: 'Kampanyalar', icon: Gift, badge: content.campaigns.length, color: 'red' },
    { key: 'firma', label: 'Firma', icon: Building2, color: 'emerald' },
    { key: 'referanslar', label: 'Referanslar', icon: Star, badge: content.testimonials.length, color: 'amber' },
    { key: 'sss', label: 'SSS', icon: HelpCircle, badge: content.faq.length, color: 'orange' },
    { key: 'ayarlar', label: 'Ayarlar', icon: Palette, color: 'pink' },
    { key: 'analytics', label: 'Vitrin Analitiği', icon: BarChart3, color: 'cyan' },
  ];

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-28 sm:pb-6 max-w-[1600px] mx-auto">
      {/* ═══════════ HEADER ═══════════ */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-pink-500/10 flex items-center justify-center border border-pink-500/20">
            <Megaphone className="w-7 h-7 text-pink-400" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Pazarlama Yonetimi</h1>
            <p className="text-muted-foreground text-sm mt-0.5 flex items-center gap-2">
              Login sayfasi iceriklerini yonetin
              {lastSaved && (
                <span className="text-[10px] text-emerald-400/60 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Son kayit: {lastSaved}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm rounded-xl transition-all border ${
              showPreview ? 'bg-blue-600/15 text-blue-400 border-blue-500/30' : 'bg-secondary/60 text-foreground/80 border-border/30 hover:bg-accent/60'
            }`}>
            {showPreview ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            <span className="hidden md:inline">Onizleme</span>
          </button>
          <button onClick={() => window.open('/login', '_blank')}
            className="flex items-center gap-2 px-3 py-2.5 bg-secondary/60 hover:bg-accent/60 text-foreground/80 text-sm rounded-xl transition-all border border-border/30">
            <Monitor className="w-4 h-4" />
            <span className="hidden md:inline">Canli</span>
          </button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSave} disabled={!hasChanges}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm rounded-xl transition-all shadow-lg ${
              hasChanges ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/20' : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10'
            }`}>
            <Save className="w-4 h-4" />
            {hasChanges ? 'Kaydet' : 'Kaydedildi'}
          </motion.button>
        </div>
      </motion.div>

      {/* Unsaved Warning */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl overflow-hidden mb-4">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300 flex-1">Kaydedilmemis degisiklikler var.</p>
            <button onClick={handleSave} className="px-3 py-1 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg transition-all">Simdi Kaydet</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ TAB NAVIGATION ═══════════ */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none mb-6">
        {tabs.map(tab => (
          <motion.button key={tab.key} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => { setActiveTab(tab.key); setSearchQuery(''); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? 'bg-pink-600/20 text-pink-400 border border-pink-500/30 shadow-lg shadow-pink-500/10'
                : 'bg-secondary/40 text-muted-foreground hover:bg-accent/50 hover:text-foreground/80 border border-transparent'
            }`}>
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${activeTab === tab.key ? 'bg-pink-500/20 text-pink-300' : 'bg-accent/50 text-muted-foreground/70'}`}>{tab.badge}</span>
            )}
          </motion.button>
        ))}
      </div>

      {/* ═══════════ MAIN CONTENT + PREVIEW ═══════════ */}
      <div className={`flex gap-6 ${showPreview ? '' : ''}`}>
        {/* Main Content Area */}
        <div className={`flex-1 min-w-0 space-y-6 ${showPreview ? 'max-w-[calc(100%-280px)]' : ''}`}>
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">

              {/* ─── DASHBOARD ─────────────────────────────── */}
              {activeTab === 'dashboard' && (
                <>
                  {/* Health Score */}
                  <ContentHealthScore content={content} />

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {[
                      { label: 'Toplam Icerik', value: dashboardStats.totalItems, icon: Layers, color: 'from-pink-600/15 to-pink-600/5 border-pink-500/20 text-pink-400' },
                      { label: 'Aktif', value: dashboardStats.activeItems, icon: Eye, color: 'from-emerald-600/15 to-emerald-600/5 border-emerald-500/20 text-emerald-400' },
                      { label: 'Gizli', value: dashboardStats.inactiveItems, icon: EyeOff, color: 'from-orange-600/15 to-orange-600/5 border-orange-500/20 text-orange-400' },
                      { label: 'Bannerlar', value: content.heroBanners.length, icon: ImageIcon, color: 'from-blue-600/15 to-blue-600/5 border-blue-500/20 text-blue-400' },
                      { label: 'Sosyal Medya', value: dashboardStats.activeSocial, icon: Share2, color: 'from-purple-600/15 to-purple-600/5 border-purple-500/20 text-purple-400' },
                      { label: 'Kampanyalar', value: content.campaigns.length, icon: Gift, color: 'from-red-600/15 to-red-600/5 border-red-500/20 text-red-400' },
                    ].map((s, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${s.color} p-4 hover:scale-[1.02] transition-transform`}>
                        <div className="flex items-center gap-2 mb-1.5"><s.icon className="w-4 h-4" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</span></div>
                        <p className="text-xl font-bold text-white">{s.value}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* Content Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { key: 'hero' as TabKey, title: 'Hero Carousel', icon: ImageIcon, count: content.heroBanners.length, active: content.heroBanners.filter(i => i.active).length, color: 'blue', desc: 'Giris sayfasi buyuk gorsel alani' },
                      { key: 'haberler' as TabKey, title: 'Haberler & Duyurular', icon: Newspaper, count: content.announcements.length, active: content.announcements.filter(i => i.active).length, color: 'cyan', desc: 'Firma haberleri ve duyurulari' },
                      { key: 'urunler' as TabKey, title: 'Urun Vitrini', icon: ShoppingBag, count: content.products.length, active: content.products.filter(i => i.active).length, color: 'purple', desc: 'Vitrin urunleri tanitimi' },
                      { key: 'kampanyalar' as TabKey, title: 'Kampanyalar', icon: Gift, count: content.campaigns.length, active: content.campaigns.filter(i => i.active).length, color: 'red', desc: 'Indirimler ve promosyonlar' },
                      { key: 'referanslar' as TabKey, title: 'Musteri Yorumlari', icon: Star, count: content.testimonials.length, active: content.testimonials.filter(i => i.active).length, color: 'amber', desc: 'Referanslar ve degerlendirmeler' },
                      { key: 'sss' as TabKey, title: 'SSS', icon: HelpCircle, count: content.faq.length, active: content.faq.filter(i => i.active).length, color: 'orange', desc: 'Sik sorulan sorular' },
                    ].map((section, idx) => {
                      const clrMap: Record<string, string> = { blue: 'from-blue-600/15 border-blue-500/15 hover:border-blue-500/30', cyan: 'from-cyan-600/15 border-cyan-500/15 hover:border-cyan-500/30', purple: 'from-purple-600/15 border-purple-500/15 hover:border-purple-500/30', red: 'from-red-600/15 border-red-500/15 hover:border-red-500/30', amber: 'from-amber-600/15 border-amber-500/15 hover:border-amber-500/30', orange: 'from-orange-600/15 border-orange-500/15 hover:border-orange-500/30' };
                      const iclrMap: Record<string, string> = { blue: 'from-blue-600 to-blue-700', cyan: 'from-cyan-600 to-cyan-700', purple: 'from-purple-600 to-purple-700', red: 'from-red-600 to-red-700', amber: 'from-amber-600 to-amber-700', orange: 'from-orange-600 to-orange-700' };
                      return (
                        <motion.button key={section.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                          onClick={() => setActiveTab(section.key)}
                          className={`text-left p-5 rounded-2xl bg-gradient-to-br ${clrMap[section.color]} to-transparent border transition-all group`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iclrMap[section.color]} flex items-center justify-center`}>
                              <section.icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex items-center gap-1.5 text-right">
                              <span className="text-2xl font-bold text-white">{section.count}</span>
                              <div className="flex flex-col text-[9px] leading-tight">
                                <span className="text-emerald-400">{section.active} aktif</span>
                                {section.count - section.active > 0 && <span className="text-muted-foreground/50">{section.count - section.active} gizli</span>}
                              </div>
                            </div>
                          </div>
                          <h3 className="text-sm font-bold text-white mb-0.5">{section.title}</h3>
                          <p className="text-[11px] text-muted-foreground/70">{section.desc}</p>
                          <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground/50 group-hover:text-pink-400/60 transition-colors">
                            <ChevronRight className="w-3 h-3" /> Duzenle
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Quick Stats Preview */}
                  <div className="bg-[#111] rounded-3xl p-6 border border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <BarChart3 className="w-5 h-5 text-emerald-400" />
                        <h2 className="text-sm font-bold text-white">Istatistik Kartlari</h2>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-accent/50 text-foreground/80 rounded-full">{content.stats.length}</span>
                      </div>
                      <button onClick={() => setActiveTab('ayarlar')} className="text-xs text-muted-foreground/70 hover:text-pink-400 transition-colors flex items-center gap-1"><Edit2 className="w-3 h-3" /> Düzenle</button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {content.stats.map(stat => {
                        const cm: Record<string, string> = { blue: 'border-blue-500/20 text-blue-400', emerald: 'border-emerald-500/20 text-emerald-400', purple: 'border-purple-500/20 text-purple-400', orange: 'border-orange-500/20 text-orange-400' };
                        return (
                          <div key={stat.id} className={`p-3 rounded-xl bg-muted/60 border ${cm[stat.color] || 'border-border/30'} text-center`}>
                            <p className="text-xl font-bold text-white">{stat.value}</p>
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{stat.label}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Info */}
                  {/* Giriş Sayfası Eşleme Haritası */}
                  <div className="bg-[#111] rounded-2xl p-5 border border-white/5">
                    <div className="flex items-center gap-2 mb-4">
                      <Monitor className="w-4 h-4 text-blue-400" />
                      <h3 className="text-sm font-bold text-white">Giriş Sayfasına Yansıyan İçerikler</h3>
                      <span className="px-2 py-0.5 text-[9px] font-bold bg-blue-500/15 text-blue-400 rounded-full border border-blue-500/20">Canlı Sync</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        {
                          label: 'Hero Carousel',
                          tab: 'hero' as TabKey,
                          desc: 'Giriş sayfasının sol panelindeki kayan görsel (masaüstü) ve tam ekran reklam (mobil)',
                          count: `${content.heroBanners.filter(b => b.active).length} aktif banner`,
                          color: 'border-blue-500/20 bg-blue-500/[0.05] text-blue-400',
                          icon: <ImageIcon className="w-4 h-4" />,
                          mapped: true,
                        },
                        {
                          label: 'İstatistik Kartları',
                          tab: 'ayarlar' as TabKey,
                          desc: 'Masaüstü sağ paneldeki 4\'lü özellik kartları (Ayarlar › İstatistik Kartları)',
                          count: `${content.stats.length} kart`,
                          color: 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400',
                          icon: <BarChart3 className="w-4 h-4" />,
                          mapped: true,
                        },
                        {
                          label: 'Haberler, Ürünler, Referanslar',
                          tab: 'haberler' as TabKey,
                          desc: 'Şu anda giriş sayfasında gösterilmiyor (kaldırıldı); ileride kullanılabilir.',
                          count: 'Yönetilebilir',
                          color: 'border-white/5 bg-white/[0.02] text-white/30',
                          icon: <Layers className="w-4 h-4" />,
                          mapped: false,
                        },
                      ].map((item, i) => (
                        <motion.button
                          key={i}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setActiveTab(item.tab)}
                          className={`text-left p-4 rounded-xl border transition-all ${item.color}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {item.icon}
                              <span className="text-sm font-semibold text-white">{item.label}</span>
                            </div>
                            {item.mapped && (
                              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                                <Check className="w-3 h-3" /> Aktif Sync
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{item.desc}</p>
                          <p className="text-[10px] text-muted-foreground/40 mt-1.5">{item.count}</p>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-pink-600/5 border border-pink-500/15 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Rocket className="w-5 h-5 text-pink-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-pink-300/80 space-y-1">
                        <p className="font-semibold text-pink-300">Hızlı Başlangıç</p>
                        <p>Yukarıdaki kartlara tıklayarak ilgili bölüme geçin. <strong>Şablon</strong> butonlarıyla hızlı içerik ekleyin. <strong>Önizleme</strong> panelini açarak değişiklikleri anlık görün.</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ─── HERO CAROUSEL ─────────────────────────── */}
              {activeTab === 'hero' && (
                <div className="bg-[#111] rounded-3xl p-8 space-y-6 border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Hero Banner / Carousel</h2>
                        <p className="text-xs text-muted-foreground/70">Giriş sayfası sol panel (masaüstü) + tam ekran reklam (mobil)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                        <Check className="w-3 h-3" /> Giriş Sayfasına Yansıyor
                      </span>
                      <span className="text-xs text-muted-foreground/70">{content.heroBanners.length} banner</span>
                    </div>
                  </div>

                  {content.heroBanners.map((banner, i) => (
                    <motion.div key={banner.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className={`p-4 rounded-xl bg-muted/60 border transition-all ${banner.active ? 'border-blue-500/15' : 'border-border/20 opacity-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-blue-600/15 text-blue-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                          <span className="text-xs font-semibold text-foreground/80">{banner.title || 'Isimsiz Banner'}</span>
                          {!banner.active && <span className="px-1.5 py-0.5 text-[9px] bg-accent/50 text-muted-foreground/70 rounded">GIZLI</span>}
                        </div>
                        <ItemActions active={banner.active} onToggle={() => updateItem<HeroBanner>('heroBanners', banner.id, { active: !banner.active })} onMoveUp={() => moveItem('heroBanners', banner.id, 'up')} onMoveDown={() => moveItem('heroBanners', banner.id, 'down')} onDuplicate={() => duplicateItem('heroBanners', banner.id)} onDelete={() => removeItem('heroBanners', banner.id)} />
                      </div>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <input value={banner.title} onChange={e => updateItem<HeroBanner>('heroBanners', banner.id, { title: e.target.value })} className={inputClass} placeholder="Baslik" />
                          <input value={banner.subtitle} onChange={e => updateItem<HeroBanner>('heroBanners', banner.id, { subtitle: e.target.value })} className={inputClass} placeholder="Alt baslik" />
                        </div>
                        <ImageInputField value={banner.imageUrl} onChange={(v) => updateItem<HeroBanner>('heroBanners', banner.id, { imageUrl: v })} placeholder="Banner gorseli URL veya dosya yukle" />
                      </div>
                    </motion.div>
                  ))}
                  <AddButton label="Yeni Banner Ekle" onClick={() => addItem('heroBanners', { id: crypto.randomUUID(), imageUrl: '', title: '', subtitle: '', buttonText: '', buttonLink: '', active: true })} color="blue" />
                </div>
              )}

              {/* ─── HABERLER ──────────────────────────────── */}
              {activeTab === 'haberler' && (
                <div className="bg-[#111] rounded-3xl p-8 space-y-6 border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-cyan-700 flex items-center justify-center"><Newspaper className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Haberler & Duyurular</h2>
                        <p className="text-xs text-muted-foreground/70">Firma haberleri, duyurular ve basarilar</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TemplatePicker templates={ANNOUNCEMENT_TEMPLATES} label="Haber Sablonlari" color="cyan"
                        onSelect={(t) => addItem('announcements', { id: crypto.randomUUID(), title: t.title, text: t.text, date: new Date().toISOString().split('T')[0], badge: t.badge, imageUrl: '', active: true })} />
                      <span className="text-xs text-muted-foreground/70">{content.announcements.filter(a => a.active).length}/{content.announcements.length}</span>
                    </div>
                  </div>

                  {content.announcements.map((item, i) => (
                    <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className={`p-4 rounded-xl bg-muted/60 border transition-all ${item.active ? 'border-cyan-500/15' : 'border-border/20 opacity-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-cyan-600/15 text-cyan-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                          <span className="text-xs font-semibold text-foreground/80">{item.title || 'Isimsiz Haber'}</span>
                          {item.badge && (
                            <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${item.badge === 'Onemli' ? 'bg-red-500/15 text-red-400' : item.badge === 'Yeni' ? 'bg-blue-500/15 text-blue-400' : item.badge === 'Basari' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-accent/50 text-muted-foreground'}`}>{item.badge}</span>
                          )}
                        </div>
                        <ItemActions active={item.active} onToggle={() => updateItem<Announcement>('announcements', item.id, { active: !item.active })} onMoveUp={() => moveItem('announcements', item.id, 'up')} onMoveDown={() => moveItem('announcements', item.id, 'down')} onDuplicate={() => duplicateItem('announcements', item.id)} onDelete={() => removeItem('announcements', item.id)} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <input value={item.title} onChange={e => updateItem<Announcement>('announcements', item.id, { title: e.target.value })} className={inputClass} placeholder="Baslik" />
                        <select value={item.badge} onChange={e => updateItem<Announcement>('announcements', item.id, { badge: e.target.value })} className={inputClass}>
                          <option value="Yeni">Yeni</option><option value="Onemli">Onemli</option><option value="Basari">Basari</option><option value="Duyuru">Duyuru</option><option value="Kampanya">Kampanya</option><option value="Acil">Acil</option>
                        </select>
                        <input type="date" value={item.date} onChange={e => updateItem<Announcement>('announcements', item.id, { date: e.target.value })} className={inputClass} />
                      </div>
                      <textarea value={item.text} onChange={e => updateItem<Announcement>('announcements', item.id, { text: e.target.value })} rows={2} className={`${inputClass} resize-none`} placeholder="Haber icerik metni..." />
                      <ImageInputField value={item.imageUrl} onChange={(v) => updateItem<Announcement>('announcements', item.id, { imageUrl: v })} placeholder="Haber gorseli (opsiyonel)" />

                      {/* ─ İlgili Ürün Etiketleri ─────────────────────────────────── */}
                      {content.products.filter(p => p.active && p.name).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                            İlgili Ürünler
                            <span className="ml-1.5 text-gray-600 font-normal normal-case">
                              — müşteri bu ürüne tıklayınca bu haber görünür
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {content.products
                              .filter(p => p.active && p.name)
                              .map(p => {
                                const selected = (item.relatedProducts || []).includes(p.name);
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      const current = item.relatedProducts || [];
                                      updateItem<Announcement>('announcements', item.id, {
                                        relatedProducts: selected
                                          ? current.filter(n => n !== p.name)
                                          : [...current, p.name],
                                      });
                                    }}
                                    className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-all ${
                                      selected
                                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                        : 'bg-white/[0.04] text-gray-500 border-white/10 hover:bg-white/[0.08] hover:text-gray-300'
                                    }`}
                                  >
                                    {selected ? '✓ ' : ''}{p.name}
                                  </button>
                                );
                              })}
                          </div>
                          {(item.relatedProducts || []).length > 0 && (
                            <p className="text-[10px] text-cyan-400/70 mt-1.5">
                              {(item.relatedProducts || []).length} ürünle bağlantılı: {(item.relatedProducts || []).join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                      {content.products.filter(p => p.active).length === 0 && (
                        <p className="text-[10px] text-gray-600 mt-2 pl-1">
                          Ürün bağlamak için önce "Ürünler" sekmesinden vitrin ürünleri ekleyin.
                        </p>
                      )}
                    </motion.div>
                  ))}
                  <AddButton label="Yeni Haber Ekle" onClick={() => addItem('announcements', { id: crypto.randomUUID(), title: '', text: '', date: new Date().toISOString().split('T')[0], badge: 'Duyuru', imageUrl: '', active: true, relatedProducts: [] })} color="cyan" />
                </div>
              )}

              {/* ─── URUNLER ───────────────────────────────── */}
              {activeTab === 'urunler' && (
                <div className="space-y-6">
                  {/* Stoktan Urun Aktar */}
                  <StokImportPanel onImport={(items) => {
                    items.forEach(item => {
                      addItem('products', {
                        id: crypto.randomUUID(),
                        name: item.name,
                        description: item.description || `${item.category} - ${item.unit}`,
                        imageUrl: '',
                        price: item.price || 'Fiyat icin arayin',
                        badge: item.badge || item.category || '',
                        active: true,
                      });
                    });
                    toast.success(`${items.length} urun vitrine aktarildi!`);
                  }} existingProductNames={content.products.map(p => p.name)} />

                  <div className="bg-[#111] rounded-3xl p-5 sm:p-8 space-y-6 border border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-white" /></div>
                        <div>
                          <h2 className="text-lg font-bold text-white">Urun Vitrini</h2>
                          <p className="text-xs text-muted-foreground/70">Login sayfasinda gosterilecek vitrin urunleri</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <TemplatePicker templates={PRODUCT_TEMPLATES} label="Urun Sablonlari" color="purple"
                          onSelect={(t) => addItem('products', { id: crypto.randomUUID(), name: t.name, description: t.description, imageUrl: '', price: t.price, badge: t.badge, active: true })} />
                        <span className="text-xs text-muted-foreground/50">{content.products.filter(p => p.active).length}/{content.products.length}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {content.products.map((product, i) => (
                        <motion.div key={product.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                          className={`p-4 rounded-xl bg-muted/60 border transition-all ${product.active ? 'border-purple-500/15' : 'border-border/20 opacity-50'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-white">{product.name || 'Isimsiz Urun'}</span>
                              {product.badge && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-500/15 text-purple-400 rounded">{product.badge}</span>}
                            </div>
                            <ItemActions active={product.active} onToggle={() => updateItem<ProductShowcase>('products', product.id, { active: !product.active })} onDuplicate={() => duplicateItem('products', product.id)} onDelete={() => removeItem('products', product.id)} />
                          </div>
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <input value={product.name} onChange={e => updateItem<ProductShowcase>('products', product.id, { name: e.target.value })} className={inputClass} placeholder="Urun adi" />
                              <input value={product.badge} onChange={e => updateItem<ProductShowcase>('products', product.id, { badge: e.target.value })} className={inputClass} placeholder="Etiket" />
                            </div>
                            <input value={product.price} onChange={e => updateItem<ProductShowcase>('products', product.id, { price: e.target.value })} className={inputClass} placeholder="Fiyat bilgisi" />
                            <textarea value={product.description} onChange={e => updateItem<ProductShowcase>('products', product.id, { description: e.target.value })} rows={1} className={`${inputClass} resize-none`} placeholder="Kisa aciklama" />
                            <ImageInputField value={product.imageUrl} onChange={(v) => updateItem<ProductShowcase>('products', product.id, { imageUrl: v })} placeholder="Urun gorseli URL veya dosya yukle" />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    <AddButton label="Yeni Urun Ekle" onClick={() => addItem('products', { id: crypto.randomUUID(), name: '', description: '', imageUrl: '', price: '', badge: '', active: true })} color="purple" />
                  </div>
                </div>
              )}

              {/* ─── KAMPANYALAR ───────────────────────────── */}
              {activeTab === 'kampanyalar' && (
                <div className="bg-[#111] rounded-3xl p-8 space-y-6 border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center"><Gift className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Kampanyalar & Promosyonlar</h2>
                        <p className="text-xs text-muted-foreground/70">Ozel indirimler, sezon kampanyalari</p>
                      </div>
                    </div>
                    {dashboardStats.expiredCampaigns > 0 && (
                      <span className="px-2.5 py-1 text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {dashboardStats.expiredCampaigns} suresi dolmus</span>
                    )}
                  </div>

                  {content.campaigns.map((campaign, i) => {
                    const isExpired = campaign.validUntil && new Date(campaign.validUntil) < new Date();
                    return (
                      <motion.div key={campaign.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className={`p-4 rounded-xl bg-muted/60 border transition-all ${isExpired ? 'border-red-500/20 bg-red-500/5' : campaign.active ? 'border-red-500/15' : 'border-border/20 opacity-50'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">{campaign.title || 'Isimsiz Kampanya'}</span>
                            {campaign.discount && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/15 text-red-400 rounded">{campaign.discount}</span>}
                            {isExpired && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/25 text-red-300 rounded animate-pulse">SURESI DOLMUS</span>}
                          </div>
                          <ItemActions active={campaign.active} onToggle={() => updateItem<Campaign>('campaigns', campaign.id, { active: !campaign.active })} onDuplicate={() => duplicateItem('campaigns', campaign.id)} onDelete={() => removeItem('campaigns', campaign.id)} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                          <input value={campaign.title} onChange={e => updateItem<Campaign>('campaigns', campaign.id, { title: e.target.value })} className={inputClass} placeholder="Kampanya adi" />
                          <input value={campaign.discount} onChange={e => updateItem<Campaign>('campaigns', campaign.id, { discount: e.target.value })} className={inputClass} placeholder="Indirim (%15, 2 al 1 ode...)" />
                          <input type="date" value={campaign.validUntil} onChange={e => updateItem<Campaign>('campaigns', campaign.id, { validUntil: e.target.value })} className={inputClass} />
                        </div>
                        <textarea value={campaign.description} onChange={e => updateItem<Campaign>('campaigns', campaign.id, { description: e.target.value })} rows={2} className={`${inputClass} resize-none`} placeholder="Kampanya detaylari..." />
                        <ImageInputField value={campaign.imageUrl} onChange={(v) => updateItem<Campaign>('campaigns', campaign.id, { imageUrl: v })} placeholder="Kampanya gorseli (opsiyonel)" />
                      </motion.div>
                    );
                  })}
                  <AddButton label="Yeni Kampanya Ekle" onClick={() => addItem('campaigns', { id: crypto.randomUUID(), title: '', description: '', imageUrl: '', validUntil: '', discount: '', active: true })} color="red" />
                </div>
              )}

              {/* ─── FIRMA HAKKINDA ────────────────────────── */}
              {activeTab === 'firma' && (
                <div className="space-y-6">
                  <div className="bg-[#111] rounded-3xl p-8 space-y-6 border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center"><Building2 className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Firma Hakkinda</h2>
                        <p className="text-xs text-muted-foreground/70">Firma tanitim metinleri</p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-400">{companyInfo.name}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/70">Firma adi ve iletisim bilgileri <strong>Ayarlar &gt; Firma Bilgileri</strong> bolumunden duzenlenir.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-2">Hakkimizda</label>
                      <textarea value={content.companyAbout} onChange={e => updateContent({ companyAbout: e.target.value })} rows={5} className={`${inputClass} resize-none`} placeholder="Firma tanitim metni..." />
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{content.companyAbout.length} karakter</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-2">Misyon</label>
                        <textarea value={content.companyMission} onChange={e => updateContent({ companyMission: e.target.value })} rows={4} className={`${inputClass} resize-none`} placeholder="Misyonumuz..." />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-2">Vizyon</label>
                        <textarea value={content.companyVision} onChange={e => updateContent({ companyVision: e.target.value })} rows={4} className={`${inputClass} resize-none`} placeholder="Vizyonumuz..." />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── REFERANSLAR ───────────────────────────── */}
              {activeTab === 'referanslar' && (
                <div className="bg-[#111] rounded-3xl p-8 space-y-6 border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center"><Star className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Musteri Yorumlari / Referanslar</h2>
                        <p className="text-xs text-muted-foreground/70">Musteri referanslari ve degerlendirmeleri</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400 text-sm">★</span>
                      <span className="text-xs text-muted-foreground">Ort: {content.testimonials.length > 0 ? (content.testimonials.reduce((s, t) => s + t.rating, 0) / content.testimonials.length).toFixed(1) : '0'}</span>
                    </div>
                  </div>

                  {content.testimonials.map((item, i) => (
                    <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className={`p-4 rounded-xl bg-muted/60 border transition-all ${item.active ? 'border-amber-500/15' : 'border-border/20 opacity-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-amber-400 text-xs font-bold">
                            {(item.name || 'M').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-white">{item.name || 'Isimsiz'}</span>
                            {item.company && <span className="text-[10px] text-muted-foreground/70 ml-1.5">{item.company}</span>}
                          </div>
                          <div className="flex ml-2">
                            {[1,2,3,4,5].map(n => (
                              <button key={n} onClick={() => updateItem<Testimonial>('testimonials', item.id, { rating: n })}
                                className={`text-sm ${n <= item.rating ? 'text-amber-400' : 'text-accent'} hover:scale-125 transition-transform`}>★</button>
                            ))}
                          </div>
                        </div>
                        <ItemActions active={item.active} onToggle={() => updateItem<Testimonial>('testimonials', item.id, { active: !item.active })} onDuplicate={() => duplicateItem('testimonials', item.id)} onDelete={() => removeItem('testimonials', item.id)} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <input value={item.name} onChange={e => updateItem<Testimonial>('testimonials', item.id, { name: e.target.value })} className={inputClass} placeholder="Musteri adi" />
                        <input value={item.company} onChange={e => updateItem<Testimonial>('testimonials', item.id, { company: e.target.value })} className={inputClass} placeholder="Firma / Isyeri" />
                      </div>
                      <textarea value={item.text} onChange={e => updateItem<Testimonial>('testimonials', item.id, { text: e.target.value })} rows={2} className={`${inputClass} resize-none`} placeholder="Musteri yorumu..." />
                    </motion.div>
                  ))}
                  <AddButton label="Yeni Yorum Ekle" onClick={() => addItem('testimonials', { id: crypto.randomUUID(), name: '', company: '', text: '', rating: 5, active: true })} color="amber" />
                </div>
              )}

              {/* ─── SSS ───────────────────────────────────── */}
              {activeTab === 'sss' && (
                <div className="bg-[#111] rounded-3xl p-8 space-y-6 border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center"><HelpCircle className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Sik Sorulan Sorular (SSS)</h2>
                        <p className="text-xs text-muted-foreground/70">Musterilerin sik sordugu sorular ve cevaplari</p>
                      </div>
                    </div>
                    <TemplatePicker templates={FAQ_TEMPLATES} label="SSS Sablonlari" color="orange"
                      onSelect={(t) => addItem('faq', { id: crypto.randomUUID(), question: t.question, answer: t.answer, active: true })} />
                  </div>

                  {content.faq.map((item, i) => (
                    <motion.div key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className={`p-4 rounded-xl bg-muted/60 border transition-all ${item.active ? 'border-orange-500/15' : 'border-border/20 opacity-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-orange-600/15 text-orange-400 text-[10px] font-bold flex items-center justify-center">?</span>
                          <span className="text-xs font-semibold text-foreground/80 line-clamp-1">{item.question || 'Yeni Soru'}</span>
                        </div>
                        <ItemActions active={item.active} onToggle={() => updateItem<FAQItem>('faq', item.id, { active: !item.active })} onMoveUp={() => moveItem('faq', item.id, 'up')} onMoveDown={() => moveItem('faq', item.id, 'down')} onDelete={() => removeItem('faq', item.id)} />
                      </div>
                      <div className="space-y-2">
                        <input value={item.question} onChange={e => updateItem<FAQItem>('faq', item.id, { question: e.target.value })} className={inputClass} placeholder="Soru" />
                        <textarea value={item.answer} onChange={e => updateItem<FAQItem>('faq', item.id, { answer: e.target.value })} rows={2} className={`${inputClass} resize-none`} placeholder="Cevap..." />
                      </div>
                    </motion.div>
                  ))}
                  <AddButton label="Yeni Soru Ekle" onClick={() => addItem('faq', { id: crypto.randomUUID(), question: '', answer: '', active: true })} color="orange" />
                </div>
              )}

              {/* ─── AYARLAR ───────────────────────────────── */}
              {activeTab === 'ayarlar' && (
                <div className="space-y-6">
                  {/* İstatistik Kartları */}
                  <div className="bg-[#111] rounded-3xl p-8 space-y-6 border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Istatistik Kartlari</h2>
                        <p className="text-xs text-muted-foreground/70">Login sayfasinda ustte gorunen rakamsal bilgiler</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {content.stats.map((stat, i) => (
                        <motion.div key={stat.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                          className="p-3 rounded-xl bg-muted/60 border border-border/30">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase">Kart #{i + 1}</span>
                            <button onClick={() => removeItem('stats', stat.id)} className="p-1 text-red-400/60 hover:bg-red-600/15 hover:text-red-400 rounded-lg transition-all"><Trash2 className="w-3 h-3" /></button>
                          </div>
                          <div className="flex gap-2">
                            <input value={stat.value} onChange={e => updateItem<StatCard>('stats', stat.id, { value: e.target.value })} className={`${inputClass} w-20`} placeholder="15+" />
                            <input value={stat.label} onChange={e => updateItem<StatCard>('stats', stat.id, { label: e.target.value })} className={`${inputClass} flex-1`} placeholder="Etiket" />
                            <select value={stat.color} onChange={e => updateItem<StatCard>('stats', stat.id, { color: e.target.value })} className={`${inputClass} w-28`}>
                              <option value="blue">Mavi</option><option value="emerald">Yesil</option><option value="purple">Mor</option><option value="orange">Turuncu</option><option value="cyan">Camgobegi</option><option value="red">Kirmizi</option>
                            </select>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    <AddButton label="Yeni Kart Ekle" onClick={() => addItem('stats', { id: crypto.randomUUID(), icon: 'star', value: '', label: '', color: 'blue' })} color="emerald" />
                  </div>

                  {/* Sosyal Medya */}
                  <div className="bg-[#111] rounded-3xl p-8 space-y-6 border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-600 to-pink-700 flex items-center justify-center"><Share2 className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Sosyal Medya Linkleri</h2>
                        <p className="text-xs text-muted-foreground/70">Bos birakirsaniz gosterilmez</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {content.socialLinks.map((link, i) => {
                        const pIcons: Record<string, React.ElementType> = { instagram: Instagram, facebook: Facebook, youtube: Youtube, twitter: Twitter, linkedin: Linkedin };
                        const PIcon = pIcons[link.platform] || Globe;
                        const pColors: Record<string, string> = { instagram: 'from-pink-500/20 to-purple-500/20 border-pink-500/20', facebook: 'from-blue-500/20 to-blue-600/20 border-blue-500/20', youtube: 'from-red-500/20 to-red-600/20 border-red-500/20', twitter: 'from-sky-500/20 to-sky-600/20 border-sky-500/20', linkedin: 'from-blue-600/20 to-blue-700/20 border-blue-600/20' };
                        return (
                          <div key={link.platform} className={`flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${pColors[link.platform] || 'from-secondary/40 border-border/30'} border`}>
                            <PIcon className="w-5 h-5 text-white/70 flex-shrink-0" />
                            <span className="text-xs text-muted-foreground capitalize w-20 flex-shrink-0">{link.platform}</span>
                            <input value={link.url} onChange={e => { const u = [...content.socialLinks]; u[i] = { ...u[i], url: e.target.value }; updateContent({ socialLinks: u }); }}
                              className={`${inputClass} flex-1`} placeholder={`https://${link.platform}.com/...`} />
                            <Toggle value={link.active} size="sm" onChange={(v) => { const u = [...content.socialLinks]; u[i] = { ...u[i], active: v }; updateContent({ socialLinks: u }); }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer & Tema */}
                  <div className="bg-[#111] rounded-3xl p-8 space-y-6 border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center"><Palette className="w-5 h-5 text-white" /></div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Footer & Tema Ayarlari</h2>
                        <p className="text-xs text-muted-foreground/70">Genel gorunum ayarlari</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-2">Footer Metni</label>
                      <input value={content.footerText} onChange={e => updateContent({ footerText: e.target.value })} className={inputClass} placeholder="Tum haklari saklidir." />
                    </div>

                    <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/60 border border-border/30">
                      <Toggle value={content.theme.showParticles} onChange={(v) => updateContent({ theme: { ...content.theme, showParticles: v } })} />
                      <div>
                        <p className="text-sm font-medium text-white">Parcacik Animasyonu</p>
                        <p className="text-[10px] text-muted-foreground/70">Login sayfasinda yuzen parcacik efekti</p>
                      </div>
                      {content.theme.showParticles && <Sparkles className="w-4 h-4 text-blue-400 animate-pulse ml-auto" />}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── VİTRİN ANALİTİĞİ ───────────────────────────────── */}
              {activeTab === 'analytics' && (
                <VitrinAnalyticsTab />
              )}

            </motion.div>
          </AnimatePresence>
        </div>

        {/* ═══════════ LIVE PREVIEW PANEL ═══════════ */}
        <AnimatePresence>
          {showPreview && (
            <motion.div
              initial={{ opacity: 0, x: 20, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 260 }}
              exit={{ opacity: 0, x: 20, width: 0 }}
              className="flex-shrink-0 hidden lg:block"
            >
              <div className="sticky top-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-bold">Canli Onizleme</span>
                  </div>
                  <button onClick={() => window.open('/login', '_blank')} className="p-1 text-muted-foreground/70 hover:text-blue-400 transition-colors" title="Tam ekran">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="h-[500px] rounded-xl overflow-hidden shadow-2xl shadow-black/30">
                  <LivePreview content={content} companyInfo={companyInfo} />
                </div>

                <div className="p-3 rounded-xl bg-muted/60 border border-border/30">
                  <p className="text-[9px] text-muted-foreground/50 leading-relaxed">
                    Bu panel, login sayfanizin miniatur onizlemesini gosterir. <strong>"Kaydet"</strong> butonuna bastiginizda degisiklikler canli sayfada da gorunur.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
