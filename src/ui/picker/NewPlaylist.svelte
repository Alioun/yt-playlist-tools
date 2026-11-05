<script lang="ts">
  import { onDestroy, tick } from "svelte"
  import type { PickerModel, CreateOutcome } from "../../shared/picker/model.svelte"
  import type { Privacy } from "../../shared/contracts"
  import type { PickerHelp } from "./types"
  import type { PickerText } from "./text"
  import Button from "../components/Button.svelte"
  import Glyph from "../components/Glyph.svelte"
  import { buttonClass } from "../components/button"
  import PickerIcon from "./PickerIcon.svelte"

  let { picker, text, onoutcome, onpending, onhelp }: {
    picker: PickerModel
    text: PickerText
    onoutcome: (outcome: CreateOutcome) => void
    onpending: (outcome: Promise<CreateOutcome>) => void
    onhelp?: (action: PickerHelp) => void
  } = $props()
  const uid = $props.id()
  const visibilities: readonly Privacy[] = ["PRIVATE", "UNLISTED", "PUBLIC"]
  let expanded = $state(false)
  let touched = $state(false)
  let titleInput: HTMLInputElement | undefined = $state()
  let openButton: HTMLButtonElement | undefined = $state()
  let outcome: CreateOutcome | null = $state.raw(null)
  let mounted = true
  const pending = $derived(picker.creating.kind === "pending")
  const problem = $derived(touched ? picker.titleCheck.problem : null)
  const result = $derived.by(() => {
    if (outcome?.kind === "created" && outcome.choice !== null && "refused" in outcome.choice) return text.label("createChoiceRefused")
    if (outcome?.kind === "picked") {
      if ("refused" in outcome.choice) return text.label("createChoiceRefused")
    }
    if (outcome?.kind === "refused") return text.refusal[outcome.reason]
    if (outcome?.kind === "unavailable" && outcome.reason !== "mode") return text.unavailable[outcome.reason]
    return null
  })
  const failure = $derived(picker.creating.kind === "failed" ? text.failures[picker.creating.reason] : null)

  onDestroy(() => { mounted = false })

  async function openForm() {
    expanded = true
    await tick()
    if (mounted) titleInput?.focus({ preventScroll: true })
  }

  async function cancel() {
    if (pending) return
    expanded = false
    touched = false
    await tick()
    if (mounted) openButton?.focus({ preventScroll: true })
  }

  async function create(event: SubmitEvent) {
    event.preventDefault()
    if (pending || picker.closed) return
    touched = true
    if (picker.titleCheck.problem !== null) {
      titleInput?.focus({ preventScroll: true })
      return
    }
    outcome = null
    const pendingAnswer = picker.create(picker.form.title, picker.form.privacy)
    onpending(pendingAnswer)
    const answer = await pendingAnswer
    if (!mounted) return
    outcome = answer
    onoutcome(answer)
    // Creation and selection can answer differently. The form keeps both answers visible.
    if ((answer.kind === "created" && (answer.choice === null || "ok" in answer.choice)) || (answer.kind === "picked" && "ok" in answer.choice)) {
      expanded = false
      touched = false
      await tick()
      if (mounted) openButton?.focus({ preventScroll: true })
    }
  }
</script>

<footer class="new-playlist">
  {#if expanded}
    <form aria-label={text.label("newPlaylist")} onsubmit={create} novalidate>
      <label for="{uid}-title">{text.label("title")}</label>
      <input
        bind:this={titleInput} id="{uid}-title" bind:value={picker.form.title} required
        readonly={pending || picker.closed} aria-invalid={problem !== null || undefined}
        aria-describedby="{uid}-problem {uid}-duplicate {uid}-failure"
        onblur={() => { touched = true }}
      />
      <p id="{uid}-problem" class="error" class:empty={problem === null} aria-live="polite">{problem === null ? "" : text.problems[problem]}</p>
      <p id="{uid}-duplicate" class="hint" class:empty={!picker.titleCheck.duplicate}>{picker.titleCheck.duplicate ? text.duplicate(picker.form.title.trim()) : ""}</p>
      <label for="{uid}-privacy">{text.label("visibility")}</label>
      <select id="{uid}-privacy" bind:value={picker.form.privacy} disabled={pending || picker.closed}>
        {#each visibilities as privacy}<option value={privacy}>{text.privacy[privacy]}</option>{/each}
      </select>
      <p id="{uid}-failure" class="error" class:empty={failure === null && result === null} aria-live="polite">{failure ?? result ?? ""}</p>
      {#if picker.creating.kind === "failed" && picker.creating.reason === "noChannel" && onhelp}
        <Button variant="link" size="sm" onclick={() => onhelp?.("createChannel")}>{text.label("createChannel")}</Button>
      {/if}
      <div class="form-actions">
        <Button variant="ghost" disabled={pending} onclick={cancel}>{text.label("cancel")}</Button>
        <button type="submit" class={buttonClass()} aria-disabled={pending || picker.closed || undefined} aria-busy={pending || undefined} disabled={picker.titleCheck.problem !== null || picker.creation !== "available" || picker.closed}>
          {#if pending}<Glyph name="loader" class="motion-safe:animate-spin" />{/if}{text.label("create")}
        </button>
      </div>
    </form>
  {:else if picker.creation === "available"}
    <button bind:this={openButton} type="button" class="new-button" disabled={picker.closed} onclick={openForm}><PickerIcon name="plus" />{text.label("newPlaylist")}</button>
  {:else}
    <p class="unavailable">{text.unavailable[picker.creation]}</p>
    {#if onhelp && picker.creation === "noTab"}
      <Button variant="link" size="sm" onclick={() => onhelp?.("openYouTube")}>{text.label("openYouTube")}</Button>
    {:else if onhelp && picker.creation === "noChannel"}
      <Button variant="link" size="sm" onclick={() => onhelp?.("createChannel")}>{text.label("createChannel")}</Button>
    {/if}
  {/if}
</footer>

<style>
  .new-playlist { flex-shrink: 0; padding: .75rem 1rem; background: var(--card); border-top: 1px solid var(--border); }
  .new-button { display: flex; align-items: center; gap: .5rem; width: 100%; min-height: 2rem; padding: .25rem; border: 0; border-radius: .5rem; background: transparent; color: var(--primary); font: inherit; font-size: .875rem; font-weight: 550; cursor: pointer; }
  .new-button:hover { background: var(--muted); }
  form { display: grid; gap: .4rem; }
  label { font-size: .8rem; font-weight: 550; margin-top: .25rem; }
  input, select { min-width: 0; width: 100%; border: 1px solid var(--input); border-radius: .5rem; padding: .5rem .65rem; color: var(--foreground); background: var(--background); font: inherit; font-size: .875rem; }
  .form-actions { display: flex; justify-content: end; gap: .5rem; margin-top: .5rem; }
  .error, .hint, .unavailable { margin: 0; font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
  .error { color: var(--destructive); }
  .hint, .unavailable { color: var(--muted-foreground); }
  .error.empty, .hint.empty { display: none; }
</style>
