-- 003_shared_debts.sql — Debiti cross-account (sincronizzazione "Da saldare a X")
-- Pattern: CREATE TABLE IF NOT EXISTS + RLS creditor/debtor + NOTIFY pgrst
-- Nessuna FK: le persone appartengono ad account diversi (people.id e' locale per utente).

CREATE TABLE IF NOT EXISTS shared_debts (
    "id" BIGINT PRIMARY KEY,
    "creditor_user_id" TEXT NOT NULL,
    "debtor_user_id" TEXT NOT NULL,
    "creditor_name" TEXT DEFAULT '',
    "debtor_name" TEXT DEFAULT '',
    "amount" NUMERIC DEFAULT 0,
    "description" TEXT DEFAULT '',
    "category" TEXT DEFAULT '',
    "expense_id" TEXT DEFAULT '',
    "status" TEXT DEFAULT 'open',
    "created_at" BIGINT
);

ALTER TABLE shared_debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_debts_select" ON shared_debts;
CREATE POLICY "shared_debts_select" ON shared_debts
    FOR SELECT
    USING (creditor_user_id = auth.uid()::text OR debtor_user_id = auth.uid()::text);

DROP POLICY IF EXISTS "shared_debts_insert" ON shared_debts;
CREATE POLICY "shared_debts_insert" ON shared_debts
    FOR INSERT
    WITH CHECK (creditor_user_id = auth.uid()::text);

DROP POLICY IF EXISTS "shared_debts_update" ON shared_debts;
CREATE POLICY "shared_debts_update" ON shared_debts
    FOR UPDATE
    USING (creditor_user_id = auth.uid()::text OR debtor_user_id = auth.uid()::text);

NOTIFY pgrst, 'reload schema';
