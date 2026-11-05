import { objectShape } from "./object-shape"
import { isThumbnailCorner } from "../model/validation"
import { isFirstRunFeature, type FirstRunFeature } from "./first-run"
import type { Settings } from "../model"
import type { featureSettings } from "../model/first-run-view"

export type FeatureSettingChange =
  | {
      [Feature in FirstRunFeature]: {
        readonly kind: "feature"
        readonly feature: Feature
        readonly value: Settings[(typeof featureSettings)[Feature]]["on"]
      }
    }[FirstRunFeature]
  | { readonly kind: "music-section"; readonly value: Settings["musicSection"] }
  | { readonly kind: "shortcuts-music"; readonly value: Settings["shortcuts"]["music"] }

export type FeatureSettingAnswer =
  | {
      readonly kind: "confirmed"
      readonly change: FeatureSettingChange
      readonly status: "changed" | "unchanged"
      readonly limitedMusic: boolean
      readonly conflicts: number
      readonly menuPermission: "unchanged" | "released"
    }
  | {
      readonly kind: "refused"
      readonly reason: "invalid" | "unavailable" | "site-access" | "browser-menu-permission" | "sync-full" | "update-needed" | "unconfirmed" | "rejected" | "permission-release"
    }

export function isFeatureSettingChange(raw: unknown): raw is FeatureSettingChange {
  return (
    objectShape(raw, { kind: v => v === "feature", feature: isFirstRunFeature, value: v => typeof v === "boolean" }) ||
    objectShape(raw, { kind: v => v === "music-section" || v === "shortcuts-music", value: v => typeof v === "boolean" })
  )
}

export function isFeatureSettingAnswer(raw: unknown): raw is FeatureSettingAnswer {
  return (
    objectShape(raw, {
      kind: v => v === "confirmed",
      change: isFeatureSettingChange,
      status: v => v === "changed" || v === "unchanged",
      limitedMusic: v => typeof v === "boolean",
      conflicts: v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0,
      menuPermission: v => v === "unchanged" || v === "released"
    }) ||
    objectShape(raw, {
      kind: v => v === "refused",
      reason: v =>
        typeof v === "string" && ["invalid", "unavailable", "site-access", "browser-menu-permission", "sync-full", "update-needed", "unconfirmed", "rejected", "permission-release"].includes(v)
    })
  )
}

export type SharedOptionValues = {
  readonly "autoAdd.feedback": Settings["autoAdd"]["feedback"]
  readonly "shortcuts.feedback": Settings["shortcuts"]["feedback"]
  readonly "quickSave.feedback": Settings["quickSave"]["feedback"]
  readonly "queueButton.feedback": Settings["queueButton"]["feedback"]
  readonly "queueButton.corner": Settings["queueButton"]["corner"]
  readonly "watchButton.feedback": Settings["watchButton"]["feedback"]
  readonly "browserMenu.feedback": Settings["browserMenu"]["feedback"]
  readonly "musicActions.feedback": Settings["musicActions"]["feedback"]
  readonly "musicKeys.feedback": Settings["musicKeys"]["feedback"]
  readonly "anyTabKeys.feedback": Settings["anyTabKeys"]["feedback"]
  readonly "gather.feedback": Settings["gather"]["feedback"]
  readonly "autoAdd.toolbarTick": Settings["autoAdd"]["toolbarTick"]
  readonly "autoAdd.toolbarPaused": Settings["autoAdd"]["toolbarPaused"]
  readonly "quickSave.shortsShelves": Settings["quickSave"]["shortsShelves"]
  readonly "watchButton.shorts": Settings["watchButton"]["shorts"]
  readonly "cardMenu.keepLinkMenu": Settings["cardMenu"]["keepLinkMenu"]
  readonly "musicActions.buttons.next": Settings["musicActions"]["buttons"]["next"]
  readonly "musicActions.buttons.queue": Settings["musicActions"]["buttons"]["queue"]
  readonly "musicActions.buttons.save": Settings["musicActions"]["buttons"]["save"]
  readonly "musicActions.buttons.like": Settings["musicActions"]["buttons"]["like"]
  readonly "musicActions.buttons.remove": Settings["musicActions"]["buttons"]["remove"]
  readonly "musicActions.buttons.library": Settings["musicActions"]["buttons"]["library"]
  readonly "musicActions.buttons.mix": Settings["musicActions"]["buttons"]["mix"]
  readonly "musicActions.buttons.album": Settings["musicActions"]["buttons"]["album"]
  readonly "musicActions.buttons.artist": Settings["musicActions"]["buttons"]["artist"]
  readonly "musicActions.buttons.bar": Settings["musicActions"]["buttons"]["bar"]
  readonly "gather.to": Settings["gather"]["to"]
  readonly "gather.order": Settings["gather"]["order"]
  readonly "gather.close": Settings["gather"]["close"]
  readonly "gather.auto.unvisited": Settings["gather"]["auto"]["unvisited"]
  readonly "gather.auto.background": Settings["gather"]["auto"]["background"]
  readonly "gather.auto.count": Settings["gather"]["auto"]["count"]
  readonly "gather.auto.after": Settings["gather"]["auto"]["after"]
  readonly "gather.auto.n": Settings["gather"]["auto"]["n"]
}

