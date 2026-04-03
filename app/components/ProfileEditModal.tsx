import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { UserCircle, X, Save, Phone, Mail, Lock, Eye, EyeOff, ShieldCheck, KeyRound, Loader2 } from 'lucide-react';
import { useEmployee } from '../contexts/EmployeeContext';
import { toast } from 'sonner';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { hashString } from '../utils/security';
import { kvSet } from '../lib/pouchdb-kv';
import { logActivity } from '../utils/activityLogger';

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileEditModal({ isOpen, onClose }: ProfileEditModalProps) {
  const { currentEmployee, setCurrentEmployee } = useEmployee();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && currentEmployee) {
      setName(currentEmployee.name || '');
      setPhone((currentEmployee as any).phone || '');
      setEmail((currentEmployee as any).email || '');
      // Şifre/PIN alanları her zaman boş başlar — hash gösterilmez
      setNewPassword('');
      setConfirmPassword('');
      setPinCode('');
      setShowPassword(false);
    }
  }, [isOpen, currentEmployee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmployee) return;

    // ── Validasyonlar ──────────────────────────────────
    if (!name.trim()) {
      toast.error('Ad Soyad boş olamaz');
      return;
    }

    if (newPassword && newPassword.length < 4) {
      toast.error('Şifre en az 4 karakter olmalı');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      toast.error('Şifreler uyuşmuyor');
      return;
    }

    if (pinCode && (pinCode.length !== 4 || !/^\d{4}$/.test(pinCode))) {
      toast.error('PIN kodu 4 haneli rakam olmalı');
      return;
    }

    setSaving(true);

    try {
      // ── Güncellenecek alanlar ──────────────────────────
      const updateData: Record<string, any> = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
      };

      // Şifre sadece doldurulduysa güncellenir
      if (newPassword) {
        updateData.password = await hashString(newPassword);
      }

      // PIN sadece doldurulduysa güncellenir
      if (pinCode) {
        updateData.pinCode = await hashString(pinCode);
      }

      // ── localStorage personel_data güncelle ────────────
      const allPersonnel = getFromStorage<any[]>(StorageKey.PERSONEL_DATA) || [];
      let found = false;
      const updatedPersonnel = allPersonnel.map(p => {
        if (p.id === currentEmployee.id) {
          found = true;
          return { ...p, ...updateData };
        }
        return p;
      });

      // admin-super personel listesinde yoksa ekle
      if (!found) {
        updatedPersonnel.push({
          id: currentEmployee.id,
          username: (currentEmployee as any).username || currentEmployee.name,
          role: (currentEmployee as any).role || 'Yönetici',
          department: (currentEmployee as any).department || 'Yönetim',
          status: 'online',
          ...updateData,
        });
      }

      setInStorage(StorageKey.PERSONEL_DATA, updatedPersonnel);

      // ── PouchDB'ye senkronize et ──────────────────────
      try {
        const { getDb } = await import('../lib/pouchdb');
        const db = getDb('personeller');
        try {
          const existingDoc = await db.get(currentEmployee.id);
          await db.put({ ...existingDoc, ...updateData });
        } catch {
          // Döküman yoksa yeni oluştur
          await db.put({ _id: currentEmployee.id, ...updateData }).catch(() => {});
        }
      } catch {}

      // KV sync — tüm cihazlarda güncel olsun
      kvSet('personel_status', updatedPersonnel).catch(() => {});

      // ── Context güncelle (şifre hash'i context'e KONULMAZ) ─
      const contextUpdate: Record<string, any> = {
        name: updateData.name,
        phone: updateData.phone,
        email: updateData.email,
      };
      setCurrentEmployee({ ...currentEmployee, ...contextUpdate } as any);

      // CURRENT_EMPLOYEE storage'ı güncelle (şifre olmadan)
      const storedCurrent = getFromStorage<any>(StorageKey.CURRENT_EMPLOYEE) || {};
      setInStorage(StorageKey.CURRENT_EMPLOYEE, { ...storedCurrent, ...contextUpdate });

      logActivity('settings_change', 'Profil bilgileri güncellendi', {
        employeeId: currentEmployee.id,
        employeeName: name.trim(),
        page: 'Profil',
        description: [
          newPassword ? 'Şifre değiştirildi' : null,
          pinCode ? 'PIN kodu değiştirildi' : null,
        ].filter(Boolean).join(', ') || 'Bilgiler güncellendi',
      });

      toast.success(
        newPassword
          ? 'Profil ve şifreniz başarıyla güncellendi'
          : 'Profil bilgileriniz güncellendi'
      );
      onClose();
    } catch (err) {
      console.error('Profil güncelleme hatası:', err);
      toast.error('Profil güncellenirken bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  if (!currentEmployee) return null;

  const inputClass = "bg-muted text-white pl-10 pr-4 py-2.5 rounded-lg w-full border border-border focus:outline-none focus:border-blue-500 transition-corporate";

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed z-50 bg-popover border border-border shadow-2xl w-full
            bottom-0 left-0 right-0 rounded-t-2xl p-4 max-h-[92vh] overflow-y-auto
            sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:max-w-md sm:p-6 sm:max-h-[90vh] sm:overflow-y-auto"
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
              <div>
                <Dialog.Title className="text-xl font-bold text-white">Profili Düzenle</Dialog.Title>
                <p className="text-xs text-muted-foreground">{currentEmployee.id === 'admin-super' ? 'Sistem Yöneticisi' : (currentEmployee as any).username || ''}</p>
              </div>
            </div>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg text-muted-foreground transition-colors">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Ad Soyad */}
            <div>
              <label className="text-muted-foreground text-sm mb-1 block">Ad Soyad</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <UserCircle className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            </div>

            {/* Telefon */}
            <div>
              <label className="text-muted-foreground text-sm mb-1 block">Telefon</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* E-posta */}
            <div>
              <label className="text-muted-foreground text-sm mb-1 block">E-posta</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Şifre Bölümü */}
            <div className="pt-3 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Güvenlik</span>
                <span className="text-xs text-muted-foreground">(boş bırakırsanız değişmez)</span>
              </div>

              <div className="space-y-3">
                {/* Yeni Şifre */}
                <div>
                  <label className="text-muted-foreground text-xs mb-1 block">Yeni Şifre</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={`${inputClass} pr-10`}
                      placeholder="Yeni şifre girin..."
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Şifre Onayı — sadece yeni şifre girilince göster */}
                {newPassword && (
                  <div>
                    <label className="text-muted-foreground text-xs mb-1 block">Şifre Onayı</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${inputClass} ${confirmPassword && confirmPassword !== newPassword ? 'border-red-500/50' : confirmPassword ? 'border-emerald-500/50' : ''}`}
                        placeholder="Şifreyi tekrar girin..."
                        autoComplete="new-password"
                      />
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p className="text-xs text-red-400 mt-1">Şifreler uyuşmuyor</p>
                    )}
                    {confirmPassword && confirmPassword === newPassword && (
                      <p className="text-xs text-emerald-400 mt-1">Şifreler eşleşiyor</p>
                    )}
                  </div>
                )}

                {/* PIN Kodu */}
                <div>
                  <label className="text-muted-foreground text-xs mb-1 block">PIN Kodu (4 Hane)</label>
                  <input
                    type="text"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="\d{0,4}"
                    value={pinCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setPinCode(val);
                    }}
                    className="bg-muted text-white px-4 py-2.5 rounded-lg w-full border border-border focus:outline-none focus:border-blue-500 transition-corporate text-center tracking-[0.3em] font-mono"
                    placeholder="● ● ● ●"
                  />
                </div>
              </div>
            </div>

            {/* Butonlar */}
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
                disabled={saving || (!!newPassword && newPassword !== confirmPassword)}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Kaydet
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
