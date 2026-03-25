// [AJAN-2 | claude/serene-gagarin | 2026-03-25] Son düzenleyen: Claude Sonnet 4.6
import React, { useState, useRef, useEffect } from 'react';
import OpenAI from 'openai';
import { Settings, Database, Sparkles, Save, Trash2, Eye, EyeOff, CheckCircle, XCircle, Shield, ExternalLink, Building2, Phone, MapPin, FileText, Hash, Monitor, Upload, Loader2, RefreshCw, X, Plus, History, ShieldCheck, Zap, Wrench, Star } from 'lucide-react';
import { getOpenAIKey, saveOpenAIKey, clearOpenAIKey, isOpenAIConfigured, getEmbeddedSupabaseConfig } from '../lib/api-config';
import { reinitializeOpenAI } from '../lib/chatgpt-assistant';
import { testSupabaseConnection } from '../lib/supabase';
import { getFromStorage, setInStorage, StorageKey } from '../utils/storage';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { staggerContainer, gridCard, hover } from '../utils/animations';
import { SERVER_BASE_URL, SUPABASE_ANON_KEY as publicAnonKey } from '../lib/supabase-config';
import { runIntegrityCheck, getStorageStats, type IntegrityReport } from '../utils/data-integrity';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logActivity } from '../utils/activityLogger';
import { useModuleBus } from '../hooks/useModuleBus';
import { getPagePermissions } from '../utils/permissions';
import { LocalRepoPanel } from '../components/LocalRepoPanel';
import { kvSet } from '../lib/supabase-kv';
import { NodeStatusPanel } from '../components/NodeStatusPanel';
import { getLocalNodeId, getLocalNodeConfig, saveLocalNodeConfig, type NodeInfo } from '../lib/node-registry';
import { CHANGELOG, type ChangeType } from '../data/changelog';

export interface CompanyInfo {
  companyName: string;
  phone: string;
  address: string;
  taxNumber: string;
  taxOffice: string;
  email: string;
  slogan: string;
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  companyName: 'İŞLEYEN ET',
  phone: '', address: '', taxNumber: '', taxOffice: '', email: '',
  slogan: 'Kurumsal ERP Sistemleri',
};

export function getCompanyInfo(): CompanyInfo {
  const settings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
  if (settings?.companyInfo) return { ...DEFAULT_COMPANY_INFO, ...settings.companyInfo };
  return DEFAULT_COMPANY_INFO;
}

interface BrandingImage {
  url: string; fileName?: string; title: string; subtitle: string;
}

