"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { EmployeeDocumentType } from "@prisma/client";
import { Download, FileText, RefreshCw, Upload } from "lucide-react";

const documentTypes: readonly EmployeeDocumentType[] = [
  "APPOINTMENT_LETTER",
  "EMPLOYMENT_AGREEMENT",
  "NIC_COPY",
  "PASSPORT",
  "CERTIFICATE",
  "CONTRACT",
  "INTERNSHIP_AGREEMENT",
  "OTHER",
];

type EmployeeDocument = {
  id: string;
  type: EmployeeDocumentType;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
  expiresAt: string | null;
  uploadedBy: { name: string } | null;
};

type LoadState = "loading" | "ready" | "error";

function isDocumentType(value: unknown): value is EmployeeDocumentType {
  return typeof value === "string" && documentTypes.some((type) => type === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEmployeeDocument(value: unknown): value is EmployeeDocument {
  if (!isRecord(value)) return false;
  const uploader = value.uploadedBy;
  return typeof value.id === "string"
    && isDocumentType(value.type)
    && typeof value.originalFilename === "string"
    && typeof value.sizeBytes === "number"
    && Number.isFinite(value.sizeBytes)
    && typeof value.uploadedAt === "string"
    && (typeof value.expiresAt === "string" || value.expiresAt === null)
    && (uploader === null || (isRecord(uploader) && typeof uploader.name === "string"));
}

function errorMessage(payload: unknown, fallback: string) {
  return isRecord(payload) && typeof payload.error === "string" ? payload.error : fallback;
}

function documentTypeLabel(type: EmployeeDocumentType) {
  return type.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [uploadAvailable, setUploadAvailable] = useState<boolean | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoadState("loading");
    setLoadError("");
    try {
      const query = new URLSearchParams({ employeeId });
      const response = await fetch(`/api/employee-documents?${query}`, { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Documents could not be loaded."));
      if (
        !isRecord(payload)
        || !Array.isArray(payload.documents)
        || !payload.documents.every(isEmployeeDocument)
        || typeof payload.uploadAvailable !== "boolean"
      ) {
        throw new Error("The document service returned an invalid response.");
      }
      setDocuments(payload.documents);
      setUploadAvailable(payload.uploadAvailable);
      setLoadState("ready");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Documents could not be loaded.");
      setLoadState("error");
    }
  }, [employeeId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setUploadError("");
    setUploadSuccess("");
    try {
      const form = event.currentTarget;
      const response = await fetch("/api/employee-documents", {
        method: "POST",
        body: new FormData(form),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "The document could not be uploaded."));
      if (!isRecord(payload) || !isRecord(payload.document) || typeof payload.document.id !== "string") {
        throw new Error("The document service returned an invalid upload response.");
      }
      form.reset();
      setUploadSuccess("Document uploaded successfully.");
      await loadDocuments();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The document could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-50 text-[var(--blue)]"><Upload size={18} aria-hidden="true" /></span>
          <div>
            <h2 className="text-base font-semibold">Upload a document</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Files are checked against the configured size and file-type policy before being stored privately.</p>
          </div>
        </div>

        {uploadAvailable === false && (
          <p role="status" className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Document uploads are unavailable. Private storage and the approved upload policy have not been configured.
          </p>
        )}
        {uploadAvailable === true && (
          <form onSubmit={uploadDocument} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="employeeId" value={employeeId} />
            <label className="text-sm font-medium">
              Document type
              <select name="type" required defaultValue="" className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal">
                <option value="" disabled>Select a type</option>
                {documentTypes.map((type) => <option key={type} value={type}>{documentTypeLabel(type)}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Expiry date <span className="font-normal text-[var(--muted)]">(optional)</span>
              <input name="expiresAt" type="date" className="mt-1.5 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-normal" />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              File
              <input name="file" type="file" required className="mt-1.5 block min-h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium" />
            </label>
            {uploadError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{uploadError}</p>}
            {uploadSuccess && <p role="status" className="text-sm text-green-700 sm:col-span-2">{uploadSuccess}</p>}
            <div className="sm:col-span-2">
              <button type="submit" disabled={uploading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--action)] px-4 text-sm font-semibold text-white hover:bg-[var(--action-hover)] disabled:cursor-not-allowed disabled:opacity-60">
                <Upload size={16} aria-hidden="true" /> {uploading ? "Uploading…" : "Upload document"}
              </button>
            </div>
          </form>
        )}
        {uploadAvailable === null && loadState === "loading" && <p className="mt-5 text-sm text-[var(--muted)]">Checking private document storage…</p>}
      </section>

      <section className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-base font-semibold">Employee documents</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Private files are available only to authorized users.</p>
          </div>
          <button type="button" onClick={() => void loadDocuments()} disabled={loadState === "loading"} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] px-3 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60">
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
        </div>

        {loadState === "loading" && <p role="status" className="px-5 py-8 text-center text-sm text-[var(--muted)]">Loading documents…</p>}
        {loadState === "error" && (
          <div className="px-5 py-8 text-center">
            <p role="alert" className="text-sm text-red-700">{loadError}</p>
            <button type="button" onClick={() => void loadDocuments()} className="mt-3 text-sm font-semibold text-[var(--blue)] hover:underline">Try again</button>
          </div>
        )}
        {loadState === "ready" && documents.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
            <FileText size={22} className="text-[var(--muted)]" aria-hidden="true" />
            <h3 className="mt-3 text-sm font-semibold">No documents yet</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">Uploaded employee documents will appear here.</p>
          </div>
        )}
        {loadState === "ready" && documents.length > 0 && (
          <ul className="divide-y divide-[var(--line)]">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{document.originalFilename}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {documentTypeLabel(document.type)} · {formatBytes(document.sizeBytes)} · Uploaded {new Date(document.uploadedAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Expires {document.expiresAt ? document.expiresAt.slice(0, 10) : "Not set"} · Uploaded by {document.uploadedBy?.name ?? "Former user"}
                  </p>
                </div>
                <a href={`/api/employee-documents/${encodeURIComponent(document.id)}`} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-md border border-[var(--line)] px-3 text-sm font-medium hover:bg-zinc-50 sm:self-center">
                  <Download size={15} aria-hidden="true" /> Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
