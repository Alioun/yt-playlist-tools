import type { FeatureId, JobId, Site } from "../contracts/vocabulary"
import type { MusicAction, Settings } from "../model/types"
import { desired, popoversBundle, siteBundles, type RegistrationFeature } from "./registration"

export type Footprint = "none" | "keys-only" | "adds-buttons" | "changes-right-click"
export type Library = NonNullable<RegistrationFeature["pages"][Site]>["needs"][number]

export const anchors = {
  "www-cards": { site: "www" },
  "www-watch-actions": { site: "www" },
  "music-items": { site: "music" },
  "music-headers": { site: "music" },
  "music-player-bar": { site: "music" }
} as const satisfies Record<string, { readonly site: Site }>
export type AnchorId = keyof typeof anchors

export type HealthDependencies = {
  readonly required: readonly JobId[]
  readonly optional: readonly JobId[]
  readonly anchors: readonly AnchorId[]
  readonly optionalAnchors?: readonly AnchorId[]
  readonly actions?: Readonly<Partial<Record<MusicAction, readonly JobId[]>>>
}
export type FeatureHealth = Readonly<Partial<Record<Site, HealthDependencies>>>
export type FeatureDef = RegistrationFeature & {
  readonly footprint: Footprint
  readonly health: FeatureHealth
}

const musicActionJobs = {
  next: ["queueInsert", "queueMove", "castState"],
  queue: ["queueInsert", "queueMove", "castState"],
  save: ["account", "save"],
  like: ["account", "like"],
  remove: ["queueRemove", "castState"],
  library: ["account", "library"],
  mix: ["navigate", "castState"],
  album: ["navigate"],
  artist: ["navigate"]
} as const satisfies Readonly<Record<MusicAction, readonly JobId[]>>

export const features: readonly FeatureDef[] = [
  {
    id: "auto-add",
    setting: "autoAdd",
    footprint: "none",
    pages: { www: { file: "feature-auto-add", needs: ["kit"] } },
    health: {
      www: {
        required: ["account", "membership", "add"],
        optional: ["remove", "channelOf", "accountLabel"],
        anchors: []
      }
    }
  },
  {
    id: "shortcuts",
    setting: "shortcuts",
    footprint: "keys-only",
    pages: {
      www: { file: "feature-shortcuts-www", needs: ["kit"], lazy: "popovers" },
      music: { file: "feature-shortcuts-music", needs: ["kit"], lazy: "popovers", when: s => s.shortcuts.music }
    },
    health: {
      www: {
        required: ["account", "add"],
        optional: ["membership", "remove", "create", "videoInfo", "accountLabel"],
        anchors: [],
        optionalAnchors: ["www-cards"]
      },
      music: {
        required: ["account", "save"],
        optional: ["membership", "unsave", "create", "itemInfo", "nowPlaying", "accountLabel"],
        anchors: [],
        optionalAnchors: ["music-items"]
      }
    }
  },
  {
    id: "quick-save",
    setting: "quickSave",
    footprint: "adds-buttons",
    pages: { www: { file: "feature-quick-save", needs: ["kit"], lazy: "popovers" } },
    health: {
      www: {
        required: ["account", "add"],
        optional: ["membership", "remove", "create", "accountLabel"],
        anchors: ["www-cards"]
      }
    }
  },
  {
    id: "queue-button",
    setting: "queueButton",
    footprint: "adds-buttons",
    pages: { www: { file: "feature-queue-button", needs: ["kit"] } },
    health: { www: { required: ["queueAdd"], optional: ["queueUndo"], anchors: ["www-cards"] } }
  },
  {
    id: "watch-button",
    setting: "watchButton",
    footprint: "adds-buttons",
    pages: { www: { file: "feature-watch-button", needs: ["kit"], lazy: "popovers" } },
    health: {
      www: {
        required: [],
        optional: ["account", "membership", "add", "remove", "create", "channelOf", "videoInfo", "accountLabel"],
        anchors: ["www-watch-actions"]
      }
    }
  },
  {
    id: "card-menu",
    setting: "cardMenu",
    footprint: "changes-right-click",
    pages: { www: { file: "feature-card-menu", needs: [] } },
    health: { www: { required: ["openCardMenu"], optional: [], anchors: ["www-cards"] } }
  },
  {
    id: "browser-menu",
    setting: "browserMenu",
    footprint: "none",
    pages: {},
    health: {
      www: {
        required: ["account", "add"],
        optional: ["membership", "remove", "create", "videoInfo", "accountLabel"],
        anchors: []
      }
    }
  },
  {
    id: "gather",
    setting: "gather",
    footprint: "none",
    pages: {
      www: {
        needs: [],
        matches: ["https://www.youtube.com/watch*", "https://www.youtube.com/live/*"],
        when: s => s.gather.on && (s.gather.auto.background || s.gather.auto.count)
      }
    },
    health: { www: { required: [], optional: ["queueAddList", "membership", "addBatch", "removeBatch"], anchors: [] } }
  },
  {
    id: "music-actions",
    setting: "musicActions",
    footprint: "adds-buttons",
    pages: { music: { file: "feature-music-actions", needs: ["kit"], lazy: "popovers" } },
    health: {
      music: {
        required: ["itemInfo"],
        optional: ["membership", "unsave", "create", "accountLabel", "nowPlaying", "queueRemoveIds", "queueReinsert"],
        anchors: [],
        optionalAnchors: ["music-items", "music-headers", "music-player-bar"],
        actions: musicActionJobs
      }
    }
  },
  {
    id: "music-keys",
    setting: "musicKeys",
    footprint: "keys-only",
    pages: { music: { file: "feature-music-keys", needs: ["kit"], lazy: "popovers" } },
    health: {
      music: {
        required: ["itemInfo"],
        optional: ["membership", "unsave", "create", "accountLabel", "nowPlaying", "queueRemoveIds", "queueReinsert"],
        anchors: [],
        optionalAnchors: ["music-items"],
        actions: musicActionJobs
      }
    }
  },
  {
    id: "any-tab-keys",
    setting: "anyTabKeys",
    footprint: "keys-only",
    pages: {},
    health: {
      www: {
        required: ["account", "videoInfo", "add"],
        optional: ["membership", "remove", "accountLabel"],
        anchors: []
      },
      music: {
        required: ["nowPlaying"],
        optional: ["membership", "unsave", "accountLabel"],
        anchors: [],
        actions: { save: ["account", "save"], like: ["account", "itemInfo", "like"] }
      }
    }
  },
  { id: "sync", setting: "device.syncOn", footprint: "none", pages: {}, health: {} }
]

export const libraries = { sites: siteBundles, popovers: popoversBundle } as const

/** Eager .js files, MAIN then ISOLATED, with each dependency once. Access is decided by the caller. */
export function filesFor(site: Site, settings: Settings): string[] {
  return desired(features, settings, true, { www: true, music: true }, true)
    .filter(script => script.id === `pp-${site}-page` || script.id === `pp-${site}`)
    .flatMap(script => script.js)
}

export function healthFor(id: FeatureId): FeatureHealth {
  const feature = features.find(feature => feature.id === id)
  if (!feature) throw Error(`Missing feature registry entry ${id}`)
  return feature.health
}
