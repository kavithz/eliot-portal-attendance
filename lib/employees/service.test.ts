import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import { verifyPassword } from "@/lib/auth/password";
import { accountIsActive } from "@/lib/auth/account-status";
import {
  createEmployee,
  EmployeeAccessError,
  EmployeeDuplicateError,
  EmployeeNotFoundError,
  changedEmployeeFieldNames,
  employeeAuditMetadata,
  getEmployee,
  listEmployees,
  publicEmployeeSelect,
  setEmployeeActive,
  updateEmployee,
  writeEmployeeAuditEvent,
} from "@/lib/employees/service";
import { createEmployeeSchema } from "@/lib/employees/validation";
import { OrganizationNotFoundError } from "@/lib/organization/service";

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
  const department = {
    findUnique: async ({ where }: { where: { id: string } }) => where.id === "department-1" ? { id: where.id } : null,
  };
  const designation = {
    findUnique: async ({ where }: { where: { id: string } }) => where.id === "designation-1" ? { id: where.id } : null,
  };

  return {
    database: { user, department, designation } as never,
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
      create: {
        name: employeeInput.name,
        employeeId: employeeInput.employeeCode,
        departmentId: null,
        designationId: null,
        profileOnboardingRequired: true,
      },
    });
    assert.equal("nic" in (stub.getCreateData() ?? {}), false);
    assert.equal("epfId" in (stub.getCreateData() ?? {}), false);
    assert.equal("etfId" in (stub.getCreateData() ?? {}), false);
  });

  it("rejects a non-admin before attempting to create an employee", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(createEmployee({ role: Role.EMPLOYEE }, employeeInput, stub.database), EmployeeAccessError);
    assert.equal(stub.getCreateData(), undefined);
  });

  it("rejects non-admin employee/profile updates before attempting a database write", async () => {
    const stub = createDatabaseStub();

    await assert.rejects(updateEmployee({ role: Role.EMPLOYEE }, "employee-1", {
      ...employeeInput,
      password: "",
      profile: { email: "contact@example.com" },
    }, stub.database), EmployeeAccessError);
    assert.equal(stub.getUpdateData(), undefined);
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
    for (const target of ["email", "employeeCode", "employeeId", "nic"]) {
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
        create: { name: "Updated Employee", employeeId: "EMP-1002", departmentId: null, designationId: null, profileOnboardingRequired: false },
        update: { name: "Updated Employee", employeeId: "EMP-1002" },
      },
    });
  });

  it("persists NIC and optional EPF/ETF values separately on Employee", async () => {
    const stub = createDatabaseStub();
    await createEmployee(admin, { ...employeeInput, nic: "NIC-123", epfId: "", etfId: "ETF-456" }, stub.database);

    assert.deepEqual(stub.getCreateData()?.employee, {
      create: {
        name: employeeInput.name,
        employeeId: employeeInput.employeeCode,
        nic: "NIC-123",
        epfId: null,
        etfId: "ETF-456",
        departmentId: null,
        designationId: null,
        profileOnboardingRequired: true,
      },
    });
  });

  it("updates only submitted EmployeeProfile fields and does not mass-assign client IDs", async () => {
    const stub = createDatabaseStub();
    await createEmployee(admin, employeeInput, stub.database);

    await updateEmployee(admin, "employee-1", {
      ...employeeInput,
      password: "",
      profile: { email: "contact@example.com", employeeRecordId: "other-employee", userId: "other-user" },
    }, stub.database);

    const employeeUpdate = (stub.getUpdateData()?.employee as { upsert: { update: Record<string, unknown> } }).upsert.update;
    assert.deepEqual(employeeUpdate.profile, {
      upsert: {
        create: { email: "contact@example.com" },
        update: { email: "contact@example.com" },
      },
    });
    assert.equal("employeeRecordId" in employeeUpdate, false);
    assert.equal("userId" in employeeUpdate, false);
    assert.equal(stub.getUpdateData()?.email, employeeInput.email);
  });

  it("reopens profile completion when an admin clears a mandatory profile field", async () => {
    const stub = createDatabaseStub();
    await createEmployee(admin, employeeInput, stub.database);

    await updateEmployee(admin, "employee-1", {
      ...employeeInput,
      password: "",
      profile: { permanentAddress: "" },
    }, stub.database);

    const employeeUpdate = (stub.getUpdateData()?.employee as { upsert: { update: Record<string, unknown> } }).upsert.update;
    assert.equal(employeeUpdate.profileOnboardingRequired, true);
    assert.equal(employeeUpdate.profileCompletedAt, null);
    assert.deepEqual(employeeUpdate.profile, {
      upsert: {
        create: { permanentAddress: null },
        update: { permanentAddress: null },
      },
    });
  });

  it("creates and updates optional Department and Designation assignments independently", async () => {
    const stub = createDatabaseStub();
    await createEmployee(admin, { ...employeeInput, departmentId: "department-1", designationId: "designation-1" }, stub.database);
    assert.deepEqual((stub.getCreateData()?.employee as { create: Record<string, unknown> }).create, {
      name: employeeInput.name,
      employeeId: employeeInput.employeeCode,
      departmentId: "department-1",
      designationId: "designation-1",
      profileOnboardingRequired: true,
    });

    await updateEmployee(admin, "employee-1", {
      ...employeeInput,
      password: "",
      departmentId: null,
      designationId: "designation-1",
    }, stub.database);
    const employeeUpdate = (stub.getUpdateData()?.employee as { upsert: { update: Record<string, unknown> } }).upsert.update;
    assert.equal(employeeUpdate.departmentId, null);
    assert.equal(employeeUpdate.designationId, "designation-1");
  });

  it("rejects nonexistent Department and Designation assignment IDs before writing", async () => {
    const stub = createDatabaseStub();
    for (const assignments of [{ departmentId: "missing" }, { designationId: "missing" }]) {
      await assert.rejects(createEmployee(admin, { ...employeeInput, ...assignments }, stub.database), OrganizationNotFoundError);
      await assert.rejects(updateEmployee(admin, "employee-1", {
        ...employeeInput,
        password: "",
        ...assignments,
      }, stub.database), OrganizationNotFoundError);
    }
    assert.equal(stub.getCreateData(), undefined);
    assert.equal(stub.getUpdateData(), undefined);
  });

  it("keeps new and existing employees valid without Department or Designation assignments", async () => {
    const stub = createDatabaseStub();
    await createEmployee(admin, { ...employeeInput, departmentId: "", designationId: "" }, stub.database);
    assert.equal((stub.getCreateData()?.employee as { create: Record<string, unknown> }).create.departmentId, null);
    assert.equal((stub.getCreateData()?.employee as { create: Record<string, unknown> }).create.designationId, null);

    await updateEmployee(admin, "employee-1", {
      ...employeeInput,
      password: "",
      departmentId: "",
      designationId: null,
    }, stub.database);
    const update = (stub.getUpdateData()?.employee as { upsert: { update: Record<string, unknown> } }).upsert.update;
    assert.equal(update.departmentId, null);
    assert.equal(update.designationId, null);
  });

  it("tracks Department and Designation assignment changes by field name only", async () => {
    assert.deepEqual(changedEmployeeFieldNames(
      { departmentId: null, designationId: "designation-1" },
      { departmentId: "department-1", designationId: null },
    ), ["departmentId", "designationId"]);
    assert.deepEqual(employeeAuditMetadata(["departmentId", "designationId"]), {
      changedFields: ["departmentId", "designationId"],
    });
  });

  it("rejects invalid optional identity/profile fields on the server", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(createEmployee(admin, { ...employeeInput, nic: "x".repeat(121) }, stub.database), { name: "ZodError" });
    await assert.rejects(updateEmployee(admin, "employee-1", {
      ...employeeInput,
      password: "",
      profile: { email: "not-an-email" },
    }, stub.database), { name: "ZodError" });
    assert.equal(stub.getCreateData(), undefined);
    assert.equal(stub.getUpdateData(), undefined);
  });

  it("translates duplicate Employee ID and NIC conflicts during update", async () => {
    for (const target of ["employeeId", "nic"]) {
      const database = {
        user: {
          update: async () => { throw { code: "P2002", meta: { target: [target] } }; },
        },
      } as never;
      await assert.rejects(updateEmployee(admin, "user-1", {
        ...employeeInput,
        password: "",
        nic: "NIC-123",
      }, database), (error: unknown) => {
        assert.ok(error instanceof EmployeeDuplicateError);
        assert.equal(error.field, target);
        return true;
      });
    }
  });

  it("uses a public select that never includes the password hash", () => {
    assert.equal("passwordHash" in publicEmployeeSelect, false);
  });

  it("searches by Employee name, Employee ID, or NIC with server-side pagination", async () => {
    let findArgs: Record<string, unknown> | undefined;
    let countWhere: Record<string, unknown> | undefined;
    const database = {
      employee: {
        findMany: async (args: Record<string, unknown>) => { findArgs = args; return []; },
        count: async ({ where }: { where: Record<string, unknown> }) => { countWhere = where; return 41; },
      },
    } as never;

    const result = await listEmployees(admin, { query: "nic-77", page: 3, pageSize: 10 }, database);

    assert.equal(result.total, 41);
    assert.equal(result.page, 3);
    assert.equal(result.pageSize, 10);
    assert.equal(result.pageCount, 5);
    assert.deepEqual(findArgs?.where, {
      OR: [
        { name: { contains: "nic-77", mode: "insensitive" } },
        { employeeId: { contains: "nic-77", mode: "insensitive" } },
        { nic: { contains: "nic-77", mode: "insensitive" } },
      ],
    });
    assert.equal(findArgs?.skip, 20);
    assert.equal(findArgs?.take, 10);
    assert.deepEqual(countWhere, findArgs?.where);
  });

  it("returns an explicit empty result and rejects unauthorized list access", async () => {
    const database = {
      employee: {
        findMany: async () => [],
        count: async () => 0,
      },
    } as never;

    const result = await listEmployees(admin, { query: "absent" }, database);
    assert.deepEqual(result.employees, []);
    assert.equal(result.total, 0);
    await assert.rejects(listEmployees({ role: Role.EMPLOYEE }, {}, database), EmployeeAccessError);
  });

  it("retrieves the Employee/Profile/User association and handles missing or unauthorized detail access", async () => {
    let receivedWhere: Record<string, unknown> | undefined;
    const employeeRow = {
      id: "employee-record-1",
      name: "Ravi Employee",
      employeeId: "EMP-1001",
      nic: "NIC-1001",
      epfId: null,
      etfId: null,
      userId: "user-1",
      profileCompletedAt: null,
      profileOnboardingRequired: true,
      user: { id: "user-1", email: "login@example.com", role: Role.EMPLOYEE, isActive: true, countryCode: "LK", timeZone: "Asia/Colombo" },
      profile: { email: "contact@example.com", permanentAddress: null },
    };
    const database = {
      employee: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => { receivedWhere = where; return employeeRow; },
      },
    } as never;

    const employee = await getEmployee(admin, "user-1", database);
    assert.equal(employee.user?.id, "user-1");
    assert.equal(employee.profile?.email, "contact@example.com");
    assert.deepEqual(receivedWhere, { OR: [{ userId: "user-1" }, { id: "user-1" }] });
    assert.equal("passwordHash" in (employee.user ?? {}), false);
    await assert.rejects(getEmployee(admin, "missing", { employee: { findFirst: async () => null } } as never), EmployeeNotFoundError);
    await assert.rejects(getEmployee({ role: Role.EMPLOYEE }, "user-1", database), EmployeeAccessError);
  });

  it("keeps audit payloads to changed field names rather than personal values", () => {
    const changedFields = changedEmployeeFieldNames(
      { name: "Before", nic: "SECRET-NIC", email: "before@example.com" },
      { name: "After", nic: "SECRET-NIC", email: "after@example.com" },
    );
    const metadata = employeeAuditMetadata(changedFields);

    assert.deepEqual(changedFields, ["email", "name"]);
    assert.deepEqual(metadata, { changedFields: ["email", "name"] });
    assert.equal(JSON.stringify(metadata).includes("SECRET-NIC"), false);
    assert.equal(JSON.stringify(metadata).includes("after@example.com"), false);
  });

  it("writes safe employee create/update audit events with actor, subject, and field names only", async () => {
    const entries: Array<Record<string, unknown>> = [];
    const database = {
      attendanceAuditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => { entries.push(data); return { id: "audit-1" }; },
      },
    } as never;

    await writeEmployeeAuditEvent(database, {
      employeeId: "user-1",
      actorId: "admin-1",
      actionType: "EMPLOYEE_UPDATED",
      changedFields: ["nic", "profile.permanentAddress"],
    });

    assert.equal(entries[0].employeeId, "user-1");
    assert.equal(entries[0].actorId, "admin-1");
    assert.equal(entries[0].actionType, "EMPLOYEE_UPDATED");
    assert.deepEqual(entries[0].previousValues, { changedFields: ["nic", "profile.permanentAddress"] });
    assert.deepEqual(entries[0].newValues, { changedFields: ["nic", "profile.permanentAddress"] });
    assert.equal(JSON.stringify(entries).includes("NIC-SECRET-VALUE"), false);
  });
});