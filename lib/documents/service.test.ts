import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import { MockPrivateDocumentStorage, StoredDocumentNotFoundError } from "./storage";
import {
  DocumentAuthorizationError,
  EmployeeDocumentNotFoundError,
  EmployeeDocumentOperationError,
  listEmployeeDocuments,
  uploadEmployeeDocument,
  getEmployeeDocumentDownload,
} from "./service";

const admin = { id: "admin-user", role: Role.ADMIN };
const owner = { id: "employee-user", role: Role.EMPLOYEE };
const otherEmployee = { id: "other-user", role: Role.EMPLOYEE };
const uploadPolicy = { maxBytes: 8192, allowedExtensions: new Set(["pdf"]) };
const pdfBytes = Buffer.from(`%PDF-1.7\n${"synthetic document test ".repeat(256)}`);
type StoredDocument = {
  id: string;
  employeeId: string;
  type: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: bigint;
  expiresAt: Date | null;
  uploadedById: string;
  storageKey: string;
  uploadedBy: { id: string; name: string };
  employee: { userId: string | null };
};
const pdfFile = (name = "contract.pdf") => ({
  name,
  size: pdfBytes.byteLength,
  arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer,
});

function createDatabaseStub(options: { userId?: string | null; createFailure?: boolean } = {}) {
  const employee = { id: "employee-record-1", userId: options.userId === undefined ? owner.id : options.userId };
  const documents = new Map<string, StoredDocument>();
  const auditEvents: Array<Record<string, unknown>> = [];
  let lastWhere: Record<string, unknown> | undefined;
  let lastCreate: Record<string, unknown> | undefined;
  let transactionCount = 0;

  const database = {
    employee: {
      findUnique: async ({ where }: { where: { userId: string } }) => where.userId === employee.userId ? employee : null,
      findFirst: async ({ where }: { where: { OR: Array<{ id?: string; userId?: string }> } }) => {
        const found = where.OR.some((filter) => filter.id === employee.id || filter.userId === employee.userId);
        return found ? employee : null;
      },
    },
    employeeDocument: {
      findMany: async ({ where, select }: { where: { employeeId: string }; select: Record<string, unknown> }) => {
        lastWhere = where;
        return [...documents.values()].filter((document) => document.employeeId === where.employeeId).map((document) => {
          const { storageKey: _storageKey, ...safeDocument } = document;
          return safeDocument;
        });
      },
      findUnique: async ({ where }: { where: { id: string } }) => documents.get(where.id) ?? null,
      create: async ({ data, select }: { data: Record<string, unknown>; select: Record<string, unknown> }) => {
        if (options.createFailure) throw new Error("test database failure");
        lastCreate = data;
        const id = "document-record-1";
        documents.set(id, {
          id,
          employeeId: String(data.employeeId),
          type: String(data.type),
          originalFilename: String(data.originalFilename),
          contentType: String(data.contentType),
          sizeBytes: data.sizeBytes as bigint,
          expiresAt: data.expiresAt as Date | null,
          uploadedById: String(data.uploadedById),
          storageKey: String(data.storageKey),
          uploadedBy: { id: String(data.uploadedById), name: "Test Uploader" },
          employee: { userId: employee.userId },
        });
        return Object.fromEntries(Object.keys(select).map((key) => [key, id]));
      },
    },
    attendanceAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => { auditEvents.push(data); return { id: "audit-1" }; },
    },
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) => {
      transactionCount += 1;
      return operation(database);
    },
  } as never;

  return { database, employee, documents, auditEvents, getLastWhere: () => lastWhere, getLastCreate: () => lastCreate, getTransactionCount: () => transactionCount };
}

