import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { OrganizationForm } from "@/components/organization-form";

export default function NewDepartmentPage() {
  return <div className="space-y-6"><div><Link href="/admin/departments" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"><ChevronLeft size={16} aria-hidden="true" /> Departments</Link><p className="mt-5 text-sm font-medium text-[var(--blue)]">Administration</p><h1 className="mt-1 text-2xl font-semibold">Add department</h1></div><OrganizationForm entity="Department" /></div>;
}
