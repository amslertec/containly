# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/amslertec/containly/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/amslertec/containly/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/amslertec/containly/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/amslertec/containly/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/amslertec/containly/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/amslertec/containly/releases/tag/v0.1.0
