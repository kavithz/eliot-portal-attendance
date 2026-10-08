"use client";

export default function WorkFromHomeApprovalsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="rounded-lg border border-red-200 bg-white p-6">
      <h2 className="font-semibold">WFH approvals could not be loaded</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">Try again. If the problem continues, contact your administrator.</p>
      <button type="button" onClick={reset} className="mt-4 h-9 rounded-md border border-[var(--line)] px-3 text-sm font-semibold">Try again</button>
    </section>
  );
}
