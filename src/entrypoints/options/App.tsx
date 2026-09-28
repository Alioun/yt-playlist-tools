import { Suspense, lazy } from "react"

import { YouTubeIcon } from "@/components/YouTubeIcon"

/**
 * Lazy here too, not because this page needs the saving, but because a static
 * import would put SettingsPanel (and sonner) into the chunk this page SHARES
 * with the popup -- which the popup then preloads on every open.
 */
const SettingsPanel = lazy(() =>
  import("@/components/SettingsPanel").then((m) => ({ default: m.SettingsPanel }))
)

/**
 * The options page is a thin page-level wrapper. The controls themselves live
 * in SettingsPanel, which the popup also renders inline, so the two surfaces
 * cannot drift apart.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-primary">
          <YouTubeIcon className="h-5 w-5 fill-primary" />
          YouTube Playlist Tools
        </h1>

        <Suspense fallback={null}>
          <SettingsPanel />
        </Suspense>
      </div>
    </div>
  )
}
