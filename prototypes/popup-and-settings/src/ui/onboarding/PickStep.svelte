<script lang="ts">
  // Step 1, "What should Playlist Pigeon do?" (ticket 19 §4.2). Settings sync comes first (ticket 16 §5.3 step 4):
  // turning it on looks for synced settings for up to 10 s and pre-ticks what they have, marked "From sync", for
  // review. Then every feature, grouped by site, all unticked, each with its footprint tag.
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import Info from "@lucide/svelte/icons/info";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import { Switch } from "$ui/components/ui/switch/index.js";
  import { Button } from "$ui/components/ui/button/index.js";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import FeaturePick from "./FeaturePick.svelte";
  import { featuresOf } from "$shared/features/registry";
  import type { FeatureId } from "$shared/model/types";
  import { act, isMusic, ui } from "$lib/view.svelte";
  import { param } from "$lib/params";

  let {
    picked = $bindable(),
    fromSync = $bindable(),
    oncontinue,
  }: { picked: FeatureId[]; fromSync: FeatureId[]; oncontinue: () => void } = $props();

  // Prototype: ?sync=found makes a synced copy arrive; otherwise none does.
  const SYNCED: FeatureId[] = ["autoAdd", "shortcuts", "musicQuickActions"];
  let phase = $state<"off" | "looking" | "found" | "none">("off");
  const browserSync = $derived(ui.s.env.browser === "firefox" ? "Firefox's" : "Chrome's");

  async function toggleSync(on: boolean) {
    await act({ kind: "sync", on });
    if (!on) {
      phase = "off";
      return;
    }
    phase = "looking";
    setTimeout(() => {
      if (param("sync") === "found") {
        phase = "found";
        fromSync = SYNCED;
        picked = [...new Set([...picked, ...SYNCED])];
      } else phase = "none";
    }, 2200);
  }

  function set(id: FeatureId, on: boolean) {
    picked = on ? [...picked, id] : picked.filter((x) => x !== id);
  }

  const n = $derived(picked.length);
  const askMusicAccess = $derived(ui.s.env.browser === "chrome" && !ui.s.env.access.music && picked.some(isMusic));
</script>

<section>
  <h1 class="text-[30px] leading-tight font-semibold tracking-[-0.022em]">What should Playlist Pigeon do?</h1>
  <p class="text-muted-foreground mt-2 text-[15px]">Tick what you want. Everything else stays off.</p>

  <!-- Settings sync first: it may bring this browser's choices with it. -->
  <div class="bg-card mt-7 rounded-xl border p-4 {ui.s.sync.on ? 'border-primary/40' : ''}">
    <div class="flex items-start gap-3.5">
      <span
        class="inline-flex size-[34px] shrink-0 items-center justify-center rounded-[10px] {ui.s.sync.on ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'}"
        aria-hidden="true"><RefreshCw class="size-[18px] {phase === 'looking' ? 'animate-spin [animation-duration:2s]' : ''}" strokeWidth={1.9} /></span
      >
      <div class="min-w-0 flex-1">
        <p class="text-[15px] leading-6 font-semibold">Settings sync</p>
        <p class="text-muted-foreground text-[13.5px] leading-[1.5]">
          Use Playlist Pigeon in another browser already? Turn on Settings sync to bring your settings here.
        </p>
        <p class="text-muted-foreground/80 mt-1 text-xs">Uses {browserSync} own sync.</p>
      </div>
      <Switch class="mt-1" checked={ui.s.sync.on} aria-label="Settings sync" onCheckedChange={toggleSync} />
    </div>
    {#if phase !== "off"}
      <div class="mt-3.5 ml-[48px] flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-[1.45]
        {phase === 'found' ? 'bg-success-soft' : 'bg-muted/70'}" aria-live="polite">
        {#if phase === "looking"}
          <LoaderCircle class="text-muted-foreground mt-px size-4 shrink-0 animate-spin" />
          <span>Looking for synced settings from your other browsers… This can take up to 10 seconds.</span>
        {:else if phase === "found"}
          <CircleCheck class="text-success mt-px size-4 shrink-0" />
          <span>
            <strong class="font-semibold">Found your synced settings.</strong> What they turn on is ticked below and marked
            <em class="not-italic font-medium">From sync</em>. Review it before you continue; you agree here for this browser.
          </span>
        {:else}
          <Info class="text-muted-foreground mt-px size-4 shrink-0" />
          <span>No synced settings yet. What you pick here becomes the synced copy for your other browsers.</span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="mt-9 flex items-end justify-between gap-4">
    <h2 class="text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase">On YouTube</h2>
  </div>
  <p class="text-muted-foreground mt-1.5 flex items-center gap-2 text-[13px]">
    <EyeOff class="size-3.5 shrink-0" />Pick only features that don't change the page, and YouTube looks exactly as it does now.
  </p>
  <div class="mt-3 grid gap-2.5">
    {#each featuresOf("youtube") as f (f.id)}
      <FeaturePick
        id={f.id}
        checked={picked.includes(f.id)}
        badge={fromSync.includes(f.id) ? "From sync" : undefined}
        onchange={(v) => set(f.id, v)}
      />
    {/each}
  </div>

  <h2 class="text-muted-foreground mt-9 text-xs font-semibold tracking-[0.08em] uppercase">On YouTube Music</h2>
  <div class="mt-3 grid gap-2.5">
    {#each featuresOf("music") as f (f.id)}
      <FeaturePick
        id={f.id}
        checked={picked.includes(f.id)}
        badge={fromSync.includes(f.id) ? "From sync" : undefined}
        onchange={(v) => set(f.id, v)}
      />
    {/each}
  </div>
  {#if askMusicAccess}
    <p class="text-muted-foreground mt-3 flex items-center gap-2 text-[13px]">
      <Info class="size-4 shrink-0" />Chrome will ask for access to music.youtube.com when you agree.
    </p>
  {/if}

  <!-- Sticky footer: the count and the way on stay in view on a long list. -->
  <div class="sticky bottom-0 z-10 -mx-6 mt-8 px-6 pt-3 pb-5">
    <div
      class="bg-card/90 shadow-float flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border py-3 pr-3 pl-5 backdrop-blur-md"
    >
      <p class="text-muted-foreground max-w-[330px] text-[13px] leading-[1.45]">
        Nothing changes on YouTube until you pick it. You can change this any time in Settings.
      </p>
      <Button size="lg" onclick={oncontinue}>
        {n ? `Continue with ${n} feature${n === 1 ? "" : "s"}` : "Continue without features"}
        <ArrowRight />
      </Button>
    </div>
  </div>
</section>
