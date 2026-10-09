import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEmployeeMonthlyReport, buildMonthWindow } from "./reports";

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
      ],
    );

    assert.equal(report.summary.presentDays, 1);
    assert.equal(report.summary.lateDays, 1);
    assert.equal(report.summary.earlyOutDays, 1);
    assert.equal(report.summary.missingPunchDays, 1);
    assert.equal(report.summary.totalCalculatedDays, 4);
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

});