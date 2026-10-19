<script lang="ts">
  // THROWAWAY PROTOTYPE for ticket 09: where each 2.0 capability lives.
  // One web app with a surface switcher; fake data, no extension APIs, state in memory only.
  // URL: ?surface=<id>&scenario=<id>; ← → cycle surfaces.
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Braces from "@lucide/svelte/icons/braces";
  import Lightbulb from "@lucide/svelte/icons/lightbulb";
  import * as Sheet from "$lib/components/ui/sheet/index.js";
  import { app, surfaces, scenarios, applyScenario, go, snapshot, type Surface, type ScenarioId } from "$lib/state.svelte";
  import { notes } from "$lib/notes";
  import MapSurface from "./surfaces/MapSurface.svelte";
  import PopupSurface from "./surfaces/PopupSurface.svelte";
  import SettingsSurface from "./surfaces/SettingsSurface.svelte";
  import FirstRunSurface from "./surfaces/FirstRunSurface.svelte";
  import UpgradeSurface from "./surfaces/UpgradeSurface.svelte";
  import YouTubeSurface from "./surfaces/YouTubeSurface.svelte";
  import MusicSurface from "./surfaces/MusicSurface.svelte";
  import PermissionPrompt from "$lib/components/PermissionPrompt.svelte";

  const params = new URLSearchParams(location.search);
  const s = params.get("surface") as Surface | null;
  if (s && surfaces.some((x) => x.id === s)) app.surface = s;
  const sc = params.get("scenario") as ScenarioId | null;
  if (sc && scenarios.some((x) => x.id === sc)) applyScenario(sc);
  if (params.get("popup") === "open") app.popupOpen = true;

  let showNotes = $state(params.get("notes") !== "off");
  let showState = $state(false);

  const index = $derived(surfaces.findIndex((x) => x.id === app.surface));
  function cycle(d: number) {
    go(surfaces[(index + d + surfaces.length) % surfaces.length].id);
  }

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable], [role=slider], [role=tab], [role=radio], [role=menu], [role=listbox], [role=dialog]")) return;
    if (e.key === "ArrowLeft") cycle(-1);
    if (e.key === "ArrowRight") cycle(1);
  }

  function setScenario(id: ScenarioId) {
    applyScenario(id);
    const url = new URL(location.href);
    url.searchParams.set("scenario", id);
    history.replaceState(null, "", url);
  }

  const groups = $derived([...new Set(scenarios.map((x) => x.group))]);
</script>

<svelte:window {onkeydown} />

<div class="flex h-screen flex-col bg-neutral-100">
  <header class="flex flex-wrap items-center gap-x-3 gap-y-1 bg-zinc-900 px-4 py-2 text-white">
    <span class="rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold text-black">PROTOTYPE</span>
    <span class="text-sm font-medium">Ticket 09 · Where things live</span>
    <nav class="flex flex-wrap gap-1">
      {#each surfaces as x (x.id)}
        <button
          type="button"
          class="rounded-md px-2 py-1 text-xs {app.surface === x.id ? 'bg-white text-black' : 'text-zinc-300 hover:bg-zinc-700'}"
          onclick={() => go(x.id)}>{x.name}</button
        >
      {/each}
    </nav>
    <span class="flex-1"></span>
    <label class="flex items-center gap-2 text-xs text-zinc-300">
      Scenario
      <select
        class="rounded bg-zinc-800 px-2 py-1 text-xs text-white"
        value={app.scenario}
        onchange={(e) => setScenario((e.currentTarget as HTMLSelectElement).value as ScenarioId)}
      >
        {#each groups as g (g)}
          <optgroup label={g}>
            {#each scenarios.filter((x) => x.group === g) as x (x.id)}
              <option value={x.id}>{x.name}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </label>
    <button
      type="button"
      class="flex items-center gap-1 rounded-md px-2 py-1 text-xs {showNotes ? 'bg-amber-300 text-black' : 'text-zinc-300 hover:bg-zinc-700'}"
      onclick={() => (showNotes = !showNotes)}><Lightbulb class="size-3.5" /> What to look at</button
    >
    <button
      type="button"
      class="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
      onclick={() => (showState = true)}><Braces class="size-3.5" /> State</button
    >
  </header>

  <div class="flex min-h-0 flex-1">
    <main class="min-w-0 flex-1 overflow-auto">
      {#if app.surface === "map"}<MapSurface />
      {:else if app.surface === "popup"}<PopupSurface />
      {:else if app.surface === "settings"}<SettingsSurface />
      {:else if app.surface === "first-run"}<FirstRunSurface />
      {:else if app.surface === "upgrade"}<UpgradeSurface />
      {:else if app.surface === "youtube"}<YouTubeSurface />
      {:else if app.surface === "music"}<MusicSurface />
      {/if}
    </main>
    {#if showNotes}
      <aside class="w-80 shrink-0 overflow-auto border-l border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 class="mb-2 flex items-center gap-1.5 font-semibold"><Lightbulb class="size-4" /> {notes[app.surface].title}</h2>
        <ul class="list-disc space-y-2 pl-4">
          {#each notes[app.surface].points as p (p)}<li>{p}</li>{/each}
        </ul>
        <p class="mt-4 text-xs text-amber-800">
          Scenario: <b>{scenarios.find((x) => x.id === app.scenario)?.name}</b>. {scenarios.find((x) => x.id === app.scenario)?.hint}.
        </p>
      </aside>
    {/if}
  </div>

  <div
    class="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900/95 px-2 py-1.5 text-white shadow-2xl ring-1 ring-white/20"
  >
    <button type="button" class="rounded-full p-1 hover:bg-zinc-700" aria-label="Previous surface" onclick={() => cycle(-1)}
      ><ChevronLeft class="size-4" /></button
    >
    <span class="min-w-56 px-2 text-center text-xs"
      ><span class="text-zinc-400">{index + 1}/{surfaces.length}</span> {surfaces[index].name}</span
    >
    <button type="button" class="rounded-full p-1 hover:bg-zinc-700" aria-label="Next surface" onclick={() => cycle(1)}
      ><ChevronRight class="size-4" /></button
    >
  </div>
</div>

<PermissionPrompt />

<Sheet.Root bind:open={showState}>
  <Sheet.Content side="right" class="w-[32rem] sm:max-w-[32rem]">
    <Sheet.Header>
      <Sheet.Title>Full prototype state</Sheet.Title>
      <Sheet.Description>Everything in memory right now. Reload the page to reset.</Sheet.Description>
    </Sheet.Header>
    <pre class="mx-4 mb-4 flex-1 overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-snug text-zinc-100">{JSON.stringify(
        showState ? snapshot() : {},
        null,
        2,
      )}</pre>
  </Sheet.Content>
</Sheet.Root>
