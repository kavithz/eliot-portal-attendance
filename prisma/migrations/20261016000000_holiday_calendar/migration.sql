CREATE TYPE "HolidayType" AS ENUM (
  'PUBLIC',
  'POYA',
  'COMPANY',
  'SPECIAL',
  'BRANCH_SPECIFIC'
);

CREATE TABLE "Holiday" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "type" "HolidayType" NOT NULL,
  "branch" VARCHAR(120) NOT NULL DEFAULT '',
  "applicableEmployeeGroups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isPaid" BOOLEAN NOT NULL,
  "overtimeEligible" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");
CREATE INDEX "Holiday_type_date_idx" ON "Holiday"("type", "date");
CREATE UNIQUE INDEX "Holiday_date_name_branch_key" ON "Holiday"("date", "name", "branch");