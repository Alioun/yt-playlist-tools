import { rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

// svelte-check 4.7.7 retains emitted types for deleted Svelte files.
rmSync(new URL("../../../.svelte-check/", import.meta.url), { recursive: true, force: true })
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../../../scripts/svelte-check.mjs", import.meta.url)),
    "--workspace",
    fileURLToPath(new URL("../../../", import.meta.url)),
    "--tsconfig",
    fileURLToPath(new URL("./tsconfig.json", import.meta.url)),
    "--fail-on-warnings"
  ],
  { stdio: "inherit" }
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
