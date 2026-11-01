import { isTabView, type TabView, type WwwFeature } from "../../../src/shared/contracts/tab-view"
import type { ExtLink } from "../../../src/site/core/extlink"
import type { SiteView } from "../../../src/site/core/feature-host"
import { checked, expectedKey, rawIdentity } from "../page-link/support"
import { wireView } from "../tab-view/cases"

export function wwwView(ids: readonly WwwFeature["id"][] = ["card-menu"], keepLinkMenu = true, label = "First"): SiteView<"www"> {
  const base = wireView("www")
  if (base.site !== "www") throw Error("Expected a www specimen")
  const features = base.features.filter(feature => ids.includes(feature.id)).map(feature =>
    feature.id === "card-menu" ? { ...feature, options: { ...feature.options, keepLinkMenu } } : feature)
  const result = checked(isTabView, {
    ...base, acct: expectedKey(rawIdentity), features,
    statuses: base.statuses.filter(status => ids.some(id => id === status.feature)),
    setup: base.setup?.kind === "live" ? { kind: "live", setup: { ...base.setup.setup, label: { name: label } } } : base.setup
  })
  if (result.site !== "www") throw Error("Expected a validated www view")
  return result
}

export function syntheticViewSource(initial: TabView | null = null) {
  let current = initial
  const listeners = new Set<(view: TabView | null) => void>()
  let last: (view: TabView | null) => void = () => {}
  const link: Pick<ExtLink<TabView>, "onView"> = {
    onView(listener) {
      last = listener
      listeners.add(listener)
      listener(current)
      return () => { listeners.delete(listener) }
    }
  }
  return {
    link,
    get count() { return listeners.size },
    publish(view: TabView | null) {
      if (view !== null && !isTabView(view)) throw Error("Invalid complete synthetic view")
      current = view
      for (const listener of [...listeners]) if (listeners.has(listener)) listener(view)
    },
    delayed(view: TabView | null) { last(view) }
  }
}
