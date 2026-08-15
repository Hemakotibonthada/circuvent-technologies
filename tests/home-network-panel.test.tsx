/**
 * The home network panel has to render the awkward states, not just the happy one.
 *
 * Its whole reason for existing is the case where everything looks fine and
 * nothing works: a board on the bus that cannot hear another board, or a pad
 * bound to a board that has since been removed. Those are the states a panel
 * is most tempted to render as "OK", and the ones that leave somebody standing
 * in another room pressing a switch.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { HomeNetworkPanel } from "@/app/smarthome/device/[id]/HomeNetworkPanel";
import type { Device } from "@/lib/control-plane";

const peerBoard: Device = {
  id: "bed-1", name: "Bedroom board", type: "touchboard-8", online: true,
  state: { g1: false, g2: true, g3: false },
} as unknown as Device;

jest.mock("@/lib/control-plane", () => ({
  controlPlane: {
    devices: jest.fn(async () => ({ ok: true, data: { devices: [peerBoardRef.current] } })),
    command: jest.fn(async () => ({ ok: true, data: {} })),
  },
}));

// Declared after the mock factory so the mock can reach it lazily — jest hoists
// the factory above every const in the file.
const peerBoardRef = { current: peerBoard };

const board = (state: Record<string, unknown>): Device =>
  ({ id: "hall-1", name: "Hall board", type: "touchboard-8", online: true, state }) as unknown as Device;

describe("home network panel", () => {
  it("tells the owner when the board never joined a home", async () => {
    render(<HomeNetworkPanel device={board({ homeLink: "unprovisioned" })} gangs={8} />);
    expect(await screen.findByText(/not part of a home network/i)).toBeInTheDocument();
  });

  it("does not present a board with no peers as working", async () => {
    /*
     * The state this panel exists for. "up" alone would read as healthy while
     * every cross-room pad on the board is dead.
     */
    render(<HomeNetworkPanel device={board({ homeLink: "up", homePeers: 0 })} gangs={8} />);
    expect(await screen.findByText(/cannot hear any other board/i)).toBeInTheDocument();
  });

  it("shows a binding row per gang once the bus is up", async () => {
    render(<HomeNetworkPanel device={board({ homeLink: "up", homePeers: 2 })} gangs={8} />);
    await waitFor(() => expect(screen.getByText("Gang 8")).toBeInTheDocument());
    for (let i = 1; i <= 8; i++) expect(screen.getByText(`Gang ${i}`)).toBeInTheDocument();
    expect(screen.queryByText("Gang 9")).not.toBeInTheDocument();
  });

  it("offers the peer's real outputs, not a guessed list", async () => {
    render(
      <HomeNetworkPanel
        device={board({ homeLink: "up", homePeers: 2, bind1: "bed-1:g2" })}
        gangs={2}
      />
    );
    const field = await screen.findByLabelText("Gang 1 target output");
    const options = [...field.querySelectorAll("option")].map((o) => o.textContent);
    // Derived from what the peer actually publishes, so a pad cannot be bound
    // to an output that board does not have.
    expect(options).toEqual(["g1", "g2", "g3"]);
  });

  it("says so when a pad points at a board that is gone", async () => {
    /*
     * Left visible rather than silently blanked. The pad genuinely does
     * nothing now, and rendering it as "unbound" would hide the reason.
     */
    render(
      <HomeNetworkPanel
        device={board({ homeLink: "up", homePeers: 1, bind1: "removed-board:g2" })}
        gangs={2}
      />
    );
    expect(await screen.findByText(/board not found/i)).toBeInTheDocument();
  });

  it("never offers the board itself as a binding target", async () => {
    // A pad bound to its own board is just a pad, and offering it invites a
    // loop through the radio for something the relay does directly.
    render(<HomeNetworkPanel device={board({ homeLink: "up", homePeers: 1 })} gangs={2} />);
    const target = await screen.findByLabelText("Gang 1 target board");
    const values = [...target.querySelectorAll("option")].map((o) => (o as HTMLOptionElement).value);
    expect(values).not.toContain("hall-1");
    expect(values).toContain("bed-1");
  });
});
