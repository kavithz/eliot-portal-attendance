import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateAndPersistDailyAttendance, type EngineDatabase } from "./engine-service";

describe("attendance engine persistence boundary", () => {
  it("reads raw punches and writes only the separate daily result", async () => {
    const raw = [
      { id: "punch-in", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" },
      { id: "punch-out", timestamp: new Date("2026-06-15T12:00:00.000Z"), punchType: "OUT" },
    ];
    const rawBefore = raw.map(({ id, timestamp, punchType }) => [id, timestamp.toISOString(), punchType]);
    const writes: string[] = [];
    const createdDaily: Record<string, unknown>[] = [];
    const database = {
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
        $queryRaw: async () => [],
        employee: {
          findUnique: async () => ({
            id: "employee-1",
            user: { timeZone: "Asia/Colombo" },
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
              roundingRules: {},
            },
          }),
        },
        attendanceRaw: {
          findMany: async () => raw,
        },
        attendanceDaily: {
          findMany: async () => [],
          create: async ({ data }: { data: Record<string, unknown> }) => {
            writes.push("attendanceDaily.create");
            createdDaily.push(data);
            return { id: "daily-1", ...data };
          },
          update: async () => {
            writes.push("attendanceDaily.update");
            throw new Error("No existing daily result was expected.");
          },
        },
      }),
    } as unknown as EngineDatabase;

    const result = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", database);

    assert.equal(result.calculation.workingHours, 9);
    assert.equal(result.attendanceDaily.id, "daily-1");
    assert.deepEqual(writes, ["attendanceDaily.create"]);
    assert.equal(createdDaily[0].employeeId, "employee-1");
    assert.equal(createdDaily[0].shiftId, "shift-1");
    assert.deepEqual(raw.map(({ id, timestamp, punchType }) => [id, timestamp.toISOString(), punchType]), rawBefore);
  });

  it("updates an existing daily row on recalculation without writing raw punches", async () => {
    const raw = [
      { id: "punch-in", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" },
      { id: "punch-out", timestamp: new Date("2026-06-15T12:00:00.000Z"), punchType: "OUT" },
    ];
    let updatedId = "";
    const database = {
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
        $queryRaw: async () => [],
        employee: {
          findUnique: async () => ({
            id: "employee-1",
            user: { timeZone: "Asia/Colombo" },
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
              roundingRules: {},
            },
          }),
        },
        attendanceRaw: { findMany: async () => raw },
        attendanceDaily: {
          findMany: async () => [{ id: "daily-existing" }],
          create: async () => {
            throw new Error("Recalculation should update the existing daily row.");
          },
          update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            updatedId = where.id;
            return { id: where.id, ...data };
          },
        },
      }),
    } as unknown as EngineDatabase;

    const result = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", database);

    assert.equal(updatedId, "daily-existing");
    assert.equal(result.attendanceDaily.id, "daily-existing");
    assert.equal(result.calculation.workingHours, 9);
    assert.deepEqual(raw.map(({ id }) => id), ["punch-in", "punch-out"]);
  });
});
