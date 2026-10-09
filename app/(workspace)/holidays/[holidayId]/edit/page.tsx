import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { HolidayForm } from "@/components/holiday-form";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";
import { getHoliday } from "@/lib/holidays/service";

export default async function EditHolidayPage({ params }: { params: Promise<{ holidayId: string }> }) {
  const user = await requirePageUser();
  if (!hasPermission(user.role, "holiday:manage")) redirect("/dashboard");
  const { holidayId } = await params;
  const holiday = await getHoliday(user, holidayId);
  return <div className="space-y-6"><div><Link href={`/holidays?month=${holiday.date.toISOString().slice(0, 7)}`} className="inline-flex items-center gap-1 text-sm text-[var(--muted)]"><ChevronLeft size={16} aria-hidden="true" /> Holiday calendar</Link><p className="mt-5 text-sm font-medium text-[var(--blue)]">Holiday management</p><h1 className="mt-1 text-2xl font-semibold">Edit holiday</h1></div><HolidayForm id={holiday.id} holiday={{ ...holiday, date: holiday.date.toISOString().slice(0, 10) }} /></div>;
}