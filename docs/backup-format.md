# Containly backup format (version 1)

This document describes how Containly 2.2.0 and later (2.3.0 additions: database dumps, S3 and
SFTP targets, `.clbk` single-file export) store data backups of volumes, stacks and
containers. It is public on purpose: a backup must stay readable without Containly. The bundled
recovery tool `scripts/clbk-decrypt.mjs` (zero dependencies, Node.js 22.15 or newer) implements
everything below.

## Layout of a backup set

A backup set is one directory on the target:

```
<target root>/containly-backups/<endpoint>/<kind>-<scope>/<YYYYMMDDTHHMMSSZ>-<id8>/
    manifest.json                     plaintext, written LAST (commit marker)
    meta.json.zst[.cenc]              inner manifest (container inspect, compose info, volume facts)
    volumes/<volume>.tar.zst[.cenc]   one tar per named volume
    stack/project.tar.zst[.cenc]      the Compose project folder (compose file, .env, in-folder data)
    dumps/<service>.<preset>.zst[.cenc]   database dump (2.3.0, see below)
```

The layout is the same on every target type. On S3 the set directory is an object key prefix
(`<bucket>/<prefix>/containly-backups/…`), on SFTP a directory below the configured folder. Files
are uploaded under a temporary name (`.part` on SFTP, multipart upload on S3) and only appear
under their final name when complete; `manifest.json` stays the last file written.

All path segments are slugs (`[a-z0-9._-]`). A directory without `manifest.json` is a partial
set (failed or interrupted) and is removed by retention after 24 hours.

Volume tars contain the volume root as `vol/`; the stack tar contains the project folder under its
own name. Ownership (numeric uid/gid), modes, symlinks, hardlinks and xattrs are kept. Sparse files
are stored expanded.

## manifest.json

```json
{
  "format": "containly-backup",
  "formatVersion": 1,
  "setId": "01JA…",                 ULID
  "createdAt": "2026-10-12T01:15:03.000Z",
  "containly": "2.3.0",
  "scope": { "kind": "stack|container|volume", "ref": "…", "label": "immich", "endpointName": "nas", "planName": null },
  "source": { "hostname": "nas", "engineId": "ABCD:…", "arch": "amd64", "dockerVersion": "29.0.0" },
  "encryption": null | {
    "alg": "CENC1-AES-256-GCM", "chunk": 1048576, "keyFingerprint": "9f3a…",
    "keyslots": [{ "kdf": "scrypt", "N": 131072, "r": 8, "p": 1, "salt": "b64", "iv": "b64", "tag": "b64", "wrappedDek": "b64" }]
  },
  "compression": "zstd|gzip|none",
  "files": [{ "path": "volumes/db.tar.zst.cenc", "role": "volume|stack|meta|dump", "ref": "db", "bytesStored": 123, "sha256Stored": "…" }],
  "totals": { "bytesStored": 0, "bytesRaw": 0 },
  "complete": true,
  "manifestMac": "hex"              encrypted sets only
}
```

`sha256Stored` is the SHA-256 of the bytes as stored (after compression and encryption).

## Compression

zstd (default level 3, content checksum on) or gzip level 6, applied to the plain tar before
encryption. Decompression caps the zstd window at 2^27 bytes.

## Encryption (CENC1)

Keys:

- **KEK** = scrypt(passphrase, salt, N=2^17, r=8, p=1), 32 bytes. The passphrase is never stored.
- **DEK**: 32 random bytes per set, wrapped with the KEK: AES-256-GCM(KEK, iv, DEK) with the AAD
  `clbk1-keyslot:<setId>`. The keyslot holds salt, KDF parameters, iv, tag and the wrapped DEK.
- **File key** = HKDF-SHA256(DEK, salt = setId, info = `clbk1:<path in set>`), 32 bytes. A file
  cannot be moved to another path or set without failing authentication.
- **Key fingerprint** = first 16 hex chars of HMAC-SHA256(KEK, `containly-backup-fp`).
- **manifestMac** = HMAC-SHA256(HKDF(DEK, setId, `clbk1:manifest`), canonical JSON of the manifest
  without `manifestMac`). Canonical JSON: object keys sorted recursively, no whitespace.

Stream of an encrypted file:

```
header (16 bytes) = "CLBK" | 0x01 (version) | 0x01 (AES-256-GCM) | 20 (log2 chunk) | 0x00 | noncePrefix[7] | 0x00
chunk_i           = AES-256-GCM(fileKey, nonce, plaintext_i) ‖ tag[16]
nonce             = noncePrefix[7] ‖ counter (uint32 big endian, from 0) ‖ lastFlag (1 byte)
AAD               = the 16-byte header
```

