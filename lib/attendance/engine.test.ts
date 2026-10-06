import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatInTimeZone } from "date-fns-tz";
import {
  attendanceDailyWorkingHoursForStorage,
  calculateDailyAttendance,
  type AttendanceEngineShift,
  type RawAttendancePunch,
} from "./engine";

const shift: AttendanceEngineShift = {
  id: "shift-1",
  startTime: new Date("1970-01-01T08:30:00.000Z"),
  endTime: new Date("1970-01-01T17:30:00.000Z"),
  breakDurationMinutes: 0,
  gracePeriodMinutes: 10,
  lateThresholdMinutes: 0,
  earlyDepartureThresholdMinutes: 0,
  minimumWorkingHours: "8",
  overtimeEligible: false,
  roundingRules: {},
};

function punch(id: string, punchType: RawAttendancePunch["punchType"], localTime: string, date = "2026-06-15"): RawAttendancePunch {
  return {
    id,
    punchType,
    timestamp: new Date(`${date}T${localTime}:00.000+05:30`),
  };
}

function calculate(punches: readonly RawAttendancePunch[], overrides: Partial<AttendanceEngineShift> = {}) {
  return calculateDailyAttendance({
    employeeId: "employee-1",
    date: "2026-06-15",
    timeZone: "Asia/Colombo",
    shift: { ...shift, ...overrides },
    punches,
  });
}

