import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
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

  // Seed the default "Standard New Hire" onboarding template if it doesn't
  // exist yet. Idempotent by name — safe to re-run.
  const existing = await prisma.onboardingTemplate.findFirst({
    where: { name: "Standard New Hire" },
  });

  if (!existing) {
    await prisma.onboardingTemplate.create({
      data: {
        name: "Standard New Hire",
        description:
          "Default onboarding checklist for new employees: handbook signing, I-9, W-4, direct deposit.",
        createdById: admin.id,
        tasks: {
          create: [
            {
              order: 0,
              type: "ESIGN_REQUEST",
              title: "Read & sign Employee Handbook",
              description:
                "You'll receive an email from Google eSignature with a link to review and sign the handbook.",
              required: true,
              handbookFileName: "Employee Handbook",
            },
            {
              order: 1,
              type: "EMPLOYEE_CONFIRM",
              title: "Bring ID to in-person I-9 meeting",
              description:
                "Bring an unexpired passport, OR a driver's license plus Social Security card, to your scheduled I-9 meeting.",
              required: true,
            },
            {
              order: 2,
              type: "ADMIN_FILE_UPLOAD",
              title: "Upload I-9 and supporting documents",
              description:
                "After the in-person I-9 meeting, upload the completed I-9 and photos of the employee's ID.",
              required: true,
            },
            {
              order: 3,
              type: "ADMIN_FILE_UPLOAD",
              title: "Complete W-4 with employee",
              description:
                "Fill out the W-4 with the employee in person, then upload the signed form.",
              required: true,
            },
            {
              order: 4,
              type: "ADMIN_TASK",
              title: "Set up direct deposit in ADP",
              description:
                "Log in to ADP Workforce Now and enroll the employee in direct deposit.",
              required: true,
              externalUrl: "https://workforcenow.adp.com",
            },
          ],
        },
      },
    });
    console.log("Seeded onboarding template: Standard New Hire");
  }

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
