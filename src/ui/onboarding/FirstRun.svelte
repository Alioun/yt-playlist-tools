<script lang="ts">
  import { onDestroy, tick } from "svelte"
  import Mark from "../components/Mark.svelte"
  import StepIndicator from "../components/StepIndicator.svelte"
  import ConsentStep from "./ConsentStep.svelte"
  import PickStep from "./PickStep.svelte"
  import type { FirstRunText } from "./text"
  import { createFirstRun, type Step } from "./flow.svelte"
  import type { FirstRunOwner } from "./owner"

  // The first-run page (UI-ONB-01 to UI-ONB-05). Its owner is the only way out: no storage, tabs or permissions here.
  let { owner, markSrc, text }: { owner: FirstRunOwner; markSrc: string; text: FirstRunText } = $props()

  // A new owner or language needs a new mount so the visible agreement and its owner stay together.
  // svelte-ignore state_referenced_locally
  const session = { owner, text }
  const flow = createFirstRun(session.owner, session.text)
  onDestroy(() => flow.dispose())

  const firstRunCopy = session.text.copy
  let root = $state<HTMLElement>()
  const current = $derived(({ pick: 1, consent: 2, "not-now": 2, finish: 3 } as const satisfies Record<Step, number>)[flow.step])

  let finish: Promise<typeof import("./FinishStep.svelte")> | undefined
  const loadFinish = () => finish ??= import("./FinishStep.svelte")

  let shown: Step = flow.step
  $effect(() => {
    const step = flow.step
    if (step === shown) return
    shown = step
    const rendered = step === "finish" ? loadFinish().then(() => tick()) : tick()
    void rendered.then(() => {
      root?.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true })
      root?.scrollIntoView?.({ block: "start" })
    })
  })
</script>

<div class="bg-brand-wash min-h-screen">
  <div bind:this={root} class="mx-auto max-w-[700px] px-6 pt-8 pb-10 sm:pt-12">
    <header>
      <div class="flex items-center gap-3.5">
        <Mark src={markSrc} size={56} />
        <p class="text-[22px] leading-tight font-semibold tracking-[-0.015em]">{firstRunCopy.welcome}</p>
      </div>
      <p class="text-muted-foreground mt-4 max-w-[560px] text-[14.5px] leading-relaxed">{firstRunCopy.intro}</p>
      <div class="mt-6 overflow-x-auto pb-1 sm:mt-8">
        <StepIndicator steps={firstRunCopy.steps} {current} label={firstRunCopy.stepsLabel} formatNumber={session.text.number} />
      </div>
    </header>

    <main class="mt-7 sm:mt-9">
      {#if flow.step === "pick"}
        <PickStep {flow} browser={session.owner.browser} text={session.text} />
      {:else if flow.step === "consent" || flow.step === "not-now"}
        <ConsentStep {flow} browser={session.owner.browser} text={session.text} />
      {:else}
        {#await loadFinish() then finishStep}
          <finishStep.default owner={session.owner} text={session.text} />
        {/await}
      {/if}
    </main>
  </div>
</div>
