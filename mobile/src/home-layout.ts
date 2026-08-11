/*
 * What the home screen shows, and in what order.
 *
 * The home screen was a fixed sequence of sections in source order. That is one
 * opinion about what matters, applied to everybody: a house with four lights
 * and no camera got the same layout as one with thirty devices, and somebody
 * who never looks at Recent activity scrolled past it every single time.
 *
 * This is the model behind letting people rearrange it. It is deliberately
 * shared with the web console — the same stored value drives both, so a layout
 * arranged on a phone is the layout on the dashboard, and there is exactly one
 * definition of what a section is.
 *
 * The interesting part is `resolve`. Stored layouts outlive the code that wrote
 * them: a section added in a later release must appear for somebody whose saved
 * layout predates it, and one that is removed must not resurrect or crash.
 * Neither can be handled by trusting what was stored.
 */

/** Every section the home screen can show, in the order a fresh install gets. */
export const HOME_SECTIONS = [
  "power",
  "glance",
  "quickActions",
  "weather",
  "scenes",
  "favorites",
  "devices",
  "rooms",
  "activity",
] as const;

export type HomeSection = (typeof HOME_SECTIONS)[number];

export interface SectionMeta {
  key: HomeSection;
  label: string;
  hint: string;
  /*
   * Sections that cannot be hidden.
   *
   * Only the device grid. Hiding everything else leaves a sparse home screen,
   * which is a choice; hiding the devices too leaves a smart-home app with no
   * way to reach the devices from its home screen, which is a trap — and the
   * way out of it is the very screen you have just emptied.
   */
  required?: boolean;
}

export const SECTION_META: Record<HomeSection, SectionMeta> = {
  power: { key: "power", label: "Live power", hint: "Current draw and today's usage" },
  glance: { key: "glance", label: "At a glance", hint: "Devices, rooms, scenes and alerts" },
  quickActions: { key: "quickActions", label: "Quick actions", hint: "Shortcuts to scenes, rooms and rules" },
  weather: { key: "weather", label: "Weather", hint: "Conditions where the devices are" },
  scenes: { key: "scenes", label: "Scenes", hint: "One-tap routines" },
  favorites: { key: "favorites", label: "Favourites", hint: "Devices you starred" },
  devices: { key: "devices", label: "Your devices", hint: "Every device, filtered by room", required: true },
  rooms: { key: "rooms", label: "Rooms", hint: "Jump to a room" },
  activity: { key: "activity", label: "Recent activity", hint: "What happened lately" },
};

export interface HomeLayout {
  order: HomeSection[];
  /** Keys explicitly hidden. Absent means visible, so a new section is opt-out. */
  hidden: HomeSection[];
}

export const DEFAULT_LAYOUT: HomeLayout = { order: [...HOME_SECTIONS], hidden: [] };

const isSection = (v: unknown): v is HomeSection =>
  typeof v === "string" && (HOME_SECTIONS as readonly string[]).includes(v);

/**
 * Turns whatever was stored into a layout that is safe to render.
 *
 * Every rule here exists because the alternative is a broken home screen:
 *
 *   - unknown keys are dropped, so a section deleted in a later release cannot
 *     crash a client that no longer has a component for it;
 *   - known keys missing from the stored order are appended, so a section added
 *     later shows up for existing users instead of being invisible forever;
 *   - duplicates collapse, because a key appearing twice renders twice;
 *   - required sections cannot be hidden, whatever the stored value says;
 *   - anything malformed falls back to the default rather than throwing, since
 *     this runs while the home screen is rendering.
 */
export function resolveLayout(stored: unknown): HomeLayout {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_LAYOUT, order: [...HOME_SECTIONS] };

  const raw = stored as Partial<Record<keyof HomeLayout, unknown>>;

  const seen = new Set<HomeSection>();
  const order: HomeSection[] = [];
  if (Array.isArray(raw.order)) {
    for (const k of raw.order) {
      if (isSection(k) && !seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  /* Anything the stored order never mentioned, in canonical order. */
  for (const k of HOME_SECTIONS) if (!seen.has(k)) order.push(k);

  const hidden: HomeSection[] = [];
  if (Array.isArray(raw.hidden)) {
    for (const k of raw.hidden) {
      if (isSection(k) && !SECTION_META[k].required && !hidden.includes(k)) hidden.push(k);
    }
  }

  return { order, hidden };
}

/** The sections to render, in order, with the hidden ones removed. */
export function visibleSections(layout: HomeLayout): HomeSection[] {
  const hidden = new Set(layout.hidden);
  return layout.order.filter((k) => !hidden.has(k));
}

export function isHidden(layout: HomeLayout, key: HomeSection): boolean {
  return layout.hidden.includes(key);
}

/**
 * Shows or hides a section.
 *
 * Refuses to hide a required one rather than silently accepting and dropping it
 * later — a toggle that moves and does nothing is worse than one that does not
 * move.
 */
export function setHidden(layout: HomeLayout, key: HomeSection, hidden: boolean): HomeLayout {
  if (hidden && SECTION_META[key].required) return layout;
  const next = layout.hidden.filter((k) => k !== key);
  if (hidden) next.push(key);
  return { ...layout, hidden: next };
}

/**
 * Moves a section one place up or down.
 *
 * Buttons rather than drag-and-drop: the list lives inside a vertical
 * ScrollView, where a long-press-then-drag competes with the scroll for the
 * same gesture, and loses often enough to feel broken. Two arrows always work,
 * including for somebody driving the screen with a switch or a screen reader.
 */
export function move(layout: HomeLayout, key: HomeSection, delta: -1 | 1): HomeLayout {
  const i = layout.order.indexOf(key);
  if (i < 0) return layout;
  const j = i + delta;
  if (j < 0 || j >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...layout, order };
}

/** True when the layout is untouched, so the UI can hide "Reset". */
export function isDefault(layout: HomeLayout): boolean {
  return (
    layout.hidden.length === 0 &&
    layout.order.length === HOME_SECTIONS.length &&
    layout.order.every((k, i) => k === HOME_SECTIONS[i])
  );
}
