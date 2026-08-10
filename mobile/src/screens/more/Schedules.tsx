/**
 * Per-switch schedules.
 *
 * A user schedules the geyser, not "home-hub-3f2a". This screen picks a
 * device, then one of its switchable channels by the name the user gave it,
 * and writes an ordinary time automation for that single field — so it runs on
 * the same server scheduler as everything else and shows up in Automations.
 *
 * On and off are two automations sharing a marker in their name, which is what
 * lets them be listed and recognised as one timer.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Switch, Text, TextInput, View } from "react-native";
import { api, Automation, Device } from "../../api";
import { buildFieldCommand } from "../../command-map";
import { useDevices } from "../../store";
import { defaultGangs, useSwitchWidgets } from "../../widgets";
import {
  Banner,
  Card,
  EmptyState,
  IconButton,
  ListRow,
  PrimaryButton,
  Screen,
  SectionLabel,
  SegmentedControl,
  Title,
  TimePicker,
  friendlyTime,
  useTheme,
} from "../../ui";

const timeOk = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Marker that identifies a timer this screen created. Shared with the web console. */
const MARK = "\u27E8sw\u27E9";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** A week that starts on Monday reads better in a planner. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function daysText(days?: number[]): string {
  if (!days || days.length === 0 || days.length === 7) return "Every day";
  const set = new Set(days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return WEEK_ORDER.filter((d) => set.has(d)).map((d) => DAY_LABELS[d]).join(", ");
}

/** Strips the marker so the list shows a clean name. */
const displayName = (n: string) => (n.startsWith(MARK) ? n.slice(MARK.length).trim() : n);

/**
 * `embedded` is for the Automate tab, which supplies its own screen and title.
 * Rendering a Screen inside a Screen doubles the top padding and puts a second
 * back arrow under the segment bar.
 */
export default function Schedules({ onBack, embedded }: { onBack: () => void; embedded?: boolean }) {
  const { c } = useTheme();
  const { devices } = useDevices();
  const [items, setItems] = useState<Automation[]>([]);
  const [busy, setBusy] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [field, setField] = useState("");
  const [onTime, setOnTime] = useState("07:00");
  const [offTime, setOffTime] = useState("22:00");
  const [mode, setMode] = useState<"both" | "on" | "off">("both");
  const [days, setDays] = useState<number[]>(EVERY_DAY);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const r = await api.automations();
    if (r.ok) setItems((r.data.automations || []).filter((a) => a.trigger?.type === "time"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!deviceId && devices[0]) setDeviceId(devices[0].id);
  }, [deviceId, devices]);

  const selected = devices.find((d) => d.id === deviceId);

  const create = async () => {
    setErr("");
    setNote("");
    if (!selected) return setErr("Add a device before creating timers.");
    const gangs = defaultGangs(selected);
    const target = gangs.find((g) => g.field === field) ?? gangs[0];
    if (!target) return setErr("That device has no switchable output.");
    if (mode !== "off" && !timeOk(onTime)) return setErr("Use 24-hour HH:MM for the on time.");
    if (mode !== "on" && !timeOk(offTime)) return setErr("Use 24-hour HH:MM for the off time.");
    if (!days.length) return setErr("Select at least one day.");
    if (mode === "both" && onTime === offTime)
      return setErr("On and off cannot be at the same minute.");

    setBusy(true);
    // Seven days is the same as no filter; send the shorter form.
    const dayFilter = days.length === 7 ? undefined : days;
    const halves: { on: boolean; at: string }[] = [];
    if (mode !== "off") halves.push({ on: true, at: onTime });
    if (mode !== "on") halves.push({ on: false, at: offTime });

    /*
     * Built, not assembled. `{ [field]: value }` is a state key, and the
     * device drops any payload with no `action` before its sketch runs — the
     * timer saved, the countdown ticked, and the relay never moved.
     */
    const command = buildFieldCommand(selected.type, target.field, true);
    if (!command) {
      setBusy(false);
      return setErr(`A ${selected.type} cannot be scheduled on “${target.field}”.`);
    }

    const results = await Promise.all(
      halves.map((h) =>
        api.createAutomation({
          name: `${MARK} ${target.label} ${h.on ? "on" : "off"}`,
          trigger: { type: "time", at: h.at, days: dayFilter },
          action: {
            type: "command",
            deviceId: selected.id,
            command: buildFieldCommand(selected.type, target.field, h.on)!,
          },
        })
      )
    );
    setBusy(false);
    if (results.some((r) => !r.ok)) setErr("Could not create the timer.");
    else setNote(`${target.label} timer created.`);
    await load();
  };

  const toggle = async (a: Automation) => {
    await api.updateAutomation(a.id, { enabled: !a.enabled });
    await load();
  };

  const del = async (id: number) => {
    await api.deleteAutomation(id);
    await load();
  };

  const body = (
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: embedded ? 4 : 56, paddingBottom: 90 }}>
        {embedded ? null : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <IconButton glyph={"\u2039"} onPress={onBack} />
            <Title>Switch timers</Title>
          </View>
        )}
        {err ? <Banner kind="error" text={err} /> : null}
        {note ? <Banner kind="success" text={note} /> : null}

        <SectionLabel>Create timer</SectionLabel>
        <Card style={{ marginBottom: 16 }}>
          {devices.length === 0 ? (
            <Text style={{ color: c.textDim }}>Add a device before creating timers.</Text>
          ) : (
            <>
              <FieldLabel>Device</FieldLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, marginBottom: 14 }}
              >
                {devices.map((d) => (
                  <Chip
                    key={d.id}
                    label={d.name}
                    active={deviceId === d.id}
                    onPress={() => {
                      setDeviceId(d.id);
                      setField("");
                    }}
                  />
                ))}
              </ScrollView>

              {selected ? <SwitchPicker device={selected} value={field} onChange={setField} /> : null}

              <FieldLabel>What to schedule</FieldLabel>
              <SegmentedControl
                options={["both", "on", "off"] as const}
                value={mode}
                onChange={setMode}
              />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                {mode !== "off" ? <TimeBox label="On at" value={onTime} onChange={setOnTime} /> : null}
                {mode !== "on" ? <TimeBox label="Off at" value={offTime} onChange={setOffTime} /> : null}
              </View>

              <FieldLabel style={{ marginTop: 14 }}>{`Days \u00B7 ${daysText(days)}`}</FieldLabel>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {WEEK_ORDER.map((d) => (
                  <Chip
                    key={d}
                    label={DAY_LABELS[d]}
                    active={days.includes(d)}
                    radius={10}
                    onPress={() =>
                      setDays((prev) =>
                        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
                      )
                    }
                  />
                ))}
              </View>

              <Text style={{ color: c.faint, marginTop: 12, fontSize: 12 }}>
                Timers run on India Standard Time (IST), the control plane&apos;s clock.
              </Text>

              <PrimaryButton
                label="Create timer"
                busy={busy}
                onPress={create}
                style={{ marginTop: 14 }}
              />
            </>
          )}
        </Card>

        <SectionLabel>Time automations</SectionLabel>
        {items.map((a) => (
          <Card key={a.id} style={{ marginBottom: 10 }}>
            <ListRow
              icon={"\u23F1\uFE0F"}
              title={displayName(a.name)}
              subtitle={`${a.trigger.at ? friendlyTime(a.trigger.at) : "--:--"} IST \u00B7 ${daysText(a.trigger.days)} \u00B7 ${
                a.enabled ? "enabled" : "paused"
              }`}
              right={
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Switch value={a.enabled} onValueChange={() => toggle(a)} />
                  <Text onPress={() => del(a.id)} style={{ color: c.red, fontWeight: "800" }}>
                    Delete
                  </Text>
                </View>
              }
            />
            <RunLine automation={a} />
          </Card>
        ))}
        {!items.length ? (
          <EmptyState
            glyph={"\u23F1\uFE0F"}
            title="No timers yet"
            subtitle="Pick one switch, choose when it turns on and off, and it runs every day you select."
          />
        ) : null}
      </ScrollView>
  );

  return embedded ? body : <Screen>{body}</Screen>;
}

