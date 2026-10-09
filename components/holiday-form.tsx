"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveHolidayAction, type HolidayActionState } from "@/app/(workspace)/holidays/actions";

type HolidayFormValue = {
  date: string;
  name: string;
  type: "PUBLIC" | "POYA" | "COMPANY" | "SPECIAL" | "BRANCH_SPECIFIC";
  branch: string | null;
  applicableEmployeeGroups: string[];
  isPaid: boolean;
  overtimeEligible: boolean;
};

export function HolidayForm({ holiday, id }: { holiday?: HolidayFormValue; id?: string }) {
  const action = saveHolidayAction.bind(null, id ?? null);
  const [state, formAction, pending] = useActionState<HolidayActionState, FormData>(action, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-5 rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="holiday-date" className="text-sm font-semibold">Date
          <input id="holiday-date" name="date" type="date" required defaultValue={holiday?.date} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
        <label htmlFor="holiday-name" className="text-sm font-semibold">Holiday name
          <input id="holiday-name" name="name" required maxLength={120} defaultValue={holiday?.name} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
        <label htmlFor="holiday-type" className="text-sm font-semibold">Holiday type
          <select id="holiday-type" name="type" required defaultValue={holiday?.type ?? "PUBLIC"} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal">
            <option value="PUBLIC">Public holiday</option>
            <option value="POYA">Poya holiday</option>
            <option value="COMPANY">Company holiday</option>
            <option value="SPECIAL">Special holiday</option>
            <option value="BRANCH_SPECIFIC">Branch-specific holiday</option>
          </select>
        </label>
        <label htmlFor="holiday-branch" className="text-sm font-semibold">Branch
          <input id="holiday-branch" name="branch" maxLength={120} defaultValue={holiday?.branch ?? ""} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
        <label htmlFor="holiday-groups" className="text-sm font-semibold sm:col-span-2">Applicable employee groups
          <input id="holiday-groups" name="applicableEmployeeGroups" defaultValue={holiday?.applicableEmployeeGroups.join(", ")} placeholder="All groups" className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
        <label htmlFor="holiday-paid" className="text-sm font-semibold">Paid / unpaid
          <select id="holiday-paid" name="isPaid" required defaultValue={holiday?.isPaid === false ? "false" : "true"} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal">
            <option value="true">Paid</option>
            <option value="false">Unpaid</option>
          </select>
        </label>
        <label htmlFor="holiday-overtime" className="text-sm font-semibold">OT eligibility
          <select id="holiday-overtime" name="overtimeEligible" required defaultValue={holiday?.overtimeEligible ? "true" : "false"} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal">
            <option value="true">Eligible</option>
            <option value="false">Not eligible</option>
          </select>
        </label>
      </div>
      {state?.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)] disabled:opacity-60">{pending ? "Saving..." : holiday ? "Save holiday" : "Add holiday"}</button>
        <Link href="/holidays" className="inline-flex h-10 items-center rounded-md border border-[var(--line)] px-4 text-sm font-medium">Cancel</Link>
      </div>
    </form>
  );
}