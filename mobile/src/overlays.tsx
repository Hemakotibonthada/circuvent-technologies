/**
 * Overlay primitives: sheets, prompts, confirmations and an error boundary.
 *
 * WHY THESE ARE HERE AND NOT IN ui.tsx
 *
 * ui.tsx is already 1,650 lines and owns the theme context that everything
 * else imports. These are leaf components that consume that context, so
 * keeping them separate avoids growing a file every screen depends on — and
 * it keeps the import graph acyclic.
 *
 * WHAT THEY REPLACE
 *
 * `Alert.prompt` is iOS-only. The app called it as `Alert.prompt?.(...)`,
 * which on Android evaluates to undefined and does nothing at all — no
 * dialog, no error, no feedback. Two user-visible features were dead on
 * Android as a result: renaming a device from its control screen, and setting
 * the kiosk exit PIN. Optional chaining turned a crash into a silence, which
 * is the harder failure to notice.
 *
 * `Alert.alert` for confirmation works on both platforms but cannot be themed
 * and cannot carry a destructive-action affordance beyond a red word, so
 * ConfirmSheet exists for anything irreversible.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { useTheme, useSafeArea, useReduceMotion, PrimaryButton, GhostButton } from "./ui";
import { useKeyboardHeight } from "./keyboard";
import { RADIUS, SPACE, TYPE, MOTION } from "./theme";
import { Icon, type IconName } from "./icons";

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Fraction of the screen the sheet may occupy before it scrolls. */
  maxHeightRatio?: number;
  /** Hides the grab handle for sheets that must be dismissed deliberately. */
  dismissable?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A bottom sheet.
 *
 * Every quick action in this app used to be a full-screen push: reassigning a
 * room, confirming a delete, picking a colour. That loses the user's place for
 * an interaction that lasts two seconds, and on a phone it reads as leaving the
 * screen rather than acting on it.
 *
 * Rendered as an absolutely-positioned overlay rather than a React Native
 * <Modal>. Modal opens a separate native window, which sits above the app's
 * own toast host and status bar treatment and cannot be blurred against the
 * content behind it — the two would fight, and the sheet would win in a way
 * that looks like a bug.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  maxHeightRatio = 0.82,
  dismissable = true,
  style,
}: SheetProps) {
  const { c, scheme } = useTheme();
  const insets = useSafeArea();
  const reduceMotion = useReduceMotion();
  /*
   * The sheet sits at the bottom of the screen, which is where the keyboard
   * appears — so a sheet with a text field in it was covered by the keyboard
   * the moment that field was focused. Measured rather than left to
   * KeyboardAvoidingView, which was doing nothing at all on Android.
   */
  const kb = useKeyboardHeight();
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? 0 : visible ? MOTION.base : MOTION.fast,
      easing: Easing.bezier(...(MOTION.bezier as [number, number, number, number])),
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Unmounted only after the exit animation, so the content does not
      // vanish a frame before the sheet has finished leaving.
      if (finished && !visible) setMounted(false);
    });
  }, [visible, slide, reduceMotion]);

  if (!mounted) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: slide }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissable ? onClose : undefined}
          accessibilityRole="button"
          accessibilityLabel="Close"
          // The scrim is decoration for sighted users; the sheet itself carries
          // the accessible close affordance, so this stays out of the a11y tree
          // on iOS where it would otherwise be read as an unlabelled button.
          accessibilityElementsHidden={!dismissable}
          importantForAccessibility={dismissable ? "yes" : "no-hide-descendants"}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} />
        </Pressable>
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end", paddingBottom: kb }}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            {
              transform: [{ translateY }],
              maxHeight: `${Math.round(maxHeightRatio * 100)}%`,
              borderTopLeftRadius: RADIUS.tile,
              borderTopRightRadius: RADIUS.tile,
              overflow: "hidden",
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: c.border,
              backgroundColor: c.isGlass ? "transparent" : c.card,
              paddingBottom: insets.bottom + SPACE.lg,
            },
            style,
          ]}
          accessibilityViewIsModal
        >
          {c.isGlass ? (
            /* Opaque base first: the blur below it is an effect, not the thing
               keeping the sheet readable. */
            <View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} />
          ) : null}
          {c.isGlass ? (
            <BlurView
              intensity={scheme === "dark" ? 60 : 80}
              tint={scheme === "dark" ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {c.isGlass ? <View style={[StyleSheet.absoluteFill, { backgroundColor: c.glassFill }]} /> : null}

          {dismissable ? (
            <View style={{ alignItems: "center", paddingTop: SPACE.sm }}>
              <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: c.faint, opacity: 0.5 }} />
            </View>
          ) : null}

          {title ? (
            <View style={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg, paddingBottom: subtitle ? 2 : SPACE.sm }}>
              <Text style={{ color: c.text, ...TYPE.section }}>{title}</Text>
              {subtitle ? (
                <Text style={{ color: c.textDim, fontSize: TYPE.body.fontSize, marginTop: 4, lineHeight: 20 }}>{subtitle}</Text>
              ) : null}
            </View>
          ) : null}

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: SPACE.xl, paddingTop: title ? SPACE.md : SPACE.lg, paddingBottom: SPACE.sm }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  keyboardType?: "default" | "number-pad" | "email-address";
  secure?: boolean;
  maxLength?: number;
  /** Return a message to keep the sheet open and show an error. */
  validate?: (value: string) => string | null;
}