/**
 * Channel chips for the selected device, using the names the user gave each
 * gang on the control screen so the same switch is called the same thing
 * everywhere.
 */
/**
 * What happened the last time this timer was due.
 *
 * A switch timer used to save correctly, show the right next-run time and
 * count down while the relay never moved, because the stored command was a
 * shape the device discards before its sketch runs. Nothing in the app
 * distinguished that from working, which is why it went unnoticed for so long.
 *
 * A control plane too old to report this stays silent rather than claiming
 * "never ran", which would be a confident wrong answer.
 */
function RunLine({ automation }: { automation: Automation }) {
  const { c } = useTheme();
  if (automation.last_run_at === undefined && automation.run_count === undefined) return null;

  if (automation.last_run_ok === false && automation.last_error) {
    return (
      <Text style={{ color: c.amber, fontSize: 11, paddingHorizontal: 14, paddingBottom: 10 }}>
        {`Last run failed \u00B7 ${automation.last_error}`}
      </Text>
    );
  }
  if (!automation.last_run_at) {
    return (
      <Text style={{ color: c.faint, fontSize: 11, paddingHorizontal: 14, paddingBottom: 10 }}>
        Has not run yet — it will fire at the time above.
      </Text>
    );
  }
  const mins = Math.max(0, Math.round((Date.now() - new Date(automation.last_run_at).getTime()) / 60000));
  const ago =
    mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
  const runs = automation.run_count ?? 0;
  return (
    <Text style={{ color: c.green, fontSize: 11, paddingHorizontal: 14, paddingBottom: 10 }}>
      {`Last ran ${ago}${runs ? ` \u00B7 ${runs} run${runs === 1 ? "" : "s"}` : ""}`}
    </Text>
  );
}

