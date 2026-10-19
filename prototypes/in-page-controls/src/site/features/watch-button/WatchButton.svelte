<script lang="ts">
  // The watch-page button (ticket 09): a pill after YouTube's Save showing this video's auto-add state; a click opens
  // its menu (popovers.js). With no auto-add state to show, it's an icon-only button carrying the extension's mark
  // (variant A) rather than a second "Save" next to YouTube's own. Narrow rows fold it to icon only, with the state
  // in its tooltip. On Shorts it's the last button of the action column, labelled like YouTube's ("Save", "32 %").
  import { StatusPill, Ring, Icon, view, PRODUCT } from "$kit";
  import { statusOf } from "../../../shared/auto-add-status";
  import { wb, fold } from "./ctx.svelte";

  let { variant = "pill" }: { variant?: "pill" | "column" } = $props();
  let open = $state(false);
  let el: HTMLButtonElement | undefined = $state();

  const st = $derived(statusOf(view));
  const plain = $derived(st.kind === "off" || st.kind === "notTracked");
  const compact = $derived(fold.compact);
  const shown = $derived<"pill" | "compact" | "column">(
    variant === "column" ? "column" : plain && view.look !== "B" ? "compact" : compact || view.look === "C" ? "compact" : "pill",
  );
  const label = $derived(variant === "column" ? st.short : plain ? "Save to…" : st.pill);
  const tip = $derived(plain ? `${PRODUCT}: save this video` : st.line);
  const leadIcon = $derived(
    (
      {
        check: "check",
        error: "error",
        block: "block",
        pause: "pause",
        live: "live",
        warning: "warning",
        mark: view.look === "B" ? "playlistAdd" : variant === "column" ? "bookmark" : "mark",
      } as const
    )[st.lead as Exclude<typeof st.lead, "ring">],
  );

  function toggle() {
    if (open) return void wb.ctx?.popovers().then((p) => p.close());
    const video = wb.video();
    if (!video || !el || !wb.ctx) return;
    open = true;
    wb.ctx.popovers().then(
      (p) => p.openWatchMenu({ anchor: el!, video, side: variant === "column" ? "left" : "bottom", onclose: () => (open = false) }),
      () => (open = false),
    );
  }
</script>

<StatusPill bind:element={el} {label} {tip} variant={shown} expanded={open} onclick={toggle} onpointerenter={() => wb.ctx?.popovers({ quiet: true }).catch(() => {})}>
  {#snippet lead()}
    {#if st.lead === "ring"}<Ring value={st.ring} />{:else}<span class:err={st.lead === "error"}
        ><Icon name={leadIcon} size={st.lead === "mark" && variant !== "column" && view.look !== "B" ? 22 : 24} /></span
      >{/if}
  {/snippet}
</StatusPill>

<style>
  .err {
    display: flex;
    color: var(--pt-error);
  }
</style>
