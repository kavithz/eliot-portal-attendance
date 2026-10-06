"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Bell, BriefcaseBusiness, CalendarDays, ChartNoAxesColumn, ClipboardList, Clock3, LayoutDashboard, Menu, Settings, Shield, Users, X, type LucideIcon } from "lucide-react";

type NavigationLink = { href: string; label: string; icon: LucideIcon };

const employeeLinks: NavigationLink[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/attendance", label: "Attendance", icon: CalendarDays },
  { href: "/leave", label: "Leave", icon: BriefcaseBusiness },
  { href: "/reports", label: "My reports", icon: ChartNoAxesColumn },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const settingsLink: NavigationLink = { href: "/settings", label: "Settings", icon: Settings };

const employeeLinksWithSettings: NavigationLink[] = [
  ...employeeLinks,
  settingsLink,
];

function getLinks(isAdmin: boolean) {
  return isAdmin ? [
    ...employeeLinks.filter(({ href }) => href !== "/leave"),
    { href: "/admin", label: "Admin", icon: Shield },
    { href: "/admin/employees", label: "Employees", icon: Users },
    { href: "/admin/shifts", label: "Shifts", icon: Clock3 },
    { href: "/admin/leave-types", label: "Leave Types", icon: BriefcaseBusiness },
    { href: "/admin/audit", label: "Audit history", icon: ClipboardList },
    settingsLink,
  ] : employeeLinksWithSettings;
}

function NavigationItems({ links, pathname, onNavigate }: { links: NavigationLink[]; pathname: string; onNavigate?: () => void }) {
  return links.map(({ href, label, icon: Icon }) => {
    const active = href === "/admin" || href === "/admin/employees" || href === "/admin/leave-types" || href === "/admin/shifts" || href === "/leave" ? pathname.startsWith(href) : pathname === href;
    return (
      <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition ${active ? "bg-white/10 text-white" : "text-slate-200/80 hover:bg-white/10 hover:text-white"}`}>
        <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
        {label}
      </Link>
    );
  });
}

export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <p className="px-3 pb-2 text-xs font-semibold text-white/50">Workspace</p>
      <div className="flex flex-col gap-1"><NavigationItems links={getLinks(isAdmin)} pathname={pathname} /></div>
    </nav>
  );
}

export function MobileNav({ isAdmin, user }: { isAdmin: boolean; user: { name: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button type="button" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-sm text-slate-600 hover:bg-slate-100 md:hidden">
        <Menu size={22} aria-hidden="true" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <aside id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Mobile navigation" className="relative flex h-full w-64 max-w-[85vw] flex-col bg-[var(--sidebar)] text-white shadow-xl">
            <div className="flex h-[70px] items-center justify-between border-b border-white/15 px-5">
              <Image src="/eliot-logo.png" alt="ELIoT" width={1200} height={600} className="h-10 w-[92px] object-contain object-left" />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-sm text-white/80 hover:bg-white/10 hover:text-white"><X size={19} aria-hidden="true" /></button>
            </div>
            <nav aria-label="Mobile main navigation" className="flex-1 overflow-y-auto px-4 py-4">
              <p className="px-3 pb-2 text-xs font-semibold text-white/50">Workspace</p>
              <div className="flex flex-col gap-1"><NavigationItems links={getLinks(isAdmin)} pathname={pathname} onNavigate={() => setOpen(false)} /></div>
            </nav>
            <div className="border-t border-white/15 p-4">
              <p className="truncate text-xs font-semibold">{user.name}</p>
              <p className="mt-1 truncate text-[11px] text-white/60">{user.email}</p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}