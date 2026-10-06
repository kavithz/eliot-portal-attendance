import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { applyAttendanceAction, AttendanceStateError } from "./service";
import { attendanceActionSchema, type AttendanceAction } from "./validation";
import { getEmployeeLocalDayWindow } from "./timezone";

type StoredSession = {
  id: string;
  employeeId: string;
  mode: "OFFICE" | "WFH";
  startAt: Date;
  endAt: Date | null;
};

function createDatabase(
  initialSessions: StoredSession[] = [],
  timeZone = "Asia/Colombo",
  hasEmployeeRecord = true,
) {
  const sessions = [...initialSessions];
  const rawPunches: Array<{
    id: string;
    employeeId: string;
    timestamp: Date;
    punchType: "IN" | "OUT";
    source: string;
    deviceId: null;
    location: null;
  }> = [];
  let nextId = 1;
  let nextRawId = 1;
  let lockTail: Promise<void> = Promise.resolve();

  const database = {
    $transaction: async (operation: (transaction: never) => Promise<unknown>) => {
      let releaseLock = () => {};
      const transaction = {
        $queryRaw: async () => {
          const previousLock = lockTail;
          lockTail = new Promise<void>((resolve) => { releaseLock = resolve; });
          await previousLock;
          return [];
        },
        workSession: {
          findFirst: async ({ where }: { where: { record: { employeeId: string }; endAt?: null; startAt?: { gte: Date; lt: Date }; OR?: Array<{ startAt?: { gte: Date; lt: Date }; endAt?: { gte: Date; lt: Date } }> } }) => {
            const matches = sessions.filter((session) => session.employeeId === where.record.employeeId);
            if (where.endAt === null) return matches.find((session) => session.endAt === null) ?? null;
            if (where.OR) return matches.find((session) => where.OR!.some((condition) => {
              if (condition.startAt) return session.startAt >= condition.startAt.gte && session.startAt < condition.startAt.lt;
              return session.endAt !== null && session.endAt >= condition.endAt!.gte && session.endAt < condition.endAt!.lt;
            })) ?? null;
            if (where.startAt) return matches.find((session) => session.startAt >= where.startAt!.gte && session.startAt < where.startAt!.lt) ?? null;
            return null;
          },
          update: async ({ where, data }: { where: { id: string }; data: { endAt: Date } }) => {
            const session = sessions.find((item) => item.id === where.id);
            if (!session) throw new Error("Missing session.");
            session.endAt = data.endAt;
            return session;
          },
        },
        attendanceRecord: {
          create: async ({ data }: { data: { employeeId: string; sessions: { create: { mode: "OFFICE" | "WFH"; startAt: Date } } } }) => {
            const session = {
              id: `session-${nextId++}`,
              employeeId: data.employeeId,
              mode: data.sessions.create.mode,
              startAt: data.sessions.create.startAt,
              endAt: null,
            };
            sessions.push(session);
            return { sessions: [session] };
          },
        },
        attendanceRaw: {
          create: async ({ data }: { data: Omit<(typeof rawPunches)[number], "id"> & { location: unknown } }) => {
            const location = data.location === Prisma.DbNull ? null : data.location;
            if (location !== null) throw new Error("Unexpected attendance location.");
            const punch = {
              id: `raw-${nextRawId++}`,
              ...data,
              location,
            };
            rawPunches.push(punch);
            return punch;
          },
        },
        employee: {
          findUnique: async () => hasEmployeeRecord ? { id: "employee-record-1" } : null,
        },
        user: {
          findUnique: async () => ({ timeZone }),
        },
      };

      try {
        return await operation(transaction as never);
      } finally {
        releaseLock();
      }
    },
  };

  return { database: database as never, sessions, rawPunches };
}

function activeSession(id: string): StoredSession {
  return { id, employeeId: "employee-1", mode: "OFFICE", startAt: new Date("2026-06-15T02:30:00.000Z"), endAt: null };
}

