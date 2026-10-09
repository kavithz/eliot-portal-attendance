"use client";

export default function MonthlyReportError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="rounded-lg border border-red-200 bg-white p-6"><h1 className="text-lg font-semibold">Monthly summary unavailable</h1><p className="mt-2 text-sm text-[var(--muted)]">The report could not be loaded for this selection.</p><button type="button" onClick={reset} className="mt-4 h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white">Retry</button></section>;
}