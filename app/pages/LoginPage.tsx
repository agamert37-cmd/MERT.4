import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import {
  Lock, User, AlertCircle, Sparkles, X, Shield, Clock,
  ChefHat, Percent, Newspaper, MapPin, Phone,
  ChevronRight, UtensilsCrossed, Info, ArrowRight,
  ShoppingBag, Tag, Star, Weight, Flame, Eye, EyeOff,
  Award, Truck, Package, Search, Beef, Heart,
  Fingerprint, KeyRound, LogIn, ShieldCheck, Loader2,
  FileText, Minus, Plus, Send, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { getFromStorage, StorageKey } from '../utils/storage';
import { logActivity } from '../utils/activityLogger';
import { useLanguage } from '../contexts/LanguageContext';
import { trackVitrinEvent } from '../utils/vitrinAnalytics';

// ─── Cart Item type ──────────────────────────────────────────────
interface CartItem {
  product: CatalogProduct;
  quantity: number;
}

// ─── Default Banners ──────────────────────────────────────────────
const DEFAULT_BANNERS = [
  {
    id: '1',
    imageUrl: 'https://images.unsplash.com/photo-1607083206968-13611e3d76db?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaXNjb3VudCUyMHNhbGV8ZW58MXx8fHwxNzczNTI2NzQzfDA&ixlib=rb-4.1.0&q=80&w=1080',
    title: 'Nakit Ödemelerde Dev İndirim!',
    subtitle: 'Tüm perakende ve toptan alımlarda nakit ödemeye özel anında %10 indirim fırsatı.',
  },
  {
    id: '2',
    imageUrl: 'https://images.unsplash.com/photo-1666013942642-b7b54ecafd7d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyYXclMjBzdGVha3xlbnwxfHx8fDE3NzM1MjY3NDN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    title: 'Premium Kalite Et Ürünleri',
    subtitle: 'En yüksek hijyen standartlarında, taptaze ve güvenilir üretim.',
  },
];

// ─── Çorba Tarifleri ──────────────────────────────────────────────
const SOUP_RECIPES = [
  {
    id: '1',
    name: 'Şifa Kaynağı Kelle Paça',
    time: '4 Saat',
    difficulty: 'Zor',
    image: 'https://images.unsplash.com/photo-1701109876066-7fc0c08da447?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb3VwJTIwYm93bHxlbnwxfHx8fDE3NzM1MjY3NDJ8MA&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Özenle temizlenmiş malzemelerle hazırlanan, bağışıklık güçlendirici geleneksel lezzet.',
    tips: 'Kısık ateşte uzun süre kaynatmak kemik suyunun kolajen yapısını korur.'
  },
  {
    id: '2',
    name: 'Terbiyeli İşkembe Çorbası',
    time: '3 Saat',
    difficulty: 'Orta',
    image: 'https://images.unsplash.com/photo-1763048443535-1243379234e2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cmlwZSUyMHNvdXAlMjB0cmFkaXRpb25hbHxlbnwxfHx8fDE3NzM1MjY3NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Sarımsak ve sirke ile lezzetlenen, bol limonlu vazgeçilmez kış çorbası.',
    tips: 'Terbiyesini eklerken çorbanın suyundan alıp ılıştırmayı unutmayın.'
  },
  {
    id: '3',
    name: 'Süzme Mercimek',
    time: '45 Dk',
    difficulty: 'Kolay',
    image: 'https://images.unsplash.com/photo-1552298013-de2af4b94854?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsZW50aWwlMjBzb3VwfGVufDF8fHx8MTc3MzUyNjc1Mnww&ixlib=rb-4.1.0&q=80&w=1080',
    description: 'Et suyuyla zenginleştirilmiş, lokanta usulü pürüzsüz süzme mercimek.',
    tips: 'Üzerine tereyağlı toz biber ve nane yakarak servis edebilirsiniz.'
  }
];

// ─── Güncel Haberler ──────────────────────────────────────────────
const NEWS_ITEMS = [
  {
    id: '1',
    title: 'Yeni Şubemiz Açıldı!',
    date: '15 Mart 2026',
    category: 'Duyuru',
    desc: 'Bölgenin en büyük et işleme tesisini ve yeni perakende satış noktamızı hizmetinize sunduk.',
    fullContent: 'Bölgenin en büyük et işleme tesisini ve yeni perakende satış noktamızı hizmetinize sunduk. Yeni şubemiz, 2000 metrekarelik modern tesisiyle hijyen standartlarının en üst seviyesinde hizmet vermektedir. Günlük 5 ton et işleme kapasitesine sahip tesisimizde, soğuk zincir hiçbir aşamada kırılmadan ürünler müşterilerimize ulaştırılmaktadır. Perakende satış noktamızda ise taze kıyma, kuşbaşı, biftek, pirzola ve özel marine edilmiş ürünlerimizi bulabilirsiniz. Açılışa özel ilk hafta tüm ürünlerde %15 indirim fırsatını kaçırmayın!',
    image: 'https://images.unsplash.com/photo-1512149519538-136d1b8c574a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXN0YXVyYW50JTIwa2l0Y2hlbiUyMGNvb2tpbmclMjBjaGVmfGVufDF8fHx8MTc3MzUyNjczOHww&ixlib=rb-4.1.0&q=80&w=1080',
  },
  {
    id: '2',
    title: 'Toptan Alımlarda Yeni Dönem',
    date: '10 Mart 2026',
    category: 'Kampanya',
    desc: 'Restoran ve oteller için özel frigofirik araçlarımızla aynı gün teslimat garantisi başladı.',
    fullContent: 'Restoran ve oteller için özel frigofirik araçlarımızla aynı gün teslimat garantisi başladı. Artık sabah saat 10:00\'a kadar verilen tüm toptan siparişler, aynı gün içinde frigofirik araçlarımızla kapınıza teslim edilmektedir. Minimum sipariş tutarı 5.000 TL ve üzeri olan siparişlerde kargo ücretsizdir. Düzenli müşterilerimize özel haftalık ve aylık ödeme planları da sunulmaktadır. Toptan alımlarınızda %8\'e varan indirimlerden yararlanmak için hemen müşteri temsilcinizle iletişime geçin. Ayrıca yeni dönemde HACCP sertifikalı üretim hattımızla uluslararası kalite standartlarında hizmet vermeye devam ediyoruz.',
    image: 'https://images.unsplash.com/photo-1666013942642-b7b54ecafd7d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyYXclMjBzdGVha3xlbnwxfHx8fDE3NzM1MjY3NDN8MA&ixlib=rb-4.1.0&q=80&w=1080',
  },
  {
    id: '3',
    title: 'Hijyen Sertifikamız Yenilendi',
    date: '5 Mart 2026',
    category: 'Kalite',
    desc: 'ISO 22000 ve HACCP belgelerimiz uluslararası denetim sonucunda başarıyla yenilendi.',
    fullContent: 'ISO 22000 ve HACCP belgelerimiz uluslararası denetim sonucunda başarıyla yenilendi. Bağımsız denetim kuruluşu tarafından yapılan kapsamlı inceleme sonucunda tesisimiz en yüksek puanla sertifikasını almaya hak kazandı. Üretim süreçlerimiz, depolama koşullarımız ve dağıtım ağımız titizlikle değerlendirilmiştir. Müşterilerimize her zaman en güvenilir ve en kaliteli ürünleri sunmak temel prensiplerimizdendir.',
    image: 'https://images.unsplash.com/photo-1512149519538-136d1b8c574a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZXN0YXVyYW50JTIwa2l0Y2hlbiUyMGNvb2tpbmclMjBjaGVmfGVufDF8fHx8MTc3MzUyNjczOHww&ixlib=rb-4.1.0&q=80&w=1080',
  }
];

// ─── Ürün Kataloğu ──────────────────────────────────────────────
type ProductCategory = 'all' | 'dana' | 'kuzu' | 'tavuk' | 'islenmiş';

const CATEGORY_TABS: { key: ProductCategory; label: string; emoji: string; color: string }[] = [
  { key: 'all', label: 'Tümü', emoji: '🥩', color: 'blue' },
  { key: 'dana', label: 'Dana', emoji: '🐂', color: 'red' },
  { key: 'kuzu', label: 'Kuzu', emoji: '🐑', color: 'orange' },
  { key: 'tavuk', label: 'Tavuk', emoji: '🐔', color: 'amber' },
  { key: 'islenmiş', label: 'İşlenmiş', emoji: '🌭', color: 'purple' },
];

interface CatalogProduct {
  id: string;
  name: string;
  category: ProductCategory;
  description: string;
  longDescription: string;
  image: string;
  badge: string;
  badgeColor: string;
  avgPrice: number;
  priceUnit: string;
  priceRange: { min: number; max: number };
  origin: string;
  cutType: string;
  protein: number;
  fat: number;
  calories: number;
  tips: string;
  popular: boolean;
  inStock: boolean;
}

const DEFAULT_CATALOG: CatalogProduct[] = [
  {
    id: 'p1', name: 'Dana Bonfile', category: 'dana',
    description: 'Premium kesim, en kaliteli parçalar. Yumuşak dokusu ve eşsiz lezzetiyle sofralarınızın yıldızı.',
    longDescription: 'Dana bonfile, hayvanın en az çalışan kaslarından elde edilen, son derece yumuşak ve narin bir et kesimi türüdür. Düşük yağ oranı ve yüksek protein içeriği ile sağlıklı beslenme tercih edenler için ideal bir seçenektir. Izgarada, tavada veya fırında mükemmel sonuçlar verir.',
    image: 'https://images.unsplash.com/photo-1772285466459-072608a170ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyYXclMjBiZWVmJTIwc3RlYWslMjBwcmVtaXVtJTIwbWVhdHxlbnwxfHx8fDE3NzM2NzEwMjR8MA&ixlib=rb-4.1.0&q=80&w=1080',
    badge: 'Premium', badgeColor: 'amber',
    avgPrice: 850, priceUnit: 'kg', priceRange: { min: 780, max: 920 },
    origin: 'Yerli Dana', cutType: 'Sırt Fileto',
    protein: 26, fat: 6, calories: 158, popular: true, inStock: true,
    tips: 'Pişirmeden 30 dk önce buzdolabından çıkarın. Tuz serpmek yerine pişirdikten sonra tuzlayın.',
  },
  {
    id: 'p2', name: 'Kuzu Pirzola', category: 'kuzu',
    description: 'Taze kuzu pirzola, özel kesim. Mangalda ve ızgarada enfes lezzet.',
    longDescription: 'Kuzu pirzola, kuzu etinin en değerli parçalarından biridir. Kaburga kemiğine yapışık olan bu kesim, doğal yağ dokusu sayesinde pişirildiğinde son derece sulu ve lezzetli olur. Özellikle mangal ve ızgarada tercih edilir.',
    image: 'https://images.unsplash.com/photo-1708974140638-8554bc01690d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsYW1iJTIwY2hvcHMlMjBtZWF0JTIwY3V0c3xlbnwxfHx8fDE3NzM2NzEwMjV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    badge: 'Favori', badgeColor: 'orange',
    avgPrice: 720, priceUnit: 'kg', priceRange: { min: 650, max: 790 },
    origin: 'Yerli Kuzu', cutType: 'Kaburga Pirzola',
    protein: 25, fat: 14, calories: 230, popular: true, inStock: true,
    tips: 'Marine etmek için zeytinyağı, kekik, biberiye ve sarımsak kullanın.',
  },
  {
    id: 'p3', name: 'Dana Kıyma', category: 'dana',
    description: 'Taze çekilmiş dana kıyma, yüksek protein. Köfte ve lahmacun için ideal.',
    longDescription: 'Günlük olarak taze çekilen dana kıymamız, but ve kol karışımından elde edilmektedir. Yüksek protein oranı ve dengeli yağ içeriği ile köfte, lahmacun, börek ve birçok yemek için mükemmel bir tercihtir.',
    image: 'https://images.unsplash.com/photo-1700777279865-fbb065328a25?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncm91bmQlMjBiZWVmJTIwbWluY2VkJTIwbWVhdHxlbnwxfHx8fDE3NzM2Mjg0MTB8MA&ixlib=rb-4.1.0&q=80&w=1080',
    badge: 'Popüler', badgeColor: 'green',
    avgPrice: 420, priceUnit: 'kg', priceRange: { min: 380, max: 460 },
    origin: 'Yerli Dana', cutType: 'But-Kol Karışım',
    protein: 20, fat: 15, calories: 215, popular: true, inStock: true,
    tips: 'Köfte için %80 yağsız tercih edin. Yoğurmadan önce soğanı iyice sıkın.',
  },
  {
    id: 'p4', name: 'Dana Biftek', category: 'dana',
    description: 'Kalın kesim biftek, yüksek marbling. Steakhouse kalitesinde.',
    longDescription: 'Dana biftek, kontr fileto bölgesinden elde edilen, yoğun et aromasına sahip premium bir kesimdir. Yüksek marbling oranı sayesinde pişirildiğinde son derece sulu ve lezzetli olur.',
    image: 'https://images.unsplash.com/photo-1522579431750-7de6093e14d7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiZWVmJTIwdGVuZGVybG9pbiUyMGZpbGV0JTIwcmF3fGVufDF8fHx8MTc3MzY3MTAyNnww&ixlib=rb-4.1.0&q=80&w=1080',
    badge: 'Steakhouse', badgeColor: 'red',
    avgPrice: 680, priceUnit: 'kg', priceRange: { min: 620, max: 740 },
    origin: 'Yerli Dana', cutType: 'Kontr Fileto',
    protein: 24, fat: 10, calories: 190, popular: false, inStock: true,
    tips: 'Tava çok kızdırılmalı. Her yüzü 3-4 dk pişirin, sonra 5 dk dinlendirin.',
  },
  {
    id: 'p5', name: 'Dana Kaburga', category: 'dana',
    description: 'Kemikli dana kaburga, uzun pişirme için ideal. Güveç ve fırın yemekleri.',
    longDescription: 'Dana kaburga, kemikli yapısı sayesinde uzun pişirme yöntemlerinde müthiş bir lezzet sunar. Güveç, fırın yemekleri ve slow-cook tarifleri için en ideal kesimdir.',
    image: 'https://images.unsplash.com/photo-1690983330548-e34b52aa8cb2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiZWVmJTIwcmlicyUyMHJhdyUyMGJ1dGNoZXJ8ZW58MXx8fHwxNzczNjcxMDI2fDA&ixlib=rb-4.1.0&q=80&w=1080',
    badge: 'Güveçlik', badgeColor: 'emerald',
    avgPrice: 320, priceUnit: 'kg', priceRange: { min: 280, max: 360 },
    origin: 'Yerli Dana', cutType: 'Kemikli Kaburga',
    protein: 18, fat: 18, calories: 240, popular: false, inStock: true,
    tips: 'Düşük ateşte en az 2-3 saat pişirin. Sebzelerle birlikte güveç yapın.',
  },
  {
    id: 'p6', name: 'Tavuk Göğüs', category: 'tavuk',
    description: 'Antibiyotiksiz, doğal beslenmiş tavuk göğsü. Sağlıklı beslenme için.',
    longDescription: 'Doğal yem ile beslenen, antibiyotiksiz tavuklardan elde edilen göğüs filetosu, düşük yağ ve yüksek protein oranı ile fitness ve diyet yapanların vazgeçilmezidir.',
    image: 'https://images.unsplash.com/photo-1759493321741-883fbf9f433c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGlja2VuJTIwYnJlYXN0JTIwcmF3JTIwcG91bHRyeXxlbnwxfHx8fDE3NzM2NzEwMjZ8MA&ixlib=rb-4.1.0&q=80&w=1080',
    badge: 'Doğal', badgeColor: 'lime',
    avgPrice: 195, priceUnit: 'kg', priceRange: { min: 175, max: 215 },
    origin: 'Yerli Tavuk', cutType: 'Göğüs Fileto',
    protein: 31, fat: 3.6, calories: 165, popular: true, inStock: true,
    tips: 'Kurumaması için pişirirken sık sık yağlayın. Marine ederek daha lezzetli hale getirin.',
  },
  {
    id: 'p7', name: 'Sucuk', category: 'islenmiş',
    description: 'Geleneksel usul, %100 dana eti ile üretilmiş leziz sucuk.',
    longDescription: 'Geleneksel tariflerle, %100 dana etinden üretilen sucuğumuz, özel baharat karışımımızla hazırlanmaktadır. Doğal bağırsakta olgunlaştırılır. Katkı maddesi içermez.',
    image: 'https://images.unsplash.com/photo-1629316791889-1ca8eeaa9fa3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0dXJraXNoJTIwc2F1c2FnZSUyMHN1Y3VrJTIwY3VyZWQlMjBtZWF0fGVufDF8fHx8MTc3MzY3MTAyN3ww&ixlib=rb-4.1.0&q=80&w=1080',
    badge: 'El Yapımı', badgeColor: 'rose',
    avgPrice: 380, priceUnit: 'kg', priceRange: { min: 340, max: 420 },
    origin: '%100 Dana', cutType: 'Kangal Sucuk',
    protein: 22, fat: 28, calories: 340, popular: true, inStock: true,
    tips: 'Yağsız tavada ince dilimleyerek pişirin. Yumurta ile servis edin.',
  },
  {
    id: 'p8', name: 'Dana Kuşbaşı', category: 'dana',
    description: 'But parçasından özenle doğranmış, sote ve kavurma için ideal.',
    longDescription: 'Dana but parçasından özenle doğranmış kuşbaşı etlerimiz, sote, kavurma, güveç ve kebap yapımı için idealdir. Her parça eşit boyutta kesilir ve sinir-yağ temizliği titizlikle yapılır.',
    image: 'https://images.unsplash.com/photo-1768962286432-cf190fecb2e2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx2ZWFsJTIwbWVhdCUyMGN1dHMlMjBidXRjaGVyJTIwc2hvcHxlbnwxfHx8fDE3NzM2NzEwMjd8MA&ixlib=rb-4.1.0&q=80&w=1080',
    badge: 'Taze', badgeColor: 'cyan',
    avgPrice: 460, priceUnit: 'kg', priceRange: { min: 420, max: 500 },
    origin: 'Yerli Dana', cutType: 'But Kuşbaşı',
    protein: 22, fat: 8, calories: 165, popular: false, inStock: true,
    tips: 'Soğan ve biberleriyle yüksek ateşte hızlıca kavurun. Fazla karıştırmayın.',
  },
];

// Badge color mapping
const BADGE_COLORS: Record<string, string> = {
  amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  red: 'bg-red-500/20 text-red-400 border-red-500/30',
  emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  lime: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  rose: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

// ─── Floating Particles ──────────────────────────────────────────
function FloatingParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 15 + 10,
      delay: Math.random() * 5,
    })),
  []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-blue-400/20"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{ y: [0, -60, 0], opacity: [0, 0.6, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── Mobile Bottom Sheet Login ───────────────────────────────────
