// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useMemo } from 'react';
import { UserCog, Shield, Clock, MapPin, Phone, Mail, Plus, Trash2, Activity, MousePointerClick, History, Eye, EyeOff, Edit3, Lock, Key, Save, X, Search, CheckCircle2, LogOut, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { staggerContainer, gridCard, hover, tap } from '../utils/animations';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { useTableSync } from '../hooks/useTableSync';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { SyncStatusBar, SyncBadge } from '../components/SyncStatusBar';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { hashString, hashStringWithSalt } from '../utils/security';
import { kvSet } from '../lib/pouchdb-kv';
import { analyzePasswordStrength, getSecurityPolicy, checkRateLimit, generateCSRFToken, validateCSRFToken, addSecurityThreat, detectRapidActions, deepSanitize, detectSQLInjection, appendToLogChain } from '../utils/security';
import { useSecurityMonitor } from '../hooks/useSecurityMonitor';
import { PasswordStrengthBar } from '../components/PasswordStrengthBar';
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer
} from 'recharts';

interface Personnel {
  id: string;
  name: string;
  username: string;
  position: string;
  role: 'Yönetici' | 'Personel';
  status: 'online' | 'offline';
  phone: string;
  email: string;
  lastLogin: string;
  joinDate: string;
  department: string;
  salary: number;
  active: boolean;
  pinCode?: string;
  password?: string;
  permissions?: string[];
  created_at?: string;
}

const INITIAL_PERSONNEL: Personnel[] = [];

function personnelToDb(p: Personnel) {
  return {
    id: p.id, name: p.name, username: p.username, position: p.position, role: p.role, status: p.status,
    phone: p.phone, email: p.email, last_login: p.lastLogin, join_date: p.joinDate, department: p.department,
    salary: p.salary, active: p.active, pin_code: p.pinCode, password: p.password, permissions: JSON.stringify(p.permissions || []),
  };
}

function personnelFromDb(row: any): Personnel {
  let parsedPermissions: string[] = [];
  try {
    if (typeof row.permissions === 'string') parsedPermissions = JSON.parse(row.permissions);
    else if (Array.isArray(row.permissions)) parsedPermissions = row.permissions;
  } catch {}

  return {
    id: row.id, name: row.name || '', username: row.username || '', position: row.position || '', role: row.role || 'Personel',
    status: row.status || 'offline', phone: row.phone || '', email: row.email || '', lastLogin: row.last_login || '-',
    joinDate: row.join_date || '-', department: row.department || '', salary: row.salary ?? 0, active: row.active ?? true,
    pinCode: row.pin_code || '', password: row.password || '', permissions: parsedPermissions, created_at: row.created_at,
  };
}

const inputCls = "w-full bg-black/40 text-white px-4 py-3 rounded-xl border border-white/10 focus:outline-none focus:border-purple-500/50 text-sm transition-all placeholder-white/20";
const labelCls = "text-gray-400 text-xs font-bold uppercase tracking-widest mb-1.5 block ml-1";

function PasswordInput({ name, value, onChange, placeholder = '', required = false, label }: any) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input type={show ? 'text' : 'password'} name={name} value={value} onChange={onChange} placeholder={placeholder} className={`${inputCls} pl-10 pr-10`} required={required} autoComplete="new-password" />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors" tabIndex={-1}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <PasswordStrengthBar password={value} />
    </div>
  );
}

function PinInput({ name, value, onChange, required = false, t }: any) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className={labelCls}>{t('personnel.quickPIN')} {!required && <span className="text-gray-600 normal-case tracking-normal ml-1">({t('personnel.optional')})</span>}</label>
      <div className="relative">
        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input type={show ? 'text' : 'password'} name={name} value={value} onChange={onChange} inputMode="numeric" maxLength={6} placeholder="******" className={`${inputCls} pl-10 pr-10 tracking-[0.5em] font-mono`} required={required} />
        <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors" tabIndex={-1}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-[10px] text-gray-500 mt-1.5 ml-1">{t('personnel.pinDesc')}</p>
    </div>
  );
}

