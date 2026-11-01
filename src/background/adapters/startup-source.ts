import type { HistoricalFact } from "../store/interim-conversion"
import {
  hasInterimEvidence, interimConversionKey, isInterimCanonicalKey, isInterimSourceKey,
  type InterimPersistenceSnapshot, type StoreStartupHost
} from "../store/interim-persistence"
import { LEGACY_DELETE_KEYS, type LegacyEvidence } from "../store/legacy"
import type { StartupHost } from "../store/legacy-execution"
import type { StartupSnapshot } from "../store/legacy-startup"

export type SanitizedStartupInventory = {
  readonly presentLocalKeys: readonly string[]
  readonly values: Readonly<Record<string, unknown>>
  readonly legacyAuthorization:
    | { readonly kind: "observed"; readonly refreshTokenWasNonempty: boolean }
    | { readonly kind: "unavailable" }
  readonly historicalAuthorization: HistoricalFact
  readonly priorCredentialPresence: HistoricalFact
}

export type StartupSourceRefusalCode =
  | "structure" | "accessor" | "duplicate-name" | "forbidden-value" | "absent-name" | "incomplete"
  | "authorization-contradiction" | "authorization-unavailable"

export class StartupSourceRefusal extends Error {
  constructor(readonly code: StartupSourceRefusalCode) {
    super(`Startup source refused: ${code}`)
    this.name = "StartupSourceRefusal"
  }
}

type LegacyValueKey = keyof LegacyEvidence["values"]
const legacyValueKeys = Object.keys({
  playlists: 0, addToPlaylistID: 0, watchLaterShortcut: 0, requiredWatchPercentage: 0, toastEnabled: 0, channelFilters: 0, channelLabels: 0
} satisfies Record<LegacyValueKey, 0>) as LegacyValueKey[]

export function isStartupValueKey(name: string): boolean {
  return isInterimSourceKey(name) || isInterimCanonicalKey(name) || name === interimConversionKey
}

function refuse(code: StartupSourceRefusalCode): never {
  throw new StartupSourceRefusal(code)
}

function data(raw: object, key: string | symbol): unknown {
  if (typeof key !== "string") refuse("structure")
  const descriptor = Object.getOwnPropertyDescriptor(raw, key)!
  if (!("value" in descriptor)) refuse("accessor")
  if (!descriptor.enumerable) refuse("structure")
  return descriptor.value
}

function container(raw: object): object {
  const prototype: unknown = Object.getPrototypeOf(raw)
  if (Array.isArray(raw)) {
    if (prototype !== Array.prototype) refuse("structure")
    return new Array(Object.getOwnPropertyDescriptor(raw, "length")?.value)
  }
  if (prototype !== Object.prototype && prototype !== null) refuse("structure")
  return prototype === null ? Object.create(null) : {}
}

function detach(raw: unknown): unknown {
  if (typeof raw === "function") refuse("structure")
  if (raw === null || typeof raw !== "object") return raw
  const root = container(raw)
  const pending: ({ readonly source: object; readonly target: object } | { readonly leave: object })[] = [{ source: raw, target: root }]
  const ancestors = new Set<object>()
  while (pending.length > 0) {
    const visit = pending.pop()!
    if ("leave" in visit) { ancestors.delete(visit.leave); continue }
    const { source, target } = visit
    if (ancestors.has(source)) refuse("structure")
    ancestors.add(source)
    pending.push({ leave: source })
    for (const key of Reflect.ownKeys(source)) {
      if (Array.isArray(source) && key === "length") continue
      const value = data(source, key)
      if (typeof value === "function") refuse("structure")
      const child = value !== null && typeof value === "object" ? container(value) : value
      Object.defineProperty(target, key, { value: child, enumerable: true, writable: true, configurable: true })
      if (child !== value) pending.push({ source: value as object, target: child as object })
    }
  }
  return root
}

function record(raw: unknown, names: readonly string[]): ReadonlyMap<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) refuse("structure")
  const prototype: unknown = Object.getPrototypeOf(raw)
  if (prototype !== Object.prototype && prototype !== null) refuse("structure")
  const found = new Map<string, unknown>()
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== "string" || !names.includes(key)) refuse("structure")
    found.set(key, data(raw, key))
  }
  if (found.size !== names.length) refuse("structure")
  return found
}

function tag(raw: unknown): unknown {
  return raw !== null && typeof raw === "object" && Object.hasOwn(raw, "kind") ? data(raw, "kind") : undefined
}

function fact(raw: unknown): HistoricalFact {
  const kind = tag(raw)
  if (kind === "unknown") { record(raw, ["kind"]); return { kind } }
  if (kind !== "known") refuse("structure")
  const value = record(raw, ["kind", "value"]).get("value")
  if (typeof value !== "boolean") refuse("structure")
  return { kind, value }
}

