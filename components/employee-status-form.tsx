"use client";

import { setEmployeeActiveAction } from "@/app/(workspace)/admin/employees/actions";

export function EmployeeStatusForm({ employeeId, isActive }: { employeeId: string; isActive: boolean }) {
  const action = setEmployeeActiveAction.bind(null, employeeId, !isActive);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(isActive ? "Deactivate this account? Sign-in will be disabled; attendance history and correction requests will be retained." : "Reactivate this employee account?")) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className={`h-10 rounded-md border px-3.5 text-sm font-medium ${isActive ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
        {isActive ? "Deactivate employee" : "Activate employee"}
      </button>
      <p className="mt-2 text-xs text-[var(--muted)]">Deactivation blocks sign-in. Records are retained; employee deletion is unavailable to protect attendance history.</p>
    </form>
  );
}