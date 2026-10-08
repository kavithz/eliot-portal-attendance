import "server-only";

import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { calculateEmployeeLeaveWorkdays, type LeaveHolidayResolver } from "@/lib/leave/workdays";
import {
  approvedLeaveUsageInputSchema,
  leaveEntitlementLookupSchema,
  leaveEntitlementSchema,
  leaveRequestedAmountSchema,
} from "@/lib/leave/validation";

type LeaveBalanceAdmin = { id: string; role: Role };
type LeaveBalanceEmployee = { id: string; role: Role };
type LeaveEntitlementReadDatabase = Pick<PrismaClient, "leaveEntitlement">;
type OwnLeaveBalanceReadDatabase = Pick<PrismaClient, "employee" | "leaveEntitlement">;
type LeaveEntitlementTransactionDatabase = Pick<PrismaClient, "$transaction">;
type LeaveQuantity = Prisma.Decimal | string | number;

export class LeaveBalanceAccessError extends Error {
  constructor() {
    super("You do not have permission to access this Employee leave balance.");
    this.name = "LeaveBalanceAccessError";
  }
}

export class LeaveEntitlementAccessError extends Error {
  constructor() {
    super("Only administrators can manage Leave entitlements.");
    this.name = "LeaveEntitlementAccessError";
  }
}

export class LeaveEntitlementEmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found or not linked to an account.");
    this.name = "LeaveEntitlementEmployeeNotFoundError";
  }
}

export class LeaveEntitlementTypeNotFoundError extends Error {
  constructor() {
    super("Leave Type not found.");
    this.name = "LeaveEntitlementTypeNotFoundError";
  }
}

export class LeaveUsageSourceConflictError extends Error {
  constructor() {
    super("The same approved Leave source has conflicting records.");
    this.name = "LeaveUsageSourceConflictError";
  }
}

export class LeaveUsageEmployeeConflictError extends Error {
  constructor() {
    super("Approved Leave usage contains a record for a different Employee.");
    this.name = "LeaveUsageEmployeeConflictError";
  }
}

export class InsufficientLeaveBalanceError extends Error {
  constructor() {
    super("The requested Leave amount exceeds the available balance.");
    this.name = "InsufficientLeaveBalanceError";
  }
}

function assertAdmin(admin: LeaveBalanceAdmin) {
  if (admin.role !== "ADMIN") throw new LeaveEntitlementAccessError();
}

function assertEmployeeSelfAccess(actor: LeaveBalanceEmployee | null): asserts actor is LeaveBalanceEmployee {
  if (
    !actor
    || actor.role !== "EMPLOYEE"
    || !hasPermission(actor.role, "leave:balance:self:read")
  ) {
    throw new LeaveBalanceAccessError();
  }
}

function asDecimal(value: LeaveQuantity) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function asDatabaseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function listOwnLeaveBalanceCredits(
  actor: LeaveBalanceEmployee | null,
  database: OwnLeaveBalanceReadDatabase = prisma,
) {
  assertEmployeeSelfAccess(actor);
  const employee = await database.employee.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!employee) throw new LeaveEntitlementEmployeeNotFoundError();

  const currentDate = new Date();
  const asOf = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate()));
  return database.leaveEntitlement.findMany({
    where: {
      employeeId: employee.id,
      periodStart: { lte: asOf },
      periodEnd: { gte: asOf },
    },
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      openingBalance: true,
      entitlement: true,
      carryForward: true,
      leaveType: { select: { id: true, name: true } },
    },
    orderBy: [{ leaveType: { name: "asc" } }, { periodStart: "asc" }, { id: "asc" }],
  });
}

export function calculateAvailableLeaveBalance(
  credits: { openingBalance: LeaveQuantity; entitlement: LeaveQuantity; carryForward: LeaveQuantity },
  approvedUsage: LeaveQuantity,
) {
  return asDecimal(credits.openingBalance)
    .plus(asDecimal(credits.entitlement))
    .plus(asDecimal(credits.carryForward))
    .minus(asDecimal(approvedUsage));
}

export function assertLeaveBalanceCoversRequest(availableBalance: LeaveQuantity, requestedAmount: unknown) {
  const amount = leaveRequestedAmountSchema.parse(requestedAmount);
  if (amount.greaterThan(asDecimal(availableBalance))) throw new InsufficientLeaveBalanceError();
  return amount;
}

export async function getLeaveEntitlement(
  admin: LeaveBalanceAdmin,
  input: unknown,
  database: LeaveEntitlementReadDatabase = prisma,
) {
  assertAdmin(admin);
  const { employeeId, leaveTypeId, periodStart, periodEnd } = leaveEntitlementLookupSchema.parse(input);
  return database.leaveEntitlement.findUnique({
    where: {
      employeeId_leaveTypeId_periodStart_periodEnd: {
        employeeId,
        leaveTypeId,
        periodStart: asDatabaseDate(periodStart),
        periodEnd: asDatabaseDate(periodEnd),
      },
    },
  });
}

