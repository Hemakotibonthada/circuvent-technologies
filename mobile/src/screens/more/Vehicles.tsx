import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import {
  Screen, Card, SectionLabel, useTheme, useBackHandler, useToast, ToastHost,
  EmptyState, PillSelector, Divider,
} from "../../ui";
import { Icon } from "../../icons";
import { api, type Occupancy, type Vehicle, type VehicleProfile } from "../../api";
import { TAP_SLOP } from "../../theme";

/**
 * Vehicles — the ANPR register on a phone.
 *
 * The console's version is a working surface with filters, CSV export and list
 * management. This is the question somebody actually asks from a phone: who is
 * here, who has been here, and is anything overdue. Editing the allow list on a
 * 5-inch screen is not a thing anyone wants to do, so it is not offered.
 */

type Colors = ReturnType<typeof useTheme>["c"];

/** Seconds → "2h 14m". Zero-padding a dwell time reads as false precision. */
function humanDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function shortWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const LIST_COLOUR = (kind: string | null, c: Colors): string =>
  kind === "deny" ? c.red : kind === "allow" ? c.green : kind === "watch" ? c.amber : c.faint;

const LIST_LABEL: Record<string, string> = {
  allow: "ALLOWED", deny: "BLOCKED", watch: "WATCHLIST",
};

