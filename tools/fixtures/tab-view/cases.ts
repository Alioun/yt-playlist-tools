import { defaultSettings, defaultSetup, isAccountKey, isPlaylistId, isVideoId } from "../../../src/shared/model"
import type { Site } from "../../../src/shared/contracts/vocabulary"
import { isTabView, type TabView } from "../../../src/shared/contracts/tab-view"
import { checked, build } from "../page-link/support"

export const account = checked(isAccountKey, "AAAAAAAAAAAAAAAA")
export const playlist = checked(isPlaylistId, "PL_alpha")
export const video = checked(isVideoId, "aaaaaaaaaaa")
export function wireView(site: Site = "www", signedIn = true, privateWindow = false): TabView {
  const settings = defaultSettings()
  settings.shortcuts.picker = settings.undoKey
  settings.shortcuts.list = [{ id: "orig01", key: settings.undoKey, label: "Alpha", watchLaterOnEveryAccount: false }]
  for (const name of ["next", "queue", "save", "picker", "like", "remove", "library", "mix", "album", "artist"] as const) settings.musicKeys.keys[name] = settings.undoKey
  const options =
    site === "www"
      ? [
          { id: "auto-add", options: { ...settings.autoAdd, on: true } },
          { id: "shortcuts", options: { ...settings.shortcuts, on: true } },
          { id: "quick-save", options: { ...settings.quickSave, on: true } },
          { id: "queue-button", options: { ...settings.queueButton, on: true } },
          { id: "watch-button", options: { ...settings.watchButton, on: true } },
          { id: "card-menu", options: { ...settings.cardMenu, on: true } },
          { id: "gather", options: { ...settings.gather, on: true, auto: { ...settings.gather.auto, background: true } } }
        ]
      : [
          { id: "shortcuts", options: { ...settings.shortcuts, on: true } },
          { id: "music-actions", options: { ...settings.musicActions, on: true } },
          { id: "music-keys", options: { ...settings.musicKeys, on: true } }
        ]
  const value: unknown = {
    site,
    build,
    private: privateWindow,
    pickerSortAZ: true,
    paused: false,
    undoKey: settings.undoKey,
    features: options,
    statuses: options.map(feature => ({ feature: feature.id, state: "working", jobs: [], anchors: [], actions: [], kinds: [] })),
    notices: [],
    ...(signedIn
      ? {
          signedIn: true,
          acct: account,
          setup: {
            kind: "live",
            setup: {
              ...defaultSetup(),
              label: { name: "Alpha", handle: "@alpha", avatar: "https://example.invalid/avatar" },
              autoAdd: [{ pl: playlist, takes: "both", pct: 25 }],
              targets: { orig01: playlist },
              quickSave: playlist,
              musicSave: playlist,
              gather: playlist,
              marks: { [playlist]: "missing" }
            }
          },
          filters: [
            {
              playlist,
              state: {
                kind: "value",
                filter: {
                  mode: "allow",
                  on: true,
                  channels: [
                    ["UCAAAAAAAAAAAAAAAAAAAAAA", "Alpha", "@alpha"],
                    ["UCBBBBBBBBBBBBBBBBBBBBBB", "Beta"]
                  ]
                }
              }
            },
            { playlist: "PL_default", state: { kind: "default", filter: { mode: "deny", on: false, channels: [] } } }
          ],
          skips: {
            kind: privateWindow ? "private" : "normal",
            entries: [
              [video, [playlist]],
              ["bbbbbbbbbbb", "all"]
            ]
          }
        }
      : { signedIn: false, acct: null, setup: null, filters: [], skips: null })
  }
  return checked(isTabView, value)
}
