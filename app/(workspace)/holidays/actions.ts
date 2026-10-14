"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import {
  createHoliday,
  deleteHoliday,
  HolidayAccessError,
  HolidayDuplicateError,
  HolidayNotFoundError,
  updateHoliday,
} from "@/lib/holidays/service";

export type HolidayActionState = { error: string } | null;

function actionError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Enter valid holiday details.";
  if (error instanceof HolidayAccessError || error instanceof HolidayDuplicateError || error instanceof HolidayNotFoundError) return error.message;
  console.error("Holiday management action failed", error instanceof Error ? error.name : "Unknown error");
  return "The holiday could not be saved. Try again shortly.";
}

function holidayValues(formData: FormData) {
  return {
    date: formData.get("date"),
    name: formData.get("name"),
    type: formData.get("type"),
    branch: formData.get("branch"),
    applicableEmployeeGroups: formData.get("applicableEmployeeGroups"),
    isPaid: formData.get("isPaid"),
    overtimeEligible: formData.get("overtimeEligible"),
  };
}

export async function saveHolidayAction(
  id: string | null,
  _state: HolidayActionState,
  formData: FormData,
): Promise<HolidayActionState> {
  try {
    const actor = await requireUser();
    if (!hasPermission(actor.role, "holiday:manage")) throw new HolidayAccessError();
    if (id) await updateHoliday(actor, id, holidayValues(formData));
    else await createHoliday(actor, holidayValues(formData));
  } catch (error) {
    return { error: actionError(error) };
  }

  revalidatePath("/holidays");
  const date = String(formData.get("date") ?? "");
  redirect(`/holidays?month=${encodeURIComponent(date.slice(0, 7))}&success=${encodeURIComponent(id ? "Holiday updated." : "Holiday added.")}`);
}

export async function deleteHolidayAction(id: string) {
  const actor = await requireUser();
  try {
    if (!hasPermission(actor.role, "holiday:manage")) throw new HolidayAccessError();
    await deleteHoliday(actor, id);
  } catch (error) {
    redirect(`/holidays?error=${encodeURIComponent(actionError(error))}`);
  }

  revalidatePath("/holidays");
  redirect(`/holidays?success=${encodeURIComponent("Holiday deleted.")}`);
}