import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ShiftForm } from "@/components/shift-form";
import { requirePagePermission } from "@/lib/auth/session";

export default async function NewShiftPage() {
  await requirePagePermission("shift:manage");
  return <div className="space-y-6"><div><Link href="/admin/shifts" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"><ChevronLeft size={16} aria-hidden="true" /> Shifts</Link><p className="mt-5 text-sm font-medium text-[var(--blue)]">Administration</p><h1 className="mt-1 text-2xl font-semibold">Add shift</h1></div><ShiftForm /></div>;
}
