import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, ShieldAlert, Key, Clock, AlertTriangle, Search, ShieldCheck,
  UserX, UserCheck, RefreshCw, Activity, Eye, EyeOff, Fingerprint,
  MonitorSmartphone, Laptop, Globe, Lock, Unlock, Trash2, CheckCircle2,
  XCircle, ChevronDown, ChevronRight, Wifi, WifiOff, Zap, TrendingUp,
  Settings, BarChart3, Users, FileWarning, CircleDot, Ban,
  Smartphone, Monitor, FileCheck, Download, ClipboardCheck,
  ShieldOff, ToggleLeft, ToggleRight, Copy,
} from 'lucide-react';
import { getLogsByCategory, type ActivityLogEntry } from '../utils/activityLogger';
import { getFromStorage, StorageKey } from '../utils/storage';
import {
  getSecurityThreats, resolveSecurityThreat, clearResolvedThreats,
  calculateSecurityScore, getActiveSessions, forceLogoutSession,
  getSecurityPolicy, updateSecurityPolicy,
  verifyLogChainIntegrity,
  getAutoResponseRules, saveAutoResponseRules,
  generateSecurityAudit, getDeviceHistory,
  get2FAConfig, save2FAConfig, generate2FABackupCodes,
  getSecurityTimeline,
  type SecurityThreat, type SecurityScore, type SecurityPolicy, type ActiveSession,
  type AutoResponseRule, type SecurityAuditItem, type SecurityTimelineEvent,
} from '../utils/security';
import { useSecurityMonitor } from '../hooks/useSecurityMonitor';
import { toast } from 'sonner';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { getPagePermissions } from '../utils/permissions';
import { useModuleBus } from '../hooks/useModuleBus';
import { logActivity } from '../utils/activityLogger';
import { InteractiveDataPanel } from '../components/InteractiveDataPanel';

type TabId = 'overview' | 'threats' | 'sessions' | 'logs' | 'policy' | 'audit' | 'autoresponse';

const SEVERITY_CONFIG = {
  critical: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Kritik' },
  high: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Yuksek' },
  medium: { icon: ShieldAlert, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'Orta' },
  low: { icon: Eye, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Dusuk' },
};

const THREAT_LEVEL_CONFIG = {
  safe: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Guvenli', glow: 'shadow-emerald-500/20' },
  low: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: 'Dusuk Risk', glow: 'shadow-blue-500/20' },
  medium: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'Orta Risk', glow: 'shadow-orange-500/20' },
  high: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Yuksek Risk', glow: 'shadow-red-500/20' },
  critical: { color: 'text-red-500', bg: 'bg-red-500/20', border: 'border-red-500/50', label: 'Kritik!', glow: 'shadow-red-500/40' },
};

// ─── Security Score Gauge ─────────────────────────────────────────────────────

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const gradeColors: Record<string, string> = {
    A: '#22c55e', B: '#3b82f6', C: '#eab308', D: '#f97316', F: '#ef4444',
  };
  const color = gradeColors[grade] || '#6b7280';

  return (
    <div className="relative w-36 h-36 sm:w-44 sm:h-44">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <motion.circle
          cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference}
          animate={{ strokeDashoffset: offset }} transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl sm:text-4xl font-black" style={{ color }}>{grade}</span>
        <span className="text-xs text-gray-400 font-bold">{score}/100</span>
      </div>
    </div>
  );
}

// ─── Category Score Bar ───────────────────────────────────────────────────────

function CategoryBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400 font-medium">{label}</span>
        <span className="font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }} animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SecurityPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { emit } = useModuleBus();
  const { canManage } = getPagePermissions(user, currentEmployee, 'guvenlik');

  const {
    threats, unresolvedCount, criticalCount, score,
    activeSessions, threatLevel, refreshState,
  } = useSecurityMonitor(true);

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logFilterType, setLogFilterType] = useState<'all' | 'auth' | 'security'>('all');

  // ─── Logs ─────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLogs = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      const authLogs = getLogsByCategory('auth');
      const securityLogs = getLogsByCategory('security');
      const combined = [...authLogs, ...securityLogs].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setLogs(combined);
      setIsRefreshing(false);
    }, 300);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ─── Gerçek zamanlı tehdit bildirimi toast'ları ───────────────────
  const prevUnresolvedCountRef = React.useRef(unresolvedCount);
  const prevThreatsRef = React.useRef<SecurityThreat[]>(threats);
  useEffect(() => {
    if (prevUnresolvedCountRef.current < unresolvedCount) {
      // Yeni tehditler tespit edildi
      const prevIds = new Set(prevThreatsRef.current.map(t => t.id));
      const newThreats = threats.filter(t => !t.resolved && !prevIds.has(t.id));
      newThreats.forEach(threat => {
        const sev = SEVERITY_CONFIG[threat.severity] || SEVERITY_CONFIG.medium;
        toast.error(
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">{sev.label} Tehdit Algılandı</p>
              <p className="text-xs opacity-80 mt-0.5">{threat.title}</p>
            </div>
          </div>,
          { duration: 8000 }
        );
      });
      // Logları da yenile
      fetchLogs();
    }
    prevUnresolvedCountRef.current = unresolvedCount;
    prevThreatsRef.current = threats;
  }, [unresolvedCount, threats, fetchLogs]);

  // ─── Policy ───────────────────────────────────────────────────────
  const [policy, setPolicy] = useState<SecurityPolicy>(getSecurityPolicy());

  const handlePolicyUpdate = (key: keyof SecurityPolicy, value: any) => {
    const updated = updateSecurityPolicy({ [key]: value });
    setPolicy(updated);
    logActivity('settings_change', `Guvenlik politikasi guncellendi: ${key}`, {
      employeeName: user?.name, page: 'guvenlik', metadata: { key, value },
    });
    toast.success('Guvenlik politikasi guncellendi');
    refreshState();
  };

  // ─── Threat Actions ───────────────────────────────────────────────
  const handleResolveThreat = (threatId: string) => {
    resolveSecurityThreat(threatId);
    logActivity('custom', 'Guvenlik tehdidi cozumlendi', {
      employeeName: user?.name, page: 'guvenlik', metadata: { threatId },
    });
    toast.success('Tehdit cozumlendi olarak isaretlendi');
    refreshState();
  };

  const handleClearResolved = () => {
    clearResolvedThreats();
    toast.success('Cozumlenmis tehditler temizlendi');
    refreshState();
  };

  const handleForceLogout = (sessionId: string, userName: string) => {
    if (!confirm(`${userName} kullanicisinin oturumunu zorla kapatmak istediginize emin misiniz?`)) return;
    forceLogoutSession(sessionId);
    logActivity('security_alert', `Oturum zorla kapatildi: ${userName}`, {
      level: 'high', employeeName: user?.name, page: 'guvenlik',
      metadata: { sessionId, targetUser: userName },
    });
    toast.success(`${userName} oturumu kapatildi`);
    refreshState();
  };

  // ─── Filtered Data ────────────────────────────────────────────────
  const filteredThreats = useMemo(() => {
    return threats.filter(t => {
      if (!showResolved && t.resolved) return false;
      if (filterSeverity !== 'all' && t.severity !== filterSeverity) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return t.title.toLowerCase().includes(s) || t.description.toLowerCase().includes(s);
      }
      return true;
    });
  }, [threats, searchTerm, filterSeverity, showResolved]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (logFilterType !== 'all' && log.category !== logFilterType) return false;
      if (logSearchTerm) {
        const s = logSearchTerm.toLowerCase();
        return log.title.toLowerCase().includes(s) ||
          log.employeeName?.toLowerCase().includes(s) ||
          log.description?.toLowerCase().includes(s);
      }
      return true;
    });
  }, [logs, logSearchTerm, logFilterType]);

  // ─── Stats ────────────────────────────────────────────────────────
  const todayLogs = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return logs.filter(l => l.timestamp.startsWith(today)).length;
  }, [logs]);

  const bruteForceCount = useMemo(() =>
    threats.filter(t => t.type === 'brute_force' && !t.resolved).length, [threats]
  );

  const logChain = verifyLogChainIntegrity();

  const tlConfig = THREAT_LEVEL_CONFIG[threatLevel];

  const tabs: { id: TabId; label: string; icon: any; badge?: number }[] = [
    { id: 'overview', label: 'Genel Bakis', icon: Shield },
    { id: 'threats', label: 'Tehditler', icon: AlertTriangle, badge: unresolvedCount },
    { id: 'sessions', label: 'Oturumlar', icon: MonitorSmartphone, badge: activeSessions.length },
    { id: 'logs', label: 'Log Kayitlari', icon: FileWarning },
    { id: 'policy', label: 'Politikalar', icon: Settings },
    { id: 'audit', label: 'Güvenlik Denetimi', icon: FileCheck },
    { id: 'autoresponse', label: 'Otomatik Yanıt', icon: Zap },
  ];

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-28 sm:pb-6 min-h-screen">

      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <div className={`p-2 rounded-xl ${tlConfig.bg} ${tlConfig.border} border`}>
              <Shield className={`w-5 h-5 sm:w-6 sm:h-6 ${tlConfig.color}`} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Guvenlik Merkezi</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${tlConfig.bg} ${tlConfig.border} ${tlConfig.color}`}>
                  <CircleDot className="w-2.5 h-2.5" /> {tlConfig.label}
                </span>
                {logChain.valid ? (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Log Zinciri Butun</span>
                ) : (
                  <span className="text-[10px] text-red-400 flex items-center gap-1"><Unlock className="w-2.5 h-2.5" /> Log Zinciri Bozuk!</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={() => { refreshState(); fetchLogs(); toast.success('Guvenlik verileri yenilendi'); }}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-sm font-medium transition-all active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Yenile
        </button>
      </div>

      {/* ─── TABS ─── */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all active:scale-95 ${
                activeTab === tab.id
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge != null && tab.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400">{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── TAB CONTENT ─── */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* KPI Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: 'Aktif Tehditler', value: unresolvedCount, icon: AlertTriangle, color: 'red' },
                { label: 'Brute Force', value: bruteForceCount, icon: Key, color: 'orange' },
                { label: 'Bugun Log', value: todayLogs, icon: Clock, color: 'blue' },
                { label: 'Aktif Oturumlar', value: activeSessions.length, icon: Users, color: 'emerald' },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`p-4 sm:p-5 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5 hover:border-${stat.color}-500/30 transition-all group`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-xl bg-${stat.color}-500/10 border border-${stat.color}-500/20`}>
                      <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 text-${stat.color}-400`} />
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-500 font-bold uppercase tracking-wider">{stat.label}</span>
                  </div>
                  <p className={`text-2xl sm:text-3xl font-black text-${stat.color}-400`}>{stat.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Score + Recommendations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Guvenlik Skoru */}
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5"
              >
                <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-400" /> Guvenlik Skoru
                </h3>
                <div className="flex items-center gap-6 sm:gap-8">
                  <ScoreGauge score={score.overall} grade={score.grade} />
                  <div className="flex-1 space-y-3">
                    <CategoryBar label="Kimlik Dogrulama" value={score.categories.authentication} color="#3b82f6" />
                    <CategoryBar label="Veri Koruma" value={score.categories.dataProtection} color="#8b5cf6" />
                    <CategoryBar label="Erisim Kontrolu" value={score.categories.accessControl} color="#22c55e" />
                    <CategoryBar label="Izleme" value={score.categories.monitoring} color="#eab308" />
                    <CategoryBar label="Uyumluluk" value={score.categories.compliance} color="#06b6d4" />
                  </div>
                </div>
              </motion.div>

              {/* Oneriler */}
              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5"
              >
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" /> Guvenlik Onerileri
                </h3>
                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                  {score.recommendations.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-emerald-400">
                      <ShieldCheck className="w-12 h-12 mb-3 opacity-60" />
                      <p className="font-bold">Tum kontroller gecti!</p>
                      <p className="text-xs text-gray-500 mt-1">Sisteminiz guvenli durumda.</p>
                    </div>
                  ) : (
                    score.recommendations.map((rec, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }}
                        className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5"
                      >
                        <div className="mt-0.5 p-1 rounded-lg bg-yellow-500/10 flex-shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                        </div>
                        <p className="text-sm text-gray-300">{rec}</p>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            </div>

            {/* Son Tehditler */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Activity className="w-5 h-5 text-red-400" /> Son Tehditler
                </h3>
                <button onClick={() => setActiveTab('threats')} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                  Tumunu Gor <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {threats.filter(t => !t.resolved).slice(0, 5).map(threat => {
                  const cfg = SEVERITY_CONFIG[threat.severity];
                  const Icon = cfg.icon;
                  return (
                    <div key={threat.id} className={`flex items-center gap-3 p-3 rounded-xl ${cfg.bg} border ${cfg.border}`}>
                      <Icon className={`w-4 h-4 ${cfg.color} flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{threat.title}</p>
                        <p className="text-[10px] text-gray-500">{new Date(threat.timestamp).toLocaleString('tr-TR')}</p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
                {threats.filter(t => !t.resolved).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aktif tehdit bulunmuyor</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeTab === 'threats' && (
          <motion.div key="threats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Tehdit ara..." className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-foreground placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm" />
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map(sev => (
                  <button key={sev} onClick={() => setFilterSeverity(sev)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                      filterSeverity === sev ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-gray-500 hover:text-gray-300 border border-transparent'
                    }`}
                  >
                    {sev === 'all' ? 'Tumunu' : SEVERITY_CONFIG[sev].label}
                  </button>
                ))}
                <button onClick={() => setShowResolved(!showResolved)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    showResolved ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-500 border border-transparent'
                  }`}
                >
                  {showResolved ? 'Cozulenleri Gizle' : 'Cozulenleri Goster'}
                </button>
                {threats.some(t => t.resolved) && (
                  <button onClick={handleClearResolved} className="px-3 py-2 rounded-lg text-xs font-bold text-gray-500 hover:text-red-400 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Threat List */}
            <div className="space-y-3">
              {filteredThreats.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <ShieldCheck className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-bold">Tehdit Bulunamadi</p>
                  <p className="text-sm mt-1">Filtre kriterlerinize uygun tehdit yok.</p>
                </div>
              ) : (
                filteredThreats.map(threat => {
                  const cfg = SEVERITY_CONFIG[threat.severity];
                  const Icon = cfg.icon;
                  return (
                    <motion.div
                      key={threat.id}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded-2xl ${cfg.bg} border ${cfg.border} ${threat.resolved ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl ${cfg.bg} flex-shrink-0 mt-0.5`}>
                          <Icon className={`w-5 h-5 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                              {cfg.label}
                            </span>
                            <span className="text-[10px] font-mono text-gray-600">{threat.type}</span>
                            {threat.resolved && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Cozumlendi
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-foreground">{threat.title}</p>
                          <p className="text-xs text-gray-400 mt-1">{threat.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-600">
                            <span>{new Date(threat.timestamp).toLocaleString('tr-TR')}</span>
                            {threat.source && <span>Kaynak: {threat.source}</span>}
                          </div>
                        </div>
                        {!threat.resolved && (
                          <button onClick={() => handleResolveThreat(threat.id)}
                            className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-all flex-shrink-0 active:scale-95"
                            title="Cozumle"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'sessions' && (
          <motion.div key="sessions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeSessions.length === 0 ? (
                <div className="col-span-full text-center py-16 text-gray-500">
                  <MonitorSmartphone className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-bold">Aktif Oturum Yok</p>
                </div>
              ) : (
                activeSessions.map(session => {
                  const isMobile = /Mobile|Android|iPhone/i.test(session.userAgent);
                  const DeviceIcon = isMobile ? MonitorSmartphone : Laptop;
                  const isStale = Date.now() - new Date(session.lastActivity).getTime() > 10 * 60 * 1000;

                  return (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      className={`p-5 rounded-2xl bg-black/40 backdrop-blur-xl border ${
                        session.isCurrentSession ? 'border-emerald-500/30' : 'border-white/5'
                      } relative overflow-hidden`}
                    >
                      {session.isCurrentSession && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                          Bu Oturum
                        </div>
                      )}
                      <div className="flex items-start gap-3 mb-4">
                        <div className={`p-2.5 rounded-xl ${session.isCurrentSession ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-gray-400'}`}>
                          <DeviceIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{session.userName}</p>
                          <p className="text-[10px] text-gray-500 font-mono">{session.id.substring(0, 16)}...</p>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Parmak Izi:</span>
                          <span className="font-mono text-gray-400">{session.fingerprint}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Giris:</span>
                          <span className="text-gray-400">{new Date(session.loginTime).toLocaleString('tr-TR')}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Son Aktivite:</span>
                          <span className={`flex items-center gap-1 ${isStale ? 'text-orange-400' : 'text-emerald-400'}`}>
                            {isStale ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                            {new Date(session.lastActivity).toLocaleTimeString('tr-TR')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Cihaz:</span>
                          <span className="text-gray-400 truncate max-w-[150px]">{isMobile ? 'Mobil' : 'Masaustu'}</span>
                        </div>
                      </div>

                      {!session.isCurrentSession && (
                        <button
                          onClick={() => handleForceLogout(session.id, session.userName)}
                          className="w-full mt-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 active:scale-95 border border-red-500/20"
                        >
                          <Ban className="w-4 h-4" /> Oturumu Kapat
                        </button>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'logs' && (
          <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" value={logSearchTerm} onChange={e => setLogSearchTerm(e.target.value)}
                  placeholder="Log ara..." className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-foreground placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-sm" />
              </div>
              <div className="flex gap-2">
                {(['all', 'auth', 'security'] as const).map(type => (
                  <button key={type} onClick={() => setLogFilterType(type)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      logFilterType === type ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-gray-500 hover:text-gray-300 border border-transparent'
                    }`}
                  >
                    {type === 'all' ? 'Tumunu' : type === 'auth' ? 'Giris/Cikis' : 'Guvenlik'}
                  </button>
                ))}
              </div>
            </div>

            {/* ─── Interactive Log Panel ─── */}
            <InteractiveDataPanel
              data={filteredLogs.slice(0, 200)}
              columns={[
                {
                  key: 'timestamp', label: 'Tarih', cardRole: 'subtitle',
                  render: (log: any) => (
                    <div>
                      <div className="text-xs sm:text-sm text-foreground">{new Date(log.timestamp).toLocaleDateString('tr-TR')}</div>
                      <div className="text-[10px] text-muted-foreground/50">{new Date(log.timestamp).toLocaleTimeString('tr-TR')}</div>
                    </div>
                  ),
                  getValue: (log: any) => new Date(log.timestamp).getTime(),
                },
                {
                  key: 'level', label: 'Risk', cardRole: 'badge',
                  render: (log: any) => {
                    const level = log.metadata?.level || (log.category === 'security' ? 'high' : 'info');
                    const cfg = level === 'high' ? SEVERITY_CONFIG.high : level === 'medium' ? SEVERITY_CONFIG.medium : SEVERITY_CONFIG.low;
                    const SevIcon = cfg.icon;
                    return (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold uppercase ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                        <SevIcon className="w-3 h-3" /> {level}
                      </span>
                    );
                  },
                },
                {
                  key: 'title', label: 'Olay', cardRole: 'title',
                  render: (log: any) => (
                    <div>
                      <div className="text-xs sm:text-sm font-medium text-foreground">{log.title}</div>
                      <div className="text-[10px] text-muted-foreground/50">{log.type}</div>
                    </div>
                  ),
                },
                {
                  key: 'employeeName', label: 'Kullanıcı', cardRole: 'meta',
                  render: (log: any) => (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                        {log.type === 'login' ? <UserCheck className="w-3 h-3 text-emerald-400" /> :
                         log.type === 'logout' ? <UserX className="w-3 h-3 text-gray-400" /> :
                         <Shield className="w-3 h-3 text-gray-400" />}
                      </div>
                      <span className="text-xs sm:text-sm text-gray-300">{log.employeeName || 'Sistem'}</span>
                    </div>
                  ),
                },
                {
                  key: 'description', label: 'Detay', cardRole: 'hidden',
                  render: (log: any) => (
                    <div className="text-xs text-muted-foreground/60 truncate max-w-xs">{log.description || '-'}</div>
                  ),
                },
              ]}
              searchable={false}
              enableCardView
              enableAnalytics={false}
              pageSize={20}
              accentColor="#ef4444"
              emptyMessage="Log bulunamadı"
              renderExpanded={(log: any) => (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div><span className="text-muted-foreground/60 block mb-0.5">Detay</span><span className="text-foreground">{log.description || '-'}</span></div>
                  <div><span className="text-muted-foreground/60 block mb-0.5">Kategori</span><span className="text-foreground">{log.category}</span></div>
                  <div><span className="text-muted-foreground/60 block mb-0.5">Tam Tarih</span><span className="text-foreground font-mono">{new Date(log.timestamp).toLocaleString('tr-TR')}</span></div>
                </div>
              )}
            />
          </motion.div>
        )}

        {activeTab === 'policy' && (
          <motion.div key="policy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Kimlik Dogrulama */}
              <div className="p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5">
                <h3 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
                  <Key className="w-5 h-5 text-blue-400" /> Kimlik Dogrulama
                </h3>
                <div className="space-y-5">
                  <PolicySlider label="Minimum Sifre Uzunlugu" value={policy.minPasswordLength} min={4} max={20}
                    onChange={v => handlePolicyUpdate('minPasswordLength', v)} suffix=" karakter" />
                  <PolicySlider label="Maks. Giris Denemesi" value={policy.maxLoginAttempts} min={3} max={10}
                    onChange={v => handlePolicyUpdate('maxLoginAttempts', v)} suffix=" deneme" />
                  <PolicySlider label="Kilit Suresi" value={policy.lockoutDurationMinutes} min={5} max={60}
                    onChange={v => handlePolicyUpdate('lockoutDurationMinutes', v)} suffix=" dk" />
                  <PolicyToggle label="Buyuk Harf Zorunlu" value={policy.requireUppercase}
                    onChange={v => handlePolicyUpdate('requireUppercase', v)} />
                  <PolicyToggle label="Ozel Karakter Zorunlu" value={policy.requireSpecialChars}
                    onChange={v => handlePolicyUpdate('requireSpecialChars', v)} />
                </div>
              </div>

              {/* Oturum Yonetimi */}
              <div className="p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5">
                <h3 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-purple-400" /> Oturum Yonetimi
                </h3>
                <div className="space-y-5">
                  <PolicySlider label="Oturum Zaman Asimi" value={policy.sessionTimeoutMinutes} min={5} max={60}
                    onChange={v => handlePolicyUpdate('sessionTimeoutMinutes', v)} suffix=" dk" />
                  <PolicySlider label="Maks. Esazamanli Oturum" value={policy.maxConcurrentSessions} min={1} max={10}
                    onChange={v => handlePolicyUpdate('maxConcurrentSessions', v)} suffix="" />
                  <PolicySlider label="Sifre Gecerlilik Suresi" value={policy.passwordExpiryDays} min={30} max={365}
                    onChange={v => handlePolicyUpdate('passwordExpiryDays', v)} suffix=" gun" />
                  <PolicySlider label="Log Saklama Suresi" value={policy.logRetentionDays} min={7} max={90}
                    onChange={v => handlePolicyUpdate('logRetentionDays', v)} suffix=" gun" />
                  <PolicyToggle label="Ilk Giriste Sifre Degisikligi" value={policy.requirePasswordChangeOnFirstLogin}
                    onChange={v => handlePolicyUpdate('requirePasswordChangeOnFirstLogin', v)} />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── AUDIT TAB ─── */}
        {activeTab === 'audit' && <AuditTab />}

        {/* ─── AUTO RESPONSE TAB ─── */}
        {activeTab === 'autoresponse' && <AutoResponseTab user={user} refreshState={refreshState} />}
      </AnimatePresence>
    </div>
  );
}

// ─── Policy Controls ──────────────────────────────────────────────────────────

function PolicySlider({ label, value, min, max, suffix, onChange }: {
  label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-sm font-bold text-foreground">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-red-500 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
    </div>
  );
}

function PolicyToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-red-500' : 'bg-white/10'}`}
      >
        <motion.div
          className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
          animate={{ left: value ? 24 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}

// ─── AUDIT TAB COMPONENT ──────────────────────────────────────────────────────

const AUDIT_STATUS_CONFIG = {
  pass: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'GECTI', icon: CheckCircle2 },
  warning: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'UYARI', icon: AlertTriangle },
  fail: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'BASARISIZ', icon: XCircle },
  info: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'BILGI', icon: Eye },
};

const AUDIT_CATEGORY_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  authentication: { label: 'Kimlik Dogrulama', icon: Key, color: 'text-blue-400' },
  data_protection: { label: 'Veri Koruma', icon: Lock, color: 'text-purple-400' },
  access_control: { label: 'Erisim Kontrolu', icon: Shield, color: 'text-emerald-400' },
  monitoring: { label: 'Izleme & Tespit', icon: Activity, color: 'text-amber-400' },
  compliance: { label: 'Uyumluluk', icon: ClipboardCheck, color: 'text-cyan-400' },
  network: { label: 'Ag Guvenligi', icon: Globe, color: 'text-indigo-400' },
};

function AuditTab() {
  const [audit, setAudit] = React.useState(() => generateSecurityAudit());
  const [filterCategory, setFilterCategory] = React.useState<string>('all');
  const [filterStatus, setFilterStatus] = React.useState<string>('all');
  const [timeline, setTimeline] = React.useState<SecurityTimelineEvent[]>([]);
  const [showTimeline, setShowTimeline] = React.useState(false);

  React.useEffect(() => { setTimeline(getSecurityTimeline(30)); }, []);

  const refreshAudit = () => { setAudit(generateSecurityAudit()); setTimeline(getSecurityTimeline(30)); toast.success('Denetim raporu yenilendi'); };

  const filteredItems = audit.items.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    return true;
  });

  const statusCounts = {
    pass: audit.items.filter(i => i.status === 'pass').length,
    warning: audit.items.filter(i => i.status === 'warning').length,
    fail: audit.items.filter(i => i.status === 'fail').length,
    info: audit.items.filter(i => i.status === 'info').length,
  };

  const exportAuditReport = () => {
    const report = { appName: 'ISLEYEN ET ERP', reportType: 'Guvenlik Denetim Raporu', generatedAt: audit.timestamp, passRate: audit.passRate, totalChecks: audit.items.length, statusSummary: statusCounts, items: audit.items };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `IsleyenET_SecurityAudit_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success('Denetim raporu indirildi');
  };

  return (
    <motion.div key="audit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 p-5 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5 flex flex-col items-center justify-center">
          <div className="relative w-20 h-20 mb-2">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
              <motion.circle cx="40" cy="40" r="34" fill="none" stroke={audit.passRate >= 80 ? '#22c55e' : audit.passRate >= 60 ? '#eab308' : '#ef4444'} strokeWidth="6" strokeLinecap="round" strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34} animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - audit.passRate / 100) }} transition={{ duration: 1.2, ease: 'easeOut' }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center"><span className="text-xl font-black text-foreground">{audit.passRate}%</span></div>
          </div>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Gecis Orani</p>
        </div>
        {Object.entries(statusCounts).map(([status, count]) => {
          const cfg = AUDIT_STATUS_CONFIG[status as keyof typeof AUDIT_STATUS_CONFIG]; const Icon = cfg.icon;
          return (
            <div key={status} className={`p-4 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5 cursor-pointer transition-all hover:border-white/10 ${filterStatus === status ? 'ring-1 ring-white/20' : ''}`} onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}>
              <div className="flex items-center gap-2 mb-2"><Icon className={`w-4 h-4 ${cfg.color}`} /><span className={`text-[10px] font-bold uppercase ${cfg.color}`}>{cfg.label}</span></div>
              <p className={`text-2xl font-black ${cfg.color}`}>{count}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
          <button onClick={() => setFilterCategory('all')} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${filterCategory === 'all' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}>Tumu</button>
          {Object.entries(AUDIT_CATEGORY_LABELS).map(([cat, cfg]) => { const CatIcon = cfg.icon; return (
            <button key={cat} onClick={() => setFilterCategory(filterCategory === cat ? 'all' : cat)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${filterCategory === cat ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-gray-500 hover:text-gray-300 border border-transparent'}`}><CatIcon className="w-3 h-3" /> {cfg.label}</button>
          ); })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTimeline(!showTimeline)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${showTimeline ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-gray-500 border border-transparent hover:text-gray-300'}`}><Activity className="w-3 h-3" /> Zaman Cizelgesi</button>
          <button onClick={exportAuditReport} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:text-blue-400 transition-all flex items-center gap-1.5 border border-transparent"><Download className="w-3 h-3" /> Rapor Indir</button>
          <button onClick={refreshAudit} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 hover:text-gray-300 transition-all"><RefreshCw className="w-3 h-3" /></button>
        </div>
      </div>

      {showTimeline && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5 max-h-[400px] overflow-y-auto">
          <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-purple-400" /> Guvenlik Olay Zaman Cizelgesi</h3>
          <div className="space-y-0">
            {timeline.map((event, i) => {
              const isLast = i === timeline.length - 1;
              const typeColors: Record<string, string> = { threat: 'border-red-500 bg-red-500', login: 'border-emerald-500 bg-emerald-500', logout: 'border-gray-500 bg-gray-500', policy_change: 'border-blue-500 bg-blue-500', session_action: 'border-amber-500 bg-amber-500', auto_response: 'border-purple-500 bg-purple-500', audit: 'border-cyan-500 bg-cyan-500' };
              const dotColor = typeColors[event.type] || 'border-gray-500 bg-gray-500';
              return (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center"><div className={`w-2.5 h-2.5 rounded-full border-2 ${dotColor} flex-shrink-0`} />{!isLast && <div className="w-px flex-1 bg-white/5 min-h-[24px]" />}</div>
                  <div className="pb-4 min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
                      {event.severity && <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${SEVERITY_CONFIG[event.severity]?.bg || ''} ${SEVERITY_CONFIG[event.severity]?.color || ''}`}>{SEVERITY_CONFIG[event.severity]?.label || event.severity}</span>}
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">{event.description}</p>
                    <p className="text-[9px] text-gray-600 mt-0.5">{new Date(event.timestamp).toLocaleString('tr-TR')}</p>
                  </div>
                </div>
              );
            })}
            {timeline.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Henuz olay kaydedilmemis</p>}
          </div>
        </motion.div>
      )}

      <div className="space-y-2">
        {filteredItems.map((item, i) => {
          const sc = AUDIT_STATUS_CONFIG[item.status]; const Icon = sc.icon;
          const catCfg = AUDIT_CATEGORY_LABELS[item.category]; const CatIcon = catCfg?.icon || Shield;
          return (
            <motion.div key={item.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className={`p-4 rounded-xl ${sc.bg} border ${sc.border} flex items-start gap-3`}>
              <div className={`p-1.5 rounded-lg ${sc.bg} flex-shrink-0 mt-0.5`}><Icon className={`w-4 h-4 ${sc.color}`} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${sc.bg} ${sc.border} ${sc.color}`}>{sc.label}</span>
                  <span className="text-[9px] text-gray-600 flex items-center gap-1"><CatIcon className="w-2.5 h-2.5" /> {catCfg?.label || item.category}</span>
                </div>
                <p className="text-sm font-bold text-foreground">{item.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                {item.recommendation && <p className="text-[11px] text-amber-400/80 mt-1.5 flex items-start gap-1.5"><Zap className="w-3 h-3 mt-0.5 flex-shrink-0" /> {item.recommendation}</p>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── AUTO RESPONSE TAB COMPONENT ──────────────────────────────────────────────

const ACTION_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  notify: { label: 'Bildirim', color: 'text-blue-400', icon: Eye },
  log_only: { label: 'Sadece Logla', color: 'text-gray-400', icon: FileWarning },
  block_session: { label: 'Oturumu Kilitle', color: 'text-amber-400', icon: Lock },
  force_logout: { label: 'Zorla Cikis', color: 'text-red-400', icon: Ban },
  lock_account: { label: 'Hesap Kilitle', color: 'text-red-500', icon: ShieldOff },
};

const THREAT_TYPE_LABELS: Record<string, string> = {
  any: 'Tum Tehditler', brute_force: 'Brute Force', session_hijack: 'Oturum Ele Gecirme',
  xss_attempt: 'XSS Denemesi', sql_injection: 'SQL Injection', rapid_actions: 'Hizli Islem',
  unusual_hour: 'Mesai Disi', concurrent_session: 'Esazamanli Oturum',
  data_exfil: 'Veri Sizintisi', privilege_escalation: 'Yetki Yukseltme',
};

function AutoResponseTab({ user, refreshState }: { user: any; refreshState: () => void }) {
  const [rules, setRules] = React.useState<AutoResponseRule[]>(() => getAutoResponseRules());
  const [twoFA, setTwoFA] = React.useState(() => get2FAConfig());
  const [showBackupCodes, setShowBackupCodes] = React.useState(false);
  const [deviceHistory] = React.useState(() => getDeviceHistory().slice(0, 10));

  const toggleRule = (ruleId: string) => { const updated = rules.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r); setRules(updated); saveAutoResponseRules(updated); toast.success('Kural guncellendi'); };
  const updateRuleAction = (ruleId: string, action: AutoResponseRule['action']) => { const updated = rules.map(r => r.id === ruleId ? { ...r, action } : r); setRules(updated); saveAutoResponseRules(updated); };

  const toggle2FA = () => {
    if (!twoFA.enabled) {
      const codes = generate2FABackupCodes();
      const updated = save2FAConfig({ enabled: true, setupComplete: true, backupCodes: codes });
      setTwoFA(updated); setShowBackupCodes(true);
      toast.success('2FA etkinlestirildi! Yedek kodlari kaydedin.');
      logActivity('settings_change', '2FA etkinlestirildi', { employeeName: user?.name, page: 'guvenlik' });
    } else {
      if (!confirm('2FA devre disi birakmak guvenliginizi azaltir. Devam edilsin mi?')) return;
      const updated = save2FAConfig({ enabled: false, setupComplete: false, backupCodes: [] });
      setTwoFA(updated); setShowBackupCodes(false);
      toast.success('2FA devre disi birakildi');
      logActivity('settings_change', '2FA devre disi birakildi', { employeeName: user?.name, page: 'guvenlik' });
    }
  };

  const regenerateCodes = () => { const codes = generate2FABackupCodes(); const updated = save2FAConfig({ backupCodes: codes }); setTwoFA(updated); setShowBackupCodes(true); toast.success('Yeni yedek kodlar olusturuldu'); };
  const copyCode = (code: string) => { navigator.clipboard.writeText(code).then(() => toast.success('Kod kopyalandi')); };

  return (
    <motion.div key="autoresponse" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
      {/* Oto-Yanit Kurallari */}
      <div className="p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5">
        <h3 className="text-base font-bold text-foreground mb-1 flex items-center gap-2"><Zap className="w-5 h-5 text-amber-400" /> Otomatik Tehdit Yanit Kurallari</h3>
        <p className="text-xs text-gray-500 mb-5">Belirli tehdit turlerinde otomatik aksiyonlar tanimlayabilirsiniz.</p>
        <div className="space-y-3">
          {rules.map(rule => {
            const actionCfg = ACTION_LABELS[rule.action] || ACTION_LABELS.log_only; const ActionIcon = actionCfg.icon;
            return (
              <div key={rule.id} className={`p-4 rounded-xl border transition-all ${rule.enabled ? 'bg-white/[0.02] border-white/10' : 'bg-white/[0.01] border-white/5 opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleRule(rule.id)} className={`mt-0.5 p-1 rounded-lg transition-all flex-shrink-0 ${rule.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-gray-600'}`}>
                    {rule.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10">{THREAT_TYPE_LABELS[rule.threatType] || rule.threatType}</span>
                      <span className="text-[10px] text-gray-600">&ge;</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${SEVERITY_CONFIG[rule.minSeverity]?.bg || ''} ${SEVERITY_CONFIG[rule.minSeverity]?.color || ''} border ${SEVERITY_CONFIG[rule.minSeverity]?.border || ''}`}>{SEVERITY_CONFIG[rule.minSeverity]?.label || rule.minSeverity}</span>
                      <span className="text-[10px] text-gray-600">&rarr;</span>
                      <span className={`text-[10px] font-bold flex items-center gap-1 ${actionCfg.color}`}><ActionIcon className="w-3 h-3" /> {actionCfg.label}</span>
                    </div>
                    <p className="text-sm text-gray-300">{rule.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-600">
                      <span>Bekleme: {rule.cooldownMinutes} dk</span>
                      {rule.lastTriggered && <span>Son tetik: {new Date(rule.lastTriggered).toLocaleString('tr-TR')}</span>}
                    </div>
                  </div>
                  <select value={rule.action} onChange={e => updateRuleAction(rule.id, e.target.value as AutoResponseRule['action'])} className="text-[11px] bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-400 focus:outline-none focus:ring-1 focus:ring-red-500/40 flex-shrink-0">
                    {Object.entries(ACTION_LABELS).map(([val, cfg]) => (<option key={val} value={val}>{cfg.label}</option>))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2FA */}
      <div className="p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5">
        <h3 className="text-base font-bold text-foreground mb-1 flex items-center gap-2"><Fingerprint className="w-5 h-5 text-purple-400" /> Iki Faktorlu Dogrulama (2FA)</h3>
        <p className="text-xs text-gray-500 mb-5">Ek guvenlik katmani ile giris islemlerini guclendirebilirsiniz.</p>
        <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/10 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${twoFA.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-gray-500'}`}><Fingerprint className="w-6 h-6" /></div>
            <div>
              <p className="text-sm font-bold text-foreground">{twoFA.enabled ? '2FA Aktif' : '2FA Devre Disi'}</p>
              <p className="text-[10px] text-gray-500">{twoFA.enabled ? `Yontem: TOTP (Zamana Dayali)` : 'Etkinlestirerek guvenliginizi artirin'}</p>
            </div>
          </div>
          <button onClick={toggle2FA} className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${twoFA.enabled ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'}`}>
            {twoFA.enabled ? 'Devre Disi Birak' : 'Etkinlestir'}
          </button>
        </div>
        {twoFA.enabled && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">Yedek Kodlar</p>
              <div className="flex gap-2">
                <button onClick={() => setShowBackupCodes(!showBackupCodes)} className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1">{showBackupCodes ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {showBackupCodes ? 'Gizle' : 'Goster'}</button>
                <button onClick={regenerateCodes} className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Yenile</button>
              </div>
            </div>
            {showBackupCodes && twoFA.backupCodes.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {twoFA.backupCodes.map((code, i) => (
                  <button key={i} onClick={() => copyCode(code)} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-all group">
                    <span className="font-mono text-xs text-gray-300 tracking-wider">{code}</span><Copy className="w-3 h-3 text-gray-600 group-hover:text-gray-400" />
                  </button>
                ))}
              </motion.div>
            )}
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <p className="text-[10px] text-amber-400/80 flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> Bu kodlari guvenli bir yere kaydedin. Kaybolduklarinda hesabiniza erisiminiz engellenebilir.</p>
            </div>
          </div>
        )}
      </div>

      {/* Cihaz Gecmisi */}
      <div className="p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/5">
        <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2"><Monitor className="w-5 h-5 text-cyan-400" /> Bilinen Cihazlar</h3>
        {deviceHistory.length === 0 ? <p className="text-sm text-gray-500 text-center py-8">Henuz cihaz kaydi yok</p> : (
          <div className="space-y-2">
            {deviceHistory.map((device, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className={`p-2 rounded-lg ${device.deviceType === 'mobile' ? 'bg-blue-500/10 text-blue-400' : device.deviceType === 'tablet' ? 'bg-purple-500/10 text-purple-400' : 'bg-gray-500/10 text-gray-400'}`}>
                  {device.deviceType === 'mobile' ? <Smartphone className="w-4 h-4" /> : device.deviceType === 'tablet' ? <MonitorSmartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{device.browser} / {device.os}</p>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500"><span>{device.screenRes}</span><span>{device.timezone}</span><span className="font-mono">{device.fingerprint}</span></div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-gray-500">{device.userName || '-'}</p>
                  <p className="text-[9px] text-gray-600">{device.loginAt ? new Date(device.loginAt).toLocaleString('tr-TR') : '-'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}