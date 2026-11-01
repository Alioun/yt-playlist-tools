import type { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import type { TabStorageProjection } from "../../../src/background/store/tab-projection"
import type { Browser } from "wxt/browser"

function nativeProjectionBoundaries(owner: ReturnType<typeof createLocalFilterWriter>, view: TabStorageProjection, nativeTab: Browser.tabs.Tab) {
  // @ts-expect-error A browser-native tab is not a storage projection request.
  void owner.readTabProjection(nativeTab)
  // @ts-expect-error Serialized projections contain no native browser types.
  const nativeLeak: TabStorageProjection = { ...view, nativeTab }
  void nativeLeak
}
void nativeProjectionBoundaries
