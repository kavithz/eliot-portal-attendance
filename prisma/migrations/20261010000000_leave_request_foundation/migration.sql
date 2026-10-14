CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED');

CREATE TABLE "LeaveRequest" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "attachmentDocumentId" TEXT,
  "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "currentApprovalStage" TEXT,
  "currentApproverId" TEXT,
  "decisionReason" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaveRequest_date_range_check" CHECK ("endDate" >= "startDate"),
  CONSTRAINT "LeaveRequest_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LeaveRequest_leaveTypeId_fkey"
    FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LeaveRequest_attachmentDocumentId_fkey"
    FOREIGN KEY ("attachmentDocumentId") REFERENCES "EmployeeDocument"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LeaveRequest_currentApproverId_fkey"
    FOREIGN KEY ("currentApproverId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LeaveRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "LeaveRequest_employeeId_status_createdAt_idx"
  ON "LeaveRequest"("employeeId", "status", "createdAt");
CREATE INDEX "LeaveRequest_leaveTypeId_createdAt_idx"
  ON "LeaveRequest"("leaveTypeId", "createdAt");
CREATE INDEX "LeaveRequest_status_createdAt_idx"
  ON "LeaveRequest"("status", "createdAt");
CREATE INDEX "LeaveRequest_currentApproverId_status_idx"
  ON "LeaveRequest"("currentApproverId", "status");