/**
 * A text prompt that works on both platforms.
 *
 * Alert.prompt exists only on iOS. The app guarded it with `?.`, so on Android
 * the call evaluated to undefined and nothing happened — no dialog, no error,
 * no log. Renaming a device and setting the kiosk PIN were both dead there,
 * and because the guard suppressed the crash there was nothing to notice.
 *
 * Returns a promise so callers read the same as the API they are replacing:
 *   const name = await prompt({ title: "Rename" });
 *   if (name) patch(id, { name });
 * Resolving to null on cancel keeps "the user declined" distinct from "the
 * user submitted an empty string", which a callback with one argument cannot.
 */
export function usePrompt() {
  const [state, setState] = useState<{
    opts: PromptOptions;
    resolve: (v: string | null) => void;
  } | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const prompt = useCallback((opts: PromptOptions) => {
    setValue(opts.initialValue ?? "");
    setError(null);
    return new Promise<string | null>((resolve) => setState({ opts, resolve }));
  }, []);

  const close = useCallback(
    (result: string | null) => {
      Keyboard.dismiss();
      setState((s) => {
        s?.resolve(result);
        return null;
      });
    },
    []
  );

  const submit = useCallback(() => {
    if (!state) return;
    const problem = state.opts.validate?.(value) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    close(value);
  }, [state, value, close]);

  const node = useMemo(
    () =>
      state ? (
        <PromptSheet
          opts={state.opts}
          value={value}
          error={error}
          onChange={(t) => {
            setValue(t);
            if (error) setError(null);
          }}
          onCancel={() => close(null)}
          onSubmit={submit}
        />
      ) : null,
    [state, value, error, close, submit]
  );

  return { prompt, promptNode: node };
}

function PromptSheet({
  opts,
  value,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  opts: PromptOptions;
  value: string;
  error: string | null;
  onChange: (t: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { c } = useTheme();
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    // A prompt exists to be typed into. Anything less than a short delay races
    // the sheet's entrance animation on Android and the keyboard opens behind
    // the sheet.
    const t = setTimeout(() => ref.current?.focus(), 220);
    return () => clearTimeout(t);
  }, []);

  return (
    <Sheet visible onClose={onCancel} title={opts.title} subtitle={opts.message}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        placeholder={opts.placeholder}
        placeholderTextColor={c.faint}
        secureTextEntry={opts.secure}
        keyboardType={opts.keyboardType ?? "default"}
        maxLength={opts.maxLength}
        onSubmitEditing={onSubmit}
        returnKeyType="done"
        accessibilityLabel={opts.title}
        style={{
          color: c.text,
          fontSize: 16,
          paddingVertical: 13,
          paddingHorizontal: 14,
          borderRadius: RADIUS.control,
          borderWidth: 1,
          borderColor: error ? c.red : c.border,
          backgroundColor: c.surface,
        }}
      />
      {error ? (
        <Text style={{ color: c.red, fontSize: 12, marginTop: 8 }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.lg }}>
        <View style={{ flex: 1 }}>
          <GhostButton label={opts.cancelLabel ?? "Cancel"} onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton label={opts.confirmLabel ?? "Save"} onPress={onSubmit} />
        </View>
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm                                                             */
/* ------------------------------------------------------------------ */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the confirm control as destructive and requires a deliberate tap. */
  destructive?: boolean;
  icon?: IconName;
}

/**
 * A themed confirmation, for anything that cannot be undone.
 *
 * Alert.alert works on both platforms but is a system dialog: it cannot carry
 * the app's theme, and its "destructive" styling is a red word among three
 * identical buttons. Deleting a device, clearing a card and revoking a session
 * all deserve a control that looks different from the one that dismisses it.
 */
export function useConfirm() {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setState({ opts, resolve }));
  }, []);

  const close = useCallback((result: boolean) => {
    setState((s) => {
      s?.resolve(result);
      return null;
    });
  }, []);

  const node = state ? (
    <ConfirmSheet opts={state.opts} onCancel={() => close(false)} onConfirm={() => close(true)} />
  ) : null;

  return { confirm, confirmNode: node };
}