Every chunk holds 1 MiB of plaintext except the last one, which holds 0 to 1 MiB and is the only
chunk with `lastFlag = 1`. Truncation, reordering, dropped or appended chunks therefore fail
authentication. A file of 0 bytes is a header plus one empty final chunk.

## meta.json (inner manifest)

JSON object with `v: 1`, `setId`, `scope`, `containerConfigs` (raw `docker inspect`), `compose`
(`projectName`, `workingDir`, `configFiles`, `archiveRoot`, `file`, `bytesRaw`, `sha256Tar`,
`entries`), `volumes` (`name`, `driver`, `driverOpts`, `labels`, `bytesRaw`, `sha256Tar` of the
plain tar, `entries`, `archiveRoot`, `specials`, `root` owner and mode, `file`), `images`,
`networks`, `consistency`, `warnings` and `excluded`. It may contain environment secrets, so it is
encrypted whenever the set is.

## Anonymous volume bindings (2.5.0)

Container and stack backups now include anonymous Docker volumes by default. Plans and ad-hoc
requests may set `selection.anonymousVolumes: false`; an omitted field means include them.
Explicit volume-scope backups are unaffected by that switch. Database dump selection also sees
these volumes and excludes raw database data unless `alsoRaw` is enabled. The demo mock also
allocates simulated anonymous volumes for container volume declarations and uses the same
identity-based restore logic without any network storage connection.

The format version remains **1**. Anonymous entries keep `role: "volume"` in the public manifest;
`ref` and the metadata `name` are archive references, not restore identities. An optional
`anonymousBindings` array in each inner `volumes` entry records every consumer:

```json
"anonymousBindings": [{
  "container": "database",
  "destination": "/var/lib/postgresql/data",
  "project": null,
  "service": null,
  "replica": null
}]
```

Compose consumers additionally record the project, service and container-number label. Restores
select the volume currently mounted at that exact identity and destination, even after Docker
has generated a different random volume name. Ambiguous replicas, missing/non-volume mounts on
an existing consumer, and inconsistent shared-volume mappings block the preview. A missing
standalone container can be recreated with a generated named local volume; copies also use a
new named volume, explicitly injected by destination. Concrete mappings are covered by the
preview token so changing a mount requires a new preview. Old sets without `anonymousBindings`
remain readable with their original named-volume restore behavior.

Stack restores pin service + container destination mappings in `.containly-restore-volumes.json`,
with external named volume declarations. Containly's later Compose operations load this override
as well. Anonymous stack restores stop consumers rather than running `compose down`; the resolved
Compose configuration is checked before a target volume is erased and the actual container mounts
are checked after `up`. Mixed bind mounts remain unchanged. Replica mappings that a single Compose
service cannot represent are rejected rather than collapsed. Dump-only sets derive excluded-volume
bindings from the saved container inspect, so a missing database stack gets a fresh named mount and
no raw-data wipe. Safety backups capture all current scope volumes, including dump-only database
volumes. Manual Docker Compose commands must include `-f .containly-restore-volumes.json` alongside
the base Compose file to retain the mapping.

## Database dumps (2.3.0)

With the consistency mode "Datenbank-Dump" a set holds one file per database service under
`dumps/`, role `dump`, `ref` = Compose service (or container name). The payload before
compression and encryption is the native output of the database tool, read from its stdout inside
the running database container:

| preset   | file name                    | payload                                         | restore                                   |
|----------|------------------------------|-------------------------------------------------|-------------------------------------------|
| postgres | `dumps/<svc>.postgres.zst`   | `pg_dumpall --clean --if-exists` (SQL text)     | `psql -f -` as the configured user        |
| mariadb  | `dumps/<svc>.mariadb.zst`    | `mariadb-dump --single-transaction --routines --events --triggers` with `--all-databases` as root, otherwise `--databases <MARIADB_DATABASE>` as the app user (SQL) | `mariadb` / `mysql` client |
| mysql    | `dumps/<svc>.mysql.zst`      | `mysqldump`, same options                        | `mysql` client                            |
| mongodb  | `dumps/<svc>.mongodb.zst`    | `mongodump --archive` (binary archive)           | `mongorestore --archive --drop`           |
| redis    | `dumps/<svc>.redis.zst`      | RDB snapshot from `redis-cli --rdb -`            | file restore: the RDB becomes `dump.rdb`, or the AOF base (`appendonlydir/<name>.1.base.rdb` plus manifest) when AOF is on |

Credentials are read from the container at run time (`POSTGRES_USER`, `MARIADB_ROOT_PASSWORD`,
`MYSQL_*`, `MONGO_INITDB_ROOT_*`, `--requirepass`, also `*_FILE` secrets) and passed to the tool as
exec environment only; they are never stored in the set. `meta.json` gains a `dumps` array:
`service`, `container`, `image`, `preset`, `tool` (version line), `file`, `bytesRaw`, `sha256`
(of the plain dump) and for Redis `rdbDir` and `rdbFile`. When "also copy raw data" is off, the
database volumes are not in the set.

