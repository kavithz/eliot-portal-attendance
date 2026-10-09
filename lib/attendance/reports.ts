import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";

export type MonthlySession = {
  id: string;
  mode: "OFFICE" | "WFH";
  startAt: Date;
  endAt: Date | null;
};

export type MonthlyDaySummary = {
  date: string;
  sessions: MonthlySession[];
  totalWorkedMs: number;
};

export type MonthlyEmployeeReport = {
  monthLabel: string;
  empty: boolean;
  summary: {
    totalSessions: number;
    completedSessions: number;
    activeSessions: number;
    totalWorkedMs: number;
    presentDays?: number;
    lateDays?: number;
    earlyOutDays?: number;
    missingPunchDays?: number;
    weekendDays?: number;
    holidayDays?: number;
    undeterminedDays?: number;
    totalCalculatedDays?: number;
  };
  days: MonthlyDaySummary[];
};

export type MonthlyDailyStatus = {
  date: string;
  status?: "PRESENT" | "LATE" | "EARLY_OUT" | "MISSING_PUNCH" | "WEEKEND" | "UNDETERMINED" | string | null;
  workingHours?: number | null;
  lateMinutes?: number | null;
  earlyMinutes?: number | null;
};

function summarizeCalculatedDailyStatuses(dailySummaries: MonthlyDailyStatus[]) {
  const counts = {
    PRESENT: 0,
    LATE: 0,
    EARLY_OUT: 0,
    MISSING_PUNCH: 0,
    WEEKEND: 0,
    HOLIDAY: 0,
    UNDETERMINED: 0,
  } as Record<Exclude<MonthlyDailyStatus["status"], null | undefined>, number>;

  for (const item of dailySummaries) {
    if (!item.status || !(item.status in counts)) continue;
    counts[item.status as keyof typeof counts] += 1;
  }

  return {
    presentDays: counts.PRESENT,
    lateDays: counts.LATE,
    earlyOutDays: counts.EARLY_OUT,
    missingPunchDays: counts.MISSING_PUNCH,
    weekendDays: counts.WEEKEND,
    holidayDays: counts.HOLIDAY,
    undeterminedDays: counts.UNDETERMINED,
    totalCalculatedDays: dailySummaries.filter((item) => item.status && item.status in counts).length,
  };
}

export function buildMonthWindow(month: string, timeZone: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const monthDate = new Date(Date.UTC(year, monthIndex - 1, 1));
  if (!/^\d{4}-\d{2}$/.test(month) || monthIndex < 1 || monthIndex > 12 || !Number.isFinite(monthDate.getTime())) {
    throw new RangeError("Use a valid report month in YYYY-MM format.");
  }
  const nextMonth = new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 7);
  const start = fromZonedTime(`${month}-01T00:00:00.000`, timeZone);
  const end = new Date(fromZonedTime(`${nextMonth}-01T00:00:00.000`, timeZone).getTime() - 1);
  return {
    monthLabel: month,
    start,
    end,
    monthStart: start,
    monthEnd: end,
  };
}

function buildMonthDateWindow(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthIndex - 1, 1)),
    end: new Date(Date.UTC(year, monthIndex, 1)),
  };
}

export function buildEmployeeMonthlyReport(
  employee: { timeZone: string },
  month: string,
  sessions: MonthlySession[],
  dailySummaries: MonthlyDailyStatus[] = [],
): MonthlyEmployeeReport {
  const window = buildMonthWindow(month, employee.timeZone);
  const filtered = sessions.filter((session) => {
    const sessionDate = new Date(session.startAt);
    return sessionDate >= window.start && sessionDate <= window.end;
  });

  const calculatedStatusSummary = summarizeCalculatedDailyStatuses(
    dailySummaries.filter((day) => day.date.slice(0, 7) === month),
  );

  const byDate = new Map<string, MonthlyDaySummary>();
  let totalSessions = 0;
  let completedSessions = 0;
  let activeSessions = 0;
  let totalWorkedMs = 0;

  for (const session of filtered) {
    totalSessions += 1;
    const date = formatInTimeZone(session.startAt, employee.timeZone, "yyyy-MM-dd");
    const current = byDate.get(date) ?? { date, sessions: [], totalWorkedMs: 0 };
    current.sessions.push(session);
    if (session.endAt && session.endAt >= session.startAt) {
      completedSessions += 1;
      const duration = session.endAt.getTime() - session.startAt.getTime();
      current.totalWorkedMs += duration;
      totalWorkedMs += duration;
    } else {
      activeSessions += 1;
    }
    byDate.set(date, current);
  }

  const days = [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date));
  return {
    monthLabel: month,
    empty: filtered.length === 0,
    summary: {
      totalSessions,
      completedSessions,
      activeSessions,
      totalWorkedMs,
      ...calculatedStatusSummary,
    },
    days,
  };
}

