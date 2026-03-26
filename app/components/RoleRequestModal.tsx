import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Shield, X, Clock, Send, LayoutDashboard } from 'lucide-react';
import { useEmployee } from '../contexts/EmployeeContext';
import { toast } from 'sonner';
import { getFromStorage, setInStorage } from '../utils/storage';
import { kvSet } from '../lib/pouchdb-kv';

interface RoleRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PANELS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'satis', label: 'Satış İşlemleri' },
  { id: 'stok', label: 'Stok Yönetimi' },
  { id: 'kasa', label: 'Kasa & Gider' },
  { id: 'cari', label: 'Cari Hesaplar' },
  { id: 'raporlar', label: 'Raporlar' },
  { id: 'ayarlar', label: 'Ayarlar' }
];

const DURATIONS = [
  { id: 1, label: '1 Saat' },
  { id: 3, label: '3 Saat' },
  { id: 6, label: '6 Saat' },
  { id: 12, label: '12 Saat' },
  { id: 24, label: '24 Saat' }
];

export function RoleRequestModal({ isOpen, onClose }: RoleRequestModalProps) {
  const { currentEmployee } = useEmployee();
  
  const [selectedPanel, setSelectedPanel] = useState(PANELS[0].id);
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[0].id);
  const [reason, setReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmployee) return;

    if (!reason.trim()) {
      toast.error('Lütfen bir gerekçe belirtin');
      return;
    }

    const newRequest = {
      id: crypto.randomUUID(),
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      panel: selectedPanel,
      panelName: PANELS.find(p => p.id === selectedPanel)?.label,
      durationHours: selectedDuration,
      reason,
      status: 'pending', // pending, approved, rejected
      createdAt: new Date().toISOString(),
    };

    const existingRequests = getFromStorage<any[]>('role_requests') || [];
    const updatedReqs = [newRequest, ...existingRequests];
    setInStorage('role_requests', updatedReqs);
    kvSet('role_requests', updatedReqs).catch(() => {});

    toast.success('Yetki talebiniz yöneticiye iletildi');
    onClose();
    setReason('');
  };

  if (!currentEmployee) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-popover border border-border p-6 rounded-2xl shadow-2xl w-full max-w-md z-50" aria-describedby={undefined}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <Dialog.Title className="text-xl font-bold text-white mb-0.5">Geçici Yetki İste</Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">Yönetici onayından sonra geçerli olur</Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg text-muted-foreground transition-colors">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-muted-foreground text-sm mb-2 block flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" />
                Erişim İstenen Panel
              </label>
              <select
                value={selectedPanel}
                onChange={(e) => setSelectedPanel(e.target.value)}
                className="bg-muted text-white px-4 py-2.5 rounded-lg w-full border border-border focus:outline-none focus:border-purple-500 transition-corporate"
              >
                {PANELS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-muted-foreground text-sm mb-2 block flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Süre
              </label>
              <div className="grid grid-cols-5 gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDuration(d.id)}
                    className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                      selectedDuration === d.id
                        ? 'bg-purple-600/20 border-purple-500 text-purple-400'
                        : 'bg-muted border-border text-muted-foreground hover:border-border-hover'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-muted-foreground text-sm mb-2 block">Gerekçe (Neden gerekli?)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="bg-muted text-white px-4 py-2.5 rounded-lg w-full border border-border focus:outline-none focus:border-purple-500 transition-corporate resize-none"
                placeholder="Örn: Stok sayımı yapmak için gerekli..."
              ></textarea>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:bg-secondary transition-colors"
              >
                İptal
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Send className="w-4 h-4" />
                İstek Gönder
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}