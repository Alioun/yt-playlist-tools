<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 15). The harness: frames the real pages (popup.html, settings.html, onboarding.html)
  // with a scenario, theme, OS, browser and popup variant, all in the URL. Prototype chrome only: neutral greys and a
  // yellow PROTOTYPE tag, so nothing here reads as part of the design.
  import { scenarios } from "$ui/backend/fake/seed";
  import { notes, surfaces, type Surface } from "./notes";
  import { frameSrc, h, save, setScenario, themesShown } from "./url.svelte";
  import { badgeOf, live } from "./live.svelte";
  import PopupStage from "./PopupStage.svelte";
  import BrowserFrame from "./BrowserFrame.svelte";
  import AutoFrame from "./AutoFrame.svelte";
  import VariantBar from "./VariantBar.svelte";
  import StatePanel from "./StatePanel.svelte";
  import Brand from "./Brand.svelte";
  import ToolbarIcon from "./ToolbarIcon.svelte";

  const groups = [...new Set(scenarios.map((s) => s.group))];
  const scenario = $derived(scenarios.find((s) => s.id === h.s) ?? scenarios[0]);
  const browser = $derived((h.browser || live.s?.env.browser || "chrome") as "chrome" | "firefox");
  const os = $derived(h.os || live.s?.env.os || "windows");
  const badge = $derived(badgeOf(live.s));

  const firstRunScenarios = ["fresh", "sync-reset"];
  const upgradeScenarios = ["upgrade-pending", "upgrade-set", "no-access"];
  const settingsSections = [
    ["youtube", "YouTube"],
    ["music", "YouTube Music"],
    ["everywhere", "Everywhere"],
    ["accounts", "Accounts"],
    ["appearance", "Appearance"],
    ["privacy", "Privacy & data"],
    ["diagnostics", "Diagnostics"],
    ["about", "About"],
  ] as const;
  const steps = [
    ["", "1 · Pick features"],
    ["2", "2 · Before you start"],
    ["3", "3 · Finish setting up"],
    ["notnow", "Not now"],
  ] as const;

  function go(surface: Surface, hash = "") {
    if (surface === "firstrun" && !firstRunScenarios.includes(h.s)) {
      h.surface = surface;
      return setScenario("fresh");
    }
    if (surface === "upgrade" && !upgradeScenarios.includes(h.s)) {
      h.surface = surface;
      return setScenario("upgrade-pending");
    }
    h.surface = surface;
    h.hash = surface === "settings" ? hash : "";
    save();
  }

  let toast = $state<{ text: string; id: number } | null>(null);
  $effect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data ?? {};
      if (typeof d.pigeonNavigate === "string") {
        if (d.pigeonNavigate === "settings") go("settings", d.hash ?? "");
        else if (d.pigeonNavigate === "onboarding") go(live.s?.upgrade === "pending" ? "upgrade" : "firstrun");
        else go("popup");
      } else if (typeof d.pigeonExternal === "string") {
        const id = Date.now();
        toast = { text: `Would open ${d.url ?? d.pigeonExternal}`, id };
        setTimeout(() => toast?.id === id && (toast = null), 2800);
      }
    };
    addEventListener("message", onMsg);
    return () => removeEventListener("message", onMsg);
  });

  const pageTitle = $derived(
    h.surface === "settings" ? "Playlist Pigeon · Settings" : h.surface === "upgrade" ? "Playlist Pigeon 2.0" : "Welcome to Playlist Pigeon",
  );
</script>

