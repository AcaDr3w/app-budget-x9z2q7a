-- Fase 3 ROADMAP: tabelle Investimenti & Asset (ripristino da legacy_version/)
-- Pattern: CREATE TABLE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS + PK + NOTIFY pgrst

CREATE TABLE IF NOT EXISTS investments (
    "id" BIGINT PRIMARY KEY,
    "user_id" TEXT DEFAULT '',
    "type" TEXT DEFAULT '',
    "name" TEXT DEFAULT '',
    "targetAmount" NUMERIC DEFAULT 0,
    "initialCapital" NUMERIC DEFAULT 0,
    "createdAt" BIGINT
);

CREATE TABLE IF NOT EXISTS investment_movements (
    "id" BIGINT PRIMARY KEY,
    "user_id" TEXT DEFAULT '',
    "investmentId" BIGINT,
    "date" TEXT DEFAULT '',
    "type" TEXT DEFAULT '',
    "amount" NUMERIC DEFAULT 0,
    "desc" TEXT DEFAULT ''
);

ALTER TABLE investments ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS "targetAmount" NUMERIC DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS "initialCapital" NUMERIC DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS "createdAt" BIGINT;

ALTER TABLE investment_movements ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE investment_movements ADD COLUMN IF NOT EXISTS "investmentId" BIGINT;
ALTER TABLE investment_movements ADD COLUMN IF NOT EXISTS "date" TEXT;
ALTER TABLE investment_movements ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE investment_movements ADD COLUMN IF NOT EXISTS "amount" NUMERIC DEFAULT 0;
ALTER TABLE investment_movements ADD COLUMN IF NOT EXISTS "desc" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investments_pkey') THEN
        ALTER TABLE investments ADD PRIMARY KEY ("id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investment_movements_pkey') THEN
        ALTER TABLE investment_movements ADD PRIMARY KEY ("id");
    END IF;
END $$;

-- ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE investment_movements ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
