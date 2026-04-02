// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Database Seed
// Creates initial admin user and sample data
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Circuvent Platform database...\n");

  // ── Create Admin User ──
  const adminPassword = await bcrypt.hash("admin@123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@circuvent.com" },
    update: {},
    create: {
      email: "admin@circuvent.com",
      passwordHash: adminPassword,
      firstName: "System",
      lastName: "Admin",
      role: "ADMIN",
      department: "Management",
    },
  });
  console.log("  ✓ Admin user created:", admin.email);

  // ── Create Engineer User ──
  const engPassword = await bcrypt.hash("engineer@123", 12);
  const engineer = await prisma.user.upsert({
    where: { email: "engineer@circuvent.com" },
    update: {},
    create: {
      email: "engineer@circuvent.com",
      passwordHash: engPassword,
      firstName: "Dev",
      lastName: "Engineer",
      role: "ENGINEER",
      department: "Engineering",
    },
  });
  console.log("  ✓ Engineer user created:", engineer.email);

  // ── Create Client User ──
  const clientPassword = await bcrypt.hash("client@123", 12);
  const clientUser = await prisma.user.upsert({
    where: { email: "client@example.com" },
    update: {},
    create: {
      email: "client@example.com",
      passwordHash: clientPassword,
      firstName: "Test",
      lastName: "Client",
      role: "CLIENT",
    },
  });
  console.log("  ✓ Client user created:", clientUser.email);

  // ── Create Sample Project ──
  const project = await prisma.project.upsert({
    where: { code: "PROJ-001" },
    update: {},
    create: {
      name: "Smart IoT Gateway",
      code: "PROJ-001",
      description: "AI-powered IoT gateway for industrial automation",
      type: "HYBRID",
      status: "ACTIVE",
      isRnD: true,
      rnDCategory: "IOT_FIRMWARE",
      startDate: new Date("2026-01-15"),
      budget: 500000,
      budgetCurrency: "INR",
    },
  });
  console.log("  ✓ Sample project created:", project.name);

  // ── Create Employee Record ──
  const employee = await prisma.employee.upsert({
    where: { userId: engineer.id },
    update: {},
    create: {
      userId: engineer.id,
      employeeCode: "CIR-EMP-001",
      employmentType: "FULL_TIME",
      designation: "Senior Software Engineer",
      department: "Engineering",
      dateOfJoining: new Date("2025-06-01"),
      baseSalary: 1200000, // 12 LPA
      currency: "INR",
      payFrequency: "MONTHLY",
    },
  });
  console.log("  ✓ Employee record created:", employee.employeeCode);

  // ── Create Client Profile ──
  const clientProfile = await prisma.clientProfile.upsert({
    where: { userId: clientUser.id },
    update: {},
    create: {
      userId: clientUser.id,
      companyName: "TechVista Solutions",
      industry: "Information Technology",
      country: "India",
      preferredCurrency: "INR",
      taxId: "27ABCDE1234F1Z5",
    },
  });
  console.log("  ✓ Client profile created:", clientProfile.companyName);

  console.log("\n✅ Database seeded successfully!");
  console.log("\n📋 Login Credentials:");
  console.log("   Admin:    admin@circuvent.com / admin@123");
  console.log("   Engineer: engineer@circuvent.com / engineer@123");
  console.log("   Client:   client@example.com / client@123");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
