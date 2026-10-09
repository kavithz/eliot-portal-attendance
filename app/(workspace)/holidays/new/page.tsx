import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { HolidayForm } from "@/components/holiday-form";
import { requirePagePermission } from "@/lib/auth/session";

export default async function NewHolidayPage() {
  await requirePagePermission("holiday:manage");
  return <div className="space-y-6"><div><Link href="/holidays" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"><ChevronLeft size={16} aria-hidden="true" /> Holiday calendar</Link><p className="mt-5 text-sm font-medium text-[var(--blue)]">Holiday management</p><h1 className="mt-1 text-2xl font-semibold">Add holiday</h1></div><HolidayForm /></div>;
}