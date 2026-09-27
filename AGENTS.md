# @dyanet/ghost-storage-gcs: notes for agents and maintainers

Google Cloud Storage adapter for Ghost. The default branch is **`master`**. The repo was renamed from `ghost-google-cloud-storage` and is still a GitHub fork of `thombuchi/ghost-google-cloud-storage` (it can't leave the fork network while it has a child fork; not a priority).

## Releasing

Releases are cut by **merging a version bump**, never by hand-publishing.

1. In a PR, bump `version` in `package.json` and update the changelog/README if user-facing.
2. Merge to `master` (or to a `release/**` maintenance branch). The release job in `.github/workflows/ci.yml` then:
   - skips if this version has already been released (the git tag `v<version>` exists);
   - publishes to **GitHub Packages** with the same dist-tag;
   - **stages** the version on **npmjs** with `npm stage publish --provenance`, authenticated by **npm Trusted Publishing (OIDC)**. No `NPM_TOKEN` is used.
   - pushes the tag `v<version>` (this is what stops a re-stage on later pushes).
3. A maintainer **approves** the staged version on npmjs.com → **Staged Packages** → Approve (2FA), or `npm stage approve <stage-id>` (IDs: `npm stage list`, or the job log). Nothing is live on npm until then.

Details:
- **Trusted publisher** (npmjs.com → package → Settings → Trusted publishing → GitHub Actions): org `dyanet`, repo `ghost-storage-gcs`, workflow `ci.yml`, environment blank. It allows **staging only**. A plain `npm publish` from CI fails with `403 OIDC permission denied for this action`, so keep `npm stage publish`.
- **dist-tags:** `latest` only when the version is newer than npmjs's current `latest`; an older line (e.g. a 2.x fix after 3.0.0) is staged as `v<major>`, so approving it can't move `latest` backwards. To fix a tag by hand: `npm dist-tag add <pkg>@<version> latest`.
- `npm stage` needs a current npm, so the job runs `npm install -g npm@latest`. `npm stage list` needs a logged-in user, so CI can't use it; the git tag is the only "already staged" marker.
- Automated sessions (Claude Code on the web) **cannot push tags or create GitHub releases** (403). That is why releasing is merge-driven. Branches can be pushed.
- The npmjs.com package page caches dist-tags; check with `npm view <pkg> dist-tags`.

## Monthly security pass

- **Find advisories with `npm audit`** (plus `npm audit --omit=dev` for what ships). The Claude GitHub App cannot read the Dependabot alerts API (403).
- **Update to the latest compatible version**: `npm update` within ranges first, then raise ranges where needed. Dev tooling may move majors only if `engines.node` still holds (check the tool's own `engines`). Runtime dependencies stay within the declared `engines` and peer ranges unless a breaking release is intended.
- Supersede open Dependabot PRs with one PR, and close them with a comment naming the replacing PR.
- **Majors are deliberate.** `.github/dependabot.yml` ignores `semver-major` version updates (security updates still arrive). Evaluate majors during this pass.
- Run build, lint and tests, and **add tests** for the least-covered code. Prefer tests that exercise real integration points (packed tarballs, real sockets, the real base class) over pure mocks; that is how this pass found real bugs. Confirm a regression test fails on the old code.
- Bump the version, merge, and let the release job stage it (see Releasing).
- Record the pass in the "Monthly sec updates" project notes.

## CI conventions

- The Node matrix covers every line allowed by `engines.node` (up to Current), with `fail-fast: false`.
- `npm audit --omit=dev --audit-level=high` gates CI on one matrix leg.
- `concurrency` cancels superseded CI runs. Publishing never runs concurrently and is never cancelled.
- Action versions: `actions/checkout@v7`, `actions/setup-node@v7`.

## Version lines

| Line | Branch | Ghost | Node | Base / storage | npm dist-tag |
|---|---|---|---|---|---|
| 3.x | `master` | 6.x | ≥22.12 | `ghost-storage-base` ^3, `@google-cloud/storage` ^8 | `latest` |
| 2.x | `release/2.x` | 5.x | ≥18 | `ghost-storage-base` ^1.1.2, `@google-cloud/storage` ^7.22 | `v2` (automatic, since it's older than `latest`) |

## Repo notes

- **Ghost loads the adapter with `require()` and expects the class itself.** `src/index.ts` ends with a guarded `module.exports = GStore` (plus `.default`). Keep the guard: vitest's ESM transform breaks without it. `__tests__/cjs-contract.test.ts` and the CI smoke step check this contract.
- **3.x:** `ghost-storage-base` 3 is **ESM-only** with a named `StorageBase` export and loads through `require(esm)`, hence Node ≥22.12. Base 3 makes `saveRaw(buffer, targetPath)` and `urlToPath(url)` abstract. Both are implemented; `urlToPath` must stay the inverse of `save`/`saveRaw` URLs. `save(file, targetDir)` honours `targetDir`. `delete()` resolves to `undefined`.
- `__tests__/ghost6-contract.test.ts` runs against the **real** base 3 with only GCS mocked. Keep it that way.
- vitest 5 requires constructor mocks with `function`/`class` implementations (not arrow functions).
- Accepted advisory: moderate `uuid <11.1.1` via `gaxios` 6 (even with storage 8). Only `v4()` without a buffer is used, so it's unreachable.
- 2.x on Node 18: vitest 3.2.x with `vite` pinned to ^6.4.3 (vite 7 needs Node 20.19+).
- The package ships only `dist`, `README.md` and `LICENSE` (the `files` whitelist).

## Working-copy gotchas

- Some files are committed with **CRLF** line endings. Preserve each file's existing endings when editing (Python `open()` silently converts CRLF to LF; use `newline=''`).
- The maintainer's local checkouts are on Windows (`C:\work\dyanet\…`) and show whole-file CRLF/LF diffs. Don't run git inside the linked-folder mount from a remote session: it can't delete lock files and leaves `.git/index.lock` behind.
- Shallow single-branch clones need `git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'` before other branches can be fetched or tracked.
