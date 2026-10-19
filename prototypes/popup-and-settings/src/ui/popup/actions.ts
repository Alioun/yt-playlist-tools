// THROWAWAY PROTOTYPE (ticket 15). What each banner action does, shared by the popup's variants.
import type { ActionId } from "$lib/notices";
import { access, act } from "$lib/view.svelte";
import { navigate, openExternal } from "$lib/nav";

export function runBannerAction(id: ActionId) {
  const go: Record<ActionId, () => unknown> = {
    "review-onboarding": () => navigate("onboarding"),
    "dismiss-reset": () => act({ kind: "dismiss", notice: "remoteReset" }),
    "access-youtube": () => access.request("youtube"),
    "access-music": () => access.request("music"),
    "reload-tab": () => openExternal("reload"),
    "sign-in": () => openExternal("sign-in"),
    "open-youtube": () => openExternal("youtube"),
    "open-music": () => openExternal("music"),
    "sync-details": () => navigate("settings", "everywhere"),
    "show-marked": () => navigate("settings", "feature-autoAdd"),
    "switch-account": () => openExternal("switch-account"),
    "discard-unclaimed": () => act({ kind: "discardUnclaimed" }),
    "dismiss-claim": () => act({ kind: "dismiss", notice: "claim" }),
  };
  go[id]();
}
