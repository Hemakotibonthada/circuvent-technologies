const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash("Hemakoti@003", 12);
  const avatarUrl = "https://res.cloudinary.com/djucuoojo/image/upload/v1773292156/5753F092-9FC8-40D3-9365-FCFB8FA2F103_1_201_a_f9ljun.jpg";
  const user = await prisma.user.upsert({
    where: { email: "hema@circuvent.com" },
    update: { passwordHash: hash, role: "ADMIN", status: "ACTIVE", firstName: "Admin", lastName: "Circuvent", avatarUrl },
    create: { email: "hema@circuvent.com", passwordHash: hash, firstName: "Admin", lastName: "Circuvent", role: "ADMIN", status: "ACTIVE", avatarUrl },
  });
  console.log("Admin created:", user.id, user.email, user.role);
  await prisma.$disconnect();
}

main().catch(console.error);
