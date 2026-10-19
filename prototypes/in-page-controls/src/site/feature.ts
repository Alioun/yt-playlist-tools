// THROWAWAY PROTOTYPE (ticket 14; ticket 17's site/feature.ts). A feature file only defines itself; the site core
// starts it when the tab view says it's on, and disposes its scope when it's switched off.
import type { Scope } from "./core/scope";
import type { PageLink } from "./core/page-link";
import type { Pointer } from "./core/pointer";
import type { Binding } from "./core/keys";
import type { Item } from "./core/items-www";
import type * as itemsWww from "./core/items-www";

export type FeatureId = "auto-add" | "shortcuts" | "quick-save" | "queue-button" | "watch-button" | "card-menu";

export type Anchor = Element | (() => DOMRect);
export type Popovers = {
  openPicker(o: {
    anchor: Anchor;
    video: { id: string; title: string };
    mode: "pick" | "choose";
    side?: "bottom" | "right";
    onclose?: () => void;
  }): void;
  openWatchMenu(o: { anchor: Element; video: { id: string; title: string; channel?: string }; side?: "bottom" | "left"; onclose?: () => void }): void;
  close(): void;
};

export type FeatureContext = {
  site: "www";
  scope: Scope;
  run: PageLink["run"];
  watch(stream: "nav", cb: (d: { signedIn: boolean; pageType: string; videoId: string | null }) => void): void;
  items: typeof itemsWww & { pointed(): Item | null; target(): Element | null };
  pointer: Pointer;
  keys: { bind(list: Binding[]): void; busy(id: string, on: boolean): void };
  /** Lazy popovers.js. { quiet } for hover-intent preloads, whose failure stays in the console. */
  popovers(opts?: { quiet?: boolean }): Promise<Popovers>;
  kit: any;
};

export type FeatureDef = { id: FeatureId; needsKit: boolean; start(ctx: FeatureContext): void };

export function definePageFeature(def: FeatureDef) {
  (globalThis as any).__pp.core.define(def);
}
