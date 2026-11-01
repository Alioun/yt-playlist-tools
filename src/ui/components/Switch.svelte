<script lang="ts">
  import clsx from "clsx"

  // Hand-written and controlled: it never flips itself, so a refused change keeps showing the stored state (UI-RULE-13, UI-RULE-21).
  let {
    checked,
    onchange,
    label,
    describedby,
    disabled = false,
    class: layout
  }: {
    checked: boolean
    onchange: (next: boolean) => void
    label: string
    describedby?: string
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
  class={clsx(
    "focus-visible:ring-ring/40 inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
    checked ? "bg-brand-gradient" : "bg-input",
    layout
  )}
  onclick={() => onchange(!checked)}
>
  <span
    aria-hidden="true"
    class={clsx("bg-card pointer-events-none block size-4 rounded-full shadow-sm transition-transform", checked ? "translate-x-4" : "translate-x-0")}
  ></span>
</button>