describe("employee document service", () => {
  it("stores private bytes and SRS metadata against the authenticated employee record", async () => {
    const stub = createDatabaseStub();
    const storage = new MockPrivateDocumentStorage();

    const result = await uploadEmployeeDocument(owner, {
      employeeId: "attacker-controlled-id",
      type: "CONTRACT",
      expiresAt: "2027-01-31",
      file: pdfFile(),
    }, uploadPolicy, storage, stub.database);

    const stored = [...stub.documents.values()][0];
    assert.equal(result.id, "document-record-1");
    assert.equal(stored.employeeId, stub.employee.id);
    assert.equal(stored.type, "CONTRACT");
    assert.equal(stored.originalFilename, "contract.pdf");
    assert.equal(stored.contentType, "application/pdf");
    assert.equal(stored.sizeBytes, BigInt(pdfBytes.byteLength));
    assert.equal(stored.expiresAt?.toISOString().slice(0, 10), "2027-01-31");
    assert.equal(stored.uploadedById, owner.id);
    assert.equal("storageKey" in result, false);
    assert.equal(stub.auditEvents[0].employeeId, owner.id);
    assert.deepEqual(stub.auditEvents[0].newValues, { changedFields: ["employeeRecordId", "documentType", "uploadedAt", "expiresAt", "uploadedBy"] });
    assert.equal(JSON.stringify(stub.auditEvents).includes("contract.pdf"), false);
  });

  it("lets admins upload to an explicitly selected Employee and allows admin listing", async () => {
    const stub = createDatabaseStub();
    const storage = new MockPrivateDocumentStorage();

    await uploadEmployeeDocument(admin, { employeeId: "employee-record-1", type: "CERTIFICATE", file: pdfFile() }, uploadPolicy, storage, stub.database);
    const documents = await listEmployeeDocuments(admin, "employee-record-1", stub.database);

    assert.equal(stub.getLastCreate()?.employeeId, "employee-record-1");
    assert.deepEqual(stub.getLastWhere(), { employeeId: "employee-record-1" });
    assert.equal(documents.length, 1);
    assert.equal("storageKey" in documents[0], false);
  });

  it("ignores an employee-supplied Employee ID when listing and rejects cross-employee document access", async () => {
    const stub = createDatabaseStub();
    const storage = new MockPrivateDocumentStorage();
    const saved = await uploadEmployeeDocument(owner, { type: "NIC_COPY", file: pdfFile() }, uploadPolicy, storage, stub.database);

    const ownDocuments = await listEmployeeDocuments(owner, "victim-employee-record", stub.database);
    assert.deepEqual(stub.getLastWhere(), { employeeId: stub.employee.id });
    assert.equal(ownDocuments.length, 1);
    await assert.rejects(getEmployeeDocumentDownload(otherEmployee, saved.id, storage, stub.database), EmployeeDocumentNotFoundError);
    const missingOwnerDatabase = {
      employee: { findUnique: async () => null },
      employeeDocument: { findMany: async () => [], findUnique: async () => null },
    } as never;
    await assert.rejects(listEmployeeDocuments(otherEmployee, undefined, missingOwnerDatabase), EmployeeDocumentNotFoundError);
  });

  it("rejects unauthenticated access and ignores a client target when an employee uploads", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(listEmployeeDocuments(null, undefined, stub.database), DocumentAuthorizationError);
    await uploadEmployeeDocument(owner, { employeeId: "someone-else", type: "CONTRACT", file: pdfFile() }, uploadPolicy, new MockPrivateDocumentStorage(), stub.database);
    assert.equal(stub.getLastCreate()?.employeeId, stub.employee.id);
  });

  it("streams through the storage abstraction and maps missing objects safely", async () => {
    const stub = createDatabaseStub();
    const storage = new MockPrivateDocumentStorage();
    const uploaded = await uploadEmployeeDocument(owner, { type: "OTHER", file: pdfFile() }, uploadPolicy, storage, stub.database);

    const downloaded = await getEmployeeDocumentDownload(owner, uploaded.id, storage, stub.database);
    const reader = downloaded.body.getReader();
    const chunk = await reader.read();
    assert.equal(Buffer.from(chunk.value!).toString(), pdfBytes.toString());
    assert.equal(downloaded.filename, "contract.pdf");

    storage.failNext("get");
    await assert.rejects(getEmployeeDocumentDownload(owner, uploaded.id, storage, stub.database), EmployeeDocumentOperationError);
    await assert.rejects(getEmployeeDocumentDownload(owner, "missing", storage, stub.database), EmployeeDocumentNotFoundError);
  });

  it("removes the private object when metadata/audit transaction fails", async () => {
    const stub = createDatabaseStub({ createFailure: true });
    const storage = new MockPrivateDocumentStorage();

    await assert.rejects(uploadEmployeeDocument(owner, { type: "CONTRACT", file: pdfFile() }, uploadPolicy, storage, stub.database), EmployeeDocumentOperationError);
    assert.equal(stub.getTransactionCount(), 1);
  });

  it("maps private storage errors without leaking provider details", async () => {
    const stub = createDatabaseStub();
    const storage = new MockPrivateDocumentStorage();
    storage.failNext("put");

    await assert.rejects(uploadEmployeeDocument(owner, { type: "CONTRACT", file: pdfFile() }, uploadPolicy, storage, stub.database), (error: unknown) => {
      assert.ok(error instanceof EmployeeDocumentOperationError);
      assert.equal(error.message.includes("test"), false);
      return true;
    });
  });
});
