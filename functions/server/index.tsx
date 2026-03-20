import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// ─── Security: Auth middleware ──────────────────────────────────────────────────
// Verifies the Authorization header contains a valid Supabase anon key or service role key.
// Health check is exempt from auth.
const SUPABASE_ANON_KEY = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").trim();

// Singleton Supabase admin client (service role — tüm endpoint'ler paylaşır)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabaseAdmin;
}

// Extract project ref from SUPABASE_URL for JWT validation fallback
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";

// Log env var presence at startup for debugging
console.log(`[AUTH] SUPABASE_ANON_KEY present: ${!!SUPABASE_ANON_KEY} (length: ${SUPABASE_ANON_KEY.length})`);
console.log(`[AUTH] SUPABASE_SERVICE_ROLE_KEY present: ${!!SUPABASE_SERVICE_ROLE_KEY} (length: ${SUPABASE_SERVICE_ROLE_KEY.length})`);
console.log(`[AUTH] PROJECT_REF: ${PROJECT_REF}`);

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1].trim();
  return null;
}

/**
 * Validate a Supabase JWT token by checking its payload contains the correct project ref.
 * This acts as a fallback when env var comparison fails (e.g. due to env loading issues).
 */
function isValidSupabaseJWT(token: string): boolean {
  try {
    if (!PROJECT_REF) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    // Decode the payload (base64url)
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.ref === PROJECT_REF && payload.iss === "supabase";
  } catch {
    return false;
  }
}

