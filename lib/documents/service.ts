import "server-only";

import { randomUUID } from "node:crypto";
import type { EmployeeDocumentType, PrismaClient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeEmployeeAuditEvent } from "@/lib/employees/service";
import {
  DocumentStorageOperationError,
  DocumentStorageUnavailableError,
  StoredDocumentNotFoundError,
  type PrivateDocumentStorage,
} from "@/lib/documents/storage";
import {
  employeeDocumentMetadataSchema,
  validateDocumentUpload,
  type DocumentUploadFile,
  type DocumentUploadPolicy,
} from "@/lib/documents/validation";

type DocumentActor = { id: string; role: Role };
type DocumentDatabase = Pick<PrismaClient, "employee" | "employeeDocument" | "attendanceAuditLog" | "$transaction">;

const safeDocumentSelect = {
  id: true,
  type: true,
  originalFilename: true,
  contentType: true,
  sizeBytes: true,
  uploadedAt: true,
  expiresAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const;

export class DocumentAuthorizationError extends Error {
  constructor() {
    super("You do not have permission to access this document.");
    this.name = "DocumentAuthorizationError";
  }
}

export class EmployeeDocumentNotFoundError extends Error {
  constructor() {
    super("Document not found.");
    this.name = "EmployeeDocumentNotFoundError";
  }
}

export class EmployeeDocumentOperationError extends Error {
  constructor() {
    super("The document operation could not be completed.");
    this.name = "EmployeeDocumentOperationError";
  }
}

function assertActor(actor: DocumentActor | null): asserts actor is DocumentActor {
  if (!actor) throw new DocumentAuthorizationError();
}

function asSafeDocument<T extends { sizeBytes: bigint }>(document: T) {
  return { ...document, sizeBytes: Number(document.sizeBytes) };
}

async function findEmployeeForActor(
  actor: DocumentActor,
  requestedEmployeeId: string | undefined,
  database: DocumentDatabase,
) {
  if (actor.role !== "ADMIN") {
    const employee = await database.employee.findUnique({
      where: { userId: actor.id },
      select: { id: true, userId: true },
    });
    if (!employee) throw new EmployeeDocumentNotFoundError();
    return employee;
  }

  if (!requestedEmployeeId) throw new EmployeeDocumentNotFoundError();
  const employee = await database.employee.findFirst({
    where: { OR: [{ id: requestedEmployeeId }, { userId: requestedEmployeeId }] },
    select: { id: true, userId: true },
  });
  if (!employee) throw new EmployeeDocumentNotFoundError();
  return employee;
}

export async function listEmployeeDocuments(
  actor: DocumentActor | null,
  requestedEmployeeId?: string,
  database: DocumentDatabase = prisma,
) {
  assertActor(actor);
  const employee = await findEmployeeForActor(actor, requestedEmployeeId, database);
  const documents = await database.employeeDocument.findMany({
    where: { employeeId: employee.id },
    select: safeDocumentSelect,
    orderBy: [{ uploadedAt: "desc" }, { id: "asc" }],
  });
  return documents.map(asSafeDocument);
}

export async function uploadEmployeeDocument(
  actor: DocumentActor | null,
  input: { employeeId?: unknown; type: unknown; expiresAt?: unknown; file: DocumentUploadFile },
  policy: DocumentUploadPolicy,
  storage: PrivateDocumentStorage,
  database: DocumentDatabase = prisma,
) {
  assertActor(actor);
  const metadata = employeeDocumentMetadataSchema.parse({
    employeeId: input.employeeId,
    type: input.type,
    expiresAt: input.expiresAt,
  });
  const employee = await findEmployeeForActor(actor, metadata.employeeId, database);
  const validatedFile = await validateDocumentUpload(input.file, policy);
  const storageKey = `employee-documents/${employee.id}/${randomUUID()}`;

  try {
    await storage.put(storageKey, validatedFile.content);
  } catch {
    throw new EmployeeDocumentOperationError();
  }

  try {
    const document = await database.$transaction(async (transaction) => {
      const created = await transaction.employeeDocument.create({
        data: {
          employeeId: employee.id,
          type: metadata.type as EmployeeDocumentType,
          originalFilename: validatedFile.filename,
          storageKey,
          contentType: validatedFile.contentType,
          sizeBytes: BigInt(validatedFile.sizeBytes),
          expiresAt: metadata.expiresAt,
          uploadedById: actor.id,
        },
        select: { id: true },
      });
      await writeEmployeeAuditEvent(transaction, {
        employeeId: employee.userId,
        actorId: actor.id,
        actionType: "EMPLOYEE_DOCUMENT_UPLOADED",
        changedFields: ["employeeRecordId", "documentType", "uploadedAt", "expiresAt", "uploadedBy"],
      });
      return created;
    });

    return document;
  } catch {
    try {
      await storage.delete(storageKey);
    } catch {
      throw new EmployeeDocumentOperationError();
    }
    throw new EmployeeDocumentOperationError();
  }
}

export async function getEmployeeDocumentDownload(
  actor: DocumentActor | null,
  documentId: string,
  storage: PrivateDocumentStorage,
  database: DocumentDatabase = prisma,
) {
  assertActor(actor);
  const document = await database.employeeDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      originalFilename: true,
      uploadedAt: true,
      expiresAt: true,
      storageKey: true,
      employee: { select: { userId: true } },
    },
  });
  if (!document) throw new EmployeeDocumentNotFoundError();
  if (actor.role !== "ADMIN" && document.employee.userId !== actor.id) {
    throw new EmployeeDocumentNotFoundError();
  }

  try {
    const body = await storage.get(document.storageKey);
    return {
      body,
      filename: document.originalFilename,
      lastModified: document.uploadedAt,
    };
  } catch (error) {
    if (error instanceof StoredDocumentNotFoundError) throw new EmployeeDocumentNotFoundError();
    if (error instanceof DocumentStorageOperationError || error instanceof DocumentStorageUnavailableError) {
      throw new EmployeeDocumentOperationError();
    }
    throw new EmployeeDocumentOperationError();
  }
}