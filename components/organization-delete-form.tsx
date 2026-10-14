"use client";

import { deleteOrganizationAction, type OrganizationEntity } from "@/app/(workspace)/admin/organization/actions";

export function OrganizationDeleteForm({ entity, id, name }: { entity: OrganizationEntity; id: string; name: string }) {
  const action = deleteOrganizationAction.bind(null, entity, id);
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm(`Delete ${entity.toLowerCase()} “${name}”?`)) event.preventDefault();
    }}>
      <button type="submit" className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Delete</button>
    </form>
  );
}
