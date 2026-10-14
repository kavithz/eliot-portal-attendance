import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import {
  createOrganizationRecord,
  deleteOrganizationRecord,
  getOrganizationRecord,
  listOrganizationOptions,
  listOrganizationRecords,
  OrganizationAccessError,
  OrganizationInUseError,
  OrganizationNotFoundError,
  updateOrganizationRecord,
  validateEmployeeOrganizationAssignments,
  writeOrganizationAuditEvent,
} from "@/lib/organization/service";
import { organizationNameSchema } from "@/lib/organization/validation";

const admin = { role: Role.ADMIN };
const hrAdmin = { role: Role.HR_ADMINISTRATOR };
const employee = { role: Role.EMPLOYEE };
type Item = { id: string; name: string; createdAt: Date; updatedAt: Date };

function createDatabaseStub() {
  const departments = new Map<string, Item>([
    ["dept-1", { id: "dept-1", name: "Engineering", createdAt: new Date(0), updatedAt: new Date(0) }],
    ["dept-2", { id: "dept-2", name: "People", createdAt: new Date(0), updatedAt: new Date(0) }],
  ]);
  const designations = new Map<string, Item>([
    ["des-1", { id: "des-1", name: "Engineer", createdAt: new Date(0), updatedAt: new Date(0) }],
    ["des-2", { id: "des-2", name: "Lead", createdAt: new Date(0), updatedAt: new Date(0) }],
  ]);
  const employeeAssignments = [
    { departmentId: "dept-1", designationId: "des-2" },
  ];
  const calls: string[] = [];
  const makeDelegate = (label: string, records: Map<string, Item>) => ({
    findMany: async ({ where, skip, take }: { where?: { name?: { contains?: string } }; skip?: number; take?: number }) => {
      calls.push(`${label}.findMany`);
      const term = where?.name?.contains?.toLowerCase();
      const filtered = [...records.values()]
        .filter((item) => !term || item.name.toLowerCase().includes(term))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
      return filtered.slice(skip ?? 0, (skip ?? 0) + (take ?? filtered.length)).map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt }));
    },
    count: async ({ where }: { where?: { name?: { contains?: string } } } = {}) => {
      calls.push(`${label}.count`);
      const term = where?.name?.contains?.toLowerCase();
      return [...records.values()].filter((item) => !term || item.name.toLowerCase().includes(term)).length;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      calls.push(`${label}.findUnique`);
      return records.get(where.id) ?? null;
    },
    create: async ({ data }: { data: { name: string } }) => {
      calls.push(`${label}.create`);
      const now = new Date();
      const item = { id: `${label.toLowerCase()}-new`, name: data.name, createdAt: now, updatedAt: now };
      records.set(item.id, item);
      return { id: item.id, name: item.name };
    },
    update: async ({ where, data }: { where: { id: string }; data: { name: string } }) => {
      calls.push(`${label}.update`);
      const previous = records.get(where.id);
      if (!previous) throw { code: "P2025" };
      const item = { ...previous, name: data.name, updatedAt: new Date() };
      records.set(item.id, item);
      return { id: item.id, name: item.name };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      calls.push(`${label}.delete`);
      const item = records.get(where.id);
      if (!item) throw { code: "P2025" };
      records.delete(item.id);
      return { id: item.id, name: item.name };
    },
  });
  const database = {
    department: makeDelegate("Department", departments),
    designation: makeDelegate("Designation", designations),
    employee: {
      count: async ({ where }: { where: { departmentId?: string; designationId?: string } }) => {
        calls.push("employee.count");
        return employeeAssignments.filter((item) =>
          (!where.departmentId || item.departmentId === where.departmentId)
          && (!where.designationId || item.designationId === where.designationId)).length;
      },
    },
  } as never;
  return { database, calls, departments, designations, employeeAssignments };
}

describe("organization validation", () => {
  it("trims non-empty names and rejects empty or whitespace-only values", () => {
    assert.equal(organizationNameSchema.parse("  Engineering  "), "Engineering");
    assert.equal(organizationNameSchema.safeParse("").success, false);
    assert.equal(organizationNameSchema.safeParse("   ").success, false);
  });

  it("applies the same non-empty name validation to both entity create and update", async () => {
    const stub = createDatabaseStub();
    for (const entity of ["Department", "Designation"] as const) {
      await assert.rejects(createOrganizationRecord(entity, admin, { name: " " }, stub.database), { name: "ZodError" });
      await assert.rejects(updateOrganizationRecord(entity, admin, "missing", { name: "" }, stub.database), { name: "ZodError" });
    }
    assert.deepEqual(stub.calls, []);
  });
});

