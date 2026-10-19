// THROWAWAY PROTOTYPE (ticket 09, where things live). Fake but realistic data, no extension APIs.

export type AccountId = "alioun" | "studio";

export interface Account {
  id: AccountId;
  name: string;
  handle: string;
  detail: string;
  initial: string;
  color: string;
}

export const accounts: Record<AccountId, Account> = {
  alioun: { id: "alioun", name: "Alioun", handle: "@alioun", detail: "alioun.d@gmail.com", initial: "A", color: "bg-emerald-600" },
  studio: { id: "studio", name: "Alioun Studio", handle: "@alioun-studio", detail: "Brand account of alioun.d@gmail.com", initial: "S", color: "bg-amber-600" },
};

export type Privacy = "private" | "unlisted" | "public";

export interface Playlist {
  id: string;
  title: string;
  privacy: Privacy;
  count: number;
  /** Placeholder thumbnail colour. */
  hue: number;
}

export const WATCH_LATER = "WL";

export const playlistsByAccount: Record<AccountId, Playlist[]> = {
  alioun: [
    { id: WATCH_LATER, title: "Watch Later", privacy: "private", count: 34, hue: 220 },
    { id: "PLmv", title: "Music videos", privacy: "public", count: 212, hue: 330 },
    { id: "PLtalks", title: "Talks to watch", privacy: "private", count: 48, hue: 200 },
    { id: "PLkids", title: "Kids – approved", privacy: "private", count: 120, hue: 140 },
    { id: "PLcook", title: "Cooking", privacy: "unlisted", count: 19, hue: 30 },
    { id: "PLsynth", title: "Synthwave mixes", privacy: "public", count: 76, hue: 280 },
    { id: "PLweb", title: "Svelte & web dev", privacy: "private", count: 31, hue: 15 },
    { id: "PLdocs", title: "Documentaries", privacy: "public", count: 64, hue: 100 },
    { id: "PLwood", title: "Woodworking ideas", privacy: "private", count: 22, hue: 45 },
    { id: "PLgame", title: "Speedruns", privacy: "public", count: 57, hue: 260 },
    { id: "PLlang", title: "Learning Portuguese", privacy: "private", count: 13, hue: 170 },
    { id: "PLbike", title: "Bike repair", privacy: "unlisted", count: 9, hue: 5 },
    { id: "PLjazz", title: "Late-night jazz", privacy: "public", count: 88, hue: 240 },
    { id: "PLfav", title: "All-time favourites", privacy: "private", count: 141, hue: 350 },
  ],
  studio: [
    { id: WATCH_LATER, title: "Watch Later", privacy: "private", count: 3, hue: 220 },
    { id: "PLref", title: "B-roll references", privacy: "private", count: 27, hue: 60 },
    { id: "PLrev", title: "To review", privacy: "unlisted", count: 6, hue: 190 },
  ],
};

export interface Channel {
  id: string;
  title: string;
  handle?: string;
}

export const channels: Record<string, Channel> = {
  byte: { id: "UCbyte0000000000000000", title: "Byte Sized", handle: "@bytesized" },
  kitchen: { id: "UCkitch000000000000000", title: "Kitchen Lab", handle: "@kitchenlab" },
  night: { id: "UCnight000000000000000", title: "Night Drive Radio", handle: "@nightdrive" },
  field: { id: "UCfield000000000000000", title: "Field Notes Docs", handle: "@fieldnotes" },
  talk: { id: "UCtalk0000000000000000", title: "Talk Archive", handle: "@talkarchive" },
  tiny: { id: "UCtiny0000000000000000", title: "Tiny Science", handle: "@tinyscience" },
  bricks: { id: "UCbrick000000000000000", title: "Brick by Brick", handle: "@brickbybrick" },
  shed: { id: "UCshed0000000000000000", title: "The Shed Workshop" },
  run: { id: "UCrun00000000000000000", title: "Any% Archive", handle: "@anypercent" },
  loud: { id: "UCloud0000000000000000", title: "LOUD REACTS", handle: "@loudreacts" },
};

export interface Video {
  id: string;
  title: string;
  channel: keyof typeof channels;
  duration: string;
  views: string;
  age: string;
  hue: number;
  short?: boolean;
}

