<script lang="ts">
  import "./parts.css";
  // The account-in-view picker (ticket 11; glossary "Account in view"): only with two or more account setups, only in
  // normal windows. It changes what the popup shows, never YouTube's account, so it never says "switch".
  import Check from "@lucide/svelte/icons/check";
  import Settings from "@lucide/svelte/icons/settings";
  import Avatar from "$ui/components/Avatar.svelte";
  import { accountInView, accountsWithSetup, labelOf, ui } from "$lib/view.svelte";
  import { navigate } from "$lib/nav";

  let { onclose }: { onclose: () => void } = $props();
  const tabAcct = $derived(ui.account.state === "ready" ? ui.account.acct : null);
  const inView = $derived(accountInView());
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<button type="button" class="fixed inset-0 z-40 cursor-default" aria-label="Close" onclick={onclose}></button>
<div
  class="bg-popover animate-in fade-in-0 zoom-in-95 shadow-float absolute top-[54px] right-2 z-50 w-[264px] origin-top-right rounded-xl border p-1.5 duration-150"
  role="menu"
  aria-label="Show the setup for"
>
  <p class="text-muted-foreground px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide uppercase">Show the setup for</p>
  {#each accountsWithSetup() as a (a)}
    {@const label = labelOf(a)}
    <button
      type="button"
      role="menuitemradio"
      aria-checked={inView === a}
      class="hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
      onclick={() => {
        ui.picked = a === tabAcct ? null : a;
        onclose();
      }}
    >
      <Avatar {label} size={28} />
      <span class="min-w-0 flex-1 leading-tight">
        <span class="block truncate text-[13px] font-medium">{label.name}</span>
        <span class="text-muted-foreground block truncate text-[11.5px]">
          {[label.handle ?? "No channel", a === tabAcct && "this tab", label.brand && "brand account"].filter(Boolean).join(" · ")}
        </span>
      </span>
      {#if inView === a}<Check class="text-primary size-4 shrink-0" strokeWidth={2.5} />{/if}
    </button>
  {/each}
  <p class="text-muted-foreground px-2 pt-1.5 pb-1 text-[11.5px] leading-4">This only changes what you see here. YouTube stays on the account you're signed in as.</p>
  <div class="mt-1 border-t pt-1">
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px]"
      onclick={() => navigate("settings", "accounts")}><Settings class="size-3.5" />Manage account setups</button
    >
  </div>
</div>
