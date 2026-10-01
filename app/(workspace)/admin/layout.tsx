import { requirePageAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePageAdmin();
  return children;
}