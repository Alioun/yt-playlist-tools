// THROWAWAY PROTOTYPE (ticket 27). Fake catalogue, in the spirit of ticket 09's prototype. Art is drawn with
// gradients so nothing is fetched.
export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  plays: string;
  art: string;
  /** A video rather than an audio track (16:9 thumbnails in the queue). */
  video?: boolean;
}
export interface Collection {
  id: string;
  kind: "album" | "playlist";
  title: string;
  by: string;
  year?: string;
  art: string;
  songs: string[];
}

const g = (a: string, b: string, c = "135deg") => `linear-gradient(${c}, ${a}, ${b})`;

export const SONGS: Record<string, Song> = Object.fromEntries(
  (
    [
      ["s1", "Midnight Overpass", "Lumen Drive", "Afterglow Avenue", "4:12", "12M plays", g("#7b2ff7", "#c2185b")],
      ["s2", "Paper Lanterns", "Hana Okafor", "Small Fires", "3:48", "2.1M plays", g("#f7971e", "#5b3a1a")],
      ["s3", "Coastline (Live at the Pier)", "The Low Tides", "Salt & Static", "5:03", "301K plays", g("#1f6feb", "#0b3d2e")],
      ["s4", "Kintsugi", "Mareike Voss", "Gold Seams", "3:21", "97K plays", g("#d4a017", "#3b5b2a")],
      ["s5", "Slow Orbit", "Lumen Drive", "Afterglow Avenue", "4:40", "8.4M plays", g("#8e2de2", "#4a00e0")],
      ["s6", "Better in Blue (feat. Junie & the Fold and the Overlong Collaborators Choir)", "Junie & the Fold", "Better in Blue", "3:59", "44M plays", g("#2b5876", "#4e4376")],
      ["s7", "Feather Weight", "Hana Okafor", "Small Fires", "2:58", "880K plays", g("#ee9ca7", "#8a4f1d")],
      ["s8", "Static Bloom", "The Low Tides", "Salt & Static", "3:36", "1.2M plays", g("#11998e", "#38ef7d")],
      ["s9", "Northbound", "Ola Brandt", "Northbound", "4:05", "5.5M plays", g("#355c7d", "#c06c84")],
      ["s10", "Ember & Ash", "Mareike Voss", "Gold Seams", "3:14", "640K plays", g("#e65c00", "#3a1c71")],
      ["s11", "Glass Harbour", "Ola Brandt", "Northbound", "4:51", "2.9M plays", g("#0f2027", "#2c7744")],
      ["s12", "Lowlight", "Juno Park", "Lowlight", "3:27", "19M plays", g("#232526", "#a8c0ff")],
      ["s13", "Satellite Hearts", "Juno Park", "Lowlight", "3:44", "7.7M plays", g("#ff512f", "#1c1c3c")],
      ["s14", "Tidewater", "The Low Tides", "Salt & Static", "4:18", "410K plays", g("#43cea2", "#185a9d")],
      ["s15", "Afterglow Avenue", "Lumen Drive", "Afterglow Avenue", "5:22", "3.3M plays", g("#c94b4b", "#4b134f")],
      ["s16", "Small Fires", "Hana Okafor", "Small Fires", "4:02", "1.1M plays", g("#f12711", "#f5af19")],
      ["s17", "Gold Seams", "Mareike Voss", "Gold Seams", "3:55", "210K plays", g("#cfa600", "#2f4f2f")],
      ["s18", "Room Tone", "Ola Brandt", "Northbound", "2:44", "75K plays", g("#606c88", "#3f4c6b")],
      ["s19", "Nightswim (Official Video)", "Juno Park", "Lowlight", "3:31", "52M views", g("#000428", "#004e92"), true],
      ["s20", "Porchlight", "Hana Okafor", "Small Fires", "3:09", "560K plays", g("#ffb88c", "#de6262")],
      ["s21", "Overpass Reprise", "Lumen Drive", "Afterglow Avenue", "1:58", "900K plays", g("#41295a", "#2f0743")],
      ["s22", "Undertow", "The Low Tides", "Salt & Static", "4:27", "1.8M plays", g("#0b486b", "#f56217")],
    ] as const
  ).map(([id, title, artist, album, duration, plays, art, video]) => [id, { id, title, artist, album, duration, plays, art, video: !!video }]),
);

