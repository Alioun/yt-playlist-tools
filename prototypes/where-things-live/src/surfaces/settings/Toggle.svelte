<script lang="ts">
  // Local switch on the bits-ui primitive. The generated shadcn-svelte Switch styles `data-checked`,
  // which bits-ui 2.19 doesn't emit (it emits data-state), so it renders invisible.
  import { Switch as SwitchPrimitive } from "bits-ui";
  import { cn } from "$lib/utils";

  let {
    checked = $bindable(false),
    id,
    disabled = false,
    size = "default",
    class: className = "",
  }: { checked?: boolean; id?: string; disabled?: boolean; size?: "sm" | "default"; class?: string } = $props();
</script>

<SwitchPrimitive.Root
  bind:checked
  {id}
  {disabled}
  class={cn(
    "peer focus-visible:ring-ring/50 inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
    "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
    size === "sm" ? "h-[16px] w-[28px]" : "h-[20px] w-[36px]",
    className,
  )}
>
  <SwitchPrimitive.Thumb
    class={cn(
      "bg-background pointer-events-none block rounded-full shadow-sm ring-0 transition-transform data-[state=unchecked]:translate-x-0.5",
      size === "sm" ? "size-3 data-[state=checked]:translate-x-[13px]" : "size-4 data-[state=checked]:translate-x-[17px]",
    )}
  />
</SwitchPrimitive.Root>
