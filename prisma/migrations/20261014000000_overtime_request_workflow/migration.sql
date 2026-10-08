CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "OvertimeApprovalStage" AS ENUM ('SUPERVISOR', 'MANAGER');

CREATE TABLE "OvertimeRequest" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "project" TEXT NOT NULL,
  "expectedHours" DECIMAL(8,2) NOT NULL,
  "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "currentApprovalStage" "OvertimeApprovalStage" DEFAULT 'SUPERVISOR',
  "currentApproverId" TEXT,
  "decisionReason" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OvertimeRequest_time_range_check" CHECK ("endAt" > "startAt"),
  CONSTRAINT "OvertimeRequest_expectedHours_check" CHECK ("expectedHours" > 0),
  CONSTRAINT "OvertimeRequest_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OvertimeRequest_currentApproverId_fkey"
    FOREIGN KEY ("currentApproverId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "OvertimeRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "OvertimeRequest_employeeId_status_createdAt_idx"
  ON "OvertimeRequest"("employeeId", "status", "createdAt");
CREATE INDEX "OvertimeRequest_status_currentApprovalStage_currentApproverId_createdAt_idx"
  ON "OvertimeRequest"("status", "currentApprovalStage", "currentApproverId", "createdAt");
