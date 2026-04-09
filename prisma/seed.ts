import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@company.com" },
    update: {},
    create: {
      email: "admin@company.com",
      passwordHash: adminPassword,
      name: "Admin User",
      role: Role.ADMIN,
    },
  });

  const employeePassword = await bcrypt.hash("employee123", 10);

  await prisma.user.upsert({
    where: { email: "employee@company.com" },
    update: {},
    create: {
      email: "employee@company.com",
      passwordHash: employeePassword,
      name: "Test Employee",
      role: Role.EMPLOYEE,
    },
  });

  console.log("Seed complete: admin@company.com / admin123, employee@company.com / employee123");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