export type SharedOptionChange = {
  [Field in keyof SharedOptionValues]: {
    readonly kind: "option"
    readonly field: Field
    readonly value: SharedOptionValues[Field]
  }
}[keyof SharedOptionValues]

export type SharedSettingChange =
  | { readonly kind: "theme"; readonly value: Settings["theme"] }
  | { readonly kind: "default-percentage"; readonly value: Settings["autoAdd"]["pct"] }
  | SharedOptionChange

export type SharedSettingAnswer =
  | { readonly kind: "confirmed"; readonly change: SharedSettingChange; readonly status: "changed" | "unchanged" }
  | { readonly kind: "refused"; readonly reason: "invalid" | "unavailable" | "stale" | "sync-full" | "update-needed" | "unconfirmed" | "rejected" }

const boolean = (value: unknown) => typeof value === "boolean"
const optionChecks = {
  "autoAdd.feedback": boolean,
  "shortcuts.feedback": boolean,
  "quickSave.feedback": boolean,
  "queueButton.feedback": boolean,
  "queueButton.corner": isThumbnailCorner,
  "watchButton.feedback": boolean,
  "browserMenu.feedback": boolean,
  "musicActions.feedback": boolean,
  "musicKeys.feedback": boolean,
  "anyTabKeys.feedback": boolean,
  "gather.feedback": boolean,
  "autoAdd.toolbarTick": boolean,
  "autoAdd.toolbarPaused": boolean,
  "quickSave.shortsShelves": boolean,
  "watchButton.shorts": boolean,
  "cardMenu.keepLinkMenu": boolean,
  "musicActions.buttons.next": boolean,
  "musicActions.buttons.queue": boolean,
  "musicActions.buttons.save": boolean,
  "musicActions.buttons.like": boolean,
  "musicActions.buttons.remove": boolean,
  "musicActions.buttons.library": boolean,
  "musicActions.buttons.mix": boolean,
  "musicActions.buttons.album": boolean,
  "musicActions.buttons.artist": boolean,
  "musicActions.buttons.bar": boolean,
  "gather.to": v => v === "player" || v === "queue" || v === "playlist",
  "gather.order": v => typeof v === "string" && ["newest", "oldest", "english", "non-english", "left-to-right", "right-to-left", "shuffled"].includes(v),
  "gather.close": boolean,
  "gather.auto.unvisited": boolean,
  "gather.auto.background": boolean,
  "gather.auto.count": boolean,
  "gather.auto.after": v => v === "1h" || v === "1d" || v === "1w",
  "gather.auto.n": v => v === 5 || v === 10 || v === 15 || v === 20 || v === 30 || v === 50
} satisfies Record<keyof SharedOptionValues, (value: unknown) => boolean>

export function isSharedSettingChange(raw: unknown): raw is SharedSettingChange {
  if (objectShape(raw, { kind: v => v === "theme", value: v => v === "system" || v === "light" || v === "dark" })) return true
  if (objectShape(raw, { kind: v => v === "default-percentage", value: v => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 })) return true
  return Object.entries(optionChecks).some(([field, check]) => objectShape(raw, { kind: v => v === "option", field: v => v === field, value: check }))
}
export function isSharedSettingAnswer(raw: unknown): raw is SharedSettingAnswer {
  return (
    objectShape(raw, { kind: v => v === "confirmed", change: isSharedSettingChange, status: v => v === "changed" || v === "unchanged" }) ||
    objectShape(raw, { kind: v => v === "refused", reason: v => typeof v === "string" && ["invalid", "unavailable", "stale", "sync-full", "update-needed", "unconfirmed", "rejected"].includes(v) })
  )
}
