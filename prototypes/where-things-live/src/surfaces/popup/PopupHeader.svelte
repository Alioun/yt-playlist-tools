<script lang="ts">
  // The popup's header: the name, the account it's showing, and the gear (opens Settings in a tab).
  // Ticket 11: avatar, name and @handle; a placeholder while the account is read (never a signed-out flash);
  // a "Showing" picker only with 2+ setups (or signed out with 1+). It never switches YouTube's account.
  import Settings from "@lucide/svelte/icons/settings";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Check from "@lucide/svelte/icons/check";
  import UserX from "@lucide/svelte/icons/user-x";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import ExtIcon from "$lib/components/ExtIcon.svelte";
  import { app, popupAccount, accountsWithSetup, go } from "$lib/state.svelte";
  import { accounts, type AccountId } from "$lib/data";
  import { cn } from "$lib/utils";

  const shown = $derived(popupAccount());
  const withSetup = $derived(accountsWithSetup());
  const picker = $derived(
    !app.env.readingAccount && (withSetup.length >= 2 || (!app.env.signedIn && withSetup.length >= 1)),
  );
  const tabAccountLabel = $derived(app.env.signedIn ? `This tab's account (${accounts[app.env.account].name})` : "This tab's account (not signed in)");
</script>

{#snippet avatar(a: AccountId | null)}
  {#if a}
    <span class={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", accounts[a].color)}
      >{accounts[a].initial}</span
    >
    <span class="min-w-0 text-left leading-tight">
      <span class="block truncate text-sm font-medium">{accounts[a].name}</span>
      <span class="text-muted-foreground block truncate text-xs">{accounts[a].handle}</span>
    </span>
  {:else}
    <span class="bg-muted text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full"
      ><UserX class="size-4" /></span
    >
    <span class="min-w-0 text-left leading-tight">
      <span class="block truncate text-sm font-medium">Not signed in</span>
      <span class="text-muted-foreground block truncate text-xs">in this YouTube tab</span>
    </span>
  {/if}
{/snippet}

<div class="flex items-center gap-2 border-b px-3 py-2">
  <ExtIcon class="size-5 text-[9px]" />
  <span class="text-muted-foreground mr-1 text-xs font-medium">Playlist Tools</span>

  <div class="min-w-0 flex-1">
    {#if app.env.readingAccount}
      <div class="flex items-center gap-2" aria-label="Reading your YouTube account">
        <span class="bg-muted size-7 shrink-0 animate-pulse rounded-full"></span>
        <span class="flex-1 space-y-1">
          <span class="bg-muted block h-3 w-24 animate-pulse rounded"></span>
          <span class="bg-muted block h-2.5 w-16 animate-pulse rounded"></span>
        </span>
      </div>
    {:else if picker}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="hover:bg-muted flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5"
          aria-label="Showing the setup of"
        >
          {@render avatar(shown)}
          <span class="text-muted-foreground ml-auto flex items-center gap-0.5 text-[11px]">Showing <ChevronDown class="size-3" /></span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content class="w-64" align="start">
          <DropdownMenu.Label>Show the setup of</DropdownMenu.Label>
          <DropdownMenu.Item onclick={() => (app.popupAccount = null)}>
            <span class="flex-1">{tabAccountLabel}</span>
            {#if app.popupAccount === null}<Check class="size-4" />{/if}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          {#each withSetup as a (a)}
            <DropdownMenu.Item onclick={() => (app.popupAccount = a)}>
              <span class={cn("inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white", accounts[a].color)}
                >{accounts[a].initial}</span
              >
              <span class="flex-1">{accounts[a].name} <span class="text-muted-foreground text-xs">{accounts[a].handle}</span></span>
              {#if app.popupAccount === a}<Check class="size-4" />{/if}
            </DropdownMenu.Item>
          {/each}
          <DropdownMenu.Separator />
          <p class="text-muted-foreground px-1.5 py-1 text-[11px]">
            This changes what the popup shows, not your YouTube account. Use YouTube's own menu to change that.
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {:else}
      <div class="flex min-w-0 items-center gap-2 px-1">{@render avatar(shown)}</div>
    {/if}
  </div>

  <button
    type="button"
    class="hover:bg-muted text-muted-foreground rounded-md p-1.5"
    title="Settings (opens in a tab)"
    aria-label="Settings"
    onclick={() => go("settings")}><Settings class="size-4" /></button
  >
</div>
