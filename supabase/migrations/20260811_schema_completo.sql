-- =============================================================
-- Migrazione 2026-08-11: Schema completo allineato al frontend
-- Esegui questo script nell'SQL Editor della dashboard Supabase.
-- Idempotente: rieseguibile senza danni.
--
-- Risolve i 400 "Could not find the 'X' column ... in the schema cache":
--   months.totalActual, sync_state.deviceId, ecc.
-- La migrazione precedente usava CREATE TABLE IF NOT EXISTS, che salta
-- le tabelle gia' esistenti senza aggiungere le colonne mancanti:
-- qui ogni colonna viene aggiunta con ADD COLUMN IF NOT EXISTS.
-- =============================================================

-- 1) months ------------------------------------------------------
ALTER TABLE months ADD COLUMN IF NOT EXISTS "month_id" TEXT;
ALTER TABLE months ADD COLUMN IF NOT EXISTS "totalIncome" NUMERIC DEFAULT 0;
ALTER TABLE months ADD COLUMN IF NOT EXISTS "totalPlanned" NUMERIC DEFAULT 0;
ALTER TABLE months ADD COLUMN IF NOT EXISTS "totalActual" NUMERIC DEFAULT 0;
ALTER TABLE months ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE months ADD COLUMN IF NOT EXISTS "iaNotes" TEXT;
ALTER TABLE months ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- 2) income ------------------------------------------------------
ALTER TABLE income ADD COLUMN IF NOT EXISTS "id" BIGINT;
ALTER TABLE income ADD COLUMN IF NOT EXISTS "month" TEXT;
ALTER TABLE income ADD COLUMN IF NOT EXISTS "desc" TEXT;
ALTER TABLE income ADD COLUMN IF NOT EXISTS "amount" NUMERIC DEFAULT 0;
ALTER TABLE income ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- 3) expenses ----------------------------------------------------
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "id" BIGINT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "month" TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "date" TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "desc" TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "planned" NUMERIC DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "actual" NUMERIC DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "sharedPercentage" NUMERIC DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- 4) categories --------------------------------------------------
ALTER TABLE categories ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS "macro" TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS "icon" TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- 5) annual_deadlines --------------------------------------------
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "id" BIGINT;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "month" TEXT;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "day" TEXT;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "desc" TEXT;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "amount" NUMERIC DEFAULT 0;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN DEFAULT false;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- 6) savings_goals (fallback create, se mai non esistesse) -------
CREATE TABLE IF NOT EXISTS savings_goals (
  name TEXT PRIMARY KEY,
  "targetAmount" NUMERIC DEFAULT 0,
  "importo_accumulato" NUMERIC DEFAULT 0,
  "createdAt" BIGINT,
  user_id TEXT
);
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS "targetAmount" NUMERIC DEFAULT 0;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS "importo_accumulato" NUMERIC DEFAULT 0;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS "createdAt" BIGINT;
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- 7) settings (fallback create, se mai non esistesse) ------------
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  user_id TEXT
);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "value" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- 8) sync_state (fallback create, se mai non esistesse) ----------
CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY,
  counter BIGINT,
  "deviceId" TEXT,
  "lastUpdated" BIGINT,
  user_id TEXT
);
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS "counter" BIGINT;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS "lastUpdated" BIGINT;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- 9) Chiavi primarie (solo se mancanti e dati non duplicati) -----
-- months: PK su month_id se assente
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'months'::regclass AND contype = 'p') THEN
    ALTER TABLE months ADD PRIMARY KEY ("month_id");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- income / expenses / annual_deadlines: PK su id se assente
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'income'::regclass AND contype = 'p') THEN
    ALTER TABLE income ADD PRIMARY KEY ("id");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'expenses'::regclass AND contype = 'p') THEN
    ALTER TABLE expenses ADD PRIMARY KEY ("id");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'annual_deadlines'::regclass AND contype = 'p') THEN
    ALTER TABLE annual_deadlines ADD PRIMARY KEY ("id");
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 10) Cache schema PostgREST: forza il reload delle colonne -------
NOTIFY pgrst, 'reload schema';

-- NOTA RLS: se le tabelle esistenti usano Row Level Security,
-- creare le stesse policy anche per le colonne/tabelle nuove, es.:
--   ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "users_own_settings" ON settings FOR ALL
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- (e analoghe per savings_goals e sync_state)