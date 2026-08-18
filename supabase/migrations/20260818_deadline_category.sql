-- Campo categoria per le scadenze (Pianificatore Scadenze)
ALTER TABLE annual_deadlines ADD COLUMN IF NOT EXISTS "category" TEXT;