import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { holidayInputSchema, holidayListQuerySchema } from "./validation";

const validHoliday = {
  date: "2026-12-25",
  name: "Christmas Day",
  type: "PUBLIC",
  branch: "",
  applicableEmployeeGroups: "",
  isPaid: "true",
  overtimeEligible: "false",
};

describe("holiday validation", () => {
  it("accepts SRS holiday fields and normalizes optional scope", () => {
    const result = holidayInputSchema.parse({
      ...validHoliday,
      applicableEmployeeGroups: "Operations, HR, operations",
      isPaid: "false",
      overtimeEligible: "true",
    });

    assert.deepEqual(result.applicableEmployeeGroups, ["Operations", "HR"]);
    assert.equal(result.branch, "");
    assert.equal(result.isPaid, false);
    assert.equal(result.overtimeEligible, true);
    assert.deepEqual(holidayInputSchema.parse(validHoliday).applicableEmployeeGroups, []);
  });

  it("rejects invalid dates, missing names, and branch-specific holidays without a branch", () => {
    assert.equal(holidayInputSchema.safeParse({ ...validHoliday, date: "2026-02-30" }).success, false);
    assert.equal(holidayInputSchema.safeParse({ ...validHoliday, name: "  " }).success, false);
    assert.equal(holidayInputSchema.safeParse({ ...validHoliday, type: "BRANCH_SPECIFIC" }).success, false);
  });

  it("accepts only valid calendar months", () => {
    assert.equal(holidayListQuerySchema.safeParse({ month: "2026-10" }).success, true);
    assert.equal(holidayListQuerySchema.safeParse({ month: "2026-13" }).success, false);
  });
});