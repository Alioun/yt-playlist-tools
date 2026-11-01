<script lang="ts">
  import type { RichPart } from "../../shared/i18n"

  let { parts }: { parts: readonly RichPart[] } = $props()
</script>

{#each parts as part, index (index)}{#if part.kind === "strong"}<strong class="text-foreground font-semibold">{part.text}</strong>{:else}{part.text}{/if}{/each}
