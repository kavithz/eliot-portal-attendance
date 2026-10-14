CREATE TABLE "LeaveEntitlement" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "openingBalance" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "entitlement" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "carryForward" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LeaveEntitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaveEntitlement_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LeaveEntitlement_leaveTypeId_fkey"
    FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LeaveEntitlement_employeeId_leaveTypeId_periodStart_periodEnd_key"
  ON "LeaveEntitlement"("employeeId", "leaveTypeId", "periodStart", "periodEnd");
CREATE INDEX "LeaveEntitlement_leaveTypeId_periodStart_periodEnd_idx"
  ON "LeaveEntitlement"("leaveTypeId", "periodStart", "periodEnd");
