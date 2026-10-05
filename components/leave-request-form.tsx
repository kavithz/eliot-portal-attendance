"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitLeaveRequestAction, type LeaveRequestActionState } from "@/app/(workspace)/leave/actions";

type LeaveTypeOption = { id: string; name: string };
type DocumentOption = { id: string; type: string; originalFilename: string; uploadedAt: Date };

export function LeaveRequestForm({
  leaveTypes,
  documents,
}: {
  leaveTypes: LeaveTypeOption[];
  documents: DocumentOption[];
}) {
  const [state, formAction, pending] = useActionState<LeaveRequestActionState, FormData>(submitLeaveRequestAction, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-5 rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
      <label htmlFor="leave-type" className="block text-sm font-semibold">
        Leave Type
        <select id="leave-type" name="leaveTypeId" required defaultValue="" className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal">
          <option value="" disabled>Select a Leave Type</option>
          {leaveTypes.map((leaveType) => <option key={leaveType.id} value={leaveType.id}>{leaveType.name}</option>)}
        </select>
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label htmlFor="start-date" className="block text-sm font-semibold">
          Start Date
          <input id="start-date" name="startDate" type="date" required className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
        <label htmlFor="end-date" className="block text-sm font-semibold">
          End Date
          <input id="end-date" name="endDate" type="date" required className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
        </label>
      </div>
      <label htmlFor="reason" className="block text-sm font-semibold">
        Reason
        <textarea id="reason" name="reason" required maxLength={500} rows={4} className="mt-1.5 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-normal" />
      </label>
      <label htmlFor="attachment-document" className="block text-sm font-semibold">
        Supporting document <span className="font-normal text-[var(--muted)]">(optional)</span>
        <select id="attachment-document" name="attachmentDocumentId" defaultValue="" className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal">
          <option value="">No document attached</option>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.originalFilename} ({document.type.replaceAll("_", " ").toLowerCase()})
            </option>
          ))}
        </select>
        {documents.length === 0 && <span className="mt-1 block text-xs font-normal text-[var(--muted)]">No Employee Documents are available to attach.</span>}
      </label>
      {state?.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || leaveTypes.length === 0} className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)] disabled:opacity-60">
          {pending ? "Submitting..." : "Submit request"}
        </button>
        <Link href="/leave" className="inline-flex h-10 items-center rounded-md border border-[var(--line)] px-4 text-sm font-medium">Cancel</Link>
      </div>
      {leaveTypes.length === 0 && <p role="status" className="text-sm text-[var(--muted)]">Leave requests are unavailable because no Leave Types are configured.</p>}
    </form>
  );
}
