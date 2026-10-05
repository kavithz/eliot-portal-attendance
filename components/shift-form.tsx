"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveShiftAction, type ShiftActionState } from "@/app/(workspace)/admin/shifts/actions";
import { shiftWeekdays, type ShiftWeekday } from "@/lib/shifts/validation";

const weekdayLabels: Record<ShiftWeekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

export function ShiftForm({ id, name, workingDays = [] }: { id?: string; name?: string; workingDays?: ShiftWeekday[] }) {
  const action = saveShiftAction.bind(null, id ?? null);
  const [state, formAction, pending] = useActionState<ShiftActionState, FormData>(action, null);

  return (
    <form action={formAction} className="max-w-xl space-y-5 rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
      <label htmlFor="shift-name" className="block text-sm font-semibold">
        Shift name
        <input id="shift-name" name="name" required autoFocus maxLength={120} defaultValue={name ?? ""} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Scheduled working days</legend>
        <p className="text-xs text-[var(--muted)]">Select the days employees on this shift are scheduled to work. No days are preselected.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {shiftWeekdays.map((day) => (
            <label key={day} className="flex items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
              <input type="checkbox" name="workingDays" value={day} defaultChecked={workingDays.includes(day)} />
              {weekdayLabels[day]}
            </label>
          ))}
        </div>
      </fieldset>
      {state?.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)] disabled:opacity-60">{pending ? "Saving..." : id ? "Save shift" : "Create shift"}</button>
        <Link href="/admin/shifts" className="inline-flex h-10 items-center rounded-md border border-[var(--line)] px-4 text-sm font-medium">Cancel</Link>
      </div>
    </form>
  );
}
