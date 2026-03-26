import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { UserCircle, X, Save, Phone, Mail, Lock } from 'lucide-react';
import { useEmployee } from '../contexts/EmployeeContext';
import { toast } from 'sonner';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { hashString } from '../utils/security';
import { kvSet } from '../lib/pouchdb-kv';

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileEditModal({ isOpen, onClose }: ProfileEditModalProps) {
  const { currentEmployee, setCurrentEmployee } = useEmployee();
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    pinCode: '',
  });

  useEffect(() => {
    if (isOpen && currentEmployee) {
      setFormData({
        name: currentEmployee.name || '',
        phone: (currentEmployee as any).phone || '',
        email: (currentEmployee as any).email || '',
        password: (currentEmployee as any).password || '',
        pinCode: currentEmployee.pinCode || '',
      });
    }
  }, [isOpen, currentEmployee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmployee) return;

    // Şifre ve PIN varsa hash'le
    const updateData = { ...formData };
    if (updateData.password && updateData.password !== (currentEmployee as any).password) {
      updateData.password = await hashString(updateData.password);
    }
    if (updateData.pinCode && updateData.pinCode !== currentEmployee.pinCode) {
      updateData.pinCode = await hashString(updateData.pinCode);
    }

    // Get all personnel to update the specific one
    const allPersonnel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
    const updatedPersonnel = allPersonnel.map(p => {
      if (p.id === currentEmployee.id) {
        return { ...p, ...updateData };
      }
      return p;
    });

    // Save back to storage
    setInStorage(StorageKey.PERSONEL_DATA, updatedPersonnel);
    // [AJAN-2] KV sync — profil değişiklikleri tüm cihazlarda görünsün
    kvSet('personel_status', updatedPersonnel).catch(() => {});

    // Update context
    setCurrentEmployee({ ...currentEmployee, ...updateData } as any);
    
    toast.success('Profil bilgileriniz güncellendi');
    onClose();
  };

  if (!currentEmployee) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed z-50 bg-popover border border-border shadow-2xl w-full
            /* Mobile: bottom sheet */
            bottom-0 left-0 right-0 rounded-t-2xl p-4 max-h-[92vh] overflow-y-auto
            /* Desktop: centered modal */
            sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:max-w-md sm:p-6 sm:max-h-none sm:overflow-visible"
          aria-describedby={undefined}
        >
          {/* Mobil drag indicator */}
          <div className="sm:hidden flex justify-center mb-3">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                <UserCircle className="w-6 h-6" />
              </div>
              <Dialog.Title className="text-xl font-bold text-white">Profili Düzenle</Dialog.Title>
            </div>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg text-muted-foreground transition-colors">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-muted-foreground text-sm mb-1 block">Ad Soyad</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <UserCircle className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-muted text-white pl-10 pr-4 py-2.5 rounded-lg w-full border border-border focus:outline-none focus:border-blue-500 transition-corporate"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-muted-foreground text-sm mb-1 block">Telefon</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="bg-muted text-white pl-10 pr-4 py-2.5 rounded-lg w-full border border-border focus:outline-none focus:border-blue-500 transition-corporate"
                />
              </div>
            </div>

            <div>
              <label className="text-muted-foreground text-sm mb-1 block">E-posta</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-muted text-white pl-10 pr-4 py-2.5 rounded-lg w-full border border-border focus:outline-none focus:border-blue-500 transition-corporate"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-muted-foreground text-sm mb-1 block">Yeni Şifre</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="bg-muted text-white pl-10 pr-4 py-2.5 rounded-lg w-full border border-border focus:outline-none focus:border-blue-500 transition-corporate"
                    placeholder="Değiştirmek için..."
                  />
                </div>
              </div>
              
              <div>
                <label className="text-muted-foreground text-sm mb-1 block">PIN Kodu (4 Hane)</label>
                <input
                  type="text"
                  maxLength={4}
                  pattern="\d{4}"
                  value={formData.pinCode}
                  onChange={(e) => setFormData({ ...formData, pinCode: e.target.value })}
                  className="bg-muted text-white px-4 py-2.5 rounded-lg w-full border border-border focus:outline-none focus:border-blue-500 transition-corporate text-center tracking-widest"
                  placeholder="****"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                İptal
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" />
                Kaydet
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}