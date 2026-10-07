import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AttendanceCorrectionApprovalStage,
  AttendanceCorrectionStatus,
  Role,
} from "@prisma/client";
import {
  DailyAttendanceCorrectionAccessError,
  DailyAttendanceCorrectionConflictError,
  DailyAttendanceCorrectionRequesterNotFoundError,
  DailyAttendanceCorrectionReviewerNotFoundError,
  DailyAttendanceCorrectionReviewerScopeError,
  DailyAttendanceCorrectionSubjectUserNotFoundError,
  DailyAttendanceCorrectionStageError,
  DailyAttendanceCorrectionTargetNotFoundError,
  decideDailyAttendanceCorrection,
  dailyAttendanceCorrectionInputSchema,
  listDailyAttendanceCorrections,
  submitDailyAttendanceCorrection,
} from "./correction-service";

const employeeActor = { id: "user-1", role: Role.EMPLOYEE };
const supervisorActor = { id: "supervisor-user", role: Role.SUPERVISOR };
type TestDaily = {
  id: string;
  employeeId: string;
  date: Date;
  shiftId: string | null;
  firstIn: Date | null;
  lastOut: Date | null;
  workingHours: number | null;
  lateMinutes: number | null;
  earlyMinutes: number | null;
  status: string | null;
  overtimeHours: number | null;
  employee: {
    id: string;
    userId: string | null;
    supervisor: { userId: string | null; user: { role: Role; isActive: boolean } | null } | null;
  };
};

const originalDaily: TestDaily = {
  id: "daily-1",
  employeeId: "employee-1",
  date: new Date("2026-10-05T00:00:00.000Z"),
  shiftId: "shift-1",
  firstIn: new Date("2026-10-05T03:00:00.000Z"),
  lastOut: null,
  workingHours: null,
  lateMinutes: 0,
  earlyMinutes: null,
  status: "MISSING_PUNCH",
  overtimeHours: null,
  employee: {
    id: "employee-1",
    userId: "user-1",
    supervisor: { userId: "supervisor-user", user: { role: Role.SUPERVISOR, isActive: true } },
  },
};

