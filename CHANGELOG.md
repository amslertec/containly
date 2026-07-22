# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.25] — 2026-07-22

### Fixed

- **Image tag, remove and the new layer view failed for images whose reference
  contains `:` or `/`** (i.e. basically every tagged image, e.g. `nginx:latest` or
  `amslertec/app:1.2`, and full `sha256:…` IDs). The image reference was passed as a URL
  path segment, but the id validation rejected the `:` and a `/` broke path routing
  entirely. The reference is now passed as a query/body field instead, so tagging,
  removing and viewing layers work for all image names. Verified end-to-end on an image
  with both `/` and `:` in its name.

## [0.1.24] — 2026-07-22

### Added

- **Active session management** (Profile → Security): see every device your account is
  signed in on (browser/OS, IP, last-seen, the current one marked) and sign out any of
  them individually.
- **Pinned/favourite containers.** Star a container to pin it to the top of the
  Containers list. Favourites are stored per user on the server (by endpoint + name, so
  they survive a recreate) and sync across your devices.
- **Image layer view.** A layers button on the Images page opens a breakdown of an
  image's layers (`docker history`): the command that created each layer, its size
  (with a relative bar) and age — so you can see what makes an image big.

## [0.1.23] — 2026-07-22

### Added

- **Custom log line count.** The log tail selector is now the app's own dropdown
  (instead of the browser-native one) with presets **plus a "Custom…" option** to type
  an arbitrary number (e.g. 100000). The server limit was raised from 5,000 to
  1,000,000 lines and the display buffer grows to match the chosen value.
- **App catalog pagination** (25 per page) so the catalog page isn't overcrowded.

### Fixed

- **App catalog logos now show.** External logo images were blocked by the
  content-security-policy (`img-src 'self' data:`), so every template fell back to the
  default icon. The policy now allows external images, so the real app logos load
  (with the icon as a fallback when a logo is missing or fails to load).

## [0.1.22] — 2026-07-22

### Added

- **Published ports are clickable on the Containers list too** (not just the detail
  page) — they open `http://<host>:<port>` in a new tab.
- **Log line count is now selectable** in a container's Logs tab (100 / 400 / 1000 /
  2000 / 5000), Portainer-style.
- **Count summaries** under the page title on **Volumes** (in-use · orphaned · total),
  **Stacks** (stacks · containers) and **Endpoints** (online · offline · total), like
  the Containers page already had.

### Changed

- Removed the now-redundant descriptive blurbs under the title on the **Stacks**,
  **Endpoints** and **Profile** pages (replaced by the count summaries where relevant).
- Reworded the image-prune confirmation so it no longer reads as a question mid-sentence.

### Fixed

- **Settings tab bar** no longer scrolls a couple of pixels vertically (the active
  underline caused a tiny overflow); it's horizontal-only now.
- **Containers "Refresh" button** no longer flickers every few seconds — the spinner
  now only runs on a manual click, not on the automatic background refresh.

## [0.1.21] — 2026-07-22

### Fixed

- **Backup & restore now include all the newer settings.** The encrypted backup covered
  users, endpoints, registries and the audit log, but the tables added by recent
  features were missing. It now also backs up and restores **SMTP configuration,
  notification settings, scheduled jobs, catalog sources and Git-managed stacks**.
  (User email addresses and language were already included via the full user rows.) The
  Trivy scan cache is intentionally left out — it regenerates itself. Restore only
  clears a table if the backup actually contains it, so restoring an older backup won't
  wipe newer data.
- **Audit log labels** for the newer actions (SMTP, notifications, schedule, catalog,
  GitOps, volume upload/delete, image rescan, email changes) are now properly
  translated (German/English) instead of falling back to a raw, English-only label.
- **Audit log targets** that are long hash IDs (container/image IDs, `sha256:…`) are now
  shortened to 12 characters for readability (full value on hover); readable targets
  (names, tags, types) are shown unchanged.

## [0.1.20] — 2026-07-22

### Added

- **Pull-to-refresh on touch devices** — pull down at the top of any page to reload.

### Fixed

- **Updates page on mobile**: the "check" and "update all" buttons are now icon-only on
  narrow screens, so the header no longer overflows and scrolls sideways.
- **Volume browser**: a long volume name (e.g. an anonymous-volume hash) is now
  truncated in the dialog title instead of overflowing the modal.
- **Containers "Refresh" button** now shows a spinning indicator while refetching, so
  it's clear it did something (the list also auto-refreshes every few seconds).

