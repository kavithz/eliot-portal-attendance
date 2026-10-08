import { CalendarDays } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { LocalDateTime } from "@/components/local-date-time";
import { AttendancePunch } from "@/components/attendance-punch";
import { formatWorkedDuration } from "@/lib/attendance/history";
import { getEmployeeAttendanceHistory } from "@/lib/attendance/service";
import { listApprovedWorkFromHomeForAttendance } from "@/lib/wfh/service";
import { requirePageUser } from "@/lib/auth/session";

export default async function AttendanceHistoryPage() {
  const user = await requirePageUser();
  const { days, invalidSessions } = await getEmployeeAttendanceHistory(user);
  const approvedWorkFromHome = await listApprovedWorkFromHomeForAttendance(user);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--blue)]">Personal records</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Attendance history</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Sessions grouped by local start date ({user.timeZone}).</p>
      </div>
      <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-sm" aria-label="Attendance sessions">
        {days.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-[var(--blue)]"><CalendarDays size={21} aria-hidden="true" /></span>
            <h2 className="mt-4 text-base font-semibold">No attendance records yet</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">Your sessions will appear here after your first IN or WFH-IN.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {days.map((day) => (
              <section key={day.date} aria-label={`Attendance for ${day.date}`}>
                  <header className="flex flex-wrap items-end justify-between gap-3 bg-zinc-50 px-4 py-4 sm:px-5">
                  <div><h2 className="text-sm font-semibold">{day.date}</h2><p className="mt-1 text-xs text-[var(--muted)]">{day.sessions.length} session{day.sessions.length === 1 ? "" : "s"}</p></div>
                  <p className="text-right text-xs text-[var(--muted)]">Completed worked time <span className="ml-1 font-semibold text-[var(--ink)]">{formatWorkedDuration(day.totalWorkedMs)}</span></p>
                </header>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[var(--line)] text-xs text-[var(--muted)]">
                      <tr><th className="px-5 py-3 font-semibold">Mode</th><th className="px-5 py-3 font-semibold">IN / WFH-IN</th><th className="px-5 py-3 font-semibold">OUT / WFH-OUT</th><th className="px-5 py-3 font-semibold">Duration</th><th className="px-5 py-3 font-semibold">Session</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {day.sessions.map(({ session, timing, durationMs, status }) => (
                          <tr key={session.id}>
                            <td className="px-5 py-3"><span className={`rounded-sm px-2 py-1 text-xs font-medium ${session.mode === "WFH" ? "bg-slate-100 text-[var(--blue)]" : "bg-zinc-100 text-zinc-700"}`}>{session.mode === "WFH" ? "WFH" : "Office"}</span></td>
                            <td className="px-5 py-3"><AttendancePunch kind={session.mode === "WFH" ? "WFH_IN" : "IN"}><p className="font-semibold"><LocalDateTime value={session.startAt} timeZone={user.timeZone} /></p><p className="mt-0.5 text-xs text-[var(--muted)]">{timing?.arrival.replaceAll("_", " ") ?? "Unavailable"}</p></AttendancePunch></td>
                            <td className="px-5 py-3"><AttendancePunch kind={session.mode === "WFH" ? "WFH_OUT" : "OUT"}><p className="font-semibold">{status === "ACTIVE" ? "Awaiting OUT" : session.endAt && status === "COMPLETED" ? <LocalDateTime value={session.endAt} timeZone={user.timeZone} /> : "Unavailable"}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{status === "ACTIVE" ? "Session active" : timing?.departure?.replaceAll("_", " ") ?? "Timing unavailable"}</p></AttendancePunch></td>
                            <td className="px-5 py-3 tabular-nums">{formatWorkedDuration(durationMs)}</td>
                            <td className="px-5 py-3 text-xs text-[var(--muted)]">{status === "COMPLETED" ? "Completed" : status === "ACTIVE" ? "Active" : "Invalid data"}</td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-[var(--line)] md:hidden">
                  {day.sessions.map(({ session, timing, durationMs, status }) => (
                    <li key={session.id} className="space-y-3 px-4 py-4">
                      <div className="flex items-center justify-between gap-3"><span className={`rounded-sm px-2 py-1 text-xs font-medium ${session.mode === "WFH" ? "bg-slate-100 text-[var(--blue)]" : "bg-zinc-100 text-zinc-700"}`}>{session.mode === "WFH" ? "WFH" : "Office"}</span><span className="text-xs font-medium text-[var(--muted)]">{status === "COMPLETED" ? "Completed" : status === "ACTIVE" ? "Active" : "Invalid data"}</span></div>
                      <dl className="grid grid-cols-2 gap-3 text-xs">
                        <div><AttendancePunch kind={session.mode === "WFH" ? "WFH_IN" : "IN"}><p className="font-semibold"><LocalDateTime value={session.startAt} timeZone={user.timeZone} /></p><p className="mt-0.5 text-xs text-[var(--muted)]">{timing?.arrival.replaceAll("_", " ") ?? "Unavailable"}</p></AttendancePunch></div>
                        <div><AttendancePunch kind={session.mode === "WFH" ? "WFH_OUT" : "OUT"}><p className="font-semibold">{status === "ACTIVE" ? "Awaiting OUT" : session.endAt && status === "COMPLETED" ? <LocalDateTime value={session.endAt} timeZone={user.timeZone} /> : "Unavailable"}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{status === "ACTIVE" ? "Session active" : timing?.departure?.replaceAll("_", " ") ?? "Timing unavailable"}</p></AttendancePunch></div>
                      </dl>
                      <p className="text-xs text-[var(--muted)]">Duration: <span className="font-semibold text-[var(--ink)]">{formatWorkedDuration(durationMs)}</span></p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {invalidSessions > 0 && <p role="status" className="border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--amber-ink)]">{invalidSessions} session record{invalidSessions === 1 ? "" : "s"} could not be assigned a local date because its start time is invalid.</p>}
      </section>
      <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-sm" aria-labelledby="approved-wfh-title">
        <header className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
          <h2 id="approved-wfh-title" className="text-sm font-semibold">Approved Work From Home</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Approved WFH requests are shown separately from recorded work sessions.</p>
        </header>
        {approvedWorkFromHome.length === 0 ? (
          <p role="status" className="px-4 py-5 text-sm text-[var(--muted)]">No approved WFH requests.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {approvedWorkFromHome.map((request) => (
              <li key={request.id} className="grid gap-2 px-4 py-4 text-sm sm:grid-cols-[1fr_1fr_1fr] sm:px-5">
                <div><p className="text-xs font-semibold text-[var(--muted)]">Date</p><p className="mt-1">{formatInTimeZone(request.date, "UTC", "yyyy-MM-dd")}</p></div>
                <div><p className="text-xs font-semibold text-[var(--muted)]">Mode / time</p><p className="mt-1"><span className="font-semibold text-[var(--blue)]">WFH</span> · {formatInTimeZone(request.startAt, user.timeZone, "HH:mm")} – {formatInTimeZone(request.endAt, user.timeZone, "HH:mm")} ({user.timeZone})</p></div>
                <div><p className="text-xs font-semibold text-[var(--muted)]">Work location</p><p className="mt-1 whitespace-pre-wrap">{request.workLocation}</p></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}