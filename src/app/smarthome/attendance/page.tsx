"use client";
import { ToastHost } from "../_kit/overlays";
import { useTabParam } from "../_kit/section";
import { AttendancePanel, type AttendanceView } from "./AttendancePanel";
import { ATTENDANCE_TABS } from "./navigation";
import { useAttendanceTab } from "./AttendanceShell";

export default function AttendancePage() {
  const { active: contextTab } = useAttendanceTab();
  const [tabFromParam] = useTabParam([...ATTENDANCE_TABS]);
  const view = (contextTab || tabFromParam || "live") as AttendanceView;

  return (
    <ToastHost>
      <AttendancePanel view={view} />
    </ToastHost>
  );
}
