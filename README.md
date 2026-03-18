# İŞLEYEN ET - ERP Sistemi v3.5 🥩

**ChatGPT Destekli** modern et işletmesi yönetim sistemi. Yapay zeka ile konuşarak işletmenizi analiz edin!

## 🌟 Yeni Özellikler (v3.5)

### 🤖 ChatGPT Entegrasyonu
- **Gerçek AI**: OpenAI GPT-4o-mini ile çalışır
- **Doğal Dil**: Türkçe konuşarak soru sorun
- **Akıllı Analiz**: ChatGPT verilerinizi analiz eder
- **Otomatik Grafikler**: AI sizin için grafik oluşturur
- **Bağlam Farkındalığı**: Önceki konuşmaları hatırlar

### 🗣️ Örnek Konuşmalar
```
👤 "Bu ay kaç satış yaptık?"
🤖 "Bu ay toplam 156 satış gerçekleştirildi. Toplam ciro 567,890 ₺"

👤 "En çok hangi ürün satıldı?"
🤖 "En çok satan ürününüz Dana Kıyma - 85,600 ₺ ciroda"
     [Bar grafiği gösterir]

👤 "Kar durumunu özetle"
🤖 "📊 Bu Ay Özet:
     💰 Satış: 567,890 ₺
     💸 Gider: 185,200 ₺
     📈 Net Kar: 382,690 ₺ (+106%)"
```

## ✨ Tüm Özellikler

### 🎯 Ana Modüller
- ✅ **Dashboard** - Canlı istatistikler
- ✅ **AI Asistan** - ChatGPT destekli akıllı yardımcı
- ✅ **Fiş Yönetimi** - Satış ve gider fişleri
- ✅ **Fiş Geçmişi** - Detaylı kayıtlar ve PDF export
- ✅ **Stok Yönetimi** - Ürün takibi
- ✅ **Cari Hesaplar** - Müşteri/Toptancı yönetimi
- ✅ **Kasa & Finans** - Banka ve nakit
- ✅ **Araç & Lojistik** - Filo yönetimi
- ✅ **Personel** - Çalışan bilgileri
- ✅ **Raporlar** - Finansal raporlama

### 🔥 Yapay Zeka Özellikleri
- 🧠 **Doğal Dil İşleme** - Türkçe konuşun, anlasın
- 📊 **Akıllı Grafikler** - Otomatik görselleştirme
- 📈 **Trend Analizi** - Satış/gider trendleri
- 💡 **Öneriler** - AI size öneriler sunar
- 🎯 **Bağlam Hatırlama** - Konuşma geçmişi
- ⚡ **Hızlı Cevap** - Ortalama 1-2 saniye

### 🌐 Supabase Entegrasyonu
- ✅ Gerçek zamanlı senkronizasyon
- ✅ Cloud database
- ✅ Offline çalışma
- ✅ Otomatik backup
- ✅ Realtime updates
- ✅ Multi-device sync

## 🚀 Hızlı Başlangıç

### 1. Gereksinimler
- Node.js 18+
- Supabase hesabı (ücretsiz)
- OpenAI API key ($5 kredi yeterli)

### 2. Kurulum
```bash
# Projeyi klonla
git clone https://github.com/your-repo/isleyen-et.git
cd isleyen-et

# Bağımlılıkları yükle
npm install
```

### 3. API Keys Kurulumu
**Detaylı talimatlar için: [API-KEYS-SETUP.md](./API-KEYS-SETUP.md)**

#### Supabase (5 dakika)
1. https://supabase.com → Ücretsiz hesap aç
2. Yeni proje oluştur
3. SQL Editor'de `supabase-schema.sql` çalıştır
4. API keys'leri kopyala

#### OpenAI (3 dakika)
1. https://platform.openai.com → Hesap aç
2. $5 kredi yükle (6+ ay yeter!)
3. API key oluştur

#### .env.local Dosyası
Proje dizininde `.env.local` oluştur:
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR...
VITE_OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

