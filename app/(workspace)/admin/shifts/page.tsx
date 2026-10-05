import Link from "next/link";
import { Plus } from "lucide-react";
import { ShiftList } from "@/components/shift-list";
import { requireAdmin } from "@/lib/auth/session";
import { listShifts } from "@/lib/shifts/service";

type SearchParams = { q?: string | string[]; page?: string | string[]; error?: string; success?: string };
function single(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const query = single(params.q).slice(0, 100);
  const page = Number(single(params.page)) || 1;
  const result = await listShifts(admin, { query, page });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-[var(--blue)]">Administration</p><h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Shifts</h1><p className="mt-2 text-sm text-[var(--muted)]">{result.total} shift{result.total === 1 ? "" : "s"}</p></div><Link href="/admin/shifts/new" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--action)] px-4 text-sm font-semibold text-white"><Plus size={17} aria-hidden="true" /> Add shift</Link></div>
      <ShiftList result={result} query={query} error={params.error} success={params.success} />
    </div>
  );
}
