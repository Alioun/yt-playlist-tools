// THROWAWAY PROTOTYPE (ticket 15). The harness's own copy of the fake storage document, kept live: the fake backend
// joins the frames' BroadcastChannel for the same scenario, so every change made in a frame shows here too.
import { createFakeBackend } from "$ui/backend/fake";
import type { UiSnapshot } from "$ui/backend/backend";
import type { PlayingSong, ThisVideo } from "$shared/model/types";
import { feature } from "$shared/features/registry";

const backend = createFakeBackend();

export const live = $state({
  s: null as UiSnapshot | null,
  tab: null as null | { video: ThisVideo | null; playing: PlayingSong | null },
  changes: 0,
});

backend.load().then((s) => (live.s = s));
backend.call("thisTab", {}).then((t) => (live.tab = t));
backend.watch((e) => {
  live.s = e.snapshot;
  live.changes++;
});

/** The toolbar badge (ticket 09, 18): an amber "!" when something needs you. Site access takes priority. */
export function badgeOf(s: UiSnapshot | null): { text: "!" | ""; title: string } {
  if (!s) return { text: "", title: "" };
  const f = s.features;
  const site = s.env.activeSite === "music" ? "music" : "youtube";
  const musicWanted = s.musicSection && (f.musicQuickActions.on || f.musicShortcuts.on);
  if (!s.env.access.youtube || (site === "music" && musicWanted && !s.env.access.music))
    return { text: "!", title: "Playlist Pigeon needs access to this site" };
  if (s.upgrade === "pending") return { text: "!", title: "Playlist Pigeon 2.0 is waiting for your OK" };
  if (s.consent !== "accepted") return { text: "!", title: "Waiting for your OK" };
  if (Object.keys(s.marks).length) return { text: "!", title: "A playlist you chose is missing or full" };
  const broken = (Object.keys(s.health) as (keyof typeof s.health)[]).filter(
    (id) => f[id]?.on && s.health[id]?.status === "broken" && feature[id].site === site,
  );
  if (broken.length) return { text: "!", title: `${feature[broken[0]].name} isn't working in this tab` };
  return { text: "", title: "Playlist Pigeon" };
}

/** What the mock address bar shows for the scenario's active tab. */
export function addressOf(s: UiSnapshot | null): { url: string; title: string; site: "youtube" | "music" | "other" } {
  if (!s) return { url: "", title: "", site: "other" };
  const e = s.env;
  if (e.activeSite === "music") return { url: "music.youtube.com/watch?v=m1", title: "Midnight Overpass · YouTube Music", site: "music" };
  if (e.activeSite === "other") return { url: "news.example.org/today", title: "Today's news", site: "other" };
  if (e.ytPage === "shorts") return { url: "www.youtube.com/shorts/s3", title: "This CSS trick blew my mind · YouTube", site: "youtube" };
  if (e.ytPage === "home") return { url: "www.youtube.com", title: "YouTube", site: "youtube" };
  return { url: "www.youtube.com/watch?v=v1", title: "How a compiler turns components into DOM updates · YouTube", site: "youtube" };
}
