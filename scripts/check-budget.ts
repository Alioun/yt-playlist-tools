import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { gzipSync } from "node:zlib"
import { parseAst } from "vite"
import type { Site } from "../src/shared/contracts/vocabulary"
import { popoversBundle, siteBundles } from "../src/shared/features/registration"
import { features } from "../src/shared/features/registry"

type Kb = number
type JsCss = { readonly js: Kb; readonly css: Kb }
export type BudgetException = { readonly row: string; readonly kb: Kb; readonly since: string; readonly why: string }
/** `perf-budget.json` (Q-PERF-36): the decided numbers, keyed by site and registry ID or library name, and dated exceptions. */
export type PerfBudget = {
  readonly sites: Readonly<Record<Site, Readonly<Record<string, Kb>>>>
  readonly totals: Readonly<Record<Site, Kb>>
  readonly lazy: { readonly [popoversBundle]: Kb }
  readonly popup: { readonly www: JsCss; readonly music: JsCss; readonly lazy: Kb }
  readonly settings: JsCss & { readonly lazy: Kb }
  readonly firstRun: { readonly js: Kb }
  readonly background: Kb
  readonly exceptions: readonly BudgetException[]
}
export type Browser = "chrome" | "firefox"
type Kind = "piece" | "alone" | "site" | "lazy" | "page" | "reported"
/** One checked size. `budget` is the decided number; `limit` is what passes, an exception's KB where one applies. */
export type Row = { readonly id: string; readonly kind: Kind; readonly budget?: Kb; readonly limit?: Kb; readonly exception?: BudgetException; readonly kb: Kb }
export type BuildReport = { readonly browser: Browser; readonly rows: readonly Row[]; readonly failures: readonly string[] }

const sites = Object.keys(siteBundles) as Site[]
const libraries = ["page", "core", "kit"] as const
const slackKb = 0.5
const kbOf = (bytes: number) => bytes / 1024
const round = (kb: Kb) => Math.round(kb * 100) / 100

/** Each site's pieces and their files, from the feature registry (ARC-REG-01): the page half, core, kit, then each feature file. */
export function sitePieces(): Record<Site, { id: string; file: string; kit: boolean }[]> {
  return Object.fromEntries(sites.map(site => {
    const names = siteBundles[site]
    const featureRows = features.flatMap(feature => {
      const page = feature.pages[site]
      return page?.file ? [{ id: feature.id, file: `${page.file}.js`, kit: page.needs.includes("kit") }] : []
    })
    return [site, [...libraries.map(library => ({ id: library, file: `${names[library]}.js`, kit: false })), ...featureRows]]
  })) as Record<Site, { id: string; file: string; kit: boolean }[]>
}

/** What's wrong with the file itself: pieces that differ from the registry's, totals that aren't their rows' sum, bad exceptions. */
export function budgetProblems(budget: PerfBudget, gatedRows: ReadonlySet<string>): string[] {
  const problems: string[] = []
  const pieces = sitePieces()
  for (const site of sites) {
    const expected = pieces[site].map(piece => piece.id).sort()
    const actual = Object.keys(budget.sites[site] ?? {}).sort()
    if (JSON.stringify(expected) !== JSON.stringify(actual)) problems.push(`perf-budget.json ${site} pieces are ${actual.join(", ")}; the registry's are ${expected.join(", ")}`)
    const sum = Object.values(budget.sites[site] ?? {}).reduce((total, kb) => total + kb, 0)
    if (Math.abs(sum - budget.totals[site]) > 0.001) problems.push(`perf-budget.json ${site} rows sum to ${round(sum)} KB, not the site total ${budget.totals[site]} KB (Q-PERF-16)`)
  }
  const seen = new Set<string>()
  for (const exception of budget.exceptions) {
    if (seen.has(exception.row)) problems.push(`perf-budget.json has two exceptions for ${exception.row}`)
    seen.add(exception.row)
    if (!gatedRows.has(exception.row)) problems.push(`perf-budget.json exception names no gated row: ${exception.row}`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.since)) problems.push(`perf-budget.json exception ${exception.row} needs a since date (YYYY-MM-DD)`)
    if (!exception.why.trim()) problems.push(`perf-budget.json exception ${exception.row} needs a reason`)
  }
  return problems
}

type Graph = { readonly imports: readonly string[]; readonly dynamic: readonly string[] }

function chunkGraph(directory: string, file: string): Graph {
  const code = readFileSync(join(directory, file), "utf8")
  const resolveFrom = (specifier: string) => join(file, "..", specifier).replaceAll("\\", "/")
  const imports = [...code.matchAll(/(?:\bfrom|\bimport)\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g)].map(match => resolveFrom(match[1]!))
  const dynamic = [...code.matchAll(/\bimport\(\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]\s*\)/g)].map(match => resolveFrom(match[1]!))
  return { imports, dynamic }
}

