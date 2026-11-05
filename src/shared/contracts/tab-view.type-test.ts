import type { TabView, TabViewFacts, WwwFeature, MusicFeature } from "./tab-view"
import { isTabView } from "./tab-view"
import type { TabViewScope } from "./tabs"

declare const www: Extract<TabView, { site: "www" }>
declare const music: Extract<TabView, { site: "music" }>
declare const normal: Extract<TabView, { signedIn: true; private: false }>
declare const scope: TabViewScope
declare const session: { readonly recent: readonly unknown[] }
declare const privateFeatures: readonly MusicFeature[]

export const fullGuard = isTabView
// @ts-expect-error Music options cannot enter a YouTube view.
export const wrongSite: TabView = { ...www, features: privateFeatures }
// @ts-expect-error A complete view always carries the device picker sort.
export const missingField: TabView = (({ pickerSortAZ: _sort, ...rest }) => rest)(www)
// @ts-expect-error A whole owner session is outside the wire contract.
export const wholeSession: TabView = { ...www, session }
// @ts-expect-error Another account's collection is outside the wire contract.
export const otherAccount: TabView = { ...music, accounts: {} }
// @ts-expect-error Normal skips cannot enter a private view.
export const normalAsPrivate: TabView = { ...normal, private: true }
// @ts-expect-error A generic scope is missing the complete view fields.
export const partialView: TabView = scope
// @ts-expect-error Raw identities cannot be account keys.
export const rawFacts: TabViewFacts = { site: "www", build: www.build, private: false, signedIn: true, acct: "raw identity", tabId: 1, windowId: 2 }
// @ts-expect-error Site-specific options retain their literal feature identity.
export const wrongFeature: WwwFeature = { id: "music-keys", options: {} }
