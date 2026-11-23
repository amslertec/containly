# Running Containly behind a WAF (OWASP CRS)

Many reverse proxies can run a web application firewall (WAF) with the **OWASP Core Rule Set (CRS)**. CRS looks for attack patterns in URLs, parameters and request bodies. Containly is a Docker management tool, so its normal requests contain exactly the things CRS looks for: file names such as `docker-compose.yml`, paths such as `/etc/nginx/nginx.conf`, and Compose files with shell commands. The WAF then answers with its own **403 page** instead of passing the request to Containly.

## How it looks in Containly

Since **3.0.3** Containly tells such an answer apart from its own errors. When a file, a folder or a list does not load because something in front of Containly refused the request, you see:

- **"A web application firewall (for example OWASP CRS) in front of Containly blocked the request."**
- a detail line such as `HTTP 403 · 403 Forbidden · <Server header of the proxy>`
- the request, for example `GET /api/stacks/<id>/file?file=docker-compose.yml`, with a copy button. Search for it in the log of your proxy or WAF to find the rule that fired.

Containly itself always answers in JSON. An HTML 403 page never comes from Containly.

## Which Containly requests are affected

| Request | What it carries | Typical CRS rules |
| --- | --- | --- |
| `GET /api/stacks/<id>/file?file=…` | file name of a stack file (`docker-compose.yml`, `.env`, `config/app.yaml`) | 932260 (Unix command, for example the word `docker`), 930120 (OS file access) |
| `PUT /api/stacks/<id>/file?file=…`, `PUT /api/stacks/<id>`, `POST /api/stacks` | Compose file content (commands, healthchecks, labels) | 932xxx (command injection), 930xxx, 941xxx (XSS, for example labels with `<` or `Host(…)` rules) |
| `GET /api/stacks/<id>/ls`, `POST /api/stacks/<id>/dir`, `DELETE /api/stacks/<id>/file` | paths inside the stack folder | 930xxx |
| `POST /api/stacks/<id>/deploy`, `/redeploy`, `/down`, `/action`, `GET /api/stacks/<id>/diff` | stack actions | usually fine, the stack ID can look random |
| `GET /api/containers/<id>/files?path=…`, `/files/download`, `POST /files/upload`, `/files/mkdir`, `DELETE /files` | paths inside a container (`/etc/…`, `/usr/bin/…`) and uploaded file content | 930120, 930130, 932xxx |
| `GET /api/volumes/browse?path=…`, `/api/volumes/download`, `POST /api/volumes/upload`, `/api/volumes/mkdir`, `DELETE /api/volumes/file` | paths inside a volume and file content | 930xxx, 932xxx |
| `POST /api/catalog/deploy`, `POST /api/gitops`, `PUT /api/gitops/<id>` | Compose content from the app catalog or a Git stack | 932xxx, 941xxx |
| `POST /api/containers/<id>/env`, `POST /api/containers/<id>/<action>` | environment values and container actions | 932xxx |
| `GET /api/containers/<id>/exec/stream` (console, WebSocket) | the upgrade request only; typed commands travel inside the WebSocket | usually fine |
| `GET/POST /api/data-backups/folders` | host folder paths for backup targets | 930xxx |

## Why these are false positives

CRS cannot know that the request comes from a signed-in Containly admin who manages Docker on purpose. `docker` in a file name, `/etc/` in a path and `sh -c` in a Compose file are normal for Containly. Every Containly API request is authenticated by Containly itself (session cookie or API token, CSRF token for every change, admin role for writes), and paths are checked to stay inside the stack folder, container or volume.

## Recommended setup

Pick one of the two options in your WAF configuration. Do not try to change how Containly sends data to get past the rules.

**Option 1 (simplest): no CRS for the Containly API.** Exclude `/api/` of your Containly host from CRS and keep CRS for the rest (sign-in page, static files). Containly checks every API request itself. Keep `/api/auth/` and `/api/setup` inspected if you want the WAF on the sign-in. Example in the CRS rule language, placed before the CRS rules:

```
# Containly: no CRS for the API of this host (Containly authenticates every API request)
SecRule REQUEST_HEADERS:Host "@streq containly.example.com" "id:1003001,phase:1,pass,nolog,chain"
  SecRule REQUEST_URI "@rx ^/api/(?!auth/|setup)" "ctl:ruleEngine=Off"
```

**Option 2 (narrower): rule exclusions for the affected paths.** Remove only the rule groups that misfire, only for the Containly paths that carry files, paths and Compose content:

```
# Containly: file names, paths and Compose content are expected on these paths
SecRule REQUEST_HEADERS:Host "@streq containly.example.com" "id:1003011,phase:1,pass,nolog,chain"
  SecRule REQUEST_URI "@rx ^/api/(stacks|containers/[^/]+/(files|env)|volumes/(browse|download|upload|mkdir|file)|catalog/deploy|gitops|data-backups/folders)" \
    "ctl:ruleRemoveById=930100-930130,ctl:ruleRemoveById=932000-932999,ctl:ruleRemoveById=941000-941999"
```

If a request is still blocked, take the rule ID from the WAF log (search for the request path Containly shows) and add it to the exclusion. Rules from 942xxx (SQL injection) can fire when Compose files or uploaded files contain SQL, for example database init scripts.

## Good to know

- The full-screen "Containly is not reachable" view still appears only when Containly itself does not answer (`/healthz` fails). A single blocked request shows the message above in place, the rest of the app keeps working.
- A proxy with its own sign-in (an SSO proxy) answers with 401 or a login page. Containly then asks you to sign in at the proxy again.
- Changing the anomaly threshold or the paranoia level affects your whole site. Prefer the targeted exclusions above.
