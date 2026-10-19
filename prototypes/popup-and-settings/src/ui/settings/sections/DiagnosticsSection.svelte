<script lang="ts">
  import "../settings-more.css";
  // Settings › Diagnostics (ticket 18 §6), loaded only when opened: each feature's status per site, Check now, the
  // report shown in full before Copy, links to GitHub issues (ticket 19 §16), and the detailed console log.
  // Nothing is ever sent: the user reads the report and copies it by choice. It names no video, playlist, channel or
  // account.
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Activity from "@lucide/svelte/icons/activity";
  import CircleDashed from "@lucide/svelte/icons/circle-dashed";
  import { Button } from "$ui/components/ui/button/index.js";
  import SectionHeader from "../parts/SectionHeader.svelte";
  import OptionRow from "../parts/OptionRow.svelte";
  import { features, BRAND } from "$shared/features/registry";
  import { act, call, healthOf, ui } from "$lib/view.svelte";
  import { openExternal } from "$lib/nav";
  import type { FeatureId } from "$shared/model/types";

  let checking = $state(false);
  let copied = $state(false);
  const env = $derived(ui.s.env);
  const statusWord = { working: "Working", partly: "Partly working", broken: "Not working" } as const;

  function stateOf(id: FeatureId) {
    if (!ui.s.features[id].on) return "off" as const;
    return healthOf(id);
  }

  const report = $derived.by(() => {
    const s = ui.s;
    const on = features.filter((f) => s.features[f.id].on);
    const lines = [
      `${BRAND.full} ${BRAND.version} (build 2026-10-19, ${env.browser})`,
      `Browser: ${env.browser === "firefox" ? "Firefox 152" : "Chrome 156"}, ${env.os === "mac" ? "macOS" : env.os === "windows" ? "Windows" : "Linux"}`,
      `YouTube client 2.20261017.01.00 (en) · YouTube Music client 1.20261015.03.00 (en)`,
      `Consent: ${s.consent === "accepted" ? "given (v1)" : "missing"} · Settings sync: ${s.sync.on ? s.sync.status : "off"}`,
      `Site access: YouTube ${env.access.youtube ? "yes" : "no"}, YouTube Music ${env.access.music ? "yes" : "no"}`,
      `YouTube tab signed in: ${env.youtubeOpen ? (env.signedIn ? "yes" : "no") : "no tab open"}`,
      ``,
      `Features on (${on.length}):`,
      ...on.map((f) => `  ${f.name} (${f.site === "music" ? "YouTube Music" : "YouTube"}): ${statusWord[healthOf(f.id)].toLowerCase()}`),
      ``,
      `Breakage signals this session:`,
      ...((Object.keys(s.health) as FeatureId[]).length
        ? (Object.keys(s.health) as FeatureId[]).flatMap((id) =>
            s.health[id]!.status === "broken"
              ? [`  missing  www/queue.add  route=command  watch=yt-cmd-queue-v3  page=home  seen 4× 10:42–10:58`, `           shape: {}`]
              : [`  cannot-measure  www/autoadd.track  page=watch  seen 1× 10:51`, `           shape: {videoDetails:{lengthSeconds:str},streamingData:{…}}`],
          )
        : ["  none"]),
      ``,
      `Last check: ${s.lastCheck ? `${s.lastCheck.when}, ${s.lastCheck.result}` : "not run this session"}`,
    ];
    return lines.join("\n");
  });

  async function checkNow() {
    checking = true;
    await call("checkNow", {});
    checking = false;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      /* the prototype may run without clipboard access */
    }
    copied = true;
    setTimeout(() => (copied = false), 1800);
  }
</script>

<SectionHeader
  title="Diagnostics"
  description="When YouTube changes something Playlist Pigeon relies on, it shows here. Nothing is sent anywhere: you read the report and copy it only if you want to share it."
