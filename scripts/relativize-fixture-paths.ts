// Rewrites absolute paths into T3 worktrees under tools/fixtures so every fixture runs from any checkout,
// then refreshes the identity records (sha256, gitBlob, bytes) that sealed the old bytes of any fixture
// file that now differs from HEAD. Run it from the repository root after merging fixtures authored elsewhere:
//   bun --no-env-file scripts/relativize-fixture-paths.ts
// tsconfig files get paths relative to their own folder; every other JSON record gets repository-root paths.
import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"

export const worktreePath = /(?:\/[^\s"'`/]+)*\/\.t3\/worktrees\/[^\s"'`/]+\/t3-[0-9a-f]{8}(\/[^\s"'`]*)?/g

type Identity = { sha256: string; gitBlob: string; bytes: number }

function identify(bytes: Uint8Array): Identity {
  const header = Buffer.from(`blob ${bytes.length}\0`)
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    gitBlob: createHash("sha1").update(header).update(bytes).digest("hex"),
    bytes: bytes.length
  }
}

export function relativizePaths(file: string, text: string): string {
  const toRoot = relative(dirname(file), ".") || "."
  return text.replace(worktreePath, (_, rest: string | undefined) => {
    if (/tsconfig[^/]*\.json$/.test(file)) return rest ? `${toRoot}${rest}` : toRoot
    return rest ? rest.slice(1) : "."
  })
}

export function reseal(text: string, from: Identity, to: Identity): string {
  let out = text
  for (let at = out.lastIndexOf(from.sha256); at >= 0; at = out.lastIndexOf(from.sha256, at - 1)) {
    const open = out.lastIndexOf("{", at)
    const close = out.indexOf("}", at)
    if (open < 0 || close < 0 || out.slice(open + 1, close).includes("{")) continue
    const record = out.slice(open, close).replace(new RegExp(`("bytes"\\s*:\\s*)${from.bytes}\\b`), `$1${to.bytes}`)
    out = out.slice(0, open) + record + out.slice(close)
    if (at === 0) break
  }
  return out.replaceAll(from.sha256, to.sha256).replaceAll(from.gitBlob, to.gitBlob)
}

function git(args: string[]): Uint8Array {
  const result = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`)
  return result.stdout
}

export async function relativizeFixtures(root = "tools/fixtures") {
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
    .sort()
  const original = new Map<string, Uint8Array>()
  const base = new Map<string, string>()
  const unsupported: string[] = []
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(file))
    original.set(file, bytes)
    const text = Buffer.from(bytes).toString("utf8")
    if (text.search(worktreePath) < 0) continue
    if (file.endsWith(".json")) base.set(file, relativizePaths(file, text))
    else unsupported.push(file)
  }
  if (unsupported.length) throw Error(`Derive these worktree paths from the file's own location by hand:\n${unsupported.join("\n")}`)

  const headBlobs = new Map(Buffer.from(git(["ls-tree", "-r", "HEAD", root])).toString("utf8").trim().split("\n")
    .map(line => line.split("\t"))
    .map(([meta, path]) => [path!, meta!.split(" ")[2]!] as const))
  const start = new Map(files.map(file => [file, base.has(file) ? Buffer.from(base.get(file)!) : original.get(file)!] as const))
  const sealed = new Map<string, Identity>()
  const track = (file: string, bytes: Uint8Array) => {
    const blob = headBlobs.get(file)
    if (blob && !sealed.has(file) && identify(bytes).gitBlob !== blob) sealed.set(file, identify(git(["cat-file", "blob", blob])))
  }
  for (const [file, bytes] of start) track(file, bytes)

  let estimate = new Map<string, Identity>()
  let next = start
  for (let round = 0; ; round++) {
    if (round > 50) throw Error("Identity records reference each other in a cycle")
    next = new Map([...start].map(([file, bytes]) => {
      let text = Buffer.from(bytes).toString("utf8")
      const before = text
      for (const [sealedFile, from] of sealed) {
        const to = estimate.get(sealedFile)
        if (to && to.sha256 !== from.sha256 && text.includes(from.sha256)) text = reseal(text, from, to)
      }
      return [file, text === before ? bytes : Buffer.from(text)] as const
    }))
    for (const [file, bytes] of next) track(file, bytes)
    const fresh = new Map([...sealed.keys()].map(file => [file, identify(next.get(file)!)] as const))
    if ([...fresh].every(([file, identity]) => estimate.get(file)?.sha256 === identity.sha256)) break
    estimate = fresh
  }

  const written: string[] = []
  for (const [file, bytes] of next) {
    if (Buffer.from(bytes).equals(Buffer.from(original.get(file)!))) continue
    await writeFile(file, bytes)
    written.push(file)
  }
  return written
}

if (import.meta.main) {
  const written = await relativizeFixtures()
  console.log(`${written.length} fixture files rewritten`)
  for (const file of written) console.log(file)
}
