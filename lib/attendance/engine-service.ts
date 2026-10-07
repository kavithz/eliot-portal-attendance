import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import {
  attendanceDailyWorkingHoursForStorage,
  calculateDailyAttendance,
  AttendanceEngineConfigurationError,
  type DailyAttendanceCorrectionValues,
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

export class AttendanceCorrectionEngineConflictError extends Error {
  constructor() {
    super("Calculated attendance changed or the approved correction cannot be represented safely by the attendance engine.");
    this.name = "AttendanceCorrectionEngineConflictError";
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

type EngineTransaction = Prisma.TransactionClient;

async function calculateForEmployeeDay(
  transaction: EngineTransaction,
  employeeId: string,
  date: string,
  correction?: DailyAttendanceCorrectionValues,
) {
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
    correction,
  });

  const dateValue = new Date(`${date}T00:00:00.000Z`);
  return {
    calculation,
    dateValue,
    data: {
      employeeId,
      date: dateValue,
      shiftId: calculation.shiftId,
      firstIn: calculation.firstIn,
      lastOut: calculation.lastOut,
      workingHours: attendanceDailyWorkingHoursForStorage(calculation.workingHours),
      lateMinutes: calculation.lateMinutes,
      earlyMinutes: calculation.earlyMinutes,
      status: calculation.status,
    },
  };
}

export async function calculateAndPersistDailyAttendance(
  employeeId: string,
  date: string,
  database: EngineDatabase = prisma,
) {
  return database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
    const calculated = await calculateForEmployeeDay(transaction, employeeId, date);
    const existing = await transaction.attendanceDaily.findMany({
      where: { employeeId, date: calculated.dateValue },
      select: { id: true },
      take: 2,
    });
    if (existing.length > 1) {
      throw new AttendanceDailyPersistenceError("Multiple daily attendance rows exist for this employee and date.");
    }

    const attendanceDaily = existing[0]
      ? await transaction.attendanceDaily.update({ where: { id: existing[0].id }, data: calculated.data })
      : await transaction.attendanceDaily.create({ data: calculated.data });

    return { calculation: calculated.calculation, attendanceDaily };
  });
}

export async function applyApprovedAttendanceCorrection(
  transaction: EngineTransaction,
  input: {
    dailyAttendanceId: string;
    employeeId: string;
    date: string;
    expectedFirstIn: Date | null;
    expectedLastOut: Date | null;
    correction: DailyAttendanceCorrectionValues;
  },
) {
  await transaction.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${input.employeeId} FOR UPDATE`;
  const current = await transaction.attendanceDaily.findUnique({
    where: { id: input.dailyAttendanceId },
    select: { id: true, employeeId: true, date: true, firstIn: true, lastOut: true },
  });
  if (
    !current
    || current.employeeId !== input.employeeId
    || current.date.toISOString().slice(0, 10) !== input.date
    || current.firstIn?.getTime() !== input.expectedFirstIn?.getTime()
    || current.lastOut?.getTime() !== input.expectedLastOut?.getTime()
  ) {
    throw new AttendanceCorrectionEngineConflictError();
  }

  const calculated = await calculateForEmployeeDay(
    transaction,
    input.employeeId,
    input.date,
    input.correction,
  );
  if (
    (input.correction.firstIn !== undefined
      && calculated.calculation.firstIn?.getTime() !== input.correction.firstIn?.getTime())
    || (input.correction.lastOut !== undefined
      && calculated.calculation.lastOut?.getTime() !== input.correction.lastOut?.getTime())
  ) {
    throw new AttendanceCorrectionEngineConflictError();
  }

  const updated = await transaction.attendanceDaily.updateMany({
    where: {
      id: input.dailyAttendanceId,
      employeeId: input.employeeId,
      firstIn: current.firstIn,
      lastOut: current.lastOut,
    },
    data: calculated.data,
  });
  if (updated.count !== 1) throw new AttendanceCorrectionEngineConflictError();
  return calculated.calculation;
}
