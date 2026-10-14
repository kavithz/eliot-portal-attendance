CREATE TYPE "AttendanceCorrectionApprovalStage" AS ENUM ('SUPERVISOR', 'HR');

ALTER TABLE "AttendanceCorrectionRequest"
  ADD COLUMN "currentApprovalStage" "AttendanceCorrectionApprovalStage";

UPDATE "AttendanceCorrectionRequest" AS correction
SET "currentApprovalStage" = CASE
  WHEN requester."role" = 'EMPLOYEE' THEN 'SUPERVISOR'::"AttendanceCorrectionApprovalStage"
  WHEN requester."role" = 'SUPERVISOR' THEN 'HR'::"AttendanceCorrectionApprovalStage"
  ELSE NULL
END
FROM "User" AS requester
WHERE correction."requesterId" = requester."id"
  AND correction."status" = 'PENDING';

CREATE INDEX "AttendanceCorrectionRequest_status_currentApprovalStage_requestedAt_idx"
  ON "AttendanceCorrectionRequest"("status", "currentApprovalStage", "requestedAt");
