import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { EmployeeDocuments } from "@/components/employee-documents";
import { requireAdmin } from "@/lib/auth/session";
import { EmployeeNotFoundError, getEmployee } from "@/lib/employees/service";

export default async function EmployeeDocumentsPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const admin = await requireAdmin();
  const { employeeId } = await params;
  let employee;
  try {
    employee = await getEmployee(admin, employeeId);
  } catch (error) {
    if (error instanceof EmployeeNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/employees/${employee.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">
          <ChevronLeft size={16} aria-hidden="true" /> {employee.name}
        </Link>
        <p className="mt-5 text-sm font-medium text-[var(--blue)]">Administration · Employees</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Employee documents</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{employee.name}</p>
      </div>
      <EmployeeDocuments employeeId={employee.id} />
    </div>
  );
}
