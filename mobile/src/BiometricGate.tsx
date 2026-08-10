import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useTheme, PrimaryButton, GhostButton, Screen, Title } from "./ui";
import { biometricAvailable, shouldLock } from "./first-run";

const ENABLED_KEY = "cv-biometric-lock";

/*
 * Fingerprint and face unlock.
 *
 * The app already needs a sign-in; this is a second, local gate on top of it,
 * for the case the sign-in cannot help with — a phone that is unlocked and in
 * somebody else's hands. The session stays valid; what is gated is seeing it.
 *
 * Everything about when to lock lives in ./first-run so it can be tested. What
 * is here is the part that has to talk to the OS.
 */

export async function biometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* a preference that will not persist is not worth failing a screen over */
  }
}

/** What this device can actually do, asked of the OS rather than assumed. */
export async function biometricCapability() {
  const [hasHardware, isEnrolled, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
  ]);
  return {
    hasHardware,
    isEnrolled,
    // SECRET is a PIN, pattern or passcode. It counts, because the OS will
    // accept it as the fallback when a finger is not recognised.
    hasPasscode: level !== LocalAuthentication.SecurityLevel.NONE,
  };
}

/**
 * Gates its children behind a fingerprint.
 *
 * Fails closed on the prompt, open on capability: a device that cannot
 * authenticate anybody is not locked, because the alternative is somebody
 * locked out of their own app with no way back. A refused or cancelled prompt
 * keeps the gate shut and offers to try again — that one has a way out, which
 * is to authenticate.
 */
export function BiometricGate({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const [locked, setLocked] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const authenticate = useCallback(async () => {
    // One prompt at a time. AppState can fire twice on some Android versions,
    // and a second call while the sheet is open cancels the first — which the
    // user sees as the prompt vanishing the instant it appears.
    if (prompting.current) return;
    prompting.current = true;
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Circuvent",
        // Lets the OS fall back to the device passcode, which is what makes
        // this usable with a wet finger or a mask.
        disableDeviceFallback: false,
        cancelLabel: "Cancel",
      });
      if (r.success) {
        setLocked(false);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      prompting.current = false;
    }
  }, []);

  const evaluate = useCallback(async () => {
    const [enabled, cap] = await Promise.all([biometricEnabled(), biometricCapability()]);
    const decision = shouldLock({
      enabled,
      available: biometricAvailable(cap),
      backgroundedAt: backgroundedAt.current,
      now: Date.now(),
    });
    if (decision.lock) {
      setLocked(true);
      void authenticate();
    } else {
      setLocked(false);
    }
  }, [authenticate]);

  useEffect(() => {
    void evaluate();

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        backgroundedAt.current = Date.now();
      } else if (next === "active") {
        void evaluate();
      }
    });
    return () => sub.remove();
  }, [evaluate]);

  // Nothing is rendered until we know. Showing the app for one frame and then
  // covering it defeats the point of covering it.
  if (locked === null) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!locked) return <>{children}</>;

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 44 }}>🔒</Text>
        <Title>Locked</Title>
        <Text style={{ color: c.textDim, textAlign: "center" }}>
          {failed
            ? "That did not unlock. Try again, or use your device passcode."
            : "Unlock with your fingerprint or face to continue."}
        </Text>
        <PrimaryButton label="Unlock" onPress={() => void authenticate()} style={{ minWidth: 200, marginTop: 8 }} />
        {failed ? (
          <GhostButton
            label="Turn off the app lock"
            onPress={async () => {
              // The way out that does not require the sensor to start working.
              // Anything else strands somebody whose reader has broken.
              await setBiometricEnabled(false);
              setLocked(false);
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}
