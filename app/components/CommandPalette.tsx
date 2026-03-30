import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Wallet,
  Truck,
  UserCog,
  FileText,
  Receipt,
  FolderOpen,
  Database,
  MessageSquare,
  Settings,
  Banknote,
  ArrowRight,
  Command,
  Building2,
  BarChart3,
  CalendarCheck,
  FileCheck,
  CreditCard,
  Factory,
  TrendingUp,
  Shield,
  Bell,
  MapPin,
} from 'lucide-react';
import { getFromStorage, StorageKey } from '../utils/storage';

interface SearchResult {
  id: string;
  type: 'page' | 'cari' | 'product' | 'fis' | 'action';
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  path?: string;
  action?: () => void;
  color?: string;
}

const PAGES: SearchResult[] = [
  { id: 'p-dashboard', type: 'page', title: 'Dashboard', subtitle: 'Ana kontrol paneli', icon: LayoutDashboard, path: '/dashboard', color: 'text-blue-400' },
  { id: 'p-sales', type: 'page', title: 'Satış / Alış / Gider', subtitle: 'Fiş oluştur', icon: ShoppingCart, path: '/sales', color: 'text-green-400' },
  { id: 'p-stok', type: 'page', title: 'Stok Yönetimi', subtitle: 'Ürünler ve stok hareketleri', icon: Package, path: '/stok', color: 'text-indigo-400' },
  { id: 'p-stok-hareket', type: 'page', title: 'Stok Hareket Geçmişi', subtitle: 'Giriş/çıkış/iade log', icon: Package, path: '/stok-hareket', color: 'text-cyan-400' },
  { id: 'p-cari', type: 'page', title: 'Cari Hesaplar', subtitle: 'Müşteri ve toptancılar', icon: Users, path: '/cari', color: 'text-sky-400' },
  { id: 'p-kasa', type: 'page', title: 'Kasa', subtitle: 'Gelir gider takibi', icon: Wallet, path: '/kasa', color: 'text-emerald-400' },
  { id: 'p-tahsilat', type: 'page', title: 'Tahsilat', subtitle: 'Ödeme alma işlemleri', icon: Banknote, path: '/tahsilat', color: 'text-lime-400' },
  { id: 'p-arac', type: 'page', title: 'Araçlar', subtitle: 'Araç takip ve yönetim', icon: Truck, path: '/arac', color: 'text-orange-400' },
  { id: 'p-personel', type: 'page', title: 'Personel', subtitle: 'Personel yönetimi', icon: UserCog, path: '/personel', color: 'text-purple-400' },
  { id: 'p-raporlar', type: 'page', title: 'Raporlar', subtitle: 'Satış, stok ve cari raporları', icon: BarChart3, path: '/raporlar', color: 'text-cyan-400' },
  { id: 'p-fis', type: 'page', title: 'Fiş Geçmişi', subtitle: 'Tüm fiş kayıtları', icon: Receipt, path: '/fis-gecmisi', color: 'text-amber-400' },
  { id: 'p-faturalar', type: 'page', title: 'Faturalar', subtitle: 'Alış ve satış fatura yönetimi', icon: FileCheck, path: '/faturalar', color: 'text-indigo-400' },
  { id: 'p-gunsonu', type: 'page', title: 'Gün Sonu', subtitle: 'Gün sonu raporu ve kapatma', icon: CalendarCheck, path: '/gun-sonu', color: 'text-rose-400' },
  { id: 'p-dosyalar', type: 'page', title: 'Dosyalar', subtitle: 'Dosya yönetimi', icon: FolderOpen, path: '/dosyalar', color: 'text-teal-400' },
  { id: 'p-yedekler', type: 'page', title: 'Yedekler', subtitle: 'Sistem yedekleri', icon: Database, path: '/yedekler', color: 'text-muted-foreground' },
  { id: 'p-chat', type: 'page', title: 'AI Asistan', subtitle: 'Yapay zeka destekli asistan', icon: MessageSquare, path: '/chat', color: 'text-violet-400' },
  { id: 'p-settings', type: 'page', title: 'Ayarlar', subtitle: 'Sistem ayarları', icon: Settings, path: '/settings', color: 'text-gray-400' },
  { id: 'p-cekler', type: 'page', title: 'Çekler', subtitle: 'Çek yönetimi ve takibi', icon: CreditCard, path: '/cekler', color: 'text-yellow-400' },
  { id: 'p-uretim', type: 'page', title: 'Üretim', subtitle: 'Üretim kayıtları ve profilleri', icon: Factory, path: '/uretim', color: 'text-orange-400' },
  { id: 'p-pazarlama', type: 'page', title: 'Pazarlama', subtitle: 'Kampanya ve içerik yönetimi', icon: TrendingUp, path: '/pazarlama', color: 'text-pink-400' },
  { id: 'p-guvenlik', type: 'page', title: 'Güvenlik', subtitle: 'Güvenlik merkezi ve loglar', icon: Shield, path: '/guvenlik', color: 'text-red-400' },
  { id: 'p-guncelleme', type: 'page', title: 'Güncelleme Notları', subtitle: 'Sürüm geçmişi ve yenilikler', icon: Bell, path: '/guncelleme-notlari', color: 'text-violet-400' },
  { id: 'p-arac-takip', type: 'page', title: 'Araç Takip', subtitle: 'Canlı araç konumu ve rota', icon: MapPin, path: '/arac-takip', color: 'text-cyan-400' },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load dynamic data for search
  const dynamicResults = useMemo(() => {
    if (query.length < 2) return [];

    const results: SearchResult[] = [];
    const q = query.toLowerCase();

    // Search cari
    const cariData = getFromStorage<any[]>(StorageKey.CARI_DATA) || [];
    cariData.forEach(cari => {
      const name = (cari.companyName || '').toLowerCase();
      const contact = (cari.contactPerson || '').toLowerCase();
      const phone = (cari.phone || '').toLowerCase();
      if (name.includes(q) || contact.includes(q) || phone.includes(q)) {
        results.push({
          id: `c-${cari.id}`,
          type: 'cari',
          title: cari.companyName || 'İsimsiz',
          subtitle: `${cari.type || 'Cari'} • ${cari.contactPerson || ''} • ${cari.phone || ''}`,
          icon: cari.type === 'Toptancı' ? Building2 : Users,
          path: `/cari/${cari.id}`,
          color: 'text-sky-400'
        });
      }
    });

    // Search products
    const stokData = getFromStorage<any[]>(StorageKey.STOK_DATA) || [];
    stokData.forEach(product => {
      const name = (product.name || '').toLowerCase();
      const cat = (product.category || '').toLowerCase();
      if (name.includes(q) || cat.includes(q)) {
        results.push({
          id: `s-${product.id}`,
          type: 'product',
          title: product.name || 'İsimsiz Ürün',
          subtitle: `${product.category || ''} • Stok: ${product.currentStock ?? product.current_stock ?? 0} ${product.unit || 'KG'} • Fiyat: ₺${product.sellPrice ?? product.sell_price ?? 0}`,
          icon: Package,
          path: '/stok',
          color: 'text-indigo-400'
        });
      }
    });

    // Search fisler
    const fisData = getFromStorage<any[]>(StorageKey.FISLER) || [];
    fisData.slice(0, 100).forEach(fis => {
      const cariName = (fis.cari?.companyName || fis.description || '').toLowerCase();
      const employee = (fis.employeeName || '').toLowerCase();
      if (cariName.includes(q) || employee.includes(q)) {
        const mode = fis.mode === 'satis' || fis.mode === 'sale' ? 'Satış' : fis.mode === 'alis' ? 'Alış' : 'Gider';
        results.push({
          id: `f-${fis.id}`,
          type: 'fis',
          title: `${mode} Fişi - ${fis.cari?.companyName || fis.description || 'Bilinmeyen'}`,
          subtitle: `₺${fis.total || fis.amount || 0} • ${fis.date ? new Date(fis.date).toLocaleDateString('tr-TR') : ''}`,
          icon: Receipt,
          path: '/fis-gecmisi',
          color: 'text-amber-400'
        });
      }
    });

    return results.slice(0, 8);
  }, [query]);

  // Filter pages
  const filteredPages = useMemo(() => {
    if (!query) return PAGES;
    const q = query.toLowerCase();
    return PAGES.filter(p => 
      p.title.toLowerCase().includes(q) || 
      (p.subtitle || '').toLowerCase().includes(q)
    );
  }, [query]);

  const allResults = useMemo(() => {
    return [...filteredPages, ...dynamicResults];
  }, [filteredPages, dynamicResults]);

  // Reset index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allResults.length]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback((result: SearchResult) => {
    if (result.action) {
      result.action();
    } else if (result.path) {
      navigate(result.path);
    }
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, allResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (allResults[selectedIndex]) {
          handleSelect(allResults[selectedIndex]);
        }
        break;
      case 'Escape':
        onClose();
        break;
    }
  }, [allResults, selectedIndex, handleSelect, onClose]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'page': return 'Sayfa';
      case 'cari': return 'Cari';
      case 'product': return 'Ürün';
      case 'fis': return 'Fiş';
      case 'action': return 'İşlem';
      default: return '';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-[640px] z-[201]"
          >
            <div className="glass-strong rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60">
                <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Sayfa, müşteri, ürün veya fiş ara..."
                  className="flex-1 bg-transparent text-white text-base placeholder-muted-foreground/60 outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="flex items-center gap-1.5">
                  <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-muted-foreground bg-secondary/80 border border-border/50 rounded">
                    ESC
                  </kbd>
                </div>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-[400px] overflow-y-auto custom-scrollbar py-2">
                {allResults.length > 0 ? (
                  <>
                    {/* Pages section */}
                    {filteredPages.length > 0 && (
                      <div className="px-3 py-1.5">
                        <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2 mb-1">
                          {query ? 'Eşleşen Sayfalar' : 'Tüm Sayfalar'}
                        </p>
                        {filteredPages.map((result, idx) => {
                          const Icon = result.icon;
                          const globalIdx = idx;
                          return (
                            <button
                              key={result.id}
                              data-index={globalIdx}
                              onClick={() => handleSelect(result)}
                              onMouseEnter={() => setSelectedIndex(globalIdx)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                                selectedIndex === globalIdx 
                                  ? 'bg-blue-600/20 border border-blue-500/30' 
                                  : 'border border-transparent hover:bg-secondary/40'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg bg-secondary/80 flex items-center justify-center flex-shrink-0 ${result.color || 'text-muted-foreground'}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                                {result.subtitle && (
                                  <p className="text-xs text-muted-foreground/70 truncate">{result.subtitle}</p>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground/50 font-medium px-1.5 py-0.5 rounded bg-secondary/50">
                                {getTypeLabel(result.type)}
                              </span>
                              {selectedIndex === globalIdx && (
                                <ArrowRight className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Dynamic results section */}
                    {dynamicResults.length > 0 && (
                      <div className="px-3 py-1.5 border-t border-border/40 mt-1">
                        <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2 mb-1">
                          Veri Sonuçları
                        </p>
                        {dynamicResults.map((result, idx) => {
                          const Icon = result.icon;
                          const globalIdx = filteredPages.length + idx;
                          return (
                            <button
                              key={result.id}
                              data-index={globalIdx}
                              onClick={() => handleSelect(result)}
                              onMouseEnter={() => setSelectedIndex(globalIdx)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                                selectedIndex === globalIdx 
                                  ? 'bg-blue-600/20 border border-blue-500/30' 
                                  : 'border border-transparent hover:bg-secondary/40'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg bg-secondary/80 flex items-center justify-center flex-shrink-0 ${result.color || 'text-muted-foreground'}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                                {result.subtitle && (
                                  <p className="text-xs text-muted-foreground/70 truncate">{result.subtitle}</p>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground/50 font-medium px-1.5 py-0.5 rounded bg-secondary/50">
                                {getTypeLabel(result.type)}
                              </span>
                              {selectedIndex === globalIdx && (
                                <ArrowRight className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-12 text-center">
                    <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">Sonuç bulunamadı</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Farklı bir arama terimi deneyin</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-2.5 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground/60">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-secondary/80 border border-border/50 rounded font-mono">↑↓</kbd>
                    Gezin
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-secondary/80 border border-border/50 rounded font-mono">↵</kbd>
                    Aç
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <Command className="w-3 h-3" />+K ile aç/kapat
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}