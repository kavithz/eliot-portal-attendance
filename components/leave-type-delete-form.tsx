"use client";

import { deleteLeaveTypeAction } from "@/app/(workspace)/admin/leave-types/actions";

export function LeaveTypeDeleteForm({ id, name }: { id: string; name: string }) {
  const action = deleteLeaveTypeAction.bind(null, id);
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm(`Delete Leave Type “${name}”?`)) event.preventDefault();
    }}>
      <button type="submit" className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Delete</button>
    </form>
  );
}
