"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  createEmployee,
  EmployeeDuplicateError,
  setEmployeeActive,
  updateEmployee,
} from "@/lib/employees/service";

export type EmployeeActionState = { error: string } | null;

function employeeFormData(formData: FormData) {
  return {
    name: formData.get("name"),
    employeeCode: formData.get("employeeCode"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    countryCode: formData.get("countryCode"),
    timeZone: formData.get("timeZone"),
  };
}

function actionError(error: unknown) {
  if (error instanceof EmployeeDuplicateError) return error.message;
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the employee details and try again.";
  console.error("Employee management action failed", error instanceof Error ? error.name : "Unknown error");
  return "The employee could not be saved. Try again shortly.";
}

export async function createEmployeeAction(_state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  let employee;
  try {
    const admin = await requireAdmin();
    employee = await createEmployee(admin, employeeFormData(formData));
  } catch (error) {
    return { error: actionError(error) };
  }

  revalidatePath("/admin/employees");
  redirect(`/admin/employees/${employee.id}`);
}

export async function updateEmployeeAction(employeeId: string, _state: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  try {
    const admin = await requireAdmin();
    await prisma.$transaction(async (tx) => {
      const previous = await tx.user.findUnique({ where: { id: employeeId }, select: { id: true, name: true, email: true, employeeCode: true, countryCode: true, timeZone: true, role: true } });
      if (!previous) throw new Error("Employee not found.");
      const updated = await updateEmployee(admin, employeeId, employeeFormData(formData), tx);
      await tx.attendanceAuditLog.create({
        data: {
          employeeId,
          actorId: admin.id,
          actionType: "EMPLOYEE_UPDATED",
          previousValues: { name: previous.name, email: previous.email, employeeCode: previous.employeeCode, countryCode: previous.countryCode, timeZone: previous.timeZone, role: previous.role },
          newValues: { name: updated.name, email: updated.email, employeeCode: updated.employeeCode, countryCode: updated.countryCode, timeZone: updated.timeZone, role: updated.role },
          reason: "Administrator updated employee profile details.",
        },
        select: { id: true, employeeId: true, actorId: true, actionType: true, previousValues: true, newValues: true, reason: true, createdAt: true },
      });
    });
  } catch (error) {
    return { error: actionError(error) };
  }

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  redirect(`/admin/employees/${employeeId}`);
}

export async function setEmployeeActiveAction(employeeId: string, isActive: boolean) {
  const admin = await requireAdmin();
  await prisma.$transaction(async (tx) => {
    const previous = await tx.user.findUnique({ where: { id: employeeId }, select: { isActive: true } });
    if (!previous) throw new Error("Employee not found.");
    if (previous.isActive === isActive) return;
    await setEmployeeActive(admin, employeeId, isActive, tx);
    await tx.attendanceAuditLog.create({
      data: {
        employeeId,
        actorId: admin.id,
        actionType: isActive ? "EMPLOYEE_ACTIVATED" : "EMPLOYEE_DEACTIVATED",
        previousValues: { isActive: previous.isActive },
        newValues: { isActive },
        reason: isActive ? "Administrator reactivated the employee account." : "Administrator deactivated the account; attendance history is retained.",
      },
      select: { id: true, employeeId: true, actorId: true, actionType: true, previousValues: true, newValues: true, reason: true, createdAt: true },
    });
  });
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  redirect(`/admin/employees/${employeeId}`);
}