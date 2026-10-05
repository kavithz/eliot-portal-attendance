import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ShiftWeekday } from "@prisma/client";
import {
  calculateEmployeeLeaveWorkdays,
  countScheduledWorkdays,
  LeaveWorkdayScheduleError,
} from "@/lib/leave/workdays";

describe("scheduled Leave workdays", () => {
  it("counts only the selected shift weekdays, including both range boundaries", () => {
    assert.equal(
      countScheduledWorkdays("2026-06-01", "2026-06-07", [
        ShiftWeekday.MONDAY,
        ShiftWeekday.WEDNESDAY,
        ShiftWeekday.FRIDAY,
      ], new Set()),
      3,
    );
  });

  it("excludes dates returned by the separate holiday resolver", async () => {
    const input = { employeeUserId: "user-1", startDate: "2026-06-01", endDate: "2026-06-07" };
    const database = {
      employee: {
        findUnique: async ({ where }: { where: { userId: string } }) => {
          assert.deepEqual(where, { userId: "user-1" });
          return { shift: { workingDays: [ShiftWeekday.MONDAY, ShiftWeekday.WEDNESDAY, ShiftWeekday.FRIDAY] } };
        },
      },
    } as never;
    const resolverCalls: typeof input[] = [];
    const count = await calculateEmployeeLeaveWorkdays(input, {
      database,
      resolveHolidayDates: async (scope) => {
        resolverCalls.push(scope);
        return new Set(["2026-06-03"]);
      },
    });
    assert.equal(count, 2);
    assert.deepEqual(resolverCalls, [input]);
  });

  it("rejects missing shift schedules and invalid date ranges", async () => {
    await assert.rejects(calculateEmployeeLeaveWorkdays(
      { employeeUserId: "user-1", startDate: "2026-06-01", endDate: "2026-06-07" },
      {
        database: { employee: { findUnique: async () => null } } as never,
        resolveHolidayDates: async () => new Set(),
      },
    ), LeaveWorkdayScheduleError);
    assert.throws(() => countScheduledWorkdays("2026-06-08", "2026-06-07", [ShiftWeekday.MONDAY], new Set()), RangeError);
    assert.throws(() => countScheduledWorkdays("2026-02-30", "2026-03-01", [ShiftWeekday.MONDAY], new Set()), RangeError);
  });

  it("uses the employee's assigned Shift weekdays rather than a role-based default", async () => {
    const database = {
      employee: {
        findUnique: async () => ({ shift: { workingDays: [ShiftWeekday.SATURDAY, ShiftWeekday.SUNDAY] } }),
      },
    } as never;
    const count = await calculateEmployeeLeaveWorkdays(
      { employeeUserId: "employee-user", startDate: "2026-06-01", endDate: "2026-06-07" },
      { database, resolveHolidayDates: async () => new Set() },
    );
    assert.equal(count, 2);
  });
});
