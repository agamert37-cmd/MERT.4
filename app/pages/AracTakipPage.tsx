// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useEmployee } from '../contexts/EmployeeContext';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { logActivity } from '../utils/activityLogger';
import {
  Truck,
  Play,
  Pause,
  RefreshCcw,
  Gauge,
  Clock,
  MapPin,
  User,
  CheckCircle2,
  Calendar,
  TrendingUp,
  Route,
  Fuel,
  History,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Timer,
  Navigation,
  Activity,
  BarChart3,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { useTableSync } from '../hooks/useTableSync';

// ─── Types ─────────────────────────────────────────────────
interface Vehicle {
  id: string;
  plate: string;
  model: string;
}

interface VehicleShift {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel?: string;
  startKm: number;
  endKm: number | null;
  startTime: string;
  endTime: string | null;
  startTimestamp: number;
  endTimestamp?: number;
  employee: string;
  employeeId?: string;
  status: 'active' | 'completed';
  totalKm?: number;
  date: string;
}

interface KmLog {
  id: string;
  time: string;
  timestamp: number;
  action: 'start' | 'end' | 'change' | 'note';
  vehicle: string;
  km: number;
  employee: string;
  note?: string;
  date: string;
}

type LogFilter = 'all' | 'today' | 'week' | 'start' | 'end' | 'change';

// ─── Helpers ───────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];
const nowTime = () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const nowTimestamp = () => Date.now();

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}s ${m}dk`;
  if (m > 0) return `${m}dk ${s}sn`;
  return `${s}sn`;
}

function isToday(dateStr: string): boolean {
  return dateStr === today();
}

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return d >= weekAgo && d <= now;
}

// ─── Component ─────────────────────────────────────────────
export function AracTakipPage() {
  const { currentEmployee } = useEmployee();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { emit } = useModuleBus();

  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canAdd, canDelete, canEdit } = getPagePermissions(user, currentEmployee, 'araclar');

  const { data: syncedShifts, addItem: addShiftToPouchDB, updateItem: updateShiftInPouchDB } = useTableSync<VehicleShift>({
    tableName: 'arac_shifts',
    storageKey: StorageKey.ARAC_SHIFTS,
    initialData: [],
    orderBy: 'date',
    orderAsc: false,
  });

  const { addItem: addKmLogToPouchDB } = useTableSync<KmLog>({
    tableName: 'arac_km_logs',
    storageKey: StorageKey.ARAC_KM_LOGS,
    initialData: [],
    orderBy: 'timestamp',
    orderAsc: false,
  });

  // Persistent state
  const [activeShift, setActiveShift] = useState<VehicleShift | null>(() =>
    getFromStorage<VehicleShift>('arac_active_shift')
  );
  const [shiftHistory, setShiftHistory] = useState<VehicleShift[]>(() =>
    getFromStorage<VehicleShift[]>(StorageKey.ARAC_SHIFTS) || []
  );
  const [kmLogs, setKmLogs] = useState<KmLog[]>(() =>
    getFromStorage<KmLog[]>(StorageKey.ARAC_KM_LOGS) || []
  );

  // Synced shifts geldiğinde local state'i güncelle
  useEffect(() => {
    if (syncedShifts && syncedShifts.length > 0) {
      setShiftHistory(syncedShifts);
    }
  }, [syncedShifts]);

  // UI state
  const [isStartDayOpen, setIsStartDayOpen] = useState(false);
  const [isEndDayOpen, setIsEndDayOpen] = useState(false);
  const [isChangeVehicleOpen, setIsChangeVehicleOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [startKm, setStartKm] = useState('');
  const [endKm, setEndKm] = useState('');
  const [newVehicle, setNewVehicle] = useState('');
  const [newStartKm, setNewStartKm] = useState('');
  const [logFilter, setLogFilter] = useState<LogFilter>('today');
  const [showHistory, setShowHistory] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('');

  // Live timer
  useEffect(() => {
    if (!activeShift) { setElapsedTime(''); return; }
    const tick = () => {
      const diff = Date.now() - activeShift.startTimestamp;
      setElapsedTime(formatDuration(diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeShift]);

  // Persist helpers
  const persistShift = useCallback((shift: VehicleShift | null) => {
    setActiveShift(shift);
    if (shift) {
      setInStorage('arac_active_shift', shift);
    } else {
      setInStorage('arac_active_shift', null);
    }
  }, []);

  const persistHistory = useCallback((list: VehicleShift[]) => {
    setShiftHistory(list);
    setInStorage(StorageKey.ARAC_SHIFTS, list);
  }, []);

  const persistLogs = useCallback((list: KmLog[]) => {
    setKmLogs(list);
    setInStorage(StorageKey.ARAC_KM_LOGS, list);
  }, []);

  // Load vehicles
  const vehicles = useMemo(() => {
    const aracList = getFromStorage<any[]>(StorageKey.ARAC_DATA);
    if (!aracList || aracList.length === 0) return [];
    return aracList.map(a => ({
      id: a.id,
      plate: a.plate || a.plaka || '',
      model: a.model || ''
    }));
  }, []);

  // ─── Stats ────────────────────────────────────
  const todayStats = useMemo(() => {
    const todayShifts = shiftHistory.filter(s => isToday(s.date));
    const totalKm = todayShifts.reduce((sum, s) => sum + (s.totalKm || 0), 0);
    const totalDurationMs = todayShifts.reduce((sum, s) => {
      if (s.endTimestamp && s.startTimestamp) return sum + (s.endTimestamp - s.startTimestamp);
      return sum;
    }, 0);
    const vehicleSet = new Set(todayShifts.map(s => s.vehiclePlate));
    return {
      totalKm,
      shiftCount: todayShifts.length,
      totalDuration: totalDurationMs > 0 ? formatDuration(totalDurationMs) : '-',
      uniqueVehicles: vehicleSet.size,
      avgKmPerShift: todayShifts.length > 0 ? Math.round(totalKm / todayShifts.length) : 0,
    };
  }, [shiftHistory]);

  const weekStats = useMemo(() => {
    const weekShifts = shiftHistory.filter(s => isThisWeek(s.date));
    const totalKm = weekShifts.reduce((sum, s) => sum + (s.totalKm || 0), 0);
    return { totalKm, shiftCount: weekShifts.length };
  }, [shiftHistory]);

  // ─── Filtered logs ───────────────────────────
  const filteredLogs = useMemo(() => {
    let list = kmLogs;
    switch (logFilter) {
      case 'today':
        list = list.filter(l => isToday(l.date));
        break;
      case 'week':
        list = list.filter(l => isThisWeek(l.date));
        break;
      case 'start':
        list = list.filter(l => l.action === 'start');
        break;
      case 'end':
        list = list.filter(l => l.action === 'end');
        break;
      case 'change':
        list = list.filter(l => l.action === 'change');
        break;
    }
    return list;
  }, [kmLogs, logFilter]);

  // ─── Handlers ─────────────────────────────────
  const handleStartDay = () => {
    if (!canAdd) {
      toast.error('Araç takip başlatma yetkiniz bulunmamaktadır.');
      logActivity('security_alert', 'Yetkisiz Araç Takip Başlatma', { level: 'medium', employeeName: user?.name, description: 'Kullanıcı güne başlamaya çalıştı ancak yetkisi yoktu.' });
      return;
    }
    if (!selectedVehicle || !startKm) {
      toast.error('Lutfen arac ve kilometre bilgilerini giriniz');
      return;
    }
    const vehicle = vehicles.find(v => v.id === selectedVehicle);
    if (!vehicle) return;

    const newShift: VehicleShift = {
      id: `shift_${Date.now()}`,
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate,
      vehicleModel: vehicle.model,
      startKm: parseInt(startKm, 10),
      endKm: null,
      startTime: nowTime(),
      endTime: null,
      startTimestamp: nowTimestamp(),
      employee: currentEmployee?.name || 'Bilinmeyen',
      employeeId: currentEmployee?.id,
      status: 'active',
      date: today(),
    };

    const newLog: KmLog = {
      id: `log_${Date.now()}`,
      time: nowTime(),
      timestamp: nowTimestamp(),
      action: 'start',
      vehicle: vehicle.plate,
      km: parseInt(startKm, 10),
      employee: currentEmployee?.name || 'Bilinmeyen',
      date: today(),
    };

    persistShift(newShift);
    persistLogs([newLog, ...kmLogs]);
    // Başlayan vardiyayı ve KM logunu PouchDB'ye yaz
    addShiftToPouchDB(newShift).catch(e => console.error('[AracTakip] shift PouchDB:', e));
    addKmLogToPouchDB(newLog).catch(e => console.error('[AracTakip] km log PouchDB:', e));

    logActivity('vehicle_shift_start', `Vardiya baslatildi: ${vehicle.plate}`, {
      employeeId: currentEmployee?.id,
      employeeName: currentEmployee?.name,
      page: 'arac-takip',
      metadata: { vehicle: vehicle.plate, startKm: parseInt(startKm, 10) },
    });

    setIsStartDayOpen(false);
    setSelectedVehicle('');
    setStartKm('');
    emit('arac:shift_started', { vehiclePlate: vehicle.plate, startKm: parseInt(startKm, 10) });
    toast.success(`Gun baslatildi! Arac: ${vehicle.plate} - Baslangic KM: ${startKm}`);
  };

  const handleEndDay = () => {
    if (!canAdd) {
      toast.error('Araç takip bitirme yetkiniz bulunmamaktadır.');
      logActivity('security_alert', 'Yetkisiz Araç Takip Bitirme', { level: 'medium', employeeName: user?.name, description: 'Kullanıcı günü bitirmeye çalıştı ancak yetkisi yoktu.' });
      return;
    }
    if (!endKm || !activeShift) {
      toast.error('Lutfen bitis kilometresini giriniz');
      return;
    }
    const endKmNum = parseInt(endKm, 10);
    if (endKmNum < activeShift.startKm) {
      toast.error('Bitis kilometresi baslangictan kucuk olamaz!');
      return;
    }

    const newLog: KmLog = {
      id: `log_${Date.now()}`,
      time: nowTime(),
      timestamp: nowTimestamp(),
      action: 'end',
      vehicle: activeShift.vehiclePlate,
      km: endKmNum,
      employee: currentEmployee?.name || 'Bilinmeyen',
      date: today(),
    };

    const completedShift: VehicleShift = {
      ...activeShift,
      endKm: endKmNum,
      endTime: nowTime(),
      endTimestamp: nowTimestamp(),
      status: 'completed',
      totalKm: endKmNum - activeShift.startKm,
    };

    persistLogs([newLog, ...kmLogs]);
    persistHistory([completedShift, ...shiftHistory]);
    persistShift(null);
    // Tamamlanan vardiyayı güncelle (başlarken eklenmişti) + KM logunu yaz
    updateShiftInPouchDB(completedShift.id, completedShift).catch(() =>
      addShiftToPouchDB(completedShift).catch(e => console.error('[AracTakip] shift PouchDB:', e))
    );
    addKmLogToPouchDB(newLog).catch(e => console.error('[AracTakip] km log PouchDB:', e));

    logActivity('vehicle_shift_end', `Vardiya bitirildi: ${activeShift.vehiclePlate}`, {
      employeeId: currentEmployee?.id,
      employeeName: currentEmployee?.name,
      page: 'arac-takip',
      metadata: { vehicle: activeShift.vehiclePlate, totalKm: endKmNum - activeShift.startKm },
    });

    const kmDiff = endKmNum - activeShift.startKm;
    emit('arac:shift_ended', { vehiclePlate: activeShift.vehiclePlate, totalKm: kmDiff });
    toast.success(`Gun bitirildi! ${kmDiff} km yol alindi`);
    setIsEndDayOpen(false);
    setEndKm('');
  };

  const handleChangeVehicle = () => {
    if (!endKm || !newVehicle || !newStartKm || !activeShift) {
      toast.error('Lutfen tum alanlari doldurunuz');
      return;
    }
    const endKmNum = parseInt(endKm, 10);
    const newStartKmNum = parseInt(newStartKm, 10);
    if (endKmNum < activeShift.startKm) {
      toast.error('Mevcut aracin bitis kilometresi baslangictan kucuk olamaz!');
      return;
    }
    const vehicle = vehicles.find(v => v.id === newVehicle);
    if (!vehicle) return;

    // Eski vardiyi kapat
    const completedShift: VehicleShift = {
      ...activeShift,
      endKm: endKmNum,
      endTime: nowTime(),
      endTimestamp: nowTimestamp(),
      status: 'completed',
      totalKm: endKmNum - activeShift.startKm,
    };

    const endLog: KmLog = {
      id: `log_${Date.now()}`,
      time: nowTime(),
      timestamp: nowTimestamp(),
      action: 'end',
      vehicle: activeShift.vehiclePlate,
      km: endKmNum,
      employee: currentEmployee?.name || 'Bilinmeyen',
      date: today(),
    };

    const startLog: KmLog = {
      id: `log_${Date.now() + 1}`,
      time: nowTime(),
      timestamp: nowTimestamp() + 1,
      action: 'change',
      vehicle: vehicle.plate,
      km: newStartKmNum,
      employee: currentEmployee?.name || 'Bilinmeyen',
      date: today(),
    };

    const newShift: VehicleShift = {
      id: `shift_${Date.now() + 2}`,
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate,
      vehicleModel: vehicle.model,
      startKm: newStartKmNum,
      endKm: null,
      startTime: nowTime(),
      endTime: null,
      startTimestamp: nowTimestamp(),
      employee: currentEmployee?.name || 'Bilinmeyen',
      employeeId: currentEmployee?.id,
      status: 'active',
      date: today(),
    };

    persistLogs([startLog, endLog, ...kmLogs]);
    persistHistory([completedShift, ...shiftHistory]);
    persistShift(newShift);
    // Eski vardiyayı güncelle, yeni vardiyayı ekle, KM loglarını yaz
    updateShiftInPouchDB(completedShift.id, completedShift).catch(() =>
      addShiftToPouchDB(completedShift).catch(e => console.error('[AracTakip] shift PouchDB:', e))
    );
    addShiftToPouchDB(newShift).catch(e => console.error('[AracTakip] new shift PouchDB:', e));
    addKmLogToPouchDB(endLog).catch(e => console.error('[AracTakip] km log PouchDB:', e));
    addKmLogToPouchDB(startLog).catch(e => console.error('[AracTakip] km log PouchDB:', e));

    logActivity('vehicle_change', `Arac degistirildi: ${activeShift.vehiclePlate} -> ${vehicle.plate}`, {
      employeeId: currentEmployee?.id,
      employeeName: currentEmployee?.name,
      page: 'arac-takip',
      metadata: { oldVehicle: activeShift.vehiclePlate, newVehicle: vehicle.plate },
    });

    setIsChangeVehicleOpen(false);
    setEndKm('');
    setNewVehicle('');
    setNewStartKm('');

    const kmDiff = endKmNum - activeShift.startKm;
    toast.success(`Arac degistirildi! Onceki aracta ${kmDiff} km yol alindi`);
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'start': return 'text-green-400';
      case 'end': return 'text-red-400';
      case 'change': return 'text-blue-400';
      case 'note': return 'text-yellow-400';
      default: return 'text-muted-foreground';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'start': return 'Gun Basladi';
      case 'end': return 'Gun Bitti';
      case 'change': return 'Arac Degistirildi';
      case 'note': return 'Not';
      default: return 'Bilinmeyen';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'start': return <Play className="w-4 h-4 text-white" />;
      case 'end': return <Pause className="w-4 h-4 text-white" />;
      case 'change': return <RefreshCcw className="w-4 h-4 text-white" />;
      default: return <Activity className="w-4 h-4 text-white" />;
    }
  };

  const getActionBg = (action: string) => {
    switch (action) {
      case 'start': return 'bg-green-600';
      case 'end': return 'bg-red-600';
      case 'change': return 'bg-blue-600';
      default: return 'bg-yellow-600';
    }
  };

  const filterLabels: Record<LogFilter, string> = {
    all: 'Tumu',
    today: 'Bugun',
    week: 'Bu Hafta',
    start: 'Baslangiclar',
    end: 'Bitisler',
    change: 'Degisimler',
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1">Arac Takip Sistemi</h1>
          <p className="text-muted-foreground">
            Calisan: <span className="text-blue-400 font-medium">{currentEmployee?.name || 'Secilmedi'}</span>
            {activeShift && (
              <span className="ml-3 inline-flex items-center gap-1.5 text-green-400 text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                Aktif Vardiya
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!activeShift ? (
            <button
              onClick={() => setIsStartDayOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-green-600/25"
            >
              <Play className="w-5 h-5" />
              Gun Baslat
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsChangeVehicleOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-blue-600/25"
              >
                <RefreshCcw className="w-4 h-4" />
                Arac Degistir
              </button>
              <button
                onClick={() => setIsEndDayOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-red-600/25"
              >
                <Pause className="w-4 h-4" />
                Gun Bitir
              </button>
            </>
          )}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-accent text-white font-medium rounded-xl transition-colors"
          >
            <History className="w-4 h-4" />
            Gecmis
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Bugun Toplam KM', value: todayStats.totalKm.toLocaleString(), icon: Route, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20' },
          { label: 'Vardiya Sayisi', value: todayStats.shiftCount.toString(), icon: Activity, color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20' },
          { label: 'Toplam Sure', value: activeShift ? elapsedTime || '-' : todayStats.totalDuration, icon: Timer, color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20' },
          { label: 'Kullanilan Arac', value: todayStats.uniqueVehicles.toString(), icon: Truck, color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/20' },
          { label: 'Haftalik KM', value: weekStats.totalKm.toLocaleString(), icon: TrendingUp, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10 border-cyan-500/20' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`p-4 rounded-xl border ${stat.bgColor} backdrop-blur-sm`}
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <p className={`text-xl md:text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Active Shift Panel */}
      <AnimatePresence mode="wait">
        {activeShift ? (
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            className="relative overflow-hidden rounded-2xl border-2 border-green-600/60 bg-gradient-to-br from-green-900/15 via-card to-green-800/10 p-6"
          >
            {/* Decorative gradient */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-green-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg shadow-green-600/25">
                  <Truck className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Aktif Vardiya</h3>
                  <p className="text-sm text-green-400 flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    Gorev devam ediyor
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-green-600/20 border border-green-500/30 rounded-xl">
                  <Clock className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 font-bold text-sm">{activeShift.startTime}</span>
                </div>
                {elapsedTime && (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/60 border border-border/60 rounded-xl">
                    <Timer className="w-4 h-4 text-blue-400 animate-pulse" />
                    <span className="text-blue-400 font-mono font-bold text-sm">{elapsedTime}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: Navigation, label: 'Arac', value: activeShift.vehiclePlate, sub: activeShift.vehicleModel },
                { icon: Gauge, label: 'Baslangic KM', value: activeShift.startKm.toLocaleString() },
                { icon: User, label: 'Calisan', value: activeShift.employee },
                { icon: MapPin, label: 'Durum', value: 'Yolda', valueColor: 'text-green-400' },
              ].map((item) => (
                <div key={item.label} className="p-3.5 bg-muted/40 rounded-xl border border-border/40">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                  </div>
                  <p className={`text-base font-bold ${item.valueColor || 'text-white'}`}>{item.value}</p>
                  {item.sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{item.sub}</p>}
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="inactive"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            className="bg-card border border-border rounded-2xl p-10 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-secondary/60 flex items-center justify-center mx-auto mb-5">
              <Truck className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Aktif Vardiya Yok</h3>
            <p className="text-muted-foreground mb-5 max-w-md mx-auto">
              "Gun Baslat" butonuna tiklayarak yeni bir vardiya baslatabilirsiniz. Tum KM hareketleri otomatik olarak kaydedilir.
            </p>
            <button
              onClick={() => setIsStartDayOpen(true)}
              className="inline-flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-green-600/25"
            >
              <Play className="w-5 h-5" />
              Gun Baslat
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shift History Panel */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-border/60 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-400" />
                    Vardiya Gecmisi
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{shiftHistory.length} kayit</p>
                </div>
              </div>

              {shiftHistory.length === 0 ? (
                <div className="p-10 text-center">
                  <History className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Henuz tamamlanmis vardiya yok</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto custom-scrollbar">
                  {shiftHistory.slice(0, 30).map((shift, i) => (
                    <motion.div
                      key={shift.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="p-4 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                            <Truck className="w-5 h-5 text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{shift.vehiclePlate}</span>
                              {shift.vehicleModel && <span className="text-xs text-muted-foreground">({shift.vehicleModel})</span>}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span>{shift.date}</span>
                              <span>{shift.startTime} - {shift.endTime || '-'}</span>
                              <span>{shift.employee}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="flex items-center gap-1.5 text-sm">
                              <Route className="w-3.5 h-3.5 text-blue-400" />
                              <span className="font-bold text-blue-400">{(shift.totalKm || 0).toLocaleString()} km</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{shift.startKm.toLocaleString()} &rarr; {(shift.endKm || 0).toLocaleString()}</p>
                          </div>
                          {shift.endTimestamp && shift.startTimestamp && (
                            <div className="text-right">
                              <div className="flex items-center gap-1.5 text-sm">
                                <Timer className="w-3.5 h-3.5 text-purple-400" />
                                <span className="font-medium text-purple-400">{formatDuration(shift.endTimestamp - shift.startTimestamp)}</span>
                              </div>
                            </div>
                          )}
                          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KM Hareketleri Logu */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-400" />
              Kilometre Hareketleri
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filteredLogs.length} hareket kaydi
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(filterLabels) as LogFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  logFilter === f
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-secondary/60 text-muted-foreground hover:text-white hover:bg-secondary'
                }`}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-border/40 max-h-[500px] overflow-y-auto custom-scrollbar">
          <AnimatePresence initial={false}>
            {filteredLogs.length === 0 ? (
              <div className="p-10 text-center">
                <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Bu filtrede hareket kaydedilmemis</p>
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 15 }}
                  transition={{ delay: Math.min(index * 0.03, 0.5) }}
                  className="p-4 hover:bg-secondary/30 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${getActionBg(log.action)} shadow-md`}>
                        {getActionIcon(log.action)}
                      </div>
                    </div>

                    {/* Time */}
                    <div className="flex flex-col items-center min-w-[52px]">
                      <span className="text-sm font-mono text-muted-foreground">{log.time}</span>
                      <span className="text-[10px] text-muted-foreground/50">{log.date !== today() ? log.date : ''}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${getActionColor(log.action)}`}>
                        {getActionLabel(log.action)}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground/70">
                        <span className="flex items-center gap-1">
                          <Navigation className="w-3 h-3" />
                          <span className="text-muted-foreground">{log.vehicle}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          <span className="text-muted-foreground font-mono">{log.km.toLocaleString()} km</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span className="text-muted-foreground">{log.employee}</span>
                        </span>
                      </div>
                    </div>

                    <CheckCircle2 className="w-4 h-4 text-green-500/60 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ════════════════ DIALOGS ════════════════ */}

      {/* Gun Baslat Dialog */}
      <Dialog.Root open={isStartDayOpen} onOpenChange={setIsStartDayOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <Dialog.Content
            className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-card border border-border rounded-2xl p-4 sm:p-6 sm:w-[95vw] sm:max-w-md z-50 shadow-2xl overflow-y-auto overscroll-contain" style={{maxHeight:'calc(100dvh - 1rem)'}}
            aria-describedby={undefined}
          >
            <Dialog.Title className="text-xl font-bold text-white mb-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center">
                <Play className="w-5 h-5 text-white" />
              </div>
              Gun Baslat
            </Dialog.Title>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Arac Seciniz <span className="text-red-400">*</span>
                </label>
                {vehicles.length === 0 ? (
                  <div className="p-3 bg-yellow-900/20 border border-yellow-800/40 rounded-xl text-sm text-yellow-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Henuz arac eklenmemis. Once Arac sayfasindan arac ekleyin.
                  </div>
                ) : (
                  <Select.Root value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <Select.Trigger className="w-full flex items-center justify-between px-4 py-3 bg-secondary border border-border rounded-xl text-white hover:bg-accent transition-colors">
                      <Select.Value placeholder="Arac secin..." />
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="bg-card border border-border rounded-xl p-2 shadow-xl z-[60]">
                        <Select.Viewport>
                          {vehicles.map((vehicle) => (
                            <Select.Item
                              key={vehicle.id}
                              value={vehicle.id}
                              className="px-4 py-2.5 rounded-lg text-foreground/80 hover:bg-secondary hover:text-white cursor-pointer outline-none flex items-center gap-2"
                            >
                              <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                              <Select.ItemText>{vehicle.plate} - {vehicle.model}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Teslim Alinan Kilometre <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="number"
                    value={startKm}
                    onChange={(e) => setStartKm(e.target.value)}
                    placeholder="0"
                    className="w-full pl-10 pr-4 py-3 bg-secondary border border-border rounded-xl text-white placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-green-900/15 border border-green-800/30 rounded-xl">
                <p className="text-sm text-green-400">
                  Calisan: <span className="font-bold">{currentEmployee?.name}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tum KM hareketleri otomatik loglanacaktir
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleStartDay}
                disabled={!selectedVehicle || !startKm}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
              >
                Baslat
              </button>
              <Dialog.Close asChild>
                <button className="flex-1 py-3 bg-secondary hover:bg-accent text-white font-bold rounded-xl transition-colors">
                  Iptal
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Gun Bitir Dialog */}
      <Dialog.Root open={isEndDayOpen} onOpenChange={setIsEndDayOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <Dialog.Content
            className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-card border border-border rounded-2xl p-4 sm:p-6 sm:w-[95vw] sm:max-w-md z-50 shadow-2xl overflow-y-auto overscroll-contain" style={{maxHeight:'calc(100dvh - 1rem)'}}
            aria-describedby={undefined}
          >
            <Dialog.Title className="text-xl font-bold text-white mb-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
                <Pause className="w-5 h-5 text-white" />
              </div>
              Gun Bitir
            </Dialog.Title>

            <div className="space-y-4">
              {activeShift && (
                <div className="p-4 bg-secondary/60 rounded-xl space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Arac:</span>
                    <span className="text-white font-medium">{activeShift.vehiclePlate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Baslangic KM:</span>
                    <span className="text-white font-medium">{activeShift.startKm.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Baslangic Saati:</span>
                    <span className="text-white font-medium">{activeShift.startTime}</span>
                  </div>
                  {elapsedTime && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gecen Sure:</span>
                      <span className="text-blue-400 font-medium">{elapsedTime}</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Birakma Kilometresi <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="number"
                    value={endKm}
                    onChange={(e) => setEndKm(e.target.value)}
                    placeholder="0"
                    className="w-full pl-10 pr-4 py-3 bg-secondary border border-border rounded-xl text-white placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all"
                  />
                </div>
                {endKm && activeShift && (
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <Route className="w-4 h-4 text-blue-400" />
                    <span className="text-blue-400 font-medium">
                      Toplam: {(parseInt(endKm, 10) - activeShift.startKm).toLocaleString()} km
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleEndDay}
                disabled={!endKm}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
              >
                Bitir
              </button>
              <Dialog.Close asChild>
                <button className="flex-1 py-3 bg-secondary hover:bg-accent text-white font-bold rounded-xl transition-colors">
                  Iptal
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Arac Degistir Dialog */}
      <Dialog.Root open={isChangeVehicleOpen} onOpenChange={setIsChangeVehicleOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
          <Dialog.Content
            className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-card border border-border rounded-2xl p-4 sm:p-6 sm:w-[95vw] sm:max-w-md z-50 shadow-2xl overflow-y-auto overscroll-contain" style={{maxHeight:'calc(100dvh - 1rem)'}}
            aria-describedby={undefined}
          >
            <Dialog.Title className="text-xl font-bold text-white mb-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <RefreshCcw className="w-5 h-5 text-white" />
              </div>
              Arac Degistir
            </Dialog.Title>

            <div className="space-y-4">
              {activeShift && (
                <>
                  <div className="p-4 bg-red-900/15 border border-red-800/30 rounded-xl">
                    <p className="text-sm text-red-400 font-medium mb-2">Mevcut Arac: {activeShift.vehiclePlate}</p>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Birakma Kilometresi *</label>
                      <input
                        type="number"
                        value={endKm}
                        onChange={(e) => setEndKm(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-white placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-green-900/15 border border-green-800/30 rounded-xl space-y-3">
                    <p className="text-sm text-green-400 font-medium">Yeni Arac</p>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Arac Seciniz *</label>
                      <Select.Root value={newVehicle} onValueChange={setNewVehicle}>
                        <Select.Trigger className="w-full flex items-center justify-between px-3 py-2.5 bg-secondary border border-border rounded-xl text-white hover:bg-accent transition-colors">
                          <Select.Value placeholder="Arac secin..." />
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="bg-card border border-border rounded-xl p-2 shadow-xl z-[60]">
                            <Select.Viewport>
                              {vehicles
                                .filter(v => v.id !== activeShift.vehicleId)
                                .map((vehicle) => (
                                  <Select.Item
                                    key={vehicle.id}
                                    value={vehicle.id}
                                    className="px-4 py-2.5 rounded-lg text-foreground/80 hover:bg-secondary hover:text-white cursor-pointer outline-none"
                                  >
                                    <Select.ItemText>{vehicle.plate} - {vehicle.model}</Select.ItemText>
                                  </Select.Item>
                                ))}
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Teslim Alinan Kilometre *</label>
                      <input
                        type="number"
                        value={newStartKm}
                        onChange={(e) => setNewStartKm(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-white placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleChangeVehicle}
                disabled={!endKm || !newVehicle || !newStartKm}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
              >
                Degistir
              </button>
              <Dialog.Close asChild>
                <button className="flex-1 py-3 bg-secondary hover:bg-accent text-white font-bold rounded-xl transition-colors">
                  Iptal
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}