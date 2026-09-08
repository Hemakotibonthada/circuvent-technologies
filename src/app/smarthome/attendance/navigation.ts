import { ClipboardCheck, CalendarCheck, Users, CreditCard, Radio, Clock, BarChart3, DoorOpen } from "lucide-react";
export const ATTENDANCE_TABS = [
  { id: "live", label: "Live attendance", icon: ClipboardCheck },
  { id: "register", label: "Daily register", icon: CalendarCheck },
  { id: "people", label: "People", icon: Users },
  { id: "cards", label: "Cards & credentials", icon: CreditCard },
  { id: "terminals", label: "Attendance readers", icon: Radio },
  { id: "access", label: "Office access", icon: DoorOpen },
  { id: "schedules", label: "Shifts & schedules", icon: Clock },
  { id: "reports", label: "Reports & payroll", icon: BarChart3 },
] as const;
