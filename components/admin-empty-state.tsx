import type { LucideIcon } from "lucide-react";

export function AdminEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <section className="flex min-h-64 flex-col items-start justify-center rounded-lg border border-[var(--line)] bg-white px-6 py-8 shadow-sm sm:px-9">
      <span className="grid size-11 place-items-center rounded-md bg-slate-100 text-[var(--blue)]"><Icon size={20} aria-hidden="true" /></span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">{description}</p>
    </section>
  );
}