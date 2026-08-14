import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, type LinkedAssistant } from "../../api";
import {
  Banner,
  Card,
  Divider,
  EmptyState,
  GhostButton,
  IconButton,
  ListRow,
  Screen,
  SectionLabel,
  Title,
  friendlyTime,
  useTheme,
} from "../../ui";
import { useConfirm } from "../../overlays";

/**
 * Voice assistants — what can control this home by speaking to it.
 *
 * The same screen as the console's, because this is where most customers
 * actually live. It exists because the question had no answer at all: account
 * linking is a stateless token exchange, so an Echo in a house somebody had
 * moved out of, or a Google account shared with an ex-partner, held a working
 * grant with nothing recording it and no way to take it back.
 */
const LABEL: Record<LinkedAssistant["assistant"], string> = {
  google: "Google Home",
  alexa: "Amazon Alexa",
};

export default function Assistants({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const { confirm, confirmNode } = useConfirm();

  const [links, setLinks] = useState<LinkedAssistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await api.assistants();
    /* A hub older than this feature has no such route. Told apart from "you
       have linked nothing", which looks identical from here and would tell
       somebody with a linked Echo that they had none. */
    if (r.status === 404) {
      setUnsupported(true);
    } else if (!r.ok) {
      setError("Could not load your linked assistants.");
    } else {
      setError("");
      setLinks(r.data.assistants ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const disconnect = async (l: LinkedAssistant) => {
    const yes = await confirm({
      title: `Disconnect ${LABEL[l.assistant]}?`,
      /* The cost is stated before it is paid. Over-revoking is the right side
         to err on; being surprised by it is not. */
      message:
        `${LABEL[l.assistant]} will no longer be able to control your devices.\n\n` +
        `Your other devices will be signed out too — you will need to sign in again ` +
        `on this phone and anywhere else you use Circuvent.`,
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!yes) return;

    const r = await api.unlinkAssistant(l.assistant);
    if (!r.ok) {
      setError((r.data as any)?.error ?? "Could not disconnect it.");
      return;
    }
    void load();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 90 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={onBack} />
          <Title>Voice assistants</Title>
        </View>

        {loading ? (
          <Text style={{ color: c.textDim }}>Loading…</Text>
        ) : unsupported ? (
          <Card>
            <Banner
              kind="warning"
              text="Your hub does not report linked assistants yet. Rebuild the control plane to manage them here."
            />
          </Card>
        ) : (
          <>
            {!!error && <Banner kind="error" text={error} />}

            <SectionLabel>Linked to this account</SectionLabel>
            <Card style={{ marginBottom: 14 }}>
              {links.length === 0 ? (
                <EmptyState
                  glyph="🎙️"
                  title="No assistants linked"
                  subtitle="Search for Circuvent in the Google Home or Alexa app to control your devices by voice."
                />
              ) : (
                links.map((l, i) => (
                  <View key={l.assistant}>
                    {i > 0 && <Divider />}
                    <ListRow
                      icon={l.assistant === "google" ? "🏠" : "🔊"}
                      title={LABEL[l.assistant]}
                      subtitle={
                        `Linked ${friendlyTime(l.linkedAt)}` +
                        (l.lastSyncAt ? ` · devices synced ${friendlyTime(l.lastSyncAt)}` : "")
                      }
                      right={
                        <GhostButton label="Disconnect" onPress={() => void disconnect(l)} />
                      }
                    />
                    {!l.receivesUpdates && (
                      /* Explains a real symptom rather than hiding a
                         limitation: without push, the assistant's app shows
                         whatever it last asked for, so a wall switch leaves it
                         stale. */
                      <Text style={{ color: c.amber, paddingHorizontal: 12, paddingBottom: 10, fontSize: 12 }}>
                        Not sent live updates — its app may show a device&apos;s state a little behind.
                      </Text>
                    )}
                  </View>
                ))
              )}
            </Card>

            <SectionLabel>What voice can do</SectionLabel>
            <Card>
              <Text style={{ color: c.textDim, lineHeight: 20 }}>
                Lights, plugs, switches, fans and pumps can be controlled by voice.
                {"\n\n"}
                Locks, gates, cameras and drones deliberately cannot. A spoken command should not be
                able to unlock a door or launch an aircraft — including one spoken through an open
                window.
              </Text>
            </Card>
          </>
        )}

        {confirmNode}
      </ScrollView>
    </Screen>
  );
}
