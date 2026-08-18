-- Dedupe spese materializzate da syncSharedDebts
-- La colonna debtId mancava: senza, il dedupe falliva e ogni apertura
-- pagina ricreava le spese "Da saldare a X" (badge Spese Previste in crescita).

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "debtId" TEXT;

NOTIFY pgrst, 'reload schema';