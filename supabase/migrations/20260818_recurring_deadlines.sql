-- Scadenze ricorrenti mensili con durata limitata per la dashboard Previsioni
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "recurring" BOOLEAN DEFAULT false;
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "endMonth" TEXT;
