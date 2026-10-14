CREATE TABLE "Shift" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee"
  ADD COLUMN "shiftId" TEXT;

CREATE INDEX "Employee_shiftId_idx" ON "Employee"("shiftId");

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
