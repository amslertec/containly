# README redesign: claims to verify before pushing

The new `README.md` (and the matching Docker Hub text) describes the app **after** the
"C Werkbank" redesign. The screenshots in `docs/screenshots/` were taken from the HTML
previews, not from the real app. Before this branch is pushed, check every row below
against the implemented app, then reshoot the screenshots from the real app.

Status legend: **redesign** = new UI only, no server change; **new API** = needs a new or
extended server endpoint; **today** = already true, recheck wording only.

## Feature claims

| Claim in README | Depends on | Verify after implementation |
|---|---|---|
| Dashboard status line (one sentence summarising hosts, attention items, updates, restarts today) | redesign; "restarts today" needs restart timestamps | Sentence is generated from live data, counts match the KPI strip |
| Dashboard **timeline**: state of every host and stack over 24 h (also 6 h, 12 h, 7 days) with outages, restarts, deploys and updates marked | **new API**: container/stack/host state history with at least 7 days retention | Timeline renders real data for all hosts and stacks, survives reload, every range works |
| Attention queue with direct actions (re-check, restart, start, update all, open) | redesign (today: "Needs attention" links only) | Each row's button performs the action and respects viewer role |
| Host matrix with CPU, RAM and disk per host and a 24 h CPU trend | **new API**: per-host CPU/RAM/disk metrics and history | Values match the host; offline hosts show no stale numbers |
| Host matrix shows updates and CVEs per host | redesign (data exists per endpoint) | Counts match Updates and Images pages for that host |
| **Live events** feed (container, image, update and sign-in events, warnings filter) | **new API**: event stream (Docker events + app events, WS or SSE) | Events arrive live, filter works, sign-in events are only shown to admins if so designed |
| "Containers with the most restarts" | today (Top by restarts) | Still on the dashboard |
| Containers workbench: list left, inspector right | redesign (today: separate detail page) | Inspector opens from list, URL reflects selection and tab |
| Inspector Overview: CPU/memory trend, health check details | redesign; data from inspect + metrics history (exists) | Health check interval/timeout/retries come from inspect |
| Log **search**, timestamps toggle | redesign (client-side) | Search filters the live buffer; timestamps can be toggled |
| Stats history 1 h, 6 h, 24 h, 7 days | today | unchanged |
| Compose editor with line numbers and unsaved marker | redesign (today: plain textarea) | Editor shows line numbers; dirty marker; viewers read-only |
| Compose projects started outside Containly found via Compose labels ("scanned") | redesign + possibly **new API** (label scan) | Scanned stacks appear with their origin; check whether the server already returns them |
| Diff before deploy | today (Changes button) | Still offered before redeploy |
| Git stacks with token and auto-sync | today | unchanged |
| Image inspector with CVE tab (package, installed, fixed version) | redesign (today: CVE modal, same data) | Tab exists, data matches the Trivy result |
| Endpoint host page with resources over the last 24 h and attention list | **new API**: per-host CPU/RAM/disk history | Charts show real data for agent, SSH, TCP and socket hosts |
| Eight themes, each for light and dark (Teal, Ocean, Copper, Moss, Amber, Iris, Basalt, Contrast) | redesign + server theme list (today: 5 presets) | Exactly eight curated themes ship; names in the UI match |
| Custom themes built from an accent colour | today (custom presets), new builder UI | Builder creates a theme usable in both modes |
| **Per-user appearance override** (admin allows it; user picks theme, font, density) | **new API**: per-user appearance settings + instance switch | Setting is stored per user, applies after login on any device, admin switch works |
| Density (comfortable/compact) and corner style | redesign + appearance schema extension | Both persist and apply everywhere |
| Four font pairings, self-hosted | redesign (today: 6 font keys) | Count and names match; still no third-party font requests |
| Themes and per-user appearance are Pro | licensing decision | Pro gating matches README, Pricing section and DOCKERHUB.md |
| Keyboard: `j`/`k`, `Enter`, `Esc`, `/`, `g` then `d` or `c` | redesign (today only `Ctrl`/`Cmd`+`K`) | Shortcuts work in lists; a help overlay lists them |
| Command palette covers pages, hosts, containers, images | today (App catalog missing today) | Palette includes the App catalog too |
| Phone layout with bottom navigation | redesign (today: off-canvas drawer) | Bottom nav present below the phone breakpoint |
| Pull to refresh, installable PWA | today | unchanged |
| Architecture table (React 19, Tailwind CSS 4, Radix, i18next, xterm) | redesign may change the frontend stack | Update the table if libraries were added or removed |

## Screenshots

| Item | Depends on | Verify |
|---|---|---|
| All files in `docs/screenshots/` | taken from HTML previews (German UI, sample data, preview version number "2.8.1" on the sign-in page) | Reshoot from the real app in **English** with sample data, same filenames and sizes |
| Dashboard shots | timeline section in the preview | Real dashboard shows the timeline |
| Endpoint host page shot | per-host resource charts | Charts contain real data |

## Docker Hub

| Item | Depends on | Verify |
|---|---|---|
| `DOCKERHUB.md` uses absolute image URLs `https://raw.githubusercontent.com/amslertec/containly/main/docs/screenshots/...` | the screenshots being merged into `main` and pushed | After the push, open each URL; then paste `DOCKERHUB.md` into Docker Hub |
| `DOCKERHUB.md` is gitignored | repo policy | It lives only as a local file in the worktree; copy it over the main working tree's copy when publishing |
| Website link `containly.ch` | old DOCKERHUB.md used `containly.amslertec.ch` | Confirm the canonical website URL |

## Housekeeping

- This file is a release checklist. Delete it (or move it out of the public tree) before
  the branch is pushed.
