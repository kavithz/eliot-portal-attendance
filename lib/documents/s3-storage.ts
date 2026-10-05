import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  DocumentStorageOperationError,
  DocumentStorageUnavailableError,
  StoredDocumentNotFoundError,
  type PrivateDocumentStorage,
} from "@/lib/documents/storage";

type S3Configuration = { bucket: string; region: string };

export class S3PrivateDocumentStorage implements PrivateDocumentStorage {
  constructor(
    private readonly client: Pick<S3Client, "send">,
    private readonly configuration: S3Configuration,
  ) {}

  async put(key: string, content: Uint8Array) {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.configuration.bucket,
        Key: key,
        Body: content,
        ContentLength: content.byteLength,
        ContentType: "application/octet-stream",
        ServerSideEncryption: "AES256",
      }));
    } catch {
      throw new DocumentStorageOperationError();
    }
  }

  async get(key: string) {
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.configuration.bucket,
        Key: key,
      }));
      if (!result.Body) throw new StoredDocumentNotFoundError();
      return result.Body.transformToWebStream();
    } catch (error) {
      if (error instanceof StoredDocumentNotFoundError) throw error;
      if (error && typeof error === "object" && "name" in error && error.name === "NoSuchKey") {
        throw new StoredDocumentNotFoundError();
      }
      throw new DocumentStorageOperationError();
    }
  }

  async delete(key: string) {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.configuration.bucket,
        Key: key,
      }));
    } catch {
      throw new DocumentStorageOperationError();
    }
  }
}

export function createS3DocumentStorage(environment: NodeJS.ProcessEnv = process.env) {
  const bucket = environment.EMPLOYEE_DOCUMENTS_S3_BUCKET?.trim();
  const region = environment.AWS_REGION?.trim();
  if (!bucket || !region) throw new DocumentStorageUnavailableError();

  return new S3PrivateDocumentStorage(new S3Client({ region }), { bucket, region });
}