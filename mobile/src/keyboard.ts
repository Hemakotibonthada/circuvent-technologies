import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * How much of the screen the keyboard is currently covering.
 *
 * KeyboardAvoidingView was doing this job and doing it only on iOS — it was
 * given `behavior={undefined}` on Android, which makes it an ordinary View. The
 * obvious repair is `behavior="height"`, which relies on the window being
 * resized when the keyboard opens. That is exactly what stopped being reliable:
 * with edge-to-edge layout, adjustResize no longer shrinks the window on recent
 * Android, so the view never learns there is a keyboard. It worked on the
 * emulator and failed on a real phone, which is the signature of relying on a
 * window behaviour rather than measuring.
 *
 * Asking the keyboard how tall it is works whatever the window does.
 *
 * The events differ per platform: iOS emits keyboardWillShow before the
 * animation, so a layout driven by it moves with the keyboard rather than after
 * it. Android does not emit the Will events at all, so it has to use Did.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (e) => {
      setHeight(e?.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
