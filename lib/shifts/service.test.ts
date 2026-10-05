import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import type { ShiftWeekday } from "@prisma/client";
import {
  createShift,
  deleteShift,
  getShift,
  listShifts,
  ShiftAccessError,
  ShiftInUseError,
  ShiftNotFoundError,
  updateShift,
  writeShiftAuditEvent,
} from "@/lib/shifts/service";
import { shiftRecordSchema } from "@/lib/shifts/validation";

const admin = { role: Role.ADMIN };
const employee = { role: Role.EMPLOYEE };
type Item = { id: string; name: string; workingDays: ShiftWeekday[]; createdAt: Date; updatedAt: Date };

function createDatabaseStub() {
  const records = new Map<string, Item>([
    ["shift-1", { id: "shift-1", name: "Day", workingDays: [], createdAt: new Date(0), updatedAt: new Date(0) }],
    ["shift-2", { id: "shift-2", name: "Night", workingDays: [], createdAt: new Date(0), updatedAt: new Date(0) }],
  ]);
  const assignedIds = new Set(["shift-2"]);
  const calls: string[] = [];
  const database = {
    shift: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        calls.push("shift.findUnique");
        return records.get(where.id) ?? null;
      },
      findMany: async ({ where, skip, take }: {
        where?: { name?: { contains?: string } };
        skip?: number;
        take?: number;
      }) => {
        calls.push("shift.findMany");
        const query = where?.name?.contains?.toLowerCase();
        const matched = [...records.values()]
          .filter((item) => !query || item.name.toLowerCase().includes(query))
          .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
        return matched.slice(skip ?? 0, (skip ?? 0) + (take ?? matched.length));
      },
      count: async ({ where }: { where?: { name?: { contains?: string } } } = {}) => {
        calls.push("shift.count");
        const query = where?.name?.contains?.toLowerCase();
        return [...records.values()].filter((item) => !query || item.name.toLowerCase().includes(query)).length;
      },
      create: async ({ data }: { data: { name: string; workingDays: ShiftWeekday[] } }) => {
        calls.push("shift.create");
        const now = new Date();
        const item = { id: "shift-3", name: data.name, workingDays: data.workingDays, createdAt: now, updatedAt: now };
        records.set(item.id, item);
        return { id: item.id, name: item.name, workingDays: item.workingDays };
      },
      update: async ({ where, data }: { where: { id: string }; data: { name: string; workingDays: ShiftWeekday[] } }) => {
        calls.push("shift.update");
        const current = records.get(where.id);
        if (!current) throw { code: "P2025" };
        records.set(where.id, { ...current, name: data.name, workingDays: data.workingDays, updatedAt: new Date() });
        return { id: where.id, name: data.name, workingDays: data.workingDays };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        calls.push("shift.delete");
        const current = records.get(where.id);
        if (!current) throw { code: "P2025" };
        records.delete(where.id);
        return { id: current.id, name: current.name };
      },
    },
    employee: {
      count: async ({ where }: { where: { shiftId: string } }) => {
        calls.push("employee.count");
        return assignedIds.has(where.shiftId) ? 1 : 0;
      },
    },
  } as never;
  return { database, calls, records };
}

describe("shift validation", () => {
  it("trims a name and rejects empty or whitespace-only values", () => {
    assert.deepEqual(shiftRecordSchema.parse({ name: "  Day  " }), { name: "Day", workingDays: [] });
    assert.equal(shiftRecordSchema.safeParse({ name: "" }).success, false);
    assert.equal(shiftRecordSchema.safeParse({ name: "   " }).success, false);
    assert.equal(shiftRecordSchema.safeParse({ name: "Day", workingDays: ["MONDAY", "MONDAY"] }).success, false);
  });

  it("rejects blank Shift names on create and update before database access", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(createShift(admin, { name: " " }, stub.database), { name: "ZodError" });
    await assert.rejects(updateShift(admin, "shift-1", { name: "" }, stub.database), { name: "ZodError" });
    assert.deepEqual(stub.calls, []);
  });
});

