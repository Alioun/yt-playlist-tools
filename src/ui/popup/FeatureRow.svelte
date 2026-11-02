<script lang="ts">
  import clsx from "clsx"
  import type { Snippet } from "svelte"
  import Glyph from "../components/Glyph.svelte"
  import Switch from "../components/Switch.svelte"
  import { featureGlyph } from "../components/glyphs"
  import type { FeatureId } from "../../shared/contracts/vocabulary"

  // A popup feature row (UI-POP-19, UI-POP-20): the glyph tile, name, summary, a health or held line and the
  // switch. Only a row that's on unfolds, and its content is the caller's lazy part.
  let { feature, name, summary, on, held = null, line = null, lineTone = "muted", unfoldable = false, disabled = false, onswitch, action, details }: {
    feature: FeatureId
    name: string
    summary: string
    on: boolean
    held?: string | null
    line?: string | null
    lineTone?: "muted" | "warning" | "destructive"
    unfoldable?: boolean
    disabled?: boolean
    onswitch: (next: boolean) => void
    action?: Snippet
    details?: Snippet
  } = $props()
  const uid = $props.id()
  let open = $state(false)
  const canUnfold = $derived(on && unfoldable && details !== undefined)
  $effect(() => { if (!canUnfold) open = false })
</script>

<li class="border-border/70 border-b last:border-b-0" data-feature-row={feature}>
  <div class="flex min-h-[54px] items-center gap-3 px-3 py-2">
    <span aria-hidden="true" class={clsx("inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
      on ? "bg-accent text-primary" : "bg-muted text-muted-foreground")}><Glyph name={featureGlyph[feature]} class="size-4" /></span>
    <div class="min-w-0 flex-1">
      {#if canUnfold}
        <button type="button" aria-expanded={open} aria-controls="{uid}-details" class="focus-visible:ring-ring/40 flex items-center gap-1 rounded text-left text-[13.5px] font-medium outline-none focus-visible:ring-3"
          onclick={() => { open = !open }}>{name}<Glyph name={open ? "chevron-down" : "chevron-right"} class="text-muted-foreground size-3.5" /></button>
      {:else}
        <span id="{uid}-name" class="text-[13.5px] font-medium">{name}</span>
      {/if}
      {#if summary}<p class="text-muted-foreground truncate text-[12px]">{summary}</p>{/if}
      {#if held}<p id="{uid}-held" class="text-warning text-[12px]">{held}</p>{/if}
      {#if line}<p class={clsx("text-[12px]", lineTone === "warning" ? "text-warning" : lineTone === "destructive" ? "text-destructive" : "text-muted-foreground")} role="status">{line}</p>{/if}
    </div>
    {#if action}{@render action()}{/if}
    <Switch checked={on} held={held !== null} label={name} describedby={held ? `${uid}-held` : undefined} {disabled} onchange={onswitch} />
  </div>
  {#if canUnfold && open && details}
    <div id="{uid}-details" class="pb-3 pr-3 pl-[54px]">{@render details()}</div>
  {/if}
</li>
