"use client";
import { AppShell } from "@/components/app-shell";
export default function DevFlowLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
