<script lang="ts">
  import "../parts/parts.css";
  // THROWAWAY PROTOTYPE (ticket 15), variant C: "Status first". Same order as ticket 09 (header › strip › banner ›
  // tabs › status › features), different weight: "right now" leads with a large card (progress ring, outcomes, the
  // three things you'd do to this video), and the features shrink to a grid of switch tiles whose choices open as
  // pages. Strong for "what's happening to this video", weak for scanning what each feature is set to.
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Pause from "@lucide/svelte/icons/pause";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Lazy from "$ui/components/Lazy.svelte";
  import FeatureIcon from "$ui/components/FeatureIcon.svelte";
  import { Switch } from "$ui/components/ui/switch/index.js";
  import SiteTabs from "../SiteTabs.svelte";
  import Header from "../Header.svelte";
  import Banner from "../Banner.svelte";
  import Strip from "../Strip.svelte";
  import SubPage from "./SubPage.svelte";
  import { banner as pickBanner } from "$lib/notices";
  import { tabAccount, act, autoAddFor, heldBy, healthOf, setFeature, thisVideoStatus, titleOf, ui } from "$lib/view.svelte";
  import { closePicker, openPicker, sheet } from "../sheet.svelte";
  import { runBannerAction } from "../actions";
  import { featuresOf } from "$shared/features/registry";
  import type { FeatureId } from "$shared/model/types";

  let tab = $state<"youtube" | "music">(ui.s.env.activeSite === "music" ? "music" : "youtube");
  let menuOpen = $state(false);
  let page = $state<FeatureId | null>(null);
  const banner = $derived(pickBanner(tab));
  const v = $derived(ui.tab.state === "ready" ? ui.tab.video : null);
  const st = $derived(v ? thisVideoStatus(v) : null);
  const acct = $derived(tabAccount());
  const pages: FeatureId[] = ["autoAdd", "shortcuts", "quickSave", "musicQuickActions", "musicShortcuts"];
  const R = 30;
  const C = 2 * Math.PI * R;
</script>

