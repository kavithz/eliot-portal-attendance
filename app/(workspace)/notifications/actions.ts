"use server";

import { revalidatePath } from "next/cache";
import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function markNotificationReadAction(formData: FormData) {
  const user = await requirePageUser();
  const notificationId = String(formData.get("notificationId") ?? "").trim();
  if (!notificationId) return;

  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}