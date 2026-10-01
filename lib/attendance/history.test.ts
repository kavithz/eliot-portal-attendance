import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupSessionsByEmployeeLocalDay, type AttendanceSession } from "./history";

function session(id: string, mode: AttendanceSession["mode"], startAt: string, endAt: string | null): AttendanceSession {
  return { id, mode, startAt: new Date(startAt), endAt: endAt ? new Date(endAt) : null };
}

describe("employee-local attendance history", () => {
  it("groups every multiple and mixed Office/WFH session by employee-local start date", () => {
    const history = groupSessionsByEmployeeLocalDay([
      session("office-1", "OFFICE", "2026-06-15T02:30:00Z", "2026-06-15T06:30:00Z"),
      session("wfh-1", "WFH", "2026-06-15T08:00:00Z", "2026-06-15T12:00:00Z"),
      session("office-2", "OFFICE", "2026-06-15T17:00:00Z", null),
      session("next-day", "WFH", "2026-06-16T19:00:00Z", "2026-06-16T20:00:00Z"),
    ], "Asia/Colombo");

    assert.deepEqual(history.days.map((day) => day.date), ["2026-06-17", "2026-06-15"]);
    const june15 = history.days[1];
    assert.deepEqual(june15.sessions.map(({ session: item }) => item.id), ["office-1", "wfh-1", "office-2"]);
    assert.deepEqual(june15.sessions.map(({ session: item }) => item.mode), ["OFFICE", "WFH", "OFFICE"]);
    assert.equal(june15.sessions[2].status, "ACTIVE");
  });

  it("sums completed session durations and excludes active sessions", () => {
    const history = groupSessionsByEmployeeLocalDay([
      session("office", "OFFICE", "2026-06-15T02:30:00Z", "2026-06-15T06:30:00Z"),
      session("wfh", "WFH", "2026-06-15T08:00:00Z", "2026-06-15T12:00:00Z"),
      session("active", "OFFICE", "2026-06-15T13:00:00Z", null),
    ], "Asia/Colombo");

    assert.equal(history.days[0].totalWorkedMs, 8 * 60 * 60 * 1000);
    assert.equal(history.days[0].sessions[2].durationMs, null);
    assert.equal(history.days[0].sessions[2].status, "ACTIVE");
  });

  it("uses the employee-local calendar date when the UTC date differs", () => {
    const history = groupSessionsByEmployeeLocalDay([
      session("midnight", "OFFICE", "2026-06-15T18:30:00Z", "2026-06-15T19:00:00Z"),
    ], "Asia/Colombo");

    assert.equal(history.days[0].date, "2026-06-16");
  });

  it("keeps invalid or incomplete timestamps out of worked totals", () => {
    const history = groupSessionsByEmployeeLocalDay([
      session("invalid-end", "WFH", "2026-06-15T02:30:00Z", "2026-06-15T01:30:00Z"),
      session("malformed-end", "OFFICE", "2026-06-15T02:45:00Z", "not-a-date"),
      session("active", "OFFICE", "2026-06-15T03:00:00Z", null),
      { id: "invalid-start", mode: "OFFICE", startAt: new Date("invalid"), endAt: null },
    ], "Asia/Dhaka");

    assert.equal(history.invalidSessions, 1);
    assert.equal(history.days[0].sessions[0].status, "INVALID");
    assert.equal(history.days[0].sessions[1].status, "INVALID");
    assert.equal(history.days[0].totalWorkedMs, 0);
  });
});