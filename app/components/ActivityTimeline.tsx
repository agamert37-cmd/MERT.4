/**
 * ActivityTimeline - Kullanici Hareket Izleme Paneli
 * Dashboard ve diger sayfalarda kullanilabilir kompakt timeline bileşeni
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  LogIn,
  LogOut,
  ShoppingCart,
  Package,
  Users,
  Wallet,
  Truck,
  UserCog,
  Settings,
  FileText,
  Factory,
  Banknote,
  Clock,
  Filter,
  Trash2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  CalendarCheck,
  Eye,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  getActivityLogs,
  getTodayLogs,
  getActivityStats,
  clearActivityLogs,
  type ActivityLogEntry,
  type ActivityCategory,
} from '../utils/activityLogger';
import { toast } from 'sonner';

interface ActivityTimelineProps {
  /** Maksimum gosterilecek kayit */
  maxItems?: number;
  /** Kompakt mod (dashboard icin) */
  compact?: boolean;
  /** Belirli bir kategoriye filtrele */
  filterCategory?: ActivityCategory;
  /** Baslik gizle */
  hideHeader?: boolean;
}

const CATEGORY_CONFIG: Record<ActivityCategory, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  auth:       { icon: LogIn,      color: 'text-blue-400',   bgColor: 'bg-blue-600',    label: 'Giris/Cikis' },
  sales:      { icon: ShoppingCart,color: 'text-green-400',  bgColor: 'bg-green-600',   label: 'Satis' },
  stock:      { icon: Package,    color: 'text-indigo-400', bgColor: 'bg-indigo-600',  label: 'Stok' },
  customer:   { icon: Users,      color: 'text-sky-400',    bgColor: 'bg-sky-600',     label: 'Musteri' },
  cash:       { icon: Wallet,     color: 'text-emerald-400',bgColor: 'bg-emerald-600', label: 'Kasa' },
  vehicle:    { icon: Truck,      color: 'text-orange-400', bgColor: 'bg-orange-600',  label: 'Arac' },
  personnel:  { icon: UserCog,    color: 'text-purple-400', bgColor: 'bg-purple-600',  label: 'Personel' },
  system:     { icon: Settings,   color: 'text-gray-400',   bgColor: 'bg-gray-600',    label: 'Sistem' },
  production: { icon: Factory,    color: 'text-amber-400',  bgColor: 'bg-amber-600',   label: 'Uretim' },
  finance:    { icon: Banknote,   color: 'text-lime-400',   bgColor: 'bg-lime-600',    label: 'Finans' },
  security:   { icon: ShieldAlert,color: 'text-red-400',    bgColor: 'bg-red-600',     label: 'Güvenlik' },
};

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Az once';
  if (minutes < 60) return `${minutes} dk once`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat once`;
  const days = Math.floor(hours / 24);
  return `${days} gun once`;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function ActivityTimeline({ maxItems = 20, compact = false, filterCategory, hideHeader = false }: ActivityTimelineProps) {
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | 'all'>(filterCategory || 'all');
  const [isExpanded, setIsExpanded] = useState(!compact);

  const allLogs = useMemo(() => getActivityLogs(), []);
  const todayLogs = useMemo(() => getTodayLogs(), []);
  const stats = useMemo(() => getActivityStats(), []);

  const filteredLogs = useMemo(() => {
    let logs = allLogs;
    if (selectedCategory !== 'all') {
      logs = logs.filter(l => l.category === selectedCategory);
    }
    return logs.slice(0, maxItems);
  }, [allLogs, selectedCategory, maxItems]);

  const handleClear = () => {
    if (confirm('Tum aktivite loglarini silmek istediginizden emin misiniz?')) {
      clearActivityLogs();
      toast.success('Aktivite loglari temizlendi');
      window.location.reload();
    }
  };

  // Active categories (with count)
  const activeCategories = useMemo(() => {
    return (Object.keys(CATEGORY_CONFIG) as ActivityCategory[])
      .filter(cat => stats[cat] > 0 || selectedCategory === cat)
      .sort((a, b) => stats[b] - stats[a]);
  }, [stats, selectedCategory]);

  if (compact && !isExpanded) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="font-bold text-white text-sm">Kullanici Hareketleri</p>
              <p className="text-xs text-muted-foreground">Bugun {todayLogs.length} islem</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {todayLogs.length > 0 && (
              <span className="px-2.5 py-1 bg-blue-600/20 text-blue-400 text-xs font-bold rounded-lg">
                {todayLogs.length}
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      {!hideHeader && (
        <div className="p-5 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Kullanici Hareketleri</h3>
                <p className="text-xs text-muted-foreground">
                  Bugun {todayLogs.length} islem | Toplam {allLogs.length} kayit
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {compact && (
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-2 hover:bg-secondary rounded-lg transition-colors"
                >
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
              {allLogs.length > 0 && (
                <button
                  onClick={handleClear}
                  className="p-2 hover:bg-red-900/20 hover:text-red-400 rounded-lg transition-colors text-muted-foreground"
                  title="Loglari temizle"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Stats row */}
          {todayLogs.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-secondary/60 text-muted-foreground hover:text-white hover:bg-secondary'
                }`}
              >
                Tumu ({todayLogs.length})
              </button>
              {activeCategories.map(cat => {
                const cfg = CATEGORY_CONFIG[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      selectedCategory === cat
                        ? `${cfg.bgColor} text-white`
                        : 'bg-secondary/60 text-muted-foreground hover:text-white hover:bg-secondary'
                    }`}
                  >
                    <cfg.icon className="w-3 h-3" />
                    {cfg.label} ({stats[cat]})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className={`divide-y divide-border/30 ${compact ? 'max-h-[350px]' : 'max-h-[500px]'} overflow-y-auto custom-scrollbar`}>
        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center">
            <Eye className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Henuz aktivite kaydedilmemis</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Uygulama icerisindeki islemler otomatik loglanir</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredLogs.map((log, i) => {
              const cfg = CATEGORY_CONFIG[log.category] || CATEGORY_CONFIG.system;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.4) }}
                  className="px-5 py-3.5 hover:bg-secondary/20 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg ${cfg.bgColor}/15 border border-current/10 flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white truncate">{log.title}</p>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${cfg.bgColor}/20 ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                      {log.description && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{log.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground/50">
                        {log.employeeName && (
                          <span className="flex items-center gap-1">
                            <UserCog className="w-3 h-3" />
                            {log.employeeName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(log.timestamp)}
                        </span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {timeAgo(log.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/**
 * Compact Activity Badge - Sidebar veya header icin mini gosterge
 */
export function ActivityBadge() {
  const todayCount = useMemo(() => getTodayLogs().length, []);

  if (todayCount === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-blue-600/20 text-blue-400 rounded-full">
      <Activity className="w-2.5 h-2.5" />
      {todayCount}
    </span>
  );
}
