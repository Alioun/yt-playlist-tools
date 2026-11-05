import { expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { budgetProblems, type PerfBudget } from "../../scripts/check-budget"
import { pageLinkEntries } from "../../src/shared/features/registration"
import { features } from "../../src/shared/features/registry"

const root = fileURLToPath(new URL("../../", import.meta.url))
const entrypoints = fileURLToPath(new URL("../../src/entrypoints/", import.meta.url))

test("every registry file has its entrypoint", () => {
  const files = features.flatMap(feature => Object.values(feature.pages).flatMap(page => (page?.file ? [page.file] : [])))
  expect(files.filter(file => !existsSync(`${entrypoints}${file}.ts`))).toEqual([])
})

test("every page entrypoint is a registry file or a library", () => {
  const owned = pageLinkEntries(features)
  const scripts = readdirSync(entrypoints)
    .filter(name => name.endsWith(".ts") && name !== "background.ts")
    .map(name => name.replace(/\.ts$/, ""))
  expect(scripts.filter(name => !Object.hasOwn(owned, name))).toEqual([])
})

test("perf-budget.json holds exactly the registry's pieces, summing to each site's total", () => {
  const budget = JSON.parse(readFileSync(`${root}perf-budget.json`, "utf8")) as PerfBudget
  expect(budgetProblems(budget, new Set(budget.exceptions.map(exception => exception.row)))).toEqual([])
})
