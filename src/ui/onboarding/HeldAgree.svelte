<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import Disclosure from "../components/Disclosure.svelte"
  import Mark from "../components/Mark.svelte"
  import { FIRST_RUN_DISCLOSURE_VERSION, matchesRenderedDisclosure } from "../backend/rendered-disclosure"
  import type { PageState } from "../lib/page-state.svelte"
  import type { FirstRunText } from "./text"

  // Review after a withdrawal (FT-35, R167): the disclosure again, with no feature choices. Agree saves consent alone,
  // and each job the withdrawal paused waits for its own Continue in Settings › Privacy & data (R181).
  let { pageState, text, markSrc, paused }: { pageState: PageState; text: FirstRunText; markSrc: string; paused: number } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  let phase = $state<"review" | "agreeing" | "done">("review")
  let failure = $state<string | null>(null)
  let left = $state(untrack(() => paused))

  async function agree() {
    if (phase !== "review") return
    phase = "agreeing"
    failure = null
    if (!matchesRenderedDisclosure(platform.browser, text.disclosure)) { phase = "review"; failure = text.copy.consent.refused.unavailable; return }
    const result = await backend.call("ui.heldAgree", { action: "agree", displayedVersion: FIRST_RUN_DISCLOSURE_VERSION })
    if (result.kind === "answered" && result.result.kind === "agreed") { left = result.result.paused; phase = "done"; return }
    phase = "review"
    const reason = result.kind === "answered" && result.result.kind === "refused" ? result.result.reason : "unavailable"
    failure = text.copy.consent.refused[reason === "failed" ? "rejected" : reason]
  }
  const pausedLine = $derived(left === 0 ? null : i18n.message(i18n.plural(left) === "one" ? "held_paused_one" : "held_paused_other", { count: i18n.number(left) }))
</script>

<div class="bg-brand-wash min-h-screen">
  <div class="mx-auto flex max-w-[700px] flex-col gap-6 px-6 pt-12 pb-10" data-held-agreement>
    <Mark src={markSrc} size={56} />
    {#if phase === "done"}
      <section class="bg-card flex flex-col gap-3 rounded-2xl border p-6" role="status">
        <h1 class="text-xl font-semibold">{i18n.message("held_done")}</h1>
        <p class="text-[14.5px]">{pausedLine ?? i18n.message("held_done_restart")}</p>
        {#if pausedLine}
          <Button variant="outline" class="self-start" onclick={() => pageState.page.openSettings("privacy")}>{i18n.message("firstRun_finish_openSettings")}</Button>
        {/if}
      </section>
    {:else}
      <Disclosure context="upgrade-note" text={text.disclosure} browser={platform.browser} level={1}>
        {#snippet lead()}
          <p class="text-muted-foreground mt-2 text-[15px]">{i18n.message("held_lead")}</p>
          {#if pausedLine}<p class="mt-2 text-[14.5px]">{pausedLine}</p>{/if}
        {/snippet}
      </Disclosure>
      {#if failure}<p role="alert" class="text-destructive text-[14px]">{failure}</p>{/if}
      <div class="flex flex-wrap gap-2">
        <Button variant="brand" size="lg" pending={phase === "agreeing"} onclick={() => void agree()}>{i18n.message("firstRun_agree_none")}</Button>
      </div>
    {/if}
  </div>
</div>
