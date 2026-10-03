import "server-only";

import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createEmployeeSchema, updateEmployeeSchema, type AdminEmployeeProfilePatch } from "@/lib/employees/validation";

export const publicEmployeeSelect = {
  id: true,
  name: true,
  employeeCode: true,
  email: true,
  role: true,
  countryCode: true,
  timeZone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

type EmployeeDatabase = Pick<PrismaClient, "user">;
type AdminEmployeeDatabase = Pick<PrismaClient, "employee">;
type EmployeeAdmin = { role: Role };

export const adminEmployeeSelect = {
  id: true,
  name: true,
  employeeId: true,
  nic: true,
  epfId: true,
  etfId: true,
  userId: true,
  profileCompletedAt: true,
  profileOnboardingRequired: true,
  user: { select: { id: true, email: true, role: true, isActive: true, countryCode: true, timeZone: true } },
  profile: {
    select: {
      permanentAddress: true,
      currentAddress: true,
      emergencyContactName: true,
      emergencyContactId: true,
      emergencyContactAddress: true,
      emergencyContactPhone: true,
      emergencyContactRelationship: true,
      contactNumber: true,
      email: true,
      linkedInId: true,
      dateOfBirth: true,
      maritalStatus: true,
      spouseName: true,
      spouseId: true,
      motherName: true,
      motherId: true,
      motherContactNumber: true,
      fatherName: true,
      fatherId: true,
      fatherContactNumber: true,
    },
  },
} as const;

const adminEmployeeListSelect = {
  id: true,
  name: true,
  employeeId: true,
  nic: true,
  epfId: true,
  etfId: true,
  userId: true,
  profileCompletedAt: true,
  profileOnboardingRequired: true,
  user: { select: { id: true, isActive: true } },
  profile: { select: { email: true } },
} as const;

const employeeListQuerySchema = z.object({
  query: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(20),
});

export class EmployeeAccessError extends Error {
  constructor() {
    super("Only administrators can manage employees.");
    this.name = "EmployeeAccessError";
  }
}

export class EmployeeDuplicateError extends Error {
  constructor(readonly field: "email" | "employeeCode" | "employeeId" | "nic" | "unknown") {
    const label = field === "email" ? "login email" : field === "employeeCode" || field === "employeeId" ? "Employee ID" : "NIC";
    super(field === "unknown" ? "An employee with these details already exists." : `That ${label} is already in use.`);
    this.name = "EmployeeDuplicateError";
  }
}

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found.");
    this.name = "EmployeeNotFoundError";
  }
}

export function changedEmployeeFieldNames(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return [...keys].filter((key) => JSON.stringify(previous[key] ?? null) !== JSON.stringify(current[key] ?? null)).sort();
}

export function employeeAuditMetadata(changedFields: string[]) {
  return { changedFields };
}

export async function writeEmployeeAuditEvent(
  database: Pick<PrismaClient, "attendanceAuditLog">,
  input: { employeeId: string; actorId: string; actionType: "EMPLOYEE_CREATED" | "EMPLOYEE_UPDATED"; changedFields: string[] },
) {
  await database.attendanceAuditLog.create({
    data: {
      employeeId: input.employeeId,
      actorId: input.actorId,
      actionType: input.actionType,
      ...(input.actionType === "EMPLOYEE_UPDATED" ? { previousValues: employeeAuditMetadata(input.changedFields) } : {}),
      newValues: employeeAuditMetadata(input.changedFields),
      reason: input.actionType === "EMPLOYEE_CREATED"
        ? "Administrator created an employee account; field values are omitted for privacy."
        : "Administrator updated employee identity or profile fields; values are omitted for privacy.",
    },
    select: { id: true },
  });
}

function assertAdmin(admin: EmployeeAdmin) {
  if (admin.role !== "ADMIN") throw new EmployeeAccessError();
}

function duplicateField(error: unknown): "email" | "employeeCode" | "employeeId" | "nic" | "unknown" | null {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") return null;
  const target = "meta" in error && error.meta && typeof error.meta === "object" && "target" in error.meta
    ? error.meta.target
    : undefined;
  const targetText = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (targetText.includes("email")) return "email";
  if (targetText.includes("employeeCode")) return "employeeCode";
  if (targetText.includes("employeeId")) return "employeeId";
  if (targetText.includes("nic")) return "nic";
  return "unknown";
}

