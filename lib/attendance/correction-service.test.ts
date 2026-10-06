import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AttendanceCorrectionStatus, Role } from "@prisma/client";
import {
  DailyAttendanceCorrectionAccessError,
  DailyAttendanceCorrectionRequesterNotFoundError,
  DailyAttendanceCorrectionSubjectUserNotFoundError,
  DailyAttendanceCorrectionTargetNotFoundError,
  dailyAttendanceCorrectionInputSchema,
  submitDailyAttendanceCorrection,
} from "./correction-service";

const employeeActor = { id: "user-1", role: Role.EMPLOYEE };
const supervisorActor = { id: "supervisor-user", role: Role.SUPERVISOR };
const originalDaily = {
  id: "daily-1",
  employeeId: "employee-1",
  date: new Date("2026-10-05T00:00:00.000Z"),
  shiftId: "shift-1",
  firstIn: new Date("2026-10-04T23:00:00.000Z"),
  lastOut: null,
  workingHours: null,
  lateMinutes: 0,
  earlyMinutes: null,
  status: "MISSING_PUNCH",
  overtimeHours: null,
  employee: { id: "employee-1", userId: "user-1" },
};

type TestDaily = Omit<typeof originalDaily, "employee"> & {
  employee: { id: string; userId: string | null };
};

function createDatabase(options: {
  daily?: TestDaily | null;
  requesterExists?: boolean;
} = {}) {
  const daily = options.daily === undefined ? originalDaily : options.daily;
  const dailyBefore = daily ? structuredClone(daily) : null;
  const requests: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const rawMutations: string[] = [];
  const users = new Set(options.requesterExists === false ? [] : ["user-1", "supervisor-user"]);
  let nextId = 1;

  const transaction = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.has(where.id) ? { id: where.id } : null,
    },
    attendanceDaily: {
      findUnique: async ({ where }: { where: { id: string } }) => daily?.id === where.id ? structuredClone(daily) : null,
      update: async () => { throw new Error("AttendanceDaily must not be updated."); },
      updateMany: async () => { throw new Error("AttendanceDaily must not be updated."); },
      delete: async () => { throw new Error("AttendanceDaily must not be deleted."); },
    },
    attendanceRaw: {
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
  } as never;
  return {
    database,
    requests,
    audits,
    rawMutations,
    daily,
    dailyBefore,
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

describe("pending daily attendance correction requests", () => {
  it("allows an authorized Employee to submit their own correction", async () => {
    const stub = createDatabase();
    const requestedValues = { lastOut: "2026-10-05T12:00:00.000Z" };
    const request = await submitDailyAttendanceCorrection(employeeActor, "daily-1", {
      requestedValues,
      reason: "Forgot to punch out",
    }, stub.database);

    assert.equal(request.status, AttendanceCorrectionStatus.PENDING);
    assert.equal(request.dailyAttendanceId, "daily-1");
    assert.equal(request.requesterId, "user-1");
    assert.equal(request.employeeId, "user-1");
    assert.deepEqual(request.originalValues, {
      employeeId: "employee-1",
      date: "2026-10-05T00:00:00.000Z",
      shiftId: "shift-1",
      firstIn: "2026-10-04T23:00:00.000Z",
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
      employee: { id: "employee-2", userId: "subject-user" },
    };
    const stub = createDatabase({ daily: subjectDaily });
    const request = await submitDailyAttendanceCorrection(supervisorActor, "daily-1", {
      requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
      reason: "Forgot to punch out",
    }, stub.database);

    assert.equal(request.requesterId, supervisorActor.id);
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
      firstIn: "2026-10-04T23:00:00.000Z",
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
      daily: { ...originalDaily, employee: { id: "employee-2", userId: null } },
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
