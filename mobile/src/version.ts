// Single source of truth for the version string shown in the UI.
//
// Settings previously hardcoded "1.0.0" inline, which had drifted four releases
// behind app.json — so the About screen was telling users the wrong version.
// Keep these two values in step with `expo.version` / `expo.android.versionCode`
// in app.json; `npm run version:check` fails the build if they diverge.

export const APP_VERSION = "1.11.0";
export const APP_BUILD = 13;
