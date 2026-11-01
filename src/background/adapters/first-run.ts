import type { browser as nativeBrowser } from "wxt/browser"
import type { AgreementAccess } from "../store/consent-agreement"

export type FirstRunPermissionsPort = Pick<typeof nativeBrowser.permissions, "contains">

export function nativeFirstRunAccess(permissions: FirstRunPermissionsPort): () => Promise<AgreementAccess | undefined> {
  return async () => {
    try {
      const [www, music, browserMenu] = await Promise.all([
        permissions.contains({ origins: ["https://www.youtube.com/*"] }),
        permissions.contains({ origins: ["https://music.youtube.com/*"] }),
        permissions.contains({ permissions: ["contextMenus"] })
      ])
      if (typeof www !== "boolean" || typeof music !== "boolean" || typeof browserMenu !== "boolean") return
      return { www, music, browserMenu }
    } catch { return undefined }
  }
}
