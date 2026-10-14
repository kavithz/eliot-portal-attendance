"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "./actions";
import type { ForgotPasswordActionState } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordActionState, FormData>(forgotPasswordAction, null);

  return (
    <form action={formAction} aria-busy={pending} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900" />
      </div>
      {state && ("message" in state
        ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>
        : <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>)}
      <button type="submit" disabled={pending} className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60">
        {pending ? "Sending instructions..." : "Send reset instructions"}
      </button>
    </form>
  );
}