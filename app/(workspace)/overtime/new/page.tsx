import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { OvertimeRequestForm } from "@/components/overtime-request-form";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";

export default async function NewOvertimeRequestPage() {
  const actor = await requirePageUser();
  if (actor.role !== "EMPLOYEE" || !hasPermission(actor.role, "overtime:submit")) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/overtime" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]">
          <ChevronLeft size={16} aria-hidden="true" /> Overtime requests
        </Link>
        <p className="mt-5 text-sm font-medium text-[var(--blue)]">Personal records</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Request Overtime</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Times are interpreted in your configured timezone ({actor.timeZone}).</p>
      </div>
      <OvertimeRequestForm />
    </div>
  );
}
