import { formatInTimeZone } from "date-fns-tz";
import { redirect } from "next/navigation";
import { OvertimeReviewForm } from "@/components/overtime-review-form";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";
import { listOvertimeRequestsForReview } from "@/lib/overtime/service";

export default async function OvertimeApprovalsPage() {
  const actor = await requirePageUser();
  if (
    (actor.role !== "SUPERVISOR" && actor.role !== "DEPARTMENT_MANAGER")
    || !hasPermission(actor.role, "overtime:approve")
  ) redirect("/dashboard");
  const requests = await listOvertimeRequestsForReview(actor);
  const stageLabel = actor.role === "SUPERVISOR" ? "Supervisor review" : "Manager review";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-[var(--blue)]">Approvals</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Overtime approvals</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Pending requests assigned to you for {stageLabel.toLowerCase()}.</p>
      </header>
      {requests.length === 0 ? (
        <p role="status" className="rounded-lg border border-[var(--line)] bg-white px-4 py-8 text-sm text-[var(--muted)]">No overtime requests are awaiting your review.</p>
      ) : (
        <ol className="space-y-4">
          {requests.map((request) => {
            const employeeTimeZone = request.employee.user?.timeZone ?? "UTC";
            return (
              <li key={request.id} className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">{request.employee.name}</h2>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {request.employee.employeeId ?? "No employee ID"}
                      {" · "}
                      Submitted {formatInTimeZone(request.createdAt, actor.timeZone, "yyyy-MM-dd HH:mm")}
                    </p>
                  </div>
                  <span className="rounded-sm bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">{stageLabel}</span>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div><dt className="text-xs font-semibold text-[var(--muted)]">Date and time</dt><dd className="mt-1 text-sm">{formatInTimeZone(request.date, "UTC", "yyyy-MM-dd")} · {formatInTimeZone(request.startAt, employeeTimeZone, "HH:mm")} – {formatInTimeZone(request.endAt, employeeTimeZone, "HH:mm")} ({employeeTimeZone})</dd></div>
                  <div><dt className="text-xs font-semibold text-[var(--muted)]">Expected hours</dt><dd className="mt-1 text-sm">{request.expectedHours.toString()}</dd></div>
                  <div><dt className="text-xs font-semibold text-[var(--muted)]">Project</dt><dd className="mt-1 text-sm">{request.project}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs font-semibold text-[var(--muted)]">Reason</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{request.reason}</dd></div>
                </dl>
                <div className="mt-4 border-t border-[var(--line)] pt-4">
                  <OvertimeReviewForm overtimeRequestId={request.id} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
