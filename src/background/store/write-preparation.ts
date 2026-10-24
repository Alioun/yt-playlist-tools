import {
  DecodeError, decodeFilter, decodeSettings, decodeSetup,
  normalizeFilterForWrite, normalizeSettingsForWrite, normalizeSetupForWrite,
  type Filter, type MusicAction, type Settings, type Setup, type SetupContext
} from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"

type Snapshot<T> = T extends object
  ? { readonly [P in keyof T]: Snapshot<T[P]> }
  : T

export type PrepareBodyInput =
  | { readonly kind: "settings"; readonly data: Snapshot<Settings> }
  | {
    readonly kind: "setup"
    readonly data: Snapshot<Setup>
    readonly context: Readonly<Required<SetupContext>>
  }
  | { readonly kind: "filter"; readonly data: Snapshot<Filter> }

export type PrepareBodyResult =
  | { kind: "prepared"; data: JsonObject }
  | { kind: "invalid"; reason: "json" | "shape" }

export type MaterializeBodyInput =
  | Omit<Extract<PrepareBodyInput, { kind: "setup" }>, "context">
  | Exclude<PrepareBodyInput, { kind: "setup" }>

const invalidJson = Symbol("invalid JSON representation")
const musicKeyNames = {
  next: true, queue: true, save: true, like: true, remove: true,
  library: true, mix: true, album: true, artist: true, picker: true
} satisfies Record<MusicAction | "picker", true>

function copyRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw invalidJson
  const copy: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) throw invalidJson
    copy[key] = descriptor.value
  }
  return copy
}

function copyArray(value: unknown, handleSlot = false): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (Object.getPrototypeOf(value) !== Array.prototype) throw invalidJson
  const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value
  if (typeof length !== "number") throw invalidJson
  const copy: unknown[] = []
  copy.length = length
  let count = 0
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) throw invalidJson
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) throw invalidJson
    Object.defineProperty(copy, key, { value: descriptor.value, enumerable: true, writable: true, configurable: true })
    count++
  }
  const missingHandle = handleSlot && length >= 3 && !Object.hasOwn(copy, "2")
  if (count !== length - (missingHandle ? 1 : 0)) throw invalidJson
  if (handleSlot && length >= 3 && (!Object.hasOwn(copy, "2") || copy[2] === undefined)) {
    if (length === 3) copy.length = 2
    else Object.defineProperty(copy, "2", { value: null, enumerable: true, writable: true, configurable: true })
  }
  return copy
}

function materializeKey(value: unknown): unknown {
  const key = copyRecord(value)
  if (!key) return value
  if (key.char === undefined) delete key.char
  return key
}

function materialize(kind: PrepareBodyInput["kind"], value: unknown): unknown {
  const body = copyRecord(value)
  if (!body) return value
  switch (kind) {
    case "settings": {
      if (Object.hasOwn(body, "undoKey")) body.undoKey = materializeKey(body.undoKey)
      const shortcuts = copyRecord(body.shortcuts)
      if (shortcuts) {
        if (Object.hasOwn(shortcuts, "picker")) shortcuts.picker = materializeKey(shortcuts.picker)
        const list = copyArray(shortcuts.list)
        if (list) {
          for (let index = 0; index < list.length; index++) {
            const shortcut = copyRecord(list[index])
            if (!shortcut) continue
            if (Object.hasOwn(shortcut, "key")) shortcut.key = materializeKey(shortcut.key)
            list[index] = shortcut
          }
          shortcuts.list = list
        }
        body.shortcuts = shortcuts
      }
      const musicKeys = copyRecord(body.musicKeys)
      if (musicKeys) {
        const keys = copyRecord(musicKeys.keys)
        if (keys) {
          for (const action of Object.keys(musicKeyNames)) {
            if (Object.hasOwn(keys, action)) keys[action] = materializeKey(keys[action])
          }
          musicKeys.keys = keys
        }
        body.musicKeys = musicKeys
      }
      break
    }
    case "setup": {
      const label = copyRecord(body.label)
      if (label) {
        if (label.handle === undefined) delete label.handle
        if (label.avatar === undefined) delete label.avatar
        body.label = label
      }
      const autoAdd = copyArray(body.autoAdd)
      if (autoAdd) {
        for (let index = 0; index < autoAdd.length; index++) {
          const entry = copyRecord(autoAdd[index])
          if (!entry) continue
          if (entry.pct === undefined) delete entry.pct
          autoAdd[index] = entry
        }
        body.autoAdd = autoAdd
      }
      break
    }
    case "filter": {
      const channels = copyArray(body.channels)
      if (channels) {
        for (let index = 0; index < channels.length; index++) {
          const row = copyArray(channels[index], true)
          if (row) channels[index] = row
        }
        body.channels = channels
      }
      break
    }
  }
  return body
}

function isJsonObject(value: unknown): value is JsonObject {
  return isJsonValue(value) && value !== null && typeof value === "object" && !Array.isArray(value)
}

export function materializeDocumentBody(input: MaterializeBodyInput): PrepareBodyResult {
  if (input.data === null || typeof input.data !== "object" || Array.isArray(input.data)) return { kind: "invalid", reason: "shape" }
  const prototype: unknown = Object.getPrototypeOf(input.data)
  if (prototype !== Object.prototype && prototype !== null) return { kind: "invalid", reason: "shape" }
  try {
    const candidate = materialize(input.kind, input.data)
    if (!isJsonObject(candidate)) return { kind: "invalid", reason: "json" }
    if (Object.keys(Object.prototype).length > 0) return { kind: "invalid", reason: "shape" }
    return { kind: "prepared", data: candidate }
  } catch (error) {
    if (error === invalidJson) return { kind: "invalid", reason: "json" }
    throw error
  }
}

export function prepareDocumentBody(input: PrepareBodyInput): PrepareBodyResult {
  const candidate = materializeDocumentBody(input)
  if (candidate.kind !== "prepared") return candidate
  try {
    switch (input.kind) {
      case "settings": return materializeDocumentBody({ kind: "settings", data: normalizeSettingsForWrite(decodeSettings(candidate.data)) })
      case "setup": return materializeDocumentBody({ kind: "setup", data: normalizeSetupForWrite(decodeSetup(candidate.data), input.context) })
      case "filter": return materializeDocumentBody({ kind: "filter", data: normalizeFilterForWrite(decodeFilter(candidate.data)) })
    }
  } catch (error) {
    if (error === invalidJson) return { kind: "invalid", reason: "json" }
    if (error instanceof DecodeError) return { kind: "invalid", reason: "shape" }
    throw error
  }
}
