import type { Metadata } from "next";
import { baseMetadata } from "@/lib/attendance-seo";

/**
 * Metadata for attendance.circuvent.com.
 *
 * Defined in src/lib/attendance-seo.ts alongside the Open Graph card, the same
 * way ATS, HRMS, Career and Paystub each keep theirs, so the title, the
 * description and the artwork cannot drift apart.
 *
 * It lives in a layout rather than in page.tsx because that page is a client
 * component, and Next only reads a `metadata` export from a server one.
 */
export const metadata: Metadata = baseMetadata;

export default function AttendanceSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
