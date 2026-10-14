"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { changePasswordAction } from "@/app/(workspace)/settings/actions";
import type { ChangePasswordActionState } from "@/app/(workspace)/settings/actions";

type PasswordFieldName = "currentPassword" | "newPassword" | "confirmPassword";

const fields: Array<{ name: PasswordFieldName; label: string; autocomplete: string; minimumLength?: number }> = [
  { name: "currentPassword", label: "Current password", autocomplete: "current-password" },
  { name: "newPassword", label: "New password", autocomplete: "new-password", minimumLength: 12 },
  { name: "confirmPassword", label: "Confirm new password", autocomplete: "new-password", minimumLength: 12 },
];

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ChangePasswordActionState, FormData>(changePasswordAction, null);
  const [visibleFields, setVisibleFields] = useState<Partial<Record<PasswordFieldName, boolean>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} aria-busy={pending} className="mt-4 max-w-xl space-y-4">
      {fields.map(({ name, label, autocomplete, minimumLength }) => {
        const visible = visibleFields[name] ?? false;
        return (
          <div key={name}>
            <label htmlFor={name} className="mb-1.5 block text-sm font-semibold">{label}</label>
            <div className="flex h-10 items-center rounded-md border border-[var(--line)] bg-white pr-1">
              <input
                id={name}
                name={name}
                type={visible ? "text" : "password"}
                autoComplete={autocomplete}
                required
                minLength={minimumLength}
                maxLength={name === "currentPassword" ? 256 : 72}
                className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-sm outline-none"
              />
              <button
                type="button"
                aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
                aria-pressed={visible}
                onClick={() => setVisibleFields((previous) => ({ ...previous, [name]: !visible }))}
                className="grid size-8 shrink-0 place-items-center rounded-sm text-[var(--muted)] hover:bg-zinc-100 hover:text-[var(--ink)]"
              >
                {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-[var(--muted)]">Use at least 12 characters and no more than 72 UTF-8 bytes.</p>
      {state && (state.ok
        ? <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>
        : <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{state.error}</p>)}
      <button type="submit" disabled={pending} className="h-10 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--action-hover)] disabled:opacity-60">
        {pending ? "Changing password..." : "Change password"}
      </button>
    </form>
  );
}