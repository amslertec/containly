# Containly backup format (version 1)

This document describes how Containly 2.2.0 and later store data backups of volumes, stacks and
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
```

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
  "containly": "2.2.0",
  "scope": { "kind": "stack|container|volume", "ref": "…", "label": "immich", "endpointName": "nas", "planName": null },
  "source": { "hostname": "nas", "engineId": "ABCD:…", "arch": "amd64", "dockerVersion": "29.0.0" },
  "encryption": null | {
    "alg": "CENC1-AES-256-GCM", "chunk": 1048576, "keyFingerprint": "9f3a…",
    "keyslots": [{ "kdf": "scrypt", "N": 131072, "r": 8, "p": 1, "salt": "b64", "iv": "b64", "tag": "b64", "wrappedDek": "b64" }]
  },
  "compression": "zstd|gzip|none",
  "files": [{ "path": "volumes/db.tar.zst.cenc", "role": "volume", "ref": "db", "bytesStored": 123, "sha256Stored": "…" }],
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