## [0.1.19] — 2026-07-22

### Added

- **App catalog (Portainer-template style).** A new **App catalog** page lists apps
  from one or more template sources in the Portainer `templates.json` format
  (default: the aggregated Lissy93 catalog, ~400+ apps) — searchable, with a deploy
  dialog (pick endpoint + stack path, name, edit environment variables) that writes a
  `docker-compose.yml` and brings the stack up. **Multiple sources** can be added,
  enabled/disabled or removed (your own JSON URLs too).
- **Volume browser.** Browse the files inside a named volume (per-volume "Browse"
  button): navigate folders, download and upload files, delete entries — all via a
  disposable `alpine` container launched through the helper, so Containly's image
  stays tooling-free.
- **GitOps for stacks.** Add a stack from a Git repository (clone into a stack path);
  a **Sync** button pulls updates and, on a new commit, redeploys; optional **auto-sync**
  pulls every 5 minutes and redeploys on change. Git runs in a disposable `alpine/git`
  container via the helper.
- **Clickable published ports.** On the container detail page, published TCP ports are
  now links to `http://<host>:<port>` (host resolved from the bind IP, the endpoint
  host, or the address you reached Containly on).

## [0.1.18] — 2026-07-22

### Added

- **Scheduled maintenance (Settings → Schedule).** Recurring jobs, each with an on/off
  switch, daily/weekly cadence, weekday + time (server time), a "run now" button and a
  last-run status:
  - image prune, volume prune (destructive, with a warning), update check,
    vulnerability scan, encrypted backup (written to `/data/backups`, keeping the last
    14), and **auto-update**.
  - **Auto-update** only touches containers labelled `com.containly.auto-update=true`
    (Watchtower-style) — it pulls the new image and recreates them via the existing
    deputy/recreate mechanism.
- **Installable PWA.** Containly now ships a web manifest, icons (incl. maskable) and a
  service worker (Workbox), so it can be installed to the home screen / desktop and run
  standalone. API and health requests are never cached.

### Changed

- The **Settings tab bar** is now horizontally scrollable on narrow screens (no
  wrapping or clipping), so all tabs are reachable on mobile.

## [0.1.17] — 2026-07-22

### Added

- **Email notifications.** A new **Settings → Notifications** tab configures your own
  **SMTP server** (host, port, TLS, credentials, from address — password stored
  encrypted) with a **test-email** button, and a catalog of notifications where each
  type has an on/off switch, a threshold (where applicable) and recipients (**all
  admins** or a specific selection of users). A background monitor watches **all
  endpoints** and sends email on:
  - endpoint offline / back online,
  - container stopped unexpectedly / unhealthy / OOM-killed / restart loop,
  - image update available / new Containly version,
  - new critical vulnerabilities found (from the Trivy scan),
  - high CPU / high memory (per container) / low host disk space — with thresholds.

  Emails are nicely designed HTML with the Containly logo embedded (renders in all
  clients), a severity-coloured header, a details table and an optional deep link
  (set `CONTAINLY_PUBLIC_URL`). A 30-minute cooldown prevents duplicate alerts, and
  existing conditions at startup do not trigger a flood.
- **Per-user email addresses.** Set your own under **Profile → Account**; admins can
  set them for others on the **Users** page (and optionally during first-time setup).
- **Per-recipient language.** Each user's language preference is now stored on the
  server, and every notification is sent to each recipient **in their own language**
  (German or English) — recipients are grouped by language and each group gets its
  localised email.
- **Sign in with username _or_ email.** Login now accepts either identifier.

### Changed

- The test-email now reports the SMTP server's actual response and fails clearly if
  the server **rejects** the recipient, instead of always reporting success.

## [0.1.16] — 2026-07-22

### Added

- **Image vulnerability scanning (Trivy).** The Images page now shows a **Security**
  column with per-image vulnerability counts by severity (Critical │ High │ Medium │
  Low); a clean image shows a green check. Scanning runs automatically in the
  background (90 s after start, then every 6 h) and results are cached; a **Rescan**
  button with progress triggers an immediate re-scan. Re-scans happen automatically
  after 24 h (1 h after a failed scan).
  - Trivy does **not** run inside the Containly image — it runs as its own
    `aquasec/trivy` container on the target host, launched through the existing helper
    container, with the vulnerability DB kept in a persistent `containly-trivy-cache`
    volume. Containly's image stays scanner-free. Works for local and remote endpoints
    and for private/self-built images.
  - **Clicking a severity badge opens a CVE detail modal** listing each finding — CVE
    id (linking to the advisory), affected package and installed version, the fixing
    version, and title — filterable by severity.

