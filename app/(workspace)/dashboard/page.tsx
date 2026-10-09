import { ArrowUpRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { AttendanceToday } from "@/components/attendance-today";
import { hasPermission } from "@/lib/auth/permissions";
import { formatWorkedDuration } from "@/lib/attendance/history";
import { getEmployeeMonthlyReport } from "@/lib/attendance/reports";
import { getEmployeeAttendanceDashboard } from "@/lib/attendance/service";
import { classifyWorkSession } from "@/lib/attendance/schedule";
import { requirePageUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const {
    date,
    activeSession,
    previousDayActiveSession,
    day,
    completedSessionToday,
    invalidSessions,
  } = await getEmployeeAttendanceDashboard(user);
  const activeSessionTiming = activeSession ? classifyWorkSession(activeSession, user.timeZone) : null;
  const previousDayActiveSessionTiming = previousDayActiveSession
    ? classifyWorkSession(previousDayActiveSession, user.timeZone)
    : null;
  const currentMonth = formatInTimeZone(new Date(), user.timeZone, "yyyy-MM");
  const monthlyReport = await getEmployeeMonthlyReport(user, currentMonth);
  const thisMonthMetrics = [
    { label: "Present", value: monthlyReport.summary.presentDays ?? "Not calculated" },
    { label: "Late arrivals", value: monthlyReport.summary.lateDays ?? "Not calculated" },
    { label: "Approved leave", value: monthlyReport.summary.approvedLeaveDays ?? "Unavailable" },
    { label: "WFH days", value: monthlyReport.summary.workFromHomeDays ?? 0 },
    { label: "Holidays", value: monthlyReport.summary.holidayDays ?? 0 },
    { label: "Absent", value: monthlyReport.summary.absentDays ?? "Not calculated" },
    { label: "Session time", value: formatWorkedDuration(monthlyReport.summary.totalWorkedMs) },
    { label: "Engine hours", value: monthlyReport.summary.engineWorkedMs == null ? "Not calculated" : `${formatWorkedDuration(monthlyReport.summary.engineWorkedMs)} · ${monthlyReport.summary.engineCalculatedDays ?? 0} days` },
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--blue)]">Employee workspace</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Good to see you, {user.name.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Your attendance at a glance.</p>
        </div>
        <Link href="/attendance" className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3.5 text-sm font-medium text-[var(--ink)] transition hover:bg-zinc-50">
          View history <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        {user.role === "EMPLOYEE" && hasPermission(user.role, "leave:submit") && (
          <Link href="/leave/new" className="inline-flex h-10 items-center rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--action-hover)]">
            Apply for Leave
          </Link>
        )}
        {user.role === "EMPLOYEE" && hasPermission(user.role, "attendance:correction:submit") && (
          <Link href="/attendance/corrections" className="inline-flex h-10 items-center rounded-md border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--ink)] transition hover:bg-zinc-50">
            Request Attendance Correction
          </Link>
        )}
        {user.role === "EMPLOYEE" && hasPermission(user.role, "overtime:submit") && (
          <Link href="/overtime/new" className="inline-flex h-10 items-center rounded-md border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--ink)] transition hover:bg-zinc-50">
            Request Overtime
          </Link>
        )}
        {user.role === "EMPLOYEE" && hasPermission(user.role, "wfh:submit") && (
          <Link href="/wfh/new" className="inline-flex h-10 items-center rounded-md border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--ink)] transition hover:bg-zinc-50">
            Request WFH
          </Link>
        )}
      </div>

      <AttendanceToday activeSession={activeSession} previousDayActiveSession={previousDayActiveSession} activeSessionTiming={activeSessionTiming} previousDayActiveSessionTiming={previousDayActiveSessionTiming} day={day} attendanceDate={date} timeZone={user.timeZone} invalidSessions={invalidSessions} completedSessionToday={completedSessionToday} />

      <section aria-labelledby="summary-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><h2 id="summary-title" className="text-base font-semibold">This month</h2><p className="mt-1 text-xs text-[var(--muted)]">{currentMonth} · saved attendance calculations</p></div>
            <div><h2 id="summary-title" className="text-base font-semibold">This month</h2><p className="mt-1 text-xs text-[var(--muted)]">{currentMonth} · correction-aware attendance engine</p></div>
          <Link href="/reports" className="text-sm font-medium text-[var(--blue)] hover:underline">Monthly details</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {thisMonthMetrics.map(({ label, value }) => (
            <div key={label} className="min-h-[104px] rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-[var(--ink)]">{label}</p>
              <p className="mt-3 text-xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        {monthlyReport.summary.absentDays === null && <p role="note" className="mt-2 text-xs text-[var(--muted)]">Absence is shown only when an ABSENT status has been explicitly saved.</p>}
      </section>
    </div>
  );
}