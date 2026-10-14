export default function LeaveBalanceLoading() {
  return (
    <section aria-label="Loading leave balance" aria-busy="true" className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="h-16 animate-pulse rounded-lg border border-[var(--line)] bg-white" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-h-48 animate-pulse rounded-lg border border-[var(--line)] bg-white" />
        <div className="min-h-48 animate-pulse rounded-lg border border-[var(--line)] bg-white" />
      </div>
    </section>
  );
}
