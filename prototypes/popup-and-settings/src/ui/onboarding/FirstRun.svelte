<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 15). First run (ticket 09's flow, ticket 19 §4's copy): it opens once in a tab on
  // install. Pick features › Before you start (the store disclosure and consent) › Finish setting up.
  // Nothing is written until Agree, except Settings sync, which looks for synced settings to pre-tick (ticket 16).
  import PigeonMark from "$ui/components/PigeonMark.svelte";
  import StepIndicator from "./StepIndicator.svelte";
  import PickStep from "./PickStep.svelte";
  import ConsentStep from "./ConsentStep.svelte";
  import Lazy from "$ui/components/Lazy.svelte";
  import type { FeatureId } from "$shared/model/types";
  import { act, ui } from "$lib/view.svelte";
  import { param } from "$lib/params";

  const want = param("step");
  let step = $state<1 | 2 | 3 | "notnow">(want === "2" ? 2 : want === "3" ? 3 : want === "notnow" ? "notnow" : 1);
  // A first run opened again (from Review) starts from what's on now. Screenshots that open a later step directly
  // get a sensible pick (agreed, for step 3) so that step has something to show.
  function initialPicks(): FeatureId[] {
    const on = (Object.keys(ui.s.features) as FeatureId[]).filter((id) => ui.s.features[id].on);
    if (on.length || !(want === "2" || want === "notnow" || want === "3")) return on;
    const demo: FeatureId[] = ["autoAdd", "shortcuts", "quickSave", "musicQuickActions"];
    if (want === "3" && ui.s.consent !== "accepted") act({ kind: "consent", accepted: true, turnOn: demo });
    return demo;
  }
  let picked = $state<FeatureId[]>(initialPicks());
  let fromSync = $state<FeatureId[]>([]);

  function go(s: typeof step) {
    step = s;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
</script>

<div class="mx-auto max-w-[700px] px-6 pt-12 pb-10">
  <header>
    <div class="flex items-center gap-3.5">
      <PigeonMark size={56} title="Playlist Pigeon" />
      <div class="leading-tight">
        <p class="text-muted-foreground text-[13px] font-medium">Welcome to</p>
        <p class="text-[22px] font-semibold tracking-[-0.015em]">Playlist Pigeon</p>
      </div>
    </div>
    <p class="text-muted-foreground mt-4 max-w-[560px] text-[14.5px] leading-relaxed">
      Files the YouTube videos you watch into your own playlists, and puts YouTube Music's queue, save and like one click
      away. Every part is a feature you switch on yourself.
    </p>
    <div class="mt-8 overflow-x-auto pb-1">
      <StepIndicator current={step === "notnow" ? 2 : step} />
    </div>
  </header>

  <main class="mt-9">
    {#if step === 1}
      <PickStep bind:picked bind:fromSync oncontinue={() => go(2)} />
    {:else if step === 2 || step === "notnow"}
      <ConsentStep {picked} notNow={step === "notnow"} onback={() => go(1)} onagreed={() => go(3)} onnotnow={() => go("notnow")} onreturn={() => go(2)} />
    {:else}
      <Lazy load={() => import("./FinishStep.svelte")} props={{ picked }} />
    {/if}
  </main>
</div>
