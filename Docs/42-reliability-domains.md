# icm.circuvent.com and insights.circuvent.com

Incident Management and Application Insights are served on their own hostnames.
The application half is done (`src/lib/host-mounts.ts`); this is the
infrastructure half.

| Hostname | Mounts onto | Product |
| --- | --- | --- |
| `icm.circuvent.com` | `/admin/icm` | Incident Management (IcM) |
| `insights.circuvent.com` | `/admin/insights` | Application Insights |

## What is already true

- Both hostnames are in `HOST_MOUNTS`, each with `pages: []` so anything below
  the root redirects to the main site rather than rewriting into a 404.
- `circuvent.com/admin` keeps both Reliability tabs. Deep links also work as
  `circuvent.com/admin?tab=icm` and `?tab=insights`.
- `circuvent.com/admin/icm` and `/admin/insights` keep working unchanged.
  Every mount prefix is excluded from remapping.
- Auth is the same staff console session (`sessionStorage` bearer + SSO). Each
  subdomain needs its own OAuth redirect URI registered on `website-admin`
  (see Auth.circuvent `scripts/register-reliability-redirects.mjs`).

## Bringing the hostnames up

Three steps, in this order. Vercel cannot issue a certificate for a hostname
that does not resolve, so attach the domain only after DNS exists.

### 1. DNS — at GoDaddy

`circuvent.com` is delegated to `ns31/ns32.domaincontrol.com` (GoDaddy).

In GoDaddy → Domains → circuvent.com → DNS → Add record (twice):

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `icm` |
| Value | `cname.vercel-dns.com` |
| TTL | 1 hour (default) |

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `insights` |
| Value | `cname.vercel-dns.com` |
| TTL | 1 hour (default) |

Confirm:

```powershell
Resolve-DnsName icm.circuvent.com -Type CNAME
Resolve-DnsName insights.circuvent.com -Type CNAME
```

### 2. Attach the domains in Vercel

Vercel → project `circuvent-technologies` → Settings → Domains → Add each host.
Or by CLI:

```powershell
npx vercel domains add icm.circuvent.com circuvent-technologies
npx vercel domains add insights.circuvent.com circuvent-technologies
```

### 3. Register SSO redirects

```powershell
cd Auth.circuvent
node scripts/register-reliability-redirects.mjs
```

### 4. Deploy

Production must be running the commit that includes the mounts, or the
hostnames resolve and then serve the main site.

```powershell
curl -s https://circuvent.com/api/health
```

`build.sha` in the response is the deployed commit.

## Verifying

```powershell
# Serves the product
curl -sI https://icm.circuvent.com/ | Select-String "HTTP/|location"
curl -sI https://insights.circuvent.com/ | Select-String "HTTP/|location"

# A path the mount does not serve — should redirect to the main site
curl -sI https://icm.circuvent.com/people | Select-String "HTTP/|location"

# Shared paths must not be remapped
curl -sI https://icm.circuvent.com/api/health | Select-String "HTTP/"
```

## Why this is a mount and not a separate app

Extracting ICM or Insights into its own repository would duplicate staff auth,
the incident/telemetry APIs, and the Reliability panels that already live under
`/admin`. As mounts they are two lines in a table and share every test that
already exists.
