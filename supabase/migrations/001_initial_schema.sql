-- ============================================================
-- MERT.4 ERP – İlk Veritabanı Şeması
-- Bu dosyayı Supabase SQL Editor'da çalıştırın:
--   https://supabase.com/dashboard/project/pmbpawntaislortnjzmq/sql/new
--
-- Ya da uygulama otomatik olarak /setup-db endpoint'ini çağırarak
-- bu tabloları oluşturur (Edge Function üzerinden).
-- ============================================================

-- ─── 0. Ortak updated_at fonksiyonu ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 1. Ana KV Deposu ────────────────────────────────────────────────────────
-- Tüm uygulama verisi (fisler, cari, stok vb.) bu tabloda saklanır.
-- Key formatı: <tablo_prefix>_<uuid>  (örn: personeller_<uuid>, fisler_<id>)

CREATE TABLE IF NOT EXISTS kv_store_daadfb0c (
  key        TEXT    PRIMARY KEY,
  value      JSONB   NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER kv_store_updated_at
  BEFORE UPDATE ON kv_store_daadfb0c
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- LIKE sorguları için prefix indexi (<prefix>_% gibi)
CREATE INDEX IF NOT EXISTS idx_kv_store_key_prefix
  ON kv_store_daadfb0c (key text_pattern_ops);

-- JSONB arama için GIN index
CREATE INDEX IF NOT EXISTS idx_kv_store_value_gin
  ON kv_store_daadfb0c USING GIN (value);

-- RLS devre dışı (uygulama kendi auth katmanını kullanıyor)
ALTER TABLE kv_store_daadfb0c DISABLE ROW LEVEL SECURITY;


-- ─── 2. Personeller ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS personeller (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  username    TEXT        DEFAULT '',
  position    TEXT        NOT NULL DEFAULT '',
  role        TEXT        NOT NULL DEFAULT 'Personel'
                          CHECK (role IN ('Yönetici','Personel')),
  status      TEXT        NOT NULL DEFAULT 'offline'
                          CHECK (status IN ('online','offline')),
  phone       TEXT        NOT NULL DEFAULT '',
  email       TEXT,
  last_login  TEXT        DEFAULT 'Hiç giriş yapmadı',
  join_date   TEXT        DEFAULT '',
  department  TEXT        DEFAULT '',
  salary      NUMERIC(10,2) NOT NULL DEFAULT 0,
  active      BOOLEAN     NOT NULL DEFAULT true,
  pin_code    TEXT        DEFAULT '',
  password    TEXT        DEFAULT '',
  permissions TEXT        DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE personeller ADD COLUMN IF NOT EXISTS username    TEXT DEFAULT '';
ALTER TABLE personeller ADD COLUMN IF NOT EXISTS pin_code    TEXT DEFAULT '';
ALTER TABLE personeller ADD COLUMN IF NOT EXISTS password    TEXT DEFAULT '';
ALTER TABLE personeller ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT '[]';

CREATE OR REPLACE TRIGGER personeller_updated_at
  BEFORE UPDATE ON personeller
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE personeller DISABLE ROW LEVEL SECURITY;


-- ─── 3. Cari Hesaplar ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cari_hesaplar (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type           TEXT        NOT NULL CHECK (type IN ('Müşteri','Toptancı')),
  company_name   TEXT        NOT NULL DEFAULT '',
  contact_person TEXT        NOT NULL DEFAULT '',
  phone          TEXT        NOT NULL DEFAULT '',
  email          TEXT,
  address        TEXT,
  tax_number     TEXT,
  tax_office     TEXT,
  region         TEXT,
  category       TEXT,
  balance        NUMERIC(10,2) NOT NULL DEFAULT 0,
  transactions   INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS region         TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS category       TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS tax_number     TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS tax_office     TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS company_name   TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS contact_person TEXT;

CREATE OR REPLACE TRIGGER cari_hesaplar_updated_at
  BEFORE UPDATE ON cari_hesaplar
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE cari_hesaplar DISABLE ROW LEVEL SECURITY;


-- ─── 4. Araçlar ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS araclar (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plate            TEXT        NOT NULL UNIQUE,
  model            TEXT        NOT NULL DEFAULT '',
  driver           TEXT        NOT NULL DEFAULT '',
  km               INTEGER     NOT NULL DEFAULT 0,
  last_maintenance TEXT        DEFAULT '-',
  next_inspection  TEXT        DEFAULT '-',
  insurance        TEXT        DEFAULT '-',
  status           TEXT        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','maintenance','idle')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER araclar_updated_at
  BEFORE UPDATE ON araclar
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE araclar DISABLE ROW LEVEL SECURITY;


-- ─── 5. Araç Vardiyaları ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arac_shifts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      TEXT        NOT NULL,
  vehicle_plate   TEXT        NOT NULL DEFAULT '',
  vehicle_model   TEXT        DEFAULT '',
  start_km        NUMERIC(10,2) NOT NULL DEFAULT 0,
  end_km          NUMERIC(10,2),
  start_time      TEXT        NOT NULL DEFAULT '',
  end_time        TEXT,
  start_timestamp BIGINT      NOT NULL DEFAULT 0,
  end_timestamp   BIGINT,
  employee        TEXT        NOT NULL DEFAULT '',
  employee_id     TEXT        DEFAULT '',
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','completed')),
  total_km        NUMERIC(10,2),
  date            TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER arac_shifts_updated_at
  BEFORE UPDATE ON arac_shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE arac_shifts DISABLE ROW LEVEL SECURITY;


-- ─── 6. Kasa İşlemleri ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kasa_islemleri (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL CHECK (type IN ('Gelir','Gider')),
  category    TEXT        NOT NULL DEFAULT '',
  description TEXT        NOT NULL DEFAULT '',
  amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  date        TEXT        NOT NULL DEFAULT '',
  time        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER kasa_islemleri_updated_at
  BEFORE UPDATE ON kasa_islemleri
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE kasa_islemleri DISABLE ROW LEVEL SECURITY;


-- ─── 7. Fişler ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fisler (
  id            TEXT        PRIMARY KEY,
  mode          TEXT        NOT NULL,
  employee_name TEXT        NOT NULL DEFAULT '',
  cari_id       TEXT,
  cari          JSONB,
  items         JSONB       DEFAULT '[]'::jsonb,
  total         NUMERIC(10,2) DEFAULT 0,
  payment       JSONB,
  fis_photo     TEXT,
  category      TEXT,
  amount        NUMERIC(10,2) DEFAULT 0,
  description   TEXT,
  date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fisler DROP CONSTRAINT IF EXISTS fisler_mode_check;
ALTER TABLE fisler ADD CONSTRAINT fisler_mode_check
  CHECK (mode IN ('satis','alis','gider'));

ALTER TABLE fisler DISABLE ROW LEVEL SECURITY;


-- ─── 8. Ürünler ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS urunler (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  unit             TEXT        NOT NULL DEFAULT 'KG',
  sell_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  current_stock    NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_stock        NUMERIC(10,2) NOT NULL DEFAULT 0,
  supplier_entries JSONB       DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE urunler ADD COLUMN IF NOT EXISTS supplier_entries JSONB DEFAULT '[]'::jsonb;

CREATE OR REPLACE TRIGGER urunler_updated_at
  BEFORE UPDATE ON urunler
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE urunler DISABLE ROW LEVEL SECURITY;


-- ─── 9. Bankalar ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bankalar (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  account_number TEXT        NOT NULL DEFAULT '',
  iban           TEXT        NOT NULL DEFAULT '',
  balance        NUMERIC(10,2) NOT NULL DEFAULT 0,
  branch         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER bankalar_updated_at
  BEFORE UPDATE ON bankalar
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE bankalar DISABLE ROW LEVEL SECURITY;


-- ─── 10. Çekler / Senetler ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cekler (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  direction                TEXT        NOT NULL CHECK (direction IN ('alinan','verilen')),
  amount                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  collected_amount         NUMERIC(10,2),
  bank_name                TEXT        NOT NULL DEFAULT '',
  check_number             TEXT,
  due_date                 TEXT        NOT NULL DEFAULT '',
  issue_date               TEXT        NOT NULL DEFAULT '',
  source_type              TEXT        DEFAULT 'musteri' CHECK (source_type IN ('musteri','toptanci')),
  source_name              TEXT        DEFAULT '',
  source_id                TEXT        DEFAULT '',
  recipient_name           TEXT,
  payment_reason           TEXT,
  related_fis_id           TEXT,
  related_fis_description  TEXT,
  photo_front              TEXT,
  photo_back               TEXT,
  status                   TEXT        NOT NULL DEFAULT 'beklemede'
                                       CHECK (status IN ('beklemede','tahsil_edildi','karsiliksiz','iade','ciro','odendi')),
  status_note              TEXT,
  endorsed_to              TEXT,
  endorse_date             TEXT,
  audit_log                JSONB       DEFAULT '[]'::jsonb,
  created_by               TEXT        NOT NULL DEFAULT '',
  updated_at_custom        TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER cekler_updated_at
  BEFORE UPDATE ON cekler
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE cekler DISABLE ROW LEVEL SECURITY;


-- ─── 11. Üretim Profilleri ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uretim_profilleri (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       TEXT        NOT NULL,
  default_tup_kg             NUMERIC(10,4) NOT NULL DEFAULT 0,
  default_paketleme_maliyeti NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_isyeri_maliyeti    NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_calisan_maliyeti   NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_tup_fiyat_kg       NUMERIC(10,4) NOT NULL DEFAULT 0,
  avg_fire_orani             NUMERIC(5,4)  NOT NULL DEFAULT 0,
  avg_cop_orani              NUMERIC(5,4)  NOT NULL DEFAULT 0,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER uretim_profilleri_updated_at
  BEFORE UPDATE ON uretim_profilleri
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE uretim_profilleri DISABLE ROW LEVEL SECURITY;


-- ─── 12. Üretim Kayıtları ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uretim_kayitlari (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id              TEXT        NOT NULL DEFAULT '',
  profile_name            TEXT        NOT NULL DEFAULT '',
  date                    TEXT        NOT NULL DEFAULT '',
  hammadde_stok_id        TEXT        DEFAULT '',
  hammadde_adi            TEXT        DEFAULT '',
  toptanci_adi            TEXT        DEFAULT '',
  tr_kodu                 TEXT        DEFAULT '',
  cig_kg                  NUMERIC(10,3) NOT NULL DEFAULT 0,
  birim_fiyat             NUMERIC(10,4) NOT NULL DEFAULT 0,
  cop_kg                  NUMERIC(10,3) NOT NULL DEFAULT 0,
  temiz_kg                NUMERIC(10,3) NOT NULL DEFAULT 0,
  cop_orani               NUMERIC(5,4)  NOT NULL DEFAULT 0,
  cikti_kg                NUMERIC(10,3) NOT NULL DEFAULT 0,
  fire_kg                 NUMERIC(10,3) NOT NULL DEFAULT 0,
  fire_orani              NUMERIC(5,4)  NOT NULL DEFAULT 0,
  kazan_sayisi            INTEGER       NOT NULL DEFAULT 0,
  pis_suresi_saat         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tup_per_kazan           NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tup_baslangic_kg        NUMERIC(10,3) NOT NULL DEFAULT 0,
  tup_bitis_kg            NUMERIC(10,3) NOT NULL DEFAULT 0,
  tup_kullanilan_kg       NUMERIC(10,3) NOT NULL DEFAULT 0,
  tup_fiyat_kg            NUMERIC(10,4) NOT NULL DEFAULT 0,
  paketleme_maliyeti      NUMERIC(10,2) NOT NULL DEFAULT 0,
  isyeri_maliyeti         NUMERIC(10,2) NOT NULL DEFAULT 0,
  calisan_maliyeti        NUMERIC(10,2) NOT NULL DEFAULT 0,
  toplam_maliyet          NUMERIC(10,2) NOT NULL DEFAULT 0,
  kg_basina_maliyet       NUMERIC(10,4) NOT NULL DEFAULT 0,
  cikti_urun_adi          TEXT          DEFAULT '',
  cikti_stok_id           TEXT          DEFAULT '',
  stok_islemleri_yapildi  BOOLEAN       NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER uretim_kayitlari_updated_at
  BEFORE UPDATE ON uretim_kayitlari
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE uretim_kayitlari DISABLE ROW LEVEL SECURITY;


-- ─── 13. Faturalar ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS faturalar (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type              TEXT        NOT NULL CHECK (type IN ('alis','satis')),
  status            TEXT        NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','iptal')),
  counter_party     TEXT        NOT NULL DEFAULT '',
  counter_party_id  TEXT,
  issued_to         TEXT        NOT NULL DEFAULT '',
  issued_by         TEXT        NOT NULL DEFAULT '',
  fatura_no         TEXT,
  date              TEXT        NOT NULL DEFAULT '',
  kdv_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  kdv_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  tevkifat_rate     NUMERIC(5,4),
  tevkifat_amount   NUMERIC(10,2),
  is_linked_to_goods BOOLEAN    NOT NULL DEFAULT false,
  linked_fis_id     TEXT,
  fatura_items      JSONB       DEFAULT '[]'::jsonb,
  photo             TEXT        NOT NULL DEFAULT '',
  description       TEXT,
  cancelled_at      TEXT,
  cancelled_by      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER faturalar_updated_at
  BEFORE UPDATE ON faturalar
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE faturalar DISABLE ROW LEVEL SECURITY;


-- ─── 14. Fatura Stok Kalemleri ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fatura_stok (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  unit              TEXT        NOT NULL DEFAULT 'KG',
  description       TEXT,
  linked_stock_id   TEXT,
  linked_stock_name TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER fatura_stok_updated_at
  BEFORE UPDATE ON fatura_stok
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE fatura_stok DISABLE ROW LEVEL SECURITY;


-- ─── 15. Tahsilatlar ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tahsilatlar (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cari_id         TEXT        NOT NULL DEFAULT '',
  cari_name       TEXT        NOT NULL DEFAULT '',
  amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  type            TEXT        NOT NULL DEFAULT 'tahsilat' CHECK (type IN ('tahsilat','odeme')),
  date            TEXT        NOT NULL DEFAULT '',
  description     TEXT        DEFAULT '',
  payment_method  TEXT        DEFAULT '',
  created_by      TEXT        DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER tahsilatlar_updated_at
  BEFORE UPDATE ON tahsilatlar
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tahsilatlar DISABLE ROW LEVEL SECURITY;


-- ─── 16. Araç KM Logları ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS arac_km_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      TEXT        NOT NULL DEFAULT '',
  vehicle_plate   TEXT        NOT NULL DEFAULT '',
  start_km        NUMERIC(10,2) NOT NULL DEFAULT 0,
  end_km          NUMERIC(10,2),
  total_km        NUMERIC(10,2),
  date            TEXT        NOT NULL DEFAULT '',
  employee        TEXT        DEFAULT '',
  description     TEXT        DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER arac_km_logs_updated_at
  BEFORE UPDATE ON arac_km_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE arac_km_logs DISABLE ROW LEVEL SECURITY;


-- ─── Bitti ───────────────────────────────────────────────────────────────────
-- Tüm tablolar oluşturuldu. Uygulama artık kullanıma hazır.
-- Her sayfa kendi tablosuna doğrudan yazar: personeller, cari_hesaplar,
-- urunler, araclar, fisler, kasa_islemleri, bankalar, cekler,
-- uretim_profilleri, uretim_kayitlari, faturalar, fatura_stok,
-- arac_shifts, tahsilatlar, arac_km_logs
-- KV Store (kv_store_daadfb0c) geriye dönük uyumluluk için korunur.
