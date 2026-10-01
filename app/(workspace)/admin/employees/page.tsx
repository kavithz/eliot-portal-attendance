import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { listEmployees } from "@/lib/employees/service";

export default async function AdminEmployeesPage() {
  const admin = await requireAdmin();
  const employees = await listEmployees(admin);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--blue)]">Administration</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Employees</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{employees.length} employee{employees.length === 1 ? "" : "s"}</p>
        </div>
        <Link href="/admin/employees/new" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)]"><Plus size={17} aria-hidden="true" /> Add employee</Link>
      </div>

      <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-sm" aria-label="Employee directory">
        {employees.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-[var(--blue)]"><Users size={21} aria-hidden="true" /></span>
            <h2 className="mt-4 text-base font-semibold">No employees yet</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">Add an employee account to get started.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--line)] bg-zinc-50 text-xs text-[var(--muted)]">
                  <tr><th className="px-5 py-3.5 font-semibold">Employee</th><th className="px-5 py-3.5 font-semibold">Code</th><th className="px-5 py-3.5 font-semibold">Location</th><th className="px-5 py-3.5 font-semibold">Role</th><th className="px-5 py-3.5 font-semibold">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {employees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-zinc-50/70">
                      <td className="px-5 py-4"><Link href={`/admin/employees/${employee.id}`} className="font-semibold text-[var(--ink)] hover:text-[var(--blue)]">{employee.name}</Link><p className="mt-1 text-xs text-[var(--muted)]">{employee.email}</p></td>
                      <td className="px-5 py-4 text-[var(--muted)]">{employee.employeeCode ?? "—"}</td>
                      <td className="px-5 py-4"><span className="font-medium">{employee.countryCode}</span><p className="mt-1 text-xs text-[var(--muted)]">{employee.timeZone}</p></td>
                      <td className="px-5 py-4 text-[var(--muted)]">{employee.role === "ADMIN" ? "Admin" : "Employee"}</td>
                      <td className="px-5 py-4"><span className={`rounded-sm px-2 py-1 text-xs font-medium ${employee.isActive ? "bg-[var(--mint)] text-[var(--mint-ink)]" : "bg-zinc-100 text-zinc-600"}`}>{employee.isActive ? "Active" : "Inactive"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[var(--line)] md:hidden">
              {employees.map((employee) => (
                <li key={employee.id}>
                  <Link href={`/admin/employees/${employee.id}`} className="block space-y-3 px-4 py-4 hover:bg-zinc-50/70">
                    <div className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{employee.name}</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{employee.email}</span></span><span className={`shrink-0 rounded-sm px-2 py-1 text-xs font-medium ${employee.isActive ? "bg-[var(--mint)] text-[var(--mint-ink)]" : "bg-zinc-100 text-zinc-600"}`}>{employee.isActive ? "Active" : "Inactive"}</span></div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]"><span>{employee.employeeCode ?? "No code"}</span><span>{employee.countryCode} · {employee.timeZone}</span><span>{employee.role === "ADMIN" ? "Admin" : "Employee"}</span></div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}