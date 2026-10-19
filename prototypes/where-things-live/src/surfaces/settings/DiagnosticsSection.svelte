<script lang="ts">
  // Ticket 18's Diagnostics: Check now, the report shown in full before Copy, and a local detailed log.
  // Loaded only when the section is shown (a separate chunk; lazy in the real build too).
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import { Button } from "$lib/components/ui/button/index.js";
  import { app, checkNow, diagnosticsReport } from "$lib/state.svelte";
  import OptionSwitch from "./OptionSwitch.svelte";

  const report = $derived(diagnosticsReport());
  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      // Prototype: clipboard may be unavailable (e.g. headless); still show the result.
    }
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="bg-card space-y-4 rounded-xl border p-4">
  <p class="text-sm">Playlist Tools 2.0.0 · Updates install by themselves.</p>

  <div class="flex flex-wrap items-center gap-3">
    <Button size="sm" variant="outline" onclick={checkNow}>Check now</Button>
    <span class="text-muted-foreground text-xs">
      {app.lastCheck ? `Last check: ${app.lastCheck.when}, ${app.lastCheck.result}.` : "Not checked yet. Checks run only when you click."}
    </span>
  </div>

  <div>
    <div class="mb-1 flex items-center justify-between">
      <h4 class="text-sm font-medium">Report</h4>
      <Button size="sm" variant="outline" onclick={copy}>{copied ? "Copied" : "Copy"}</Button>
    </div>
    <pre class="bg-muted max-h-64 overflow-auto rounded-md p-3 font-mono text-[11px] leading-snug whitespace-pre-wrap">{report}</pre>
  </div>

  <div class="flex flex-wrap items-center gap-4 text-sm">
    <a href="#known-problems" class="text-primary inline-flex items-center gap-1 hover:underline"
      >Known problems <ExternalLink class="size-3" /></a
    >
    <a href="#report-problem" class="text-primary inline-flex items-center gap-1 hover:underline"
      >Report a problem <ExternalLink class="size-3" /></a
    >
    <span class="text-muted-foreground text-xs">PROVISIONAL: GitHub until ticket 19 picks the support channel</span>
  </div>

  <div class="border-t pt-2">
    <OptionSwitch label="Detailed console log (this device only)" bind:checked={app.detailedLog} />
  </div>

  <p class="text-muted-foreground text-xs">
    Nothing is ever sent. The report names no video, playlist, channel or account, and you copy it only if you choose.
  </p>
</div>
