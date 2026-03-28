import React, { useState } from 'react';
import { Truck, User, Gauge, AlertTriangle, Calendar, Wrench, Plus, Trash2, X, Activity, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { useTableSync } from '../hooks/useTableSync';
import { SyncStatusBar, SyncBadge } from '../components/SyncStatusBar';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { logActivity } from '../utils/activityLogger';
import { useLanguage } from '../contexts/LanguageContext';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { usePageSecurity } from '../hooks/usePageSecurity';

interface Vehicle {
  id: string;
  plate: string;
  model: string;
  driver: string;
  km: number;
  lastMaintenance: string;
  nextInspection: string;
  insurance: string;
  status: 'active' | 'maintenance' | 'idle';
  created_at?: string;
}

const initialVehicles: Vehicle[] = [];

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  active:      { label: 'Aktif / Yolda', color: 'emerald', icon: CheckCircle2 },
  maintenance: { label: 'Bakımda',       color: 'orange', icon: Wrench },
  idle:        { label: 'Boşta / Park',  color: 'gray', icon: Truck },
};

function vehicleToDb(v: Vehicle) {
  return {
    id: v.id, plate: v.plate, model: v.model, driver: v.driver, km: v.km,
    last_maintenance: v.lastMaintenance, next_inspection: v.nextInspection,
    insurance: v.insurance, status: v.status,
  };
}

function vehicleFromDb(row: any): Vehicle {
  return {
    id: row.id, plate: row.plate || '', model: row.model || '', driver: row.driver || '',
    km: row.km ?? 0, lastMaintenance: row.last_maintenance || '-', nextInspection: row.next_inspection || '-',
    insurance: row.insurance || '-', status: row.status || 'active', created_at: row.created_at,
  };
}

