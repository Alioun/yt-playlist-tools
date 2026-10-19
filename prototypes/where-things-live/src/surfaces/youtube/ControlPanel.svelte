<script lang="ts">
  // Prototype controls beside the mock page (not part of the design): feature switches and simulation.
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import FootprintTag from "$lib/components/FootprintTag.svelte";
  import { byGroup, type FeatureId } from "$lib/ia";
  import { accounts } from "$lib/data";
  import {
    app,
    running,
    blockReason,
    blockReasonText,
    tabSetup,
    playlistTitle,
    switchOn,
    setProgress,
    autoAddState,
    healthLine,
    shortcutTarget,
    shortcutName,
  } from "$lib/state.svelte";
  import { yt, pressShortcut, pressPickerKey, pressUndoKey } from "./yt.svelte";

  type Opt = { label: string; get: () => boolean; set: (v: boolean) => void };
  const f = app.features;
  const options: Partial<Record<FeatureId, Opt[]>> = {
    autoAdd: [{ label: "Toast when added", get: () => f.autoAdd.toast, set: (v) => (f.autoAdd.toast = v) }],
    quickSave: [{ label: "On Shorts shelves too", get: () => f.quickSave.onShorts, set: (v) => (f.quickSave.onShorts = v) }],
    watchButton: [{ label: "On Shorts too", get: () => f.watchButton.onShorts, set: (v) => (f.watchButton.onShorts = v) }],
    cardMenu: [
      {
        label: "Links inside cards keep the browser's menu",
        get: () => f.cardMenu.linksKeepBrowserMenu,
        set: (v) => (f.cardMenu.linksKeepBrowserMenu = v),
      },
    ],
  };

  const tabLine = $derived(
    !app.env.signedIn
      ? "Not signed in"
      : `Signed in as ${accounts[app.env.account].name}${tabSetup() ? "" : " (no setup yet)"}${app.env.staleTab ? ", account changed in another tab" : ""}`,
  );
</script>

<div class="w-72 shrink-0 space-y-5 text-sm">
  <section>
    <h3 class="mb-1 font-semibold">Features on this page</h3>
    <p class="mb-3 text-xs text-neutral-500">Same switches as Settings and the popup.</p>
    <ul class="space-y-3">
      {#each byGroup("youtube") as def (def.id)}
        {@const reason = blockReason(def.id)}
        <li class="rounded-lg border border-neutral-200 bg-white p-2.5">
          <label class="flex items-center gap-2">
            <Switch
              checked={app.features[def.id].on}
              onCheckedChange={(v) => (v ? switchOn(def.id) : (app.features[def.id].on = false))}
            />
            <span class="flex-1 font-medium">{def.name}</span>
          </label>
          <FootprintTag footprint={def.footprint} class="mt-1.5" />
          {#if app.features[def.id].on && options[def.id]}
            <div class="mt-2 space-y-1.5 pl-1">
              {#each options[def.id] ?? [] as o (o.label)}
                <label class="flex items-center gap-2 text-xs">
                  <Checkbox checked={o.get()} onCheckedChange={(v) => o.set(v === true)} />
                  {o.label}
                </label>
              {/each}
            </div>
          {/if}
          {#if app.features[def.id].on && reason}
            <p class="mt-1.5 text-xs text-amber-700">Not on the page: {blockReasonText[reason]}.</p>
          {/if}
          {#if app.features[def.id].on && healthLine(def.id)}
            <p class="mt-1.5 text-xs text-red-700">{healthLine(def.id)}</p>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="space-y-3">
    <h3 class="font-semibold">Simulate</h3>
    <p class="text-xs text-neutral-500">This tab: {tabLine}.</p>

    {#if app.env.ytPage !== "home" || app.env.miniplayer}
      {@const st = autoAddState()}
      <div>
        <p class="mb-2 flex justify-between text-xs">
          <span>Playhead{app.env.ytPage === "home" ? " (miniplayer)" : ""}</span>
          <span class="text-neutral-500">{app.watch.progress} % watched</span>
        </p>
        <Slider type="single" value={app.watch.progress} max={100} step={1} onValueChange={(v: number) => setProgress(v)} />
        <p class="mt-1 text-xs text-neutral-500">
          {#if st.kind === "off"}Auto-add is off.
          {:else if st.kind === "not-tracked"}{st.missing}
          {:else}{st.text}{/if}
        </p>
      </div>
    {/if}

    <div>
      <label class="flex items-center gap-2 text-xs">
        <Checkbox bind:checked={app.env.miniplayer} />
        Miniplayer (keep the video playing on Home)
      </label>
      <p class="mt-1 pl-6 text-xs text-neutral-500">Auto-add keeps counting in the miniplayer (ticket 07). Its status is in the popup.</p>
    </div>

    <div class="flex flex-wrap gap-1.5">
      {#if running("shortcuts")}
        {#each app.features.shortcuts.list.filter((s) => s.key) as sc (sc.id)}
          {@const target = shortcutTarget(app.env.account, sc)}
          <Button
            size="sm"
            variant="outline"
            title={target ? `${shortcutName(sc)}: ${playlistTitle(target)}` : `${shortcutName(sc)}: no playlist on this account`}
            onclick={() => pressShortcut(sc.id)}>Press {sc.key}</Button
          >
        {/each}
        {#if app.features.shortcuts.pickerKey}
          <Button size="sm" variant="outline" title="Opens the playlist picker" onclick={pressPickerKey}
            >Press {app.features.shortcuts.pickerKey}</Button
          >
        {/if}
      {/if}
      {#if app.undoKey}
        <Button size="sm" variant="outline" title="Undoes the toast on screen" onclick={pressUndoKey}>Press {app.undoKey}</Button>
      {/if}
    </div>

    <label class="flex items-center gap-2 text-xs">
      <Checkbox bind:checked={yt.showHover} />
      Show hover buttons on every card
    </label>
    <p class="text-xs text-neutral-500">Right-click a card to see the card menu (or the browser's menu).</p>
  </section>

  <p class="flex items-center gap-2 text-xs text-neutral-600">
    <span class="ext-mark inline-block h-3 w-5 rounded-sm"></span> Dashed outline = drawn by Playlist Tools
  </p>
</div>
