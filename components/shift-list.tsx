import Link from "next/link";
import { ShiftDeleteForm } from "@/components/shift-delete-form";

type Shift = {
  id: string;
  name: string;
  startTime: Date | null;
  endTime: Date | null;
  breakDurationMinutes: number | null;
  gracePeriodMinutes: number | null;
  lateThresholdMinutes: number | null;
  earlyDepartureThresholdMinutes: number | null;
  minimumWorkingHours: { toString(): string } | null;
  overtimeEligible: boolean | null;
  roundingRules: unknown;
  workingDays: string[];
};
type ShiftListResult = { items: Shift[]; total: number; page: number; pageCount: number };

function displayTime(value: Date | null) {
  return value ? value.toISOString().slice(11, 16) : "Not set";
}

export function ShiftList({
  result,
  query,
  error,
  success,
}: {
  result: ShiftListResult;
  query: string;
  error?: string;
  success?: string;
}) {
  const pageHref = (page: number) => `/admin/shifts?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page) })}`;
  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p>}
      <form method="get" className="flex max-w-xl items-end gap-2">
        <label htmlFor="shifts-search" className="min-w-0 flex-1 text-sm font-semibold">
          Search shifts
          <input id="shifts-search" name="q" type="search" maxLength={100} defaultValue={query} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
        <button type="submit" className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)]">Search</button>
      </form>
      {result.items.length === 0 ? (
        <section className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-[var(--line)] bg-white px-6 text-center">
          <h2 className="text-base font-semibold">{query ? "No matching shifts" : "No shifts yet"}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{query ? "Try another search." : "Create a Shift to get started."}</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-zinc-50 text-xs text-[var(--muted)]"><tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Time</th><th className="px-4 py-3 font-semibold">Applicable days</th><th className="px-4 py-3 font-semibold">Configuration</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead>
              <tbody className="divide-y divide-[var(--line)]">
                {result.items.map((shift) => (
                  <tr key={shift.id}>
                    <td className="px-4 py-3 font-medium">{shift.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">{displayTime(shift.startTime)} – {displayTime(shift.endTime)}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{shift.workingDays.length > 0 ? shift.workingDays.map((day) => day.slice(0, 3)).join(", ") : "Not configured"}</td>
                    <td className="min-w-64 px-4 py-3 text-xs leading-5 text-[var(--muted)]">
                      {[
                        shift.breakDurationMinutes == null ? null : `Break: ${shift.breakDurationMinutes} min`,
                        shift.gracePeriodMinutes == null ? null : `Grace: ${shift.gracePeriodMinutes} min`,
                        shift.lateThresholdMinutes == null ? null : `Late threshold: ${shift.lateThresholdMinutes} min`,
                        shift.earlyDepartureThresholdMinutes == null ? null : `Early departure: ${shift.earlyDepartureThresholdMinutes} min`,
                        shift.minimumWorkingHours == null ? null : `Minimum hours: ${shift.minimumWorkingHours.toString()}`,
                        shift.overtimeEligible == null ? null : `Overtime: ${shift.overtimeEligible ? "Eligible" : "Not eligible"}`,
                        shift.roundingRules == null ? null : "Rounding rules configured",
                      ].filter(Boolean).join(" · ") || "No configuration"}
                    </td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-2"><Link href={`/admin/shifts/${shift.id}/edit`} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">Edit</Link><ShiftDeleteForm id={shift.id} name={shift.name} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.pageCount > 1 && <nav aria-label="Shift pages" className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-sm"><span className="text-[var(--muted)]">Page {result.page} of {result.pageCount}</span><div className="flex gap-2">{result.page > 1 && <Link href={pageHref(result.page - 1)} className="rounded-md border border-[var(--line)] px-3 py-1.5">Previous</Link>}{result.page < result.pageCount && <Link href={pageHref(result.page + 1)} className="rounded-md border border-[var(--line)] px-3 py-1.5">Next</Link>}</div></nav>}
        </section>
      )}
    </div>
  );
}
