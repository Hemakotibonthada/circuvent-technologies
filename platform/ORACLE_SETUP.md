# Stand up the free VM (Oracle Cloud "Always Free") — step by step

Goal: a small always-on Ubuntu box with Docker, reachable at
`api.circuvent.com` + `mqtt.circuvent.com`, then `docker compose up` the
`platform/` stack. Cost: **₹0/month** (Oracle needs a card only for signup
identity verification — a small, usually-refunded hold).

> No card? Jump to **"No-card / zero-cost alternative"** at the bottom — same
> stack, runs on any machine you already own.

---

## A. Create the Oracle account
1. Go to <https://www.oracle.com/cloud/free/> → **Start for free**.
2. Email + phone verification.
3. **Home Region**: pick the one closest to you — e.g. **India West (Mumbai)**
   or **India South (Hyderabad)**. ⚠️ This is **permanent**, choose carefully.
4. Add the card for verification. You land in the OCI Console.

## B. Launch the VM
1. Console → ☰ menu → **Compute → Instances → Create instance**.
2. **Name:** `circuvent-cp`.
3. **Image and shape → Edit:**
   - **Image:** Canonical **Ubuntu 22.04**.
   - **Shape:** *Ampere* → **VM.Standard.A1.Flex** → OCPUs **4**, Memory **24 GB**
     (all "Always Free eligible"). This is the powerful free ARM box.
   - If you see **"Out of host capacity"**: try another Availability Domain, or
     lower to 1 OCPU / 6 GB, or switch to **VM.Standard.E2.1.Micro** (always
     available, but only 1 GB RAM — then add swap, see step E).
4. **Networking:** keep the auto-created VCN; **Assign a public IPv4 address = Yes**.
5. **Add SSH keys:** "Generate a key pair for me" → **download BOTH keys** and keep
   the *private* key safe (or paste your own public key).
6. **Create.** After ~1 min, open the instance and copy its **Public IP address**.

## C. Open the ports (TWO firewalls — this is the #1 gotcha)
### C1. Cloud firewall (OCI Security List)
Console → **Networking → Virtual Cloud Networks →** your VCN **→ Security Lists →
Default Security List → Add Ingress Rules**, add three (Source `0.0.0.0/0`, IP
Protocol TCP):
| Destination port | Purpose |
| --- | --- |
| 80 | Caddy — ACME cert challenge + redirect |
| 443 | Caddy — HTTPS API + secure WebSocket |
| 8883 | Mosquitto — device MQTT over TLS |
(22 is already open for SSH.)

### C2. OS firewall (Oracle's Ubuntu image blocks everything but 22)
SSH in first (next step), then run:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8883 -j ACCEPT
sudo netfilter-persistent save
```

## D. Connect
```bash
chmod 600 /path/to/private.key      # macOS/Linux
ssh -i /path/to/private.key ubuntu@<PUBLIC_IP>
```
(Windows: use the key in PuTTY/Windows Terminal; the login user is `ubuntu`.)

## E. (Only for the 1 GB E2.1.Micro shape) add swap
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## F. DNS — point the hostnames at the VM
At your domain registrar (or Cloudflare, if `circuvent.com` is there) add:
```
A   api    → <PUBLIC_IP>
A   mqtt   → <PUBLIC_IP>
```
> **Cloudflare users:** set both records to **"DNS only" (grey cloud)**. Cloudflare's
> free plan can't proxy raw MQTT on 8883, and Caddy needs 80/443 reachable to get
> certs. Grey-cloud keeps it simple and fully ours.

## G. Deploy the platform
Now just follow **`platform/README.md`** from step 3:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
git clone <your-repo> && cd <repo>/platform
cp .env.example .env         # fill strong secrets: openssl rand -base64 24
docker compose up -d --build
docker compose logs -f api   # wait for "Control plane listening on :8080"
```
Then create the broker users (README step 6) and provision your first device
(README step 7). Verify: `curl https://api.circuvent.com/health` → `{ ok: true }`.

---

## No-card / zero-cost alternative (no Oracle, no card)
The stack is just Docker — run it on **any always-on machine you already own**
(old laptop, mini-PC, Raspberry Pi 4):
1. Install Docker (same one-liner).
2. **Free public hostname without a static IP:** create a free
   **[DuckDNS](https://www.duckdns.org)** domain (e.g. `circuvent.duckdns.org`) and
   run its updater; use `api.<name>.duckdns.org` / `mqtt.<name>.duckdns.org`
   (or CNAME your real `api.`/`mqtt.circuvent.com` to it).
3. On your home router, **port-forward 80, 443, 8883** to the machine's LAN IP.
4. Same `docker compose up -d --build`.
This is genuinely ₹0 and needs no card — the only cost is the machine's power.

---

When your VM is reachable (`/health` returns ok), tell me — I'll help finish the
deploy and build **Phase 2 (firmware MQTT)** + **Phase 3 (mobile app)**.
