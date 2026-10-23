<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="Logos/containly-schild-teal-dark.svg">
    <img src="Logos/containly-schild-teal.svg" alt="Containly" width="96">
  </picture>
</p>

<h1 align="center">Containly</h1>

<p align="center">
  A self-hosted web UI for running Docker across several hosts.<br>
  Compose stacks stay plain files on disk. One instance, every host, one place to look.
</p>

<p align="center">
  <a href="https://hub.docker.com/r/amslertec/containly"><img src="https://img.shields.io/docker/v/amslertec/containly?logo=docker&label=Docker%20Hub&sort=semver" alt="Docker Hub"></a>
  <a href="https://containly.ch"><img src="https://img.shields.io/badge/website-containly.ch-2bb6a2" alt="Website"></a>
  <a href="https://www.youtube.com/watch?v=yinohixGwG4"><img src="https://img.shields.io/badge/video-7%20min%20tour-red?logo=youtube" alt="Video: 7-minute tour"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-proprietary%2C%20free%20for%202%20hosts-blue.svg" alt="License: proprietary, free for 2 hosts"></a>
</p>

<p align="center">
  <a href="https://alternativeto.net/software/containly/about/?utm_source=badge&utm_medium=referral"><img src="https://alternativeto.net/static/badges/badge-wide-color.svg" alt="Containly on AlternativeTo" width="284" height="51"></a>
  <a href="https://www.saashub.com/containly-ch?utm_source=badge&utm_campaign=badge&utm_content=containly-ch&badge_variant=color&badge_kind=approved"><img src="https://cdn-b.saashub.com/img/badges/approved-color.png?v=1" alt="Containly approved on SaaSHub" width="153" height="51"></a>
</p>

<p align="center">
  <img src="docs/screenshots/dashboard-dark.png" alt="Containly dashboard in dark mode: status line, key numbers, timeline per host and stack, live events" width="100%">
</p>

Containly is built for homelabs and small fleets: a few Docker hosts at home, a NAS, a
VPS or two, usually behind a reverse proxy. It shows what needs attention first, lets you
act on it in one click, and keeps your Compose files where they belong: in folders you can
version, back up and edit without Containly.

