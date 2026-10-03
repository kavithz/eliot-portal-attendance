CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "employeeId" TEXT,
    "nic" TEXT,
    "epfId" TEXT,
    "etfId" TEXT,
    "userId" TEXT,
    "profileCompletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "Employee" ("id", "name", "employeeId", "userId", "createdAt", "updatedAt")
SELECT 'employee_' || "id", "name", "employeeCode", "id", "createdAt", "updatedAt"
FROM "User";

CREATE UNIQUE INDEX "Employee_employeeId_key" ON "Employee"("employeeId");
CREATE UNIQUE INDEX "Employee_nic_key" ON "Employee"("nic");
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");