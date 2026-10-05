import "server-only";

import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  organizationListQuerySchema,
  organizationRecordSchema,
} from "@/lib/organization/validation";

type OrganizationAdmin = { role: Role };
type OrganizationDatabase = Pick<PrismaClient, "department" | "designation" | "employee">;
type OrganizationAuditDatabase = Pick<PrismaClient, "attendanceAuditLog">;

export class OrganizationAccessError extends Error {
  constructor() {
    super("Only administrators can manage departments and designations.");
    this.name = "OrganizationAccessError";
  }
}

export class OrganizationNotFoundError extends Error {
  constructor(entity: "Department" | "Designation") {
    super(`${entity} not found.`);
    this.name = "OrganizationNotFoundError";
  }
}

export class OrganizationInUseError extends Error {
  constructor(entity: "Department" | "Designation") {
    super(`This ${entity.toLowerCase()} cannot be deleted while employees are assigned to it.`);
    this.name = "OrganizationInUseError";
  }
}

export async function writeOrganizationAuditEvent(
  database: OrganizationAuditDatabase,
  input: {
    entity: "Department" | "Designation";
    entityId: string;
    actorId: string;
    operation: "CREATED" | "UPDATED" | "DELETED";
  },
) {
  const changedFields = input.operation === "DELETED" ? ["id"] : ["name"];
  await database.attendanceAuditLog.create({
    data: {
      actorId: input.actorId,
      actionType: `${input.entity.toUpperCase()}_${input.operation}`,
      ...(input.operation === "CREATED" ? {} : { previousValues: { entityId: input.entityId, changedFields } }),
      ...(input.operation === "DELETED" ? {} : { newValues: { entityId: input.entityId, changedFields } }),
      reason: `Administrator ${input.operation.toLowerCase()} ${input.entity.toLowerCase()}; field values are omitted.`,
    },
    select: { id: true },
  });
}

function assertAdmin(admin: OrganizationAdmin) {
  if (admin.role !== "ADMIN") throw new OrganizationAccessError();
}

function entityNameError(entity: "Department" | "Designation", error: unknown): never {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "P2003") throw new OrganizationInUseError(entity);
    if (error.code === "P2025") throw new OrganizationNotFoundError(entity);
  }
  throw error;
}

async function listDepartments(admin: OrganizationAdmin, input: unknown, database: OrganizationDatabase) {
  assertAdmin(admin);
  const { query, page, pageSize } = organizationListQuerySchema.parse(input);
  const where: Prisma.DepartmentWhereInput = query ? { name: { contains: query, mode: "insensitive" } } : {};
  return Promise.all([
    database.department.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    }),
    database.department.count({ where }),
  ]).then(([items, total]) => ({ items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }));
}

async function listDesignations(admin: OrganizationAdmin, input: unknown, database: OrganizationDatabase) {
  assertAdmin(admin);
  const { query, page, pageSize } = organizationListQuerySchema.parse(input);
  const where: Prisma.DesignationWhereInput = query ? { name: { contains: query, mode: "insensitive" } } : {};
  return Promise.all([
    database.designation.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    }),
    database.designation.count({ where }),
  ]).then(([items, total]) => ({ items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) }));
}

export function listOrganizationRecords(
  entity: "Department" | "Designation",
  admin: OrganizationAdmin,
  input: unknown = {},
  database: OrganizationDatabase = prisma,
) {
  return entity === "Department"
    ? listDepartments(admin, input, database)
    : listDesignations(admin, input, database);
}

export async function listOrganizationOptions(
  admin: OrganizationAdmin,
  database: OrganizationDatabase = prisma,
) {
  assertAdmin(admin);
  const [departments, designations] = await Promise.all([
    database.department.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
    database.designation.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
  ]);
  return { departments, designations };
}

export async function getOrganizationRecord(
  entity: "Department" | "Designation",
  admin: OrganizationAdmin,
  id: string,
  database: OrganizationDatabase = prisma,
) {
  assertAdmin(admin);
  const record = entity === "Department"
    ? await database.department.findUnique({ where: { id }, select: { id: true, name: true, createdAt: true, updatedAt: true } })
    : await database.designation.findUnique({ where: { id }, select: { id: true, name: true, createdAt: true, updatedAt: true } });
  if (!record) throw new OrganizationNotFoundError(entity);
  return record;
}

export async function createOrganizationRecord(
  entity: "Department" | "Designation",
  admin: OrganizationAdmin,
  input: unknown,
  database: OrganizationDatabase = prisma,
) {
  assertAdmin(admin);
  const { name } = organizationRecordSchema.parse(input);
  return entity === "Department"
    ? database.department.create({ data: { name }, select: { id: true, name: true } })
    : database.designation.create({ data: { name }, select: { id: true, name: true } });
}

export async function updateOrganizationRecord(
  entity: "Department" | "Designation",
  admin: OrganizationAdmin,
  id: string,
  input: unknown,
  database: OrganizationDatabase = prisma,
) {
  assertAdmin(admin);
  const { name } = organizationRecordSchema.parse(input);
  try {
    return entity === "Department"
      ? await database.department.update({ where: { id }, data: { name }, select: { id: true, name: true } })
      : await database.designation.update({ where: { id }, data: { name }, select: { id: true, name: true } });
  } catch (error) {
    entityNameError(entity, error);
  }
}

export async function deleteOrganizationRecord(
  entity: "Department" | "Designation",
  admin: OrganizationAdmin,
  id: string,
  database: OrganizationDatabase = prisma,
) {
  assertAdmin(admin);
  try {
    const references = entity === "Department"
      ? await database.employee.count({ where: { departmentId: id } })
      : await database.employee.count({ where: { designationId: id } });
    if (references > 0) throw new OrganizationInUseError(entity);
    return entity === "Department"
      ? await database.department.delete({ where: { id }, select: { id: true, name: true } })
      : await database.designation.delete({ where: { id }, select: { id: true, name: true } });
  } catch (error) {
    if (error instanceof OrganizationInUseError) throw error;
    entityNameError(entity, error);
  }
}

export async function validateEmployeeOrganizationAssignments(
  assignments: { departmentId?: string | null; designationId?: string | null },
  database: Pick<PrismaClient, "department" | "designation">,
) {
  const checks = [
    assignments.departmentId
      ? database.department.findUnique({ where: { id: assignments.departmentId }, select: { id: true } }).then((record) => {
          if (!record) throw new OrganizationNotFoundError("Department");
        })
      : Promise.resolve(),
    assignments.designationId
      ? database.designation.findUnique({ where: { id: assignments.designationId }, select: { id: true } }).then((record) => {
          if (!record) throw new OrganizationNotFoundError("Designation");
        })
      : Promise.resolve(),
  ];
  await Promise.all(checks);
}
