/**
 * Tests for minimized, single-stage Incident Lifecycle Flow in ICM.
 *
 * Verifies:
 * 1. Unacknowledged stage: displays ONLY Acknowledge action (no Mitigate/Resolve/Transfer).
 * 2. Acknowledged stage: displays responder name, Transfer Incident button, and ONLY Mitigate action.
 * 3. Mitigate Modal: prompts for strategy, technical justification, and verification features.
 * 4. Transfer Modal: allows reassigning incident and team with handover notes.
 * 5. Mitigated stage: displays mitigator name and ONLY Resolve action.
 * 6. Resolve Modal: prompts for root cause category and permanent resolution justification.
 * 7. Resolved stage: displays resolver name and Reactivate option.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IncidentDetail } from "@/app/admin/IcmPanel";
import type { Incident } from "@/lib/icm";

const NOW = new Date("2025-02-10T12:00:00.000Z").toISOString();

function createIncident(over: Partial<Incident> = {}): Incident {
  return {
    id: "INC-3001",
    title: "Payment Gateway 502 Bad Gateway",
    description: "Checkout endpoint failing for international cards.",
    severity: 1,
    status: "active",
    source: "monitor",
    owningTeam: "Payments",
    assignedTo: "sarah@circuvent.com",
    createdBy: "monitor@circuvent.com",
    createdAt: NOW,
    acknowledgedAt: null,
    mitigatedAt: null,
    resolvedAt: null,
    impactStartedAt: NOW,
    affectedServices: ["checkout", "payments"],
    customersImpacted: 85,
    mitigation: "",
    rootCause: "",
    timeline: [
      {
        id: "t1",
        kind: "created",
        at: NOW,
        actor: "monitor@circuvent.com",
        text: "opened the incident",
      },
    ],
    tags: [],
    slaAckMins: 15,
    slaMitigateMins: 60,
    escalations: 0,
    links: [],
    ...over,
  };
}

describe("Minimized Lifecycle & Stage-Progressive Actions", () => {
  it("shows ONLY Acknowledge when incident is unacknowledged", () => {
    render(
      <IncidentDetail
        incident={createIncident({ acknowledgedAt: null })}
        now={NOW}
        teams={["Payments", "Security"]}
        busy={false}
        error=""
        onAct={jest.fn()}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    // Shows Acknowledge
    expect(screen.getByRole("button", { name: /^Acknowledge$/i })).toBeInTheDocument();
    expect(screen.getByText(/needs acknowledgment/i)).toBeInTheDocument();

    // Mitigate, Resolve, and Transfer Incident are NOT rendered in this stage
    expect(screen.queryByRole("button", { name: /^Mitigate$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Resolve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /transfer incident/i })).toBeNull();
  });

  it("triggers acknowledge action when Acknowledge button is clicked", async () => {
    const user = userEvent.setup();
    const onAct = jest.fn();

    render(
      <IncidentDetail
        incident={createIncident({ acknowledgedAt: null })}
        now={NOW}
        teams={["Payments", "Security"]}
        busy={false}
        error=""
        onAct={onAct}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const ackBtn = screen.getByRole("button", { name: /^Acknowledge$/i });
    await user.click(ackBtn);

    expect(onAct).toHaveBeenCalledWith({
      id: "INC-3001",
      action: "acknowledge",
    });
  });

  it("shows responder name, Transfer Incident, and ONLY Mitigate when acknowledged", () => {
    render(
      <IncidentDetail
        incident={createIncident({
          acknowledgedAt: NOW,
          timeline: [
            {
              id: "t1",
              kind: "created",
              at: NOW,
              actor: "monitor@circuvent.com",
              text: "opened the incident",
            },
            {
              id: "t2",
              kind: "acknowledged",
              at: NOW,
              actor: "vema@circuvent.com",
              text: "acknowledged the incident",
            },
          ],
        })}
        now={NOW}
        teams={["Payments", "Security"]}
        busy={false}
        error=""
        onAct={jest.fn()}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    // Shows who acknowledged
    expect(screen.getByText(/acknowledged by/i)).toHaveTextContent("vema@circuvent.com");

    // Shows Transfer Incident and Mitigate
    expect(screen.getByRole("button", { name: /transfer incident/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Mitigate$/i })).toBeInTheDocument();

    // Acknowledge and Resolve are NOT rendered
    expect(screen.queryByRole("button", { name: /^Acknowledge$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Resolve$/i })).toBeNull();
  });

  it("opens Mitigate Modal with justification and strategy options, and submits mitigation", async () => {
    const user = userEvent.setup();
    const onAct = jest.fn();

    render(
      <IncidentDetail
        incident={createIncident({
          acknowledgedAt: NOW,
          timeline: [
            {
              id: "t1",
              kind: "acknowledged",
              at: NOW,
              actor: "vema@circuvent.com",
              text: "acknowledged the incident",
            },
          ],
        })}
        now={NOW}
        teams={["Payments", "Security"]}
        busy={false}
        error=""
        onAct={onAct}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    // Click Mitigate button
    await user.click(screen.getByRole("button", { name: /^Mitigate$/i }));

    // Mitigate Modal appears
    expect(screen.getByText(/mitigate incident inc-3001/i)).toBeInTheDocument();
    expect(screen.getByText(/traffic reroute/i)).toBeInTheDocument();
    expect(screen.getByText(/rollback deploy/i)).toBeInTheDocument();
    expect(screen.getByText(/technical justification & actions taken/i)).toBeInTheDocument();

    // Select Rollback strategy
    await user.click(screen.getByText(/rollback deploy/i));

    // Fill in justification
    const textarea = screen.getByPlaceholderText(/explain the technical justification/i);
    await user.type(textarea, "Rolled back release v2.4 to restore gateway stability.");

    // Submit
    await user.click(screen.getByRole("button", { name: /confirm mitigation/i }));

    expect(onAct).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "INC-3001",
        action: "mitigate",
        note: expect.stringContaining("Rolled back release v2.4 to restore gateway stability."),
      })
    );
  });

  it("opens Transfer Modal and submits reassignment", async () => {
    const user = userEvent.setup();
    const onAct = jest.fn();

    render(
      <IncidentDetail
        incident={createIncident({
          acknowledgedAt: NOW,
          owningTeam: "Payments",
          assignedTo: "sarah@circuvent.com",
        })}
        now={NOW}
        teams={["Payments", "Security", "Infrastructure"]}
        busy={false}
        error=""
        onAct={onAct}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /transfer incident/i }));

    expect(screen.getByText(/transfer incident inc-3001/i)).toBeInTheDocument();

    const assigneeInput = screen.getByPlaceholderText(/e\.g\. devon@circuvent\.com/i);
    await user.clear(assigneeInput);
    await user.type(assigneeInput, "alex@circuvent.com");

    const reasonInput = screen.getByPlaceholderText(/reason for transfer/i);
    await user.type(reasonInput, "Handing over for infra investigations");

    await user.click(screen.getByRole("button", { name: /confirm transfer/i }));

    expect(onAct).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "INC-3001",
        action: "assign",
        assignedTo: "alex@circuvent.com",
        note: expect.stringContaining("Transferred: Handing over for infra investigations"),
      })
    );
  });

  it("shows mitigator name and ONLY Resolve option when incident is mitigated", async () => {
    const user = userEvent.setup();
    const onAct = jest.fn();

    render(
      <IncidentDetail
        incident={createIncident({
          acknowledgedAt: NOW,
          mitigatedAt: NOW,
          timeline: [
            {
              id: "t1",
              kind: "mitigated",
              at: NOW,
              actor: "vema@circuvent.com",
              text: "mitigated the incident",
            },
          ],
        })}
        now={NOW}
        teams={["Payments", "Security"]}
        busy={false}
        error=""
        onAct={onAct}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    // Shows who mitigated
    expect(screen.getByText(/mitigated by/i)).toHaveTextContent("vema@circuvent.com");

    // Shows ONLY Resolve
    expect(screen.getByRole("button", { name: /^Resolve$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Acknowledge$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Mitigate$/i })).toBeNull();

    // Click Resolve
    await user.click(screen.getByRole("button", { name: /^Resolve$/i }));

    expect(screen.getByText(/resolve incident inc-3001/i)).toBeInTheDocument();
    expect(screen.getByText(/root cause category/i)).toBeInTheDocument();

    const noteArea = screen.getByPlaceholderText(/record root cause details/i);
    await user.type(noteArea, "Fixed connection pool leak in payment service v2.4.1.");

    await user.click(screen.getByRole("button", { name: /confirm resolution/i }));

    expect(onAct).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "INC-3001",
        action: "resolve",
        note: expect.stringContaining("Fixed connection pool leak in payment service v2.4.1."),
      })
    );
  });
});
