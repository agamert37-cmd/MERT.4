# AJAN DEVİR TESLİM & DÜZENLEME GÜNLÜĞÜ

## Proje: İŞLEYEN ET - ERP Sistemi v3.5

---

## AJAN BİLGİLERİ

| | Bilgi |
|---|---|
| **Önceki Ajan (Ajan 1)** | X1 hesabı - Claude (club ajanı) |
| **Mevcut Ajan (Ajan 2)** | Claude Sonnet 4.6 — `claude/serene-gagarin` worktree |
| **Devir Tarihi** | 2026-03-24 |
| **Branch** | `claude/serene-gagarin` |

---

## KURAL: DOSYA İMZALAMA

Her düzenlenen dosyanın **en üstüne** şu yorum satırı eklenir:

```
// [AJAN-2 | claude/serene-gagarin | YYYY-MM-DD] Son düzenleyen: Claude Sonnet 4.6
```

---

## DÜZENLEME GÜNLÜĞÜ

| # | Dosya | Tarih | Açıklama |
|---|-------|-------|----------|
| 1 | `app/App.tsx` | 2026-03-24 | BUG FIX: `handleFocus` artık önce `stopRealtimeSync()` çağırıyor — stale `_realtimeUnsubscribe` yüzünden mobil'de realtime asla yeniden bağlanamıyordu. `visibilitychange` handler eklendi. |
| 2 | `app/hooks/useTableSync.ts` | 2026-03-24 | BUG FIX: Mobil arka plandan dönünce `clearConnectionCooldown()` eklendi (module-level cooldown tüm tabloları blokluyordu). `visibilitychange → hidden`'da write queue flush eklendi. |
| 3 | `app/utils/supabase-storage.ts` | 2026-03-24 | BUG FIX: `visibilitychange → visible`'da `stopRealtimeSync()` + `startRealtimeSync()` çağrısı eklendi — ölü WebSocket kanalı temizlenip yeniden başlatılıyor. |
| 4 | `app/contexts/SyncContext.tsx` | 2026-03-24 | BUG FIX: `window.addEventListener('online', ...)` eklendi — ağ gelince backoff beklenmeden anında tablo kontrolü yapılıyor. |
| 5 | `app/lib/auto-setup.ts` | 2026-03-24 | BUG FIX: `tahsilatlar` ve `arac_km_logs` tabloları `SYSTEM_TABLES` listesine eklendi — migration'da var ama kontrol listesinde yoktu. |
| 6 | `app/hooks/useTableSync.ts` | 2026-03-24 | GÜÇLENDİRME: `withTimeout` (10s) eklendi. WriteQueue'ya localStorage persistence eklendi. `online` event → write flush + fetchData. `CONNECTION_COOLDOWN_MS` 15s→8s. |
| 7 | `app/utils/supabase-storage.ts` | 2026-03-24 | GÜÇLENDİRME: Başlangıçta kalan kuyruğu 3s sonra auto-flush. `online` event'e `flushWrites()` eklendi. `MIN_RESYNC_INTERVAL_MS` 30s→15s. Heartbeat 5dk→2dk. |
| 8 | `app/lib/dual-supabase.ts` | 2026-03-24 | GÜÇLENDİRME: `createCloudDirectBackup` + `startCloudDirectBackupScheduler` eklendi — Edge Function olmadan doğrudan Supabase client ile buluta yedek alır. |
| 9 | `app/App.tsx` | 2026-03-24 | GÜÇLENDİRME: `startCloudDirectBackupScheduler(24)` entegre edildi — yapılandırma gerektirmeden her 24s otomatik yedek. |
| 10 | `app/contexts/GlobalTableSyncContext.tsx` | 2026-03-24 | YENİ DOSYA: App geneli tablo senkronizasyon provider'ı oluşturuldu. Tüm kritik Supabase tablolarını (fisler, urunler, cari_hesaplar, kasa_islemleri, personeller, bankalar, cekler, araclar, arac_shifts, arac_km_logs, uretim_profilleri, uretim_kayitlari, faturalar, fatura_stok, tahsilatlar) localStorage'a yükler. Mobil'de DashboardPage verilerin görünmemesi sorunu çözüldü. |
| 11 | `app/App.tsx` | 2026-03-24 | ENTEGRASYON: `GlobalTableSyncProvider` import edildi ve `RouterProvider` sarıldı — hangi sayfada olunursa olsun tüm tablolar senkronize edilir. |
| 12 | `app/pages/FisHistoryPage.tsx` | 2026-03-24 | BUG FIX: Delete, edit ve restore işlemlerinde Supabase tablosu da güncelleniyor. `deleteFisFromSupabase`, `updateFisInSupabase`, `addFisToSupabase` kullanılıyor. Stok/cari değişikliklerinde `supabase.from('urunler').upsert()` ve `supabase.from('cari_hesaplar').upsert()` eklendi. |
| 13 | `app/pages/UretimPage.tsx` | 2026-03-24 | BUG FIX: Üretim kaydedilince stok değişiklikleri KV'nin yanında doğrudan `urunler` Supabase tablosuna da yazılıyor (`syncStokItemsToSupabase` eklendi). Mobil üretim sonrası doğru stok görüyor. |
| 14 | `app/lib/dual-supabase.ts` | 2026-03-25 | KRİTİK FIX: `createFullTableBackup()` ve `restoreFromTableBackup()` eklendi — 15 gerçek Supabase tablosundan (fisler, urunler, cari vb.) yedek alır. Zamanlayıcı artık KV değil gerçek tabloları yedekliyor. |
| 15 | `app/pages/YedeklerPage.tsx` | 2026-03-25 | GÜNCELLEŞTİRME: Yedek butonu önce Edge Function dener, başarısız olursa `createFullTableBackup()` çalıştırır. "Yerel Yedek İndir" artık localStorage + Supabase tablolarını birlikte indirir. Tablo yedeklerine Geri Yükle butonu eklendi. |
| 16 | `app/pages/UretimPage.tsx` | 2026-03-25 | UI FIX: `StokSearchSelect` ve `CiktiUrunSelect` dropdown'ları `createPortal` + `position:fixed` ile yeniden yazıldı. `.card-shine { overflow:hidden }` CSS'i dropdown'ı kesiyordu. Tüm `overflow:hidden` üst container'lardan bağımsız, viewport'a göre konumlanıyor. |

