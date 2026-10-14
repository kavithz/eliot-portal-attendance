import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getEmployeeDocumentDownload, DocumentAuthorizationError, EmployeeDocumentNotFoundError, EmployeeDocumentOperationError } from "@/lib/documents/service";
import { createS3DocumentStorage } from "@/lib/documents/s3-storage";
import { DocumentStorageUnavailableError } from "@/lib/documents/storage";
import { requireDocumentApiAdmin } from "@/lib/documents/api-authorization";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const authorization = await requireDocumentApiAdmin(requireAdmin);
  if (!authorization.ok) return NextResponse.json({ error: authorization.message }, { status: authorization.status });
  const { actor } = authorization;

  const { documentId } = await params;
  try {
    const download = await getEmployeeDocumentDownload(actor, documentId, createS3DocumentStorage());
    const safeFilename = encodeURIComponent(download.filename).replaceAll("'", "%27").replaceAll("(", "%28").replaceAll(")", "%29");
    return new Response(download.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${safeFilename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Last-Modified": download.lastModified.toUTCString(),
      },
    });
  } catch (error) {
    if (error instanceof DocumentAuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof EmployeeDocumentNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof DocumentStorageUnavailableError || error instanceof EmployeeDocumentOperationError) {
      return NextResponse.json({ error: "Private document storage is unavailable." }, { status: 503 });
    }
    return NextResponse.json({ error: "The document could not be downloaded." }, { status: 500 });
  }
}