function PermissionGrid({ selected, onToggle, t }: any) {
  const PERMISSIONS = [
    { id: 'dashboard', label: t('personnel.permDashboard') }, { id: 'satis', label: t('personnel.permSales') },
    { id: 'stok', label: t('personnel.permStock') }, { id: 'kasa', label: t('personnel.permCash') },
    { id: 'cari', label: t('personnel.permCustomers') }, { id: 'raporlar', label: t('personnel.permReports') },
    { id: 'personel', label: t('personnel.permPersonnel') }, { id: 'ayarlar', label: t('personnel.permSettings') },
    { id: 'uretim', label: t('personnel.permProduction') || 'Üretim' }, { id: 'arac', label: t('personnel.permVehicle') || 'Araçlar' },
    { id: 'pazarlama', label: t('personnel.permMarketing') || 'Pazarlama' }, { id: 'tahsilat', label: t('personnel.permCollection') || 'Tahsilat' },
    { id: 'cekler', label: t('personnel.permChecks') || 'Çekler' }, { id: 'dosyalar', label: t('personnel.permFiles') || 'Dosyalar' },
    { id: 'guvenlik', label: t('personnel.permSecurity') || 'Güvenlik' }, { id: 'yedekler', label: t('personnel.permBackups') || 'Yedekler' },
  ];

  const allSelected = PERMISSIONS.every(p => selected.includes(p.id));

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          if (allSelected) {
            PERMISSIONS.forEach(p => { if (selected.includes(p.id)) onToggle(p.id); });
          } else {
            PERMISSIONS.forEach(p => { if (!selected.includes(p.id)) onToggle(p.id); });
          }
        }}
        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${allSelected ? 'bg-red-600/20 border-red-500/30 text-red-400 hover:bg-red-600/30' : 'bg-purple-600/20 border-purple-500/30 text-purple-400 hover:bg-purple-600/30'}`}
      >
        {allSelected ? t('personnel.deselectAll') : t('personnel.selectAll')}
      </button>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PERMISSIONS.map(perm => {
          const isSelected = selected.includes(perm.id);
          return (
            <button
              type="button"
              key={perm.id}
              onClick={() => onToggle(perm.id)}
              className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition-all text-left ${isSelected ? 'bg-purple-600/20 border-purple-500/30' : 'bg-black/20 border-white/5 hover:bg-white/5'}`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors shrink-0 ${isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-600 bg-transparent'}`}>
                {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
              </div>
              <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-400'}`}>{perm.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PersonelPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { emit } = useModuleBus();
  
  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canAdd, canEdit, canDelete } = getPagePermissions(user, currentEmployee, 'personel');
  const { trackAction } = useSecurityMonitor(true);
  const { data: personnelList, addItem, updateItem, deleteItem } = useTableSync<Personnel>({
    tableName: 'personeller', storageKey: 'personel_data', initialData: INITIAL_PERSONNEL,
    orderBy: 'created_at', orderAsc: false, toDb: personnelToDb, fromDb: personnelFromDb,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Personnel | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [addPermissions, setAddPermissions] = useState<string[]>(['dashboard']);
  const [addPassword, setAddPassword] = useState('');
  const [addConfirmPassword, setAddConfirmPassword] = useState('');

  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState<'Yönetici' | 'Personel'>('Personel');
  const [editSalary, setEditSalary] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [editPermissions, setEditPermissions] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);
  const [roleRequests, setRoleRequests] = useState<any[]>([]);

  const filteredPersonnel = useMemo(() => {
    return personnelList.filter(p => {
      const name = (p.name || '').toLowerCase();
      const username = (p.username || '').toLowerCase();
      const term = searchTerm.toLowerCase();
      return name.includes(term) || username.includes(term);
    });
  }, [personnelList, searchTerm]);

  const onlineCount = personnelList.filter(p => p.status === 'online').length;
  const offlineCount = personnelList.filter(p => p.status === 'offline').length;
  const managerCount = personnelList.filter(p => p.role === 'Yönetici').length;

  const resetAddForm = () => { setAddPermissions(['dashboard']); setAddPassword(''); setAddConfirmPassword(''); };

  const handleAddPersonnel = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canAdd) {
      toast.error('Personel ekleme yetkiniz bulunmamaktadır.');
      logActivity('security_alert', 'Yetkisiz Personel Ekleme', { level: 'high', employeeName: user?.name, description: 'Kullanıcı personel eklemeye çalıştı ancak yetkisi yoktu.' });
      return;
    }

    // Rate limiter kontrolü
    const rateCheck = checkRateLimit(`personel_add_${user?.id || 'anon'}`, 10, 60_000);
    if (!rateCheck.allowed) {
      toast.error(`Çok fazla ekleme denemesi. ${Math.ceil(rateCheck.resetIn / 1000)} saniye bekleyin.`);
      addSecurityThreat({ type: 'rapid_actions', severity: 'medium', title: 'Hızlı Personel Ekleme', description: `${user?.name} kısa sürede çok fazla personel eklemeye çalıştı.`, source: 'personel' });
      return;
    }
    trackAction('personel_add');

    const fd = new FormData(e.currentTarget);
    const pw = (fd.get('password') as string || '').trim();
    const cpw = (fd.get('confirmPassword') as string || '').trim();
    const uname = (fd.get('username') as string || '').trim();
    const nameVal = (fd.get('name') as string || '').trim();
    const pin = (fd.get('pinCode') as string || '').trim();

    // Input sanitizasyon & SQL injection kontrolü
    if (detectSQLInjection(uname) || detectSQLInjection(nameVal)) {
      toast.error('Güvenlik ihlali tespit edildi! Girdi reddedildi.');
      addSecurityThreat({ type: 'sql_injection', severity: 'critical', title: 'SQL Injection Denemesi', description: `Personel ekleme formunda şüpheli girdi: "${uname}"`, source: 'personel_form', metadata: { userId: user?.id } });
      logActivity('security_alert', 'SQL Injection Denemesi - Personel Ekleme', { level: 'high', employeeName: user?.name });
      return;
    }

    if (!uname) { toast.error(t('personnel.usernameRequired')); return; }
    if (personnelList.some(p => p.username.toLowerCase() === uname.toLowerCase())) { toast.error(t('personnel.usernameExists')); return; }
    if (pw && pw.length < 4) { toast.error(t('personnel.passwordMinError')); return; }
    if (pw !== cpw) { toast.error(t('personnel.passwordMismatchError')); return; }

    // Güvenlik politikası uygulaması - şifre güç kontrolü
    if (pw) {
      const policy = getSecurityPolicy();
      const strength = analyzePasswordStrength(pw);
      if (pw.length < policy.minPasswordLength) {
        toast.error(`Şifre en az ${policy.minPasswordLength} karakter olmalıdır (güvenlik politikası).`);
        return;
      }
      if (policy.requireUppercase && !/[A-Z]/.test(pw)) { toast.error('Güvenlik politikası gereği şifre büyük harf içermelidir.'); return; }
      if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) { toast.error('Güvenlik politikası gereği şifre özel karakter içermelidir.'); return; }
      if (strength.score < 20) { toast.error('Şifre çok zayıf! Lütfen daha güçlü bir şifre seçin.'); return; }
    }

    // GÜVENLİK: Yalnızca yöneticiler Yönetici rolü atayabilir
    const requestedRole = fd.get('role') as 'Yönetici' | 'Personel';
    if (requestedRole === 'Yönetici' && user?.role !== 'Yönetici') {
      toast.error('Yönetici rolü atama yetkiniz bulunmamaktadır.');
      logActivity('security_alert', 'Yetkisiz Yönetici Rolü Atama Denemesi', { level: 'high', employeeName: user?.name, description: 'Personel, yönetici rolü atamaya çalıştı.' });
      addSecurityThreat({ type: 'privilege_escalation', severity: 'critical', title: 'Yetkisiz Rol Atama', description: `${user?.name} yönetici rolü atamaya çalıştı.`, source: 'personel_form', metadata: { userId: user?.id } });
      return;
    }

    const newPersonnelId = crypto.randomUUID();
    const newPersonnel: Personnel = {
      id: newPersonnelId, name: deepSanitize(nameVal), username: deepSanitize(uname),
      position: (fd.get('department') as string).trim(), role: requestedRole,
      status: 'offline', phone: (fd.get('phone') as string).trim(), email: (fd.get('email') as string || '').trim(),
      lastLogin: t('personnel.neverLoggedIn'), joinDate: new Date().toLocaleDateString('tr-TR'),
      department: (fd.get('department') as string).trim(), salary: Number(fd.get('salary') || 0), active: true,
      pinCode: pin ? await hashStringWithSalt(pin, newPersonnelId) : undefined, password: pw ? await hashStringWithSalt(pw, newPersonnelId) : undefined, permissions: addPermissions,
    };

    await addItem(newPersonnel);
    appendToLogChain(`personel_add:${newPersonnel.id}:${newPersonnel.name}`);
    emit('personel:added', { personnelId: newPersonnel.id, name: newPersonnel.name });
    toast.success(`${newPersonnel.name} sisteme eklendi.`);
    setIsAddModalOpen(false);
    resetAddForm();
    (e.target as HTMLFormElement).reset();
  };

  const openEditModal = (person: Personnel, ev?: React.MouseEvent) => {
    if (ev) ev.stopPropagation();
    setEditId(person.id); setEditName(person.name); setEditUsername(person.username); setEditPhone(person.phone);
    setEditEmail(person.email); setEditDepartment(person.department || person.position); setEditRole(person.role);
    setEditSalary(String(person.salary || 0)); setEditPin(''); setEditPassword('');
    setEditConfirmPassword(''); setEditPermissions(person.permissions || []); setIsEditModalOpen(true);
  };

  const handleUpdatePersonnel = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving) return;
    if (!canEdit) {
      toast.error('Personel düzenleme yetkiniz bulunmamaktadır. Yönetici hesabıyla giriş yapın.');
      logActivity('security_alert', 'Yetkisiz Personel Düzenleme', { level: 'high', employeeName: user?.name, description: 'Kullanıcı personel düzenlemeye çalıştı ancak yetkisi yoktu.' });
      return;
    }

    // Rate limiter
    const rateCheck = checkRateLimit(`personel_edit_${user?.id || 'anon'}`, 15, 60_000);
    if (!rateCheck.allowed) {
      toast.error(`Çok fazla düzenleme denemesi. ${Math.ceil(rateCheck.resetIn / 1000)} saniye bekleyin.`);
      return;
    }
    trackAction('personel_edit');

    // Input sanitizasyon
    if (detectSQLInjection(editUsername) || detectSQLInjection(editName)) {
      toast.error('Güvenlik ihlali tespit edildi! Girdi reddedildi.');
      addSecurityThreat({ type: 'sql_injection', severity: 'critical', title: 'SQL Injection Denemesi', description: `Personel düzenleme formunda şüpheli girdi.`, source: 'personel_edit', metadata: { userId: user?.id } });
      return;
    }

    if (!editUsername.trim()) { toast.error(t('personnel.usernameRequired')); return; }
    if (personnelList.some(p => p.id !== editId && p.username.toLowerCase() === editUsername.trim().toLowerCase())) { toast.error(t('personnel.usernameExists')); return; }
    if (editPassword.trim()) {
      if (editPassword.trim().length < 4) { toast.error(t('personnel.passwordMinError')); return; }
      if (editPassword.trim() !== editConfirmPassword.trim()) { toast.error(t('personnel.passwordMismatchError')); return; }

      // Güvenlik politikası uygulaması
      const policy = getSecurityPolicy();
      const strength = analyzePasswordStrength(editPassword.trim());
      if (editPassword.trim().length < policy.minPasswordLength) {
        toast.error(`Şifre en az ${policy.minPasswordLength} karakter olmalıdır (güvenlik politikası).`);
        return;
      }
      if (policy.requireUppercase && !/[A-Z]/.test(editPassword.trim())) { toast.error('Güvenlik politikası gereği şifre büyük harf içermelidir.'); return; }
      if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(editPassword.trim())) { toast.error('Güvenlik politikası gereği şifre özel karakter içermelidir.'); return; }
      if (strength.score < 20) { toast.error('Şifre çok zayıf! Lütfen daha güçlü bir şifre seçin.'); return; }
    }

    // GÜVENLİK: Yalnızca yöneticiler Yönetici rolü atayabilir
    if (editRole === 'Yönetici' && user?.role !== 'Yönetici') {
      toast.error('Yönetici rolü atama yetkiniz bulunmamaktadır.');
      logActivity('security_alert', 'Yetkisiz Yönetici Rolü Düzenleme Denemesi', { level: 'high', employeeName: user?.name, description: 'Personel, yönetici rolü atamaya çalıştı.' });
      addSecurityThreat({ type: 'privilege_escalation', severity: 'critical', title: 'Yetkisiz Rol Düzenleme', description: `${user?.name} personel düzenleme ile yönetici rolü atamaya çalıştı.`, source: 'personel_edit', metadata: { userId: user?.id } });
      return;
    }

    const updates: Partial<Personnel> = {
      name: deepSanitize(editName.trim()), username: deepSanitize(editUsername.trim()), position: editDepartment.trim(), department: editDepartment.trim(),
      role: editRole, phone: editPhone.trim(), email: editEmail.trim(), salary: Number(editSalary || 0), permissions: editPermissions,
    };
    if (editPin.trim()) updates.pinCode = await hashStringWithSalt(editPin.trim(), editId);
    if (editPassword.trim()) updates.password = await hashStringWithSalt(editPassword.trim(), editId);

    setIsSaving(true);
    try {
      await updateItem(editId, updates);
      appendToLogChain(`personel_update:${editId}:${editName}`);
      emit('personel:updated', { personnelId: editId, name: editName });
      toast.success(`${editName} bilgileri güncellendi.`);
      setIsEditModalOpen(false);
    } catch (err) {
      console.error('[PersonelPage] updateItem error:', err);
      toast.error('Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Uzaktan Zorla Oturum Kapatma ───────────────────────────────
  const handleForceLogout = async (e: React.MouseEvent, personId: string, personName: string) => {
    e.stopPropagation();
    if (!canEdit) {
      toast.error('Bu işlem için yönetici yetkisi gereklidir.');
      return;
    }
    if (personId === 'admin-super') {
      toast.error('Sistem yöneticisi oturumu uzaktan kapatılamaz.');
      return;
    }
    toast(`${personName} adlı kullanıcının oturumu kapatılsın mı?`, {
      action: {
        label: 'Evet, Kapat',
        onClick: async () => {
          try {
            // KV'e force_logout sinyali yaz — kullanıcının tarayıcısı 60s içinde algılar
            await kvSet(`sync_force_logout_${personId}`, {
              reason: `Yönetici (${user?.name || 'Admin'}) tarafından oturumunuz sonlandırıldı.`,
              by: user?.name || 'Admin',
              at: new Date().toISOString(),
            });
            // Personel durumunu offline olarak işaretle — [AJAN-2]: useTableSync üzerinden güncelle
            // setInStorage bypass kaldırıldı — useTableSync hem localStorage hem Supabase'i yönetir
            updateItem(personId, { status: 'offline' } as any).catch(e => console.warn('[PersonelPage] status update hatası:', e));
            logActivity('security_alert', 'Uzaktan oturum kapatma tetiklendi', {
              employeeName: user?.name,
              level: 'high',
              description: `${personName} kullanıcısının oturumu uzaktan kapatıldı.`,
            });
            toast.success(`${personName} adlı kullanıcının oturumu kapatma sinyali gönderildi.`);
          } catch {
            toast.error('İşlem başarısız. Ağ bağlantısını kontrol edin.');
          }
        },
      },
      cancel: { label: 'İptal', onClick: () => {} },
      duration: 6000,
    });
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!canDelete) {
      toast.error('Personel silme yetkiniz bulunmamaktadır.');
      logActivity('security_alert', 'Yetkisiz Personel Silme', { level: 'high', employeeName: user?.name, description: 'Kullanıcı personel silmeye çalıştı ancak yetkisi yoktu.' });
      return;
    }
    if (id === '1' || id === 'admin-super') { toast.error(t('personnel.systemAdminCantDelete')); return; }
    toast(`${name} silinsin mi?`, {
      action: { label: 'Evet, Sil', onClick: async () => {
        await deleteItem(id);
        emit('personel:deleted', { personnelId: id, name });
        toast.success(`${name} sistemden silindi.`);
      }},
      cancel: { label: 'İptal', onClick: () => {} },
      duration: 5000,
    });
  };

  const loadRoleRequests = () => setRoleRequests(getFromStorage<any[]>('role_requests') || []);
  const handleOpenRequestsModal = () => { loadRoleRequests(); setIsRequestsModalOpen(true); };
  const handleApproveRequest = (request: any) => {
    const expiresAt = new Date(Date.now() + request.durationHours * 60 * 60 * 1000).toISOString();
    const allReqs = getFromStorage<any[]>('role_requests') || [];
    const updatedReqs = allReqs.map(r => r.id === request.id ? { ...r, status: 'approved', approvedAt: new Date().toISOString(), expiresAt } : r);
    setInStorage('role_requests', updatedReqs); setRoleRequests(updatedReqs);
    // BUG FIX [AJAN-2]: role_requests KV store'a da yaz — çapraz cihaz onay akışı
    kvSet('role_requests', updatedReqs).catch(e => console.error('[Personel] role_requests kv sync:', e));

    const allPersonnel = getFromStorage<any[]>('personel_data') || [];
    const updatedPersonnel = allPersonnel.map(p => {
      if (p.id === request.employeeId) {
        let perms: string[] = [];
        try { if (typeof p.permissions === 'string') perms = JSON.parse(p.permissions); else if (Array.isArray(p.permissions)) perms = p.permissions; } catch {}
        // Orijinal diziyi mutate etmemek için kopyala
        const newPerms = perms.includes(request.panel) ? [...perms] : [...perms, request.panel];
        const newTempPerms = { ...(p.tempPermissions || {}), [request.panel]: expiresAt };
        return { ...p, permissions: JSON.stringify(newPerms), tempPermissions: newTempPerms };
      }
      return p;
    });
    setInStorage('personel_data', updatedPersonnel);
    // BUG FIX [AJAN-2]: Personel izin değişikliği Supabase'e de yaz
    const updatedEmployee = updatedPersonnel.find((p: any) => p.id === request.employeeId);
    if (updatedEmployee) {
      updateItem(request.employeeId, { permissions: updatedEmployee.permissions, tempPermissions: updatedEmployee.tempPermissions } as any)
        .catch(e => console.error('[Personel] perm update sync:', e));
    }
    logActivity('employee_update', `Gecici yetki onaylandi: ${request.panelName}`, {
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      page: 'Personel',
      metadata: { requestedPanel: request.panel, duration: request.durationHours }
    });
    toast.success(`${request.employeeName} için ${request.panelName} yetkisi onaylandı.`);
  };
  const handleRejectRequest = (request: any) => {
    const allReqs = getFromStorage<any[]>('role_requests') || [];
    const updatedReqs = allReqs.map(r => r.id === request.id ? { ...r, status: 'rejected' } : r);
    setInStorage('role_requests', updatedReqs); setRoleRequests(updatedReqs);
    // BUG FIX [AJAN-2]: role_requests KV store'a da yaz
    kvSet('role_requests', updatedReqs).catch(e => console.error('[Personel] role_requests kv sync:', e));
    logActivity('employee_update', `Gecici yetki reddedildi: ${request.panelName}`, {
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      page: 'Personel',
      metadata: { requestedPanel: request.panel }
    });
    toast.error('Talep reddedildi.');
  };

  const employeeActivityData = useMemo(() => {
    if (!selectedEmployee) return { todayCount: 0, chartData: [], logs: [], favoritePage: '-' };
    const name = selectedEmployee.name;
    const fisler = getFromStorage<any[]>(StorageKey.FISLER) || [];
    const kasa = getFromStorage<any[]>(StorageKey.KASA_DATA) || [];
    const allActions: any[] = [];

    fisler.forEach(f => {
      if (f.createdBy === name || f.personel === name || f.employeeName === name) {
        if (!f.date) return; // Tarihsiz kayıt → aktivite analizine dahil etme
        const fDate = f.date;
        allActions.push({
          date: fDate.split('T')[0], time: f.time || (fDate.includes('T') ? fDate.split('T')[1].substring(0, 5) : '12:00'),
          type: 'Satış İşlemi', desc: `${f.cariName || f.cari?.companyName || '-'} - ${(f.totalAmount || f.total || f.amount || 0).toLocaleString('tr-TR')} ₺`, page: 'Satış',
        });
      }
    });

    kasa.forEach(k => {
      if (k.createdBy === name) {
        if (!k.date) return; // Tarihsiz kayıt → aktivite analizine dahil etme
        const kDate = k.date;
        allActions.push({
          date: kDate.split('T')[0], time: k.time || (kDate.includes('T') ? kDate.split('T')[1].substring(0, 5) : '12:00'),
          type: 'Kasa İşlemi', desc: `${k.type === 'income' ? 'Gelir' : 'Gider'}: ${k.amount?.toLocaleString('tr-TR')} ₺`, page: 'Kasa',
        });
      }
    });

    allActions.sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());
    const todayStr = new Date().toISOString().split('T')[0];
    const todayActions = allActions.filter(a => a.date === todayStr);

    const chartMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); chartMap[d.toISOString().split('T')[0]] = 0; }
    allActions.forEach(a => { if (chartMap[a.date] !== undefined) chartMap[a.date]++; });
    const chartData = Object.keys(chartMap).map(k => ({ name: new Date(k).toLocaleDateString('tr-TR', { weekday: 'short' }), islem: chartMap[k] }));

    const pageCounts: Record<string, number> = {};
    allActions.forEach(a => { pageCounts[a.page] = (pageCounts[a.page] || 0) + 1; });
    const favoritePage = Object.keys(pageCounts).sort((a, b) => pageCounts[b] - pageCounts[a])[0] || '-';

    return { todayCount: todayActions.length, chartData, logs: allActions.slice(0, 10), favoritePage };
  }, [selectedEmployee]);

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-28 sm:pb-6">
      <SyncStatusBar tableName="personeller" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight">Personel Yönetimi</h1>
            <SyncBadge tableName="personeller" />
          </div>
          <p className="text-gray-400">Sistem kullanıcıları, yetkiler ve güvenlik ayarları</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button onClick={handleOpenRequestsModal} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 rounded-xl font-bold transition-all">
            <Shield className="w-5 h-5" /> Talep Onayları
          </button>
          <button onClick={() => { resetAddForm(); setIsAddModalOpen(true); }} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20">
            <Plus className="w-5 h-5" /> Kullanıcı Ekle
          </button>
        </div>
      </div>

      {/* Stats & Search */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: t('personnel.totalUsers'), value: personnelList.length, icon: UserCog, color: 'blue' },
          { label: t('personnel.activeOnline'), value: onlineCount, icon: Activity, color: 'emerald', pulse: true },
          { label: t('personnel.offlineStatus'), value: offlineCount, icon: Clock, color: 'gray' },
          { label: t('personnel.adminPrivilege'), value: managerCount, icon: Shield, color: 'orange' },
        ].map((s, i) => (
          <div key={i} className="p-6 rounded-3xl bg-[#111] border border-white/5 relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-32 h-32 bg-${s.color}-500/10 rounded-bl-full blur-2xl group-hover:bg-${s.color}-500/20 transition-colors`} />
            <div className="relative z-10 flex items-center gap-4">
              <div className={`p-3 rounded-xl bg-${s.color}-500/10 text-${s.color}-400 relative`}>
                <s.icon className="w-6 h-6" />
                {s.pulse && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />}
              </div>
              <div>
                <p className="text-3xl font-black">{s.value}</p>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-[#111] p-2 rounded-2xl border border-white/5">
        <div className="pl-4"><Search className="w-5 h-5 text-gray-500" /></div>
        <input 
          type="text" 
          placeholder="İsim veya kullanıcı adı ile personel ara..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-transparent text-white outline-none placeholder-gray-600 py-3"
        />
      </div>

      {/* Personnel Grid */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6"
        variants={staggerContainer(0.07, 0.03)}
        initial="initial"
        animate="animate"
      >
        <AnimatePresence>
          {filteredPersonnel.map((person) => (
            <motion.div
              key={person.id}
              layout
              variants={gridCard}
              exit={{ opacity: 0, scale: 0.92, filter: 'blur(6px)', transition: { duration: 0.2 } }}
              whileHover={hover.card}
              whileTap={tap.card}
              onClick={() => setSelectedEmployee(person)}
              className="p-5 sm:p-6 rounded-3xl bg-[#111] border border-white/5 hover:border-white/15 cursor-pointer group flex flex-col justify-between min-h-[220px] hover:shadow-xl hover:shadow-black/30 transition-colors"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-lg ${person.role === 'Yönetici' ? 'bg-gradient-to-br from-orange-500 to-red-600' : 'bg-gradient-to-br from-blue-600 to-purple-600'}`}>
                        {(person.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#111] ${person.status === 'online' ? 'bg-emerald-500' : 'bg-gray-600'}`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-1">{person.name}</h3>
                      <p className="text-sm text-gray-500 font-mono">@{person.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => openEditModal(person, e)} className="p-2 bg-white/5 hover:bg-blue-600 rounded-xl text-gray-400 hover:text-white transition-all" title="Düzenle"><Edit3 className="w-4 h-4" /></button>
                    {person.id !== '1' && person.id !== 'admin-super' && person.status === 'online' && (
                      <button
                        onClick={(e) => handleForceLogout(e, person.id, person.name)}
                        className="p-2 bg-white/5 hover:bg-orange-600 rounded-xl text-gray-400 hover:text-white transition-all"
                        title="Oturumu Uzaktan Kapat"
                      >
                        <WifiOff className="w-4 h-4" />
                      </button>
                    )}
                    {person.id !== '1' && person.id !== 'admin-super' && (
                      <button onClick={(e) => handleDelete(e, person.id, person.name)} className="p-2 bg-white/5 hover:bg-red-600 rounded-xl text-gray-400 hover:text-white transition-all" title="Sil"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${person.role === 'Yönetici' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                    {person.role === 'Yönetici' && <Shield className="w-3 h-3"/>} {person.role}
                  </span>
                  <span className="px-3 py-1 bg-white/5 rounded-lg text-xs font-bold text-gray-400 border border-white/5">{person.department || 'Bölüm Yok'}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mb-1">Son Giriş</p>
                  <p className="text-xs font-medium text-gray-300">{person.lastLogin}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mb-1">Güvenlik</p>
                  <p className="text-xs font-medium text-gray-300 flex items-center gap-1">
                    {person.password ? <span className="text-emerald-400 flex items-center gap-1"><Lock className="w-3 h-3"/> Şifreli</span> : <span className="text-orange-400 flex items-center gap-1"><Lock className="w-3 h-3"/> Şifresiz</span>}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Add Modal */}
      <Dialog.Root open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 z-50"/><Dialog.Content aria-describedby={undefined} className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-[#111] p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 sm:w-[95vw] sm:max-w-3xl z-50 shadow-2xl overflow-y-auto" style={{maxHeight: 'calc(100dvh - 1rem)'}}>

          <Dialog.Title className="text-2xl font-bold mb-6">Yeni Kullanıcı Oluştur</Dialog.Title>
          <form onSubmit={handleAddPersonnel} className="space-y-8">
            <div>
              <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Kişisel Bilgiler</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={labelCls}>Ad Soyad *</label><input type="text" name="name" className={inputCls} required placeholder="Örn: Ali Yılmaz" /></div>
                <div>
                  <label className={labelCls}>Kullanıcı Adı *</label>
                  <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">@</span><input type="text" name="username" className={`${inputCls} pl-10`} required placeholder="ali.yilmaz" /></div>
                </div>
                <div><label className={labelCls}>Rol *</label><select name="role" className={inputCls}><option value="Personel">Personel</option><option value="Yönetici">Yönetici</option></select></div>
                <div><label className={labelCls}>Departman / Görev *</label><input type="text" name="department" className={inputCls} required placeholder="Örn: Satış Temsilcisi" /></div>
                <div><label className={labelCls}>Telefon</label><input type="tel" name="phone" className={inputCls} placeholder="05XX XXX XX XX" /></div>
                <div><label className={labelCls}>E-posta</label><input type="email" name="email" className={inputCls} placeholder="ornek@email.com" /></div>
                <div><label className={labelCls}>Maaş (₺)</label><input type="number" name="salary" className={inputCls} placeholder="0" min="0" /></div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-orange-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Giriş ve Güvenlik</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PasswordInput name="password" label="Şifre *" required placeholder="En az 4 karakter" value={addPassword} onChange={(e:any) => setAddPassword(e.target.value)} />
                <PasswordInput name="confirmPassword" label="Şifre Tekrar *" required placeholder="Şifreyi doğrula" value={addConfirmPassword} onChange={(e:any) => setAddConfirmPassword(e.target.value)} />
                <div className="sm:col-span-2"><PinInput name="pinCode" t={t} /></div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Modül Yetkileri</h3>
              <PermissionGrid selected={addPermissions} onToggle={(id:string) => setAddPermissions(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])} t={t} />
            </div>

            <div className="flex gap-3 pt-4">
              <Dialog.Close className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all">İptal</Dialog.Close>
              <button type="submit" className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20">Kaydet</button>
            </div>
          </form>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* Edit Modal */}
      <Dialog.Root open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 z-50"/><Dialog.Content aria-describedby={undefined} className="fixed inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-[#111] p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 sm:w-[95vw] sm:max-w-3xl z-50 shadow-2xl overflow-y-auto" style={{maxHeight: 'calc(100dvh - 1rem)'}}>

          <Dialog.Title className="text-2xl font-bold mb-6">Kullanıcıyı Düzenle</Dialog.Title>
          <form onSubmit={handleUpdatePersonnel} className="space-y-8">
            <div>
              <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Kişisel Bilgiler</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={labelCls}>Ad Soyad *</label><input type="text" value={editName} onChange={e => setEditName(e.target.value)} className={inputCls} required /></div>
                <div>
                  <label className={labelCls}>Kullanıcı Adı *</label>
                  <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">@</span><input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)} className={`${inputCls} pl-10`} required /></div>
                </div>
                <div><label className={labelCls}>Rol *</label><select value={editRole} onChange={e => setEditRole(e.target.value as any)} className={inputCls}><option value="Personel">Personel</option><option value="Yönetici">Yönetici</option></select></div>
                <div><label className={labelCls}>Departman / Görev *</label><input type="text" value={editDepartment} onChange={e => setEditDepartment(e.target.value)} className={inputCls} required /></div>
                <div><label className={labelCls}>Telefon</label><input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>E-posta</label><input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Maaş (₺)</label><input type="number" value={editSalary} onChange={e => setEditSalary(e.target.value)} className={inputCls} placeholder="0" min="0" /></div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-orange-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Güvenlik (Değiştirmek istemiyorsanız boş bırakın)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PasswordInput name="newPassword" label="Yeni Şifre" placeholder="Boş bırakılabilir" value={editPassword} onChange={(e:any) => setEditPassword(e.target.value)} />
                <PasswordInput name="confirmNewPassword" label="Yeni Şifre Tekrar" placeholder="Boş bırakılabilir" value={editConfirmPassword} onChange={(e:any) => setEditConfirmPassword(e.target.value)} />
                <div className="sm:col-span-2"><PinInput name="editPinCode" value={editPin} onChange={(e:any) => setEditPin(e.target.value)} t={t} /></div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Modül Yetkileri</h3>
              <PermissionGrid selected={editPermissions} onToggle={(id:string) => setEditPermissions(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])} t={t} />
            </div>

            <div className="flex gap-3 pt-4">
              <Dialog.Close disabled={isSaving} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all disabled:opacity-50">İptal</Dialog.Close>
              <button type="submit" disabled={isSaving} className="flex-1 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-orange-600/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isSaving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('personnel.saving')}</> : t('common.update')}
              </button>
            </div>
          </form>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* Analytics Modal */}
      <Dialog.Root open={!!selectedEmployee} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
        <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/80 z-50"/><Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#111] p-0 rounded-2xl sm:rounded-3xl border border-white/10 w-[95vw] max-w-4xl z-50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {selectedEmployee && (
            <>
              <div className="p-4 sm:p-8 border-b border-white/5 bg-gradient-to-b from-blue-900/20 to-transparent flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-blue-600 flex items-center justify-center text-xl sm:text-3xl font-black shadow-xl shadow-blue-600/30">
                    {(selectedEmployee.name || '?').charAt(0)}
                  </div>
                  <div>
                    <Dialog.Title className="text-xl sm:text-3xl font-black mb-1">{selectedEmployee.name}</Dialog.Title>
                    <p className="text-blue-400 font-bold mb-2">@{selectedEmployee.username} • {selectedEmployee.role}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4"/> Son görülme: {selectedEmployee.lastLogin}</span>
                      <span className="flex items-center gap-1"><Activity className="w-4 h-4"/> Durum: <span className={selectedEmployee.status === 'online' ? 'text-emerald-400' : ''}>{selectedEmployee.status === 'online' ? t('personnel.activeStatus') : t('personnel.offlineStatus')}</span></span>
                    </div>
                  </div>
                </div>
                <Dialog.Close className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"><X className="w-6 h-6"/></Dialog.Close>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-6 rounded-2xl border border-white/5 bg-white/5">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Bugünkü İşlemler</p>
                    <p className="text-4xl font-black">{employeeActivityData.todayCount}</p>
                  </div>
                  <div className="p-6 rounded-2xl border border-white/5 bg-white/5 md:col-span-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Haftalık Aktivite</p>
                    <div className="h-20 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={employeeActivityData.chartData}>
                          <XAxis dataKey="name" hide />
                          <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '12px' }} />
                          <Area type="monotone" dataKey="islem" stroke="#3b82f6" strokeWidth={3} fill="#3b82f6" fillOpacity={0.2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><History className="w-5 h-5 text-purple-400"/> Son Hareketler</h3>
                  <div className="space-y-3">
                    {employeeActivityData.logs.length > 0 ? employeeActivityData.logs.map((log, i) => (
                      <div key={i} className="flex justify-between items-center p-4 rounded-xl bg-white/5 border border-white/5">
                        <div>
                          <p className="font-bold text-white">{log.type}</p>
                          <p className="text-sm text-gray-500">{log.desc}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg inline-block mb-1">{log.page}</p>
                          <p className="text-xs text-gray-600 block">{log.date} {log.time}</p>
                        </div>
                      </div>
                    )) : <p className="text-gray-500 text-center py-6">Kayıtlı hareket bulunamadı.</p>}
                  </div>
                </div>
              </div>
            </>
          )}
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      {/* Talep Onayları Modali */}
      <Dialog.Root open={isRequestsModalOpen} onOpenChange={setIsRequestsModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50" />
          <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#111] p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 w-[95vw] max-w-2xl z-50 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <Dialog.Title className="text-xl font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-400" /> Yetki Talep Onayları
              </Dialog.Title>
              <Dialog.Close className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"><X className="w-5 h-5" /></Dialog.Close>
            </div>

            {roleRequests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">Bekleyen yetki talebi bulunmuyor.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {roleRequests.map((req: any) => (
                  <div key={req.id} className={`p-4 rounded-xl border ${req.status === 'pending' ? 'bg-yellow-500/5 border-yellow-500/20' : req.status === 'approved' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white">{req.employeeName}</p>
                        <p className="text-sm text-gray-400 mt-0.5">
                          <span className="text-purple-400 font-semibold">{req.panelName}</span> modülüne geçici erişim talep etti
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Süre: {req.durationHours} saat · {req.reason || 'Sebep belirtilmedi'}
                        </p>
                        {req.status !== 'pending' && (
                          <span className={`inline-block mt-2 text-xs font-bold px-2 py-0.5 rounded-lg ${req.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {req.status === 'approved' ? '✓ Onaylandı' : '✕ Reddedildi'}
                          </span>
                        )}
                      </div>
                      {req.status === 'pending' && (
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => handleApproveRequest(req)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all">Onayla</button>
                          <button onClick={() => handleRejectRequest(req)} className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs font-bold rounded-lg border border-red-500/20 transition-all">Reddet</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}