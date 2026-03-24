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
