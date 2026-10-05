"use client";

export default function LeaveTypesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="rounded-lg border border-red-200 bg-white p-6" role="alert"><h1 className="text-lg font-semibold">Leave Types are unavailable</h1><p className="mt-2 text-sm text-[var(--muted)]">The Leave Type list could not be loaded.</p><button type="button" onClick={reset} className="mt-4 h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white">Try again</button></section>;
}
