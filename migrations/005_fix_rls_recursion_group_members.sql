-- 005_fix_rls_recursion_group_members.sql
-- FIX: "infinite recursion detected in policy for relation group_members"
-- Causa: groups_select <-> group_members_select si interrogano a vicenda:
--   groups_select:        ... OR id IN (SELECT "groupId" FROM group_members WHERE ...)
--   group_members_select: ... OR "groupId" IN (SELECT id FROM groups WHERE created_by = ...)
-- Qualsiasi INSERT/UPDATE su shared_expenses/shared_expense_participants
-- (che valutano shared_expenses_select, che interroga group_members) entra in loop.
-- Fix: funzione SECURITY DEFINER is_group_member() che interroga group_members
-- SENZA applicare le policy (l'owner bypassa RLS) -> il ciclo si spezza.

CREATE OR REPLACE FUNCTION is_group_member(gid BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM group_members
        WHERE "groupId" = gid AND user_id = auth.uid()::text
    )
$$;

REVOKE ALL ON FUNCTION is_group_member(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_group_member(BIGINT) TO authenticated;

DROP POLICY IF EXISTS "groups_select" ON groups;
CREATE POLICY "groups_select" ON groups
FOR SELECT USING (
    created_by::text = auth.uid()::text
    OR is_group_member(id)
);

DROP POLICY IF EXISTS "group_members_select" ON group_members;
CREATE POLICY "group_members_select" ON group_members
FOR SELECT USING (
    user_id = auth.uid()::text
    OR is_group_member("groupId")
);

-- Le altre policy che interrogano groups/group_members ora passano da
-- is_group_member e non entrano piu' in ciclo. Nessun'altra modifica.

NOTIFY pgrst, 'reload schema';