-- =====================================================================
-- Migration 006: Fix RLS Recursion + Missing Columns for Shared Expenses
-- Risolve: 500 Internal Server Error su shared_expenses/shared_expense_participants
--          400 Bad Request su income/annual_deadlines (colonne mancanti)
-- =====================================================================

-- -----------------------------------------------------------------
-- 1. Funzioni SECURITY DEFINER per spezzare la ricorsione RLS
--    (Analoghe alla funzione is_group_member usata in 005)
-- -----------------------------------------------------------------

-- is_shared_expense_creator: verifica se l'utente corrente ha creato la spesa condivisa
CREATE OR REPLACE FUNCTION is_shared_expense_creator(se_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM shared_expenses
        WHERE id = se_id AND created_by::text = auth.uid()::text
    )
$$;
REVOKE ALL ON FUNCTION is_shared_expense_creator(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_shared_expense_creator(BIGINT) TO authenticated;

-- is_shared_expense_participant_user: verifica partecipante basandosi su people.user_id
CREATE OR REPLACE FUNCTION is_shared_expense_participant_user(se_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM shared_expense_participants sep
        JOIN people p ON p.id = sep.person_id
        WHERE sep.shared_expense_id = se_id AND p.user_id = auth.uid()::text
    )
$$;
REVOKE ALL ON FUNCTION is_shared_expense_participant_user(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_shared_expense_participant_user(BIGINT) TO authenticated;

-- is_shared_expense_group_member: verifica partecipazione tramite group_members
CREATE OR REPLACE FUNCTION is_shared_expense_group_member(se_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM shared_expenses se
        JOIN group_members gm ON gm."groupId" = se.group_id
        WHERE se.id = se_id AND gm.user_id = auth.uid()::text
    )
$$;
REVOKE ALL ON FUNCTION is_shared_expense_group_member(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_shared_expense_group_member(BIGINT) TO authenticated;

-- -----------------------------------------------------------------
-- 2. Aggiornamento Policy RLS per shared_expenses
--    (Spezzano il ciclo: shared_expenses_select non interroga più
--     shared_expense_participants direttamente)
-- -----------------------------------------------------------------

DROP POLICY IF EXISTS "shared_expenses_select" ON shared_expenses;
CREATE POLICY "shared_expenses_select" ON shared_expenses
FOR SELECT USING (
    created_by::text = auth.uid()::text
    OR is_group_member(group_id)
    OR is_shared_expense_participant_user(id)
);

DROP POLICY IF EXISTS "shared_expenses_insert" ON shared_expenses;
CREATE POLICY "shared_expenses_insert" ON shared_expenses
FOR INSERT WITH CHECK (
    created_by::text = auth.uid()::text
    OR created_by IS NULL
);

DROP POLICY IF EXISTS "shared_expenses_update" ON shared_expenses;
CREATE POLICY "shared_expenses_update" ON shared_expenses
FOR UPDATE USING (created_by::text = auth.uid()::text);

DROP POLICY IF EXISTS "shared_expenses_delete" ON shared_expenses;
CREATE POLICY "shared_expenses_delete" ON shared_expenses
FOR DELETE USING (created_by::text = auth.uid()::text);

-- -----------------------------------------------------------------
-- 3. Aggiornamento Policy RLS per shared_expense_participants
-- -----------------------------------------------------------------

DROP POLICY IF EXISTS "shared_expense_participants_select" ON shared_expense_participants;
CREATE POLICY "shared_expense_participants_select" ON shared_expense_participants
FOR SELECT USING (
    is_shared_expense_creator(shared_expense_id)
    OR is_shared_expense_group_member(shared_expense_id)
    OR person_id IN (SELECT id FROM people WHERE user_id = auth.uid()::text)
);

DROP POLICY IF EXISTS "shared_expense_participants_insert" ON shared_expense_participants;
CREATE POLICY "shared_expense_participants_insert" ON shared_expense_participants
FOR INSERT WITH CHECK (
    is_shared_expense_creator(shared_expense_id)
    OR is_shared_expense_group_member(shared_expense_id)
);

DROP POLICY IF EXISTS "shared_expense_participants_update" ON shared_expense_participants;
CREATE POLICY "shared_expense_participants_update" ON shared_expense_participants
FOR UPDATE USING (
    is_shared_expense_creator(shared_expense_id)
    OR is_shared_expense_group_member(shared_expense_id)
);

DROP POLICY IF EXISTS "shared_expense_participants_delete" ON shared_expense_participants;
CREATE POLICY "shared_expense_participants_delete" ON shared_expense_participants
FOR DELETE USING (
    is_shared_expense_creator(shared_expense_id)
);

-- -----------------------------------------------------------------
-- 4. Aggiunta colonne mancanti al database (se non presenti)
-- -----------------------------------------------------------------

ALTER TABLE income ADD COLUMN IF NOT EXISTS "date" TEXT;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "recurring" BOOLEAN DEFAULT false;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "endMonth" TEXT;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE shared_expense_participants ADD COLUMN IF NOT EXISTS "settled" BOOLEAN DEFAULT false;

-- -----------------------------------------------------------------
-- 5. Ricarica schema cache PostgREST (obbligatorio affinché le
--     nuove colonne e funzioni siano visibili dall'API REST)
-- -----------------------------------------------------------------

NOTIFY pgrst, 'reload schema';