import type { ReactNode } from "react";

type PunchKind = "IN" | "WFH_IN" | "OUT" | "WFH_OUT";

export function AttendancePunch({ kind, children }: { kind: PunchKind; children: ReactNode }) {
  const isIn = kind === "IN" || kind === "WFH_IN";
  const label = kind.replace("_", "-");

  return (
    <div className={`flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-[var(--line)] border-l-4 bg-white px-2.5 py-2 text-[var(--ink)] ${isIn ? "border-l-[var(--logo-blue)]" : "border-l-[var(--danger)]"}`}>
      <span className={`inline-flex h-6 min-w-10 shrink-0 items-center justify-center rounded-sm px-1.5 text-[10px] font-bold text-white ${isIn ? "bg-[var(--logo-blue)]" : "bg-[var(--danger)]"}`}>
        {label}
      </span>
      <div className="min-w-0 text-sm text-[var(--ink)]">{children}</div>
    </div>
  );
}