<div class="flex min-h-screen flex-col bg-[#ececee] font-sans text-zinc-900 antialiased">
  <!-- Top bar -->
  <header class="sticky top-0 z-40 border-b border-black/10 bg-zinc-900 text-zinc-100">
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
      <div class="flex items-center gap-2">
        <span class="rounded bg-yellow-300 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-yellow-950">PROTOTYPE</span>
        <span class="text-[13.5px] font-semibold">Ticket 15 · Popup and settings</span>
      </div>
      <nav class="flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5" aria-label="Surface">
        {#each surfaces as s (s.id)}
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-[12.5px] transition-colors {h.surface === s.id ? 'bg-white font-medium text-zinc-900' : 'text-zinc-300 hover:bg-white/10 hover:text-white'}"
            aria-current={h.surface === s.id ? "page" : undefined}
            onclick={() => go(s.id)}>{s.name}</button
          >
        {/each}
      </nav>
      <div class="ml-auto flex flex-wrap items-center gap-3 text-[12px]">
        <label class="flex items-center gap-1.5 text-zinc-400">
          Scenario
          <select
            class="max-w-[260px] rounded-md border border-white/10 bg-zinc-800 px-2 py-1 text-zinc-100"
            value={h.s}
            onchange={(e) => setScenario((e.currentTarget as HTMLSelectElement).value)}
          >
            {#each groups as g (g)}
              <optgroup label={g}>
                {#each scenarios.filter((s) => s.group === g) as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
              </optgroup>
            {/each}
          </select>
        </label>
        <div class="flex items-center gap-0.5 rounded-md bg-white/5 p-0.5" role="group" aria-label="Theme">
          {#each [["light", "Light"], ["dark", "Dark"], ["both", "Both"]] as [id, name] (id)}
            <button
              type="button"
              class="rounded px-2 py-0.5 {h.theme === id ? 'bg-white text-zinc-900' : 'text-zinc-300 hover:text-white'}"
              onclick={() => {
                h.theme = id as typeof h.theme;
                save();
              }}>{name}</button
            >
          {/each}
        </div>
        <label class="flex items-center gap-1.5 text-zinc-400">
          OS
          <select
            class="rounded-md border border-white/10 bg-zinc-800 px-1.5 py-1 text-zinc-100"
            value={os}
            onchange={(e) => {
              h.os = (e.currentTarget as HTMLSelectElement).value;
              save();
            }}
          >
            <option value="windows">Windows</option><option value="mac">macOS</option><option value="linux">Linux</option>
          </select>
        </label>
        <label class="flex items-center gap-1.5 text-zinc-400">
          Browser
          <select
            class="rounded-md border border-white/10 bg-zinc-800 px-1.5 py-1 text-zinc-100"
            value={browser}
            onchange={(e) => {
              h.browser = (e.currentTarget as HTMLSelectElement).value;
              save();
            }}
          >
            <option value="chrome">Chrome</option><option value="firefox">Firefox</option>
          </select>
        </label>
      </div>
    </div>
    <div class="flex items-center gap-2 border-t border-white/5 px-4 py-1.5 text-[12px] text-zinc-400">
      <span class="font-medium text-zinc-200">{scenario.name}</span>
      <span>· {scenario.hint}</span>
      <span class="ml-auto flex items-center gap-1.5">
        Toolbar badge:
        <span class="dark inline-flex"><ToolbarIcon badge={badge.text} title={badge.title} dark /></span>
        <span class="text-zinc-300">{badge.text ? badge.title : "none"}</span>
      </span>
    </div>
  </header>

  <div class="flex min-h-0 flex-1 gap-5 p-5">
    <!-- Stage -->
    <main class="min-w-0 flex-1">
      {#if h.surface === "popup"}
        <div class="flex flex-wrap justify-center gap-6">
          {#each themesShown() as t (t)}<PopupStage theme={t} narrow={h.theme === "both"} />{/each}
        </div>
      {:else if h.surface === "states"}
        <div class="grid justify-center gap-5" style="grid-template-columns: repeat(auto-fill, {h.theme === 'both' ? 762 : 388}px)">
          {#each scenarios as s (s.id)}
            <article class="self-start rounded-xl border border-zinc-300/70 bg-white p-3">
              <header class="mb-2 min-h-[40px]">
                <button type="button" class="text-left text-[13px] font-semibold hover:underline" onclick={() => setScenario(s.id)}>{s.name}</button>
                <p class="text-[11.5px] leading-4 text-zinc-500">{s.hint}</p>
              </header>
              <div class="flex gap-3">
                {#each themesShown() as t (t)}
                  <div class="overflow-hidden rounded-[10px] ring-1 ring-black/10">
                    <AutoFrame lazy src={frameSrc("popup", t, { s: s.id, variant: h.variant === "A" ? "" : h.variant })} title="{s.name} ({t})" />
                  </div>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      {:else if h.surface === "settings"}
        <div class="mb-3 flex flex-wrap items-center gap-1 text-[12px]">
          <span class="mr-1 text-zinc-500">Open at</span>
          {#each settingsSections as [id, name] (id)}
            <button
              type="button"
              class="rounded-md border px-2 py-0.5 {(h.hash || 'youtube') === id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white hover:bg-zinc-50'}"
              onclick={() => go("settings", id)}>{name}</button
            >
          {/each}
        </div>
        <div class="space-y-6">
          {#each themesShown() as t (t)}
            <BrowserFrame src={frameSrc("settings", t, {}, h.hash || "youtube")} page="settings.html" tabTitle={pageTitle} theme={t} {browser} />
          {/each}
        </div>
      {:else if h.surface === "firstrun"}
        <div class="mb-3 flex flex-wrap items-center gap-1 text-[12px]">
          <span class="mr-1 text-zinc-500">Step</span>
          {#each steps as [id, name] (id)}
            <button
              type="button"
              class="rounded-md border px-2 py-0.5 {h.step === id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white hover:bg-zinc-50'}"
              onclick={() => {
                h.step = id;
                save();
              }}>{name}</button
            >
          {/each}
          <span class="mx-2 h-4 w-px bg-zinc-300"></span>
          <label class="flex items-center gap-1.5 text-zinc-600">
            <input
              type="checkbox"
              checked={h.sync === "found"}
              onchange={(e) => {
                h.sync = (e.currentTarget as HTMLInputElement).checked ? "found" : "";
                save();
              }}
            />
            Another browser has synced settings
          </label>
        </div>
        <div class="space-y-6">
          {#each themesShown() as t (t)}
            <BrowserFrame src={frameSrc("onboarding", t, { step: h.step, sync: h.sync })} page="onboarding.html" tabTitle={pageTitle} theme={t} {browser} />
          {/each}
        </div>
      {:else if h.surface === "upgrade"}
        <div class="mb-3 flex flex-wrap items-center gap-1 text-[12px]">
          <span class="mr-1 text-zinc-500">1.4.5 user</span>
          {#each [["upgrade-pending", "Percentage unset, Ctrl key"], ["upgrade-set", "70 %, bare K key"], ["no-access", "No site access"]] as [id, name] (id)}
            <button
              type="button"
              class="rounded-md border px-2 py-0.5 {h.s === id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white hover:bg-zinc-50'}"
              onclick={() => {
                h.surface = "upgrade";
                setScenario(id);
              }}>{name}</button
            >
          {/each}
        </div>
        <div class="space-y-6">
          {#each themesShown() as t (t)}
            <BrowserFrame src={frameSrc("onboarding", t, { mode: "upgrade" })} page="onboarding.html" tabTitle={pageTitle} theme={t} {browser} />
          {/each}
        </div>
      {:else}
        <Brand />
      {/if}
    </main>

    <!-- Side panel -->
    <aside class="w-[300px] shrink-0 space-y-3 self-start lg:sticky lg:top-[104px]">
      <section class="rounded-lg border border-zinc-200 bg-[#fffbea] px-3.5 py-3">
        <h2 class="flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-800"><span class="size-2 rounded-full bg-yellow-400"></span>What to look at</h2>
        <ul class="mt-2 space-y-1.5 text-[12.5px] leading-[1.45] text-zinc-700">
          {#each notes[h.surface] as n (n)}<li class="flex gap-1.5"><span class="text-zinc-400">•</span><span>{n}</span></li>{/each}
        </ul>
      </section>
      <StatePanel />
      <p class="px-1 text-[11.5px] leading-4 text-zinc-500">
        Fake data, no extension APIs. Frames for one scenario follow each other, as pages follow storage.onChanged. Links that leave the extension only say where they'd go.
      </p>
    </aside>
  </div>

  {#if h.surface === "popup" || h.surface === "states"}<VariantBar />{/if}

  {#if toast}
    <div class="fixed right-5 bottom-5 z-50 max-w-[420px] rounded-lg bg-zinc-900 px-3.5 py-2.5 text-[12.5px] text-white shadow-lg" role="status">
      {toast.text}
    </div>
  {/if}
</div>
