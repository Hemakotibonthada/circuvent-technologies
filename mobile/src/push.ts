import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    /*
     * shouldShowAlert was split in SDK 53. iOS distinguishes a banner from a
     * Notification Centre entry, and the single old flag could not say which,
     * so it is deprecated in favour of the two below. Both are set: a delivery
     * alert the user misses should still be waiting in the list, because these
     * carry device events — a door unlocking, a tank filling — that matter
     * after the banner has gone.
     */
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function registerForPush(): Promise<string | null> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return null;

    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}
