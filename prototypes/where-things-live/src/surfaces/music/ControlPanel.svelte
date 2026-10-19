<script lang="ts">
  // Prototype controls beside the mock (not part of YouTube Music). Same shared state as Settings and the popup.
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import FootprintTag from "$lib/components/FootprintTag.svelte";
  import {
    app,
    blockReason,
    blockReasonText,
    playlistTitle,
    tabSetup,
    switchOn,
    requestAccess,
    healthOf,
    maybeBreakageNotice,
  } from "$lib/state.svelte";
  import { featureById, musicButtons, type FeatureId } from "$lib/ia";
  import { cn } from "$lib/utils";
  import { ui, keysOn } from "./store.svelte";
  import { keySims, shortcutSims } from "./actions";

  const qa = $derived(app.features.musicQuickActions);
  const keys = $derived(app.features.musicShortcuts);
  const shortcutsOff = $derived(!app.features.shortcuts.on);
  const reason = $derived(blockReason("musicQuickActions"));
  const quick = $derived(tabSetup()?.musicQuickSave ?? null);

  // Ticket 10: switching ON goes through the browser's site-access prompt when needed; OFF is plain.
  const setFeature = (id: FeatureId) => (v: boolean) => (v ? switchOn(id) : (app.features[id].on = false));
  const setSection = (v: boolean) => {
    if (v) return requestAccess("music", () => (app.sites.music = true));
    app.sites.music = false;
    // Off leaves nothing of ours on the page, a lingering toast included.
    app.toasts = app.toasts.filter((t) => t.site !== "music");
  };
  const setQuick = setFeature("musicQuickActions");
  const setKeys = setFeature("musicShortcuts");

  // Ticket 18: simulate YouTube Music changing what quick actions rely on.
  const broken = () => healthOf("musicQuickActions") === "broken";
  const setBroken = (v: boolean) => {
    if (v) app.health.musicQuickActions = { status: "broken" };
    else delete app.health.musicQuickActions;
    maybeBreakageNotice("music");
  };

  const quickSims = $derived(keysOn() ? keySims() : []);
  const otherSims = $derived(shortcutSims());
</script>

<aside class="w-72 shrink-0 space-y-4 rounded-xl border bg-white p-4 text-sm shadow-sm">
  <div class="flex items-center justify-between gap-2">
    <div>
      <p class="font-semibold">YouTube Music</p>
      <p class="text-muted-foreground text-xs">Off: nothing of ours on music.youtube.com.</p>
    </div>
    <Switch bind:checked={() => app.sites.music, setSection} aria-label="YouTube Music" />
  </div>
  {#if !app.env.musicAccess}
    <div class="text-muted-foreground space-y-1.5 rounded-md bg-neutral-100 px-2 py-1.5 text-xs">
      <p>Needs site access. Nothing of ours is drawn on music.youtube.com until it's given.</p>
      <Button size="sm" variant="outline" class="h-7 text-xs" onclick={() => requestAccess("music")}>Give access to YouTube Music</Button>
    </div>
  {:else if reason && reason !== "site-off"}
    <p class="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">{blockReasonText[reason]}: nothing is drawn.</p>
  {/if}

  <div class={cn("space-y-4", !app.sites.music && "pointer-events-none opacity-50")}>
    <section class="space-y-2 border-t pt-3">
      <div class="flex items-center justify-between gap-2">
        <p class="font-medium">{featureById.musicQuickActions.name}</p>
        <Switch bind:checked={() => app.features.musicQuickActions.on, setQuick} aria-label="Quick actions" />
      </div>
      <FootprintTag footprint={featureById.musicQuickActions.footprint} />
      {#if qa.on}
        <div class="space-y-1.5 pt-1">
          {#each musicButtons as b (b.id)}
            <label class="flex items-start gap-2 text-xs">
              <Checkbox bind:checked={app.features.musicQuickActions.buttons[b.id]} class="mt-0.5" />
              <span><span class="font-medium">{b.name}</span><br /><span class="text-muted-foreground">{b.where}</span></span>
            </label>
          {/each}
          <label class="flex items-start gap-2 text-xs">
            <Checkbox bind:checked={app.features.musicQuickActions.playerBarSave} class="mt-0.5" />
            <span
              ><span class="font-medium">Save on the player bar</span><br /><span class="text-muted-foreground"
                >Beside YouTube Music's like, only where a bar exists</span
              ></span
            >
          </label>
        </div>
      {/if}
    </section>

    <section class="space-y-2 border-t pt-3">
      <div class="flex items-center justify-between gap-2">
        <p class="font-medium">{featureById.musicShortcuts.name}</p>
        <Switch bind:checked={() => app.features.musicShortcuts.on, setKeys} aria-label="Quick-action shortcuts" />
      </div>
      <FootprintTag footprint={featureById.musicShortcuts.footprint} />
    </section>

    {#if qa.on || keys.on}
      <p class="text-muted-foreground text-xs">
        Quick-save playlist ({app.env.signedIn ? "this account" : "signed out"}):
        <b class="text-foreground">{quick ? playlistTitle(quick) : "not set, first Save asks"}</b>
      </p>
    {/if}

    <section class="space-y-1 border-t pt-3">
      <div class="flex items-center justify-between gap-2">
        <p class="font-medium">Playlist shortcuts here too</p>
        <Switch bind:checked={app.features.shortcuts.onMusic} disabled={shortcutsOff} aria-label="Playlist shortcuts here too" />
      </div>
      <p class="text-muted-foreground text-xs">
        {shortcutsOff ? "Playlist shortcuts are off (Settings › YouTube)." : "From YouTube; they act on the song under the pointer, else the playing one."}
      </p>
    </section>
  </div>

  <section class="space-y-2 border-t pt-3">
    <p class="font-medium">Prototype</p>
    <label class="flex items-center gap-2 text-xs">
      <Checkbox bind:checked={ui.showAll} /> Show hover buttons everywhere
    </label>
    <label class="flex items-center gap-2 text-xs">
      <Checkbox bind:checked={app.env.signedIn} /> Signed in (off: Save and Like aren't drawn)
    </label>
    <label class="flex items-center gap-2 text-xs">
      <Checkbox bind:checked={app.env.casting} /> Casting (Chrome): queue actions dim
    </label>
    <label class="flex items-start gap-2 text-xs">
      <Checkbox bind:checked={broken, setBroken} class="mt-0.5" />
      <span>YouTube Music changed something (quick actions not working)</span>
    </label>
    <p class="flex items-center gap-2 text-xs">
      <span class="inline-block h-3 w-6 rounded-sm" style="outline: 2px dashed oklch(0.673 0.182 276.935); outline-offset: 1px"></span>
      Dashed outline = drawn by Playlist Tools
    </p>
  </section>

  {#if quickSims.length || otherSims.length}
    <section class="space-y-1.5 border-t pt-3">
      <p class="font-medium">Simulate keys</p>
      {#if quickSims.length}<p class="text-muted-foreground text-xs">Quick-action shortcuts</p>{/if}
      {#each quickSims as k (k.label)}
        <Button variant="outline" size="sm" class="h-auto w-full justify-start py-1 text-left text-xs whitespace-normal" onclick={k.run}
          >{k.label}</Button
        >
      {/each}
      {#if otherSims.length}<p class="text-muted-foreground pt-1 text-xs">Playlist shortcuts and undo</p>{/if}
      {#each otherSims as k (k.label)}
        <Button variant="outline" size="sm" class="h-auto w-full justify-start py-1 text-left text-xs whitespace-normal" onclick={k.run}
          >{k.label}</Button
        >
      {/each}
    </section>
  {/if}
</aside>
