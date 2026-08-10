import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import { Camera } from "expo-camera";
import { Icon, type IconName } from "./icons";
import { Card, GhostButton, PrimaryButton, Screen, SectionLabel, Title, useTheme } from "./ui";
import { PERMISSIONS, shouldRunFirstRun, type PermissionKey, type PermissionState } from "./first-run";

const RAN_KEY = "cv-first-run-permissions";

/*
 * Asking for permissions once, at the start, having said why.
 *
 * Before this, each permission was requested at the moment it was first needed
 * — the camera prompt appeared on top of the add-a-device screen with no
 * explanation, which is the version most likely to be refused. And a refusal is
 * permanent: iOS shows its dialog once, after which request() returns denied
 * without displaying anything, so the feature is simply broken from then on
 * with no way for the app to ask again.
 *
 * So this explains all of them first, in our own words, and only then triggers
 * the OS prompts. The screen can be skipped: someone who does not want any of
 * this should not be trapped on it, and a permission refused here can still be
 * granted later from Settings.
 */

const ICONS: Record<PermissionKey, IconName> = {
  notifications: "bell",
  location: "pin",
  camera: "camera",
};

async function read(key: PermissionKey): Promise<PermissionState> {
  const map = (status: string): PermissionState =>
    status === "granted" ? "granted" : status === "undetermined" ? "undetermined" : "denied";
  try {
    if (key === "notifications") return map((await Notifications.getPermissionsAsync()).status);
    if (key === "location") return map((await Location.getForegroundPermissionsAsync()).status);
    return map((await Camera.getCameraPermissionsAsync()).status);
  } catch {
    // A module that will not answer is not a reason to block the app; treat it
    // as decided so the screen does not offer a button that cannot work.
    return "denied";
  }
}

async function request(key: PermissionKey): Promise<PermissionState> {
  const map = (status: string): PermissionState =>
    status === "granted" ? "granted" : status === "undetermined" ? "undetermined" : "denied";
  try {
    if (key === "notifications") {
      /*
       * Spelled out for iOS rather than left to the default.
       *
       * On iOS the alert/badge/sound set is decided at the moment of the
       * request and cannot be widened later without the user going to
       * Settings — so a default that happens not to include sound would mean
       * a silent alert about a door left open, permanently, and nothing in the
       * app could put it right.
       *
       * Announcements is deliberately absent: that is Siri reading
       * notifications aloud through headphones, which is not something to take
       * on somebody's behalf for device alerts.
       */
      return map(
        (
          await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          })
        ).status
      );
    }
    if (key === "location") return map((await Location.requestForegroundPermissionsAsync()).status);
    return map((await Camera.requestCameraPermissionsAsync()).status);
  } catch {
    return "denied";
  }
}

export async function firstRunNeeded(): Promise<boolean> {
  let ran = false;
  try {
    ran = (await AsyncStorage.getItem(RAN_KEY)) === "1";
  } catch {
    /* unreadable storage means we have no record, so treat it as not yet run */
  }
  const states = {} as Record<PermissionKey, PermissionState>;
  for (const p of PERMISSIONS) states[p.key] = await read(p.key);
  return shouldRunFirstRun(states, ran);
}

export async function markFirstRunDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(RAN_KEY, "1");
  } catch {
    /* worst case it is offered again next launch, which is survivable */
  }
}

export function FirstRunPermissions({ onDone }: { onDone: () => void }) {
  const { c } = useTheme();
  const [states, setStates] = useState<Record<PermissionKey, PermissionState>>({
    notifications: "undetermined",
    location: "undetermined",
    camera: "undetermined",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const next = {} as Record<PermissionKey, PermissionState>;
      for (const p of PERMISSIONS) next[p.key] = await read(p.key);
      setStates(next);
    })();
  }, []);

  const grantAll = useCallback(async () => {
    setBusy(true);
    try {
      /*
       * One at a time, in order, and awaited. Firing them together stacks
       * system dialogs on top of each other on Android and drops all but the
       * first on iOS — so some of them would never be asked and would look
       * like they had been refused.
       */
      for (const p of PERMISSIONS) {
        if (states[p.key] !== "undetermined") continue;
        const result = await request(p.key);
        setStates((s) => ({ ...s, [p.key]: result }));
      }
      await markFirstRunDone();
      onDone();
    } finally {
      setBusy(false);
    }
  }, [states, onDone]);

  const skip = useCallback(async () => {
    await markFirstRunDone();
    onDone();
  }, [onDone]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14 }}>
        <View style={{ gap: 6, marginTop: 8 }}>
          <Title>Before we start</Title>
          <Text style={{ color: c.textDim, fontSize: 15, lineHeight: 21 }}>
            Circuvent works better with a few permissions. Here is what each one is for — your phone will ask you to
            confirm.
          </Text>
        </View>

        <SectionLabel>What we ask for</SectionLabel>

        {PERMISSIONS.map((p) => (
          <Card key={p.key} padded>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.cardHi,
                }}
              >
                <Icon name={ICONS[p.key]} size={19} color={c.accent} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }}>{p.title}</Text>
                  {states[p.key] === "granted" ? (
                    <Text style={{ color: c.green, fontSize: 12, fontWeight: "700" }}>Allowed</Text>
                  ) : states[p.key] === "denied" ? (
                    <Text style={{ color: c.faint, fontSize: 12, fontWeight: "700" }}>Not now</Text>
                  ) : null}
                </View>
                <Text style={{ color: c.textDim, fontSize: 13, lineHeight: 19 }}>{p.why}</Text>
              </View>
            </View>
          </Card>
        ))}

        <Text style={{ color: c.faint, fontSize: 12, lineHeight: 18, marginTop: 2 }}>
          You can change any of these later in your phone&apos;s settings. Nothing here is required to use the app.
        </Text>

        <PrimaryButton label="Continue" onPress={grantAll} busy={busy} style={{ marginTop: 6 }} />
        <GhostButton label="Not now" onPress={skip} />
      </ScrollView>
    </Screen>
  );
}