### 4. Başlat
```bash
npm run dev
```

Tarayıcıda aç: http://localhost:5173

**Giriş:**
- Email: admin@isleyenet.com
- Şifre: admin123

### 5. AI Asistan'ı Test Et
1. Sol menüden **✨ AI Asistan** tıkla
2. Sor: "Bu ay toplam satış ne kadar?"
3. ChatGPT cevap verecek! 🎉

## 💻 Teknoloji Stack

### Frontend
- **React 18** + TypeScript
- **Tailwind CSS v4** - Styling
- **React Router v7** - Navigation
- **Motion** - Animations
- **Recharts** - Grafikler
- **Radix UI** - UI Components

### Backend & AI
- **Supabase** - PostgreSQL database
- **OpenAI GPT-4o-mini** - AI asistan
- **Realtime** - Canlı senkronizasyon

### State & Forms
- **React Context** - State management
- **React Hook Form** - Form handling
- **Sonner** - Notifications

## 📊 AI Asistan Kullanımı

### Desteklenen Soru Tipleri

#### 💰 Satış Soruları
```
"Bu ay toplam satış ne kadar?"
"Bugünkü satışları göster"
"Satış grafiği çiz"
"En çok satan ürünler"
"Geçen aya göre satış nasıl?"
```

#### 💸 Gider Soruları
```
"Bu ayki giderler nedir?"
"Gider kategorilerini göster"
"En büyük gider kalemi nedir?"
"Kira + elektrik toplamı ne kadar?"
```

#### 📦 Stok Soruları
```
"Stokta düşük ürünler var mı?"
"Toplam stok değeri nedir?"
"Hangi ürünlerin stoğu kritik?"
"En çok stokta olan ürün?"
```

#### 👥 Müşteri Soruları
```
"En çok alışveriş yapan müşteriler"
"Borçlu müşteriler kimler?"
"Müşteri sayısı kaç?"
"En değerli müşterim kim?"
```

#### 📈 Analiz Soruları
```
"Genel özet ver"
"Kar-zarar durumu"
"Bu ayın performansı nasıl?"
"Trend analizi yap"
```

### AI Yetenekleri

✅ **Anlar:**
- Doğal Türkçe cümleler
- Tarih ifadeleri (bugün, bu ay, geçen hafta)
- Karşılaştırma soruları
- Çoklu soru kombinasyonları

✅ **Üretir:**
- Grafikler (bar, line, area, pie)
- İstatistik kartları
- Detaylı açıklamalar
- SQL sorguları (arka planda)

✅ **Hatırlar:**
- Önceki konuşmaları
- Bağlamı sürdürür
- Follow-up soruları anlar

## 💰 Maliyet

### Supabase
- **Free Tier**: ✅ Ücretsiz
- 500 MB database
- 2 GB bandwidth
- Realtime dahil

### OpenAI GPT-4o-mini
- **Model**: En ucuz ve hızlı
- **Fiyat**: ~$0.15 / 1M token
- **Örnek Kullanım**:
  - 100 soru ≈ $0.05
  - 1000 soru ≈ $0.50
  - Aylık 3000 soru ≈ $1.50

💡 **$5 yüklersen 6+ ay yeter!**

## 📁 Proje Yapısı

```
/
├── src/app/
│   ├── components/
│   │   ├── AIChatGPT.tsx        # ChatGPT UI
│   │   ├── MainLayout.tsx       # Ana layout
│   │   └── SupabaseStatus.tsx   # Bağlantı durumu
│   ├── lib/
│   │   ├── chatgpt-assistant.ts # ChatGPT logic
│   │   └── supabase.ts          # Supabase client
│   ├── pages/
│   │   ├── ChatPage.tsx         # AI Asistan sayfası
│   │   ├── DashboardPage.tsx
│   │   └── ...
│   └── App.tsx
├── supabase-schema.sql          # Database şeması
├── API-KEYS-SETUP.md           # Detaylı kurulum
├── .env.local                   # API keys (GİZLİ!)
└── README.md                    # Bu dosya
```