export const COLLECTIONS: Record<string, Collection> = {
  a1: { id: "a1", kind: "album", title: "Afterglow Avenue", by: "Lumen Drive", year: "2025", art: g("#c94b4b", "#4b134f"), songs: ["s15", "s1", "s5", "s21"] },
  a2: { id: "a2", kind: "album", title: "Small Fires", by: "Hana Okafor", year: "2025", art: g("#f7971e", "#5b3a1a"), songs: ["s2", "s7", "s16", "s20"] },
  a3: { id: "a3", kind: "album", title: "Salt & Static", by: "The Low Tides", year: "2024", art: g("#1f6feb", "#0b3d2e"), songs: ["s3", "s8", "s14", "s22"] },
  a4: { id: "a4", kind: "album", title: "Gold Seams", by: "Mareike Voss", year: "2026", art: g("#d4a017", "#3b5b2a"), songs: ["s4", "s10", "s17"] },
  a5: { id: "a5", kind: "album", title: "Northbound", by: "Ola Brandt", year: "2023", art: g("#355c7d", "#c06c84"), songs: ["s9", "s11", "s18"] },
  a6: { id: "a6", kind: "album", title: "Lowlight", by: "Juno Park", year: "2026", art: g("#232526", "#a8c0ff"), songs: ["s12", "s13", "s19"] },
  p1: { id: "p1", kind: "playlist", title: "Focus Flow", by: "YouTube Music", art: g("#11998e", "#38ef7d"), songs: ["s12", "s9", "s11", "s18", "s14", "s4", "s3", "s1", "s5", "s8", "s17", "s21", "s20"] },
  p2: { id: "p2", kind: "playlist", title: "Late-night jazz", by: "Alioun", art: g("#0f2027", "#203a43", "180deg"), songs: ["s11", "s18", "s3", "s4"] },
  p3: { id: "p3", kind: "playlist", title: "Indie Mix", by: "YouTube Music", art: g("#ee0979", "#ff6a00"), songs: ["s2", "s13", "s6", "s8", "s9"] },
  p4: { id: "p4", kind: "playlist", title: "Coffeehouse Acoustic", by: "YouTube Music", art: g("#603813", "#b29f94"), songs: ["s7", "s20", "s16"] },
};

/** The account's own playlists, in YouTube Music's Save-dialog order (most recently used first). */
export const MY_PLAYLISTS = [
  { id: "pl-fav", title: "Favourites", privacy: "private" as const, count: 214 },
  { id: "pl-jazz", title: "Late-night jazz", privacy: "unlisted" as const, count: 38, key: "Alt+J" },
  { id: "pl-run", title: "Running 170 bpm", privacy: "private" as const, count: 61 },
  { id: "pl-road", title: "Road trip 2026", privacy: "public" as const, count: 92 },
  { id: "pl-sunday", title: "Sunday morning, slow and quiet with coffee", privacy: "private" as const, count: 27 },
  { id: "pl-gym", title: "Gym", privacy: "private" as const, count: 45 },
  { id: "pl-dinner", title: "Dinner party", privacy: "public" as const, count: 19 },
  { id: "pl-90s", title: "90s rewind", privacy: "unlisted" as const, count: 140 },
  { id: "pl-sleep", title: "Sleep", privacy: "private" as const, count: 12 },
];

/** Where each song already is (membership), for the picker's check marks. */
export const MEMBERSHIP: Record<string, string[]> = {
  s1: ["pl-fav", "pl-road"],
  s5: ["pl-fav"],
  s11: ["pl-jazz"],
  s12: ["pl-run", "pl-gym"],
};

export const QUICK_PICKS = ["s1", "s2", "s3", "s6", "s4", "s5", "s7", "s8", "s9", "s13", "s12", "s10"];
export const INITIAL_QUEUE = ["s1", "s2", "s3", "s4", "s5", "s6", "s19", "s8"];
export const AUTOPLAY = ["s9", "s10", "s11"];
