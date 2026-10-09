import "server-only";

import type { Prisma, PrismaClient, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { holidayInputSchema, holidayListQuerySchema } from "./validation";

type HolidayActor = { role: Role } | null;
type HolidayDatabase = Pick<PrismaClient, "holiday">;

export class HolidayAccessError extends Error {
  constructor() {
    super("Only HR Administrators and Administrators can manage holidays.");
    this.name = "HolidayAccessError";
  }
}

export class HolidayAuthenticationError extends Error {
  constructor() {
    super("Sign in to view the holiday calendar.");
    this.name = "HolidayAuthenticationError";
  }
}

export class HolidayNotFoundError extends Error {
  constructor() {
    super("Holiday not found.");
    this.name = "HolidayNotFoundError";
  }
}

export class HolidayDuplicateError extends Error {
  constructor() {
    super("A holiday with this name, date, and branch already exists.");
    this.name = "HolidayDuplicateError";
  }
}

function assertCanView(actor: HolidayActor): asserts actor is { role: Role } {
  if (!actor) throw new HolidayAuthenticationError();
}

function assertCanManage(actor: HolidayActor): asserts actor is { role: Role } {
  if (!actor || (actor.role !== "ADMIN" && actor.role !== "HR_ADMINISTRATOR")) {
    throw new HolidayAccessError();
  }
}

function monthWindow(month: string) {
  const parsed = holidayListQuerySchema.parse({ month });
  const [year, monthNumber] = parsed.month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

function translateDatabaseError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "P2002") throw new HolidayDuplicateError();
    if (error.code === "P2025") throw new HolidayNotFoundError();
  }
  throw error;
}

export async function listHolidaysForMonth(
  actor: HolidayActor,
  month: string,
  database: HolidayDatabase = prisma,
) {
  assertCanView(actor);
  const { start, end } = monthWindow(month);
  return database.holiday.findMany({
    where: { date: { gte: start, lt: end } },
    orderBy: [{ date: "asc" }, { name: "asc" }, { branch: "asc" }],
  });
}

export async function getHoliday(actor: HolidayActor, id: string, database: HolidayDatabase = prisma) {
  assertCanManage(actor);
  const holiday = await database.holiday.findUnique({ where: { id } });
  if (!holiday) throw new HolidayNotFoundError();
  return holiday;
}

async function assertNoDuplicate(
  date: Date,
  name: string,
  branch: string,
  exceptId: string | undefined,
  database: HolidayDatabase,
) {
  const existing = await database.holiday.findFirst({
    where: { date, name: { equals: name, mode: "insensitive" }, branch, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new HolidayDuplicateError();
}

export async function createHoliday(
  actor: HolidayActor,
  input: unknown,
  database: HolidayDatabase = prisma,
) {
  assertCanManage(actor);
  const holiday = holidayInputSchema.parse(input);
  const date = new Date(`${holiday.date}T00:00:00.000Z`);
  await assertNoDuplicate(date, holiday.name, holiday.branch, undefined, database);
  try {
    return await database.holiday.create({
      data: { ...holiday, date },
    });
  } catch (error) {
    translateDatabaseError(error);
  }
}

export async function updateHoliday(
  actor: HolidayActor,
  id: string,
  input: unknown,
  database: HolidayDatabase = prisma,
) {
  assertCanManage(actor);
  const holiday = holidayInputSchema.parse(input);
  const date = new Date(`${holiday.date}T00:00:00.000Z`);
  const existing = await database.holiday.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new HolidayNotFoundError();
  await assertNoDuplicate(date, holiday.name, holiday.branch, id, database);
  try {
    return await database.holiday.update({ where: { id }, data: { ...holiday, date } });
  } catch (error) {
    translateDatabaseError(error);
  }
}

export async function deleteHoliday(actor: HolidayActor, id: string, database: HolidayDatabase = prisma) {
  assertCanManage(actor);
  try {
    return await database.holiday.delete({ where: { id }, select: { id: true, name: true } });
  } catch (error) {
    translateDatabaseError(error);
  }
}

export type HolidayRecord = Prisma.HolidayGetPayload<Record<string, never>>;