## 🔒 Güvenlik

### Önemli Uyarılar
- ⚠️ **API key'leri asla GitHub'a yükleme!**
- ⚠️ `.env.local` dosyası `.gitignore`'da olmalı
- ⚠️ Production'da RLS (Row Level Security) aktif et
- ⚠️ OpenAI rate limiting kur ($10/ay yeterli)

### Güvenlik Kontrol Listesi
- [ ] `.env.local` dosyası `.gitignore`'da
- [ ] Supabase RLS politikaları aktif (production)
- [ ] OpenAI monthly budget limit var
- [ ] Email notification'ları açık
- [ ] API key'ler güvenli yerde saklanıyor

## 🐛 Sorun Giderme

### AI Asistan Çalışmıyor
✅ **Kontrol Et:**
1. `.env.local` dosyasında `VITE_OPENAI_API_KEY` var mı?
2. API key doğru kopyalandı mı?
3. OpenAI hesabında kredi var mı?
4. İnternet bağlantısı aktif mi?

### Supabase Bağlanamıyor
✅ **Kontrol Et:**
1. `.env.local` dosyasında URL ve key doğru mu?
2. Supabase projesi aktif mi?
3. `supabase-schema.sql` çalıştırıldı mı?
4. İnternet bağlantısı var mı?

### Grafikler Görünmüyor
✅ **Kontrol Et:**
1. Veritabanında veri var mı?
2. En az bir satış fişi eklendi mi?
3. Console'da hata var mı?

Daha fazla bilgi için: [API-KEYS-SETUP.md](./API-KEYS-SETUP.md)

## 📚 Dokümantasyon

- [API Keys Kurulum Rehberi](./API-KEYS-SETUP.md) - Detaylı kurulum
- [Supabase Kurulum](./SUPABASE-SETUP.md) - Database setup
- [AI Asistan Kullanımı](./AI-ASSISTANT-README.md) - AI özellikleri
- [Genel Kurulum](./KURULUM.md) - Türkçe talimatlar

## 🎯 Özellik Roadmap

### v4.2 Planları (TAMAMLANDI)
- [x] Brute Force koruması
- [x] 15 dakikalık otomatik oturum kapatma
- [x] Güvenlik loglaması ve Güvenlik Merkezi
- [x] Cam efektli arayüz optimizasyonları

### v4.3 Planları
- [ ] Sesli komut desteği
- [ ] Mobil uygulama
- [ ] WhatsApp entegrasyonu
- [ ] QR kod ile fiş okuma
- [ ] Otomatik stok uyarıları
- [ ] SMS bildirimleri
- [ ] Çoklu dil desteği
- [ ] Dark/Light theme toggle

## 🤝 Katkıda Bulunma

Katkılarınızı bekliyoruz!

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing`)
3. Commit edin (`git commit -m 'feat: Add feature'`)
4. Push edin (`git push origin feature/amazing`)
5. Pull Request açın

## 📄 Lisans

Bu proje özel bir projedir. Ticari kullanım için izin gereklidir.

## 📞 İletişim

- **Email**: info@isleyenet.com
- **Telefon**: 0555 123 45 67
- **Web**: https://isleyenet.com

## 🙏 Teşekkürler

Bu projeyi kullandığınız için teşekkürler!

### Kullanılan Teknolojiler
- [React](https://react.dev)
- [Supabase](https://supabase.com)
- [OpenAI](https://openai.com)
- [Tailwind CSS](https://tailwindcss.com)
- [Recharts](https://recharts.org)
- [Motion](https://motion.dev)

---

<div align="center">

**Made with ❤️ and 🤖 AI for İşleyen Et**

v3.5 - ChatGPT Powered Edition

[![Supabase](https://img.shields.io/badge/Supabase-Database-green)](https://supabase.com)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-blue)](https://openai.com)
[![React](https://img.shields.io/badge/React-18-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://typescriptlang.org)

</div>
