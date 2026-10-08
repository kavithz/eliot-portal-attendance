"use client";

import { useActionState } from "react";
import {
  submitOvertimeRequestAction,
  type OvertimeRequestActionState,
} from "@/app/(workspace)/overtime/actions";

export function OvertimeRequestForm() {
  const [state, formAction, pending] = useActionState<OvertimeRequestActionState, FormData>(
    submitOvertimeRequestAction,
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
        <textarea name="reason" required rows={3} className="mt-1.5 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-normal" />
      </label>
      <label className="block text-sm font-semibold">
        Project
        <input name="project" required className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
      </label>
      <label className="block max-w-xs text-sm font-semibold">
        Expected hours
        <input name="expectedHours" type="number" min="0.01" step="0.01" required className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
      </label>
      {state && "error" in state && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state && "success" in state && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)] disabled:opacity-60">
          {pending ? "Submitting..." : "Submit overtime request"}
        </button>
      </div>
    </form>
  );
}
