import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AttendanceCorrectionStatus, Role } from "@prisma/client";
import {
  AttendanceCorrectionReportAuthorizationError,
  attendanceCorrectionReportFiltersSchema,
  listAttendanceCorrectionReport,
} from "./correction-report";

const entry = {
  id: "correction-1",
  status: AttendanceCorrectionStatus.APPROVED,
  currentApprovalStage: null,
  originalValues: { lastOut: null },
  requestedValues: { lastOut: "2026-10-05T12:00:00.000Z" },
  reason: "Forgot to punch out",
  decisionNote: null,
  resolutionReason: null,
  requestedAt: new Date("2026-10-05T08:00:00.000Z"),
  reviewedAt: new Date("2026-10-05T09:00:00.000Z"),
  resolvedAt: new Date("2026-10-05T09:00:00.000Z"),
  employee: { id: "employee-user", name: "Affected Employee", employeeCode: "E-001" },
  requester: { id: "requester-user", name: "Requester" },
  reviewedBy: { id: "reviewer-user", name: "Reviewer" },
};

function createDatabase(total = 1) {
  const calls: { count?: unknown; findMany?: unknown; employees?: unknown } = {};
  const database = {
    attendanceCorrectionRequest: {
      count: async (args: unknown) => {
        calls.count = args;
        return total;
      },
      findMany: async (args: unknown) => {
        calls.findMany = args;
        return [entry];
      },
    },
    user: {
      findMany: async (args: unknown) => {
        calls.employees = args;
        return [{ id: "employee-user", name: "Affected Employee", employeeCode: "E-001" }];
      },
    },
  } as never;
  return { database, calls };
}

describe("attendance correction report", () => {
  it("returns persisted request, employee, requester, reviewer, and decision fields", async () => {
    const stub = createDatabase();
    const result = await listAttendanceCorrectionReport({ role: Role.HR_ADMINISTRATOR }, {}, stub.database);

    assert.equal(result.total, 1);
    assert.equal(result.entries[0]?.employee.name, "Affected Employee");
    assert.equal(result.entries[0]?.requester?.name, "Requester");
    assert.equal(result.entries[0]?.reviewedBy?.name, "Reviewer");
    assert.deepEqual(result.entries[0]?.originalValues, { lastOut: null });
    assert.deepEqual(result.entries[0]?.requestedValues, { lastOut: "2026-10-05T12:00:00.000Z" });
    assert.equal(result.entries[0]?.reason, "Forgot to punch out");
    assert.ok(result.entries[0]?.requestedAt instanceof Date);
    assert.ok(result.entries[0]?.reviewedAt instanceof Date);
    assert.deepEqual(stub.calls.employees, {
      where: { correctionRequests: { some: {} } },
      select: { id: true, name: true, employeeCode: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  });

  it("filters by status, affected employee, and inclusive UTC submitted-date range", async () => {
    const stub = createDatabase();
    await listAttendanceCorrectionReport({ role: Role.ADMIN }, {
      status: "APPROVED",
      employeeId: "employee-user",
      from: "2026-10-01",
      to: "2026-10-05",
    }, stub.database);

    const expectedWhere = {
      status: AttendanceCorrectionStatus.APPROVED,
      employeeId: "employee-user",
      requestedAt: {
        gte: new Date("2026-10-01T00:00:00.000Z"),
        lt: new Date("2026-10-06T00:00:00.000Z"),
      },
    };
    assert.deepEqual(stub.calls.count, { where: expectedWhere });
    assert.deepEqual((stub.calls.findMany as { where: unknown }).where, expectedWhere);
  });

  it("rejects unauthorized roles before querying data", async () => {
    const stub = createDatabase();
    await assert.rejects(
      listAttendanceCorrectionReport({ role: Role.DEPARTMENT_MANAGER }, {}, stub.database),
      AttendanceCorrectionReportAuthorizationError,
    );
    await assert.rejects(listAttendanceCorrectionReport(null, {}, stub.database), AttendanceCorrectionReportAuthorizationError);
    assert.deepEqual(stub.calls, {});
  });

  it("validates status, date, and date range filters", async () => {
    const stub = createDatabase();
    assert.equal(attendanceCorrectionReportFiltersSchema.safeParse({ status: "RETURNED" }).success, false);
    assert.equal(attendanceCorrectionReportFiltersSchema.safeParse({ from: "2026-02-30" }).success, false);
    assert.equal(attendanceCorrectionReportFiltersSchema.safeParse({ from: "2026-10-06", to: "2026-10-05" }).success, false);
    await assert.rejects(listAttendanceCorrectionReport({ role: Role.ADMIN }, { status: "RETURNED" }, stub.database));
    assert.deepEqual(stub.calls, {});
  });

  it("bounds pagination and clamps an out-of-range page", async () => {
    const stub = createDatabase(26);
    const result = await listAttendanceCorrectionReport({ role: Role.ADMIN }, { page: 3 }, stub.database);

    assert.equal(result.page, 2);
    assert.equal(result.pageCount, 2);
    assert.deepEqual(stub.calls.findMany, {
      where: {},
      select: {
        id: true,
        status: true,
        currentApprovalStage: true,
        originalValues: true,
        requestedValues: true,
        reason: true,
        decisionNote: true,
        resolutionReason: true,
        requestedAt: true,
        reviewedAt: true,
        resolvedAt: true,
        employee: { select: { id: true, name: true, employeeCode: true } },
        requester: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
      skip: 25,
      take: 25,
    });
  });
});