describe("organization management", () => {
  it("rejects non-admin access for list, get, create, update, and delete before database access", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(listOrganizationRecords("Department", employee, {}, stub.database), OrganizationAccessError);
    await assert.rejects(getOrganizationRecord("Department", employee, "dept-1", stub.database), OrganizationAccessError);
    await assert.rejects(createOrganizationRecord("Designation", employee, { name: "Analyst" }, stub.database), OrganizationAccessError);
    await assert.rejects(updateOrganizationRecord("Department", employee, "dept-1", { name: "Ops" }, stub.database), OrganizationAccessError);
    await assert.rejects(deleteOrganizationRecord("Designation", employee, "des-1", stub.database), OrganizationAccessError);
    await assert.rejects(listOrganizationRecords("Department", hrAdmin, {}, stub.database), OrganizationAccessError);
    await assert.rejects(createOrganizationRecord("Department", hrAdmin, { name: "People" }, stub.database), OrganizationAccessError);
    await assert.rejects(updateOrganizationRecord("Department", hrAdmin, "dept-1", { name: "People" }, stub.database), OrganizationAccessError);
    await assert.rejects(deleteOrganizationRecord("Department", hrAdmin, "dept-1", stub.database), OrganizationAccessError);
    assert.deepEqual(stub.calls, []);
  });

  it("searches, sorts, paginates, and counts departments and designations independently", async () => {
    const stub = createDatabaseStub();
    const departments = await listOrganizationRecords("Department", admin, { query: "eng", page: 1, pageSize: 1 }, stub.database);
    const designations = await listOrganizationRecords("Designation", admin, { page: 1, pageSize: 1 }, stub.database);
    assert.equal(departments.total, 1);
    assert.equal(departments.items[0]?.name, "Engineering");
    assert.equal(departments.pageCount, 1);
    assert.equal(designations.total, 2);
    assert.equal(designations.items[0]?.name, "Engineer");
    assert.equal(designations.pageCount, 2);
  });

  it("creates, gets, and updates both master entities without cross-coupling", async () => {
    const stub = createDatabaseStub();
    const department = await createOrganizationRecord("Department", admin, { name: "  Operations " }, stub.database);
    const designation = await createOrganizationRecord("Designation", admin, { name: "  Analyst " }, stub.database);
    assert.equal(department.name, "Operations");
    assert.equal(designation.name, "Analyst");
    assert.equal((await getOrganizationRecord("Department", admin, department.id, stub.database)).name, "Operations");
    assert.deepEqual(await updateOrganizationRecord("Designation", admin, designation.id, { name: "Senior Analyst" }, stub.database), {
      id: designation.id,
      name: "Senior Analyst",
    });
    assert.equal(stub.departments.has(designation.id), false);
    assert.equal(stub.designations.has(department.id), false);
  });

  it("returns department and designation assignment options independently", async () => {
    const options = await listOrganizationOptions(admin, createDatabaseStub().database);
    assert.deepEqual(options.departments.map(({ name }) => name), ["Engineering", "People"]);
    assert.deepEqual(options.designations.map(({ name }) => name), ["Engineer", "Lead"]);
  });

  it("allows HR to read employee assignment options but denies unrelated roles", async () => {
    const stub = createDatabaseStub();
    const options = await listOrganizationOptions(hrAdmin, stub.database);
    assert.equal(options.departments.length, 2);
    assert.equal(options.designations.length, 2);
    await assert.rejects(listOrganizationOptions(employee, stub.database), OrganizationAccessError);
  });

  it("blocks deleting assigned records and permits deleting unassigned records", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(deleteOrganizationRecord("Department", admin, "dept-1", stub.database), OrganizationInUseError);
    await assert.rejects(deleteOrganizationRecord("Designation", admin, "des-2", stub.database), OrganizationInUseError);
    assert.deepEqual(await deleteOrganizationRecord("Department", admin, "dept-2", stub.database), { id: "dept-2", name: "People" });
    assert.deepEqual(await deleteOrganizationRecord("Designation", admin, "des-1", stub.database), { id: "des-1", name: "Engineer" });
  });

  it("reports missing records and validates employee assignment IDs independently", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(getOrganizationRecord("Department", admin, "missing", stub.database), OrganizationNotFoundError);
    await assert.rejects(updateOrganizationRecord("Designation", admin, "missing", { name: "Analyst" }, stub.database), OrganizationNotFoundError);
    await assert.rejects(deleteOrganizationRecord("Department", admin, "missing", stub.database), OrganizationNotFoundError);
    await validateEmployeeOrganizationAssignments({ departmentId: "dept-1", designationId: "des-2" }, stub.database);
    await validateEmployeeOrganizationAssignments({ departmentId: null, designationId: null }, stub.database);
    await assert.rejects(validateEmployeeOrganizationAssignments({ departmentId: "missing" }, stub.database), OrganizationNotFoundError);
    await assert.rejects(validateEmployeeOrganizationAssignments({ designationId: "missing" }, stub.database), OrganizationNotFoundError);
  });

  it("writes privacy-minimal audit events for each entity operation", async () => {
    const entries: Record<string, unknown>[] = [];
    const database = {
      attendanceAuditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          entries.push(data);
          return { id: `audit-${entries.length}` };
        },
      },
    } as never;
    for (const entity of ["Department", "Designation"] as const) {
      for (const operation of ["CREATED", "UPDATED", "DELETED"] as const) {
        await writeOrganizationAuditEvent(database, { entity, entityId: `${entity}-1`, actorId: "admin-1", operation });
      }
    }
    assert.deepEqual(entries.map((entry) => entry.actionType), [
      "DEPARTMENT_CREATED", "DEPARTMENT_UPDATED", "DEPARTMENT_DELETED",
      "DESIGNATION_CREATED", "DESIGNATION_UPDATED", "DESIGNATION_DELETED",
    ]);
    assert.equal(entries.every((entry) => entry.actorId === "admin-1"), true);
    assert.deepEqual(entries[1]?.previousValues, { entityId: "Department-1", changedFields: ["name"] });
    assert.deepEqual(entries[1]?.newValues, { entityId: "Department-1", changedFields: ["name"] });
    assert.deepEqual(entries[2]?.previousValues, { entityId: "Department-1", changedFields: ["id"] });
    assert.equal("newValues" in (entries[2] ?? {}), false);
  });
});
