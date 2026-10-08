import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AttendanceCorrectionRequestForm } from "@/components/attendance-correction-request-form";
import { hasPermission } from "@/lib/auth/permissions";
import { listOwnDailyAttendanceForCorrection } from "@/lib/attendance/correction-service";
import { requirePageUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function AttendanceCorrectionRequestPage() {
  const actor = await requirePageUser();
  if (actor.role !== "EMPLOYEE" || !hasPermission(actor.role, "attendance:correction:submit")) {
    redirect("/dashboard");
  }

  const records = await listOwnDailyAttendanceForCorrection(actor);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]">
          <ChevronLeft size={16} aria-hidden="true" /> Dashboard
        </Link>
        <p className="mt-5 text-sm font-medium text-[var(--blue)]">Personal records</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Request Attendance Correction</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Select one of your calculated daily attendance records and provide the corrected IN or OUT time and a reason.
          Times are entered in your configured timezone ({actor.timeZone}).
        </p>
      </div>

      {records.length === 0 ? (
        <section role="status" className="rounded-lg border border-[var(--line)] bg-white px-4 py-8 text-center">
          <h2 className="text-base font-semibold">No eligible attendance records</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            There are no calculated attendance records available for correction with an active assigned supervisor.
          </p>
        </section>
      ) : (
        <section aria-label="Attendance records available for correction" className="grid gap-4">
          {records.map((record) => (
            <AttendanceCorrectionRequestForm
              key={record.id}
              dailyAttendanceId={record.id}
              date={formatInTimeZone(record.date, "UTC", "yyyy-MM-dd")}
              status={record.status}
              firstIn={record.firstIn ? formatInTimeZone(record.firstIn, actor.timeZone, "yyyy-MM-dd HH:mm") : ""}
              lastOut={record.lastOut ? formatInTimeZone(record.lastOut, actor.timeZone, "yyyy-MM-dd HH:mm") : ""}
              timeZone={actor.timeZone}
            />
          ))}
        </section>
      )}
    </div>
  );
}
