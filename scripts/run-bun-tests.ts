import { readdir } from "node:fs/promises"
import { join, relative, resolve } from "node:path"

type Shard = { index: number; count: number }

export function parseShard(args: readonly string[]): Shard | undefined {
  if (args.length === 0) return undefined
  const usage = "Usage: bun run scripts/run-bun-tests.ts [--shard index/count] (1-based, 1 <= index <= count)"
  if (args.length !== 2 || args[0] !== "--shard" || !/^[1-9]\d*\/[1-9]\d*$/.test(args[1] ?? "")) throw Error(usage)
  const [index, count] = args[1]!.split("/").map(Number)
  if (index === undefined || count === undefined || !Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count) throw Error(usage)
  return { index, count }
}

export async function discoverTestEntries(root = process.cwd()): Promise<string[]> {
  await readdir(join(root, "tests"))
  const migratedTests = (await readdir(join(root, "src"), { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith(".bun-test.ts"))
    .map(entry => `./${relative(resolve(root), join(entry.parentPath, entry.name))}`)
    .sort()
  return ["./tests", ...migratedTests]
}

export function selectTestEntries(entries: readonly string[], shard?: Shard): string[] {
  return entries.filter((_, position) => !shard || position % shard.count === shard.index - 1)
}

export async function runBunTests(args: readonly string[], {
  cwd = process.cwd(),
  spawn = (command: string[]) => Bun.spawn(command, { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exited
} = {}): Promise<number> {
  const shard = parseShard(args)
  const entries = selectTestEntries(await discoverTestEntries(cwd), shard)
  if (entries.length === 0) return 0
  return spawn([process.execPath, "test", "--no-env-file", "--isolate", "--conditions=browser", ...entries])
}

if (import.meta.main) {
  try {
    process.exit(await runBunTests(process.argv.slice(2)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