<div class="bg-background text-foreground relative flex h-[600px] w-[360px] flex-col overflow-hidden text-[13px]">
  <Header bind:menuOpen />
  <Strip />
  {#if banner}<Banner {banner} onaction={runBannerAction} />{/if}
  <SiteTabs bind:value={tab} here={ui.s.env.activeSite} />
  <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
    {#if tab === "youtube"}
      {#if v && st}
        <section class="bg-card rounded-2xl border p-3.5">
          <div class="flex items-center gap-3.5">
            <svg viewBox="0 0 72 72" class="size-[72px] shrink-0 -rotate-90" aria-hidden="true">
              <defs>
                <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14A39A" /><stop offset="1" stop-color="#7B5CD6" /></linearGradient>
              </defs>
              <circle cx="36" cy="36" r={R} fill="none" stroke="var(--muted)" stroke-width="7" />
              <circle cx="36" cy="36" r={R} fill="none" stroke="url(#ring)" stroke-width="7" stroke-linecap="round" stroke-dasharray="{(C * v.progress) / 100} {C}" />
              {#each st.goals as g (g)}
                <line
                  x1={36 + R - 6}
                  y1="36"
                  x2={36 + R + 6}
                  y2="36"
                  stroke={g <= v.progress ? "var(--success)" : "var(--foreground)"}
                  stroke-opacity="0.6"
                  stroke-width="2"
                  transform="rotate({(g / 100) * 360} 36 36)"
                />
              {/each}
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{v.kind === "short" ? "This Short" : "This video"}</div>
              <div class="line-clamp-2 text-[13px] leading-[18px] font-medium">{v.title}</div>
              <div class="mt-1 text-xs {st.tone === 'done' ? 'text-success' : 'text-muted-foreground'}">
                <span class="text-foreground text-[15px] font-semibold tabular-nums">{v.progress} %</span> watched · {st.text.replace(/ · \d+ % watched$/, "")}
              </div>
            </div>
          </div>
          {#if autoAddFor(acct).length}
            <div class="mt-3 flex flex-wrap gap-1">
              {#each autoAddFor(acct) as pid (pid)}
                <span
                  class="inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium {v.outcomes[pid] === 'added'
                    ? 'border-success/40 bg-success-soft text-success'
                    : 'text-muted-foreground'}">{titleOf(pid)}</span
                >
              {/each}
            </div>
          {/if}
          <div class="mt-3 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              class="bg-muted/60 hover:bg-muted flex flex-col items-center gap-1 rounded-xl py-2 text-[11.5px] font-medium"
              onclick={() => acct && openPicker({ mode: "save", site: "youtube", acct, item: { id: v.id, title: v.title, kind: v.kind } })}
              ><Bookmark class="size-4" />Save to…</button
            >
            <button
              type="button"
              class="bg-muted/60 hover:bg-muted flex flex-col items-center gap-1 rounded-xl py-2 text-[11.5px] font-medium"
              onclick={() => act({ kind: "skipVideo", skip: !v.skipped })}
              >{#if v.skipped}<Undo2 class="size-4" />Auto-add it{:else}<EyeOff class="size-4" />Skip this one{/if}</button
            >
            <button
              type="button"
              class="bg-muted/60 hover:bg-muted flex flex-col items-center gap-1 rounded-xl py-2 text-[11.5px] font-medium"
              onclick={() => act({ kind: "pause", paused: !ui.s.features.autoAdd.paused })}
              ><Pause class="size-4" />{ui.s.features.autoAdd.paused ? "Resume" : "Pause all"}</button
            >
          </div>
        </section>
      {:else}
        <section class="bg-card text-muted-foreground rounded-2xl border p-4 text-center text-xs">No video in this tab. Features still work everywhere on YouTube.</section>
      {/if}
    {:else}
      <Lazy load={() => import("../MusicTab.svelte")} />
    {/if}

    <div class="grid grid-cols-2 gap-2">
      {#each featuresOf(tab) as def (def.id)}
        {@const on = ui.s.features[def.id].on}
        {@const opens = on && pages.includes(def.id)}
        <div
          class="bg-card relative flex min-h-[92px] flex-col rounded-xl border p-2.5 {opens ? 'hover:border-foreground/20 cursor-pointer' : ''}"
          role={opens ? "button" : undefined}
          tabindex={opens ? 0 : undefined}
          onclick={(e) => opens && !(e.target as HTMLElement).closest("[role=switch]") && (page = def.id)}
          onkeydown={(e) => opens && e.key === "Enter" && (page = def.id)}
        >
          <div class="flex items-start justify-between">
            <FeatureIcon id={def.id} {on} size={28} />
            <Switch size="sm" checked={on} held={on && !!heldBy(def.id)} aria-label={def.name} onCheckedChange={(x) => setFeature(def.id, x)} />
          </div>
          <div class="mt-auto pt-2 text-[12.5px] leading-4 font-medium">{def.name}</div>
          <div class="text-muted-foreground mt-0.5 flex items-center text-[11px] leading-4">
            {#if on && healthOf(def.id) !== "working"}<span class="text-warning">{healthOf(def.id) === "broken" ? "Not working" : "Partly working"}</span>
            {:else}{on ? "On" : "Off"}{/if}
            {#if opens}<ChevronRight class="ml-auto size-3.5" />{/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if page}<SubPage id={page} onback={() => (page = null)} />{/if}
  {#if menuOpen}
    <Lazy load={() => import("../parts/AccountMenu.svelte")} props={{ onclose: () => (menuOpen = false) }} />
  {/if}
  {#if sheet.req}
    <Lazy load={() => import("../parts/PickerSheet.svelte")} props={{ req: sheet.req, onclose: closePicker }} />
  {/if}
  {#if ui.consentAsk}
    <Lazy load={() => import("../parts/ConsentSheet.svelte")} />
  {/if}
</div>
