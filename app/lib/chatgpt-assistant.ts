/**
 * ChatGPT Powered AI Assistant
 * Gerçek ChatGPT API ile güçlendirilmiş akıllı asistan
 */

import OpenAI from 'openai';
import { supabase } from './supabase';
import { getOpenAIKey } from './api-config';

// OpenAI Client - Safely initialize
let openai: OpenAI | null = null;
let lastUsedKey: string = '';

/**
 * OpenAI client'ı başlat veya yenile
 */
function initializeOpenAI() {
  try {
    const apiKey = getOpenAIKey();
    
    if (apiKey && apiKey !== 'YOUR_OPENAI_API_KEY_HERE' && apiKey.trim() !== '') {
      // Key değiştiyse yeniden oluştur
      if (apiKey !== lastUsedKey) {
        openai = new OpenAI({
          apiKey,
          dangerouslyAllowBrowser: true,
        });
        lastUsedKey = apiKey;
      }
      return true;
    }
    openai = null;
    lastUsedKey = '';
  } catch (error) {
    console.warn('OpenAI initialization failed:', error);
  }
  return false;
}

// İlk başlatma
initializeOpenAI();

/**
 * OpenAI client'ı yeniden başlat (API key değiştiğinde)
 */
export function reinitializeOpenAI() {
  return initializeOpenAI();
}

export interface AIResponse {
  type: 'chart' | 'table' | 'stat' | 'text';
  answer: string;
  data?: any;
  chartType?: 'bar' | 'line' | 'pie' | 'area';
  chartConfig?: any;
  sql?: string;
}

/**
 * Özel rapor komutları (AI anahtarı olmadan veya doğrudan grafik istendiğinde çalışır)
 */
