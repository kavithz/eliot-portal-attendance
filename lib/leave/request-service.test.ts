import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LeaveRequestStatus, Role } from "@prisma/client";
import {
  getOwnLeaveRequest,
  LeaveRequestAccessError,
  LeaveRequestAttachmentNotFoundError,
  LeaveRequestEmployeeNotFoundError,
  LeaveRequestLeaveTypeNotFoundError,
  LeaveRequestNotFoundError,
  listOwnLeaveRequests,
  submitOwnLeaveRequest,
} from "@/lib/leave/request-service";
import { leaveRequestInputSchema } from "@/lib/leave/validation";

const employeeActor = { id: "employee-user-1", role: Role.EMPLOYEE };
const requestInput = {
  leaveTypeId: "leave-type-1",
  startDate: "2026-10-12",
  endDate: "2026-10-13",
  reason: "Personal appointment",
  attachmentDocumentId: null,
};

function createRequestDatabaseStub() {
  const employees = new Map([
    ["employee-user-1", { id: "employee-1", userId: "employee-user-1" }],
    ["employee-user-2", { id: "employee-2", userId: "employee-user-2" }],
  ]);
  const leaveTypes = new Set(["leave-type-1"]);
  const documents = new Map([
    ["document-1", { id: "document-1", employeeId: "employee-1" }],
    ["document-2", { id: "document-2", employeeId: "employee-2" }],
  ]);
  const requests: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  let nextId = 1;
  const tx = {
    employee: {
      findUnique: async ({ where }: { where: { userId: string } }) => employees.get(where.userId) ?? null,
    },
    leaveType: {
      findUnique: async ({ where }: { where: { id: string } }) => leaveTypes.has(where.id) ? { id: where.id } : null,
    },
    employeeDocument: {
      findFirst: async ({ where }: { where: { id: string; employeeId: string } }) => {
        const document = documents.get(where.id);
        return document?.employeeId === where.employeeId ? { id: document.id } : null;
      },
    },
    leaveRequest: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `leave-request-${nextId++}`,
          ...data,
          currentApprovalStage: null,
          currentApproverId: null,
          decisionReason: null,
          reviewedById: null,
          reviewedAt: null,
          createdAt: new Date("2026-10-05T10:00:00.000Z"),
          updatedAt: new Date("2026-10-05T10:00:00.000Z"),
          leaveType: { id: data.leaveTypeId, name: "Annual Leave" },
        };
        requests.push(created);
        return created;
      },
      findMany: async ({ where, skip, take }: { where: { employeeId: string }; skip: number; take: number }) => requests
        .filter((request) => request.employeeId === where.employeeId)
        .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())
        .slice(skip, skip + take),
      count: async ({ where }: { where: { employeeId: string } }) => requests
        .filter((request) => request.employeeId === where.employeeId).length,
      findFirst: async ({ where }: { where: { id: string; employeeId: string } }) => requests
        .find((request) => request.id === where.id && request.employeeId === where.employeeId) ?? null,
    },
    attendanceAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return { id: `audit-${audits.length}` };
      },
    },
  };
  const database = {
    ...tx,
    $transaction: async <T>(operation: (transaction: typeof tx) => Promise<T>) => operation(tx),
  } as never;
  return { database, requests, audits };
}

describe("Leave request validation", () => {
  it("requires a Leave Type, valid date range, and nonblank reason", () => {
    assert.equal(leaveRequestInputSchema.safeParse(requestInput).success, true);
    assert.equal(leaveRequestInputSchema.safeParse({ ...requestInput, leaveTypeId: "" }).success, false);
    assert.equal(leaveRequestInputSchema.safeParse({ ...requestInput, startDate: "2026-02-30" }).success, false);
    assert.equal(leaveRequestInputSchema.safeParse({ ...requestInput, endDate: "2026-10-11" }).success, false);
    assert.equal(leaveRequestInputSchema.safeParse({ ...requestInput, reason: "   " }).success, false);
  });
});

describe("Leave request submission and self-service history", () => {
  it("submits a PENDING request for the actor's linked Employee and audits without reason or attachment details", async () => {
    const stub = createRequestDatabaseStub();
    const request = await submitOwnLeaveRequest(employeeActor, {
      ...requestInput,
      employeeId: "employee-2",
    }, stub.database);
    assert.equal(stub.requests[0]?.employeeId, "employee-1");
    assert.equal(request.status, LeaveRequestStatus.PENDING);
    assert.equal(request.currentApprovalStage, null);
    assert.equal(request.currentApproverId, null);
    assert.equal(stub.audits.length, 1);
    assert.equal(stub.audits[0]?.employeeId, "employee-user-1");
    assert.equal(stub.audits[0]?.actionType, "LEAVE_REQUEST_SUBMITTED");
    assert.equal(JSON.stringify(stub.audits).includes("Personal appointment"), false);
    assert.equal(JSON.stringify(stub.audits).includes("employee-2"), false);
  });

  it("rejects unauthorized roles and accounts without a linked Employee", async () => {
    const stub = createRequestDatabaseStub();
    await assert.rejects(
      submitOwnLeaveRequest({ id: "admin-user", role: Role.ADMIN }, requestInput, stub.database),
      LeaveRequestAccessError,
    );
    await assert.rejects(
      submitOwnLeaveRequest({ id: "unlinked-user", role: Role.EMPLOYEE }, requestInput, stub.database),
      LeaveRequestEmployeeNotFoundError,
    );
    assert.equal(stub.requests.length, 0);
  });

  it("rejects nonexistent Leave Types and attachments belonging to another Employee", async () => {
    const stub = createRequestDatabaseStub();
    await assert.rejects(
      submitOwnLeaveRequest(employeeActor, { ...requestInput, leaveTypeId: "missing" }, stub.database),
      LeaveRequestLeaveTypeNotFoundError,
    );
    await assert.rejects(
      submitOwnLeaveRequest(employeeActor, { ...requestInput, attachmentDocumentId: "document-2" }, stub.database),
      LeaveRequestAttachmentNotFoundError,
    );
    const withAttachment = await submitOwnLeaveRequest(employeeActor, {
      ...requestInput,
      attachmentDocumentId: "document-1",
    }, stub.database);
    assert.equal(withAttachment.attachmentDocumentId, "document-1");
    assert.equal(stub.requests.length, 1);
  });

  it("lists and reads only the actor's own Leave requests", async () => {
    const stub = createRequestDatabaseStub();
    const first = await submitOwnLeaveRequest(employeeActor, requestInput, stub.database);
    await submitOwnLeaveRequest({ id: "employee-user-2", role: Role.EMPLOYEE }, requestInput, stub.database);
    const history = await listOwnLeaveRequests(employeeActor, { page: 1, pageSize: 10 }, stub.database);
    assert.equal(history.total, 1);
    assert.equal(history.items[0]?.id, first.id);
    assert.equal((await getOwnLeaveRequest(employeeActor, first.id, stub.database)).id, first.id);
    await assert.rejects(
      getOwnLeaveRequest(employeeActor, "leave-request-2", stub.database),
      LeaveRequestNotFoundError,
    );
  });
});
