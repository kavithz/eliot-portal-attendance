import "server-only";

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountIsActive } from "@/lib/auth/account-status";

type SessionUserDatabase = Pick<PrismaClient, "user">;

export async function findActiveSessionUser(userId: string, database: SessionUserDatabase = prisma) {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      employeeCode: true,
      countryCode: true,
      timeZone: true,
    },
  });
  return accountIsActive(user) ? user : null;
}