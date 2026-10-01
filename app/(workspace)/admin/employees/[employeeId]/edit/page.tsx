import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { EmployeeForm } from "@/components/employee-form";
import { requireAdmin } from "@/lib/auth/session";
import { getEmployee } from "@/lib/employees/service";

export default async function EditEmployeePage({ params }: { params: Promise<{ employeeId: string }> }) {
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
        <Link href={`/admin/employees/${employee.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"><ChevronLeft size={16} aria-hidden="true" /> Employee details</Link>
        <p className="mt-5 text-sm font-medium text-[var(--blue)]">Administration</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Edit employee</h1>
      </div>
      <EmployeeForm employee={employee} />
    </div>
  );
}