import "server-only";

import { Readable } from "node:stream";
import busboy from "busboy";
import type { DocumentUploadFile, DocumentUploadPolicy } from "@/lib/documents/validation";
import { DocumentUploadValidationError } from "@/lib/documents/validation";

export type EmployeeDocumentMultipart = {
  employeeId?: string;
  type: string;
  expiresAt: string | null;
  file: DocumentUploadFile;
};

const allowedFields = new Set(["employeeId", "type", "expiresAt"]);

export async function parseEmployeeDocumentMultipart(
  request: Request,
  policy: DocumentUploadPolicy,
): Promise<EmployeeDocumentMultipart> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    throw new DocumentUploadValidationError("Submit a multipart document upload.");
  }
  if (!request.body) throw new DocumentUploadValidationError("The document upload is empty.");

  return new Promise((resolve, reject) => {
    let failure: Error | undefined;
    let fileFieldSeen = false;
    let fileValue: DocumentUploadFile | undefined;
    const fields = new Map<string, string>();
    const parser = busboy({
      headers: { "content-type": contentType },
      preservePath: false,
      limits: { fileSize: policy.maxBytes, files: 1, fields: 3, parts: 4, fieldNameSize: 64, fieldSize: 512 },
    });

    const rejectRequest = (message: string) => {
      failure ??= new DocumentUploadValidationError(message);
    };

    parser.on("field", (name, value, info) => {
      if (info.nameTruncated || info.valueTruncated || !allowedFields.has(name) || fields.has(name)) {
        rejectRequest("The document upload contains invalid fields.");
        return;
      }
      fields.set(name, value);
    });

    parser.on("file", (fieldName, stream, info) => {
      if (fieldName !== "file" || fileFieldSeen) {
        rejectRequest("Submit exactly one document file.");
        stream.resume();
        return;
      }
      fileFieldSeen = true;
      const chunks: Buffer[] = [];
      let byteLength = 0;
      stream.on("data", (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        byteLength += data.byteLength;
        if (byteLength <= policy.maxBytes) chunks.push(data);
      });
      stream.on("limit", () => rejectRequest("The selected file exceeds the configured maximum size."));
      stream.on("error", () => rejectRequest("The selected file could not be read."));
      stream.on("end", () => {
        if (stream.truncated) {
          rejectRequest("The selected file exceeds the configured maximum size.");
          return;
        }
        const content = Buffer.concat(chunks, byteLength);
        fileValue = {
          name: info.filename,
          size: byteLength,
          arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer,
        };
      });
    });

    parser.on("filesLimit", () => rejectRequest("Submit exactly one document file."));
    parser.on("fieldsLimit", () => rejectRequest("The document upload contains too many fields."));
    parser.on("partsLimit", () => rejectRequest("The document upload contains too many parts."));
    parser.on("error", () => rejectRequest("The document upload could not be read."));
    parser.on("close", () => {
      if (failure) return reject(failure);
      if (!fileValue || !fileFieldSeen || !fields.has("type")) {
        return reject(new DocumentUploadValidationError("Choose a document type and file."));
      }
      resolve({
        employeeId: fields.get("employeeId"),
        type: fields.get("type")!,
        expiresAt: fields.get("expiresAt") || null,
        file: fileValue,
      });
    });

    try {
      Readable.fromWeb(request.body as import("node:stream/web").ReadableStream).pipe(parser);
    } catch {
      reject(new DocumentUploadValidationError("The document upload could not be read."));
    }
  });
}