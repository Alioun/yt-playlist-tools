<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import { createI18n } from "../../../src/shared/i18n"
  import catalogue from "../../../src/public/_locales/en/messages.json"
  import { scriptedMessages } from "../localization/scripted"
  import { createPickerText, PickerPanel, PlaylistChooser } from "../../../src/ui/picker"
  import type { PickerEvent, PickerPurpose } from "../../../src/ui/picker"
  import { choiceSource, chooserContext, id, makePicker, scenarios } from "./scenarios"
  import type { Scenario } from "./scenarios"

  let { scenario, markSrc, pseudo = false }: { scenario: Scenario; markSrc: string; pseudo?: boolean } = $props()
  const text = untrack(() => createPickerText(createI18n(scriptedMessages({ pseudo }), catalogue)))
  const picker = untrack(() => scenario === "chooser" ? null : makePicker(scenario, markSrc))
  const context = chooserContext()
  let open = $state(false)
  let latest = $state("No synthetic outcome yet.")
  let closed = $state(false)
  const purpose = untrack((): PickerPurpose => picker?.mode === "many" ? { kind: "many" } : picker?.mode === "choose" ? { kind: "quickSave" } : { kind: "save" })
  const sourceFactory = () => choiceSource("chooser", markSrc).source

  function outcome(event: PickerEvent) {
    latest = JSON.stringify(event, (key, value: unknown) => key === "undo" ? "synthetic callable" : value)
  }
  onDestroy(() => picker?.close())
</script>

<main>
  <header class="fixture-heading"><img src={markSrc} alt="" /><h1>Synthetic picker fixture</h1></header>
  <p>Deterministic synthetic data. No YouTube, Backend, storage, or account connection.</p>
  <nav aria-label="Synthetic scenarios">
    {#each scenarios as name}<a href="?scenario={name}&theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}">{name}</a>{/each}
  </nav>
  {#if scenario === "chooser"}
    <PlaylistChooser
      {open} {context} current={{ kind: "playlist", id: id("PLbeta"), title: "Synthetic current playlist" }}
      label={text.heading(context.purpose, context.site).title} availability={{ kind: "available" }}
      createSource={sourceFactory} {text} platform="linux"
      onrequest={request => { open = request.kind === "open" }} onoutcome={outcome}
      onrelease={event => { event.picker.close(); latest = JSON.stringify({ synthetic: true, kind: event.kind, reason: event.reason, pending: event.pending.length }) }}
    />
  {:else if picker && !closed}
    <div class="picker-frame">
      <PickerPanel {picker} {text} purpose={purpose} platform="linux" watchLaterEveryAccount onoutcome={outcome} onrequestclose={() => { picker.close(); closed = true }} />
    </div>
  {:else}<p role="status">The synthetic local container is closed.</p>{/if}
  <output aria-label="Synthetic model outcome">{latest}</output>
</main>

<style>
  main { width: min(44rem, 100%); margin-inline: auto; padding: 1.5rem; }
  .fixture-heading { display: flex; align-items: center; gap: .75rem; }
  .fixture-heading img { width: 2rem; height: 2rem; }
  h1 { font-size: 1.25rem; font-weight: 650; }
  p, nav, output { font-size: .8rem; color: var(--muted-foreground); line-height: 1.6; }
  nav { display: flex; flex-wrap: wrap; gap: .25rem .75rem; margin-block: 1rem; }
  a { color: var(--primary); text-underline-offset: 3px; }
  .picker-frame { width: min(27rem, 100%); max-height: min(35rem, calc(100dvh - 2rem)); border: 1px solid var(--border); border-radius: .75rem; overflow: hidden; }
  output { display: block; margin-top: 1rem; overflow-wrap: anywhere; }
</style>
