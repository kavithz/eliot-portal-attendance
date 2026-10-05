import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { LeaveTypeForm } from "@/components/leave-type-form";
import { requirePageAdmin } from "@/lib/auth/session";

export default async function NewLeaveTypePage() {
  await requirePageAdmin();
  return <div className="space-y-6"><div><Link href="/admin/leave-types" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"><ChevronLeft size={16} aria-hidden="true" /> Leave Types</Link><p className="mt-5 text-sm font-medium text-[var(--blue)]">Administration</p><h1 className="mt-1 text-2xl font-semibold">Add Leave Type</h1></div><LeaveTypeForm /></div>;
}
