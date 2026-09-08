/** @jest-environment jsdom */
import { completeAttendanceSignIn } from "../src/lib/attendance-signin";

describe("attendance browser session completion", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; window.history.replaceState(null, "", "/"); });
  test("does not interfere with ordinary console sign-in", async () => {
    global.fetch = jest.fn();
    expect(await completeAttendanceSignIn()).toEqual({ handled: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });
  test("consumes the outcome while preserving the selected attendance tab", async () => {
    window.history.replaceState(null, "", "/?tab=people&attendance_sso=complete#list");
    const session = { token: "token", user: { id: 1, email: "person@example.test", name: "Person" } };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => session });
    expect(await completeAttendanceSignIn()).toEqual({ handled: true, session });
    expect(window.location.search).toBe("?tab=people");
    expect(window.location.hash).toBe("#list");
    expect(global.fetch).toHaveBeenCalledWith("/api/attendance/auth/sso/session", { method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(await completeAttendanceSignIn()).toEqual({ handled: false });
  });
  test("renders recoverable denial and network errors", async () => {
    window.history.replaceState(null, "", "/?attendance_sso=denied");
    expect(await completeAttendanceSignIn()).toMatchObject({ handled: true, error: expect.stringContaining("administrator") });
    window.history.replaceState(null, "", "/?attendance_sso=complete");
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    expect(await completeAttendanceSignIn()).toMatchObject({ handled: true, error: expect.stringContaining("try again") });
  });
});
