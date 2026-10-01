"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createEmployeeAction, updateEmployeeAction } from "@/app/(workspace)/admin/employees/actions";
import type { EmployeeActionState } from "@/app/(workspace)/admin/employees/actions";

type EmployeeFormValues = {
  id: string;
  name: string;
  employeeCode: string | null;
  email: string;
  role: "EMPLOYEE" | "ADMIN";
  countryCode: string;
  timeZone: string;
};

export function EmployeeForm({ employee, defaultTimeZone = "Asia/Colombo" }: { employee?: EmployeeFormValues; defaultTimeZone?: string }) {
  const boundUpdateAction = employee ? updateEmployeeAction.bind(null, employee.id) : createEmployeeAction;
  const [state, formAction, pending] = useActionState<EmployeeActionState, FormData>(boundUpdateAction, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-5 rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="mb-2 block text-sm font-semibold">Full name</label>
          <input id="name" name="name" required maxLength={120} defaultValue={employee?.name} className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="employeeCode" className="mb-2 block text-sm font-semibold">Employee code</label>
          <input id="employeeCode" name="employeeCode" required maxLength={50} defaultValue={employee?.employeeCode ?? ""} className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={employee?.email} className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="countryCode" className="mb-2 block text-sm font-semibold">Country code</label>
          <input id="countryCode" name="countryCode" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" autoCapitalize="characters" placeholder="LK" defaultValue={employee?.countryCode} onChange={(event) => {
            const timezone = document.getElementById("timeZone");
            if (!(timezone instanceof HTMLInputElement) || employee) return;
            const country = event.currentTarget.value.trim().toUpperCase();
            timezone.value = country === "LK" ? "Asia/Colombo" : country === "BD" ? "Asia/Dhaka" : defaultTimeZone;
          }} className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm uppercase" />
        </div>
        <div>
          <label htmlFor="timeZone" className="mb-2 block text-sm font-semibold">IANA timezone</label>
          <input id="timeZone" name="timeZone" required placeholder="Asia/Colombo" defaultValue={employee?.timeZone ?? defaultTimeZone} className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="role" className="mb-2 block text-sm font-semibold">Role</label>
          <select id="role" name="role" required defaultValue={employee?.role ?? "EMPLOYEE"} className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm">
            <option value="EMPLOYEE">Employee</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-semibold">{employee ? "Reset password" : "Initial password"}</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required={!employee} minLength={1} className="h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm" />
          <p className="mt-1.5 text-xs text-[var(--muted)]">{employee ? "Leave blank to keep the current password." : "Maximum 72 UTF-8 bytes."}</p>
        </div>
      </div>
      {state?.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{state.error}</p>}
      <div className="flex flex-wrap gap-3 border-t border-[var(--line)] pt-5">
        <button type="submit" disabled={pending} className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-medium text-white transition hover:bg-[var(--action-hover)] disabled:opacity-60">{pending ? "Saving..." : employee ? "Save changes" : "Create employee"}</button>
        <Link href={employee ? `/admin/employees/${employee.id}` : "/admin/employees"} className="inline-flex h-10 items-center rounded-md border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-zinc-50">Cancel</Link>
      </div>
    </form>
  );
}