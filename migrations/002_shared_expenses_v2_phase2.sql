-- =====================================================================
-- Migration 002: Shared Expenses V2 Phase 2 - Payer multiplo + split avanzati
-- Aggiunge la colonna settled a shared_expense_participants (usata da
-- settleFriendBalance/showFriendDetail ma mai creata in 001).
-- split_method/split_value gia' presenti dal 001 (CHECK equal/percentage/exact/shares).
-- Esegui DOPO 001 (o 001b se la 001 originale e' fallita).
-- =====================================================================

ALTER TABLE shared_expense_participants ADD COLUMN IF NOT EXISTS settled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_shared_expense_participants_person_id_settled
    ON shared_expense_participants(person_id, settled);

NOTIFY pgrst, 'reload schema';
