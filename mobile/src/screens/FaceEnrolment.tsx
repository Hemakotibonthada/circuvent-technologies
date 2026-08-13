/**
 * Face enrolment for the FaceDoor lock.
 *
 * Two ways in, because they suit different moments. From this phone, for
 * somebody who is here now or for yourself; or at the door, for somebody
 * standing in front of it while you are elsewhere.
 *
 * Several faces per person on purpose. One sample is a lock that stops
 * recognising you the day you shave, put glasses on, or come home after dark —
 * so the screen keeps asking for more and says how many are stored.
 *
 * No photograph is kept. The image goes to the server, becomes a descriptor
 * and is dropped; the screen says so, because a household face database is a
 * thing people are right to ask about.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api, type FaceProfile, type FaceAttempt } from "../api";
import { C } from "../theme";

interface Props {
  deviceId: string;
  deviceName?: string;
  onClose?: () => void;
}

export default function FaceEnrolment({ deviceId, deviceName, onClose }: Props) {
  const [profiles, setProfiles] = useState<FaceProfile[]>([]);
  const [attempts, setAttempts] = useState<FaceAttempt[]>([]);
  const [limits, setLimits] = useState({ maxSamples: 12, maxProfiles: 50 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [capturingFor, setCapturingFor] = useState<FaceProfile | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, a] = await Promise.all([
        api.faceProfiles(deviceId),
        api.faceAttempts(deviceId, 25),
      ]);
      if (!p.ok) throw new Error("load failed");
      setProfiles(p.data.profiles ?? []);
      setLimits(p.data.limits ?? limits);
      /* Attempts are a nice-to-have beside the roster; a door with no history
         yet must still show who is enrolled. */
      setAttempts(a.ok ? a.data.attempts ?? [] : []);
    } catch {
      setError("Could not load who is enrolled on this door.");
    }
    setLoading(false);
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addPerson = useCallback(async () => {
    // Kept deliberately small: a name is the only thing needed to start, and
    // asking for a role and a schedule before a single face exists is how an
    // enrolment gets abandoned half-finished.
    Alert.prompt?.(
      "Who is this?",
      "Their name appears in the door's history.",
      async (name?: string) => {
        if (!name?.trim()) return;
        setBusy(true);
        try {
          const r = await api.createFaceProfile({ deviceId, name: name.trim() });
          if (!r.ok) {
            throw new Error((r.data as { error?: string })?.error || "Could not add that person.");
          }
          await load();
          setCapturingFor({ ...r.data.profile, samples: 0 } as FaceProfile);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not add that person.");
        }
        setBusy(false);
      }
    );
  }, [deviceId, load]);

  const capture = useCallback(async () => {
    if (!camera.current || !capturingFor) return;
    setBusy(true);
    setError("");
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (!shot?.uri) throw new Error("The camera returned nothing.");

      const blob = await (await fetch(shot.uri)).blob();
      const r = await api.enrolFaceImage(capturingFor.id, blob);
      if (!r.ok) {
        /* The server's wording is used verbatim: it distinguishes "no face in
           this photo" from "that is somebody else" from "too similar to one you
           already took", and each needs a different thing done about it. */
        throw new Error((r.data as { error?: string })?.error || "That capture did not work.");
      }

      await load();
      if (r.data.remaining <= 0) {
        setCapturingFor(null);
        Alert.alert("Enrolled", `${capturingFor.name} is fully enrolled.`);
      } else {
        /*
         * Asking for a *different* angle rather than "take another": the
         * server rejects a near-duplicate, and telling somebody to repeat
         * themselves and then refusing the result is a maddening loop.
         */
        Alert.alert(
          "Captured",
          `${r.data.total} stored. Turn your head slightly, or take off your glasses, and capture again.`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That capture did not work.");
    }
    setBusy(false);
  }, [capturingFor, load]);

  const enrolAtDoor = useCallback(
    async (profile?: FaceProfile) => {
      setBusy(true);
      setError("");
      try {
        const r = await api.startFaceEnrolment(
          profile ? { deviceId, profileId: profile.id } : { deviceId, name: "New person" }
        );
        if (!r.ok) throw new Error("start failed");
        Alert.alert(
          "Enrolling at the door",
          `${r.data.name} has ${r.data.seconds} seconds. Ask them to look at the door camera.`
        );
        await load();
      } catch {
        setError("Could not start enrolment at the door.");
      }
      setBusy(false);
    },
    [deviceId, load]
  );

  const removePerson = useCallback(
    (p: FaceProfile) => {
      Alert.alert(`Remove ${p.name}?`, "The door will stop opening for them.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await api.deleteFaceProfile(p.id);
            await load();
          },
        },
      ]);
    },
    [load]
  );

  const s = styles();

  if (capturingFor) {
    if (!permission?.granted) {
      return (
        <View style={s.center}>
          <Text style={s.title}>Camera access is needed to enrol a face</Text>
          <Pressable style={s.primary} onPress={() => void requestPermission()}>
            <Text style={s.primaryText}>Allow camera</Text>
          </Pressable>
          <Pressable onPress={() => setCapturingFor(null)}>
            <Text style={s.link}>Cancel</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={s.cameraWrap}>
        <CameraView ref={camera} style={s.camera} facing="front" />
        <View style={s.cameraOverlay}>
          <Text style={s.cameraTitle}>Enrolling {capturingFor.name}</Text>
          <Text style={s.cameraHint}>
            {capturingFor.samples} of {limits.maxSamples} faces stored. Fill the frame, look
            straight at the camera, then capture again from a different angle.
          </Text>
          {!!error && <Text style={s.error}>{error}</Text>}
          <View style={s.row}>
            <Pressable style={s.primary} disabled={busy} onPress={() => void capture()}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Capture</Text>}
            </Pressable>
            <Pressable style={s.secondary} onPress={() => setCapturingFor(null)}>
              <Text style={s.secondaryText}>Done</Text>
            </Pressable>
          </View>
          <Text style={s.privacy}>
            The photo is not saved. It becomes a mathematical descriptor and is discarded.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.title}>Faces on {deviceName || "this door"}</Text>
      <Text style={s.sub}>
        Enrol several faces per person — glasses on and off, and after dark. One face is a lock
        that stops recognising somebody the day they shave.
      </Text>

      {!!error && <Text style={s.error}>{error}</Text>}
      {loading && <ActivityIndicator style={{ marginVertical: 24 }} color={C.cyan} />}

      {!loading && profiles.length === 0 && (
        <Text style={s.empty}>Nobody is enrolled yet. This door will not open on a face.</Text>
      )}

      {profiles.map((p) => (
        <View key={p.id} style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.name}>{p.name}</Text>
            <Text style={[s.badge, { color: p.enabled ? "#34d399" : C.textDim }]}>
              {p.enabled ? p.role : "suspended"}
            </Text>
          </View>
          <Text style={s.meta}>
            {p.samples} face{p.samples === 1 ? "" : "s"} enrolled
            {p.samples === 0 ? " — will not be recognised yet" : ""}
            {p.allowFrom && p.allowTo ? ` · ${p.allowFrom}–${p.allowTo}` : ""}
          </Text>
          <View style={s.row}>
            <Pressable style={s.secondary} onPress={() => setCapturingFor(p)}>
              <Text style={s.secondaryText}>Add a face</Text>
            </Pressable>
            <Pressable style={s.secondary} onPress={() => void enrolAtDoor(p)}>
              <Text style={s.secondaryText}>At the door</Text>
            </Pressable>
            <Pressable
              style={s.secondary}
              onPress={() =>
                void api.updateFaceProfile(p.id, { enabled: !p.enabled }).then(load)
              }
            >
              <Text style={s.secondaryText}>{p.enabled ? "Suspend" : "Resume"}</Text>
            </Pressable>
            <Pressable style={s.danger} onPress={() => removePerson(p)}>
              <Text style={s.dangerText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Pressable style={s.primary} disabled={busy} onPress={() => void addPerson()}>
        <Text style={s.primaryText}>Enrol somebody new</Text>
      </Pressable>
      <Pressable style={s.secondary} disabled={busy} onPress={() => void enrolAtDoor()}>
        <Text style={s.secondaryText}>Enrol at the door instead</Text>
      </Pressable>

      {attempts.length > 0 && (
        <>
          <Text style={s.section}>Recent attempts</Text>
          {/* Refusals included, and first-class: a stranger at the door at 3am
              is the entry somebody wants to find, and a feed built only from
              successful unlocks would be missing exactly that. */}
          {attempts.slice(0, 12).map((a) => (
            <View key={a.id} style={s.attempt}>
              <Text style={[s.attemptDot, { color: a.granted ? "#34d399" : "#f87171" }]}>●</Text>
              <Text style={s.attemptText}>
                {a.granted ? `${a.name} let in` : a.reason}
              </Text>
              <Text style={s.attemptAt}>{new Date(a.at).toLocaleString()}</Text>
            </View>
          ))}
        </>
      )}

      {onClose && (
        <Pressable onPress={onClose}>
          <Text style={s.link}>Close</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = () =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, gap: 10, paddingBottom: 48 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24, backgroundColor: C.bg },
    title: { color: C.text, fontSize: 20, fontWeight: "800" },
    sub: { color: C.textDim, fontSize: 13, lineHeight: 19 },
    section: { color: C.text, fontSize: 15, fontWeight: "700", marginTop: 18 },
    empty: { color: C.textDim, fontSize: 13, paddingVertical: 18, textAlign: "center" },
    error: { color: "#f87171", fontSize: 13 },
    card: { backgroundColor: C.surface, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: C.border },
    cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    name: { color: C.text, fontSize: 16, fontWeight: "700" },
    badge: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
    meta: { color: C.textDim, fontSize: 12 },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    primary: { minHeight: 48, borderRadius: 12, backgroundColor: C.cyan, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
    primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    secondary: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
    secondaryText: { color: C.text, fontWeight: "600", fontSize: 13 },
    danger: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#7f1d1d", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
    dangerText: { color: "#fca5a5", fontWeight: "600", fontSize: 13 },
    link: { color: C.cyan, fontSize: 14, textAlign: "center", paddingVertical: 14 },
    cameraWrap: { flex: 1, backgroundColor: "#000" },
    camera: { flex: 1 },
    cameraOverlay: { padding: 16, gap: 10, backgroundColor: "rgba(0,0,0,0.85)" },
    cameraTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
    cameraHint: { color: "#cbd5e1", fontSize: 13, lineHeight: 19 },
    privacy: { color: "#94a3b8", fontSize: 11, lineHeight: 16 },
    attempt: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
    attemptDot: { fontSize: 10 },
    attemptText: { color: C.text, fontSize: 13, flex: 1 },
    attemptAt: { color: C.textDim, fontSize: 11 },
  });
