import { afterEach, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { discoverTestEntries, parseShard, runBunTests, selectTestEntries } from "../../scripts/run-bun-tests"

const directories: string[] = []
const runner = resolve(import.meta.dir, "../../scripts/run-bun-tests.ts")

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "bun-runner-"))
  directories.push(directory)
  await mkdir(join(directory, "tests"))
  await mkdir(join(directory, "src/nested"), { recursive: true })
  for (const [path, marker] of [
    ["src/z.bun-test.ts", "fixture-z"],
    ["tests/root.test.ts", "fixture-root"],
    ["src/nested/a.bun-test.ts", "fixture-a"]
  ]) {
    await writeFile(join(directory, path!), `import {test,expect} from "bun:test";test(${JSON.stringify(marker)},()=>{console.log(${JSON.stringify(marker)});expect(true).toBe(true)})`)
  }
  await writeFile(join(directory, "src/legacy.test.ts"), "throw Error('legacy must not execute')")
  return directory
}

function cli(cwd: string, args: string[] = []) {
  return spawnSync(process.execPath, ["--no-env-file", runner, ...args], { cwd, encoding: "utf8", timeout: 20000 })
}

test("discovery keeps the tests root and sorted adjacent Bun files, excluding legacy files", async () => {
  expect(await discoverTestEntries(await fixture())).toEqual(["./tests", "./src/nested/a.bun-test.ts", "./src/z.bun-test.ts"])
})

test("all shards form the complete disjoint discovery and own the tests root once", async () => {
  const entries = await discoverTestEntries()
  expect(selectTestEntries(entries)).toEqual(entries)
  for (const count of [1, 2, 8, entries.length + 1]) {
    const shards = Array.from({ length: count }, (_, position) => selectTestEntries(entries, parseShard(["--shard", `${position + 1}/${count}`])))
    expect(shards.flat().sort()).toEqual([...entries].sort())
    expect(new Set(shards.flat()).size).toBe(entries.length)
    expect(shards.filter(shard => shard.includes("./tests"))).toHaveLength(1)
    for (const [index, shard] of shards.entries()) {
      expect(selectTestEntries(entries, parseShard(["--shard", `${index + 1}/${count}`]))).toEqual(shard)
    }
  }
})

test("the default command passes every discovered entry and preserves child conditions", async () => {
  const cwd = await fixture(), commands: string[][] = []
  expect(await runBunTests([], { cwd, spawn: async command => { commands.push(command); return 0 } })).toBe(0)
  expect(commands).toEqual([[process.execPath, "test", "--no-env-file", "--isolate", "--conditions=browser", "./tests", "./src/nested/a.bun-test.ts", "./src/z.bun-test.ts"]])
})

test("invalid shard usage fails before discovery or spawning", async () => {
  let spawned = false
  for (const args of [["--shard"], ["--shard", "0/8"], ["--shard", "9/8"], ["--shard", "1/0"], ["--shard", "1.5/8"], ["--shard", "-1/8"], ["--shard", "01/8"], ["--shard", "1/8", "extra"], ["--shard", "1/9007199254740992"], ["--shard=1/8"], ["--unknown", "1/8"]]) {
    await expect(runBunTests(args, { cwd: "/missing-bun-runner-fixture", spawn: async () => { spawned = true; return 0 } })).rejects.toThrow("Usage:")
  }
  expect(spawned).toBe(false)
  const result = cli(await fixture(), ["--shard", "0/8"])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("1-based")
  expect(result.stdout).toBe("")
}, 25000)

test("an empty shard succeeds without accidentally launching the full suite", async () => {
  let spawned = false
  expect(await runBunTests(["--shard", "4/4"], { cwd: await fixture(), spawn: async () => { spawned = true; return 0 } })).toBe(0)
  expect(spawned).toBe(false)
})

test("real CLI shards execute the tests root and each adjacent file exactly once", async () => {
  const cwd = await fixture(), output: string[] = []
  for (const index of [1, 2, 3]) {
    const result = cli(cwd, ["--shard", `${index}/3`])
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    output.push(result.stdout)
  }
  expect(output.join("").split("\n").filter(line => line.startsWith("fixture-")).sort()).toEqual(["fixture-a", "fixture-root", "fixture-z"])
}, 65000)

test("a real Bun assertion failure propagates through the runner CLI", async () => {
  const cwd = await fixture()
  await writeFile(join(cwd, "src/nested/a.bun-test.ts"), 'import {test,expect} from "bun:test";test("fixture failure",()=>expect("actual").toBe("expected"))')
  const result = cli(cwd, ["--shard", "2/3"])
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("fixture failure")
  expect(result.stderr).toContain("1 fail")
}, 25000)

test("the runner returns the actual child exit code", async () => {
  const code = await runBunTests([], { cwd: await fixture(), spawn: async () => {
    const child = Bun.spawn([process.execPath, "--no-env-file", "-e", "process.exit(17)"], { stdout: "ignore", stderr: "ignore", timeout: 10000 })
    return child.exited
  } })
  expect(code).toBe(17)
}, 15000)
