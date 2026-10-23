import { rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

// svelte-check 4.7.7 retains emitted types for deleted Svelte files.
rmSync(new URL("./.svelte-check/", import.meta.url), { recursive: true, force: true })
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../../../node_modules/svelte-check/bin/svelte-check", import.meta.url)),
  "--tsgo",
  "--workspace", fileURLToPath(new URL("./", import.meta.url)),
  "--tsconfig", "./tsconfig.json",
  "--fail-on-warnings"
], { stdio: "inherit" })
if (result.error) throw result.error
process.exit(result.status ?? 1)
