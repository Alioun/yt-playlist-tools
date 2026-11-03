import { describe, expect, test } from "bun:test"
import { supportsJob } from "../contracts/jobs"
import type { Site } from "../contracts/vocabulary"
import type { MusicAction } from "../model/types"
import { defaultSettings } from "../model/defaults"
import { desired, pageLinkEntries } from "./registration"
import { anchors, features, filesFor, healthFor, libraries } from "./registry"
import expected from "../../../tools/fixtures/feature-registry/expected.json"
import { everything, scenarios } from "../../../tools/fixtures/feature-registry/cases"
import { registryRecord } from "../../../tools/fixtures/feature-registry/consumer"
import { createRegistrar } from "../../background/registrar/registrar"
import { observedScript, scriptedRegistrar } from "../../../tools/fixtures/registrar/scripted"

const sites: readonly Site[] = ["www", "music"]
const actionIds: readonly MusicAction[] = ["next", "queue", "save", "like", "remove", "library", "mix", "album", "artist"]

function fixedScenario(name: string) {
  const found = expected.scenarios.find(scenario => scenario.name === name)
  if (!found) throw Error(`Missing independent expectation ${name}`)
  return found
}

describe("production feature registry", () => {
  test("catalogue covers the twelve feature IDs once in specification order", () => {
    expect(features.map(feature => feature.id)).toEqual([
      "auto-add", "shortcuts", "quick-save", "queue-button", "watch-button", "card-menu",
      "browser-menu", "gather", "music-actions", "music-keys", "any-tab-keys", "sync"
    ])
    expect<unknown>(registryRecord().catalogue).toEqual(expected.catalogue)
  })

  for (const input of scenarios()) test(`planner and eager files agree with fixed records for ${input.name}`, () => {
    const fixed = fixedScenario(input.name)
    expect<unknown>(desired(features, input.settings, input.consent, input.access, input.schemaOk)).toEqual(fixed.registrations)
    expect(filesFor("www", input.settings)).toEqual(fixed.files.www)
    expect(filesFor("music", input.settings)).toEqual(fixed.files.music)
  })

  test("ownership contains the exact production bundles and no synthetic file-free entries", () => {
    expect<unknown>(pageLinkEntries(features)).toEqual(expected.ownership)
    expect<unknown>(libraries).toEqual(expected.libraries)
    for (const id of ["browser-menu", "any-tab-keys", "sync"] as const) {
      expect(features.find(feature => feature.id === id)?.pages).toEqual({})
    }
    const gather = features.find(feature => feature.id === "gather")
    expect(gather?.pages.www?.file).toBeUndefined()
    expect(gather?.pages.www?.needs).toEqual([])
    expect(healthFor("gather")).toEqual({ www: {
      required: [], optional: ["queueAddList", "membership", "addBatch", "removeBatch"], anchors: []
    } })
  })

  test("Music shortcut predicate remains independent of other Music features", () => {
    const s = everything()
    const page = features.find(feature => feature.id === "shortcuts")?.pages.music
    expect(page?.when?.(s)).toBe(true)
    s.shortcuts.music = false
    expect(page?.when?.(s)).toBe(false)
    expect<unknown>(desired(features, s, true, { www: true, music: true }, true)).toEqual(fixedScenario("shortcuts-music-off").registrations)
    expect(filesFor("music", s)).toEqual(fixedScenario("shortcuts-music-off").files.music)
  })

  test("Gather predicate requires its base switch and either page-dependent trigger", () => {
    const when = features.find(feature => feature.id === "gather")?.pages.www?.when
    const s = defaultSettings()
    s.gather.auto.count = true
    expect(when?.(s)).toBe(false)
    s.gather.on = true
    expect(when?.(s)).toBe(true)
    s.gather.auto.count = false
    s.gather.auto.unvisited = true
    expect(when?.(s)).toBe(false)
    s.gather.auto.background = true
    expect(when?.(s)).toBe(true)
  })

  test("card menu remains kit-free and no scenario eagerly loads popovers", () => {
    const s = defaultSettings()
    s.cardMenu.on = true
    expect(filesFor("www", s)).toEqual(["page-www.js", "core-www.js", "feature-card-menu.js"])
    for (const input of scenarios()) for (const site of sites) {
      expect(filesFor(site, input.settings)).not.toContain("popovers.js")
    }
  })

  test("each eager dependency appears once in stable planner order with detached lists", () => {
    const s = everything()
    for (const site of sites) {
      const list = filesFor(site, s)
      expect(list).toEqual(fixedScenario("everything").files[site])
      expect(new Set(list).size).toBe(list.length)
      list.reverse()
      expect(filesFor(site, s)).toEqual(fixedScenario("everything").files[site])
    }
  })

  test("Music actions retain all action dependencies and separate optional Undo jobs", () => {
    const actionJobs = {
      next: ["queueInsert", "queueMove", "castState"], queue: ["queueInsert", "queueMove", "castState"],
      save: ["account", "save"], like: ["account", "like"], remove: ["queueRemove", "castState"],
      library: ["account", "library"], mix: ["navigate", "castState"], album: ["navigate"], artist: ["navigate"]
    }
    for (const id of ["music-actions", "music-keys"] as const) {
      const health = healthFor(id).music
      expect<unknown>(health?.actions).toEqual(actionJobs)
      expect<unknown>(Object.keys(health?.actions ?? {})).toEqual(actionIds)
      expect(health?.required).toEqual(["itemInfo"])
      expect(health?.optional).toEqual(["membership", "unsave", "create", "accountLabel", "nowPlaying", "queueRemoveIds", "queueReinsert"])
    }
  })

  test("health jobs and anchor sites match the existing contract owners", () => {
    for (const feature of features) for (const site of sites) {
      const health = healthFor(feature.id)[site]
      if (!health) continue
      const jobs = [...health.required, ...health.optional, ...actionIds.flatMap(action => health.actions?.[action] ?? [])]
      for (const job of jobs) expect(supportsJob(site, job)).toBe(true)
      expect(new Set([...health.required, ...health.optional]).size).toBe(health.required.length + health.optional.length)
      for (const anchor of [...health.anchors, ...(health.optionalAnchors ?? [])]) expect(anchors[anchor].site).toBe(site)
    }
    expect(healthFor("browser-menu").www).toBeDefined()
    expect(healthFor("any-tab-keys").www).toBeDefined()
    expect(healthFor("any-tab-keys").music).toBeDefined()
    expect(healthFor("sync")).toEqual({})
    expect(healthFor("shortcuts").www?.optionalAnchors).toEqual(["www-cards"])
    expect(healthFor("music-actions").music?.optionalAnchors).toContain("music-player-bar")
  })

  test("real Registrar accepts the production registry and preserves fixed registration records", async () => {
    const fake = scriptedRegistrar({ registry: features, settings: everything() })
    const registrar = createRegistrar(fake.ports)
    try {
      await registrar.reconcile()
      const fixed = fixedScenario("everything").registrations
      const actual = [...fake.scripts.values()]
      expect<unknown>(actual).toEqual(fixed.map(script => ({
        ...script, css: [], excludeMatches: [], matchOriginAsFallback: false
      })))
      expect(fake.errors).toEqual([])
      const before = fake.mutations().length
      await registrar.reconcile()
      expect(fake.mutations()).toHaveLength(before)
      expect(actual).toEqual(desired(features, everything(), true, { www: true, music: true }, true).map(observedScript))
    } finally {
      registrar.dispose()
    }
    expect(fake.listenerCounts).toEqual([0, 0, 0])
  })

  test("only the page halves and their jobs files are named page-…, the files the Registrar injects into the page's world", () => {
    expect(Object.keys(pageLinkEntries(features)).filter(name => name.startsWith("page-")).sort())
      .toEqual(["page-jobs-music", "page-jobs-www", "page-music", "page-www"])
  })

  test("deterministic consumer emits the complete fixed registry and planner record", () => {
    expect<unknown>(registryRecord()).toEqual(expected)
    expect(registryRecord()).toEqual(registryRecord())
  })
})
