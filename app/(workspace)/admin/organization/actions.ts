"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  createOrganizationRecord,
  deleteOrganizationRecord,
  getOrganizationRecord,
  OrganizationInUseError,
  OrganizationNotFoundError,
  updateOrganizationRecord,
  writeOrganizationAuditEvent,
} from "@/lib/organization/service";

export type OrganizationActionState = { error: string } | null;
export type OrganizationEntity = "Department" | "Designation";

function route(entity: OrganizationEntity) {
  return entity === "Department" ? "/admin/departments" : "/admin/designations";
}

function actionError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Enter a valid name.";
  if (error instanceof OrganizationInUseError || error instanceof OrganizationNotFoundError) return error.message;
  console.error("Organization management action failed", error instanceof Error ? error.name : "Unknown error");
  return "The record could not be saved. Try again shortly.";
}

export async function saveOrganizationAction(
  entity: OrganizationEntity,
  id: string | null,
  _state: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  try {
    const admin = await requireAdmin();
    await prisma.$transaction(async (tx) => {
      if (id) {
        const before = await getOrganizationRecord(entity, admin, id, tx);
        const updated = await updateOrganizationRecord(entity, admin, id, { name: formData.get("name") }, tx);
        if (before.name !== updated.name) {
          await writeOrganizationAuditEvent(tx, { entity, entityId: id, actorId: admin.id, operation: "UPDATED" });
        }
      } else {
        const created = await createOrganizationRecord(entity, admin, { name: formData.get("name") }, tx);
        await writeOrganizationAuditEvent(tx, { entity, entityId: created.id, actorId: admin.id, operation: "CREATED" });
      }
    });
  } catch (error) {
    return { error: actionError(error) };
  }

  revalidatePath(route(entity));
  revalidatePath("/admin/employees");
  redirect(route(entity));
}

export async function deleteOrganizationAction(entity: OrganizationEntity, id: string) {
  const admin = await requireAdmin();
  try {
    await prisma.$transaction(async (tx) => {
      const deleted = await deleteOrganizationRecord(entity, admin, id, tx);
      await writeOrganizationAuditEvent(tx, { entity, entityId: deleted.id, actorId: admin.id, operation: "DELETED" });
    });
  } catch (error) {
    redirect(`${route(entity)}?error=${encodeURIComponent(actionError(error))}`);
  }

  revalidatePath(route(entity));
  revalidatePath("/admin/employees");
  redirect(`${route(entity)}?success=${encodeURIComponent(`${entity} deleted.`)}`);
}
