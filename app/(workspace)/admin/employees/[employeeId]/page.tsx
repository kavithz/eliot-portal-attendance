import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { EmployeeStatusForm } from "@/components/employee-status-form";
import { getEmployee } from "@/lib/employees/service";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  let employee;
  try {
    employee = await getEmployee(admin, employeeId);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/employees" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"><ChevronLeft size={16} aria-hidden="true" /> Employees</Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-sm font-medium text-[var(--blue)]">Employee details</p><h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">{employee.name}</h1><p className="mt-2 text-sm text-[var(--muted)]">{employee.email}</p></div>
          <Link href={`/admin/employees/${employee.id}/edit`} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3.5 text-sm font-medium shadow-sm hover:bg-zinc-50"><Pencil size={15} aria-hidden="true" /> Edit employee</Link>
        </div>
      </div>
      <section className="max-w-3xl rounded-lg border border-[var(--line)] bg-white shadow-sm">
        <dl className="grid gap-x-8 divide-y divide-[var(--line)] px-5 sm:grid-cols-2 sm:divide-y-0 sm:px-7">
          <div className="border-b border-[var(--line)] py-4"><dt className="text-xs text-[var(--muted)]">Employee code</dt><dd className="mt-1.5 text-sm font-semibold">{employee.employeeCode ?? "—"}</dd></div>
          <div className="border-b border-[var(--line)] py-4"><dt className="text-xs text-[var(--muted)]">Role</dt><dd className="mt-1.5 text-sm font-semibold">{employee.role === "ADMIN" ? "Admin" : "Employee"}</dd></div>
          <div className="border-b border-[var(--line)] py-4"><dt className="text-xs text-[var(--muted)]">Country code</dt><dd className="mt-1.5 text-sm font-semibold">{employee.countryCode}</dd></div>
          <div className="border-b border-[var(--line)] py-4"><dt className="text-xs text-[var(--muted)]">IANA timezone</dt><dd className="mt-1.5 text-sm font-semibold">{employee.timeZone}</dd></div>
          <div className="py-4"><dt className="text-xs text-[var(--muted)]">Account status</dt><dd className="mt-1.5 text-sm font-semibold">{employee.isActive ? "Active" : "Inactive"}</dd></div>
        </dl>
        <div className="border-t border-[var(--line)] px-5 py-4 sm:px-7">
          <EmployeeStatusForm employeeId={employee.id} isActive={employee.isActive} />
        </div>
      </section>
    </div>
  );
}