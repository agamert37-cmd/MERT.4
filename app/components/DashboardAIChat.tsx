/**
 * DashboardAIChat — Dashboard'a gömülü AI sohbet paneli
 * Tüm sistem verilerine erişebilir, grafik/istatistik üretebilir.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Bot, User, X, Loader2, BarChart3, Zap,
  ChevronDown, AlertCircle, Key, ExternalLink, Trash2,
  Copy, CheckCheck, TrendingUp, Package, DollarSign,
  Users, AlertTriangle, FileText, Building2, RefreshCw
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { chatWithAI, type AIResponse } from '../lib/chatgpt-assistant';
import { getOpenAIKey, saveOpenAIKey, isOpenAIConfigured } from '../lib/api-config';

// ─── Tipler ──────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: AIResponse;
  timestamp: Date;
  loading?: boolean;
}

// ─── Hızlı soru tanımları ────────────────────────────────────────
const QUICK_QUESTIONS = [
  { icon: <DollarSign className="w-3 h-3" />, label: 'Bugünkü ciro ve kâr', q: 'Bugünkü satış cirom ve net kârım ne kadar? Detaylı analiz ver.' },
  { icon: <AlertTriangle className="w-3 h-3" />, label: 'Kritik stoklar', q: 'Hangi ürünlerin stoğu kritik seviyede? Listele ve öncelik sırasına koy.' },
  { icon: <TrendingUp className="w-3 h-3" />, label: 'En çok satan', q: 'En çok satan 5 ürünümü ciroya göre sırala ve grafik göster.' },
  { icon: <Users className="w-3 h-3" />, label: 'Cari bakiyeler', q: 'Negatif bakiyeli (borçlu) cari hesapları listele, en yüksekten başla.' },
  { icon: <BarChart3 className="w-3 h-3" />, label: 'Kasa özeti', q: 'Kasanın toplam gelir, gider ve net bakiye durumunu özetle. Grafik de ekle.' },
  { icon: <Package className="w-3 h-3" />, label: 'Stok grafiği', q: 'Stok durumunu bar grafik olarak göster, miktara göre sırala.' },
  { icon: <FileText className="w-3 h-3" />, label: 'Gider analizi', q: 'Giderlerin kategori dağılımını pasta grafik olarak göster.' },
  { icon: <Building2 className="w-3 h-3" />, label: 'Genel durum', q: 'Sistemin genel durumunu özetle: satış, stok, kasa ve cari hesaplarda dikkat edilmesi gereken noktaları belirt.' },
];

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

// ─── Chart renderer ───────────────────────────────────────────────
function ChartRenderer({ response }: { response: AIResponse }) {
  if (!response.data || !Array.isArray(response.data) || response.data.length === 0) return null;
  const { chartType, chartConfig, data } = response;

  return (
    <div className="mt-3 rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
      <ResponsiveContainer width="100%" height={220}>
        {chartType === 'pie' ? (
          <PieChart>
            <Pie
              data={data}
              dataKey={chartConfig?.valueKey || 'value'}
              nameKey={chartConfig?.nameKey || 'name'}
              cx="50%" cy="50%" outerRadius={80}
              label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_: any, i: number) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any) => `₺${Number(v).toLocaleString('tr-TR')}`} contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
            <Legend />
          </PieChart>
        ) : chartType === 'area' ? (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="aiAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartConfig?.color || '#3b82f6'} stopOpacity={0.25} />
                <stop offset="95%" stopColor={chartConfig?.color || '#3b82f6'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey={chartConfig?.xKey || 'name'} tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
            <Tooltip formatter={(v: any) => `₺${Number(v).toLocaleString('tr-TR')}`} contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
            <Area type="monotone" dataKey={chartConfig?.yKey || 'value'} stroke={chartConfig?.color || '#3b82f6'} fill="url(#aiAreaGrad)" strokeWidth={2} />
          </AreaChart>
        ) : chartType === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey={chartConfig?.xKey || 'name'} tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
            <Tooltip formatter={(v: any) => `₺${Number(v).toLocaleString('tr-TR')}`} contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
            <Line type="monotone" dataKey={chartConfig?.yKey || 'value'} stroke={chartConfig?.color || '#3b82f6'} strokeWidth={2} dot={{ r: 3, fill: chartConfig?.color || '#3b82f6' }} />
          </LineChart>
        ) : (
          /* bar (default) */
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey={chartConfig?.xKey || 'name'} tick={{ fill: '#6b7280', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
            <Tooltip formatter={(v: any) => `₺${Number(v).toLocaleString('tr-TR')}`} contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
            <Bar dataKey={chartConfig?.yKey || 'value'} fill={chartConfig?.color || '#3b82f6'} radius={[4, 4, 0, 0]}>
              {data.map((_: any, i: number) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ─── API Key setup bölümü ─────────────────────────────────────────
function APIKeySetup({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    if (!key.trim().startsWith('sk-')) return;
    setSaving(true);
    saveOpenAIKey(key.trim());
    setTimeout(() => { setSaving(false); onSaved(); }, 500);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8 text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
        <Key className="w-6 h-6 text-amber-400" />
      </div>
      <div>
        <h4 className="text-white font-bold text-sm mb-1">OpenAI API Anahtarı Gerekiyor</h4>
        <p className="text-white/40 text-xs leading-relaxed max-w-xs">
          AI asistanı kullanmak için OpenAI API anahtarınızı girin.
          Anahtarınız yalnızca tarayıcınızda saklanır, dışarı gönderilmez.
        </p>
      </div>
      <div className="w-full max-w-xs">
        <div className="flex items-center bg-white/[0.04] border border-white/[0.1] rounded-xl overflow-hidden">
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 bg-transparent px-3 py-2.5 text-white text-xs placeholder-white/20 focus:outline-none"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <button onClick={() => setShow(s => !s)} className="px-3 text-white/30 hover:text-white/60 text-xs">
            {show ? 'Gizle' : 'Göster'}
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={!key.startsWith('sk-') || saving}
          className="mt-2 w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-white/30 text-white text-xs font-semibold rounded-xl transition-colors"
        >
          {saving ? 'Kaydediliyor...' : 'Kaydet ve Başla'}
        </button>
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors"
        >
          API anahtarı al <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────
export function DashboardAIChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Merhaba! Ben sistem verilerinize tam erişimi olan AI asistanınızım. Satış, stok, kasa, personel, cari hesaplar veya üretim hakkında her şeyi sorabilirsiniz. Size hem metin hem grafik olarak detaylı cevaplar verebilirim.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasKey, setHasKey] = useState(isOpenAIConfigured());
  const [history, setHistory] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (text?: string) => {
    const q = (text || input).trim();
    if (!q || isLoading) return;
    setInput('');

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date(),
    };
    const loadingMsg: Message = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      const response = await chatWithAI(q, history);

      const assistantMsg: Message = {
        id: loadingMsg.id,
        role: 'assistant',
        content: response.answer,
        response,
        timestamp: new Date(),
      };

      setMessages(prev => prev.map(m => m.id === loadingMsg.id ? assistantMsg : m));
      setHistory(prev => [
        ...prev,
        { role: 'user', content: q },
        { role: 'assistant', content: response.answer },
      ]);
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, content: 'Bir hata oluştu. Lütfen tekrar deneyin.', loading: false }
          : m
      ));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, isLoading, history]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleClear = () => {
    setMessages([{
      id: 'welcome-new',
      role: 'assistant',
      content: 'Sohbet sıfırlandı. Yeni bir soruyla başlayabilirsiniz.',
      timestamp: new Date(),
    }]);
    setHistory([]);
  };

  if (!hasKey) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <span className="text-white font-bold text-sm">AI Asistan</span>
              <p className="text-white/30 text-[10px]">GPT-4o-mini · Sistem Analizi</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>
        <APIKeySetup onSaved={() => setHasKey(true)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-[#0d111b]" />
          </div>
          <div>
            <span className="text-white font-bold text-sm">AI Asistan</span>
            <p className="text-white/30 text-[10px]">GPT-4o-mini · Tüm sistem verilerine erişiyor</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleClear}
            title="Sohbeti temizle"
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setHasKey(false); }}
            title="API anahtarını değiştir"
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5 rounded-lg transition-colors"
          >
            <Key className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>
      </div>

      {/* ── Hızlı Sorular ── */}
      <div className="px-4 py-2.5 border-b border-white/[0.05] flex-shrink-0">
        <p className="text-[10px] text-white/25 font-semibold uppercase tracking-widest mb-2">Hızlı Sorular</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q.q)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-blue-600/15 border border-white/[0.08] hover:border-blue-500/25 text-[11px] text-white/60 hover:text-white/90 transition-all disabled:opacity-40"
            >
              <span className="text-blue-400">{q.icon}</span>
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Mesajlar ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.role === 'user'
                  ? 'bg-blue-600'
                  : 'bg-white/[0.07] border border-white/[0.08]'
              }`}>
                {msg.role === 'user'
                  ? <User className="w-3.5 h-3.5 text-white" />
                  : <Bot className="w-3.5 h-3.5 text-blue-400" />
                }
              </div>

              {/* Balon */}
              <div className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-white/[0.05] border border-white/[0.07] text-white/85 rounded-tl-sm'
                }`}>
                  {msg.loading ? (
                    <span className="flex items-center gap-2 text-white/40">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Analiz yapılıyor...
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>

                {/* Grafik */}
                {msg.response && (msg.response.type === 'chart') && (
                  <div className="w-full mt-1">
                    <ChartRenderer response={msg.response} />
                  </div>
                )}

                {/* Alt bar: zaman + kopyala */}
                {!msg.loading && (
                  <div className={`flex items-center gap-2 mt-1 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[9px] text-white/20">
                      {msg.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="text-white/20 hover:text-white/50 transition-colors"
                      >
                        {copiedId === msg.id
                          ? <CheckCheck className="w-3 h-3 text-emerald-400" />
                          : <Copy className="w-3 h-3" />
                        }
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="px-4 py-3 border-t border-white/[0.07] flex-shrink-0">
        <div className="flex items-end gap-2 bg-white/[0.04] border border-white/[0.1] rounded-xl overflow-hidden focus-within:border-blue-500/40 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Sorunuzu yazın... (Enter göndер, Shift+Enter satır ekler)"
            rows={1}
            className="flex-1 bg-transparent px-3.5 py-3 text-white text-sm placeholder-white/20 focus:outline-none resize-none max-h-28"
            style={{ minHeight: '44px' }}
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="m-1.5 w-9 h-9 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 text-white animate-spin" />
              : <Send className="w-4 h-4 text-white" />
            }
          </button>
        </div>
        <p className="text-[9px] text-white/15 mt-1.5 text-center">
          Sistem verileri her sorguda otomatik güncellenir · GPT-4o-mini
        </p>
      </div>
    </div>
  );
}
