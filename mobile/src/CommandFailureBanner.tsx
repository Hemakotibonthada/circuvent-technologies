import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { onCommandFailure, type CommandFailure } from "./command-failure";
import { useTheme } from "./ui";

/**
 * Shows why the last command did not happen, wherever it was sent from.
 *
 * Mounted once near the root and fed by a broadcast, rather than handled at
 * each of the two dozen call sites. A per-screen message is a per-screen
 * chance to forget one, and the forgotten one is a control that lies about
 * what the house is doing.
 */

/** Long enough to read a sentence, short enough not to sit over the UI. */
const SHOW_MS = 6000;

export default function CommandFailureBanner() {
  const { c } = useTheme();
  const [shown, setShown] = useState<CommandFailure | null>(null);

  useEffect(() => onCommandFailure(setShown), []);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(t);
    /* Re-armed per failure so a second refused press does not have its message
       vanish mid-read. */
  }, [shown?.at, shown]);

  if (!shown) return null;

  return (
    <Pressable
      onPress={() => setShown(null)}
      accessibilityRole="alert"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 96,
        zIndex: 999,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: shown.refused ? c.borderHi : c.red,
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <Text style={{ fontSize: 16 }}>{shown.refused ? "🚫" : "⚠️"}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: "800", marginBottom: 2 }}>
          {shown.refused ? "That did not run" : "That did not work"}
        </Text>
        <Text style={{ color: c.textDim }}>{shown.message}</Text>
      </View>
    </Pressable>
  );
}
