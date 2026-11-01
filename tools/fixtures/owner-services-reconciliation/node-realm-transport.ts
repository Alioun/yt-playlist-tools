import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

function withRealmFile<T>(runner: string, script: string, run: (runner: string, file: string) => T): T {
  const needle = 'readFileSync(0,"utf8")'
  if (runner.split(needle).length !== 2) throw Error("Expected one synthetic realm input")
  const directory = mkdtempSync(join(tmpdir(), "owner-realm-"))
  const file = join(directory, "fixture.js")
  try {
    writeFileSync(file, script, { encoding: "utf8", mode: 0o600 })
    const contextImport = /import\s*\{\s*runInNewContext\s*\}\s*from\s*"node:vm";?/
    if (!contextImport.test(runner)) throw Error("Expected the pinned Node VM runner")
    const ordinaryGlobalRunner = runner.replace(contextImport, 'import { createContext, runInContext, constants } from "node:vm";const runInNewContext=(source, globals, options)=>{const realm=createContext(constants.DONT_CONTEXTIFY);Object.defineProperties(realm,Object.getOwnPropertyDescriptors(globals));return runInContext(source,realm,options)};')
    return run(ordinaryGlobalRunner.replace(needle, 'readFileSync(process.argv[1],"utf8")'), file)
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

export function executeSyntheticNodeRealm(runner: string, script: string, timeout: number): string {
  return withRealmFile(runner, script, (code, file) => execFileSync("node", ["--input-type=module", "-e", code, file], { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }))
}

export function spawnSyntheticNodeRealm(runner: string, script: string, timeout: number) {
  return withRealmFile(runner, script, (code, file) => spawnSync("node", ["--input-type=module", "-e", code, file], { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }))
}
