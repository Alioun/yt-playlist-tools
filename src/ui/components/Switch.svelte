<script lang="ts">
  import clsx from "clsx"

  // Hand-written and controlled. It never flips itself, so a refused change keeps showing the stored state (UI-RULE-13, UI-RULE-21).
  // A held switch is on but can't run yet. It's hatched, and `describedby` names the line that says why (UI-POP-21).
  let {
    checked,
    onchange,
    label,
    describedby,
    held = false,
    disabled = false,
    class: layout
  }: {
    checked: boolean
    onchange: (next: boolean) => void
    label: string
    describedby?: string
    held?: boolean
    disabled?: boolean
    class?: string
  } = $props()
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  aria-describedby={describedby}
  {disabled}
  data-state={checked ? "checked" : "unchecked"}
  data-held={held && checked ? "" : undefined}
  class={clsx(
    "focus-visible:ring-ring/40 inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
    checked && held ? "switch-held" : checked ? "bg-brand-gradient" : "bg-input",
    layout
  )}
  onclick={() => onchange(!checked)}
>
  <span
    aria-hidden="true"
    class={clsx("bg-card pointer-events-none block size-4 rounded-full shadow-sm transition-transform", checked ? "translate-x-4" : "translate-x-0")}
  ></span>
</button>

<style>
  .switch-held {
    background: repeating-linear-gradient(135deg, var(--muted-foreground) 0 3px, color-mix(in oklch, var(--muted-foreground) 45%, transparent) 3px 6px);
  }
</style>
