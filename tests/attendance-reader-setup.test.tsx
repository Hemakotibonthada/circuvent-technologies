import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Terminals } from "@/app/smarthome/attendance/AttendancePanel";
import { controlPlane, type AttendanceSite } from "@/lib/control-plane";

jest.mock("@/lib/control-plane", () => ({ controlPlane: {
  attendanceTerminals: jest.fn(), devices: jest.fn(), claim: jest.fn(), saveAttendanceTerminal: jest.fn(),
} }));
const site = { id: 7, name: "Office", kind: "office" } as AttendanceSite;
beforeEach(() => {
  jest.clearAllMocks();
  (controlPlane.attendanceTerminals as jest.Mock).mockResolvedValue({ ok: true, data: { terminals: [] } });
  (controlPlane.devices as jest.Mock).mockResolvedValue({ ok: true, data: { devices: [{ id: "reader-1", name: "Entrance", type: "rfid-attend" }] } });
  (controlPlane.saveAttendanceTerminal as jest.Mock).mockResolvedValue({ ok: true });
});
test("registers an owned reader on the selected site without reclaiming it", async () => {
  const user = userEvent.setup(); render(<Terminals site={site} />);
  await screen.findByText("No readers registered for this site yet.");
  await user.type(screen.getByLabelText("Device ID"), "reader-1");
  await user.click(screen.getByRole("button", { name: "Add reader" }));
  await waitFor(() => expect(controlPlane.saveAttendanceTerminal).toHaveBeenCalledWith("reader-1", expect.objectContaining({ siteId: 7, mode: "attendance", direction: "auto" })));
  expect(controlPlane.claim).not.toHaveBeenCalled();
});
test("does not register hardware when pairing fails", async () => {
  (controlPlane.claim as jest.Mock).mockResolvedValue({ ok: false });
  const user = userEvent.setup(); render(<Terminals site={site} />);
  await user.type(screen.getByLabelText("Device ID"), "new-reader");
  await user.type(screen.getByLabelText("Pairing key"), "invalid-key");
  await user.click(screen.getByRole("button", { name: "Add reader" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Could not claim");
  expect(controlPlane.saveAttendanceTerminal).not.toHaveBeenCalled();
});
