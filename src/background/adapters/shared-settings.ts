import type { FeatureAccess } from "../store/feature-settings"
import { nativeFirstRunAccess } from "./first-run"
type NativeBrowser = typeof import("wxt/browser").browser
export type SharedSettingsPermissionPort = Pick<NativeBrowser["permissions"], "contains" | "remove">

export function nativeSharedSettingsAccess(permissions: SharedSettingsPermissionPort, menuOptional: boolean): FeatureAccess {
  return {
    read: nativeFirstRunAccess(permissions),
    async releaseBrowserMenu() {
      if (!menuOptional) return { kind: "released" }
      try {
        const removed = await permissions.remove({ permissions: ["contextMenus"] })
        const granted = await permissions.contains({ permissions: ["contextMenus"] })
        return typeof removed === "boolean" && granted === false ? { kind: "released" } : { kind: "unconfirmed" }
      } catch {
        return { kind: "unconfirmed" }
      }
    }
  }
}