Manual recovery: decrypt and decompress the dump (see below) and feed it to the same tool, for
example `… | zstd -d | psql -U postgres -f -`.

## Single-file export (.clbk, 2.3.0)

"Herunterladen" streams a complete set as one file `<label>-<YYYYMMDDTHHMMSSZ>-<id8>.clbk`. It is a
plain POSIX tar (no compression around it) with `manifest.json` as the FIRST entry, followed by
every file of the set under its path from the manifest. Nothing is decrypted: an encrypted set
stays encrypted inside the `.clbk`.

Import validates `manifest.json` against the schema, rejects any entry that is not listed in the
manifest, uses an absolute path or `..`, or differs in size or `sha256Stored`, then writes the files
to the chosen target and `manifest.json` last. To read a `.clbk` without Containly, unpack it and
use the recovery tool on the directory:

```sh
mkdir set && tar -xf immich-20261012T011503Z-ab12cd34.clbk -C set
node clbk-decrypt.mjs set --verify
```

## Recovery without Containly

```sh
# list the files of a set (asks for the passphrase)
node clbk-decrypt.mjs /backups/containly-backups/nas/stack-immich/20261012T011503Z-ab12cd34

# check everything
node clbk-decrypt.mjs <set-dir> --verify

# extract a volume
CLBK_PASSPHRASE='…' node clbk-decrypt.mjs <set-dir> volumes/immich_pgdata.tar.zst.cenc | tar -x -C ./restore

# inside the Containly image
docker run --rm -i -e CLBK_PASSPHRASE -v "$PWD:/w" amslertec/containly \
  node /app/scripts/clbk-decrypt.mjs /w/<set-dir> stack/project.tar.zst.cenc > project.tar
```

Unencrypted sets are plain `.tar.zst` files: `zstd -d < volumes/x.tar.zst | tar -x`.

Exit codes of `clbk-decrypt.mjs`: 0 ok, 1 error, 2 wrong passphrase, 3 manifest modified.

## Limits and notes

- Restores validate every tar entry before it reaches Docker: no absolute paths, no `..`, no
  symlinks escaping the root, no hardlinks to unknown names, device files only when the source had
  them, and never more data than the backup declared.
- Measured on the development host (12 cores, NVMe): 1 GB of incompressible data through zstd-3 and
  AES-256-GCM to a local folder and back in about 6 s, process memory growth about 80 MiB (mostly
  buffers the garbage collector reclaims lazily; retained pipeline memory stays below 4 MiB).
- Unencrypted sets are protected by checksums only.

## SMB and NFS targets (2.5.0)

The format and v1 manifests do not change for network storage. SMB/NFS use the same encrypted
file pipeline, complete-manifest-last rule, SHA256 verification, scanner and `.clbk` download.
Pro is required to create/edit targets and write new sets; existing sets remain scannable,
verifiable, downloadable and restorable on the same host without Pro.

- **SMB:** host, port (445 by default), share, optional domain and relative subfolder, username,
  password and operation timeout (5–300 seconds). SMB3 and session encryption are mandatory.
  Passwords are encrypted in SQLite and absent from API responses, Docker metadata, process
  arguments and environment. A native `smbclient` runs with a mode-0600 auth file inside a
  mode-0700 temporary directory; normal/error/timeout paths remove it and startup reclaims stale
  owned directories. A fixed Bash pipeline supplies real Unix pipes for binary streaming
  (Node's socketpair stdio cannot be reopened through `/dev/stdin` or `/dev/stdout`). Uploads
  commit through an atomic replacing rename. SMB free space is explicitly unknown (`null`).
- **NFS:** host, explicit export (not `/`), NFSv4/v4.1, optional relative subfolder and selected
  Docker endpoint. It is that endpoint's daemon, not the source-data host or Containly process,
  which mounts the export. Generated secret-free local-driver volumes use pinned validated IPs
  and fixed TCP/soft/timeo/retrans/nosuid/nodev/noexec options. Helpers have all capabilities
  dropped, no network, a read-only root filesystem, bounded lifetime and only the generated
  volume at `/out`. No SYS_ADMIN or arbitrary local mount options are accepted. Symlink path
  components are rejected; helpers/volumes are removed after operations and on crash recovery.
  Free space is returned only when the export's `df` answer is usable, otherwise `null`.
- Network names are resolved through the existing backup netpolicy. NFS mounts and the **initial**
  SMB connection use checked IPs; smbclient reaches only a one-shot loopback proxy to the pinned address.
  Roots/subfolders and generated relative paths reject traversal and command
  separators. Remote storage remains administrator-trusted. Use a dedicated SMB share with
  server-side wide links and symlink following disabled. Client-visible reparse points are
  rejected; Unix symlinks hidden by a server cannot be identified reliably through `allinfo`.
  `smbclient` runs under `smb-netguard` (Landlock TCP port rule, bind denied, seccomp denies inet UDP/raw):
  a DFS referral or fallback peer has no network path (verified by a real msdfs proxy share). Requires
  Linux >= 6.7 (Landlock ABI 4) and Docker's default seccomp profile (which allows the `landlock_*`
  system calls); without them the SMB connection test reports a clear error and SMB fails closed
  (there is no unconfined fallback). Landlock restricts by TCP port only, so the helper refuses
  the SMB ports 139/445 as proxy port. Remote servers stay administrator-trusted. NFS component
  checks likewise require a
  trusted exporter and no untrusted concurrent namespace mutation; they are not a server-side
  isolation mechanism against malicious or racing exporters.
