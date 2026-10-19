<script lang="ts">
  import Glyph from "$ui/components/Glyph.svelte";
  import type { FeatureId } from "$shared/model/types";
  import Lazy from "$ui/components/Lazy.svelte";
  // The popup's YouTube Music tab: the section's own switch (off = nothing of ours on music.youtube.com), Playing now,
  // the two YouTube Music features, playlist shortcuts' "here too", and the quick-save playlist under whichever
  // YouTube Music feature is on (ticket 26).
  import { Switch } from "$ui/components/ui/switch/index.js";
  import FeatureRow from "./FeatureRow.svelte";
  import PlayingNow from "./PlayingNow.svelte";
  import KeyCombo from "$ui/components/KeyCombo.svelte";
  import { musicButtons, musicKeyNames } from "$shared/features/registry";
  import { access, accountInView, act, setupOf, titleOf, ui } from "$lib/view.svelte";
  import { openPicker } from "./sheet.svelte";
  import { param } from "$lib/params";

  let { onopen }: { onopen?: (id: FeatureId) => void } = $props();
  let open = $state<Record<string, boolean>>({ musicQuickActions: false, musicShortcuts: false, [param("open") ?? ""]: true });
  const f = $derived(ui.s.features);
  const section = $derived(ui.s.musicSection);
  const acct = $derived(accountInView());
  const chosenButtons = $derived(musicButtons.filter((b) => f.musicQuickActions.buttons[b.id]).map((b) => b.name));
  const keys = $derived(Object.entries(f.musicShortcuts.keys).filter(([, k]) => k) as [keyof typeof musicKeyNames, string][]);
  const quickSave = $derived(setupOf(acct)?.musicQuickSave ?? null);

  async function setSection(on: boolean) {
    // Chrome: YouTube Music access is asked for from the click that switches it on (ticket 10).
    const wanted = f.musicQuickActions.on || f.musicShortcuts.on || (f.shortcuts.on && f.shortcuts.onMusic);
    if (on && wanted && !ui.s.env.access.music && !(await access.request("music"))) return;
    act({ kind: "musicSection", on });
  }
  function chooseQuickSave() {
    if (!acct) return;
    openPicker({
      mode: "choose",
      site: "music",
      acct,
      title: "Quick-save playlist",
      subtitle: "Save to playlist adds songs here in one click.",
      selected: quickSave,
      purpose: "musicQuickSave",
      onchoose: (playlist) => act({ kind: "quickSave", acct, site: "music", playlist }),
    });
  }
</script>

<div class="space-y-3 p-3">
  <div class="bg-card flex items-center gap-3 rounded-xl border px-3 py-2.5">
    <span
      class="inline-flex size-[30px] shrink-0 items-center justify-center rounded-[9px] {section ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'}"
      aria-hidden="true"><Glyph name="headphones" class="size-4" /></span
    >
    <div class="min-w-0 flex-1">
      <div class="text-[13px] font-medium">On YouTube Music</div>
      <div class="text-muted-foreground text-xs leading-[18px]">
        {section ? "Your features below run on music.youtube.com" : "Off: nothing of ours runs there. Your choices are kept."}
      </div>
    </div>
    <Switch checked={section} aria-label="Playlist Pigeon on YouTube Music" onCheckedChange={setSection} />
  </div>

  {#if section}
    <PlayingNow />

    <div class="bg-card divide-y rounded-xl border">
      <FeatureRow id="musicQuickActions" expandable bind:expanded={open.musicQuickActions} onopen={onopen && (() => onopen("musicQuickActions"))}>
        {#snippet summary()}
          {chosenButtons.length ? chosenButtons.join(", ") : "No buttons chosen"}
        {/snippet}
        <Lazy load={() => import("./parts/MusicActionsPart.svelte")} />
      </FeatureRow>
      <FeatureRow id="musicShortcuts" expandable bind:expanded={open.musicShortcuts} onopen={onopen && (() => onopen("musicShortcuts"))}>
        {#snippet summary()}
          <span class="inline-flex items-center gap-1.5 align-middle">
            {#each keys.slice(0, 3) as [, k] (k)}<KeyCombo key={k} os={ui.s.env.os} size="xs" />{/each}
            {#if keys.length > 3}<span>+{keys.length - 3}</span>{/if}
          </span>
        {/snippet}
        <Lazy load={() => import("./parts/MusicKeysPart.svelte")} />
      </FeatureRow>

      <!-- Playlist shortcuts' "Also on YouTube Music" (ticket 08), reachable from here too. -->
      <div class="flex min-h-[54px] items-center gap-3 py-2 pr-3 pl-3">
        <span
          class="inline-flex size-[30px] shrink-0 items-center justify-center rounded-[9px] {f.shortcuts.on && f.shortcuts.onMusic
            ? 'bg-accent text-primary'
            : 'bg-muted text-muted-foreground'}"
          aria-hidden="true"><Glyph name="keyboard" class="size-4" /></span
        >
        <div class="min-w-0 flex-1">
          <div class="text-[13px] leading-5 font-medium">Playlist shortcuts here too</div>
          <div class="text-muted-foreground truncate text-xs leading-[18px]">
            {f.shortcuts.on ? "They save the song you're pointing at or playing" : "Turn on Playlist shortcuts in the YouTube tab"}
          </div>
        </div>
        <Switch
          checked={f.shortcuts.on && f.shortcuts.onMusic}
          disabled={!f.shortcuts.on}
          aria-label="Playlist shortcuts on YouTube Music"
          onCheckedChange={(v) => act({ kind: "featureOption", id: "shortcuts", option: "onMusic", value: v })}
        />
      </div>

      {#if (f.musicQuickActions.on || f.musicShortcuts.on) && acct}
        <button type="button" class="hover:bg-muted/60 flex min-h-[54px] w-full items-center gap-3 py-2 pr-3 pl-3 text-left" onclick={chooseQuickSave}>
          <span class="bg-muted text-muted-foreground inline-flex size-[30px] shrink-0 items-center justify-center rounded-[9px]" aria-hidden="true"
            ><Glyph name="bookmark" class="size-4" /></span
          >
          <span class="min-w-0 flex-1">
            <span class="block text-[13px] leading-5 font-medium">Quick-save playlist</span>
            <span class="text-muted-foreground block truncate text-xs leading-[18px]">
              {quickSave ? `Save to playlist adds to ${titleOf(quickSave)}` : "Not chosen: the first save asks"}
            </span>
          </span>
          <Glyph name="chevron-right" class="text-muted-foreground size-4" />
        </button>
      {/if}
    </div>
  {/if}
</div>
