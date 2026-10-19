<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 09). The whole information architecture on one page:
  // every capability (rows) against every surface (columns). Click a column to open that surface.
  import { go, app, type Surface } from "$lib/state.svelte";
  import FootprintTag from "$lib/components/FootprintTag.svelte";
  import { featureById, type FeatureId } from "$lib/ia";

  type Row = { name: string; feature?: FeatureId; cells: [string, string, string, string, string]; provisional?: string };

  const cols: { name: string; surface?: Surface }[] = [
    { name: "Toolbar popup", surface: "popup" },
    { name: "Settings page", surface: "settings" },
    { name: "On the page", surface: "youtube" },
    { name: "First run / upgrade note", surface: "first-run" },
    { name: "Elsewhere" },
  ];

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: "YouTube features",
      rows: [
        {
          name: "Auto-add",
          feature: "autoAdd",
          cells: [
            "Switch and Pause / Resume. This account's auto-add playlists. This video (watch page, Shorts, miniplayer): status line, each playlist's outcome, Don't auto-add this video.",
            "YouTube › Auto-add: switch, the same playlists for any account with a setup, the default required percentage, Show feedback. Shows 'Paused · Resume' while paused.",
            "Nothing, apart from its toast (bottom-left). Its status shows on the watch-page button only if that feature is on; nothing in the miniplayer.",
            "Pick on first run; step 3 picks playlists. Upgraders: kept, paused until they agree.",
            "Toolbar tick when this tab's video was added (provisional).",
          ],
        },
        {
          name: "Per-playlist options: takes, percentage, channel filter",
          cells: [
            "A pill on each ticked auto-add playlist opens its options: Takes (Videos / Shorts / Both), its own percentage, its channel filter. This video: Allow / Deny this channel per playlist.",
            "The same options inside Auto-add.",
            "Watch-page button menu: Allow / Deny this channel.",
            "—",
            "—",
          ],
        },
        {
          name: "Playlist shortcuts",
          feature: "shortcuts",
          cells: [
            "Switch. Each shortcut's key (recorder), name and this account's playlist; Add shortcut, Remove with Undo. 'Also on YouTube Music' on the YouTube Music tab.",
            "YouTube › Playlist shortcuts: up to 20, label, key, playlist; the picker key (Alt+Shift+P) and undo key (Alt+U); Also on YouTube Music; Show feedback.",
            "Keys caught in the page only (no browser commands), plus the toast. Picker rows show each playlist's key.",
            "Pick ('Alt+W saves to Watch later'); step 3 sets its playlist. Upgraders: their 1.x key is kept.",
            "—",
          ],
        },
        {
          name: "Quick-save on thumbnails",
          feature: "quickSave",
          cells: [
            "Switch and this account's quick-save playlist.",
            "YouTube › Quick-save: quick-save playlist, Shorts shelves, Show feedback.",
            "Split button at the thumbnail's top-left, under the queue button. Shorts shelves too.",
            "Pick; step 3 sets the quick-save playlist (or leaves it to the first save).",
            "—",
          ],
        },
        {
          name: "Queue button on thumbnails",
          feature: "queueButton",
          cells: ["Switch.", "YouTube › Queue button: switch, Also show a toast.", "Thumbnail's top-left, on hover or focus.", "Pick.", "—"],
        },
        {
          name: "Watch-page button",
          feature: "watchButton",
          cells: [
            "Switch.",
            "YouTube › Watch-page button: switch, Also on Shorts.",
            "YouTube's action row, after Save. Shorts: end of the action column. Its menu repeats the popup's This video card.",
            "Pick.",
            "—",
          ],
        },
        {
          name: "Right-click for the video menu",
          feature: "cardMenu",
          cells: ["Switch.", "YouTube › Right-click: switch, links keep the browser's menu.", "Right-click on a video card. Shift: browser's menu.", "Pick.", "—"],
        },
      ],
    },
    {
      title: "YouTube Music features",
      rows: [
        {
          name: "YouTube Music section switch",
          cells: [
            "Top of the YouTube Music tab.",
            "YouTube Music section header.",
            "Off: nothing of ours on music.youtube.com.",
            "—",
            "—",
          ],
        },
        {
          name: "Quick actions",
          feature: "musicQuickActions",
          cells: [
            "Switch, button chips, the quick-save playlist. Playing now: Save (one click) and the picker.",
            "YouTube Music › Quick actions: six button checkboxes, quick-save playlist, Show feedback.",
            "Song rows (left of YouTube Music's like and ⋮), card overlays, album and playlist headers, queue items. Save on the player bar is opt-in; nothing depends on the bar.",
            "Pick (Chrome asks for YouTube Music site access from the Agree click).",
            "Same popup in the installed app's title bar.",
          ],
        },
        {
          name: "Quick-action shortcuts",
          feature: "musicShortcuts",
          cells: [
            "Switch and a read-only key list.",
            "YouTube Music › Quick-action shortcuts: a key per action, quick-save playlist, Show feedback.",
            "Keys only: the row under the pointer, else the playing song.",
            "Pick.",
            "—",
          ],
        },
      ],
    },
    {
      title: "Everywhere",
      rows: [
        {
          name: "Settings sync",
          feature: "sync",
          cells: ["—", "Everywhere › Settings sync.", "—", "Pick.", "—"],
        },
      ],
    },
    {
      title: "Not features",
      rows: [
        {
          name: "Account and account setups",
          cells: [
            "Header: avatar, name, @handle (placeholder while read). With 2+ setups: a Showing picker that never switches YouTube's account.",
            "Showing setup for (2+ setups). Accounts: every setup with Remove; Sign in / Switch account link to YouTube.",
            "—",
            "Step 3 shows the account. Upgrade: Agree claims the 1.x playlists for the owning account.",
            "—",
          ],
        },
        {
          name: "Playlists: Watch Later, search, new playlist",
          cells: [
            "Every chooser: Watch Later first, search, New playlist (title + Private / Unlisted / Public, Private by default).",
            "Same chooser everywhere.",
            "The picker behind quick-save's ▾ and the watch-page button.",
            "Same chooser in step 3.",
            "—",
          ],
        },
        {
          name: "Missing or full playlist",
          cells: [
            "Marked Missing / Full with Remove in the chooser.",
            "Same marks with Remove; a failure toast's Settings action lands here, at the feature.",
            "Failure toast with Settings (or Choose for quick-save).",
            "—",
            "Toolbar '!'.",
          ],
        },
        {
          name: "YouTube changed something (feature health)",
          cells: [
            "A status line under the affected feature, and a strip under the header with Details.",
            "The same status line under the feature's switch. Diagnostics: Check now, the report shown in full, Copy, Known problems / Report a problem, detailed log.",
            "A not-working feature draws nothing. One sticky notice per session per feature, in the site's toast style, with Details.",
            "—",
            "Amber '!' while a feature isn't working in that tab (missing access first).",
          ],
        },
        {
          name: "Open the popup by key",
          cells: ["—", "Everywhere: a link to the browser's own shortcut settings (the popup command ships with no key).", "—", "—", "The browser's shortcut settings."],
        },
        {
          name: "Consent (store disclosure)",
          cells: [
            "Banner while pending: Review.",
            "Privacy & data: read again, withdraw. Switching a feature on before agreeing asks first.",
            "Nothing runs before it.",
            "First run step 2. The upgrade note is the consent for upgraders.",
            "Toolbar '!' while pending.",
          ],
        },
        {
          name: "Site access (per site)",
          cells: [
            "Banner: Give access to YouTube / YouTube Music.",
            "Top strip, and inline in the YouTube Music header.",
            "Features without access are on but draw nothing.",
            "Step 3 on Firefox if missing; Chrome asks for YouTube Music from the Agree click.",
            "Toolbar '!'. Chrome 133+: also Chrome's own access request on YouTube tabs.",
          ],
        },
        {
          name: "No YouTube tab",
          cells: [
            "Cached, read-only lists with their age; Open YouTube / Open YouTube Music. Switches still work.",
            "Same, as a strip; it refreshes when a tab answers.",
            "—",
            "Step 3: Open YouTube to load playlists.",
            "—",
          ],
        },
        {
          name: "Not signed in / other account",
          cells: [
            "Banner with Sign in. A new account shows unticked playlists; the first choice creates its setup. Private window: read-only setup.",
            "Same rules.",
            "Buttons stay and answer 'Sign in to YouTube to save videos.' Auto-add is silent.",
            "Step 3: Sign in.",
            "—",
          ],
        },
        {
          name: "Theme",
          cells: ["—", "Appearance: Light / Dark / System.", "Follows YouTube's own theme.", "Follows the theme.", "—"],
        },
        {
          name: "Clear data, old Google access",
          cells: [
            "—",
            "Privacy & data: Clear all data (confirm, scope), and the 1.x Google access link.",
            "—",
            "Upgrade note links to removing 1.x's Google access.",
            "—",
          ],
        },
        {
          name: "What happened (missed toasts)",
          provisional: "Recent adds is a proposal",
          cells: [
            "This video shows each playlist's outcome. Proposal: a Recent adds list.",
            "—",
            "Toasts wait for a hidden tab to be visible (ticket 12).",
            "—",
            "—",
          ],
        },
      ],
    },
  ];

  const notThere = [
    "No side panel: it won't open in Chrome's installed-app windows, and the popup plus Settings cover everything.",
    "No entries in the browser's right-click menu: it would add a permission and a second save path (question raised).",
    "No feature switches inside YouTube's pages; our in-page menus only link to Settings.",
    "No new-tab, history or dashboard pages.",
  ];
