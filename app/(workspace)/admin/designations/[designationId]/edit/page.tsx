import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { OrganizationForm } from "@/components/organization-form";
import { requireAdmin } from "@/lib/auth/session";
import { getOrganizationRecord } from "@/lib/organization/service";

export default async function EditDesignationPage({ params }: { params: Promise<{ designationId: string }> }) {
  const admin = await requireAdmin();
  const { designationId } = await params;
  let designation;
  try { designation = await getOrganizationRecord("Designation", admin, designationId); } catch { notFound(); }
  return <div className="space-y-6"><div><Link href="/admin/designations" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"><ChevronLeft size={16} aria-hidden="true" /> Designations</Link><p className="mt-5 text-sm font-medium text-[var(--blue)]">Administration</p><h1 className="mt-1 text-2xl font-semibold">Edit designation</h1></div><OrganizationForm entity="Designation" id={designation.id} name={designation.name} /></div>;
}
