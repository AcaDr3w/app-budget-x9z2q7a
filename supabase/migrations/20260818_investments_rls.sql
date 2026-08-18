-- Fix RLS tabelle create senza policy (investimenti, salvadanai, settings).
-- Le tabelle legacy (months, expenses, ...) hanno RLS + policy user_id = auth.uid();
-- queste 4 sono state abilitate all'RLS manualmente senza policy -> ogni INSERT/UPDATE
-- DENIED -> i dati restavano solo nell'outbox locale ("non salva/sincronizza").
-- Pattern MEMORY: user_id è TEXT, auth.uid() è UUID -> confronti SEMPRE con ::text.

ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "investments_user_isolation" ON investments;
CREATE POLICY "investments_user_isolation" ON investments
  FOR ALL USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "investment_movements_user_isolation" ON investment_movements;
CREATE POLICY "investment_movements_user_isolation" ON investment_movements
  FOR ALL USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "savings_goals_user_isolation" ON savings_goals;
CREATE POLICY "savings_goals_user_isolation" ON savings_goals
  FOR ALL USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "settings_user_isolation" ON settings;
CREATE POLICY "settings_user_isolation" ON settings
  FOR ALL USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text);

NOTIFY pgrst, 'reload schema';
