import type { Role } from "@prisma/client";

type DocumentApiActor = { id: string; role: Role };
type AdminRequirement = () => Promise<DocumentApiActor>;

export async function requireDocumentApiAdmin(requireAdminUser: AdminRequirement) {
  try {
    return { ok: true as const, actor: await requireAdminUser() };
  } catch (error) {
    const unauthenticated = error instanceof Error && error.name === "AuthenticationError";
    return {
      ok: false as const,
      status: unauthenticated ? 401 as const : 403 as const,
      message: unauthenticated ? "Sign in to access employee documents." : "You do not have permission to access employee documents.",
    };
  }
}
