import { isRecord } from "../model/codec"
import type { AccountLabel, AutoAddPlaylist, Filter, Key, Settings, Setup, Shortcut } from "../model"

type Shape =
  | { readonly kind: "value" }
  | { readonly kind: "object"; readonly fields: Readonly<Record<string, Shape>> }
  | { readonly kind: "list" | "dictionary" | "nullable" | "optional"; readonly item: Shape }
  | { readonly kind: "channel" }

const value: Shape = { kind: "value" }
const nullable = (item: Shape): Shape => ({ kind: "nullable", item })
const optional = (item: Shape): Shape => ({ kind: "optional", item })
const list = (item: Shape): Shape => ({ kind: "list", item })
const dictionary = (item: Shape): Shape => ({ kind: "dictionary", item })
const fields = <T extends object>(members: { readonly [P in keyof T]-?: Shape }): Shape => ({ kind: "object", fields: members })

const key = nullable(fields<Key>({ char: optional(value), code: value, ctrl: value, alt: value, shift: value, meta: value }))
const shortcut = fields<Shortcut>({ id: value, key, label: value, watchLaterOnEveryAccount: value })

export const settingsShape = fields<Settings>({
  theme: value,
  undoKey: key,
  autoAdd: fields<Settings["autoAdd"]>({ on: value, feedback: value, pct: value, toolbarTick: value, toolbarPaused: value }),
  shortcuts: fields<Settings["shortcuts"]>({ on: value, feedback: value, music: value, preset: value, picker: key, list: list(shortcut) }),
  quickSave: fields<Settings["quickSave"]>({ on: value, feedback: value, shortsShelves: value }),
  queueButton: fields<Settings["queueButton"]>({ on: value, feedback: value }),
  watchButton: fields<Settings["watchButton"]>({ on: value, feedback: value, shorts: value }),
  cardMenu: fields<Settings["cardMenu"]>({ on: value, keepLinkMenu: value }),
  browserMenu: fields<Settings["browserMenu"]>({ on: value, feedback: value }),
  musicSection: value,
  musicActions: fields<Settings["musicActions"]>({
    on: value,
    feedback: value,
    preset: value,
    buttons: fields<Settings["musicActions"]["buttons"]>({ next: value, queue: value, save: value, like: value, remove: value, bar: value, library: value, mix: value, album: value, artist: value })
  }),
  musicKeys: fields<Settings["musicKeys"]>({
    on: value,
    feedback: value,
    preset: value,
    keys: fields<Settings["musicKeys"]["keys"]>({ next: key, queue: key, save: key, picker: key, like: key, remove: key, library: key, mix: key, album: key, artist: key })
  }),
  anyTabKeys: fields<Settings["anyTabKeys"]>({ on: value, feedback: value }),
  gather: fields<Settings["gather"]>({
    on: value,
    feedback: value,
    to: value,
    order: value,
    close: value,
    auto: fields<Settings["gather"]["auto"]>({ unvisited: value, after: value, background: value, count: value, n: value })
  })
})

export const setupShape = fields<Setup>({
  label: nullable(fields<AccountLabel>({ name: value, handle: optional(value), avatar: optional(value) })),
  autoAdd: list(fields<AutoAddPlaylist>({ pl: value, takes: value, pct: optional(value) })),
  targets: dictionary(value),
  quickSave: value,
  musicSave: value,
  gather: value,
  marks: dictionary(value)
})

export const filterShape = fields<Filter>({ mode: value, on: value, channels: list({ kind: "channel" }) })

export function unsafeKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype"
}

function malformed(): never {
  throw new TypeError("settings-file-shape")
}

// The canonical codecs own values. This projection owns file completeness and allowed fields.
export function project(shape: Shape, raw: unknown, strict: boolean): unknown {
  switch (shape.kind) {
    case "value":
      return raw
    case "nullable":
      return raw === null ? null : project(shape.item, raw, strict)
    case "optional":
      return raw === undefined ? undefined : project(shape.item, raw, strict)
    case "channel": {
      if (!Array.isArray(raw) || raw.length < 2 || (strict && raw.length > 3)) return malformed()
      // Stored columns past the handle come from a newer version and stay out of format 1, with an empty handle slot before them.
      return raw.length === 2 || (raw.length > 3 && raw[2] == null) ? [raw[0], raw[1]] : [raw[0], raw[1], raw[2]]
    }
    case "list": {
      if (!Array.isArray(raw)) return malformed()
      return Array.from(raw, (entry: unknown) => project(shape.item, entry, strict))
    }
    case "dictionary": {
      if (!isRecord(raw)) return malformed()
      return Object.fromEntries(
        Object.keys(raw)
          .sort()
          .map(key => {
            if (unsafeKey(key)) return malformed()
            return [key, project(shape.item, raw[key], strict)]
          })
      )
    }
    case "object": {
      if (!isRecord(raw)) return malformed()
      if (strict && Object.keys(raw).some(key => !Object.hasOwn(shape.fields, key))) return malformed()
      return Object.fromEntries(
        Object.entries(shape.fields).map(([key, child]) => {
          if (child.kind !== "optional" && (!Object.hasOwn(raw, key) || raw[key] === undefined)) return malformed()
          return [key, project(child, raw[key], strict)]
        })
      )
    }
  }
}
