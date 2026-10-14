import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { OrganizationForm } from "@/components/organization-form";
import { requireAdmin } from "@/lib/auth/session";
import { getOrganizationRecord } from "@/lib/organization/service";

export default async function EditDepartmentPage({ params }: { params: Promise<{ departmentId: string }> }) {
  const admin = await requireAdmin();
  const { departmentId } = await params;
  let department;
  try { department = await getOrganizationRecord("Department", admin, departmentId); } catch { notFound(); }
  return <div className="space-y-6"><div><Link href="/admin/departments" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"><ChevronLeft size={16} aria-hidden="true" /> Departments</Link><p className="mt-5 text-sm font-medium text-[var(--blue)]">Administration</p><h1 className="mt-1 text-2xl font-semibold">Edit department</h1></div><OrganizationForm entity="Department" id={department.id} name={department.name} /></div>;
}
