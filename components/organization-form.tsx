"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveOrganizationAction, type OrganizationActionState, type OrganizationEntity } from "@/app/(workspace)/admin/organization/actions";

export function OrganizationForm({ entity, id, name }: { entity: OrganizationEntity; id?: string; name?: string }) {
  const action = id ? saveOrganizationAction.bind(null, entity, id) : saveOrganizationAction.bind(null, entity, null);
  const [state, formAction, pending] = useActionState<OrganizationActionState, FormData>(action, null);
  const label = entity.toLowerCase();

  return (
    <form action={formAction} className="max-w-xl space-y-5 rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
      <label htmlFor="organization-name" className="block text-sm font-semibold">
        {entity} name
        <input id="organization-name" name="name" required autoFocus maxLength={120} defaultValue={name ?? ""} className="mt-1.5 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
      </label>
      {state?.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)] disabled:opacity-60">{pending ? "Saving..." : id ? `Save ${label}` : `Create ${label}`}</button>
        <Link href={`/admin/${label === "department" ? "departments" : "designations"}`} className="inline-flex h-10 items-center rounded-md border border-[var(--line)] px-4 text-sm font-medium">Cancel</Link>
      </div>
    </form>
  );
}
