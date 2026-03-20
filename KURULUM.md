# Siteyi Kendi Bilgisayarında Çalıştırma Kılavuzu

## Gereksinimler

- [Node.js](https://nodejs.org) (v18 veya üzeri)
- Git

---

## Adım 1: Node.js Kur

1. [https://nodejs.org](https://nodejs.org) adresine git
2. **LTS** sürümünü indir ve kur
3. Kurulumu doğrulamak için terminali aç ve şunu yaz:
   ```
   node --version
   npm --version
   ```
   Her iki komut da bir versiyon numarası göstermeliydi.

---

## Adım 2: Projeyi İndir (GitHub'dan Clone)

Terminali aç ve şu komutları çalıştır:

```bash
git clone https://github.com/agamert37-cmd/MERT.4.git
cd MERT.4
```

---

## Adım 3: Bağımlılıkları Kur

Proje klasöründeyken şunu çalıştır:

```bash
npm install
```

Bu işlem biraz sürebilir (internet hızına göre 1-5 dakika).

---

## Adım 4: Siteyi Başlat

```bash
npm run dev
```

Çıktıda şuna benzer bir şey görürsün:

```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

---

## Adım 5: Tarayıcıda Aç

Tarayıcına şu adresi yaz:
```
http://localhost:5173
```

Site hazır!

---

## Siteyi Durdurmak

Terminalde `Ctrl + C` tuşlarına bas.

---

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| `npm install` hata verdi | Node.js'i yeniden kur |
| Port meşgul hatası | `npm run dev -- --port 3000` dene |
| Sayfa açılmıyor | Terminal çıktısına bak, hata var mı? |

---

## Notlar

- Supabase veritabanı zaten yapılandırılmış, ek ayar gerekmez.
- Site internet bağlantısı olmadan veritabanı özelliklerini kullanamaz.
