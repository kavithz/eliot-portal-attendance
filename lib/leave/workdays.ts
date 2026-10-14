import "server-only";

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ShiftWeekday } from "@/lib/shifts/validation";

type LeaveWorkdayDatabase = Pick<PrismaClient, "employee">;

export type LeaveHolidayResolver = (input: {
  employeeUserId: string;
  startDate: string;
  endDate: string;
}) => Promise<ReadonlySet<string>>;

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const weekdayByUtcDay: readonly ShiftWeekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

function parseDateOnly(value: string) {
  if (!dateOnlyPattern.test(value)) throw new RangeError("Leave dates must use YYYY-MM-DD format.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Leave dates must be valid calendar dates.");
  }
  return date;
}

export function countScheduledWorkdays(
  startDate: string,
  endDate: string,
  workingDays: readonly ShiftWeekday[],
  holidayDates: ReadonlySet<string>,
) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (start > end) throw new RangeError("Leave end date must be on or after its start date.");

  const scheduledDays = new Set(workingDays);
  let count = 0;
  for (let timestamp = start.getTime(); timestamp <= end.getTime(); timestamp += 86_400_000) {
    const date = new Date(timestamp);
    const dateKey = date.toISOString().slice(0, 10);
    const weekday = weekdayByUtcDay[date.getUTCDay()];
    if (weekday && scheduledDays.has(weekday) && !holidayDates.has(dateKey)) count += 1;
  }
  return count;
}

export class LeaveWorkdayScheduleError extends Error {
  constructor() {
    super("Assign the employee to a Shift with configured working days before calculating Leave duration.");
    this.name = "LeaveWorkdayScheduleError";
  }
}

export async function calculateEmployeeLeaveWorkdays(
  input: { employeeUserId: string; startDate: string; endDate: string },
  dependencies: {
    resolveHolidayDates: LeaveHolidayResolver;
    database?: LeaveWorkdayDatabase;
  },
) {
  const employee = await (dependencies.database ?? prisma).employee.findUnique({
    where: { userId: input.employeeUserId },
    select: { shift: { select: { workingDays: true } } },
  });
  if (!employee?.shift || employee.shift.workingDays.length === 0) throw new LeaveWorkdayScheduleError();

  const holidayDates = await dependencies.resolveHolidayDates(input);
  return countScheduledWorkdays(input.startDate, input.endDate, employee.shift.workingDays, holidayDates);
}
