<script lang="ts">
  import type { CloseRequest, PlaylistChooserProps } from "./types"
  import { buttonClass } from "../components/button"
  import PickerIcon from "./PickerIcon.svelte"

  let {
    open, context, current, label, availability, createSource, text, platform,
    watchLaterEveryAccount = false, onrequest, onoutcome, onrelease, onhelp
  }: PlaylistChooserProps = $props()
  const uid = $props.id()
  let trigger: HTMLButtonElement | null = $state(null)
  let content: HTMLDivElement | null = $state(null)
  let returnFocus = false
  const explanation = $derived(context.private && context.purpose.kind === "gather"
    ? text.label("privateGather") : availability.kind === "disabled" ? availability.explanation : null)
  const disabled = $derived(explanation !== null)
  const visible = $derived(open && !disabled)
  const title = $derived(current.kind === "none" ? text.label("noneChosen") : text.rowTitle(current, watchLaterEveryAccount))

  // The popover, the picker and Bits UI load on the first open (G43, Q-PERF-31), so a closed chooser costs only its button.
  let popover = $state.raw<typeof import("./ChooserPopover.svelte") | null>(null)
  let loading: Promise<void> | null = null
  $effect(() => {
    if (!visible || loading) return
    loading = import("./ChooserPopover.svelte").then(module => { popover = module }, () => { loading = null })
  })

  function requestClose(request: CloseRequest) {
    returnFocus = request.reason !== "dismiss"
    onrequest({ kind: "close", reason: request.reason })
  }

  function requestedOpen(next: boolean) {
    if (disabled) return
    if (next) { returnFocus = false; onrequest({ kind: "open" }) }
    else requestClose({ reason: document.activeElement === trigger ? "trigger" : "dismiss" })
  }

  // Bits UI's popover trigger activates on a primary click, or on Enter or Space at keydown; this button does the same.
  function onclick(event: MouseEvent) {
    if (event.button === 0) requestedOpen(!visible)
  }
  function onkeydown(event: KeyboardEvent) {
    if (disabled || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    requestedOpen(!visible)
  }

  function closeFocus(event: Event) {
    event.preventDefault()
    const active = document.activeElement
    if (!disabled && trigger?.isConnected && (returnFocus || active === document.body || active === content || (active !== null && content?.contains(active)))) {
      trigger.focus({ preventScroll: true })
    }
    returnFocus = false
  }
</script>

<div class="chooser">
  <button
    bind:this={trigger} type="button" {disabled} {onclick} {onkeydown}
    aria-haspopup="dialog"
    aria-expanded={visible}
    aria-controls={visible && content ? content.id : undefined}
    data-state={visible ? "open" : "closed"}
    aria-label={text.chooserName(label, title)}
    aria-describedby={disabled ? `${uid}-disabled` : undefined}
    class="{buttonClass('outline')} chooser-trigger"
    title={explanation ?? undefined}
  ><span class="current-title">{title}</span><PickerIcon name="chevron" /></button>
  {#if popover && trigger}
    <popover.default
      bind:content open={visible} {disabled} {trigger} id="{uid}-picker" {context} {createSource} {text} {platform} {watchLaterEveryAccount}
      onopenchange={requestedOpen} onrequestclose={requestClose} oncloseautofocus={closeFocus} {onoutcome} {onrelease} {onhelp}
    />
  {/if}
  {#if explanation}<p id="{uid}-disabled" class="disabled-explanation">{explanation}</p>{/if}
</div>

<style>
  .chooser { min-width: 0; }
  :global(.chooser-trigger) { width: 100%; justify-content: space-between; gap: .5rem; text-align: start; }
  .current-title { min-width: 0; overflow-wrap: anywhere; }
  .disabled-explanation { margin: .35rem 0 0; color: var(--muted-foreground); font-size: .75rem; line-height: 1.5; }
</style>
