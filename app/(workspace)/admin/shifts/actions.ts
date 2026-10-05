"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createShift, deleteShift, getShift, ShiftInUseError, ShiftNotFoundError, updateShift, writeShiftAuditEvent } from "@/lib/shifts/service";

export type ShiftActionState = { error: string } | null;

function actionError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Enter a valid Shift name.";
  if (error instanceof ShiftInUseError || error instanceof ShiftNotFoundError) return error.message;
  console.error("Shift management action failed", error instanceof Error ? error.name : "Unknown error");
  return "The Shift could not be saved. Try again shortly.";
}

export async function saveShiftAction(
  id: string | null,
  _state: ShiftActionState,
  formData: FormData,
): Promise<ShiftActionState> {
  try {
    const admin = await requireAdmin();
    await prisma.$transaction(async (tx) => {
      if (id) {
        const before = await getShift(admin, id, tx);
        const updated = await updateShift(admin, id, { name: formData.get("name") }, tx);
        if (before.name !== updated.name) {
          await writeShiftAuditEvent(tx, { shiftId: id, actorId: admin.id, operation: "UPDATED" });
        }
      } else {
        const created = await createShift(admin, { name: formData.get("name") }, tx);
        await writeShiftAuditEvent(tx, { shiftId: created.id, actorId: admin.id, operation: "CREATED" });
      }
    });
  } catch (error) {
    return { error: actionError(error) };
  }

  revalidatePath("/admin/shifts");
  revalidatePath("/admin/employees");
  redirect("/admin/shifts");
}

export async function deleteShiftAction(id: string) {
  const admin = await requireAdmin();
  try {
    await prisma.$transaction(async (tx) => {
      const deleted = await deleteShift(admin, id, tx);
      await writeShiftAuditEvent(tx, { shiftId: deleted.id, actorId: admin.id, operation: "DELETED" });
    });
  } catch (error) {
    redirect(`/admin/shifts?error=${encodeURIComponent(actionError(error))}`);
  }

  revalidatePath("/admin/shifts");
  revalidatePath("/admin/employees");
  redirect("/admin/shifts?success=Shift%20deleted.");
}
