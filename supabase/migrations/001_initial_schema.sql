-- ============================================================
-- MERT.4 ERP – İlk Veritabanı Şeması
-- Bu dosyayı Supabase SQL Editor'da çalıştırın:
--   https://supabase.com/dashboard/project/pmbpawntaislortnjzmq/sql/new
--
-- Ya da uygulama otomatik olarak /setup-db endpoint'ini çağırarak
-- bu tabloları oluşturur (Edge Function üzerinden).
-- ============================================================

-- ─── 1. Ana KV Deposu ────────────────────────────────────────────────────────
-- Tüm uygulama verisi (fisler, cari, stok vb.) bu tabloda saklanır.
-- Key formatı: sync_<koleksiyon>  (örn: sync_fisler, sync_cari_data)

CREATE TABLE IF NOT EXISTS kv_store_daadfb0c (
  key        TEXT    PRIMARY KEY,
  value      JSONB   NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at otomatik güncelleme fonksiyonu
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER kv_store_updated_at
  BEFORE UPDATE ON kv_store_daadfb0c
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- LIKE sorguları için prefix indexi (sync_% gibi)
CREATE INDEX IF NOT EXISTS idx_kv_store_key_prefix
  ON kv_store_daadfb0c (key text_pattern_ops);

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

-- Eksik kolonlar için idempotent ALTER
ALTER TABLE personeller ADD COLUMN IF NOT EXISTS username    TEXT DEFAULT '';
ALTER TABLE personeller ADD COLUMN IF NOT EXISTS pin_code    TEXT DEFAULT '';
ALTER TABLE personeller ADD COLUMN IF NOT EXISTS password    TEXT DEFAULT '';
ALTER TABLE personeller ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT '[]';

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

ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS region        TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS category      TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS tax_number    TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS tax_office    TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS company_name  TEXT;
ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS contact_person TEXT;

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

ALTER TABLE araclar DISABLE ROW LEVEL SECURITY;


-- ─── 5. Kasa İşlemleri ───────────────────────────────────────────────────────

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

ALTER TABLE kasa_islemleri DISABLE ROW LEVEL SECURITY;


-- ─── 6. Fişler ───────────────────────────────────────────────────────────────

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

-- mode CHECK kısıtlaması güncelle (alis dahil)
ALTER TABLE fisler DROP CONSTRAINT IF EXISTS fisler_mode_check;
ALTER TABLE fisler ADD CONSTRAINT fisler_mode_check
  CHECK (mode IN ('satis','alis','gider'));

ALTER TABLE fisler DISABLE ROW LEVEL SECURITY;


-- ─── 7. Ürünler ──────────────────────────────────────────────────────────────

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

ALTER TABLE urunler DISABLE ROW LEVEL SECURITY;


-- ─── 8. Bankalar ─────────────────────────────────────────────────────────────

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

ALTER TABLE bankalar DISABLE ROW LEVEL SECURITY;


-- ─── Bitti ───────────────────────────────────────────────────────────────────
-- Tüm tablolar oluşturuldu. Uygulama artık kullanıma hazır.