export async function getEmployeeMonthlyReport(employeeId: string, month: string, employee: { id: string; timeZone: string; name: string; email: string }) {
  const { start: monthStart, end: monthEnd } = buildMonthWindow(month, employee.timeZone);
  const { start: dateStart, end: dateEnd } = buildMonthDateWindow(month);
  const [sessions, dailySummaries] = await Promise.all([
    prisma.workSession.findMany({
      where: {
        record: { employeeId },
        startAt: { gte: monthStart, lte: monthEnd },
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        mode: true,
        startAt: true,
        endAt: true,
      },
    }),
    prisma.attendanceDaily.findMany({
      where: {
        employeeId,
        date: { gte: dateStart, lt: dateEnd },
      },
      select: {
        date: true,
        status: true,
        workingHours: true,
        lateMinutes: true,
        earlyMinutes: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  return buildEmployeeMonthlyReport(
    employee,
    month,
    sessions.map((session) => ({
      id: session.id,
      mode: session.mode,
      startAt: session.startAt,
      endAt: session.endAt,
    })),
    dailySummaries.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      status: row.status ?? undefined,
      workingHours: row.workingHours !== null && row.workingHours !== undefined ? Number(row.workingHours) : null,
      lateMinutes: row.lateMinutes,
      earlyMinutes: row.earlyMinutes,
    })),
  );
}

export async function getAdminMonthlyReport(month: string, employeeId?: string) {
  const employees = await prisma.user.findMany({
    where: employeeId ? { id: employeeId, role: { in: ["EMPLOYEE", "ADMIN"] } } : { role: "EMPLOYEE" },
    select: { id: true, name: true, email: true, timeZone: true },
    orderBy: { name: "asc" },
  });

  const rows = [] as Array<{ employee: { id: string; name: string; email: string; timeZone: string }; report: MonthlyEmployeeReport }>;
  for (const employee of employees) {
    const { start: monthStart, end: monthEnd } = buildMonthWindow(month, employee.timeZone);
    const { start: dateStart, end: dateEnd } = buildMonthDateWindow(month);
    const [sessions, dailySummaries] = await Promise.all([
      prisma.workSession.findMany({
        where: {
          record: { employeeId: employee.id },
          startAt: { gte: monthStart, lte: monthEnd },
        },
        orderBy: { startAt: "asc" },
        select: { id: true, mode: true, startAt: true, endAt: true },
      }),
      prisma.attendanceDaily.findMany({
        where: {
          employeeId: employee.id,
          date: { gte: dateStart, lt: dateEnd },
        },
        select: {
          date: true,
          status: true,
          workingHours: true,
          lateMinutes: true,
          earlyMinutes: true,
        },
        orderBy: { date: "asc" },
      }),
    ]);
    rows.push({
      employee,
      report: buildEmployeeMonthlyReport(
        employee,
        month,
        sessions.map((session) => ({
          id: session.id,
          mode: session.mode,
          startAt: session.startAt,
          endAt: session.endAt,
        })),
        dailySummaries.map((row) => ({
          date: row.date.toISOString().slice(0, 10),
          status: row.status ?? undefined,
          workingHours: row.workingHours !== null && row.workingHours !== undefined ? Number(row.workingHours) : null,
          lateMinutes: row.lateMinutes,
          earlyMinutes: row.earlyMinutes,
        })),
      ),
    });
  }

  const totalSessions = rows.reduce((sum, item) => sum + item.report.summary.totalSessions, 0);
  const totalWorkedMs = rows.reduce((sum, item) => sum + item.report.summary.totalWorkedMs, 0);
  return { employees: rows, summary: { totalSessions, totalWorkedMs, employeeCount: rows.length } };
}