function ConfirmSheet({
  opts,
  onCancel,
  onConfirm,
}: {
  opts: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { c } = useTheme();
  const tone = opts.destructive ? c.red : c.accent;

  return (
    <Sheet visible onClose={onCancel} title={opts.title} subtitle={opts.message}>
      {opts.icon ? (
        <View style={{ alignItems: "center", marginBottom: SPACE.md }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: opts.destructive ? "rgba(239,68,68,0.14)" : c.surfaceHi,
            }}
          >
            <Icon name={opts.icon} size={24} color={tone} />
          </View>
        </View>
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        <Pressable
          onPress={onConfirm}
          accessibilityRole="button"
          accessibilityLabel={opts.confirmLabel ?? "Confirm"}
          style={{
            minHeight: 48,
            borderRadius: RADIUS.control,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: opts.destructive ? c.red : c.accent,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
            {opts.confirmLabel ?? (opts.destructive ? "Delete" : "Confirm")}
          </Text>
        </Pressable>
        <GhostButton label={opts.cancelLabel ?? "Cancel"} onPress={onCancel} />
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Error boundary                                                      */
/* ------------------------------------------------------------------ */

interface BoundaryState {
  error: Error | null;
}

/**
 * Keeps one broken screen from taking the whole app with it.
 *
 * React unmounts the entire tree on an uncaught render error. Without a
 * boundary that means a white screen and a force-quit — on a phone controlling
 * a house, with no way back to the lights. This catches the error, shows what
 * happened, and offers a way back to a screen that works.
 *
 * A class, because there is still no hook equivalent of componentDidCatch.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void; label?: string },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Kept to the console rather than sent anywhere: this app has no crash
    // reporter wired, and inventing one here would be a privacy decision made
    // in a component. The message is what a developer needs from a bug report.
    console.error(`[${this.props.label ?? "app"}] render failed`, error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <BoundaryFallback
        error={this.state.error}
        onReset={() => {
          this.setState({ error: null });
          this.props.onReset?.();
        }}
      />
    );
  }
}

function BoundaryFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 28 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(239,68,68,0.14)",
          marginBottom: SPACE.lg,
        }}
      >
        <Icon name="warning" size={30} color={c.red} />
      </View>
      <Text style={{ color: c.text, ...TYPE.title, textAlign: "center" }}>
        This screen stopped working
      </Text>
      <Text style={{ color: c.textDim, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 }}>
        The rest of the app is fine — your devices are still connected. Go back and try again.
      </Text>
      {/* The message, verbatim. A generic apology gives a user nothing to put
          in a bug report and gives us nothing to act on. */}
      <Text
        style={{
          color: c.faint,
          fontSize: 11,
          textAlign: "center",
          marginTop: SPACE.md,
          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        }}
        numberOfLines={3}
      >
        {error.message}
      </Text>
      <View style={{ marginTop: SPACE.xl, alignSelf: "stretch" }}>
        <PrimaryButton label="Go back" onPress={onReset} />
      </View>
    </View>
  );
}
