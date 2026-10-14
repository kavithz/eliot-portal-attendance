import Link from "next/link";
import { OrganizationDeleteForm } from "@/components/organization-delete-form";
import type { OrganizationEntity } from "@/app/(workspace)/admin/organization/actions";

type OrganizationListItem = { id: string; name: string };
type OrganizationListResult = {
  items: OrganizationListItem[];
  total: number;
  page: number;
  pageCount: number;
};

export function OrganizationList({
  entity,
  result,
  query,
  error,
  success,
}: {
  entity: OrganizationEntity;
  result: OrganizationListResult;
  query: string;
  error?: string;
  success?: string;
}) {
  const plural = entity === "Department" ? "departments" : "designations";
  const pageHref = (page: number) => `/admin/${plural}?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page) })}`;

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p>}
      <form method="get" className="flex max-w-xl items-end gap-2">
        <label htmlFor={`${plural}-search`} className="min-w-0 flex-1 text-sm font-semibold">
          Search {plural}
          <input id={`${plural}-search`} name="q" type="search" maxLength={100} defaultValue={query} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
        <button type="submit" className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)]">Search</button>
      </form>
      {result.items.length === 0 ? (
        <section className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-[var(--line)] bg-white px-6 text-center">
          <h2 className="text-base font-semibold">{query ? `No matching ${plural}` : `No ${plural} yet`}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{query ? "Try another search." : `Create a ${entity.toLowerCase()} to get started.`}</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-zinc-50 text-xs text-[var(--muted)]"><tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead>
              <tbody className="divide-y divide-[var(--line)]">
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-2"><Link href={`/admin/${plural}/${item.id}/edit`} className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">Edit</Link><OrganizationDeleteForm entity={entity} id={item.id} name={item.name} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.pageCount > 1 && <nav aria-label={`${entity} pages`} className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-sm"><span className="text-[var(--muted)]">Page {result.page} of {result.pageCount}</span><div className="flex gap-2">{result.page > 1 && <Link href={pageHref(result.page - 1)} className="rounded-md border border-[var(--line)] px-3 py-1.5">Previous</Link>}{result.page < result.pageCount && <Link href={pageHref(result.page + 1)} className="rounded-md border border-[var(--line)] px-3 py-1.5">Next</Link>}</div></nav>}
        </section>
      )}
    </div>
  );
}
