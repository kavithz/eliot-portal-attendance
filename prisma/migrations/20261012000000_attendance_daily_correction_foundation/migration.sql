ALTER TABLE "AttendanceCorrectionRequest"
  ADD COLUMN "dailyAttendanceId" TEXT,
  ADD COLUMN "requesterId" TEXT,
  ADD COLUMN "originalValues" JSONB,
  ADD COLUMN "requestedValues" JSONB;

ALTER TABLE "AttendanceCorrectionRequest"
  ADD CONSTRAINT "AttendanceCorrectionRequest_dailyAttendanceId_fkey"
  FOREIGN KEY ("dailyAttendanceId") REFERENCES "attendance_daily"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceCorrectionRequest_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceAuditLog"
  ADD CONSTRAINT "AttendanceAuditLog_correctionRequestId_fkey"
  FOREIGN KEY ("correctionRequestId") REFERENCES "AttendanceCorrectionRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
