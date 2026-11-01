<script lang="ts">
  import Button from "../components/Button.svelte"
  import Disclosure from "../components/Disclosure.svelte"
  import Glyph from "../components/Glyph.svelte"
  import type { FirstRunText } from "./text"
  import type { BrowserKind } from "./features"
  import type { FirstRunFlow } from "./flow.svelte"

  let { flow, browser, text }: { flow: FirstRunFlow; browser: BrowserKind; text: FirstRunText } = $props()

  const firstRunCopy = $derived(text.copy)
  const copy = $derived(firstRunCopy.consent)
  const uid = $props.id()
  const n = $derived(flow.picked.length)
  const pending = $derived(flow.agreement.kind === "pending")
</script>

{#if flow.step === "not-now"}
  <section class="bg-card rounded-2xl border p-8 text-center" aria-labelledby="{uid}-not-now">
    <span class="bg-muted text-muted-foreground mx-auto inline-flex size-12 items-center justify-center rounded-full" aria-hidden="true">
      <Glyph name="moon" class="size-6" />
    </span>
    <h1 id="{uid}-not-now" tabindex="-1" data-step-heading class="mt-4 text-[22px] font-semibold tracking-[-0.015em] outline-none">{firstRunCopy.notNow.strong}</h1>
    <p class="text-muted-foreground mx-auto mt-2 max-w-[440px] text-[14.5px] leading-relaxed">{firstRunCopy.notNow.rest}</p>
    <Button class="mt-6" variant="outline" size="lg" onclick={() => flow.back()}><Glyph name="arrow-left" />{firstRunCopy.notNow.back}</Button>
  </section>
{:else}
  <Disclosure context="first-run" {browser} text={text.disclosure}>
    {#snippet lead()}
      <p class="text-muted-foreground mt-2 text-[15px]">{copy.lead(n)}</p>
      {#if n}
        <ul class="mt-5 flex flex-wrap gap-2" aria-label={copy.picked}>
          {#each flow.picked as id (id)}
            <li class="bg-card inline-flex min-h-8 items-center rounded-full border px-3 text-[13px] font-medium">{text.features.featureOf(id).name}</li>
          {/each}
        </ul>
      {/if}
    {/snippet}
  </Disclosure>

  <div aria-live="polite">
    {#if flow.agreement.kind === "failed"}
      <p role="alert" class="border-warning-border bg-warning-soft mt-6 flex items-start gap-2 rounded-xl border p-4 text-[13.5px] leading-[1.5]">
        <Glyph name="circle-alert" class="text-warning mt-0.5 size-4 shrink-0" />{copy.refused[flow.agreement.reason]}
      </p>
    {:else if pending}
      <p class="sr-only">{copy.agreeing}</p>
    {/if}
  </div>

  <div class="mt-7 flex flex-wrap items-center gap-3">
    <Button variant="brand" size="lg" {pending} onclick={() => flow.agree()}>{copy.agree(n)}</Button>
    <Button variant="outline" size="lg" disabled={pending} onclick={() => flow.notNow()}>{copy.notNow}</Button>
    <Button variant="ghost" size="lg" class="sm:ml-auto" disabled={pending} onclick={() => flow.changeFeatures()}>
      <Glyph name="arrow-left" />{copy.change}
    </Button>
  </div>
{/if}
