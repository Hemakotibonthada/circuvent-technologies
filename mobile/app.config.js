const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * Dynamic Expo config.
 *
 * app.json remains the source of truth — Expo passes it in as `config` and this
 * file returns it unchanged unless CV_PERSONAL_TEAM=1.
 *
 * WHY THE PERSONAL-TEAM VARIANT EXISTS
 *
 * A free Apple ID ("Personal Team") cannot provision three of the capabilities
 * this app declares:
 *
 *   com.apple.developer.networking.wifi-info              (react-native-wifi-reborn)
 *   com.apple.developer.networking.HotspotConfiguration   (react-native-wifi-reborn)
 *   aps-environment                                       (expo-notifications)
 *
 * Xcode refuses to create a provisioning profile at all when they are present,
 * so the app cannot be installed on a phone for testing — the build fails with
 * "Personal development teams ... do not support the Access WiFi Information,
 * Hotspot, and Push Notifications capabilities".
 *
 * Setting CV_PERSONAL_TEAM=1 removes those entitlements so a free account can
 * sign and install the app.
 *
 * WHAT THAT COSTS
 *
 *   - Wi-Fi device onboarding (joining a device's setup hotspot) stops working.
 *   - Push notifications never arrive.
 *
 * Everything else, Siri included, behaves normally. This is a local testing
 * variant only: release builds go through EAS without the flag and keep every
 * capability.
 */

/** Removes entitlements a free Apple ID cannot provision. */
function withoutPersonalTeamBlockers(config) {
  return withEntitlementsPlist(config, (cfg) => {
    // Applied after the other plugins have written theirs, so this deletes the
    // finished result rather than racing whoever added it.
    delete cfg.modResults["com.apple.developer.networking.wifi-info"];
    delete cfg.modResults["com.apple.developer.networking.HotspotConfiguration"];
    delete cfg.modResults["aps-environment"];
    return cfg;
  });
}

module.exports = ({ config }) => {
  if (process.env.CV_PERSONAL_TEAM !== "1") return config;

  // A free Apple ID cannot claim an identifier another team has registered.
  // Overridable so two people can each build on their own account.
  const bundleIdentifier =
    process.env.CV_BUNDLE_ID || config.ios?.bundleIdentifier || "com.circuvent.app";

  const personal = {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier,
    },
  };

  return withoutPersonalTeamBlockers(personal);
};
