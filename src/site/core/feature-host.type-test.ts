import type { MusicFeature, TabView } from "../../shared/contracts/tab-view"
import { createFeatureHost, type FeatureContext, type FeatureHost, type FeatureHostOptions } from "./feature-host"
import type { Scope } from "./scope"

type Services = { report(value: string): void }
declare const www: FeatureHost<"www", Services>
declare const music: FeatureHost<"music", Services>
declare const options: FeatureHostOptions<"www", Services>
declare const scope: Scope
declare const view: TabView
declare const context: FeatureContext<"www", Services>

function probes() {
  www.define({ id: "card-menu", start(context) { context.report(context.site); context.scope.dispose() } })
  music.define({ id: "music-actions", start(context) { context.view.read()?.features } })
  // @ts-expect-error Music-only features cannot be defined on www.
  www.define({ id: "music-keys", start() {} })
  // @ts-expect-error The card menu does not run on Music.
  music.define({ id: "card-menu", start() {} })
  // @ts-expect-error The browser menu is not a page feature.
  www.define({ id: "browser-menu", start() {} })
  // @ts-expect-error Feature IDs come from the actual TabView union.
  www.define({ id: "made-up", start() {} })
  // @ts-expect-error A complete Music view cannot contain a www card menu.
  const mismatch: MusicFeature = { id: "card-menu", options: { on: true, keepLinkMenu: true } }
  const { createScope: omittedScope, ...withoutScope } = options
  const { createContext: omittedContext, ...withoutContext } = options
  // @ts-expect-error Scope creation is a required lifecycle collaborator.
  createFeatureHost(withoutScope)
  // @ts-expect-error The later-services context factory is required.
  createFeatureHost(withoutContext)
  // @ts-expect-error A service factory cannot replace the host-owned scope.
  const replaceScope: FeatureHostOptions<"www", Services>["createContext"] = () => ({ report() {}, scope })
  // @ts-expect-error A service factory cannot replace the scoped current view.
  const replaceView: FeatureHostOptions<"www", Services>["createContext"] = () => ({ report() {}, view: context.view })
  // @ts-expect-error Context services remain concrete and typed.
  context.report(42)
  // @ts-expect-error Unvalidated generic view readers cannot replace ExtLink.onView.
  www.connect({ onView(listener: (value: { features: string[] }) => void) { listener({ features: [] }); return () => {} } })
  void [mismatch, omittedScope, omittedContext, replaceScope, replaceView, view]
}
void probes
