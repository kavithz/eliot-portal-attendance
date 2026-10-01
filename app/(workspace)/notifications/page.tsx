import { Bell } from "lucide-react";
import type { Notification as UserNotification } from "@prisma/client";
import { requirePageUser } from "@/lib/auth/session";
import { listUserNotifications } from "@/lib/attendance/qa-fixes";
import { markNotificationReadAction } from "./actions";

export default async function NotificationsPage() {
  const user = await requirePageUser();
  const notifications = (await listUserNotifications(user.id) as UserNotification[])
    .filter((notification) => !notification.type.startsWith("CORRECTION"));
  const formatter = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: user.timeZone,
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--blue)]">Workspace</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Notifications</h1>
      </div>
      <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-sm" aria-label="Notifications">
        {notifications.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <Bell size={22} className="text-[var(--muted)]" aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold">You&apos;re all caught up</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">New workspace updates will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {notifications.map((notification) => (
              <li key={notification.id} className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 ${notification.readAt ? "" : "bg-slate-50/70"}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{notification.title}</h2>
                    {!notification.readAt && <span className="rounded-sm bg-[var(--mint)] px-2 py-0.5 text-[11px] font-medium text-[var(--mint-ink)]">Unread</span>}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{notification.message}</p>
                  <time className="mt-2 block text-xs text-[var(--muted)]" dateTime={notification.createdAt.toISOString()}>{formatter.format(notification.createdAt)}</time>
                </div>
                {!notification.readAt && (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button type="submit" className="h-9 shrink-0 rounded-md border border-[var(--line)] px-3 text-xs font-medium text-[var(--ink)] hover:bg-white">Mark as read</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}