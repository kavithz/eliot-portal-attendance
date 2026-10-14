import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  DocumentAuthorizationError,
  EmployeeDocumentNotFoundError,
  EmployeeDocumentOperationError,
  listEmployeeDocuments,
  uploadEmployeeDocument,
} from "@/lib/documents/service";
import { parseEmployeeDocumentMultipart } from "@/lib/documents/multipart";
import { createS3DocumentStorage } from "@/lib/documents/s3-storage";
import { DocumentStorageUnavailableError } from "@/lib/documents/storage";
import { DocumentUploadConfigurationError, DocumentUploadValidationError, getDocumentUploadPolicy } from "@/lib/documents/validation";
import { requireDocumentApiAdmin } from "@/lib/documents/api-authorization";

function uploadSetupReady() {
  try {
    getDocumentUploadPolicy();
    createS3DocumentStorage();
    return true;
  } catch (error) {
    if (error instanceof DocumentUploadConfigurationError || error instanceof DocumentStorageUnavailableError) return false;
    throw error;
  }
}

export async function GET(request: Request) {
  const authorization = await requireDocumentApiAdmin(requireAdmin);
  if (!authorization.ok) return NextResponse.json({ error: authorization.message }, { status: authorization.status });
  const { actor } = authorization;

  try {
    const requestedEmployeeId = new URL(request.url).searchParams.get("employeeId") ?? undefined;
    const documents = await listEmployeeDocuments(actor, requestedEmployeeId);
    return NextResponse.json({ documents, uploadAvailable: uploadSetupReady() }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof DocumentAuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof EmployeeDocumentNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: "Employee documents could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await requireDocumentApiAdmin(requireAdmin);
  if (!authorization.ok) return NextResponse.json({ error: authorization.message }, { status: authorization.status });
  const { actor } = authorization;

  let policy;
  let storage;
  try {
    policy = getDocumentUploadPolicy();
    storage = createS3DocumentStorage();
  } catch (error) {
    if (error instanceof DocumentUploadConfigurationError || error instanceof DocumentStorageUnavailableError) {
      return NextResponse.json({ error: "Document uploads are unavailable until private storage and approved upload policies are configured." }, { status: 503 });
    }
    return NextResponse.json({ error: "Document uploads are unavailable." }, { status: 503 });
  }

  try {
    const multipart = await parseEmployeeDocumentMultipart(request, policy);
    const document = await uploadEmployeeDocument(actor, multipart, policy, storage);
    return NextResponse.json({ document }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DocumentUploadValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof DocumentAuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof EmployeeDocumentNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof DocumentUploadConfigurationError || error instanceof DocumentStorageUnavailableError) {
      return NextResponse.json({ error: "Document uploads are unavailable until private storage and approved upload policies are configured." }, { status: 503 });
    }
    if (error instanceof EmployeeDocumentOperationError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "The document could not be uploaded." }, { status: 500 });
  }
}