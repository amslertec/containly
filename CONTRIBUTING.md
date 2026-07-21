# Contributing

Thanks for your interest in Containly! Contributions are welcome.

## Development environment

Requirements: Node.js ≥ 22, npm ≥ 10, and a reachable Docker socket.

```sh
npm install
npm run dev        # backend (tsx watch) + frontend (Vite) in parallel
```

The project is an npm-workspaces monorepo:

- `shared/` — `@containly/shared`: Zod schemas / shared types (the API contract).
- `server/` — `@containly/server`: Fastify backend.
- `web/` — `@containly/web`: React/Vite frontend.

## Before committing

```sh
npm run lint
npm run typecheck
npm run build
```

Please keep all three green. New or changed API fields go into the `shared`
package first, so the server and web share the same contract.

## Conventions

- **TypeScript strict**, no `any` escapes without justification.
- **Commits**: short, meaningful messages (ideally [Conventional Commits](https://www.conventionalcommits.org/)).
- **Security first**: Containly has root-equivalent access — validate every input
  (Zod), watch for path traversal, and never expose secrets.
- **i18n**: add new UI strings to both `de.json` and `en.json`.

## Pull requests

Describe *what* and *why*. Reference an issue when there is one. Clearly flag any
changes to the API contract in the PR.

## Vulnerabilities

Please do **not** report publicly — see [SECURITY.md](SECURITY.md).
