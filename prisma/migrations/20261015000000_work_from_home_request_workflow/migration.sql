CREATE TYPE "WorkFromHomeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "WorkFromHomeApprovalStage" AS ENUM ('SUPERVISOR', 'MANAGER');

CREATE TABLE "wfh_requests" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "workLocation" TEXT NOT NULL,
  "status" "WorkFromHomeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "currentApprovalStage" "WorkFromHomeApprovalStage" DEFAULT 'SUPERVISOR',
  "currentApproverId" TEXT,
  "decisionReason" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "wfh_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wfh_requests_time_range_check" CHECK ("endAt" > "startAt"),
  CONSTRAINT "wfh_requests_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "wfh_requests_currentApproverId_fkey"
    FOREIGN KEY ("currentApproverId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "wfh_requests_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "wfh_requests_employeeId_status_createdAt_idx"
  ON "wfh_requests"("employeeId", "status", "createdAt");
CREATE INDEX "wfh_requests_status_currentApprovalStage_currentApproverId_createdAt_idx"
  ON "wfh_requests"("status", "currentApprovalStage", "currentApproverId", "createdAt");
