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

});