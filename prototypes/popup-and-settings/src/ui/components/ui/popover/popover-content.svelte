<script lang="ts">
	// shadcn-svelte's PopoverContent. `flush` drops the padding, gap and fixed width for content that brings its own
	// layout (the playlist picker): without tailwind-merge a caller can't override them (see $lib/utils).
	import { Popover as PopoverPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import PopoverPortal from "./popover-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		align = "center",
		flush = false,
		portalProps,
		...restProps
	}: PopoverPrimitive.ContentProps & {
		flush?: boolean;
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPortal>>;
	} = $props();
</script>

<PopoverPortal {...portalProps}>
	<PopoverPrimitive.Content
		bind:ref
		data-slot="popover-content"
		{sideOffset}
		{align}
		class={cn(
			"bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 rounded-xl text-sm shadow-float ring-1 duration-100 z-50 origin-(--bits-popover-content-transform-origin) outline-hidden",
			flush ? "overflow-hidden" : "flex w-72 flex-col gap-2.5 p-2.5",
			className
		)}
		{...restProps}
	/>
</PopoverPortal>
