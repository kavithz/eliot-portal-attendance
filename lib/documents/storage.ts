import "server-only";

export interface PrivateDocumentStorage {
  put(key: string, content: Uint8Array): Promise<void>;
  get(key: string): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
}

export class DocumentStorageUnavailableError extends Error {
  constructor() {
    super("Private document storage is not configured.");
    this.name = "DocumentStorageUnavailableError";
  }
}

export class StoredDocumentNotFoundError extends Error {
  constructor() {
    super("Stored document is not available.");
    this.name = "StoredDocumentNotFoundError";
  }
}

export class DocumentStorageOperationError extends Error {
  constructor() {
    super("Private document storage operation failed.");
    this.name = "DocumentStorageOperationError";
  }
}

export class MockPrivateDocumentStorage implements PrivateDocumentStorage {
  private readonly objects = new Map<string, Uint8Array>();
  private failingOperation: "put" | "get" | "delete" | null = null;

  failNext(operation: "put" | "get" | "delete") {
    this.failingOperation = operation;
  }

  async put(key: string, content: Uint8Array) {
    this.throwIfFailing("put");
    this.objects.set(key, Uint8Array.from(content));
  }

  async get(key: string) {
    this.throwIfFailing("get");
    const content = this.objects.get(key);
    if (!content) throw new StoredDocumentNotFoundError();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from(content));
        controller.close();
      },
    });
  }

  async delete(key: string) {
    this.throwIfFailing("delete");
    this.objects.delete(key);
  }

  has(key: string) {
    return this.objects.has(key);
  }

  private throwIfFailing(operation: "put" | "get" | "delete") {
    if (this.failingOperation !== operation) return;
    this.failingOperation = null;
    throw new DocumentStorageOperationError();
  }
}