function createDatabase(options: {
  daily?: TestDaily | null;
  requesterExists?: boolean;
  supervisorUserId?: string | null;
} = {}) {
  const sourceDaily = options.daily === undefined ? originalDaily : options.daily;
  const daily = sourceDaily ? structuredClone(sourceDaily) : null;
  const dailyBefore = daily ? structuredClone(daily) : null;
  const rawPunches = [
    ...(daily?.firstIn ? [{ id: "raw-in", timestamp: daily.firstIn, punchType: "IN" as const }] : []),
    ...(daily?.lastOut ? [{ id: "raw-out", timestamp: daily.lastOut, punchType: "OUT" as const }] : []),
  ];
  const rawBefore = structuredClone(rawPunches);
  const requests: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const rawMutations: string[] = [];
  const correctionQueries: unknown[] = [];
  const users = new Set(options.requesterExists === false ? [] : ["user-1", "supervisor-user", "hr-user", "other-supervisor"]);
  const roles = new Map([
    ["user-1", Role.EMPLOYEE],
    ["supervisor-user", Role.SUPERVISOR],
    ["hr-user", Role.HR_ADMINISTRATOR],
    ["other-supervisor", Role.SUPERVISOR],
  ]);
  let nextId = 1;

  const transaction = {
    $queryRaw: async () => [],
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.has(where.id) ? { id: where.id, role: roles.get(where.id) } : null,
    },
    employee: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === "employee-1" ? ({
        id: "employee-1",
        user: { timeZone: "Asia/Colombo" },
        shift: {
          id: "shift-1",
          startTime: new Date("1970-01-01T08:30:00.000Z"),
          endTime: new Date("1970-01-01T17:30:00.000Z"),
          gracePeriodMinutes: 10,
          lateThresholdMinutes: 0,
          earlyDepartureThresholdMinutes: 0,
          breakDurationMinutes: 0,
          minimumWorkingHours: "8",
          overtimeEligible: false,
          roundingRules: null,
          workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
        },
      }) : null,
    },
    attendanceDaily: {
      findUnique: async ({ where }: { where: { id: string } }) => daily?.id === where.id ? structuredClone(daily) : null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (!daily || daily.id !== where.id) throw new Error("missing daily attendance");
        Object.assign(daily, data);
        return structuredClone(daily);
      },
      updateMany: async ({ where, data }: { where: { id: string; firstIn?: Date | null; lastOut?: Date | null }; data: Record<string, unknown> }) => {
        if (
          !daily
          || daily.id !== where.id
          || (where.firstIn !== undefined && daily.firstIn?.getTime() !== where.firstIn?.getTime())
          || (where.lastOut !== undefined && daily.lastOut?.getTime() !== where.lastOut?.getTime())
        ) return { count: 0 };
        Object.assign(daily, data);
        return { count: 1 };
      },
      delete: async () => { throw new Error("AttendanceDaily must not be deleted."); },
    },
    attendanceRaw: {
      findMany: async () => rawPunches,
      create: async () => { rawMutations.push("create"); throw new Error("Raw attendance must not be written."); },
      update: async () => { rawMutations.push("update"); throw new Error("Raw attendance must not be updated."); },
      delete: async () => { rawMutations.push("delete"); throw new Error("Raw attendance must not be deleted."); },
    },
    attendanceCorrectionRequest: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const request = { id: `correction-${nextId++}`, ...data };
        requests.push(structuredClone(request));
        return request;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const request = requests.find(({ id }) => id === where.id);
        if (!request) return null;
        const requestDaily = daily && daily.id === request.dailyAttendanceId ? daily : null;
        return {
          ...structuredClone(request),
          dailyAttendance: requestDaily ? {
            id: requestDaily.id,
            employeeId: requestDaily.employeeId,
            date: requestDaily.date,
            firstIn: requestDaily.firstIn,
            lastOut: requestDaily.lastOut,
            employee: {
              id: requestDaily.employee.id,
              userId: requestDaily.employee.userId,
              supervisor: options.supervisorUserId === undefined
                ? requestDaily.employee.supervisor
                : requestDaily.employee.supervisor
                  ? { userId: options.supervisorUserId }
                  : null,
            },
          } : null,
        };
      },
      updateMany: async ({ where, data }: { where: { id: string; status: AttendanceCorrectionStatus; currentApprovalStage: AttendanceCorrectionApprovalStage }; data: Record<string, unknown> }) => {
        const request = requests.find(({ id }) => id === where.id);
        if (!request || request.status !== where.status || request.currentApprovalStage !== where.currentApprovalStage) {
          return { count: 0 };
        }
        Object.assign(request, data);
        return { count: 1 };
      },
      findMany: async ({ where }: { where: { status: AttendanceCorrectionStatus; currentApprovalStage: AttendanceCorrectionApprovalStage; dailyAttendance?: { employee: { supervisor: { userId: string } } } } }) => {
        correctionQueries.push(where);
        return requests.filter((request) =>
          request.status === where.status
          && request.currentApprovalStage === where.currentApprovalStage
          && (!where.dailyAttendance || options.supervisorUserId !== "other-supervisor"),
        );
      },
    },
    attendanceAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(structuredClone(data));
        return { id: `audit-${audits.length}` };
      },
    },
  };
  const database = {
    $transaction: async <T>(operation: (tx: typeof transaction) => Promise<T>) => operation(transaction),
    attendanceCorrectionRequest: transaction.attendanceCorrectionRequest,
  } as never;
  return {
    database,
    requests,
    audits,
    rawMutations,
    rawPunches,
    rawBefore,
    daily,
    dailyBefore,
    roles,
    correctionQueries,
  };
}

describe("daily attendance correction request validation", () => {
  it("requires a non-empty JSON object of requested values and a reason", () => {
    assert.equal(dailyAttendanceCorrectionInputSchema.safeParse({
      requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
      reason: "Forgot to punch out",
    }).success, true);
    assert.equal(dailyAttendanceCorrectionInputSchema.safeParse({
      requestedValues: {},
      reason: "Correction",
    }).success, false);
    assert.equal(dailyAttendanceCorrectionInputSchema.safeParse({
      requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
      reason: "   ",
    }).success, false);
  });
});

it("rejects employee corrections when the target does not belong to the requester", async () => {
  const otherEmployee = {
    ...originalDaily,
    employeeId: "employee-2",
    employee: {
      ...originalDaily.employee,
      id: "employee-2",
      userId: "other-supervisor",
    },
  };
  const stub = createDatabase({ daily: otherEmployee });
  await assert.rejects(
    submitDailyAttendanceCorrection(employeeActor, "daily-1", {
      requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
      reason: "Forgot to punch out",
    }, stub.database),
    DailyAttendanceCorrectionAccessError,
  );
  assert.equal(stub.requests.length, 0);
});

