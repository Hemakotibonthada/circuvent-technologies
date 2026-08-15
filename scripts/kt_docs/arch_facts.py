"""
Architecture, integration and operations facts, read from the repository.

WHY THIS IS SEPARATE FROM facts.py

`facts.py` answers "what is this system and where do I start", which is what a
new engineer needs in week one. This answers "how does it actually run" — the
topic contract, the three different TLS stories, every secret and what breaks
without it, and what deploys by which mechanism. Different audience, different
half-life: the onboarding facts change when the shape of the product changes,
these change whenever somebody touches infrastructure.

Everything here is derived or quoted from the file that owns it. The rule from
facts.py applies unchanged and matters more here, because an operations deck is
read by somebody at 2am with a broker down, and a deck that has drifted is worse
than no deck at all — it sends them to check a thing that has not been true for
a year.

Where a fact genuinely cannot be derived — the reason a decision was made, what
breaks when a secret is missing — the owning file is named beside it so the
reader can go and check rather than trust the slide.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent


def _read(*parts: str) -> str:
    p = ROOT.joinpath(*parts)
    return p.read_text(encoding="utf-8", errors="replace") if p.is_file() else ""


# --------------------------------------------------------------------------
# MQTT
# --------------------------------------------------------------------------

def mqtt_topics() -> list[tuple[str, str, str, str]]:
    """
    The topic contract, with the leaves read out of the firmware.

    The leaves are parsed rather than typed because they are the interface
    between four codebases: rename one in the sketch and the console, the app
    and the bridge all go quiet without a single error anywhere.
    """
    src = _read("firmware", "CircuventDevice", "CircuventDevice.h")
    leaves = set(re.findall(r'_topic\("(\w+)"\)', src))

    retained = bool(re.search(r'_topic\("state"\)[^;]*?,\s*true\)', src))
    cmd_qos = re.search(r'_mqtt\.subscribe\(_topic\("cmd"\)\.c_str\(\),\s*(\d+)\)', src)

    rows = [
        ("cv/<id>/state", "device → cloud",
         "retained" if retained else "not retained",
         "The whole reported state. Retained, so anything that connects learns "
         "the current state immediately instead of waiting for the next heartbeat."),
        ("cv/<id>/telemetry", "device → cloud", "not retained",
         "Readings worth keeping history for. Never retained — a stored reading "
         "would be replayed to every new subscriber as though it had just happened."),
        ("cv/<id>/cmd", "cloud → device",
         f"QoS {cmd_qos.group(1)}" if cmd_qos else "QoS 1",
         "The only topic a device subscribes to. QoS 1 because a dropped "
         "'switch off' is not an inconvenience, it is a heater left running."),
        ("cv/<id>/status", "device → cloud", "last will",
         "Set as the MQTT will, so the broker publishes it if the device stops "
         "answering. A device cannot announce its own unexpected death."),
    ]
    return [r for r in rows if r[0].split("/")[-1] in leaves] or rows


def mqtt_broker() -> list[tuple[str, str]]:
    """Broker facts, quoted from platform/mosquitto/mosquitto.conf."""
    conf = _read("platform", "mosquitto", "mosquitto.conf")

    def val(key: str, default: str = "(unparsed)") -> str:
        """
        Read one setting out of the conf.

        The fallback is a word rather than a dash on purpose. It used to be an
        em dash, which is also ordinary punctuation in the sentences on the same
        slide — so the check that was meant to catch a failed parse matched the
        prose instead and reported a problem that did not exist.
        """
        m = re.search(rf"^{key}\s+(\S+)", conf, re.M)
        return m.group(1) if m else default

    listeners = re.findall(r"^listener\s+(\d+)", conf, re.M)
    return [
        ("Broker", "eclipse-mosquitto:2, in Docker Compose on the control-plane VM"),
        ("Listeners", f"{', '.join(listeners)} — 1883 private to the Docker network, 8883 public TLS"),
        ("Anonymous", f"allow_anonymous {val('allow_anonymous')}"),
        ("Auth", "Dynamic Security plugin. The control plane creates a per-device "
                 "client the moment the app provisions it, so a new device needs no server step."),
        ("ACL", "Each device is scoped to cv/<its own id>/# — one compromised device "
                "cannot read or drive another."),
        ("Latency", f"set_tcp_nodelay {val('set_tcp_nodelay')} — without it Nagle buffers "
                    "small control packets for ~40ms, which is felt on a light switch."),
        ("Limits", f"max_connections {val('max_connections')}, "
                   f"max_inflight {val('max_inflight_messages')}, "
                   f"message_size_limit {val('message_size_limit')} bytes"),
    ]


# --------------------------------------------------------------------------
# Certificates
# --------------------------------------------------------------------------

def certificates() -> list[tuple[str, str, str, str]]:
    """
    Three separate TLS stories that are easy to mistake for one.

    They are listed together precisely because they are usually confused: the
    broker is the only one on a certificate we issue ourselves, and the only one
    whose expiry is our problem rather than an ACME client's.
    """
    fw = _read("firmware", "CircuventDevice", "CircuventDevice.h")
    pins_le = "LETSENCRYPT_ROOT_CA" in fw
    has_own_ca = "CIRCUVENT_DEFAULT_CA" in fw

    return [
        ("circuvent.com", "Let's Encrypt, via Vercel", "Automatic",
         "Renewed by Vercel. Nothing to do, and nothing that can be done by hand."),
        ("api.circuvent.com", "Let's Encrypt, via Caddy", "Automatic",
         "Caddy handles ACME in the compose stack. Port 80 must stay reachable "
         "or renewal fails silently until the certificate simply expires."),
        ("mqtt :8883", "Circuvent's own CA", "Ours to renew",
         "platform/scripts/gen-certs.sh. The firmware embeds ca.crt"
         + (" (CIRCUVENT_DEFAULT_CA)" if has_own_ca else "")
         + ", so replacing this CA means an OTA to every device before the swap, "
           "in that order, or the fleet cannot reconnect."),
        ("OTA downloads", "Let's Encrypt roots, pinned in firmware",
         "Pinned" if pins_le else "Unpinned",
         "ISRG Root X1 and X2 are compiled into the sketch so a device will only "
         "fetch firmware from a host chaining to them."),
    ]


def tls_pinning_trap() -> list[str]:
    """
    The pinning scare, recorded because the obvious reading of it was wrong.

    Kept as prose rather than a table: the value is the sequence of reasoning,
    and a table would reduce it to the conclusion, which is the part somebody
    can already guess.
    """
    return [
        "The firmware pins ISRG Root X1 and X2. Reading the live chain for the "
        "site showed it terminating at a root with a different name, which looks "
        "exactly like a fleet that is about to fail every OTA.",
        "Pushing an update on that reading would have been the wrong call in both "
        "directions — abandoning a working pipeline, or worse, removing the pin.",
        "Running the actual handshake settled it in a minute: the chain served "
        "is cross-signed and terminates at X1, which is precisely what the device "
        "validates against. Nothing was wrong.",
        "The lesson is the house rule, in its most expensive form: reading a "
        "certificate's subject names is not the same as completing a handshake.",
    ]


# --------------------------------------------------------------------------
# Secrets
# --------------------------------------------------------------------------

def control_plane_secrets() -> list[tuple[str, str]]:
    """
    Required configuration, parsed from the Zod schema that already validates it.

    Parsed rather than listed so the deck cannot claim a variable is required
    after somebody gives it a default — config.ts is the thing that actually
    refuses to boot, so it is the thing worth quoting.
    """
    src = _read("platform", "api", "src", "config.ts")
    out: list[tuple[str, str]] = []
    for name, rest in re.findall(r"^\s*([A-Z][A-Z0-9_]{3,}):\s*(.+)$", src, re.M):
        required = ".default(" not in rest and ".optional(" not in rest
        if required:
            out.append((name, "required — the API refuses to start without it"))
    return out


def secret_homes() -> list[tuple[str, str, str]]:
    """Where each class of secret lives. Named, never valued."""
    return [
        ("Website / console", "Vercel project environment variables",
         "Per-environment, and preview variables are branch-scoped — pulling "
         "them without naming the branch quietly gives you production's."),
        ("Control plane", "platform/.env on the VM, read by Docker Compose",
         "Never in the repo. config.ts validates it at boot so a missing one is "
         "a refusal to start rather than a runtime surprise at 3am."),
        ("Broker", "Dynamic Security store in the mosquitto data volume",
         "Per-device credentials, minted by the control plane at provisioning."),
        ("Device", "NVS on the ESP32, written during provisioning",
         "Identity and key never leave the device; a factory reset clears them."),
        ("Signing key (Android)", "mobile/credentials/, gitignored",
         "play-upload-key.json names the active keystore. Two keystores with no "
         "named winner is a refusal to build, not a guess."),
        ("Home link key", "NVS, pushed as {action:\"homekey\"}",
         "No key means no local bus — never an unauthenticated one."),
    ]


# --------------------------------------------------------------------------
# Integrations and deployment
# --------------------------------------------------------------------------

def integrations() -> list[tuple[str, str, str]]:
    return [
        ("Google Home", "Smart Home intents + HomeGraph",
         "onOff() decides what is exposed. A type missing from it is simply "
         "absent, with no error."),
        ("Amazon Alexa", "Smart Home skill + event gateway",
         "Display category is a physical-consequence decision: a pump typed as a "
         "switch is caught by 'turn everything off' at bedtime."),
        ("Siri", "Derived on-device from DEVICE_META.toggle",
         "No Swift change needed to add a device."),
        ("Shop ↔ console SSO", "Shared FEDERATION_SECRET, HMAC + timestamp",
         "Server-to-server only. Guarded by PROD_IDENTITY_HOSTS so a preview "
         "deployment cannot authenticate a production customer."),
        ("OTA", "Signed pointer over MQTT → HTTPS fetch",
         "public/fw/ on Vercel; the device pins the roots it will fetch from."),
        ("Incident routing", "ICM + Teams webhooks",
         "Durable escalation runs on the Vercel Workflow SDK."),
        ("Databases", "Neon (shop) and Postgres 16 in Compose (fleet)",
         "Two databases, deliberately. Different owners, different blast radius."),
    ]


def deployments() -> list[tuple[str, str, str]]:
    return [
        ("Website / console", "git push → Vercel",
         "main → circuvent.com, develop → dev.circuvent.com. Build failures "
         "surface as a stuck deployment, not a red X on the commit."),
        ("Control plane", "docker compose up -d --build on the VM",
         "Caddy terminates TLS; the API and broker sit behind it."),
        ("Mobile", "node scripts/build-android.mjs --apk | --aab",
         "Signing is checked before and after the build, so a rejected upload "
         "costs seconds instead of a seven-minute build plus a Play round trip."),
        ("Firmware", "python -m platformio run, then OTA broadcast",
         "The binary goes to public/fw/; the device is told where by MQTT."),
    ]


# --------------------------------------------------------------------------
# What changed
# --------------------------------------------------------------------------

def enhancements(limit: int = 12) -> list[tuple[str, str]]:
    """
    Recent work, taken from the log rather than from anybody's memory.

    A hand-written "what's new" is the first thing to go stale in a handover
    pack, and it goes stale invisibly — the reader has no way to tell.
    """
    try:
        out = subprocess.run(
            ["git", "log", f"-{limit}", "--pretty=format:%h|%s"],
            cwd=ROOT, capture_output=True, text=True, timeout=20,
        )
        rows = []
        for line in out.stdout.splitlines():
            if "|" in line:
                sha, subject = line.split("|", 1)
                rows.append((sha.strip(), subject.strip()))
        return rows
    except Exception:
        return []


def silent_failures() -> list[tuple[str, str]]:
    """
    The failure mode this system produces most often, with real examples.

    Every one of these shipped. They are listed together because the pattern is
    the point: none of them threw, none of them logged, and each looked like
    working software right up until somebody in another room noticed.
    """
    return [
        ("A slider that cannot ask for what the hardware does",
         "Camera fps capped at 15 in the app and 30 in the console while the "
         "firmware did 60. The device silently clamps, so nothing contradicts it."),
        ("A field published and never read",
         "otaStatus and wifiStatus were both broadcast for years. A camera "
         "mid-update rendered as a hardware fault telling somebody to reseat a "
         "ribbon cable."),
        ("A control that reaches only part of what it claims",
         "The view-density setting moved three padding steps out of six, so 46 "
         "sections ignored it."),
        ("A job that fails closed and says nothing",
         "Four crons returned 403 forever without CRON_SECRET and recorded "
         "nothing either way."),
        ("A device that cannot be told anything",
         "A gang in firmware with no entry in the console's field list is a "
         "switch on the wall that the app does not know exists."),
    ]
