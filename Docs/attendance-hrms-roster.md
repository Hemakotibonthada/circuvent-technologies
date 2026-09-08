# Attendance employee sync

The attendance People view automatically requests a roster sync on opening an office site and provides a manual retry button. The control plane checks site ownership before requesting any HRMS data. A missing connection is shown as a configuration error, never an empty successful sync.

Configure the following server-only variables before deploying:

- Control-plane API: `HRMS_ATTENDANCE_URL` (the HRMS HTTPS origin) and `ATTENDANCE_ROSTER_TOKEN` (a dedicated random integration secret).
- HRMS: the same `ATTENDANCE_ROSTER_TOKEN`, and `ATTENDANCE_ROSTER_SITE_ORGS`, a JSON object mapping attendance site IDs to HRMS organization UUIDs, for example `{"12":"00000000-0000-0000-0000-000000000001"}`. Replace these illustrative IDs with verified production IDs.

Never derive this mapping from a user-editable company name, domain, or email address. Unmapped sites fail closed. Do not expose these variables with a public/client prefix. Use HTTPS outside local development.

Only employee code, name, work email and active status are exchanged. Salary, personal contact information, government IDs and HR documents are not selected. HRMS tenant context and an explicit organization filter both scope the query. Inactive/deleted employees are sent as inactive so their existing cards no longer authorize access; attendance history is retained. Matching is by employee code within the mapped site; keep employee codes stable. Existing card assignments and groups are preserved.

Reader setup is available under Attendance readers. Existing owned RFID readers can be registered directly; new hardware requires its device ID and pairing key. A reader must be owned by the caller, have a supported RFID type, and any zone must belong to the selected site. Registration defaults to attendance-only mode; it does not automatically enable door access.

Deployment verification: open each organization's People view, confirm its employee count, repeat sync to confirm no duplicates, deactivate a test employee and confirm its card is removed on ACL sync. Verify a different organization's site and an unmapped site cannot retrieve the roster. Use dedicated test hardware for pairing, entry/exit scans and ACL checks.
