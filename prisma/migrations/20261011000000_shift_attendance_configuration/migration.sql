CREATE TYPE "AttendancePunchType" AS ENUM ('IN', 'OUT');

ALTER TABLE "Shift"
  ADD COLUMN "startTime" TIME(0),
  ADD COLUMN "endTime" TIME(0),
  ADD COLUMN "breakDurationMinutes" INTEGER,
  ADD COLUMN "gracePeriodMinutes" INTEGER,
  ADD COLUMN "lateThresholdMinutes" INTEGER,
  ADD COLUMN "earlyDepartureThresholdMinutes" INTEGER,
  ADD COLUMN "minimumWorkingHours" DECIMAL(8,2),
  ADD COLUMN "overtimeEligible" BOOLEAN,
  ADD COLUMN "roundingRules" JSONB;

CREATE TABLE "attendance_raw" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ(3) NOT NULL,
  "punchType" "AttendancePunchType" NOT NULL,
  "deviceId" TEXT,
  "source" TEXT NOT NULL,
  "location" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_raw_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_raw_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "attendance_raw_employeeId_timestamp_idx"
  ON "attendance_raw"("employeeId", "timestamp");

CREATE TABLE "attendance_daily" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "shiftId" TEXT,
  "firstIn" TIMESTAMPTZ(3),
  "lastOut" TIMESTAMPTZ(3),
  "workingHours" DECIMAL(8,2),
  "lateMinutes" INTEGER,
  "earlyMinutes" INTEGER,
  "status" TEXT,
  "overtimeHours" DECIMAL(8,2),
  CONSTRAINT "attendance_daily_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_daily_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_daily_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "attendance_daily_employeeId_date_idx"
  ON "attendance_daily"("employeeId", "date");
CREATE INDEX "attendance_daily_shiftId_date_idx"
  ON "attendance_daily"("shiftId", "date");
