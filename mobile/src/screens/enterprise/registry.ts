/**
 * Registration contract for enterprise modules.
 *
 * Each module under `screens/enterprise/<module>/` exports an array of these
 * from its `index.tsx`. The hub screen (`More.tsx`) iterates the registries
 * instead of hardcoding a union type and an if-chain, so adding a module is a
 * one-line import rather than an edit in four places.
 */
import type React from "react";
import type { IconName } from "../../icons";

export interface EnterpriseScreenProps {
  onBack: () => void;
}

export interface EnterpriseScreen {
  /** Unique, stable, kebab-case. Used as the navigation key — never reuse. */
  key: string;
  title: string;
  subtitle: string;
  icon: IconName;
  /** Section heading under which this appears in the hub. */
  group: string;
  /** Hide from non-admin accounts. A UX affordance; the server still enforces. */
  admin?: boolean;
  render: (props: EnterpriseScreenProps) => React.ReactElement;
}
