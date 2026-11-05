<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../../components/Button.svelte"
  import type { AccountKey } from "../../../shared/model/validation"
  import type { PageState } from "../../lib/page-state.svelte"

  // Settings › Accounts (UI-SET-14): each setup with its summary and Remove, behind ACC-25's confirmation.
  let { pageState }: { pageState: PageState } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  const setups = $derived(pageState.ready?.setups ?? [])
  const unclaimed = $derived(pageState.ready?.unclaimed ?? null)
  let confirming = $state<{ readonly acct: AccountKey; readonly token: string; readonly scope: "this-browser" | "syncing-browsers" } | null>(null)
  let results = $state<Partial<Record<AccountKey, string>>>({})
  async function prepare(acct: AccountKey) {
    const answer = await backend.call("ui.removeSetup", { action: "prepare", acct })
    if (answer.kind === "answered" && answer.result.kind === "confirm") confirming = { acct, token: answer.result.token, scope: answer.result.scope }
    else results = { ...results, [acct]: i18n.message("set_accounts_failed") }
  }
  async function remove() {
    if (!confirming) return
    const { acct, token } = confirming
    confirming = null
    const answer = await backend.call("ui.removeSetup", { action: "confirm", token })
    results = { ...results, [acct]: i18n.message(answer.kind === "answered" && (answer.result.kind === "removed" || answer.result.kind === "unchanged") ? "set_accounts_removed" : "set_accounts_failed") }
  }
</script>

<div class="flex flex-col gap-3">
  {#if setups.length === 0 && !unclaimed}<p class="text-muted-foreground text-[13.5px]">{i18n.message("set_accounts_none")}</p>{/if}
  {#each setups as entry (entry.acct)}
    {@const count = entry.setup.autoAdd.length}
    <section class="bg-card flex flex-col gap-2 rounded-2xl border p-4" data-account={entry.acct}>
      <div class="flex items-center gap-3">
        {#if entry.setup.label?.avatar}<img src={entry.setup.label.avatar} alt="" class="size-8 rounded-full" />{/if}
        <div class="min-w-0 flex-1">
          <p class="text-[14px] font-medium">{pageState.accountName(entry.acct)}{#if entry.setup.label?.handle} <span class="text-muted-foreground">{entry.setup.label.handle}</span>{/if}</p>
          <p class="text-muted-foreground text-[12.5px]">{entry.cache === null && count > 0
            ? i18n.message(i18n.plural(count) === "one" ? "autoAddList_syncOnly_one" : "autoAddList_syncOnly_other", { count: i18n.number(count), account: pageState.accountName(entry.acct) })
            : i18n.message(i18n.plural(count) === "one" ? "set_accounts_summary_one" : "set_accounts_summary_other", { count: i18n.number(count) })}</p>
        </div>
        <Button size="sm" variant="destructive-soft" disabled={pageState.private || !pageState.editable} onclick={() => prepare(entry.acct)}>{i18n.message("set_accounts_remove")}</Button>
      </div>
      {#if confirming?.acct === entry.acct}
        <div role="alertdialog" aria-labelledby="remove-{entry.acct}" class="border-warning-border bg-warning-soft rounded-lg border p-3 text-[13.5px]">
          <p id="remove-{entry.acct}">{i18n.message(confirming.scope === "syncing-browsers" ? "set_accounts_removeEvery" : "set_accounts_removeThis", { account: pageState.accountName(entry.acct) })}</p>
          <div class="mt-2 flex gap-2">
            <Button size="sm" variant="destructive" onclick={remove}>{i18n.message("set_accounts_remove")}</Button>
            <Button size="sm" variant="outline" onclick={() => { confirming = null }}>{i18n.message("set_cancel")}</Button>
          </div>
        </div>
      {/if}
      {#if results[entry.acct]}<p role="status" class="text-[12.5px]">{results[entry.acct]}</p>{/if}
    </section>
  {/each}
  {#if unclaimed}
    <section class="bg-card flex items-center gap-3 rounded-2xl border p-4">
      <div class="min-w-0 flex-1">
        <p class="text-[14px] font-medium">{i18n.message("set_accounts_unclaimed")}</p>
        <p class="text-muted-foreground text-[12.5px]">{i18n.message(i18n.plural(unclaimed.autoAdd.length) === "one" ? "set_accounts_unclaimedLine_one" : "set_accounts_unclaimedLine_other", { count: i18n.number(unclaimed.autoAdd.length) })}</p>
      </div>
      <Button size="sm" variant="outline" onclick={() => pageState.page.open("https://www.youtube.com/channel_switcher")}>{i18n.message("note_switchAccount")}</Button>
    </section>
  {/if}
</div>
