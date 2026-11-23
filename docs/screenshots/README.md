# Screenshots

These PNGs are referenced from the main [`README.md`](../../README.md). Keep the
**exact filenames** when you replace one.

Desktop shots are 1600 x 1000 px, phone shots 390 x 844 px, PNG at device scale 1,
losslessly optimised (oxipng). Use sample data only: no real hostnames, IPs, tokens, keys
or personal data.

The current set was taken from Containly 3.0.1 in English (Terrakotta theme, Kladdox fonts),
with the simulated sample hosts `homelab`, `edge-vps`, `nas-01` and `pi-garage` of the public
demo data (documentation IPs only). The sign-in page comes from a fresh 3.0.1 container.

| Filename | Shows | Mode |
|---|---|---|
| `dashboard-dark.png` | Dashboard: status line, key numbers, history, live events (README hero) | dark |
| `dashboard-light.png` | Dashboard | light |
| `containers-inspector-dark.png` | Containers grouped by stack, container drawer (Overview tab) | dark |
| `container-logs-dark.png` | Container drawer, Logs tab | dark |
| `stack-editor-light.png` | Stack drawer with the compose editor | light |
| `images-cves-dark.png` | Image drawer, vulnerabilities (CVE) tab | dark |
| `endpoint-host-dark.png` | Host page with load charts and a chart tooltip | dark |
| `endpoints-light.png` | Endpoints page, one card per host | light |
| `updates-dark.png` | Updates table | dark |
| `permissions-repair-dark.png` | Repair permissions dialog | dark |
| `deploy-folder-check-light.png` | Deploy review with the host folder check | light |
| `appearance-light.png` | Settings > Appearance: mode, density, corners, fonts | light |
| `command-palette-light.png` | Command palette (`Ctrl`/`Cmd` + `K`) searching containers and images | light |
| `theme-copper-dark.png` | Dashboard in the Copper theme | dark |
| `login-dark.png` | Sign-in page | dark |
| `phone-dashboard-dark.png` | Dashboard on a phone (390 x 844) with the bottom navigation | dark |
| `phone-containers-dark.png` | Container list on a phone (390 x 844) | dark |
| `phone-stacks-light.png` | Stack list on a phone (390 x 844) | light |

To replace a screenshot: copy the file here with the matching name, optimise it
(for example `oxipng -o 6 --strip safe <file>`), then commit it.
