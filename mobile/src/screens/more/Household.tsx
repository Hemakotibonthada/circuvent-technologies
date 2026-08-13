import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, Share, Text, TextInput, View } from "react-native";
import {
  api,
  getActiveHome,
  setActiveHome,
  type HomeInvite,
  type HomeMember,
  type HomeRole,
  type HomeRoleInfo,
  type HomeSummary,
} from "../../api";
import {
  Badge,
  Banner,
  Card,
  Divider,
  EmptyState,
  GhostButton,
  IconButton,
  ListRow,
  PillSelector,
  PrimaryButton,
  Screen,
  SectionLabel,
  Title,
  friendlyTime,
  useTheme,
} from "../../ui";

/**
 * Household — the people who can use this home, and the homes you can use.
 *
 * Before this, sharing a home with a partner meant handing them the account
 * password. That grants everything, including the ability to lock the owner
 * out, and leaves no record of who opened the door.
 *
 * Both halves live on one screen deliberately. Somebody who has been invited
 * to a home needs an obvious place to go and accept, and that is the same
 * place they would look to invite somebody to their own.
 */
export default function Household({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();

  const [homes, setHomes] = useState<HomeSummary[]>([]);
  const [members, setMembers] = useState<HomeMember[]>([]);
  const [owner, setOwner] = useState<HomeMember | null>(null);
  const [you, setYou] = useState<{ id: number; role: HomeRole } | null>(null);
  const [invites, setInvites] = useState<HomeInvite[]>([]);
  const [roleInfo, setRoleInfo] = useState<HomeRoleInfo[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [inviteRole, setInviteRole] = useState<"adult" | "limited" | "guest">("limited");
  const [joinCode, setJoinCode] = useState("");
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);

  const isOwner = you !== null && owner !== null && you.id === owner.id;

  const load = useCallback(async () => {
    const [h, m, r] = await Promise.all([api.homes(), api.homeMembers(), api.homeRoles()]);
    if (h.ok) setHomes(h.data.homes ?? []);
    if (m.ok) {
      setMembers(m.data.members ?? []);
      setOwner(m.data.owner ?? null);
      setYou(m.data.you ?? null);
    }
    if (r.ok) setRoleInfo(r.data.roles ?? []);

    /* Owner-only, and answers 403 otherwise. Asked for regardless and ignored
       on refusal rather than branching before we know who we are. */
    const i = await api.homeInvites();
    setInvites(i.ok ? (i.data.invites ?? []) : []);

    setActive(await getActiveHome());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const switchTo = async (homeId: number | null) => {
    await setActiveHome(homeId);
    setActive(homeId);
    /*
     * Every screen holds its own fetched state and the home is a request
     * header, so simply setting it would leave one household's devices on
     * screen under another's name. Sending the person back to the list makes
     * them re-enter, and everything refetches on the way in.
     */
    Alert.alert(
      homeId ? "Now viewing that home" : "Back to your own home",
      "Your devices, rooms and history are for that home from now on."
    );
    onBack();
  };

  const invite = async () => {
    setBusy(true);
    const r = await api.inviteToHome({ role: inviteRole });
    setBusy(false);
    if (!r.ok) {
      Alert.alert("Could not create the invitation", (r.data as any)?.error ?? "");
      return;
    }
    setIssued({ code: r.data.code, expiresAt: r.data.expiresAt });
    void load();
  };

  const join = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    const r = await api.joinHome(code);
    setBusy(false);
    if (!r.ok) {
      Alert.alert("Could not join", (r.data as any)?.error ?? "");
      return;
    }
    setJoinCode("");
    Alert.alert("You have joined the home", "Switch to it from the list at the top.");
    void load();
  };

  const remove = (m: HomeMember) => {
    Alert.alert(
      `Remove ${m.name || m.email}?`,
      "Their access ends immediately, on every device they are signed in on.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const r = await api.removeMember(m.id);
            if (!r.ok) {
              Alert.alert("Could not remove them", (r.data as any)?.error ?? "");
              return;
            }
            setMembers((ms) => ms.filter((x) => x.id !== m.id));
          },
        },
      ]
    );
  };

  const leave = (home: HomeSummary) => {
    if (!you) return;
    Alert.alert(`Leave ${home.ownerName}'s home?`, "You will need a new invitation to get back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          const wasActive = (await getActiveHome()) === home.homeId;
          if (wasActive) await setActiveHome(null);
          const r = await api.removeMember(you.id);
          if (!r.ok) {
            if (wasActive) await setActiveHome(home.homeId);
            Alert.alert("Could not leave", (r.data as any)?.error ?? "");
            return;
          }
          void load();
        },
      },
    ]);
  };

  const changeRole = async (m: HomeMember, role: "adult" | "limited" | "guest") => {
    const r = await api.setMemberRole(m.id, role);
    if (!r.ok) {
      Alert.alert("Could not change access", (r.data as any)?.error ?? "");
      return;
    }
    setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, role } : x)));
  };

  const roleColour = (role: HomeRole): string =>
    role === "owner" || role === "adult" ? c.green : role === "limited" ? c.text : c.faint;

  const shared = homes.filter((h) => h.role !== "owner");
  const openInvites = invites.filter((i) => i.status === "open");
  const describe = (role: string) => roleInfo.find((r) => r.role === role)?.description ?? "";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Title>Household</Title>
        </View>

        {loading ? (
          <Text style={{ color: c.textDim }}>Loading…</Text>
        ) : (
          <>
            {/* Which home ------------------------------------------------ */}
            {shared.length > 0 && (
              <>
                <SectionLabel>Which home you are viewing</SectionLabel>
                <Card style={{ marginBottom: 14 }}>
                  {homes.map((h, i) => {
                    const isActive = h.role === "owner" ? active === null : active === h.homeId;
                    return (
                      <View key={h.homeId}>
                        {i > 0 && <Divider />}
                        <ListRow
                          icon="🏠"
                          title={h.role === "owner" ? "My home" : `${h.ownerName}'s home`}
                          subtitle={`${h.ownerEmail} · ${h.role}`}
                          right={
                            isActive ? (
                              <Badge label="Viewing" color={c.green} />
                            ) : (
                              <GhostButton
                                label="Switch"
                                onPress={() => void switchTo(h.role === "owner" ? null : h.homeId)}
                              />
                            )
                          }
                        />
                        {h.role !== "owner" && (
                          <GhostButton label="Leave this home" onPress={() => leave(h)} />
                        )}
                      </View>
                    );
                  })}
                </Card>
              </>
            )}

            {/* People ---------------------------------------------------- */}
            <SectionLabel>
              {isOwner ? "People in your home" : `People in ${owner?.name ?? "this home"}`}
            </SectionLabel>

            {!isOwner && you && (
              <Banner
                kind="info"
                text={`You are ${you.role} in this home. ${describe(you.role)}`}
              />
            )}

            <Card style={{ marginBottom: 14 }}>
              {owner && (
                <ListRow
                  icon="👑"
                  title={`${owner.name || owner.email}${you?.id === owner.id ? " — you" : ""}`}
                  subtitle={owner.email}
                  right={<Text style={{ color: roleColour("owner") }}>owner</Text>}
                />
              )}
              {members.map((m) => (
                <View key={m.id}>
                  <Divider />
                  <ListRow
                    icon="👤"
                    title={`${m.name || m.email}${you?.id === m.id ? " — you" : ""}`}
                    subtitle={m.since ? `${m.email} · joined ${friendlyTime(m.since)}` : m.email}
                    right={<Text style={{ color: roleColour(m.role) }}>{m.role}</Text>}
                  />
                  {isOwner && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
                      <PillSelector
                        options={["adult", "limited", "guest"] as const}
                        value={m.role === "owner" ? "adult" : (m.role as "adult" | "limited" | "guest")}
                        onChange={(v) => void changeRole(m, v)}
                      />
                      <GhostButton label="Remove from home" onPress={() => remove(m)} />
                    </View>
                  )}
                </View>
              ))}
              {members.length === 0 && (
                <EmptyState
                  glyph="👥"
                  title="Nobody else yet"
                  subtitle={
                    isOwner
                      ? "Invite the people who live here so they stop needing your password."
                      : "You are the only person the owner has invited."
                  }
                />
              )}
            </Card>

            {/* Invite ---------------------------------------------------- */}
            {isOwner && (
              <>
                <SectionLabel>Invite somebody</SectionLabel>
                <Card style={{ marginBottom: 14 }}>
                  <PillSelector
                    options={["adult", "limited", "guest"] as const}
                    value={inviteRole}
                    onChange={setInviteRole}
                  />
                  <Text style={{ color: c.textDim, marginTop: 10, marginBottom: 12 }}>
                    {describe(inviteRole)}
                  </Text>
                  <PrimaryButton
                    label={busy ? "Creating…" : "Create an invitation"}
                    onPress={() => void invite()}
                  />

                  {issued && (
                    <View style={{ marginTop: 14 }}>
                      <Text style={{ color: c.textDim, marginBottom: 6 }}>Give them this code:</Text>
                      <Text
                        selectable
                        style={{
                          color: c.text,
                          fontSize: 26,
                          fontWeight: "700",
                          letterSpacing: 6,
                          marginBottom: 8,
                        }}
                      >
                        {issued.code}
                      </Text>
                      <GhostButton
                        label="Share code"
                        onPress={() => {
                          /* Share rather than clipboard: this build carries no
                             clipboard library, and the code has to reach
                             somebody else anyway — a share sheet is the step
                             they were going to take next. The code stays
                             selectable above for reading it out. */
                          void Share.share({
                            message: `Join my home on Circuvent with this code: ${issued.code}. It works once and expires ${friendlyTime(issued.expiresAt)}.`,
                          });
                        }}
                      />
                      <Text style={{ color: c.faint, marginTop: 8, fontSize: 12 }}>
                        It works once, and stops working {friendlyTime(issued.expiresAt)}. They enter
                        it under Household in their own app.
                      </Text>
                    </View>
                  )}
                </Card>

                {openInvites.length > 0 && (
                  <Card style={{ marginBottom: 14 }}>
                    {openInvites.map((i, idx) => (
                      <View key={i.code}>
                        {idx > 0 && <Divider />}
                        <ListRow
                          icon="🎟️"
                          title={i.code}
                          subtitle={`${i.role} · expires ${friendlyTime(i.expiresAt)}`}
                          right={
                            <GhostButton
                              label="Withdraw"
                              onPress={async () => {
                                const r = await api.revokeHomeInvite(i.code);
                                if (r.ok) void load();
                              }}
                            />
                          }
                        />
                      </View>
                    ))}
                  </Card>
                )}
              </>
            )}

            {/* Join ------------------------------------------------------ */}
            <SectionLabel>Join somebody else&apos;s home</SectionLabel>
            <Card>
              <TextInput
                value={joinCode}
                onChangeText={(v) => setJoinCode(v.toUpperCase())}
                placeholder="ABCD2345"
                placeholderTextColor={c.faint}
                autoCapitalize="characters"
                autoCorrect={false}
                style={{
                  color: c.text,
                  fontSize: 20,
                  letterSpacing: 4,
                  paddingVertical: 10,
                  marginBottom: 12,
                }}
              />
              <PrimaryButton label={busy ? "Joining…" : "Join"} onPress={() => void join()} />
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
