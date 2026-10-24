# Check source ZIP rebuilds

Run the check with Node 24, Bun 1.4.3, Git, and Python 3 on `PATH`.
Allow network access for two frozen dependency installs.
Bun must match `package.json`'s `packageManager` field.

```sh
node scripts/check-source-rebuild.mjs --keep
```

The checker snapshots tracked and nonignored untracked working-tree files into
a new temporary directory. It skips deleted files, environment files, local
credential configuration, dependency directories, and generated output.
It rejects symlinks. Commit or unignore any intended build input before checking.
Ignored local source files are outside this check.

The checker installs dependencies with `bun install --frozen-lockfile` in the
snapshot. It builds Chrome and runs WXT's Firefox ZIP command, which builds
Firefox and creates the actual source ZIP. It validates and extracts that ZIP
into a fresh directory, installs frozen dependencies again, and rebuilds both
browsers. Every build uses the Node executable that runs this script.
The isolated install lifecycle also finds that executable first on `PATH`.
Child processes receive a restricted environment and a temporary home directory.
The checker never copies `.env` files or loads the checkout's environment files.

Each comparison checks the complete set of relative file paths and every raw
file byte. It does not rename hashed assets, normalize output, or repair files.
It fails on missing, extra, or modified artifacts.
The checkout's source, dependencies, `.wxt`, and `.output` remain untouched.

With `--keep`, the printed evidence directory retains both source trees, their
outputs, the actual source ZIP, command logs, `commands.json`,
`archive-paths.json`, and `comparison.json`. Without `--keep`, a successful run
removes its temporary directory. A failed run always retains evidence.
Each child command has a three-minute timeout.

To check saved artifact trees or exercise missing-file and changed-byte controls,
use the comparator directly on disposable copies.

```sh
node scripts/check-source-rebuild.mjs --compare /tmp/expected-tree /tmp/rebuilt-tree
```

Exit codes are `0` for equality, `1` for differences, `2` for invalid arguments
or an unsupported runtime, and `3` for an install, build, extraction, or I/O failure.

The Tailwind scan keeps `source(none)` and the explicit positive source glob.
It subtracts `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`, and `__tests__`
paths because WXT omits those inputs from its source ZIP. WXT includes
`*.bun-test.ts` files, so their tokens remain eligible. At `ce5eda3`, a test title
in `src/shared/rules/gather.bun-test.ts` supplies `contents`, masking the earlier
rebuild mismatch from the omitted `youtube-session.test.ts` token.
The scan exclusions prevent that omitted-input dependency even when another
eligible file happens to supply the same utility.

This check uses the current root production configuration and archive boundaries.
The Svelte pilot fixture remains excluded by the existing WXT configuration.
The checker does not implement the planned 2.0 archive exclusions, beta builds,
CI integration, linker verification, or store certification.

Equality here means working-tree and source-ZIP builds agree under the same
Node 24 executable on one host. It does not establish equality between Bun and
Node builds or across operating systems and architectures. Native Bun and Node
currently serialize Vite's `preload.toString()` helper differently.
