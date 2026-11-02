<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import { Popover } from "bits-ui"
  import { PickerModel } from "../../shared/picker/model.svelte"
  import type { ChooserContext, CloseRequest, PickerEvent, PlaylistChooserProps } from "./types"
  import PickerPanel from "./PickerPanel.svelte"

  // The part of PlaylistChooser that loads on its first open (G43): the popover, each open's model and the panel.
  let {
    open, disabled, trigger, id, content = $bindable(null), context, createSource, text, platform,
    watchLaterEveryAccount = false, onopenchange, onrequestclose, oncloseautofocus, onoutcome, onrelease, onhelp
  }: Pick<PlaylistChooserProps, "context" | "createSource" | "text" | "platform" | "watchLaterEveryAccount" | "onoutcome" | "onrelease" | "onhelp"> & {
    open: boolean
    disabled: boolean
    trigger: HTMLButtonElement
    id: string
    content?: HTMLDivElement | null
    onopenchange: (next: boolean) => void
    onrequestclose: (request: CloseRequest) => void
    oncloseautofocus: (event: Event) => void
  } = $props()
  let nextSession = 0
  let session = $state.raw<{
    readonly serial: number
    readonly key: string
    readonly context: ChooserContext
    readonly factory: PlaylistChooserProps["createSource"]
    readonly picker: PickerModel
    readonly pending: Set<Promise<PickerEvent>>
  } | null>(null)

  $effect.pre(() => {
    const wanted = open
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
</script>

<Popover.Root bind:open={() => open, onopenchange}>
  <Popover.Portal>
    <Popover.Content
      bind:ref={content}
      {id}
      customAnchor={trigger}
      class="chooser-popover"
      role="dialog"
      aria-label={text.heading(context.purpose, context.site).title}
      side="bottom" align="start" sideOffset={6} collisionPadding={12} avoidCollisions
      strategy="fixed" hideWhenDetached trapFocus
      onOpenAutoFocus={event => {
        event.preventDefault()
        content?.querySelector<HTMLInputElement>("input[data-picker-search]")?.focus({ preventScroll: true })
      }}
      onCloseAutoFocus={oncloseautofocus}
      onEscapeKeydown={event => {
        event.preventDefault()
        event.stopPropagation()
        onrequestclose({ reason: "escape" })
      }}
    >
      {#if session}
        {@const active = session}
        {#key active.serial}
          <PickerPanel
            picker={active.picker} {text} purpose={active.context.purpose} {platform} {watchLaterEveryAccount} {onhelp}
            {onrequestclose}
            onpending={answer => { active.pending.add(answer); void answer.then(() => active.pending.delete(answer)) }}
            onoutcome={event => { if (session?.serial === active.serial && !active.picker.closed) onoutcome(event) }}
          />
        {/key}
      {/if}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  :global(.chooser-popover) { width: min(27rem, calc(100vw - 1.5rem)); max-height: min(35rem, var(--bits-popover-content-available-height, calc(100dvh - 1.5rem))); border-radius: .75rem; background: var(--card); color: var(--foreground); overflow: hidden; box-shadow: 0 8px 32px hsl(var(--shadow-color) / .18); z-index: 50; }
</style>
