-- =====================================================================
-- Migration 001: Shared Expenses v2 + Group Invites
-- Esegui questo script nell'SQL Editor di Supabase prima di usare
-- la nuova logica di spese condivise.
-- =====================================================================

-- -----------------------------------------------------------------
-- 1. Colonne aggiunte alle tabelle esistenti
-- -----------------------------------------------------------------
ALTER TABLE people ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE people ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;

ALTER TABLE group_members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS member_name TEXT;
ALTER TABLE group_members ALTER COLUMN personId DROP NOT NULL;

-- -----------------------------------------------------------------
-- 2. Nuove tabelle
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shared_expenses (
    id BIGINT PRIMARY KEY,
    expense_id BIGINT REFERENCES expenses(id) ON DELETE CASCADE,
    group_id BIGINT REFERENCES groups(id) ON DELETE SET NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    split_method TEXT NOT NULL CHECK (split_method IN ('equal','percentage','exact','shares')),
    created_by UUID REFERENCES auth.users(id),
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_expense_participants (
    id BIGINT PRIMARY KEY,
    shared_expense_id BIGINT REFERENCES shared_expenses(id) ON DELETE CASCADE,
    person_id BIGINT REFERENCES people(id) ON DELETE CASCADE,
    participant_name TEXT,
    share_amount NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    split_value NUMERIC(12,4),
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_invites (
    id BIGINT PRIMARY KEY,
    group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    email TEXT,
    used_by UUID REFERENCES auth.users(id),
    used_at BIGINT,
    created_at BIGINT NOT NULL
);

-- -----------------------------------------------------------------
-- 3. Indici utili
-- -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_shared_expenses_expense_id ON shared_expenses(expense_id);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_group_id ON shared_expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_shared_expense_participants_shared_expense_id ON shared_expense_participants(shared_expense_id);
CREATE INDEX IF NOT EXISTS idx_shared_expense_participants_person_id ON shared_expense_participants(person_id);
CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);
CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON group_invites(group_id);

-- -----------------------------------------------------------------
-- 4. Funzione per unirsi a un gruppo tramite token
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_group_with_token(p_token TEXT, p_member_name TEXT DEFAULT NULL)
RETURNS TABLE(group_id BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_group_id BIGINT;
    v_invite_id BIGINT;
    v_user_email TEXT;
    v_member_id BIGINT;
BEGIN
    v_user_email := auth.email();

    -- Trova invito valido (aperto o con email corrispondente, non ancora usato)
    SELECT gi.id, gi.group_id
    INTO v_invite_id, v_group_id
    FROM group_invites gi
    JOIN groups g ON g.id = gi.group_id
    WHERE gi.token = p_token
      AND gi.used_by IS NULL
      AND (gi.email IS NULL OR gi.email = v_user_email);

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Token di invito non valido, scaduto o email non corrispondente';
    END IF;

    v_member_id := extract(epoch from now())::bigint * 1000 + (random() * 1000)::int;

    -- Aggiunge l'utente come membro se non lo e' gia'
    INSERT INTO group_members (id, groupId, user_id, member_name)
    VALUES (v_member_id, v_group_id, auth.uid(), COALESCE(p_member_name, split_part(v_user_email, '@', 1)))
    ON CONFLICT DO NOTHING;

    -- Marca l'invito come usato
    UPDATE group_invites
    SET used_by = auth.uid(), used_at = extract(epoch from now())::bigint
    WHERE id = v_invite_id;

    RETURN QUERY SELECT v_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION join_group_with_token(TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------
-- 5. Abilita RLS
-- -----------------------------------------------------------------
ALTER TABLE shared_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_expense_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------
-- 6. Policies: people
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "people_own" ON people;
CREATE POLICY "people_own" ON people
FOR ALL USING (user_id = auth.uid() OR user_id IS NULL)
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- -----------------------------------------------------------------
-- 7. Policies: groups
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "groups_select" ON groups;
CREATE POLICY "groups_select" ON groups
FOR SELECT USING (
    created_by = auth.uid()
    OR id IN (SELECT groupId FROM group_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "groups_insert" ON groups;
CREATE POLICY "groups_insert" ON groups
FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "groups_update" ON groups;
CREATE POLICY "groups_update" ON groups
FOR UPDATE USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "groups_delete" ON groups;
CREATE POLICY "groups_delete" ON groups
FOR DELETE USING (created_by = auth.uid());

-- -----------------------------------------------------------------
-- 8. Policies: group_members
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "group_members_select" ON group_members;
CREATE POLICY "group_members_select" ON group_members
FOR SELECT USING (
    user_id = auth.uid()
    OR groupId IN (SELECT id FROM groups WHERE created_by = auth.uid())
);

DROP POLICY IF EXISTS "group_members_insert" ON group_members;
CREATE POLICY "group_members_insert" ON group_members
FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR groupId IN (SELECT id FROM groups WHERE created_by = auth.uid())
);

DROP POLICY IF EXISTS "group_members_update" ON group_members;
CREATE POLICY "group_members_update" ON group_members
FOR UPDATE USING (groupId IN (SELECT id FROM groups WHERE created_by = auth.uid()));

DROP POLICY IF EXISTS "group_members_delete" ON group_members;
CREATE POLICY "group_members_delete" ON group_members
FOR DELETE USING (groupId IN (SELECT id FROM groups WHERE created_by = auth.uid()));

-- -----------------------------------------------------------------
-- 9. Policies: shared_expenses
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "shared_expenses_select" ON shared_expenses;
CREATE POLICY "shared_expenses_select" ON shared_expenses
FOR SELECT USING (
    created_by = auth.uid()
    OR group_id IN (SELECT groupId FROM group_members WHERE user_id = auth.uid())
    OR id IN (
        SELECT sep.shared_expense_id
        FROM shared_expense_participants sep
        JOIN people p ON p.id = sep.person_id
        WHERE p.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "shared_expenses_insert" ON shared_expenses;
CREATE POLICY "shared_expenses_insert" ON shared_expenses
FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "shared_expenses_update" ON shared_expenses;
CREATE POLICY "shared_expenses_update" ON shared_expenses
FOR UPDATE USING (created_by = auth.uid());

DROP POLICY IF EXISTS "shared_expenses_delete" ON shared_expenses;
CREATE POLICY "shared_expenses_delete" ON shared_expenses
FOR DELETE USING (created_by = auth.uid());

-- -----------------------------------------------------------------
-- 10. Policies: shared_expense_participants
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "shared_expense_participants_select" ON shared_expense_participants;
CREATE POLICY "shared_expense_participants_select" ON shared_expense_participants
FOR SELECT USING (
    shared_expense_id IN (SELECT id FROM shared_expenses WHERE created_by = auth.uid())
    OR shared_expense_id IN (
        SELECT se.id FROM shared_expenses se
        JOIN group_members gm ON gm.groupId = se.group_id
        WHERE gm.user_id = auth.uid()
    )
    OR person_id IN (SELECT id FROM people WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "shared_expense_participants_insert" ON shared_expense_participants;
CREATE POLICY "shared_expense_participants_insert" ON shared_expense_participants
FOR INSERT WITH CHECK (
    shared_expense_id IN (SELECT id FROM shared_expenses WHERE created_by = auth.uid())
);

DROP POLICY IF EXISTS "shared_expense_participants_update" ON shared_expense_participants;
CREATE POLICY "shared_expense_participants_update" ON shared_expense_participants
FOR UPDATE USING (
    shared_expense_id IN (SELECT id FROM shared_expenses WHERE created_by = auth.uid())
);

DROP POLICY IF EXISTS "shared_expense_participants_delete" ON shared_expense_participants;
CREATE POLICY "shared_expense_participants_delete" ON shared_expense_participants
FOR DELETE USING (
    shared_expense_id IN (SELECT id FROM shared_expenses WHERE created_by = auth.uid())
);

-- -----------------------------------------------------------------
-- 11. Policies: group_invites
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "group_invites_select" ON group_invites;
CREATE POLICY "group_invites_select" ON group_invites
FOR SELECT USING (
    group_id IN (SELECT id FROM groups WHERE created_by = auth.uid())
    OR (email IS NULL)
    OR (email = auth.email())
);

DROP POLICY IF EXISTS "group_invites_insert" ON group_invites;
CREATE POLICY "group_invites_insert" ON group_invites
FOR INSERT WITH CHECK (
    group_id IN (SELECT id FROM groups WHERE created_by = auth.uid())
);

DROP POLICY IF EXISTS "group_invites_update" ON group_invites;
CREATE POLICY "group_invites_update" ON group_invites
FOR UPDATE USING (
    group_id IN (SELECT id FROM groups WHERE created_by = auth.uid())
    OR (email IS NULL AND used_by IS NULL)
    OR (email = auth.email() AND used_by IS NULL)
);

DROP POLICY IF EXISTS "group_invites_delete" ON group_invites;
CREATE POLICY "group_invites_delete" ON group_invites
FOR DELETE USING (group_id IN (SELECT id FROM groups WHERE created_by = auth.uid()));
