<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import { Popover } from "bits-ui"
  import { PickerModel } from "../../shared/picker/model.svelte"
  import type { ChooserContext, CloseRequest, PlaylistChooserProps } from "./types"
  import { buttonClass } from "../components/button"
  import PickerPanel from "./PickerPanel.svelte"
  import PickerIcon from "./PickerIcon.svelte"

  let {
    open, context, current, label, availability, createSource, text, platform,
    watchLaterEveryAccount = false, onrequest, onoutcome, onrelease, onhelp
  }: PlaylistChooserProps = $props()
  const uid = $props.id()
  let trigger: HTMLButtonElement | null = $state(null)
  let content: HTMLDivElement | null = $state(null)
  let returnFocus = false
  let nextSession = 0
  let session = $state.raw<{
    readonly serial: number
    readonly key: string
    readonly context: ChooserContext
    readonly factory: PlaylistChooserProps["createSource"]
    readonly picker: PickerModel
    readonly pending: Set<Promise<import("./types").PickerEvent>>
  } | null>(null)
  const explanation = $derived(context.private && context.purpose.kind === "gather"
    ? text.label("privateGather") : availability.kind === "disabled" ? availability.explanation : null)
  const disabled = $derived(explanation !== null)
  const visible = $derived(open && !disabled)
  const title = $derived(current.kind === "none" ? text.label("noneChosen") : text.rowTitle(current, watchLaterEveryAccount))

  $effect.pre(() => {
    const wanted = visible
    const scoped = context
    const key = JSON.stringify([context.account, context.site, context.private, context.purpose])
    const factory = createSource
    untrack(() => {
      if (session && (!wanted || session.key !== key || session.factory !== factory)) {
        const previous = session
        session = null
        onrelease({ kind: "released", reason: wanted ? "context" : disabled ? "disabled" : "caller", context: previous.context, picker: previous.picker, pending: [...previous.pending] })
      }
      if (wanted && session === null) {
        session = { serial: ++nextSession, key, context: scoped, factory, pending: new Set(), picker: new PickerModel({ source: factory(scoped), site: scoped.site, mode: "choose" }) }
      }
    })
  })

  onDestroy(() => {
    if (!session) return
    onrelease({ kind: "released", reason: "unmount", context: session.context, picker: session.picker, pending: [...session.pending] })
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
  <Popover.Root bind:open={() => visible, requestedOpen}>
    <Popover.Trigger
      bind:ref={trigger} {disabled}
      aria-label={text.chooserName(label, title)}
      aria-describedby={disabled ? `${uid}-disabled` : undefined}
      class="{buttonClass('outline')} chooser-trigger"
      title={explanation ?? undefined}
    ><span class="current-title">{title}</span><PickerIcon name="chevron" /></Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        bind:ref={content}
        class="chooser-popover"
        role="dialog"
        aria-label={text.heading(context.purpose, context.site).title}
        side="bottom" align="start" sideOffset={6} collisionPadding={12} avoidCollisions
        strategy="fixed" hideWhenDetached trapFocus
        onOpenAutoFocus={event => {
          event.preventDefault()
          content?.querySelector<HTMLInputElement>("input[data-picker-search]")?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={closeFocus}
        onEscapeKeydown={event => {
          event.preventDefault()
          event.stopPropagation()
          requestClose({ reason: "escape" })
        }}
      >
        {#if session}
          {@const active = session}
          {#key active.serial}
            <PickerPanel
              picker={active.picker} {text} purpose={active.context.purpose} {platform} {watchLaterEveryAccount} {onhelp}
              onrequestclose={requestClose}
              onpending={answer => { active.pending.add(answer); void answer.then(() => active.pending.delete(answer)) }}
              onoutcome={event => { if (session?.serial === active.serial && !active.picker.closed) onoutcome(event) }}
            />
          {/key}
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  {#if explanation}<p id="{uid}-disabled" class="disabled-explanation">{explanation}</p>{/if}
</div>

<style>
  .chooser { min-width: 0; }
  :global(.chooser-trigger) { width: 100%; justify-content: space-between; gap: .5rem; text-align: start; }
  .current-title { min-width: 0; overflow-wrap: anywhere; }
  .disabled-explanation { margin: .35rem 0 0; color: var(--muted-foreground); font-size: .75rem; line-height: 1.5; }
  :global(.chooser-popover) { width: min(27rem, calc(100vw - 1.5rem)); max-height: min(35rem, var(--bits-popover-content-available-height, calc(100dvh - 1.5rem))); border-radius: .75rem; background: var(--card); color: var(--foreground); overflow: hidden; box-shadow: 0 8px 32px hsl(var(--shadow-color) / .18); z-index: 50; }
</style>
