-- Fase 4 ROADMAP: Spese Condivise (ripristino da legacy_version/)
-- Pattern: CREATE TABLE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS + PK + NOTIFY pgrst

CREATE TABLE IF NOT EXISTS people (
    "id" BIGINT PRIMARY KEY,
    "user_id" TEXT DEFAULT '',
    "name" TEXT DEFAULT '',
    "createdAt" BIGINT
);

CREATE TABLE IF NOT EXISTS groups (
    "id" BIGINT PRIMARY KEY,
    "user_id" TEXT DEFAULT '',
    "name" TEXT DEFAULT '',
    "description" TEXT DEFAULT '',
    "createdAt" BIGINT
);

CREATE TABLE IF NOT EXISTS group_members (
    "id" BIGINT PRIMARY KEY,
    "user_id" TEXT DEFAULT '',
    "groupId" BIGINT,
    "personId" BIGINT
);

CREATE TABLE IF NOT EXISTS shared_expense_splits (
    "id" BIGINT PRIMARY KEY,
    "user_id" TEXT DEFAULT '',
    "expenseId" BIGINT,
    "personId" BIGINT,
    "groupId" BIGINT,
    "amount" NUMERIC DEFAULT 0,
    "splitType" TEXT DEFAULT 'equal',
    "paidBy" TEXT DEFAULT 'me',
    "isPaid" BOOLEAN DEFAULT false,
    "settled" BOOLEAN DEFAULT false,
    "createdAt" BIGINT
);

ALTER TABLE people ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS "createdAt" BIGINT;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS "createdAt" BIGINT;

ALTER TABLE group_members ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS "groupId" BIGINT;
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS "personId" BIGINT;

ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "expenseId" BIGINT;
ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "personId" BIGINT;
ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "groupId" BIGINT;
ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "amount" NUMERIC DEFAULT 0;
ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "splitType" TEXT DEFAULT 'equal';
ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "paidBy" TEXT DEFAULT 'me';
ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN DEFAULT false;
ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "settled" BOOLEAN DEFAULT false;
ALTER TABLE shared_expense_splits ADD COLUMN IF NOT EXISTS "createdAt" BIGINT;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "isShared" BOOLEAN;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "sharedPayer" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'people_pkey') THEN
        ALTER TABLE people ADD PRIMARY KEY ("id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_pkey') THEN
        ALTER TABLE groups ADD PRIMARY KEY ("id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_members_pkey') THEN
        ALTER TABLE group_members ADD PRIMARY KEY ("id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_expense_splits_pkey') THEN
        ALTER TABLE shared_expense_splits ADD PRIMARY KEY ("id");
    END IF;
END $$;

-- ALTER TABLE people ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE shared_expense_splits ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
