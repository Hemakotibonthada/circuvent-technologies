import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AttendanceShell } from "@/app/smarthome/attendance/AttendanceShell";
import { Schedules } from "@/app/smarthome/attendance/Schedules";
import { controlPlane, type AttendanceSite } from "@/lib/control-plane";
jest.mock("@/app/smarthome/ConsoleProvider", () => ({ useConsole: () => ({ user: { name: "Test User" }, logout: jest.fn() }) }));
jest.mock("@/app/smarthome/theme", () => ({ useConsoleTheme: () => ({ setScheme: jest.fn() }) }));
beforeAll(() => { window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }); });
jest.mock("@/lib/control-plane", () => ({ controlPlane: { attendanceSchedules: jest.fn(), createAttendanceSchedule: jest.fn(), updateAttendanceSchedule: jest.fn(), deleteAttendanceSchedule: jest.fn() } }));
const site = { id: 7, timezone: "Asia/Kolkata", graceMinutes: 5 } as AttendanceSite;
beforeEach(() => { jest.clearAllMocks(); (controlPlane.attendanceSchedules as jest.Mock).mockResolvedValue({ ok: true, data: { schedules: [] } }); });
test("attendance navigation contains only workforce tools and keeps its home in Attendance", () => {
  render(<AttendanceShell>Attendance content</AttendanceShell>);
  expect(screen.getByRole("navigation", { name: "Attendance tools" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Shifts & schedules" })).toHaveAttribute("href", "?tab=schedules");
  expect(screen.queryByText("Energy")).not.toBeInTheDocument();
  expect(screen.queryByText("Drone")).not.toBeInTheDocument();
  expect(screen.queryByText("Automation")).not.toBeInTheDocument();
  for (const link of screen.getAllByRole("link")) expect(link.getAttribute("href")).not.toBe("/smarthome");
});
test("creates a persisted schedule with weekly time windows", async () => {
  (controlPlane.createAttendanceSchedule as jest.Mock).mockResolvedValue({ ok: true });
  const user = userEvent.setup(); render(<Schedules site={site} />);
  await screen.findByText("No schedules yet. Create your first shift below.");
  await user.type(screen.getByLabelText("Schedule name"), "Morning shift");
  await user.click(screen.getAllByRole("button", { name: "Add time window" })[1]);
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() => expect(controlPlane.createAttendanceSchedule).toHaveBeenCalledWith(expect.objectContaining({ siteId: 7, name: "Morning shift", windows: { "1": [{ in: "09:00", out: "17:00" }] } })));
});
test("keeps split and overnight windows when editing a schedule", async () => {
  const windows = { "1": [{ in: "22:00", out: "02:00" }, { in: "03:00", out: "06:00" }] };
  (controlPlane.attendanceSchedules as jest.Mock).mockResolvedValue({ ok: true, data: { schedules: [{ id: 8, name: "Night", kind: "fixed", windows, minMinutes: 300, graceMinutes: 10 }] } });
  (controlPlane.updateAttendanceSchedule as jest.Mock).mockResolvedValue({ ok: true });
  const user = userEvent.setup(); render(<Schedules site={site} />);
  await user.click(await screen.findByRole("button", { name: "Edit schedule" }));
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() => expect(controlPlane.updateAttendanceSchedule).toHaveBeenCalledWith(8, expect.objectContaining({ windows })));
});
test("reports backend failure without pretending a schedule was saved", async () => {
  (controlPlane.createAttendanceSchedule as jest.Mock).mockResolvedValue({ ok: false });
  const user = userEvent.setup(); render(<Schedules site={site} />);
  await user.type(screen.getByLabelText("Schedule name"), "Test shift");
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(screen.getByLabelText("Schedule name")).toHaveValue("Test shift");
});
