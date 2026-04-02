// ──────────────────────────────────────────────────────────────
// Employee Portal — Seed Data
// Populates announcements, holidays, training programs
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function seedPortal() {
  console.log("🌱 Seeding Employee Portal data...");

  // ── Announcements ──
  const announcements = [
    { title: "Q2 2026 Company All-Hands Meeting", content: "Join us for the quarterly all-hands meeting on April 5th at 3 PM IST. We'll discuss company goals, new projects, and celebrate team achievements. Teams link will be shared via email.", category: "GENERAL", priority: "HIGH" as const, isPinned: true, authorId: "system" },
    { title: "New Leave Policy Effective April 1st", content: "Starting April 1st, all full-time employees will receive 2 additional casual leaves per year. Please review the updated policy document in the HR portal.", category: "HR", priority: "NORMAL" as const, authorId: "system" },
    { title: "Office Deep Cleaning — March 15th", content: "The office will undergo deep cleaning on Saturday, March 15th. Please ensure all personal items are secured. Access will be restricted from 8 AM to 6 PM.", category: "IT", priority: "NORMAL" as const, authorId: "system" },
    { title: "Security Awareness Training Due", content: "All employees must complete the annual security awareness training by March 31st. This is mandatory for compliance. Access the course through the Training portal.", category: "IT", priority: "URGENT" as const, isPinned: true, authorId: "system" },
    { title: "Team Outing — March 28th", content: "We're organizing a team outing to Wonderla on March 28th! Register by March 20th. Transportation and lunch provided. Bring your families!", category: "EVENT", priority: "NORMAL" as const, authorId: "system" },
  ];
  for (const a of announcements) {
    await prisma.announcement.create({ data: a });
  }
  console.log("  ✓ 5 announcements created");

  // ── Holidays 2026 ──
  const holidays = [
    { name: "Republic Day", date: new Date("2026-01-26"), type: "NATIONAL" as const, region: "ALL" },
    { name: "Maha Shivaratri", date: new Date("2026-02-15"), type: "REGIONAL" as const, region: "ALL" },
    { name: "Holi", date: new Date("2026-03-06"), type: "NATIONAL" as const, region: "ALL" },
    { name: "Ugadi", date: new Date("2026-03-22"), type: "REGIONAL" as const, region: "KA" },
    { name: "Good Friday", date: new Date("2026-04-03"), type: "NATIONAL" as const, region: "ALL" },
    { name: "Eid ul-Fitr", date: new Date("2026-04-21"), type: "NATIONAL" as const, region: "ALL" },
    { name: "May Day", date: new Date("2026-05-01"), type: "NATIONAL" as const, region: "ALL" },
    { name: "Independence Day", date: new Date("2026-08-15"), type: "NATIONAL" as const, region: "ALL" },
    { name: "Ganesh Chaturthi", date: new Date("2026-08-27"), type: "REGIONAL" as const, region: "KA" },
    { name: "Mahatma Gandhi Jayanti", date: new Date("2026-10-02"), type: "NATIONAL" as const, region: "ALL" },
    { name: "Dussehra", date: new Date("2026-10-19"), type: "NATIONAL" as const, region: "ALL" },
    { name: "Diwali", date: new Date("2026-11-08"), type: "NATIONAL" as const, region: "ALL" },
    { name: "Kannada Rajyotsava", date: new Date("2026-11-01"), type: "REGIONAL" as const, region: "KA" },
    { name: "Christmas", date: new Date("2026-12-25"), type: "NATIONAL" as const, region: "ALL" },
    { name: "Company Foundation Day", date: new Date("2026-06-15"), type: "COMPANY" as const, region: "ALL", description: "Circuvent Technologies 3rd anniversary celebration" },
  ];
  for (const h of holidays) {
    await prisma.holiday.create({ data: h });
  }
  console.log("  ✓ 15 holidays created");

  // ── Training Programs ──
  const trainings = [
    { title: "Advanced TypeScript & Node.js", description: "Deep dive into TypeScript generics, decorators, and Node.js performance optimization for building enterprise microservices.", category: "TECHNICAL", instructor: "Dr. Ravi Kumar", duration: "16 hours", mode: "ONLINE", maxSeats: 30, status: "UPCOMING" as const, startDate: new Date("2026-04-01"), endDate: new Date("2026-04-15"), certificate: true },
    { title: "AWS Solutions Architect Prep", description: "Comprehensive preparation for AWS Solutions Architect Associate certification covering EC2, S3, VPC, Lambda, and more.", category: "TECHNICAL", instructor: "CloudGuru Academy", duration: "40 hours", mode: "ONLINE", maxSeats: 20, status: "UPCOMING" as const, startDate: new Date("2026-04-10"), endDate: new Date("2026-05-10"), certificate: true },
    { title: "Effective Communication Workshop", description: "Improve your professional communication skills — email writing, presentations, and stakeholder management.", category: "SOFT_SKILLS", instructor: "Priya Sharma", duration: "8 hours", mode: "CLASSROOM", maxSeats: 15, status: "UPCOMING" as const, startDate: new Date("2026-03-25"), location: "Conference Room A" },
    { title: "Information Security Awareness", description: "Annual mandatory training on cybersecurity best practices, phishing prevention, and data protection compliance.", category: "COMPLIANCE", duration: "2 hours", mode: "ONLINE", status: "ONGOING" as const, startDate: new Date("2026-03-01"), endDate: new Date("2026-03-31"), mandatory: true, certificate: true },
    { title: "Leadership Essentials", description: "For aspiring team leads — learn delegation, conflict resolution, 1-on-1s, and performance management.", category: "LEADERSHIP", instructor: "HR Team", duration: "12 hours", mode: "HYBRID", maxSeats: 10, status: "UPCOMING" as const, startDate: new Date("2026-05-01"), endDate: new Date("2026-05-15") },
    { title: "IoT & Embedded Systems Fundamentals", description: "Introduction to IoT protocols, MQTT, ESP32 programming, and sensor integration.", category: "TECHNICAL", instructor: "Engineering Lead", duration: "20 hours", mode: "CLASSROOM", maxSeats: 12, status: "UPCOMING" as const, startDate: new Date("2026-04-20"), endDate: new Date("2026-05-20"), location: "Lab 2" },
  ];
  for (const t of trainings) {
    await prisma.trainingProgram.create({ data: t });
  }
  console.log("  ✓ 6 training programs created");

  console.log("✅ Employee Portal seed complete!");
}

seedPortal()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