function closure(directory: string, roots: readonly string[]): Set<string> {
  const found = new Set<string>()
  const queue = [...roots]
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (found.has(file)) continue
    found.add(file)
    queue.push(...chunkGraph(directory, file).imports)
  }
  return found
}

function htmlScriptEntries(directory: string, html: string): string[] {
  return [...readFileSync(join(directory, html), "utf8").matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]!.replace(/^\//, ""))
}

function htmlAssets(directory: string, html: string) {
  const text = readFileSync(join(directory, html), "utf8")
  const attribute = (pattern: RegExp) => [...text.matchAll(pattern)].map(match => match[1]!.replace(/^\//, ""))
  return {
    scripts: [...attribute(/<script[^>]*\bsrc="([^"]+)"/g), ...attribute(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)],
    styles: attribute(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)
  }
}

const chunkName = (file: string) => basename(file).replace(/-[\w-]{8}\.js$/, "")

function hasTopLevelAwait(code: string): boolean {
  const walk = (node: unknown): boolean => {
    if (node === null || typeof node !== "object") return false
    if (Array.isArray(node)) return node.some(walk)
    const type = Reflect.get(node, "type")
    if (type === "FunctionDeclaration" || type === "FunctionExpression" || type === "ArrowFunctionExpression") return false
    if (type === "AwaitExpression" || (type === "ForOfStatement" && Reflect.get(node, "await") === true)) return true
    return Object.entries(node).some(([key, value]) => key !== "parent" && walk(value))
  }
  return walk(parseAst(code).body)
}

/** An extension page: its first view (the HTML's scripts and modulepreloads, with their static imports) and each lazy chunk. */
function extensionPage(directory: string, html: string, size: (file: string) => Kb) {
  const assets = htmlAssets(directory, html)
  const entries = [...htmlScriptEntries(directory, html)]
  const initial = closure(directory, assets.scripts)
  const importers = new Map<string, string[]>()
  const queue = [...initial]
  const visited = new Set<string>()
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (visited.has(file)) continue
    visited.add(file)
    for (const target of chunkGraph(directory, file).dynamic) {
      if (initial.has(target)) continue
      importers.set(target, [...importers.get(target) ?? [], file])
      queue.push(...closure(directory, [target]))
    }
  }
  // A lazy chunk weighs what it adds: when its import() runs, the importing chunk's static imports are loaded already.
  const lazy = new Map([...importers].map(([target, from]) => {
    const loaded = from.map(file => closure(directory, [file])).reduce((shared, next) => new Set([...shared].filter(item => next.has(item))))
    return [target, new Set([...closure(directory, [target])].filter(item => !initial.has(item) && !loaded.has(item)))] as const
  }))
  const sum = (files: Iterable<string>) => [...files].reduce((total, file) => total + size(file), 0)
  const names = new Map<string, number>()
  const lazyRows = [...lazy].map(([target, files]) => {
    const name = chunkName(target)
    const count = (names.get(name) ?? 0) + 1
    names.set(name, count)
    return { name: count > 1 ? `${name}~${count}` : name, target, kb: sum(files), files }
  })
  // Q-PERF-35 rule 3: a chunk that imports an entry waiting on a top-level await waits forever, and the page renders blank.
  const all = [...new Set([...initial, ...lazyRows.flatMap(row => [...row.files])])]
  const deadlocks = entries.filter(entry => hasTopLevelAwait(readFileSync(join(directory, entry), "utf8")))
    .flatMap(entry => all.filter(file => chunkGraph(directory, file).imports.includes(entry)).map(file => `${html}: ${file} imports ${entry}, which has a top-level await (Q-PERF-35 rule 3)`))
  return {
    js: sum(initial), css: sum(assets.styles), initial, lazy: lazyRows, deadlocks,
    /** The first view plus a lazy part that loads before the first frame in some view. */
    with: (name: string) => {
      const part = lazyRows.find(row => row.name === name)
      if (!part) throw Error(`${html} has no lazy chunk ${name}`)
      return sum(initial) + part.kb
    }
  }
}

type Evidence = { chunks: { file: string; modules: string[] }[] }

/** Q-PERF-38: what a page file may contain, from the module list the page-link build plugin records for each IIFE. */
function provenanceProblems(directory: string, browser: Browser): string[] {
  const evidenceDir = join(directory, "..", "page-link", `${browser}-build`)
  if (!existsSync(evidenceDir)) return [`${browser}: no page-link evidence at ${evidenceDir}; build with wxt build`]
  const problems: string[] = []
  const kits = new Set<string>(sites.map(site => siteBundles[site].kit))
  const featureFiles = new Set(features.flatMap(feature => Object.values(feature.pages).flatMap(page => page?.file ? [page.file] : [])))
  for (const name of readdirSync(evidenceDir).filter(entry => entry.endsWith(".json")).sort()) {
    const label = name.replace(/\.json$/, "")
    const evidence = JSON.parse(readFileSync(join(evidenceDir, name), "utf8")) as Evidence
    for (const module of evidence.chunks.flatMap(chunk => chunk.modules)) {
      if (module.includes("/node_modules/svelte/") && !kits.has(label) && label !== popoversBundle) problems.push(`${browser}: ${label}.js carries Svelte's runtime (${module})`)
      if (module.includes("/node_modules/bits-ui/") && label !== popoversBundle) problems.push(`${browser}: ${label}.js carries Bits UI (${module})`)
      if (featureFiles.has(label) && module.includes("/src/site/kit/")) problems.push(`${browser}: ${label}.js carries kit code instead of linking it (${module})`)
    }
  }
  return problems
}

function filesUnder(directory: string, sub = ""): string[] {
  return readdirSync(join(directory, sub), { withFileTypes: true }).flatMap(entry => {
    const path = sub ? `${sub}/${entry.name}` : entry.name
    return entry.isDirectory() ? filesUnder(directory, path) : [path]
  })
}

/** Measures one store build (Q-PERF-37) and checks it against the budget, exceptions included. */
export function checkBuild(directory: string, budget: PerfBudget): BuildReport {
  const browser: Browser = basename(directory).startsWith("firefox") ? "firefox" : "chrome"
  const failures: string[] = []
  const files = filesUnder(directory)
  if (files.some(file => file.endsWith(".map"))) failures.push(`${browser}: source maps in the build; measure a store build`)
  const cache = new Map<string, Kb>()
  const size = (file: string) => {
    let kb = cache.get(file)
    if (kb === undefined) cache.set(file, kb = kbOf(gzipSync(readFileSync(join(directory, file)), { level: 9 }).byteLength))
    return kb
  }
  const exceptions = new Map(budget.exceptions.map(exception => [exception.row, exception]))
  const rows: Row[] = []
  const gated = (id: string, kind: Kind, budgetKb: Kb, kb: Kb) => {
    const exception = exceptions.get(id)
    const row: Row = { id, kind, budget: budgetKb, limit: exception?.kb ?? budgetKb, kb, ...exception && { exception } }
    rows.push(row)
    return row
  }

  const pieces = sitePieces()
  for (const site of sites) {
    const pieceRows = new Map(pieces[site].map(piece => [piece.id, gated(`${site}/${piece.id}`, "piece", budget.sites[site][piece.id] ?? 0, size(piece.file))]))
    const sum = (ids: readonly string[], key: "budget" | "limit" | "kb") => ids.reduce((total, id) => total + (pieceRows.get(id)?.[key] ?? 0), 0)
    for (const piece of pieces[site].slice(libraries.length)) {
      const ids = ["page", "core", ...piece.kit ? ["kit"] : [], piece.id]
      rows.push({ id: `${site}/${piece.id} alone`, kind: "alone", budget: sum(ids, "budget"), limit: sum(ids, "limit"), kb: sum(ids, "kb") })
    }
    const all = pieces[site].map(piece => piece.id)
    rows.push({ id: `${site} everything on`, kind: "site", budget: budget.totals[site], limit: sum(all, "limit"), kb: sum(all, "kb") })
  }
  gated(popoversBundle, "lazy", budget.lazy[popoversBundle], size(`${popoversBundle}.js`))

  const popup = extensionPage(directory, "popup.html", size)
  gated("popup/www/js", "page", budget.popup.www.js, popup.js)
  gated("popup/www/css", "page", budget.popup.www.css, popup.css)
  gated("popup/music/js", "page", budget.popup.music.js, popup.with("MusicTab"))
  gated("popup/music/css", "page", budget.popup.music.css, popup.css)
  for (const part of popup.lazy) gated(`popup/lazy/${part.name}`, "lazy", budget.popup.lazy, part.kb)

  const settings = extensionPage(directory, "options.html", size)
  gated("settings/js", "page", budget.settings.js, settings.js)
  gated("settings/css", "page", budget.settings.css, settings.css)
  for (const part of settings.lazy) gated(`settings/lazy/${part.name}`, "lazy", budget.settings.lazy, part.kb)

  const firstRun = extensionPage(directory, "onboarding.html", size)
  gated("first-run/js", "page", budget.firstRun.js, firstRun.js)
  gated("first-run/upgrade/js", "page", budget.firstRun.js, firstRun.with("UpgradeNote"))
  rows.push({ id: "first-run/css", kind: "reported", kb: firstRun.css })
  for (const part of firstRun.lazy) rows.push({ id: `first-run/lazy/${part.name}`, kind: "reported", kb: part.kb })

  gated("background", "page", budget.background, size("background.js"))

  for (const row of rows) {
    if (row.limit !== undefined && row.kb > row.limit) {
      failures.push(`${browser}: ${row.id} is ${round(row.kb)} KB, over its ${row.exception ? `exception of ${row.exception.kb}` : `budget of ${row.budget}`} KB`)
    }
  }

  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as Record<string, unknown>
  for (const key of ["content_scripts", "web_accessible_resources"]) if (key in manifest) failures.push(`${browser}: manifest has ${key} (Q-PERF-6)`)
  const ownedCss = new Set([popup, settings, firstRun].flatMap(page => [
    ...htmlAssets(directory, page === popup ? "popup.html" : page === settings ? "options.html" : "onboarding.html").styles,
    ...[...page.initial, ...page.lazy.flatMap(part => [...part.files])].flatMap(file => [...readFileSync(join(directory, file), "utf8").matchAll(/assets\/[\w.-]+\.css/g)].map(match => match[0]))
  ]))
  failures.push(...[popup, settings, firstRun].flatMap(page => page.deadlocks.map(problem => `${browser}: ${problem}`)))
  for (const file of files.filter(file => file.endsWith(".css") && !ownedCss.has(file))) failures.push(`${browser}: ${file} belongs to no extension page; page scripts inject their CSS (Q-PERF-21)`)
  failures.push(...provenanceProblems(directory, browser))
  return { browser, rows, failures }
}

/** Exceptions are for overruns that exist: one whose row now passes, or that allows far more than the row measures, must go or shrink. */
export function exceptionProblems(budget: PerfBudget, reports: readonly BuildReport[]): string[] {
  return budget.exceptions.flatMap(exception => {
    const measured = reports.flatMap(report => report.rows.filter(row => row.id === exception.row).map(row => row.kb))
    if (!measured.length) return []
    const worst = Math.max(...measured)
    const row = reports[0]!.rows.find(item => item.id === exception.row)!
    if (row.budget !== undefined && worst <= row.budget) return [`${exception.row} is within its ${row.budget} KB budget (${round(worst)} KB); remove its exception`]
    if (exception.kb - worst > slackKb) return [`${exception.row}'s exception allows ${exception.kb} KB but it measures ${round(worst)} KB; lower the exception to ${Math.ceil(worst * 10) / 10}`]
    return []
  })
}

export function table(reports: readonly BuildReport[]): string {
  const [first, ...others] = reports
  if (!first) return ""
  const lines = [`| Row | Budget KB | Limit KB | ${reports.map(report => `${report.browser} KB`).join(" | ")} | Status |`, `|---|---:|---:|${reports.map(() => "---:|").join("")}---|`]
  for (const row of first.rows) {
    const measured = [row.kb, ...others.map(report => report.rows.find(item => item.id === row.id)?.kb ?? Number.NaN)]
    const worst = Math.max(...measured)
    const status = row.limit === undefined ? "reported"
      : worst > row.limit ? "**over**"
      : row.budget !== undefined && worst > row.budget ? `excepted since ${row.exception?.since ?? "(pieces)"}`
      : "ok"
    const show = (kb: Kb | undefined) => kb === undefined ? "" : round(kb).toFixed(2)
    lines.push(`| ${row.id} | ${show(row.budget)} | ${show(row.limit)} | ${measured.map(show).join(" | ")} | ${status} |`)
  }
  return lines.join("\n")
}

export function checkBudget(directories: readonly string[], budget: PerfBudget): { reports: BuildReport[]; failures: string[] } {
  if (!directories.length) throw Error("Usage: bun scripts/check-budget.ts <output dir>...")
  const reports = directories.map(directory => checkBuild(directory, budget))
  const gatedRows = new Set(reports[0]!.rows.filter(row => row.kind !== "alone" && row.kind !== "site" && row.kind !== "reported").map(row => row.id))
  const failures = [...budgetProblems(budget, gatedRows), ...reports.flatMap(report => report.failures), ...exceptionProblems(budget, reports)]
  return { reports, failures }
}

if (import.meta.main) {
  try {
    const budget = JSON.parse(readFileSync("perf-budget.json", "utf8")) as PerfBudget
    const directories = process.argv.slice(2)
    const { reports, failures } = checkBudget(directories, budget)
    const report = table(reports)
    console.log(report)
    const summary = process.env.GITHUB_STEP_SUMMARY
    if (summary) appendFileSync(summary, `## Bundle sizes (gzip -9)\n\n${report}\n\n${failures.map(failure => `- ${failure}`).join("\n")}\n`)
    for (const failure of failures) console.error(`::error::${failure}`)
    if (failures.length) process.exit(1)
    console.log(`Within budget: ${directories.map(directory => basename(directory)).join(", ")}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
