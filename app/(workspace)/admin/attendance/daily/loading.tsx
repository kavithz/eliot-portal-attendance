export default function DailyAttendanceLoading() {
  return (
    <section aria-label="Loading daily attendance" aria-busy="true" className="space-y-4">
      <div className="h-8 w-52 animate-pulse rounded bg-zinc-200" />
      <div className="h-10 rounded-lg border border-[var(--line)] bg-white" />
      <div className="h-14 rounded-lg border border-[var(--line)] bg-white" />
      <div className="min-h-64 animate-pulse rounded-lg border border-[var(--line)] bg-white" />
    </section>
  );
}