export const videos: Video[] = [
  { id: "v1", title: "How a compiler turns components into DOM updates", channel: "byte", duration: "18:42", views: "412K views", age: "3 days ago", hue: 15 },
  { id: "v2", title: "The 20-minute weeknight ramen, properly", channel: "kitchen", duration: "11:05", views: "1.2M views", age: "2 weeks ago", hue: 30 },
  { id: "v3", title: "Neon highways — 3 hour synthwave drive", channel: "night", duration: "3:02:11", views: "2.4M views", age: "1 year ago", hue: 280 },
  { id: "v4", title: "The last glaciers of the Alps", channel: "field", duration: "52:30", views: "880K views", age: "5 months ago", hue: 190 },
  { id: "v5", title: "Designing for people who don't read manuals", channel: "talk", duration: "41:17", views: "96K views", age: "1 month ago", hue: 200 },
  { id: "v6", title: "Why do magnets stick? (for 8-year-olds)", channel: "tiny", duration: "7:48", views: "3.1M views", age: "2 years ago", hue: 140 },
  { id: "v7", title: "Building a working LEGO clock", channel: "bricks", duration: "16:20", views: "640K views", age: "8 months ago", hue: 50 },
  { id: "v8", title: "Hand-cut dovetails without a jig", channel: "shed", duration: "23:09", views: "210K views", age: "4 weeks ago", hue: 45 },
  { id: "v9", title: "World record history: the 2-minute glitch", channel: "run", duration: "27:51", views: "1.9M views", age: "6 months ago", hue: 260 },
  { id: "v10", title: "REACTING to the WORST kitchen gadgets", channel: "loud", duration: "19:59", views: "5.5M views", age: "1 day ago", hue: 0 },
  { id: "v11", title: "Svelte 5 runes in 100 seconds", channel: "byte", duration: "2:14", views: "1.1M views", age: "1 year ago", hue: 15 },
  { id: "v12", title: "Rainy café jazz for focus", channel: "night", duration: "1:58:40", views: "780K views", age: "3 months ago", hue: 240 },
];

export const shorts: Video[] = [
  { id: "s1", title: "One-pan crispy rice in 30s", channel: "kitchen", duration: "0:31", views: "4.2M views", age: "", hue: 30, short: true },
  { id: "s2", title: "Glacier calving caught on camera", channel: "field", duration: "0:22", views: "9.8M views", age: "", hue: 190, short: true },
  { id: "s3", title: "This CSS trick blew my mind", channel: "byte", duration: "0:45", views: "620K views", age: "", hue: 15, short: true },
  { id: "s4", title: "Dovetail in one take", channel: "shed", duration: "0:58", views: "88K views", age: "", hue: 45, short: true },
];

/** The video open on the mock watch page, and which of Alioun's playlists already hold it. */
export const watchVideo = videos[0];
export const watchVideoIn = ["PLweb"];

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  hue: number;
}

export const songs: Song[] = [
  { id: "m1", title: "Midnight Overpass", artist: "Lumen Drive", album: "Afterglow Avenue", duration: "4:12", hue: 280 },
  { id: "m2", title: "Paper Lanterns", artist: "Hana Okafor", album: "Small Fires", duration: "3:38", hue: 30 },
  { id: "m3", title: "Coastline (Live at the Pier)", artist: "The Low Tides", album: "Salt & Static", duration: "5:01", hue: 200 },
  { id: "m4", title: "Kintsugi", artist: "Mareike Voss", album: "Gold Seams", duration: "3:55", hue: 45 },
  { id: "m5", title: "Slow Orbit", artist: "Lumen Drive", album: "Afterglow Avenue", duration: "4:47", hue: 280 },
  { id: "m6", title: "Better in Blue", artist: "Junie & the Fold", album: "Better in Blue", duration: "2:59", hue: 220 },
  { id: "m7", title: "Feather Weight", artist: "Hana Okafor", album: "Small Fires", duration: "3:21", hue: 30 },
  { id: "m8", title: "Static Bloom", artist: "The Low Tides", album: "Salt & Static", duration: "4:05", hue: 200 },
];

export interface Album {
  id: string;
  title: string;
  artist: string;
  kind: "Album" | "Playlist" | "Single";
  year: string;
  hue: number;
}

export const albums: Album[] = [
  { id: "a1", title: "Afterglow Avenue", artist: "Lumen Drive", kind: "Album", year: "2026", hue: 280 },
  { id: "a2", title: "Small Fires", artist: "Hana Okafor", kind: "Album", year: "2025", hue: 30 },
  { id: "a3", title: "Salt & Static", artist: "The Low Tides", kind: "Album", year: "2024", hue: 200 },
  { id: "a4", title: "Focus Flow", artist: "YouTube Music", kind: "Playlist", year: "", hue: 160 },
  { id: "a5", title: "Gold Seams", artist: "Mareike Voss", kind: "Album", year: "2026", hue: 45 },
  { id: "a6", title: "Better in Blue", artist: "Junie & the Fold", kind: "Single", year: "2026", hue: 220 },
];

export const thumb = (hue: number) =>
  `background: linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 22%));`;