### Fixed

- **Networks page showed 0 containers for every network.** Docker's network list
  endpoint does not include container membership (only `inspect` does), so the count
  was always zero. It is now derived from the container list and shows the real number
  of containers attached to each network.
- **Sorted tables no longer jump around on refresh.** Sorting a column with many equal
  values (e.g. all volumes with driver `local`) had no tiebreaker, so equal rows
  reshuffled every time the data refreshed. Sorting is now stable (equal rows keep a
  fixed order across refreshes) on all tables.

### Changed

- Removed sorting on low-value columns where it wasn't useful: **Images → "Containers"**,
  **Volumes → "Driver"**, and **Networks → "Scope"** are no longer sortable (still
  resizable).

## [0.1.14] — 2026-07-22

### Added

- **Command palette (⌘K / Ctrl+K)** — a global launcher to jump to any page, host,
  container or image by typing; full keyboard navigation. Also reachable via a search
  button in the sidebar.
- **Bulk actions on the Containers page** — select multiple containers (app-styled
  checkboxes) and start / stop / restart / remove them in one go, with a summary toast.
- **Sortable, resizable and persisted table columns** across Containers, Images,
  Volumes, Networks and Stacks. Click a header to sort (▲ a–z, ▼ z–a); drag a column's
  right edge to resize. Sort order and column widths are remembered per table (in the
  browser) and restored on the next visit. On Containers, sorting "Status" orders by
  uptime.

### Changed

- Checkboxes are now rendered in the app's own style instead of the browser default.

## [0.1.13] — 2026-07-22

### Fixed

- **Updated containers now report the new image's version, not the old one.** When
  recreating a container on update, Containly copied the old container's full
  environment — including image-baked defaults such as `CONTAINLY_VERSION`. That froze
  the old value onto the new container, so after a self-update Containly kept showing
  the previous version even though it was already running the new image. Unchanged
  image-default env vars from the old image are now dropped on recreate so the new
  image's defaults apply; user/compose-set env vars are preserved.
- **Recreate is now name-safe.** The recreate routine now operates on the resolved
  container ID after inspect, so renaming the old container aside can never make a
  later remove target the freshly created one.

## [0.1.12] — 2026-07-22

### Fixed

- **Image search dropdown**: gave it the solid `surface` background used by the other
  dropdowns (it was semi-transparent, so the table showed through) and raised its
  stacking order so it renders above the images table instead of behind it.

## [0.1.11] — 2026-07-22

### Fixed

- **Self-update can no longer take Containly offline.** The 0.1.9/0.1.10 self-update
  decided "is this my own container?" by reading the *first* 64-character hex string
  from `/proc/self/cgroup` or `/proc/self/mountinfo`. On some hosts that string is an
  overlay2 **layer hash** (or a custom `hostname:` was set), not the container ID — so
  the check failed, the deputy container was never started, and Containly ran the
  normal recreate **on itself**, stopping its own process mid-way and leaving the
  container down. Now fixed with defense in depth:
  - **Reliable self-detection** via the container hostname (`os.hostname()` ===
    `Config.Hostname`), which is independent of storage driver and cgroup layout; the
    ID lookup is only a fast pre-check and now matches the container ID specifically.
  - The deputy is launched with the **actually resolved** container ID, not a guessed
    one.
  - **Hard safety net:** the recreate routine now *refuses* to recreate the container
    the process is running in. Even if detection ever fails again, an update can no
    longer stop Containly — at worst it reports a failed update while staying up.

## [0.1.10] — 2026-07-22

### Added

- **Image search autocomplete on the Images page.** The pull field now suggests
  images from Docker Hub as you type: the repositories of your connected Docker Hub
  account first — **including private ones** (and organisations you belong to) — then
  popular public matches (official images and star count first). Picking a repository
  loads its available tags to choose from, so you end up with a ready `repo:tag`
  reference. Built for speed: the login token, your repo list and public results are
  cached server-side, and the frontend debounces and cancels in-flight requests.

## [0.1.9] — 2026-07-22

### Fixed

- **Containly can now update itself.** Applying an update to Containly's own image
  previously pulled the new image but left the container running the old version — a
  container cannot `stop`/`remove` and recreate *itself* (it kills its own process
  mid-operation). Containly now delegates its own recreate to a short-lived **deputy
  container** started from the new image (with the Docker socket): it replaces the
  running Containly container and then removes itself. The Compose project labels are
  preserved, so a Compose-managed Containly stays recognised by `docker compose`.

