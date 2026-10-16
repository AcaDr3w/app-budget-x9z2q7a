-- 007_shared_debts_delete.sql
-- Without a DELETE policy, wipe/delete leave open debts in place and
-- syncSharedDebts rematerializes them as expenses on every refresh.
-- UPDATE already allows both sides; DELETE must match.

DROP POLICY IF EXISTS "shared_debts_delete" ON shared_debts;
CREATE POLICY "shared_debts_delete" ON shared_debts
    FOR DELETE
    USING (
        auth.uid()::text = creditor_user_id
        OR auth.uid()::text = debtor_user_id
    );

NOTIFY pgrst, 'reload schema';
