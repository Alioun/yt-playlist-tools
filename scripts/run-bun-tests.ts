import { readdir } from "node:fs/promises"

await readdir("tests")

const migratedTests = (await readdir("src", { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith(".bun-test.ts"))
  .map(entry => `./${entry.parentPath}/${entry.name}`)
  .sort()

const child = Bun.spawn([
  process.execPath,
  "test",
  "--isolate",
  "--conditions=browser",
  "./tests",
  ...migratedTests
], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })

process.exit(await child.exited)