### Changed

- **Container recreate on update is now rollback-safe.** For every container an update
  recreates, the old container is renamed aside and only removed once the new one has
  started; if creating/starting the new container fails, the previous one is restored
  and started again. This applies to all endpoints (local and remote).

> **Note:** self-update only works once the *running* Containly already contains this
> mechanism (0.1.9+). To move an older install onto it once, update manually with
> `docker compose pull && docker compose up -d`. From 0.1.9 onward, updating Containly
> from the Updates page works.

## [0.1.8] — 2026-07-22

### Fixed

- **Stacks on the local endpoint are now found without extra mounts.** The local
  (socket) endpoint now reads its configured stack paths through the helper
  container — the same way remote endpoints do — so paths added under Endpoints are
  read straight from the host. Previously the local endpoint read the Containly
  container's own filesystem, so a stack path only worked if it was also bind-mounted
  into the Containly container.

### Added

- The **Images page** now shows which container(s) use each image.
- **Profile → change password** now has a confirm-password field and a show/hide
  toggle (matching the first-time setup).

## [0.1.7] — 2026-07-22

### Fixed

- **Data is no longer lost on container update/recreate.** If a relative
  `CONTAINLY_DATA_DIR`/`CONTAINLY_STACKS_DIR` (e.g. a `./data` left over in a copied
  `.env`) was passed to the container, Containly wrote its database to the ephemeral
  container filesystem and reverted to setup mode after every recreate. In the
  production image a relative path is now ignored in favour of the mounted `/data`
  and `/stacks`, so users, endpoints and settings persist. Custom **absolute** paths
  are still honoured.

### Changed

- The example `docker-compose.yml` now uses **Docker named volumes**
  (`containly-data`, `containly-stacks`) for `/data` and `/stacks` instead of
  host-path bind mounts.

## [0.1.6] — 2026-07-22

### Added

- **Updates now recreate the running container.** Applying an image update (single
  or bulk) pulls the new image and then **recreates** every container using it — with
  the same name, env, ports, volumes, networks and restart policy — so it immediately
  runs the new image. Works for standalone and Compose-managed containers (Compose
  labels are preserved) and over the Docker API (local + remote).

### Security

- **Removed the bundled Docker CLI/Compose toolchain from the image.** `docker
  compose` now runs in a disposable official `docker:cli` **helper container** on
  each target host — the same mechanism already used for remote endpoints, now for
  local ones too. This strips the entire Go-toolchain CVE surface (x/crypto, x/net,
  containerd, grpc, Go stdlib) out of the distributed Containly image, so an image
  scan reports **zero vulnerabilities** with any scanner. The image is ~90 MB smaller.

## [0.1.5] — 2026-07-22

### Security

- **Hardened the container image**: switched the base to **Alpine** and removed the
  bundled global npm/corepack (an unused CVE source). Trivy now reports **0 known
  vulnerabilities** (down from 100+ OS/tooling CVEs), and the image is ~114 MB smaller.
- The example `docker-compose.yml` now runs with `no-new-privileges` and drops all
  Linux capabilities (`cap_drop: ALL`).
- Added a **Trivy vulnerability scan** to CI that fails the build on fixable
  CRITICAL/HIGH findings.

### Changed

- Updated all dependencies to their latest versions — including major bumps of
  `better-sqlite3` (13) and `tar-stream` (3), plus `argon2` 0.45.1, `react`/`react-dom`
  19.2.8, `@tanstack/react-query` 5.101.4 and others.

## [0.1.4] — 2026-07-21

### Added

- **Live terminal output** for stack deploy / down / start / stop / restart — the
  `docker compose` output now streams in real time over WebSocket (pull progress,
  container creation, errors) with auto-scroll, instead of only showing the final
  result. Works for local and remote (helper-container) endpoints.

## [0.1.3] — 2026-07-21

### Added

- Update notifications now render the release notes as **formatted markdown**
  (headings, bold, bullet lists, links) instead of raw text.

### Fixed

- The Stacks page crashed (Radix `Slot` error) when no stack path was configured
  yet — it now shows a clear message with a link to the Endpoints page.

### Changed

- GitHub release notes are taken from `CHANGELOG.md` (plus the auto-generated
  "What's Changed" list), so the in-app update dialog shows the real changelog.

