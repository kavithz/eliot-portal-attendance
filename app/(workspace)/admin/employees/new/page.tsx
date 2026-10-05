import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EmployeeForm } from "@/components/employee-form";
import { requireAdmin } from "@/lib/auth/session";
import { readAppSettings } from "@/lib/attendance/qa-fixes";
import { listOrganizationOptions } from "@/lib/organization/service";
import { listShiftOptions } from "@/lib/shifts/service";
import { listEmployeeReportingOptions } from "@/lib/employees/service";

export default async function NewEmployeePage() {
  const admin = await requireAdmin();
  const [settings, organizationOptions, shifts, reportingOptions] = await Promise.all([
    readAppSettings(),
    listOrganizationOptions(admin),
    listShiftOptions(admin),
    listEmployeeReportingOptions(admin),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/employees" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"><ChevronLeft size={16} aria-hidden="true" /> Employees</Link>
        <p className="mt-5 text-sm font-medium text-[var(--blue)]">Administration</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Add employee</h1>
      </div>
      <EmployeeForm defaultTimeZone={settings.defaultTimeZone} departments={organizationOptions.departments} designations={organizationOptions.designations} shifts={shifts} supervisors={reportingOptions.supervisors} managers={reportingOptions.managers} />
    </div>
  );
}