- Command/list output is bounded to 4 MiB and recursive catalogs to 10,000 entries. An oversized
  result is rejected explicitly, not silently truncated into a valid-looking partial catalog.
  Interrupted or timed-out writes never rename partial bytes over the previous file. NFS commits
  the rename only after both the source pipeline and writer have succeeded. Part-file cleanup is
  best effort if the server becomes unavailable; complete manifests remain the validity marker.
- Demo builds map all remote targets to visitor-local simulated trees and never connect to
  SMB/NFS servers. The create/edit/test UI uses the same API and EN/DE/ES messages.

Current targeted evidence: real isolated Samba/Ganesha tests cover encrypted backup, scan,
verify, download, restore after Pro downgrade, binary streaming/overwrite/delete, wrong SMB
credentials, missing share/export, read-only SMB/NFS exports, server-policy-blocked SMB symlinks,
NFS component/recursive symlink rejection, failed-source secret redaction, idle midstream write
timeouts, preservation of the old file, part cleanup, cancelled read resource cleanup, real
10,001-file oversized rejection, stalled peers and NFS mount cleanup. The DFS probe asserts
confinement (no bytes reach the alternate peer), and the packaged image was exercised with
Docker's default seccomp profile and no extra privileges: encrypted SMB3 backup works, a DFS
referral reaches 0 bytes at the alternate peer, and a missing Landlock fails closed.

### Restore host identity

When a set records a Docker engine ID, same-host restore is determined by that ID, not by the
saved endpoint record or a reusable hostname. Repointing an endpoint at a different engine must
not authorize same-host restore. Legacy sets without engine IDs retain the previous endpoint/
hostname fallback and remain readable.

## Restore to another host (2.5.0, Pro)

Sets are host-independent: nothing in the format changes and old manifests restore unchanged.
Restoring onto a different Docker engine (different engine ID) is a Pro feature and always needs a
fresh preview whose HMAC token signs the destination engine, the destination name, the target
stack root, every volume/mount mapping and the consumers that would be stopped.

- **Containers and volumes.** The destination is named explicitly (`destinationName`). Named and
  anonymous mounts are mapped by container and mount path onto the destination's actual mounts
  (existing container) or onto fresh plain local volumes. Created volumes never replay driver
  options, so a restore cannot mount a remote share on the destination.
- **Compose stacks.** The stack folder is written below an explicit, validated stack root of the
  destination endpoint (`targetStackRoot`, which must be one of its configured stack folders) as
  `<root>/<destinationName>`, with the project name derived from that name. Named and anonymous
  volumes get new, project-scoped names. After the folder is restored and before any volume is
  written, the Compose file is rendered on the destination and rejected unless: every bind source,
  secret/config file and build context lies inside the destination stack folder; no privileged
  mode, devices, host/shared namespaces, `volumes_from` or dangerous capabilities; no external
  volumes, secrets or configs (external networks must already exist); volumes are plain `local`
  without driver options and an explicit volume `name:` cannot select a source volume. An archived
  restore-override file is deleted and regenerated for the destination. Source host bind paths and
  unselected source mounts block the preview.
- **Replace.** Replacing an existing destination container or stack requires a safety backup of the
  destination's current state (resolved on the destination, not the source ID), a valid default
  target and the typed confirmation name. A copy never overwrites an existing destination.
- **Source untouched.** Nothing is written to or stopped on the source host. Volumes that exist
  only as a database dump (the raw volume was excluded) are created empty on the destination and
  filled by the dump once the database is ready.
- Verified with two independent Docker daemons (distinct engine IDs): named and anonymous volume
  bytes, a PostgreSQL stack restored from raw data and from a dump with identical table hashes,
  the destination safety archive, stale-token rejection and blocked unsafe stack roots and binds.
