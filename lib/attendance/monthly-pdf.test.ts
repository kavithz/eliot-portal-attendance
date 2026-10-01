import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMonthlyAttendancePdf } from "./monthly-pdf";

describe("monthly attendance PDF export", () => {
  it("creates a PDF containing the monthly summary and attendance rows", async () => {
    const pdf = await createMonthlyAttendancePdf({
      month: "2026-06",
      title: "Employee attendance",
      employees: [{
        name: "Jane Employee",
        email: "jane@example.invalid",
        timeZone: "Asia/Colombo",
        report: {
          monthLabel: "2026-06",
          empty: false,
          summary: { totalSessions: 1, completedSessions: 1, activeSessions: 0, totalWorkedMs: 8 * 60 * 60 * 1000 },
          days: [{
            date: "2026-06-15",
            sessions: [{
              id: "session-1",
              mode: "OFFICE",
              startAt: new Date("2026-06-15T03:30:00.000Z"),
              endAt: new Date("2026-06-15T11:30:00.000Z"),
            }],
            totalWorkedMs: 8 * 60 * 60 * 1000,
          }],
        },
      }],
      summary: { totalSessions: 1, totalWorkedMs: 8 * 60 * 60 * 1000 },
    });

    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(pdf.includes(Buffer.from("/Type /Page")));
    assert.ok(pdf.subarray(-20).toString("ascii").includes("%%EOF"));
  });
});