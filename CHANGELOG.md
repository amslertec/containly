# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.6.0] — 2026-10-15

### Added

- **View and grouping selector on every resource list.** Containers can be shown as a list, by
  Compose stack (plus a group for standalone containers) or, under All hosts, by host. Images can
  be shown as a list, as **Images** (all tags and versions of a repository together; different
  registries stay separate), by the stacks that use them or by host. Volumes and networks group by
  stack (from their real Compose labels and the containers that use them, with Standalone and
  Unused groups) or by host; networks keep the driver grouping. The backup overview groups by
  stack, resource type or host. A resource shared by several stacks appears under each of them,
  while selection and bulk actions still count it once (per host and ID); identical stack names on
  different hosts never merge. The selector is one accessible dropdown, also on phones, the choice
  is remembered per page, and switching from All hosts to a single host falls back from Host to
  List.
- **Entra ID users show their sign-in name.** The user list, user detail and profile show the
  Entra `preferred_username` (UPN) instead of the object ID. The immutable object ID stays the
  only key that links a sign-in to an account and is shown separately as "Entra object ID" in the
  account details. Existing Entra users get their sign-in name on their next sign-in. Local and
  Entra accounts are never merged by e-mail or UPN.

### Changed

- **User detail.** Reset password is only in the three-dot menu (no separate header button on
  desktop or phone), the role and sign-in source badges sit side by side in one row, and the
  username is shown once (below the display name only when it differs).
- **Container logs in English.** All operator-facing Docker logs (startup, migrations, background
  jobs, helpers, licence checks and the first-setup banner with the setup token) are English,
  independent of the UI language. The UI and API messages stay translated.
- **Dark mode multi-select bar.** The bulk action bar is a raised dark surface with a border in
  dark mode instead of a bright white bar (containers, images, volumes, networks, stacks, hosts,
  updates, users). Light mode is unchanged.
- The support address is now support@containly.ch (README, Docker Hub page, security policy, the
  licence file and the licence error messages).

### Fixed

- **Restart-loop notification never fired.** The background monitor read the restart count from
  the container list, which does not carry it, so every container counted as 0 restarts. The
  count now comes from cached inspect data (refreshed only for running or restarting containers
  that may have restarted), and the "restart loop" notification is sent again.
- **Phones: Most restarts card.** Long container and host names no longer push the restart count
  outside the card; the host sits under the name and long names wrap.
- **Phones: Compose editor.** In the stack editor and the new stack dialog the editor frame stays
  inside the screen; swiping sideways scrolls only the text, not the toolbar, dialog or page.

## [2.5.2] — 2026-10-15

### Changed

- **Demo start page in German, English and Spanish.** The demo gateway now speaks the visitor's
  language on every page it renders: start page, session ended, expired, maintenance, capacity
  and rate-limit notices. A flag menu (Germany, United Kingdom, Spain) switches the language
  with mouse or keyboard. The language is picked from an explicit `?lang=` link parameter
  (the website passes its current language), then the stored demo choice, then the browser
  language, then English. The chosen language is carried into the demo session, so the app
  opens in it, and an explicit language change inside the demo is kept across logout, restart
  and expiry.

### Fixed

- The demo start page was always German for visitors whose browser or website language was not
  German, because the website language never reached the demo host.

## [2.5.1] — 2026-10-14

### Added

- **Test connection in backup target dialogs.** New and edit dialogs for all six target types
  (local folder, host folder, S3, SFTP, SMB, NFS) have an optional "Test connection" button that
  checks the unsaved settings before you save. The test writes a uniquely named object, reads it
  back, compares it and removes it again; it never creates folders, never overwrites existing
  files, and reports a failed clean-up instead of claiming success. Nothing is saved, pinned or
  recorded by a test. A stored secret is only reused for the same target and destination; if you
  change the destination, enter the secret again. The result is cleared when a field changes. In
  the demo the test is simulated without network access.
- **"With backups" filter.** The backup overview has a new segment after "All" that lists only
  hosts and resources that have at least one complete backup set (English, German, Spanish). The
  counts follow the selected host and search.

### Changed

- The connection test of saved targets uses the same safer probe (exclusive test object, clean-up
  reporting, translated error messages).

### Fixed

- **Backup list:** icons, names and the metadata line no longer touch the row borders; rows keep
  even vertical spacing and centred actions.

## [2.5.0] — 2026-10-14

### Added

- **Anonymous volumes in backups.** Container and stack backups include anonymous Docker volumes
  by default (per-plan and ad-hoc opt-out). They are identified by container name and mount path,
  not by the random volume name, and the new manifest entry type is documented in
  `docs/backup-format.md`. Database dumps work on them. Restores map to the volume that is
  mounted at that path now, or create a named local volume when the container is missing; stack
  restores persist an external-volume Compose override and verify the effective mounts before and
  after. Ambiguous replicas and unsafe partial selections fail closed. Old sets stay readable.
- **SMB and NFS backup targets (Pro).** SMB3 with mandatory session encryption (encrypted
  password, secret-free auth file, no credentials in process arguments or Docker metadata) and
  NFSv4/v4.1 mounted by hardened, capability-free helpers on the selected Docker host. Connection
  test with clear errors, configuration UI in English, German and Spanish, and simulated storage in
  the demo. Existing sets on these targets stay scannable, verifiable, downloadable and
  restorable after a licence downgrade.
- **Restore to another host (Pro).** Containers, volumes and Compose stacks can be restored onto a
  different Docker host, as a copy or by replacing the destination after a safety backup made on
  that host. Stacks go into a chosen stack folder of the destination with new project and volume
  names; the Compose file is checked on the destination and source host paths, host namespaces,
  privileged mode and external resources are refused before anything is written. Raw volume data
  and database dumps (PostgreSQL verified end to end) restore to identical data; the source host
  is never touched. The restore wizard offers every host and stack folder, with a simulation in
  the demo.

### Changed