export function AracPage() {
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { lang: language } = useLanguage();
  const { emit } = useModuleBus();
  
  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canAdd, canDelete, canEdit } = getPagePermissions(user, currentEmployee, 'araclar');
  const sec = usePageSecurity('arac');

  const { data: vehicles, addItem, deleteItem, updateItem } = useTableSync<Vehicle>({
    tableName: 'araclar', storageKey: 'arac_data', initialData: initialVehicles,
    orderBy: 'created_at', orderAsc: false, toDb: vehicleToDb, fromDb: vehicleFromDb,
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const activeCount = vehicles.filter(v => v.status === 'active').length;
  const maintenanceCount = vehicles.filter(v => v.status === 'maintenance').length;
  const idleCount = vehicles.filter(v => v.status === 'idle').length;

  const handleAddVehicle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canAdd) {
      sec.logUnauthorized('add', 'Kullanıcı araç eklemeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    const formData = new FormData(e.currentTarget);
    const plate = (formData.get('plate') as string || '').trim();
    const model = (formData.get('model') as string || '').trim();
    const driver = (formData.get('driver') as string || '').trim();

    if (!sec.preCheck('add', { plate, model, driver })) return;

    const newVehicle: Vehicle = {
      id: crypto.randomUUID(), plate: sec.sanitize(plate), model: sec.sanitize(model),
      driver: sec.sanitize(driver), km: Number(formData.get('km') || 0),
      lastMaintenance: formData.get('lastMaintenance') as string || '-', nextInspection: formData.get('nextInspection') as string || '-',
      insurance: formData.get('insurance') as string || '-', status: 'active',
    };
    await addItem(newVehicle);
    sec.auditLog('add', newVehicle.id, newVehicle.plate);
    emit('arac:added', { vehicleId: newVehicle.id, plate: newVehicle.plate });
    logActivity('custom', `Yeni araç eklendi: ${newVehicle.plate}`, { employeeName: user?.name, page: 'Arac', description: `${newVehicle.plate} plakalı ${newVehicle.model} aracı sisteme eklendi.` });
    toast.success(`${newVehicle.plate} plakalı araç eklendi.`);
    setIsAddModalOpen(false);
    (e.target as HTMLFormElement).reset();
  };

  const handleDelete = async (e: React.MouseEvent, id: string, plate: string) => {
    e.stopPropagation();
    if (!canDelete) {
      sec.logUnauthorized('delete', 'Kullanıcı araç silmeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    if (!sec.checkRate('delete')) return;
    if (!confirm(`${plate} plakalı aracı sistemden silmek istediğinize emin misiniz?`)) return;
    await deleteItem(id);
    sec.auditLog('delete', id, plate);
    emit('arac:deleted', { vehicleId: id, plate });
    logActivity('custom', `Araç silindi: ${plate}`, { employeeName: user?.name, page: 'Arac', description: `${plate} plakalı araç sistemden silindi.`, category: 'vehicle' });
    toast.success(`${plate} plakalı araç silindi.`);
  };

  const handleStatusChange = async (id: string, status: Vehicle['status']) => {
    if (!canEdit) {
      sec.logUnauthorized('edit', 'Kullanıcı araç durumunu değiştirmeye çalıştı ancak yetkisi yoktu.');
      return;
    }
    if (!sec.checkRate('edit')) return;
    await updateItem(id, { status });
    sec.auditLog('edit', id, `status:${status}`);
    logActivity('custom', `Araç durumu güncellendi`, { employeeName: user?.name, page: 'Arac', description: `Araç durumu '${STATUS_LABELS[status]?.label}' olarak değiştirildi.`, category: 'vehicle' });
    toast.success('Araç durumu güncellendi.');
  };

  const inputCls = "w-full bg-black/40 text-white px-4 py-3 rounded-xl border border-white/10 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 text-sm transition-all placeholder-white/20";
  const labelCls = "text-gray-400 text-xs font-bold uppercase tracking-widest mb-1.5 block ml-1";

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-28 sm:pb-6">
      <SyncStatusBar tableName="araclar" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Araç & Lojistik</h1>
            <SyncBadge tableName="araclar" />
          </div>
          <p className="text-xs sm:text-sm text-gray-400">Filo yönetimi, muayene, bakım ve sürücü takibi</p>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20 w-full sm:w-auto active:scale-95">
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" /> Yeni Araç Ekle
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Toplam Filo', value: vehicles.length, color: 'blue', icon: Truck },
          { label: 'Yolda / Aktif', value: activeCount, color: 'emerald', icon: Activity, pulse: true },
          { label: 'Servis / Bakımda', value: maintenanceCount, color: 'orange', icon: Wrench },
          { label: 'Garajda / Boşta', value: idleCount, color: 'gray', icon: AlertTriangle },
        ].map((stat, i) => (
          <div key={i} className={`p-4 sm:p-6 rounded-2xl lg:rounded-3xl bg-[#111] border border-white/5 relative overflow-hidden group hover:border-${stat.color}-500/30 transition-all`}>
            <div className={`absolute -top-10 -right-10 w-24 h-24 bg-${stat.color}-500/10 rounded-full blur-2xl group-hover:bg-${stat.color}-500/20 transition-colors`} />
            <div className="relative z-10 flex flex-col gap-2 sm:gap-3">
              <div className="flex items-center justify-between">
                <div className={`p-2.5 rounded-xl bg-${stat.color}-500/10 text-${stat.color}-400 relative`}>
                  <stat.icon className="w-5 h-5" />
                  {stat.pulse && <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />}
                </div>
              </div>
              <div>
                <p className="text-2xl sm:text-4xl font-black text-white">{stat.value}</p>
                <p className="text-[9px] sm:text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Vehicles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence>
          {vehicles.map((vehicle, index) => {
            const statusInfo = STATUS_LABELS[vehicle.status] || STATUS_LABELS.idle;
            const StatusIcon = statusInfo.icon;
            return (
              <motion.div
                key={vehicle.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: index * 0.05 }}
                className="p-6 rounded-3xl bg-[#111] border border-white/5 hover:border-white/20 transition-all group flex flex-col h-full"
              >
                {/* Header: Plate & Status */}
                <div className="flex justify-between items-start mb-6">
                  <div className="flex gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex flex-col items-center justify-center text-blue-400 font-black shadow-inner">
                      <span className="text-[10px] uppercase text-blue-500/80 -mb-1">TR</span>
                      <span className="text-lg tracking-tighter">{(vehicle.plate.match(/^\d{2}/) || ['34'])[0]}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white tracking-tight">{vehicle.plate}</h3>
                      <p className="text-sm text-gray-400 font-medium">{vehicle.model}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-${statusInfo.color}-500/10 text-${statusInfo.color}-400 border border-${statusInfo.color}-500/20`}>
                      <StatusIcon className="w-3.5 h-3.5" /> {statusInfo.label}
                    </span>
                    <button onClick={(e) => handleDelete(e, vehicle.id, vehicle.plate)} className="opacity-0 group-hover:opacity-100 p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>

                {/* Info List */}
                <div className="flex-1 space-y-3 mb-6 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.02]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-gray-500 font-bold uppercase tracking-widest"><User className="w-4 h-4"/> Sürücü</span>
                    <span className="text-sm font-medium text-white">{vehicle.driver}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-gray-500 font-bold uppercase tracking-widest"><Gauge className="w-4 h-4"/> Kilometre</span>
                    <span className="text-sm font-medium text-white font-mono">{vehicle.km.toLocaleString('tr-TR')} km</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-gray-500 font-bold uppercase tracking-widest"><Calendar className="w-4 h-4"/> Muayene</span>
                    <span className="text-sm font-medium text-white">{vehicle.nextInspection}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-gray-500 font-bold uppercase tracking-widest"><Wrench className="w-4 h-4"/> Son Bakım</span>
                    <span className="text-sm font-medium text-white">{vehicle.lastMaintenance}</span>
                  </div>
                </div>

                {/* Status Switcher Buttons */}
                <div className="grid grid-cols-3 gap-2 mt-auto">
                  {(['active', 'maintenance', 'idle'] as const).map(s => {
                    const isActive = vehicle.status === s;
                    const c = STATUS_LABELS[s].color;
                    const Icon = STATUS_LABELS[s].icon;
                    return (
                      <button key={s} onClick={() => handleStatusChange(vehicle.id, s)}
                        className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all border ${isActive ? `bg-${c}-500/20 border-${c}-500/50 text-${c}-400 shadow-[0_0_15px_rgba(0,0,0,0.2)]` : 'bg-black/20 border-white/5 text-gray-500 hover:bg-white/5 hover:text-white'}`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{STATUS_LABELS[s].label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add Modal */}
      <Dialog.Root open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm"/><Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#111] p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 w-[95vw] max-w-2xl z-50 shadow-2xl overflow-y-auto max-h-[90vh]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Dialog.Title className="text-2xl font-bold">Yeni Araç Kaydı</Dialog.Title>
              <Dialog.Description className="text-gray-500 text-sm mt-1">Sisteme yeni bir filo aracı ekleyin.</Dialog.Description>
            </div>
            <Dialog.Close className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"><X className="w-5 h-5"/></Dialog.Close>
          </div>
          
          <form onSubmit={handleAddVehicle} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className={labelCls}>Plaka *</label>
                <div className="relative">
                  <div className="absolute left-1 top-1 bottom-1 w-12 bg-blue-600 rounded-lg flex flex-col items-center justify-center text-white font-bold leading-none border border-blue-500/50">
                    <span className="text-[8px]">TR</span>
                  </div>
                  <input type="text" name="plate" placeholder="34 ABC 123" className={`${inputCls} pl-16 font-bold uppercase tracking-wider text-lg`} required />
                </div>
              </div>
              
              <div><label className={labelCls}>Model / Marka *</label><input type="text" name="model" placeholder="Ford Transit Custom" className={inputCls} required /></div>
              <div><label className={labelCls}>Zimmetli Sürücü *</label><input type="text" name="driver" placeholder="Ad Soyad" className={inputCls} required /></div>
              <div><label className={labelCls}>Güncel Kilometre</label><input type="number" name="km" placeholder="125000" className={inputCls} /></div>
              <div><label className={labelCls}>Son Bakım Tarihi</label><input type="date" name="lastMaintenance" className={inputCls} /></div>
              <div><label className={labelCls}>Sonraki Muayene</label><input type="date" name="nextInspection" className={inputCls} /></div>
              <div><label className={labelCls}>Trafik / Kasko Bitiş</label><input type="date" name="insurance" className={inputCls} /></div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-white/5">
              <Dialog.Close className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all text-white">İptal</Dialog.Close>
              <button type="submit" className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20">Aracı Kaydet</button>
            </div>
          </form>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}