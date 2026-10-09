import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEmployeeMonthlyReport, buildMonthWindow, getEmployeeMonthlyReport, mergeMonthlyDateRanges } from "./reports";

describe("employee-local monthly report windows", () => {
  it("uses IANA local midnight for Sri Lanka and Bangladesh month boundaries", () => {
    const colombo = buildMonthWindow("2026-06", "Asia/Colombo");
    const dhaka = buildMonthWindow("2026-06", "Asia/Dhaka");

    assert.equal(colombo.start.toISOString(), "2026-05-31T18:30:00.000Z");
    assert.equal(colombo.end.toISOString(), "2026-06-30T18:29:59.999Z");
    assert.equal(dhaka.start.toISOString(), "2026-05-31T18:00:00.000Z");
    assert.equal(dhaka.end.toISOString(), "2026-06-30T17:59:59.999Z");
  });

  it("includes and excludes sessions using each employee's local month", () => {
    const sessions = [
      { id: "last-may-utc", mode: "OFFICE" as const, startAt: new Date("2026-05-31T18:15:00.000Z"), endAt: null },
      { id: "last-june-utc", mode: "WFH" as const, startAt: new Date("2026-06-30T18:15:00.000Z"), endAt: null },
    ];
    const colombo = buildEmployeeMonthlyReport({ timeZone: "Asia/Colombo" }, "2026-06", sessions);
    const dhaka = buildEmployeeMonthlyReport({ timeZone: "Asia/Dhaka" }, "2026-06", sessions);

    assert.deepEqual(colombo.days.map(({ sessions: entries }) => entries.map(({ id }) => id)), [["last-june-utc"]]);
    assert.deepEqual(dhaka.days.map(({ sessions: entries }) => entries.map(({ id }) => id)), [["last-may-utc"]]);
  });

  it("rejects malformed report months", () => {
    assert.throws(() => buildMonthWindow("2026-13", "Asia/Colombo"), /valid report month/);
    assert.throws(() => buildMonthWindow("2026-6", "Asia/Colombo"), /valid report month/);
  });

  it("handles leap February and December-to-January report windows", () => {
    const leapFebruary = buildMonthWindow("2024-02", "Asia/Colombo");
    const december = buildMonthWindow("2025-12", "Asia/Colombo");
    const january = buildMonthWindow("2026-01", "Asia/Colombo");

    assert.equal(leapFebruary.start.toISOString(), "2024-01-31T18:30:00.000Z");
    assert.equal(leapFebruary.end.toISOString(), "2024-02-29T18:29:59.999Z");
    assert.equal(december.monthLabel, "2025-12");
    assert.equal(january.start.toISOString(), "2025-12-31T18:30:00.000Z");
  });

  it("clips and merges overlapping approved-leave ranges without double counting dates", () => {
    assert.deepEqual(mergeMonthlyDateRanges([
      { startDate: "2026-06-03", endDate: "2026-06-05" },
      { startDate: "2026-06-05", endDate: "2026-06-08" },
      { startDate: "2026-05-28", endDate: "2026-05-30" },
      { startDate: "2026-06-30", endDate: "2026-07-02" },
    ], "2026-06-01", "2026-06-30"), [
      { startDate: "2026-06-03", endDate: "2026-06-08" },
      { startDate: "2026-06-30", endDate: "2026-06-30" },
    ]);
  });

  it("includes engine-calculated daily statuses in the monthly summary when available", () => {
    const report = buildEmployeeMonthlyReport(
      { timeZone: "Asia/Colombo" },
      "2026-06",
      [
        { id: "session-1", mode: "OFFICE", startAt: new Date("2026-06-02T08:45:00.000Z"), endAt: new Date("2026-06-02T17:20:00.000Z") },
        { id: "session-2", mode: "OFFICE", startAt: new Date("2026-06-03T08:45:00.000Z"), endAt: new Date("2026-06-03T17:20:00.000Z") },
      ],
      [
        { date: "2026-06-02", status: "PRESENT" },
        { date: "2026-06-03", status: "LATE" },
        { date: "2026-06-04", status: "EARLY_OUT" },
        { date: "2026-06-05", status: "MISSING_PUNCH" },
        { date: "2026-06-06", status: "ABSENT" },
      ],
    );

    assert.equal(report.summary.presentDays, 1);
    assert.equal(report.summary.lateDays, 1);
    assert.equal(report.summary.earlyOutDays, 1);
    assert.equal(report.summary.missingPunchDays, 1);
    assert.equal(report.summary.absentDays, 1);
    assert.equal(report.summary.totalCalculatedDays, 5);
  });

  it("includes date-only engine rows on the first day of a UTC+14 employee month", () => {
    const report = buildEmployeeMonthlyReport(
      { timeZone: "Pacific/Kiritimati" },
      "2026-06",
      [],
      [{ date: "2026-06-01", status: "HOLIDAY" }],
    );

    assert.equal(report.summary.holidayDays, 1);
    assert.equal(report.summary.totalCalculatedDays, 1);
  });

  it("counts duplicate daily rows once and marks conflicting statuses undetermined", () => {
    const report = buildEmployeeMonthlyReport({ timeZone: "UTC" }, "2026-06", [], [
      { date: "2026-06-01", status: "PRESENT" },
      { date: "2026-06-01", status: "PRESENT" },
      { date: "2026-06-02", status: "LATE" },
      { date: "2026-06-02", status: "EARLY_OUT" },
    ], { totalWorkingDays: 22, approvedLeaveDays: 1, holidayDays: 1 });

    assert.equal(report.summary.presentDays, 1);
    assert.equal(report.summary.lateDays, 0);
    assert.equal(report.summary.earlyOutDays, 0);
    assert.equal(report.summary.undeterminedDays, 1);
    assert.equal(report.summary.totalCalculatedDays, 2);
    assert.equal(report.summary.totalWorkingDays, 22);
    assert.equal(report.summary.approvedLeaveDays, 1);
    assert.equal(report.summary.holidayDays, 1);
  });

  it("keeps engine working hours separate from session duration", () => {
    const report = buildEmployeeMonthlyReport({ timeZone: "UTC" }, "2026-06", [
      { id: "session-1", mode: "OFFICE", startAt: new Date("2026-06-01T08:00:00.000Z"), endAt: new Date("2026-06-01T17:00:00.000Z") },
    ], [{ date: "2026-06-01", status: "PRESENT", workingHours: 8 }]);

    assert.equal(report.summary.totalWorkedMs, 9 * 3_600_000);
    assert.equal(report.summary.engineWorkedMs, 8 * 3_600_000);
    assert.equal(report.summary.engineCalculatedDays, 1);
  });

  it("does not present missing engine status data as zero attendance", () => {
    const report = buildEmployeeMonthlyReport({ timeZone: "UTC" }, "2026-06", []);

    assert.equal(report.summary.presentDays, null);
    assert.equal(report.summary.lateDays, null);
    assert.equal(report.summary.earlyOutDays, null);
    assert.equal(report.summary.absentDays, null);
    assert.equal(report.summary.totalCalculatedDays, 0);
  });

  it("uses linked Employee records, shift weekdays, holidays, leave, and saved corrections", async () => {
    const calls: Record<string, unknown> = {};
    const database = {
      employee: {
        findUnique: async ({ where }: { where: { userId: string } }) => {
          calls.employeeWhere = where;
          return {
            id: "employee-record-1",
            shift: {
              id: "shift-1",
              startTime: new Date("1970-01-01T08:30:00.000Z"),
              endTime: new Date("1970-01-01T17:30:00.000Z"),
              gracePeriodMinutes: 10,
              lateThresholdMinutes: 0,
              earlyDepartureThresholdMinutes: 0,
              breakDurationMinutes: 0,
              minimumWorkingHours: "8",
              overtimeEligible: false,
              roundingRules: null,
              workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
            },
          };
        },
      },
      workSession: {
        findMany: async ({ where }: { where: { record: { employeeId: string } } }) => {
          calls.sessionWhere = where;
          return [{ id: "session-1", mode: "OFFICE", startAt: new Date("2026-06-01T02:30:00.000Z"), endAt: new Date("2026-06-01T11:30:00.000Z") }];
        },
      },
      attendanceDaily: {
        findMany: async ({ where }: { where: { employeeId: string } }) => {
          calls.dailyWhere = where;
          return [{
            date: new Date("2026-06-01T00:00:00.000Z"),
            status: "LATE",
            workingHours: 7.5,
            lateMinutes: 5,
            earlyMinutes: 0,
          }];
        },
      },
      attendanceRaw: {
        findMany: async ({ where }: { where: { employeeId: string } }) => {
          calls.rawWhere = where;
          return [
            { id: "punch-in", timestamp: new Date("2026-06-05T03:15:00.000Z"), punchType: "IN" },
            { id: "punch-out", timestamp: new Date("2026-06-05T12:00:00.000Z"), punchType: "OUT" },
            { id: "missing-out-in", timestamp: new Date("2026-06-08T03:00:00.000Z"), punchType: "IN" },
            { id: "missing-in-out", timestamp: new Date("2026-06-09T12:00:00.000Z"), punchType: "OUT" },
          ];
        },
      },
      holiday: {
        findMany: async () => [{ date: new Date("2026-06-03T00:00:00.000Z") }],
      },
      leaveRequest: {
        findMany: async ({ where }: { where: { employeeId: string; status: string } }) => {
          calls.leaveWhere = where;
          return [
            { startDate: new Date("2026-06-02T00:00:00.000Z"), endDate: new Date("2026-06-03T00:00:00.000Z") },
            { startDate: new Date("2026-06-03T00:00:00.000Z"), endDate: new Date("2026-06-04T00:00:00.000Z") },
          ];
        },
      },
    } as never;

    const report = await getEmployeeMonthlyReport({
      id: "user-1",
      name: "Alex Employee",
      timeZone: "Asia/Colombo",
    }, "2026-06", database);

    assert.deepEqual(calls.employeeWhere, { userId: "user-1" });
    assert.deepEqual(calls.sessionWhere, { record: { employeeId: "user-1" }, startAt: { gte: new Date("2026-05-31T18:30:00.000Z"), lte: new Date("2026-06-30T18:29:59.999Z") } });
    assert.deepEqual(calls.dailyWhere, { employeeId: "employee-record-1", date: { gte: new Date("2026-06-01T00:00:00.000Z"), lt: new Date("2026-07-01T00:00:00.000Z") } });
    assert.deepEqual(calls.rawWhere, { employeeId: "employee-record-1", timestamp: { gte: new Date("2026-05-31T18:30:00.000Z"), lte: new Date("2026-06-30T18:29:59.999Z") } });
    assert.equal((calls.leaveWhere as { status: string }).status, "APPROVED");
    assert.equal(report.summary.totalWorkingDays, 21);
    assert.equal(report.summary.approvedLeaveDays, 2);
    assert.equal(report.summary.holidayDays, 1);
    assert.equal(report.summary.lateDays, 2);
    assert.equal(report.summary.missingPunchDays, 2);
    assert.equal(report.summary.weekendDays, 8);
    assert.equal(report.summary.undeterminedDays, 0);
    assert.equal(report.summary.engineWorkedMs, (7.5 + 8.75) * 3_600_000);
    assert.equal(report.summary.engineCalculatedDays, 4);
  });

});