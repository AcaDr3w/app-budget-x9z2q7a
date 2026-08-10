-- =============================================================
-- Migrazione 2026-08-10: Sync completo su Supabase
-- Esegui questo script nell'SQL Editor della dashboard Supabase.
-- Idempotente: puoi rieseguirlo senza danni.
-- =============================================================

-- 1) iaNotes mancante nella tabella months
--    Tipo: TEXT (il codice JS salva il valore stringa del textarea "Note I.A.")
ALTER TABLE months ADD COLUMN IF NOT EXISTS "iaNotes" TEXT;

-- 2) settings: preferenze {key, value} per utente
--    (i backup storici con name/id vengono normalizzati su key dal JS)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  user_id TEXT
);

-- 3) savings_goals: obiettivi di risparmio (chiave = nome obiettivo)
CREATE TABLE IF NOT EXISTS savings_goals (
  name TEXT PRIMARY KEY,
  "targetAmount" NUMERIC,
  "importo_accumulato" NUMERIC,
  "createdAt" BIGINT,
  user_id TEXT
);

-- 4) sync_state: contatore versione per la sincronizzazione
CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY,
  counter BIGINT,
  "deviceId" TEXT,
  "lastUpdated" BIGINT,
  user_id TEXT
);

-- NOTA RLS: se le tabelle esistenti (months, expenses, ...) usano Row Level Security,
-- creare le stesse policy anche per le 3 nuove tabelle, es.:
--   ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "users_own_settings" ON settings FOR ALL
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- (e analoghe per savings_goals e sync_state)
