import Link from "next/link";
import { ShiftDeleteForm } from "@/components/shift-delete-form";

type Shift = { id: string; name: string };
type ShiftListResult = { items: Shift[]; total: number; page: number; pageCount: number };

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
              <thead className="border-b border-[var(--line)] bg-zinc-50 text-xs text-[var(--muted)]"><tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead>
              <tbody className="divide-y divide-[var(--line)]">
                {result.items.map((shift) => (
                  <tr key={shift.id}>
                    <td className="px-4 py-3 font-medium">{shift.name}</td>
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
