<script lang="ts" module>
	// shadcn-svelte's Button with Playlist Pigeon's variants. Its variants are a plain lookup joined with clsx, not
	// tailwind-variants: Button sits in the popup's first view (the banner), and even `tailwind-variants/lite` costs
	// 3.7 KB there (ticket 24) for features a two-key lookup doesn't use. Same API as shadcn's (`buttonVariants`,
	// `variant`, `size`). Rule from `$lib/utils`: never pass a class that conflicts with the variant's own.
	//
	// The same rule binds inside the component: without tailwind-merge a variant can't override the base, because two
	// utilities for one property resolve by Tailwind's CSS order, not by the order of the class string. So the base
	// holds no border colour, radius, font size or icon size; each variant or size sets its own (found when the base's
	// `border-transparent` silently beat outline's `border-border` in light mode).
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	const base =
		"focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 aria-invalid:border-destructive border bg-clip-padding font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

	const variants = {
		default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/88 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]",
		brand: "border-transparent bg-brand-gradient text-white shadow-soft hover:brightness-105 hover:saturate-110",
		outline: "border-border bg-card hover:bg-muted hover:text-foreground dark:bg-input/20 dark:border-input dark:hover:bg-input/40 aria-expanded:bg-muted",
		secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]",
		ghost: "border-transparent hover:bg-muted hover:text-foreground dark:hover:bg-muted/60 aria-expanded:bg-muted",
		destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30",
		"destructive-soft": "border-transparent bg-destructive-soft text-destructive hover:bg-destructive/15",
		link: "border-transparent text-primary underline-offset-4 hover:underline",
	} as const;

	const svg4 = "[&_svg:not([class*='size-'])]:size-4";
	const sizes = {
		default: `h-8 gap-1.5 rounded-lg px-3 text-sm ${svg4}`,
		xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
		sm: "h-7 gap-1 rounded-[9px] px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
		lg: `h-10 gap-2 rounded-[11px] px-4 text-[15px] ${svg4}`,
		icon: `size-8 rounded-lg text-sm ${svg4}`,
		"icon-xs": "size-6 rounded-md text-xs [&_svg:not([class*='size-'])]:size-3",
		"icon-sm": "size-7 rounded-[9px] text-sm [&_svg:not([class*='size-'])]:size-3.5",
		"icon-lg": `size-10 rounded-[11px] text-sm ${svg4}`,
	} as const;

	export type ButtonVariant = keyof typeof variants;
	export type ButtonSize = keyof typeof sizes;
	export const buttonVariants = ({ variant = "default", size = "default" }: { variant?: ButtonVariant; size?: ButtonSize } = {}) =>
		cn(base, variants[variant], sizes[size]);

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
