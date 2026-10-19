<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 09). The popup in a browser window, with chips for every state it has to handle.
  import BrowserFrame from "$lib/components/BrowserFrame.svelte";
  import { app, scenarios, applyScenario, toolbarBadge, type ScenarioId } from "$lib/state.svelte";
  import { accounts } from "$lib/data";
  import { cn } from "$lib/utils";

  const groups = [...new Set(scenarios.map((s) => s.group))];
  const current = $derived(scenarios.find((s) => s.id === app.scenario));

  let open = $state(true);
  $effect(() => {
    app.scenario; // reopen the popup whenever the scenario changes
    open = true;
  });

  function pick(id: ScenarioId) {
    applyScenario(id);
    const url = new URL(location.href);
    url.searchParams.set("scenario", id);
    history.replaceState(null, "", url);
  }

  const page = $derived.by(() => {
    const e = app.env;
    if (e.activeSite === "music") return { url: "music.youtube.com", title: "YouTube Music", site: "YouTube Music", dark: true };
    if (e.activeSite === "other") return { url: "news.example.com/today", title: "Today's news", site: "Another site", dark: false };
    if (e.ytPage === "home") return { url: "www.youtube.com", title: "YouTube", site: "YouTube · home", dark: true };
    if (e.ytPage === "shorts") return { url: "www.youtube.com/shorts/s1", title: "One-pan crispy rice in 30s - YouTube", site: "YouTube · Short", dark: true };
    return { url: "www.youtube.com/watch?v=v1", title: "How a compiler turns components into DOM updates - YouTube", site: "YouTube · watch page", dark: true };
  });

  const facts = $derived([
    ["active tab", app.env.activeSite === "youtube" ? `youtube (${app.env.ytPage})` : app.env.activeSite],
    ["YouTube tab open", app.env.youtubeOpen ? "yes" : "no"],
    ["YouTube Music tab open", app.env.musicOpen ? "yes" : "no"],
    ["YouTube access", app.env.hostAccess ? "yes" : "no"],
    ["YouTube Music access", app.env.musicAccess ? "yes" : "no"],
    ["signed in", app.env.signedIn ? "yes" : "no"],
    ["tab's account", app.env.signedIn ? accounts[app.env.account].name : "none"],
    ["private window", app.env.privateWindow ? "yes" : "no"],
    ["consent", app.consent],
    ["toolbar badge", toolbarBadge() ?? "none"],
  ]);
</script>

<div class="space-y-4 p-6">
  <div class="space-y-2">
    {#each groups as g (g)}
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="w-36 shrink-0 text-xs font-semibold text-neutral-500">{g}</span>
        {#each scenarios.filter((s) => s.group === g) as s (s.id)}
          <button
            type="button"
            class={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              app.scenario === s.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-neutral-300 bg-white hover:bg-neutral-50",
            )}
            title={s.hint}
            onclick={() => pick(s.id)}>{s.name}</button
          >
        {/each}
      </div>
    {/each}
    {#if current}
      <p class="text-xs text-neutral-600"><b>{current.name}:</b> {current.hint}.</p>
    {/if}
    <div class="flex flex-wrap gap-1.5 pt-1">
      {#each facts as [k, v] (k)}
        <span class="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-neutral-600 ring-1 ring-neutral-200">{k}: <b>{v}</b></span>
      {/each}
    </div>
  </div>

  <BrowserFrame
    url={page.url}
    title={page.title}
    variant={app.env.installedApp ? "app" : "browser"}
    bind:popupOpen={open}
    class="h-[720px] w-[1000px] max-w-full"
  >
    <div class={cn("absolute inset-0 overflow-hidden p-6", page.dark ? "bg-neutral-900" : "bg-white")}>
      <p class={cn("mb-4 text-sm font-semibold", page.dark ? "text-neutral-500" : "text-neutral-400")}>{page.site} (placeholder page)</p>
      {#if page.site === "YouTube · watch page"}
        <div class="mb-3 aspect-video w-[58%] rounded-lg bg-neutral-800"></div>
        <div class="mb-2 h-4 w-[45%] rounded bg-neutral-800"></div>
        <div class="h-3 w-[30%] rounded bg-neutral-800"></div>
      {:else if page.site === "YouTube · Short"}
        <div class="mx-auto h-[85%] w-[260px] rounded-xl bg-neutral-800"></div>
      {:else if page.site === "YouTube Music"}
        <div class="flex h-[80%] gap-4">
          <div class="aspect-square h-[70%] rounded-lg bg-neutral-800"></div>
          <div class="flex-1 space-y-2">
            {#each Array(7) as _, i (i)}<div class="h-8 rounded bg-neutral-800"></div>{/each}
          </div>
        </div>
      {:else if page.site === "Another site"}
        <div class="space-y-2">
          <div class="h-6 w-1/2 rounded bg-neutral-200"></div>
          {#each Array(6) as _, i (i)}<div class="h-3 w-[70%] rounded bg-neutral-100"></div>{/each}
        </div>
      {:else}
        <div class="grid grid-cols-4 gap-4">
          {#each Array(8) as _, i (i)}<div class="aspect-video rounded-lg bg-neutral-800"></div>{/each}
        </div>
      {/if}
      {#if !open}
        <p class={cn("absolute top-3 right-28 text-xs", page.dark ? "text-neutral-400" : "text-neutral-500")}>
          Click the toolbar icon to open the popup ↗
        </p>
      {/if}
    </div>
  </BrowserFrame>
</div>