function handleSpecialReports(question: string): AIResponse | null {
  const q = question.toLowerCase();
  
  const getLS = (key: string) => {
    try {
      const data = localStorage.getItem('isleyen_et_' + key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  };

  // Stok Grafiği
  if (q.includes('stok') && (q.includes('grafik') || q.includes('rapor'))) {
    const products = getLS('stok_data');
    if (!products || products.length === 0) {
      return { type: 'text', answer: 'Sistemde henüz stok verisi bulunmuyor.' };
    }
    const chartData = products.map((p: any) => ({
      name: p.name,
      value: p.currentStock || 0
    })).sort((a: any, b: any) => b.value - a.value).slice(0, 10);
    
    return {
      type: 'chart',
      answer: 'İşte stoklarınızın mevcut durumunu gösteren grafiksel rapor. En yüksek stoklu 10 ürün listelenmiştir.',
      data: chartData,
      chartType: 'bar',
      chartConfig: { xKey: 'name', yKey: 'value', color: '#10b981' }
    };
  }

  // Gider Grafiği
  if (q.includes('gider') && (q.includes('grafik') || q.includes('rapor') || q.includes('dağılım'))) {
    const kasa = getLS('kasa_data');
    const giderler = kasa.filter((k: any) => k.type === 'Gider');
    
    if (!giderler || giderler.length === 0) {
      return { type: 'text', answer: 'Sistemde henüz gider verisi bulunmuyor.' };
    }

    const categoryMap: Record<string, number> = {};
    giderler.forEach((g: any) => {
      categoryMap[g.category] = (categoryMap[g.category] || 0) + Number(g.amount);
    });

    const chartData = Object.keys(categoryMap).map(k => ({
      name: k,
      value: categoryMap[k]
    }));

    return {
      type: 'chart',
      answer: 'İşte kategori bazlı gider dağılımınızı gösteren grafiksel rapor.',
      data: chartData,
      chartType: 'pie',
      chartConfig: { nameKey: 'name', valueKey: 'value' }
    };
  }

  // Satış Grafiği
  if (q.includes('satış') && (q.includes('grafik') || q.includes('rapor') || q.includes('trend'))) {
    const fisler = getLS('fisler');
    const satislar = fisler.filter((f: any) => f.mode === 'satis');
    
    if (!satislar || satislar.length === 0) {
      return { type: 'text', answer: 'Sistemde henüz satış verisi bulunmuyor.' };
    }

    const dateMap: Record<string, number> = {};
    satislar.forEach((s: any) => {
      const d = s.date || 'Bilinmeyen';
      dateMap[d] = (dateMap[d] || 0) + Number(s.total);
    });

    const chartData = Object.keys(dateMap).map(k => ({
      date: k,
      value: dateMap[k]
    })).sort((a: any, b: any) => {
      let timeA = new Date(a.date).getTime();
      let timeB = new Date(b.date).getTime();
      if(isNaN(timeA)) {
         try { timeA = new Date(a.date.split('.').reverse().join('-')).getTime(); } catch(e) { timeA = 0; }
      }
      if(isNaN(timeB)) {
         try { timeB = new Date(b.date.split('.').reverse().join('-')).getTime(); } catch(e) { timeB = 0; }
      }
      return timeA - timeB;
    });

    return {
      type: 'chart',
      answer: 'İşte günlere göre satış trendinizi gösteren grafiksel rapor.',
      data: chartData,
      chartType: 'area',
      chartConfig: { xKey: 'date', yKey: 'value', color: '#3b82f6' }
    };
  }

  return null;
}

/**
 * ChatGPT ile konuş ve veri analizi yap
 */
export async function chatWithAI(userMessage: string, conversationHistory: any[] = []): Promise<AIResponse> {
  try {
    // Önce özel rapor mu diye kontrol et (API Key sormadan direkt lokalden getirir)
    const specialReport = handleSpecialReports(userMessage);
    if (specialReport) return specialReport;

    // Her çağrıda key'i yeniden kontrol et (kullanıcı sonradan girebilir)
    initializeOpenAI();

    if (!openai) {
      throw new Error('OpenAI client not initialized');
    }

    const getLS = (key: string) => {
      try {
        const data = localStorage.getItem('isleyen_et_' + key);
        return data ? JSON.parse(data) : [];
      } catch {
        return [];
      }
    };

    const contextData = {
      fisler: getLS('fisler') || [],
      stok: getLS('stok_data') || [],
      cari: getLS('cari_data') || [],
      kasa: getLS('kasa_data') || [],
      personel: getLS('personel_data') || []
    };

    const systemPrompt = `Sen İŞLEYEN ET adlı bir et işletmesinin ERP sisteminin uzman yapay zeka asistanısın. 
Görevlerin: Kullanıcının sorularını sistemdeki güncel gerçek verilere dayanarak cevaplamak.

SİSTEMDEKİ MEVCUT GERÇEK VERİLER (ÖZET):
Stok Durumu: ${JSON.stringify(contextData.stok.map((s:any) => ({ ad: s.name, stok: s.currentStock, birim: s.unit, kategori: s.category })))}
Cari Hesaplar: ${JSON.stringify(contextData.cari.map((c:any) => ({ ad: c.companyName || c.name, tip: c.type, bakiye: c.balance })))}
Kasa İşlemleri (Son 100): ${JSON.stringify(contextData.kasa.slice(0, 100).map((k:any) => ({ islem: k.type, tutar: k.amount, tarih: k.date, aciklama: k.description })))}
Fişler (Son 100): ${JSON.stringify(contextData.fisler.slice(0, 100).map((f:any) => ({ tip: f.mode, toplam: f.total, tarih: f.date, personel: f.employee_name })))}

CEVAP FORMATI:
SADECE aşağıdaki JSON formatında cevap ver, dışına markdown veya başka metin ekleme:
{
  "type": "chart" | "stat" | "text",
  "answer": "Kullanıcıya verilecek Türkçe, profesyonel, detaylı ve net cevap.",
  "data": [ {"name": "Örnek", "value": 100} ], // EĞER chart veya stat seçtiysen veriyi KENDİN bu diziye koy
  "chartType": "bar" | "line" | "pie" | "area", // opsiyonel, grafik için
  "chartConfig": { // opsiyonel
    "xKey": "name",
    "yKey": "value",
    "color": "#3b82f6"
  }
}

Eğer grafik veya istatistik göstermen istenmiyorsa type "text" yap ve sadece "answer" alanını doldur. Verilere göre hesaplama yap, uydurma. Verilerde yoksa "verilerde bulunmuyor" de.`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    // ChatGPT'ye sor
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    });

    const aiResponse = completion.choices[0]?.message?.content;

    if (!aiResponse) {
      throw new Error('ChatGPT cevap vermedi');
    }

    // JSON parse
    let parsedResponse: any;
    try {
      let cleanJson = aiResponse;
      // Eğer ChatGPT markdown ile sardıysa veya ekstra metin koyduysa, sadece JSON kısmını yakala
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }
      parsedResponse = JSON.parse(cleanJson.trim());
    } catch (e) {
      console.warn("JSON Parse Failed for AI Response:", aiResponse);
      // JSON parse edilemezse, düz text olarak döndür
      return {
        type: 'text',
        answer: aiResponse.replace(/```json|```/g, ''),
      };
    }

    // AI geçerli bir chart veya stat data döndürdüyse ve data array değilse düzelt
    if (parsedResponse.type === 'chart' && (!parsedResponse.data || !Array.isArray(parsedResponse.data))) {
       parsedResponse.type = 'text'; // Fallback to text if malformed chart
    }

    return parsedResponse;
  } catch (error: any) {
    console.error('ChatGPT error:', error);
    
    // Fallback - basit pattern matching
    return fallbackResponse(userMessage);
  }
}