describe("employee attendance transitions", () => {
  it("serializes concurrent IN actions so only one open session is created", async () => {
    const stub = createDatabase();
    const results = await Promise.allSettled([
      applyAttendanceAction("employee-1", "IN", stub.database),
      applyAttendanceAction("employee-1", "IN", stub.database),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.ok(rejection?.reason instanceof AttendanceStateError);
    assert.equal(stub.sessions.length, 1);
    assert.equal(stub.sessions.filter(({ endAt }) => endAt === null).length, 1);
    assert.equal(stub.rawPunches.length, 1);
    assert.equal(stub.rawPunches[0].punchType, "IN");
  });

  it("serializes concurrent OUT actions so only one request closes the session", async () => {
    const stub = createDatabase([activeSession("open")]);
    const results = await Promise.allSettled([
      applyAttendanceAction("employee-1", "OUT", stub.database),
      applyAttendanceAction("employee-1", "OUT", stub.database),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.ok(rejection?.reason instanceof AttendanceStateError);
    assert.equal(stub.sessions.filter(({ endAt }) => endAt === null).length, 0);
    assert.equal(stub.rawPunches.length, 1);
    assert.equal(stub.rawPunches[0].punchType, "OUT");
  });

  it("persists accepted IN and OUT evidence with the exact session timestamps and capture metadata", async () => {
    const stub = createDatabase();
    const startedAt = new Date("2026-06-15T02:30:17.123Z");
    const endedAt = new Date("2026-06-15T11:30:42.456Z");

    const started = await applyAttendanceAction("user-1", "IN", stub.database, startedAt);
    const acceptedInPunch = structuredClone(stub.rawPunches[0]);
    const ended = await applyAttendanceAction("user-1", "OUT", stub.database, endedAt);

    assert.equal(started.startAt.toISOString(), startedAt.toISOString());
    assert.equal(ended.endAt?.toISOString(), endedAt.toISOString());
    assert.deepEqual(stub.rawPunches[0], acceptedInPunch);
    assert.deepEqual(stub.rawPunches.map(({ employeeId, timestamp, punchType, source, deviceId, location }) => ({
      employeeId,
      timestamp: timestamp.toISOString(),
      punchType,
      source,
      deviceId,
      location,
    })), [
      {
        employeeId: "employee-record-1",
        timestamp: startedAt.toISOString(),
        punchType: "IN",
        source: "WEB",
        deviceId: null,
        location: null,
      },
      {
        employeeId: "employee-record-1",
        timestamp: endedAt.toISOString(),
        punchType: "OUT",
        source: "WEB",
        deviceId: null,
        location: null,
      },
    ]);
    assert.equal(stub.sessions.length, 1);
    assert.equal(stub.sessions[0].startAt.toISOString(), stub.rawPunches[0].timestamp.toISOString());
    assert.equal(stub.sessions[0].endAt?.toISOString(), stub.rawPunches[1].timestamp.toISOString());
  });

  it("does not create raw evidence for rejected actions or users without a linked Employee", async () => {
    const noEmployee = createDatabase([], "Asia/Colombo", false);
    await assert.rejects(
      applyAttendanceAction("user-without-employee", "IN", noEmployee.database),
      /Employee record is required/,
    );
    assert.equal(noEmployee.sessions.length, 0);
    assert.equal(noEmployee.rawPunches.length, 0);

    const duplicateStart = createDatabase([activeSession("already-open")]);
    await assert.rejects(applyAttendanceAction("employee-1", "IN", duplicateStart.database), AttendanceStateError);
    await assert.rejects(applyAttendanceAction("employee-1", "WFH_OUT", duplicateStart.database), /different work mode/);
    assert.deepEqual(duplicateStart.rawPunches, []);
  });

  it("serializes competing same-day starts after a completed session", async () => {
    const now = new Date("2026-06-15T04:00:00.000Z");
    const completed = { ...activeSession("completed"), endAt: new Date("2026-06-15T05:00:00.000Z") };
    const stub = createDatabase([completed]);
    const results = await Promise.allSettled([
      applyAttendanceAction("employee-1", "IN", stub.database, now),
      applyAttendanceAction("employee-1", "WFH_IN", stub.database, now),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 0);
    assert.equal(stub.sessions.length, 1);
    assert.ok(results.every((result) => result.status === "rejected" && result.reason instanceof AttendanceStateError));
  });

  it("rejects OUT without an open session and rejects mismatched modes", async () => {
    const empty = createDatabase();
    await assert.rejects(applyAttendanceAction("employee-1", "OUT", empty.database), AttendanceStateError);

    const open = createDatabase([activeSession("open")]);
    await assert.rejects(applyAttendanceAction("employee-1", "WFH_OUT", open.database), /different work mode/);
    assert.equal(open.sessions[0].endAt, null);
  });

  it("rejects an OUT timestamp earlier than the stored IN", async () => {
    const futureStart = activeSession("future-start");
    futureStart.startAt = new Date(Date.now() + 60 * 60 * 1000);
    const stub = createDatabase([futureStart]);

    await assert.rejects(applyAttendanceAction("employee-1", "OUT", stub.database), /cannot end before it started/);
    assert.equal(stub.sessions[0].endAt, null);
  });

  it("blocks same-day mixed-mode restarts after a completed session", async () => {
    const stub = createDatabase();
    const now = new Date("2026-06-15T02:30:00.000Z");
    await applyAttendanceAction("employee-1", "IN", stub.database, now);
    await applyAttendanceAction("employee-1", "OUT", stub.database, new Date("2026-06-15T03:30:00.000Z"));
    await assert.rejects(
      applyAttendanceAction("employee-1", "WFH_IN", stub.database, new Date("2026-06-15T04:00:00.000Z")),
      /already completed attendance for your local day/,
    );

    const nextDay = getEmployeeLocalDayWindow(new Date("2026-06-15T18:30:00.000Z"), "Asia/Colombo");
    await applyAttendanceAction("employee-1", "WFH_IN", stub.database, nextDay.startAt);
    assert.deepEqual(stub.sessions.map(({ mode }) => mode), ["OFFICE", "WFH"]);
  });

  it("uses Sri Lanka and Bangladesh local-day boundaries", async () => {
    const yesterdaySession = {
      id: "completed-yesterday",
      employeeId: "employee-1",
      mode: "OFFICE" as const,
      startAt: new Date("2026-06-15T17:45:00.000Z"),
      endAt: new Date("2026-06-15T17:50:00.000Z"),
    };
    const boundaryUtc = new Date("2026-06-15T18:20:00.000Z");
    const sriLanka = createDatabase([yesterdaySession], "Asia/Colombo");
    await assert.rejects(
      applyAttendanceAction("employee-1", "WFH_IN", sriLanka.database, boundaryUtc),
      /already completed attendance for your local day/,
    );

    const bangladesh = createDatabase([yesterdaySession], "Asia/Dhaka");
    await applyAttendanceAction("employee-1", "IN", bangladesh.database, boundaryUtc);

    assert.equal(getEmployeeLocalDayWindow(boundaryUtc, "Asia/Colombo").date, "2026-06-15");
    assert.equal(getEmployeeLocalDayWindow(boundaryUtc, "Asia/Dhaka").date, "2026-06-16");
  });

  it("blocks a new local-day start after an overnight session ends today", async () => {
    const overnight = {
      id: "overnight",
      employeeId: "employee-1",
      mode: "OFFICE" as const,
      startAt: new Date("2026-06-15T17:45:00.000Z"),
      endAt: new Date("2026-06-15T18:15:00.000Z"),
    };
    const stub = createDatabase([overnight], "Asia/Colombo");

    await assert.rejects(
      applyAttendanceAction("employee-1", "WFH_IN", stub.database, new Date("2026-06-15T18:20:00.000Z")),
      /already completed attendance for your local day/,
    );
  });

  it("uses the supplied timestamp when closing a session", async () => {
    const stub = createDatabase([activeSession("open")]);
    const endedAt = new Date("2026-06-15T04:00:00.000Z");

    await applyAttendanceAction("employee-1", "OUT", stub.database, endedAt);

    assert.equal(stub.sessions[0].endAt?.toISOString(), endedAt.toISOString());
  });

  it("rejects malformed action values at the existing validation boundary", () => {
    assert.equal(attendanceActionSchema.safeParse("BREAK").success, false);
    assert.equal(attendanceActionSchema.safeParse({ action: "IN" }).success, false);
    assert.equal(attendanceActionSchema.safeParse("WFH_OUT" as AttendanceAction).success, true);
  });
});