import "server-only";

import { extname } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import * as yauzl from "yauzl";
import { z } from "zod";
import { EmployeeDocumentType } from "@prisma/client";

export const employeeDocumentMetadataSchema = z.object({
  employeeId: z.preprocess((value) => value === undefined || value === "" ? undefined : value, z.string().trim().min(1).optional()),
  type: z.nativeEnum(EmployeeDocumentType),
  expiresAt: z.preprocess(
    (value) => value === "" || value === undefined || value === null ? null : value,
    z.union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
      }, "Enter a valid expiry date."),
      z.null(),
    ]),
  ).transform((value) => value === null ? null : new Date(`${value}T00:00:00.000Z`)),
});

export type DocumentUploadPolicy = { maxBytes: number; allowedExtensions: ReadonlySet<string> };
export type DocumentUploadFile = { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
export type ValidatedDocumentUpload = { filename: string; contentType: string; sizeBytes: number; content: Uint8Array };
type DocumentUploadEnvironment = Record<string, string | undefined>;

export class DocumentUploadConfigurationError extends Error {
  constructor() {
    super("Document uploads are not configured. An approved file-size limit and file-type allowlist are required.");
    this.name = "DocumentUploadConfigurationError";
  }
}

export class DocumentUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentUploadValidationError";
  }
}

export function getDocumentUploadPolicy(environment: DocumentUploadEnvironment = process.env): DocumentUploadPolicy {
  const maxBytes = Number(environment.EMPLOYEE_DOCUMENT_MAX_BYTES);
  const allowedExtensions = (environment.EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS ?? "")
    .split(",")
    .map((extension) => extension.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);

  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || allowedExtensions.length === 0) {
    throw new DocumentUploadConfigurationError();
  }

  return { maxBytes, allowedExtensions: new Set(allowedExtensions) };
}

export function safeOriginalFilename(filename: string) {
  const normalized = filename.normalize("NFC").trim();
  if (
    !normalized
    || normalized === "."
    || normalized === ".."
    || normalized.includes("/")
    || normalized.includes("\\")
    || normalized.includes(":")
    || /[\u0000-\u001f\u007f]/.test(normalized)
    || Array.from(normalized).length > 255
  ) {
    throw new DocumentUploadValidationError("Choose a safe document filename.");
  }
  return normalized;
}

export async function validateDocumentUpload(
  file: DocumentUploadFile,
  policy: DocumentUploadPolicy,
): Promise<ValidatedDocumentUpload> {
  const filename = safeOriginalFilename(file.name);
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new DocumentUploadValidationError("The selected file is empty or invalid.");
  }
  if (file.size > policy.maxBytes) {
    throw new DocumentUploadValidationError("The selected file exceeds the configured maximum size.");
  }

  const content = new Uint8Array(await file.arrayBuffer());
  if (content.byteLength !== file.size) throw new DocumentUploadValidationError("The selected file could not be validated.");

  const extension = extname(filename).slice(1).toLowerCase();
  if (!extension || !policy.allowedExtensions.has(extension)) {
    throw new DocumentUploadValidationError("This document file type is not allowed.");
  }

  const detected = await fileTypeFromBuffer(content);
  if (extension === "docx") {
    if (!detected || detected.mime !== "application/zip" || !(await hasDocxPackageEntries(content))) {
      throw new DocumentUploadValidationError("The file contents do not match a valid DOCX document.");
    }
    return {
      filename,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: content.byteLength,
      content,
    };
  }

  if (!detected || detected.ext.toLowerCase() !== extension) {
    throw new DocumentUploadValidationError("The file contents do not match the filename extension.");
  }

  return { filename, contentType: detected.mime, sizeBytes: content.byteLength, content };
}

function hasDocxPackageEntries(content: Uint8Array) {
  return new Promise<boolean>((resolve) => {
    yauzl.fromBuffer(Buffer.from(content), { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) return resolve(false);
      const entries = new Set<string>();
      let unsafePath = false;
      zipFile.on("error", () => resolve(false));
      zipFile.on("entry", (entry) => {
        const name = entry.fileName.replaceAll("\\", "/");
        if (name.startsWith("/") || name.split("/").includes("..")) unsafePath = true;
        entries.add(name);
        zipFile.readEntry();
      });
      zipFile.on("end", () => resolve(!unsafePath && entries.has("[Content_Types].xml") && entries.has("word/document.xml")));
      zipFile.readEntry();
    });
  });
}