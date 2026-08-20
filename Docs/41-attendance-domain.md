# attendance.circuvent.com

The attendance console is served on its own hostname. The application half is
done (`src/lib/host-mounts.ts`); this is the infrastructure half.

## What is already true

- `attendance.circuvent.com` is in `HOST_MOUNTS`, mounted onto
  `/smarthome/attendance`, with `pages: []` so anything below the root
  redirects to the main site rather than rewriting into a 404.
- `home.circuvent.com/smarthome/attendance` keeps working unchanged. Every
  mount prefix is excluded from remapping, so the old address is not disturbed
  and no existing link has to change.
- Everything in the console is manageable by a person, with no API calls:
  create the site (first-run screen), add people, register readers, issue
  cards, push the card list.

## Bringing the hostname up

Three steps, in this order. The order matters: Vercel cannot issue a
certificate for a hostname that does not resolve, so attaching the domain
before the DNS record exists fails with a certificate error.

### 1. DNS — at GoDaddy

`circuvent.com` is delegated to `ns31/ns32.domaincontrol.com`, which is GoDaddy.
DNS is **not** on Cloudflare, despite Cloudflare being used for R2.

In GoDaddy → Domains → circuvent.com → DNS → Add record:

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `attendance` |
| Value | `cname.vercel-dns.com` |
| TTL | 1 hour (default) |

This is the same record `home.circuvent.com` already uses.

Confirm it has propagated before moving on:

```powershell
Resolve-DnsName attendance.circuvent.com -Type CNAME
```

### 2. Attach the domain in Vercel

Vercel → project `circuvent-technologies` → Settings → Domains → Add
`attendance.circuvent.com`. The certificate is issued automatically once the
CNAME resolves.

By CLI, equivalently:

```powershell
npx vercel domains add attendance.circuvent.com circuvent-technologies
```

### 3. Deploy

The mount ships in commit `aa69055`. Production must be running that commit or
later, or the hostname resolves and then serves the main site instead of the
console.

Check what is live:

```powershell
curl -s https://home.circuvent.com/api/health
```

`build.sha` in the response is the deployed commit.

> **Note on the deploy cap.** This project is on a Vercel plan with a limit of
> 100 deployments per rolling 24 hours, and it has been hit repeatedly. When it
> is exhausted, both `vercel --prod` and the automatic deploy from a git push
> fail with `api-deployments-free-per-day`. The push still lands in git; it
> simply is not built until the window clears.

## Verifying

```powershell
# Serves the console
curl -sI https://attendance.circuvent.com/ | Select-String "HTTP/|location"

# A path the mount does not serve — should redirect to the main site
curl -sI https://attendance.circuvent.com/people | Select-String "HTTP/|location"

# Shared paths must not be remapped
curl -sI https://attendance.circuvent.com/api/health | Select-String "HTTP/"
```

The second one is the interesting check. The console keeps its sections in a
`?tab=` query rather than the path, so `/people` is not a page here — it should
come back as a redirect to `circuvent.com/people`, not a 404.

## Why this is a mount and not a separate app

Extracting attendance into its own repository and deployment would duplicate the
control-plane client, the sign-in flow, the shared console chrome, and the
parity tests that currently stop a device type being half-registered across the
app, the console and the firmware catalogue.

The cost is not the extraction, it is the drift afterwards: a second client that
slowly disagrees with the API it talks to, discovered when a card stops opening
a door. As a mount, `attendance.circuvent.com` is one line in a table and shares
every test that already exists.

Worth revisiting if attendance ever needs its own release cadence or its own
access boundary — but the `admin_role` tier on the control plane already covers
the access case.
