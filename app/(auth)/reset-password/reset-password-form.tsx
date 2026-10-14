"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { resetPasswordAction } from "./actions";
import type { ResetPasswordActionState } from "./actions";

const fields = [
  { name: "newPassword", label: "New password" },
  { name: "confirmPassword", label: "Confirm new password" },
] as const;

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetPasswordActionState, FormData>(resetPasswordAction, null);
  const [visibleFields, setVisibleFields] = useState<Record<(typeof fields)[number]["name"], boolean>>({
    newPassword: false,
    confirmPassword: false,
  });

  return (
    <form action={formAction} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {fields.map(({ name, label }) => {
        const visible = visibleFields[name];
        return (
          <div key={name}>
            <label htmlFor={name} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
            <div className="flex h-10 items-center rounded-md border border-slate-200 bg-white pr-1">
              <input id={name} name={name} type={visible ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={72} className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-sm text-slate-900 outline-none" />
              <button type="button" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisibleFields((previous) => ({ ...previous, [name]: !visible }))} className="grid size-8 shrink-0 place-items-center rounded-sm text-slate-500 hover:bg-zinc-100 hover:text-slate-900">
                {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-slate-500">Use at least 12 characters and no more than 72 UTF-8 bytes.</p>
      {state?.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60">
        {pending ? "Resetting password..." : "Reset password"}
      </button>
    </form>
  );
}