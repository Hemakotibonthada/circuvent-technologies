import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { api, AppEvent } from "../../api";
import { useDevices } from "../../store";
import { Card, IconButton, PrimaryButton, Screen, SectionLabel, Title, useTheme } from "../../ui";
import { AsyncView, RefreshScroll, unwrap, useAsync } from "../../async";

export default function SecurityDashboard({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const { devices, command } = useDevices();

  /*
   * This screen used to swallow a failed request.
   *
   * `api.events(50).then(r => r.ok && setEvents(...))` leaves the list empty
   * when the call fails, and an empty list here reads as "no security events",
   * which is the reassuring answer. The honest answer is "we could not reach
   * your house", and on a security screen the difference matters more than
   * anywhere else in the app.
   */
  const state = useAsync<AppEvent[]>(async () => {
    const data = await unwrap<{ events?: AppEvent[] }>(api.events(50), "security events");
    return (data.events || []).filter((e) => /security/i.test(e.kind));
  }, []);

  const sec = useMemo(() => devices.filter((d) => ["guardian", "motion-sensor"].includes(d.type)), [devices]);
  const armed = sec.filter((d) => d.state.armed).length;
  const sos = sec.filter((d) => d.state.sos);
  const setAll = (v: boolean) => sec.forEach((d) => command(d.id, { action: "set", armed: v }));

  return (
    <Screen>
      <RefreshScroll state={state}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Title>Security</Title>
        </View>

        {sos.map((d) => (
          <Card key={d.id} hi style={{ borderColor: c.red, marginBottom: 10 }}>
            <Text style={{ color: c.red, fontWeight: "900" }}>SOS: {d.name}</Text>
          </Card>
        ))}

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
          <PrimaryButton label="Arm all" icon="🛡️" onPress={() => setAll(true)} style={{ flex: 1 }} />
          <PrimaryButton label="Disarm all" icon="○" onPress={() => setAll(false)} style={{ flex: 1 }} />
        </View>

        <Card style={{ marginBottom: 14 }}>
          <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>
            {armed} armed / {Math.max(sec.length - armed, 0)} disarmed
          </Text>
          <Text style={{ color: c.faint }}>Security device state</Text>
        </Card>

        <SectionLabel>Motion state</SectionLabel>
        {sec.map((d) => (
          <Card key={d.id} style={{ marginBottom: 8 }}>
            <Text style={{ color: c.text, fontWeight: "800" }}>{d.name}</Text>
            <Text style={{ color: d.state.motion ? c.amber : c.textDim }}>
              {d.type === "motion-sensor" ? (d.state.motion ? "Motion detected" : "Clear") : d.state.armed ? "Armed" : "Disarmed"}
            </Text>
          </Card>
        ))}

        <SectionLabel>Recent security events</SectionLabel>
        <AsyncView
          state={state}
          isEmpty={(events) => events.length === 0}
          emptyIcon="security"
          emptyTitle="No security events"
          emptySubtitle="Nothing has been reported by your security devices."
          loadingText="Loading security events…"
        >
          {(events) =>
            events.map((e) => (
              <Text key={e.id} style={{ color: c.textDim, marginBottom: 8 }}>
                • {e.title}
              </Text>
            ))
          }
        </AsyncView>
      </RefreshScroll>
    </Screen>
  );
}