function authorization(raw: unknown): SanitizedStartupInventory["legacyAuthorization"] {
  const kind = tag(raw)
  if (kind === "unavailable") { record(raw, ["kind"]); return { kind } }
  if (kind !== "observed") refuse("structure")
  const refreshTokenWasNonempty = record(raw, ["kind", "refreshTokenWasNonempty"]).get("refreshTokenWasNonempty")
  if (typeof refreshTokenWasNonempty !== "boolean") refuse("structure")
  return { kind, refreshTokenWasNonempty }
}

type Observation = {
  readonly names: readonly string[]
  readonly values: ReadonlyMap<string, unknown>
  readonly legacyAuthorization: SanitizedStartupInventory["legacyAuthorization"]
  readonly historicalAuthorization: HistoricalFact
  readonly priorCredentialPresence: HistoricalFact
}

function observe(raw: SanitizedStartupInventory): Observation {
  const inventory = record(raw, ["presentLocalKeys", "values", "legacyAuthorization", "historicalAuthorization", "priorCredentialPresence"])
  const names = detach(inventory.get("presentLocalKeys"))
  if (!Array.isArray(names) || Reflect.ownKeys(names).length !== names.length + 1) refuse("structure")
  for (let index = 0; index < names.length; index++) if (typeof names[index] !== "string") refuse("structure")
  const present = new Set<string>(names)
  if (present.size !== names.length) refuse("duplicate-name")
  const supplied = inventory.get("values")
  if (supplied === null || typeof supplied !== "object" || Array.isArray(supplied)) refuse("structure")
  const prototype: unknown = Object.getPrototypeOf(supplied)
  if (prototype !== Object.prototype && prototype !== null) refuse("structure")
  const observedValues = new Map<string, unknown>()
  for (const key of Reflect.ownKeys(supplied)) {
    if (typeof key !== "string") refuse("structure")
    if (!isStartupValueKey(key)) refuse("forbidden-value")
    if (!present.has(key)) refuse("absent-name")
    observedValues.set(key, data(supplied, key))
  }
  const values = new Map<string, unknown>()
  for (const name of present) {
    if (!isStartupValueKey(name)) continue
    if (!observedValues.has(name)) refuse("incomplete")
    values.set(name, detach(observedValues.get(name)))
  }
  const legacyAuthorization = authorization(inventory.get("legacyAuthorization"))
  if (legacyAuthorization.kind === "observed" && legacyAuthorization.refreshTokenWasNonempty && !present.has("refreshToken")) {
    refuse("authorization-contradiction")
  }
  return { names: [...present], values, legacyAuthorization,
    historicalAuthorization: fact(inventory.get("historicalAuthorization")), priorCredentialPresence: fact(inventory.get("priorCredentialPresence")) }
}

function selected(observation: Observation, keep: (name: string) => boolean): Record<string, unknown> {
  const map: Record<string, unknown> = {}
  for (const name of observation.names) {
    if (keep(name)) Object.defineProperty(map, name, { value: observation.values.get(name), enumerable: true, writable: true, configurable: true })
  }
  return map
}

export function projectInterimSnapshot(inventory: SanitizedStartupInventory): InterimPersistenceSnapshot {
  const observation = observe(inventory)
  return { source: selected(observation, isInterimSourceKey), canonical: selected(observation, isInterimCanonicalKey),
    checkpoint: observation.values.has(interimConversionKey) ? { kind: "present", value: observation.values.get(interimConversionKey) } : { kind: "absent" },
    historicalAuthorization: observation.historicalAuthorization, priorCredentialPresence: observation.priorCredentialPresence }
}

function projectStartupSnapshot(inventory: SanitizedStartupInventory): StartupSnapshot {
  const { names, values, legacyAuthorization } = observe(inventory)
  if (legacyAuthorization.kind === "unavailable") refuse("authorization-unavailable")
  const legacyValues: LegacyEvidence["values"] = {}
  for (const key of legacyValueKeys) if (values.has(key)) legacyValues[key] = values.get(key)
  return { schema: values.get("schema"), device: values.get("device"), settingsDocument: values.get("doc:settings"), unclaimed: values.get("unclaimed"),
    legacy: { presentKeys: LEGACY_DELETE_KEYS.filter(key => names.includes(key)), values: legacyValues, refreshTokenWasNonempty: legacyAuthorization.refreshTokenWasNonempty },
    interimKeysPresent: names.filter(name => hasInterimEvidence({ [name]: true })) }
}

export function createStoreStartupHost(deps: {
  readonly context: StartupHost["context"]
  readonly source: { readInventory(): Promise<SanitizedStartupInventory> }
  readonly cleanup: Pick<StartupHost, "removeLocal" | "deleteDatabase" | "removeSession">
}): StoreStartupHost {
  const { source, cleanup } = deps
  return {
    context: detach(deps.context) as StartupHost["context"],
    async readSnapshot() { return projectStartupSnapshot(await source.readInventory()) },
    async readInterimSnapshot() { return projectInterimSnapshot(await source.readInventory()) },
    async removeLocal(keys) { await cleanup.removeLocal(keys) },
    async deleteDatabase(name) { await cleanup.deleteDatabase(name) },
    async removeSession(keys) { await cleanup.removeSession(keys) }
  }
}
