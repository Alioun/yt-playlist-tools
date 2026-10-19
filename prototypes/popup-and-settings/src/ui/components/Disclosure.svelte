<script lang="ts">
  // The store disclosure, ticket 19 §4.1's final copy, shared by first run ("Before you start"), the upgrade note
  // ("Before you continue") and the consent dialog ("Before this feature can run"). The cookie line is PROVISIONAL on
  // ticket 25: it ships only if the signed request ships.
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { openExternal } from "$lib/nav";
  let { browser, size = "md", class: className = "" }: { browser: "chrome" | "firefox"; size?: "sm" | "md"; class?: string } = $props();
  const items = [
    ["reads what you watch and listen to there:", "the video or song, its channel, and how much of it you've played;"],
    [
      "reads and changes your playlists, as you:",
      "it lists them, checks which ones already hold a video, and adds or removes videos when you ask or when auto-add does, using YouTube's own requests;",
    ],
    [
      "signs those requests the way YouTube's page does,",
      "with YouTube's sign-in cookie, inside the YouTube tab. It never stores that cookie or sends it anywhere else;",
    ],
    ["watches for the shortcut keys you set", "on YouTube and YouTube Music pages, and ignores every other key;"],
    [
      "keeps its settings in this browser,",
      "including your account's name, @handle and picture, a list of your playlists, and how much of each video you've watched (for up to 30 days).",
    ],
  ];
</script>

<div class="text-foreground/85 space-y-3 leading-[1.55] {size === 'sm' ? 'text-[12.5px]' : 'text-[13.5px]'} {className}">
  <p>
    Playlist Pigeon works inside your YouTube and YouTube Music tabs, as the account you're signed in to there. For the
    features you switch on, it:
  </p>
  <ul class="space-y-1.5">
    {#each items as [lead, rest] (lead)}
      <li class="flex gap-2.5">
        <span class="bg-brand-gradient mt-[0.6em] size-1.5 shrink-0 rounded-full" aria-hidden="true"></span>
        <span><strong class="text-foreground font-semibold">{lead}</strong> {rest}</span>
      </li>
    {/each}
  </ul>
  <p>
    Nothing is sent to us or to anyone but YouTube. There are no ads and no analytics. If you turn on Settings sync,
    your settings also travel through {browser === "firefox" ? "Firefox's" : "Chrome's"} own sync.
  </p>
  <button type="button" class="text-primary inline-flex items-center gap-1 font-medium hover:underline" onclick={() => openExternal("privacy-policy")}>
    Privacy policy <ExternalLink class="size-3.5" />
  </button>
</div>