describe("shift management", () => {
  it("rejects non-admin access to every read and mutation before database access", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(listShifts(employee, {}, stub.database), ShiftAccessError);
    await assert.rejects(getShift(employee, "shift-1", stub.database), ShiftAccessError);
    await assert.rejects(createShift(employee, { name: "Day" }, stub.database), ShiftAccessError);
    await assert.rejects(updateShift(employee, "shift-1", { name: "Day" }, stub.database), ShiftAccessError);
    await assert.rejects(deleteShift(employee, "shift-1", stub.database), ShiftAccessError);
    assert.deepEqual(stub.calls, []);
  });

  it("creates a Shift with a trimmed name", async () => {
    const stub = createDatabaseStub();
    assert.deepEqual(await createShift(admin, {
      name: "  Evening ",
      workingDays: ["TUESDAY", "SATURDAY"],
    }, stub.database), { id: "shift-3", name: "Evening", workingDays: ["TUESDAY", "SATURDAY"] });
  });

  it("gets a Shift and reports missing IDs", async () => {
    const stub = createDatabaseStub();
    assert.equal((await getShift(admin, "shift-1", stub.database)).name, "Day");
    await assert.rejects(getShift(admin, "missing", stub.database), ShiftNotFoundError);
  });

  it("searches, sorts, paginates, and counts Shifts", async () => {
    const stub = createDatabaseStub();
    const result = await listShifts(admin, { query: "day", page: 1, pageSize: 1 }, stub.database);
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.name, "Day");
    assert.equal(result.pageCount, 1);
    const secondPage = await listShifts(admin, { page: 2, pageSize: 1 }, stub.database);
    assert.equal(secondPage.items[0]?.name, "Night");
  });

  it("updates a Shift name", async () => {
    const stub = createDatabaseStub();
    assert.deepEqual(await updateShift(admin, "shift-1", {
      name: "Daytime",
      workingDays: ["WEDNESDAY"],
    }, stub.database), {
      id: "shift-1",
      name: "Daytime",
      workingDays: ["WEDNESDAY"],
    });
  });

  it("blocks deletion while assigned and allows deletion when unassigned", async () => {
    const stub = createDatabaseStub();
    await assert.rejects(deleteShift(admin, "shift-2", stub.database), ShiftInUseError);
    assert.deepEqual(await deleteShift(admin, "shift-1", stub.database), { id: "shift-1", name: "Day" });
    await assert.rejects(deleteShift(admin, "missing", stub.database), ShiftNotFoundError);
  });

  it("writes privacy-conscious create, update, and delete audit events", async () => {
    const entries: Record<string, unknown>[] = [];
    const database = {
      attendanceAuditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          entries.push(data);
          return { id: `audit-${entries.length}` };
        },
      },
    } as never;
    for (const operation of ["CREATED", "UPDATED", "DELETED"] as const) {
      await writeShiftAuditEvent(database, { shiftId: "shift-1", actorId: "admin-1", operation });
    }
    await writeShiftAuditEvent(database, { shiftId: "shift-1", actorId: "admin-1", operation: "UPDATED", changedFields: ["workingDays"] });
    assert.deepEqual(entries.map((entry) => entry.actionType), ["SHIFT_CREATED", "SHIFT_UPDATED", "SHIFT_DELETED", "SHIFT_UPDATED"]);
    assert.deepEqual(entries[1]?.previousValues, { shiftId: "shift-1", changedFields: ["name"] });
    assert.deepEqual(entries[1]?.newValues, { shiftId: "shift-1", changedFields: ["name"] });
    assert.deepEqual(entries[2]?.previousValues, { shiftId: "shift-1", changedFields: ["id"] });
    assert.equal("newValues" in (entries[2] ?? {}), false);
    assert.deepEqual(entries[3]?.newValues, { shiftId: "shift-1", changedFields: ["workingDays"] });
  });
});