it("fails closed when an employee has no assigned active Supervisor", async () => {
  const unassignedDaily = {
    ...originalDaily,
    employee: { ...originalDaily.employee, supervisor: null },
  };
  const stub = createDatabase({ daily: unassignedDaily });
  await assert.rejects(
    submitDailyAttendanceCorrection(employeeActor, "daily-1", {
      requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
      reason: "Forgot to punch out",
    }, stub.database),
    DailyAttendanceCorrectionReviewerNotFoundError,
  );
  assert.equal(stub.requests.length, 0);
});

describe("pending daily attendance correction requests", () => {
  it("allows an authorized Employee to submit their own correction", async () => {
    const stub = createDatabase();
    const requestedValues = { lastOut: "2026-10-05T12:00:00.000Z" };
    const request = await submitDailyAttendanceCorrection(employeeActor, "daily-1", {
      requestedValues,
      reason: "Forgot to punch out",
    }, stub.database);

    assert.equal(request.status, AttendanceCorrectionStatus.PENDING);
    assert.equal(request.currentApprovalStage, AttendanceCorrectionApprovalStage.SUPERVISOR);
    assert.equal(request.dailyAttendanceId, "daily-1");
    assert.equal(request.requesterId, "user-1");
    assert.equal(request.employeeId, "user-1");
    assert.deepEqual(request.originalValues, {
      employeeId: "employee-1",
      date: "2026-10-05T00:00:00.000Z",
      shiftId: "shift-1",
      firstIn: "2026-10-05T03:00:00.000Z",
      lastOut: null,
      workingHours: null,
      lateMinutes: 0,
      earlyMinutes: null,
      status: "MISSING_PUNCH",
      overtimeHours: null,
    });
    assert.deepEqual(request.requestedValues, requestedValues);
    assert.equal(stub.audits.length, 1);
    assert.deepEqual(stub.audits[0], {
      employeeId: "user-1",
      actorId: "user-1",
      correctionRequestId: request.id,
      actionType: "ATTENDANCE_CORRECTION_REQUESTED",
      previousValues: request.originalValues,
      newValues: requestedValues,
      reason: "Forgot to punch out",
    });
  });

  it("allows an authorized Supervisor to submit while preserving requester and subject attribution", async () => {
    const subjectDaily = {
      ...originalDaily,
      employeeId: "employee-2",
      employee: { ...originalDaily.employee, id: "employee-2", userId: "subject-user" },
    };
    const stub = createDatabase({ daily: subjectDaily });
    const request = await submitDailyAttendanceCorrection(supervisorActor, "daily-1", {
      requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
      reason: "Forgot to punch out",
    }, stub.database);

    assert.equal(request.requesterId, supervisorActor.id);
    assert.equal(request.currentApprovalStage, AttendanceCorrectionApprovalStage.HR);
    assert.equal(request.employeeId, "subject-user");
    assert.notEqual(request.employeeId, supervisorActor.id);
    assert.equal(request.dailyAttendanceId, "daily-1");
    assert.equal(stub.audits[0]?.actorId, supervisorActor.id);
    assert.equal(stub.audits[0]?.employeeId, "subject-user");
    assert.equal(stub.audits[0]?.correctionRequestId, request.id);
    assert.deepEqual(request.originalValues, {
      employeeId: "employee-2",
      date: "2026-10-05T00:00:00.000Z",
      shiftId: "shift-1",
      firstIn: "2026-10-05T03:00:00.000Z",
      lastOut: null,
      workingHours: null,
      lateMinutes: 0,
      earlyMinutes: null,
      status: "MISSING_PUNCH",
      overtimeHours: null,
    });
  });

  it("does not modify the daily result or raw attendance evidence", async () => {
    const stub = createDatabase();
    await submitDailyAttendanceCorrection(employeeActor, "daily-1", {
      requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
      reason: "Forgot to punch out",
    }, stub.database);

    assert.deepEqual(stub.daily, stub.dailyBefore);
    assert.deepEqual(stub.rawMutations, []);
  });

  it("rejects missing daily attendance and missing requester", async () => {
    const missingDaily = createDatabase({ daily: null });
    await assert.rejects(
      submitDailyAttendanceCorrection(employeeActor, "missing", {
        requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
        reason: "Forgot to punch out",
      }, missingDaily.database),
      DailyAttendanceCorrectionTargetNotFoundError,
    );

    const missingRequester = createDatabase({ requesterExists: false });
    await assert.rejects(
      submitDailyAttendanceCorrection(employeeActor, "daily-1", {
        requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
        reason: "Forgot to punch out",
      }, missingRequester.database),
      DailyAttendanceCorrectionRequesterNotFoundError,
    );
    assert.equal(missingRequester.requests.length, 0);
  });

  it("rejects requesters without the correction submission permission", async () => {
    const stub = createDatabase();
    await assert.rejects(
      submitDailyAttendanceCorrection({ id: "manager-user", role: Role.DEPARTMENT_MANAGER }, "daily-1", {
        requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
        reason: "Correction",
      }, stub.database),
      DailyAttendanceCorrectionAccessError,
    );
    assert.equal(stub.requests.length, 0);
  });

  it("rejects a target Employee without a linked User instead of attributing the request to its requester", async () => {
    const noLinkedUser = createDatabase({
      daily: { ...originalDaily, employee: { ...originalDaily.employee, id: "employee-2", userId: null } },
    });
    await assert.rejects(
      submitDailyAttendanceCorrection(supervisorActor, "daily-1", {
        requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
        reason: "Correction",
      }, noLinkedUser.database),
      DailyAttendanceCorrectionSubjectUserNotFoundError,
    );
    assert.equal(noLinkedUser.requests.length, 0);
  });

  it("creates separate requests for repeated submissions without overwriting prior requests", async () => {
    const stub = createDatabase();
    const firstInput = { requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" }, reason: "First request" };
    const secondInput = { requestedValues: { lastOut: "2026-10-05T12:01:00.000Z" }, reason: "Second request" };
    const first = await submitDailyAttendanceCorrection(employeeActor, "daily-1", firstInput, stub.database);
    const second = await submitDailyAttendanceCorrection(employeeActor, "daily-1", secondInput, stub.database);

    assert.notEqual(first.id, second.id);
    assert.equal(stub.requests.length, 2);
    assert.equal(stub.requests[0]?.status, AttendanceCorrectionStatus.PENDING);
    assert.equal(stub.requests[1]?.status, AttendanceCorrectionStatus.PENDING);
  });
});

async function employeeCorrection(stub: ReturnType<typeof createDatabase>) {
  return submitDailyAttendanceCorrection(employeeActor, "daily-1", {
    requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
    reason: "Forgot to punch out",
  }, stub.database);
}

describe("attendance correction approvals", () => {
  it("lists supervisor review only for requests assigned to that supervisor", async () => {
    const stub = createDatabase();
    await employeeCorrection(stub);
    const items = await listDailyAttendanceCorrections(supervisorActor, stub.database);
    assert.equal(items.length, 1);
    assert.deepEqual(stub.requests[0]?.currentApprovalStage, AttendanceCorrectionApprovalStage.SUPERVISOR);
    assert.deepEqual(stub.correctionQueries[0], {
      status: AttendanceCorrectionStatus.PENDING,
      currentApprovalStage: AttendanceCorrectionApprovalStage.SUPERVISOR,
      dailyAttendance: { employee: { supervisor: { userId: supervisorActor.id } } },
    });

    const unassigned = createDatabase({ supervisorUserId: "other-supervisor" });
    await employeeCorrection(unassigned);
    await assert.rejects(
      decideDailyAttendanceCorrection(supervisorActor, "correction-1", { action: "APPROVE" }, unassigned.database),
      DailyAttendanceCorrectionReviewerScopeError,
    );
  });

  it("advances an assigned employee correction from Supervisor to HR without applying it", async () => {
    const stub = createDatabase();
    const request = await employeeCorrection(stub);
    const result = await decideDailyAttendanceCorrection(supervisorActor, request.id, { action: "APPROVE" }, stub.database);

    assert.equal(result.status, AttendanceCorrectionStatus.PENDING);
    assert.equal(result.currentApprovalStage, AttendanceCorrectionApprovalStage.HR);
    assert.equal(stub.daily?.lastOut, null);
    assert.equal(stub.audits.at(-1)?.actionType, "ATTENDANCE_CORRECTION_SUPERVISOR_APPROVED");
    assert.equal(stub.audits.at(-1)?.actorId, supervisorActor.id);
    assert.equal(stub.audits.at(-1)?.correctionRequestId, request.id);
  });

  it("allows the assigned Supervisor to reject and records the rejection", async () => {
    const stub = createDatabase();
    const request = await employeeCorrection(stub);
    const result = await decideDailyAttendanceCorrection(
      supervisorActor,
      request.id,
      { action: "REJECT", reason: "Incorrect requested time" },
      stub.database,
    );

    assert.equal(result.status, AttendanceCorrectionStatus.REJECTED);
    assert.equal(result.currentApprovalStage, null);
    assert.equal(stub.daily?.lastOut, null);
    assert.equal(stub.audits.at(-1)?.actionType, "ATTENDANCE_CORRECTION_REJECTED");
    assert.equal(stub.audits.at(-1)?.reason, "Incorrect requested time");
  });

  it("sends a Supervisor-submitted correction directly to HR review", async () => {
    const subjectDaily = {
      ...originalDaily,
      employeeId: "employee-2",
      employee: { ...originalDaily.employee, id: "employee-2", userId: "subject-user" },
    };
    const stub = createDatabase({ daily: subjectDaily });
    const request = await submitDailyAttendanceCorrection(supervisorActor, "daily-1", {
      requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
      reason: "Forgot to punch out",
    }, stub.database);
    assert.equal(request.currentApprovalStage, AttendanceCorrectionApprovalStage.HR);
    const items = await listDailyAttendanceCorrections({ id: "hr-user", role: Role.HR_ADMINISTRATOR }, stub.database);
    assert.equal(items.length, 1);
  });

  it("lets HR approve the final correction and applies only requested daily values", async () => {
    const stub = createDatabase();
    const request = await employeeCorrection(stub);
    await decideDailyAttendanceCorrection(supervisorActor, request.id, { action: "APPROVE" }, stub.database);
    const snapshot = structuredClone(stub.requests[0]?.originalValues);
    const result = await decideDailyAttendanceCorrection(
      { id: "hr-user", role: Role.HR_ADMINISTRATOR },
      request.id,
      { action: "APPROVE" },
      stub.database,
    );

    assert.equal(result.status, AttendanceCorrectionStatus.APPROVED);
    assert.equal(result.currentApprovalStage, null);
    assert.equal(stub.daily?.lastOut?.toISOString(), "2026-10-05T12:00:00.000Z");
    assert.equal(stub.daily?.workingHours, 9);
    assert.equal(stub.daily?.lateMinutes, 0);
    assert.equal(stub.daily?.earlyMinutes, 0);
    assert.equal(stub.daily?.status, "PRESENT");
    assert.deepEqual(stub.requests[0]?.originalValues, snapshot);
    assert.deepEqual(stub.rawMutations, []);
    assert.deepEqual(stub.rawPunches, stub.rawBefore);
    assert.equal(stub.audits.at(-1)?.actorId, "hr-user");
    assert.equal(stub.audits.at(-1)?.employeeId, "user-1");
    assert.equal(stub.audits.at(-1)?.correctionRequestId, request.id);
    assert.equal(stub.audits.at(-1)?.actionType, "ATTENDANCE_CORRECTION_HR_APPROVED");
    assert.equal(stub.audits.at(-1)?.reason, "Forgot to punch out");
  });

  it("recalculates late and early metrics from corrected punches using the attendance engine", async () => {
    const lateStub = createDatabase();
    const lateRequest = await submitDailyAttendanceCorrection(employeeActor, "daily-1", {
      requestedValues: {
        firstIn: "2026-10-05T03:18:00.000Z",
        lastOut: "2026-10-05T12:00:00.000Z",
      },
      reason: "Corrected attendance times",
    }, lateStub.database);
    await decideDailyAttendanceCorrection(supervisorActor, lateRequest.id, { action: "APPROVE" }, lateStub.database);
    await decideDailyAttendanceCorrection(
      { id: "hr-user", role: Role.HR_ADMINISTRATOR },
      lateRequest.id,
      { action: "APPROVE" },
      lateStub.database,
    );

    assert.equal(lateStub.daily?.firstIn?.toISOString(), "2026-10-05T03:18:00.000Z");
    assert.equal(lateStub.daily?.lastOut?.toISOString(), "2026-10-05T12:00:00.000Z");
    assert.equal(lateStub.daily?.workingHours, 8.7);
    assert.equal(lateStub.daily?.lateMinutes, 8);
    assert.equal(lateStub.daily?.earlyMinutes, 0);
    assert.equal(lateStub.daily?.status, "LATE");
    assert.deepEqual(lateStub.rawPunches, lateStub.rawBefore);

    const earlyStub = createDatabase();
    const earlyRequest = await submitDailyAttendanceCorrection(employeeActor, "daily-1", {
      requestedValues: {
        firstIn: "2026-10-05T03:00:00.000Z",
        lastOut: "2026-10-05T11:30:00.000Z",
      },
      reason: "Corrected departure time",
    }, earlyStub.database);
    await decideDailyAttendanceCorrection(supervisorActor, earlyRequest.id, { action: "APPROVE" }, earlyStub.database);
    await decideDailyAttendanceCorrection(
      { id: "hr-user", role: Role.HR_ADMINISTRATOR },
      earlyRequest.id,
      { action: "APPROVE" },
      earlyStub.database,
    );

    assert.equal(earlyStub.daily?.firstIn?.toISOString(), "2026-10-05T03:00:00.000Z");
    assert.equal(earlyStub.daily?.lastOut?.toISOString(), "2026-10-05T11:30:00.000Z");
    assert.equal(earlyStub.daily?.workingHours, 8.5);
    assert.equal(earlyStub.daily?.lateMinutes, 0);
    assert.equal(earlyStub.daily?.earlyMinutes, 30);
    assert.equal(earlyStub.daily?.status, "EARLY_OUT");
    assert.deepEqual(earlyStub.rawPunches, earlyStub.rawBefore);
  });

  it("allows HR to reject an HR-stage correction without changing attendance", async () => {
    const subjectDaily = {
      ...originalDaily,
      employeeId: "employee-2",
      employee: { ...originalDaily.employee, id: "employee-2", userId: "subject-user" },
    };
    const stub = createDatabase({ daily: subjectDaily });
    const request = await submitDailyAttendanceCorrection(supervisorActor, "daily-1", {
      requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
      reason: "Forgot to punch out",
    }, stub.database);
    const result = await decideDailyAttendanceCorrection(
      { id: "hr-user", role: Role.HR_ADMINISTRATOR },
      request.id,
      { action: "REJECT" },
      stub.database,
    );
    assert.equal(result.status, AttendanceCorrectionStatus.REJECTED);
    assert.equal(stub.daily?.lastOut, null);
    assert.equal(stub.audits.at(-1)?.actionType, "ATTENDANCE_CORRECTION_REJECTED");
  });

  it("rejects non-reviewer roles and finalized requests", async () => {
    const stub = createDatabase();
    const request = await employeeCorrection(stub);
    await assert.rejects(
      decideDailyAttendanceCorrection(employeeActor, request.id, { action: "APPROVE" }, stub.database),
      DailyAttendanceCorrectionAccessError,
    );
    await decideDailyAttendanceCorrection(supervisorActor, request.id, { action: "REJECT" }, stub.database);
    await assert.rejects(
      decideDailyAttendanceCorrection(supervisorActor, request.id, { action: "APPROVE" }, stub.database),
      DailyAttendanceCorrectionStageError,
    );
  });

  it("rejects a reviewer whose role does not match the current approval stage", async () => {
    const stub = createDatabase();
    const request = await employeeCorrection(stub);
    await assert.rejects(
      decideDailyAttendanceCorrection(
        { id: "hr-user", role: Role.HR_ADMINISTRATOR },
        request.id,
        { action: "APPROVE" },
        stub.database,
      ),
      DailyAttendanceCorrectionAccessError,
    );
    assert.equal(stub.requests[0]?.currentApprovalStage, AttendanceCorrectionApprovalStage.SUPERVISOR);
  });

  it("rejects stale correction values rather than overwriting a recalculated daily record", async () => {
    const stub = createDatabase();
    const request = await employeeCorrection(stub);
    if (stub.daily) stub.daily.lastOut = new Date("2026-10-05T11:00:00.000Z");
    await assert.rejects(
      decideDailyAttendanceCorrection(supervisorActor, request.id, { action: "APPROVE" }, stub.database),
      DailyAttendanceCorrectionConflictError,
    );
    assert.equal(stub.requests[0]?.currentApprovalStage, AttendanceCorrectionApprovalStage.SUPERVISOR);
  });
});