function SwitchPicker({
  device,
  value,
  onChange,
}: {
  device: Device;
  value: string;
  onChange: (field: string) => void;
}) {
  const { c } = useTheme();
  const { gangs } = useSwitchWidgets(device);

  // Default to the first channel whenever the device (and so the list) changes.
  useEffect(() => {
    if (gangs.length && !gangs.some((g) => g.field === value)) onChange(gangs[0].field);
  }, [gangs, value, onChange]);

  if (gangs.length === 0) {
    return (
      <Text style={{ color: c.textDim, marginBottom: 14 }}>
        This device has no switchable output to schedule.
      </Text>
    );
  }

  return (
    <>
      <FieldLabel>Switch</FieldLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, marginBottom: 14 }}
      >
        {gangs.map((g) => (
          <Chip
            key={g.field}
            label={g.label}
            active={value === g.field}
            onPress={() => onChange(g.field)}
          />
        ))}
      </ScrollView>
    </>
  );
}

function FieldLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: { marginTop?: number };
}) {
  const { c } = useTheme();
  return (
    <Text
      style={[
        { color: c.textDim, marginBottom: 8, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 },
        style,
      ]}
    >
      {String(children).toUpperCase()}
    </Text>
  );
}

function Chip({
  label,
  active,
  onPress,
  radius = 999,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  radius?: number;
}) {
  const { c } = useTheme();
  return (
    <Text
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        color: active ? c.onAccent : c.textDim,
        backgroundColor: active ? c.accent : c.cardHi,
        borderRadius: radius,
        // 44px minimum touch target: 12px padding either side of a ~20px line.
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontWeight: "700",
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}

function TimeBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <TimePicker label={label} value={value} onChange={onChange} />
    </View>
  );
}
