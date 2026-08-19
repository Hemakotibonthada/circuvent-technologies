"use client";

/**
 * Attendance — its own console section.
 *
 * WHY IT IS NOT A SECURITY TAB
 *
 * The readers are access control, so Security is where it nearly went. It does
 * not fit there for the same reason ANPR grew out of it: what a school or an
 * office does with this every day is a register, a roll, a card office and a
 * set of reports — seven views somebody administers daily, which is not a tab.
 *
 * More importantly the audience is different. Security is watched by whoever
 * looks after the building; a register is used by a form tutor, an HR
 * administrator and a payroll clerk, none of whom should have to go through a
 * page about alarms to find it.
 *
 * WHY IT IS CONDITIONAL
 *
 * A home does not have a register. An empty one reads as a broken feature
 * rather than an unbought one, and every account would pay for the clutter.
 * `useAttendancePresence` answers it once for the whole console: an
 * `rfid-attend` terminal on the fleet, or a site already created.
 *
 * The route stays reachable either way — a bookmark that dead-ends is worse
 * than a page that explains itself.
 */
import { ClipboardCheck, CalendarCheck, Users, CreditCard, Radio, Clock, BarChart3 } from "lucide-react";
import { SectionShell } from "../_kit/section";
import { ToastHost } from "../_kit/overlays";
import { Callout, LoadingState } from "../_kit/primitives";
import { useAttendancePresence } from "../_data/hooks";
import { AttendancePanel } from "./AttendancePanel";

const TABS = [
  { id: "live", label: "Live", icon: ClipboardCheck },
  { id: "register", label: "Register", icon: CalendarCheck },
  { id: "people", label: "People", icon: Users },
  { id: "cards", label: "Cards", icon: CreditCard },
  { id: "terminals", label: "Readers", icon: Radio },
  { id: "schedules", label: "Schedules", icon: Clock },
  { id: "reports", label: "Reports", icon: BarChart3 },
] as const;

export default function AttendancePage() {
  const { hasAttendance, ready } = useAttendancePresence();

  return (
    <ToastHost>
      {!ready ? (
        <LoadingState label="Loading attendance" />
      ) : !hasAttendance ? (
        <NotSetUp />
      ) : (
        <SectionShell
          eyebrow="Smarthome"
          title="Attendance"
          subtitle="Register · roll · cards · door readers · reports"
          tabs={[...TABS]}
          panels={{
            live: () => <AttendancePanel key="live" view="live" />,
            register: () => <AttendancePanel key="register" view="register" />,
            people: () => <AttendancePanel key="people" view="people" />,
            cards: () => <AttendancePanel key="cards" view="cards" />,
            terminals: () => <AttendancePanel key="terminals" view="terminals" />,
            schedules: () => <AttendancePanel key="schedules" view="schedules" />,
            reports: () => <AttendancePanel key="reports" view="reports" />,
          }}
        />
      )}
    </ToastHost>
  );
}

/**
 * Reached by a link or a bookmark on an account with no attendance system.
 *
 * It says what to do next rather than only what is missing. "Nothing here"
 * with no next step is the state somebody screenshots and sends to support.
 */
function NotSetUp() {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <Callout tone="info" title="No attendance system on this account yet">
        This section appears once there is an RFID terminal on the fleet, or a site has been
        created. Flash an ESP32 with the <code>rfid-attend</code> firmware and claim it in the
        app, and this will appear on its own — the roll, the cards and the readers can all be
        set up from here afterwards.
      </Callout>
    </div>
  );
}
