import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDocumentUploadPolicy, safeOriginalFilename, validateDocumentUpload, DocumentUploadConfigurationError, DocumentUploadValidationError } from "./validation";

const policy = { maxBytes: 8192, allowedExtensions: new Set(["pdf", "png", "docx"]) };

function file(name: string, bytes: Uint8Array) {
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
}

describe("employee document upload validation", () => {
  it("requires deployment-provided type and size policy without inventing defaults", () => {
    assert.throws(() => getDocumentUploadPolicy({}), DocumentUploadConfigurationError);
    assert.throws(() => getDocumentUploadPolicy({ EMPLOYEE_DOCUMENT_MAX_BYTES: "0", EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS: "pdf" }), DocumentUploadConfigurationError);
    assert.deepEqual(getDocumentUploadPolicy({ EMPLOYEE_DOCUMENT_MAX_BYTES: "4096", EMPLOYEE_DOCUMENT_ALLOWED_EXTENSIONS: ".pdf, png" }), {
      maxBytes: 4096,
      allowedExtensions: new Set(["pdf", "png"]),
    });
  });

  it("validates file contents against the extension and returns detected content type", async () => {
    const pdf = Buffer.from(`%PDF-1.7\n${"synthetic test document ".repeat(256)}`);
    const validated = await validateDocumentUpload(file("sample.pdf", pdf), policy);
    assert.equal(validated.filename, "sample.pdf");
    assert.equal(validated.contentType, "application/pdf");
    assert.equal(validated.sizeBytes, pdf.byteLength);
    assert.deepEqual(Buffer.from(validated.content), pdf);
  });

  it("rejects unsupported, mismatched, empty, and oversized files", async () => {
    const pdf = Buffer.from(`%PDF-1.7\n${"synthetic test document ".repeat(256)}`);
    await assert.rejects(validateDocumentUpload(file("sample.exe", pdf), policy), DocumentUploadValidationError);
    await assert.rejects(validateDocumentUpload(file("sample.png", pdf), policy), DocumentUploadValidationError);
    await assert.rejects(validateDocumentUpload(file("empty.pdf", new Uint8Array()), policy), DocumentUploadValidationError);
    await assert.rejects(validateDocumentUpload(file("large.pdf", new Uint8Array(8193)), policy), DocumentUploadValidationError);
  });

  it("rejects unsafe names and invalid DOCX packages", async () => {
    for (const unsafeName of ["../secret.pdf", "folder\\secret.pdf", "bad\u0000name.pdf", ".."]){
      assert.throws(() => safeOriginalFilename(unsafeName), DocumentUploadValidationError);
    }
    await assert.rejects(validateDocumentUpload(file("not-a-docx.docx", Buffer.from("not a zip")), policy), DocumentUploadValidationError);
  });
});
