import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FirstRun } from "@/app/smarthome/attendance/AttendancePanel";
import { controlPlane, type ControlUser } from "@/lib/control-plane";

let mockUser: Partial<ControlUser>;
jest.mock("@/app/smarthome/ConsoleProvider", () => ({ useConsole: () => ({ user: mockUser }) }));
jest.mock("@/lib/control-plane", () => ({ controlPlane: { createAttendanceSite: jest.fn() } }));
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { email: "vema@circuvent.com", organization: { id: "org-1", name: "Circuvent Technologies", domain: null } };
  (controlPlane.createAttendanceSite as jest.Mock).mockResolvedValue({ ok: true });
});

test("uses the account domain and SSO company name, with editable fields", async () => {
  const user = userEvent.setup();
  render(<FirstRun onCreated={jest.fn()} />);
  expect(screen.getByLabelText("Company Name")).toHaveValue("Circuvent Technologies");
  expect(screen.getByLabelText("Company Domain")).toHaveValue("circuvent.com");
  await user.clear(screen.getByLabelText("Company Name"));
  await user.type(screen.getByLabelText("Company Name"), "Branch Office");
  await user.clear(screen.getByLabelText("Company Domain"));
  await user.type(screen.getByLabelText("Company Domain"), "Example.com");
  await user.type(screen.getByLabelText("Site Location / Name"), "Head office");
  await user.click(screen.getByRole("button", { name: "Create attendance site" }));
  expect(controlPlane.createAttendanceSite).toHaveBeenCalledWith(expect.objectContaining({ companyName: "Branch Office", domain: "example.com", orgId: "org-1" }));
});

test("older SSO sessions can enter a company name without an organization claim", async () => {
  mockUser = { email: "vema@circuvent.com" };
  const user = userEvent.setup();
  render(<FirstRun onCreated={jest.fn()} />);
  await user.type(screen.getByLabelText("Company Name"), "Circuvent Technologies");
  await user.type(screen.getByLabelText("Site Location / Name"), "HQ");
  expect(screen.getByRole("button", { name: "Create attendance site" })).toBeEnabled();
  await user.clear(screen.getByLabelText("Company Domain"));
  await user.type(screen.getByLabelText("Company Domain"), "https://example.com");
  expect(screen.getByRole("button", { name: "Create attendance site" })).toBeDisabled();
});

test("late identity hydration does not replace user edits and network failure allows retry", async () => {
  mockUser = { email: "vema@circuvent.com" };
  const user = userEvent.setup();
  const onCreated = jest.fn();
  const { rerender } = render(<FirstRun onCreated={onCreated} />);
  await user.type(screen.getByLabelText("Company Name"), "Custom company");
  mockUser.organization = { id: "org-1", name: "SSO company", domain: "example.com" };
  rerender(<FirstRun onCreated={onCreated} />);
  expect(screen.getByLabelText("Company Name")).toHaveValue("Custom company");
  expect(screen.getByLabelText("Company Domain")).toHaveValue("example.com");
  await user.type(screen.getByLabelText("Site Location / Name"), "HQ");
  (controlPlane.createAttendanceSite as jest.Mock).mockRejectedValue(new Error("Offline"));
  await user.click(screen.getByRole("button", { name: "Create attendance site" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not reach"));
  expect(screen.getByRole("button", { name: "Create attendance site" })).toBeEnabled();
  expect(onCreated).not.toHaveBeenCalled();
});