**Watch the 7-minute tour:** [Containly on YouTube](https://www.youtube.com/watch?v=yinohixGwG4)
(install, dashboard, containers, stacks, scans, updates, hosts, phone).
Install guide: [containly.ch/install](https://containly.ch/install) ·
FAQ: [faq.containly.ch](https://faq.containly.ch) ·
Help: [help.containly.ch](https://help.containly.ch) ·
Forum: [forum.containly.ch](https://forum.containly.ch)

> **Security-critical.** Containly talks to the Docker socket, which is equivalent to root
> on the host. Read [Security](#security) before you expose it.

---

## Features

### Dashboard

- **Status line.** One sentence that says how things are: hosts online, containers that
  need you, pending updates, restarts today. Below it the key numbers for all hosts.
- **Timeline.** The state of every host and stack over the last 24 h (or 6 h, 12 h,
  7 days), with outages, restarts, deploys and updates marked on one time axis.
- **Attention queue.** Offline hosts, unhealthy or crashed containers, available updates
  and images with critical CVEs, each with a direct action (restart, start, update all,
  open the container, host or image list).
- **Host matrix.** Every host in one table: status, Docker version, containers, CPU, RAM
  and disk as a heat table, a 24 h CPU trend, updates and critical CVEs per host.
- **Live events.** A running feed of container state changes, deploys, updates, CVE scans
  and actions taken in Containly (with the user), with a filter for warnings. Plus the
  containers with the most restarts.

### Containers

- **Workbench layout.** The list stays on the left, the selected container opens in an
  inspector on the right. Filter by state, search by name, image or ID, sort, favourite,
  select several for bulk start, stop, restart or remove.
- **Inspector tabs.** Overview (CPU and memory trend, restart policy, health check,
  ports and networks, mounts), **Logs**, **Stats**, **Console**, **Environment**, **Files**
  and raw **Inspect**.
- **Logs.** Live stream with tail length, search, timestamps, wrap, follow and download.
- **Stats.** Live CPU, memory, network and block I/O, plus history for 1 h, 6 h, 24 h and
  7 days that survives container recreation.
- **Console.** An in-browser shell (bash, ash, sh or a custom path) for admins.
- **Environment and files.** Edit environment variables with secrets masked, browse,
  upload, download and delete files inside a running container.
- Published ports link straight to the service. Pause, kill and migrate are one menu away.
- **Group the list.** View the containers as a plain list, by Compose stack (with a group for
  standalone containers) or, under All hosts, by host. Identical stack names on different hosts
  stay separate; the choice is remembered per page.

### Stacks

- **Compose as files.** Stacks live in folders on each host's stack paths: versionable,
  no database lock-in. Compose projects started outside Containly are found through their
  Compose labels and shown alongside.
- **Compose editor.** Line numbers, file tree with `.env` and extra files, new file,
  unsaved changes marker.
- **Override files.** `compose.override.yaml` and every other file Docker used for a project are
  passed to each compose command (deploy, pull, start, stop, down, version updates) and open as
  tabs next to the main file in the editor.
- **Diff before deploy.** See exactly what changes on disk before you redeploy. Deploy,
  start, stop, restart and down stream their output live.
- **Git stacks.** Clone a stack from a public or private repository (access token),
  optional auto-sync on a schedule, sync status per stack.
- **CI redeploy (Free).** A pipeline (GitHub Actions, Gitea or Forgejo Actions, GitLab CI) redeploys
  a stack with one `curl` and an API token: `git pull` for Git stacks, image pull and
  `docker compose up -d`, then polls the job until it reports `ok`.
- A `docker run` to `docker-compose.yml` converter, archive and restore, and stack-wide
  actions.

### Backups

- **Stacks, containers and volumes.** Back up named volumes, **anonymous volumes** (kept by
  container name and mount path, included by default, opt-out per plan), the stack folder with the
  Compose file and `.env`, and the container configuration with image digests. Restore as a
  copy next to the original, or replace in place after a server-side preview (a safety backup
  is made first).
- **Restore to another host** *(Pro)*. Containers, volumes and Compose stacks can be restored
  onto a different Docker host into a chosen stack folder with new volume names; the Compose file
  is checked on the destination and source host paths and privileged settings are refused before
  anything is written. Replacing existing data on the destination needs a safety backup there.
- **Encrypted by default.** Streaming tar, zstd and AES-256-GCM with a key from your
  passphrase, which is never stored (a built-in generator creates a strong one). Every set has a plaintext manifest and can be read
  without Containly ([format](docs/backup-format.md)).
- **Consistency.** Live, stop the containers during the backup, pre and post hooks, or a
  **database dump** for PostgreSQL, MariaDB/MySQL, MongoDB and Redis, detected per stack.
- **Targets.** A folder on the Docker host or in the Containly container, picked with a
  folder browser, and *(Pro)*
  **S3-compatible storage** (Amazon S3, Hetzner Object Storage, Backblaze B2, MinIO,
  Cloudflare R2, Wasabi), **SFTP** with host key pinning, **SMB3** shares (encryption required) and
  **NFSv4** exports. Every target dialog has an optional **Test connection** that checks the
  unsaved settings with a temporary object (nothing is saved or left behind). SMB runs in an unprivileged network sandbox (Landlock), which needs
  **Linux 6.7 or newer** and Docker's default seccomp profile; without it the SMB connection
  test says so and SMB stays disabled (NFS and the other targets are unaffected).
- **Overview.** Filter by status or **With backups** (hosts and resources with at least one
  complete set).
- **Free and Pro.** *Free:* manual backup and restore on the same host, all consistency modes
  including database dumps, encryption, verification, retention, folder targets (Containly
  container and Docker host), notifications, and download and import of `.clbk` files.
  *Pro:* schedules, scheduled verification, S3, SFTP, SMB and NFS targets, and restore to another
  host. Your data is never held hostage: if a licence lapses, existing sets on Pro targets stay
  listable, verifiable, downloadable and restorable on the same host, and scheduled plans pause
  and resume by themselves.
- **Plans.** Contents, target, key and retention in one plan; *(Pro)* schedules (hourly, on
  chosen weekdays or monthly), scheduled verification and a warning when backups go stale.
- **Download and import.** Move a complete set to another Containly instance as one `.clbk`
  file.

### Workflows *(Pro)*

- **Automate routine reactions without scripting.** A workflow is a trigger, optional conditions
  and ordered steps, with an "otherwise" branch. Triggers: container unhealthy, exited or killed
  for lack of memory, restart loop, host offline or back online, sustained CPU or memory, backup
  finished, and a schedule. Steps: notify (in-app, e-mail, push to the recipients' devices and
  saved channels such as Discord, Telegram, Slack, Pushover, ntfy, Gotify or a webhook), restart,
  start or stop a
  container, run a backup plan, update a container, wait until healthy, and wait.
- **20 ready templates in six groups:** Health and recovery, Backups, Updates, Hosts, CPU and
  memory, Schedules and maintenance. Pick a template, choose the containers, hosts or backup
  plans it may touch, and enable it. New workflows start as drafts.
- **Safe by design.** Changing steps act only on containers or stacks you picked explicitly. An
  update runs only after a successful backup in the same run. Cooldowns and a circuit breaker
  (default three changing actions per hour, then paused until an admin re-arms it) stop runaway
  loops, and a workflow's own actions never trigger another workflow.
- **Simulate, run now and history.** A dry run shows which steps would run, without changing
  anything. Every run is kept with its condition results and step trace, and every action is in
  the audit log as "Workflow: <name>".

### Images, volumes, networks

- **Images.** Pull with Docker Hub search and tag picker, tag, remove, prune unused,
  layer view, update badges.
- **Grouping.** Images can be listed flat, by repository (all tags and versions of an image
  together, registries kept apart) or by the Compose stacks that use them; volumes and networks
  by stack, using real Compose labels and the containers that use them, with Standalone and
  Unused groups. A resource shared by several stacks shows under each of them. Under All hosts
  every list can also be grouped by host. The backup overview groups by stack, resource type
  or host.
- **Clean up on all hosts.** The prune dialogs for images, volumes and networks can preview and
  clean up unused resources on every host at once.
- **CVE scanning.** Trivy scans your images on demand or on a schedule. Severity counts
  in the list, and per image
  the full list of CVEs with package, installed version and fixed version. Not needed? Turn
  scanning off in the settings and all CVE displays disappear.
- **Volumes.** Create, remove, prune, find orphans, and browse a volume's files with
  upload and download.
- **Networks.** Create bridge, macvlan, ipvlan or overlay networks (optionally internal),
  remove, prune, find orphans. System networks are protected.

### App catalog and updates

- **App catalog.** Browse templates, add your own template sources, deploy an app as a
  stack with its environment variables filled in.
- **Updates.** Registry digest checks without pulling, semver detection for pinned version
  tags, a server-side bulk update job with live progress that survives reloads. Only a strictly
  newer Containly release counts as an update, so development builds are never offered an older
  version.
- **Self-update.** Containly recreates its own container in one click and rolls back if the
  new version is not healthy.
- **Registry logins.** Several Docker Hub or private registry accounts, encrypted; the
  right account is picked per image namespace.

### Endpoints

- **Every way to connect.** The local socket, **TCP with TLS** client certificates,
  **SSH**, or the **agent**: a hardened `containly-agent` container that dials out to
  Containly over WSS, so the host needs no open Docker port or SSH and can sit behind NAT.
  Enrol with a one-time token and a copy-paste `docker run` or Compose snippet.
- **Host pages.** Per host: status, resources over the last 24 h, what needs attention,
  system details, containers and stack paths.
- **Agent-less remote stacks.** Manage Compose files on TCP and SSH hosts through a small
  helper container over the plain Docker API.
- **Live migration.** Move a container or a whole Compose stack, with its image, volumes
  and networks, to another host. Pre-flight checks, a live progress log and automatic
  rollback if anything fails.

### Administration

- **Users and roles.** Admin and viewer roles, invitations by email, admin-initiated
  password reset links, active sessions you can revoke.
- **Single sign-on** *(Pro)*. Microsoft Entra ID: sign in with Microsoft accounts, Entra
  groups mapped to roles, device-code login (works on plain HTTP without a domain) or
  redirect, and a scheduled role sync.
- **Two-factor authentication.** TOTP with recovery codes.
- **API tokens (Free).** Personal tokens under **Profile > API tokens** with the scopes Read,
  Redeploy stacks (optionally limited to picked stacks) and Prometheus metrics, optional expiry,
  shown once and stored only as a hash, last use visible, revocable; admins see every token under
  **Settings > Integrations**. A token never does more than its owner's role, works only as
  `Authorization: Bearer` on the API (never for sign-in, consoles or WebSockets) and shows in the
  audit log as `<user> (Token: <name>)`.
- **Prometheus export (Free).** `GET /metrics` for Prometheus and Grafana, off by default:
  endpoint up, host CPU, memory and disk, and per container state, health, restarts, CPU and
  memory (labels endpoint, stack, container, image). Served from Containly's own one-minute
  samples, protected by a metrics token. Inbound only.
- **Audit log.** Every change, with user, target, outcome and IP.
- **Configuration backup.** Passphrase-encrypted backup and restore of Containly's own
  configuration, also on a schedule.
- **Notifications.** In-app feed and email (SMTP) for offline hosts, crashed, unhealthy or
  OOM-killed containers, restart loops, CPU, memory and disk thresholds, image and
  Containly updates, new critical CVEs, and backup failures or stale backups. Recipients per
  event type; in-app entries and e-mails appear in each user's language.
- **Notification channels (Free).** Send the same notifications to **Discord** (embed coloured by
  severity), **Telegram** (your own bot, optional topic), **Slack** (incoming webhook, blocks),
  **Pushover** (priority per severity, emergency only when you choose it), **ntfy** (ntfy.sh or
  your own server, with access token or user and password), **Gotify** or any **webhook** (JSON
  body, optional HMAC-SHA256 signature, custom headers), under **Settings > Notifications >
  Channels**. Discord and Slack webhook URLs are only accepted on the official hosts.
  Each channel has its own minimum severity, event selection and message language, a "Send test"
  button that saves nothing, and a delivery log of the last 20 attempts. Secrets are stored
  encrypted and never shown again. At most 20 messages per minute per channel (the rest is
  summarised in one message), retries with backoff for temporary errors. Loopback, link-local and
  cloud metadata addresses are always refused; LAN addresses are allowed unless you switch on
  "Block private targets". In workflows (Pro) the notify step can pick saved channels too.

  Webhook body (version 1):

  ```json
  {"version":1,"id":"<delivery id>","type":"container.exited","severity":"warning",
   "title":"...","message":"...","target":"web","link":"https://containly.example.com/containers",
   "at":"2026-10-19T08:00:00.000Z","test":false,"source":"notification"}
  ```

  When signed, Containly sends `X-Containly-Timestamp` (unix seconds) and
  `X-Containly-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">`; also always
  `X-Containly-Event` and `X-Containly-Delivery`. `source` is `notification`, `workflow`, `test`
  or `summary` (type `channel.suppressed` with a `suppressed` count).
- **Web push (Free).** Under **Profile > Push notifications** every user turns on push for the
  browser or the installed app (PWA) on phone and desktop, without any extra service or account:
  Containly encrypts each message for the device (VAPID, RFC 8291) and hands it to the browser's
  own push service. Per device a name, minimum severity and event filter, "Send test" and remove;
  clicking a notification opens the matching page. Needs HTTPS; on iPhone and iPad (iOS 16.4 or
  later) add Containly to the home screen first. In workflows (Pro) the notify step can send push
  too.
- **Schedules.** Update checks, vulnerability scans, backups, image and volume pruning,
  auto-updates and SSO sync, hourly, on chosen weekdays or monthly. Every run lands in the
  audit log.

### Appearance

- **Light and dark.** Follow the system or pick a mode, per device.
- **Eight themes** *(Pro)*, each tuned for both light and dark, plus **custom themes**
  built from an accent colour.
- **Per-user override** *(Pro)*. Admins set the instance default; users may pick their
  own theme, font and density if the admin allows it.
- **Density and fonts** *(Pro)*. Comfortable or compact rows, corner style, and four font
  pairings. All fonts are self-hosted; nothing loads from a third party.

### Keyboard, mobile, languages

- **Keyboard-first.** `Ctrl`/`Cmd` + `K` opens the command palette for pages (including
  the App catalog), hosts, containers, images and quick actions. In lists, `j` and `k` move,
  `Enter` opens the inspector, `Esc` closes it, `/` searches, `g` then a letter jumps to a
  page (`d` dashboard, `c` containers, `s` stacks), and `?` lists every shortcut.
- **Mobile and PWA.** A phone layout with bottom navigation and pull to refresh.
  Install Containly as an app on your phone or desktop. When the server cannot be reached
  (VPN off, a proxy or firewall in between), a clear screen names the reason and retries on
  its own.
- **Languages.** English, German and Spanish. A language menu with flags in the header, on
  the sign-in screen and in the profile switches instantly and is remembered per user. E-mails
  (alerts, invitations, password resets) arrive in each user's language.

---

## Screenshots

| Dashboard, light | Containers with inspector |
|---|---|
| ![Dashboard in light mode](docs/screenshots/dashboard-light.png) | ![Container list with the inspector open](docs/screenshots/containers-inspector-dark.png) |
| **Container logs** | **Stack with compose editor** |
| ![Live container logs](docs/screenshots/container-logs-dark.png) | ![Stack detail with the compose editor, light mode](docs/screenshots/stack-editor-light.png) |
| **Image CVEs** | **Host page** |
| ![Image inspector listing CVEs](docs/screenshots/images-cves-dark.png) | ![Endpoint host page](docs/screenshots/endpoint-host-dark.png) |
| **Command palette** | **Sign-in** |
| ![Command palette searching containers and images, light mode](docs/screenshots/command-palette-light.png) | ![Sign-in page](docs/screenshots/login-dark.png) |

<p align="center">
  <img src="docs/screenshots/phone-dashboard-dark.png" alt="Dashboard on a phone" width="260">
  &nbsp;&nbsp;
  <img src="docs/screenshots/phone-containers-dark.png" alt="Container list on a phone" width="260">
</p>

---

## Pricing

Containly is **free for up to 2 Docker hosts** (the built-in local host plus one more),
with every core feature included, no account, self-hosted. For **unlimited hosts**, a
**Pro** license is bought and activated directly inside the app (**Settings > Version and licence**):

| Plan | Price | Valid for | Free trial |
|---|---|---|---|
| **Monthly** | CHF 15.90 / month | 1 Containly instance | 7 days |
| **Yearly** | CHF 89 / year | 1 Containly instance | 7 days |
| **Lifetime** | CHF 189 one-time | 1 Containly instance | none |

The free trial is available once per customer. A Pro license unlocks **unlimited hosts**,
**Microsoft Entra ID single sign-on**, **themes and appearance**, **workflows** and the **Pro backup
features** (schedules, S3, SFTP, SMB, NFS, restore to another host, scheduled verification), works **offline**, and your data
never leaves your server. Licences, invoices and the subscription are managed in your
customer account at **[containly.ch/account](https://containly.ch/account)**. Current pricing
is on **[containly.ch](https://containly.ch/#pricing)**.

---

## Quick start (Docker Hub)

No clone needed. Grab the example files from this repo, edit, and run:

```bash
mkdir containly && cd containly

# Download the example files straight to their final names:
curl -fsSL https://raw.githubusercontent.com/amslertec/containly/main/docker-compose.example.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/amslertec/containly/main/.env.example -o .env

# All app config lives in .env (the compose file loads it via env_file). Edit .env:
# at minimum keep CONTAINLY_SECURE_COOKIES=false for plain HTTP (true only behind HTTPS).
# In docker-compose.yml, adjust the compose-projects volume mount
# (path on the host = path in the container).

docker compose pull
docker compose up -d
docker compose logs -f containly   # copy the one-time setup token from the logs
```

For production, put a reverse proxy (Traefik, Caddy, nginx) with TLS in front, set
`CONTAINLY_SECURE_COOKIES=true`, and bind the port locally (`127.0.0.1:8420`).

### First-time setup (create the admin)

On first start there is **no admin account** yet. Containly runs in *setup mode* and
prints a one-time **setup token** to the logs, inside a boxed banner:

```bash
docker compose logs containly
```

(The token is also stored in the `containly-data` volume at `/data/setup.token`.)

Then:

1. Open **`http://<server-ip>:8420`** in your browser. The setup form appears
   automatically while no admin exists.
2. Enter a **username**, a **password** (you can reveal it and must confirm it), and
   paste the **setup token**.
3. Submit. The first administrator is created, setup mode closes permanently, and the
   token is deleted.

> If the page is **blank or black**, you are reaching Containly over plain HTTP with
> `CONTAINLY_SECURE_COOKIES=true`. Set it to `false` (see `.env`), restart, and
> hard-refresh the browser (Ctrl+Shift+R).

### Hardening: filtered socket proxy (recommended)

Instead of mounting the socket directly, a **Docker socket proxy** can provide filtered
(least-privilege) access. Enable it with:

```bash
docker compose --profile hardened up -d
```

Then add a TCP endpoint on `socket-proxy:2375` in Containly (reachable only on the
internal Compose network; **never** expose plain 2375 externally). See
[SECURITY.md](SECURITY.md) for the full hardening plan.

---

## Updating

```bash
docker compose pull
docker compose up -d
```

Or use the one-click self-update in the app. Take a backup of the `containly-data` volume or a
configuration backup first if you want a fallback. What changed is in the [CHANGELOG](CHANGELOG.md).

---

## Sponsor

If Containly makes managing your Docker hosts easier, you can support its development through
[GitHub Sponsors](https://github.com/sponsors/amslertec). Sponsorship is optional and helps fund
maintenance, documentation and new features. It does not replace a Containly Pro licence.

## Support

- **Guides and troubleshooting:** [help.containly.ch](https://help.containly.ch)
- **Frequently asked questions:** [faq.containly.ch](https://faq.containly.ch)
- **Questions, bug reports and ideas:** the community forum at
  [forum.containly.ch](https://forum.containly.ch) (one account for licences, support and
  the forum)
- **Email:** support@containly.ch
- **Security issues:** privately, see [SECURITY.md](SECURITY.md)

---

## Architecture

```
containly/
├── shared/   @containly/shared  Zod schemas = the API contract (front and back share types)
├── server/   @containly/server  Fastify backend; the only thing that talks to Docker
│   ├── docker/     endpoint manager (dockerode) + container/resource operations
│   ├── routes/     REST endpoints (Zod-validated, auth/role-protected)
│   ├── ws/         WebSockets: logs / stats / exec
│   ├── services/   auth (Argon2id), sessions, users, audit, crypto, stacks, backup, registry
│   └── db/         SQLite (better-sqlite3) + migrations
└── web/      @containly/web     React 19 + Vite + TanStack Query/Router, Tailwind, i18next
```

- **The Docker socket is never exposed to the frontend or the outside.** All Docker
  operations go through the authenticated backend API.
- **Shared Zod schemas** (`shared/`) are the single API contract, validated at every
  boundary, with types shared by front and back.
- **Persistence:** SQLite for users, sessions, endpoint configs, registries and the audit
  log. Stacks live as files.

| Layer | Technology |
|---|---|
| Backend | Node 22, Fastify 5, dockerode, better-sqlite3, argon2, Zod |
| Frontend | React 19, TypeScript (strict), Vite, TanStack Query + Router, Tailwind CSS 4, Radix, Phosphor icons, i18next, xterm |
| Persistence | SQLite (users, sessions, endpoints, registries, audit) and Compose stacks as files |

---

## Security

Containly has **root-equivalent** access to every connected host. Highlights:

- Argon2id password hashing; **two-factor authentication** (TOTP and recovery codes).
- Session cookies (`HttpOnly`, `Secure`, `SameSite`) and CSRF tokens; login rate limiting.
- Endpoint TLS and SSH credentials and TOTP secrets **AES-256-GCM encrypted at rest**.
- Zod validation on every endpoint; path-traversal protection on stack files.
- Audit log for every mutation.

Read the full policy and hardening plan in **[SECURITY.md](SECURITY.md)**, and report
vulnerabilities privately (see that file), not via public issues.

---

## Outbound connections

Containly runs on your server and sends **no telemetry and no usage analytics**. The web app
loads no third-party scripts. These are all connections the server itself opens to the internet:

| What | Contacted | When | What is sent | Turn off |
|---|---|---|---|---|
| Licence check | `containly.ch/api/license/v1` | Only with a Pro key: on activation, 5 to 30 s after start and then about every 24 h | Licence key, a random installation ID, the container hostname, the Containly version, the number of connected hosts | Free installations make no licence calls. Removing the key stops them. Offline: the signed lease stays valid until it expires (up to 30 days after the last successful check, for subscriptions at most until 3 days after the paid period); if it expires while the server is unreachable, Pro stays on until at least 14 days after the last successful check |
| Containly update check | `api.github.com` (latest release of `amslertec/containly`) | 5 s after start, then every 6 h, and on a manual check under **Settings > Version and licence** | An HTTP request with the user agent `containly`; no version, key or ID | No switch; if blocked, the Version card simply shows no newer release |
| Image update checks | The registry of each image you run (for example Docker Hub, GHCR, quay.io), through the Docker engine of each host; tag lists from `registry-1.docker.io` for Docker Hub images with version tags | After start, every 6 h and on demand | Image names and tags, plus the registry sign-ins you saved under Settings | No switch |
| Vulnerability scanning | The `aquasec/trivy` image from Docker Hub, then whatever the Trivy container downloads with its default settings (its vulnerability database), from the scanned host | 90 s after start and every 6 h | Image pull and Trivy's own downloads; your images are scanned locally and no scan result leaves the host | **Settings > Schedule > Vulnerability scanning (Trivy)**: off means no scans and no Trivy downloads |
| App catalog | `raw.githubusercontent.com` (the default template list), or the sources you add | When the App catalog is opened (cached 10 min) | A plain download | Remove or disable the source under **App catalog > Sources** |
| Image search and tags | `hub.docker.com` | While you type an image name or open its tags | The search term; your Docker Hub sign-in if you saved one | Do not use the search |
| Image pulls | The registries of the images you deploy or update; Docker Hub for the helper images (`docker:cli`, and a pinned `alpine` image for backups, restores and volume file access) | When you deploy or update, and when a helper is needed on a host and its image is missing there (pulled again after an image prune) | What `docker pull` sends | Part of normal Docker use |
| E-mail | Your SMTP server | Only if SMTP is configured | The notification mails | Leave SMTP empty |
| Notification channels | Only the ntfy, Gotify or webhook URLs you add under **Settings > Notifications > Channels**; for Discord and Slack the webhook URL on `discord.com` or `hooks.slack.com`; for Telegram `api.telegram.org`; for Pushover `api.pushover.net` | When a notification matches a channel, a workflow notify step names it, or you press "Send test" | The notification (title, text, severity, affected object, link) and the token, key, password, signature or headers you configured for that channel | Add no channels, or switch a channel off |
| Web push | The push service of each subscribed browser: `fcm.googleapis.com` (Chrome, Edge, Android), `*.push.services.mozilla.com` (Firefox), `web.push.apple.com` (Safari, iPhone, iPad), `*.notify.windows.com` (Windows) | When a notification for a user with push devices is sent, a workflow notify step picks push, or you press "Send test" | The notification encrypted for that device (the push service cannot read it) and a signed VAPID token | Turn push off on the device, or remove it under **Profile > Push notifications** |
| Microsoft Entra ID sign-in | `login.microsoftonline.com`, `graph.microsoft.com` | Only if Entra SSO is configured: at sign-in and for group sync | The OAuth sign-in flow; group membership and profile photo lookups | Leave SSO off |
| Backups | The S3, SFTP, SMB or NFS targets you configure | When a backup, verification, restore or connection test runs | Your encrypted backup data | Use local targets only |
| Git stacks | The Git repositories you configure | When you deploy or sync such a stack | `git clone` / `git fetch` | Use local stacks |
| Hosts | The Docker hosts you connect (TCP with TLS, SSH, agent) | Continuously while connected | Docker API calls | Part of normal use |
| Legacy licence keys | `api.lemonsqueezy.com` | Only for old Lemon Squeezy keys, about every 24 h | Licence key and instance ID | Not used by `CL1-` keys |

Links to containly.ch (help, forum, pricing, account) open in your browser only when you click them.
The Prometheus export (`/metrics`) and the CI redeploy API are inbound: Prometheus or your
pipeline connects to Containly, Containly opens no connection for them.

---

## License

Containly is proprietary software: free for up to 2 Docker hosts, for private and
commercial use; a Pro license key unlocks more. The source code is not published; this
repository holds the documentation, example files, logos and screenshots, which you may
reuse to set up and describe Containly. Full terms in [LICENSE](LICENSE).

You run a root-equivalent tool; review the security notes before exposing it. Provided
without warranty.
