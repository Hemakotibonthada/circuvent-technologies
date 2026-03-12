"use client";
import { AppShell } from "@/components/app-shell";
export default function HRLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
