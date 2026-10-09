import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateAndPersistDailyAttendance, type EngineDatabase } from "./engine-service";

const configuredShift = {
  id: "shift-1",
  startTime: new Date("1970-01-01T08:30:00.000Z"),
  endTime: new Date("1970-01-01T17:30:00.000Z"),
  gracePeriodMinutes: 10,
  lateThresholdMinutes: 0,
  earlyDepartureThresholdMinutes: 0,
  breakDurationMinutes: 30,
  minimumWorkingHours: "8",
  overtimeEligible: false,
  roundingRules: null,
  workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
};

type ShiftOverrides = {
  startTime?: Date | null;
  endTime?: Date | null;
  gracePeriodMinutes?: number | null;
  lateThresholdMinutes?: number | null;
  earlyDepartureThresholdMinutes?: number | null;
  breakDurationMinutes?: number | null;
  minimumWorkingHours?: string | null;
  overtimeEligible?: boolean | null;
  roundingRules?: unknown;
  workingDays?: string[];
};

function createHarness(
  raw: Array<{ id: string; timestamp: Date; punchType: "IN" | "OUT" }>,
  shiftOverrides: ShiftOverrides = {},
  isOrganizationHoliday = false,
) {
  const rawBefore = raw.map(({ id, timestamp, punchType }) => [id, timestamp.toISOString(), punchType]);
  const dailyRows: Array<Record<string, unknown> & { id: string }> = [];
  let creates = 0;
  let updates = 0;
  const database = {
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      $queryRaw: async () => [],
      employee: {
        findUnique: async () => ({
          id: "employee-1",
          user: { timeZone: "Asia/Colombo" },
          shift: { ...configuredShift, ...shiftOverrides },
        }),
      },
      attendanceRaw: {
        findMany: async () => raw,
      },
      holiday: {
        findFirst: async ({ where }: { where: { branch: string; applicableEmployeeGroups: { isEmpty: boolean } } }) => (
          isOrganizationHoliday && where.branch === "" && where.applicableEmployeeGroups.isEmpty ? { id: "holiday-1" } : null
        ),
      },
      attendanceDaily: {
        findMany: async () => dailyRows.map(({ id }) => ({ id })),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          creates += 1;
          const row = { id: `daily-${creates}`, ...data };
          dailyRows.push(row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates += 1;
          const index = dailyRows.findIndex(({ id }) => id === where.id);
          if (index < 0) throw new Error("Expected existing attendance daily row.");
          dailyRows[index] = { ...dailyRows[index], ...data };
          return dailyRows[index];
        },
      },
    }),
  } as unknown as EngineDatabase;
  return {
    database,
    rawBefore,
    raw,
    dailyRows,
    get creates() { return creates; },
    get updates() { return updates; },
  };
}

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

  it("persists Present, Late, and Early Out when the configured data supports each status", async () => {
    const scenarios = [
      {
        name: "Present",
        punches: [
          { id: "in", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" as const },
          { id: "out", timestamp: new Date("2026-06-15T12:00:00.000Z"), punchType: "OUT" as const },
        ],
        status: "PRESENT",
      },
      {
        name: "Late",
        punches: [
          { id: "in", timestamp: new Date("2026-06-15T03:11:00.000Z"), punchType: "IN" as const },
          { id: "out", timestamp: new Date("2026-06-15T12:00:00.000Z"), punchType: "OUT" as const },
        ],
        status: "LATE",
      },
      {
        name: "Early Out",
        punches: [
          { id: "in", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" as const },
          { id: "out", timestamp: new Date("2026-06-15T11:59:00.000Z"), punchType: "OUT" as const },
        ],
        status: "EARLY_OUT",
      },
    ];

    for (const scenario of scenarios) {
      const harness = createHarness(scenario.punches);
      const result = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", harness.database);
      assert.equal(result.calculation.status, scenario.status, scenario.name);
      assert.equal(result.attendanceDaily.status, scenario.status, scenario.name);
    }
  });

  it("calculates multiple punch periods and preserves the raw evidence", async () => {
    const raw = [
      { id: "in-am", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" as const },
      { id: "out-am", timestamp: new Date("2026-06-15T07:00:00.000Z"), punchType: "OUT" as const },
      { id: "in-pm", timestamp: new Date("2026-06-15T07:30:00.000Z"), punchType: "IN" as const },
      { id: "out-pm", timestamp: new Date("2026-06-15T11:30:00.000Z"), punchType: "OUT" as const },
    ];
    const harness = createHarness(raw, { endTime: new Date("1970-01-01T17:00:00.000Z") });
    const result = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", harness.database);

    assert.equal(result.calculation.workPeriods.length, 2);
    assert.equal(result.calculation.breakPeriods.length, 1);
    assert.equal(result.calculation.workingHours, 8);
    assert.equal(result.attendanceDaily.workingHours, 8);
    assert.equal(result.calculation.status, "PRESENT");
    assert.deepEqual(harness.raw.map(({ id, timestamp, punchType }) => [id, timestamp.toISOString(), punchType]), harness.rawBefore);
  });

  it("persists incomplete and unusual punch sequences without marking them Present", async () => {
    const incomplete = createHarness([
      { id: "in", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" },
    ]);
    const incompleteResult = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", incomplete.database);
    assert.equal(incompleteResult.calculation.status, "MISSING_PUNCH");
    assert.equal(incompleteResult.attendanceDaily.status, "MISSING_PUNCH");

    const unusual = createHarness([
      { id: "in-1", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" },
      { id: "in-2", timestamp: new Date("2026-06-15T03:01:00.000Z"), punchType: "IN" },
      { id: "out", timestamp: new Date("2026-06-15T07:00:00.000Z"), punchType: "OUT" },
    ]);
    const unusualResult = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", unusual.database);
    assert.equal(unusualResult.calculation.status, "UNDETERMINED");
    assert.equal(unusualResult.attendanceDaily.status, "UNDETERMINED");
    assert.equal(unusualResult.calculation.workingHours, null);
  });

  it("keeps status undetermined when optional shift settings are unset", async () => {
    const harness = createHarness([
      { id: "in", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" },
      { id: "out", timestamp: new Date("2026-06-15T12:00:00.000Z"), punchType: "OUT" },
    ], {
      gracePeriodMinutes: null,
      lateThresholdMinutes: null,
      earlyDepartureThresholdMinutes: null,
      minimumWorkingHours: null,
    });
    const result = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", harness.database);

    assert.equal(result.calculation.status, "UNDETERMINED");
    assert.equal(result.calculation.lateMinutes, null);
    assert.equal(result.attendanceDaily.status, "UNDETERMINED");

    const unsetMinimum = createHarness([
      { id: "in", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" },
      { id: "out", timestamp: new Date("2026-06-15T12:00:00.000Z"), punchType: "OUT" },
    ], { minimumWorkingHours: null });
    const minimumResult = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", unsetMinimum.database);
    assert.equal(minimumResult.calculation.status, "UNDETERMINED");
    assert.equal(minimumResult.attendanceDaily.status, "UNDETERMINED");
  });

  it("does not guess absence-related statuses when a day has no punches", async () => {
    const harness = createHarness([]);
    const result = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", harness.database);

    assert.equal(result.calculation.status, "UNDETERMINED");
    assert.equal(result.attendanceDaily.status, "UNDETERMINED");
    assert.equal(result.attendanceDaily.firstIn, null);
    assert.equal(result.attendanceDaily.lastOut, null);
  });

  it("uses an organization-wide holiday status only when there are no punches", async () => {
    const holiday = createHarness([], {}, true);
    const holidayResult = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", holiday.database);
    assert.equal(holidayResult.calculation.status, "HOLIDAY");
    assert.equal(holidayResult.attendanceDaily.status, "HOLIDAY");

    const workedHoliday = createHarness([
      { id: "in", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" },
      { id: "out", timestamp: new Date("2026-06-15T12:00:00.000Z"), punchType: "OUT" },
    ], {}, true);
    const workedResult = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", workedHoliday.database);
    assert.equal(workedResult.calculation.status, "PRESENT");
  });

  it("derives Weekend only when the assigned Shift has configured applicable days", async () => {
    const configuredWorkingDays = createHarness([], { workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] });
    const weekend = await calculateAndPersistDailyAttendance("employee-1", "2026-06-14", configuredWorkingDays.database);
    assert.equal(weekend.calculation.status, "WEEKEND");
    assert.equal(weekend.attendanceDaily.status, "WEEKEND");

    const unsetWorkingDays = createHarness([], { workingDays: [] });
    const unknown = await calculateAndPersistDailyAttendance("employee-1", "2026-06-14", unsetWorkingDays.database);
    assert.equal(unknown.calculation.status, "UNDETERMINED");
    assert.equal(unknown.attendanceDaily.status, "UNDETERMINED");
  });

  it("recalculates the same employee and date by updating one daily row", async () => {
    const harness = createHarness([
      { id: "in", timestamp: new Date("2026-06-15T03:00:00.000Z"), punchType: "IN" },
      { id: "out", timestamp: new Date("2026-06-15T12:00:00.000Z"), punchType: "OUT" },
    ]);

    const first = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", harness.database);
    const second = await calculateAndPersistDailyAttendance("employee-1", "2026-06-15", harness.database);

    assert.equal(harness.creates, 1);
    assert.equal(harness.updates, 1);
    assert.equal(harness.dailyRows.length, 1);
    assert.equal(first.attendanceDaily.id, second.attendanceDaily.id);
    assert.deepEqual(first.calculation, second.calculation);
    assert.deepEqual(harness.raw.map(({ id, timestamp, punchType }) => [id, timestamp.toISOString(), punchType]), harness.rawBefore);
  });
});
