import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createHoliday,
  deleteHoliday,
  HolidayAccessError,
  HolidayDuplicateError,
  HolidayNotFoundError,
  listHolidaysForMonth,
  updateHoliday,
} from "./service";

const hr = { role: "HR_ADMINISTRATOR" as const };
const employee = { role: "EMPLOYEE" as const };
const input = {
  date: "2026-12-25",
  name: "Christmas Day",
  type: "PUBLIC",
  branch: "",
  applicableEmployeeGroups: "Operations, HR",
  isPaid: "true",
  overtimeEligible: "false",
};

function createDatabase() {
  const holidays: Array<Record<string, unknown> & { id: string; date: Date; name: string; branch: string }> = [];
  return {
    holidays,
    database: {
      holiday: {
        findMany: async ({ where }: { where: { date: { gte: Date; lt: Date } } }) => holidays.filter((item) => item.date >= where.date.gte && item.date < where.date.lt),
        findFirst: async ({ where }: { where: { date: Date; name: { equals: string }; branch: string; id?: { not: string } } }) => holidays.find((item) => item.date.getTime() === where.date.getTime()
          && item.name.toLocaleLowerCase() === where.name.equals.toLocaleLowerCase()
          && item.branch === where.branch
          && item.id !== where.id?.not) ?? null,
        findUnique: async ({ where }: { where: { id: string } }) => holidays.find((item) => item.id === where.id) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const item = { id: `holiday-${holidays.length + 1}`, ...data } as typeof holidays[number];
          holidays.push(item);
          return item;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const index = holidays.findIndex((item) => item.id === where.id);
          if (index < 0) throw { code: "P2025" };
          holidays[index] = { ...holidays[index], ...data };
          return holidays[index];
        },
        delete: async ({ where }: { where: { id: string } }) => {
          const index = holidays.findIndex((item) => item.id === where.id);
          if (index < 0) throw { code: "P2025" };
          return holidays.splice(index, 1)[0];
        },
      },
    } as never,
  };
}

describe("holiday calendar service", () => {
  it("creates, lists by month, updates, and deletes holiday records", async () => {
    const stub = createDatabase();
    const created = await createHoliday(hr, input, stub.database);
    assert.equal(created.name, "Christmas Day");
    assert.equal((await listHolidaysForMonth(employee, "2026-12", stub.database)).length, 1);
    assert.equal((await listHolidaysForMonth(employee, "2026-11", stub.database)).length, 0);

    const updated = await updateHoliday(hr, created.id, { ...input, name: "Christmas" }, stub.database);
    assert.equal(updated.name, "Christmas");
    await deleteHoliday(hr, created.id, stub.database);
    assert.equal(stub.holidays.length, 0);
  });

  it("allows only HR Administrators and Admins to mutate holidays", async () => {
    const stub = createDatabase();
    await assert.rejects(createHoliday(employee, input, stub.database), HolidayAccessError);
    await assert.rejects(updateHoliday(employee, "holiday-1", input, stub.database), HolidayAccessError);
    await assert.rejects(deleteHoliday(employee, "holiday-1", stub.database), HolidayAccessError);
    assert.equal((await createHoliday({ role: "ADMIN" }, input, stub.database)).name, "Christmas Day");
  });

  it("rejects duplicate date/name/branch entries and missing records", async () => {
    const stub = createDatabase();
    const created = await createHoliday(hr, input, stub.database);
    await assert.rejects(createHoliday(hr, input, stub.database), HolidayDuplicateError);
    const otherHoliday = await createHoliday(hr, { ...input, name: "Special Closure", type: "SPECIAL" }, stub.database);
    await updateHoliday(hr, created.id, { ...input, name: "Christmas" }, stub.database);
    await assert.rejects(updateHoliday(hr, otherHoliday.id, { ...input, name: "Christmas" }, stub.database), HolidayDuplicateError);
    await assert.rejects(updateHoliday(hr, "missing", { ...input, name: "Unique holiday" }, stub.database), HolidayNotFoundError);
    await assert.rejects(deleteHoliday(hr, "missing", stub.database), HolidayNotFoundError);
  });
});