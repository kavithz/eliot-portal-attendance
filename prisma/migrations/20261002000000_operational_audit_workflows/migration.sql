DO $$ BEGIN
  CREATE TYPE "AttendanceCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AttendanceCorrectionRequest" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "sessionId" TEXT,
  "reason" TEXT NOT NULL,
  "status" "AttendanceCorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "originalMode" "WorkMode",
  "requestedMode" "WorkMode",
  "originalStartAt" TIMESTAMP(3),
  "originalEndAt" TIMESTAMP(3),
  "resolutionReason" TEXT,
  "decisionNote" TEXT,
  "reviewedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceCorrectionRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceCorrectionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AttendanceCorrectionRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AttendanceAuditLog" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT,
  "sessionId" TEXT,
  "actorId" TEXT,
  "actionType" TEXT NOT NULL,
  "settingKey" TEXT,
  "previousValues" JSONB,
  "newValues" JSONB,
  "reason" TEXT,
  "correctionRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceAuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AttendanceAuditLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AttendanceAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "AttendanceAuditLog" ADD COLUMN IF NOT EXISTS "settingKey" TEXT;
ALTER TABLE "AttendanceAuditLog" ALTER COLUMN "employeeId" DROP NOT NULL;
ALTER TABLE "AttendanceAuditLog" DROP CONSTRAINT IF EXISTS "AttendanceAuditLog_employeeId_fkey";
ALTER TABLE "AttendanceAuditLog" ADD CONSTRAINT "AttendanceAuditLog_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP INDEX IF EXISTS "AttendanceCorrectionRequest_employeeId_sessionId_status_key";

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'INFO',
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AppSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "description" TEXT,
  "isAdminOnly" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key");
CREATE INDEX IF NOT EXISTS "AppSetting_category_idx" ON "AppSetting"("category");
CREATE INDEX IF NOT EXISTS "AttendanceCorrectionRequest_employeeId_status_idx" ON "AttendanceCorrectionRequest"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "AttendanceCorrectionRequest_status_requestedAt_idx" ON "AttendanceCorrectionRequest"("status", "requestedAt");
CREATE INDEX IF NOT EXISTS "AttendanceAuditLog_employeeId_createdAt_idx" ON "AttendanceAuditLog"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "AttendanceAuditLog_sessionId_createdAt_idx" ON "AttendanceAuditLog"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AttendanceAuditLog_settingKey_createdAt_idx" ON "AttendanceAuditLog"("settingKey", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");