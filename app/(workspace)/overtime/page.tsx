import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";
import { listOwnOvertimeRequests } from "@/lib/overtime/service";

export default async function OvertimeRequestsPage() {
  const actor = await requirePageUser();
  if (actor.role !== "EMPLOYEE" || !hasPermission(actor.role, "overtime:submit")) redirect("/dashboard");
  const requests = await listOwnOvertimeRequests(actor);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--blue)]">Personal records</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Overtime requests</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{requests.length} request{requests.length === 1 ? "" : "s"}</p>
        </div>
        <Link href="/overtime/new" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)]">
          <Plus size={17} aria-hidden="true" /> Request Overtime
        </Link>
      </header>
      {requests.length === 0 ? (
        <section role="status" className="rounded-lg border border-[var(--line)] bg-white px-4 py-8 text-center">
          <h2 className="text-base font-semibold">No overtime requests yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Your submitted requests and their approval status will appear here.</p>
        </section>
      ) : (
        <ol className="space-y-4">
          {requests.map((request) => (
            <li key={request.id} className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{formatInTimeZone(request.date, "UTC", "yyyy-MM-dd")}</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">Submitted {formatInTimeZone(request.createdAt, actor.timeZone, "yyyy-MM-dd HH:mm")}</p>
                </div>
                <span className={`rounded-sm px-2 py-1 text-xs font-medium ${request.status === "PENDING" ? "bg-amber-50 text-amber-800" : request.status === "APPROVED" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                  {request.status}{request.status === "PENDING" && request.currentApprovalStage ? ` · ${request.currentApprovalStage.toLowerCase()} review` : ""}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div><dt className="text-xs font-semibold text-[var(--muted)]">Requested time</dt><dd className="mt-1 text-sm">{formatInTimeZone(request.startAt, actor.timeZone, "yyyy-MM-dd HH:mm")} – {formatInTimeZone(request.endAt, actor.timeZone, "yyyy-MM-dd HH:mm")}</dd></div>
                <div><dt className="text-xs font-semibold text-[var(--muted)]">Expected hours</dt><dd className="mt-1 text-sm">{request.expectedHours.toString()}</dd></div>
                <div><dt className="text-xs font-semibold text-[var(--muted)]">Project</dt><dd className="mt-1 text-sm">{request.project}</dd></div>
                <div><dt className="text-xs font-semibold text-[var(--muted)]">Reason</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{request.reason}</dd></div>
                {request.decisionReason && <div className="sm:col-span-2"><dt className="text-xs font-semibold text-[var(--muted)]">Decision note</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{request.decisionReason}</dd></div>}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
