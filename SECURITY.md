# Security

Containly talks to the Docker socket — that is equivalent to **root on the host**.
Treat a Containly instance as being as sensitive as the host itself.

## Reporting a vulnerability

Please do **not** report vulnerabilities through public issues. Email
**pascal.amsler@amslertec.ch** or use GitHub's private "Security Advisories".
We aim to acknowledge reports within 72 hours.

## Supported versions

Security fixes are provided for the latest released minor version.

## Built-in protections

- **Auth**: Argon2id password hashing, login rate limiting, timing-equalized
  password verification, optional **two-factor authentication** (TOTP + recovery codes).
- **Sessions**: HttpOnly/SameSite cookies, CSRF tokens, server-side session table.
- **Secrets at rest**: endpoint TLS/SSH credentials and TOTP secrets are
  AES-256-GCM encrypted (master key in `data/` with `0600`).
- **Transport**: Helmet headers incl. a strict CSP; HSTS/secure cookies behind TLS.
- **Input**: end-to-end schema validation (Zod) on every endpoint; path-traversal
  protection on all stack file operations.
- **Audit**: all security-relevant actions are logged.
- **Backups**: passphrase-encrypted (scrypt + AES-256-GCM).

## Hardening plan / recommendations

### Priority 1 — do this first

1. **Never expose without TLS.** Put Containly behind a reverse proxy
   (Traefik/Caddy/nginx) with HTTPS + HSTS, set `CONTAINLY_SECURE_COOKIES=true`,
   and bind the port locally only (`127.0.0.1:8420`).
2. **Use the socket proxy instead of mounting the socket directly.** Use the
   bundled `docker-socket-proxy` (profile `hardened`) and add a TCP endpoint on
   the internal network — this limits the Docker API to what's needed and blocks
   e.g. Swarm / system shutdown.
3. **Container hardening** (compose):
   ```yaml
   security_opt: ["no-new-privileges:true"]
   cap_drop: ["ALL"]
   read_only: true
   tmpfs: ["/tmp"]
   ```
   (Keep the direct socket mount read-only, `:ro`.)
4. **Enable two-factor for every admin.**

### Priority 2 — recommended

5. **Login lockout**: on top of rate limiting, a temporary account lockout after
   repeated failures + an audit alert.
6. **Manage the master key externally** (Docker secret / env) instead of a file.
7. **Least privilege for TCP endpoints**: use the socket proxy on remote hosts
   too; scope TLS client certificates tightly.
8. **Network segmentation**: run Containly and the Docker hosts on a separate,
   non-public network.

### Priority 3 — ongoing

9. **Keep dependencies up to date** (Dependabot is configured) and watch the CI
   image scans (Trivy).
10. **Keep the CSP strict**, no inline scripts without a hash.
11. **Keep backups encrypted and offline** — they contain the master key.

### Known trade-offs

- The agent-less **helper container** on remote hosts mounts that host's Docker
  socket (required for deploys). Anyone with TCP Docker access is already
  root-equivalent, so no new privilege is introduced, but the standing container
  is a foothold and should be monitored accordingly.
