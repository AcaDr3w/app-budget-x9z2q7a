-- Fase 5 ROADMAP: Rendiconto esteso + Modifica spesa
-- Badge "Saldata" su expenses (settled flag)

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "settled" BOOLEAN;

NOTIFY pgrst, 'reload schema';
