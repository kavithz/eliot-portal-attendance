CREATE TABLE "Department" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Designation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee"
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "designationId" TEXT;

CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");
CREATE INDEX "Employee_designationId_idx" ON "Employee"("designationId");

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_designationId_fkey"
  FOREIGN KEY ("designationId") REFERENCES "Designation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
