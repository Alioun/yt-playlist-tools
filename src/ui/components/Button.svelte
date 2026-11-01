<script lang="ts">
  import type { Snippet } from "svelte"
  import clsx from "clsx"
  import Glyph from "./Glyph.svelte"
  import { buttonClass, type ButtonSize, type ButtonVariant } from "./button"

  let {
    variant = "default",
    size = "default",
    pending = false,
    disabled = false,
    class: layout,
    onclick,
    children,
    ...rest
  }: {
    variant?: ButtonVariant
    size?: ButtonSize
    /** Keeps focus on the button while its action runs, and ignores further clicks. */
    pending?: boolean
    disabled?: boolean
    /** Margins and layout only (UI-RULE-12). */
    class?: string
    onclick?: (event: MouseEvent) => void
    children: Snippet
    "aria-label"?: string
    "aria-describedby"?: string
  } = $props()

  function click(event: MouseEvent) {
    if (pending) {
      event.preventDefault()
      return
    }
    onclick?.(event)
  }
</script>

<button
  type="button"
  class={clsx(buttonClass(variant, size), layout)}
  {disabled}
  aria-disabled={pending || undefined}
  aria-busy={pending || undefined}
  onclick={click}
  {...rest}
>
  {#if pending}<Glyph name="loader" class="motion-safe:animate-spin" />{/if}
  {@render children()}
</button>
