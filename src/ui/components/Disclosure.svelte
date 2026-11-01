<script lang="ts">
  import type { Snippet } from "svelte"
  import clsx from "clsx"
  import Glyph from "./Glyph.svelte"
  import type { DisclosureContext } from "../onboarding/copy"
  import type { DisclosureText } from "../onboarding/text"
  import RichText from "./RichText.svelte"
  import type { BrowserKind } from "../onboarding/features"

  // The one disclosure text for first run, the upgrade note and the consent sheet or dialog (UI-ONB-08, REL-CON-12).
  let {
    context,
    text: disclosure,
    browser,
    size = "md",
    level,
    headingId,
    lead
  }: {
    context: DisclosureContext
    text: DisclosureText
    browser: BrowserKind
    /** md on pages, sm in the popup's sheet. */
    size?: "sm" | "md"
    /** 1 when the disclosure is the page's step, as on first run; 2 inside a page, as on the upgrade note. Defaults by size. */
    level?: 1 | 2
    headingId?: string
    /** What the page shows between the heading and the text, such as first run's picked features. */
    lead?: Snippet
  } = $props()

  const uid = $props.id()
  const titleId = $derived(headingId ?? `${uid}-heading`)
  const headingLevel = $derived(level ?? (size === "md" ? 1 : 2))
</script>

<section aria-labelledby={titleId} data-disclosure={context}>
  <svelte:element
    this={headingLevel === 1 ? "h1" : "h2"}
    id={titleId}
    tabindex="-1"
    data-step-heading={headingLevel === 1 || undefined}
    class={size === "md" ? "text-[30px] leading-tight font-semibold tracking-[-0.022em] outline-none" : "text-[15px] leading-6 font-semibold outline-none"}
  >
    {disclosure.headings[context]}
  </svelte:element>
  {@render lead?.()}
  <div
    class={clsx(
      "text-foreground/85 space-y-3 leading-[1.55]",
      size === "md" ? "bg-card shadow-soft mt-6 rounded-2xl border p-6 text-[13.5px]" : "mt-3 text-[12.5px]"
    )}
  >
    <p>{disclosure.intro}</p>
    <ul class="space-y-1.5">
      {#each disclosure.items as item, index (index)}
        <li class="flex gap-2.5" data-provisional={item.provisional}>
          <span class="bg-primary mt-[0.6em] size-1.5 shrink-0 rounded-full" aria-hidden="true"></span>
          <span><RichText parts={item.parts} /></span>
        </li>
      {/each}
    </ul>
    <p>{disclosure.closing[browser]}</p>
    <a
      class="text-primary inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
      href={disclosure.policyUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {disclosure.policyLabel}<Glyph name="external-link" class="size-3.5" />
    </a>
  </div>
</section>