export default function Vehicles({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const { toast, show, hide } = useToast();
  const [tab, setTab] = useState<"here" | "all">("here");
  const [occ, setOcc] = useState<Occupancy | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // A profile is a drill-down, so back should close it before leaving the
  // screen — otherwise one tap throws away two levels of navigation.
  useBackHandler(() => {
    if (profile) { setProfile(null); return true; }
    onBack();
    return true;
  });

  const load = useCallback(async () => {
    const [o, v] = await Promise.all([api.occupancy(), api.vehicles(30)]);
    /*
     * Reported per request, not only when both fail.
     *
     * The list failing on its own is the case that matters: occupancy still
     * renders, so the screen looks healthy and simply shows no vehicles —
     * which reads as an empty car park rather than as a list that did not
     * load. "Neither worked" was the only case anybody said anything about.
     */
    if (!o.ok) setOcc(null);
    else setOcc(o.data);
    if (!v.ok) setVehicles(null);
    else setVehicles(v.data.vehicles ?? []);
    if (!o.ok || !v.ok) {
      show(
        !o.ok && !v.ok
          ? "Could not reach the control plane"
          : !v.ok
            ? "Could not load the vehicle list"
            : "Could not load occupancy",
        "error"
      );
    }
  }, [show]);

  /*
   * The first load runs inside the effect with an `alive` guard rather than
   * calling the shared loader, so a screen popped while the two requests are
   * still out does not write state into an unmounted component.
   */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [o, v] = await Promise.all([api.occupancy(), api.vehicles(30)]);
      if (!alive) return;
      if (!o.ok) setOcc(null);
      else setOcc(o.data);
      if (!v.ok) setVehicles(null);
      else setVehicles(v.data.vehicles ?? []);
      if (!o.ok || !v.ok) {
        show(
          !o.ok && !v.ok
            ? "Could not reach the control plane"
            : !v.ok
              ? "Could not load the vehicle list"
              : "Could not load occupancy",
          "error"
        );
      }
    })();
    return () => { alive = false; };
  }, [show]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openProfile = async (plate: string) => {
    setLoadingProfile(true);
    const r = await api.vehicle(plate);
    setLoadingProfile(false);
    if (r.ok) setProfile(r.data);
    else show("No history for that vehicle", "warning");
  };

  const inside = useMemo(() => (vehicles ?? []).filter((v) => v.inside), [vehicles]);
  const shown = tab === "here" ? inside : vehicles ?? [];

  if (profile) {
    return (
      <Screen>
        <ToastHost toast={toast} onHide={hide} />
        <VehicleDetail profile={profile} c={c} onBack={() => setProfile(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ToastHost toast={toast} onHide={hide} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} />}
      >
        <Pressable onPress={onBack} hitSlop={TAP_SLOP} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Icon name="back" size={20} color={c.text} />
          <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>Vehicles</Text>
        </Pressable>

        {occ && (
          <Card padded style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
              <Stat label="On site" value={String(occ.inside)} c={c} accent={c.accent} />
              {occ.capacity != null && <Stat label="Free" value={String(occ.free)} c={c} accent={occ.full ? c.red : c.green} />}
              <Stat
                label="Overdue"
                value={String(occ.overstays.length)}
                c={c}
                accent={occ.overstays.length ? c.amber : c.text}
              />
            </View>
            {occ.full && (
              <Text style={{ color: c.red, fontSize: 12, marginTop: 10, textAlign: "center" }}>
                The site is full. Allowed vehicles are still admitted — capacity is reported, never enforced.
              </Text>
            )}
          </Card>
        )}

        {!!occ?.overstays.length && (
          <>
            <SectionLabel>Overdue</SectionLabel>
            {occ.overstays.map((o) => (
              <Card key={o.visitId} padded style={{ marginBottom: 8, flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: "700", fontFamily: "monospace" }}>{o.pretty}</Text>
                  <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>since {shortWhen(o.entryAt)}</Text>
                </View>
                <Text style={{ color: c.amber, fontWeight: "800" }}>{o.hours}h</Text>
              </Card>
            ))}
            <Divider />
          </>
        )}

        <View style={{ marginVertical: 12 }}>
          <PillSelector
            value={tab}
            options={["here", "all"] as const}
            onChange={setTab}
          />
        </View>

        {loadingProfile && <ActivityIndicator color={c.accent} style={{ marginVertical: 12 }} />}

        {vehicles === null ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
        ) : !shown.length ? (
          <EmptyState
            icon="anpr-cam"
            title={tab === "here" ? "Nothing on site" : "No vehicles yet"}
            subtitle={
              tab === "here"
                ? "Vehicles appear here between arriving and leaving."
                : "Each vehicle an ANPR camera reads gets its own history."
            }
          />
        ) : (
          shown.map((v) => (
            <Pressable key={v.plate} onPress={() => void openProfile(v.plate)}>
              <Card padded style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: c.text, fontSize: 17, fontWeight: "800", fontFamily: "monospace" }}>
                    {v.pretty}
                  </Text>
                  {v.inside && (
                    <Text style={{ color: c.accent, fontSize: 11, fontWeight: "800" }}>ON SITE</Text>
                  )}
                  {v.rule && (
                    <Text style={{ color: LIST_COLOUR(v.rule, c), fontSize: 11, fontWeight: "800" }}>
                      {LIST_LABEL[v.rule]}
                    </Text>
                  )}
                </View>
                <Text style={{ color: c.faint, fontSize: 12, marginTop: 4 }}>
                  {v.passes} passes · {v.entries} in / {v.exits} out
                  {v.avgStaySec != null ? ` · avg ${humanDuration(v.avgStaySec)}` : ""}
                </Text>
                <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>last seen {shortWhen(v.lastSeen)}</Text>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, c, accent }: { label: string; value: string; c: Colors; accent: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: accent, fontSize: 26, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const VISIT_LABEL: Record<string, string> = {
  open: "On site",
  closed: "Completed",
  entry_missed: "Departure only",
  exit_missed: "Arrival only",
};

function VehicleDetail({ profile, c, onBack }: { profile: VehicleProfile; c: Colors; onBack: () => void }) {
  const s = profile.summary;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Pressable onPress={onBack} hitSlop={TAP_SLOP} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon name="back" size={20} color={c.text} />
        <Text style={{ color: c.text, fontSize: 17, fontWeight: "700", fontFamily: "monospace" }}>{profile.pretty}</Text>
      </Pressable>

      <Card padded style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <Stat label="Passes" value={String(s.passes)} c={c} accent={c.accent} />
          <Stat label="Visits" value={String(s.visits)} c={c} accent={c.text} />
          <Stat label="Avg stay" value={humanDuration(s.avgStaySec)} c={c} accent={c.text} />
        </View>
        <Text style={{ color: c.faint, fontSize: 12, marginTop: 12, textAlign: "center" }}>
          {s.entries} in · {s.exits} out · first seen {shortWhen(s.firstSeen)}
        </Text>
        {s.inside && (
          <Text style={{ color: c.accent, fontSize: 12, marginTop: 6, textAlign: "center", fontWeight: "700" }}>
            On the property now
          </Text>
        )}
      </Card>

      {s.missedReads > 0 && (
        <Card padded style={{ marginBottom: 12 }}>
          <Text style={{ color: c.amber, fontWeight: "700", fontSize: 13 }}>
            {s.missedReads} visit{s.missedReads === 1 ? "" : "s"} with a missing read
          </Text>
          <Text style={{ color: c.faint, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
            A camera did not read this vehicle on one leg of the journey. Those stays show no duration
            rather than a guessed one.
          </Text>
        </Card>
      )}

      <SectionLabel>Visits</SectionLabel>
      {profile.visits.map((v) => (
        <Card key={v.id} padded style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: c.faint, fontSize: 11 }}>IN</Text>
              <Text style={{ color: v.entryAt ? c.text : c.faint, fontSize: 13 }}>
                {v.entryAt ? shortWhen(v.entryAt) : "Not recorded"}
              </Text>
            </View>
            <View>
              <Text style={{ color: c.faint, fontSize: 11 }}>OUT</Text>
              <Text style={{ color: v.exitAt ? c.text : c.faint, fontSize: 13 }}>
                {v.exitAt ? shortWhen(v.exitAt) : v.status === "open" ? "Still here" : "Not recorded"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: c.faint, fontSize: 11 }}>STAY</Text>
              <Text style={{ color: c.text, fontSize: 13 }}>{humanDuration(v.durationSec)}</Text>
            </View>
          </View>
          <Text
            style={{
              color: v.status === "open" ? c.accent : v.status === "closed" ? c.green : c.amber,
              fontSize: 11,
              fontWeight: "700",
              marginTop: 8,
            }}
          >
            {VISIT_LABEL[v.status] ?? v.status}
          </Text>
        </Card>
      ))}
    </ScrollView>
  );
}
