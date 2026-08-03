const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Tells Android that NEARBY_WIFI_DEVICES is not used to work out where the user
 * is.
 *
 * Android 13 introduced this permission so an app can scan for and connect to
 * nearby Wi-Fi without holding a location permission. By default the platform
 * still treats it as location-capable — because knowing which Wi-Fi networks are
 * in range is enough to place someone on a map — and Play's Data Safety review
 * treats it the same way.
 *
 * Circuvent uses it for one thing: joining the temporary setup hotspot that a
 * new device broadcasts, so the app can hand over the home's Wi-Fi credentials.
 * It never derives a position from what it sees. `neverForLocation` is how that
 * is stated to the platform, and it is a promise the app has to actually keep —
 * so if scan results are ever used for anything positional, this flag must come
 * off in the same change.
 *
 * Expo has no app.json field for the flag, hence a plugin.
 */
const PERMISSION = "android.permission.NEARBY_WIFI_DEVICES";

module.exports = function withNeverForLocation(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const list = manifest["uses-permission"] || [];

    const entry = list.find((p) => p?.$?.["android:name"] === PERMISSION);
    if (!entry) {
      // Not fatal: the permission comes from app.json and could legitimately be
      // dropped. Failing the build over an absent permission would be worse
      // than the warning.
      console.warn(
        `[withNeverForLocation] ${PERMISSION} not present in the manifest — nothing to flag.`
      );
      return cfg;
    }

    entry.$["android:usesPermissionFlags"] = "neverForLocation";
    return cfg;
  });
};
