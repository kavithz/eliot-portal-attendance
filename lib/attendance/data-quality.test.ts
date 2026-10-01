import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminAttendanceFilterSchema } from "./admin-validation";
import { getAttendanceDataQualityReasons } from "./data-quality";

describe("attendance data-quality review reasons", () => {
  it("identifies invalid IN and OUT timestamps separately", () => {
    assert.deepEqual(getAttendanceDataQualityReasons({ startAt: new Date("invalid"), endAt: null }), ["INVALID_IN_TIMESTAMP"]);
    assert.deepEqual(getAttendanceDataQualityReasons({ startAt: new Date("2026-06-15T08:30:00Z"), endAt: new Date("invalid") }), ["INVALID_OUT_TIMESTAMP"]);
  });

  it("identifies reversed timestamps and durations outside the safe integer range", () => {
    assert.deepEqual(getAttendanceDataQualityReasons({ startAt: new Date("2026-06-15T09:00:00Z"), endAt: new Date("2026-06-15T08:59:00Z") }), ["OUT_BEFORE_IN"]);
    assert.deepEqual(getAttendanceDataQualityReasons({ startAt: new Date(-8.64e15), endAt: new Date(8.64e15) }), ["UNSAFE_DURATION"]);
  });

  it("does not classify valid completed or intentionally open sessions as review cases", () => {
    assert.deepEqual(getAttendanceDataQualityReasons({ startAt: new Date("2026-06-15T08:30:00Z"), endAt: new Date("2026-06-15T17:30:00Z") }), []);
    assert.deepEqual(getAttendanceDataQualityReasons({ startAt: new Date("2026-06-15T08:30:00Z"), endAt: null }), []);
  });

  it("accepts supported review filters and rejects unknown reasons", () => {
    assert.equal(adminAttendanceFilterSchema.safeParse({ reviewReason: "OUT_BEFORE_IN" }).success, true);
    assert.equal(adminAttendanceFilterSchema.safeParse({ reviewReason: "UNRESOLVED" }).success, false);
  });
});