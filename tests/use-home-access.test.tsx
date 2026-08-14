/**
 * What the console shows when it does not yet know what you may do.
 *
 * This hook decides which controls are *visible*, never what is permitted —
 * the server refuses regardless. That asymmetry is the whole reason it fails
 * open, and it is worth pinning down: a future change to "hide unless proven
 * allowed" would blank the console for every owner during first paint, and
 * turn one failed request into a home that appears to have lost its devices.
 *
 * The opposite mistake is mild by comparison: a button that refuses when
 * pressed now says why.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { useHomeAccess } from "@/lib/useHomeAccess";
import { controlPlane, setActiveHome } from "@/lib/control-plane";

jest.mock("@/lib/control-plane", () => {
  const actual = jest.requireActual("@/lib/control-plane");
  return {
    ...actual,
    controlPlane: { homeMembers: jest.fn(), homes: jest.fn() },
  };
});

const members = controlPlane.homeMembers as jest.Mock;
const homes = controlPlane.homes as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe("useHomeAccess", () => {
  it("allows everything in your own home without asking the server", async () => {
    // The overwhelmingly common case. Paying a round trip to be told you own
    // your own house would put a spinner in front of every console load.
    const { result } = renderHook(() => useHomeAccess());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.visiting).toBe(false);
    expect(result.current.role).toBe("owner");
    expect(result.current.can("security")).toBe(true);
    expect(result.current.can("manage-members")).toBe(true);
    expect(members).not.toHaveBeenCalled();
  });

  it("uses the capability list the server sent", async () => {
    setActiveHome(42);
    members.mockResolvedValue({
      ok: true,
      status: 200,
      data: { you: { id: 9, role: "limited", capabilities: ["view", "control"] } },
    });
    homes.mockResolvedValue({
      ok: true,
      status: 200,
      data: { homes: [{ homeId: 42, role: "limited", ownerName: "Mum", ownerEmail: "m@x.com" }] },
    });

    const { result } = renderHook(() => useHomeAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.visiting).toBe(true);
    expect(result.current.ownerName).toBe("Mum");
    expect(result.current.can("control")).toBe(true);
    expect(result.current.can("security")).toBe(false);
    expect(result.current.can("manage-automations")).toBe(false);
  });

  it("shows everything while it is still loading", () => {
    setActiveHome(42);
    members.mockReturnValue(new Promise(() => {}));
    homes.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useHomeAccess());

    expect(result.current.loading).toBe(true);
    expect(result.current.can("security")).toBe(true);
    expect(result.current.can("manage-devices")).toBe(true);
  });

  it("shows everything when the request fails", async () => {
    // A hub that is down, or one too old to have these routes. Hiding the
    // controls would present a working home as an empty one.
    setActiveHome(42);
    members.mockResolvedValue({ ok: false, status: 404, data: {} });
    homes.mockResolvedValue({ ok: false, status: 404, data: {} });

    const { result } = renderHook(() => useHomeAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.can("security")).toBe(true);
    expect(result.current.can("manage-members")).toBe(true);
  });

  it("reports which home is being visited so the banner can name it", async () => {
    setActiveHome(7);
    members.mockResolvedValue({
      ok: true,
      status: 200,
      data: { you: { id: 3, role: "guest", capabilities: ["view"] } },
    });
    homes.mockResolvedValue({
      ok: true,
      status: 200,
      data: { homes: [{ homeId: 7, role: "guest", ownerName: "Ravi", ownerEmail: "r@x.com" }] },
    });

    const { result } = renderHook(() => useHomeAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.visiting).toBe(true);
    expect(result.current.ownerName).toBe("Ravi");
    expect(result.current.role).toBe("guest");
    // A guest sees the home and operates nothing in it.
    expect(result.current.can("view")).toBe(true);
    expect(result.current.can("control")).toBe(false);
  });

  it("treats an empty capability list as empty, not as unknown", async () => {
    /*
     * The distinction matters. A missing list means "not known yet, show
     * everything"; an empty one is a real answer meaning "nothing", and
     * collapsing the two would hand every control to somebody the server has
     * told us has none.
     */
    setActiveHome(42);
    members.mockResolvedValue({
      ok: true,
      status: 200,
      data: { you: { id: 9, role: "guest", capabilities: [] } },
    });
    homes.mockResolvedValue({ ok: true, status: 200, data: { homes: [] } });

    const { result } = renderHook(() => useHomeAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.can("view")).toBe(false);
    expect(result.current.can("control")).toBe(false);
  });
});
