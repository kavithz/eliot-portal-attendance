import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import { requireDocumentApiAdmin } from "./api-authorization";

describe("employee document API authorization", () => {
  it("rejects unauthenticated requests", async () => {
    const result = await requireDocumentApiAdmin(async () => {
      throw Object.assign(new Error("not signed in"), { name: "AuthenticationError" });
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });

  it("rejects authenticated employee-role requests", async () => {
    const result = await requireDocumentApiAdmin(async () => {
      throw Object.assign(new Error("employee role"), { name: "AuthorizationError" });
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 403);
  });

  it("allows authenticated admins", async () => {
    const admin = { id: "admin-user", role: Role.ADMIN };
    const result = await requireDocumentApiAdmin(async () => admin);

    assert.deepEqual(result, { ok: true, actor: admin });
  });

  it("rejects employee-role users before the download endpoint can fetch a document", async () => {
    let downloadAttempted = false;
    const authorization = await requireDocumentApiAdmin(async () => {
      throw Object.assign(new Error("employee role"), { name: "AuthorizationError" });
    });
    if (authorization.ok) downloadAttempted = true;

    assert.equal(authorization.ok, false);
    assert.equal(downloadAttempted, false);
    if (!authorization.ok) assert.equal(authorization.status, 403);
  });
});