function MobileBottomSheet({ 
  show, onClose, children 
}: { 
  show: boolean; onClose: () => void; children: React.ReactNode 
}) {
  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] sm:hidden"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 180, damping: 26 }}
            className="fixed inset-x-0 bottom-0 z-[100] flex flex-col bg-[#111] border-t border-white/10 rounded-t-3xl shadow-2xl max-h-[92vh] overflow-hidden sm:hidden"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Hero Carousel ───────────────────────────────────────────────
function HeroCarousel({ banners }: { banners: any[] }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setCurrent(p => (p + 1) % banners.length), 6000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl lg:rounded-none shadow-2xl">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0"
        >
          <img src={banners[current]?.imageUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-background/20" />
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 lg:p-12 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={`text-${current}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span className="inline-block px-2.5 py-0.5 sm:px-3 sm:py-1 bg-blue-600/80 text-white text-[10px] sm:text-xs font-bold rounded-lg mb-2 sm:mb-3 backdrop-blur-md border border-blue-500/50">
              ÖNE ÇIKAN
            </span>
            <h2 className="text-xl sm:text-3xl lg:text-5xl font-extrabold text-white mb-1.5 sm:mb-3 leading-tight drop-shadow-lg">
              {banners[current]?.title}
            </h2>
            <p className="text-white/80 text-sm sm:text-base lg:text-lg max-w-lg font-medium drop-shadow-md line-clamp-2 sm:line-clamp-none">
              {banners[current]?.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {banners.length > 1 && (
          <div className="flex items-center gap-2 mt-4 sm:mt-8">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`transition-all duration-300 rounded-full ${i === current ? 'w-8 sm:w-12 h-2 sm:h-2.5 bg-blue-500' : 'w-2 sm:w-2.5 h-2 sm:h-2.5 bg-white/30 hover:bg-white/50'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────
export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminTab, setAdminTab] = useState<'admin' | 'user'>('user');
  const [activeRecipe, setActiveRecipe] = useState(0);

  // News detail state
  const [selectedNews, setSelectedNews] = useState<typeof NEWS_ITEMS[0] | null>(null);
  const [showAllNews, setShowAllNews] = useState(false);

  // Product catalog state
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('all');
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Cart & quote states
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ name: '', phone: '', email: '', note: '' });
  const [quoteSent, setQuoteSent] = useState(false);

  const addToCart = (product: CatalogProduct, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { product, quantity: 1 }];
    });
    trackVitrinEvent('cart_add', { productName: product.name, productId: product.id, price: product.avgPrice });
    toast.success(`${product.name} sepete eklendi`);
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(c => c.product.id !== productId));
  };

  const updateCartQty = (productId: string, qty: number) => {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: qty } : c));
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.product.avgPrice * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const handleQuoteSubmit = () => {
    if (!quoteForm.name.trim() || !quoteForm.phone.trim()) {
      toast.error('Lütfen ad ve telefon alanlarını doldurun.');
      return;
    }
    trackVitrinEvent('quote_request', { name: quoteForm.name, phone: quoteForm.phone, items: cart.map(c => c.product.name), total: cartTotal });
    logActivity('quote_request', 'Teklif talebi gonderildi', {
      page: 'login',
      metadata: { ...quoteForm, items: cart.map(c => ({ name: c.product.name, qty: c.quantity, price: c.product.avgPrice })), total: cartTotal }
    });
    setQuoteSent(true);
    toast.success('Teklif talebiniz başarıyla gönderildi! En kısa sürede sizinle iletişime geçeceğiz.');
    setTimeout(() => { setShowQuoteForm(false); setQuoteSent(false); setCart([]); setQuoteForm({ name: '', phone: '', email: '', note: '' }); }, 3000);
  };

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminPw, setShowAdminPw] = useState(false);

  // Security Lockout states
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  const { login, isAuthenticated } = useAuth();
  const { setCurrentEmployee, availableEmployees = [] } = useEmployee();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MINUTES = 3;

  useEffect(() => {
    // Load security state from local storage to prevent bypass on refresh
    const storedAttempts = parseInt(localStorage.getItem('security_attempts') || '0', 10);
    const storedLockout = parseInt(localStorage.getItem('security_lockout_until') || '0', 10);
    
    if (storedAttempts) setAttempts(storedAttempts);
    if (storedLockout && storedLockout > Date.now()) {
      setLockoutUntil(storedLockout);
    } else if (storedLockout && storedLockout <= Date.now()) {
      // Clear lockout
      localStorage.removeItem('security_attempts');
      localStorage.removeItem('security_lockout_until');
      setAttempts(0);
      setLockoutUntil(null);
    }
  }, []);

  useEffect(() => {
    if (!lockoutUntil) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now >= lockoutUntil) {
        setLockoutUntil(null);
        setLockoutRemaining(0);
        setAttempts(0);
        localStorage.removeItem('security_attempts');
        localStorage.removeItem('security_lockout_until');
      } else {
        setLockoutRemaining(Math.ceil((lockoutUntil - now) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const recordFailedAttempt = () => {
    trackVitrinEvent('login_attempt', { success: false });
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    localStorage.setItem('security_attempts', newAttempts.toString());

    if (newAttempts >= MAX_ATTEMPTS) {
      const lockTime = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
      setLockoutUntil(lockTime);
      localStorage.setItem('security_lockout_until', lockTime.toString());
      setError(`Çok fazla hatalı giriş yaptınız. Güvenlik nedeniyle hesabınız kilitlendi. Lütfen ${LOCKOUT_MINUTES} dakika bekleyin.`);
      logActivity('security_alert', 'Brute force girisim engellendi', { page: 'login', level: 'high' });
    } else {
      setError(`Hatalı giriş. Kalan hakkınız: ${MAX_ATTEMPTS - newAttempts}`);
    }
  };

  // Merge products from Pazarlama module
  const catalogProducts = useMemo(() => {
    try {
      const pazarlama = getFromStorage<any>(StorageKey.PAZARLAMA_CONTENT);
      if (pazarlama?.products?.length) {
        // Merge pazarlama products with defaults — pazarlama ones get priority
        const pazarlamaProducts: CatalogProduct[] = pazarlama.products
          .filter((p: any) => p.active !== false)
          .map((p: any, idx: number) => ({
            id: `paz-${p.id || idx}`,
            name: p.name || 'Ürün',
            category: (p.category as ProductCategory) || 'dana',
            description: p.description || '',
            longDescription: p.description || '',
            image: p.imageUrl || DEFAULT_CATALOG[idx % DEFAULT_CATALOG.length]?.image || '',
            badge: p.badge || '',
            badgeColor: 'blue',
            avgPrice: p.price ? parseInt(p.price.replace(/\D/g, '')) || 0 : 0,
            priceUnit: 'kg',
            priceRange: { min: 0, max: 0 },
            origin: '', cutType: '',
            protein: 0, fat: 0, calories: 0,
            tips: '', popular: false, inStock: true,
          }));
        // Combine: defaults first, then pazarlama ones that don't duplicate
        const allProducts = [...DEFAULT_CATALOG];
        pazarlamaProducts.forEach(pp => {
          if (!allProducts.find(dp => dp.name.toLowerCase() === pp.name.toLowerCase())) {
            allProducts.push(pp);
          }
        });
        return allProducts;
      }
    } catch {}
    return DEFAULT_CATALOG;
  }, []);

  const filteredProducts = useMemo(() => {
    let products = catalogProducts;
    if (selectedCategory !== 'all') {
      products = products.filter(p => p.category === selectedCategory);
    }
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      products = products.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    return products;
  }, [catalogProducts, selectedCategory, productSearch]);

  const companyInfo = useMemo(() => {
    try {
      const settings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
      if (settings?.companyInfo) return {
        name: settings.companyInfo.companyName || 'İŞLEYEN ET',
        slogan: settings.companyInfo.slogan || 'Toptan & Perakende Et Ürünleri',
      };
    } catch {}
    return { name: 'İŞLEYEN ET', slogan: 'Toptan & Perakende Et Ürünleri' };
  }, []);

  // Sayfa görüntülenme takibi
  useEffect(() => {
    trackVitrinEvent('page_view');
  }, []);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleAdminLogin = async (e: FormEvent) => {
    e.preventDefault(); 
    if (lockoutUntil) return;
    setIsLoading(true); setError('');
    try {
      const success = await login('admin', adminPassword);
      if (success) {
        // Reset attempts
        setAttempts(0);
        localStorage.removeItem('security_attempts');
        localStorage.removeItem('security_lockout_until');

        const adminEmp = availableEmployees.find(e => e.id === 'admin-super');
        if (adminEmp) setCurrentEmployee(adminEmp);
        toast.success(t('auth.adminLoginSuccess'));
        logActivity('login', 'Admin girisi yapildi', { employeeName: 'Admin', page: 'login' });
        navigate('/dashboard', { replace: true });
      } else {
        recordFailedAttempt();
      }
    } catch { setError(t('auth.errorOccurred')); }
    finally { setIsLoading(false); }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); 
    if (lockoutUntil) return;
    setError(''); setIsLoading(true);
    try {
      const success = await login(username, password);
      if (success) {
        // Reset attempts
        setAttempts(0);
        localStorage.removeItem('security_attempts');
        localStorage.removeItem('security_lockout_until');

        toast.success(t('auth.loginSuccess'));
        logActivity('login', 'Kullanici girisi yapildi', { employeeName: username, page: 'login' });
        navigate('/dashboard', { replace: true });
      } else {
        recordFailedAttempt();
      }
    } catch { setError(t('auth.errorOccurred')); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="relative min-h-screen bg-[#0a0a0a] text-white flex flex-col lg:flex-row overflow-hidden font-sans">
      <FloatingParticles />

      {/* ─── Arka Plan Dekorasyonları ─── */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* ─── Mobil Alt Navigasyon Barı ─── */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-3 mb-2 flex items-center gap-2">
          {/* Sepet butonu */}
          {cartCount > 0 && (
            <motion.button
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              whileTap={{ scale: 0.93 }}
              onClick={() => setShowCart(true)}
              className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center shadow-xl shadow-red-600/30 border border-red-500/30"
            >
              <ShoppingBag className="w-5 h-5 text-white" />
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white text-red-600 text-[10px] font-black flex items-center justify-center shadow-md">
                {cartCount}
              </span>
            </motion.button>
          )}
          {/* Giriş butonu */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAdminPanel(true)}
            className="flex-1 flex items-center justify-center gap-2.5 py-4 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-600 active:from-blue-700 active:to-cyan-700 backdrop-blur-xl border border-blue-500/30 rounded-2xl text-white text-sm font-bold shadow-2xl shadow-blue-600/30 transition-all relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 animate-pulse" />
            <Fingerprint className="w-5 h-5 relative z-10" />
            <span className="relative z-10">Sisteme Giriş Yap</span>
            <ChevronRight className="w-3.5 h-3.5 text-blue-200 relative z-10" />
          </motion.button>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
           SOL PANEL: HERO CAROUSEL
         ═══════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-[45%] h-[38vh] sm:h-[40vh] lg:h-screen p-3 sm:p-4 lg:p-0 relative z-10 flex-shrink-0">
        <HeroCarousel banners={DEFAULT_BANNERS} />
        <div className="absolute top-5 left-5 sm:top-8 sm:left-8 lg:left-12 z-20">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
            </div>
            <div>
              <h1 className="text-white font-extrabold text-lg sm:text-2xl tracking-tight drop-shadow-md">{companyInfo.name}</h1>
              <p className="text-blue-100 font-medium text-xs sm:text-sm drop-shadow-md">{companyInfo.slogan}</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
           SAĞ PANEL: MÜŞTERİ İÇERİKLERİ (BENTO GRID)
         ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1 p-4 sm:p-6 lg:p-12 overflow-y-auto z-10 scrollbar-hide">
        <div className="max-w-4xl mx-auto space-y-5 sm:space-y-8 pt-2 sm:pt-8 lg:pt-8 pb-24 sm:pb-20">
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-end justify-between gap-3"
          >
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Hoş Geldiniz,</h2>
              <p className="text-muted-foreground text-sm sm:text-base">Müşterilerimize özel sunduğumuz fırsatlar, tarifler ve duyurular.</p>
            </div>
            {/* ─── Desktop: Sisteme Giriş Butonu (Entegre) ─── */}
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={{ delay: 0.3 }}
              onClick={() => setShowAdminPanel(true)}
              className="hidden sm:flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-2xl text-white font-bold text-sm shadow-xl shadow-blue-600/25 transition-all group relative overflow-hidden shrink-0"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center relative z-10">
                <Fingerprint className="w-5 h-5 text-white" />
              </div>
              <div className="relative z-10 text-left">
                <span className="block text-sm font-bold">Sisteme Giriş Yap</span>
                <span className="block text-[10px] text-blue-200/80 font-medium">Yönetim Paneli</span>
              </div>
              <ArrowRight className="w-4 h-4 text-blue-200 group-hover:translate-x-1 transition-transform relative z-10" />
            </motion.button>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            
            {/* ─── 1. KUTU: Nakit İndirim Bilgisi ─── */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="md:col-span-2 relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-red-600/20 via-orange-500/10 to-transparent border border-red-500/30 p-5 sm:p-8 group"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/20 rounded-full blur-3xl -translate-y-20 translate-x-20" />
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 relative z-10">
                <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-500">
                  <Percent className="w-8 h-8 sm:w-12 sm:h-12 text-red-400" />
                </div>
                <div className="text-center sm:text-left">
                  <span className="inline-block px-2.5 py-0.5 sm:px-3 sm:py-1 bg-red-500/20 text-red-400 text-[10px] sm:text-xs font-bold rounded-lg mb-1.5 sm:mb-2 border border-red-500/30">
                    AVANTAJLI ALIŞVERİŞ
                  </span>
                  <h3 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white mb-1.5 sm:mb-2">
                    Nakit Ödemelerde <span className="text-red-400">%10 İndirim</span>
                  </h3>
                  <p className="text-muted-foreground text-xs sm:text-sm lg:text-base max-w-lg">
                    Mağazamızdan ve toptan dağıtım ağımızdan yapacağınız tüm nakit alışverişlerde anında %10 indirim uygulanmaktadır. Kaliteyi daha uygun fiyata alın!
                  </p>
                </div>
              </div>
            </motion.div>

            {/* ─── 2. KUTU: Çorba Tarifleri ─── */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="md:col-span-1 rounded-2xl sm:rounded-3xl bg-white/5 border border-white/10 p-4 sm:p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white">Günün Çorbaları</h3>
                </div>
                <div className="flex gap-1">
                  {SOUP_RECIPES.map((_, idx) => (
                    <button 
                      key={idx}
                      onClick={() => { setActiveRecipe(idx); trackVitrinEvent('recipe_view', { recipeName: SOUP_RECIPES[idx].name }); }}
                      className={`w-2 h-2 rounded-full transition-all ${activeRecipe === idx ? 'w-5 sm:w-6 bg-orange-400' : 'bg-white/20 hover:bg-white/40'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="relative flex-1 rounded-xl sm:rounded-2xl overflow-hidden group">
                <img src={SOUP_RECIPES[activeRecipe].image} alt={SOUP_RECIPES[activeRecipe].name} className="w-full h-40 sm:h-48 object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                  <h4 className="text-lg sm:text-xl font-bold text-white mb-1">{SOUP_RECIPES[activeRecipe].name}</h4>
                  <div className="flex items-center gap-3 text-[10px] sm:text-xs font-medium text-orange-200 mb-2 sm:mb-3">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {SOUP_RECIPES[activeRecipe].time}</span>
                    <span className="flex items-center gap-1"><ChefHat className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {SOUP_RECIPES[activeRecipe].difficulty}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-300 line-clamp-2">{SOUP_RECIPES[activeRecipe].description}</p>
                </div>
              </div>
              <div className="mt-3 sm:mt-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-orange-500/10 border border-orange-500/20 flex gap-2.5 sm:gap-3 items-start">
                <Info className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] sm:text-xs text-orange-200/80 leading-relaxed">
                  <strong className="text-orange-400">Şefin Notu:</strong> {SOUP_RECIPES[activeRecipe].tips}
                </p>
              </div>
            </motion.div>

            {/* ─── 3. KUTU: Güncel Haberler ─── */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="md:col-span-1 rounded-2xl sm:rounded-3xl bg-white/5 border border-white/10 p-4 sm:p-6 flex flex-col"
            >
              <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Newspaper className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white">Sektörel Haberler</h3>
              </div>
              
              <div className="space-y-3 sm:space-y-4 flex-1">
                {NEWS_ITEMS.map((news) => (
                  <div key={news.id} onClick={() => { setSelectedNews(news); trackVitrinEvent('news_view', { newsTitle: news.title }); }} className="flex gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer group">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg sm:rounded-xl overflow-hidden flex-shrink-0">
                      <img src={news.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    </div>
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <span className="text-[9px] sm:text-[10px] font-bold text-blue-400 mb-0.5 sm:mb-1 tracking-wider uppercase">{news.category} &bull; {news.date}</span>
                      <h4 className="text-xs sm:text-sm font-bold text-white mb-0.5 sm:mb-1 group-hover:text-blue-400 transition-colors truncate">{news.title}</h4>
                      <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-2">{news.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setShowAllNews(true)} className="mt-3 sm:mt-4 w-full py-2.5 sm:py-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors">
                Tüm Haberleri Gör <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </motion.div>

          </div>

          {/* ═══════════════════════════════════════════════════════
               ÜRÜN KATALOĞU
             ═══════════════════════════════════════════════════════ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl sm:rounded-3xl bg-white/5 border border-white/10 p-4 sm:p-6 lg:p-8"
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-red-500/20">
                  <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">Ürün Kataloğu</h3>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{catalogProducts.length} ürün • Güncel ortalama fiyatlar</p>
                </div>
              </div>
              {/* Search */}
              <div className="relative w-full sm:w-56 lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Ürün ara..."
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs sm:text-sm placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 transition-all"
                />
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-1.5 sm:gap-2 mb-4 sm:mb-6 overflow-x-auto scrollbar-hide pb-1">
              {CATEGORY_TABS.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => { setSelectedCategory(cat.key); trackVitrinEvent('category_filter', { category: cat.key }); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === cat.key
                      ? 'bg-red-600/90 text-white shadow-lg shadow-red-600/20 border border-red-500/50'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/5'
                  }`}
                >
                  <span className="text-sm">{cat.emoji}</span>
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Product Grid - Mobil: Yatay kaydırma / Desktop: Grid */}
            <div className={`${!showCatalog ? 'flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory scrollbar-hide sm:grid sm:grid-cols-3 lg:grid-cols-4 sm:gap-4 sm:overflow-visible sm:pb-0' : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4'}`}>
              {filteredProducts.slice(0, showCatalog ? 999 : 8).map((product, idx) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setSelectedProduct(product); trackVitrinEvent('product_click', { productName: product.name, productId: product.id }); }}
                  className={`group relative rounded-xl sm:rounded-2xl overflow-hidden bg-black/40 border border-white/5 hover:border-white/20 cursor-pointer transition-all ${!showCatalog ? 'min-w-[160px] sm:min-w-0 snap-start flex-shrink-0' : ''}`}
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    {/* Badge */}
                    {product.badge && (
                      <span className={`absolute top-2 left-2 sm:top-2.5 sm:left-2.5 px-1.5 py-0.5 sm:px-2 sm:py-0.5 text-[9px] sm:text-[10px] font-bold rounded-md border ${BADGE_COLORS[product.badgeColor] || BADGE_COLORS.blue}`}>
                        {product.badge}
                      </span>
                    )}
                    {/* Popular star */}
                    {product.popular && (
                      <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-500/20 backdrop-blur-sm flex items-center justify-center border border-amber-500/30">
                        <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400 fill-amber-400" />
                      </div>
                    )}
                    {/* Quick price overlay */}
                    <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/10">
                      <span className="text-[10px] sm:text-xs font-bold text-white">₺{product.avgPrice}</span>
                      <span className="text-[8px] sm:text-[9px] text-gray-400">/{product.priceUnit}</span>
                    </div>
                  </div>
                  {/* Info */}
                  <div className="p-2.5 sm:p-3">
                    <h4 className="text-xs sm:text-sm font-bold text-white mb-0.5 sm:mb-1 truncate group-hover:text-red-400 transition-colors">{product.name}</h4>
                    <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 leading-relaxed">{product.description}</p>
                    {/* Nutrition mini bar */}
                    {product.protein > 0 && (
                      <div className="flex items-center gap-2 mt-1.5 sm:mt-2">
                        <div className="flex items-center gap-0.5 text-[9px] sm:text-[10px]">
                          <Flame className="w-2.5 h-2.5 text-orange-400" />
                          <span className="text-gray-400">{product.calories}kcal</span>
                        </div>
                        <div className="flex items-center gap-0.5 text-[9px] sm:text-[10px]">
                          <Beef className="w-2.5 h-2.5 text-red-400" />
                          <span className="text-gray-400">{product.protein}g</span>
                        </div>
                      </div>
                    )}
                    {/* Sepete Ekle Button */}
                    <button
                      onClick={(e) => addToCart(product, e)}
                      className="mt-2 w-full py-1.5 sm:py-2 rounded-lg bg-red-600/20 hover:bg-red-600/40 active:bg-red-600/60 border border-red-500/20 text-[10px] sm:text-xs font-bold text-red-400 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <ShoppingBag className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      Sepete Ekle
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* No Results */}
            {filteredProducts.length === 0 && (
              <div className="text-center py-8 sm:py-12">
                <Search className="w-8 h-8 sm:w-10 sm:h-10 text-gray-600 mx-auto mb-2 sm:mb-3" />
                <p className="text-sm sm:text-base text-gray-500 font-medium">Ürün bulunamadı</p>
                <p className="text-xs text-gray-600 mt-1">Farklı bir kategori veya arama terimi deneyin</p>
              </div>
            )}

            {/* Show More / Show Less */}
            {filteredProducts.length > 4 && (
              <button
                onClick={() => setShowCatalog(!showCatalog)}
                className="mt-4 sm:mt-5 w-full py-2.5 sm:py-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors border border-white/5"
              >
                {showCatalog ? (
                  <>Daha Az Göster <ChevronRight className="w-3.5 h-3.5 rotate-[-90deg]" /></>
                ) : (
                  <>Tüm Ürünleri Gör ({filteredProducts.length}) <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></>
                )}
              </button>
            )}
          </motion.div>

          {/* ─── Alt Bilgi Şeridi ─── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 py-4 sm:py-6 text-gray-500"
          >
            <div className="flex items-center gap-2 text-[10px] sm:text-xs">
              <Award className="w-3.5 h-3.5" />
              <span>15+ Yıllık Deneyim</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs">
              <Truck className="w-3.5 h-3.5" />
              <span>Aynı Gün Teslimat</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs">
              <Shield className="w-3.5 h-3.5" />
              <span>ISO 22000 Sertifikalı</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs">
              <Heart className="w-3.5 h-3.5" />
              <span>2500+ Mutlu Müşteri</span>
            </div>
          </motion.div>

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
           GİRİŞ PANELİ - Desktop: Slide-in, Mobile: Bottom Sheet
         ═══════════════════════════════════════════════════════════ */}

      {/* Desktop centered modal panel */}
      <AnimatePresence>
        {showAdminPanel && (
          <div className="hidden sm:block">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAdminPanel(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[90]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 30 }}
              transition={{ type: 'spring', stiffness: 200, damping: 28 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[460px] max-h-[92vh] z-[100] flex flex-col overflow-hidden rounded-3xl"
            >
              {/* Glassmorphism Background */}
              <div className="absolute inset-0 bg-[#0a0a0a]/95 backdrop-blur-2xl rounded-3xl" />
              <div className="absolute top-0 left-0 w-72 h-72 bg-blue-600/8 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-72 h-72 bg-purple-600/8 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2 pointer-events-none" />
              <div className="absolute inset-0 rounded-3xl border border-white/10 pointer-events-none" />

              {/* Header */}
              <div className="relative flex items-center justify-between px-8 py-7 border-b border-white/5 rounded-t-3xl">
                <div className="flex items-center gap-4">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="relative"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-500 to-blue-600 flex items-center justify-center shadow-xl shadow-blue-500/25">
                      <Fingerprint className="w-7 h-7 text-white" />
                    </div>
                    <motion.div
                      animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 rounded-2xl border-2 border-blue-400/30"
                    />
                  </motion.div>
                  <div>
                    <h3 className="text-white font-extrabold text-xl tracking-tight">{t('auth.systemLogin')}</h3>
                    <p className="text-gray-500 text-xs font-medium mt-0.5">{companyInfo.name} Yönetim Portalı</p>
                  </div>
                </div>
                <button onClick={() => { setShowAdminPanel(false); setError(''); setShowPassword(false); setShowAdminPw(false); }}
                  className="p-2.5 bg-white/5 hover:bg-white/10 hover:rotate-90 rounded-xl transition-all duration-300">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Tab Switcher - Premium */}
              <div className="relative px-8 py-5">
                <div className="relative flex bg-white/[0.03] rounded-2xl p-1.5 border border-white/5">
                  <motion.div
                    className="absolute top-1.5 bottom-1.5 rounded-xl"
                    animate={{
                      left: adminTab === 'user' ? '6px' : '50%',
                      width: 'calc(50% - 9px)',
                    }}
                    transition={{ type: 'spring', stiffness: 200, damping: 28 }}
                    style={{
                      background: adminTab === 'user'
                        ? 'linear-gradient(135deg, #2563eb, #0ea5e9)'
                        : 'linear-gradient(135deg, #dc2626, #f97316)',
                      boxShadow: adminTab === 'user'
                        ? '0 8px 32px -8px rgba(37,99,235,0.5)'
                        : '0 8px 32px -8px rgba(220,38,38,0.5)',
                    }}
                  />
                  <button onClick={() => { setAdminTab('user'); setError(''); setShowPassword(false); }}
                    className={`flex-1 relative z-10 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 ${adminTab === 'user' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                    <User className="w-4 h-4" /> Personel
                  </button>
                  <button onClick={() => { setAdminTab('admin'); setError(''); setShowAdminPw(false); }}
                    className={`flex-1 relative z-10 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 ${adminTab === 'admin' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                    <ShieldCheck className="w-4 h-4" /> Yönetici
                  </button>
                </div>
              </div>

              {/* Form Area */}
              <div className="flex-1 px-8 overflow-y-auto relative">
                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -10, height: 0 }}
                      className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 backdrop-blur-xl"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-red-300 text-sm font-medium leading-relaxed">{error}</p>
                        {attempts > 0 && !lockoutUntil && (
                          <div className="flex gap-1 mt-2">
                            {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                              <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < attempts ? 'bg-red-500' : 'bg-white/10'}`} />
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Lockout */}
                {lockoutUntil && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="mb-6 p-8 rounded-3xl border border-red-500/30 text-center relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-red-950/60 via-red-900/40 to-transparent" />
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl" />
                    <div className="relative z-10">
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-20 h-20 rounded-full bg-red-500/15 border-2 border-red-500/30 flex items-center justify-center mx-auto mb-4"
                      >
                        <Lock className="w-9 h-9 text-red-500" />
                      </motion.div>
                      <h4 className="text-xl font-extrabold text-red-400 mb-1">Güvenlik Kilidi</h4>
                      <p className="text-sm text-red-300/70 mb-4">Çok fazla hatalı deneme yapıldı</p>
                      <div className="inline-flex items-center gap-1 px-6 py-3 rounded-2xl bg-black/40 border border-red-500/20">
                        <span className="text-4xl font-mono font-black text-white tabular-nums">
                          {Math.floor(lockoutRemaining / 60).toString().padStart(2, '0')}
                        </span>
                        <motion.span
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="text-4xl font-mono font-black text-red-400"
                        >:</motion.span>
                        <span className="text-4xl font-mono font-black text-white tabular-nums">
                          {(lockoutRemaining % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* User Form */}
                {!lockoutUntil && adminTab === 'user' && (
                  <motion.form key="user-form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 26 }} onSubmit={handleSubmit} className="space-y-5">
                    {/* Avatar area */}
                    <div className="text-center mb-2">
                      <motion.div
                        animate={username ? { scale: [1, 1.05, 1] } : {}}
                        transition={{ duration: 0.3 }}
                        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-3"
                      >
                        {username ? (
                          <span className="text-2xl font-black text-blue-400 uppercase">{username.charAt(0)}</span>
                        ) : (
                          <User className="w-7 h-7 text-blue-400/50" />
                        )}
                      </motion.div>
                      <p className="text-xs text-gray-500 font-medium">Personel hesabınızla giriş yapın</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                        <User className="w-3 h-3" /> {t('auth.username')}
                      </label>
                      <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                        <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl group-focus-within:border-blue-500/50 transition-colors">
                          <div className="pl-4 pr-2 py-4 text-gray-600 group-focus-within:text-blue-400 transition-colors">
                            <User className="w-5 h-5" />
                          </div>
                          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                            placeholder={t('auth.enterUsername')}
                            className="flex-1 bg-transparent py-4 pr-4 text-white placeholder-gray-600 focus:outline-none text-sm font-medium"
                            required autoFocus />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                        <KeyRound className="w-3 h-3" /> {t('auth.password')}
                      </label>
                      <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                        <div className="relative flex items-center bg-white/[0.03] border border-white/10 rounded-2xl group-focus-within:border-blue-500/50 transition-colors">
                          <div className="pl-4 pr-2 py-4 text-gray-600 group-focus-within:text-blue-400 transition-colors">
                            <Lock className="w-5 h-5" />
                          </div>
                          <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                            placeholder={t('auth.enterPassword')}
                            className="flex-1 bg-transparent py-4 pr-2 text-white placeholder-gray-600 focus:outline-none text-sm font-medium"
                            required />
                          <button type="button" onClick={() => setShowPassword(!showPassword)}
                            className="pr-4 pl-2 py-4 text-gray-600 hover:text-gray-300 transition-colors">
                            {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <motion.button
                      type="submit"
                      disabled={isLoading}
                      whileHover={{ scale: 1.01, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full py-4 mt-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-600/25 text-base flex items-center justify-center gap-2.5 relative overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                      {isLoading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Giriş Yapılıyor...</>
                      ) : (
                        <><LogIn className="w-5 h-5" /> Giriş Yap</>
                      )}
                    </motion.button>

                    <p className="text-[11px] text-gray-600 text-center mt-4 leading-relaxed">
                      Sisteme erişim yetkiniz yoksa yöneticinizle iletişime geçin.
                    </p>
                  </motion.form>
                )}

                {/* Admin Form */}
                {!lockoutUntil && adminTab === 'admin' && (
                  <motion.form key="admin-form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 26 }} onSubmit={handleAdminLogin} className="space-y-5">
                    {/* Security Icon */}
                    <div className="text-center mb-2">
                      <motion.div
                        animate={{ rotate: [0, 3, -3, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600/20 to-orange-600/20 border border-red-500/20 flex items-center justify-center mx-auto mb-3"
                      >
                        <ShieldCheck className="w-7 h-7 text-red-400" />
                      </motion.div>
                    </div>

                    <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500/5 to-orange-500/5 border border-red-500/15 backdrop-blur-xl">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Shield className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                          <p className="text-red-400 text-xs font-bold mb-0.5">Yüksek Güvenlik Alanı</p>
                          <p className="text-red-300/60 text-[11px] leading-relaxed">
                            Bu alan sadece sistem yöneticileri içindir. Yetkisiz erişim girişimleri kayıt altına alınmaktadır.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                        <KeyRound className="w-3 h-3" /> Yönetici Şifresi
                      </label>
                      <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600/20 to-orange-600/20 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                        <div className="relative flex items-center bg-white/[0.03] border border-red-500/20 rounded-2xl group-focus-within:border-red-500/50 transition-colors">
                          <div className="pl-4 pr-2 py-4 text-red-500/40 group-focus-within:text-red-400 transition-colors">
                            <Lock className="w-5 h-5" />
                          </div>
                          <input type={showAdminPw ? 'text' : 'password'} value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                            placeholder="Admin şifresini girin"
                            className="flex-1 bg-transparent py-4 pr-2 text-white placeholder-gray-600 focus:outline-none text-sm font-medium"
                            required autoFocus />
                          <button type="button" onClick={() => setShowAdminPw(!showAdminPw)}
                            className="pr-4 pl-2 py-4 text-gray-600 hover:text-gray-300 transition-colors">
                            {showAdminPw ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <motion.button
                      type="submit"
                      disabled={isLoading}
                      whileHover={{ scale: 1.01, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full py-4 mt-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-red-600/25 text-base flex items-center justify-center gap-2.5 relative overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                      {isLoading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Doğrulanıyor...</>
                      ) : (
                        <><ShieldCheck className="w-5 h-5" /> Yönetici Girişi Yap</>
                      )}
                    </motion.button>
                  </motion.form>
                )}
              </div>

              {/* Footer */}
              <div className="relative px-8 py-5 border-t border-white/5 bg-black/20 rounded-b-3xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-gray-500 font-medium">Güvenli Bağlantı</span>
                  </div>
                  <p className="text-[10px] font-medium text-gray-600">{companyInfo.name} &copy; {new Date().getFullYear()} &bull; v4.2</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile bottom sheet panel */}
      <MobileBottomSheet show={showAdminPanel} onClose={() => { setShowAdminPanel(false); setError(''); setShowPassword(false); setShowAdminPw(false); }}>
        <div className="flex flex-col max-h-[88vh] relative">
          {/* Glow decorations */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-blue-600/8 rounded-full blur-[80px] pointer-events-none" />

          {/* Header */}
          <div className="relative flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 via-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25"
              >
                <Fingerprint className="w-5 h-5 text-white" />
              </motion.div>
              <div>
                <h3 className="text-white font-extrabold text-base tracking-tight">{t('auth.systemLogin')}</h3>
                <p className="text-gray-500 text-[10px] font-medium">{companyInfo.name} Yönetim Portalı</p>
              </div>
            </div>
            <button onClick={() => { setShowAdminPanel(false); setError(''); setShowPassword(false); setShowAdminPw(false); }}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="relative px-5 py-3">
            <div className="relative flex bg-white/[0.03] rounded-xl p-1 border border-white/5">
              <motion.div
                className="absolute top-1 bottom-1 rounded-lg"
                animate={{
                  left: adminTab === 'user' ? '4px' : '50%',
                  width: 'calc(50% - 6px)',
                }}
                transition={{ type: 'spring', stiffness: 200, damping: 28 }}
                style={{
                  background: adminTab === 'user'
                    ? 'linear-gradient(135deg, #2563eb, #0ea5e9)'
                    : 'linear-gradient(135deg, #dc2626, #f97316)',
                  boxShadow: adminTab === 'user'
                    ? '0 6px 24px -6px rgba(37,99,235,0.5)'
                    : '0 6px 24px -6px rgba(220,38,38,0.5)',
                }}
              />
              <button onClick={() => { setAdminTab('user'); setError(''); setShowPassword(false); }}
                className={`flex-1 relative z-10 py-2.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${adminTab === 'user' ? 'text-white' : 'text-gray-500'}`}>
                <User className="w-3.5 h-3.5" /> Personel
              </button>
              <button onClick={() => { setAdminTab('admin'); setError(''); setShowAdminPw(false); }}
                className={`flex-1 relative z-10 py-2.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${adminTab === 'admin' ? 'text-white' : 'text-gray-500'}`}>
                <ShieldCheck className="w-3.5 h-3.5" /> Yönetici
              </button>
            </div>
          </div>

          {/* Form Area */}
          <div className="flex-1 px-5 pb-4 overflow-y-auto relative">
            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5"
                >
                  <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-red-300 text-xs font-medium">{error}</p>
                    {attempts > 0 && !lockoutUntil && (
                      <div className="flex gap-1 mt-1.5">
                        {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                          <div key={i} className={`h-0.5 flex-1 rounded-full ${i < attempts ? 'bg-red-500' : 'bg-white/10'}`} />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lockout */}
            {lockoutUntil && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="mb-4 p-6 rounded-2xl border border-red-500/30 text-center relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-red-950/60 via-red-900/40 to-transparent" />
                <div className="relative z-10">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-16 h-16 rounded-full bg-red-500/15 border-2 border-red-500/30 flex items-center justify-center mx-auto mb-3"
                  >
                    <Lock className="w-7 h-7 text-red-500" />
                  </motion.div>
                  <h4 className="text-base font-extrabold text-red-400 mb-1">Güvenlik Kilidi</h4>
                  <p className="text-xs text-red-300/70 mb-3">Çok fazla hatalı deneme</p>
                  <div className="inline-flex items-center gap-0.5 px-4 py-2 rounded-xl bg-black/40 border border-red-500/20">
                    <span className="text-2xl font-mono font-black text-white tabular-nums">
                      {Math.floor(lockoutRemaining / 60).toString().padStart(2, '0')}
                    </span>
                    <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}
                      className="text-2xl font-mono font-black text-red-400">:</motion.span>
                    <span className="text-2xl font-mono font-black text-white tabular-nums">
                      {(lockoutRemaining % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* User Form - Mobile */}
            {!lockoutUntil && adminTab === 'user' && (
              <motion.form key="user-form-mobile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit} className="space-y-4">
                {/* Mini avatar */}
                <div className="text-center mb-1">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/15 flex items-center justify-center mx-auto mb-2">
                    {username ? (
                      <span className="text-lg font-black text-blue-400 uppercase">{username.charAt(0)}</span>
                    ) : (
                      <User className="w-5 h-5 text-blue-400/50" />
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500">Personel hesabınızla giriş yapın</p>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <User className="w-2.5 h-2.5" /> {t('auth.username')}
                  </label>
                  <div className="flex items-center bg-white/[0.03] border border-white/10 rounded-xl focus-within:border-blue-500/50 transition-colors">
                    <div className="pl-3.5 pr-1.5 py-3.5 text-gray-600">
                      <User className="w-4 h-4" />
                    </div>
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                      placeholder={t('auth.enterUsername')}
                      className="flex-1 bg-transparent py-3.5 pr-3.5 text-white text-sm placeholder-gray-600 focus:outline-none"
                      required autoFocus />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <KeyRound className="w-2.5 h-2.5" /> {t('auth.password')}
                  </label>
                  <div className="flex items-center bg-white/[0.03] border border-white/10 rounded-xl focus-within:border-blue-500/50 transition-colors">
                    <div className="pl-3.5 pr-1.5 py-3.5 text-gray-600">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder={t('auth.enterPassword')}
                      className="flex-1 bg-transparent py-3.5 pr-1 text-white text-sm placeholder-gray-600 focus:outline-none"
                      required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="pr-3.5 pl-1.5 py-3.5 text-gray-600 active:text-gray-300">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3.5 mt-1 bg-gradient-to-r from-blue-600 to-cyan-600 active:from-blue-700 active:to-cyan-700 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 text-sm flex items-center justify-center gap-2 relative overflow-hidden"
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Giriş Yapılıyor...</>
                  ) : (
                    <><LogIn className="w-4 h-4" /> Giriş Yap</>
                  )}
                </motion.button>
                <p className="text-[10px] text-gray-600 text-center mt-2">Sisteme erişim yetkiniz yoksa yöneticinizle iletişime geçin.</p>
              </motion.form>
            )}

            {/* Admin Form - Mobile */}
            {!lockoutUntil && adminTab === 'admin' && (
              <motion.form key="admin-form-mobile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleAdminLogin} className="space-y-4">
                <div className="text-center mb-1">
                  <motion.div
                    animate={{ rotate: [0, 3, -3, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600/20 to-orange-600/20 border border-red-500/15 flex items-center justify-center mx-auto mb-2"
                  >
                    <ShieldCheck className="w-5 h-5 text-red-400" />
                  </motion.div>
                </div>

                <div className="p-3 rounded-xl bg-gradient-to-r from-red-500/5 to-orange-500/5 border border-red-500/15">
                  <div className="flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-red-300/70 text-[10px] leading-relaxed">
                      <span className="text-red-400 font-bold">Yüksek Güvenlik Alanı</span> — Sadece sistem yöneticileri için.
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <KeyRound className="w-2.5 h-2.5" /> Yönetici Şifresi
                  </label>
                  <div className="flex items-center bg-white/[0.03] border border-red-500/20 rounded-xl focus-within:border-red-500/50 transition-colors">
                    <div className="pl-3.5 pr-1.5 py-3.5 text-red-500/40">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input type={showAdminPw ? 'text' : 'password'} value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                      placeholder="Admin şifresini girin"
                      className="flex-1 bg-transparent py-3.5 pr-1 text-white text-sm placeholder-gray-600 focus:outline-none"
                      required autoFocus />
                    <button type="button" onClick={() => setShowAdminPw(!showAdminPw)}
                      className="pr-3.5 pl-1.5 py-3.5 text-gray-600 active:text-gray-300">
                      {showAdminPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3.5 mt-1 bg-gradient-to-r from-red-600 to-orange-600 active:from-red-700 active:to-orange-700 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 text-sm flex items-center justify-center gap-2 relative overflow-hidden"
                >
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Doğrulanıyor...</>
                  ) : (
                    <><ShieldCheck className="w-4 h-4" /> Yönetici Girişi</>
                  )}
                </motion.button>
              </motion.form>
            )}
          </div>

          {/* Footer */}
          <div className="relative px-5 py-3 border-t border-white/5 bg-black/20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] text-gray-500 font-medium">Güvenli Bağlantı</span>
              </div>
              <p className="text-[9px] font-medium text-gray-600">{companyInfo.name} &copy; {new Date().getFullYear()}</p>
            </div>
          </div>
        </div>
      </MobileBottomSheet>

      {/* ═══════════════════════════════════════════════════════════
           HABER DETAY MODALI
         ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedNews && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedNews(null)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-[110]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-2xl sm:max-h-[85vh] z-[120] bg-[#111] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Haber Görseli */}
              <div className="relative w-full h-48 sm:h-64 flex-shrink-0">
                <img src={selectedNews.image} alt={selectedNews.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-black/40 to-transparent" />
                <button
                  onClick={() => setSelectedNews(null)}
                  className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 sm:p-2.5 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-xl sm:rounded-2xl transition-colors border border-white/10"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </button>
                <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 right-4 sm:right-6">
                  <span className="inline-block px-2.5 py-0.5 sm:px-3 sm:py-1 bg-blue-600/80 text-white text-[10px] sm:text-xs font-bold rounded-lg mb-2 backdrop-blur-md border border-blue-500/50">
                    {selectedNews.category}
                  </span>
                  <h2 className="text-lg sm:text-2xl font-extrabold text-white leading-tight drop-shadow-lg">
                    {selectedNews.title}
                  </h2>
                </div>
              </div>

              {/* Haber İçeriği */}
              <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6">
                <div className="flex items-center gap-3 mb-4 sm:mb-5 text-xs sm:text-sm text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="font-medium">{selectedNews.date}</span>
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                  <Newspaper className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="font-medium">{companyInfo.name}</span>
                </div>
                <p className="text-sm sm:text-base text-gray-300 leading-relaxed whitespace-pre-line">
                  {selectedNews.fullContent}
                </p>
              </div>

              {/* Alt Bar */}
              <div className="px-5 py-3 sm:px-8 sm:py-4 border-t border-white/5 flex items-center justify-between bg-black/20">
                <p className="text-[10px] sm:text-xs text-gray-500">{companyInfo.name} Haber Merkezi</p>
                <button
                  onClick={() => setSelectedNews(null)}
                  className="px-4 py-2 sm:px-5 sm:py-2.5 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl text-xs sm:text-sm font-semibold text-white transition-colors"
                >
                  Kapat
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
           TÜM HABERLER MODALI
         ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showAllNews && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAllNews(false)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-[110]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-2xl sm:max-h-[85vh] z-[120] bg-[#111] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-500/20 flex items-center justify-center">
                    <Newspaper className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-xl font-bold text-white">Tüm Haberler</h3>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">{NEWS_ITEMS.length} haber bulundu</p>
                  </div>
                </div>
                <button onClick={() => setShowAllNews(false)}
                  className="p-2 sm:p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                </button>
              </div>

              {/* Haberler Listesi */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4">
                {NEWS_ITEMS.map((news) => (
                  <motion.div
                    key={news.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => { setShowAllNews(false); setSelectedNews(news); }}
                    className="flex gap-3 sm:gap-5 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/5 transition-all cursor-pointer group"
                  >
                    <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-lg sm:rounded-xl overflow-hidden flex-shrink-0">
                      <img src={news.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    </div>
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <span className="text-[9px] sm:text-[10px] font-bold text-blue-400 mb-1 tracking-wider uppercase">
                        {news.category} &bull; {news.date}
                      </span>
                      <h4 className="text-sm sm:text-base font-bold text-white mb-1 sm:mb-2 group-hover:text-blue-400 transition-colors">
                        {news.title}
                      </h4>
                      <p className="text-[11px] sm:text-sm text-muted-foreground line-clamp-2">{news.desc}</p>
                      <span className="mt-2 text-[10px] sm:text-xs text-blue-400 font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        Devamını Oku <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
           ÜRÜN DETAY MODALI
         ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedProduct && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              className="fixed inset-3 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-3xl sm:max-h-[90vh] z-[120] bg-[#0d0d0d] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Product Hero Image */}
              <div className="relative w-full h-44 sm:h-56 lg:h-72 flex-shrink-0">
                <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-black/50 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0d0d0d]/60 to-transparent" />

                <button
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 sm:p-2.5 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-xl transition-colors border border-white/10"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </button>

                {/* Badge */}
                {selectedProduct.badge && (
                  <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
                    <span className={`px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold rounded-lg border ${BADGE_COLORS[selectedProduct.badgeColor] || BADGE_COLORS.blue}`}>
                      {selectedProduct.badge}
                    </span>
                  </div>
                )}

                {/* Title & Price overlay */}
                <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 right-4 sm:right-6">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 sm:gap-4">
                    <div>
                      <p className="text-[10px] sm:text-xs text-red-400 font-bold uppercase tracking-wider mb-1">{selectedProduct.origin} • {selectedProduct.cutType}</p>
                      <h2 className="text-xl sm:text-3xl font-extrabold text-white leading-tight drop-shadow-lg">{selectedProduct.name}</h2>
                    </div>
                    <div className="flex-shrink-0 px-3 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 text-center">
                      <p className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-0.5">Ort. Fiyat</p>
                      <p className="text-xl sm:text-3xl font-black text-white">₺{selectedProduct.avgPrice}</p>
                      <p className="text-[9px] sm:text-[10px] text-gray-400">/ {selectedProduct.priceUnit}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 space-y-4 sm:space-y-5">

                {/* Price Range Bar */}
                {selectedProduct.priceRange.min > 0 && (
                  <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/5 border border-white/5">
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider">Fiyat Aralığı</span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground">Son 30 gün ortalaması</span>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <span className="text-sm sm:text-base font-bold text-emerald-400">₺{selectedProduct.priceRange.min}</span>
                      <div className="flex-1 h-2 sm:h-2.5 bg-black/40 rounded-full overflow-hidden relative">
                        <div className="absolute inset-y-0 bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 rounded-full"
                          style={{
                            left: '0%',
                            right: '0%',
                          }}
                        />
                        {/* Average marker */}
                        <div
                          className="absolute top-[-3px] w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full border-2 border-red-500 shadow-lg"
                          style={{
                            left: `${((selectedProduct.avgPrice - selectedProduct.priceRange.min) / (selectedProduct.priceRange.max - selectedProduct.priceRange.min)) * 100}%`,
                            transform: 'translateX(-50%)',
                          }}
                        />
                      </div>
                      <span className="text-sm sm:text-base font-bold text-red-400">₺{selectedProduct.priceRange.max}</span>
                    </div>
                    <p className="text-center text-[10px] sm:text-xs text-gray-500 mt-1.5 sm:mt-2">
                      Ortalama: <span className="text-white font-bold">₺{selectedProduct.avgPrice}</span> / {selectedProduct.priceUnit}
                    </p>
                  </div>
                )}

                {/* Nutrition Cards */}
                {selectedProduct.protein > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-orange-500/10 border border-orange-500/20 text-center">
                      <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 mx-auto mb-1" />
                      <p className="text-base sm:text-xl font-black text-white">{selectedProduct.calories}</p>
                      <p className="text-[9px] sm:text-[10px] text-orange-300/70 font-bold uppercase">Kalori</p>
                    </div>
                    <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-red-500/10 border border-red-500/20 text-center">
                      <Beef className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 mx-auto mb-1" />
                      <p className="text-base sm:text-xl font-black text-white">{selectedProduct.protein}g</p>
                      <p className="text-[9px] sm:text-[10px] text-red-300/70 font-bold uppercase">Protein</p>
                    </div>
                    <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center">
                      <Weight className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 mx-auto mb-1" />
                      <p className="text-base sm:text-xl font-black text-white">{selectedProduct.fat}g</p>
                      <p className="text-[9px] sm:text-[10px] text-amber-300/70 font-bold uppercase">Yağ</p>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white mb-1.5 sm:mb-2 flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
                    Ürün Hakkında
                  </h4>
                  <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">{selectedProduct.longDescription}</p>
                </div>

                {/* Chef Tips */}
                {selectedProduct.tips && (
                  <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20">
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                        <ChefHat className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-bold text-orange-400 mb-0.5 sm:mb-1">Şefin Önerisi</p>
                        <p className="text-[11px] sm:text-xs text-orange-200/80 leading-relaxed">{selectedProduct.tips}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Product Info Grid */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/5">
                    <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
                    <div>
                      <p className="text-[9px] sm:text-[10px] text-gray-500">Kategori</p>
                      <p className="text-xs sm:text-sm font-semibold text-white capitalize">{selectedProduct.category === 'islenmiş' ? 'İşlenmiş' : selectedProduct.category === 'dana' ? 'Dana Eti' : selectedProduct.category === 'kuzu' ? 'Kuzu Eti' : 'Tavuk'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/5">
                    <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
                    <div>
                      <p className="text-[9px] sm:text-[10px] text-gray-500">Kesim Tipi</p>
                      <p className="text-xs sm:text-sm font-semibold text-white">{selectedProduct.cutType || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/5">
                    <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
                    <div>
                      <p className="text-[9px] sm:text-[10px] text-gray-500">Menşei</p>
                      <p className="text-xs sm:text-sm font-semibold text-white">{selectedProduct.origin || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/5">
                    <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
                    <div>
                      <p className="text-[9px] sm:text-[10px] text-gray-500">Stok Durumu</p>
                      <p className={`text-xs sm:text-sm font-semibold ${selectedProduct.inStock ? 'text-emerald-400' : 'text-red-400'}`}>
                        {selectedProduct.inStock ? 'Stokta Var' : 'Tükendi'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-white/5 bg-black/30">
                <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-500 mb-3">
                  <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Sipariş için: <span className="text-white font-semibold">0850 XXX XX XX</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { if (selectedProduct) addToCart(selectedProduct); setSelectedProduct(null); }}
                    className="flex-1 py-2.5 sm:py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 active:from-red-700 active:to-orange-700 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Sepete Ekle
                  </button>
                  <button
                    onClick={() => { if (selectedProduct && !cart.find(c => c.product.id === selectedProduct.id)) addToCart(selectedProduct); setSelectedProduct(null); setShowQuoteForm(true); }}
                    className="flex-1 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 active:from-blue-700 active:to-cyan-700 rounded-xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
                  >
                    <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Teklif İste
                  </button>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="px-4 py-2.5 sm:py-3 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl text-xs sm:text-sm font-semibold text-gray-400 transition-colors"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
           FLOATING CART BUTTON
         ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {cartCount > 0 && !showAdminPanel && !showCart && !showQuoteForm && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowCart(true)}
            className="fixed bottom-20 sm:bottom-8 right-4 sm:right-8 z-[80] w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-red-600 to-orange-600 shadow-2xl shadow-red-600/40 flex items-center justify-center text-white"
          >
            <ShoppingBag className="w-6 h-6 sm:w-7 sm:h-7" />
            <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white text-red-600 text-xs font-black flex items-center justify-center shadow-lg">
              {cartCount}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
           CART MODAL
         ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCart(false)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-[110]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              className="fixed inset-3 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:max-h-[85vh] z-[120] bg-[#0d0d0d] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-red-500/20 flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white">Sepetim</h3>
                    <p className="text-[10px] sm:text-xs text-gray-500">{cartCount} ürün</p>
                  </div>
                </div>
                <button onClick={() => setShowCart(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                </button>
              </div>

              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                {cart.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingBag className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Sepetiniz boş</p>
                    <p className="text-xs text-gray-600 mt-1">Katalogdan ürün ekleyerek başlayın</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.product.id} className="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                      <img src={item.product.image} alt={item.product.name} className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">{item.product.name}</h4>
                        <p className="text-xs text-gray-500">{item.product.origin}</p>
                        <p className="text-sm font-bold text-red-400 mt-1">₺{item.product.avgPrice}/{item.product.priceUnit}</p>
                      </div>
                      <div className="flex flex-col items-end justify-between">
                        <button onClick={() => removeFromCart(item.product.id)} className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex items-center gap-1.5 bg-black/40 rounded-lg border border-white/10 p-0.5">
                          <button onClick={() => updateCartQty(item.product.id, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold text-white w-6 text-center">{item.quantity}</span>
                          <button onClick={() => updateCartQty(item.product.id, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              {cart.length > 0 && (
                <div className="px-4 py-4 sm:px-5 sm:py-5 border-t border-white/10 bg-black/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400 font-medium">Tahmini Toplam</span>
                    <span className="text-xl font-black text-white">₺{cartTotal.toLocaleString('tr-TR')}</span>
                  </div>
                  <p className="text-[10px] text-gray-600">* Fiyatlar tahminidir, kesin fiyat teklif aşamasında belirlenir.</p>
                  <button
                    onClick={() => { setShowCart(false); setShowQuoteForm(true); }}
                    className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 active:from-blue-700 active:to-cyan-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
                  >
                    <Send className="w-4 h-4" />
                    Teklif İste
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
           QUOTE REQUEST FORM MODAL
         ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showQuoteForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (!quoteSent) setShowQuoteForm(false); }}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-[110]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: 'spring', stiffness: 200, damping: 30 }}
              className="fixed inset-3 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:max-h-[85vh] z-[120] bg-[#0d0d0d] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              {quoteSent ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                    className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mb-5"
                  >
                    <CheckCircle className="w-10 h-10 text-emerald-400" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-white mb-2">Talebiniz Alındı!</h3>
                  <p className="text-sm text-gray-400 max-w-sm">En kısa sürede müşteri temsilcimiz sizinle iletişime geçecektir. Teşekkür ederiz!</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-500/20 flex items-center justify-center">
                        <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-white">Teklif Talebi</h3>
                        <p className="text-[10px] sm:text-xs text-gray-500">{cart.length > 0 ? `${cartCount} ürün • ₺${cartTotal.toLocaleString('tr-TR')}` : 'Bilgilerinizi doldurun'}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowQuoteForm(false)} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                      <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Cart Summary */}
                  {cart.length > 0 && (
                    <div className="px-5 py-3 sm:px-6 border-b border-white/5 max-h-32 overflow-y-auto">
                      {cart.map(item => (
                        <div key={item.product.id} className="flex items-center justify-between py-1.5 text-xs">
                          <span className="text-gray-300">{item.product.name} <span className="text-gray-600">x{item.quantity}</span></span>
                          <span className="text-white font-bold">₺{(item.product.avgPrice * item.quantity).toLocaleString('tr-TR')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Form */}
                  <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Ad Soyad *</label>
                      <input
                        type="text" value={quoteForm.name} onChange={e => setQuoteForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Adınız Soyadınız"
                        className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Telefon *</label>
                      <input
                        type="tel" value={quoteForm.phone} onChange={e => setQuoteForm(p => ({ ...p, phone: e.target.value }))}
                        placeholder="05XX XXX XX XX"
                        className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">E-posta</label>
                      <input
                        type="email" value={quoteForm.email} onChange={e => setQuoteForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="ornek@email.com"
                        className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Not / Özel İstek</label>
                      <textarea
                        value={quoteForm.note} onChange={e => setQuoteForm(p => ({ ...p, note: e.target.value }))}
                        placeholder="Teslimat tarihi, miktar detayı vb."
                        rows={3}
                        className="w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
                      />
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="px-5 py-4 sm:px-6 sm:py-5 border-t border-white/10 bg-black/30">
                    <button
                      onClick={handleQuoteSubmit}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 active:from-blue-700 active:to-cyan-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
                    >
                      <Send className="w-4 h-4" />
                      Teklif Talebini Gönder
                    </button>
                    <p className="text-[10px] text-gray-600 text-center mt-2">Bilgileriniz gizlilik politikamız kapsamında korunmaktadır.</p>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}