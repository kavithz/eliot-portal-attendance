"use client";

export default function AttendanceCorrectionReportError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="rounded-lg border border-red-200 bg-white p-6">
      <h1 className="text-lg font-semibold">Attendance correction report unavailable</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">The report could not be loaded. No attendance or correction data was changed.</p>
      <button type="button" onClick={reset} className="mt-4 h-10 rounded-md bg-[var(--action)] px-4 text-sm font-medium text-white">Retry</button>
    </section>
  );
}
