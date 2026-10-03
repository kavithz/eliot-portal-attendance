export default function EmployeesLoading() {
  return (
    <section aria-label="Loading employees" aria-busy="true" className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="h-10 max-w-xl animate-pulse rounded bg-zinc-200" />
      <div className="min-h-64 animate-pulse rounded-lg border border-[var(--line)] bg-white" />
    </section>
  );
}