</script>

<div class="space-y-6 p-6 pb-24">
  <div>
    <h1 class="text-xl font-semibold">Where everything lives</h1>
    <p class="max-w-3xl text-sm text-neutral-600">
      Popup = this tab, this account, right now. Settings = everything, for good. The page shows only what a switched-on feature draws.
      Playlist choices (per account) are made in the popup and shown again in Settings; shared behaviour lives in Settings with
      one-click switches in the popup.
    </p>
  </div>

  <div class="overflow-x-auto rounded-lg border bg-white">
    <table class="w-full min-w-[72rem] text-left text-xs">
      <thead class="bg-neutral-50">
        <tr>
          <th class="w-48 p-2 font-semibold">Capability</th>
          {#each cols as c (c.name)}
            <th class="p-2 font-semibold">
              {#if c.surface}
                <button type="button" class="text-left underline-offset-2 hover:underline" onclick={() => go(c.surface!)}>{c.name} ↗</button>
              {:else}{c.name}{/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sections as s (s.title)}
          <tr class="bg-zinc-100"><td colspan="6" class="p-2 text-[11px] font-semibold tracking-wide text-zinc-600 uppercase">{s.title}</td></tr>
          {#each s.rows as r (r.name)}
            <tr class="border-t align-top">
              <td class="p-2">
                <p class="font-medium">{r.name}</p>
                {#if r.feature}
                  <FootprintTag footprint={featureById[r.feature].footprint} class="mt-1" />
                  <p class="mt-1 text-[11px] text-neutral-500">{app.features[r.feature].on ? "On" : "Off"} in this prototype</p>
                {/if}
                {#if r.provisional}<p class="mt-1 text-[11px] font-medium text-amber-700">{r.provisional}</p>{/if}
              </td>
              {#each r.cells as c, i (i)}
                <td class="p-2 {c === '—' ? 'text-neutral-300' : 'text-neutral-700'}">{c}</td>
              {/each}
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>

  <div class="grid gap-4 md:grid-cols-2">
    <div class="rounded-lg border bg-white p-4">
      <h2 class="mb-2 text-sm font-semibold">Where features are switched</h2>
      <ol class="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
        <li>First run (or the upgrade note): all unticked, except upgraders' auto-add and shortcut.</li>
        <li>Settings: the home of every switch, with each feature's options unfolding under it.</li>
        <li>The popup: the same switches for the site you're on, one click each.</li>
      </ol>
      <p class="mt-2 text-xs text-neutral-500">Never inside YouTube's pages. Switching on asks for consent first if it's missing, and for site access when that site needs it.</p>
    </div>
    <div class="rounded-lg border bg-white p-4">
      <h2 class="mb-2 text-sm font-semibold">Surfaces 2.0 doesn't use</h2>
      <ul class="list-disc space-y-1 pl-5 text-sm text-neutral-700">
        {#each notThere as n (n)}<li>{n}</li>{/each}
      </ul>
    </div>
  </div>
</div>
