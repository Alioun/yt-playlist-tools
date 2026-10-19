<script lang="ts">
	// Playlist Pigeon's Switch: shadcn-svelte's look and API (checked, onCheckedChange, data-state), hand-written on a
	// native <button role="switch"> instead of Bits UI's Switch. Bits UI's Switch brings its shared runtime
	// (svelte-toolbelt, runed, style parsing) into the popup's first view for a control the platform already gives
	// us (ticket 24's 40 KB). Bits UI stays for what needs it: popovers, dialogs, menus, select, slider, checkbox.
	//
	// A feature that's on shows the brand's teal-to-violet. `held` (on, but not running: consent, site access,
	// paused) shows a hatched track, so "on but waiting" never looks like plain on.
	import type { HTMLButtonAttributes } from "svelte/elements";
	import { cn } from "$lib/utils.js";

	let {
		checked = $bindable(false),
		onCheckedChange,
		size = "default",
		held = false,
		disabled = false,
		class: className,
		...rest
	}: Omit<HTMLButtonAttributes, "role"> & {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
		size?: "sm" | "default";
		held?: boolean;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	data-slot="switch"
	data-state={checked ? "checked" : "unchecked"}
	data-size={size}
	data-held={held || undefined}
	{disabled}
	class={cn(
		"group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-[background-color,box-shadow] outline-none",
		"data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7",
		"data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/90",
		"data-[state=checked]:bg-brand-gradient data-[state=checked]:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.06)]",
		"data-held:data-[state=checked]:bg-[repeating-linear-gradient(-45deg,var(--muted-foreground)_0_3px,transparent_3px_6px)] data-held:data-[state=checked]:bg-muted-foreground/40",
		"focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-45",
		"after:absolute after:-inset-x-2 after:-inset-y-2",
		className
	)}
	onclick={() => {
		// Controlled when the caller listens: it may refuse or defer the change (consent first, the join question, a
		// denied access prompt, a refused write), so the switch shows only what the stored state says.
		if (onCheckedChange) onCheckedChange(!checked);
		else checked = !checked;
	}}
	{...rest}
>
	<span
		data-state={checked ? "checked" : "unchecked"}
		class={cn(
			"pointer-events-none block rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-200",
			"group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
			"translate-x-px group-data-[size=default]/switch:data-[state=checked]:translate-x-[17px] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[13px]",
			"dark:data-[state=unchecked]:bg-foreground/85"
		)}
	></span>
</button>
