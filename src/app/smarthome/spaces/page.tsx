"use client";

import { DoorOpen, Layers, LayoutGrid, Building2 } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import { ToastHost } from "../_kit/overlays";
import RoomsPanel from "./RoomsPanel";
import GroupsPanel from "./GroupsPanel";
import FloorplanPanel from "./FloorplanPanel";
import SitesPanel from "./SitesPanel";

const TABS: TabDef[] = [
  { id: "rooms", label: "Rooms", icon: DoorOpen },
  { id: "groups", label: "Groups", icon: Layers },
  { id: "floorplan", label: "Floor Plan", icon: LayoutGrid },
  { id: "sites", label: "Sites", icon: Building2 },
];

export default function SpacesPage() {
  return (
    <ToastHost>
      <SectionShell
        eyebrow="Spaces"
        title="Spaces"
        subtitle="Rooms, device groups, floor plan, and sites — everything about where your devices live."
        tabs={TABS}
        panels={{
          rooms: () => <RoomsPanel />,
          groups: () => <GroupsPanel />,
          floorplan: () => <FloorplanPanel />,
          sites: () => <SitesPanel />,
        }}
      />
    </ToastHost>
  );
}
