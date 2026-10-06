import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import {
  attendanceDailyWorkingHoursForStorage,
  calculateDailyAttendance,
  AttendanceEngineConfigurationError,
} from "./engine";
import { getEmployeeLocalDayWindow } from "./timezone";

export type EngineDatabase = Pick<PrismaClient, "$transaction">;

export class AttendanceEngineEmployeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceEngineEmployeeError";
  }
}

export class AttendanceDailyPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceDailyPersistenceError";
  }
}

const shiftConfigurationSelect = {
  id: true,
  startTime: true,
  endTime: true,
  gracePeriodMinutes: true,
  lateThresholdMinutes: true,
  earlyDepartureThresholdMinutes: true,
  breakDurationMinutes: true,
  minimumWorkingHours: true,
  overtimeEligible: true,
  roundingRules: true,
  workingDays: true,
} satisfies Prisma.ShiftSelect;

export async function calculateAndPersistDailyAttendance(
  employeeId: string,
  date: string,
  database: EngineDatabase = prisma,
) {
  return database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;

    const employee = await transaction.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        user: { select: { timeZone: true } },
        shift: { select: shiftConfigurationSelect },
      },
    });
    if (!employee) throw new AttendanceEngineEmployeeError("Employee was not found.");
    if (!employee.user) throw new AttendanceEngineEmployeeError("Employee has no linked user timezone.");
    if (!employee.shift) {
      throw new AttendanceEngineConfigurationError("Assign the employee to a configured Shift before calculating attendance.");
    }

    const { startAt, endAt } = getEmployeeLocalDayWindow(
      fromZonedTime(`${date}T12:00:00.000`, employee.user.timeZone),
      employee.user.timeZone,
    );
    const punches = await transaction.attendanceRaw.findMany({
      where: { employeeId, timestamp: { gte: startAt, lt: endAt } },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      select: { id: true, timestamp: true, punchType: true },
    });
    const calculation = calculateDailyAttendance({
      employeeId,
      date,
      timeZone: employee.user.timeZone,
      shift: {
        ...employee.shift,
        minimumWorkingHours: employee.shift.minimumWorkingHours?.toString() ?? null,
      },
      punches,
    });

    const dateValue = new Date(`${date}T00:00:00.000Z`);
    const existing = await transaction.attendanceDaily.findMany({
      where: { employeeId, date: dateValue },
      select: { id: true },
      take: 2,
    });
    if (existing.length > 1) {
      throw new AttendanceDailyPersistenceError("Multiple daily attendance rows exist for this employee and date.");
    }

    const data = {
      employeeId,
      date: dateValue,
      shiftId: calculation.shiftId,
      firstIn: calculation.firstIn,
      lastOut: calculation.lastOut,
      workingHours: attendanceDailyWorkingHoursForStorage(calculation.workingHours),
      lateMinutes: calculation.lateMinutes,
      earlyMinutes: calculation.earlyMinutes,
      status: calculation.status,
    };
    const attendanceDaily = existing[0]
      ? await transaction.attendanceDaily.update({ where: { id: existing[0].id }, data })
      : await transaction.attendanceDaily.create({ data });

    return { calculation, attendanceDaily };
  });
}
