// THROWAWAY PROTOTYPE (ticket 14). The running watch-button feature's context and fold state, for its component.
import type { FeatureContext } from "../../feature";

export const wb = {
  ctx: null as FeatureContext | null,
  video: (() => null) as () => { id: string; title: string; channel?: string } | null,
};
/** Folded to icon only because YouTube's action row is narrow. */
export const fold = $state({ compact: false });
