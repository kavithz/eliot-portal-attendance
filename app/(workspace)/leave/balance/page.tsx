import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";
import { listOwnLeaveBalanceCredits } from "@/lib/leave/balance-service";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function LeaveBalancePage() {
  const actor = await requirePageUser();
  if (actor.role !== "EMPLOYEE" || !hasPermission(actor.role, "leave:balance:self:read")) {
    redirect("/dashboard");
  }
  const entitlements = await listOwnLeaveBalanceCredits(actor);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-[var(--blue)]">Personal records</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Leave balance</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Your configured leave entitlement credits for periods active today.</p>
      </header>

      <section role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        The remaining balance is unavailable because approved leave usage cannot be calculated reliably without holiday dates.
        The figures below show configured credit components, not a remaining balance.
      </section>

      {entitlements.length === 0 ? (
        <section role="status" className="rounded-lg border border-[var(--line)] bg-white px-4 py-8 text-center">
          <h2 className="text-base font-semibold">No active leave entitlement</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">There is no leave entitlement configured for an active period. Contact HR if you think this is incorrect.</p>
        </section>
      ) : (
        <section aria-label="Active leave entitlements" className="grid gap-4 md:grid-cols-2">
          {entitlements.map((item) => (
            <article key={item.id} className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-base font-semibold">{item.leaveType.name}</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Period: {dateOnly(item.periodStart)} – {dateOnly(item.periodEnd)}
                </p>
              </div>
              <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium text-[var(--muted)]">Opening balance</dt>
                  <dd className="mt-1 text-lg font-semibold">{item.openingBalance.toString()}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--muted)]">Entitlement</dt>
                  <dd className="mt-1 text-lg font-semibold">{item.entitlement.toString()}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--muted)]">Carry forward</dt>
                  <dd className="mt-1 text-lg font-semibold">{item.carryForward.toString()}</dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
