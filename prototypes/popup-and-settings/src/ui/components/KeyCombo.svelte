<script lang="ts">
  // A key in the platform's style (ticket 08): "⌥⇧P" on macOS, "Alt+Shift+P" elsewhere, as keycaps.
  import { keyParts, type Os } from "$shared/keys/display";
  let {
    key,
    os,
    size = "sm",
    class: className = "",
  }: { key: string; os: Os; size?: "xs" | "sm" | "md"; class?: string } = $props();
  const parts = $derived(keyParts(key, os));
</script>

{#if parts.length && size === "xs"}
  <!-- Compact: one keycap for the whole combination, for summaries. -->
  <kbd
    class="bg-card text-foreground inline-flex h-[18px] shrink-0 items-center rounded-[5px] border border-b-2 px-1 font-sans text-[10.5px] leading-none font-medium whitespace-nowrap {className}"
    >{os === "mac" ? parts.join("") : parts.join("+")}</kbd
  >
{:else if parts.length}
  <kbd
    class="inline-flex shrink-0 items-center gap-0.5 font-sans font-medium whitespace-nowrap {className}"
    aria-label={parts.join(" ")}
  >
    {#each parts as p, i (i)}
      {#if os !== "mac" && i > 0}<span class="text-muted-foreground/70 text-[0.85em]" aria-hidden="true">+</span>{/if}
      <span
        class="bg-card text-foreground inline-flex items-center justify-center rounded-[5px] border border-b-2 leading-none shadow-[0_1px_0_rgb(0_0_0/0.04)]
          {size === 'xs' ? 'h-[17px] min-w-[17px] px-1 text-[10px]' : size === 'sm' ? 'h-5 min-w-5 px-1.5 text-[11px]' : 'h-6 min-w-6 px-2 text-xs'}"
        >{p}</span
      >
    {/each}
  </kbd>
{/if}
