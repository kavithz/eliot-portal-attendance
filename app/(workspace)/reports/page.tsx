import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";

import { formatWorkedDuration } from "@/lib/attendance/history";
import { getEmployeeMonthlyReport } from "@/lib/attendance/reports";
import { requirePageUser } from "@/lib/auth/session";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string | string[]; [key: string]: string | string[] | undefined }>;
}) {
  const user = await requirePageUser();
  const params = (await searchParams) ?? {};
  const month = typeof params.month === "string" ? params.month : formatInTimeZone(new Date(), user.timeZone, "yyyy-MM");
  const report = await getEmployeeMonthlyReport(user.id, month, user);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--blue)]">Personal records</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">My reports</h1>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <form method="GET" className="flex w-full items-center gap-2 lg:w-auto">
            <input type="month" name="month" defaultValue={month} className="min-w-0 flex-1 rounded-md border border-[var(--line)] px-3 py-2 text-sm lg:flex-none" />
            <button type="submit" className="rounded-md bg-[var(--action)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--action-hover)]">Apply</button>
          </form>
          <Link href={`/reports/export?month=${month}`} className="inline-flex justify-center rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink)]">Download PDF</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Sessions</p><p className="mt-2 text-2xl font-semibold">{report.summary.totalSessions}</p></div>
        <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Completed</p><p className="mt-2 text-2xl font-semibold">{report.summary.completedSessions}</p></div>
        <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Active</p><p className="mt-2 text-2xl font-semibold">{report.summary.activeSessions}</p></div>
        <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Worked</p><p className="mt-2 text-2xl font-semibold">{formatWorkedDuration(report.summary.totalWorkedMs)}</p></div>
      </div>

      <section className="rounded-lg border border-[var(--line)] bg-white shadow-sm">
        <header className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-base font-semibold">Daily breakdown</h2></header>
        <div className="divide-y divide-[var(--line)]">
          {report.days.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[var(--muted)]">No attendance sessions were recorded for this month.</div>
          ) : (
            report.days.map((day) => (
              <div key={day.date} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{day.date}</p>
                  <p className="text-xs text-[var(--muted)]">{formatWorkedDuration(day.totalWorkedMs)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {day.sessions.map((session) => (
                    <span key={session.id} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-[var(--ink)]">
                      {session.mode} · {session.endAt ? formatWorkedDuration(new Date(session.endAt).getTime() - new Date(session.startAt).getTime()) : "Active"}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

    </div>
  );
}