// THROWAWAY PROTOTYPE (ticket 15). The popup's one banner, chosen in ticket 09's fixed order, and ticket 18's
// breakage strip. Settings shows the same connection states in its top strip, so both read from here.
//
// Order, most urgent first: consent or upgrade › reset from another browser › site access (per site) › account
// changed in another tab › not signed in › private window › no YouTube tab › account in view not open › a sync
// problem › Missing or Full playlists › 1.x setup unclaimed › 1.x claim notice.
import { feature } from "$shared/features/registry";
import type { AccountId, FeatureId } from "$shared/model/types";
import { accountInView, labelOf, setupOf, syncLine, ui } from "./view.svelte";

export type Tone = "attention" | "info" | "done";
export type ActionId =
  | "review-onboarding"
  | "dismiss-reset"
  | "access-youtube"
  | "access-music"
  | "reload-tab"
  | "sign-in"
  | "open-youtube"
  | "open-music"
  | "sync-details"
  | "show-marked"
  | "switch-account"
  | "discard-unclaimed"
  | "dismiss-claim";

export interface Banner {
  id: string;
  tone: Tone;
  title: string;
  text?: string;
  actions: { id: ActionId; label: string; primary?: boolean }[];
}

export function banner(tab: "youtube" | "music"): Banner | null {
  const s = ui.s;
  const e = s.env;
  const inView = accountInView();
  const name = inView ? labelOf(inView).name : "this account";
  if (s.upgrade === "pending")
    return {
      id: "upgrade",
      tone: "attention",
      title: "Playlist Pigeon 2.0 is waiting for your OK",
      text: "Auto-add and your shortcut are paused until you agree. No Google credentials needed anymore.",
      actions: [{ id: "review-onboarding", label: "Review", primary: true }],
    };
  if (s.consent !== "accepted")
    return {
      id: "consent",
      tone: "attention",
      title: "Waiting for your OK",
      text: "Nothing runs on YouTube until you agree. Switching a feature on asks first.",
      actions: [{ id: "review-onboarding", label: "Review", primary: true }],
    };
  if (s.remoteReset)
    return {
      id: "reset",
      tone: "info",
      title: "Reset from another browser",
      text: "Your synced settings were deleted in another browser, so Playlist Pigeon was reset here.",
      actions: [{ id: "dismiss-reset", label: "OK", primary: true }],
    };
  if (tab === "youtube" && !e.access.youtube)
    return {
      id: "access-youtube",
      tone: "attention",
      title: "Playlist Pigeon doesn't have access to YouTube.",
      text: "Features stay on, but nothing runs until you give access.",
      actions: [{ id: "access-youtube", label: "Give access to YouTube", primary: true }],
    };
  const musicWanted = s.musicSection && (s.features.musicQuickActions.on || s.features.musicShortcuts.on);
  if (tab === "music" && !e.access.music && musicWanted)
    return {
      id: "access-music",
      tone: "attention",
      title: "Playlist Pigeon doesn't have access to YouTube Music.",
      actions: [{ id: "access-music", label: "Give access to YouTube Music", primary: true }],
    };
  if (e.staleTab)
    return {
      id: "stale",
      tone: "attention",
      title: "Your YouTube account changed in another tab.",
      text: "Reload this page to keep saving here.",
      actions: [{ id: "reload-tab", label: "Reload tab", primary: true }],
    };
  if (!e.signedIn && !e.readingAccount && !ui.picked)
    return {
      id: "signed-out",
      tone: "info",
      title: "You're not signed in to YouTube in this tab.",
      actions: [{ id: "sign-in", label: "Sign in", primary: true }],
    };
  if (e.privateWindow && inView)
    return {
      id: "private",
      tone: "info",
      title: "Private window",
      text: setupOf(inView)
        ? `${name}'s setup is in use. You can change it only in a normal window.`
        : `${name} has no setup yet. Private windows don't save anything, so set it up in a normal window.`,
      actions: [],
    };
  if (tab === "youtube" && !e.youtubeOpen)
    return {
      id: "no-tab",
      tone: "info",
      title: "No YouTube tab is open",
      text: `This is saved data from ${e.cachedAgo}. Switches still work; saving and new playlists need a tab.`,
      actions: [{ id: "open-youtube", label: "Open YouTube", primary: true }],
    };
  if (tab === "music" && !e.musicOpen)
    return {
      id: "no-music-tab",
      tone: "info",
      title: "No YouTube Music tab is open",
      text: "Playing now needs one. Switches still work.",
      actions: [{ id: "open-music", label: "Open YouTube Music", primary: true }],
    };
  if (ui.picked && ui.account.state === "ready" && ui.picked !== ui.account.acct && !setupOf(ui.picked)?.notLoadedHere)
    return {
      id: "not-open",
      tone: "info",
      title: `${name} isn't open in any tab.`,
      text: "Open YouTube and switch to this account to refresh its playlists.",
      actions: [],
    };
  const sync = syncLine();
  if (sync?.problem)
    return {
      id: "sync",
      tone: "attention",
      title: s.sync.status === "full" ? "Synced settings are full" : "Settings sync needs an update",
      text: s.sync.status === "full" ? "Changes that need more room aren't saved." : sync.text,
      actions: [{ id: "sync-details", label: "Details", primary: true }],
    };
  const marked = Object.keys(s.marks).length;
  if (marked)
    return {
      id: "marks",
      tone: "attention",
      title: marked === 1 ? "A playlist you chose needs attention" : `${marked} playlists you chose need attention`,
      text: `${marked === 1 ? "It's" : "They're"} marked Missing or Full, with Remove.`,
      actions: [{ id: "show-marked", label: "Show", primary: true }],
    };
  if (s.unclaimed && e.signedIn && inView)
    return {
      id: "unclaimed",
      tone: "attention",
      title: "Your playlists from 1.x belong to another YouTube account.",
      text: `Switch to it on YouTube to use them, or set up ${name} below.`,
      actions: [
        { id: "switch-account", label: "Switch account", primary: true },
        { id: "discard-unclaimed", label: "Discard" },
      ],
    };
  if (s.claimNotice)
    return {
      id: "claim",
      tone: "done",
      title: `Your auto-add playlists and shortcut from 1.x are now set up for ${labelOf(s.claimNotice.account as AccountId).name}.`,
      text:
        s.claimNotice.dropped > 0
          ? `${s.claimNotice.dropped} of them ${s.claimNotice.dropped === 1 ? "wasn't" : "weren't"} on this account and ${s.claimNotice.dropped === 1 ? "was" : "were"} left out.`
          : undefined,
      actions: [{ id: "dismiss-claim", label: "OK", primary: true }],
    };
  return null;
}

/** Ticket 18's popup strip: what isn't fully working in this tab. */
export function strip(tab: "youtube" | "music"): { text: string; broken: boolean } | null {
  const ids = (Object.keys(ui.s.health) as FeatureId[]).filter(
    (id) => ui.s.features[id].on && ui.s.health[id]!.status !== "working" && (feature[id].site === tab),
  );
  if (!ids.length) return null;
  const broken = ids.filter((id) => ui.s.health[id]!.status === "broken");
  const site = tab === "music" ? "YouTube Music" : "YouTube";
  if (broken.length > 1) return { text: `${broken.length} features aren't working in this tab.`, broken: true };
  if (broken.length === 1)
    return { text: `${feature[broken[0]].name} isn't working in this tab because ${site} changed something.`, broken: true };
  return { text: `${feature[ids[0]].name} is partly working in this tab.`, broken: false };
}
