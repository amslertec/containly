# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-07-21

First public release. Containly is a modern, secure, self-hosted Docker
management web UI (a Portainer alternative) where stack definitions live as
version-controllable files on the filesystem instead of in a database.

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

[Unreleased]: https://github.com/amslertec/containly/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/amslertec/containly/releases/tag/v0.1.0
