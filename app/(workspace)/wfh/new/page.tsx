import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { WorkFromHomeRequestForm } from "@/components/work-from-home-request-form";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePageUser } from "@/lib/auth/session";

export default async function NewWorkFromHomeRequestPage() {
  const actor = await requirePageUser();
  if (actor.role !== "EMPLOYEE" || !hasPermission(actor.role, "wfh:submit")) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/wfh" className="inline-flex items-center gap-1 text-sm text-[var(--muted)]">
          <ChevronLeft size={16} aria-hidden="true" /> WFH requests
        </Link>
        <p className="mt-5 text-sm font-medium text-[var(--blue)]">Personal records</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Request Work From Home</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Times are interpreted in your configured timezone ({actor.timeZone}). Your request will go to your assigned Supervisor and Manager for approval.</p>
      </div>
      <WorkFromHomeRequestForm />
    </div>
  );
}