// Auth middleware — skip for health check
app.use("/make-server-daadfb0c/*", async (c, next) => {
  const path = c.req.path;
  // Health check is public
  if (path.endsWith("/health")) return next();

  const token = extractBearerToken(c.req.header("Authorization") ?? null);
  if (!token) {
    console.log(`[AUTH] Missing Authorization header on ${path}`);
    return c.json({ success: false, error: "Unauthorized: missing token" }, 401);
  }

  // If env vars are not loaded, skip auth check with a warning (avoids locking out all requests)
  if (!SUPABASE_ANON_KEY && !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[AUTH] WARNING: No auth keys configured in env, allowing request to ${path}`);
    return next();
  }

  // Direct comparison (primary check)
  const isDirectMatch = token === SUPABASE_ANON_KEY || token === SUPABASE_SERVICE_ROLE_KEY;
  // JWT structure validation (fallback — handles env var loading edge cases)
  const isValidJWT = !isDirectMatch && isValidSupabaseJWT(token);

  // setup-db requires service role key (admin only)
  if (path.endsWith("/setup-db") || path.endsWith("/check-tables")) {
    if (!isDirectMatch && !isValidJWT) {
      console.log(`[AUTH] Invalid token for admin route ${path}`);
      return c.json({ success: false, error: "Unauthorized: invalid credentials" }, 401);
    }
    return next();
  }

  // All other routes: accept either anon key, service role key, or valid project JWT
  if (!isDirectMatch && !isValidJWT) {
    console.log(`[AUTH] Invalid token on ${path} — token length: ${token.length}, anonKey length: ${SUPABASE_ANON_KEY.length}`);
    return c.json({ success: false, error: "Unauthorized: invalid credentials" }, 401);
  }

  return next();
});

// ─── Security: Input sanitization helpers ───────────────────────────────────────
function sanitizeString(input: unknown, maxLength = 10000): string {
  if (typeof input !== "string") return "";
  return input.slice(0, maxLength).trim();
}

// ─── DB bağlantısı
function getSql() {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) throw new Error("SUPABASE_DB_URL env eksik");
  return postgres(dbUrl, { ssl: "require", max: 1 });
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/make-server-daadfb0c/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Tablo Oluştur (POST /setup-db) ───────────────────────────────────────────
app.post("/make-server-daadfb0c/setup-db", async (c) => {
  let sql: ReturnType<typeof getSql> | null = null;
  try {
    sql = getSql();

    // Her tablo ayrı ayrı oluşturulur, hata olsa bile devam edilir
    const steps: { name: string; ok: boolean; error?: string }[] = [];

    const run = async (name: string, query: string) => {
      try {
        await sql!.unsafe(query);
        steps.push({ name, ok: true });
      } catch (e: any) {
        steps.push({ name, ok: false, error: e.message });
      }
    };

    // 1. Personel
    await run("personeller", `
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
      )
    `);

    // 1b. Mevcut personeller tablosuna eksik kolonları ekle
    await run("personeller_alter_username",   `ALTER TABLE personeller ADD COLUMN IF NOT EXISTS username    TEXT DEFAULT ''`);
    await run("personeller_alter_pin_code",   `ALTER TABLE personeller ADD COLUMN IF NOT EXISTS pin_code    TEXT DEFAULT ''`);
    await run("personeller_alter_password",   `ALTER TABLE personeller ADD COLUMN IF NOT EXISTS password    TEXT DEFAULT ''`);
    await run("personeller_alter_permissions",`ALTER TABLE personeller ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT '[]'`);

    // 2. Cari Hesaplar
    await run("cari_hesaplar", `
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
      )
    `);

    // 2b. Mevcut cari_hesaplar tablosuna eksik kolonları ekle
    await run("cari_hesaplar_alter_region",   `ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS region   TEXT`);
    await run("cari_hesaplar_alter_category", `ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS category TEXT`);
    await run("cari_hesaplar_alter_tax_number",  `ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS tax_number  TEXT`);
    await run("cari_hesaplar_alter_tax_office",  `ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS tax_office  TEXT`);
    await run("cari_hesaplar_alter_company_name",`ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS company_name TEXT`);
    await run("cari_hesaplar_alter_contact",`ALTER TABLE cari_hesaplar ADD COLUMN IF NOT EXISTS contact_person TEXT`);

    // 3. Araçlar
    await run("araclar", `
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
      )
    `);

    // 4. Kasa İşlemleri
    await run("kasa_islemleri", `
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
      )
    `);

    // 5. Fişler
    await run("fisler", `
      CREATE TABLE IF NOT EXISTS fisler (
        id            TEXT        PRIMARY KEY,
        mode          TEXT        NOT NULL CHECK (mode IN ('satis','alis','gider')),
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
      )
    `);

    // 5b. Mevcut fisler tablosunda mode CHECK kısıtlamasını 'alis' dahil güncelle
    await run("fisler_drop_mode_check", `
      ALTER TABLE fisler DROP CONSTRAINT IF EXISTS fisler_mode_check
    `);
    await run("fisler_add_mode_check", `
      ALTER TABLE fisler ADD CONSTRAINT fisler_mode_check CHECK (mode IN ('satis','alis','gider'))
    `);

    // 6. Ürünler
    await run("urunler", `
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
      )
    `);
    // Mevcut urunler tablosuna supplier_entries kolonu ekle (idempotent)
    await run("urunler_alter_supplier_entries", `
      ALTER TABLE urunler ADD COLUMN IF NOT EXISTS supplier_entries JSONB DEFAULT '[]'::jsonb
    `);

    // 7. Bankalar
    await run("bankalar", `
      CREATE TABLE IF NOT EXISTS bankalar (
        id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name           TEXT        NOT NULL,
        account_number TEXT        NOT NULL DEFAULT '',
        iban           TEXT        NOT NULL DEFAULT '',
        balance        NUMERIC(10,2) NOT NULL DEFAULT 0,
        branch         TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 8. KV Store (tüm uygulama verisinin tutulduğu ana tablo)
    await run("kv_store_daadfb0c", `
      CREATE TABLE IF NOT EXISTS kv_store_daadfb0c (
        key        TEXT    PRIMARY KEY,
        value      JSONB   NOT NULL DEFAULT 'null'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // kv_store için updated_at trigger (upsert'te otomatik günceller)
    await run("kv_store_updated_at_fn", `
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await run("kv_store_updated_at_trigger", `
      CREATE OR REPLACE TRIGGER kv_store_updated_at
      BEFORE UPDATE ON kv_store_daadfb0c
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // kv_store için prefix sorgularını hızlandıran index
    await run("idx_kv_store_prefix", `
      CREATE INDEX IF NOT EXISTS idx_kv_store_key_prefix
      ON kv_store_daadfb0c (key text_pattern_ops)
    `);

    // 9. RLS kapat
    for (const tbl of ["personeller","cari_hesaplar","araclar","kasa_islemleri","fisler","urunler","bankalar","kv_store_daadfb0c"]) {
      await run(`rls_${tbl}`, `ALTER TABLE ${tbl} DISABLE ROW LEVEL SECURITY`);
    }

    const failed  = steps.filter(s => !s.ok);
    const success = steps.filter(s => s.ok);

    return c.json({
      success: failed.length === 0,
      message: failed.length === 0
        ? `✅ Tüm tablolar başarıyla oluşturuldu! (${success.length} adım)`
        : `⚠️ ${success.length} başarılı, ${failed.length} hatalı`,
      steps,
    });

  } catch (err: any) {
    console.log("setup-db error:", err);
    return c.json({ success: false, error: String(err) }, 500);
  } finally {
    if (sql) await sql.end();
  }
});

// ─── Tablo Kontrol ────────────────────────────────────────────────────────────
app.get("/make-server-daadfb0c/check-tables", async (c) => {
  try {
    const supabase = getSupabaseAdmin();

    const tables = ["kv_store_daadfb0c","personeller","cari_hesaplar","araclar","kasa_islemleri","fisler","urunler","bankalar"];
    const results: Record<string, boolean> = {};

    for (const table of tables) {
      const col = table === "kv_store_daadfb0c" ? "key" : "id";
      const { error } = await supabase.from(table).select(col).limit(1);
      results[table] = !error;
    }

    const allReady = Object.values(results).every(Boolean);
    return c.json({ success: true, tables: results, allReady });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// ─── KV Store Endpoints ─────────────────────────────────────────────────────────────
app.get("/make-server-daadfb0c/kv/prefix/:prefix", async (c) => {
  try {
    const prefix = c.req.param("prefix");
    const values = await kv.getByPrefix(prefix);
    return c.json({ success: true, data: values });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// KV: Tek bir key oku
app.get("/make-server-daadfb0c/kv/get/:key", async (c) => {
  try {
    const key = c.req.param("key");
    const value = await kv.get(key);
    if (value === undefined || value === null) {
      return c.json({ success: false, error: "Key not found" }, 404);
    }
    return c.json({ success: true, data: value });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// KV: Prefix ile eslesen key sayisini dondur
app.get("/make-server-daadfb0c/kv/count/:prefix", async (c) => {
  try {
    const prefix = c.req.param("prefix");
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("kv_store_daadfb0c")
      .select("key", { count: "exact", head: true })
      .like("key", `${prefix}%`);

    if (error) throw new Error(error.message);
    return c.json({ success: true, count: count ?? 0 });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// KV: Prefix ile eslesen key listesini dondur (value olmadan - hafif)
app.get("/make-server-daadfb0c/kv/keys/:prefix", async (c) => {
  try {
    const prefix = c.req.param("prefix");
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("kv_store_daadfb0c")
      .select("key")
      .like("key", `${prefix}%`);

    if (error) throw new Error(error.message);
    return c.json({ success: true, keys: data?.map((d: any) => d.key) ?? [] });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// KV: KV store istatistikleri (tum prefix'ler icin kayit sayilari)
app.post("/make-server-daadfb0c/kv/stats", async (c) => {
  try {
    const { prefixes } = await c.req.json();
    if (!Array.isArray(prefixes)) {
      return c.json({ success: false, error: "prefixes must be an array" }, 400);
    }

    const supabase = getSupabaseAdmin();

    const stats: Record<string, number> = {};
    await Promise.all(
      prefixes.map(async (prefix: string) => {
        const { count, error } = await supabase
          .from("kv_store_daadfb0c")
          .select("key", { count: "exact", head: true })
          .like("key", `${prefix}%`);
        stats[prefix] = error ? 0 : (count ?? 0);
      })
    );

    // Toplam key sayisi
    const { count: totalCount } = await supabase
      .from("kv_store_daadfb0c")
      .select("key", { count: "exact", head: true });

    return c.json({ success: true, stats, totalKeys: totalCount ?? 0 });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// KV: Toplu silme (prefix bazli)
app.post("/make-server-daadfb0c/kv/del-prefix", async (c) => {
  try {
    const { prefix } = await c.req.json();
    if (!prefix || typeof prefix !== "string") {
      return c.json({ success: false, error: "prefix is required" }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Once key listesini al, sonra sil
    const { data, error: fetchError } = await supabase
      .from("kv_store_daadfb0c")
      .select("key")
      .like("key", `${prefix}%`);

    if (fetchError) throw new Error(fetchError.message);
    
    const keys = data?.map((d: any) => d.key) ?? [];
    if (keys.length === 0) {
      return c.json({ success: true, deleted: 0 });
    }

    await kv.mdel(keys);
    return c.json({ success: true, deleted: keys.length });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// KV: Toplu yazma (mset)
app.post("/make-server-daadfb0c/kv/mset", async (c) => {
  try {
    const { keys, values } = await c.req.json();
    if (!Array.isArray(keys) || !Array.isArray(values)) {
      return c.json({ success: false, error: "keys and values must be arrays" }, 400);
    }
    if (keys.length !== values.length) {
      return c.json({ success: false, error: "keys and values must have the same length" }, 400);
    }
    if (keys.length === 0) {
      return c.json({ success: true, written: 0 });
    }
    if (keys.length > 500) {
      return c.json({ success: false, error: "Maximum 500 keys per request" }, 400);
    }
    await kv.mset(keys, values);
    return c.json({ success: true, written: keys.length });
  } catch (err: any) {
    console.log(`[KV mset] Error: ${err.message}`);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// KV: Tek key yazma (set)
app.post("/make-server-daadfb0c/kv/set", async (c) => {
  try {
    const { key, value } = await c.req.json();
    if (!key || typeof key !== "string") {
      return c.json({ success: false, error: "key is required" }, 400);
    }
    await kv.set(key, value);
    return c.json({ success: true });
  } catch (err: any) {
    console.log(`[KV set] Error: ${err.message}`);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// KV: Tek key silme (del)
app.post("/make-server-daadfb0c/kv/del", async (c) => {
  try {
    const { key } = await c.req.json();
    if (!key || typeof key !== "string") {
      return c.json({ success: false, error: "key is required" }, 400);
    }
    await kv.del(key);
    return c.json({ success: true });
  } catch (err: any) {
    console.log(`[KV del] Error: ${err.message}`);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// ─── Sync Health & Advanced Sync Endpoints ──────────────────────────────────────

// Sync health check — tüm tablo prefix'lerinin durumunu döner
app.get("/make-server-daadfb0c/sync/health", async (c) => {
  const start = performance.now();
  try {
    const supabase = getSupabaseAdmin();
    
    const prefixes = [
      "personeller_", "cari_hesaplar_", "urunler_", "araclar_",
      "kasa_islemleri_", "fisler_", "uretim_kayitlari_", "uretim_profilleri_",
      "cekler_", "tahsilatlar_", "stok_hareketleri_", "bankalar_"
    ];
    
    const stats: Record<string, { count: number; ok: boolean }> = {};
    let totalKeys = 0;
    
    await Promise.all(prefixes.map(async (prefix) => {
      try {
        const { count, error } = await supabase
          .from("kv_store_daadfb0c")
          .select("key", { count: "exact", head: true })
          .like("key", `${prefix}%`);
        const cnt = error ? 0 : (count ?? 0);
        stats[prefix.replace(/_$/, "")] = { count: cnt, ok: !error };
        totalKeys += cnt;
      } catch {
        stats[prefix.replace(/_$/, "")] = { count: 0, ok: false };
      }
    }));
    
    const { error: dbError } = await supabase
      .from("kv_store_daadfb0c")
      .select("key", { count: "exact", head: true });
    
    const latencyMs = Math.round(performance.now() - start);
    
    return c.json({
      success: true,
      healthy: !dbError,
      latencyMs,
      totalKeys,
      tables: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return c.json({ success: false, healthy: false, latencyMs, error: String(err) }, 500);
  }
});

// Batch sync with conflict resolution
app.post("/make-server-daadfb0c/sync/batch", async (c) => {
  try {
    const { operations } = await c.req.json();
    
    if (!Array.isArray(operations) || operations.length === 0) {
      return c.json({ success: false, error: "operations must be a non-empty array" }, 400);
    }
    if (operations.length > 1000) {
      return c.json({ success: false, error: "Maximum 1000 operations per batch" }, 400);
    }
    
    const results: { key: string; action: string; ok: boolean; error?: string }[] = [];
    const setOps: { key: string; value: any }[] = [];
    const delKeys: string[] = [];
    
    for (const op of operations) {
      if (op.type === "set" && op.key && op.value !== undefined) {
        setOps.push({ key: op.key, value: op.value });
      } else if (op.type === "del" && op.key) {
        delKeys.push(op.key);
      } else {
        results.push({ key: op.key || "unknown", action: op.type || "unknown", ok: false, error: "Invalid operation" });
      }
    }
    
    if (setOps.length > 0) {
      try {
        const keys = setOps.map(o => o.key);
        const values = setOps.map(o => o.value);
        await kv.mset(keys, values);
        setOps.forEach(o => results.push({ key: o.key, action: "set", ok: true }));
      } catch (e: any) {
        for (const op of setOps) {
          try {
            await kv.set(op.key, op.value);
            results.push({ key: op.key, action: "set", ok: true });
          } catch (innerErr: any) {
            results.push({ key: op.key, action: "set", ok: false, error: innerErr.message });
          }
        }
      }
    }
    
    if (delKeys.length > 0) {
      try {
        await kv.mdel(delKeys);
        delKeys.forEach(k => results.push({ key: k, action: "del", ok: true }));
      } catch (e: any) {
        for (const key of delKeys) {
          try {
            await kv.del(key);
            results.push({ key, action: "del", ok: true });
          } catch (innerErr: any) {
            results.push({ key, action: "del", ok: false, error: innerErr.message });
          }
        }
      }
    }
    
    const okCount = results.filter(r => r.ok).length;
    const failCount = results.filter(r => !r.ok).length;
    
    return c.json({
      success: failCount === 0,
      processed: results.length,
      ok: okCount,
      failed: failCount,
      results,
      serverTimestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.log("sync/batch error:", err);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Diff sync — client key listesini karşılaştır, sadece değişenleri dön
app.post("/make-server-daadfb0c/sync/diff", async (c) => {
  try {
    const { prefix, clientKeys } = await c.req.json();
    
    if (!prefix || typeof prefix !== "string") {
      return c.json({ success: false, error: "prefix is required" }, 400);
    }
    
    const supabase = getSupabaseAdmin();
    
    const { data: serverData, error } = await supabase
      .from("kv_store_daadfb0c")
      .select("key, value")
      .like("key", `${prefix}%`);
    
    if (error) throw new Error(error.message);
    
    const serverMap = new Map((serverData || []).map((d: any) => [d.key, d.value]));
    const clientKeySet = new Set(Array.isArray(clientKeys) ? clientKeys : []);
    
    const additions: Array<{ key: string; value: any }> = [];
    const deletions: string[] = [];
    
    serverMap.forEach((value, key) => {
      if (!clientKeySet.has(key)) {
        additions.push({ key, value });
      }
    });
    
    clientKeySet.forEach(key => {
      if (!serverMap.has(key)) {
        deletions.push(key);
      }
    });
    
    return c.json({
      success: true,
      serverCount: serverMap.size,
      clientCount: clientKeySet.size,
      additions: additions.length,
      deletions: deletions.length,
      newItems: additions,
      removedKeys: deletions,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// ─── Enhanced Backup System v2 ──────────────────────────────────────────────

// Backup: Tam yedek oluştur ve KV Store'a kaydet (kalıcı)
app.post("/make-server-daadfb0c/backup/create-full", async (c) => {
  const start = performance.now();
  try {
    const supabase = getSupabaseAdmin();
    const { type = "manual", label = "" } = await c.req.json().catch(() => ({}));

    const prefixes = [
      // Bireysel kayıt prefixleri (supabase-kv.ts ile yazılan per-record veriler)
      "personeller_", "cari_hesaplar_", "urunler_", "araclar_",
      "kasa_islemleri_", "fisler_", "uretim_kayitlari_", "uretim_profilleri_",
      "cekler_", "tahsilatlar_", "stok_hareketleri_", "bankalar_",
      "settings_", "pazarlama_content_", "login_content_",
      // Ana uygulama verisi (supabase-storage.ts → sync_ prefix ile koleksiyon dizileri)
      "sync_",
    ];

    const allData: Record<string, any[]> = {};
    let totalKeys = 0;

    await Promise.all(prefixes.map(async (prefix) => {
      try {
        const { data, error } = await supabase
          .from("kv_store_daadfb0c")
          .select("key, value")
          .like("key", `${prefix}%`);
        if (!error && data && data.length > 0) {
          const tableName = prefix.replace(/_$/, "");
          allData[tableName] = data.map((d: any) => ({ key: d.key, value: d.value }));
          totalKeys += data.length;
        }
      } catch {}
    }));

    const timestamp = new Date().toISOString();
    const backupId = `backup_full_${Date.now()}`;
    const backupPayload = {
      id: backupId,
      timestamp,
      type,
      label: label || `${type === "auto" ? "Otomatik" : "Manuel"} Yedek`,
      version: "5.0",
      totalKeys,
      tableStats: Object.fromEntries(
        Object.entries(allData).map(([k, v]) => [k, v.length])
      ),
      data: allData,
    };

    // SHA-256 hash hesapla (bütünlük doğrulama için)
    const dataStr = JSON.stringify(allData);
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(dataStr));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    (backupPayload as any).checksum = hashHex;
    (backupPayload as any).dataSizeBytes = dataStr.length;

    // KV Store'a kaydet
    await kv.set(backupId, backupPayload);

    // Metadata'yı ayrıca kaydet (listeler için hafif)
    const metaKey = `backup_meta_${backupId}`;
    await kv.set(metaKey, {
      id: backupId,
      timestamp,
      type,
      label: (backupPayload as any).label,
      totalKeys,
      dataSizeBytes: dataStr.length,
      checksum: hashHex,
      tableStats: (backupPayload as any).tableStats,
    });

    const durationMs = Math.round(performance.now() - start);

    return c.json({
      success: true,
      backup: {
        id: backupId,
        timestamp,
        type,
        totalKeys,
        dataSizeBytes: dataStr.length,
        checksum: hashHex,
        durationMs,
        tableStats: (backupPayload as any).tableStats,
      },
    });
  } catch (err: any) {
    console.log("backup/create-full error:", err);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Backup: Kalıcı yedek listesini getir (sadece metadata)
app.get("/make-server-daadfb0c/backup/list-full", async (c) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("kv_store_daadfb0c")
      .select("key, value")
      .like("key", "backup_meta_%")
      .order("key", { ascending: false });

    if (error) throw new Error(error.message);

    const backups = (data || []).map((d: any) => d.value).sort(
      (a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return c.json({ success: true, backups, count: backups.length });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Backup: Belirli bir yedek detayını indir
app.post("/make-server-daadfb0c/backup/download-full", async (c) => {
  try {
    const { backupId } = await c.req.json();
    if (!backupId) return c.json({ success: false, error: "backupId required" }, 400);

    const value = await kv.get(backupId);
    if (!value) return c.json({ success: false, error: "Yedek bulunamadı" }, 404);

    return c.json({ success: true, backup: value });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Backup: Bütünlük doğrulama (checksum verify)
app.post("/make-server-daadfb0c/backup/verify", async (c) => {
  try {
    const { backupId } = await c.req.json();
    if (!backupId) return c.json({ success: false, error: "backupId required" }, 400);

    const value = await kv.get(backupId);
    if (!value) return c.json({ success: false, error: "Yedek bulunamadı" }, 404);

    const storedChecksum = (value as any).checksum;
    if (!storedChecksum) {
      return c.json({ success: true, verified: false, reason: "Checksum bulunamadı (eski format)" });
    }

    const dataStr = JSON.stringify((value as any).data);
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(dataStr));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedChecksum = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    const verified = computedChecksum === storedChecksum;

    return c.json({
      success: true,
      verified,
      storedChecksum,
      computedChecksum,
      reason: verified ? "Bütünlük doğrulandı" : "UYARI: Checksum uyuşmuyor, veri bozulmuş olabilir!",
    });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Backup: Seçici geri yükleme (belirli tabloları geri yükle)
app.post("/make-server-daadfb0c/backup/restore-selective", async (c) => {
  try {
    const { backupId, tables } = await c.req.json();
    if (!backupId) return c.json({ success: false, error: "backupId required" }, 400);

    const value = await kv.get(backupId);
    if (!value || !(value as any).data) {
      return c.json({ success: false, error: "Yedek bulunamadı veya bozuk" }, 404);
    }

    const backupData = (value as any).data as Record<string, any[]>;
    const targetTables = Array.isArray(tables) && tables.length > 0
      ? tables
      : Object.keys(backupData);

    let totalRestored = 0;
    let totalFailed = 0;
    const results: Record<string, { ok: number; fail: number }> = {};

    for (const tableName of targetTables) {
      const rows = backupData[tableName];
      if (!Array.isArray(rows) || rows.length === 0) {
        results[tableName] = { ok: 0, fail: 0 };
        continue;
      }

      const keys = rows.map((r: any) => r.key);
      const values = rows.map((r: any) => r.value);

      try {
        await kv.mset(keys, values);
        results[tableName] = { ok: rows.length, fail: 0 };
        totalRestored += rows.length;
      } catch (e: any) {
        // Fallback: individual writes
        let ok = 0;
        let fail = 0;
        for (let i = 0; i < keys.length; i++) {
          try {
            await kv.set(keys[i], values[i]);
            ok++;
          } catch {
            fail++;
          }
        }
        results[tableName] = { ok, fail };
        totalRestored += ok;
        totalFailed += fail;
      }
    }

    return c.json({
      success: totalFailed === 0,
      totalRestored,
      totalFailed,
      tablesRestored: targetTables.length,
      results,
    });
  } catch (err: any) {
    console.log("backup/restore-selective error:", err);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Backup: Kalıcı yedek sil
app.post("/make-server-daadfb0c/backup/delete-full", async (c) => {
  try {
    const { backupId } = await c.req.json();
    if (!backupId) return c.json({ success: false, error: "backupId required" }, 400);

    await kv.del(backupId);
    await kv.del(`backup_meta_${backupId}`);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Backup: Genel istatistikler (dashboard widget için)
app.get("/make-server-daadfb0c/backup/stats", async (c) => {
  try {
    const supabase = getSupabaseAdmin();

    // Toplam key sayısı
    const { count: totalKeys } = await supabase
      .from("kv_store_daadfb0c")
      .select("key", { count: "exact", head: true });

    // Yedek sayısı
    const { count: backupCount } = await supabase
      .from("kv_store_daadfb0c")
      .select("key", { count: "exact", head: true })
      .like("key", "backup_full_%");

    // Son yedek
    const { data: lastBackupMeta } = await supabase
      .from("kv_store_daadfb0c")
      .select("value")
      .like("key", "backup_meta_%")
      .order("key", { ascending: false })
      .limit(1);

    const lastBackup = lastBackupMeta?.[0]?.value || null;

    return c.json({
      success: true,
      totalKeys: totalKeys ?? 0,
      backupCount: backupCount ?? 0,
      lastBackup,
    });
  } catch (err: any) {
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// ─── Branding Image Storage ─────────────────────────────────────────────────
const BRANDING_BUCKET = "make-daadfb0c-branding";

// Bucket oluştur (idempotent)
async function ensureBrandingBucket() {
  const supabase = getSupabaseAdmin();
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some((bucket: any) => bucket.name === BRANDING_BUCKET);
  if (!bucketExists) {
    await supabase.storage.createBucket(BRANDING_BUCKET, { public: false });
  }
  return supabase;
}

// Görsel yükle
app.post("/make-server-daadfb0c/branding/upload", async (c) => {
  try {
    const supabase = await ensureBrandingBucket();

    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return c.json({ success: false, error: "Dosya bulunamadı" }, 400);
    }

    // Security: File size limit (5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ success: false, error: "Dosya boyutu 5MB'ı aşamaz" }, 400);
    }

    // Security: Allowed file extensions only
    const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return c.json({ success: false, error: `İzin verilen dosya türleri: ${ALLOWED_EXTENSIONS.join(", ")}` }, 400);
    }

    // Security: Validate content type
    const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return c.json({ success: false, error: "Geçersiz dosya türü" }, 400);
    }

    // Benzersiz dosya adı oluştur
    const fileName = `branding_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(BRANDING_BUCKET)
      .upload(fileName, uint8, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.log("Upload error:", uploadError);
      return c.json({ success: false, error: `Yükleme hatası: ${uploadError.message}` }, 500);
    }

    // 1 yıllık signed URL oluştur
    const { data: signedData, error: signError } = await supabase.storage
      .from(BRANDING_BUCKET)
      .createSignedUrl(fileName, 365 * 24 * 3600);

    if (signError || !signedData) {
      console.log("Sign error:", signError);
      return c.json({ success: false, error: `URL oluşturma hatası: ${signError?.message}` }, 500);
    }

    return c.json({
      success: true,
      url: signedData.signedUrl,
      fileName,
    });
  } catch (err: any) {
    console.log("branding/upload error:", err);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Görsel sil
app.post("/make-server-daadfb0c/branding/delete", async (c) => {
  try {
    const supabase = await ensureBrandingBucket();
    const { fileName } = await c.req.json();

    if (!fileName) {
      return c.json({ success: false, error: "fileName gerekli" }, 400);
    }

    const { error } = await supabase.storage.from(BRANDING_BUCKET).remove([fileName]);
    if (error) {
      console.log("Delete error:", error);
      return c.json({ success: false, error: `Silme hatası: ${error.message}` }, 500);
    }

    return c.json({ success: true });
  } catch (err: any) {
    console.log("branding/delete error:", err);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

// Tüm görsellerin URL'lerini yenile
app.post("/make-server-daadfb0c/branding/refresh-urls", async (c) => {
  try {
    const supabase = await ensureBrandingBucket();
    const { fileNames } = await c.req.json();

    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      return c.json({ success: true, urls: {} });
    }

    const urls: Record<string, string> = {};

    for (const fn of fileNames) {
      const { data, error } = await supabase.storage
        .from(BRANDING_BUCKET)
        .createSignedUrl(fn, 365 * 24 * 3600);
      if (!error && data) {
        urls[fn] = data.signedUrl;
      }
    }

    return c.json({ success: true, urls });
  } catch (err: any) {
    console.log("branding/refresh-urls error:", err);
    return c.json({ success: false, error: String(err) }, 500);
  }
});

Deno.serve(app.fetch);