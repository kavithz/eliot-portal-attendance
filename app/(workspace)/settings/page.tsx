import { requirePageUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function EmployeeSettingsPage() {
  const user = await requirePageUser();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--blue)]">Preferences</p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-[28px]">Settings</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Profile</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Account details and attendance timezone are managed by an administrator.</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Name</dt><dd className="font-medium">{user.name}</dd></div>
            <div><dt className="text-[var(--muted)]">Email</dt><dd className="font-medium">{user.email}</dd></div>
            <div><dt className="text-[var(--muted)]">Timezone</dt><dd className="font-medium">{user.timeZone}</dd></div>
            <div><dt className="text-[var(--muted)]">Country</dt><dd className="font-medium">{user.countryCode}</dd></div>
          </dl>
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Company attendance schedule</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">The schedule is the same for Office and WFH. Early arrival is allowed and is not overtime.</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Attendance start</dt><dd className="font-medium">08:30</dd></div>
            <div><dt className="text-[var(--muted)]">Attendance end</dt><dd className="font-medium">17:30</dd></div>
            <div><dt className="text-[var(--muted)]">Timezone</dt><dd className="font-medium">Your assigned timezone ({user.timeZone})</dd></div>
          </dl>
        </section>
      </div>

      <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Change password</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Changing your password signs out your other active sessions.</p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
