import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromZonedTime } from "date-fns-tz";
import { classifyAttendancePunch } from "./schedule";

function zonedInstant(date: string, time: string, timeZone: string) {
  return fromZonedTime(`${date}T${time}:00.000`, timeZone);
}

describe("confirmed working-time rules", () => {
  it("classifies an 08:00 IN as early arrival, not late", () => {
    assert.equal(classifyAttendancePunch("IN", zonedInstant("2026-06-15", "08:00", "Asia/Colombo"), "Asia/Colombo"), "EARLY_ARRIVAL");
  });

  it("classifies 08:30 IN as on time", () => {
    assert.equal(classifyAttendancePunch("IN", zonedInstant("2026-06-15", "08:30", "Asia/Colombo"), "Asia/Colombo"), "ON_TIME");
  });

  it("classifies 08:31 IN as late", () => {
    assert.equal(classifyAttendancePunch("IN", zonedInstant("2026-06-15", "08:31", "Asia/Colombo"), "Asia/Colombo"), "LATE");
  });

  it("classifies 17:00 OUT as an early departure", () => {
    assert.equal(classifyAttendancePunch("OUT", zonedInstant("2026-06-15", "17:00", "Asia/Colombo"), "Asia/Colombo"), "EARLY_DEPARTURE");
  });

  for (const time of ["17:30", "18:00"]) {
    it(`classifies ${time} OUT as normal`, () => {
      assert.equal(classifyAttendancePunch("OUT", zonedInstant("2026-06-15", time, "Asia/Colombo"), "Asia/Colombo"), "NORMAL");
    });
  }

  it("applies the same boundaries to WFH punches", () => {
    assert.equal(classifyAttendancePunch("WFH_IN", zonedInstant("2026-06-15", "08:31", "Asia/Dhaka"), "Asia/Dhaka"), "LATE");
    assert.equal(classifyAttendancePunch("WFH_OUT", zonedInstant("2026-06-15", "17:00", "Asia/Dhaka"), "Asia/Dhaka"), "EARLY_DEPARTURE");
  });

  it("interprets Asia/Colombo local wall time rather than UTC time", () => {
    assert.equal(classifyAttendancePunch("IN", zonedInstant("2026-06-15", "08:31", "Asia/Colombo"), "Asia/Colombo"), "LATE");
  });

  it("interprets Asia/Dhaka local wall time rather than UTC time", () => {
    assert.equal(classifyAttendancePunch("IN", zonedInstant("2026-06-15", "08:30", "Asia/Dhaka"), "Asia/Dhaka"), "ON_TIME");
  });

  it("uses the correct New York wall-time boundary on both DST transition days", () => {
    assert.equal(classifyAttendancePunch("IN", zonedInstant("2026-03-08", "08:30", "America/New_York"), "America/New_York"), "ON_TIME");
    assert.equal(classifyAttendancePunch("OUT", zonedInstant("2026-11-01", "17:29", "America/New_York"), "America/New_York"), "EARLY_DEPARTURE");
  });
});