import "server-only";

import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { shiftListQuerySchema, shiftRecordSchema } from "@/lib/shifts/validation";

type ShiftAdmin = { role: Role };
type ShiftDatabase = Pick<PrismaClient, "shift" | "employee">;
type ShiftAuditDatabase = Pick<PrismaClient, "attendanceAuditLog">;

export class ShiftAccessError extends Error {
  constructor() {
    super("Only administrators can manage shifts.");
    this.name = "ShiftAccessError";
  }
}

export class ShiftNotFoundError extends Error {
  constructor() {
    super("Shift not found.");
    this.name = "ShiftNotFoundError";
  }
}

export class ShiftInUseError extends Error {
  constructor() {
    super("This shift cannot be deleted while employees are assigned to it.");
    this.name = "ShiftInUseError";
  }
}

function assertAdmin(admin: ShiftAdmin) {
  if (admin.role !== "ADMIN") throw new ShiftAccessError();
}

function translateShiftError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "P2003") throw new ShiftInUseError();
    if (error.code === "P2025") throw new ShiftNotFoundError();
  }
  throw error;
}

export async function listShifts(
  admin: ShiftAdmin,
  input: unknown = {},
  database: ShiftDatabase = prisma,
) {
  assertAdmin(admin);
  const { query, page, pageSize } = shiftListQuerySchema.parse(input);
  const where: Prisma.ShiftWhereInput = query ? { name: { contains: query, mode: "insensitive" } } : {};
  const [items, total] = await Promise.all([
    database.shift.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    }),
    database.shift.count({ where }),
  ]);
  return { items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

export async function getShift(admin: ShiftAdmin, id: string, database: ShiftDatabase = prisma) {
  assertAdmin(admin);
  const shift = await database.shift.findUnique({
    where: { id },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  if (!shift) throw new ShiftNotFoundError();
  return shift;
}

export async function listShiftOptions(admin: ShiftAdmin, database: ShiftDatabase = prisma) {
  assertAdmin(admin);
  return database.shift.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}

export async function createShift(
  admin: ShiftAdmin,
  input: unknown,
  database: ShiftDatabase = prisma,
) {
  assertAdmin(admin);
  const { name } = shiftRecordSchema.parse(input);
  return database.shift.create({ data: { name }, select: { id: true, name: true } });
}

export async function updateShift(
  admin: ShiftAdmin,
  id: string,
  input: unknown,
  database: ShiftDatabase = prisma,
) {
  assertAdmin(admin);
  const { name } = shiftRecordSchema.parse(input);
  try {
    return await database.shift.update({ where: { id }, data: { name }, select: { id: true, name: true } });
  } catch (error) {
    translateShiftError(error);
  }
}

export async function deleteShift(admin: ShiftAdmin, id: string, database: ShiftDatabase = prisma) {
  assertAdmin(admin);
  try {
    const references = await database.employee.count({ where: { shiftId: id } });
    if (references > 0) throw new ShiftInUseError();
    return await database.shift.delete({ where: { id }, select: { id: true, name: true } });
  } catch (error) {
    if (error instanceof ShiftInUseError) throw error;
    translateShiftError(error);
  }
}

export async function validateEmployeeShiftAssignment(
  shiftId: string | null | undefined,
  database: Pick<PrismaClient, "shift">,
) {
  if (shiftId && !(await database.shift.findUnique({ where: { id: shiftId }, select: { id: true } }))) {
    throw new ShiftNotFoundError();
  }
}

export async function writeShiftAuditEvent(
  database: ShiftAuditDatabase,
  input: {
    shiftId: string;
    actorId: string;
    operation: "CREATED" | "UPDATED" | "DELETED";
  },
) {
  const changedFields = input.operation === "DELETED" ? ["id"] : ["name"];
  await database.attendanceAuditLog.create({
    data: {
      actorId: input.actorId,
      actionType: `SHIFT_${input.operation}`,
      ...(input.operation === "CREATED" ? {} : { previousValues: { shiftId: input.shiftId, changedFields } }),
      ...(input.operation === "DELETED" ? {} : { newValues: { shiftId: input.shiftId, changedFields } }),
      reason: `Administrator ${input.operation.toLowerCase()} shift; field values are omitted.`,
    },
    select: { id: true },
  });
}
