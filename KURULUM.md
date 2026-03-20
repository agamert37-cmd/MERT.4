# MERT.4 — Kendi Bilgisayarında Sunucu Olarak Çalıştırma Kılavuzu

> Bu kılavuz sıfırdan başlayan biri için yazılmıştır. Hiçbir şey bilmiyormuşsun gibi açıklanmıştır.

---

## GENEL YAPI (Ne Yapacağız?)

```
Senin Bilgisayarın                    İnternet
┌─────────────────────┐               ┌──────────────────────┐
│  Site (localhost)   │◄──Cloudflare──►  domain.com          │
│  port: 5173         │    Tunnel      │  (kendi domain'in)  │
└─────────────────────┘               └──────────────────────┘
         │
         │  (veri için)
         ▼
┌─────────────────────┐
│  Supabase Cloud     │  ← Zaten hazır, ayar gerekmez
│  (veritabanı)       │
└─────────────────────┘
```

**Port yönlendirme yok. Router ayarı yok. Sadece 3 şey gerekiyor:**
1. Node.js
2. Cloudflared (Cloudflare'in tünel aracı)
3. Cloudflare hesabı + bir domain

---

## ADIM 1 — Node.js Kur

### İndir:
- [https://nodejs.org](https://nodejs.org) adresine git
- Büyük yeşil **"LTS"** butonuna tıkla ve indir
- Kurulum sihirbazını çalıştır, hep "Next" de

### Doğrula:
Terminali aç (Windows: `Win + R` → `cmd` → Enter):
```
node --version
npm --version
```
Her ikisi de bir sayı göstermeliydi. (Örnek: `v22.0.0` ve `10.9.0`)

---

## ADIM 2 — Projeyi GitHub'dan İndir

Terminalde şunu çalıştır:
```bash
git clone https://github.com/agamert37-cmd/MERT.4.git
cd MERT.4
```

> Eğer `git` komutunu tanımıyorsa: [https://git-scm.com](https://git-scm.com) adresinden Git'i kur.

---

## ADIM 3 — Bağımlılıkları Kur

Proje klasöründeyken:
```bash
npm install
```

Bu komut tüm gerekli paketleri indirir. 1-5 dakika sürebilir.
Hata olmadıysa devam et.

---

## ADIM 4 — Siteyi Başlat

```bash
npm run dev
```

Şuna benzer bir çıktı göreceksin:
```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.x:5173/
```

Tarayıcında `http://localhost:5173` adresini aç — site açılıyor mu? ✓

> Siteyi durdurmak için: `Ctrl + C`

---

## ADIM 5 — Cloudflare Hesabı ve Domain Ayarı

### Cloudflare hesabı:
1. [https://cloudflare.com](https://cloudflare.com) → "Sign Up" ile hesap aç (ücretsiz)
2. Domain'ini Cloudflare'e ekle:
   - Dashboard → "Add a site" → domain adını yaz
   - Plan: **Free** seç
   - Cloudflare sana 2 tane nameserver adresi verecek (örn: `ayla.ns.cloudflare.com`)
3. Domain aldığın yerde (GoDaddy, İsimtescil vs.) DNS ayarlarına gir
4. Nameserver'ları Cloudflare'in verdiği ile değiştir
5. 1-24 saat içinde aktif olur

---

## ADIM 6 — Cloudflared (Tünel Aracı) Kur

### İndir:
- [https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- İşletim sistemine göre doğru versiyonu indir
- Windows için: `.msi` uzantılı dosyayı indir ve kur

### Doğrula:
```bash
cloudflared --version
```

### Cloudflare hesabına bağlan:
```bash
cloudflared tunnel login
```
Tarayıcı açılacak, Cloudflare hesabınla giriş yap ve izin ver.

---

## ADIM 7 — Tünel Oluştur

### Tünel oluştur:
```bash
cloudflared tunnel create mert-site
```
Bu komut sana bir **Tunnel ID** verecek. Not al. (Örn: `abc123-def456-...`)

### Domain'ini tünele bağla:
```bash
cloudflared tunnel route dns mert-site domain.com
```
`domain.com` yerine kendi domain'ini yaz.

### Config dosyası oluştur:
`~/.cloudflared/config.yml` dosyasını bir metin editörüyle aç/oluştur ve şunu yaz:

```yaml
tunnel: TUNNEL_ID_BURAYA
credentials-file: /Users/KULLANICI_ADIN/.cloudflared/TUNNEL_ID_BURAYA.json

ingress:
  - hostname: domain.com
    service: http://localhost:5173
  - service: http_status:404
```

> `TUNNEL_ID_BURAYA` → 7. adımda aldığın ID
> `KULLANICI_ADIN` → Windows'ta `C:\Users\KullaniciAdin\.cloudflared\...`

**Windows için config dosyası yolu:** `C:\Users\KullaniciAdin\.cloudflared\config.yml`

---

## ADIM 8 — Her Şeyi Birlikte Çalıştır

Her seferinde site açmak için **2 terminal penceresi** aç:

### Terminal 1 — Siteyi başlat:
```bash
cd MERT.4
npm run dev
```

### Terminal 2 — Tüneli başlat:
```bash
cloudflared tunnel run mert-site
```

Artık `https://domain.com` adresine girince site açılacak!

---

## ADIM 9 — Otomatik Başlatma (İsteğe Bağlı)

Bilgisayar her açıldığında otomatik başlasın istiyorsan:

### Cloudflared'i servis olarak kur (Windows):
```bash
cloudflared service install
```

### Site için başlatma scripti oluştur:
`baslat.bat` adında bir dosya oluştur:
```bat
@echo off
cd /d C:\MERT.4
start cmd /k npm run dev
```
Bu dosyayı Başlangıç klasörüne ekle:
`Win + R` → `shell:startup` → `baslat.bat` dosyasını buraya kopyala

---

## ÖZET — Her Günkü Kullanım

Bilgisayarı açtıktan sonra tek yapman gereken:
```bash
# Terminal 1
cd MERT.4
npm run dev

# Terminal 2
cloudflared tunnel run mert-site
```

Site `https://domain.com` adresinde hazır!

---

## SORUN GİDERME

| Sorun | Çözüm |
|-------|-------|
| `npm install` hata verdi | Node.js'i yeniden kur |
| `command not found: cloudflared` | Cloudflared'i PATH'e ekle |
| Domain açılmıyor | Cloudflare DNS propagasyonu bekle (max 24 saat) |
| Tünel bağlanamıyor | `cloudflared tunnel login` tekrar çalıştır |
| Sayfa boş geliyor | `npm run dev` çalışıyor mu kontrol et |

---

## TEKNİK NOTLAR

- **Veritabanı:** Supabase Cloud — zaten yapılandırılmış, ek ayar gerekmez
- **Kimlik doğrulama:** localStorage tabanlı — internet olmadan da çalışır
- **Port:** Varsayılan `5173`, değiştirmek için: `npm run dev -- --port 8080`
- **HTTPS:** Cloudflare Tunnel otomatik SSL sertifikası sağlar
