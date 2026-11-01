<script lang="ts">
  import clsx from "clsx"
  import type { Footprint } from "../onboarding/features"

  let { footprint, label, id }: { footprint: Footprint; label: string; id?: string } = $props()
  const changesPage = $derived(footprint === "buttons" || footprint === "right-click")
</script>

<span
  {id}
  data-footprint={footprint}
  class={clsx(
    "inline-flex min-h-6 items-center rounded-full border px-2.5 text-[12px] font-medium",
    changesPage ? "border-primary/30 bg-accent text-accent-foreground" : "bg-muted text-muted-foreground border-transparent"
  )}>{label}</span
>
