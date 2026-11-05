<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import Modal from "../components/Modal.svelte"
  import Disclosure from "../components/Disclosure.svelte"
  import { createFirstRunOwner } from "../backend/first-run-owner"
  import { featurePermissionNeeds } from "../backend/shared-settings"
  import { createFirstRunText } from "../onboarding/text"
  import { firstRunFeatures, type PageFeatureId } from "../onboarding/features"
  import { isOn } from "../lib/held"
  import type { PageState } from "../lib/page-state.svelte"

  // "Before this feature can run" (UI-ONB-09, UI-POP-26): the disclosure and one Agree that turns this feature on.
  // It's a lazy part, because it carries the canonical catalogue the agreement pins.
  let { pageState, feature, name, onclose, variant = "sheet" }: {
    pageState: PageState
    feature: PageFeatureId
    name: string
    onclose: () => void
    variant?: "sheet" | "dialog"
  } = $props()
  const { backend, platform } = untrack(() => pageState.page)
  const loading = untrack(() => pageState.page.canonical()).then(full => {
    const text = createFirstRunText(full)
    const owner = createFirstRunOwner(backend, {
      account: { read: async () => ({ kind: "no-tab" }) }, playlists: { title: async () => undefined },
      chooser: { choose: async () => ({ kind: "unavailable" }) }, open: () => {}
    }, platform, text)
    return { full, text, owner }
  })
  let loaded = $state.raw<Awaited<typeof loading> | null>(null)
  void loading.then(value => { loaded = value })
  let attempt = 1
  let pending = $state(false)
  let result = $state<string | null>(null)

  function agree() {
    const settings = pageState.settings
    if (!settings || pending || !loaded) return
    const { full, text, owner } = loaded
    const device = pageState.ready?.device.kind === "current" ? pageState.ready.device.device : null
    const needs = featurePermissionNeeds({ kind: "feature", feature, value: true } as never, settings)
    // The prompt is asked first in the click, before anything is awaited (R53).
    const grant = needs.music || needs.browserMenu ? owner.requestPermissions(needs) : Promise.resolve({ music: false, browserMenu: false })
    pending = true; result = null
    void (async () => {
      const granted = await grant
      const denied = needs.music && !granted.music
      const selected = firstRunFeatures.map(row => row.id).filter(id => isOn(settings, id) || id === feature && !denied)
      const answer = await owner.agree({ attempt: attempt++, selected, syncOn: device?.syncOn ?? false, displayed: text.disclosure, permissions: Promise.resolve(granted) })
      pending = false
      await pageState.refreshAccess()
      if (answer.kind !== "agreed") { result = full.message("consentSheet_failed"); return }
      if (denied) { result = full.message("consentSheet_musicDenied", { feature: name }); return }
      onclose()
    })()
  }
</script>

<Modal {onclose} labelledby="consent-heading"
  class={variant === "sheet" ? "bg-card absolute inset-x-0 top-[58px] bottom-0 z-20 flex h-[calc(100%_-_58px)] w-full flex-col overflow-y-auto border-t p-4 shadow-lg" : "bg-card fixed inset-0 m-auto flex max-h-[80vh] w-[min(36rem,calc(100vw-3rem))] flex-col overflow-y-auto rounded-2xl p-6 shadow-xl"}
  >
  {#if loaded}
    <Disclosure context="feature" text={loaded.text.disclosure} browser={platform.browser} size={variant === "sheet" ? "sm" : "md"} level={2} headingId="consent-heading" />
    {#if result}<p role="status" class="text-warning mt-3 text-[12.5px]">{result}</p>{/if}
    <div class="mt-4 flex flex-wrap gap-2">
      <Button {pending} onclick={agree}>{loaded.full.message("consentSheet_agree", { feature: name })}</Button>
      <Button variant="outline" onclick={onclose}>{loaded.full.message("consentSheet_cancel")}</Button>
    </div>
  {/if}
</Modal>
