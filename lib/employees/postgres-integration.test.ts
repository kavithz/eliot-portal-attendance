import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { Role, WorkMode } from "@prisma/client";
import { findActiveSessionUser } from "@/lib/auth/session-user";
import { prisma } from "@/lib/prisma";

const enabled = process.env.EMPLOYEE_POSTGRES_INTEGRATION === "1";

it("enforces the Employee foundation constraints and preserves User attendance/auth links", { skip: !enabled }, async () => {
  const databaseName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  assert.match(databaseName, /^attendance_employee_[a-f0-9]+$/, "integration test requires a disposable Employee foundation database");

  const unique = randomUUID();
  const userIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        name: label,
        email: `${label.toLowerCase().replaceAll(" ", "-")}-${unique}@example.invalid`,
        countryCode: "LK",
        timeZone: "Asia/Colombo",
        passwordHash: "integration-test-only",
        role: Role.EMPLOYEE,
        employeeCode: null,
      },
      select: { id: true, name: true, employeeCode: true },
    });
    userIds.push(user.id);
    return user;
  }

  try {
    const legacyUser = await createUser("Legacy employee");
    const legacyEmployee = await prisma.employee.create({
      data: { name: legacyUser.name, userId: legacyUser.id, employeeId: legacyUser.employeeCode, nic: null },
      include: { user: { select: { id: true } } },
    });

    assert.equal(legacyEmployee.userId, legacyUser.id);
    assert.equal(legacyEmployee.user?.id, legacyUser.id);
    assert.equal(legacyEmployee.employeeId, null);
    assert.equal(legacyEmployee.nic, null);
    assert.equal(legacyEmployee.epfId, null);
    assert.equal(legacyEmployee.etfId, null);
    assert.equal(legacyEmployee.profileCompletedAt, null);
    assert.equal((await findActiveSessionUser(legacyUser.id, prisma))?.id, legacyUser.id);

    const employeeUser = await createUser("Identified employee");
    const employee = await prisma.employee.create({
      data: {
        name: employeeUser.name,
        userId: employeeUser.id,
        employeeId: `EMP-${unique}`,
        nic: `NIC-${unique}`,
      },
    });

    await assert.rejects(prisma.employee.create({
      data: { name: "Duplicate employee ID", employeeId: employee.employeeId },
    }), { code: "P2002" });
    await assert.rejects(prisma.employee.create({
      data: { name: "Duplicate NIC", nic: employee.nic },
    }), { code: "P2002" });
    await assert.rejects(prisma.employee.create({
      data: { name: "Second employee for same user", userId: legacyUser.id, employeeId: `OTHER-${unique}` },
    }), { code: "P2002" });

    const secondLegacyUser = await createUser("Second legacy employee");
    const secondLegacyEmployee = await prisma.employee.create({
      data: { name: secondLegacyUser.name, userId: secondLegacyUser.id, employeeId: null, nic: null },
    });
    assert.equal(secondLegacyEmployee.employeeId, null);
    assert.equal(secondLegacyEmployee.nic, null);

    const attendance = await prisma.attendanceRecord.create({
      data: {
        employeeId: legacyUser.id,
        sessions: { create: { mode: WorkMode.OFFICE, startAt: new Date() } },
      },
      select: { employeeId: true },
    });
    assert.equal(attendance.employeeId, legacyUser.id);
    assert.equal(employee.userId, employeeUser.id);
  } finally {
    if (userIds.length > 0) {
      await prisma.employee.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  }
});