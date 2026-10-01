let prisma;
const legacyEmail = "admin@example.com";

function planAdminSeed(existingAdmin, legacyAccount, existingAdminAccount) {
  if (existingAdmin) {
    if (existingAdmin.role === "ADMIN" && existingAdmin.isActive) {
      if (legacyAccount?.role === "ADMIN" && legacyAccount.isActive) {
        throw new Error("An active legacy administrator also exists. Resolve it manually; no changes were made.");
      }
      return "unchanged";
    }
    throw new Error("The configured admin email belongs to an inactive or non-admin account. No changes were made.");
  }
  if (legacyAccount) {
    throw new Error("A legacy admin account exists. Resolve it manually before seeding; no changes were made.");
  }
  if (existingAdminAccount) {
    throw new Error("An administrator account already exists. Seed will not create another administrator.");
  }
  return "create";
}

module.exports = { planAdminSeed };

async function main() {
  const [{ PrismaClient }, { default: bcrypt }] = await Promise.all([
    import("@prisma/client"),
    import("bcryptjs"),
  ]);
  prisma = new PrismaClient();
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const countryCode = process.env.ADMIN_COUNTRY_CODE?.trim().toUpperCase();
  const timeZone = process.env.ADMIN_TIME_ZONE?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !countryCode || !timeZone || !password) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_COUNTRY_CODE, ADMIN_TIME_ZONE, and ADMIN_PASSWORD before seeding.");
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error("ADMIN_COUNTRY_CODE must be a two-letter country code.");
  }

  const countryTimeZones = { LK: "Asia/Colombo", BD: "Asia/Dhaka" };
  if (countryTimeZones[countryCode] && countryTimeZones[countryCode] !== timeZone) {
    throw new Error(`${countryCode} employees must use ${countryTimeZones[countryCode]}.`);
  }
  if (timeZone !== "UTC" && !Intl.supportedValuesOf("timeZone").includes(timeZone)) {
    throw new Error("ADMIN_TIME_ZONE must be a supported IANA timezone.");
  }

  if (bcrypt.truncates(password)) {
    throw new Error("ADMIN_PASSWORD must not exceed 72 UTF-8 bytes.");
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email }, select: { role: true, isActive: true } });
  const legacyAccount = email === legacyEmail
    ? null
    : await prisma.user.findUnique({ where: { email: legacyEmail }, select: { id: true, role: true, isActive: true } });
  const existingAdminAccount = existingAdmin
    ? null
    : await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  const action = planAdminSeed(existingAdmin, legacyAccount, existingAdminAccount);

  if (action === "unchanged") {
    console.info("Configured administrator already exists; no changes were made.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { name, email, countryCode, timeZone, passwordHash, role: "ADMIN", isActive: true },
  });
  console.info("Initial administrator account created.");
}

if (require.main === module) {
  main()
    .catch((error) => {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      console.error(`Database seed failed (${errorName}).`);
      process.exitCode = 1;
    })
    .finally(async () => prisma?.$disconnect());
}