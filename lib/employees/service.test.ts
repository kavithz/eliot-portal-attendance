import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import { verifyPassword } from "@/lib/auth/password";
import { accountIsActive } from "@/lib/auth/account-status";
import {
  createEmployee,
  EmployeeAccessError,
  EmployeeDuplicateError,
  publicEmployeeSelect,
  setEmployeeActive,
  updateEmployee,
} from "@/lib/employees/service";
import { createEmployeeSchema } from "@/lib/employees/validation";

const admin = { role: Role.ADMIN };
const employeeInput = {
  name: "Ravi Employee",
  employeeCode: "EMP-1001",
  email: "ravi@example.com",
  password: "Employee-Test-Password-2026",
  role: Role.EMPLOYEE,
  countryCode: "LK",
  timeZone: "Asia/Colombo",
};

function createDatabaseStub() {
  let storedEmployee: Record<string, unknown> | undefined;
  let createData: Record<string, unknown> | undefined;
  let createSelect: Record<string, unknown> | undefined;
  let updateData: Record<string, unknown> | undefined;
  const user = {
    create: async ({ data, select }: { data: Record<string, unknown>; select: Record<string, unknown> }) => {
      createData = data;
      createSelect = select;
      storedEmployee = { ...data, id: "employee-1", createdAt: new Date(), updatedAt: new Date(), isActive: true };
      return Object.fromEntries(Object.keys(select).map((key) => [key, storedEmployee?.[key]]));
    },
    update: async ({ data, select }: { data: Record<string, unknown>; select: Record<string, unknown> }) => {
      updateData = data;
      storedEmployee = { ...storedEmployee, ...data, updatedAt: new Date() };
      return Object.fromEntries(Object.keys(select).map((key) => [key, storedEmployee?.[key]]));
    },
  };

  return {
    database: { user } as never,
    getCreateData: () => createData,
    getCreateSelect: () => createSelect,
    getUpdateData: () => updateData,
  };
}

describe("employee management", () => {
  it("allows an admin to create a hashed employee account without returning its hash", async () => {
    const stub = createDatabaseStub();
    const created = await createEmployee(admin, employeeInput, stub.database);

    assert.equal(created.email, "ravi@example.com");
    assert.equal(created.isActive, true);
    assert.equal("passwordHash" in created, false);
    assert.equal("passwordHash" in (stub.getCreateSelect() ?? {}), false);
    assert.notEqual(stub.getCreateData()?.passwordHash, employeeInput.password);
    assert.equal(await verifyPassword(employeeInput.password, String(stub.getCreateData()?.passwordHash)), true);
    assert.deepEqual(stub.getCreateData()?.employee, {
      create: { name: employeeInput.name, employeeId: employeeInput.employeeCode, profileOnboardingRequired: true },
    });
  });

  it("rejects a non-admin before attempting to create an employee", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(createEmployee({ role: Role.EMPLOYEE }, employeeInput, stub.database), EmployeeAccessError);
    assert.equal(stub.getCreateData(), undefined);
  });

  it("rejects an invalid IANA timezone", () => {
    const result = createEmployeeSchema.safeParse({ ...employeeInput, timeZone: "Mars/Olympus" });
    assert.equal(result.success, false);
  });

  it("rejects a missing country code", () => {
    const missingCountry = Object.fromEntries(Object.entries(employeeInput).filter(([key]) => key !== "countryCode"));
    const result = createEmployeeSchema.safeParse(missingCountry);
    assert.equal(result.success, false);
  });

  it("translates duplicate email and employee code constraints", async () => {
    for (const target of ["email", "employeeCode"]) {
      const database = {
        user: {
          create: async () => {
            throw { code: "P2002", meta: { target: [target] } };
          },
        },
      } as never;
      await assert.rejects(createEmployee(admin, employeeInput, database), (error: unknown) => {
        assert.ok(error instanceof EmployeeDuplicateError);
        assert.equal(error.field, target);
        return true;
      });
    }
  });

  it("deactivates employees and makes them ineligible for authentication", async () => {
    const stub = createDatabaseStub();
    await createEmployee(admin, employeeInput, stub.database);
    const updated = await setEmployeeActive(admin, "employee-1", false, stub.database);

    assert.equal(updated.isActive, false);
    assert.equal(accountIsActive(updated), false);
    assert.equal("passwordHash" in updated, false);
  });

  it("keeps Employee name and ID synchronized with the legacy User fields on update", async () => {
    const stub = createDatabaseStub();
    await createEmployee(admin, employeeInput, stub.database);

    await updateEmployee(admin, "employee-1", { ...employeeInput, name: "Updated Employee", employeeCode: "EMP-1002", password: "" }, stub.database);

    assert.deepEqual(stub.getUpdateData()?.employee, {
      upsert: {
        create: { name: "Updated Employee", employeeId: "EMP-1002", profileOnboardingRequired: false },
        update: { name: "Updated Employee", employeeId: "EMP-1002" },
      },
    });
  });

  it("uses a public select that never includes the password hash", () => {
    assert.equal("passwordHash" in publicEmployeeSelect, false);
  });
});