async function withDuplicateTranslation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const field = duplicateField(error);
    if (field) throw new EmployeeDuplicateError(field);
    throw error;
  }
}

export async function listEmployees(
  admin: EmployeeAdmin,
  input: unknown = {},
  database: AdminEmployeeDatabase = prisma,
) {
  assertAdmin(admin);
  const { query, page, pageSize } = employeeListQuerySchema.parse(input);
  const where: Prisma.EmployeeWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { employeeId: { contains: query, mode: "insensitive" } },
          { nic: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};
  const [employees, total] = await Promise.all([
    database.employee.findMany({
      where,
        select: adminEmployeeListSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    database.employee.count({ where }),
  ]);

  return { employees, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

export async function getEmployee(admin: EmployeeAdmin, employeeId: string, database: AdminEmployeeDatabase = prisma) {
  assertAdmin(admin);
  const employee = await database.employee.findFirst({
    where: { OR: [{ userId: employeeId }, { id: employeeId }] },
    select: adminEmployeeSelect,
  });
  if (!employee) throw new EmployeeNotFoundError();
  return employee;
}

export async function createEmployee(admin: EmployeeAdmin, input: unknown, database: EmployeeDatabase = prisma) {
  assertAdmin(admin);
  const parsed = createEmployeeSchema.parse(input);
  const { password, nic, epfId, etfId, ...employeeFields } = parsed;
  const passwordHash = await hashPassword(password);

  return withDuplicateTranslation(() => database.user.create({
    data: {
      ...employeeFields,
      passwordHash,
      employee: {
        create: {
          name: employeeFields.name,
          employeeId: employeeFields.employeeCode,
          ...(nic !== undefined ? { nic } : {}),
          ...(epfId !== undefined ? { epfId } : {}),
          ...(etfId !== undefined ? { etfId } : {}),
          profileOnboardingRequired: employeeFields.role === "EMPLOYEE",
        },
      },
    },
    select: publicEmployeeSelect,
  }));
}

export async function updateEmployee(admin: EmployeeAdmin, employeeId: string, input: unknown, database: EmployeeDatabase = prisma) {
  assertAdmin(admin);
  const parsed = updateEmployeeSchema.parse(input);
  const { password, nic, epfId, etfId, profile: profilePatch, ...employeeFields } = parsed;
  const passwordHash = password ? await hashPassword(password) : undefined;
  const profileData = definedProfileFields(profilePatch);
  const employeeScalars = {
    name: employeeFields.name,
    ...(employeeFields.employeeCode !== undefined ? { employeeId: employeeFields.employeeCode } : {}),
    ...(nic !== undefined ? { nic } : {}),
    ...(epfId !== undefined ? { epfId } : {}),
    ...(etfId !== undefined ? { etfId } : {}),
  };
  const employeeUpdate = {
    ...employeeScalars,
    ...(Object.keys(profileData).length > 0
      ? { profile: { upsert: { create: profileData, update: profileData } } }
      : {}),
  };
  const employeeCreate = {
    ...employeeScalars,
    profileOnboardingRequired: false,
    ...(Object.keys(profileData).length > 0 ? { profile: { create: profileData } } : {}),
  };

  return withDuplicateTranslation(() => database.user.update({
    where: { id: employeeId },
    data: {
      ...employeeFields,
      ...(passwordHash ? { passwordHash } : {}),
      employee: {
        upsert: {
          create: employeeCreate,
          update: employeeUpdate,
        },
      },
    },
    select: publicEmployeeSelect,
  }));
}

function definedProfileFields(profile: AdminEmployeeProfilePatch | undefined) {
  if (!profile) return {};
  return Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined));
}

export async function setEmployeeActive(admin: EmployeeAdmin, employeeId: string, isActive: boolean, database: EmployeeDatabase = prisma) {
  assertAdmin(admin);
  return withDuplicateTranslation(() => database.user.update({
    where: { id: employeeId },
    data: { isActive },
    select: publicEmployeeSelect,
  }));
}