import type { UserManifest, WxtHooks } from "wxt"

export type ManifestTarget = { readonly browser: string; readonly mode: string }

export const geckoId = "{cc70cd21-2cc6-444b-bd89-496909346091}"
export const betaUpdateUrl = "https://alioun.github.io/yt-playlist-tools/beta/updates.json"
export const keysFromAnyTab = ["save-playing-song", "like-playing-song", "watch-later-current-video"] as const

const commandMessages = {
  "save-playing-song": "__MSG_command_savePlayingSong__",
  "like-playing-song": "__MSG_command_likePlayingSong__",
  "watch-later-current-video": "__MSG_command_watchLaterCurrentVideo__"
} as const satisfies Record<(typeof keysFromAnyTab)[number], string>

/** The 2.0 manifest (ARC-MAN-01, G21). WXT adds `version`, `background`, `action.default_popup` and `options_ui`. */
export function perchlingManifest({ browser, mode }: ManifestTarget): UserManifest {
  const firefox = browser === "firefox"
  return {
    default_locale: "en",
    name: "__MSG_extName__",
    short_name: "__MSG_extShortName__",
    description: "__MSG_extDescription__",
    icons: firefox
      ? { 16: "brand/icon-16.png", 32: "brand/icon-32.png", 48: "brand/icon-48.png", 96: "brand/icon-96.png", 128: "brand/icon-128.png" }
      : { 16: "brand/icon-16.png", 32: "brand/icon-32.png", 48: "brand/icon-48.png", 128: "brand/store-128.png" },
    // Firefox's optional_permissions schema rejects contextMenus and drops the entry, so the Firefox build requires it.
    permissions: firefox ? ["storage", "scripting", "contextMenus"] : ["storage", "scripting"],
    host_permissions: ["https://www.youtube.com/*"],
    optional_host_permissions: ["https://music.youtube.com/*"],
    ...(!firefox && { optional_permissions: ["contextMenus"] }),
    action: {
      default_title: "__MSG_actionTitle__",
      default_icon: { 16: "brand/icon-16.png", 24: "brand/icon-24.png", 32: "brand/icon-32.png" }
    },
    commands: {
      _execute_action: {},
      ...Object.fromEntries(keysFromAnyTab.map(name => [name, { description: commandMessages[name] }]))
    },
    ...(firefox
      ? {
          browser_specific_settings: {
            gecko: {
              id: geckoId,
              strict_min_version: "140.0",
              data_collection_permissions: { required: ["none"] },
              // AMO rejects update_url in listed versions, so only beta builds carry it (REL-CI-10, ADR-0011).
              ...(mode === "beta" && { update_url: betaUpdateUrl })
            }
          }
        }
      : { minimum_chrome_version: "121" })
  }
}

/** WXT copies the popup's `<title>` into `action.default_title`; the manifest keeps its localized title instead. */
export const keepActionTitle: WxtHooks["build:manifestGenerated"] = (_wxt, manifest) => {
  if ("action" in manifest && manifest.action) manifest.action.default_title = "__MSG_actionTitle__"
}
