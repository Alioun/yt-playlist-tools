<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 15). The brand sheet: the placeholder brand for Playlist Pigeon (name PROVISIONAL,
  // ticket 22), with the real tokens and components, in light and dark.
  import PigeonMark from "$ui/components/PigeonMark.svelte";
  import KeyCombo from "$ui/components/KeyCombo.svelte";
  import FootprintTag from "$ui/components/FootprintTag.svelte";
  import FeatureIcon from "$ui/components/FeatureIcon.svelte";
  import Banner from "$ui/popup/Banner.svelte";
  import { Button } from "$ui/components/ui/button/index.js";
  import { Switch } from "$ui/components/ui/switch/index.js";
  import Swatch from "./Swatch.svelte";
  import ToolbarIcon from "./ToolbarIcon.svelte";

  const sizes = [128, 64, 48, 32, 24, 16];
  const toolbars = [
    { name: "Chrome · light", bar: "#ffffff", field: "#f1f3f4", dark: false },
    { name: "Chrome · dark", bar: "#35363a", field: "#202124", dark: true },
    { name: "Firefox · dark", bar: "#2b2a33", field: "#1c1b22", dark: true },
  ];
  const tokens: { name: string; v: string; on?: string; note?: string }[] = [
    { name: "Foreground", v: "var(--foreground)", on: "var(--background)" },
    { name: "Muted text", v: "var(--muted-foreground)" },
    { name: "Primary (violet)", v: "var(--primary)", note: "actions, focus" },
    { name: "Text on primary", v: "var(--primary-foreground)", on: "var(--primary)" },
    { name: "Success (teal)", v: "var(--success)", note: "done, in this playlist" },
    { name: "Warning (amber)", v: "var(--warning)", on: "var(--warning-soft)", note: "on its soft fill" },
    { name: "Info", v: "var(--info)", on: "var(--info-soft)", note: "on its soft fill" },
    { name: "Destructive (crimson)", v: "var(--destructive)", note: "Clear, Remove" },
  ];
  const banners = [
    { id: "a", tone: "attention" as const, title: "Waiting for your OK", text: "Nothing runs on YouTube until you agree.", actions: [{ id: "review-onboarding" as const, label: "Review", primary: true }] },
    { id: "b", tone: "info" as const, title: "No YouTube tab is open", text: "This is saved data from 2 hours ago.", actions: [{ id: "open-youtube" as const, label: "Open YouTube", primary: true }] },
    { id: "c", tone: "done" as const, title: "Your auto-add playlists and shortcut from 1.x are now set up for Alioun.", actions: [] },
  ];
  const type = [
    { px: 30, w: 650, use: "First run heading", sample: "What should Playlist Pigeon do?" },
    { px: 22, w: 600, use: "Settings section title", sample: "YouTube" },
    { px: 15, w: 600, use: "Card title (settings)", sample: "Auto-add" },
    { px: 14, w: 400, use: "Settings body", sample: "Adds the videos you watch to your chosen playlists." },
    { px: 13, w: 500, use: "Popup row name", sample: "Playlist shortcuts" },
    { px: 12, w: 400, use: "Popup summary, help text", sample: "3 playlists · adds at 50 %" },
    { px: 11, w: 600, use: "Captions (uppercase)", sample: "THIS VIDEO" },
  ];
</script>

{#snippet components()}
  <div class="space-y-5">
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="brand">Agree and turn on 3 features</Button>
      <Button>Save</Button>
      <Button variant="outline">Cancel</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Clear</Button>
      <Button variant="destructive-soft">Remove</Button>
      <Button variant="link">Link</Button>
    </div>
    <div class="text-muted-foreground flex flex-wrap items-center gap-5 text-xs">
      <span class="flex items-center gap-2"><Switch checked={false} aria-label="off" /> Off</span>
      <span class="flex items-center gap-2"><Switch checked aria-label="on" /> On</span>
      <span class="flex items-center gap-2"><Switch checked held aria-label="held" /> On, held (consent, access, paused)</span>
      <span class="flex items-center gap-2"><Switch checked disabled aria-label="disabled" /> Disabled</span>
      <span class="flex items-center gap-2"><Switch checked size="sm" aria-label="small" /> Small</span>
    </div>
    <div class="flex flex-wrap items-center gap-3 text-xs">
      <KeyCombo key="Alt+Shift+P" os="windows" />
      <KeyCombo key="Alt+Shift+P" os="mac" />
      <KeyCombo key="Alt+W" os="linux" size="md" />
      <KeyCombo key="Alt+K" os="windows" size="xs" />
      <span class="bg-border mx-1 h-5 w-px"></span>
      <FeatureIcon id="autoAdd" />
      <FeatureIcon id="shortcuts" />
      <FeatureIcon id="quickSave" on={false} />
      <FeatureIcon id="musicQuickActions" />
    </div>
    <div class="flex flex-wrap gap-2">
      <FootprintTag footprint="none" />
      <FootprintTag footprint="keys" />
      <FootprintTag footprint="buttons" />
      <FootprintTag footprint="right-click" />
    </div>
    <div class="-mx-3 w-[360px] max-w-full space-y-0">
      {#each banners as b (b.id)}<Banner banner={b} onaction={() => {}} />{/each}
    </div>
  </div>
{/snippet}

{#snippet palette()}
  <div class="grid grid-cols-2 gap-x-6 gap-y-4">
    {#each tokens as t (t.name)}<Swatch name={t.name} color={t.v} on={t.on} note={t.note} />{/each}
  </div>
{/snippet}

<div class="mx-auto max-w-[1180px] space-y-10 pb-24">
  <!-- Hero -->
  <header class="grid grid-cols-[1fr_auto] items-center gap-10 rounded-2xl border border-zinc-200 bg-white p-8">
    <div>
      <div class="flex items-center gap-2 text-[12px] font-medium text-zinc-500">
        Brand sheet <span class="rounded bg-yellow-300 px-1.5 py-0.5 text-[10.5px] font-bold text-yellow-950">NAME PROVISIONAL · TICKET 22</span>
      </div>
      <h1 class="mt-2 text-[34px] leading-tight font-semibold tracking-[-0.02em] text-zinc-900">Playlist Pigeon</h1>
      <p class="mt-1 text-[15px] text-zinc-600">for YouTube™ · a grey pigeon carrying your list, with a teal-to-violet neck.</p>
      <ul class="mt-5 grid max-w-[620px] gap-1.5 text-[13.5px] leading-relaxed text-zinc-700">
        <li>· <b>The mark:</b> small, round, perched, in profile. The wing is three list lines, 1.x's "playlist add" glyph. Below 20 px it drops the perch and keeps two lines.</li>
        <li>· <b>Never:</b> YouTube red, a play triangle, a rounded-rectangle "screen", a red ring, or YouTube's red / near-black / white combination (tickets 03 and 22). Not a flying blue bird either.</li>
        <li>· <b>Where it shows:</b> the popup and settings header say just "Playlist Pigeon"; ™ only where YouTube is named.</li>
      </ul>
    </div>
    <div class="flex gap-4">
      <div class="flex size-[180px] items-center justify-center rounded-2xl bg-[#f6f7f9]"><PigeonMark size={128} /></div>
      <div class="dark flex size-[180px] items-center justify-center rounded-2xl bg-[#14171d]"><PigeonMark size={128} /></div>
    </div>
  </header>

  <!-- Sizes -->
  <section class="rounded-2xl border border-zinc-200 bg-white p-6">
    <h2 class="text-[15px] font-semibold text-zinc-900">The mark at every size</h2>
    <p class="mt-0.5 text-[13px] text-zinc-500">Ship 16, 32, 48 and 128 px (Chrome: 96 px artwork inside 128 with 16 px padding). Test on light and dark toolbars.</p>
    <div class="mt-5 grid grid-cols-2 gap-4">
      {#each [false, true] as dk (dk)}
        <div class="flex items-end gap-6 rounded-xl p-6 {dk ? 'dark bg-[#14171d]' : 'bg-[#f6f7f9]'}">
          {#each sizes as s (s)}
            <div class="flex flex-col items-center gap-2">
              <PigeonMark size={s} />
              <span class="text-[11px] {dk ? 'text-white/50' : 'text-zinc-500'}">{s}</span>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </section>

  <!-- Toolbar -->
  <section class="rounded-2xl border border-zinc-200 bg-white p-6">
    <h2 class="text-[15px] font-semibold text-zinc-900">In the toolbar</h2>
    <p class="mt-0.5 text-[13px] text-zinc-500">
      16 px, with and without the badge. The amber "!" means something needs you: site access first, then consent, a Missing or Full playlist, or a feature that isn't working (tickets 09, 18).
    </p>
    <div class="mt-5 grid grid-cols-3 gap-4">
      {#each toolbars as t (t.name)}
        <div>
          <div class="flex h-11 items-center gap-2 rounded-xl px-3 ring-1 ring-black/10" style="background:{t.bar}">
            <div class="h-7 flex-1 rounded-full" style="background:{t.field}"></div>
            <ToolbarIcon dark={t.dark} />
            <ToolbarIcon dark={t.dark} badge="!" title="Something needs you" />
            <span class="tracking-widest {t.dark ? 'text-white/50' : 'text-black/50'}">⋮</span>
          </div>
          <div class="mt-1.5 text-[12px] text-zinc-500">{t.name}</div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Palette -->
  <section class="rounded-2xl border border-zinc-200 bg-white p-6">
    <h2 class="text-[15px] font-semibold text-zinc-900">Colour</h2>
    <p class="mt-0.5 text-[13px] text-zinc-500">
      Taken from the bird: slate body, iridescent teal-to-violet neck. Neutrals lean slate (hue 255). Violet acts, teal confirms, amber asks, crimson destroys. Read live from the theme, with contrast against the surface each is used on.
    </p>
    <div class="mt-5 grid grid-cols-[repeat(3,minmax(0,1fr))_1.4fr] items-center gap-4 rounded-xl bg-[#f6f7f9] p-5">
      <Swatch name="Pigeon teal" color="#14A39A" on="#ffffff" note="decorative only" />
      <Swatch name="Neck violet" color="#7B5CD6" on="#ffffff" />
      <Swatch name="Pigeon slate" color="#5E6875" on="#ffffff" />
      <div>
        <div class="bg-brand-gradient h-10 rounded-lg"></div>
        <div class="mt-1 font-mono text-[11px] text-zinc-500">linear-gradient(120deg, #14A39A, #7B5CD6)</div>
      </div>
    </div>
    <div class="mt-4 grid grid-cols-2 gap-4">
      <div class="bg-background rounded-xl border p-5">
        <div class="text-muted-foreground mb-4 text-[12px] font-semibold tracking-wide uppercase">Light tokens</div>
        {@render palette()}
      </div>
      <div class="dark bg-background rounded-xl border p-5">
        <div class="text-muted-foreground mb-4 text-[12px] font-semibold tracking-wide uppercase">Dark tokens</div>
        {@render palette()}
      </div>
    </div>
  </section>

  <!-- Gradient rules -->
  <section class="grid grid-cols-[1fr_1.25fr] gap-4">
    <div class="rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 class="text-[15px] font-semibold text-zinc-900">Where the gradient goes, and nowhere else</h2>
      <ol class="mt-3 space-y-2 text-[13.5px] text-zinc-700">
        <li class="flex items-center gap-3"><span class="w-6 text-zinc-400">1</span><PigeonMark size={24} /> The mark's neck.</li>
        <li class="flex items-center gap-3"><span class="w-6 text-zinc-400">2</span><Switch checked aria-label="on" /> A feature switch that's on: the brand lives in the popup's first view.</li>
        <li class="flex items-center gap-3"><span class="w-6 text-zinc-400">3</span><span class="bg-brand-gradient h-[3px] w-10 rounded-full"></span> The hairline under the popup's and settings' header.</li>
        <li class="flex items-center gap-3"><span class="w-6 text-zinc-400">4</span><Button variant="brand" size="sm">Agree and turn on 3 features</Button> First run's main call to action.</li>
      </ol>
      <p class="mt-3 text-[12.5px] text-zinc-500">Everything else is solid: buttons and focus rings violet, success teal, warnings amber, danger crimson. Status never rests on colour alone; each tone has its own icon.</p>
    </div>
    <div class="rounded-2xl border border-zinc-200 bg-white p-6">
      <h2 class="text-[15px] font-semibold text-zinc-900">Type</h2>
      <p class="mt-0.5 text-[13px] text-zinc-500">The system stack (Segoe UI, SF, Ubuntu Sans…): no bundled fonts, so nothing counts against the popup's 40 KB.</p>
      <div class="mt-4 space-y-2.5">
        {#each type as t (t.use)}
          <div class="flex items-baseline gap-4">
            <span class="w-14 shrink-0 font-mono text-[11px] text-zinc-400">{t.px}/{t.w}</span>
            <span class="min-w-0 flex-1 leading-tight text-zinc-900 {t.px === 11 ? 'tracking-wide' : ''}" style="font-size:{t.px}px;font-weight:{t.w}">{t.sample}</span>
            <span class="shrink-0 text-[11.5px] text-zinc-500">{t.use}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Components -->
  <section class="rounded-2xl border border-zinc-200 bg-white p-6">
    <h2 class="text-[15px] font-semibold text-zinc-900">Components, light and dark</h2>
    <p class="mt-0.5 text-[13px] text-zinc-500">The real components from src/ui: shadcn-svelte on Bits UI, with clsx and a tv-free Button (ticket 24).</p>
    <div class="mt-5 grid grid-cols-2 gap-4">
      <div class="bg-background text-foreground rounded-xl border p-5">{@render components()}</div>
      <div class="dark bg-background text-foreground rounded-xl border p-5">{@render components()}</div>
    </div>
  </section>
</div>
