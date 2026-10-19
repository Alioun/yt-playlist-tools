<script lang="ts">
  import "./parts.css";
  // Quick actions, unfolded in the popup: which buttons show on YouTube Music (ticket 26's six checkboxes; Play next
  // and Add to queue by default). Save on the player bar is opt-in, and nothing depends on the bar.
  import Check from "@lucide/svelte/icons/check";
  import { musicButtons } from "$shared/features/registry";
  import { act, ui } from "$lib/view.svelte";

  const f = $derived(ui.s.features.musicQuickActions);
  const rows = $derived([
    ...musicButtons.map((b) => ({ id: b.id as string, name: b.name, where: b.where, on: f.buttons[b.id] })),
    { id: "playerBarSave", name: "Save on the player bar", where: "Shown beside YouTube Music's like, in the classic bar and the new miniplayer.", on: f.playerBarSave },
  ]);
</script>

<ul class="space-y-0.5">
  {#each rows as r (r.id)}
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={r.on}
        class="hover:bg-muted/70 flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left"
        onclick={() =>
          r.id === "playerBarSave"
            ? act({ kind: "featureOption", id: "musicQuickActions", option: "playerBarSave", value: !r.on })
            : act({ kind: "musicButton", button: r.id as never, on: !r.on })}
      >
        <span
          class="mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border {r.on
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-card'}"
          aria-hidden="true">{#if r.on}<Check class="size-3.5" strokeWidth={3} />{/if}</span
        >
        <span class="min-w-0">
          <span class="block text-[12.5px] leading-[18px] font-medium">{r.name}</span>
          <span class="text-muted-foreground block text-[11.5px] leading-4">{r.where}</span>
        </span>
      </button>
    </li>
  {/each}
</ul>
<p class="text-muted-foreground mt-1.5 px-1.5 text-[11.5px] leading-4">Each extra button squeezes narrow rows more. On Home's Quick picks at common laptop widths, a hovered row's title can disappear; its tooltip still names the song.</p>
