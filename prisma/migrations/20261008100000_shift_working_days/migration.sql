CREATE TYPE "ShiftWeekday" AS ENUM (
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY'
);

ALTER TABLE "Shift"
  ADD COLUMN "workingDays" "ShiftWeekday"[] NOT NULL DEFAULT ARRAY[]::"ShiftWeekday"[];
