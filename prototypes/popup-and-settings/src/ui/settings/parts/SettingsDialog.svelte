<script lang="ts">
  // Settings' dialogs on Bits UI's Dialog, styled here rather than through shadcn's DialogContent: without class
  // merging (ticket 24's clsx-only `cn`), widening shadcn's `sm:max-w-sm` from outside would be a conflict.
  import type { Snippet } from "svelte";
  import { Dialog as D } from "bits-ui";
  import X from "@lucide/svelte/icons/x";

  let {
    open = $bindable(false),
    title,
    description,
    width = "md",
    children,
    footer,
    onclose,
  }: {
    open?: boolean;
    title: string;
    description?: string;
    width?: "sm" | "md" | "lg";
    children?: Snippet;
    footer?: Snippet;
    onclose?: () => void;
  } = $props();
  const max = { sm: "max-w-[400px]", md: "max-w-[480px]", lg: "max-w-[560px]" } as const;
</script>

<D.Root
  bind:open
  onOpenChange={(v) => {
    if (!v) onclose?.();
  }}
>
  <D.Portal>
    <D.Overlay class="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] duration-150" />
    <D.Content
      class="bg-popover text-popover-foreground shadow-float data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border outline-none duration-150 {max[width]}"
    >
      <div class="px-6 pt-5 pb-1">
        <D.Title class="pr-8 text-[17px] leading-6 font-semibold tracking-[-0.01em]">{title}</D.Title>
        {#if description}<D.Description class="text-muted-foreground mt-1.5 text-sm leading-5">{description}</D.Description>{/if}
      </div>
      {#if children}<div class="px-6 py-3">{@render children()}</div>{/if}
      {#if footer}
        <div class="bg-muted/50 flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t px-6 py-3.5">{@render footer()}</div>
      {/if}
      <D.Close
        class="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-3.5 right-3.5 inline-flex size-8 items-center justify-center rounded-lg"
        aria-label="Close"
      >
        <X class="size-4" />
      </D.Close>
    </D.Content>
  </D.Portal>
</D.Root>
