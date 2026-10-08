"use client";

import { useActionState } from "react";
import {
  decideOvertimeRequestAction,
  type OvertimeDecisionActionState,
} from "@/app/(workspace)/approvals/overtime/actions";

export function OvertimeReviewForm({ overtimeRequestId }: { overtimeRequestId: string }) {
  const action = decideOvertimeRequestAction.bind(null, overtimeRequestId);
  const [state, formAction, pending] = useActionState<OvertimeDecisionActionState, FormData>(action, null);

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-xs font-semibold text-[var(--muted)]">
        Decision note <span className="font-normal">(optional)</span>
        <textarea name="reason" maxLength={500} rows={2} className="mt-1.5 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-normal" />
      </label>
      {state && "error" in state && <p role="alert" className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state && "success" in state && <p role="status" className="text-sm text-[var(--mint-ink)]">{state.success}</p>}
      <div className="flex flex-wrap gap-2">
        <button name="action" value="APPROVE" type="submit" disabled={pending} className="h-9 rounded-md bg-[var(--action)] px-3 text-xs font-semibold text-white hover:bg-[var(--action-hover)] disabled:opacity-60">
          {pending ? "Saving..." : "Approve"}
        </button>
        <button name="action" value="REJECT" type="submit" disabled={pending} className="h-9 rounded-md border border-[var(--line)] px-3 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60">
          Reject
        </button>
      </div>
    </form>
  );
}