## [0.1.2] — 2026-07-21

### Added

- **Setup**: reveal-password toggle and a **confirm-password** field when creating
  the first admin.
- README **screenshots** (setup, dashboard, endpoints) and a clearer first-time
  setup guide.

### Changed

- Removed the crypto/feature badge from the setup and login screens.

## [0.1.1] — 2026-07-21

### Added

- **Self-update notification** — checks the latest GitHub release, shows an update
  modal with the changelog when a newer version exists, and a Settings **"Version"**
  tab with a manual "check now". The running version is injected from the release tag.
- **Stack lifecycle from the detail view** — Start / Stop / Restart buttons alongside
  deploy / down, with the command output shown in a terminal-style modal.
- **Delete entire folders** (recursively) from the stack file browser.

### Changed

- The example `docker-compose.yml` now loads all configuration from `.env`
  (`env_file`), so there is a single source of truth for settings.

### Fixed

- `CONTAINLY_SECURE_COOKIES` now defaults to `false` so fresh installs reached over
  plain HTTP render correctly. With `true` over HTTP the CSP `upgrade-insecure-requests`
  directive upgraded assets to HTTPS (not served) and produced a blank page.

## [0.1.0] — 2026-07-21

First public release. Containly is a modern, secure, self-hosted Docker
management web UI where stack definitions live as version-controllable files on
the filesystem instead of in a database.

### Added

- **Containers** — list, detail/inspect, start/stop/restart/pause/kill/remove,
  live logs, exec console (in-browser terminal), live resource stats (CPU/RAM/net/IO).
- **Images** — list, pull, remove, prune (including unused tagged images),
  tag management, update indicator.
- **Volumes & networks** — list, create, remove, inspect, detect orphans.
- **Stacks** — Compose deployments as files; per-endpoint configurable paths;
  file browser with folder navigation, editor, "new file", search
  (stack/container/image name), a `docker run` → `docker-compose.yml` converter,
  and stack-wide actions (deploy/down/start/stop/restart/pause/kill).
- **Multi-host** — multiple endpoints: local socket, TCP with TLS client
  certificates, SSH; an "All hosts" combined view; agent-less remote stack
  management via a helper container (file CRUD + deploy over the plain Docker API).
- **Updates** — registry digest checks without pulling, background checking, and
  a server-side bulk update job (survives reloads) with live progress.
- **Registry login** — Docker Hub / registry sign-in (encrypted) for
  authenticated pulls & checks and private images.
- **Security** — Argon2id password hashing, session cookies (HttpOnly/SameSite)
  with CSRF, rate limits, Helmet/CSP, **two-factor authentication (TOTP + recovery
  codes)**, AES-256-GCM encryption of endpoint secrets at rest, audit log.
- **Backup & restore** — passphrase-encrypted full backup (users, endpoints,
  registries, audit log + master key) for dev→prod migration.
- **i18n** — German & English; light/dark theme.

[Unreleased]: https://github.com/amslertec/containly/compare/v0.1.25...HEAD
[0.1.25]: https://github.com/amslertec/containly/compare/v0.1.24...v0.1.25
[0.1.24]: https://github.com/amslertec/containly/compare/v0.1.23...v0.1.24
[0.1.23]: https://github.com/amslertec/containly/compare/v0.1.22...v0.1.23
[0.1.22]: https://github.com/amslertec/containly/compare/v0.1.21...v0.1.22
[0.1.21]: https://github.com/amslertec/containly/compare/v0.1.20...v0.1.21
[0.1.20]: https://github.com/amslertec/containly/compare/v0.1.19...v0.1.20
[0.1.19]: https://github.com/amslertec/containly/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/amslertec/containly/compare/v0.1.17...v0.1.18
[0.1.17]: https://github.com/amslertec/containly/compare/v0.1.16...v0.1.17
[0.1.16]: https://github.com/amslertec/containly/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/amslertec/containly/compare/v0.1.14...v0.1.15
[0.1.14]: https://github.com/amslertec/containly/compare/v0.1.13...v0.1.14
[0.1.13]: https://github.com/amslertec/containly/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/amslertec/containly/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/amslertec/containly/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/amslertec/containly/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/amslertec/containly/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/amslertec/containly/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/amslertec/containly/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/amslertec/containly/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/amslertec/containly/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/amslertec/containly/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/amslertec/containly/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/amslertec/containly/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/amslertec/containly/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/amslertec/containly/releases/tag/v0.1.0
