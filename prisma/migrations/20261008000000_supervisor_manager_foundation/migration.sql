ALTER TYPE "Role" ADD VALUE 'DEPARTMENT_MANAGER';
ALTER TYPE "Role" ADD VALUE 'SUPERVISOR';

ALTER TABLE "Employee"
  ADD COLUMN "supervisorId" TEXT,
  ADD COLUMN "managerId" TEXT;

CREATE INDEX "Employee_supervisorId_idx" ON "Employee"("supervisorId");
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_supervisorId_fkey"
  FOREIGN KEY ("supervisorId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
