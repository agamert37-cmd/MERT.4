/**
 * AI Chat Assistant - Powered by ChatGPT
 * Gerçek ChatGPT API ile çalışan akıllı asistan
 */

import React, { useState, useRef, useEffect } from 'react';
import { chatWithAI, AIResponse } from '../lib/chatgpt-assistant';
import { getOpenAIKey } from '../lib/api-config';
import { Send, Bot, User, Loader2, Sparkles, AlertCircle, Download, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logActivity } from '../utils/activityLogger';
import { toast } from 'sonner';
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: AIResponse;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  '📊 Bu ay toplam satış ne kadar?',
  '💰 Bugünkü satışları analiz et',
  '📦 Stokta düşük ürünleri göster',
  '👥 En aktif müşterilerim kimler?',
  '💸 Bu ayki gider dağılımını göster',
  '📈 Satış trendini analiz et',
  '🎯 Kar-zarar durumunu özetle',
];

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

export function AIChatGPT() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '👋 Merhaba! Ben ChatGPT destekli İŞLEYEN ET asistanıyım.\n\n' +
        'Size nasıl yardımcı olabilirim? İşletmeniz hakkında her şeyi sorabilirsiniz!\n\n' +
        '💡 İpucu: Doğal dille soru sorun, ben anlarım!',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [hasApiKey, setHasApiKey] = useState(() => {
    const key = getOpenAIKey();
    return !!(key && key !== 'YOUR_OPENAI_API_KEY_HERE' && key.trim() !== '');
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    // API key kontrolü - localStorage ve .env'i birlikte kontrol et
    const apiKey = getOpenAIKey();
    const q = input.toLowerCase();
    const isSpecialReport = q.includes('grafik') || q.includes('rapor') || q.includes('trend') || q.includes('dağılım');
    
    if ((!apiKey || apiKey === 'YOUR_OPENAI_API_KEY_HERE' || apiKey.trim() === '') && !isSpecialReport) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '⚠️ OpenAI API Key bulunamadı!\n\n' +
          'ChatGPT özelliğini kullanmak için API key gerekiyor.\n\n' +
          '📝 Nasıl Yapılır:\n' +
          '1. Ayarlar sayfasına gidin\n' +
          '2. API Anahtarı girin\n\n' +
          '💡 İpucu: Sistemdeki verilerinizi incelemek için "Stok grafiği göster", "Gider raporu" veya "Satış trendi" yazarak yapay zeka anahtarı olmadan da anlık grafikler alabilirsiniz!',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // ChatGPT'ye sor
      const response = await chatWithAI(input, conversationHistory);

      // Conversation history'yi güncelle
      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: input },
        { role: 'assistant', content: response.answer },
      ]);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.answer,
        response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('ChatGPT error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Üzgünüm, bir hata oluştu.\n\n' +
          `Hata: ${error.message}\n\n` +
          'Lütfen:\n' +
          '1. API key\'inizin geçerli olduğundan emin olun\n' +
          '2. İnternet bağlantınızı kontrol edin\n' +
          '3. OpenAI hesabınızda kredi olup olmadığını kontrol edin',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInput(question.replace(/^[📊💰📦👥💸📈🎯]\s/, ''));
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4">
        <AnimatePresence mode="popLayout">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`flex gap-2 sm:gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                </div>
              )}

              <div className={`flex flex-col max-w-[85%] sm:max-w-3xl ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl text-sm sm:text-base ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-secondary text-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>

                {/* AI Response Visualization */}
                {message.response && message.response.type !== 'text' && (
                  <div className="mt-3 w-full">
                    {message.response.type === 'stat' && message.response.data && (
                      <StatCard data={message.response.data} />
                    )}
                    {message.response.type === 'chart' && message.response.data && (
                      <ChartCard response={message.response} />
                    )}
                  </div>
                )}

                {/* SQL Query (Debug) */}
                {message.response?.sql && (
                  <div className="mt-2 px-3 py-2 bg-background rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground font-mono">{message.response.sql}</p>
                  </div>
                )}

                <span className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  {message.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-accent flex items-center justify-center">
                  <User className="w-4 h-4 sm:w-6 sm:h-6 text-foreground" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2 sm:gap-3"
          >
            <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="bg-secondary px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl flex items-center gap-2">
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 animate-spin" />
              <span className="text-foreground text-xs sm:text-sm">ChatGPT düşünüyor...</span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length <= 2 && (
        <div className="px-3 sm:px-6 pb-3 sm:pb-4">
          <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 sm:mb-3">💡 Örnek sorular:</p>
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap">
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSuggestedQuestion(q)}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-secondary hover:bg-accent active:bg-accent/80 text-foreground hover:text-white text-xs sm:text-sm rounded-lg transition-colors border border-border whitespace-nowrap flex-shrink-0 sm:flex-shrink"
              >
              {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* API Key Warning */}
      {!hasApiKey && (
        <div className="mx-3 sm:mx-6 mb-3 sm:mb-4 p-3 sm:p-4 bg-secondary/80 border border-border rounded-xl flex items-start gap-2 sm:gap-3">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-medium text-foreground">Çevrimdışı Mod (API Key Yok)</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              Yapay zeka ile sohbet için Ayarlar'dan OpenAI API anahtarı ekleyin. Ancak anahtarınız olmadan da <b>"Satış raporu"</b>, <b>"Gider grafiği"</b>, <b>"Stok raporu"</b> gibi komutlarla anında grafiksel raporlar alabilir ve PDF olarak indirebilirsiniz!
            </p>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 sm:p-6 border-t border-border">
        <div className="flex gap-2 sm:gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSend()}
            placeholder="Bir soru sorun..."
            className="flex-1 bg-secondary text-white px-3 sm:px-4 py-3 rounded-xl text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-muted-foreground"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-4 sm:px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 active:from-blue-800 active:to-purple-800 disabled:from-accent disabled:to-accent disabled:cursor-not-allowed text-white rounded-xl transition-all flex items-center gap-2 font-medium"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">Gönder</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Stat Card Component
 */
function StatCard({ data }: { data: any }) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  return (
    <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl p-6">
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(data).map(([key, value]: [string, any]) => (
          <div key={key} className="bg-secondary/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground uppercase mb-1">{key}</p>
            <p className="text-2xl font-bold text-white">
              {typeof value === 'number'
                ? value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
                : (value && typeof value === 'object') ? JSON.stringify(value) : String(value || '')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Chart Card Component
 */
function ChartCard({ response }: { response: AIResponse }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!response.data || !Array.isArray(response.data)) return null;

  const handleDownloadPDF = async () => {
    if (!chartRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#0f172a',
        scale: 2
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      pdf.setFillColor(15, 23, 42); // slate-950
      pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.text('İŞLEYEN ET - Sistem Raporu', 14, 20);
      
      pdf.setFontSize(10);
      pdf.setTextColor(148, 163, 184); // slate-400
      pdf.text(`Tarih: ${new Date().toLocaleString('tr-TR')}`, 14, 28);
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth() - 28;
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 14, 40, pdfWidth, pdfHeight);
      pdf.save(`Rapor_${new Date().getTime()}.pdf`);
    } catch (err) {
      toast.error('PDF oluşturulurken hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-secondary to-card border border-border rounded-xl p-6 relative group">
      <div className="absolute top-4 right-4 z-10 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleDownloadPDF}
          disabled={isExporting}
          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          title="PDF Olarak İndir"
        >
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span className="text-xs font-medium pr-1">PDF İndir</span>
        </button>
      </div>
      <div ref={chartRef} className="p-4 bg-card rounded-lg">
        <h3 className="text-white font-semibold mb-4 text-center">Grafiksel Rapor</h3>
        <div className="w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height={300}>
          {response.chartType === 'bar' ? (
            <BarChart key="ai-gpt-bar-chart" data={response.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey={response.chartConfig?.xKey || 'name'} stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey={response.chartConfig?.yKey || 'value'} fill={response.chartConfig?.color || '#3b82f6'} radius={[8, 8, 0, 0]} />
            </BarChart>
          ) : response.chartType === 'area' ? (
            <AreaChart key="ai-gpt-area-chart" data={response.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey={response.chartConfig?.xKey || 'date'} stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} labelStyle={{ color: '#e2e8f0' }} />
              <Area key="area-gpt" type="monotone" dataKey={response.chartConfig?.yKey || 'value'} stroke={response.chartConfig?.color || '#3b82f6'} fill={response.chartConfig?.color || '#3b82f6'} fillOpacity={0.15} />
              <Area type="monotone" dataKey={response.chartConfig?.yKey || 'value'} stroke={response.chartConfig?.color || '#3b82f6'} fill={response.chartConfig?.color || '#3b82f6'} fillOpacity={0.15} />
            </AreaChart>
          ) : response.chartType === 'line' ? (
            <LineChart key="ai-gpt-line-chart" data={response.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey={response.chartConfig?.xKey || 'date'} stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} labelStyle={{ color: '#e2e8f0' }} />
              <Line key="line-gpt" type="monotone" dataKey={response.chartConfig?.yKey || 'value'} stroke={response.chartConfig?.color || '#3b82f6'} strokeWidth={2} />
            </LineChart>
          ) : response.chartType === 'pie' ? (
            <PieChart key="ai-gpt-pie-chart">
              <Pie key="pie-gpt" data={response.data} dataKey={response.chartConfig?.valueKey || 'value'} nameKey={response.chartConfig?.nameKey || 'name'} cx="50%" cy="50%" outerRadius={100} label>
                {response.data.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} />
            </PieChart>
          ) : (
            <BarChart key="ai-gpt-bar-chart" data={response.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey={response.chartConfig?.xKey || 'name'} stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} labelStyle={{ color: '#e2e8f0' }} />
              <Bar key="bar-gpt" dataKey={response.chartConfig?.yKey || 'value'} fill={response.chartConfig?.color || '#3b82f6'} radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/**
 * AI Chat Page Wrapper
 */
export function AIChatGPTPage() {
  return (
    <div className="h-[calc(100dvh-4rem)] sm:h-dvh flex flex-col bg-background pb-20 lg:pb-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 p-3 sm:p-6">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Sparkles className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2">
              AI Asistan
              <span className="px-1.5 sm:px-2 py-0.5 bg-white/20 rounded text-[10px] sm:text-xs font-normal">ChatGPT</span>
            </h1>
            <p className="text-blue-100 text-xs sm:text-sm">Yapay zeka ile işletmenizi analiz edin</p>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <AIChatGPT />
      </div>
    </div>
  );
}