describe("deterministic attendance engine foundation", () => {
  it("calculates one complete IN/OUT period without applying unspecified rounding", () => {
    const result = calculate([
      punch("in", "IN", "08:30"),
      punch("out", "OUT", "17:30"),
    ]);

    assert.equal(result.firstIn?.toISOString(), punch("in", "IN", "08:30").timestamp.toISOString());
    assert.equal(result.lastOut?.toISOString(), punch("out", "OUT", "17:30").timestamp.toISOString());
    assert.equal(result.workPeriods.length, 1);
    assert.equal(result.breakPeriods.length, 0);
    assert.equal(result.workingHours, 9);
    assert.equal(result.lateMinutes, 0);
    assert.equal(result.earlyMinutes, 0);
    assert.equal(result.status, "UNDETERMINED");
    assert.ok(result.statusReasons.some((reason) => reason.includes("status precedence")));
  });

  it("calculates multiple work and break periods from alternating punches", () => {
    const result = calculate([
      punch("in-1", "IN", "08:28"),
      punch("out-1", "OUT", "12:35"),
      punch("in-2", "IN", "13:10"),
      punch("out-2", "OUT", "17:32"),
    ]);

    assert.equal(result.workPeriods.length, 2);
    assert.deepEqual(result.workPeriods.map(({ durationMs }) => durationMs / 60_000), [247, 262]);
    assert.deepEqual(result.breakPeriods.map(({ durationMs }) => durationMs / 60_000), [35]);
    assert.equal(result.workingHours, 509 / 60);
    assert.equal(attendanceDailyWorkingHoursForStorage(result.workingHours), null);
    assert.equal(attendanceDailyWorkingHoursForStorage(8.5), 8.5);
    assert.equal(result.firstIn?.toISOString(), punch("in-1", "IN", "08:28").timestamp.toISOString());
    assert.equal(result.lastOut?.toISOString(), punch("out-2", "OUT", "17:32").timestamp.toISOString());
  });

  it("identifies a trailing IN with no OUT and calculates only complete known periods", () => {
    const result = calculate([
      punch("in-1", "IN", "08:30"),
      punch("out-1", "OUT", "12:00"),
      punch("in-2", "IN", "13:00"),
    ]);

    assert.deepEqual(result.punchIssues, ["MISSING_OUT"]);
    assert.equal(result.status, "MISSING_PUNCH");
    assert.equal(result.workPeriods.length, 1);
    assert.equal(result.workingHours, 3.5);
  });

  it("identifies an OUT with no preceding IN", () => {
    const result = calculate([
      punch("orphan-out", "OUT", "12:00"),
      punch("in", "IN", "13:00"),
    ]);

    assert.ok(result.punchIssues.includes("MISSING_IN"));
    assert.ok(result.punchIssues.includes("MISSING_OUT"));
    assert.equal(result.status, "MISSING_PUNCH");
  });

  it("flags exact duplicates and repeated-direction sequences without choosing a pairing", () => {
    const duplicate = calculate([
      punch("in-1", "IN", "08:30"),
      punch("in-2", "IN", "08:30"),
      punch("out", "OUT", "12:00"),
    ]);
    const unusual = calculate([
      punch("in-1", "IN", "08:30"),
      punch("in-2", "IN", "08:31"),
      punch("out", "OUT", "12:00"),
    ]);

    assert.ok(duplicate.punchIssues.includes("DUPLICATE_PUNCH"));
    assert.ok(duplicate.punchIssues.includes("UNUSUAL_SEQUENCE"));
    assert.equal(duplicate.workingHours, null);
    assert.equal(duplicate.status, "UNDETERMINED");
    assert.ok(unusual.punchIssues.includes("UNUSUAL_SEQUENCE"));
    assert.equal(unusual.workingHours, null);
  });

  it("applies the configured grace period boundary without a hard-coded shift time", () => {
    const exactlyAtGrace = calculate([punch("in", "IN", "08:40"), punch("out", "OUT", "17:30")]);
    const afterGrace = calculate([punch("in", "IN", "08:41"), punch("out", "OUT", "17:30")]);

    assert.equal(exactlyAtGrace.lateMinutes, 0);
    assert.equal(afterGrace.lateMinutes, 1);
    assert.equal(afterGrace.status, "LATE");
  });

  it("calculates late duration from the configured shift start and grace", () => {
    const result = calculate(
      [punch("in", "IN", "08:47"), punch("out", "OUT", "17:30")],
      { startTime: new Date("1970-01-01T08:30:00.000Z"), gracePeriodMinutes: 10 },
    );

    assert.equal(result.lateMinutes, 7);
    assert.equal(result.status, "LATE");
  });

  it("calculates early minutes from the assigned shift end", () => {
    const result = calculate(
      [punch("in", "IN", "08:30"), punch("out", "OUT", "17:10")],
      { endTime: new Date("1970-01-01T17:30:00.000Z") },
    );

    assert.equal(result.earlyMinutes, 20);
    assert.equal(result.status, "EARLY_OUT");
  });

  it("returns a clear error when required Shift configuration is missing", () => {
    assert.throws(
      () => calculate([punch("in", "IN", "08:30")], { gracePeriodMinutes: null }),
      /Configure the assigned Shift start time, end time, and grace period/,
    );
    assert.throws(
      () => calculate([punch("in", "IN", "08:30")], { startTime: null }),
      /Configure the assigned Shift start time, end time, and grace period/,
    );
  });

  it("uses the employee-local date when the UTC calendar date differs", () => {
    const localPunch = {
      id: "local-in",
      punchType: "IN" as const,
      timestamp: new Date("2026-06-14T20:00:00.000Z"),
    };
    const result = calculateDailyAttendance({
      employeeId: "employee-1",
      date: "2026-06-15",
      timeZone: "Asia/Colombo",
      shift,
      punches: [localPunch, punch("out", "OUT", "17:30")],
    });

    assert.equal(formatInTimeZone(result.firstIn!, "Asia/Colombo", "yyyy-MM-dd"), "2026-06-15");
  });

  it("does not mutate raw punch evidence and recalculates deterministically", () => {
    const punches = Object.freeze([
      Object.freeze(punch("in", "IN", "08:30")),
      Object.freeze(punch("out", "OUT", "17:30")),
    ]);
    const before = punches.map(({ id, punchType, timestamp }) => [id, punchType, timestamp.toISOString()]);

    const first = calculate(punches);
    const second = calculate(punches);

    assert.deepEqual(punches.map(({ id, punchType, timestamp }) => [id, punchType, timestamp.toISOString()]), before);
    assert.deepEqual(second, first);
  });
});
