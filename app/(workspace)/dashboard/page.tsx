import { ArrowUpRight, CalendarCheck2, ClockAlert, Coffee, House, TimerOff } from "lucide-react";
import Link from "next/link";
import { AttendanceToday } from "@/components/attendance-today";
import { hasPermission } from "@/lib/auth/permissions";
import { getEmployeeAttendanceDashboard } from "@/lib/attendance/service";
import { classifyWorkSession } from "@/lib/attendance/schedule";
import { requirePageUser } from "@/lib/auth/session";

const futureMetrics = [
  { label: "Leave remaining", icon: Coffee },
  { label: "Leave taken", icon: CalendarCheck2 },
  { label: "Half days", icon: ClockAlert },
  { label: "Late arrivals", icon: TimerOff },
  { label: "WFH sessions", icon: House },
];

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
      </div>

      <AttendanceToday activeSession={activeSession} previousDayActiveSession={previousDayActiveSession} activeSessionTiming={activeSessionTiming} previousDayActiveSessionTiming={previousDayActiveSessionTiming} day={day} attendanceDate={date} timeZone={user.timeZone} invalidSessions={invalidSessions} completedSessionToday={completedSessionToday} />

      <section aria-labelledby="summary-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><h2 id="summary-title" className="text-base font-semibold">Attendance summary</h2><p className="mt-1 text-xs text-[var(--muted)]">Available when attendance policies are configured.</p></div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {futureMetrics.map(({ label, icon: Icon }) => (
            <div key={label} className="min-h-[116px] rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
              <Icon size={18} strokeWidth={1.8} className="text-[var(--blue)]" aria-hidden="true" />
              <p className="mt-4 text-xs font-semibold text-[var(--ink)]">{label}</p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Not configured</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}