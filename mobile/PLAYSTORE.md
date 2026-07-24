# Publishing the Circuvent app to Google Play

A **signed production Android App Bundle (.aab)** has been built and is ready to
upload:

```
mobile\android\app\build\outputs\bundle\release\app-release.aab   (~37 MB)
```

It is signed with the **Circuvent upload key**:

```
Keystore : mobile\credentials\circuvent-upload.jks   (git-ignored — NOT committed)
Alias    : circuvent
Store/key password : Circuvent#2026
SHA-256  : 1E:34:2C:74:A6:CE:AB:E9:12:32:78:C1:EF:99:AE:2B:4E:9E:D8:F6:EF:D3:76:85:14:DE:43:B8:55:D5:0D:3B
```

> ⚠️ **Back this keystore + password up somewhere safe (password manager / secure
> storage).** Every future Play update must be signed with the SAME upload key.
> If you lose it you can reset it via Play App Signing, but keep it to avoid pain.

App identity: package `com.circuvent.app`, versionName `1.0.0`, versionCode `1`.
Bump `expo.android.versionCode` in `app.json` for each new upload.

---

## Option A — Upload the ready .aab manually (fastest first release)

1. <https://play.google.com/console> → **Create app** (name **Circuvent**,
   type App, Free). Complete the one-time declarations Play asks for:
   Privacy Policy URL (`https://circuvent.com/privacy`), Data safety, Content
   rating questionnaire, Target audience, Ads (No), App access (give a test
   login), and select your countries.
2. **Test and release → Testing → Internal testing → Create new release**.
3. Since you'll upload our own signed AAB, when prompted about **Play App
   Signing**, choose to **use the key from the uploaded bundle** (Google keeps a
   separate app-signing key and treats ours as the upload key) — this is the
   default and recommended.
4. **Upload** `app-release.aab`, add release notes, **Save → Review → Roll out
   to Internal testing**.
5. Add your Google account as an internal tester, open the opt-in link on your
   phone, install from Play. Promote to **Closed → Open → Production** when ready
   (Production requires the full store listing: screenshots, feature graphic,
   icon, descriptions).

---

## Option B — EAS Build + Submit (reproducible, cloud-managed key)

Best for ongoing releases; Expo builds + signs in the cloud and can push to Play.

```bash
cd mobile
npm i -g eas-cli && eas login
eas init                        # once — creates the EAS project id
eas build -p android --profile production   # produces a signed .aab in the cloud
```

To auto-submit to Play you need a **Google Play service account JSON** (Play
Console → Setup → API access → create/link a service account with the
*Release manager* role, download the JSON key):

```bash
eas submit -p android --latest --profile production \
  --key path\to\play-service-account.json
```

`eas.json` already defines the `production` profile (`buildType: app-bundle`).
Let EAS manage credentials, OR reuse the keystore above:
`eas credentials` → Android → provide `circuvent-upload.jks` + passwords.

---

## Rebuilding the signed .aab locally

The upload signing is wired into `mobile\android\app\build.gradle` and reads the
`CIRCUVENT_UPLOAD_*` props from `mobile\android\gradle.properties` (both under the
git-ignored `android/`). After `expo prebuild -p android --clean` (which
regenerates `android/`) re-apply those props + the `signingConfigs.release`
block, then:

```bash
cd mobile\android
.\gradlew.bat bundleRelease        # -> app\build\outputs\bundle\release\app-release.aab
.\gradlew.bat assembleRelease      # -> ...\apk\release\app-release.apk (sideload/testing)
```

(EAS avoids this manual step — it re-applies signing automatically.)

---

## Store listing checklist (Production)

- App icon 512×512, feature graphic 1024×500, ≥ 2 phone screenshots.
- Short (80 char) + full description.
- Privacy policy URL, support email, category **House & Home**.
- Data safety: declare account (email), device controls, and that data is
  encrypted in transit (TLS) and you don't sell it.
