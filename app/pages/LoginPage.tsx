import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import {
  Lock, User, AlertCircle, Sparkles, X, Shield, Clock,
  ChefHat, Percent, Newspaper, MapPin, Phone,
  ChevronRight, UtensilsCrossed, Info, ArrowRight,
  ShoppingBag, Tag, Star, Weight, Flame, Eye, EyeOff,
  Award, Truck, Package, Search, Beef,
  KeyRound, LogIn, ShieldCheck, Loader2,
  FileText, Minus, Plus, Send, CheckCircle,
  History, Zap, Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { getFromStorage, StorageKey } from '../utils/storage';
import { logActivity } from '../utils/activityLogger';
import { useLanguage } from '../contexts/LanguageContext';
import { trackVitrinEvent } from '../utils/vitrinAnalytics';
import { CHANGELOG, CURRENT_VERSION, type ChangeType } from '../data/changelog';

// ─── Cart Item type ──────────────────────────────────────────────
interface CartItem {
  product: CatalogProduct;
  quantity: number;
}

// ─── Default Banners (fallback) ───────────────────────────────────
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

// ─── Pazarlama stat renk/ikon eşlemesi ────────────────────────────
const STAT_COLORS: Record<string, { icon: string; bg: string }> = {
  blue:    { icon: 'text-blue-400',    bg: 'border-blue-500/20 bg-blue-500/[0.07]' },
  emerald: { icon: 'text-emerald-400', bg: 'border-emerald-500/20 bg-emerald-500/[0.07]' },
  purple:  { icon: 'text-purple-400',  bg: 'border-purple-500/20 bg-purple-500/[0.07]' },
  orange:  { icon: 'text-orange-400',  bg: 'border-orange-500/20 bg-orange-500/[0.07]' },
  red:     { icon: 'text-red-400',     bg: 'border-red-500/20 bg-red-500/[0.07]' },
  amber:   { icon: 'text-amber-400',   bg: 'border-amber-500/20 bg-amber-500/[0.07]' },
};

function getStatIcon(key: string, cls: string) {
  const p = { className: `w-5 h-5 ${cls}` };
  switch (key) {
    case 'users':   return <User {...p} />;
    case 'package': return <Package {...p} />;
    case 'truck':   return <Truck {...p} />;
    case 'shield':  return <Shield {...p} />;
    case 'star':    return <Star {...p} />;
    case 'zap':     return <Zap {...p} />;
    case 'percent': return <Percent {...p} />;
    default:        return <Award {...p} />;
  }
}

const DEFAULT_FEATURE_CARDS = [
  { icon: <Percent className="w-5 h-5 text-red-400" />,    bg: 'border-red-500/20 bg-red-500/[0.07]',     title: '%10 Nakit İndirim',   sub: 'Tüm alımlarda geçerli' },
  { icon: <Truck className="w-5 h-5 text-amber-400" />,    bg: 'border-amber-500/20 bg-amber-500/[0.07]', title: 'Aynı Gün Teslimat',   sub: 'Frigofirik araçlarla' },
  { icon: <Shield className="w-5 h-5 text-emerald-400" />, bg: 'border-emerald-500/20 bg-emerald-500/[0.07]', title: 'ISO 22000 & HACCP', sub: 'Uluslararası standart' },
  { icon: <Award className="w-5 h-5 text-blue-400" />,     bg: 'border-blue-500/20 bg-blue-500/[0.07]',   title: '2500+ Müşteri',       sub: '15 yıllık deneyim' },
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

// ─── Changelog Modal ─────────────────────────────────────────────
const CHANGE_META: Record<ChangeType, { label: string; icon: React.ReactNode; classes: string }> = {
  yenilik:      { label: 'Yenilik',      icon: <Sparkles className="w-3 h-3" />,  classes: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  iyileştirme:  { label: 'İyileştirme',  icon: <Zap className="w-3 h-3" />,       classes: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  düzeltme:     { label: 'Düzeltme',     icon: <Wrench className="w-3 h-3" />,     classes: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  güvenlik:     { label: 'Güvenlik',     icon: <Shield className="w-3 h-3" />,     classes: 'bg-red-500/10 text-red-300 border-red-500/20' },
};

function ChangelogModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150]"
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 260, damping: 32 }}
        className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:max-h-[82vh] z-[160] flex flex-col overflow-hidden rounded-2xl bg-[#0d111b] border border-white/[0.08] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <History className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm leading-tight">Sürüm Geçmişi</h3>
              <p className="text-white/30 text-[10px]">
                Güncel sürüm: <span className="text-blue-400 font-semibold">v{CURRENT_VERSION.version} {CURRENT_VERSION.codename}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/[0.05] bg-white/[0.02] flex-shrink-0">
          {(Object.entries(CHANGE_META) as [ChangeType, typeof CHANGE_META[ChangeType]][]).map(([key, meta]) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${meta.classes}`}
            >
              {meta.icon} {meta.label}
            </span>
          ))}
        </div>

        {/* Changelog list */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.05]">
          {CHANGELOG.map((entry, i) => (
            <div key={entry.version} className="px-5 py-4">
              {/* Versiyon başlığı */}
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black tracking-wide ${
                    i === 0
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/[0.07] text-white/60'
                  }`}>
                    v{entry.version}
                  </span>
                  <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                    {entry.codename}
                  </span>
                </div>
                {i === 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/25 rounded-md text-[9px] font-bold text-emerald-400 uppercase tracking-widest">
                    Güncel
                  </span>
                )}
                <span className="ml-auto text-[10px] text-white/25">{entry.date}</span>
              </div>

              {/* Özet */}
              <p className="text-white/50 text-[11px] mb-3 leading-relaxed">{entry.summary}</p>

              {/* Değişiklikler */}
              <div className="space-y-1.5">
                {entry.changes.map((change, j) => {
                  const meta = CHANGE_META[change.type];
                  return (
                    <div key={j} className="flex items-start gap-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold flex-shrink-0 mt-0.5 ${meta.classes}`}>
                        {meta.icon}
                      </span>
                      <span className="text-[11px] text-white/55 leading-relaxed">{change.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.07] bg-black/20 flex-shrink-0">
          <p className="text-[10px] text-white/20 text-center">
            Tüm sürümler kayıt altındadır · İŞLEYEN ET Yönetim Sistemi
          </p>
        </div>
      </motion.div>
    </>
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
    <div className="relative w-full h-full overflow-hidden">
      {/* Slide görselleri */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          <img
            src={banners[current]?.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
          {/* TEK katman overlay — iç içe gradient yok */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/20 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Alt içerik: başlık + slide indicators */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 sm:px-7 sm:pb-7 lg:px-10 lg:pb-9 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={`text-${current}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, delay: 0.15 }}
          >
            {/* Kategori etiketi — pill değil, temiz chip */}
            <div className="inline-flex items-center gap-1.5 mb-2.5 sm:mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs font-bold text-blue-300 tracking-widest uppercase">
                ÖNE ÇIKAN
              </span>
            </div>
            <h2 className="text-lg sm:text-2xl lg:text-[2rem] font-extrabold text-white leading-tight mb-1.5 sm:mb-2 max-w-xs sm:max-w-sm">
              {banners[current]?.title}
            </h2>
            <p className="text-white/60 text-xs sm:text-sm max-w-xs sm:max-w-sm leading-relaxed line-clamp-2">
              {banners[current]?.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Slide göstergeleri */}
        {banners.length > 1 && (
          <div className="flex items-center gap-1.5 mt-4 sm:mt-5">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`transition-all duration-300 rounded-full ${
                  i === current
                    ? 'w-6 sm:w-8 h-1.5 bg-blue-400'
                    : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/45'
                }`}
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
  const [showChangelog, setShowChangelog] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminTab, setAdminTab] = useState<'admin' | 'user'>('user');
  const [activeRecipe, setActiveRecipe] = useState(0);

  // ── Gizli admin tetikleyici (logo'ya 5 hızlı tıklama) ──────────────────
  const secretTapCount = React.useRef(0);
  const secretTapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSecretTap = () => {
    secretTapCount.current += 1;
    if (secretTapTimer.current) clearTimeout(secretTapTimer.current);
    if (secretTapCount.current >= 5) {
      secretTapCount.current = 0;
      setAdminTab('admin');
      setError('');
      setAdminPassword('');
      setShowAdminPanel(true);
      return;
    }
    secretTapTimer.current = setTimeout(() => { secretTapCount.current = 0; }, 2500);
  };

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
  const [failedAttemptInfo, setFailedAttemptInfo] = useState<{ ua: string; time: string; ip: string } | null>(null);

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

    // Cihaz / tarayıcı bilgilerini kaydet
    const ua = navigator.userAgent;
    const time = new Date().toLocaleString('tr-TR');
    // IP adresini asenkron olarak al
    fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => setFailedAttemptInfo({ ua, time, ip: d.ip || '-' }))
      .catch(() => setFailedAttemptInfo({ ua, time, ip: 'Alınamadı' }));

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

  // Pazarlama duyurularını yükle — ürün modalında ilgili haberler için kullanılır
  // ── Pazarlama içeriği — banner ve özellik kartları ──────────────
  const pazarlamaContent = useMemo(() => {
    try { return getFromStorage<any>(StorageKey.PAZARLAMA_CONTENT); } catch { return null; }
  }, []);

  const activeBanners = useMemo(() => {
    const banners = pazarlamaContent?.heroBanners?.filter((b: any) => b.active && b.imageUrl);
    return (banners?.length ? banners : DEFAULT_BANNERS) as { id: string; imageUrl: string; title: string; subtitle: string }[];
  }, [pazarlamaContent]);

  const featureCards = useMemo(() => {
    const stats = pazarlamaContent?.stats as Array<{ id: string; icon: string; value: string; label: string; color: string }> | undefined;
    if (stats?.length && stats.length >= 2) {
      return stats.slice(0, 4).map(s => {
        const style = STAT_COLORS[s.color] ?? STAT_COLORS.blue;
        return { icon: getStatIcon(s.icon, style.icon), bg: style.bg, title: s.value, sub: s.label };
      });
    }
    return DEFAULT_FEATURE_CARDS;
  }, [pazarlamaContent]);

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
    <div className="relative h-[100dvh] bg-[#07090f] text-white overflow-hidden font-sans">

      {/* ── Arka plan dekorasyonları ── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_900px_700px_at_-5%_-5%,rgba(127,29,29,0.12)_0%,transparent_65%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_600px_400px_at_105%_105%,rgba(30,58,138,0.07)_0%,transparent_65%)] pointer-events-none" />

      {/* ═════════════════════════════════════════════════
           MOBİL LAYOUT  (lg altı)
         ═════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:hidden h-full">

        {/* Üst header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06] bg-black/50 backdrop-blur-sm flex-shrink-0">
          <div
            onClick={handleSecretTap}
            className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-800 to-red-950 border border-red-700/40 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-900/40 cursor-default select-none"
          >
            <Beef className="w-5.5 h-5.5 text-red-200" />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-black text-base leading-none tracking-tight truncate">{companyInfo.name}</h1>
            <p className="text-white/30 text-[11px] mt-0.5 truncate">{companyInfo.slogan}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-white/20 font-medium">Güvenli</span>
          </div>
        </div>

        {/* Form alanı */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          {/* Hoşgeldiniz */}
          <div className="mb-1">
            <h2 className="text-xl font-bold text-white">Hoş Geldiniz</h2>
            <p className="text-white/35 text-sm mt-0.5">Hesabınızla giriş yapın</p>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03]">
            <button
              onClick={() => { setAdminTab('user'); setError(''); setShowPassword(false); }}
              className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${adminTab === 'user' ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
            >
              <User className="w-3.5 h-3.5" /> Personel
            </button>
            <button
              onClick={() => { setAdminTab('admin'); setError(''); setShowAdminPw(false); }}
              className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 border-l border-white/[0.08] transition-colors ${adminTab === 'admin' ? 'bg-red-700 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Yönetici
            </button>
          </div>

          {/* Hata */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-red-300 text-sm leading-relaxed">{error}</p>
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

          {/* Kilit ekranı */}
          {lockoutUntil && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="p-6 rounded-2xl border border-red-500/30 bg-red-950/30 text-center">
              <div className="w-14 h-14 rounded-full border-2 border-red-500/30 bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-red-400 font-bold text-sm mb-1">Güvenlik Kilidi</p>
              <div className="font-mono text-3xl font-black text-white tabular-nums">
                {Math.floor(lockoutRemaining / 60).toString().padStart(2, '0')}
                <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} className="text-red-400 mx-1">:</motion.span>
                {(lockoutRemaining % 60).toString().padStart(2, '0')}
              </div>
            </motion.div>
          )}

          {/* Personel formu */}
          {!lockoutUntil && adminTab === 'user' && (
            <motion.form key="mob-user" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 28 }} onSubmit={handleSubmit} className="space-y-4">
              <div className="relative flex items-center bg-white/[0.04] border border-white/10 rounded-xl focus-within:border-blue-500/50 transition-colors">
                <User className="w-4.5 h-4.5 text-gray-600 ml-4 flex-shrink-0 focus-within:text-blue-400" />
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder={t('auth.enterUsername')} required autoFocus
                  className="flex-1 bg-transparent py-3.5 px-3 text-white placeholder-gray-600 focus:outline-none text-sm" />
              </div>
              <div className="relative flex items-center bg-white/[0.04] border border-white/10 rounded-xl focus-within:border-blue-500/50 transition-colors">
                <Lock className="w-4.5 h-4.5 text-gray-600 ml-4 flex-shrink-0" />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.enterPassword')} required
                  className="flex-1 bg-transparent py-3.5 px-3 text-white placeholder-gray-600 focus:outline-none text-sm" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="pr-4 pl-2 text-gray-600 hover:text-gray-300 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <motion.button type="submit" disabled={isLoading} whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/25">
                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Giriş Yapılıyor...</> : <><LogIn className="w-4 h-4" /> Giriş Yap</>}
              </motion.button>
            </motion.form>
          )}

          {/* Yönetici formu */}
          {!lockoutUntil && adminTab === 'admin' && (
            <motion.form key="mob-admin" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 28 }} onSubmit={handleAdminLogin} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-red-500/5 border border-red-500/15 text-xs text-red-300/70 flex items-start gap-2">
                <Shield className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                Yüksek güvenlik alanı. Yetkisiz erişimler kayıt altına alınır.
              </div>
              <div className="relative flex items-center bg-white/[0.04] border border-red-500/20 rounded-xl focus-within:border-red-500/50 transition-colors">
                <Lock className="w-4.5 h-4.5 text-red-500/40 ml-4 flex-shrink-0" />
                <input type={showAdminPw ? 'text' : 'password'} value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                  placeholder="Yönetici şifresi" required autoFocus
                  className="flex-1 bg-transparent py-3.5 px-3 text-white placeholder-gray-600 focus:outline-none text-sm" />
                <button type="button" onClick={() => setShowAdminPw(!showAdminPw)} className="pr-4 pl-2 text-gray-600 hover:text-gray-300 transition-colors">
                  {showAdminPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <motion.button type="submit" disabled={isLoading} whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 bg-gradient-to-r from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-700/25">
                {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Doğrulanıyor...</> : <><ShieldCheck className="w-4 h-4" /> Yönetici Girişi</>}
              </motion.button>
            </motion.form>
          )}

        </div>

        {/* Alt trust bar */}
        <div className="flex-shrink-0 border-t border-white/[0.05] bg-black/50 backdrop-blur-sm px-5 py-3 flex items-center justify-center gap-4"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {[
            { icon: <Shield className="w-3 h-3" />, text: 'ISO 22000' },
            { icon: <Award className="w-3 h-3" />, text: '15+ Yıl' },
            { icon: <Truck className="w-3 h-3" />, text: 'Aynı Gün' },
            { icon: <Package className="w-3 h-3" />, text: 'Soğuk Zincir' },
          ].map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="w-px h-3 bg-white/10" />}
              <span className="flex items-center gap-1 text-[10px] text-white/25 font-medium whitespace-nowrap">
                <span className="text-white/20">{item.icon}</span>{item.text}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════
           DESKTOP LAYOUT  (lg+)
         ═════════════════════════════════════════════════ */}
      <div className="hidden lg:flex h-full">

        {/* ── Sol Panel: Marka ── */}
        <div className="w-[46%] xl:w-[44%] h-full flex flex-col relative overflow-hidden border-r border-white/[0.04]">

          {/* Arka plan katmanları */}
          <div className="absolute inset-0 bg-gradient-to-br from-red-950/50 via-[#07090f] to-[#07090f]" />
          <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-red-900/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 w-64 h-64 rounded-full bg-red-950/20 blur-3xl" />
          {/* Dekoratif çizgiler */}
          <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: 'repeating-linear-gradient(135deg, white 0px, white 1px, transparent 1px, transparent 60px)'}} />

          <div className="relative z-10 flex flex-col h-full p-10 xl:p-12">

            {/* Logo + marka */}
            <div className="flex items-center gap-4 flex-shrink-0">
              <div
                onClick={handleSecretTap}
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-800 to-red-950 border border-red-700/30 flex items-center justify-center shadow-2xl shadow-red-900/50 cursor-default select-none flex-shrink-0"
              >
                <Beef className="w-7 h-7 text-red-200" />
              </div>
              <div>
                <h1 className="text-white font-black text-xl leading-none tracking-tight">{companyInfo.name}</h1>
                <p className="text-red-300/40 text-xs mt-1 font-medium">{companyInfo.slogan}</p>
              </div>
            </div>

            {/* Ana mesaj */}
            <div className="flex-1 flex flex-col justify-center py-10">
              <p className="text-red-400/60 text-xs font-bold uppercase tracking-[0.2em] mb-4">TÜRKİYE'NİN GÜVENİLİR ET TEDARİKÇİSİ</p>
              <h2 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] mb-5">
                Kalite ve<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">Güven</span><br />
                Her Pakette.
              </h2>
              <p className="text-white/30 text-sm leading-relaxed max-w-xs">
                ISO 22000 sertifikalı tesislerimizde, soğuk zincir hiçbir aşamada kırılmadan üretim yapıyoruz. 
                15 yıllık deneyim ve 2500+ mutlu müşteri güvencesiyle yanınızdayız.
              </p>
            </div>

            {/* Stat kartları */}
            <div className="grid grid-cols-2 gap-3 mb-8 flex-shrink-0">
              {featureCards.map((card, i) => (
                <div key={i} className={`flex items-center gap-3 p-3.5 rounded-xl border ${card.bg}`}>
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                    {card.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-bold leading-none truncate">{card.title}</p>
                    <p className="text-white/30 text-[11px] mt-0.5 truncate">{card.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Alt trust bar */}
            <div className="flex items-center gap-5 pt-6 border-t border-white/[0.06] flex-shrink-0">
              {[
                { icon: <Shield className="w-3.5 h-3.5" />, text: 'ISO 22000' },
                { icon: <Award className="w-3.5 h-3.5" />, text: '15+ Yıl Deneyim' },
                { icon: <Truck className="w-3.5 h-3.5" />, text: 'Aynı Gün Teslimat' },
                { icon: <Package className="w-3.5 h-3.5" />, text: 'Soğuk Zincir' },
              ].map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="w-px h-3 bg-white/8 flex-shrink-0" />}
                  <span className="flex items-center gap-1.5 text-[11px] text-white/25 font-medium whitespace-nowrap">
                    <span className="text-white/20">{item.icon}</span>{item.text}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sağ Panel: Giriş Formu ── */}
        <div className="flex-1 flex items-center justify-center p-10 xl:p-14">
          <div className="w-full max-w-[420px]">

            {/* Başlık */}
            <div className="mb-8">
              <h3 className="text-2xl font-black text-white tracking-tight">Personel Girişi</h3>
              <p className="text-white/30 text-sm mt-1.5">Kurumsal hesabınızla giriş yapın</p>
            </div>

            {/* Tab switcher */}
            <div className="flex rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] mb-6">
              <button
                onClick={() => { setAdminTab('user'); setError(''); setShowPassword(false); }}
                className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${adminTab === 'user' ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
              >
                <User className="w-3.5 h-3.5" /> Personel
              </button>
              <button
                onClick={() => { setAdminTab('admin'); setError(''); setShowAdminPw(false); }}
                className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 border-l border-white/[0.08] transition-colors ${adminTab === 'admin' ? 'bg-red-700 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Yönetici
              </button>
            </div>

            {/* Hata */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-red-300 text-sm leading-relaxed">{error}</p>
                    {attempts > 0 && !lockoutUntil && (
                      <div className="flex gap-1 mt-2">
                        {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < attempts ? 'bg-red-500' : 'bg-white/10'}`} />
                        ))}
                      </div>
                    )}
                    {failedAttemptInfo && (
                      <div className="mt-2 pt-2 border-t border-red-500/15 space-y-0.5">
                        <p className="text-[10px] text-red-300/50 font-mono"><span className="text-red-400/70">IP:</span> {failedAttemptInfo.ip}</p>
                        <p className="text-[10px] text-red-300/50 font-mono break-all"><span className="text-red-400/70">Cihaz:</span> {failedAttemptInfo.ua.substring(0, 60)}{failedAttemptInfo.ua.length > 60 ? '…' : ''}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Kilit */}
            {lockoutUntil && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="mb-6 p-8 rounded-2xl border border-red-500/30 bg-red-950/30 text-center">
                <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }}
                  className="w-16 h-16 rounded-full border-2 border-red-500/30 bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-7 h-7 text-red-500" />
                </motion.div>
                <h4 className="text-lg font-extrabold text-red-400 mb-1">Güvenlik Kilidi</h4>
                <p className="text-xs text-red-300/60 mb-4">Çok fazla hatalı deneme yapıldı</p>
                <div className="inline-flex items-center gap-1 px-6 py-3 rounded-2xl bg-black/40 border border-red-500/20 font-mono text-4xl font-black text-white tabular-nums">
                  {Math.floor(lockoutRemaining / 60).toString().padStart(2, '0')}
                  <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} className="text-red-400 mx-1">:</motion.span>
                  {(lockoutRemaining % 60).toString().padStart(2, '0')}
                </div>
              </motion.div>
            )}

            {/* Personel formu */}
            {!lockoutUntil && adminTab === 'user' && (
              <motion.form key="desk-user" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 28 }} onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3 h-3" /> {t('auth.username')}
                  </label>
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600/15 to-cyan-600/15 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                    <div className="relative flex items-center bg-white/[0.04] border border-white/10 rounded-2xl group-focus-within:border-blue-500/50 transition-colors">
                      <div className="pl-4 pr-2 py-4 text-gray-600 group-focus-within:text-blue-400 transition-colors"><User className="w-5 h-5" /></div>
                      <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                        placeholder={t('auth.enterUsername')} required autoFocus
                        className="flex-1 bg-transparent py-4 pr-4 text-white placeholder-gray-600 focus:outline-none text-sm font-medium" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <KeyRound className="w-3 h-3" /> {t('auth.password')}
                  </label>
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600/15 to-cyan-600/15 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                    <div className="relative flex items-center bg-white/[0.04] border border-white/10 rounded-2xl group-focus-within:border-blue-500/50 transition-colors">
                      <div className="pl-4 pr-2 py-4 text-gray-600 group-focus-within:text-blue-400 transition-colors"><Lock className="w-5 h-5" /></div>
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder={t('auth.enterPassword')} required
                        className="flex-1 bg-transparent py-4 pr-2 text-white placeholder-gray-600 focus:outline-none text-sm font-medium" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="pr-4 pl-2 py-4 text-gray-600 hover:text-gray-300 transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <motion.button type="submit" disabled={isLoading} whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.98 }}
                  className="w-full py-4 mt-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-600/20 text-base flex items-center justify-center gap-2.5 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/8 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Giriş Yapılıyor...</> : <><LogIn className="w-5 h-5" /> Giriş Yap</>}
                </motion.button>
                <p className="text-[11px] text-gray-600 text-center leading-relaxed">
                  Hesap bilgileriniz için sistem yöneticinizle iletişime geçin.
                </p>
              </motion.form>
            )}

            {/* Yönetici formu */}
            {!lockoutUntil && adminTab === 'admin' && (
              <motion.form key="desk-admin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 28 }} onSubmit={handleAdminLogin} className="space-y-4">
                <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500/5 to-orange-500/5 border border-red-500/15">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Shield className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                      <p className="text-red-400 text-xs font-bold mb-0.5">Yüksek Güvenlik Alanı</p>
                      <p className="text-red-300/50 text-[11px] leading-relaxed">Bu alan sadece sistem yöneticileri içindir. Yetkisiz erişim girişimleri kayıt altına alınmaktadır.</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <KeyRound className="w-3 h-3" /> Yönetici Şifresi
                  </label>
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600/15 to-orange-600/15 rounded-2xl opacity-0 group-focus-within:opacity-100 blur transition-opacity" />
                    <div className="relative flex items-center bg-white/[0.04] border border-red-500/20 rounded-2xl group-focus-within:border-red-500/50 transition-colors">
                      <div className="pl-4 pr-2 py-4 text-red-500/40 group-focus-within:text-red-400 transition-colors"><Lock className="w-5 h-5" /></div>
                      <input type={showAdminPw ? 'text' : 'password'} value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                        placeholder="Admin şifresini girin" required autoFocus
                        className="flex-1 bg-transparent py-4 pr-2 text-white placeholder-gray-600 focus:outline-none text-sm font-medium" />
                      <button type="button" onClick={() => setShowAdminPw(!showAdminPw)} className="pr-4 pl-2 py-4 text-gray-600 hover:text-gray-300 transition-colors">
                        {showAdminPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <motion.button type="submit" disabled={isLoading} whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.98 }}
                  className="w-full py-4 mt-2 bg-gradient-to-r from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-red-700/20 text-base flex items-center justify-center gap-2.5 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/8 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Doğrulanıyor...</> : <><ShieldCheck className="w-5 h-5" /> Yönetici Girişi Yap</>}
                </motion.button>
              </motion.form>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-white/20 font-medium">Güvenli Bağlantı</span>
              </div>
              <button onClick={() => setShowChangelog(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/15 transition-colors group">
                <History className="w-3 h-3 text-blue-400/50 group-hover:text-blue-400 transition-colors" />
                <span className="text-[10px] font-bold text-blue-400/50 group-hover:text-blue-400 transition-colors">v{CURRENT_VERSION.version} {CURRENT_VERSION.codename}</span>
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ═════════════ CHANGELOG MODALİ ═════════════ */}
      <AnimatePresence>
        {showChangelog && (
          <ChangelogModal onClose={() => setShowChangelog(false)} />
        )}
      </AnimatePresence>

    </div>
  );
}