>
  <Button variant="outline" disabled={checking} onclick={checkNow}>
    {#if checking}<LoaderCircle class="animate-spin" />Checking…{:else}<Activity />Check now{/if}
  </Button>
</SectionHeader>

<div class="space-y-4">
  {#if ui.s.lastCheck}
    <p class="text-muted-foreground -mt-2 text-[13px]">Last check {ui.s.lastCheck.when}: <span class="text-foreground">{ui.s.lastCheck.result}</span></p>
  {/if}

  <section class="bg-card shadow-soft overflow-hidden rounded-2xl border">
    <div class="border-b px-5 py-3"><h3 class="text-[15px] font-semibold">Features</h3></div>
    <ul class="divide-y">
      {#each features as f (f.id)}
        {@const st = stateOf(f.id)}
        <li class="flex items-center gap-3 px-5 py-2.5 text-sm">
          <span class="min-w-0 flex-1">
            {f.name}
            <span class="text-muted-foreground"> · {f.site === "music" ? "YouTube Music" : "YouTube"}</span>
          </span>
          {#if st === "off"}
            <span class="text-muted-foreground inline-flex items-center gap-1.5 text-[13px]"><CircleDashed class="size-3.5" />Off</span>
          {:else if st === "working"}
            <span class="text-success inline-flex items-center gap-1.5 text-[13px]"><CircleCheck class="size-3.5" />Working</span>
          {:else if st === "partly"}
            <span class="text-warning inline-flex items-center gap-1.5 text-[13px]"><TriangleAlert class="size-3.5" />Partly working</span>
          {:else}
            <span class="bg-warning-soft text-warning inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] font-medium"
              ><CircleAlert class="size-3.5" />Not working</span
            >
          {/if}
        </li>
        {#if st === "partly" || st === "broken"}
          <li class="text-muted-foreground bg-muted/30 px-5 py-2 pl-8 text-[13px] leading-5">
            {st === "broken"
              ? `${f.site === "music" ? "YouTube Music" : "YouTube"} changed something it relies on, so it draws nothing in that tab. An update should fix it.`
              : `Partly working: ${ui.s.health[f.id]?.gap}.`}
          </li>
        {/if}
      {/each}
    </ul>
  </section>

  <section class="bg-card shadow-soft overflow-hidden rounded-2xl border">
    <div class="flex items-center gap-3 border-b px-5 py-3">
      <h3 class="flex-1 text-[15px] font-semibold">Diagnostics report</h3>
      <Button size="sm" variant={copied ? "secondary" : "default"} onclick={copy}>
        {#if copied}<Check />Copied{:else}<Copy />Copy{/if}
      </Button>
    </div>
    <pre class="bg-muted/40 text-foreground/85 max-h-[320px] overflow-auto px-5 py-4 font-mono text-[12px] leading-[1.6] whitespace-pre">{report}</pre>
    <p class="text-muted-foreground border-t px-5 py-3 text-[13px] leading-5">
      It names no video, playlist, channel or account, and holds no setting values. This is everything it contains.
    </p>
  </section>

  <section class="bg-card shadow-soft flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4">
    <p class="text-muted-foreground min-w-0 flex-1 text-[13.5px] leading-5">
      Problems are tracked on GitHub. Check the known ones first; a report form takes the diagnostics report.
    </p>
    <Button size="sm" variant="outline" onclick={() => openExternal("github-known")}>Known problems <ExternalLink /></Button>
    <Button size="sm" variant="outline" onclick={() => openExternal("github-report")}>Report a problem <ExternalLink /></Button>
  </section>

  <section class="bg-card shadow-soft overflow-hidden rounded-2xl border">
    <OptionRow
      label="Detailed console log"
      description="Logs every request route, with timings, to each YouTube tab's console. This browser only; off by default."
      checked={ui.s.detailedLog}
      onchange={(v) => act({ kind: "detailedLog", on: v })}
    />
  </section>
</div>
