import { rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
if (process.argv.length !== 2) throw Error("typecheck.mjs accepts no arguments")
rmSync(new URL("./.svelte-check/", import.meta.url), { recursive: true, force: true })
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../../node_modules/svelte-check/bin/svelte-check", import.meta.url)), "--tsgo", "--workspace", fileURLToPath(new URL("./", import.meta.url)), "--tsconfig", "./tsconfig.json", "--fail-on-warnings"], { stdio: "inherit" })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
const native = spawnSync(process.execPath, [fileURLToPath(new URL("../../../../node_modules/@typescript/native/bin/tsc", import.meta.url)), "--noEmit", "-p", fileURLToPath(new URL("./tsconfig.json", import.meta.url))], { stdio: "inherit" })
if (native.error) throw native.error
process.exit(native.status ?? 1)