export async function setLeaveEntitlement(
  admin: LeaveBalanceAdmin,
  input: unknown,
  database: LeaveEntitlementTransactionDatabase = prisma,
) {
  assertAdmin(admin);
  const parsed = leaveEntitlementSchema.parse(input);

  return database.$transaction(async (transaction) => {
    const employee = await transaction.employee.findUnique({
      where: { id: parsed.employeeId },
      select: { id: true, userId: true },
    });
    if (!employee) throw new LeaveEntitlementEmployeeNotFoundError();
    const leaveType = await transaction.leaveType.findUnique({
      where: { id: parsed.leaveTypeId },
      select: { id: true },
    });
    if (!leaveType) throw new LeaveEntitlementTypeNotFoundError();

    const uniqueKey = {
      employeeId_leaveTypeId_periodStart_periodEnd: {
        employeeId: parsed.employeeId,
        leaveTypeId: parsed.leaveTypeId,
        periodStart: asDatabaseDate(parsed.periodStart),
        periodEnd: asDatabaseDate(parsed.periodEnd),
      },
    };
    const previous = await transaction.leaveEntitlement.findUnique({ where: uniqueKey });
    const entitlement = await transaction.leaveEntitlement.upsert({
      where: uniqueKey,
      create: {
        ...parsed,
        periodStart: asDatabaseDate(parsed.periodStart),
        periodEnd: asDatabaseDate(parsed.periodEnd),
      },
      update: {
        openingBalance: parsed.openingBalance,
        entitlement: parsed.entitlement,
        carryForward: parsed.carryForward,
      },
    });
    const changedFields = previous
      ? (["openingBalance", "entitlement", "carryForward"] as const)
          .filter((field) => !new Prisma.Decimal(previous[field]).equals(parsed[field]))
      : ["openingBalance", "entitlement", "carryForward"];

    if (changedFields.length > 0) {
      await transaction.attendanceAuditLog.create({
        data: {
          employeeId: employee.userId,
          actorId: admin.id,
          actionType: previous ? "LEAVE_ENTITLEMENT_UPDATED" : "LEAVE_ENTITLEMENT_CREATED",
          ...(previous ? {
            previousValues: {
              employeeId: parsed.employeeId,
              leaveEntitlementId: entitlement.id,
              leaveTypeId: parsed.leaveTypeId,
              periodStart: parsed.periodStart,
              periodEnd: parsed.periodEnd,
              changedFields,
            },
          } : {}),
          newValues: {
            employeeId: parsed.employeeId,
            leaveEntitlementId: entitlement.id,
            leaveTypeId: parsed.leaveTypeId,
            periodStart: parsed.periodStart,
            periodEnd: parsed.periodEnd,
            changedFields,
          },
          reason: "Administrator changed Leave entitlement credits; balance quantities are omitted.",
        },
        select: { id: true },
      });
    }

    return entitlement;
  });
}

export async function calculateApprovedLeaveUsage(input: {
  employeeId: string;
  leaveTypeId: string;
  periodStart: string;
  periodEnd: string;
  approvedLeaves: unknown;
}, dependencies: {
  resolveHolidayDates: LeaveHolidayResolver;
  database?: Pick<PrismaClient, "employee" | "leaveType">;
}) {
  const { employeeId, leaveTypeId, periodStart, periodEnd } = leaveEntitlementLookupSchema.parse(input);
  const employee = await (dependencies.database ?? prisma).employee.findUnique({
    where: { id: employeeId },
    select: { id: true, userId: true },
  });
  if (!employee?.userId) throw new LeaveEntitlementEmployeeNotFoundError();

  const leaveType = await (dependencies.database ?? prisma).leaveType.findUnique({
    where: { id: leaveTypeId },
    select: { id: true },
  });
  if (!leaveType) throw new LeaveEntitlementTypeNotFoundError();

  const candidates = approvedLeaveUsageInputSchema.parse(input.approvedLeaves);
  const uniqueBySource = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    if (candidate.employeeId !== employeeId) throw new LeaveUsageEmployeeConflictError();
    const existing = uniqueBySource.get(candidate.sourceId);
    if (existing && (
      existing.leaveTypeId !== candidate.leaveTypeId
      || existing.status !== candidate.status
      || existing.startDate !== candidate.startDate
      || existing.endDate !== candidate.endDate
    )) {
      throw new LeaveUsageSourceConflictError();
    }
    uniqueBySource.set(candidate.sourceId, candidate);
  }

  let total = 0;
  for (const leave of uniqueBySource.values()) {
    if (leave.status !== "APPROVED" || leave.leaveTypeId !== leaveTypeId) continue;
    const startDate = leave.startDate > periodStart ? leave.startDate : periodStart;
    const endDate = leave.endDate < periodEnd ? leave.endDate : periodEnd;
    if (startDate > endDate) continue;
    total += await calculateEmployeeLeaveWorkdays(
      { employeeUserId: employee.userId, startDate, endDate },
      { resolveHolidayDates: dependencies.resolveHolidayDates, database: dependencies.database },
    );
  }
  return new Prisma.Decimal(total);
}
