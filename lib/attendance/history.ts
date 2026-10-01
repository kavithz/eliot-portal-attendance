import { formatInTimeZone } from "date-fns-tz";
import { classifyAttendancePunch, classifyWorkSession, type WorkSessionTiming } from "./schedule";

export type AttendanceSession = {
  id: string;
  mode: "OFFICE" | "WFH";
  startAt: Date;
  endAt: Date | null;
};

export type SessionSummary = {
  session: AttendanceSession;
  timing: WorkSessionTiming | null;
  durationMs: number | null;
  status: "ACTIVE" | "COMPLETED" | "INVALID";
};

export type AttendanceDay = {
  date: string;
  sessions: SessionSummary[];
  totalWorkedMs: number;
};

export type AttendanceHistory = {
  days: AttendanceDay[];
  invalidSessions: number;
};

export function formatWorkedDuration(durationMs: number | null) {
  if (durationMs === null) return "Unavailable";
  if (durationMs > 0 && durationMs < 60_000) return `${Math.ceil(durationMs / 1_000)}s`;
  const totalMinutes = Math.floor(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function isValidInstant(value: Date) {
  return Number.isFinite(value.getTime());
}

export function groupSessionsByEmployeeLocalDay(sessions: AttendanceSession[], timeZone: string): AttendanceHistory {
  const byDate = new Map<string, AttendanceDay>();
  let invalidSessions = 0;

  for (const session of sessions) {
    if (!isValidInstant(session.startAt)) {
      invalidSessions += 1;
      continue;
    }

    const date = formatInTimeZone(session.startAt, timeZone, "yyyy-MM-dd");
    let day = byDate.get(date);
    if (!day) {
      day = { date, sessions: [], totalWorkedMs: 0 };
      byDate.set(date, day);
    }

    if (!session.endAt) {
      day.sessions.push({ session, timing: classifyWorkSession(session, timeZone), durationMs: null, status: "ACTIVE" });
      continue;
    }

    if (!isValidInstant(session.endAt) || session.endAt < session.startAt) {
      const checkIn = session.mode === "WFH" ? "WFH_IN" : "IN";
      day.sessions.push({
        session,
        timing: { arrival: classifyAttendancePunch(checkIn, session.startAt, timeZone), departure: null },
        durationMs: null,
        status: "INVALID",
      });
      continue;
    }

    const durationMs = session.endAt.getTime() - session.startAt.getTime();
    day.totalWorkedMs += durationMs;
    day.sessions.push({ session, timing: classifyWorkSession(session, timeZone), durationMs, status: "COMPLETED" });
  }

  return {
    days: [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date)),
    invalidSessions,
  };
}