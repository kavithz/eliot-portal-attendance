"use client";

import { useActionState } from "react";
import {
  submitWorkFromHomeRequestAction,
  type WorkFromHomeRequestActionState,
} from "@/app/(workspace)/wfh/actions";

export function WorkFromHomeRequestForm() {
  const [state, formAction, pending] = useActionState<WorkFromHomeRequestActionState, FormData>(
    submitWorkFromHomeRequestAction,
    null,
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-5 rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-5 sm:grid-cols-3">
        <label className="block text-sm font-semibold">
          Date
          <input name="date" type="date" required className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
        <label className="block text-sm font-semibold">
          Start time
          <input name="startTime" type="time" required className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
        <label className="block text-sm font-semibold">
          End time
          <input name="endTime" type="time" required className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
      </div>
      <label className="block text-sm font-semibold">
        Reason
        <textarea name="reason" required maxLength={2000} rows={3} className="mt-1.5 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-normal" />
      </label>
      <label className="block text-sm font-semibold">
        Work location
        <input name="workLocation" required maxLength={500} className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
      </label>
      <p className="text-xs text-[var(--muted)]">Your request is routed to your assigned Supervisor, then your assigned Manager. Times use your configured timezone.</p>
      {state && "error" in state && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state && "success" in state && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>}
      <button type="submit" disabled={pending} className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)] disabled:opacity-60">
        {pending ? "Submitting..." : "Submit WFH request"}
      </button>
    </form>
  );
}