---

## PROJE ÖZETİ (Ajan 2 Gözünden)

### Teknoloji Stack
- **Frontend:** React 18 + TypeScript + Vite 6
- **UI:** Radix UI + shadcn/ui + Tailwind CSS v4
- **Database:** Supabase (local Docker + Cloud dual-instance)
- **AI:** OpenAI GPT-4o-mini (ChatGPT entegrasyonu)
- **Deployment:** Docker + Nginx + Cloudflare Tunnel

### Kritik Dosyalar
| Dosya | Boyut | Önem |
|-------|-------|------|
| `app/lib/dual-supabase.ts` | 48.4 KB | ★★★ Sync motoru |
| `app/utils/security.ts` | 49 KB | ★★★ Güvenlik |
| `app/pages/UretimPage.tsx` | 239 KB | ★★★ En büyük modül |
| `app/utils/reportGenerator.ts` | 92 KB | ★★ PDF/Rapor |
| `app/utils/i18n.ts` | 263 KB | ★★ Çeviriler |
| `app/hooks/useTableSync.ts` | 26 KB | ★★ Tablo sync |

### Son Commit Geçmişi (Ajan 1'den devralınan)
```
cec36d8 - fix(uretim): dropdown overflow + sync status components
523ed3d - feat(sync): major storage/sync engine improvements
7d47618 - fix(UretimPage): dropdown overlap in two-column layout
42769f7 - feat: login config, security hardening, kiyma processing
61f3d75 - fix: senkronizasyon ve UI iyileştirmeleri
```

---

## NOTLAR

- Site **GitHub'dan veri çekecek** şekilde çalışacak
- Tüm değişiklikler GitHub'a push edilecek
- Her dosya düzenlemesinde bu günlük güncellenecek
- Açık (vulnerable) kod yazılmayacak

---

*Bu dosya Ajan 2 (Claude Sonnet 4.6) tarafından yönetilmektedir.*
