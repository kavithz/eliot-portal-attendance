CREATE TYPE "EmployeeDocumentType" AS ENUM (
  'APPOINTMENT_LETTER',
  'EMPLOYMENT_AGREEMENT',
  'NIC_COPY',
  'PASSPORT',
  'CERTIFICATE',
  'CONTRACT',
  'INTERNSHIP_AGREEMENT',
  'OTHER'
);

CREATE TABLE "EmployeeDocument" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "type" "EmployeeDocumentType" NOT NULL,
  "originalFilename" VARCHAR(255) NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" VARCHAR(255) NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATE,
  "uploadedById" TEXT,
  CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmployeeDocument_storageKey_key" ON "EmployeeDocument"("storageKey");
CREATE INDEX "EmployeeDocument_employeeId_uploadedAt_idx" ON "EmployeeDocument"("employeeId", "uploadedAt");
CREATE INDEX "EmployeeDocument_expiresAt_idx" ON "EmployeeDocument"("expiresAt");