export function SettingsPage() {
  const { user } = useAuth();
  const { currentEmployee } = useEmployee();
  const { t } = useLanguage();
  const { emit } = useModuleBus();

  // Güvenlik kontrolleri (RBAC) - merkezi utility
  const { canEdit } = getPagePermissions(user, currentEmployee, 'ayarlar');

  const [openaiKey, setOpenaiKey] = useState(getOpenAIKey());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState({ supabase: null as boolean | null, openai: null as boolean | null });

  // SMS yapılandırması
  const [smsConfig, setSmsConfig] = useState<SMSConfig>(() => {
    const s = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
    return s?.smsConfig ? { ...DEFAULT_SMS_CONFIG, ...s.smsConfig } : DEFAULT_SMS_CONFIG;
  });
  const [showSmsPass, setShowSmsPass] = useState(false);

  const saveSmsConfig = () => {
    const existing = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS) || {};
    setInStorage(StorageKey.SYSTEM_SETTINGS, { ...existing, smsConfig });
    logActivity('settings_change', 'SMS yapılandırması kaydedildi', { employeeName: user?.name, page: 'Ayarlar' });
    toast.success('SMS ayarları kaydedildi');
  };
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() => getCompanyInfo());

  const [brandingImages, setBrandingImages] = useState<BrandingImage[]>(() => {
    const settings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
    return settings?.loginBranding?.images || [];
  });
  const [newImageTitle, setNewImageTitle] = useState('');
  const [newImageSubtitle, setNewImageSubtitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [refreshingUrls, setRefreshingUrls] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Node (sunucu) yapılandırması
  const [nodeConfig, setNodeConfigState] = useState<Partial<NodeInfo>>(() => getLocalNodeConfig());
  const handleSaveNodeConfig = () => {
    saveLocalNodeConfig(nodeConfig);
    toast.success('Sunucu yapılandırması kaydedildi');
    logActivity('settings_change', 'Sunucu yapılandırması güncellendi', { employeeName: user?.name, page: 'Ayarlar' });
  };

  const supabaseConfig = getEmbeddedSupabaseConfig();
  const serverBase = SERVER_BASE_URL;

  const handleSaveOpenAI = () => {
    if (!openaiKey.trim()) { toast.error('OpenAI API Key boş olamaz!'); return; }
    if (!openaiKey.trim().startsWith('sk-')) { toast.error('Geçersiz format! Key "sk-" ile başlamalı.'); return; }
    if (!canEdit) { toast.error('Ayarları değiştirme yetkiniz yok.'); logActivity('security_alert', 'Yetkisiz Ayar Değişikliği', { level: 'high', employeeName: user?.name }); return; }
    saveOpenAIKey(openaiKey.trim()); reinitializeOpenAI(); logActivity('settings_change', 'OpenAI API Key kaydedildi', { employeeName: user?.name, page: 'Ayarlar' }); toast.success('OpenAI API Key kaydedildi!');
  };

  const handleClearOpenAI = () => {
    if (confirm('OpenAI API Key\'i silmek istediğinizden emin misiniz? AI asistan çalışmayacak.')) {
      clearOpenAIKey(); setOpenaiKey(''); reinitializeOpenAI(); toast.success('OpenAI API Key temizlendi');
    }
  };

  const handleTestAll = async () => {
    setTesting(true); setTestResults({ supabase: null, openai: null });
    try {
      const result = await testSupabaseConnection();
      setTestResults(p => ({ ...p, supabase: result.success }));
      if (result.success) toast.success('Supabase bağlantısı başarılı!');
      else toast.error(`Supabase: ${result.error || 'Bağlantı hatası'}`);
    } catch { setTestResults(p => ({ ...p, supabase: false })); toast.error('Supabase bağlantı hatası!'); }

    if (openaiKey.trim()) {
      try {
        const testOpenAI = new OpenAI({ apiKey: openaiKey.trim(), dangerouslyAllowBrowser: true });
        const response = await testOpenAI.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'test' }], max_tokens: 5 });
        if (response) { setTestResults(p => ({ ...p, openai: true })); toast.success('OpenAI bağlantısı başarılı!'); }
      } catch (err: any) {
        setTestResults(p => ({ ...p, openai: false }));
        if (err.message?.includes('Incorrect API key') || err.status === 401) toast.error('OpenAI: API key geçersiz!');
        else if (err.message?.includes('insufficient_quota')) toast.error('OpenAI: Krediniz bitti!');
        else toast.error(`OpenAI: ${err.message || 'Beklenmeyen hata'}`);
      }
    } else { setTestResults(p => ({ ...p, openai: false })); toast.info('OpenAI API Key girilmemiş.'); }
    setTesting(false);
  };

  const handleSaveCompanyInfo = () => {
    if (!canEdit) { toast.error('Ayarları değiştirme yetkiniz yok.'); logActivity('security_alert', 'Yetkisiz Şirket Bilgisi Değişikliği', { level: 'high', employeeName: user?.name }); return; }
    const existingSettings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS) || {};
    const updatedSettings = { ...existingSettings, companyInfo };
    setInStorage(StorageKey.SYSTEM_SETTINGS, updatedSettings);
    // BUG FIX [AJAN-2]: Şirket bilgileri KV store'a da yaz — çapraz cihaz sync
    kvSet('system_settings', updatedSettings).catch(e => console.error('[Settings] kv sync:', e));
    logActivity('settings_change', 'Şirket bilgileri güncellendi', { employeeName: user?.name, page: 'Ayarlar', description: `Şirket bilgileri güncellendi: ${companyInfo.companyName}` });
    toast.success('Şirket bilgileri kaydedildi!');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Maksimum 5MB yüklenebilir!'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Sadece resim dosyaları yüklenebilir!'); return; }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setUploadPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadAndAdd = async () => {
    if (!selectedFile) { toast.error('Lütfen görsel seçin!'); return; }
    setUploading(true);
    try {
      const formData = new FormData(); formData.append('file', selectedFile);
      const res = await fetch(`${serverBase}/branding/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${publicAnonKey}` }, body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Yükleme başarısız');
      const newImg: BrandingImage = { url: data.url, fileName: data.fileName, title: newImageTitle, subtitle: newImageSubtitle };
      const updated = [...brandingImages, newImg]; setBrandingImages(updated);
      const existingSettings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS) || {};
      const updatedBranding = { ...existingSettings, loginBranding: { images: updated } };
      setInStorage(StorageKey.SYSTEM_SETTINGS, updatedBranding);
      kvSet('system_settings', updatedBranding).catch(() => {});
      setNewImageTitle(''); setNewImageSubtitle(''); setSelectedFile(null); setUploadPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success('Görsel yüklendi!');
    } catch (err: any) { toast.error(`Yükleme hatası: ${err.message}`); } finally { setUploading(false); }
  };

  const handleRemoveBrandingImage = async (index: number) => {
    const img = brandingImages[index];
    if (img.fileName) {
      try { await fetch(`${serverBase}/branding/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` }, body: JSON.stringify({ fileName: img.fileName }) }); } catch {}
    }
    const updated = brandingImages.filter((_, i) => i !== index); setBrandingImages(updated);
    const existingSettings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS) || {};
    const updatedBranding = { ...existingSettings, loginBranding: { images: updated } };
    setInStorage(StorageKey.SYSTEM_SETTINGS, updatedBranding);
    kvSet('system_settings', updatedBranding).catch(() => {});
    toast.success('Görsel kaldırıldı!');
  };

  const handleRefreshBrandingUrls = async () => {
    const imagesWithFiles = brandingImages.filter(img => img.fileName);
    if (imagesWithFiles.length === 0) { toast.info('Yenilenecek görsel yok.'); return; }
    setRefreshingUrls(true);
    try {
      const res = await fetch(`${serverBase}/branding/refresh-urls`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` }, body: JSON.stringify({ fileNames: imagesWithFiles.map(img => img.fileName) }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'URL yenileme başarısız');
      const updatedImages = brandingImages.map(img => (img.fileName && data.urls[img.fileName] ? { ...img, url: data.urls[img.fileName] } : img));
      setBrandingImages(updatedImages);
      const existingSettings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS) || {};
      const updatedBranding = { ...existingSettings, loginBranding: { images: updatedImages } };
      setInStorage(StorageKey.SYSTEM_SETTINGS, updatedBranding);
      kvSet('system_settings', updatedBranding).catch(() => {});
      toast.success(`URL'ler yenilendi!`);
    } catch (err: any) { toast.error(`URL yenileme hatası: ${err.message}`); } finally { setRefreshingUrls(false); }
  };

  // BUG FIX [AJAN-2]: localStorage boşsa KV'den ayarları yükle (mobil ilk açılış)
  useEffect(() => {
    const localSettings = getFromStorage<any>(StorageKey.SYSTEM_SETTINGS);
    if (!localSettings?.companyInfo && !localSettings?.loginBranding) {
      import('../lib/supabase-kv').then(({ kvGet }) =>
        kvGet<any>('system_settings').then(remote => {
          if (remote) {
            setInStorage(StorageKey.SYSTEM_SETTINGS, remote);
            if (remote.companyInfo) setCompanyInfo({ ...remote.companyInfo });
            if (remote.loginBranding?.images) setBrandingImages(remote.loginBranding.images);
          }
        }).catch(() => {})
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const checkAndRefreshUrls = async () => {
      const imagesWithFiles = brandingImages.filter(img => img.fileName);
      if (imagesWithFiles.length === 0) return;
      try { await fetch(imagesWithFiles[0].url, { method: 'HEAD', mode: 'no-cors' }); } catch { handleRefreshBrandingUrls(); }
    };
    if (brandingImages.some(img => img.fileName)) checkAndRefreshUrls();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const inputClass = "w-full bg-black/40 text-white px-4 py-3 rounded-xl border border-white/10 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 text-sm transition-all placeholder-white/20";
  const labelCls = "text-gray-400 text-xs font-bold uppercase tracking-widest mb-1.5 block ml-1";

  return (
    <div className="p-3 sm:p-6 lg:p-10 space-y-4 sm:space-y-6 lg:space-y-8 bg-background min-h-screen text-white font-sans pb-28 sm:pb-6">
      
      {/* Header */}
      <motion.div
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight">Sistem Ayarları</h1>
          </div>
          <p className="text-gray-400">Kurumsal profil, API bağlantıları ve güvenlik</p>
        </div>
        <button onClick={handleTestAll} disabled={testing} className="flex items-center justify-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold transition-all disabled:opacity-50">
          {testing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5 text-emerald-400" />} Tüm Bağlantıları Test Et
        </button>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-8"
        variants={staggerContainer(0.1, 0.06)}
        initial="initial"
        animate="animate"
      >
        {/* Şirket Bilgileri */}
        <motion.div variants={gridCard} className="p-8 rounded-3xl bg-[#111] border border-white/5">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20"><Building2 className="w-6 h-6 text-blue-400"/></div>
            <div><h2 className="text-xl font-bold">Şirket Profili</h2><p className="text-xs text-gray-500">PDF ve Fişlerde görünecek bilgiler</p></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2"><label className={labelCls}>Firma Adı</label><div className="relative"><Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/><input type="text" value={companyInfo.companyName} onChange={e => setCompanyInfo(p => ({...p, companyName: e.target.value}))} className={`${inputClass} pl-11`} /></div></div>
            <div className="md:col-span-2"><label className={labelCls}>Slogan / Alt Başlık</label><input type="text" value={companyInfo.slogan} onChange={e => setCompanyInfo(p => ({...p, slogan: e.target.value}))} className={inputClass} /></div>
            <div><label className={labelCls}>Telefon</label><div className="relative"><Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/><input type="text" value={companyInfo.phone} onChange={e => setCompanyInfo(p => ({...p, phone: e.target.value}))} className={`${inputClass} pl-11`} /></div></div>
            <div><label className={labelCls}>E-posta</label><input type="email" value={companyInfo.email} onChange={e => setCompanyInfo(p => ({...p, email: e.target.value}))} className={inputClass} /></div>
            <div className="md:col-span-2"><label className={labelCls}>Adres</label><div className="relative"><MapPin className="absolute left-4 top-3 w-4 h-4 text-gray-500"/><input type="text" value={companyInfo.address} onChange={e => setCompanyInfo(p => ({...p, address: e.target.value}))} className={`${inputClass} pl-11`} /></div></div>
            <div><label className={labelCls}>Vergi Numarası</label><div className="relative"><Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/><input type="text" value={companyInfo.taxNumber} onChange={e => setCompanyInfo(p => ({...p, taxNumber: e.target.value}))} className={`${inputClass} pl-11`} /></div></div>
            <div><label className={labelCls}>Vergi Dairesi</label><div className="relative"><FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/><input type="text" value={companyInfo.taxOffice} onChange={e => setCompanyInfo(p => ({...p, taxOffice: e.target.value}))} className={`${inputClass} pl-11`} /></div></div>
          </div>
          <button onClick={handleSaveCompanyInfo} className="mt-6 w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"><Save className="w-5 h-5"/> Kaydet</button>
        </motion.div>

        <motion.div variants={gridCard} className="space-y-8">
          {/* OpenAI Settings */}
          <div className="p-8 rounded-3xl bg-[#111] border border-white/5">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20"><Sparkles className="w-6 h-6 text-purple-400"/></div>
              <div className="flex-1"><h2 className="text-xl font-bold">OpenAI Yapılandırması</h2><p className="text-xs text-gray-500">AI Asistan entegrasyonu</p></div>
              {isOpenAIConfigured() ? <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20">Aktif</span> : <span className="px-3 py-1 bg-orange-500/10 text-orange-400 text-xs font-bold rounded-lg border border-orange-500/20">Eksik</span>}
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>API Key</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-proj-..." className={`${inputClass} pr-12 font-mono`} />
                  <button onClick={() => setShowKey(!showKey)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">{showKey ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}</button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveOpenAI} className="flex-1 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"><Save className="w-4 h-4"/> Kaydet</button>
                {isOpenAIConfigured() && <button onClick={handleClearOpenAI} className="px-6 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold transition-all"><Trash2 className="w-5 h-5"/></button>}
              </div>
              {testResults.openai !== null && (
                <div className={`mt-2 text-sm font-bold flex items-center gap-2 ${testResults.openai ? 'text-emerald-400' : 'text-red-400'}`}>
                  {testResults.openai ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>} {testResults.openai ? 'Bağlantı Başarılı' : 'Bağlantı Hatası'}
                </div>
              )}
            </div>
          </div>

          {/* Database Info */}
          <div className="p-8 rounded-3xl bg-[#111] border border-white/5">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20"><Database className="w-6 h-6 text-emerald-400"/></div>
              <div className="flex-1"><h2 className="text-xl font-bold">Veritabanı (Supabase)</h2><p className="text-xs text-gray-500">Sisteme Gömülü</p></div>
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20 flex items-center gap-1"><Shield className="w-3 h-3"/> Güvenli</span>
            </div>
            <div className="space-y-4 opacity-70 pointer-events-none">
              <div><label className={labelCls}>Project URL</label><div className={`${inputClass} font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap`}>{supabaseConfig.supabaseUrl}</div></div>
              <div><label className={labelCls}>Anon Key</label><div className={`${inputClass} font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap`}>{supabaseConfig.supabaseAnonKey.substring(0,30)}...</div></div>
            </div>
            {testResults.supabase !== null && (
              <div className={`mt-4 text-sm font-bold flex items-center gap-2 ${testResults.supabase ? 'text-emerald-400' : 'text-red-400'}`}>
                {testResults.supabase ? <CheckCircle className="w-4 h-4"/> : <XCircle className="w-4 h-4"/>} {testResults.supabase ? 'Bağlantı Başarılı' : 'Bağlantı Hatası'}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Data Integrity */}
      <div className="p-8 rounded-3xl bg-[#111] border border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20"><Shield className="w-6 h-6 text-orange-400"/></div>
            <div><h2 className="text-xl font-bold">Veri Bütünlüğü Kontrolü</h2><p className="text-xs text-gray-500">Hatalı kayıtları tespit et ve onar</p></div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => {
              setIntegrityRunning(true);
              setTimeout(() => {
                const r = runIntegrityCheck(false); setIntegrityReport(r); setIntegrityRunning(false);
                if (r.totalIssues === 0) toast.success('Tüm veriler tutarlı!'); else toast.warning(`${r.totalIssues} sorun bulundu.`);
              }, 100);
            }} disabled={integrityRunning} className="flex-1 md:flex-none px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all border border-white/10 flex items-center justify-center gap-2">
              <Shield className="w-5 h-5"/> Kontrol Et
            </button>
            <button onClick={() => {
              if(!confirm('Otomatik onarım yapılsın mı?')) return;
              setIntegrityRunning(true);
              setTimeout(() => {
                const r = runIntegrityCheck(true); setIntegrityReport(r); setIntegrityRunning(false);
                if (r.autoFixed > 0) toast.success(`${r.autoFixed} sorun onarıldı.`); else if (r.totalIssues === 0) toast.success('Tüm veriler tutarlı!');
              }, 100);
            }} disabled={integrityRunning} className="flex-1 md:flex-none px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2">
              {integrityRunning ? <Loader2 className="w-5 h-5 animate-spin"/> : <RefreshCw className="w-5 h-5"/>} Onar
            </button>
          </div>
        </div>

        {(() => {
          const stats = getStorageStats();
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {Object.entries(stats).map(([label, info]) => (
                <div key={label} className="p-4 rounded-2xl bg-black/20 border border-white/5">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">{label}</p>
                  <p className="text-2xl font-black text-white">{info.count === -1 ? 'Hata' : info.count}</p>
                  <p className="text-xs text-gray-600 font-mono mt-1">{info.sizeKB} KB</p>
                </div>
              ))}
            </div>
          );
        })()}

        {integrityReport && (
          <div className="mt-6 border-t border-white/5 pt-6">
            <div className={`p-4 rounded-2xl border ${integrityReport.totalIssues === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-orange-500/10 border-orange-500/30'} flex items-center justify-between mb-4`}>
              <p className={`font-bold ${integrityReport.totalIssues === 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                {integrityReport.totalIssues === 0 ? 'Veritabanı tamamen sağlıklı' : `${integrityReport.totalIssues} problem tespit edildi`}
              </p>
              {integrityReport.autoFixed > 0 && <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/30">{integrityReport.autoFixed} onarıldı</span>}
            </div>
            {integrityReport.checks.length > 0 && (
              <div className="bg-black/40 rounded-2xl p-4 border border-white/5 max-h-64 overflow-y-auto space-y-2">
                {integrityReport.checks.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${c.severity === 'critical' ? 'bg-red-500' : c.severity === 'warning' ? 'bg-orange-500' : 'bg-blue-500'}`}/>
                    <div>
                      <span className="text-gray-500 font-mono mr-2">[{c.table}]</span>
                      <span className="text-gray-300">{c.issue}</span>
                      {c.fixed && <span className="ml-2 text-emerald-400 font-bold text-xs">ONARILDI</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Login Branding Settings */}
      <motion.div
        className="p-8 rounded-3xl bg-[#111] border border-white/5"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-pink-500/10 flex items-center justify-center border border-pink-500/20"><Monitor className="w-6 h-6 text-pink-400"/></div>
            <div><h2 className="text-xl font-bold">Giriş Ekranı (Login) Görselleri</h2><p className="text-xs text-gray-500">Uygulama girişindeki slider içerikleri</p></div>
          </div>
          {brandingImages.some(img => img.fileName) && (
            <button onClick={handleRefreshBrandingUrls} disabled={refreshingUrls} className="flex items-center gap-2 px-4 py-2 bg-cyan-600/10 border border-cyan-500/30 text-cyan-400 rounded-xl font-bold text-sm transition-all hover:bg-cyan-600/20">
              <RefreshCw className={`w-4 h-4 ${refreshingUrls ? 'animate-spin' : ''}`} /> URL Yenile
            </button>
          )}
        </div>

        {brandingImages.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {brandingImages.map((img, idx) => (
              <div key={idx} className="relative rounded-2xl overflow-hidden group border border-white/10 bg-black/40">
                <img src={img.url} alt={img.title} className="w-full h-40 object-cover" />
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                  <p className="font-bold text-white truncate">{img.title}</p>
                  <p className="text-xs text-gray-400 truncate">{img.subtitle}</p>
                </div>
                <button onClick={() => handleRemoveBrandingImage(idx)} className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:bg-red-500"><Trash2 className="w-4 h-4"/></button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-black/40 border border-white/5 rounded-2xl p-6">
          <h3 className="font-bold text-sm text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Plus className="w-4 h-4"/> Yeni Görsel Ekle</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />
              <div onClick={() => fileInputRef.current?.click()} className={`h-full min-h-[140px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${selectedFile ? 'border-pink-500/50 bg-pink-500/5' : 'border-white/20 hover:border-pink-500/50 hover:bg-white/5'}`}>
                {uploadPreview ? (
                  <div className="relative w-full h-full rounded-xl overflow-hidden p-2">
                    <img src={uploadPreview} className="w-full h-full object-cover rounded-xl" alt="preview" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity rounded-xl">
                      <span className="text-white font-bold text-sm">Değiştir</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6">
                    <Upload className="w-8 h-8 text-pink-400 mx-auto mb-2" />
                    <p className="font-bold text-white mb-1">Görsel Seç</p>
                    <p className="text-xs text-gray-500">Maksimum 5MB (PNG, JPG, WebP)</p>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4 flex flex-col justify-center">
              <div><label className={labelCls}>Başlık</label><input type="text" value={newImageTitle} onChange={e => setNewImageTitle(e.target.value)} placeholder="Kampanya Başlığı" className={inputClass} /></div>
              <div><label className={labelCls}>Alt Başlık / Açıklama</label><input type="text" value={newImageSubtitle} onChange={e => setNewImageSubtitle(e.target.value)} placeholder="Kısa açıklama yazısı" className={inputClass} /></div>
              <button onClick={handleUploadAndAdd} disabled={!selectedFile || uploading} className="w-full py-3.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-pink-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />} Yükle ve Ekle
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── SMS Bildirimleri ────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#111] rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-white/5 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">SMS Bildirimleri</h2>
              <p className="text-xs text-gray-500">Netgsm entegrasyonu — satış, tahsilat ve stok uyarıları</p>
            </div>
          </div>
          <button onClick={() => setSmsConfig(c => ({ ...c, enabled: !c.enabled }))}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${smsConfig.enabled ? 'bg-green-500/15 text-green-400 border-green-500/25' : 'bg-white/5 text-gray-500 border-white/10'}`}>
            {smsConfig.enabled ? <><ToggleRight className="w-5 h-5" /> Aktif</> : <><ToggleLeft className="w-5 h-5" /> Pasif</>}
          </button>
        </div>

        {/* API Bilgileri */}
        <div className="p-4 rounded-xl bg-white/3 border border-white/5 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Netgsm API Bilgileri</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Kullanıcı Kodu</label>
              <input value={smsConfig.usercode} onChange={e => setSmsConfig(c => ({ ...c, usercode: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/40 transition-all"
                placeholder="Netgsm kullanıcı kodu" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Şifre</label>
              <div className="relative">
                <input type={showSmsPass ? 'text' : 'password'} value={smsConfig.password} onChange={e => setSmsConfig(c => ({ ...c, password: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/40 transition-all"
                  placeholder="Netgsm şifresi" />
                <button type="button" onClick={() => setShowSmsPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showSmsPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Gönderici Başlığı (max 11 karakter)</label>
              <input value={smsConfig.msgheader} onChange={e => setSmsConfig(c => ({ ...c, msgheader: e.target.value.slice(0, 11) }))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/40 transition-all"
                placeholder="İŞLEYENET" maxLength={11} />
              <p className="text-[10px] text-gray-600 mt-1">GİB/BTK onaylı başlık olmalı. {smsConfig.msgheader.length}/11</p>
            </div>
          </div>
          <div className="pt-1 pb-0.5">
            <p className="text-[10px] text-gray-600">
              Netgsm hesabı için: <a href="https://www.netgsm.com.tr" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">netgsm.com.tr</a> —
              API dokümantasyonu: <a href="https://www.netgsm.com.tr/dokuman/" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">netgsm.com.tr/dokuman</a>
            </p>
          </div>
        </div>

        {/* Tetikleyiciler */}
        <div className="p-4 rounded-xl bg-white/3 border border-white/5 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Otomatik Bildirimler</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {([
              { key: 'onSale', label: 'Satış Fişi Oluşturulunca', desc: 'Müşteriye otomatik satış teyidi gönder' },
              { key: 'onCollection', label: 'Tahsilat Yapılınca', desc: 'Müşteriye ödeme alındı bildirimi gönder' },
              { key: 'onInvoice', label: 'Fatura Düzenlenince', desc: 'Müşteriye fatura oluşturuldu bildirimi' },
              { key: 'onLowStock', label: 'Kritik Stok Uyarısı', desc: 'Personele minimum stok uyarısı gönder' },
            ] as { key: keyof SMSConfig['triggers']; label: string; desc: string }[]).map(t => (
              <label key={t.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${smsConfig.triggers[t.key] ? 'bg-green-500/8 border-green-500/20' : 'bg-black/20 border-white/5 hover:border-white/10'}`}>
                <input type="checkbox" checked={smsConfig.triggers[t.key]} onChange={e => setSmsConfig(c => ({ ...c, triggers: { ...c.triggers, [t.key]: e.target.checked } }))} className="mt-0.5 accent-green-500" />
                <div>
                  <p className="text-sm font-semibold text-white">{t.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{t.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <button onClick={saveSmsConfig}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-green-600/20">
          <Save className="w-4 h-4" /> SMS Ayarlarını Kaydet
        </button>
      </motion.div>

      {/* ── Çok Sunuculu HA Sistemi ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-xl border border-purple-500/30">
            <Shield className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Yüksek Erişilebilirlik (HA)</h2>
            <p className="text-xs text-muted-foreground">Bu cihazı yerel sunucu olarak kayıt edin. Cloud down olursa otomatik geçiş yapılır.</p>
          </div>
        </div>

        {/* Bu cihazın yapılandırması */}
        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div className="text-sm font-medium text-muted-foreground">Bu Cihazın Yapılandırması</div>
          <div className="text-xs text-muted-foreground/60 font-mono">ID: {getLocalNodeId()}</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cihaz Adı</label>
              <input
                value={nodeConfig.name || ''}
                onChange={e => setNodeConfigState(p => ({ ...p, name: e.target.value }))}
                placeholder="Masaüstü PC, Laptop vb."
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cihaz Tipi</label>
              <select
                value={nodeConfig.platform || 'desktop'}
                onChange={e => setNodeConfigState(p => ({ ...p, platform: e.target.value as any }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              >
                <option value="desktop">Masaüstü PC</option>
                <option value="laptop">Laptop</option>
                <option value="server">Sunucu</option>
                <option value="other">Diğer</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Yerel Docker Supabase URL
              <span className="ml-1 text-muted-foreground/50">(örn: http://192.168.1.5:54321 veya Cloudflare Tunnel URL)</span>
            </label>
            <input
              value={nodeConfig.localUrl || ''}
              onChange={e => setNodeConfigState(p => ({ ...p, localUrl: e.target.value }))}
              placeholder="http://192.168.1.5:54321"
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Yerel Supabase Anon Key</label>
            <input
              value={nodeConfig.anonKey || ''}
              onChange={e => setNodeConfigState(p => ({ ...p, anonKey: e.target.value }))}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              type="password"
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            />
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-400/80">
            <Zap className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              URL doldurulursa bu cihaz cloud KV'ye her 30 saniyede heartbeat yazar. Diğer cihazlar sizi "Çevrimiçi" olarak görür.
              Cloud down olursa uygulama otomatik olarak sizin Docker'ınıza geçer.
            </span>
          </div>

          <button
            onClick={handleSaveNodeConfig}
            className="w-full px-4 py-2.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 text-sm font-medium transition-all"
          >
            Yapılandırmayı Kaydet & Heartbeat Başlat
          </button>
        </div>

        {/* Canlı durum paneli */}
        <NodeStatusPanel />
      </div>

      {/* Local Repo Panel */}
      <LocalRepoPanel />

      {/* ── Güncelleme Notları ───────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-500/30">
            <History className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Güncelleme Notları</h2>
            <p className="text-xs text-gray-400">Sürüm geçmişi ve değişiklik kayıtları</p>
          </div>
        </div>

        <div className="space-y-3">
          {CHANGELOG.map((entry, idx) => (
            <div key={entry.version} className={`rounded-2xl border overflow-hidden ${idx === 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/8 bg-white/3'}`}>
              {/* Version header */}
              <div className={`flex items-center gap-3 px-4 py-3 ${idx === 0 ? 'bg-emerald-500/10' : 'bg-white/4'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${idx === 0 ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-white/8 border border-white/10'}`}>
                  <ShieldCheck className={`w-5 h-5 ${idx === 0 ? 'text-emerald-400' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-bold ${idx === 0 ? 'text-emerald-400' : 'text-white'}`}>v{entry.version}</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${idx === 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/8 text-gray-400 border border-white/10'}`}>{entry.codename}</span>
                    {idx === 0 && <span className="text-[10px] font-bold bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-400/30">GÜNCEL</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.summary}</p>
                </div>
                <span className="text-[11px] text-gray-500 flex-shrink-0">{entry.date}</span>
              </div>

              {/* Change list */}
              <div className="px-4 py-3 space-y-2">
                {entry.changes.map((change, ci) => {
                  const typeConfig: Record<ChangeType, { label: string; color: string; icon: React.ReactNode }> = {
                    yenilik:     { label: 'YENİ',   color: 'text-blue-400 bg-blue-500/15 border-blue-500/25',    icon: <Star className="w-3 h-3" /> },
                    iyileştirme: { label: 'İYİ',    color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25', icon: <Zap className="w-3 h-3" /> },
                    düzeltme:    { label: 'DÜZ',    color: 'text-amber-400 bg-amber-500/15 border-amber-500/25',   icon: <Wrench className="w-3 h-3" /> },
                    güvenlik:    { label: 'GÜV',    color: 'text-red-400 bg-red-500/15 border-red-500/25',         icon: <ShieldCheck className="w-3 h-3" /> },
                  };
                  const cfg = typeConfig[change.type];
                  return (
                    <div key={ci} className="flex items-start gap-2.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border flex-shrink-0 mt-0.5 ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                      <p className="text-xs text-gray-300 leading-relaxed">{change.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}