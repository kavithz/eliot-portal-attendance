import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getEmployeeAttendanceDashboard, getEmployeeAttendanceHistory } from "./service";
import { getEmployeeLocalDayWindow } from "./timezone";

describe("employee attendance data access", () => {
  it("scopes dashboard and history queries to the authenticated employee context", async () => {
    const filters: Array<Record<string, unknown>> = [];
    const database = {
      workSession: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          filters.push(where);
          return null;
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          filters.push(where);
          return [];
        },
      },
    } as never;
    const employee = { id: "session-user-17", timeZone: "Asia/Colombo" };

    await getEmployeeAttendanceDashboard(employee, new Date("2026-06-15T12:00:00Z"), database);
    await getEmployeeAttendanceHistory(employee, database);

    assert.equal(filters.length, 3);
    for (const filter of filters) {
      assert.deepEqual(filter.record, { employeeId: employee.id });
    }

    const todayQuery = filters[1];
    const window = getEmployeeLocalDayWindow(new Date("2026-06-15T12:00:00Z"), employee.timeZone);
    assert.deepEqual(todayQuery.OR, [
      { startAt: { gte: window.startAt, lt: window.endAt } },
      { endAt: { gte: window.startAt, lt: window.endAt } },
    ]);
  });

  it("calculates a different local calendar window for Dhaka", async () => {
    let todayFilter: Record<string, unknown> | undefined;
    const database = {
      workSession: {
        findFirst: async () => null,
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          todayFilter = where;
          return [];
        },
      },
    } as never;
    const now = new Date("2026-06-15T18:30:00Z");
    const employee = { id: "dhaka-employee", timeZone: "Asia/Dhaka" };

    const result = await getEmployeeAttendanceDashboard(employee, now, database);
    const window = getEmployeeLocalDayWindow(now, employee.timeZone);

    assert.equal(result.date, "2026-06-16");
    assert.deepEqual(todayFilter?.OR, [
      { startAt: { gte: window.startAt, lt: window.endAt } },
      { endAt: { gte: window.startAt, lt: window.endAt } },
    ]);
    assert.deepEqual(todayFilter?.record, { employeeId: employee.id });
  });
});