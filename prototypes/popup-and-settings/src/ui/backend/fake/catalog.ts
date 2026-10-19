// THROWAWAY PROTOTYPE (ticket 15). The cached playlist lists and channels. Loaded on demand (pickers, unfolded
// rows, settings), never by the popup's first view: the first view only needs the titles in `doc.titles`.
import type { AccountId, Privacy } from "$shared/model/types";

export interface Playlist {
  id: string;
  title: string;
  privacy: Privacy;
  count: number;
  hue: number;
  /** Created by the extension in the last 24 h and not listed by YouTube yet (ticket 12). */
  fresh?: boolean;
  gone?: boolean;
}

export const WATCH_LATER = "WL";

const p = (id: string, title: string, privacy: Privacy, count: number, hue: number): Playlist => ({ id, title, privacy, count, hue });

/** Watch Later first, then YouTube's own Save-dialog order (most recently updated first). 48 for the long-list case. */
export const playlists: Record<AccountId, Playlist[]> = {
  alioun: [
    p(WATCH_LATER, "Watch later", "private", 34, 222),
    p("PLmv", "Music videos", "public", 212, 330),
    p("PLtalks", "Talks to watch", "private", 48, 200),
    p("PLkids", "Kids – approved", "private", 120, 140),
    p("PLfav", "All-time favourites", "private", 5000, 300),
    p("PLweb", "Svelte & web dev", "private", 31, 25),
    p("PLcook", "Cooking", "unlisted", 19, 35),
    p("PLsynth", "Synthwave mixes", "public", 76, 280),
    p("PLdocs", "Documentaries", "public", 64, 100),
    p("PLwood", "Woodworking ideas", "private", 22, 45),
    p("PLgame", "Speedruns", "public", 57, 260),
    p("PLlang", "Learning Portuguese", "private", 13, 170),
    p("PLbike", "Bike repair", "unlisted", 9, 190),
    p("PLjazz", "Late-night jazz", "public", 88, 240),
    p("PLshorts", "Shorts I liked", "private", 403, 160),
    p("PLtrav", "Travel: Lisbon 2027", "private", 27, 55),
    p("PLmath", "Maths, explained", "public", 44, 210),
    p("PLgarden", "Balcony garden", "private", 15, 120),
    p("PLrun", "Running form", "private", 8, 185),
    p("PLpod", "Podcasts (video)", "unlisted", 63, 275),
    p("PLsci", "Science for the kids", "private", 71, 150),
    p("PLguitar", "Guitar lessons", "private", 39, 30),
    p("PLlego", "LEGO builds", "public", 18, 50),
    p("PLchess", "Chess openings", "private", 26, 230),
    p("PLphoto", "Film photography", "public", 33, 20),
    p("PLsleep", "Sleep sounds", "private", 12, 250),
    p("PLsynthdiy", "DIY synths", "unlisted", 21, 290),
    p("PLhist", "History deep dives", "public", 92, 95),
    p("PLarch", "Architecture walks", "private", 17, 175),
    p("PLanim", "Animation breakdowns", "public", 29, 315),
    p("PLcss", "CSS tricks", "private", 54, 205),
    p("PLrust", "Rust talks", "private", 23, 15),
    p("PLbake", "Sourdough", "private", 11, 40),
    p("PLbirds", "Birdwatching (pigeons included)", "public", 7, 180),
    p("PLyoga", "Morning yoga", "private", 14, 135),
    p("PLcar", "Car maintenance", "unlisted", 10, 215),
    p("PLtrailer", "Trailers 2027", "public", 46, 265),
    p("PLlive", "Live sets", "public", 38, 285),
    p("PLmini", "Miniature painting", "private", 20, 60),
    p("PLdesign", "Design talks", "private", 41, 245),
    p("PLspace", "Space & rockets", "public", 67, 225),
    p("PLfix", "Repair café", "unlisted", 16, 110),
    p("PLcomedy", "Stand-up", "private", 35, 320),
    p("PLtea", "Tea & ceramics", "private", 9, 70),
    p("PLsail", "Sailing basics", "private", 6, 195),
    p("PLsound", "Sound design", "public", 28, 270),
    p("PLart", "Painting timelapses", "private", 24, 340),
    p("PLlater2", "Later, maybe", "private", 81, 230),
  ],
  studio: [
    p(WATCH_LATER, "Watch later", "private", 3, 222),
    p("PLref", "B-roll references", "private", 27, 60),
    p("PLrev", "To review", "unlisted", 6, 190),
    p("PLlaunch", "Launch videos", "public", 12, 285),
  ],
  kids: [p(WATCH_LATER, "Watch later", "private", 0, 222)],
};

export interface Channel {
  id: string;
  title: string;
  handle?: string;
  hue: number;
}

export const channels: Record<string, Channel> = {
  byte: { id: "byte", title: "Byte Sized", handle: "@bytesized", hue: 25 },
  kitchen: { id: "kitchen", title: "Kitchen Lab", handle: "@kitchenlab", hue: 35 },
  night: { id: "night", title: "Night Drive Radio", handle: "@nightdrive", hue: 280 },
  field: { id: "field", title: "Field Notes Docs", handle: "@fieldnotes", hue: 190 },
  talk: { id: "talk", title: "Talk Archive", handle: "@talkarchive", hue: 200 },
  tiny: { id: "tiny", title: "Tiny Science", handle: "@tinyscience", hue: 140 },
  bricks: { id: "bricks", title: "Brick by Brick", handle: "@brickbybrick", hue: 50 },
  shed: { id: "shed", title: "The Shed Workshop", hue: 45 },
  loud: { id: "loud", title: "LOUD REACTS", handle: "@loudreacts", hue: 330 },
  orbit: { id: "orbit", title: "Orbit Lab", handle: "@orbitlab", hue: 225 },
};

/** What typing a channel resolves to (ticket 01: resolve_url, /c/ included now). Fake lookups for the editor. */
export const channelLookup: Record<string, string> = {
  "@orbitlab": "orbit",
  orbitlab: "orbit",
  "youtube.com/@orbitlab": "orbit",
  "https://www.youtube.com/@orbitlab": "orbit",
  "@kitchenlab": "kitchen",
  "@nightdrive": "night",
  "youtube.com/c/orbitlab": "orbit",
};

export const thumb = (hue: number) =>
  `background-image: linear-gradient(135deg, oklch(0.62 0.13 ${hue}), oklch(0.42 0.12 ${(hue + 35) % 360}));`;

/** Ticket 12's list copy: "Music", "Music and Learning", "Music, Learning and Watch later", "Music, Learning and 2 more". */
export function listText(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  if (titles.length === 3) return `${titles[0]}, ${titles[1]} and ${titles[2]}`;
  return `${titles[0]}, ${titles[1]} and ${titles.length - 2} more`;
}
