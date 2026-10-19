// THROWAWAY PROTOTYPE (ticket 15). The harness's "What to look at" notes, per surface. Prototype chrome only.

export type Surface = "popup" | "states" | "settings" | "firstrun" | "upgrade" | "brand";

export const surfaces: { id: Surface; name: string }[] = [
  { id: "popup", name: "Popup" },
  { id: "states", name: "Popup states" },
  { id: "settings", name: "Settings" },
  { id: "firstrun", name: "First run" },
  { id: "upgrade", name: "Upgrade note" },
  { id: "brand", name: "Brand" },
];

export const variants = [
  { id: "A", name: "Unfold in place" },
  { id: "B", name: "Drill in" },
  { id: "C", name: "Status first" },
] as const;

export const notes: Record<Surface, string[]> = {
  popup: [
    "Kept from ticket 09: header › breakage strip › one banner › YouTube | YouTube Music › This video or Playing now › feature rows. The footer's All settings moved into the header's gear.",
    "First view = one Backend.load() and nothing else: the switch list. Unfolded rows, This video's details, the picker and the account menu load on demand (ticket 24: 40 KB JS + 8 KB CSS up front).",
    "Judge the switch list: one row per feature, a one-line summary, the brand gradient only on switches that are on, a hatched switch when a feature is on but held (consent, site access, paused).",
    "This video: ticket 07's status line with a watched meter and a tick per goal (50 % and Talks to watch's own 90 %).",
    "The header names the account in view (avatar, name, @handle); a placeholder while it's read, never a signed-out flash. With 2+ setups it becomes a picker that never says \"switch\".",
    "Variants (bottom bar): A unfolds rows in place (ticket 09), B drills into a page per feature, C puts this tab's status first. Same content, different shells.",
    "Toolbar badge: an amber ! when something needs you (site access first, then consent, a Missing or Full playlist, a feature that isn't working).",
  ],
  states: [
    "Every scenario's popup at once: the one banner each state gets, in ticket 09's order (consent › reset › site access › account changed › signed out › private › no tab › not open › sync › Missing/Full › 1.x unclaimed › claimed).",
    "Judge whether each banner says what happened and offers the one action that fixes it.",
    "Tone never rests on colour alone: amber attention, slate-blue info, teal done, each with its own icon.",
    "Frames load lazily as you scroll; switch theme to Both to compare light and dark side by side.",
  ],
  settings: [
    "Settings is everything, for good (ticket 09): left nav, one section at a time, each feature a card with its footprint tag; off = one row, on = its options unfold.",
    "Per-account choices are labelled for the account in view; the \"Showing setup for\" picker appears only with two or more setups.",
    "The shared pieces are the same as the popup's: one playlist picker, one key recorder.",
    "Everywhere: Settings sync with its join question, the \"full\" state and Update; Privacy & data: consent, Clear all data with its checkbox.",
    "Diagnostics loads only when shown (ticket 18): Check now, the report in full, Copy, Known problems / Report a problem.",
    "Budget (ticket 24, PROVISIONAL): 60 KB JS + 10 KB CSS up front.",
  ],
  firstrun: [
    "Opens once in a tab on install: Pick features › Before you start › Finish setting up (ticket 09).",
    "Every feature starts unticked, each with its footprint tag; Settings sync comes first and can pre-tick what another browser has.",
    "The disclosure is ticket 19 §4.1's final copy; Agree turns on exactly what was ticked. On Chrome, the same click asks for YouTube Music access when a music feature is ticked.",
    "Not now keeps everything off; the popup then says \"Waiting for your OK\".",
    "Use the step buttons above the frame to open a step directly.",
  ],
  upgrade: [
    "The 1.4.5 note (ticket 19 §3): one page, opened once in a background tab, doubling as consent.",
    "Before Agree nothing is read from YouTube: only stored values show (\"N playlists you chose in 1.x\", the real percentage), no titles, no account.",
    "When 1.4.5's percentage was unset, the note asks once: as soon as it starts playing (what 1.4.5 did) or half watched (what it showed).",
    "Kept from 1.4.5 is ticked and paused until Agree; New in 2.0 is all off.",
    "Try scenarios Upgraded from 1.4.5 / (values set), and No site access for the access warning.",
  ],
  brand: [
    "Placeholder brand for Playlist Pigeon (name PROVISIONAL, ticket 22): a grey pigeon whose wing is three list lines, with a teal-to-violet neck.",
    "No YouTube red, no play triangle, not YouTube's red / near-black / white combination (ticket 03, ticket 22).",
    "The gradient goes only on the mark's neck, switches that are on, the header hairline and first run's main call to action.",
    "Check the 16 px icon on light and dark toolbars, with and without the amber ! badge.",
    "Contrast: every text token is AA on its own surface; the brand teal itself is decorative only (3.2:1 on white).",
  ],
};
