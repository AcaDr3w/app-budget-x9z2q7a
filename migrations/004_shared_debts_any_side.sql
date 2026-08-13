-- 004_shared_debts_any_side.sql
-- Permette all'account che HA il debito (debtor) di inserire la riga di debito,
-- così i preset "p3/p4" (amico ha pagato per te) sincronizzano anche in
-- cross-account: il creatore materializza la riga con creditor = amico, debtor = sé.
-- UPDATE/SELECT restano come prima (entrambi i lati).
-- NOTA: colonne TEXT -> cast auth.uid()::text (uuid = text non esiste).

drop policy if exists "shared_debts_insert" on shared_debts;
drop policy if exists "shared_debts_insert_creditor_only" on shared_debts;

create policy "shared_debts_insert_either_side"
    on shared_debts for insert
    with check (
        auth.uid()::text = creditor_user_id
        or auth.uid()::text = debtor_user_id
    );

NOTIFY pgrst, 'reload schema';