-- Coda di analisi scontrini (foto -> Vision IA in background -> conferma utente).
-- Pattern MEMORY: user_id è TEXT, auth.uid() è UUID -> confronti SEMPRE con ::text.
-- La foto vive nel bucket privato 'receipts' sotto receipts/<user_id>/<jobId>.jpg
-- (nessuna colonna binaria in tabella; l'immagine si può eliminare a conferma avvenuta).

CREATE TABLE IF NOT EXISTS receipt_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expense_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  importo DOUBLE PRECISION,
  negozio TEXT,
  data_scontrino TEXT,
  categoria_suggerita TEXT,
  error TEXT,
  created_at BIGINT,
  updated_at BIGINT
);

ALTER TABLE receipt_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipt_jobs_user_isolation" ON receipt_jobs;
CREATE POLICY "receipt_jobs_user_isolation" ON receipt_jobs
  FOR ALL USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text);

-- Bucket privato per le foto scontrino
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts_own_insert" ON storage.objects;
CREATE POLICY "receipts_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "receipts_own_select" ON storage.objects;
CREATE POLICY "receipts_own_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "receipts_own_update" ON storage.objects;
CREATE POLICY "receipts_own_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "receipts_own_delete" ON storage.objects;
CREATE POLICY "receipts_own_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

NOTIFY pgrst, 'reload schema';