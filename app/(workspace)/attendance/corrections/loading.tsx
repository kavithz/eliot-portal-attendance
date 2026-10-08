export default function AttendanceCorrectionLoading() {
  return (
    <section aria-label="Loading attendance correction records" aria-busy="true" className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded bg-zinc-200" />
      <div className="h-56 animate-pulse rounded-lg border border-[var(--line)] bg-white" />
    </section>
  );
}
