import "server-only";

import { AttendanceCorrectionStatus, type Prisma, type PrismaClient, type Role } from "@prisma/client";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

type AttendanceCorrectionActor = { id: string; role: Role } | null;
type AttendanceCorrectionDatabase = Pick<PrismaClient, "$transaction">;

const jsonValueSchema: z.ZodType<Prisma.InputJsonValue | null> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const dailyAttendanceCorrectionInputSchema = z.object({
  requestedValues: z.record(z.string(), jsonValueSchema)
    .refine((values) => Object.keys(values).length > 0, "Provide at least one requested correction value."),
  reason: z.string().trim().min(1, "A correction reason is required.").max(500),
});

export class DailyAttendanceCorrectionAccessError extends Error {
  constructor() {
    super("You do not have permission to request this attendance correction.");
    this.name = "DailyAttendanceCorrectionAccessError";
  }
}

export class DailyAttendanceCorrectionRequesterNotFoundError extends Error {
  constructor() {
    super("The requesting User was not found.");
    this.name = "DailyAttendanceCorrectionRequesterNotFoundError";
  }
}

export class DailyAttendanceCorrectionTargetNotFoundError extends Error {
  constructor() {
    super("The calculated daily attendance record was not found.");
    this.name = "DailyAttendanceCorrectionTargetNotFoundError";
  }
}

export class DailyAttendanceCorrectionSubjectUserNotFoundError extends Error {
  constructor() {
    super("The Employee for this attendance record is not linked to a User account.");
    this.name = "DailyAttendanceCorrectionSubjectUserNotFoundError";
  }
}

function originalAttendanceSnapshot(
  attendance: {
    employeeId: string;
    date: Date;
    shiftId: string | null;
    firstIn: Date | null;
    lastOut: Date | null;
    workingHours: Prisma.Decimal | null;
    lateMinutes: number | null;
    earlyMinutes: number | null;
    status: string | null;
    overtimeHours: Prisma.Decimal | null;
  },
): Prisma.InputJsonObject {
  return {
    employeeId: attendance.employeeId,
    date: attendance.date.toISOString(),
    shiftId: attendance.shiftId,
    firstIn: attendance.firstIn?.toISOString() ?? null,
    lastOut: attendance.lastOut?.toISOString() ?? null,
    workingHours: attendance.workingHours?.toString() ?? null,
    lateMinutes: attendance.lateMinutes,
    earlyMinutes: attendance.earlyMinutes,
    status: attendance.status,
    overtimeHours: attendance.overtimeHours?.toString() ?? null,
  };
}

export async function submitDailyAttendanceCorrection(
  actor: AttendanceCorrectionActor,
  dailyAttendanceId: string,
  input: unknown,
  database: AttendanceCorrectionDatabase = prisma,
) {
  if (!actor || !hasPermission(actor.role, "attendance:correction:submit")) {
    throw new DailyAttendanceCorrectionAccessError();
  }
  const parsed = dailyAttendanceCorrectionInputSchema.parse(input);

  return database.$transaction(async (transaction) => {
    const requester = await transaction.user.findUnique({
      where: { id: actor.id },
      select: { id: true },
    });
    if (!requester) throw new DailyAttendanceCorrectionRequesterNotFoundError();

    const attendance = await transaction.attendanceDaily.findUnique({
      where: { id: dailyAttendanceId },
      select: {
        id: true,
        employeeId: true,
        date: true,
        shiftId: true,
        firstIn: true,
        lastOut: true,
        workingHours: true,
        lateMinutes: true,
        earlyMinutes: true,
        status: true,
        overtimeHours: true,
        employee: { select: { id: true, userId: true } },
      },
    });
    if (!attendance) throw new DailyAttendanceCorrectionTargetNotFoundError();
    if (!attendance.employee.userId) throw new DailyAttendanceCorrectionSubjectUserNotFoundError();

    const originalValues = originalAttendanceSnapshot(attendance);
    const correctionRequest = await transaction.attendanceCorrectionRequest.create({
      data: {
        employeeId: attendance.employee.userId,
        dailyAttendanceId: attendance.id,
        requesterId: requester.id,
        reason: parsed.reason,
        status: AttendanceCorrectionStatus.PENDING,
        originalValues,
        requestedValues: parsed.requestedValues,
      },
    });

    await transaction.attendanceAuditLog.create({
      data: {
        employeeId: attendance.employee.userId,
        actorId: requester.id,
        correctionRequestId: correctionRequest.id,
        actionType: "ATTENDANCE_CORRECTION_REQUESTED",
        previousValues: originalValues,
        newValues: parsed.requestedValues,
        reason: parsed.reason,
      },
      select: { id: true },
    });

    return correctionRequest;
  });
}