- **Built-in local host name.** New installs store the neutral name "Local Docker". While the name
  is unchanged it is shown in the interface language ("Local Docker", "Lokaler Docker", "Docker
  local"); a renamed host keeps its name.
- **Update check.** Only a strictly newer release counts as an update (semantic versioning,
  pre-releases rank below their release), so a development or newer build is never offered an
  older version. The release information is refreshed shortly after start and the release notes of
  a version older than the installed one are never shown.
- **Notifications.** The full translated detail text of a notification is available as a tooltip on
  desktop and wraps to two lines on touch screens.

### Fixed

- **Backup progress:** the estimate only covers the volumes (stack folder, database dumps and the
  container configuration come on top), so a run could show "1.22 GB / 822 MB · 100 %" while still
  running. Once the written bytes pass the estimate, the progress shows the bytes alone with a busy
  bar, and the percentage never reaches 100 % before the run is done.
- **Backups no longer warn about host system files:** binds of `/etc/localtime`, `/etc/timezone`,
  `/etc/hosts`, `/etc/resolv.conf`, the Docker socket and paths below `/dev`, `/proc`, `/sys`,
  `/run` or `/usr/share/zoneinfo` are host files, not app data. They are skipped without the
  "bind mount outside the stack folder" warning.
- **Update notification:** the "new version" notification is no longer sent when the installed
  version is not older than the latest release.

### Security

- **SMB confinement.** `smbclient` runs under a small unprivileged helper (Landlock TCP port rule
  plus seccomp) and can only reach a one-shot loopback proxy that forwards to the validated,
  pinned server address. A DFS referral or fallback address cannot send a single byte to another
  peer (verified with a real Samba DFS proxy). This needs Linux 6.7 or newer and Docker's default
  seccomp profile; without Landlock the SMB connection test reports it and SMB fails closed.
- **Cross-host restore hardening.** The preview token signs the destination engine, name, stack
  root and every mapping; destination volumes are always plain local volumes (no replayed driver
  options); archived Compose overrides are never inherited; stale previews are rejected.

## [2.4.2] — 2026-10-13

### Added

- **Clean up on all hosts.** The clean-up dialogs for images, volumes and networks offer
  "All hosts" as the first host option (preselected when the page shows all hosts, otherwise
  the current host). The preview lists per host what would be removed (count and approximate
  size, total at the bottom; hosts with nothing to remove and skipped offline or locked hosts
  are shown), the button shows the total, and confirming cleans up all online hosts in parallel
  (at most four at a time). The result is shown per host (removed, freed space, errors); an
  error on one host does not stop the others. Admin only, with an audit entry per host as before.

### Fixed

- **In-app notifications in each user's language.** Notifications were stored with English detail
  text for everyone. They now store a message key with parameters (new nullable columns, schema
  migration 43) and the notification panel shows the detail in the current UI language
  (English, German, Spanish) and follows a language switch. All notification types are covered
  (hosts, containers, performance, disk, updates, vulnerabilities, backups). Notifications created
  before the update keep their stored text; e-mails are unchanged.
- **One Escape closes the notifications panel.** With the settings gear tooltip open, the first
  Escape only closed the tooltip; now it closes the panel as well.

## [2.4.1] — 2026-10-13

### Fixed

- **Host CPU and RAM missing for later hosts.** The dashboard host table showed CPU and RAM only
  for the first hosts; hosts further down the list showed a dash. The container sampler queried
  every container of every host one after the other (one to two seconds each) and stamped all
  values with the start time of the pass, so with many containers the values of later hosts were
  already too old when the host table read them. Hosts are now sampled in parallel (at most 4
  containers per host and 16 overall at a time, 10 s timeout per container), each host's values
  carry the time its sampling finished, and the freshness window grows with the measured duration
  of a pass (at least 150 s). The first pass now runs a few seconds after start.

### Added

- **Disk usage for remote hosts.** TCP, SSH and agent hosts now show the real disk usage (used of
  total) of the filesystem that holds Docker's data directory. Containly measures it at most every
  10 minutes with a short-lived helper container (the same hardened helper the host folder picker
  uses: no network, no capabilities, read-only root filesystem, Docker's data directory mounted
  read-only). If the helper cannot run, the table falls back to the space used by Docker.

### Changed

- **Space used by Docker instead of a dash.** When only the space used by Docker is known, the
  disk cell shows it (for example `12 GB`) with a tooltip explaining the value.

## [2.4.0] — 2026-10-13

### Added

- **Spanish.** The whole interface is available in Spanish (neutral international Spanish),
  next to German and English. Dates, times and numbers follow the language (`Intl` locale `es`).
- **Language menu with flags.** One compact menu replaces the DE | EN switch in the header, on
  the sign-in and setup screens, in the phone menu and on the profile page: the round flag of the
  current language opens a list with flag and native name (Deutsch, English, Español) and a check
  on the active one. Full keyboard support (Enter or Space opens, arrow keys move, Escape closes),
  screen readers hear the language name; the flags are bundled SVG files (circle-flags, MIT), so
  they look the same on every system.
- **Spanish e-mails.** Notifications, invitations, password resets, backup alerts, update notices
  and the SMTP test mail are sent in Spanish to users who chose Spanish. Invitations can be sent
  in Spanish.
- **Backup targets: folder picker** for local folders and host paths (browse, create a folder,
  pick) instead of typing the path. A "Browse" button next to the path field opens an explorer
  with breadcrumb, root chips (`/backups`, `/data/backups`), read-only badges, an inline "New
  folder" field and full keyboard support; on phones it is a full-screen sheet. Only folders
  inside the allowed roots are listed (no symlink escapes); on the host, system and stack paths
  are blocked and the host is read through a short-lived, read-only helper container. Folder
  creation is audit-logged. The demo shows a simulated tree.
- **Passphrase generator** in the "New backup key" dialog: "Generate" creates a strong
  passphrase (6 words from the EFF large wordlist plus a 2-digit number, about 84 bits, from
  `crypto.getRandomValues`), fills both fields, shows it and offers "Copy". The "stored in my
  password manager" confirmation stays required.
- **Settings: vulnerability scanning (Trivy) can be turned off;** CVE badges and the dashboard
  tile disappear, no scans or database downloads run. The switch lives in Settings > Schedule,
  is instance-wide (default on) and audit-logged; stored results are kept and show again when it
  is switched back on.

### Changed

- The language preference of a user accepts `es`. Unknown or missing languages fall back to
  English everywhere (interface, e-mails, help links, date formats).
- Help, forum and account links open the English pages of containly.ch for Spanish until Spanish
  pages exist.
- The demo can be used in Spanish. Its start, busy and expiry pages follow the browser language
  (English, German, Spanish; English otherwise), and the demo data (backup plans, keys, targets)
  uses English names in every language.

### Fixed

- The app no longer loads `lemon.js` from `assets.lemonsqueezy.com` on every page; the overlay
  checkout it served is gone since licences are bought in the Containly shop (new tab). The
  Content-Security-Policy no longer allows Lemon Squeezy scripts, frames, connections or form
  targets. Existing Lemon Squeezy keys keep working (validated by the server).

- Dropdown menus: the selected item stayed unreadable while highlighted or focused (dark text on
  dark in dark mode, light on light in light mode); all menus fixed.
- Counts in the users list, notification recipients, the audit log hint and the restore messages
  use proper singular and plural forms ("1 account", not "1 accounts").
- The profile hint about e-mail language now says correctly that e-mails arrive in English until a
  language is chosen.
- Accepting an invitation now sets the new account's language to the invitation's language (or to
  the language picked on the accept page), so later e-mails such as a password reset arrive in that
  language.
- Messages from the server (errors, connection test results of backup targets, backup and restore
  errors, migration steps, validation errors) were shown in German in every language. They now
  appear in the UI language (English, German, Spanish). The API keeps its fields and returns an
  English text plus a stable message key with parameters (`messageI18n`, `detailI18n`, ...).
  Backup failure e-mails show the error in the recipient's language.

## [2.3.0] — 2026-10-12

### Added

- **Backups, phase 2 (Pro): plan schedules.** Plans run hourly, on chosen weekdays or monthly
  at a set time (start spread over five minutes), show the next run in the list and inspector
  and catch up a missed run on the same day. Schedules share the scheduler of updates and
  configuration backups. Without an active Pro licence scheduled plans pause ("Pausiert") and
  resume on their own once Pro is active again; the settings are kept.
- **Notification `backup.stale`:** warns once per gap when a scheduled plan has had no
  successful backup for the configured number of days (default 3), by email and in the app.
- **Scheduled verification (Pro):** a plan can read its newest set back in full every N days
  (checksums, decryption, manifest MAC).
- **S3-compatible targets (Pro):** Amazon S3, Hetzner Object Storage, Backblaze B2, MinIO,
  Cloudflare R2, Wasabi and other S3 services with presets for endpoint and region. Own small
  SigV4 client (multipart uploads in 16 MiB parts, path or virtual-host addressing, optional
  custom CA). The endpoint is checked against SSRF rules: no loopback, link-local or cloud
  metadata addresses, not Containly itself, no redirects, the resolved address is pinned for
  the connection; private LAN addresses stay allowed (`CONTAINLY_BACKUP_BLOCK_PRIVATE=1` blocks
  them). HTTP only on request for a MinIO in the LAN. Remote targets only accept encrypted sets.
- **SFTP targets (Pro):** password or private key (stored encrypted), host key pinned on the first
  successful connection test (TOFU) and checked on every connection after that, uploads under
  `.part` and renamed when complete. Same SSRF rules as S3.
- **Database dump presets for backup and restore:** PostgreSQL (`pg_dumpall`), MariaDB and MySQL
  (`mariadb-dump`/`mysqldump`), MongoDB (`mongodump --archive`) and Redis (RDB snapshot). The
  databases of a stack are detected by image and preselected; the dump runs in the running
  container without stopping it, optionally with the other containers of the stack stopped and
  the raw volume data copied as well. Credentials are read from the container at run time
  (including `*_FILE` secrets), passed as exec environment only and never stored. Restore loads
  the dump after the containers are up again (Redis as a file restore, also with AOF on). Free,
  like all consistency modes.
- **Download and import (`.clbk`):** a complete set can be downloaded as a single file (a tar
  with the manifest first, encryption untouched) and imported on another Containly instance onto
  any of its targets; every file is checked against the manifest. Free.
- **"Containly ist nicht erreichbar" screen:** when the web app or the installed PWA cannot reach
  the server, or something in between answers instead (VPN off, reverse proxy or WAF with an HTML
  401/403, SSO login page, 502/503), a full-screen state names the likely reason (offline, no
  answer, blocked by a proxy or firewall, proxy sign-in, server error) with tips, a retry button
  and automatic retries (3 s up to every 30 s). It disappears as soon as Containly answers; nothing
  is reloaded and unsaved input stays. Such answers are no longer read as "logged out".
- **Help and community links:** the user menu (desktop), the "Mehr" sheet (phone) and a new card
  "Hilfe und Community" under Settings > Version link to the help pages, the community forum and
  the support chat on containly.ch (German or English by the app language, opened in a new tab).
  Admins also get a link to the customer account, and the licence panel points there for
  licences, invoices and the subscription. The "nicht erreichbar" screen links help and forum.
- Demo: S3 and SFTP targets and the dump presets work simulated (nothing leaves the demo).

### Changed

- Backup plan dialog: the schedule and verification settings replace the "folgt später" note;
  Free shows them locked with a hint. Target dialog: S3 and SFTP are selectable (Pro), SMB and NFS
  stay marked for a later version, like restoring to another host.
- Existing backups on Pro targets stay listable, verifiable, downloadable and restorable without
  Pro; only new writes need Pro.

### Fixed

- **No more black screen after an update or with a blocked bundle:** a failed page chunk (old tab
  or PWA after an update) reloads once with fresh caches instead of leaving an empty page; if the
  app bundle does not start at all, a plain "nicht erreichbar" page with retry appears after a
  few seconds. The service worker drops the precache of older builds and takes over at once
  (versioned cache name), and the server no longer lets browsers cache `sw.js`,
  `registerSW.js`, `boot.js` or the manifest.

## [2.2.0] — 2026-10-12

### Added

- **Data backups for stacks, containers and volumes:** a new page **Backups** (`G R`)
  backs up the data of a stack (named volumes, the stack folder with compose file and
  `.env`, the container configuration with image digests), a single container or a single
  volume, and restores it on the same host. Free for manual backups.
  - **Back up now** on the Backups overview, in the stack list and stack inspector (new
    tab "Backups"), on the container overview and on the Volumes page.
  - **Encrypted by default:** streaming tar, zstd compression and chunked AES-256-GCM
    (format CENC1) with a key derived from your passphrase (scrypt). The passphrase is
    never stored; unattended runs use the derived key, kept encrypted with the instance
    master key. Unencrypted backups stay possible on local targets.
  - **Open format with a recovery tool:** every backup set has a plaintext `manifest.json`
    (written last, so a set without it is incomplete) and can be read without Containly
    with `scripts/clbk-decrypt.mjs` (in the image under `/app/scripts`). The format is
    documented in `docs/backup-format.md`.
  - **Targets:** a folder on the Docker host (default `/var/backups/containly`, written
    through a short-lived hardened helper container, so it works on socket, TCP, SSH and
    agent hosts) or a folder inside the Containly container (for example a dedicated
    `/backups` mount). Test connection and scan for existing sets.
  - **Consistency:** live, stop the containers during the backup (they are started again
    afterwards, also after a crash of Containly on the next start) or pre and post hooks.
  - **Restore:** always with a server-side preview first (actions, conflicts, risky
    settings, disk space). Restore as a copy (new names, nothing is overwritten) or replace
    (type the name to confirm; a safety backup is made first and pinned for 7 days).
  - **Plans** bundle contents, target, key, compression and retention and run with
    "Run now". Retention (keep last, daily, weekly, monthly, yearly) is free.
  - Runs with live phases, progress and log; verify a set on demand; pin and delete sets.
  - Notifications `backup.failed` (on) and `backup.succeeded` (off) by email and in the
    app, audit log entries for every action, viewers can look but not change anything.
- **Pro, visible but not yet available:** schedules for plans, S3, SFTP, SMB and NFS
  targets, database dump presets and restoring to another host are marked in the UI and
  follow in a later version.

### Changed

- Settings: "Backup and restore" is now called **Containly configuration** and points to
  the new Backups page. The scheduled configuration backup is labelled accordingly.
- While a backup or restore holds a stack, container or volume, deploys, stack actions,
  migrations, auto updates, container actions and volume removal answer "Backup läuft"
  (409) instead of interfering. Containers stopped for a backup do not trigger
  "container exited" alerts.

### Fixed

- **Helper container per Containly instance:** with two Containly instances on one Docker
  host, both used the same `containly-helper` container and recreated it with their own
  folder mounts in turn. A write could then land inside the helper instead of the host (a
  stack restored as a copy reported "ok" but was not in the stack folder). Each instance now
  runs its own helper (`containly-helper-<instance id>`, label
  `ch.amslertec.containly.instance`), checks its image, labels and mounts before use and
  before every write, and recreates it when anything differs. Stack file writes and restored
  stack folders are checked on the host afterwards; a restore fails with an error if the
  data is not there. The old shared `containly-helper` is left for its owner.
- Deleting backup sets no longer leaves empty folders on the target; empty parent folders
  are removed up to the target folder.

## [2.1.0] — 2026-10-12

### Added

- **Own licensing (CL1 keys):** Containly now accepts licence keys from the new Containly
  shop (`shop.containly.ch`, keys start with `CL1-`). The key is checked offline against the
  public key of the Containly licence server; activation binds it to this installation and
  stores a signed lease. Pro is decided locally (lease signature, licence and installation
  match, expiry), so Containly keeps working offline. The lease is renewed on start, about
  every 24 hours (with jitter) and on "Check now". If the licence server cannot be reached
  the current lease stays valid until it expires (plus up to 14 days if it expired while
  the server was unreachable); a definitive answer (revoked, refunded, cancelled after the
  paid period, unknown licence) ends Pro right away. A licence covers one Containly
  installation with any number of Docker hosts. If it is already active on another
  installation, the licence card names that installation (hostname, last seen) and explains
  how to move it. Deactivating frees the installation slot again.
- **Installation id:** every installation gets a random 128-bit id, created once and kept in
  the database (not the hostname). It identifies the installation to the licence server.
- **Version and licence tab:** CL1 licences show plan (monthly, yearly, lifetime), paid
  until, last and next check, installations in use and a warning while the licence server is
  unreachable. Buy buttons open the Containly shop.
- New settings `CONTAINLY_LICENSE_API` (default `https://containly.ch/api/license/v1`),
  `CONTAINLY_LICENSE_PUBKEY` (base64 of the raw 32-byte Ed25519 public key; the production
  key of the Containly licence server is built in, so this is only needed for testing) and
  `CONTAINLY_SHOP_URL`.

### Changed

- Existing Lemon Squeezy licences and the offline owner licence work exactly as before.
- The activation field now accepts longer keys (up to 2000 characters).

## [2.0.8] — 2026-10-11

### Fixed

- **Appearance:** the names and descriptions of the eight built-in themes (Teal, Ocean,
  Copper, Moss, Amber, Iris, Basalt, Contrast) were always shown in German, because the
  server sends fixed labels. They are now translated in the web UI by theme id, on the
  Appearance page (theme cards, menus, delete dialog, "uses the default" note) and in the
  e-mail preview under Notifications. Custom themes keep the name their owner gave them.

## [2.0.7] — 2026-10-11

### Added

- **New folder:** every place that can create files can now also create folders: the file
  tree of the stack Compose editor (next to "New file"), the container Files tab and the
  volume browser (next to "Upload"). Names follow the same rules as files (no `/` or `\`,
  no `.`/`..`, no leading or trailing spaces, no control characters, at most 255 bytes);
  parent folders are created as needed and an existing name is reported instead of being
  overwritten. The new folder opens right away, so the next new file or upload lands inside
  it, and empty folders show an empty-state hint. New endpoints
  `POST /api/stacks/:id/dir`, `POST /api/containers/:id/files/mkdir` and
  `POST /api/volumes/mkdir` (admins only) use the existing path checks, reject traversal
  attempts and write audit entries (`stack.dir.create`, `container.file.mkdir`,
  `volume.mkdir`). Deleting a folder keeps the existing confirmation that says it is
  deleted with everything in it.

### Fixed

- **Dropdowns:** full-width dropdowns rendered as tall boxes with the value centred on top
  and the chevron on a second line (Tailwind's `.block` utility overrode the trigger's flex
  layout). All dropdown triggers are now a single line again: value left-aligned with
  ellipsis, chevron vertically centred on the right, the same height as the text fields in
  dialogs, and the same accent focus ring as text fields. Affected: the New stack and Git
  stack dialogs (Endpoint, Stack path), the host picker in the image pull and volume/network
  create dialogs, the container migration dialog (target host, transfer path), the settings
  and profile section switcher on phones and the invite language picker in Users. Checked
  as well: the stacks toolbar (Origin, Sort,
  Per page), container, image, volume, update, endpoint and catalog toolbars, settings
  (notifications, schedule, registries, audit filters), users and pagination.
- Dropdown menus are capped to the viewport (width and available height) and scroll when
  long. In menus with a filter field, Arrow Down moves into the list and Enter picks the
  first match.
- The Compose editor status line ("YAML valid") no longer puts its icon on its own line.

## [2.0.6] — 2026-10-10

### Added

- **E-mail preview:** Settings › Notifications shows how notification e-mails look with the
  current appearance, as Auto, Light or Dark, next to the existing "Send test" card. The
  preview is rendered by the server and shown in a sandboxed frame; nothing is sent.
  Admins only.

### Changed

- **E-mails look like the app:** notification, invitation, password reset and test e-mails
  now use the app's design instead of their own colours: surfaces, text, lines, accent and
  status colours come straight from the theme tokens, plus the theme's corner radius and font
  pair (with safe fallbacks). Without Pro every e-mail uses the default design (Teal, Werkbank
  fonts, light or dark following the reader's mail app). With Pro, e-mails use the instance
  theme, including custom accent themes; if personal appearance is allowed, users receive
  e-mails in their own theme. Recipients without an account get the instance theme.
- The Containly shield in e-mails is tinted with the theme accent. Info, warning and critical
  e-mails use the theme's status colours, and the footer line is now translated.
- E-mails are hardened for dark mode in Gmail, Outlook and Apple Mail (colour scheme hints,
  explicit background colours, an opaque logo tile). The plain-text part stays.
- Web fonts in e-mails are only referenced when `CONTAINLY_PUBLIC_URL` is set; otherwise the
  e-mail uses the fallback fonts. Outlook always uses its safe fallback.
- **License:** Containly is now distributed under the proprietary Containly Software License
  (see `LICENSE`): free for up to 2 hosts for private and commercial use, Pro license key for
  more, no redistribution or reverse engineering. It applies from this release (2.0.6). The
  repository's documentation, example files and screenshots may be reused to set up Containly.
  The Docker image now carries OCI labels with the license and the repository link.

## [2.0.5] — 2026-10-09

### Changed

- Updates page: after the last update of a run (one image, a selection or a retry),
  the list refreshes itself quietly about 2.5 seconds later. Rows marked "Updated" and the
  finished progress card disappear without a page reload, so "Updates only" shows the
  real state; failed rows stay for a retry.

## [2.0.4] — 2026-10-09

### Fixed

- Updates page: while checking, two spinners showed at once (one in the "Checking"
  button, one above the status text next to the title, off its line). Only the button
  spins now; the status line reads "Checking 43 images …" as plain text.

## [2.0.3] — 2026-10-09

### Changed

- Update confirmation: each image is now a card with its name and repository, the
  version change as two chips (current tag and digest, then the new version or new build
  and its digest) and the release notes link on its own line. The dialog is wider, so
  nothing wraps into a narrow column any more; the same cards are used when updating
  several images at once, and on phones.

## [2.0.2] — 2026-10-09

### Added

- Dashboard events: pagination with a page-size choice (10, 25, 50 or 100, remembered
  per browser) instead of an ever-growing list. Pages are loaded from the server, the
  range shows "1–25 of 120", and a day divider appears when events from earlier days
  are listed. The warnings count now shows the real total.
- API: `GET /api/history/events` accepts `offset` and returns `total` (number of
  matching events) for page-based lists.

## [2.0.1] — 2026-10-09

### Fixed

- Pull-to-refresh in the installed app (PWA) started too early when scrolling back up:
  the pages scroll in their own containers, so the gesture only checked the outer shell,
  which is always at the top. A pull now only starts when every scrolled container is at
  its top and has rested there for a moment, after a short dead zone, and never in the
  same swipe that scrolled the content back up.
- The back-to-top button now follows the container that actually scrolls, so it also
  appears on the dashboard and on phones.

## [2.0.0] — 2026-10-09

A complete redesign of the web interface ("Werkbank"), new server data behind it and
stricter access rules for non-admin users.

### Added

- **New interface on every page.** Icon rail, top bar with host switcher and live status,
  command palette (`Ctrl/Cmd+K`, recent items, `>` for commands), notifications panel,
  keyboard navigation in lists (`j`/`k`, `Enter`, `Esc`, `/`) and a phone layout with a
  bottom tab bar. Every route loads on demand, so the first page loads less JavaScript.
- **Dashboard with a status line and a 24 h history ("Verlauf").** One sentence and one KPI
  strip summarise all hosts; below it a timeline per host, stack and container shows
  running, unhealthy, restarting, crashed and stopped periods with markers for deploys,
  updates, restarts and incidents. A scrubber shows the state at any past moment
  (6 h, 12 h, 24 h, 7 days). Then an attention queue with one-click actions, a host
  matrix, most restarts and a live event stream. Selecting one host turns the page into
  its host overview.
- **Containers as a workbench.** List and inspector side by side (full page on narrow
  screens), grouping by stack, column choice, bulk actions, logs with search, line limit,
  timestamps, wrap, follow and download, stats charts readable at any point.
- **Stacks:** compose editor with line numbers, syntax colours and lint, `.env` editor with
  masked secrets, a diff before every deploy, streaming deploy output, `docker run` to
  Compose converter, archive view, view by host, and **scanned stacks**: Compose projects
  started outside Containly are listed read-only and can be started, stopped and
  restarted.
- **Images, volumes, networks:** CVE overview per image, layers, pull with registry search,
  clean-up with preview, volume sizes, volume browser, network details with subnet and
  gateway, connect and disconnect containers.
- **Endpoints:** a real page per host with CPU, RAM and disk usage and their history,
  availability and outages, containers and stack paths.
- **Users and accounts:** disable and enable users, reset another user's 2FA, see and end
  other users' sessions, failed sign-ins, sign in on a new device with a code approved from
  a signed-in session, invite details on the invite page.
- **Appearance:** 8 themes, each tuned for light and dark, font pairings, density and corner
  style, custom themes from an accent colour with a contrast check, an instance default and
  an optional per-user choice (Pro).
- New server APIs: container state history and Docker events (kept 7 days by default,
  configurable), per-host metrics with history, a dashboard summary, appearance v2.

### Changed

- New typefaces (Space Grotesk, Hanken Grotesk, Geist Mono, self-hosted) and Phosphor
  icons replace IBM Plex and lucide-react.
- `/` is now called Dashboard; the per-host view is the Host overview (`/overview` and
  `/endpoints/<id>` keep working).
- Opening the notifications panel no longer marks everything as read. Bulk removal asks you to type the count; unlinking a Git stack,
  signing out of a registry, deactivating the licence and ending a session now ask for
  confirmation. Images are sorted by size by default.
- German texts use Swiss spelling ("ss").
- Dependency updates (all versions stay pinned exactly). Major updates:
  **nodemailer** 9.1.1 → 10.0.16, **vitest** 4.1.10 → 5.0.3, **vite-plugin-pwa**
  1.3.0 → 2.0.0, **@types/better-sqlite3** 7.6.13 → 9.6.0; minor and patch updates for
  React 19.3, vite 8.3, zod 4.6, all `@fastify/*` and `@radix-ui/*` packages and more.
  `@types/nodemailer` and `@types/tar-stream` were dropped (both packages ship their own
  types); an exact `lightningcss` 1.33.0 override keeps the arm64 image build working.

### Fixed

- Sorting the Networks list by driver.
- The endpoint re-check spinner turned on for every host while one was checked.
- Stack details kept loading forever when the stack could not be read.
- The Users page had no loading or error state.
- Editing an agent endpoint sent SSH fields.
- A short rate limit right after a restart could show the setup screen instead of sign-in.

### Security

- Non-admin users no longer receive environment values, raw inspect data or mount sources
  from the server (removed server-side, not only hidden), cannot download files from
  containers or volumes, and cannot read stack `.env` files.
- Sign-in rate limits return a structured error with the retry time.
- Transitive dependencies updated to clear all `npm audit` advisories.

### Documentation

- New README and screenshots for the redesigned interface.

### Documentation

- Rewrote the README for the redesigned interface: a shorter intro, features organised
  like the app (Dashboard, Containers, Stacks, Images, volumes and networks, App catalog
  and updates, Endpoints, Administration, Appearance, keyboard and mobile) and a
  screenshot gallery with light, dark and phone views taken from a real 2.0 instance.
- Replaced the old screenshots (`setup.png`, `dashboard.png`, `endpoints.png`) with a new
  set listed in `docs/screenshots/README.md`.

## [1.3.4] — 2026-09-16

### Fixed

- Loading spinners (e.g. **Check** and **Update** on the Updates page, bulk
  "Updating n/m") no longer freeze when the operating system asks for reduced motion
  (Windows "Animation effects" off, typical in RDP sessions). Decorative animations
  and transitions stay reduced; only functional progress spinners keep rotating.

### Security

- **fastify** 5.10.0 → 5.12.5 — fixes CVE-2026-16732 (request spoofing via numeric
  `trustProxy`), CVE-2026-18504 (schema validation bypass via root primitive coercion),
  the four HIGH advisories fixed in 5.12.2 (CVE-2026-84428, CVE-2026-84469,
  CVE-2026-76169, CVE-2026-84504) and CVE-2026-92081 (HTTP/2 trailer DoS, 5.12.5).
- **nodemailer** 9.0.3 → 9.1.1 — fixes GHSA-2x7j-588g-ccc2 (quadratic address parsing),
  GHSA-cc9r-2j5m-2m83 (recipient-domain validation bypass via RFC 5322 comments),
  GHSA-wmmp-3585-3rmp (IDN/Punycode allow-list bypass) and GHSA-8m3c-c648-2xjj
  (`resolveContent()` bypassing `disableFileAccess`).
- Release images are now always built with a fresh base image and without layer cache,
  so the build-time `apk upgrade` can never be served stale.
- No functional changes; the image scans clean across all severities.

## [1.3.3] — 2026-08-12

### Security

- Patched all HIGH-severity vulnerabilities reported by the image scanner:
  - **openssl** (`libcrypto3` / `libssl3`) CVE-2026-14456 — the runtime image now
    runs `apk upgrade` at build time to pull the latest patched Alpine packages.
  - **brace-expansion** CVE-2026-69152 (→ 5.0.9) and **fast-uri** CVE-2026-18446
    (→ 3.1.6 / 4.1.3), both bumped via the lockfile.
- No functional changes; image scans clean of HIGH/CRITICAL findings.

## [1.3.2] — 2026-07-30

### Changed

- **Git-stacks modal is wider.** The Git-stacks table modal now uses more of the screen width so the
  whole table is visible without horizontal scrolling.
- **License checkout opens in a new tab.** Buying a Pro plan now opens the checkout in a new browser
  tab (with an external-link icon on the buttons) instead of the in-app overlay.

## [1.3.1] — 2026-07-30

### Changed

- **Git stacks moved into a modal.** On the Stacks page the Git-linked stacks are no longer an
  inline list — a "Git stacks" button (next to "Archive") opens a clean table showing each stack's
  name, repository + branch, last commit, last sync status and per-row sync/unlink actions.

## [1.3.0] — 2026-07-30

### Added

- **Agent endpoints (reverse tunnel).** Connect a remote Docker host without opening its Docker port
  or SSH: deploy the hardened `containly-agent` container on the host and it dials out to Containly
  over WSS (works behind NAT). Onboarding hands you a ready-to-paste `docker run` command and a
  `docker-compose.yml`, plus a live "waiting for the agent" indicator; the agent enrolls with a
  one-time token and then reconnects on its own with a persistent credential. Everything works exactly
  as over TCP+TLS — containers, exec console, live logs, stats, file browser and Compose stacks — all
  tunnelled through the single outbound connection.
- **Private Git repositories for GitOps stacks.** "Add stack from Git" now takes an optional access
  token (stored encrypted) to clone and auto-sync private repositories; a missing credential no longer
  hangs on an interactive prompt but fails with a clear error.

## [1.2.4] — 2026-07-30

### Added

- **Entra profile photos.** SSO users' Microsoft Entra profile picture is now synced on each
  sign-in and shown as their avatar in the sidebar and on the profile page (falls back to the
  default icon when no photo is set). Requires the `User.Read` delegated permission on the Entra
  app registration.

### Fixed

- **Audit log showed the Entra object ID instead of the name for SSO users.** Actions performed by
  an SSO user, and the SSO sign-in entry, now show the user's display name (first/last name)
  instead of the raw GUID.
- **Clearer audit action labels.** SSO and user-management actions (SSO sign-in, SSO settings,
  password reset, invites, registry default account, …) now have proper labels instead of a
  prettified action code.

### Fixed

- **Bulk update progress counted stale jobs.** The "Update all" progress and its toast summed the
  bulk-job status of every in-scope host, including finished jobs the server keeps in memory (so a
  running job survives a reload). With one real update it could show "1/2" / "2/2". Progress now
  counts only the hosts of the current bulk run.

## [1.2.2] — 2026-07-29

### Added

- **Admin password reset for users.** On Settings → Users, an admin can reset a local user's
  password. If SMTP is configured and the user has an email address, a reset link is emailed to
  them; otherwise the admin gets a copyable link to hand over. The link opens a public page where
  the user sets a new password (link is single-use and expires after 1 hour). Resetting signs the
  user out of all sessions. SSO/Entra users are excluded (no local password).
- **Multiple accounts per registry.** You can now connect several Docker Hub accounts (or several
  accounts on any registry host). For an image `ns/name`, Containly picks the account whose
  username matches the namespace; otherwise the account marked as **default** for that host. Compose
  deploys and unknown namespaces use the default account (Docker's `config.json` allows one login
  per host). Each connected account shows its exact connection time.

### Changed

- **Updates page:** the "Check" button now spins its own refresh icon while checking instead of
  showing a separate loading spinner next to it.
- **Registries tab:** the connection time is now shown as an exact, unambiguous timestamp (stored in
  UTC) instead of a relative "x days ago".

## [1.2.1] — 2026-07-29

### Fixed

- **Private Docker Hub images pinned to a version tag detect updates again.** Semver update
  detection (a newer `X.Y.Z` tag becoming available for an immutable version tag) listed a
  repository's tags through the Docker Hub *web* API, whose anonymous fallback returns nothing for
  private repositories — so a private image pinned to e.g. `4.0.10` never saw `4.0.11` and
  auto-update never fired. Tags are now listed via the Registry v2 API using the same pull
  credentials that authorize `docker pull`, so private repos work; all tags are read (no 25-tag
  page cap), and an auth failure is logged instead of silently swallowed.

### Changed

- **Update-check notifications are now bundled per scan.** Running an update scan sends exactly
  one email: scanning from the all-hosts view sends a single digest covering every host that has
  updates (grouped per endpoint); scanning a single endpoint sends one bundled email for just that
  host. Previously the all-hosts view emailed once per host. Merely viewing the updates list no
  longer sends mail — only an explicit scan, the startup scan, and the scheduled check notify.
  Added `POST /api/updates/scan` (scans 1..n endpoints, one bundled email); `GET /api/updates`
  is now side-effect free.

## [1.2.0] — 2026-07-28

### Added

- **Appearance presets (Pro).** Choose an instance-wide colour and typography preset that applies
  to every user, under **Settings → Appearance**. Ships with curated presets (Teal, Ocean, Violet,
  Amber, High contrast) and lets admins create custom presets: pick an accent colour, a font, and
  optionally a custom background colour per light/dark mode — the rest of the palette (surfaces,
  borders, text) is derived automatically and stays contrast-safe. Adds bundled, self-hosted font
  families (IBM Plex, Space Grotesk, Inter, Source Serif, Nunito) so presets look distinct. The
  light/dark theme toggle keeps working; the active preset supplies each mode's palette. Appearance
  presets are a Pro feature.

### Fixed

- **Images pinned by digest are no longer shown as "orphaned".** An image referenced by
  `repo:tag@sha256:…` has no local repo tag (only a repo digest), so it was flagged orphaned and
  shown without a name on the Images page. It now displays its (shortened) digest reference and the
  correct in-use / unused state.

## [1.1.1] — 2026-07-28

### Fixed

- **Registry credentials are now applied when deploying Compose stacks.** A private image
  referenced in a stack's Compose file could fail to pull during deploy with "pull access
  denied", because the Docker Hub / registry login saved under **Settings → Registries** was not
  passed to `docker compose up`/`pull`. The saved credentials are now injected (via
  `DOCKER_CONFIG`) for every stack deploy — on local and remote endpoints alike. Direct image
  pulls from the Images tab were unaffected and already used the stored credentials.

## [1.1.0] — 2026-07-27

### Added

- **Microsoft Entra ID single sign-on (Pro).** Let your team sign in with their Microsoft
  accounts, with Entra security groups mapped to Containly's admin and read-only roles. The
  login flow is auto-selected: a seamless Authorization Code + PKCE redirect when a public
  HTTPS base URL is configured, or a device-code login that works over plain HTTP without a
  domain. A schedulable background sync re-syncs roles from group membership and removes users
  who are no longer in any mapped group; anyone in no mapped group is denied access. Local and
  Entra SSO accounts are shown in separate tables on the Users page, and a local user and an
  SSO user may share an email address. Configure it under **Settings → Single Sign-On**, which
  includes a step-by-step setup guide with the exact redirect URI and required Entra
  permissions. The sign-in page shows a customizable "Sign in with Microsoft" button with the
  official Microsoft logo, and optional auto-redirect. SSO is a Pro feature and requires a
  license.

## [1.0.14] — 2026-07-27

### Fixed

- **Applying a pinned-version update now handles images whose full reference lives in an `.env`
  variable.** Moving a version tag forward (e.g. `0.3.7` → `0.3.8`) now also works when the
  Compose file uses `image: ${VAR}` / `image: ${VAR:-repo:tag}` and the `.env` holds the whole
  reference (`VAR=repo:tag`), not just the bare tag. When several such image variables exist
  (e.g. an app plus its database), the correct one is matched by repository.

## [1.0.13] — 2026-07-27

### Security

- **Updated `@fastify/static` 10.1.0 → 10.1.2**, resolving **CVE-2026-15074** (high) and
  **CVE-2026-7120** (medium).

### Changed

- **Settings: "Version" and "License" are now a single "Version & License" tab**, with the two
  panels shown side by side on wide screens (stacked on smaller ones).

## [1.0.12] — 2026-07-26

### Added

- **Automatic system tasks now appear in the audit log.** Every scheduled task run (update
  check, vulnerability scan, backup, prune, auto-update) is recorded — attributed to **System**
  when it runs automatically, or to the user who triggered it manually.
- **Containly self-update banner on the Updates page.** When a new Containly version is available
  (from the GitHub release check), the Updates page shows it at the top; clicking "Check for
  updates" in Settings → Version reflects it there immediately (shared version state).

### Changed

- **Notifications settings redesigned.** Category sections now carry an icon and an active count,
  the header shows a total "X/Y active" summary, and the grouping is cleaner.

## [1.0.11] — 2026-07-26

### Changed

- **Version tab always shows the release notes.** The changelog for the latest release is now
  shown even when you are already up to date (previously only when an update was available), so
  you can always see what changed in the current/newest version.

## [1.0.10] — 2026-07-26

### Added

- **Scheduled tasks: hourly & monthly frequencies + per-weekday selection.** Every scheduled
  task (update check, vulnerability scan, backup, prune, auto-update) can now run **hourly** (at
  a chosen minute), on **selected weekdays** (any combination — all days = daily, one = weekly),
  or **monthly** (on a chosen day of the month).
- **The update check is now enabled by default** (daily at 03:00) so update emails arrive
  automatically without opening the Updates page first.

### Fixed

- **Schedule form no longer overflows on mobile.** The frequency / day / time controls now wrap
  instead of pushing the time field off-screen.

## [1.0.9] — 2026-07-26

### Changed

- **License status now shows the term clearly.** A Pro license shows a **Term** row: *Lifetime ·
  never expires* for one-time and owner licenses, or *valid until &lt;date&gt; · &lt;n&gt; days
  left* for subscriptions. The plan badge reads **Lifetime** or **Subscription**.

## [1.0.8] — 2026-07-26

### Added

- **License plans redesigned with prices.** The upgrade section now shows three plan cards:
  **Lifetime** (CHF 189.– one-time, 1 instance), **Yearly** (CHF 89.– / year, 1 instance) and
  **Monthly** (CHF 15.90 / month, 2 instances). The Yearly and Monthly subscriptions include a
  **7-day free trial** (Lifetime does not). Each card shows its price, validity and included
  features, and opens the checkout as an in-app overlay.

## [1.0.7] — 2026-07-26

### Changed

- **Free tier now allows 2 Docker hosts** (was 3): the host where Containly runs (the built-in
  local host) plus one more. A Pro license still removes the limit. Existing free installs with
  a third host will have that newest host locked until a Pro license is activated.

## [1.0.6] — 2026-07-26

### Fixed

- **License panel: revealing the key pushed the show/copy buttons off-screen.** The full key is
  a long unbroken string; it now wraps (`break-all`) instead of forcing a single line, so the
  reveal and copy buttons stay visible and the key can be hidden again.

## [1.0.5] — 2026-07-26

### Added

- **License panel: reveal & copy the active key.** The license key can now be shown (eye
  toggle) and copied — including the owner token, which is now stored on activation so it can
  be displayed (re-activate an existing owner license once to populate it).
- **Consolidated update email.** When the periodic scan finds image updates across several
  hosts, Containly now sends a **single** email listing each host and its update (with the
  target version for pinned tags), instead of one email per image/host.

### Fixed

- **License panel: the "remove" action was missing for owner licenses.** Deactivating is now
  available for owner licenses too (drops back to free; the same token re-activates it).

### Notes

- The **all-hosts updates view already exists**: pick **"All hosts"** in the host switcher and
  open Updates to see every endpoint's updates in one table — with the host column, bulk
  "Update all", and self-update handling.

## [1.0.4] — 2026-07-26

### Fixed

- **License → "Re-check" did not update the "last checked" time for an owner license.** Owner
  licenses validate fully offline, so re-check returned early without touching the timestamp —
  clicking it appeared to do nothing. It now refreshes the "last checked" time so the action
  gives visible feedback (the owner license is, as before, never downgraded).

## [1.0.3] — 2026-07-26

### Changed

- **Redesigned the License panel (Settings → License).** Clearer status card with a host-usage
  bar on the free tier, side-by-side plan cards (Lifetime / Annual) with the included benefits,
  a dedicated "already have a key" field, and tidier manage actions.

### Fixed

- **In-app purchase opened a new browser tab instead of the overlay.** `lemon.js` was loaded but
  never initialised, so `window.LemonSqueezy` was undefined and the checkout fell back to a new
  tab. It is now initialised (`createLemonSqueezy()` + `Setup`), so the checkout opens as an
  **in-app overlay**, and the license refreshes automatically after a successful purchase.
- **"Update all" gave no feedback and did not handle self-updates.** The bulk update now behaves
  like the per-image button: it shows a completion toast, refreshes the list so applied updates
  disappear, and — when the batch includes a **Containly self-update** — shows the self-update
  notice and reloads the page. The self-update is also applied **last** so it can't interrupt the
  other updates in the batch.

## [1.0.2] — 2026-07-26

### Fixed

- **"Update all" did not apply pinned version-tag updates.** The per-image update button
  already handled images pinned to an immutable tag (e.g. `repo:v0.1.54` → `v0.1.55`) by
  rewriting the tag in the stack's Compose/`.env` and redeploying. The bulk **Update all** job,
  however, ran a plain digest pull for every image — a no-op for immutable tags — so pinned
  version updates were silently skipped. The bulk job now uses the **same branch** as the
  per-image button: version-tag rewrite for pinned tags, digest pull otherwise.

## [1.0.1] — 2026-07-26

### Fixed

- **Update detection for pinned version tags stopped working after the server had been
  running for a while.** For images pinned to an immutable tag (e.g. `repo:v0.1.54`), the
  newer-version check enumerates the repository's Docker Hub tags. That call reused a cached
  Docker Hub login token for up to 4 hours, but the token expires sooner — the stale token
  produced a `401`, which was swallowed silently, so no newer tag was ever reported (the image
  showed as "up to date" even though a higher version existed). The Docker Hub client now
  refreshes the token on failure and falls back to an anonymous request for public repositories,
  so a stale token can no longer suppress update detection. Concurrent tag lookups also share a
  single login instead of triggering a burst of logins.
- **Vulnerability notifications flooded the mailbox with already-known CVEs.** The **first**
  scan of an image had no baseline, so every pre-existing CRITICAL/HIGH CVE was treated as
  "new" and mailed. This flooded on every fresh install, every newly monitored host, and every
  freshly pulled image (new image ID). The first scan now silently records a baseline and only
  sends mail when a genuinely new CRITICAL/HIGH CVE appears afterwards.

## [1.0.0] — 2026-07-25

First stable release. 🎉

### Added

- **Licensing & Pro tier** — Containly is free for up to **3 Docker hosts** (including the
  built-in local host); **unlimited hosts** require a **Pro** license, available as a one-time
  **Lifetime** purchase or an **annual subscription**. Purchase and activation happen **in-app**
  (Settings → License) via Lemon Squeezy. A Pro license works **offline** (7-day validation
  grace) and can be used on up to **3 Containly instances**.
- **Endpoint capacity enforcement** — without a valid Pro license, endpoints beyond the free
  limit are **locked**: greyed with a "Pro" badge, not selectable in the host switcher/command
  palette, and the server refuses to connect to them. The built-in local host plus the oldest
  hosts stay active; a valid license unlocks everything instantly.
- **Live migration** and **one-click self-update** surfaced as first-class features.

### Changed

- **Content-Security-Policy** now allows the Lemon Squeezy checkout overlay (`*.lemonsqueezy.com`
  for `frame-src`, `connect-src`, `script-src`, `form-action`).

### Notes

- Self-update reads GitHub Releases; **1.0.0** supersedes the entire 0.1.x line.

## [0.1.46] — 2026-07-24

### Changed

- **Endpoints table now uses the shared table styling** — same surface background, header
  colours and hover behaviour as the Stacks and Containers tables.

### Fixed

- **Copy buttons in the endpoint setup guide now work inside the dialog over plain HTTP.** The
  clipboard fallback selects the visible code directly instead of a hidden textarea, so the
  Radix modal's focus trap no longer prevents the copy from happening.
- **"Remove source" on the migration done screen now gives feedback** — it shows a loading state
  while the source stack/container is torn down and surfaces any error, instead of appearing to
  do nothing.

## [0.1.45] — 2026-07-24

### Changed

- **Endpoints page is now a table** — status, name, type, address, Docker version, compose paths
  and last-checked time in columns instead of individual cards.
- **Endpoint setup guide reworked** — the TLS certificate steps are now separate, labelled,
  comment-free copyable blocks, with the copy button outside the code field.

### Fixed

- **Copy buttons copy directly over plain HTTP** — the clipboard fallback now focuses and selects
  a real textarea so one click copies, instead of only selecting the text.

## [0.1.44] — 2026-07-24

### Added

- **"Archive source" option in the migration wizard.** For stack migrations a checkbox archives
  the source stack into its origin host's archive after a successful migration; when left
  unchecked the source stays in the normal stack path. Mutually exclusive with "remove source".

## [0.1.43] — 2026-07-24

### Added

- **Migrating a stack now transfers the whole stack folder** — every file in the stack directory
  (the compose file, `.env`, config files, and any bind-mount data) is copied to the target as
  its own step, not just the compose file. Fixes target deploys that failed with
  "env file … not found" / missing variables.
- **Archive the source after a migration** — the done screen now offers "Archive source" (for
  stacks) next to "Remove source", moving the source stack into the archive on its origin host.
- **Copy buttons in the endpoint setup guide** — each command block (certificates, `daemon.json`,
  systemd override) is its own field with a one-click copy button that works over plain HTTP too
  (falls back from the clipboard API to `execCommand`); commands wrap instead of scrolling sideways.

### Changed

- The migration wizard can now be closed (outside click / Escape) even while a migration is
  running — it keeps running in the background and can be reopened from the "Migrating…" row hint.
- Stacks row menu now matches the containers menu: **Kill** is the last item, after a separator.

## [0.1.42] — 2026-07-24

### Added

- **Cancel a running migration.** A running migration can be cancelled from the wizard; the
  target is rolled back (only artifacts the migration itself created — container/volumes/
  networks/stack dir — are removed, never pre-existing ones), and the source, if it was
  stopped for a consistent copy, is started again. New endpoint `POST /api/migrations/:id/cancel`.
- **Resume a running migration.** A "Migrating…" indicator appears on the Stacks and Containers
  rows while a migration runs; clicking it reopens the wizard straight into the live progress
  view (phase bar + streaming log), even after the modal was closed.

### Changed

- **Faster transfers.** Volume and image data can be compressed on the wire (gzip, on by
  default, toggle in the wizard) — a big win on slow or relayed links — and a stack's volumes
  are now copied in parallel (up to 3 at a time) instead of one after another.
- The migration wizard now uses custom dropdowns/checkboxes throughout, closes on an outside
  click or Escape (unless a migration is running), and dropped the redundant kind badge.

### Fixed

- **Migrations no longer hang silently on a stalled transfer.** Volume/image transfers now have
  a stall watchdog (no byte progress for 2 minutes → the transfer fails and rolls back instead
  of waiting forever) and honour cancellation mid-transfer.
- **Dropdowns inside dialogs are no longer hidden behind the modal.** The custom Select's
  portaled list rendered below dialog overlays (e.g. the migration wizard's target-endpoint
  picker), which made it look locked and unselectable; it now renders above them.

## [0.1.41] — 2026-07-24

### Fixed

- **Migrating a stack no longer fails with "no such container".** Starting a stack migration
  ran the container-specific pre-flight against the stack id; the pre-flight is now kind-aware
  (stacks use a daemon-level architecture/reachability check, container-specific checks happen
  per service at run time).

### Changed

- **Reworked the migration wizard** — custom dropdowns and checkboxes (no browser-native
  controls), a source → target banner, clearer option descriptions, and a polished pre-flight
  and progress view.

## [0.1.40] — 2026-07-24

### Added

- **Live migration between endpoints.** Move a complete stack (compose + named volumes + user
  networks + image) or a standalone container (+ its volumes/networks/image) from one Docker
  host to another, with full real-time progress. A wizard on the Stacks and Containers pages
  runs a pre-flight check (CPU-architecture match warning, name/port conflicts, bind mounts,
  external networks, reachability, transfer path), then streams every phase
  (stop → networks → image → volumes → create → verify) over a live WebSocket log. Volumes and
  images transfer **directly host-to-host** when reachable, otherwise **relayed through
  Containly**; the image is re-pulled from a registry when available, else streamed via
  `docker save | docker load`. The source is left stopped as a safety net and only removed on
  explicit confirmation. New endpoints `POST /api/migrations`, `/preflight`,
  `/:id/remove-source`, `GET /api/migrations[/:id]`, and WS `GET /api/migrations/:id/stream`.

### Fixed

- **Applied updates now disappear from the Updates list immediately** instead of lingering
  until the next forced re-check — the server update cache is invalidated after an update is
  applied.

## [0.1.39] — 2026-07-24

### Added

- **One-click version updates for pinned image tags.** When the Updates page detects a newer
  stable version tag (e.g. `v0.1.52 → v0.1.53`), the update button now moves the pinned tag
  forward automatically: for a **stack** it rewrites the tag in the compose file or the stack's
  `.env` — whichever defines it — and redeploys; for a **standalone container** it pulls the new
  tag and recreates the container. No more editing `.env` by hand. If the tag cannot be located
  the update is aborted with a clear message and nothing is changed; a failed redeploy rolls the
  file change back. New endpoint `POST /api/updates/apply-version`.

### Security

- **Bumped `find-my-way` to 9.7.0** to resolve a high-severity HTTP/2 denial-of-service
  advisory (GHSA-c96f-x56v-gq3h / CVE-2026-47219, CVSS 7.5) affecting the Fastify router at
  version ≤ 9.6.0. Pinned via an npm `overrides` entry.

## [0.1.38] — 2026-07-24

### Fixed

- **Exec console: the active prompt is no longer clipped.** The terminal now sizes itself to
  the visible console box instead of its taller parent element, so after many commands the
  bottom line — the shell prompt where you type the next command — stays fully visible.

### Changed

- **Exec console shell picker is now a styled dropdown.** The row of shell buttons and the
  always-visible custom field are replaced by a single dropdown (Auto / /bin/sh / /bin/bash /
  /bin/ash / Custom); choosing **Custom** reveals an input for a custom command path. Defaults
  to Auto.

## [0.1.37] — 2026-07-24

### Fixed

- **Update check now surfaces newer version tags.** For images pinned to an immutable version
  tag (e.g. `repo:v0.1.52`), the check previously compared only the digest of that exact tag
  and never noticed a newly published higher tag. It now also enumerates the repository's tags
  and reports the highest **stable** semver tag as an available update (pre-release tags such as
  `-rc`/`-beta`/`-alpha` are ignored). The digest-based check for rolling tags (e.g. `latest`)
  is unchanged. The update entry gains an optional `latestVersion` field.
- **Vulnerability rescans no longer re-notify about already-known findings.** Email alerts were
  previously gated on critical/high **counts** with a short in-memory cooldown, so a rescan (or
  a Containly restart, or a Trivy database refresh) could re-send mail for the same known
  vulnerabilities. Alerts are now gated on a persisted fingerprint of the critical/high CVE-ID
  set per image and fire only when a genuinely new CVE appears (migration v19).

## [0.1.36] — 2026-07-23

### Added

- **"Stay logged in" on the login page.** A checkbox on the login form keeps you signed in:
  the session then lasts 30 days and is exempt from the 2-hour idle timeout, so you are no
  longer logged out automatically. Without it, the previous behaviour applies (12-hour
  session, 2-hour idle). The choice is carried through the 2FA step (encoded in the signed
  ticket) and the session cookie is persisted accordingly. Sessions store a `remember` flag
  (migration v18).

## [0.1.35] — 2026-07-23

### Added

- **Archive stacks.** Non-running stacks now have an "Archive" action (in the row's ⋮
  menu): the stack folder is moved into an `ARCHIV` subfolder of its stack path and hidden
  from the normal list. An archive toggle next to the search shows the archived stacks in
  the same table, with actions to move a stack back to the stacks path or delete it. Works
  on local and remote endpoints (agent-less, via the helper container). An existing
  `ARCHIV` folder is picked up automatically.

### Removed

- Dropped an unused i18n key (`overview.selectEndpoint`) left over from the 0.1.33 overview
  redirect change.

## [0.1.34] — 2026-07-23

### Fixed

- **Image-update emails arrived after applying an update instead of when it was first
  detected.** The "already notified" state was kept only in memory, so it reset on every
  restart — and applying an update (especially a Containly self-update) restarts the
  server, after which the background check re-sent emails for all still-pending updates.
  The notified state is now persisted per endpoint+image with the registry digest
  (migration v17), so a restart no longer re-sends, and an image is re-notified only when
  a genuinely newer digest appears. Detection also notifies immediately now: the on-demand
  update check (`/api/updates`, used by the dashboard/updates page) sends the email as soon
  as an update is seen, rather than waiting for the 6-hourly background cycle.

## [0.1.33] — 2026-07-23

### Changed

- **Overview follows the selected endpoint more naturally.** The sidebar "Overview" entry is
  hidden while "All endpoints" is selected (the overview is per-endpoint); switching to
  "All endpoints" now redirects to the global dashboard (`/`), even from the overview page.
- **Clicking a host on the global dashboard opens that endpoint's overview.** The host cards
  on `/` now select that endpoint (also in the connection switcher) and open its overview
  page, instead of going to the endpoints list.

## [0.1.32] — 2026-07-23

### Added

- **Per-endpoint overview page.** A new "Overview" entry at the top of the sidebar shows an
  endpoint-specific summary of the currently selected endpoint only (not a cross-host
  dashboard): Docker version/host, running/total containers, images, volumes, networks,
  stacks, CPU cores, memory, available updates and images with critical CVEs, plus a
  warnings list and the endpoint's containers. Choosing "All endpoints" shows a hint to
  pick a specific one.
- **Change a user's role inline.** An admin can now edit an existing user's role by clicking
  the role badge (same interaction as editing the email) and picking Admin/Viewer. You
  cannot change your own role, and the last remaining admin cannot be demoted.

## [0.1.31] — 2026-07-23

### Fixed

- **Copy-to-clipboard buttons did nothing over plain HTTP.** The browser's Clipboard API is
  only available in secure contexts (HTTPS or localhost), so copying the invite link or 2FA
  recovery codes silently failed when accessing Containly via `http://<LAN-IP>`. Copying now
  falls back to a `execCommand`-based method and reports success/failure via a toast.

## [0.1.30] — 2026-07-23

### Added

- **Invite users by email link.** Alongside creating a user directly (username +
  password), admins can now invite by entering an **email + role + language**. The invitee
  gets a link (shown for copying, and emailed if SMTP is configured) that opens a dedicated
  accept page in the login design — email prefilled, they choose their own username and
  password (with confirmation and a show/hide toggle) — and are signed in immediately on
  submit. The invitation email uses the same branded template as the other mails, in the
  chosen language, and the accept page renders in that language too. Invitation links are
  single-use and expire after 7 days; a "Pending invitations" list lets admins revoke open
  ones. Tokens are stored only as a SHA-256 hash.

### Fixed

- **Pruning orphaned volumes did nothing for named volumes.** Docker's volume prune only
  removes *anonymous* volumes by default; the button now passes `all=true`, so orphaned
  **named** volumes (e.g. from Compose) are removed as well.
- **Networks page didn't show which networks are in use.** Non-system networks now display
  an **In use** / **Orphaned** badge based on their connected-container count.
- **Container resource history was lost after a recreate.** Metrics were keyed by the
  container ID, which changes on every recreate. They are now keyed by the stable container
  **name**, so the CPU/RAM history carries across recreates/updates.

## [0.1.29] — 2026-07-22

### Fixed

- **Container overview overflowed horizontally on mobile.** The overview grid used a bare
  `grid` container, which on narrow screens created an implicit `auto` column that grew
  with its widest child (the mounts table with long paths), forcing the whole page to
  scroll sideways. It now uses `grid-cols-1` (a shrinkable `minmax(0,1fr)` column) and the
  cards are `min-w-0`, so the mounts table scrolls inside its own box instead of stretching
  the page. Long values (image refs, environment variables) now wrap with `break-all`.

## [0.1.28] — 2026-07-22

### Fixed

- **Container detail tabs overflowed on mobile.** The tab bar now scrolls horizontally on
  narrow screens instead of widening the whole page (same pattern as the settings page).
  A stray 1px vertical scroll caused by the active-tab underline is gone, and long image
  references in the header no longer stretch the layout sideways.

## [0.1.27] — 2026-07-22

### Added

- **Environment variable editor.** The container detail page has a new **Environment**
  tab listing all variables with secret values (PASSWORD/TOKEN/KEY/…) masked behind a
  reveal toggle. Admins can add, edit and remove variables; saving recreates the
  container with the same image (Docker can't change env live) through the rollback-safe
  recreate path.
- **Container file browser.** A new **Files** tab browses the filesystem of a running
  container over the Docker API (no helper container): navigate directories, download,
  upload and delete files. Works on both GNU and BusyBox/Alpine images; stopped
  containers and minimal scratch/distroless images (no shell) show a clear notice
  instead of a raw error.
- **Resource history.** Container stats now persist to a metrics table (sampled every
  60 s, 7-day retention) and the Stats tab plots CPU and memory over 1 h / 6 h / 24 h /
  7 d ranges.
- **Richer dashboard.** The dashboard now highlights what needs attention
  (stopped/unhealthy containers, available updates, images with critical CVEs) and the
  containers with the most restarts.
- **Stack diff before redeploy.** Each deploy snapshots the compose file; a **Changes**
  button on the stack page shows a line diff against the last deployed version, so you
  see exactly what will change before redeploying.

### Fixed

- **Notification bell dropdown was off-screen.** The bell moved from the sidebar to a
  top bar in the top-right of the app, so its dropdown now opens leftward from the right
  edge and stays fully on screen.
- **Clicking a notification no longer navigates away.** Feed entries now just display the
  message instead of jumping to the page that triggered the event.

## [0.1.26] — 2026-07-22

### Added

- **In-app notification centre.** A bell icon in the header shows recent events
  (endpoint offline, container down/unhealthy/OOM, updates available, new critical
  CVEs, high CPU/RAM, low disk …) with an unread badge and a dropdown, so you see
  warnings **without** needing SMTP configured. The background monitor now writes every
  event to this feed in addition to sending email. Read state is per user.
- **Remove individual image tags.** Each tag on the Images page now has an ✕ to untag
  it (the image stays if it still has other tags/containers), in addition to removing
  the whole image.

### Fixed

- **Switching endpoint while viewing a container/stack detail no longer errors.** The
  detail belongs to one host, so on switching you now land back on the list instead of
  seeing "No such container" for an object that doesn't exist on the other host.

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

[Unreleased]: https://github.com/amslertec/containly/compare/v2.6.0...HEAD
[2.6.0]: https://github.com/amslertec/containly/compare/v2.5.2...v2.6.0
[2.5.2]: https://github.com/amslertec/containly/compare/v2.5.1...v2.5.2
[2.5.1]: https://github.com/amslertec/containly/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/amslertec/containly/compare/v2.4.2...v2.5.0
[2.4.2]: https://github.com/amslertec/containly/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/amslertec/containly/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/amslertec/containly/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/amslertec/containly/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/amslertec/containly/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/amslertec/containly/compare/v2.0.8...v2.1.0
[2.0.8]: https://github.com/amslertec/containly/compare/v2.0.7...v2.0.8
[2.0.7]: https://github.com/amslertec/containly/compare/v2.0.6...v2.0.7
[2.0.6]: https://github.com/amslertec/containly/compare/v2.0.5...v2.0.6
[0.1.27]: https://github.com/amslertec/containly/compare/v0.1.26...v0.1.27
[0.1.26]: https://github.com/amslertec/containly/compare/v0.1.25...v0.1.26
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
