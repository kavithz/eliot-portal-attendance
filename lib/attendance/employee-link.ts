import "server-only";

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AttendanceEmployeeIdentity = {
  id: string;
  name: string;
  employeeId: string | null;
};

type EmployeeLookupDatabase = Pick<PrismaClient, "employee">;

export async function resolveAttendanceEmployees(
  userIds: string[],
  database: EmployeeLookupDatabase = prisma,
) {
  const employeesByUserId = new Map<string, AttendanceEmployeeIdentity>();
  const uniqueUserIds = [...new Set(userIds)];
  if (uniqueUserIds.length === 0) return employeesByUserId;

  const employees = await database.employee.findMany({
    where: { userId: { in: uniqueUserIds } },
    select: { id: true, name: true, employeeId: true, userId: true },
  });

  for (const employee of employees) {
    if (employee.userId !== null) {
      employeesByUserId.set(employee.userId, {
        id: employee.id,
        name: employee.name,
        employeeId: employee.employeeId,
      });
    }
  }

  return employeesByUserId;
}