/**
 * Fallback cevaplar (ChatGPT erişilemezse)
 */
function fallbackResponse(question: string): AIResponse {
  // Önce özel rapor var mı diye bak
  const specialReport = handleSpecialReports(question);
  if (specialReport) return specialReport;

  const q = question.toLowerCase();

  if (q.includes('satış') && (q.includes('bugün') || q.includes('bugun'))) {
    return {
      type: 'text',
      answer: '⚠️ ChatGPT API bağlantısı kurulamadı. Lütfen API key\'inizi kontrol edin.\n\nAPI key\'inizi .env.local dosyasına ekleyin:\nVITE_OPENAI_API_KEY=sk-...',
    };
  }

  return {
    type: 'text',
    answer: '⚠️ ChatGPT servisi şu anda kullanılamıyor.\n\nLütfen kontrol edin:\n' +
      '1. VITE_OPENAI_API_KEY .env.local dosyasında tanımlı mı?\n' +
      '2. API key geçerli mi?\n' +
      '3. İnternet bağlantınız var mı?\n\n' +
      'Yardım için: https://platform.openai.com/api-keys',
  };
}

/**
 * ChatGPT ile veri analizi yap
 */
export async function analyzeData(data: any[], question: string): Promise<string> {
  try {
    if (!openai) {
      throw new Error('OpenAI client not initialized');
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Sen bir veri analisti olarak bu verileri analiz et ve Türkçe özet ver.',
        },
        {
          role: 'user',
          content: `Soru: ${question}\n\nVeriler: ${JSON.stringify(data)}\n\nBu verileri analiz et ve özet çıkar.`,
        },
      ],
      temperature: 0.5,
      max_tokens: 500,
    });

    return completion.choices[0]?.message?.content || 'Analiz yapılamadı';
  } catch (error) {
    console.error('Data analysis error:', error);
    return 'Veri analizi yapılamadı.';
  }
}

/**
 * ChatGPT ile grafik önerisi al
 */
export async function suggestChart(data: any[], question: string): Promise<{
  chartType: 'bar' | 'line' | 'pie' | 'area';
  config: any;
}> {
  try {
    if (!openai) {
      throw new Error('OpenAI client not initialized');
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Sen bir veri görselleştirme uzmanısın. Veriye en uygun grafik türünü öner.',
        },
        {
          role: 'user',
          content: `Veri: ${JSON.stringify(data.slice(0, 5))}\n\nBu veri için en uygun grafik türü nedir? (bar, line, pie, area)\n\nJSON formatında cevap ver: {"chartType": "bar", "xKey": "name", "yKey": "value", "color": "#3b82f6"}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 200,
    });

    const response = completion.choices[0]?.message?.content;
    if (response) {
      const clean = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        chartType: parsed.chartType || 'bar',
        config: {
          xKey: parsed.xKey,
          yKey: parsed.yKey,
          color: parsed.color || '#3b82f6',
        },
      };
    }

    return {
      chartType: 'bar',
      config: { xKey: 'name', yKey: 'value', color: '#3b82f6' },
    };
  } catch (error) {
    console.error('Chart suggestion error:', error);
    return {
      chartType: 'bar',
      config: { xKey: 'name', yKey: 'value', color: '#3b82f6' },
    };
  }
}