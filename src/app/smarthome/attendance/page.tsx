"use client";
import { ToastHost } from "../_kit/overlays";
import { useTabParam } from "../_kit/section";
import { AttendancePanel, type AttendanceView } from "./AttendancePanel";
import { ATTENDANCE_TABS } from "./navigation";

export default function AttendancePage() {
  const [view] = useTabParam([...ATTENDANCE_TABS]);
  // The panel owns real loading/error states and first-site creation. Requiring
  // existing hardware here prevented new organizations from ever onboarding.
  return <ToastHost><AttendancePanel key={view} view={view as AttendanceView} /></ToastHost>;
}
