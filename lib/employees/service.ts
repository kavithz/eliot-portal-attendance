import "server-only";

import type { PrismaClient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createEmployeeSchema, updateEmployeeSchema } from "@/lib/employees/validation";

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
type EmployeeAdmin = { role: Role };

export class EmployeeAccessError extends Error {
  constructor() {
    super("Only administrators can manage employees.");
    this.name = "EmployeeAccessError";
  }
}

export class EmployeeDuplicateError extends Error {
  constructor(readonly field: "email" | "employeeCode" | "unknown") {
    super(field === "unknown" ? "An employee with these details already exists." : `That ${field === "email" ? "email" : "employee code"} is already in use.`);
    this.name = "EmployeeDuplicateError";
  }
}

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found.");
    this.name = "EmployeeNotFoundError";
  }
}

function assertAdmin(admin: EmployeeAdmin) {
  if (admin.role !== "ADMIN") throw new EmployeeAccessError();
}

function duplicateField(error: unknown): "email" | "employeeCode" | "unknown" | null {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") return null;
  const target = "meta" in error && error.meta && typeof error.meta === "object" && "target" in error.meta
    ? error.meta.target
    : undefined;
  const targetText = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (targetText.includes("email")) return "email";
  if (targetText.includes("employeeCode")) return "employeeCode";
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

export async function listEmployees(admin: EmployeeAdmin, database: EmployeeDatabase = prisma) {
  assertAdmin(admin);
  return database.user.findMany({
    select: publicEmployeeSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function getEmployee(admin: EmployeeAdmin, employeeId: string, database: EmployeeDatabase = prisma) {
  assertAdmin(admin);
  const employee = await database.user.findUnique({ where: { id: employeeId }, select: publicEmployeeSelect });
  if (!employee) throw new EmployeeNotFoundError();
  return employee;
}

export async function createEmployee(admin: EmployeeAdmin, input: unknown, database: EmployeeDatabase = prisma) {
  assertAdmin(admin);
  const parsed = createEmployeeSchema.parse(input);
  const { password, ...employeeFields } = parsed;
  const passwordHash = await hashPassword(password);

  return withDuplicateTranslation(() => database.user.create({
    data: {
      ...employeeFields,
      passwordHash,
      employee: {
        create: {
          name: employeeFields.name,
          employeeId: employeeFields.employeeCode,
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
  const { password, ...employeeFields } = parsed;
  const passwordHash = password ? await hashPassword(password) : undefined;

  return withDuplicateTranslation(() => database.user.update({
    where: { id: employeeId },
    data: {
      ...employeeFields,
      ...(passwordHash ? { passwordHash } : {}),
      employee: {
        upsert: {
          create: {
            name: employeeFields.name,
            employeeId: employeeFields.employeeCode,
            profileOnboardingRequired: false,
          },
          update: { name: employeeFields.name, employeeId: employeeFields.employeeCode },
        },
      },
    },
    select: publicEmployeeSelect,
  }));
}

export async function setEmployeeActive(admin: EmployeeAdmin, employeeId: string, isActive: boolean, database: EmployeeDatabase = prisma) {
  assertAdmin(admin);
  return withDuplicateTranslation(() => database.user.update({
    where: { id: employeeId },
    data: { isActive },
    select: publicEmployeeSelect,
  }));
}