# Attendance single sign-on

The attendance consumer console uses My Account (`https://myaccount.circuvent.com`)
with a dedicated `attendance` OAuth client. Password, OTP and passkey sign-in remain available.

## Deployment

1. Deploy Auth.circuvent migration `0028_attendance_sso.sql` through its normal migration process.
   If the legacy migration ledger has unrelated pending entries, run
   `node scripts/register-attendance.mjs` from Auth.circuvent to apply only the
   idempotent Attendance registration. This does not alter the migration ledger.
   It registers exact callback URLs, the Attendance app and its member role. It does not
   grant users access, enable a default role, or overwrite existing client configuration.
2. In My Account, grant intended users or groups the Attendance member role. Existing
   HRMS/device grants are deliberately not copied. The Attendance tile then appears for authorized users.
3. Configure WebSite with `ATTENDANCE_SSO_CLIENT_ID=attendance` and
   `ATTENDANCE_SSO_ISSUER=https://myaccount.circuvent.com` (both are defaults).
   Set a stable random `ATTENDANCE_SSO_SECRET` of at least 32 characters, or use the
   existing `ACCOUNT_SECRET`. Never put either secret in a NEXT_PUBLIC variable.
   All website instances must share the same secret.
4. Configure the control-plane API with `ATTENDANCE_SSO_CLIENT_ID=attendance` and
   `ATTENDANCE_SSO_ISSUER=https://myaccount.circuvent.com`. Keep its existing
   `SSO_CLIENT_ID` and `AUTH_ISSUER` unchanged: each client is bound to its own
   configured issuer, with separate discovery/key caches. Restart/deploy the API.
5. Deploy WebSite with its existing `CONTROL_PLANE_URL` pointing at that API.
   Existing production-identity environment isolation remains enforced.

For local testing the registered callback is
`http://localhost:3014/api/attendance/auth/sso/callback`; open `/smarthome/attendance`.
Use an isolated identity/control-plane environment and register the corresponding
client there. Do not disable production environment guards to test locally.

## Identity and permissions

The authorization-code flow uses S256 PKCE, random state and nonce. An encrypted,
HttpOnly cookie binds the callback to its browser. The control plane validates the
ID token's signature, issuer, audience and expiry; Attendance additionally requires
an explicitly verified email and subject. It reuses the existing account with that
email, preserving site ownership and roles, or provisions a normal account.
My Account app access is not a grant of site membership or administration: new users
still need the existing site invitation/permission workflow.

Console credentials travel through a short-lived encrypted HttpOnly cookie and a
same-origin POST, never through URL parameters. The cookie is cleared after handoff.
The console then uses its existing session/refresh/logout lifecycle. Local console
logout does not end the user's My Account browser session.

## Verification

Run `npx jest tests/attendance-sso.test.ts tests/attendance-sso-routes.test.ts --runInBand`
in WebSite and `node --import tsx --test src/sso.test.ts` in platform/api.
After deployment, verify a granted existing user retains their sites; a granted new
user has no unsolicited sites; an ungranted user is denied; cancelled sign-in shows
a retryable error; and password sign-in still works. No live migration or deployment
is performed by these tests.
