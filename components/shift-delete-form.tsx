"use client";

import { deleteShiftAction } from "@/app/(workspace)/admin/shifts/actions";

export function ShiftDeleteForm({ id, name }: { id: string; name: string }) {
  const action = deleteShiftAction.bind(null, id);
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm(`Delete shift “${name}”?`)) event.preventDefault();
    }}>
      <button type="submit" className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Delete</button>
    </form>
  );
}
