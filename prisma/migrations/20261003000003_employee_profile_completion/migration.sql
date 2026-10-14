ALTER TABLE "Employee"
ADD COLUMN "profileOnboardingRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EmployeeProfile" (
    "employeeRecordId" TEXT NOT NULL,
    "permanentAddress" TEXT,
    "currentAddress" TEXT,
    "emergencyContactName" VARCHAR(120),
    "emergencyContactId" VARCHAR(120),
    "emergencyContactAddress" TEXT,
    "emergencyContactPhone" VARCHAR(64),
    "emergencyContactRelationship" VARCHAR(100),
    "contactNumber" VARCHAR(64),
    "email" VARCHAR(254),
    "linkedInId" VARCHAR(512),
    "dateOfBirth" DATE,
    "maritalStatus" VARCHAR(50),
    "spouseName" VARCHAR(120),
    "spouseId" VARCHAR(120),
    "motherName" VARCHAR(120),
    "motherId" VARCHAR(120),
    "motherContactNumber" VARCHAR(64),
    "fatherName" VARCHAR(120),
    "fatherId" VARCHAR(120),
    "fatherContactNumber" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("employeeRecordId"),
    CONSTRAINT "EmployeeProfile_employeeRecordId_fkey" FOREIGN KEY ("employeeRecordId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);