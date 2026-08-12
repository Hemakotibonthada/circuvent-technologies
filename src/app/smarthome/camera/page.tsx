"use client";

import { Grid2x2, Video } from "lucide-react";
import { SectionShell } from "../_kit/section";
import type { TabDef } from "../_kit/primitives";
import { CameraConsole } from "./CameraConsole";
import { RecordingsPanel } from "./RecordingsPanel";

const TABS: TabDef[] = [
  // The wall first: somebody opening this page wants to see, then to act.
  { id: "wall", label: "Wall", icon: Grid2x2 },
  { id: "clips", label: "Clips", icon: Video },
];

export default function CameraPage() {
  return (
    <SectionShell
      eyebrow="Cameras"
      title="Camera Console"
      subtitle="Watch several cameras at once, and control the one that needs attention without leaving the others."
      tabs={TABS}
      panels={{
        wall: () => <CameraConsole />,
        clips: () => <RecordingsPanel />,
      }}
    />
  );
}
